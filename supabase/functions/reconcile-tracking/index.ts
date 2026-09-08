// deno-lint-ignore-file no-explicit-any
// Evening tracking reconcile — a SAFETY NET for missed ParcelDaily webhooks.
//
// Runs peningorder-wide (all tenants), only in the 20:00–23:30 Asia/Kuala_Lumpur
// window (couriers move during office hours, so daytime webhooks cover the day;
// the evening sweep catches whatever was missed). Status-only — it NEVER sends
// WhatsApp and NEVER moves Pending→Shipped.
//
// For each slice it takes the oldest-unchecked SHIPPED orders that got NO webhook
// today, groups them by tenant, batches their consign numbers to ParcelDaily's
// /checkout-status, and applies the SAME rule as the webhook: delivered → Success,
// returned → Return, otherwise just refresh the raw status (seos). Every order it
// touches is stamped tracking_last_checked_at so each is polled at most once/day.
//
// COD remittance ("paid to account") CANNOT be polled — ParcelDaily exposes no
// remittance endpoint (/remittance, /statement → 404); it only arrives via the
// COD_REMITTED webhook. So COD settlement stays webhook + Finance "Collected";
// the overdue-unsettled safety net is surfaced in the UI, not here.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

// "Now" as Kuala Lumpur wall-clock (UTC+8, no DST) expressed via a UTC Date.
const klNow = () => new Date(Date.now() + 8 * 3600 * 1000);

// Only run 20:00–23:30 KL (1200–1410 minutes).
function withinWindow(): boolean {
  const kl = klNow();
  const mins = kl.getUTCHours() * 60 + kl.getUTCMinutes();
  return mins >= 20 * 60 && mins <= 23 * 60 + 30;
}

// KL "today 00:00" as an offset-aware ISO string, and the plain YYYY-MM-DD.
function klToday() {
  const kl = klNow();
  const y = kl.getUTCFullYear();
  const mo = String(kl.getUTCMonth() + 1).padStart(2, "0");
  const d = String(kl.getUTCDate()).padStart(2, "0");
  return { startISO: `${y}-${mo}-${d}T00:00:00+08:00`, dateStr: `${y}-${mo}-${d}` };
}

// Classify a raw courier status text into a terminal delivery state (or null =
// still in transit → only refresh seos). Conservative: "failed delivery attempt"
// contains "deliver" but must NOT count as delivered.
function classify(statusRaw: string): "Success" | "Return" | null {
  const s = (statusRaw || "").toLowerCase();
  if (!s) return null;
  const bad = /(fail|unsuccess|attempt|problem|pending another|unable|reschedul)/.test(s);
  if (/(returned|return to sender|\brts\b|\brto\b|parcel returned|dipulang)/.test(s)) return "Return";
  if (!bad && /(delivered|successful delivery|parcel delivered|signed by|collected by consignee)/.test(s)) return "Success";
  return null;
}

const chunk = <T,>(arr: T[], n: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};

