import PitchVideoCard from "@/components/PitchVideoCard";
import { pitches } from "@/data/pitches";

export default function PitchFeed() {
  return (
    <section className="pitch-section">
      <div className="pitch-header">
        <div>
          <h3>Pitch of the Week</h3>
          <span>60s hook</span>
        </div>
        <span className="pitch-link">View all</span>
      </div>
      <div className="pitch-grid">
        {pitches.slice(0, 2).map((pitch) => (
          <PitchVideoCard key={pitch.id} pitch={pitch} />
        ))}
      </div>
    </section>
  );
}
