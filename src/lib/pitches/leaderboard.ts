export const PITCH_OPEN_EVENT_TYPE = "pitch_open";
export const ROUNDTABLE_VIDEO_RAIL_SOURCE = "roundtable_video_rail";

export type VideoLeaderboardEntry = {
  rank: number;
  pitch_id: string;
  startup_id: string | null;
  startup_name: string;
  tagline: string | null;
  poster_url: string | null;
  open_count: number;
};

export type VideoLeaderboardResponse = {
  window: "all_time";
  metric: "opens";
  data: VideoLeaderboardEntry[];
};
