import { useEffect, useRef } from "react";
import type { Engine } from "../game/engine";

/* Lives are drawn as tiny neon car glyphs */
function CarGlyph({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 18" className={className} fill="none">
      <rect x="1" y="5" width="30" height="9" rx="3.5" fill="currentColor" />
      <rect x="9" y="2" width="10" height="4" rx="1.6" fill="currentColor" opacity="0.75" />
      <rect x="4" y="12" width="6" height="4" rx="1.6" fill="#0a0f22" />
      <rect x="22" y="12" width="6" height="4" rx="1.6" fill="#0a0f22" />
      <rect x="4" y="2.5" width="6" height="4" rx="1.6" fill="#0a0f22" />
      <rect x="22" y="2.5" width="6" height="4" rx="1.6" fill="#0a0f22" />
    </svg>
  );
}

export default function Hud({
  engine,
  onPause,
  onMute,
  muted,
}: {
  engine: Engine;
  onPause: () => void;
  onMute: () => void;
  muted: boolean;
}) {
  const scoreRef = useRef<HTMLSpanElement>(null);
  const multRef = useRef<HTMLSpanElement>(null);
  const multBoxRef = useRef<HTMLDivElement>(null);
  const chainRef = useRef<HTMLDivElement>(null);
  const boostRef = useRef<HTMLDivElement>(null);
  const livesRef = useRef<HTMLDivElement>(null);
  const levelRef = useRef<HTMLSpanElement>(null);
  const dropRef = useRef<HTMLSpanElement>(null);
  const speedRef = useRef<HTMLSpanElement>(null);
  const speedFill = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0;
    let lastScoreTxt = "";
    let lastScoreVal = 0;
    let popT = 0;
    let lastMult = -1;
    let lastLevel = -1;
    let lastLives = -1;
    let lastDrops = -1;
    const fmt = (n: number) => Math.max(0, Math.round(n)).toString().padStart(6, "0");
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const h = engine.hud;
      const s = fmt(h.shown);
      if (s !== lastScoreTxt && scoreRef.current) {
        scoreRef.current.textContent = s;
        lastScoreTxt = s;
      }
      if (h.score - lastScoreVal > 120) {
        lastScoreVal = h.score;
        popT = 0.28;
      } else if (h.score !== lastScoreVal) lastScoreVal = h.score;
      if (popT > 0 && scoreRef.current) {
        popT -= 0.016;
        const k = 1 + Math.max(0, popT) * 0.7;
        scoreRef.current.style.transform = `scale(${k.toFixed(3)})`;
        scoreRef.current.style.transformOrigin = "left center";
        if (popT <= 0) scoreRef.current.style.transform = "scale(1)";
      }
      if (h.mult !== lastMult) {
        lastMult = h.mult;
        if (multRef.current) multRef.current.textContent = "x" + h.mult;
        if (multBoxRef.current) {
          if (h.mult > 1) multBoxRef.current.classList.add("mult-hot");
          else multBoxRef.current.classList.remove("mult-hot");
        }
      }
      if (chainRef.current) chainRef.current.style.width = (h.chainPct * 100).toFixed(1) + "%";
      if (boostRef.current) boostRef.current.style.width = (h.boost * 100).toFixed(1) + "%";
      if (speedFill.current)
        speedFill.current.style.width = (Math.min(1, h.speed * 1.25) * 100).toFixed(1) + "%";
      if (speedRef.current) {
        const v = Math.round(h.speed * 260);
        const txt = String(v);
        if (speedRef.current.textContent !== txt) speedRef.current.textContent = txt;
      }
      if (h.level !== lastLevel) {
        lastLevel = h.level;
        if (levelRef.current) levelRef.current.textContent = String(h.level).padStart(2, "0");
      }
      if (h.drops !== lastDrops) {
        lastDrops = h.drops;
        if (dropRef.current) dropRef.current.textContent = String(h.drops);
      }
      if (h.lives !== lastLives && livesRef.current) {
        lastLives = h.lives;
        const kids = livesRef.current.children;
        for (let i = 0; i < kids.length; i++)
          kids[i].classList.toggle("opacity-20", i >= h.lives);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [engine]);

  return (
    <div className="pointer-events-none absolute inset-0 select-none">
      {/* top-left: score */}
      <div className="absolute left-3 top-2 sm:left-5 sm:top-4">
        <div className="text-[9px] font-bold tracking-[0.35em] text-cyan-300/60">SCORE</div>
        <span
          ref={scoreRef}
          className="arcade block text-[30px] leading-none text-white sm:text-[42px]"
          style={{ textShadow: "0 0 18px rgba(34,230,255,.65), 0 2px 0 rgba(0,0,0,.6)" }}
        >
          000000
        </span>
        <div className="mt-1.5 flex items-center gap-1.5">
          <div
            ref={multBoxRef}
            className="rounded-md border border-amber-300/40 bg-amber-400/10 px-1.5 py-0.5"
          >
            <span ref={multRef} className="arcade text-[13px] text-amber-300">
              x1
            </span>
          </div>
          <div className="h-2 w-14 overflow-hidden rounded-full bg-white/10">
            <div
              ref={chainRef}
              className="h-full w-0 rounded-full bg-gradient-to-r from-amber-300 to-pink-400"
            />
          </div>
        </div>
        <div className="mt-2 flex items-center gap-2 text-[10px] font-bold tracking-widest">
          <span className="text-cyan-300/60">LV</span>
          <span ref={levelRef} className="arcade text-cyan-200">
            01
          </span>
          <span className="ml-1 text-pink-300/60">DROPS</span>
          <span ref={dropRef} className="arcade text-pink-200">
            0
          </span>
        </div>
        <div ref={livesRef} className="mt-2 flex gap-1.5 text-cyan-300">
          <CarGlyph className="h-4 w-7 drop-shadow-[0_0_6px_rgba(34,230,255,.8)]" />
          <CarGlyph className="h-4 w-7 drop-shadow-[0_0_6px_rgba(34,230,255,.8)]" />
          <CarGlyph className="h-4 w-7 drop-shadow-[0_0_6px_rgba(34,230,255,.8)]" />
        </div>
      </div>

      {/* top-right: buttons */}
      <div className="pointer-events-auto absolute right-3 top-3 flex gap-2 sm:right-5">
        <button
          onPointerDown={(e) => {
            e.preventDefault();
            onMute();
          }}
          aria-label="mute"
          className="grid h-9 w-9 place-items-center rounded-lg border border-white/15 bg-white/5 text-white/70 backdrop-blur-sm active:scale-90"
        >
          {muted ? (
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
              <path d="M4 9h3l5-4v14l-5-4H4z" />
              <path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" strokeWidth="2" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
              <path d="M4 9h3l5-4v14l-5-4H4z" />
              <path d="M16 8a5 5 0 010 8" stroke="currentColor" strokeWidth="2" fill="none" />
            </svg>
          )}
        </button>
        <button
          onPointerDown={(e) => {
            e.preventDefault();
            onPause();
          }}
          aria-label="pause"
          className="grid h-9 w-9 place-items-center rounded-lg border border-white/15 bg-white/5 text-white/70 backdrop-blur-sm active:scale-90"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
            <rect x="6" y="5" width="4" height="14" rx="1" />
            <rect x="14" y="5" width="4" height="14" rx="1" />
          </svg>
        </button>
      </div>

      {/* bottom-center: nitro + speed */}
      <div className="absolute bottom-3 left-1/2 w-[38%] max-w-[230px] -translate-x-1/2 sm:bottom-5">
        <div className="mb-1 flex items-center justify-between text-[8px] font-bold tracking-[0.3em] text-white/45">
          <span>NITRO</span>
          <span ref={speedRef}>0</span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full border border-white/15 bg-black/50">
          <div
            ref={boostRef}
            className="h-full w-full rounded-full bg-gradient-to-r from-cyan-400 via-sky-300 to-fuchsia-400 transition-[width] duration-75"
            style={{ boxShadow: "0 0 12px rgba(56,220,255,.8)" }}
          />
        </div>
        <div className="mt-1 h-[3px] w-full overflow-hidden rounded bg-white/10">
          <div
            ref={speedFill}
            className="h-full w-0 rounded bg-gradient-to-r from-cyan-300 to-pink-400"
          />
        </div>
      </div>
    </div>
  );
}
