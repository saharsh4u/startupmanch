export default function Timeline() {
  return (
    <div className="timeline">
      <button className="timeline-play" type="button" aria-label="Pause updates">
        II
      </button>
      <span className="timeline-label">Now</span>
      <input
        className="timeline-slider"
        type="range"
        min={0}
        max={100}
        defaultValue={72}
        aria-label="Timeline"
        disabled
      />
    </div>
  );
}
