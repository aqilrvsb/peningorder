# How to restore `dfr-backup.sql` into a new Supabase project

The file `dfr-backup.sql` is a full data + schema backup of the DFR Supabase project
(ref `wfvuxrhlrmpgzqgyjwxa`). It contains real customer data and API tokens — keep it
private. `.gitignore` already excludes it.

## What's in the backup

| Section | Lines | Notes |
|---|---|---|
| Extensions | pgcrypto, uuid-ossp | enabled with `IF NOT EXISTS` |
| Schema | 25 `CREATE TABLE` | all `public.*` tables except `webhook_logs` + `stock_adjustment_logs` (logs, intentionally skipped) |
| Data | 56 `INSERT` batches | ~17,400 rows total |
| Check constraints | 12 | applied after data |
| Unique constraints | 5 | applied after data |
| Indexes | 13 non-PK | applied after data (so loads stay fast) |
| Foreign keys | 9 | applied after data (so order doesn't matter) |
| Functions | 8 | e.g. `update_cost_product`, `generate_sale_id` |
| RLS | 8 tables + 37 policies | replicated as-is |
| Cron jobs | 1 | NOT auto-applied — see end of file, commented out |

## Restore steps

1. **Create the new Supabase project** (or pick an empty one).
2. **Get its DB credentials** from
   `Project Settings → Database → Connection string`. Use the **Session Pooler**
   (port 5432, IPv4 — works on networks without IPv6). The connection has four
   parts:

   | Field | Value |
   |---|---|
   | host | `aws-1-ap-southeast-1.pooler.supabase.com` (region-dependent) |
   | port | `5432` |
   | user | `postgres` + `.` + new project ref |
   | password | from the new project's Database settings |
   | database | `postgres` |
3. **Run the restore from this folder** (PowerShell, no admin needed):

```powershell
# Install psql if you don't have it. The lightest option:
#   npm install -g pg-bin   (bundles psql.exe)
# OR full install: https://www.postgresql.org/download/windows/

# Set credentials for the NEW project (read password from a local file
# instead of pasting it inline so it never lands in shell history)
$env:PGPASSWORD = (Get-Content "C:\path\to\new-project-password.txt" -Raw).Trim()

$newProjectRef = "ABCDEF...your-new-project-ref"

# Run the backup file
psql `
  --host="aws-1-ap-southeast-1.pooler.supabase.com" `
  --port=5432 `
  --username="postgres.$newProjectRef" `
  --dbname=postgres `
  --file=dfr-backup.sql `
  --single-transaction `
  --set ON_ERROR_STOP=on
```

`--single-transaction` + `--set ON_ERROR_STOP=on` means: if anything errors, the
entire restore rolls back so you never end up with a half-loaded DB.

## If you don't want to install psql

The script in `<scratchpad>/dump.js` also restores. Run it with `--restore` mode
against the new project (ask me — I'll add the restore mode in 30 seconds).

## What's NOT included

- `webhook_logs` (67K rows) — intentionally skipped, regeneratable
- `stock_adjustment_logs` (26K rows) — intentionally skipped, audit log only
- `auth.users` / Supabase Auth state — restore separately via Supabase Auth
  dashboard (Settings → Auth → Users → Export/Import)
- Storage objects (PDF attachments, receipts) — restore separately via
  Supabase Storage UI or `supabase storage` CLI
- Edge Functions code — already in `supabase/functions/*` in this repo, deploy
  via `supabase functions deploy <name>` against the new project
- Project secrets / env vars — set them in the new project's
  `Settings → Edge Functions → Secrets`
- The cron job (1) — commented at the bottom of the SQL file with a ready-to-run
  `SELECT cron.schedule(...)` line

## Regenerating the backup

```powershell
$env:PGPASSWORD = ((Get-Content "C:\Users\User\Documents\sup.txt")[1]).Trim()
cd "C:\Users\User\AppData\Local\Temp\claude\...\scratchpad"  # whatever the path is
node dump.js
```

The script writes a fresh `dfr-backup.sql` and the snapshot is current as of the
moment you run it.
