-- Base scaling at 12am (last 3 full days, whole profile): ROAS ≥ scale_roas with ≥ scale_min_purchases
-- → base +scale_pct% (at most every scale_every_days, up to base_cap); spend ≥ down_min_spend with
-- ROAS < down_roas → base −scale_pct% (not below base_floor). The daily cap keeps the same headroom
-- above the base as max_budget has above base_floor (RM30/RM100 → +RM70).
update public.platform_secrets
set value = jsonb_build_object(
      'base_floor', 3000,          -- never below RM30
      'base_cap', 15000,           -- base never above RM150 (max/day = base + RM70)
      'scale_roas', 2,             -- 3-day ROAS ≥ 2.0x …
      'scale_min_purchases', 3,    -- … with ≥ 3 purchases → +20%
      'scale_pct', 20,
      'scale_every_days', 2,       -- at most one raise every 2 days
      'down_roas', 1,              -- 3-day ROAS < 1.0x …
      'down_min_spend', 10000      -- … after RM100 spend → −20%
    ) || value,
    updated_at = now()
where key like 'meta_ads_autopilot%';
