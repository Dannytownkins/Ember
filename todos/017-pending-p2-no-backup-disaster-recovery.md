---
status: pending
priority: p2
issue_id: "017"
tags: [code-review, operations, database, disaster-recovery]
dependencies: []
---

# Problem Statement

**NO BACKUP OR DISASTER RECOVERY PLAN**: The plan specifies Neon Postgres as the database (line 227) but documents zero backup strategy, no recovery time objective (RTO), no recovery point objective (RPO), no tested restore procedures, and no failover plan. Neon provides point-in-time recovery (PITR) by default, but the plan doesn't document its configuration, its limitations, or what happens when it isn't enough. User memories are irreplaceable personal data — a user's emotional history, life events, and intimate AI context. Data loss is not "fix it and apologize" — it's permanent destruction of something deeply personal.

**Why This Matters**: Ember stores memories that users cannot recreate. A factual preference ("coffee black, hates meetings before 10am") can be re-entered. An emotional memory ("the night my daughter was born was the hardest and most beautiful night of my life") captured from a conversation that no longer exists CANNOT be recreated. The plan's value proposition is "Your memory belongs to YOU" — but without a tested backup and recovery strategy, one infrastructure failure could erase everything. Neon has had incidents before. Every cloud provider has. The question is not "if" but "when."

## Findings

**Source**: operations review, architecture-strategist

**Evidence**:
- Neon Postgres specified as database (line 227) — no backup configuration documented
- No RTO/RPO targets defined anywhere in plan
- No disaster recovery section in plan
- No data export/backup automation
- "Full data export" mentioned only as a user-facing free tier feature (line 541), not as an operational backup
- No multi-region strategy
- No discussion of Neon's PITR capabilities or limitations
- Image storage (Cloudflare R2/Vercel Blob, line 225) also has no backup strategy
- Hard delete on account deletion (line 282) means no recovery window for accidental deletion

**Risk Assessment**:
```
Neon Outage:
  - Probability: Low-Medium (cloud services have ~99.95% SLA)
  - Impact: CRITICAL — complete app unavailable, no failover
  - Recovery: Depends on Neon's internal processes (outside our control)

Data Corruption:
  - Probability: Low (migration bug, bad query, application error)
  - Impact: CRITICAL — memories corrupted or lost
  - Recovery: Neon PITR (if configured), but untested

Accidental Deletion:
  - Probability: Medium (no soft delete, hard delete only)
  - Impact: HIGH — user loses memories permanently
  - Recovery: NONE currently (no soft delete, no backup)

Region Failure:
  - Probability: Very Low
  - Impact: CRITICAL — extended downtime
  - Recovery: Unknown — no multi-region strategy
```

**Impact Severity**: 🟡 MODERATE - Low probability but catastrophic impact; no recovery path documented

## Proposed Solutions

### Solution 1: Document Neon PITR Configuration with Tested Restore Runbook (Recommended)

**Approach**: Document the existing Neon PITR capabilities, define RTO/RPO targets, create a restore runbook, and test it quarterly.

**Implementation**:

**Neon PITR Configuration Check**:
```typescript
// scripts/verify-neon-pitr.ts
/**
 * Verify Neon PITR (Point-in-Time Recovery) configuration.
 * Run quarterly to ensure backup infrastructure is functional.
 *
 * Neon Free tier: 7-day PITR history
 * Neon Pro tier: 30-day PITR history
 */
import { neon } from '@neondatabase/serverless';

async function verifyPITR() {
  const sql = neon(process.env.DATABASE_URL!);

  // 1. Check current database size
  const sizeResult = await sql`
    SELECT pg_size_pretty(pg_database_size(current_database())) as db_size
  `;
  console.log(`Database size: ${sizeResult[0].db_size}`);

  // 2. Check table row counts for baseline
  const tables = ['users', 'profiles', 'captures', 'memories'];
  for (const table of tables) {
    const count = await sql`
      SELECT count(*) as row_count FROM ${sql(table)}
    `;
    console.log(`${table}: ${count[0].row_count} rows`);
  }

  // 3. Document current configuration
  console.log('\n--- PITR Configuration ---');
  console.log(`Neon Project: ${process.env.NEON_PROJECT_ID}`);
  console.log(`Region: ${process.env.NEON_REGION ?? 'us-east-1'}`);
  console.log(`Branch: main`);
  console.log(`PITR History: Check Neon dashboard for retention period`);

  // 4. Test branch creation (Neon's restore mechanism)
  console.log('\n--- Branch Test ---');
  console.log('To test PITR restore, create a branch in Neon dashboard:');
  console.log('  1. Go to Neon Console → Branches');
  console.log('  2. Create branch from main at specific timestamp');
  console.log('  3. Connect to branch and verify data integrity');
  console.log('  4. Delete test branch after verification');
}

verifyPITR().catch(console.error);
```

