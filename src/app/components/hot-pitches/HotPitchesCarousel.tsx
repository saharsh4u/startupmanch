"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import PitchCard from "./PitchCard";
import type { HotPitchesCarouselProps } from "./hotPitches.types";

const DRAG_INTENT_PX = 6;
const CLICK_SUPPRESS_MS = 200;

const clampIndex = (value: number, length: number) => {
  if (length <= 0) return 0;
  return Math.min(length - 1, Math.max(0, value));
};

const nearestIndex = (viewport: HTMLDivElement, cards: Array<HTMLLIElement | null>) => {
  const viewportCenter = viewport.scrollLeft + viewport.clientWidth / 2;
  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;

  cards.forEach((card, index) => {
    if (!card) return;
    const cardCenter = card.offsetLeft + card.clientWidth / 2;
    const distance = Math.abs(cardCenter - viewportCenter);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });

  return bestIndex;
};

export default function HotPitchesCarousel({ pitches }: HotPitchesCarouselProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef<Array<HTMLLIElement | null>>([]);
  const rafRef = useRef<number | null>(null);
  const clickSuppressedUntilRef = useRef(0);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startScrollLeft: number;
    moved: boolean;
  } | null>(null);

  const [activeIndex, setActiveIndex] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isReducedMotion, setIsReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const applyValue = () => setIsReducedMotion(mediaQuery.matches);
    applyValue();
    mediaQuery.addEventListener("change", applyValue);
    return () => mediaQuery.removeEventListener("change", applyValue);
  }, []);

  const scrollToIndex = useCallback(
    (nextIndex: number, forceBehavior?: ScrollBehavior) => {
      const viewport = viewportRef.current;
      const card = cardRefs.current[nextIndex];
      if (!viewport || !card) return;

      const nextLeft = card.offsetLeft - (viewport.clientWidth - card.clientWidth) / 2;
      viewport.scrollTo({
        left: Math.max(0, nextLeft),
        behavior: forceBehavior ?? (isReducedMotion ? "auto" : "smooth"),
      });
      setActiveIndex(nextIndex);
    },
    [isReducedMotion]
  );

  const syncActiveFromScroll = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    if (rafRef.current) window.cancelAnimationFrame(rafRef.current);
    rafRef.current = window.requestAnimationFrame(() => {
      const index = nearestIndex(viewport, cardRefs.current);
      setActiveIndex((previous) => (previous === index ? previous : index));
    });
  }, []);

  useEffect(() => {
    cardRefs.current = cardRefs.current.slice(0, pitches.length);
    setActiveIndex(0);
    scrollToIndex(0, "auto");
  }, [pitches.length, scrollToIndex]);

  useEffect(() => {
    return () => {
      if (rafRef.current) window.cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const snapToClosest = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const index = nearestIndex(viewport, cardRefs.current);
    scrollToIndex(index);
  }, [scrollToIndex]);

  const moveBy = useCallback(
    (delta: number) => {
      const nextIndex = clampIndex(activeIndex + delta, pitches.length);
      scrollToIndex(nextIndex);
    },
    [activeIndex, pitches.length, scrollToIndex]
  );

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        moveBy(-1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        moveBy(1);
      }
    },
    [moveBy]
  );

  const onPointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse") return;
    if (event.button !== 0) return;

    const viewport = viewportRef.current;
    if (!viewport) return;

    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startScrollLeft: viewport.scrollLeft,
      moved: false,
    };
    setIsDragging(true);
    viewport.setPointerCapture(event.pointerId);
  }, []);

  const onPointerMove = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const viewport = viewportRef.current;
    if (!drag || !viewport) return;
    if (event.pointerId !== drag.pointerId) return;

    const deltaX = event.clientX - drag.startX;
    if (!drag.moved && Math.abs(deltaX) > DRAG_INTENT_PX) {
      drag.moved = true;
    }

    viewport.scrollLeft = drag.startScrollLeft - deltaX;
    syncActiveFromScroll();
  }, [syncActiveFromScroll]);

  const endPointerDrag = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const viewport = viewportRef.current;
    if (!drag || !viewport) return;
    if (event.pointerId !== drag.pointerId) return;

    if (viewport.hasPointerCapture(event.pointerId)) {
      viewport.releasePointerCapture(event.pointerId);
    }

    if (drag.moved) {
      clickSuppressedUntilRef.current = Date.now() + CLICK_SUPPRESS_MS;
    }

    dragRef.current = null;
    setIsDragging(false);
    snapToClosest();
  }, [snapToClosest]);

  const cardItems = useMemo(
    () =>
      pitches.map((pitch, index) => {
        const distance = Math.abs(index - activeIndex);
        const distanceClassName = distance === 0 ? "is-active" : distance === 1 ? "is-near" : "is-far";

        return (
          <li
            key={pitch.id}
            className={`hot-pitches-item ${distanceClassName}`}
            ref={(node) => {
              cardRefs.current[index] = node;
            }}
          >
            <PitchCard pitch={pitch} isActive={index === activeIndex} distanceFromActive={distance} />
          </li>
        );
      }),
    [activeIndex, pitches]
  );

  const hasMultipleCards = pitches.length > 1;

  return (
    <div className="hot-pitches-carousel-shell">
      <button
        type="button"
        className="hot-pitches-arrow hot-pitches-arrow-left"
        aria-label="Previous hot pitch"
        onClick={() => moveBy(-1)}
        disabled={!hasMultipleCards || activeIndex <= 0}
      >
        ‹
      </button>
      <div
        ref={viewportRef}
        className={`hot-pitches-viewport ${isDragging ? "is-dragging" : ""}`}
        tabIndex={0}
        role="region"
        aria-label="Hot pitches carousel"
        onKeyDown={onKeyDown}
        onScroll={syncActiveFromScroll}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointerDrag}
        onPointerCancel={endPointerDrag}
        onClickCapture={(event) => {
          if (Date.now() < clickSuppressedUntilRef.current) {
            event.preventDefault();
            event.stopPropagation();
          }
        }}
      >
        <ul className="hot-pitches-track">{cardItems}</ul>
      </div>
      <button
        type="button"
        className="hot-pitches-arrow hot-pitches-arrow-right"
        aria-label="Next hot pitch"
        onClick={() => moveBy(1)}
        disabled={!hasMultipleCards || activeIndex >= pitches.length - 1}
      >
        ›
      </button>
    </div>
  );
}
