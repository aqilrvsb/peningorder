// ads-autopilot — hourly Meta ads rules for PeningOrder (pg_cron "ads-autopilot-hourly").
//
// Every hour (MYT, the ad account's timezone):
//   • budget  = min(max_budget, base_budget + step × purchases today) per CBO campaign
//     (absolute, so reruns never stack)
//   • auto-off: pause any ad that spent ≥ pause_spend today with 0 purchases
//   • WhatsApp report (table + totals) to notify_phone, except quiet hours (12am–4am)
// At 00:00 MYT: every campaign back to base_budget, ads it paused turned back on.
//
// Config + token: one platform_secrets row per product/ad account, key
// "meta_ads_autopilot" or "meta_ads_autopilot_<name>" (see migration 20261008_ads_autopilot);
// every enabled profile runs each hour. Auth: header x-cron-secret = platform_secrets.cron_secret.
// Body (optional): { "mode": "auto" | "scale" | "reset" | "dry" | "report", "profile": "<key>" }
//   dry    = compute everything, change nothing, return the report (no WhatsApp)
//   report = change nothing, send the report now
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GRAPH = "https://graph.facebook.com/v21.0/";
const WA_SEND = "https://dev-muse-automaton-production.up.railway.app/api/send";

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

type Cfg = {
  label?: string; enabled: boolean; access_token: string | null; ad_account_id: string; campaign_ids: string[];
  base_budget: number; step: number; max_budget: number; pause_spend: number;
  notify_phone: string; quiet_start: number; quiet_end: number;
};
// deno-lint-ignore no-explicit-any
type Any = any;

// Purchases / purchase value from an insights row (Meta reports the same purchase
// under several action types — take the first that exists, never sum them).
const PURCHASE_TYPES = ["omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase"];
const pick = (list: Any[] | undefined): number => {
  for (const t of PURCHASE_TYPES) {
    const a = (list || []).find((x: Any) => x.action_type === t);
    if (a) return Number(a.value) || 0;
  }
  return 0;
};
const rm = (sen: number) => `RM${(sen / 100).toFixed(0)}`;
const money = (v: number) => `RM${v.toFixed(2)}`;

serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  const admin = createClient(SUPABASE_URL, SERVICE);

  const { data: sec } = await admin.from("platform_secrets").select("value").eq("key", "cron_secret").maybeSingle();
  const expected = (sec?.value as Any)?.secret || "";
  if (!expected || req.headers.get("x-cron-secret") !== expected) return json(401, { error: "unauthorized" });

  const body = await req.json().catch(() => ({}));
  let q = admin.from("platform_secrets").select("key, value").like("key", "meta_ads_autopilot%");
  if (body?.profile) q = q.eq("key", String(body.profile));
  const { data: profiles } = await q;
  const results: Record<string, unknown> = {};
  for (const p of profiles || []) {
    const cfg = (p.value || {}) as Cfg;
    if (!cfg.enabled || !cfg.access_token) { results[p.key] = { skipped: "not_enabled" }; continue; }
    results[p.key] = await runProfile(admin, p.key, cfg, String(body?.mode || "auto"));
  }
  return json(200, { results });
});