**Restore Runbook**:
```typescript
// docs/runbooks/disaster-recovery.ts
/**
 * EMBER DISASTER RECOVERY RUNBOOK
 *
 * RTO Target: 1 hour (time to restore service)
 * RPO Target: 1 hour (maximum data loss window)
 *
 * SCENARIO 1: Neon Database Corruption
 * ─────────────────────────────────────
 * 1. Identify the timestamp BEFORE corruption occurred
 * 2. Create Neon branch from that timestamp:
 *    - Neon Console → Branches → Create Branch
 *    - Parent: main
 *    - Point in time: [timestamp before corruption]
 * 3. Get new connection string from branch
 * 4. Update Vercel env var: DATABASE_URL = [new branch connection string]
 * 5. Redeploy to Vercel
 * 6. Verify data integrity via /api/health
 * 7. Once verified, promote branch to new main:
 *    - Neon Console → Branches → [recovery branch] → Set as Primary
 *
 * SCENARIO 2: Accidental User Data Deletion
 * ──────────────────────────────────────────
 * 1. Note the userId and approximate deletion time
 * 2. Create Neon branch from timestamp BEFORE deletion
 * 3. Connect to recovery branch
 * 4. Export affected user's data:
 */

export async function recoverUserData(
  recoveryDbUrl: string,
  userId: string
): Promise<void> {
  const recoveryDb = neon(recoveryDbUrl);
  const productionDb = neon(process.env.DATABASE_URL!);

  // Fetch user's data from recovery branch
  const profile = await recoveryDb`
    SELECT * FROM profiles WHERE user_id = (
      SELECT id FROM users WHERE clerk_id = ${userId}
    )
  `;

  const userMemories = await recoveryDb`
    SELECT * FROM memories WHERE profile_id = ${profile[0].id}
  `;

  console.log(`Found ${userMemories.length} memories to restore`);

  // Re-insert into production (skip duplicates via content hash)
  for (const memory of userMemories) {
    try {
      await productionDb`
        INSERT INTO memories (
          id, profile_id, capture_id, category,
          factual_content, emotional_significance,
          verbatim_text, summary_text, use_verbatim,
          importance, verbatim_tokens, summary_tokens,
          speaker_confidence, created_at, updated_at
        ) VALUES (
          ${memory.id}, ${memory.profile_id}, ${memory.capture_id},
          ${memory.category}, ${memory.factual_content},
          ${memory.emotional_significance}, ${memory.verbatim_text},
          ${memory.summary_text}, ${memory.use_verbatim},
          ${memory.importance}, ${memory.verbatim_tokens},
          ${memory.summary_tokens}, ${memory.speaker_confidence},
          ${memory.created_at}, ${memory.updated_at}
        )
        ON CONFLICT (id) DO NOTHING
      `;
    } catch (error) {
      console.error(`Failed to restore memory ${memory.id}:`, error);
    }
  }

  console.log('Restore complete. Verify in production.');
}

/**
 * SCENARIO 3: Complete Neon Outage
 * ─────────────────────────────────
 * 1. Check Neon status page: https://neonstatus.com/
 * 2. If extended outage (>30 min):
 *    a. Enable maintenance mode page on Vercel
 *    b. Wait for Neon recovery
 *    c. Verify /api/health returns healthy
 *    d. Disable maintenance mode
 * 3. If permanent data loss:
 *    a. Restore from latest pg_dump backup (see Solution 2)
 *    b. Deploy to alternative Postgres provider
 *    c. Update DNS and environment variables
 */
```

**Quarterly Test Checklist**:
```markdown
## Quarterly DR Test Checklist

- [ ] Run verify-neon-pitr.ts — record baseline metrics
- [ ] Create test branch from 24 hours ago
- [ ] Connect to test branch and verify row counts match
- [ ] Run 3 sample queries against test branch (memories, captures, profiles)
- [ ] Test recovery script with a test user
- [ ] Delete test branch
- [ ] Update this document with test date and results

Last tested: ____-__-__
Tester: ______________
Result: Pass / Fail
Notes: _______________
```

**Pros**:
- Leverages Neon's built-in PITR (no additional infrastructure)
- Documented procedures reduce panic during incidents
- Quarterly testing catches configuration drift
- RTO/RPO targets set clear expectations

**Cons**:
- Depends entirely on Neon's infrastructure (single point of failure)
- PITR history limited by Neon tier (7 days free, 30 days pro)
- No protection against Neon-level data loss
- Manual process — requires human intervention

**Effort**: Low (half day for documentation and initial verification)
**Risk**: Low - documentation and testing only, no infrastructure changes

