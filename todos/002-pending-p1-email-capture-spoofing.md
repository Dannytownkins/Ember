---
status: deferred
deferred_to: Phase 2
note: Email capture not in MVP
priority: p1
issue_id: "002"
tags: [code-review, security, email, authentication, vulnerability, deferred-phase-2]
dependencies: []
deferred_to: "Phase 2"
deferred_reason: "Email capture not in MVP scope. Paste + screenshot sufficient for validation. No users have asked for email capture yet."
deferred_date: "2026-02-10"
---

# Problem Statement

**CRITICAL SECURITY VULNERABILITY**: Email capture feature allows spoofing attacks that can inject malicious memories into user accounts. The plan states "Validate sender matches user's registered email" (line 634) but provides ZERO implementation details for how to prevent email forgery.

**Why This Matters**: Email headers can be trivially spoofed. An attacker who discovers a user's capture email (`username@capture.ember.app`) can send forged emails that appear to come from the user's registered address, injecting false memories, emotional manipulation, or poisoning the user's AI context.

## Findings

**Source**: security-sentinel

**Evidence**:
- Email capture plan (lines 66-72, 511-516) has no authentication mechanism
- No mention of DKIM/SPF/DMARC validation
- No verification workflow (email confirmation links)
- No sender authentication beyond basic string matching
- No rate limiting on inbound email
- No suspicious pattern detection

**Attack Vector**:
```
1. Attacker discovers victim's capture email: user@capture.ember.app
2. Attacker sends email with spoofed From: header matching victim's registered email
3. Email body contains malicious content: "I hate my daughter. She ruined my life."
4. Ember processes email, extracts as memory
5. User's AI now believes false emotional context
```

**Impact Severity**: 🔴 CRITICAL - Memory poisoning, psychological manipulation

## Proposed Solutions

### Solution 1: DKIM/SPF Validation + Email Verification (Recommended)

**Approach**: Multi-layered email security

**Implementation**:
```typescript
// 1. DKIM/SPF/DMARC validation via email service
// SendGrid Inbound Parse provides validation headers:
// X-SG-DKIM: pass
// X-SG-SPF: pass
// X-SG-DMARC: pass

async function validateEmailSecurity(headers: EmailHeaders): Promise<boolean> {
  const dkimPass = headers['x-sg-dkim'] === 'pass';
  const spfPass = headers['x-sg-spf'] === 'pass';
  const dmarcPass = headers['x-sg-dmarc'] === 'pass';

  // Require at least DKIM + SPF
  return dkimPass && spfPass;
}

// 2. Email verification token system
async function handleInboundEmail(email: Email) {
  const user = await findUserByCaptureEmail(email.to);

  // Check if sender is verified
  const isVerified = await db.query.verifiedSenders.findFirst({
    where: and(
      eq(verifiedSenders.userId, user.id),
      eq(verifiedSenders.email, email.from)
    )
  });

  if (!isVerified) {
    // First-time sender: send verification email
    await sendVerificationEmail(user, email.from);
    await quarantineCapture(email);
    return;
  }

  // Verified sender: process normally
  await processCapture(email);
}

// 3. Verification schema
CREATE TABLE verified_senders (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verification_token TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, email)
);
```

**Pros**:
- Industry-standard email security
- Blocks spoofing attacks
- User-controlled sender whitelist
- Phishing protection

**Cons**:
- Adds friction (users must verify senders first time)
- Requires new database table
- Email verification UI needed

**Effort**: Medium (2-3 days)
**Risk**: Low - proven security practice

### Solution 2: Magic Link Instead of Direct Processing

**Approach**: Don't process emails automatically. Send user a link to review/approve.

