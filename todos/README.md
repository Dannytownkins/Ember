# Ember MVP - Review Findings & Todos

## Overview

This directory contains structured todo files from the comprehensive code review of the Ember MVP technical plan.

**Review Date**: 2026-02-10  
**Agents Used**: 8 specialized review agents  
**Total Findings**: 6 P1 Critical (created), ~22 P2/P3 (pending)

## Priority Levels

- **P1 (Critical)**: BLOCKS implementation - must fix before building MVP
- **P2 (Important)**: Should fix before launch - will cause problems at scale
- **P3 (Nice-to-Have)**: Quality improvements, not blockers

## Current Status

### P1 Critical Issues (CREATED)

| # | Issue | Status | Effort |
|---|-------|--------|--------|
| [000](000-pending-p1-PRIORITIZATION-PLAN.md) | **Prioritization Plan** | 📋 Meta | - |
| [001](001-pending-p1-no-api-layer-for-agents.md) | No API Layer for Agents | ⏳ Pending | 2-3 days |
| [002](002-pending-p1-email-capture-spoofing.md) | Email Capture Spoofing | ⏳ Pending | 2-3 days |
| [003](003-pending-p1-tenant-isolation-insufficient.md) | Tenant Isolation Insufficient | ⏳ Pending | 2 days |
| [004](004-pending-p1-soft-delete-missing-data-loss-risk.md) | Soft Delete Missing | ⏳ Pending | 2 days |
| [005](005-pending-p1-async-processing-timeout-risk.md) | Async Processing Timeout | ⏳ Pending | 2-3 days |
| [006](006-pending-p1-no-rate-limiting-cost-runaway.md) | No Rate Limiting | ⏳ Pending | 1 day |

**Total Estimated Effort**: 8-13 days

### P2/P3 Issues (NOT YET CREATED)

~22 additional findings identified but not yet filed as todos. Can generate on request.

## Recommended Implementation Order

See [000-pending-p1-PRIORITIZATION-PLAN.md](000-pending-p1-PRIORITIZATION-PLAN.md) for detailed prioritization.

**Quick Summary**:
1. 🔴 **Background Queue** (005) - Days 1-2
2. 🟠 **API Layer** (001) - Days 3-5
3. 🔴 **Row-Level Security** (003) - Days 6-7
4. 🟠 **Rate Limiting** (006) - Day 8
5. 🟡 **Email Security** (002) - Days 9-10 (OPTIONAL)
6. 🟡 **Soft Delete** (004) - Days 11-13 (OPTIONAL)

## File Naming Convention

```
{issue_id}-{status}-{priority}-{description}.md

Examples:
- 001-pending-p1-no-api-layer-for-agents.md
- 002-ready-p2-performance-optimization.md
- 003-complete-p3-code-cleanup.md
```

## Status Values

- `pending` - New finding, needs triage/decision
- `ready` - Approved, ready to work on
- `in_progress` - Currently being implemented
- `complete` - Implementation finished

## Tags

All todos are tagged for filtering:
- `code-review` - From code review process
- `security` - Security vulnerability
- `architecture` - System design issue
- `performance` - Scalability concern
- `data-integrity` - Database/data issue
- `blocking` - Blocks MVP implementation

## Workflow

### 1. Review Findings
```bash
# View all P1 critical issues
ls -1 todos/*-p1-*.md

# Read prioritization plan
cat todos/000-pending-p1-PRIORITIZATION-PLAN.md
```

### 2. Triage & Decide
- Read each P1 todo in detail
- Make deferral decisions (email capture? soft delete?)
- Choose implementation approach for each

### 3. Update Status
When you start working on a finding:
```bash
# Rename file: pending → ready
mv 001-pending-p1-*.md 001-ready-p1-*.md

# Or: ready → in_progress
mv 001-ready-p1-*.md 001-in_progress-p1-*.md

# Or: in_progress → complete
mv 001-in_progress-p1-*.md 001-complete-p1-*.md
```

### 4. Track Progress
Update the Work Log section in each todo as you work.

### 5. Commit
```bash
git add todos/
git commit -m "docs: add P1 code review findings"
```

## Commands

### View pending todos
```bash
ls todos/*-pending-*.md
```

### View P1 critical issues
```bash
ls todos/*-p1-*.md
```

### Count todos by status
```bash
ls todos/*-pending-*.md | wc -l
ls todos/*-ready-*.md | wc -l
ls todos/*-complete-*.md | wc -l
```

### Search todos by tag
```bash
grep -l "security" todos/*.md
grep -l "blocking" todos/*.md
```

## Next Steps

1. **Read** [000-pending-p1-PRIORITIZATION-PLAN.md](000-pending-p1-PRIORITIZATION-PLAN.md)
2. **Decide** timeline (7-day / 9-day / 13-day plan)
3. **Start** with Priority #1 (Background Queue)
4. **Track** progress by updating todo statuses

## Questions?

See the comprehensive review summary in the main conversation or the prioritization plan for detailed guidance.
