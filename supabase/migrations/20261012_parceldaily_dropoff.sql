-- Courier Settings → "Cara Serah Parcel": Pickup (default) or Drop Off.
-- Sent as ParcelDaily order/create `isDropoff` (required field; false = Pickup from the
-- sender address, true = seller drops the parcel at the courier). Same quoted price either
-- way (quote API has no drop-off parameter). Every booking path goes through
-- parceldaily-order, so key-in, WooCommerce, Integration map and Generate Tracking all follow it.
-- Verified 2026-10-12 on the ParcelDaily sandbox: create with isDropoff=true → 201, stored
-- isDropoff=true, price unchanged (test cart order archived).
-- (Applied via Supabase MCP migration "parceldaily_dropoff" on 2026-10-12.)
alter table public.parceldaily_config
  add column if not exists is_dropoff boolean not null default false;

comment on column public.parceldaily_config.is_dropoff is
  'Parcel handover mode sent to ParcelDaily order/create as isDropoff. false = Pickup (courier collects from the sender address), true = Drop Off (seller brings parcels to the courier counter / drop point). Applies to every booking path via parceldaily-order.';
