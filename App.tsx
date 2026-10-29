import { useCallback, useEffect, useRef, useState } from "react";
import { Engine, type Phase, type RunResult } from "./game/engine";
import { sfx } from "./game/audio";
import { bestScore, loadScores, saveScore, type ScoreEntry } from "./game/storage";
import Hud from "./components/Hud";
import TouchControls from "./components/TouchControls";
import { GameOverScreen, PauseScreen, StartScreen } from "./components/Overlays";

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const [ready, setReady] = useState(false);
  const [phase, setPhase] = useState<Phase>("menu");
  const [scores, setScores] = useState<ScoreEntry[]>(() => loadScores());
  const [result, setResult] = useState<RunResult | null>(null);
  const [rank, setRank] = useState(-1);
  const [isBest, setIsBest] = useState(false);
  const [muted, setMuted] = useState(false);
  const [touch, setTouch] = useState(false);
  const phaseRef = useRef<Phase>("menu");
  const prevBest = useRef(0);
  const saved = useRef(false);

  phaseRef.current = phase;

  /* boot engine */
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const eng = new Engine(c);
    engineRef.current = eng;
    eng.onPhase = (p) => setPhase(p);
    eng.onOver = (r) => {
      setResult(r);
      if (!saved.current) {
        saved.current = true;
        prevBest.current = bestScore();
        setIsBest(r.score > prevBest.current && r.score > 0);
        const { list, rank: rk } = saveScore({
          score: r.score,
          level: r.level,
          drops: r.drops,
          date: Date.now(),
        });
        setScores(list);
        setRank(rk);
      }
    };
    const doResize = () => eng.resize();
    doResize();
    eng.run();
    setReady(true);

    const ro = new ResizeObserver(doResize);
    ro.observe(c);
    window.addEventListener("resize", doResize);
    window.addEventListener("orientationchange", doResize);
    const onVis = () => {
      if (document.hidden && phaseRef.current === "playing") eng.pause();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", doResize);
      window.removeEventListener("orientationchange", doResize);
      document.removeEventListener("visibilitychange", onVis);
      eng.stop();
    };
  }, []);

  useEffect(() => {
    const coarse =
      typeof window !== "undefined" &&
      (window.matchMedia?.("(pointer: coarse)").matches ||
        ("ontouchstart" in window && navigator.maxTouchPoints > 1));
    setTouch(!!coarse);
    const mq = window.matchMedia?.("(pointer: coarse)");
    const onChange = () => setTouch(!!mq?.matches);
    mq?.addEventListener?.("change", onChange);
    return () => mq?.removeEventListener?.("change", onChange);
  }, []);

  const startRun = useCallback(() => {
    sfx.init();
    sfx.resume();
    saved.current = false;
    setResult(null);
    setRank(-1);
    engineRef.current?.start();
  }, []);

  const toMenu = useCallback(() => {
    sfx.ui();
    setResult(null);
    setScores(loadScores());
    engineRef.current?.toMenu();
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      sfx.setMuted(!m);
      return !m;
    });
  }, []);

  /* keyboard */
  useEffect(() => {
    const eng = () => engineRef.current;
    const down = (e: KeyboardEvent) => {
      const E = eng();
      if (!E) return;
      sfx.init();
      sfx.resume();
      const k = e.key.toLowerCase();
      if (
        k === " " ||
        k === "arrowup" ||
        k === "arrowdown" ||
        k === "arrowleft" ||
        k === "arrowright"
      )
        e.preventDefault();
      switch (k) {
        case "arrowup":
        case "w":
          E.input.kUp = true;
          break;
        case "arrowdown":
        case "s":
          E.input.kDown = true;
          break;
        case "arrowleft":
        case "a":
          E.input.kLeft = true;
          break;
        case "arrowright":
        case "d":
          E.input.kRight = true;
          break;
        case "shift":
          E.input.kBoost = true;
          break;
        case " ":
          if (phaseRef.current === "playing") E.input.kBrake = true;
          else startRun();
          break;
        case "enter":
          if (phaseRef.current !== "playing") startRun();
          break;
        case "p":
        case "escape":
          if (phaseRef.current === "playing" || phaseRef.current === "paused") E.togglePause();
          break;
        case "r":
          if (phaseRef.current !== "menu") startRun();
          break;
        case "m":
          toggleMute();
          break;
      }
    };
    const up = (e: KeyboardEvent) => {
      const E = eng();
      if (!E) return;
      const k = e.key.toLowerCase();
      switch (k) {
        case "arrowup":
        case "w":
          E.input.kUp = false;
          break;
        case "arrowdown":
        case "s":
          E.input.kDown = false;
          break;
        case "arrowleft":
        case "a":
          E.input.kLeft = false;
          break;
        case "arrowright":
        case "d":
          E.input.kRight = false;
          break;
        case "shift":
          E.input.kBoost = false;
          break;
        case " ":
          E.input.kBrake = false;
          break;
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    const blur = () => {
      const E = eng();
      if (!E) return;
      E.input.kUp =
        E.input.kDown =
        E.input.kLeft =
        E.input.kRight =
        E.input.kBoost =
        E.input.kBrake =
          false;
      if (phaseRef.current === "playing") E.pause();
    };
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [startRun, toggleMute]);

  const eng = engineRef.current;

  return (
    <div className="relative h-[100dvh] w-screen overflow-hidden bg-[#04060f] text-white">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />

      {/* scanline / crt flavour */}
      <div className="scanlines pointer-events-none absolute inset-0" />

      {eng && phase === "playing" && (
        <>
          <Hud engine={eng} onPause={() => eng.pause()} onMute={toggleMute} muted={muted} />
          {touch && <TouchControls engine={eng} />}
        </>
      )}
      {eng && phase === "paused" && (
        <PauseScreen
          score={eng.hud.score}
          onResume={() => eng.resume()}
          onRestart={startRun}
          onQuit={toMenu}
        />
      )}
      {phase === "menu" && ready && (
        <StartScreen scores={scores} onStart={startRun} touch={touch} />
      )}
      {phase === "over" && result && (
        <GameOverScreen
          result={result}
          scores={scores}
          rank={rank}
          isBest={isBest}
          onRestart={startRun}
          onQuit={toMenu}
          touch={touch}
        />
      )}
    </div>
  );
}
