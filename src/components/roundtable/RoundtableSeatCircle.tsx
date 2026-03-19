import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

export type RoundtableSeatViewModel = {
  seatNo: number;
  memberId: string | null;
  displayName: string;
  avatarLabel: string;
  isActive: boolean;
  isQueued: boolean;
  isMe: boolean;
  isEmpty: boolean;
  isCameraLive: boolean;
  stateLabel: string;
  canShareInvite?: boolean;
  canToggleCamera?: boolean;
  shareStatus?: string | null;
};

type RoundtableSeatCircleProps = {
  seats: RoundtableSeatViewModel[];
  flareToken: string | null;
  eyeTargetSeatNo: number | null;
  cameraMenuSeatNo?: number | null;
  cameraBusyState?: "off" | "live" | null;
  localVideoStream?: MediaStream | null;
  remoteVideoStreams?: Record<string, MediaStream>;
  onShareSeat?: (seatNo: number) => void;
  onToggleCameraMenu?: (seatNo: number | null) => void;
  onToggleLiveCamera?: (nextState: "off" | "live") => void;
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

const hasUsableVideoTrack = (stream: MediaStream | null | undefined) =>
  Boolean(stream?.getVideoTracks().some((track) => track.readyState !== "ended"));

function RoundtableSeatVideo({
  stream,
  mirrored = false,
}: {
  stream: MediaStream;
  mirrored?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (video.srcObject !== stream) {
      video.srcObject = stream;
    }

    const play = () => {
      void video.play().catch(() => {
        // Mobile browsers can defer autoplay until the next allowed repaint.
      });
    };

    if (video.readyState >= 1) {
      play();
      return;
    }

    const handleLoadedMetadata = () => {
      play();
    };

    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    return () => {
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      if (video.srcObject === stream) {
        video.srcObject = null;
      }
    };
  }, [stream]);

  return (
    <video
      ref={videoRef}
      className={`roundtable-seat-video${mirrored ? " is-mirrored" : ""}`}
      autoPlay
      muted
      playsInline
    />
  );
}

