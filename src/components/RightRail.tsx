import { railCards } from "@/data/right-rail";

export default function RightRail() {
  return (
    <aside className="right-rail">
      <h3>Grow your startup</h3>
      <div className="rail-list">
        {railCards.map((card) => (
          <div key={card.name} className="rail-card" style={{ background: card.accent }}>
            <div className="rail-badge">{card.label}</div>
            <div>
              <h4>{card.name}</h4>
              <p>{card.description}</p>
            </div>
          </div>
        ))}
        <div className="rail-card advertise">
          <div>
            <h4>Advertise</h4>
            <p>2/20 spots left</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
