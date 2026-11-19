/* eslint-disable react/prop-types */
import { useMemo } from "react";
import { VIBE_PARTICLES } from "../config/personalization";

// Soft ambient layer behind the messages: a vibe-tinted glow plus a few drifting emojis.
// Purely decorative (aria-hidden, no pointer events) and frozen for reduced-motion users via CSS.
const VibeEffects = ({ vibe, particles = true }) => {
  const glyphs = VIBE_PARTICLES[vibe];
  const items = useMemo(() => {
    if (!glyphs) return [];
    return Array.from({ length: 9 }, (_, index) => ({
      id: index,
      glyph: glyphs[index % glyphs.length],
      left: `${(index * 37 + 7) % 96}%`,
      delay: `${-((index * 2.3) % 14)}s`,
      duration: `${14 + ((index * 3) % 9)}s`,
      size: `${14 + ((index * 5) % 12)}px`,
    }));
  }, [glyphs]);

  if (!vibe || vibe === "neutral") return null;

  return (
    <div className={`vl-vibe-layer vibe-${vibe}`} aria-hidden="true">
      {particles && items.map((item) => (
        <span
          key={item.id}
          className="vl-vibe-particle"
          style={{ left: item.left, animationDelay: item.delay, animationDuration: item.duration, fontSize: item.size }}
        >
          {item.glyph}
        </span>
      ))}
    </div>
  );
};

export default VibeEffects;
