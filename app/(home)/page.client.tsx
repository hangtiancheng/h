"use client";

import { type RefObject, useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import dynamic from "next/dynamic";

// WebGL shaders are browser-only, so they must never be server-rendered
const GrainGradient = dynamic(
  () => import("@paper-design/shaders-react").then((mod) => mod.GrainGradient),
  { ssr: false },
);

const Dithering = dynamic(
  () => import("@paper-design/shaders-react").then((mod) => mod.Dithering),
  { ssr: false },
);

/**
 * Animated hero background: a grainy sage gradient plus a dithered sphere,
 * mirroring the fumadocs.dev landing page.
 */
export function Hero() {
  const { resolvedTheme } = useTheme();
  const ref = useRef<HTMLDivElement | null>(null);
  const visible = useIsVisible(ref);
  const [showShaders, setShowShaders] = useState(false);

  useEffect(() => {
    // apply some delay, otherwise on slower devices it errors with uniform
    // images not being fully loaded (same workaround as fumadocs.dev)
    const timer = setTimeout(() => {
      setShowShaders(true);
    }, 400);

    return () => clearTimeout(timer);
  }, []);

  return (
    <div ref={ref} className="absolute inset-0">
      {showShaders && (
        <GrainGradient
          className="absolute inset-0 animate-fd-fade-in duration-800"
          colors={
            resolvedTheme === "dark"
              ? ["#3c5230", "#202c18", "#1a241200"]
              : ["#dce7cd", "#a8bc96", "#5c6e4a20"]
          }
          colorBack="#00000000"
          softness={1}
          intensity={0.9}
          noise={0.5}
          // pause the animation while the hero is off-screen
          speed={visible ? 1 : 0}
          shape="corners"
          minPixelRatio={1}
          maxPixelCount={1920 * 1080}
        />
      )}
      {showShaders && (
        <Dithering
          width={720}
          height={720}
          colorBack="#00000000"
          colorFront={resolvedTheme === "dark" ? "#a8bc96" : "#849a72"}
          shape="sphere"
          type="4x4"
          scale={0.5}
          size={3}
          speed={0}
          frame={5000 * 120}
          className="absolute animate-fd-fade-in duration-400 max-lg:bottom-[-50%] max-lg:-left-50 lg:top-[-5%] lg:right-0"
          minPixelRatio={1}
        />
      )}
    </div>
  );
}

let observer: IntersectionObserver;
const observerTargets = new WeakMap<
  Element,
  (entry: IntersectionObserverEntry) => void
>();

/** Tracks whether the element is currently visible in the viewport. */
export function useIsVisible(ref: RefObject<HTMLElement | null>) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // a single shared observer for all targets, as in fumadocs.dev
    observer ??= new IntersectionObserver((entries) => {
      for (const entry of entries) {
        observerTargets.get(entry.target)?.(entry);
      }
    });

    const element = ref.current;
    if (!element) return;
    observerTargets.set(element, (entry) => {
      setVisible(entry.isIntersecting);
    });
    observer.observe(element);

    return () => {
      observer.unobserve(element);
      observerTargets.delete(element);
    };
  }, [ref]);

  return visible;
}
