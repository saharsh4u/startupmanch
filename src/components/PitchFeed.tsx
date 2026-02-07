import PitchVideoCard from "@/components/PitchVideoCard";
import { pitches } from "@/data/pitches";

export default function PitchFeed() {
  return (
    <section className="pitch-section">
      <div className="pitch-header">
        <h3>Pitch of the Week</h3>
        <span className="pitch-link">Open story</span>
      </div>
      <div className="pitch-grid">
        {pitches.slice(0, 3).map((pitch) => (
          <PitchVideoCard key={pitch.id} pitch={pitch} />
        ))}
      </div>
    </section>
  );
}
