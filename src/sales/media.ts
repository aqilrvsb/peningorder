import manifest from './manifest.json';

// Type-safe access to the landing's marketing assets. Every file lives in this repo under
// public/sales (served by Vercel with the site), so a deploy can't lose them and no outside
// bucket can delete them. To replace one, drop the new file there and update manifest.json —
// the keys below must stay in sync.
export type MediaKey =
  | 'hero_video'
  | 'hero_video_2'
  | 'hero_video_3'
  | 'pain_messy_desk'
  | 'transformation_before_after'
  | 'dashboard_orders'
  | 'report_analytics'
  | 'parcels_waybill';

export type MediaAsset = {
  type: 'image' | 'video';
  aspect: string;
  url: string;
  poster?: string;
  source?: string;
};

export function media(key: MediaKey): MediaAsset {
  const asset = (manifest.assets as Record<string, MediaAsset>)[key];
  if (!asset) throw new Error(`media('${key}') not found in manifest`);
  return asset;
}
