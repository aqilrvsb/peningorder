# peningorder — SaaS pivot of DFR EMPIRE

**If you are a Claude session opening this project for the first time, read this file end-to-end before touching anything.** It captures decisions and constraints from the parent project that are NOT obvious from the code.

---

## What this project is

A **multi-tenant B2B SaaS** version of the DFR EMPIRE order-management + marketer / logistics system. Target market: **individual sellers and small teams in Malaysia / Southeast Asia** who currently run their business on WhatsApp + spreadsheets and want an all-in-one order-management + reporting tool.

**Business plan:**
- Year 1 target: **300-500 tenants**, each processing ~10,000 orders/day
- Long-term: 5,000 tenants
- Total peak load: **3-5M order inserts/day**, 1-2B rows/year in `customer_purchases`
- ~150K-300K MAU total (3 team members per tenant)
- Region: **Southeast Asia**, primary: Malaysia (ap-southeast-1 / Singapore)
- Monetization: Stripe subscription, self-serve onboarding

## Origin — this is a fork

Cloned from `github.com/aqilrvsb/marketerpro-suite` (the DFR EMPIRE single-tenant production system) on 2026-06-24. The two repos are **fully independent** — no shared remote. Do NOT push changes back to `marketerpro-suite` from this working copy.

**Original project location on disk:** `E:\Project\DFR EMPIRE\marketerpro-suite-main` — do NOT modify anything there from a peningorder session.

## Current state (as of 2026-06-24)

- Codebase: **identical to DFR EMPIRE at commit `910381c`**
- Still points at DFR's Supabase project (`wfvuxrhlrmpgzqgyjwxa`) — **needs its own Supabase before any deploy**
- **Not yet deployed** to Vercel
- **Not yet multi-tenant** — still single-tenant DFR code with all its data assumptions

### Legacy flag from DFR audit

`src/lib/audit.ts` exports `AUDIT_MODE = true` which hides every delete button across every role. This was added for a DFR audit in progress. For the SaaS launch you should either:
- Flip to `false` before onboarding customer #1 (deletes matter for GDPR / PDPA compliance), OR
- Rebuild delete behavior with soft-delete + tenant admin approval workflow

## Tech stack decisions (from deep research, 2026-06-24)

Research spawned 107 sub-agents against 5 search angles, verified 25 claims (22 confirmed, 3 refuted). Key verified facts:

- **Keep Supabase Postgres** — verified as viable to ~64 vCPU / 256GB (16XL) but the write ceiling is single-primary. Beyond that requires app-level sharding.
- **Cliff points** (all from official docs, non-negotiable):
  - Direct connections: 60 (Micro) → 500 (16XL)
  - Realtime concurrent: 500 (Pro) / 10,000 (Team)
  - Realtime msg/sec: **2,500 hard cap on Team**
  - Edge Function CPU: **2 seconds** — NOT sufficient for report generation or batch webhook processing
  - Disk auto-scale: max 4 modifications per 24h; 95% utilization = read-only fallback