### Solution 2: Daily pg_dump to S3 as Secondary Backup

**Approach**: Automated daily database export to an independent storage provider (S3/R2), providing a backup outside of Neon's infrastructure.

**Implementation**:
```typescript
// scripts/backup-database.ts
/**
 * Daily database backup to Cloudflare R2 (or AWS S3).
 * Run via cron job (GitHub Actions, Vercel Cron, or external scheduler).
 *
 * Retention: 30 daily backups, 12 monthly backups
 */
import { exec } from 'child_process';
import { promisify } from 'util';
import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { createReadStream } from 'fs';
import { createGzip } from 'zlib';
import { pipeline } from 'stream/promises';

const execAsync = promisify(exec);

const s3 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT, // Cloudflare R2 S3-compatible endpoint
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

const BUCKET = 'ember-backups';

async function backupDatabase() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `ember-backup-${timestamp}.sql.gz`;
  const localPath = `/tmp/${filename}`;

  console.log(`Starting backup: ${filename}`);

  // 1. Run pg_dump (Neon supports standard pg_dump)
  const connectionString = process.env.DATABASE_URL!;
  await execAsync(
    `pg_dump "${connectionString}" --no-owner --no-acl | gzip > ${localPath}`
  );

  console.log('pg_dump complete, uploading to R2...');

  // 2. Upload to R2/S3
  const fileStream = createReadStream(localPath);
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: `daily/${filename}`,
    Body: fileStream,
    ContentType: 'application/gzip',
    Metadata: {
      'backup-type': 'daily',
      'source': 'neon-postgres',
      'timestamp': new Date().toISOString(),
    },
  }));

  console.log(`Uploaded: daily/${filename}`);

  // 3. Monthly snapshot (1st of each month)
  if (new Date().getDate() === 1) {
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: `monthly/${filename}`,
      Body: createReadStream(localPath),
      ContentType: 'application/gzip',
    }));
    console.log(`Monthly snapshot: monthly/${filename}`);
  }

  // 4. Prune old daily backups (keep last 30)
  await pruneOldBackups('daily/', 30);

  // 5. Prune old monthly backups (keep last 12)
  await pruneOldBackups('monthly/', 12);

  console.log('Backup complete');
}

async function pruneOldBackups(prefix: string, keep: number) {
  const objects = await s3.send(new ListObjectsV2Command({
    Bucket: BUCKET,
    Prefix: prefix,
  }));

  const sorted = (objects.Contents ?? [])
    .sort((a, b) => (b.LastModified?.getTime() ?? 0) - (a.LastModified?.getTime() ?? 0));

  const toDelete = sorted.slice(keep);

  for (const obj of toDelete) {
    await s3.send(new DeleteObjectCommand({
      Bucket: BUCKET,
      Key: obj.Key!,
    }));
    console.log(`Pruned: ${obj.Key}`);
  }
}

backupDatabase().catch(error => {
  console.error('Backup failed:', error);
  // Send alert (Discord webhook, email, etc.)
  process.exit(1);
});
```

**GitHub Actions Cron**:
```yaml
# .github/workflows/backup.yml
name: Daily Database Backup
on:
  schedule:
    - cron: '0 3 * * *' # 3 AM UTC daily
  workflow_dispatch: # Manual trigger

jobs:
  backup:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - run: npm ci
      - run: sudo apt-get install -y postgresql-client
      - run: npx tsx scripts/backup-database.ts
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
          R2_ENDPOINT: ${{ secrets.R2_ENDPOINT }}
          R2_ACCESS_KEY_ID: ${{ secrets.R2_ACCESS_KEY_ID }}
          R2_SECRET_ACCESS_KEY: ${{ secrets.R2_SECRET_ACCESS_KEY }}
```

**Pros**:
- Independent of Neon — survives Neon-level failures
- S3/R2 has 99.999999999% durability (11 nines)
- Automated — no human intervention for daily backups
- Retention policy prevents unbounded storage growth
- Can restore to ANY Postgres provider (not locked to Neon)

**Cons**:
- RPO = 24 hours (data since last backup is lost)
- pg_dump takes time on larger databases
- Requires additional infrastructure (R2 bucket, GitHub Actions)
- Restore process is manual (import SQL dump)
- Database credentials in CI/CD secrets

**Effort**: Medium (1 day for setup and testing)
**Risk**: Low - standard backup practice

### Solution 3: Multi-Region Neon Setup with Read Replicas

**Approach**: Deploy Neon in multiple regions with read replicas for high availability and automatic failover.

