# Ember MVP - Review Findings & Todos

## Overview

This directory contains structured todo files from the comprehensive code review of the Ember MVP technical plan.

**Review Date**: 2026-02-10
**Agents Used**: 8 specialized review agents
**Total Findings**: 6 P1 Critical, ~20 P2/P3

## Current Status (Updated 2026-02-11)

### P1 Critical Issues

| # | Issue | Status | Completed By |
|---|-------|--------|-------------|
| [000](000-pending-p1-PRIORITIZATION-PLAN.md) | **Prioritization Plan** | 📋 Meta | — |
| [001](001-pending-p1-no-api-layer-for-agents.md) | No API Layer for Agents | ✅ Done | Ralph Loop (Feb 10) |
| [002](002-pending-p1-email-capture-spoofing.md) | Email Capture Spoofing | ⏸️ Deferred | Phase 2 |
| [003](003-pending-p1-tenant-isolation-insufficient.md) | Tenant Isolation Insufficient | ✅ Done | Ralph Loop (Feb 10) |
| [004](004-pending-p1-soft-delete-missing-data-loss-risk.md) | Soft Delete Missing | ✅ Done | Vera (Feb 11) |
| [005](005-pending-p1-async-processing-timeout-risk.md) | Async Processing Timeout | ✅ Done | Ralph Loop (Feb 10) |
| [006](006-pending-p1-no-rate-limiting-cost-runaway.md) | No Rate Limiting | ✅ Done | Ralph Loop (Feb 10) |

**P1 Summary**: 5/6 complete, 1 deferred (email capture → Phase 2)

### P2 Important Issues

| # | Issue | Status | Completed By |
|---|-------|--------|-------------|
| [007](007-pending-p2-no-input-validation.md) | No Input Validation | ✅ Done | Ralph Loop (built with Zod) |
| [008](008-pending-p2-no-monitoring-observability.md) | No Monitoring/Observability | ⏳ Partial | Health endpoints done |
| [009](009-pending-p2-missing-error-handling-patterns.md) | Missing Error Handling | ✅ Done | Vera (error boundary + pages) |
| [010](010-pending-p2-no-caching-strategy.md) | No Caching Strategy | ⏳ Pending | — |
| [011](011-pending-p2-incomplete-database-indexing.md) | Incomplete DB Indexing | ⏳ Partial | Soft delete indexes added |
| [012](012-pending-p2-webhook-idempotency-missing.md) | Webhook Idempotency | ✅ Done | Vera (Feb 11) |
| [013](013-pending-p2-token-budget-edge-cases.md) | Token Budget Edge Cases | ✅ Done | Vera (Feb 11) |
| [014](014-pending-p2-memory-deduplication-missing.md) | Memory Dedup Missing | ✅ Done | Vera (Feb 11) |
| [015](015-pending-p2-no-api-versioning.md) | No API Versioning | ✅ Done | Built with /api/v1/ prefix |
| [016](016-pending-p2-missing-health-endpoints.md) | Missing Health Endpoints | ✅ Done | Vera (Feb 11) |
| [017](017-pending-p2-no-backup-disaster-recovery.md) | No Backup/DR | ⏳ Pending | — |
| [018](018-pending-p2-missing-content-type-validation.md) | Content Type Validation | ⏳ Pending | — |

**P2 Summary**: 8/12 complete, 2 partial, 2 pending

### P3 Nice-to-Have Issues

| # | Issue | Status | Notes |
|---|-------|--------|-------|
| [019](019-pending-p3-no-ci-cd-pipeline.md) | No CI/CD | ⏳ Pending | Vercel handles deploys |
| [020](020-pending-p3-frontend-accessibility-gaps.md) | Accessibility Gaps | ⏳ Pending | — |
| [021](021-pending-p3-no-load-testing-strategy.md) | No Load Testing | ⏳ Pending | — |
| [022](022-pending-p3-wake-prompt-caching.md) | Wake Prompt Caching | ⏳ Pending | — |
| [023](023-pending-p3-no-graceful-degradation.md) | No Graceful Degradation | ⏳ Pending | — |
| [024](024-pending-p3-agent-native-ui-gaps.md) | Agent-Native UI Gaps | ⏳ Pending | — |
| [025](025-pending-p3-design-system-tokens.md) | Design System Tokens | ✅ Done | Full amber theme in globals.css |
| [026](026-pending-p3-postgres-enum-vs-text.md) | Postgres Enum vs Text | ✅ Done | Using text + CHECK |