- **Multi-tenant pattern**: shared table with `tenant_id` column + Postgres RLS. Verified as the dominant pattern (AWS RLS blog + PlanetScale's approaches-to-tenancy write-up). Schema-per-tenant blows the connection pool at 500+ tenants.
- **RLS gotcha**: plain `SET app.tenant_id = ...` **breaks under Supavisor/PgBouncer transaction pooling**. Must use `SET LOCAL app.tenant_id` inside every transaction OR use JWT-based policies (`auth.jwt() ->> 'tenant_id'`). A single missed `SET LOCAL` under transaction pooling = **tenant data crossover leak**.
- **Reference stacks verified from public repos:**
  - Cal.com: Next.js 16 + React 18 + Prisma 6 on Postgres + NestJS side-service for public API
  - Dub.co: Next.js + PlanetScale + Prisma + Upstash Redis

### The recommended stack for peningorder

```
Frontend    : React 18 + Vite + TanStack Query    (keep from DFR)
Auth        : Supabase Auth                       (keep)
CRUD API    : Supabase auto-generated PostgREST   (for simple reads)
Hot-path API: Fastify on Fly.io Singapore         (ADD before scale)
DB          : Supabase Postgres 17 in ap-southeast-1  (own project, XL from launch)
Cache       : Upstash Redis                       (ADD)
Queue       : BullMQ + Redis, migrate to Inngest if ops hurt  (ADD)
Realtime    : Supabase Realtime for light use, replace at scale
Deploy      : Vercel (frontend) + Fly.io (Fastify API)
Payments    : Stripe (self-serve subscription)
Multi-tenant: shared table + tenant_id column + RLS with SET LOCAL
```

### What NOT to switch to (all considered and rejected)

- **NodeDB / experimental DBs** — 173 stars, public beta, on-disk format may change. Do not build a SaaS on unproven storage.
- **Laravel / Django / Go** — user has React + TypeScript expertise. Rewrite = 6 months lost.
- **NoSQL (Dynamo, Mongo)** — reporting workload needs SQL joins and aggregations.
- **Aurora Serverless v2** — AWS's own blog has zero throughput benchmarks. No credible reason to switch.

## Roadmap (in order)

### Phase 1 — Get the plumbing running (2-3 days)
1. Create new Supabase project (region: `ap-southeast-1`, Pro plan)
2. Apply schema from `dfr-backup.sql` (**schema section only, skip the DATA section**) — extension, tables, indexes, FKs, constraints, functions, RLS, cron. Do NOT import DFR customer data.
3. Configure env vars for the new project
4. Deploy to Vercel — should build cleanly since code is identical to DFR
5. Manual smoke test: signup, create first bundle, add first fake order

### Phase 2 — Multi-tenant surgery (1-2 weeks) — DO BEFORE ONBOARDING CUSTOMER #1
1. Add `tenant_id UUID` column to every table (default to a bootstrap tenant for existing data)
2. Create `tenants` + `tenant_members` tables:
   ```sql
   CREATE TABLE tenants (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     name TEXT NOT NULL,
     slug TEXT UNIQUE NOT NULL,
     plan TEXT DEFAULT 'trial',
     created_at TIMESTAMPTZ DEFAULT NOW()
   );
   CREATE TABLE tenant_members (
     tenant_id UUID REFERENCES tenants(id),
     user_id UUID REFERENCES auth.users(id),
     role TEXT NOT NULL,
     PRIMARY KEY (tenant_id, user_id)
   );
   ```
3. Enable RLS on every table. Use JWT-based policies (safer under Supavisor pooling):
   ```sql
   CREATE POLICY tenant_isolation ON <table>
   USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
   ```
4. Every code path that writes must set `tenant_id: currentTenant.id`. Every read is auto-filtered by RLS.
5. Signup flow: new user → create `tenants` row → `tenant_members` row → seed default bundles/settings for the tenant.

### Phase 3 — SaaS-specific features (2-3 weeks)
- Stripe subscription integration + webhook handling
- Onboarding wizard (create first bundle, add first marketer, connect Poslaju/NinjaVan)
- Team invites (per-tenant)
- Plans + usage limits
- Marketing site (`peningorder.com` or wherever) — could be separate Next.js on Vercel

### Phase 4 — Speed layer (1 week, only when there's real load)
- **Materialized views** for the Report Profit dashboard (refresh hourly on read replica)
- **Partition `customer_purchases`** by month once >1M rows
- **Upstash Redis** for bundle-cost lookups and per-tenant config
- **Fastify** on Fly.io for hot paths (webhook processing, order inserts, report queries) — needed when Edge Function 2s CPU limit or invocation cost bites

## Do this BEFORE onboarding customer #1

1. **Multi-tenant surgery is done** — cannot migrate paying customer data safely afterwards.
2. **RLS policies use `SET LOCAL` or JWT-based** — tenant crossover leaks are the #1 SaaS failure mode.
3. **Backup strategy tested** — restore from backup successful at least once into a scratch project.
4. **Stripe payment path tested end-to-end** — including failed-payment + cancellation flows.
5. **`AUDIT_MODE`** — decide: flip to `false` (allow deletes) OR keep `true` and build soft-delete elsewhere.

## Files and directories

- `src/` — React + Vite frontend (identical to DFR)
- `src/lib/audit.ts` — `AUDIT_MODE = true` legacy flag hiding delete buttons
- `supabase/` — Edge Function source (needs redeployment to peningorder's own Supabase)
- `RESTORE_BACKUP.md` — instructions for importing `dfr-backup.sql` into a new Supabase project (from DFR)
- `dfr-backup.sql` — NOT in this repo (gitignored). Get it from the DFR project folder if needed for schema reference.
- `SYSTEM_DOCUMENTATION.md`, `WEBHOOK_DOCUMENTATION.md` — inherited from DFR, still accurate

## References

- **Deep research report** — 107 agents, 25 sources, 22 verified claims. Sources included Supabase official docs, AWS RLS blog, Cal.com public GitHub, Dub.co public GitHub, PlanetScale tenancy blog. Full transcript in DFR project's session logs; the verified conclusions are already reflected in this document.
- **User's original DFR system**: `github.com/aqilrvsb/marketerpro-suite`
- **This SaaS repo**: `github.com/aqilrvsb/peningorder`

## User context

- Solo/small-team founder in Malaysia
- Comfortable in TypeScript + React, does NOT want to switch to Laravel / Django / Go
- Values step-by-step progress, honest tradeoff analysis, and evidence-backed recommendations
- Prefers proven boring tech over hyped new tools
- Wants "blazing" speed — this means well-indexed Postgres + Redis cache + materialized views, NOT rewriting to a new DB

## Tone / working style with this user

- Be direct. Give a recommendation, not a survey of options.
- When a decision has real tradeoffs, put them in a compact table and pick a winner.
- Cite sources for non-obvious claims.
- Never suggest rewriting large sections of the codebase without explicit ask.
- Verify things in the database (via Supabase MCP) before proposing schema changes.
