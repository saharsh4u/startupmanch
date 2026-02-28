import type { CSSProperties } from "react";
import type { RoundtableSessionStatus } from "@/lib/roundtable/types";

export type RoundtableSeatViewModel = {
  seatNo: number;
  memberId: string | null;
  displayName: string;
  initials: string;
  isActive: boolean;
  isQueued: boolean;
  isMe: boolean;
  isEmpty: boolean;
  stateLabel: string;
};

type RoundtableSeatCircleProps = {
  seats: RoundtableSeatViewModel[];
  focusSeatNo: number;
  topicTitle: string;
  sessionStatus: RoundtableSessionStatus;
  flareToken: string | null;
};

const seatPolar = (seatNo: number, seatCount: number, radiusPercent: number) => {
  const angle = -90 + ((seatNo - 1) * 360) / seatCount;
  const rad = (angle * Math.PI) / 180;
  return {
    angle,
    x: 50 + Math.cos(rad) * radiusPercent,
    y: 50 + Math.sin(rad) * radiusPercent,
  };
};

export default function RoundtableSeatCircle({
  seats,
  focusSeatNo,
  topicTitle,
  sessionStatus,
  flareToken,
}: RoundtableSeatCircleProps) {
  const seatCount = Math.max(1, seats.length);
  const focusRotation = ((focusSeatNo - 1) * 360) / seatCount;

  return (
    <section className="roundtable-seat-circle roundtable-roulette-shell" aria-label="Roulette roundtable seats">
      <div className="roundtable-roulette">
        <div key={flareToken ?? "none"} className="roundtable-roulette-glow" aria-hidden />

        <div
          className="roundtable-roulette-wheel"
          style={{ "--rt-focus-rotation": `${focusRotation}deg` } as CSSProperties}
        >
          <div className="roundtable-roulette-wheel-ambient">
            <div className="roundtable-roulette-slices" aria-hidden>
              {seats.map((seat, index) => {
                const sliceClassName = [
                  "roundtable-roulette-slice",
                  seat.isActive ? "is-active" : "",
                  seat.isQueued ? "is-queued" : "",
                  seat.isEmpty ? "is-empty" : "",
                ]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <div
                    key={`slice-${seat.seatNo}`}
                    className={sliceClassName}
                    style={{ "--rt-slice-index": index } as CSSProperties}
                  />
                );
              })}
            </div>
          </div>
          <div className="roundtable-roulette-hub">
            <p className="roundtable-kicker">Roulette room</p>
            <strong>{topicTitle}</strong>
            <span className="roundtable-roulette-status">{sessionStatus.toUpperCase()}</span>
          </div>
        </div>

        <div className="roundtable-seat-token-ring">
          {seats.map((seat) => {
            const position = seatPolar(seat.seatNo, seatCount, 44);
            const tokenClassName = [
              "roundtable-seat-token",
              seat.isActive ? "is-active" : "",
              seat.isQueued ? "is-queued" : "",
              seat.isMe ? "is-me" : "",
              seat.isEmpty ? "is-empty" : "",
            ]
              .filter(Boolean)
              .join(" ");

            return (
              <article
                key={`token-${seat.seatNo}`}
                className={tokenClassName}
                style={
                  {
                    left: `${position.x}%`,
                    top: `${position.y}%`,
                    "--rt-seat-angle": `${position.angle}deg`,
                  } as CSSProperties
                }
              >
                <span className="roundtable-seat-avatar" aria-hidden>{seat.initials || "?"}</span>
                <div className="roundtable-seat-copy">
                  <span className="roundtable-seat-name">{seat.displayName}</span>
                  <span className="roundtable-seat-state">Seat {seat.seatNo} · {seat.stateLabel}</span>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