export default function RoundtableSeatCircle({
  seats,
  flareToken,
  eyeTargetSeatNo,
  cameraMenuSeatNo = null,
  cameraBusyState = null,
  localVideoStream = null,
  remoteVideoStreams = {},
  onShareSeat,
  onToggleCameraMenu,
  onToggleLiveCamera,
}: RoundtableSeatCircleProps) {
  const seatCount = Math.max(1, seats.length);
  const [pointerEyeVector, setPointerEyeVector] = useState<{ x: number; y: number } | null>(null);
  const sectionRef = useRef<HTMLElement | null>(null);
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

    const handlePointerTouch = (event: PointerEvent) => {
      if (event.pointerType !== "touch") return;
      setEyeFromClientPoint(event.clientX, event.clientY);
    };

    const clearVector = () => {
      setPointerEyeVector(null);
    };

    window.addEventListener("touchmove", handleTouchMove, { passive: true });
    window.addEventListener("pointermove", handlePointerTouch, { passive: true });
    window.addEventListener("pointerdown", handlePointerTouch, { passive: true });
    window.addEventListener("touchend", clearVector, { passive: true });
    window.addEventListener("touchcancel", clearVector, { passive: true });
    window.addEventListener("pointerup", clearVector, { passive: true });
    window.addEventListener("pointercancel", clearVector, { passive: true });

    return () => {
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("pointermove", handlePointerTouch);
      window.removeEventListener("pointerdown", handlePointerTouch);
      window.removeEventListener("touchend", clearVector);
      window.removeEventListener("touchcancel", clearVector);
      window.removeEventListener("pointerup", clearVector);
      window.removeEventListener("pointercancel", clearVector);
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

  useEffect(() => {
    if (!cameraMenuSeatNo) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (sectionRef.current?.contains(target)) return;
      onToggleCameraMenu?.(null);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onToggleCameraMenu?.(null);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [cameraMenuSeatNo, onToggleCameraMenu]);

  return (
    <section
      ref={sectionRef}
      className="roundtable-seat-circle roundtable-roulette-shell"
      aria-label="Roulette roundtable seats"
    >
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
            const position = seatPolar(seat.seatNo, seatCount, 43);
            const seatVideoStream = seat.isMe
              ? localVideoStream
              : seat.memberId
                ? remoteVideoStreams[seat.memberId] ?? null
                : null;
            const showsLiveVideo = hasUsableVideoTrack(seatVideoStream);
            const isCameraMenuOpen = cameraMenuSeatNo === seat.seatNo;
            const cameraActionLabel = seat.isCameraLive
              ? cameraBusyState === "off"
                ? "Stopping..."
                : "Stop live camera"
              : cameraBusyState === "live"
                ? "Starting..."
                : "Start live camera";
            const tokenClassName = [
              "roundtable-seat-token",
              seat.isActive ? "is-active" : "",
              seat.isQueued ? "is-queued" : "",
              seat.isMe ? "is-me" : "",
              seat.isEmpty ? "is-empty" : "",
              showsLiveVideo ? "has-video" : "",
            ]
              .filter(Boolean)
              .join(" ");
            const descriptor = [
              `${seat.displayName}.`,
              `Seat ${seat.seatNo}.`,
              `${seat.stateLabel}.`,
              showsLiveVideo ? "Live camera on." : "",
            ]
              .filter(Boolean)
              .join(" ");

            return (
              <article
                key={`token-${seat.seatNo}`}
                className={tokenClassName}
                role="group"
                aria-label={descriptor}
                title={descriptor.replaceAll(". ", " · ").replace(/\.$/, "")}
                style={
                  {
                    left: `${position.x}%`,
                    top: `${position.y}%`,
                    "--rt-seat-angle": `${position.angle}deg`,
                  } as CSSProperties
                }
              >
                {seat.canShareInvite ? (
                  <button
                    type="button"
                    className="roundtable-seat-avatar roundtable-seat-avatar-button"
                    onClick={() => onShareSeat?.(seat.seatNo)}
                    aria-label={`Share invite link for seat ${seat.seatNo}`}
                    title={`Share invite link for seat ${seat.seatNo}`}
                  >
                    {seat.avatarLabel || "?"}
                  </button>
                ) : (
                  <span className="roundtable-seat-avatar" aria-hidden>
                    {showsLiveVideo && seatVideoStream ? (
                      <RoundtableSeatVideo stream={seatVideoStream} mirrored={seat.isMe} />
                    ) : (
                      seat.avatarLabel || "?"
                    )}
                  </span>
                )}
                {seat.canToggleCamera ? (
                  <div className="roundtable-seat-media-anchor">
                    <button
                      type="button"
                      className={`roundtable-seat-plus${isCameraMenuOpen ? " is-open" : ""}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        onToggleCameraMenu?.(isCameraMenuOpen ? null : seat.seatNo);
                      }}
                      aria-label={isCameraMenuOpen ? "Close seat camera menu" : "Open seat camera menu"}
                      aria-expanded={isCameraMenuOpen}
                    >
                      +
                    </button>
                    {isCameraMenuOpen ? (
                      <div className="roundtable-seat-media-menu" role="menu" aria-label="Seat camera options">
                        <button
                          type="button"
                          className="roundtable-seat-media-action"
                          role="menuitem"
                          disabled={cameraBusyState !== null}
                          onClick={(event) => {
                            event.stopPropagation();
                            onToggleLiveCamera?.(seat.isCameraLive ? "off" : "live");
                          }}
                        >
                          {cameraActionLabel}
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {seat.shareStatus ? (
                  <span className="roundtable-seat-feedback" aria-live="polite">
                    {seat.shareStatus}
                  </span>
                ) : null}
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
