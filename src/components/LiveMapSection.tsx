export default function LiveMapSection() {
  return (
    <section className="section-card live-map">
      <div className="live-map-card">
        <div className="live-map-header">
          <span className="live-dot" />
          <span>Live activity</span>
          <span className="live-value">87 online</span>
        </div>
        <div className="live-map-body">
          <div className="live-globe" />
          <div className="live-ping ping-one" />
          <div className="live-ping ping-two" />
          <div className="live-ping ping-three" />
        </div>
      </div>
    </section>
  );
}