**P3 Summary**: 2/8 complete, 6 pending (non-blocking)

---

## Feature Progress (Beyond Original PRD)

### Added by Vera (Feb 11)

| Feature | Status | Commit |
|---------|--------|--------|
| Screenshot Capture (backend + UI) | ✅ Done | `1049594`, `d4f6238` |
| Soft Delete (schema, helpers, purge cron) | ✅ Done | `1049594` |
| Memory Deduplication (content hash) | ✅ Done | `1049594` |
| Full-Text Search (API + client-side) | ✅ Done | `1049594`, `d4f6238` |
| OpenAPI 3.0.3 Spec | ✅ Done | `d4f6238` |
| Landing Page (hero, features, pricing) | ✅ Done | `7d4a746` |
| Data Export (JSON download) | ✅ Done | `5afa940` |
| Soft-Delete Purge Cron | ✅ Done | `5afa940` |
| Platform Auto-Detection | ✅ Done | `fd03e2d` |
| Token Budget Overflow Handling | ✅ Done | `918e8d8` |
| Active Nav + Loading Skeletons | ✅ Done | `a4c1dfb` |
| Error/404 Pages | ✅ Done | `a4c1dfb` |
| Health/Ready Endpoints | ✅ Done | `aeda803` |
| Vercel Deployment Config | ✅ Done | `9b03bca` |
| Deployment Guide | ✅ Done | `8e34803` |
| README | ✅ Done | `e0c99d8` |
| Webhook Soft Delete + user.updated | ✅ Done | `274a1d6` |

### Stats
- **Commits**: 12 (today)
- **Lines Added**: 3,219
- **Files Changed**: 49
- **Total LOC**: 6,257

---

## MVP Acceptance Criteria

### Functional ✅
- [x] User can sign up via Clerk and land on dashboard
- [x] User can paste a conversation and extract memories
- [x] User can upload screenshots and extract memories
- [x] Extraction produces dual-dimension memories (factual + emotional)
- [x] Memories display with category filters + search
- [x] Memories support inline edit
- [x] Memories support delete with double confirmation (now soft-delete)
- [x] Wake prompt generates from selected categories within token budget
- [x] Wake prompt shows overflow warnings
- [x] Wake prompt copy-to-clipboard works
- [x] API tokens can be created, listed, and revoked
- [x] All API endpoints work with Bearer token auth
- [x] API returns paginated results with cursor
- [x] Data export available (JSON)
- [x] Platform auto-detection on paste

### Security ✅
- [x] RLS prevents cross-tenant data access
- [x] Rate limiting enforces tier caps
- [x] API tokens hashed (SHA-256)
- [x] Clerk webhook verifies Svix signature
- [x] All inputs validated with Zod
- [x] Soft delete with 30-day recovery

### Performance ✅
- [x] Inngest background processing (5-min timeout)
- [x] Loading skeletons for all dashboard pages
- [x] Client-side search for instant filtering

### Deployment ✅
- [x] Vercel config ready
- [x] Environment variables documented
- [x] Health/ready endpoints
- [x] Deployment guide written

---

## What's Left

### Before Launch
- [ ] Set up external services (Clerk, Inngest, Upstash, Neon)
- [ ] Run database migrations
- [ ] Deploy to Vercel
- [ ] Smoke test end-to-end

### Phase 1.5 (Post-Launch, ~2 weeks)
- [ ] Sentry error tracking
- [ ] Image upload to Cloudinary (for screenshot capture)

### Phase 2
- [ ] Email capture with spoofing protection
- [ ] Semantic search (embeddings)
- [ ] Memory compression for paid tier

### Phase 3+
- [ ] Stripe payments
- [ ] Browser extension
- [ ] Onboarding flow
