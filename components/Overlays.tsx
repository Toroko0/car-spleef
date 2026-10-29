import type { RunResult } from "../game/engine";
import type { ScoreEntry } from "../game/storage";

const fmtTime = (t: number) => {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
};

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-grid min-w-[26px] place-items-center rounded-md border border-white/25 bg-white/10 px-1.5 py-0.5 font-mono text-[11px] font-bold text-white/85 shadow-[inset_0_-2px_0_rgba(0,0,0,.4)]">
      {children}
    </kbd>
  );
}

function ScoreTable({ scores, highlight }: { scores: ScoreEntry[]; highlight?: number }) {
  if (!scores.length)
    return (
      <div className="rounded-xl border border-white/10 bg-black/30 px-4 py-5 text-center text-[11px] tracking-[0.2em] text-white/35">
        NO RUNS YET — SET THE PACE
      </div>
    );
  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-black/35">
      <div className="grid grid-cols-[28px_1fr_58px_46px] gap-1 border-b border-white/10 px-3 py-1.5 text-[9px] font-bold tracking-[0.2em] text-cyan-300/50">
        <span>#</span>
        <span>SCORE</span>
        <span className="text-right">LV</span>
        <span className="text-right">DROP</span>
      </div>
      <div className="divide-y divide-white/5">
        {scores.map((s, i) => (
          <div
            key={i}
            className={`grid grid-cols-[28px_1fr_58px_46px] items-center gap-1 px-3 py-1.5 font-mono text-[13px] ${
              highlight === i
                ? "bg-amber-400/15 text-amber-200"
                : i === 0
                  ? "text-cyan-200"
                  : "text-white/70"
            }`}
          >
            <span className={i === 0 ? "text-amber-300" : "text-white/35"}>{i + 1}</span>
            <span className="tabular-nums">{s.score.toLocaleString()}</span>
            <span className="text-right tabular-nums text-white/45">{s.level}</span>
            <span className="text-right tabular-nums text-pink-300/70">{s.drops}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function StartScreen({
  scores,
  onStart,
  touch,
}: {
  scores: ScoreEntry[];
  onStart: () => void;
  touch: boolean;
}) {
  return (
    <div
      onPointerDown={(e) => {
        e.preventDefault();
        onStart();
      }}
      className="absolute inset-0 flex flex-col items-center justify-center overflow-y-auto bg-gradient-to-b from-[#04060f]/85 via-[#04060f]/70 to-[#04060f]/95 px-5 py-6 text-center"
    >
      <div className="anim-rise">
        <div className="mb-1 text-[10px] font-bold tracking-[0.55em] text-cyan-300/60">
          NEON ARENA · 4 CARS · ONE FLOOR
        </div>
        <h1
          className="arcade text-[13vw] leading-[0.85] sm:text-[68px]"
          style={{
            background: "linear-gradient(180deg,#eafcff 0%,#5ee7ff 45%,#2b7bff 78%,#ff3d7f 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            filter: "drop-shadow(0 0 26px rgba(60,200,255,.55))",
          }}
        >
          DRIFT
          <br />
          SPLEEF
        </h1>
        <p className="mx-auto mt-3 max-w-[420px] text-[12px] leading-relaxed text-white/55">
          The floor crumbles behind every tyre. Carve holes, bait your rivals in, and never stop
          moving.
        </p>
      </div>

      <button
        onPointerDown={(e) => {
          e.preventDefault();
          onStart();
        }}
        className="anim-pulse mt-6 rounded-2xl border-2 border-cyan-300/70 bg-cyan-400/15 px-9 py-3.5 font-mono text-lg font-black tracking-[0.25em] text-cyan-50 shadow-[0_0_40px_rgba(34,230,255,.35)] active:scale-95"
      >
        START ENGINE
      </button>
      <div className="mt-2 text-[10px] tracking-[0.3em] text-white/35">
        {touch ? "TAP TO PLAY" : (
          <>
            press <Key>SPACE</Key>
          </>
        )}
      </div>

      <div className="mt-6 grid w-full max-w-[440px] gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-black/30 p-3 text-left">
          <div className="mb-2 text-[9px] font-bold tracking-[0.25em] text-cyan-300/60">
            {touch ? "TOUCH" : "KEYBOARD"}
          </div>
          {touch ? (
            <ul className="space-y-1.5 text-[11px] text-white/60">
              <li>• Left half — drag to steer</li>
              <li>• NITRO — carve 3 tiles wide</li>
              <li>• DRIFT — sharp turns, long slides</li>
            </ul>
          ) : (
            <div className="space-y-1.5 text-[11px] text-white/60">
              <div className="flex items-center gap-1.5">
                <Key>W</Key>
                <Key>A</Key>
                <Key>S</Key>
                <Key>D</Key>
                <span className="ml-1">drive</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Key>⇧</Key>
                <span className="ml-1">nitro (3-wide carve)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Key>SPACE</Key>
                <span className="ml-1">handbrake drift</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Key>P</Key>
                <span className="ml-1">pause</span>
                <Key>R</Key>
                <span>restart</span>
              </div>
            </div>
          )}
        </div>
        <div className="rounded-xl border border-white/10 bg-black/30 p-3 text-left">
          <div className="mb-2 text-[9px] font-bold tracking-[0.25em] text-pink-300/60">
            SCORING
          </div>
          <ul className="space-y-1.5 text-[11px] text-white/60">
            <li>• +10 per tile you break, chained</li>
            <li>
              • <span className="text-amber-200">+250</span> per rival dropped
            </li>
            <li>• Nitro cells refill boost &amp; pay 150</li>
            <li>• 45 tiles = FEVER x2</li>
          </ul>
        </div>
      </div>

      <div className="mt-4 w-full max-w-[440px]">
        <div className="mb-1.5 text-[9px] font-bold tracking-[0.25em] text-white/35">
          LOCAL LEADERBOARD
        </div>
        <ScoreTable scores={scores} />
      </div>
    </div>
  );
}

export function PauseScreen({
  onResume,
  onRestart,
  onQuit,
  score,
}: {
  onResume: () => void;
  onRestart: () => void;
  onQuit: () => void;
  score: number;
}) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#04060f]/75 px-6 backdrop-blur-[3px]">
      <div className="anim-rise w-full max-w-[320px] rounded-2xl border border-white/15 bg-black/50 p-6 text-center shadow-[0_0_60px_rgba(0,0,0,.6)]">
        <div className="arcade text-3xl text-white">PAUSED</div>
        <div className="mt-1 font-mono text-sm text-cyan-300/70">
          {score.toLocaleString()} pts
        </div>
        <button
          onPointerDown={(e) => {
            e.preventDefault();
            onResume();
          }}
          className="mt-5 w-full rounded-xl border-2 border-cyan-300/70 bg-cyan-400/15 py-3 font-mono text-sm font-black tracking-[0.2em] text-cyan-50 active:scale-95"
        >
          RESUME
        </button>
        <button
          onPointerDown={(e) => {
            e.preventDefault();
            onRestart();
          }}
          className="mt-2 w-full rounded-xl border border-white/20 bg-white/5 py-2.5 font-mono text-xs font-bold tracking-[0.2em] text-white/75 active:scale-95"
        >
          RESTART
        </button>
        <button
          onPointerDown={(e) => {
            e.preventDefault();
            onQuit();
          }}
          className="mt-2 w-full rounded-xl border border-white/10 py-2 font-mono text-[11px] tracking-[0.2em] text-white/40 active:scale-95"
        >
          MAIN MENU
        </button>
        <div className="mt-3 text-[9px] tracking-[0.25em] text-white/25">
          PRESS P / ESC TO RESUME
        </div>
      </div>
    </div>
  );
}

export function GameOverScreen({
  result,
  scores,
  rank,
  isBest,
  onRestart,
  onQuit,
  touch,
}: {
  result: RunResult;
  scores: ScoreEntry[];
  rank: number;
  isBest: boolean;
  onRestart: () => void;
  onQuit: () => void;
  touch: boolean;
}) {
  return (
    <div
      onPointerDown={(e) => {
        e.preventDefault();
        onRestart();
      }}
      className="absolute inset-0 flex flex-col items-center justify-center overflow-y-auto bg-gradient-to-b from-[#12030c]/80 via-[#04060f]/85 to-[#04060f]/95 px-5 py-6 text-center"
    >
      <div className="anim-rise w-full max-w-[420px]">
        {isBest && (
          <div className="anim-pulse mb-2 inline-block rounded-full border border-amber-300/60 bg-amber-400/20 px-3 py-1 font-mono text-[10px] font-black tracking-[0.3em] text-amber-200">
            NEW TRACK RECORD
          </div>
        )}
        <h2
          className="arcade text-[15vw] leading-none sm:text-[62px]"
          style={{
            background: "linear-gradient(180deg,#fff 0%,#ff9db4 50%,#ff2d6a 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            filter: "drop-shadow(0 0 26px rgba(255,60,120,.5))",
          }}
        >
          WRECKED
        </h2>
        <div className="mt-1 font-mono text-[42px] font-black leading-none text-white tabular-nums">
          {result.score.toLocaleString()}
        </div>
        <div className="mt-4 grid grid-cols-4 gap-2">
          {[
            ["LEVEL", result.level],
            ["DROPS", result.drops],
            ["TILES", result.tiles],
            ["TIME", fmtTime(result.time)],
          ].map(([k, v]) => (
            <div key={k as string} className="rounded-lg border border-white/10 bg-black/40 py-2">
              <div className="text-[8px] font-bold tracking-[0.18em] text-white/35">{k}</div>
              <div className="arcade text-lg text-cyan-200 tabular-nums">{v}</div>
            </div>
          ))}
        </div>

        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between text-[9px] font-bold tracking-[0.25em] text-white/35">
            <span>LOCAL LEADERBOARD</span>
            {rank >= 0 && (
              <span className="text-amber-300">RANK #{rank + 1}</span>
            )}
          </div>
          <ScoreTable scores={scores} highlight={rank >= 0 ? rank : undefined} />
        </div>

        <button
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onRestart();
          }}
          className="anim-pulse mt-5 w-full rounded-2xl border-2 border-cyan-300/70 bg-cyan-400/15 py-4 font-mono text-base font-black tracking-[0.25em] text-cyan-50 shadow-[0_0_40px_rgba(34,230,255,.3)] active:scale-95"
        >
          RETRY
        </button>
        <div className="mt-2 text-[10px] tracking-[0.3em] text-white/30">
          {touch ? "TAP TO RESTART" : (
            <>
              press <Key>R</Key> or <Key>SPACE</Key>
            </>
          )}
        </div>
        <button
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onQuit();
          }}
          className="mt-3 font-mono text-[11px] tracking-[0.25em] text-white/35 underline decoration-white/20 underline-offset-4 active:text-white/60"
        >
          MAIN MENU
        </button>
      </div>
    </div>
  );
}
