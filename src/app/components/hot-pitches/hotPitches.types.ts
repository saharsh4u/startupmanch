export type HotPitch = {
  id: string;
  title: string;
  image_url: string;
  score: number | null;
  category: string | null;
  stage: string | null;
  created_at: string;
  slug: string;
};

export type HotPitchesCarouselProps = {
  pitches: HotPitch[];
};

export type PitchCardProps = {
  pitch: HotPitch;
  isActive: boolean;
  distanceFromActive: number;
};
