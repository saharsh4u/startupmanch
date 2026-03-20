export type RoundtableSessionStatus = "lobby" | "live" | "ended" | "cancelled";
export type RoundtableTurnStatus = "queued" | "active" | "submitted" | "expired" | "skipped";
export type RoundtableMemberState = "joined" | "left" | "kicked";
export type RoundtableSessionVisibility = "public" | "private";

export type RoundtableTopicRow = {
  id: string;
  title: string;
  description: string | null;
  tags: string[] | null;
  created_by_profile_id: string | null;
  created_by_guest_id: string | null;
  created_at: string;
};

export type RoundtableSessionRow = {
  id: string;
  topic_id: string;
  status: RoundtableSessionStatus;
  visibility?: RoundtableSessionVisibility | null;
  max_seats: number;
  turn_duration_sec: number;
  created_by_profile_id: string | null;
  created_by_guest_id: string | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
};

export type RoundtableMemberRow = {
  id: string;
  session_id: string;
  seat_no: number;
  profile_id: string | null;
  guest_id: string | null;
  display_name: string;
  camera_state: "off" | "live";
  state: RoundtableMemberState;
  joined_at: string;
  last_seen_at?: string | null;
  left_at: string | null;
};

export type RoundtableRaiseHandRow = {
  id: string;
  session_id: string;
  member_id: string;
  status: "queued" | "resolved" | "cancelled";
  queued_at: string;
  resolved_at: string | null;
};

export type RoundtableTurnRow = {
  id: string;
  session_id: string;
  member_id: string;
  status: RoundtableTurnStatus;
  body: string | null;
  starts_at: string | null;
  ends_at: string | null;
  submitted_at: string | null;
  auto_submitted: boolean;
  hidden_for_abuse: boolean;
  created_at: string;
  updated_at: string;
};

export type RoundtableScoreRow = {
  session_id: string;
  member_id: string;
  points: number;
  approved_turns: number;
  upvotes_received: number;
  useful_marks: number;
  violations: number;
  updated_at: string;
};

export type RoundtableSessionSummary = {
  session_id: string;
  topic_id: string;
  topic_title: string;
  topic_description: string | null;
  tags: string[];
  visibility: RoundtableSessionVisibility;
  status: RoundtableSessionStatus;
  turn_duration_sec: number;
  max_seats: number;
  seats_taken: number;
  created_at: string;
};

export type RoundtableLeaderboardEntry = {
  member_id: string;
  display_name: string;
  points: number;
  approved_turns: number;
  upvotes_received: number;
  useful_marks: number;
};

export type RoundtableSessionSnapshot = {
  viewer_member_id: string | null;
  viewer_reconnect_seat_no: number | null;
  viewer_can_manage_members: boolean;
  session: RoundtableSessionSummary;
  topic: {
    id: string;
    title: string;
    description: string | null;
    tags: string[];
  };
  members: RoundtableMemberRow[];
  reserved_seat_nos: number[];
  queue: Array<RoundtableTurnRow & { member_display_name: string }>;
  active_turn: (RoundtableTurnRow & { member_display_name: string }) | null;
  recent_turns: Array<RoundtableTurnRow & { member_display_name: string }>;
  scores: Array<RoundtableScoreRow & { member_display_name: string }>;
};

export type RoundtableActor = {
  profileId: string | null;
  guestId: string | null;
  displayName: string | null;
};

export type RoundtableLobbyResponse = {
  sessions: RoundtableSessionSummary[];
  leaderboard: RoundtableLeaderboardEntry[];
};

export type RoundtableInviteContext = {
  source: "invite" | null;
  preferred_seat_no: number | null;
  inviter_member_id: string | null;
  invite_token: string | null;
};

export type JoinAnyResponse = {
  ok?: boolean;
  error?: string;
  code?: string;
  session_id?: string | null;
  member_id?: string;
  seat_no?: number;
};