**Implementation**:
```typescript
// src/lib/db/multi-region.ts
import { neon, neonConfig } from '@neondatabase/serverless';

neonConfig.fetchConnectionCache = true;

/**
 * Multi-region database configuration.
 * Primary in us-east-1, replica in eu-west-1.
 * Reads go to nearest region, writes go to primary.
 */
const PRIMARY_URL = process.env.DATABASE_URL!;
const REPLICA_URLS = {
  'us-east-1': process.env.DATABASE_URL!,
  'eu-west-1': process.env.DATABASE_REPLICA_EU_URL!,
};

export function getReadDb(region?: string) {
  const replicaUrl = region
    ? REPLICA_URLS[region as keyof typeof REPLICA_URLS]
    : PRIMARY_URL;

  return neon(replicaUrl ?? PRIMARY_URL);
}

export function getWriteDb() {
  return neon(PRIMARY_URL);
}

// Usage in Server Actions
export async function getMemories(profileId: string) {
  const sql = getReadDb(); // Reads from nearest replica
  return sql`
    SELECT * FROM memories
    WHERE profile_id = ${profileId}
    ORDER BY importance DESC
  `;
}

export async function createMemory(data: NewMemory) {
  const sql = getWriteDb(); // Writes always go to primary
  return sql`
    INSERT INTO memories (profile_id, category, factual_content, importance)
    VALUES (${data.profileId}, ${data.category}, ${data.factualContent}, ${data.importance})
    RETURNING *
  `;
}
```

**Pros**:
- Automatic read scaling across regions
- Survives single-region outages
- Lower latency for global users
- Neon manages replication automatically

**Cons**:
- Significant cost increase (Neon Pro required, ~$19+/month per region)
- Replication lag for reads (eventual consistency)
- Overkill for MVP scale
- Write failover requires manual intervention (Neon doesn't auto-failover writes)

**Effort**: Medium (1-2 days for setup, ongoing cost)
**Risk**: Medium - increased complexity and cost for MVP stage

## Recommended Action

**Choose Solution 1: Document Neon PITR + Restore Runbook, then add Solution 2**

Start with documentation and quarterly testing of Neon's built-in PITR — this is free and immediately reduces risk. Add daily pg_dump backups (Solution 2) before public launch to provide an independent safety net. Defer multi-region (Solution 3) until user growth justifies the cost and complexity.

## Technical Details

**Affected Components**:
- `docs/runbooks/disaster-recovery.ts` — new runbook document
- `scripts/verify-neon-pitr.ts` — new PITR verification script
- `scripts/backup-database.ts` — new backup script (Solution 2)
- `.github/workflows/backup.yml` — new GitHub Actions workflow (Solution 2)
- `vercel.json` — maintenance mode configuration (for outage handling)

**Database Changes**:
None — backup strategy is operational, not schema-level.

## Acceptance Criteria

- [ ] RTO and RPO targets defined and documented (target: RTO 1 hour, RPO 1 hour)
- [ ] Neon PITR configuration verified and documented
- [ ] Disaster recovery runbook created with step-by-step procedures
- [ ] Restore procedure tested at least once (create branch, verify data, delete branch)
- [ ] Quarterly DR test checklist created
- [ ] Daily pg_dump backup script implemented and scheduled (pre-launch)
- [ ] Backup retention policy enforced (30 daily, 12 monthly)
- [ ] Backup success/failure alerts configured
- [ ] Restore from pg_dump tested at least once
- [ ] Image storage (R2/Blob) backup strategy documented

## Work Log

### 2026-02-10
- **Review finding**: Operations review identified missing backup and disaster recovery strategy
- **Severity**: Marked as P2 MODERATE - low probability but catastrophic impact
- **Plan gap**: Neon specified as database but no backup config, no RTO/RPO, no restore procedures
- **Key risk**: User memories are irreplaceable personal data with emotional value
- **Next step**: Document Neon PITR configuration and create restore runbook

## Resources

- [Plan document section](docs/plans/2026-02-10-feat-ember-mvp-persistent-ai-memory-plan.md#L227) - Neon Postgres specification
- [Plan document section](docs/plans/2026-02-10-feat-ember-mvp-persistent-ai-memory-plan.md#L282) - Hard delete, no soft delete
- [Plan document section](docs/plans/2026-02-10-feat-ember-mvp-persistent-ai-memory-plan.md#L541) - Data export (user-facing, not operational)
- [Neon Point-in-Time Recovery](https://neon.tech/docs/introduction/point-in-time-restore) - Neon PITR documentation
- [Neon Branching](https://neon.tech/docs/introduction/branching) - Branch-based restore mechanism
- [AWS S3 Durability](https://docs.aws.amazon.com/AmazonS3/latest/userguide/DataDurability.html) - 11 nines durability
- [Cloudflare R2](https://developers.cloudflare.com/r2/) - S3-compatible storage for backups
