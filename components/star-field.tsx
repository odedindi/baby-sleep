"use client";

import { useEffect, useState } from "react";

interface Star {
  top: string;
  left: string;
  size: number;
  delay: string;
  duration: string;
}

export function StarField() {
  // Generate stars on the client only — random values must not be rendered on
  // the server or they cause a hydration mismatch.
  const [stars, setStars] = useState<Star[]>([]);

  useEffect(() => {
    const count = 70;
    setStars(
      Array.from({ length: count }, () => ({
        top: `${Math.random() * 100}%`,
        left: `${Math.random() * 100}%`,
        size: Math.random() * 2 + 1,
        delay: `${Math.random() * 6}s`,
        duration: `${3 + Math.random() * 4}s`,
      })),
    );
  }, []);

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden">
      {/* deep vignette glow */}
      <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_-10%,oklch(0.28_0.07_265)_0%,transparent_60%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(80%_60%_at_50%_110%,oklch(0.24_0.06_250)_0%,transparent_55%)]" />

      {/* glowing moon */}
      <div className="absolute right-[6%] top-[2%] animate-breathe sm:right-[10%]">
        <div className="h-14 w-14 rounded-full bg-primary/90 shadow-[0_0_60px_20px_oklch(0.83_0.12_85_/_0.3)] sm:h-20 sm:w-20" />
      </div>

      {/* stars */}
      {stars.map((s, i) => (
        <span
          key={i}
          data-twinkle
          className="absolute rounded-full bg-foreground"
          style={{
            top: s.top,
            left: s.left,
            width: s.size,
            height: s.size,
            animation: `twinkle ${s.duration} ease-in-out infinite`,
            animationDelay: s.delay,
          }}
        />
      ))}
    </div>
  );
}