serve(async (req) => {
  try {
    const url = new URL(req.url);
    const key = url.searchParams.get("key") || "";
    const force = url.searchParams.get("force") === "1"; // bypass window (testing)
    const slice = Math.min(Math.max(Number(url.searchParams.get("slice")) || 200, 1), 500);

    const admin = createClient(SUPABASE_URL, SERVICE);

    // Auth: caller must present the shared secret (pg_cron reads it from the same
    // table). Avoids embedding the service-role key in the cron command.
    const { data: secretRow } = await admin.from("reconcile_config").select("secret").eq("id", 1).maybeSingle();
    if (!secretRow?.secret || key !== secretRow.secret) return json(401, { error: "unauthorized" });

    if (!force && !withinWindow()) return json(200, { skipped: "outside_window" });

    const { startISO, dateStr } = klToday();

    // The pool: SHIPPED orders with a real consign, no webhook today, not polled
    // today — oldest first so the cursor rotates the whole backlog through the day.
    const { data: pool, error: poolErr } = await admin
      .from("customer_purchases")
      .select("id, owner_user_id, tracking_number, delivery_status, type_payment, date_processed, date_return, seos")
      .eq("delivery_status", "Shipped")
      .not("tracking_number", "is", null)
      .neq("tracking_number", "")
      .or(`last_webhook_at.is.null,last_webhook_at.lt.${startISO}`)
      .or(`tracking_last_checked_at.is.null,tracking_last_checked_at.lt.${startISO}`)
      .order("tracking_last_checked_at", { ascending: true, nullsFirst: true })
      .limit(slice);
    if (poolErr) return json(500, { error: poolErr.message });
    if (!pool || pool.length === 0) return json(200, { processed: 0, note: "nothing due" });

    // Group by tenant (each has its own ParcelDaily credentials).
    const byOwner = new Map<string, any[]>();
    for (const o of pool) {
      const arr = byOwner.get(o.owner_user_id) || [];
      arr.push(o);
      byOwner.set(o.owner_user_id, arr);
    }

    const ownerIds = [...byOwner.keys()];
    const { data: configs } = await admin
      .from("parceldaily_config")
      .select("owner_user_id, token, merchant_id, environment")
      .in("owner_user_id", ownerIds);
    const cfgByOwner = new Map((configs || []).map((c: any) => [c.owner_user_id, c]));

    const nowIso = new Date().toISOString();
    let delivered = 0, returned = 0, seosUpdated = 0, checkedOnly = 0;
    const handled = new Set<string>();

    for (const [owner, orders] of byOwner) {
      const cfg = cfgByOwner.get(owner);
      // No credentials → can't poll; still rotate the cursor so we don't retry
      // these same rows every run today.
      if (!cfg?.token || !cfg?.merchant_id) continue;

      const apiBase = (cfg.environment || "production") === "production"
        ? "https://api.parceldaily.com"
        : "https://api.sandbox.parceldaily.com";
      const headers = { "Content-Type": "application/json", token: cfg.token, merchantid: cfg.merchant_id };

      const byConsign = new Map<string, any>();
      for (const o of orders) byConsign.set(String(o.tracking_number), o);

      for (const group of chunk(orders, 50)) {
        const consigns = group.map((o) => String(o.tracking_number));
        let items: any[] = [];
        try {
          const res = await fetch(`${apiBase}/v1/partner/checkout-status`, {
            method: "POST",
            headers,
            body: JSON.stringify({ consign_nos: consigns }),
          });
          const j = await res.json().catch(() => null);
          items = Array.isArray(j?.data) ? j.data : [];
        } catch (_e) {
          items = []; // network hiccup → leave for a later run (not stamped handled)
          continue;
        }

        for (const item of items) {
          const o = byConsign.get(String(item?.consign_no));
          if (!o) continue;
          const statusText = String(item?.status || "");
          if (!statusText) { // consign not found / archived at PD → just stamp checked
            await admin.from("customer_purchases").update({ tracking_last_checked_at: nowIso }).eq("id", o.id);
            handled.add(o.id); checkedOnly++;
            continue;
          }
          const cls = classify(statusText);
          const upd: Record<string, any> = { tracking_last_checked_at: nowIso, seos: statusText };
          if (cls === "Success") {
            upd.delivery_status = "Success";
            upd.seo = "Successful Delivery";
            if (!o.date_processed) upd.date_processed = dateStr;
            delivered++;
          } else if (cls === "Return") {
            upd.delivery_status = "Return";
            // Stamp date_return so it surfaces in the Return tab (filtered by it).
            if (!o.date_return) upd.date_return = dateStr;
            returned++;
          } else {
            seosUpdated++;
          }
          await admin.from("customer_purchases").update(upd).eq("id", o.id);
          handled.add(o.id);
        }
      }
    }

    // Every pool row that wasn't individually updated (no config, consign missing
    // from the response) still gets its cursor stamped so it rotates out today.
    const unhandled = pool.filter((o) => !handled.has(o.id)).map((o) => o.id);
    if (unhandled.length) {
      await admin.from("customer_purchases").update({ tracking_last_checked_at: nowIso }).in("id", unhandled);
      checkedOnly += unhandled.length;
    }

    return json(200, {
      processed: pool.length,
      delivered,
      returned,
      seos_updated: seosUpdated,
      checked_only: checkedOnly,
      tenants: ownerIds.length,
    });
  } catch (err: unknown) {
    return json(500, { error: err instanceof Error ? err.message : "reconcile error" });
  }
});
