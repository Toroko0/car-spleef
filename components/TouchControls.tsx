import { useEffect, useRef } from "react";
import type { Engine } from "../game/engine";

const MAX = 54;

export default function TouchControls({ engine }: { engine: Engine }) {
  const zoneRef = useRef<HTMLDivElement>(null);
  const baseRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const boostRef = useRef<HTMLButtonElement>(null);
  const driftRef = useRef<HTMLButtonElement>(null);
  const active = useRef(false);
  const ox = useRef(0);
  const oy = useRef(0);

  useEffect(() => {
    const zone = zoneRef.current;
    if (!zone) return;
    const show = (x: number, y: number) => {
      ox.current = x;
      oy.current = y;
      if (baseRef.current) {
        baseRef.current.style.transform = `translate(${x - 70}px, ${y - 70}px)`;
        baseRef.current.style.opacity = "1";
      }
      if (knobRef.current) knobRef.current.style.transform = `translate(0px, 0px)`;
      if (knobRef.current) knobRef.current.style.opacity = "1";
    };
    const move = (x: number, y: number) => {
      let dx = x - ox.current;
      let dy = y - oy.current;
      const d = Math.hypot(dx, dy);
      if (d > MAX) {
        dx = (dx / d) * MAX;
        dy = (dy / d) * MAX;
      }
      engine.input.stick = true;
      engine.input.sx = dx / MAX;
      engine.input.sy = dy / MAX;
      if (knobRef.current) knobRef.current.style.transform = `translate(${dx}px, ${dy}px)`;
    };
    const hide = () => {
      active.current = false;
      engine.input.stick = false;
      engine.input.sx = 0;
      engine.input.sy = 0;
      if (baseRef.current) baseRef.current.style.opacity = "0";
      if (knobRef.current) knobRef.current.style.opacity = "0";
    };
    const down = (e: PointerEvent) => {
      if (!e.isPrimary) return;
      active.current = true;
      zone.setPointerCapture(e.pointerId);
      const r = zone.getBoundingClientRect();
      show(e.clientX - r.left, e.clientY - r.top);
      move(e.clientX, e.clientY);
      e.preventDefault();
    };
    const pm = (e: PointerEvent) => {
      if (!active.current) return;
      move(e.clientX, e.clientY);
      e.preventDefault();
    };
    const up = (e: PointerEvent) => {
      if (!active.current) return;
      hide();
      e.preventDefault();
    };
    zone.addEventListener("pointerdown", down);
    zone.addEventListener("pointermove", pm);
    zone.addEventListener("pointerup", up);
    zone.addEventListener("pointercancel", up);
    return () => {
      zone.removeEventListener("pointerdown", down);
      zone.removeEventListener("pointermove", pm);
      zone.removeEventListener("pointerup", up);
      zone.removeEventListener("pointercancel", up);
    };
  }, [engine]);

  const hold = (ref: React.RefObject<HTMLButtonElement | null>, key: "tBoost" | "tBrake") => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      ref.current?.setPointerCapture(e.pointerId);
      engine.input[key] = true;
      ref.current?.classList.add("btn-held");
    },
    onPointerUp: (e: React.PointerEvent) => {
      e.preventDefault();
      engine.input[key] = false;
      ref.current?.classList.remove("btn-held");
    },
    onPointerCancel: () => {
      engine.input[key] = false;
      ref.current?.classList.remove("btn-held");
    },
    onLostPointerCapture: () => {
      engine.input[key] = false;
      ref.current?.classList.remove("btn-held");
    },
  });

  return (
    <div className="absolute inset-0 touch-none">
      {/* joystick zone: left 55% of the screen */}
      <div ref={zoneRef} className="absolute bottom-0 left-0 h-full w-[55%]">
        <div
          ref={baseRef}
          className="pointer-events-none absolute left-0 top-0 h-[140px] w-[140px] opacity-0 transition-opacity duration-150"
        >
          <div className="absolute inset-0 rounded-full border-2 border-cyan-300/30 bg-cyan-400/5" />
          <div className="absolute inset-[26px] rounded-full border border-cyan-300/15" />
          <div
            ref={knobRef}
            className="absolute inset-[42px] opacity-0 transition-opacity duration-150"
          >
            <div
              className="h-full w-full rounded-full border-2 border-cyan-200/70"
              style={{
                background:
                  "radial-gradient(circle at 35% 30%, rgba(180,245,255,.9), rgba(20,140,190,.55))",
                boxShadow: "0 0 22px rgba(34,230,255,.6)",
              }}
            />
          </div>
        </div>
        {/* idle hint */}
        <div className="pointer-events-none absolute bottom-6 left-6 h-[110px] w-[110px] rounded-full border border-dashed border-white/15">
          <div className="absolute inset-0 grid place-items-center text-[9px] font-bold tracking-[0.2em] text-white/25">
            STEER
          </div>
        </div>
      </div>

      <div className="absolute bottom-6 right-5 flex items-end gap-3">
        <button
          ref={driftRef}
          {...hold(driftRef, "tBrake")}
          className="btn-held-target grid h-[70px] w-[70px] place-items-center rounded-full border-2 border-fuchsia-300/50 bg-fuchsia-500/15 text-[10px] font-black tracking-widest text-fuchsia-100 backdrop-blur-sm"
          style={{ boxShadow: "0 0 18px rgba(255,80,200,.35)" }}
        >
          DRIFT
        </button>
        <button
          ref={boostRef}
          {...hold(boostRef, "tBoost")}
          className="btn-held-target grid h-[92px] w-[92px] place-items-center rounded-full border-2 border-amber-300/60 bg-amber-400/20 text-[11px] font-black tracking-widest text-amber-50 backdrop-blur-sm"
          style={{ boxShadow: "0 0 24px rgba(255,190,60,.45)" }}
        >
          NITRO
        </button>
      </div>
    </div>
  );
}
