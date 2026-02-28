import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

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
  activeSpeakerSeatNo: number | null;
  canToggleMyMic: boolean;
  isMyMicMuted: boolean;
  onToggleMyMic: () => void;
};

const seatPolar = (seatNo: number, seatCount: number, radiusPercent: number) => {
  const angle = -90 + 180 / seatCount + ((seatNo - 1) * 360) / seatCount;
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
  activeSpeakerSeatNo,
  canToggleMyMic,
  isMyMicMuted,
  onToggleMyMic,
}: RoundtableSeatCircleProps) {
  const seatCount = Math.max(1, seats.length);
  const [pointerEyeVector, setPointerEyeVector] = useState<{ x: number; y: number } | null>(null);
  const rouletteRef = useRef<HTMLDivElement | null>(null);

  const setEyeFromClientPoint = useCallback((clientX: number, clientY: number) => {
    const clamp = (value: number) => Math.max(-1, Math.min(1, value));
    const rect = rouletteRef.current?.getBoundingClientRect();
    const cx = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
    const cy = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;
    const halfW = rect ? rect.width / 2 || 1 : window.innerWidth / 2 || 1;
    const halfH = rect ? rect.height / 2 || 1 : window.innerHeight / 2 || 1;
    const dx = (clientX - cx) / halfW;
    const dy = (clientY - cy) / halfH;

    setPointerEyeVector({
      x: clamp(dx) * 18,
      y: clamp(dy) * 18,
    });
  }, []);

  useEffect(() => {
    const handleTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch) return;
      setEyeFromClientPoint(touch.clientX, touch.clientY);
    };

    const clearVector = () => {
      setPointerEyeVector(null);
    };

    window.addEventListener("touchmove", handleTouchMove, { passive: true });
    window.addEventListener("touchend", clearVector, { passive: true });
    window.addEventListener("touchcancel", clearVector, { passive: true });

    return () => {
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", clearVector);
      window.removeEventListener("touchcancel", clearVector);
    };
  }, [setEyeFromClientPoint]);

  const fallbackEyeVector = useMemo(() => {
    if (!eyeTargetSeatNo) {
      return { x: 0, y: 0 };
    }
    const angle = -90 + 180 / seatCount + ((eyeTargetSeatNo - 1) * 360) / seatCount;
    const rad = (angle * Math.PI) / 180;
    return {
      x: Math.cos(rad) * 16,
      y: Math.sin(rad) * 16,
    };
  }, [eyeTargetSeatNo, seatCount]);

  const eyeVector = pointerEyeVector ?? fallbackEyeVector;

  return (
    <section className="roundtable-seat-circle roundtable-roulette-shell" aria-label="Roulette roundtable seats">
      <div
        ref={rouletteRef}
        className="roundtable-roulette"
        onPointerMove={(event) => {
          setEyeFromClientPoint(event.clientX, event.clientY);
        }}
        onTouchStart={(event) => {
          const touch = event.touches[0];
          if (!touch) return;
          setEyeFromClientPoint(touch.clientX, touch.clientY);
        }}
        onTouchMove={(event) => {
          const touch = event.touches[0];
          if (!touch) return;
          setEyeFromClientPoint(touch.clientX, touch.clientY);
        }}
        onTouchEnd={() => setPointerEyeVector(null)}
        onTouchCancel={() => setPointerEyeVector(null)}
        onPointerLeave={() => setPointerEyeVector(null)}
      >
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
                <button
                  type="button"
                  className={`roundtable-seat-mic ${seat.seatNo === activeSpeakerSeatNo && !(seat.isMe ? isMyMicMuted : false) ? "is-live" : "is-muted"}`}
                  onClick={() => {
                    if (seat.isMe && canToggleMyMic) {
                      onToggleMyMic();
                    }
                  }}
                  disabled={!(seat.isMe && canToggleMyMic)}
                  aria-label={
                    seat.isMe && canToggleMyMic
                      ? isMyMicMuted
                        ? "Unmute microphone"
                        : "Mute microphone"
                      : "Microphone status"
                  }
                  title={
                    seat.isMe && canToggleMyMic
                      ? isMyMicMuted
                        ? "Unmute mic"
                        : "Mute mic"
                      : seat.seatNo === activeSpeakerSeatNo
                        ? "Speaking"
                        : "Muted"
                  }
                >
                  {seat.seatNo === activeSpeakerSeatNo && !(seat.isMe ? isMyMicMuted : false) ? "MIC" : "MUTE"}
                </button>
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