async function runProfile(admin: Any, key: string, cfg: Cfg, modeIn: string): Promise<Record<string, unknown>> {
  const myt = new Date(Date.now() + 8 * 3600_000);
  const hour = myt.getUTCHours();
  const hhmm = myt.toISOString().slice(11, 16);
  let mode = modeIn;
  if (mode === "auto") mode = hour === 0 ? "reset" : "scale";
  const apply = mode === "scale" || mode === "reset";
  const label = cfg.label || "Ads";

  const token = cfg.access_token as string;
  const g = async (path: string, params: Record<string, string> = {}) => {
    const u = new URL(GRAPH + path);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    u.searchParams.set("access_token", token);
    const r = await fetch(u);
    const j = await r.json();
    if (j.error) throw new Error(`${path}: ${j.error.message}`);
    return j;
  };
  const post = async (id: string, fields: Record<string, string>) => {
    const r = await fetch(GRAPH + id, { method: "POST", body: new URLSearchParams({ ...fields, access_token: token }) });
    const j = await r.json();
    if (j.error) throw new Error(`${id}: ${j.error.message}`);
    return j;
  };
  const act = `act_${cfg.ad_account_id}`;
  const actions: string[] = [];

  try {
    // Campaigns with a campaign (CBO) daily budget.
    const camps = (await g(`${act}/campaigns`, {
      fields: "id,name,effective_status,daily_budget",
      filtering: JSON.stringify([{ field: "effective_status", operator: "IN", value: ["ACTIVE", "PAUSED"] }]),
      limit: "100",
    })).data as Any[];
    const only = Array.isArray(cfg.campaign_ids) && cfg.campaign_ids.length ? new Set(cfg.campaign_ids) : null;
    const cbo = camps.filter((c) => c.daily_budget && (!only || only.has(c.id)));

    // ── 12am reset ───────────────────────────────────────────────────────────
    if (mode === "reset") {
      for (const c of cbo) {
        if (Number(c.daily_budget) !== cfg.base_budget) {
          await post(c.id, { daily_budget: String(cfg.base_budget) });
          actions.push(`↩️ ${c.name}: budget ${rm(Number(c.daily_budget))} → ${rm(cfg.base_budget)}`);
        }
      }
      const { data: paused } = await admin.from("ads_autopilot_paused").select("ad_id, ad_name").eq("profile", key);
      for (const p of paused || []) {
        try {
          await post(p.ad_id, { status: "ACTIVE" });
          actions.push(`▶️ Hidupkan semula: ${p.ad_name}`);
        } catch (e) { actions.push(`⚠️ ${p.ad_name}: ${(e as Error).message}`); }
        await admin.from("ads_autopilot_paused").delete().eq("ad_id", p.ad_id);
      }
      const msg = `🌙 *${label} — reset 12am*\n` +
        (actions.length ? actions.join("\n") : "Tiada perubahan (semua dah RM" + cfg.base_budget / 100 + ").");
      await admin.from("ads_autopilot_log").insert({ mode, summary: { profile: key, actions } });
      const sent = await sendWa(admin, cfg.notify_phone, msg);
      return { mode, actions, sent };
    }

    // ── Hourly scale + auto-off + report ─────────────────────────────────────
    const ins = (await g(`${act}/insights`, {
      level: "campaign", date_preset: "today",
      fields: "campaign_id,campaign_name,spend,actions,action_values", limit: "100",
    })).data as Any[];
    const byCamp = new Map(ins.map((r) => [r.campaign_id, r]));

    const rows: { name: string; budget: number; spend: number; purchases: number; value: number; status: string }[] = [];
    for (const c of cbo) {
      const r = byCamp.get(c.id) || {};
      const spend = Number(r.spend) || 0;
      const purchases = pick(r.actions);
      const value = pick(r.action_values);
      let budget = Number(c.daily_budget);
      if (c.effective_status === "ACTIVE") {
        const target = Math.min(cfg.max_budget, cfg.base_budget + cfg.step * purchases);
        if (target !== budget) {
          if (apply) await post(c.id, { daily_budget: String(target) });
          actions.push(`📈 ${c.name}: budget ${rm(budget)} → ${rm(target)} (${purchases} purchase)${apply ? "" : " [dry]"}`);
          budget = target;
        }
      }
      rows.push({ name: c.name, budget, spend, purchases, value, status: c.effective_status });
    }

    // Auto-off: ads with spend ≥ pause_spend today and no purchase.
    const adIns = (await g(`${act}/insights`, {
      level: "ad", date_preset: "today", fields: "ad_id,ad_name,campaign_id,spend,actions", limit: "500",
    })).data as Any[];
    const losers = adIns.filter((r) => Math.round((Number(r.spend) || 0) * 100) >= cfg.pause_spend && pick(r.actions) === 0
      && cbo.some((c) => c.id === r.campaign_id));
    if (losers.length) {
      const st = await g("", { ids: losers.map((r) => r.ad_id).join(","), fields: "effective_status" });
      for (const r of losers) {
        if (st[r.ad_id]?.effective_status !== "ACTIVE") continue;
        if (apply) {
          await post(r.ad_id, { status: "PAUSED" });
          await admin.from("ads_autopilot_paused").upsert({ ad_id: r.ad_id, profile: key, campaign_id: r.campaign_id, ad_name: r.ad_name, spend: Number(r.spend) });
        }
        actions.push(`⛔ Auto-off: ${r.ad_name} (spend ${money(Number(r.spend))}, 0 purchase)${apply ? "" : " [dry]"}`);
      }
    }

    // Report
    const tSpend = rows.reduce((s, r) => s + r.spend, 0);
    const tPurch = rows.reduce((s, r) => s + r.purchases, 0);
    const tValue = rows.reduce((s, r) => s + r.value, 0);
    const roas = (v: number, s: number) => (s > 0 ? (v / s).toFixed(2) + "x" : "-");
    const short = (s: string) => (s.length > 22 ? s.slice(0, 21) + "…" : s);
    const table = rows.map((r) =>
      `• *${short(r.name)}*${r.status === "ACTIVE" ? "" : " (paused)"}\n  Budget ${rm(r.budget)} | Spend ${money(r.spend)} | Purchase ${r.purchases} | ROAS ${roas(r.value, r.spend)}`,
    ).join("\n");
    const msg =
      `📊 *${label} — ${hhmm}*\n\n` +
      (table || "Tiada kempen aktif.") +
      `\n\n*Total Spend:* ${money(tSpend)}\n*Total Purchase:* ${tPurch}\n*Total ROAS:* ${roas(tValue, tSpend)}` +
      (actions.length ? `\n\n*Tindakan:*\n${actions.join("\n")}` : "\n\n✅ Tiada perubahan jam ni.");

    const quiet = hour >= cfg.quiet_start && hour < cfg.quiet_end;
    let sent: unknown = "skipped";
    if (mode === "report" || (mode === "scale" && !quiet)) sent = await sendWa(admin, cfg.notify_phone, msg);
    await admin.from("ads_autopilot_log").insert({ mode, summary: { profile: key, hhmm, rows, actions, totals: { tSpend, tPurch, tValue }, sent } });
    return { mode, hhmm, rows, actions, sent, message: msg };
  } catch (e) {
    const err = String((e as Error).message || e);
    await admin.from("ads_autopilot_log").insert({ mode, summary: { profile: key, error: err, actions } });
    // Tell the owner so a broken token doesn't fail silently.
    if (mode !== "dry") await sendWa(admin, cfg.notify_phone, `⚠️ *${label} — autopilot error* (${hhmm})\n${err}`);
    return { error: err, actions };
  }
}

// PeningBot gateway, admin device (HTTP is always 200; success is body.status).
async function sendWa(admin: Any, phone: string, message: string): Promise<boolean> {
  const { data: device } = await admin.from("admin_device").select("instance").eq("active", true).limit(1).maybeSingle();
  if (!device?.instance || !phone) return false;
  try {
    const r = await fetch(WA_SEND, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ device_id: device.instance, number: phone, message }),
    });
    const j = await r.json().catch(() => ({}));
    return r.ok && j?.status !== false;
  } catch { return false; }
}