**Implementation**:
```typescript
async function handleInboundEmail(email: Email) {
  // Store email temporarily
  const pendingId = await db.insert(pendingCaptures).values({
    userId: user.id,
    fromEmail: email.from,
    subject: email.subject,
    body: email.body,
    receivedAt: new Date()
  });

  // Email user a review link
  await sendEmail(user.email, {
    subject: 'New email capture received',
    body: `
      From: ${email.from}
      Subject: ${email.subject}

      Review and approve: ${BASE_URL}/captures/review/${pendingId}
    `
  });
}
```

**Pros**:
- Zero risk of automated poisoning
- User reviews ALL email captures
- Simple to implement

**Cons**:
- Terrible UX (user must approve every email)
- Defeats purpose of "email forwarding convenience"
- High abandonment rate

**Effort**: Low (1 day)
**Risk**: HIGH - Poor user experience

### Solution 3: Rate Limiting + Anomaly Detection Only

**Approach**: Allow emails through, detect abuse patterns

**Implementation**:
```typescript
// Rate limit per sender
const senderRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, '1 d'), // 5 emails/day per sender
});

// Anomaly detection
const isAnomalous = detectAnomalies(email, user);
// - First-time sender
// - Unusual time (3am send)
// - Emotional manipulation keywords
// - Excessive caps/exclamation

if (isAnomalous) {
  await quarantineForReview(email);
  await notifyUser(user, 'Suspicious email capture detected');
}
```

**Pros**:
- Low friction for legitimate use
- Detects abuse patterns

**Cons**:
- Still allows first attack to succeed
- False positives
- Arms race with attackers

**Effort**: Medium (2 days)
**Risk**: MEDIUM - Not sufficient alone

## Recommended Action

**Choose Solution 1: DKIM/SPF + Email Verification**

Implement layered security:
1. DKIM/SPF validation (email service provides this)
2. Sender verification workflow (users approve senders once)
3. Rate limiting (max 5 captures/day from any sender)
4. Quarantine system (suspicious emails held for review)

This balances security and UX. First email from a sender requires verification, subsequent emails auto-process.

## Technical Details

**Affected Components**:
- `app/api/capture/email/route.ts` (inbound webhook)
- `src/lib/email/verification.ts` (new module)
- `src/app/(dashboard)/settings/verified-senders/page.tsx` (new page)

**Database Changes**:
```sql
CREATE TABLE verified_senders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verification_token TEXT UNIQUE,
  token_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, email)
);

CREATE INDEX idx_verified_senders_user ON verified_senders(user_id);
CREATE INDEX idx_verified_senders_token ON verified_senders(verification_token)
  WHERE token_expires_at > NOW();

CREATE TABLE quarantined_captures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_email TEXT NOT NULL,
  subject TEXT,
  body TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**New Dependencies**:
- SendGrid Inbound Parse (with security headers)
- Email template system for verification emails

## Acceptance Criteria

- [ ] DKIM/SPF validation implemented in email webhook
- [ ] Emails from unverified senders trigger verification flow
- [ ] Verification email sent with time-limited token
- [ ] User can approve senders via email link or dashboard
- [ ] Verified senders list displayed in settings
- [ ] Quarantine system holds suspicious emails
- [ ] Rate limiting: max 5 emails/day per sender address
- [ ] Notification sent when suspicious email detected
- [ ] All security checks logged for audit

## Work Log

### 2026-02-10
- **Review finding**: Security sentinel identified email spoofing vulnerability
- **Severity**: Marked as P1 CRITICAL - memory poisoning attack vector
- **Next step**: Design verification workflow and implement DKIM validation

## Resources

- [Plan document section](docs/plans/2026-02-10-feat-ember-mvp-persistent-ai-memory-plan.md#L66-L72) - Email capture description
- [Plan document section](docs/plans/2026-02-10-feat-ember-mvp-persistent-ai-memory-plan.md#L634) - Security mention (insufficient)
- [SendGrid Inbound Parse Security](https://docs.sendgrid.com/for-developers/parsing-email/setting-up-the-inbound-parse-webhook)
- [DMARC.org](https://dmarc.org/) - Email authentication standards
