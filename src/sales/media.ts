import manifest from './manifest.json';

// Type-safe access to the AI-generated marketing assets manifest. URLs point
// at peninglab's CDN (Backblaze B2) so they survive Vercel deploys and load
// from an edge close to the visitor. Regenerate assets with the peninglab MCP
// and update manifest.json — the keys below must stay in sync.
export type MediaKey =
  | 'hero_video'
  | 'hero_video_2'
  | 'hero_video_3'
  | 'hero_video_4'
  | 'pain_messy_desk'
  | 'transformation_before_after'
  | 'dashboard_orders'
  | 'report_analytics'
  | 'parcels_waybill'
  | 'avatar_1'
  | 'avatar_2'
  | 'avatar_3';

export type MediaAsset = {
  type: 'image' | 'video';
  aspect: string;
  url: string;
  task_id: string;
  cost_rm: number;
  provider: string | null;
  slot: string | null;
};

export function media(key: MediaKey): MediaAsset {
  const asset = (manifest.assets as Record<string, MediaAsset>)[key];
  if (!asset) throw new Error(`media('${key}') not found in manifest`);
  return asset;
}
