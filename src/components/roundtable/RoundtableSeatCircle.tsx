import type { CSSProperties } from "react";

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
  flareToken: string | null;
  eyeTargetSeatNo: number | null;
  activeSpeech: {
    seatNo: number;
    text: string;
  } | null;
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
  flareToken,
  eyeTargetSeatNo,
  activeSpeech,
}: RoundtableSeatCircleProps) {
  const seatCount = Math.max(1, seats.length);
  const speechPosition = activeSpeech ? seatPolar(activeSpeech.seatNo, seatCount, 26) : null;
  const eyeVector = (() => {
    if (!eyeTargetSeatNo) {
      return { x: 0, y: 0 };
    }
    const angle = -90 + ((eyeTargetSeatNo - 1) * 360) / seatCount;
    const rad = (angle * Math.PI) / 180;
    return {
      x: Math.cos(rad) * 16,
      y: Math.sin(rad) * 16,
    };
  })();

  return (
    <section className="roundtable-seat-circle roundtable-roulette-shell" aria-label="Roulette roundtable seats">
      <div className="roundtable-roulette">
        <div key={flareToken ?? "none"} className="roundtable-roulette-glow" aria-hidden />

        <div className="roundtable-roulette-wheel">
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
            {activeSpeech?.text ? (
              <div className="roundtable-slice-speech-layer" aria-live="polite">
                <p
                  className="roundtable-slice-speech"
                  style={
                    {
                      left: `${speechPosition?.x ?? 50}%`,
                      top: `${speechPosition?.y ?? 50}%`,
                    } as CSSProperties
                  }
                >
                  {activeSpeech.text}
                </p>
              </div>
            ) : null}
          </div>
          <div className="roundtable-roulette-hub">
            <div
              className={`roundtable-eye-mascot ${eyeTargetSeatNo ? "is-watching" : "is-idle"}`}
              style={
                {
                  "--rt-eye-x": `${eyeVector.x}px`,
                  "--rt-eye-y": `${eyeVector.y}px`,
                } as CSSProperties
              }
              aria-hidden
            >
              <span className="roundtable-eye-ball">
                <span className="roundtable-eye-pupil" />
              </span>
              <span className="roundtable-eye-ball">
                <span className="roundtable-eye-pupil" />
              </span>
            </div>
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
