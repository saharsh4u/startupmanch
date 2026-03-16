export type HomepagePitch = {
  id: string;
  startupId?: string | null;
  name: string;
  tagline: string;
  poster: string;
  video?: string | null;
  videoHlsUrl?: string | null;
  videoMp4Url?: string | null;
  instagramUrl?: string | null;
  isFallback?: boolean;
  category?: string | null;
  upvotes?: number;
  downvotes?: number;
  comments?: number;
  score?: number;
  monthlyRevenue?: string | null;
};

export type ApiPitch = {
  pitch_id: string;
  startup_id: string | null;
  startup_name: string | null;
  one_liner: string | null;
  category: string | null;
  poster_url: string | null;
  founder_photo_url?: string | null;
  in_count?: number;
  out_count?: number;
  comment_count?: number;
  score?: number;
  video_url?: string | null;
  video_hls_url?: string | null;
  video_mp4_url?: string | null;
  instagram_url?: string | null;
  monthly_revenue?: string | null;
};

export type FeedResponsePayload = {
  data?: ApiPitch[];
};

export const HOMEPAGE_VIDEO_FETCH_LIMIT = 48;

const asNumber = (value: unknown) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const buildHomepageFeedUrl = (limit = HOMEPAGE_VIDEO_FETCH_LIMIT) =>
  `/api/pitches?mode=feed&tab=trending&limit=${limit}&offset=0&shuffle=false`;

export const dedupeHomepagePitches = (items: HomepagePitch[]) => {
  const seen = new Set<string>();
  const deduped: HomepagePitch[] = [];

  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    deduped.push(item);
  }

  return deduped;
};

export const hasPlayableUpload = (item: HomepagePitch) =>
  Boolean(item.video || item.videoHlsUrl || item.videoMp4Url || item.instagramUrl);

export const hasDirectPlayableUpload = (item: HomepagePitch) =>
  Boolean(item.video || item.videoHlsUrl || item.videoMp4Url);

export const mapHomepagePitch = (item: ApiPitch, index: number): HomepagePitch => {
  const fallbackPoster = `/pitches/pitch-0${(index % 4) + 1}.svg?v=2`;
  return {
    id: item.pitch_id ?? `pitch-${index + 1}`,
    startupId: item.startup_id ?? null,
    name: item.startup_name ?? "Startup",
    tagline: item.one_liner ?? item.category ?? "New video",
    poster: item.poster_url ?? item.founder_photo_url ?? fallbackPoster,
    video: item.video_mp4_url ?? item.video_url ?? item.video_hls_url ?? null,
    videoHlsUrl: item.video_hls_url ?? null,
    videoMp4Url: item.video_mp4_url ?? item.video_url ?? null,
    instagramUrl: item.instagram_url ?? null,
    category: item.category ?? null,
    upvotes: asNumber(item.in_count),
    downvotes: asNumber(item.out_count),
    comments: asNumber(item.comment_count),
    score: asNumber(item.score),
    monthlyRevenue: item.monthly_revenue ?? null,
    isFallback: false,
  };
};

export const toPlayableHomepagePitches = (items: ApiPitch[]) =>
  dedupeHomepagePitches(items.map(mapHomepagePitch).filter(hasPlayableUpload));

export const selectFeaturedHomepagePitch = (items: HomepagePitch[]) =>
  items[0] ?? null;

export const getHomepageRailPitches = (items: HomepagePitch[], featuredPitchId: string | null) => {
  if (items.length <= 1) return [];
  if (!featuredPitchId) return items.slice(1);

  const remaining = items.filter((item) => item.id !== featuredPitchId);
  return remaining.length ? remaining : items.slice(1);
};
