import { sfx } from "./audio";

/* ------------------------------------------------------------------ *
 *  DRIFT SPLEEF — arcade tile-crumbling car arena
 * ------------------------------------------------------------------ */

export const TILE = 32;
export const GRID = 21; // includes 1-tile indestructible barrier ring
export const WORLD = TILE * GRID;

export const WALL = 0;
export const SOLID = 1;
export const CRACK = 2;
export const HOLE = 3;

/** seconds before a broken tile rebuilds itself — tuned so the arena churns
 *  instead of dying (destruction rate ~25 tiles/s across 4 cars) */
export const REGEN = 3.0;
export const REGEN_MIN = 2.3;

/** floor texture supersampling (keeps tiles crisp when the camera zooms in) */
export const FLOOR_SCALE = 2;

export type Phase = "menu" | "playing" | "paused" | "over";

export interface HudData {
  score: number;
  shown: number;
  lives: number;
  level: number;
  mult: number;
  chainPct: number;
  boost: number;
  fever: number;
  drops: number;
  tiles: number;
  time: number;
  speed: number;
  rivals: number;
}

export interface RunResult {
  score: number;
  level: number;
  drops: number;
  tiles: number;
  time: number;
}

interface Car {
  id: number;
  player: boolean;
  x: number;
  y: number;
  px: number;
  py: number;
  vx: number;
  vy: number;
  a: number;
  av: number;
  steerVis: number;
  wheels: number;
  color: string;
  glow: string;
  dark: string;
  boost: number;
  boosting: boolean;
  drift: number;
  fall: number;
  grace: number;
  graced: boolean;
  fx: number;
  fy: number;
  respawn: number;
  invuln: number;
  dead: boolean;
  /* ai */
  aiT: number;
  tx: number;
  ty: number;
  panic: number;
  stuck: number;
  thr: number;
  str: number;
  useBoost: boolean;
  skill: number;
}

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
  size: number;
  rot: number;
  vr: number;
  c: string;
  kind: number; // 0 chunk 1 spark 2 smoke
}

interface Ring {
  x: number;
  y: number;
  life: number;
  max: number;
  r0: number;
  r1: number;
  c: string;
  w: number;
}

interface Popup {
  x: number;
  y: number;
  vy: number;
  life: number;
  max: number;
  t: string;
  c: string;
  s: number;
}

interface Pickup {
  x: number;
  y: number;
  t: number;
}

interface Warn {
  i: number;
  t: number;
}

const RIVCOL = [
  ["#ff3d7f", "#ff9ec4", "#7d0c34"],
  ["#ffb020", "#ffe29a", "#7a4a00"],
  ["#9b5cff", "#d4bcff", "#3b1478"],
  ["#39ff88", "#b6ffd4", "#0a6330"],
];

const PLAYER_COL = ["#22e6ff", "#c2f7ff", "#075a75"];

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

/* cached radial glow sprites */
const glowCache = new Map<string, HTMLCanvasElement>();
function glow(color: string): HTMLCanvasElement {
  let c = glowCache.get(color);
  if (c) return c;
  const s = 96;
  c = document.createElement("canvas");
  c.width = c.height = s;
  const g = c.getContext("2d")!;
  const rg = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  rg.addColorStop(0, color);
  rg.addColorStop(0.35, color + "88");
  rg.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = rg;
  g.fillRect(0, 0, s, s);
  glowCache.set(color, c);
  return c;
}

let bgGrad: CanvasGradient | null = null;
let vigGrad: CanvasGradient | null = null;
let vigW = 0;
let vigH = 0;

export class Engine {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  floor: HTMLCanvasElement;
  fctx: CanvasRenderingContext2D;
  mini: HTMLCanvasElement;
  mctx: CanvasRenderingContext2D;

  dpr = 1;
  vw = 800;
  vh = 600;

  phase: Phase = "menu";
  attract = true;

  state = new Uint8Array(GRID * GRID);
  timer = new Float32Array(GRID * GRID);
  owner = new Int8Array(GRID * GRID);
  shade = new Float32Array(GRID * GRID);

  cars: Car[] = [];
  parts: Particle[] = [];
  rings: Ring[] = [];
  pops: Popup[] = [];
  pickups: Pickup[] = [];
  warns: Warn[] = [];
  skids: { x: number; y: number; a: number; l: number }[] = [];

  dirty = new Set<number>();
  cracked: number[] = [];
  holes: number[] = [];

  hud: HudData = {
    score: 0,
    shown: 0,
    lives: 3,
    level: 1,
    mult: 1,
    chainPct: 0,
    boost: 1,
    fever: 0,
    drops: 0,
    tiles: 0,
    time: 0,
    speed: 0,
    rivals: 3,
  };

  chain = 0;
  chainT = 0;
  collapseT = 5;
  pickupT = 2;
  shake = 0;
  shakeR = 0;
  flash = 0;
  flashCol = "255,255,255";
  timeScale = 1;
  freeze = 0;
  camX = WORLD / 2;
  camY = WORLD / 2;
  camS = 1;
  banner = "";
  bannerT = 0;
  bannerSub = "";

  input = {
    kUp: false,
    kDown: false,
    kLeft: false,
    kRight: false,
    kBoost: false,
    kBrake: false,
    stick: false,
    sx: 0,
    sy: 0,
    tBoost: false,
    tBrake: false,
  };

  onOver: ((r: RunResult) => void) | null = null;
  onPhase: ((p: Phase) => void) | null = null;

  private raf = 0;
  private last = 0;
  private running = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false })!;
    this.floor = document.createElement("canvas");
    this.floor.width = this.floor.height = WORLD * FLOOR_SCALE;
    this.fctx = this.floor.getContext("2d")!;
    this.fctx.setTransform(FLOOR_SCALE, 0, 0, FLOOR_SCALE, 0, 0);
    this.mini = document.createElement("canvas");
    this.mini.width = this.mini.height = GRID;
    this.mctx = this.mini.getContext("2d")!;
    for (let i = 0; i < GRID * GRID; i++) this.shade[i] = Math.random();
    this.reset(true);
  }

  /* ---------------- setup ---------------- */

  resize() {
    const c = this.canvas;
    const r = c.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.dpr = dpr;
    this.vw = Math.max(320, r.width);
    this.vh = Math.max(320, r.height);
    c.width = Math.floor(this.vw * dpr);
    c.height = Math.floor(this.vh * dpr);
    bgGrad = null;
  }

  idx(tx: number, ty: number) {
    return ty * GRID + tx;
  }

  tileAt(x: number, y: number) {
    const tx = (x / TILE) | 0;
    const ty = (y / TILE) | 0;
    if (tx < 0 || ty < 0 || tx >= GRID || ty >= GRID) return -1;
    return this.idx(tx, ty);
  }

  private mkCar(id: number, player: boolean, col: string[], x: number, y: number, a: number): Car {
    return {
      id,
      player,
      x,
      y,
      px: x,
      py: y,
      vx: 0,
      vy: 0,
      a,
      av: 0,
      steerVis: 0,
      wheels: 0,
      color: col[0],
      glow: col[1],
      dark: col[2],
      boost: 1,
      boosting: false,
      drift: 0,
      fall: 0,
      grace: 0,
      graced: false,
      fx: 0,
      fy: 0,
      respawn: 0,
      invuln: 2,
      dead: false,
      aiT: 0,
      tx: WORLD / 2,
      ty: WORLD / 2,
      panic: 0,
      stuck: 0,
      thr: 1,
      str: 0,
      useBoost: false,
      skill: 1,
    };
  }

  reset(attract: boolean) {
    this.attract = attract;
    const S = this.state;
    const T = this.timer;
    S.fill(SOLID);
    T.fill(0);
    this.owner.fill(-1);
    for (let i = 0; i < GRID; i++) {
      S[this.idx(i, 0)] = WALL;
      S[this.idx(i, GRID - 1)] = WALL;
      S[this.idx(0, i)] = WALL;
      S[this.idx(GRID - 1, i)] = WALL;
    }
    this.dirty.clear();
    for (let i = 0; i < GRID * GRID; i++) this.dirty.add(i);
    this.cracked.length = 0;
    this.holes.length = 0;
    this.parts.length = 0;
    this.rings.length = 0;
    this.pops.length = 0;
    this.pickups.length = 0;
    this.warns.length = 0;
    this.skids.length = 0;
    this.cars = [];
    this.chain = 0;
    this.chainT = 0;
    this.shake = 0;
    this.flash = 0;
    this.timeScale = 1;
    this.freeze = 0;
    this.collapseT = 5.5;
    this.pickupT = 1.2;
    this.banner = "";
    this.bannerT = 0;
    this.hud.score = 0;
    this.hud.shown = 0;
    this.hud.lives = 3;
    this.hud.level = 1;
    this.hud.mult = 1;
    this.hud.chainPct = 0;
    this.hud.boost = 1;
    this.hud.fever = 0;
    this.hud.drops = 0;
    this.hud.tiles = 0;
    this.hud.time = 0;
    this.hud.speed = 0;

    const c = GRID / 2;
    const p = this.mkCar(0, true, PLAYER_COL, TILE * (c + 0.5), TILE * (c + 0.5), -Math.PI / 2);
    this.cars.push(p);
    const startSpots = [
      [4, 4, Math.PI * 0.75],
      [GRID - 5, 4, Math.PI * 1.25],
      [4, GRID - 5, Math.PI * 0.25],
      [GRID - 5, GRID - 5, -Math.PI * 0.25],
    ];
    const nR = attract ? 3 : 3;
    for (let i = 0; i < nR; i++) {
      const [tx, ty, a] = startSpots[i];
      const r = this.mkCar(
        i + 1,
        false,
        RIVCOL[i % RIVCOL.length],
        TILE * (tx + 0.5),
        TILE * (ty + 0.5),
        a,
      );
      r.skill = 0.75 + i * 0.06;
      this.cars.push(r);
    }
    this.hud.rivals = nR;
    this.flushFloor();
    this.refreshMini();
    this.camX = p.x;
    this.camY = p.y;
  }

  /* ---------------- lifecycle ---------------- */

  start() {
    this.reset(false);
    this.phase = "playing";
    this.onPhase?.(this.phase);
    this.setBanner("GO!", "OUTDRIVE THE CRUMBLE");
    sfx.start();
  }

  toMenu() {
    this.reset(true);
    this.phase = "menu";
    this.onPhase?.(this.phase);
  }

  pause() {
    if (this.phase !== "playing") return;
    this.phase = "paused";
    this.onPhase?.(this.phase);
    sfx.engine(0, false);
  }

  resume() {
    if (this.phase !== "paused") return;
    this.phase = "playing";
    this.onPhase?.(this.phase);
  }

  togglePause() {
    if (this.phase === "playing") this.pause();
    else if (this.phase === "paused") this.resume();
  }

  run() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const loop = (t: number) => {
      this.raf = requestAnimationFrame(loop);
      let dt = (t - this.last) / 1000;
      this.last = t;
      if (dt > 0.05) dt = 0.05;
      if (dt < 0) dt = 0;
      this.frame(dt);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    sfx.engine(0, false);
  }

  private frame(dtReal: number) {
    const active = this.phase === "playing" || this.attract;
    if (active && this.freeze > 0) {
      this.freeze -= dtReal;
    } else if (active) {
      this.timeScale = lerp(this.timeScale, 1, 1 - Math.exp(-3 * dtReal));
      const dt = dtReal * this.timeScale;
      const steps = dt > 0.021 ? 2 : 1;
      for (let i = 0; i < steps; i++) this.update(dt / steps);
    }
    this.shake *= Math.exp(-7 * dtReal);
    this.shakeR *= Math.exp(-7 * dtReal);
    this.flash *= Math.exp(-6 * dtReal);
    if (this.bannerT > 0) this.bannerT -= dtReal;
    this.render();
    this.hud.shown = lerp(this.hud.shown, this.hud.score, 1 - Math.exp(-9 * dtReal));
    if (Math.abs(this.hud.shown - this.hud.score) < 1) this.hud.shown = this.hud.score;
  }

  /* ---------------- update ---------------- */

  private update(dt: number) {
    const player = this.cars[0];
    if (this.phase === "playing") this.hud.time += dt;

    if (this.chainT > 0) {
      this.chainT -= dt;
      if (this.chainT <= 0) {
        this.chain = 0;
        this.hud.mult = 1;
      }
    }
    this.hud.chainPct = this.chainT > 0 ? clamp(this.chainT / 1.5, 0, 1) : 0;
    if (this.hud.fever > 0) this.hud.fever = Math.max(0, this.hud.fever - dt);

    /* ---- cars ---- */
    for (const c of this.cars) {
      if (c.respawn > 0) {
        c.respawn -= dt;
        if (c.respawn <= 0) this.spawnCar(c);
        continue;
      }
      if (c.fall > 0) {
        c.fall += dt / 0.75;
        if (c.fall >= 1) this.resolveFall(c);
        continue;
      }
      if (c.grace > 0) c.grace = Math.max(0, c.grace - dt);
      const inp = c.player && !this.attract ? this.readInput() : this.aiInput(c, dt);
      this.stepCar(c, inp, dt);
    }

    this.carCollisions();
    if (this.phase === "playing" || this.attract) this.pickupsUpdate(dt);
    this.collapse(dt);
    this.tilesUpdate(dt);
    this.pickupCollect();

    /* ---- fx ---- */
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.parts[i] = this.parts[this.parts.length - 1];
        this.parts.pop();
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.z > 0) {
        p.vz -= 900 * dt;
      } else {
        p.z = 0;
        p.vz *= -0.32;
        p.vx *= 0.7;
        p.vy *= 0.7;
        if (Math.abs(p.vz) < 30) p.vz = 0;
      }
      p.vx *= Math.exp(-1.4 * dt);
      p.vy *= Math.exp(-1.4 * dt);
      p.rot += p.vr * dt;
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= dt;
      if (r.life <= 0) this.rings.splice(i, 1);
    }
    for (let i = this.pops.length - 1; i >= 0; i--) {
      const p = this.pops[i];
      p.life -= dt;
      p.y += p.vy * dt;
      p.vy *= Math.exp(-2 * dt);
      if (p.life <= 0) this.pops.splice(i, 1);
    }
    for (let i = this.skids.length - 1; i >= 0; i--) {
      this.skids[i].l -= dt * 0.22;
      if (this.skids[i].l <= 0) {
        this.skids[i] = this.skids[this.skids.length - 1];
        this.skids.pop();
      }
    }

    /* ---- camera ---- */
    let tx = player.x;
    let ty = player.y;
    if (player.fall <= 0 && player.respawn <= 0) {
      tx += player.vx * 0.16;
      ty += player.vy * 0.16;
    } else {
      let best = player;
      for (const c of this.cars) if (c.respawn <= 0 && c.fall <= 0) best = c;
      tx = best.x;
      ty = best.y;
    }
    this.camX = lerp(this.camX, tx, 1 - Math.exp(-6 * dt));
    this.camY = lerp(this.camY, ty, 1 - Math.exp(-6 * dt));

    const minD = Math.min(this.vw, this.vh);
    const viewTiles = clamp(minD / 30, 12.5, 17);
    let s = minD / (viewTiles * TILE);
    if (this.hud.fever > 0) s *= 1.04;
    this.camS = lerp(this.camS, s, 1 - Math.exp(-5 * dt));

    const hw = this.vw / (2 * this.camS);
    const hh = this.vh / (2 * this.camS);
    const M = 40;
    this.camX = hw * 2 >= WORLD + M * 2 ? WORLD / 2 : clamp(this.camX, hw - M, WORLD - hw + M);
    this.camY = hh * 2 >= WORLD + M * 2 ? WORLD / 2 : clamp(this.camY, hh - M, WORLD - hh + M);

    /* ---- hud ---- */
    const sp = Math.hypot(player.vx, player.vy);
    this.hud.speed = clamp(sp / 420, 0, 1);
    if (this.phase === "playing") {
      if (this.hud.fever <= 0) this.hud.boost = clamp(this.hud.boost + dt * 0.15, 0, 1);
      else this.hud.boost = clamp(this.hud.boost + dt * 0.3, 0, 1);
    }
    sfx.engine(this.hud.speed, this.phase === "playing" || this.attract);
  }

  /* ---------------- input ---------------- */

  private readInput() {
    const i = this.input;
    let thr = 0;
    let str = 0;
    let boost = i.kBoost || i.tBoost;
    const brake = i.kBrake || i.tBrake;
    if (i.stick) {
      const p = this.cars[0];
      const mag = Math.hypot(i.sx, i.sy);
      if (mag > 0.12) {
        const want = Math.atan2(i.sy, i.sx);
        let d = want - p.a;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        str = clamp(d * 2.3, -1, 1);
        thr = clamp(mag * 1.6, 0, 1);
      }
    } else {
      thr = (i.kUp ? 1 : 0) - (i.kDown ? 1 : 0);
      str = (i.kRight ? 1 : 0) - (i.kLeft ? 1 : 0);
    }
    return { thr, str, boost, brake };
  }

  private stepCar(
    c: Car,
    inp: { thr: number; str: number; boost: boolean; brake: boolean },
    dt: number,
  ) {
    const fx = Math.cos(c.a);
    const fy = Math.sin(c.a);
    let fwd = c.vx * fx + c.vy * fy;

    const boosting =
      inp.boost && inp.thr > 0.1 && (c.player ? this.hud.boost > 0.05 : c.boost > 0.05);
    c.boosting = boosting;
    if (boosting) {
      if (c.player) {
        this.hud.boost = clamp(this.hud.boost - dt * 0.42, 0, 1);
      } else c.boost = clamp(c.boost - dt * 0.4, 0, 1);
      if (Math.random() < 0.5) this.smoke(c, true);
    }

    const acc = boosting ? 1250 : 780;
    fwd += acc * inp.thr * dt;
    const maxS = (boosting ? 445 : 300) * (c.player ? 1 : 0.92 + this.hud.level * 0.012);
    fwd = clamp(fwd, -130, maxS);
    if (inp.thr < 0.05) fwd *= Math.exp(-2.2 * dt);

    const brake = inp.brake;
    const grip = brake ? 2.2 : boosting ? 5.2 : 11;
    const turn = (brake ? 5.9 : boosting ? 3.9 : 4.5) * (1 + Math.min(0.22, this.hud.level * 0.012));
    const auth = Math.max(inp.thr !== 0 ? 0.36 : 0, clamp(Math.abs(fwd) / 70, 0, 1));
    const dir = fwd >= 0 ? 1 : -1;
    c.av = inp.str * turn * auth * dir;
    c.a += c.av * dt;
    c.steerVis = lerp(c.steerVis, inp.str, 1 - Math.exp(-14 * dt));
    c.wheels += fwd * dt * 0.35;

    const nfx = Math.cos(c.a);
    const nfy = Math.sin(c.a);
    const rx = -nfy;
    const ry = nfx;
    let lat = c.vx * rx + c.vy * ry;
    c.drift = Math.abs(lat);
    lat *= Math.exp(-grip * dt);
    if (brake) fwd *= Math.exp(-0.9 * dt);

    c.px = c.x;
    c.py = c.y;
    c.vx = nfx * fwd + rx * lat;
    c.vy = nfy * fwd + ry * lat;
    c.x += c.vx * dt;
    c.y += c.vy * dt;

    /* barrier — hard slam bounces, a graze slides. Never eats speed frame after frame. */
    const R = 13;
    const lo = TILE + R;
    const hi = WORLD - TILE - R;
    if (c.x < lo) {
      c.x = lo;
      if (c.vx < 0) {
        this.wallHit(c, -c.vx);
        c.vx = c.vx < -150 ? -c.vx * 0.36 : 0;
      }
    } else if (c.x > hi) {
      c.x = hi;
      if (c.vx > 0) {
        this.wallHit(c, c.vx);
        c.vx = c.vx > 150 ? -c.vx * 0.36 : 0;
      }
    }
    if (c.y < lo) {
      c.y = lo;
      if (c.vy < 0) {
        this.wallHit(c, -c.vy);
        c.vy = c.vy < -150 ? -c.vy * 0.36 : 0;
      }
    } else if (c.y > hi) {
      c.y = hi;
      if (c.vy > 0) {
        this.wallHit(c, c.vy);
        c.vy = c.vy > 150 ? -c.vy * 0.36 : 0;
      }
    }

    if (c.invuln > 0) c.invuln -= dt;

    /* never let a car grind itself into a corner and die helplessly */
    if (Math.hypot(c.vx, c.vy) < 26) {
      c.stuck += dt;
      if (c.stuck > 0.45) {
        c.stuck = -0.8;
        const cx = WORLD / 2 - c.x;
        const cy = WORLD / 2 - c.y;
        const m = Math.hypot(cx, cy) || 1;
        const ang = Math.abs(c.vx * (cx / m) + c.vy * (cy / m)) > 0 ? Math.atan2(cy, cx) : c.a;
        c.a = ang;
        c.vx = Math.cos(ang) * 200;
        c.vy = Math.sin(ang) * 200;
        c.steerVis = 0;
        if (c.player) {
          this.pop(c.x, c.y - 20, "REVERSE!", "#ffffff", 14);
          sfx.bump();
        }
      }
    } else if (c.stuck > 0) c.stuck = 0;
    else if (c.stuck < 0) c.stuck += dt;

    /* skids */
    if (c.drift > 55 || (brake && Math.abs(fwd) > 60)) {
      const bx = c.x - nfx * 9;
      const by = c.y - nfy * 9;
      this.skids.push({ x: bx + rx * 7, y: by + ry * 7, a: c.a, l: 1 });
      this.skids.push({ x: bx - rx * 7, y: by - ry * 7, a: c.a, l: 1 });
      if (this.skids.length > 460) this.skids.splice(0, this.skids.length - 460);
      if (Math.random() < 0.4) this.smoke(c, false);
    }

    this.carve(c);
    this.checkFall(c);
  }

  /** after a bump, guarantee a car still has drive so it can escape its own trail */
  private keepRolling(c: Car) {
    const sp = Math.hypot(c.vx, c.vy);
    if (sp < 145 && c.fall <= 0 && c.respawn <= 0) {
      const k = sp < 1 ? 1 : 145 / sp;
      c.vx *= k;
      c.vy *= k;
    }
  }

  private wallHit(c: Car, impact: number) {
    if (impact > 110) {
      this.shakeIt(Math.min(4, impact / 90));
      sfx.bump();
      this.burst(c.x, c.y, 5, c.glow, 1);
    }
  }

  private smoke(c: Car, hot: boolean) {
    if (this.parts.length > 420) return;
    const fx = Math.cos(c.a);
    const fy = Math.sin(c.a);
    this.parts.push({
      x: c.x - fx * 12 + rnd(-3, 3),
      y: c.y - fy * 12 + rnd(-3, 3),
      z: 0,
      vx: -fx * rnd(20, 70) + rnd(-20, 20),
      vy: -fy * rnd(20, 70) + rnd(-20, 20),
      vz: rnd(10, 40),
      life: hot ? 0.4 : 0.55,
      max: 0.55,
      size: rnd(4, 9),
      rot: rnd(0, 6),
      vr: rnd(-4, 4),
      c: hot ? (Math.random() < 0.5 ? "#ffd070" : "#ff8a3d") : "#8fa3c8",
      kind: 2,
    });
  }

  /* ---------------- tiles ---------------- */

  private carve(c: Car) {
    const dx = c.x - c.px;
    const dy = c.y - c.py;
    const dist = Math.hypot(dx, dy);
    const steps = Math.min(8, Math.max(1, Math.ceil(dist / (TILE * 0.42))));
    const wide = c.boosting;
    const nx = -Math.sin(c.a);
    const ny = Math.cos(c.a);
    for (let i = 1; i <= steps; i++) {
      if (!c.player && (i & 1) === 0) continue;
      const t = i / steps;
      const x = c.px + dx * t;
      const y = c.py + dy * t;
      this.crackAt(x, y, c);
      if (wide) {
        this.crackAt(x + nx * TILE * 0.9, y + ny * TILE * 0.9, c);
        this.crackAt(x - nx * TILE * 0.9, y - ny * TILE * 0.9, c);
      }
    }
  }

  private crackAt(x: number, y: number, c: Car) {
    const i = this.tileAt(x, y);
    if (i < 0) return;
    if (this.state[i] !== SOLID) return;
    this.state[i] = CRACK;
    this.timer[i] = (c.player ? 1.15 : 1.3) * (1 - Math.min(0.38, (this.hud.level - 1) * 0.035));
    this.owner[i] = c.player ? 0 : -2;
    this.dirty.add(i);
    this.cracked.push(i);
    if (c.player) {
      this.chainT = 1.5;
      this.chain++;
      const m = Math.min(6, 1 + Math.floor(this.chain / 6));
      if (m > this.hud.mult) {
        this.hud.mult = m;
        sfx.combo(m);
        this.pop(c.x, c.y - 22, "x" + m, "#ffe066", 22);
        this.shakeIt(2.5);
      }
    }
  }

  private tilesUpdate(dt: number) {
    for (let i = this.cracked.length - 1; i >= 0; i--) {
      const idx = this.cracked[i];
      if (this.state[idx] !== CRACK) {
        this.cracked[i] = this.cracked[this.cracked.length - 1];
        this.cracked.pop();
        continue;
      }
      this.timer[idx] -= dt;
      if (this.timer[idx] <= 0) this.breakTile(idx, this.owner[idx]);
    }
    for (let i = this.holes.length - 1; i >= 0; i--) {
      const idx = this.holes[i];
      if (this.state[idx] !== HOLE) {
        this.holes[i] = this.holes[this.holes.length - 1];
        this.holes.pop();
        continue;
      }
      this.timer[idx] -= dt;
      if (this.timer[idx] <= 0) this.rebuildTile(idx);
    }
    for (let i = this.warns.length - 1; i >= 0; i--) {
      const w = this.warns[i];
      w.t -= dt;
      if (w.t <= 0) {
        this.warns.splice(i, 1);
        if (this.state[w.i] === SOLID) this.breakTile(w.i, -1);
      }
    }
  }

  private breakTile(i: number, own: number) {
    if (this.state[i] === HOLE) return;
    this.state[i] = HOLE;
    this.timer[i] = Math.max(REGEN_MIN, REGEN - (this.hud.level - 1) * 0.12);
    this.holes.push(i);
    this.dirty.add(i);
    this.miniPixel(i);
    const tx = i % GRID;
    const ty = (i / GRID) | 0;
    const cx = tx * TILE + TILE / 2;
    const cy = ty * TILE + TILE / 2;
    this.debris(cx, cy);
    this.shakeIt(0.9);
    sfx.crack(this.chain);
    if (own === 0 && this.phase === "playing") {
      const fever = this.hud.fever > 0 ? 2 : 1;
      const add = 8 * this.hud.mult * fever;
      this.hud.score += add;
      this.hud.tiles++;
      if (this.hud.tiles % 5 === 0) this.pop(cx, cy, "+" + add, "#9ef7ff", 15);
      const nl = 1 + Math.floor(this.hud.tiles / 70);
      if (nl > this.hud.level) this.levelUp(nl);
      if (this.hud.tiles > 0 && this.hud.tiles % 160 === 0 && this.hud.fever <= 0) {
        this.hud.fever = 8;
        this.setBanner("FEVER x2", "EVERYTHING IS CRUMBLING");
        sfx.levelUp();
        this.rings.push({
          x: cx,
          y: cy,
          life: 0.7,
          max: 0.7,
          r0: 20,
          r1: 380,
          c: "#ffe066",
          w: 6,
        });
      }
    }
  }

  private levelUp(nl: number) {
    this.hud.level = nl;
    this.setBanner("LEVEL " + nl, "ARENA DECAYING FASTER");
    sfx.levelUp();
    this.flashUp(0.35, "160,220,255");
    for (const c of this.cars) if (!c.player) c.skill = Math.min(1.5, c.skill + 0.07);
    if ((nl === 5 || nl === 9) && this.cars.length < 4) {
      const col = RIVCOL[this.cars.length % RIVCOL.length];
      const spot = this.findSafeTile();
      const r = this.mkCar(
        this.cars.length,
        false,
        col,
        (spot % GRID) * TILE + TILE / 2,
        ((spot / GRID) | 0) * TILE + TILE / 2,
        rnd(0, 6.28),
      );
      r.skill = 0.95;
      this.cars.push(r);
      this.hud.rivals = this.cars.length - 1;
      this.rings.push({
        x: r.x,
        y: r.y,
        life: 0.6,
        max: 0.6,
        r0: 5,
        r1: 120,
        c: col[0],
        w: 4,
      });
    }
  }

  private collapse(dt: number) {
    if (this.phase !== "playing" && !this.attract) return;
    this.collapseT -= dt;
    if (this.collapseT > 0) return;
    const lv = this.hud.level;
    this.collapseT = Math.max(2.6, 6.2 - lv * 0.28) * (this.hud.fever > 0 ? 0.65 : 1);
    const cands: number[] = [];
    for (let tries = 0; tries < 260 && cands.length < 40; tries++) {
      const tx = 1 + ((Math.random() * (GRID - 2)) | 0);
      const ty = 1 + ((Math.random() * (GRID - 2)) | 0);
      const i = this.idx(tx, ty);
      if (this.state[i] !== SOLID) continue;
      if (
        this.state[i - 1] !== SOLID ||
        this.state[i + 1] !== SOLID ||
        this.state[i - GRID] !== SOLID ||
        this.state[i + GRID] !== SOLID
      )
        cands.push(i);
    }
    const n = Math.min(cands.length, 2 + Math.floor(lv / 2));
    for (let k = 0; k < n; k++) {
      const c = cands.splice((Math.random() * cands.length) | 0, 1)[0];
      if (c === undefined) break;
      this.warns.push({ i: c, t: 0.95 });
    }
  }

  /* ---------------- pickups ---------------- */

  private pickupsUpdate(dt: number) {
    this.pickupT -= dt;
    if (this.pickupT <= 0) {
      this.pickupT = rnd(2.6, 4.4);
      if (this.pickups.length < 3) {
        const i = this.findSafeTile();
        if (i >= 0)
          this.pickups.push({
            x: (i % GRID) * TILE + TILE / 2,
            y: ((i / GRID) | 0) * TILE + TILE / 2,
            t: 0,
          });
      }
    }
    for (const p of this.pickups) p.t += dt;
  }

  private pickupCollect() {
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      for (const c of this.cars) {
        if (c.respawn > 0 || c.fall > 0) continue;
        if (Math.hypot(c.x - p.x, c.y - p.y) < 20) {
          this.pickups.splice(i, 1);
          this.rings.push({
            x: p.x,
            y: p.y,
            life: 0.45,
            max: 0.45,
            r0: 6,
            r1: 90,
            c: "#ffe066",
            w: 3,
          });
          this.burst(p.x, p.y, 14, "#ffe066", 1);
          if (c.player) {
            const fever = this.hud.fever > 0 ? 2 : 1;
            const add = 150 * this.hud.mult * fever;
            this.hud.score += add;
            this.hud.boost = 1;
            this.pop(p.x, p.y - 10, "+" + add, "#ffe066", 19);
            this.pop(p.x, p.y + 10, "NITRO FULL", "#9ef7ff", 12);
          }
          sfx.pickup();
          this.shakeIt(2.2);
          break;
        }
      }
    }
  }

  private findSafeTile() {
    for (let tries = 0; tries < 200; tries++) {
      const tx = 1 + ((Math.random() * (GRID - 2)) | 0);
      const ty = 1 + ((Math.random() * (GRID - 2)) | 0);
      const i = this.idx(tx, ty);
      if (this.state[i] !== SOLID) continue;
      let ok = true;
      for (const c of this.cars)
        if (Math.hypot(c.x - (tx * TILE + 16), c.y - (ty * TILE + 16)) < TILE * 2.2) ok = false;
      if (!ok) continue;
      return i;
    }
    /* fallback: any solid tile */
    for (let tries = 0; tries < 120; tries++) {
      const tx = 1 + ((Math.random() * (GRID - 2)) | 0);
      const ty = 1 + ((Math.random() * (GRID - 2)) | 0);
      const i = this.idx(tx, ty);
      if (this.state[i] === SOLID) return i;
    }
    return -1;
  }

  /* ---------------- falling ---------------- */

  private checkFall(c: Car) {
    if (c.fall > 0 || c.respawn > 0) return;
    const i = this.tileAt(c.x, c.y);
    const over = i >= 0 && this.state[i] === HOLE;
    if (!over) {
      if (c.grace <= 0) {
        if (c.graced && c.player && !this.attract) {
          sfx.save();
          this.hud.score += 25;
          this.pop(c.x, c.y - 20, "SAVED! +25", "#9ef7ff", 17);
          this.burst(c.x, c.y, 8, "#9ef7ff", 1);
        }
        c.graced = false;
      }
      return;
    }
    if (c.grace > 0) return;
    if (c.graced) {
      this.startFall(c, i);
      return;
    }
    /* teeter on the edge — a moment to power out of the gap */
    c.graced = true;
    c.grace = c.player ? 0.36 : 0.1;
    if (c.player) {
      if (!this.attract) {
        sfx.whoa();
        this.pop(c.x, c.y - 20, "CLOSE!", "#ffffff", 15);
        this.shakeIt(3.5);
        this.timeScale = Math.min(this.timeScale, 0.7);
      }
    }
  }

  private startFall(c: Car, i: number) {
    c.grace = 0;
    c.fall = 0.001;
    c.fx = (i % GRID) * TILE + TILE / 2;
    c.fy = ((i / GRID) | 0) * TILE + TILE / 2;
    c.vx *= 0.2;
    c.vy *= 0.2;
    this.shakeIt(c.player ? 12 : 7);
    sfx.fall();
    this.burst(c.x, c.y, 12, c.glow, 1);
    this.rings.push({
      x: c.fx,
      y: c.fy,
      life: 0.5,
      max: 0.5,
      r0: 4,
      r1: 70,
      c: c.color,
      w: 3,
    });
    if (c.player) {
      if (!this.attract) {
        this.flashUp(0.6, "255,60,90");
        this.timeScale = 0.45;
      }
    } else {
      this.freeze = 0.055;
      this.timeScale = 0.35;
      this.flashUp(0.28, "255,190,60");
    }
  }

  private resolveFall(c: Car) {
    c.fall = 0;
    c.dead = true;
    this.debris(c.fx, c.fy);
    this.debris(c.fx, c.fy);
    if (c.player) {
      if (this.attract) {
        this.spawnCar(c);
        return;
      }
      this.hud.lives--;
      if (this.hud.lives <= 0) {
        this.gameOver();
      } else {
        c.respawn = 1.15;
        this.setBanner(
          this.hud.lives + (this.hud.lives === 1 ? " CAR LEFT" : " CARS LEFT"),
          "RESPAWNING",
        );
      }
    } else {
      if (this.phase === "playing") {
        const fever = this.hud.fever > 0 ? 2 : 1;
        const add = (250 + this.hud.level * 50) * fever;
        this.hud.score += add;
        this.hud.drops++;
        this.pop(c.fx, c.fy - 14, "DROPPED! +" + add, "#ffd24d", 24);
        this.rings.push({
          x: c.fx,
          y: c.fy,
          life: 0.7,
          max: 0.7,
          r0: 10,
          r1: 200,
          c: "#ffd24d",
          w: 5,
        });
      }
      c.respawn = this.attract ? 1.6 : 2.6;
    }
  }

  private spawnCar(c: Car) {
    const i = this.findSafeTile();
    if (i < 0) {
      c.respawn = 0.4;
      return;
    }
    c.x = (i % GRID) * TILE + TILE / 2;
    c.y = ((i / GRID) | 0) * TILE + TILE / 2;
    c.px = c.x;
    c.py = c.y;
    c.vx = 0;
    c.vy = 0;
    c.a = Math.atan2(WORLD / 2 - c.y, WORLD / 2 - c.x);
    c.fall = 0;
    c.grace = 0;
    c.graced = false;
    c.dead = false;
    c.invuln = 2.2;
    c.boost = 1;
    this.rings.push({ x: c.x, y: c.y, life: 0.5, max: 0.5, r0: 4, r1: 80, c: c.color, w: 3 });
    this.burst(c.x, c.y, 10, c.glow, 1);
  }

  private gameOver() {
    this.phase = "over";
    this.onPhase?.(this.phase);
    sfx.gameOver();
    sfx.engine(0, false);
    this.shakeIt(18);
    this.flashUp(0.8, "255,50,80");
    this.timeScale = 0.35;
    this.onOver?.({
      score: this.hud.score,
      level: this.hud.level,
      drops: this.hud.drops,
      tiles: this.hud.tiles,
      time: this.hud.time,
    });
  }

  /* ---------------- collisions ---------------- */

  private carCollisions() {
    for (let i = 0; i < this.cars.length; i++) {
      const a = this.cars[i];
      if (a.respawn > 0 || a.fall > 0) continue;
      for (let j = i + 1; j < this.cars.length; j++) {
        const b = this.cars[j];
        if (b.respawn > 0 || b.fall > 0) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        const min = 25;
        if (d > min || d === 0) continue;
        const nx = dx / d;
        const ny = dy / d;
        const push = (min - d) / 2;
        a.x -= nx * push;
        a.y -= ny * push;
        b.x += nx * push;
        b.y += ny * push;
        const rvx = b.vx - a.vx;
        const rvy = b.vy - a.vy;
        const vn = rvx * nx + rvy * ny;
        if (vn < 0) {
          const imp = -vn * 0.45;
          a.vx -= nx * imp;
          a.vy -= ny * imp;
          b.vx += nx * imp;
          b.vy += ny * imp;
          this.keepRolling(a);
          this.keepRolling(b);
          /* never let a bump leave a car crawling — that reads as unfair */
          if (Math.abs(vn) > 110) {
            const mx = (a.x + b.x) / 2;
            const my = (a.y + b.y) / 2;
            this.shakeIt(Math.min(6, Math.abs(vn) / 40));
            sfx.bump();
            this.burst(mx, my, 10, "#ffffff", 1);
            this.rings.push({
              x: mx,
              y: my,
              life: 0.3,
              max: 0.3,
              r0: 4,
              r1: 46,
              c: "#ffffff",
              w: 2,
            });
          }
        }
      }
    }
  }

  /* ---------------- ai ---------------- */

  private aiInput(c: Car, dt: number) {
    c.aiT -= dt;
    if (c.panic > 0) c.panic -= dt;
    if (c.aiT <= 0) {
      c.aiT = rnd(0.7, 1.5);
      const p = this.cars[0];
      const r = Math.random();
      if (r < 0.45 && !p.dead) {
        c.tx = p.x;
        c.ty = p.y;
      } else if (r < 0.6 && this.pickups.length) {
        const pk = this.pickups[(Math.random() * this.pickups.length) | 0];
        c.tx = pk.x;
        c.ty = pk.y;
      } else {
        const i = this.findSafeTile();
        const tx = i >= 0 ? (i % GRID) * TILE + 16 : WORLD / 2;
        const ty = i >= 0 ? ((i / GRID) | 0) * TILE + 16 : WORLD / 2;
        c.tx = tx;
        c.ty = ty;
      }
    }
    if (Math.random() < 0.0035) c.panic = rnd(0.25, 0.55);

    const speed = Math.hypot(c.vx, c.vy);
    let best = 1e9;
    let bestA = c.a;
    const look = 1.1 + speed / 300;
    for (let k = -3; k <= 3; k++) {
      const ang = c.a + k * 0.4;
      let cost = Math.abs(k) * 12;
      const dx = Math.cos(ang);
      const dy = Math.sin(ang);
      for (let s = 1; s <= 3; s++) {
        const px = c.x + dx * TILE * look * s * 0.75;
        const py = c.y + dy * TILE * look * s * 0.75;
        const i = this.tileAt(px, py);
        if (i < 0) {
          cost += 400;
          continue;
        }
        const st = this.state[i];
        if (st === WALL) cost += 260;
        else if (st === HOLE) cost += 200;
        else if (st === CRACK) cost += this.timer[i] < 0.3 ? 130 : 45;
        if (s === 1) {
          const i2 = this.tileAt(c.x + dx * TILE * 0.5, c.y + dy * TILE * 0.5);
          if (i2 >= 0 && this.state[i2] === HOLE) cost += 220;
        }
      }
      /* stay in arena */
      const ax = c.x + dx * TILE * 2.5;
      const ay = c.y + dy * TILE * 2.5;
      if (ax < TILE * 1.6 || ax > WORLD - TILE * 1.6) cost += 160;
      if (ay < TILE * 1.6 || ay > WORLD - TILE * 1.6) cost += 160;
      /* avoid over-cliff right behind when fast */
      if (cost < best) {
        best = cost;
        bestA = ang;
      }
    }

    let d = bestA - c.a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    let str = clamp(d * 2.4, -1, 1);
    let thr = 1;
    if (Math.abs(d) > 1.5 && speed > 150) thr = -1;
    else if (Math.abs(d) > 0.9) thr = 0.55;
    let boost = false;
    if (c.panic > 0) {
      str = clamp(str + (Math.random() - 0.5) * 1.6, -1, 1);
      boost = Math.random() < 0.3;
    } else {
      boost = Math.abs(d) < 0.2 && speed > 160 && Math.random() < 0.02 && c.boost > 0.4;
    }
    if (best > 420) thr = -1;
    c.boost = clamp(c.boost + (boost ? -dt * 0.4 : dt * 0.16), 0, 1);
    return { thr, str, boost, brake: false };
  }

  /* ---------------- fx helpers ---------------- */

  shakeIt(v: number) {
    this.shake = Math.min(26, this.shake + v);
    this.shakeR = Math.min(0.05, this.shakeR + v * 0.0016);
  }

  flashUp(v: number, col: string) {
    this.flash = Math.max(this.flash, v);
    this.flashCol = col;
  }

  pop(x: number, y: number, t: string, c: string, s: number) {
    if (this.pops.length > 26) this.pops.shift();
    this.pops.push({ x, y, vy: -46, life: 0.95, max: 0.95, t, c, s });
  }

  burst(x: number, y: number, n: number, c: string, kind: number) {
    for (let i = 0; i < n; i++) {
      if (this.parts.length > 520) break;
      const a = rnd(0, 6.283);
      const sp = rnd(40, 230);
      this.parts.push({
        x,
        y,
        z: 2,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        vz: rnd(80, 260),
        life: rnd(0.3, 0.7),
        max: 0.7,
        size: rnd(2, 4.5),
        rot: a,
        vr: rnd(-9, 9),
        c,
        kind,
      });
    }
  }

  private rebuildTile(i: number) {
    if (this.state[i] !== HOLE) return;
    this.state[i] = SOLID;
    this.timer[i] = 0;
    this.owner[i] = -1;
    this.dirty.add(i);
    this.miniPixel(i);
    const cx = (i % GRID) * TILE + TILE / 2;
    const cy = ((i / GRID) | 0) * TILE + TILE / 2;
    for (let k = 0; k < 3; k++) {
      if (this.parts.length > 480) break;
      this.parts.push({
        x: cx + rnd(-9, 9),
        y: cy + rnd(-9, 9),
        z: -14,
        vx: rnd(-12, 12),
        vy: rnd(-12, 12),
        vz: rnd(60, 150),
        life: 0.45,
        max: 0.45,
        size: rnd(3, 6),
        rot: rnd(0, 6),
        vr: rnd(-5, 5),
        c: "#4d6bd0",
        kind: 0,
      });
    }
  }

  private debris(x: number, y: number) {
    const n = 6;
    for (let i = 0; i < n; i++) {
      if (this.parts.length > 520) break;
      const a = rnd(0, 6.283);
      const sp = rnd(20, 110);
      this.parts.push({
        x: x + rnd(-10, 10),
        y: y + rnd(-10, 10),
        z: 6,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        vz: rnd(40, 160),
        life: rnd(0.5, 1.0),
        max: 1,
        size: rnd(5, 11),
        rot: rnd(0, 6),
        vr: rnd(-7, 7),
        c: Math.random() < 0.5 ? "#2c3a72" : "#1d2757",
        kind: 0,
      });
    }
  }

  private setBanner(t: string, sub: string) {
    this.banner = t;
    this.bannerSub = sub;
    this.bannerT = 1.6;
  }

  /* ---------------- floor rendering ---------------- */

  private tileHue(i: number) {
    const fever = this.hud.fever > 0;
    if (fever) return (210 + ((i * 37) % 140) + performance.now() * 0.06) % 360;
    return 226 + this.shade[i] * 16;
  }

  private drawTile(i: number) {
    const g = this.fctx;
    const tx = i % GRID;
    const ty = (i / GRID) | 0;
    const x = tx * TILE;
    const y = ty * TILE;
    const st = this.state[i];
    if (st === WALL) {
      g.fillStyle = "#0a0d1e";
      g.fillRect(x, y, TILE, TILE);
      g.fillStyle = "rgba(90,140,255,0.16)";
      g.fillRect(x + 2, y + 2, TILE - 4, TILE - 4);
      return;
    }
    if (st === HOLE) {
      g.fillStyle = "#04050c";
      g.fillRect(x, y, TILE, TILE);
      /* rim on edges adjacent to non-holes */
      g.lineWidth = 1.4;
      const up = ty > 0 ? this.state[i - GRID] : WALL;
      const dn = ty < GRID - 1 ? this.state[i + GRID] : WALL;
      const lf = tx > 0 ? this.state[i - 1] : WALL;
      const rt = tx < GRID - 1 ? this.state[i + 1] : WALL;
      g.strokeStyle = "rgba(120,170,255,0.5)";
      g.beginPath();
      if (up !== HOLE && up !== WALL) {
        g.moveTo(x, y + 1);
        g.lineTo(x + TILE, y + 1);
      }
      if (dn !== HOLE && dn !== WALL) {
        g.moveTo(x, y + TILE - 1);
        g.lineTo(x + TILE, y + TILE - 1);
      }
      if (lf !== HOLE && lf !== WALL) {
        g.moveTo(x + 1, y);
        g.lineTo(x + 1, y + TILE);
      }
      if (rt !== HOLE && rt !== WALL) {
        g.moveTo(x + TILE - 1, y);
        g.lineTo(x + TILE - 1, y + TILE);
      }
      g.stroke();
      return;
    }
    const cracked = st === CRACK;
    const h = this.tileHue(i);
    const l = (cracked ? 13 : 18) + this.shade[i] * 7;
    const sat = this.hud.fever > 0 ? 62 : 44;
    g.fillStyle = `hsl(${h}, ${sat}%, ${l}%)`;
    roundRect(g, x + 1.5, y + 1.5, TILE - 3, TILE - 3, 4);
    g.fill();
    /* top bevel highlight */
    g.fillStyle = `hsla(${h}, 60%, ${l + 12}%, 0.55)`;
    g.fillRect(x + 4, y + 3, TILE - 8, 2);
    /* inner panel */
    g.strokeStyle = `hsla(${h}, 70%, ${l + 22}%, 0.28)`;
    g.lineWidth = 1;
    roundRect(g, x + 5, y + 6, TILE - 10, TILE - 11, 3);
    g.stroke();
    if (cracked) {
      g.strokeStyle = "rgba(10,12,26,0.85)";
      g.lineWidth = 1.6;
      g.beginPath();
      const s = this.shade[i];
      g.moveTo(x + 6 + s * 8, y + 4);
      g.lineTo(x + 14 + s * 6, y + 16);
      g.lineTo(x + 8, y + 27);
      g.moveTo(x + 26 - s * 6, y + 6);
      g.lineTo(x + 18, y + 17);
      g.lineTo(x + 25, y + 27);
      g.moveTo(x + 4, y + 14 + s * 6);
      g.lineTo(x + 16, y + 17);
      g.lineTo(x + 28, y + 12 + s * 8);
      g.stroke();
    }
  }

  private miniPixel(i: number) {
    const tx = i % GRID;
    const ty = (i / GRID) | 0;
    const st = this.state[i];
    this.mctx.fillStyle =
      st === HOLE ? "#05060f" : st === WALL ? "#1a2247" : st === CRACK ? "#4d5fa8" : "#31406f";
    this.mctx.fillRect(tx, ty, 1, 1);
  }

  flushFloor() {
    for (const i of this.dirty) {
      this.drawTile(i);
      this.miniPixel(i);
    }
    this.dirty.clear();
  }

  refreshMini() {
    for (let i = 0; i < GRID * GRID; i++) this.miniPixel(i);
  }

  /* ---------------- render ---------------- */

  private render() {
    const ctx = this.ctx;
    const { vw, vh, dpr } = this;
    if (this.dirty.size) this.flushFloor();

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!bgGrad) {
      const g = ctx.createLinearGradient(0, 0, 0, vh);
      g.addColorStop(0, "#070a18");
      g.addColorStop(1, "#02030a");
      bgGrad = g;
    }
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, vw, vh);

    const sh = this.shake;
    const ox = sh ? rnd(-sh, sh) : 0;
    const oy = sh ? rnd(-sh, sh) : 0;
    const rot = sh ? rnd(-this.shakeR, this.shakeR) : 0;

    ctx.save();
    ctx.translate(vw / 2 + ox, vh / 2 + oy);
    ctx.rotate(rot);
    ctx.scale(this.camS, this.camS);
    ctx.translate(-this.camX, -this.camY);

    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.floor, 0, 0, WORLD, WORLD);

    /* cracked pulse + warnings */
    const now = performance.now();
    ctx.lineWidth = 2;
    for (let k = 0; k < this.cracked.length; k++) {
      const i = this.cracked[k];
      if (this.state[i] !== CRACK) continue;
      const p = 1 - Math.min(1, this.timer[i] / 1.15);
      const a = 0.12 + 0.22 * Math.abs(Math.sin(now * 0.02 + i));
      ctx.fillStyle = `rgba(255,90,120,${a})`;
      ctx.fillRect((i % GRID) * TILE + 1.5, ((i / GRID) | 0) * TILE + 1.5, TILE - 3, TILE - 3);
      if (p > 0.6) {
        ctx.strokeStyle = `rgba(255,160,80,${(p - 0.6) * 1.6})`;
        ctx.strokeRect(
          (i % GRID) * TILE + 2.5,
          ((i / GRID) | 0) * TILE + 2.5,
          TILE - 5,
          TILE - 5,
        );
      }
    }
    for (const w of this.warns) {
      const a = 0.25 + 0.45 * Math.abs(Math.sin(now * 0.025));
      ctx.fillStyle = `rgba(255,60,60,${a * 0.55})`;
      ctx.fillRect((w.i % GRID) * TILE + 1.5, ((w.i / GRID) | 0) * TILE + 1.5, TILE - 3, TILE - 3);
      ctx.strokeStyle = `rgba(255,120,90,${a})`;
      ctx.strokeRect(
        (w.i % GRID) * TILE + 2.5,
        ((w.i / GRID) | 0) * TILE + 2.5,
        TILE - 5,
        TILE - 5,
      );
    }

    /* tiles about to rebuild rise up */
    for (const i of this.holes) {
      if (this.state[i] !== HOLE) continue;
      const left = this.timer[i];
      if (left > 1.6) continue;
      const t = 1 - left / 1.6;
      const a = t * t * 0.55;
      ctx.fillStyle = `rgba(90,150,255,${a * (0.6 + 0.4 * Math.sin(now * 0.02))})`;
      ctx.fillRect((i % GRID) * TILE + 1.5, ((i / GRID) | 0) * TILE + 1.5, TILE - 3, TILE - 3);
    }

    /* skids */
    if (this.skids.length) {
      ctx.strokeStyle = "rgba(10,12,25,0.5)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (const s of this.skids) {
        const dx = Math.cos(s.a) * 5;
        const dy = Math.sin(s.a) * 5;
        ctx.moveTo(s.x - dx, s.y - dy);
        ctx.lineTo(s.x + dx, s.y + dy);
      }
      ctx.stroke();
    }

    /* pickups */
    for (const p of this.pickups) {
      const b = 0.7 + 0.3 * Math.sin(p.t * 6);
      const g = glow("#ffd24d");
      ctx.globalAlpha = 0.55 * b;
      ctx.drawImage(g, p.x - 26, p.y - 26, 52, 52);
      ctx.globalAlpha = 1;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.t * 1.6);
      ctx.fillStyle = "#ffe9a3";
      roundRect(ctx, -6, -6, 12, 12, 3);
      ctx.fill();
      ctx.fillStyle = "#ff9b2f";
      roundRect(ctx, -3, -3, 6, 6, 2);
      ctx.fill();
      ctx.restore();
    }

    /* rings */
    for (const r of this.rings) {
      const t = 1 - r.life / r.max;
      ctx.globalAlpha = (1 - t) * 0.9;
      ctx.strokeStyle = r.c;
      ctx.lineWidth = r.w * (1 - t * 0.6);
      ctx.beginPath();
      ctx.arc(r.x, r.y, lerp(r.r0, r.r1, 1 - (1 - t) * (1 - t)), 0, 6.283);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    /* cars */
    for (const c of this.cars) {
      if (c.respawn > 0) continue;
      this.drawCar(ctx, c, now);
    }

    /* particles */
    for (const p of this.parts) {
      const t = p.life / p.max;
      if (p.kind === 2) {
        ctx.globalAlpha = t * 0.5;
        ctx.fillStyle = p.c;
        ctx.beginPath();
        ctx.arc(p.x, p.y - p.z * 0.4, p.size * (1.6 - t), 0, 6.283);
        ctx.fill();
      } else if (p.kind === 0) {
        ctx.globalAlpha = Math.min(1, t * 1.6);
        ctx.fillStyle = p.c;
        ctx.save();
        ctx.translate(p.x, p.y - p.z * 0.6);
        ctx.rotate(p.rot);
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx.restore();
      } else {
        ctx.globalAlpha = t;
        ctx.fillStyle = p.c;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2 - p.z * 0.5, p.size, p.size);
      }
    }
    ctx.globalAlpha = 1;

    /* popups */
    ctx.textAlign = "center";
    for (const p of this.pops) {
      const t = p.life / p.max;
      const s = p.s * (0.7 + (1 - t) * 0.45);
      ctx.globalAlpha = Math.min(1, t * 1.8);
      ctx.font = `900 ${s}px ui-monospace, Menlo, monospace`;
      ctx.lineWidth = 4;
      ctx.strokeStyle = "rgba(4,6,16,0.85)";
      ctx.strokeText(p.t, p.x, p.y);
      ctx.fillStyle = p.c;
      ctx.fillText(p.t, p.x, p.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    /* banner (world-ish, screen space) */
    if (this.bannerT > 0 && this.phase !== "menu") {
      const t = this.bannerT;
      const a = Math.min(1, t * 2.2) * Math.min(1, (1.6 - t) * 6);
      ctx.save();
      ctx.translate(vw / 2, vh * 0.26);
      const sc = 1 + (1 - Math.min(1, (1.6 - t) * 6)) * 0.25;
      ctx.scale(sc, sc);
      ctx.globalAlpha = a;
      ctx.textAlign = "center";
      ctx.font = `900 ${Math.min(64, vw * 0.09)}px ui-monospace, Menlo, monospace`;
      ctx.lineWidth = 8;
      ctx.strokeStyle = "rgba(4,6,16,0.9)";
      ctx.strokeText(this.banner, 0, 0);
      ctx.fillStyle = "#fff";
      ctx.fillText(this.banner, 0, 0);
      ctx.font = `700 ${Math.min(16, vw * 0.032)}px ui-monospace, Menlo, monospace`;
      ctx.fillStyle = "#9ef7ff";
      ctx.fillText(this.bannerSub, 0, 26);
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    /* off-screen rival markers */
    this.drawMarkers(ctx);

    /* minimap */
    this.drawMini(ctx);

    /* vignette + flash */
    if (!vigGrad || vigW !== vw || vigH !== vh) {
      vigW = vw;
      vigH = vh;
      const vg = ctx.createRadialGradient(
        vw / 2,
        vh / 2,
        Math.min(vw, vh) * 0.34,
        vw / 2,
        vh / 2,
        Math.max(vw, vh) * 0.78,
      );
      vg.addColorStop(0, "rgba(0,0,0,0)");
      vg.addColorStop(1, "rgba(0,0,0,0.72)");
      vigGrad = vg;
    }
    ctx.fillStyle = vigGrad;
    ctx.fillRect(0, 0, vw, vh);

    if (this.flash > 0.01) {
      ctx.fillStyle = `rgba(${this.flashCol},${Math.min(0.55, this.flash)})`;
      ctx.fillRect(0, 0, vw, vh);
    }
    if (this.hud.fever > 0) {
      ctx.fillStyle = `rgba(255,200,60,${0.05 + 0.03 * Math.sin(now * 0.01)})`;
      ctx.fillRect(0, 0, vw, vh);
    }
    if (this.hud.lives === 1 && this.phase === "playing") {
      const a = 0.12 + 0.1 * Math.sin(now * 0.006);
      const g2 = ctx.createLinearGradient(0, vh, 0, vh - vh * 0.35);
      g2.addColorStop(0, `rgba(255,40,80,${a})`);
      g2.addColorStop(1, "rgba(255,40,80,0)");
      ctx.fillStyle = g2;
      ctx.fillRect(0, vh - vh * 0.35, vw, vh * 0.35);
    }
  }

  private drawCar(ctx: CanvasRenderingContext2D, c: Car, now: number) {
    let scale = 1;
    let sink = 0;
    let alpha = 1;
    let ang = c.a;
    if (c.fall > 0) {
      const t = Math.min(1, c.fall);
      scale = 1 - t * 0.85;
      sink = t * t * 26;
      alpha = 1 - t * 0.7;
      ang = c.a + t * 5;
    }
    if (c.invuln > 0 && c.fall <= 0) alpha = 0.45 + 0.4 * Math.abs(Math.sin(now * 0.02));

    ctx.save();
    ctx.globalAlpha = alpha;
    /* shadow */
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.beginPath();
    ctx.ellipse(c.x + 3, c.y + 6 + sink * 0.5, 13 * scale, 9 * scale, ang, 0, 6.283);
    ctx.fill();

    /* ground glow */
    const gl = glow(c.color);
    ctx.globalAlpha = alpha * (0.3 + (c.boosting ? 0.4 : 0) + c.drift / 600);
    ctx.drawImage(gl, c.x - 30, c.y - 30, 60, 60);
    ctx.globalAlpha = alpha;

    ctx.translate(c.x, c.y + sink);
    ctx.rotate(ang);
    ctx.scale(scale, scale);

    const B = 26;
    const H = 15;
    /* wheels */
    ctx.fillStyle = "#0c0f1c";
    const wy = 7.4;
    const wx = 8.5;
    for (const sy of [-1, 1]) {
      for (const sx of [-1, 1]) {
        ctx.save();
        ctx.translate(sx * wx, sy * wy);
        if (sx > 0) ctx.rotate(c.steerVis * 0.42);
        roundRect(ctx, -4.2, -2.4, 8.4, 4.8, 1.6);
        ctx.fill();
        ctx.restore();
      }
    }
    /* body */
    const grad = ctx.createLinearGradient(0, -H / 2, 0, H / 2);
    grad.addColorStop(0, c.glow);
    grad.addColorStop(0.45, c.color);
    grad.addColorStop(1, c.dark);
    ctx.fillStyle = grad;
    roundRect(ctx, -B / 2, -H / 2, B, H, 4.5);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 1;
    roundRect(ctx, -B / 2, -H / 2, B, H, 4.5);
    ctx.stroke();
    /* cockpit */
    ctx.fillStyle = "rgba(8,12,26,0.85)";
    roundRect(ctx, -3.5, -5, 8, 10, 3);
    ctx.fill();
    ctx.fillStyle = "rgba(160,220,255,0.5)";
    roundRect(ctx, 2.5, -4.2, 2.6, 8.4, 1.2);
    ctx.fill();
    /* nose */
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillRect(B / 2 - 2.5, -5, 2, 3.2);
    ctx.fillRect(B / 2 - 2.5, 1.8, 2, 3.2);
    /* tail lights */
    ctx.fillStyle = c.boosting ? "#fff2b0" : "#ff4d5e";
    ctx.fillRect(-B / 2 + 0.5, -5.5, 2, 4);
    ctx.fillRect(-B / 2 + 0.5, 1.5, 2, 4);
    /* spoiler */
    ctx.fillStyle = c.dark;
    ctx.fillRect(-B / 2 - 1.5, -H / 2 + 1, 2.5, H - 2);
    ctx.restore();

    /* boost flame (screen additive) */
    if (c.boosting && c.fall <= 0) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.75;
      ctx.translate(c.x, c.y + sink);
      ctx.rotate(ang);
      const f = 1 + Math.random() * 0.5;
      const g2 = glow("#ffb037");
      ctx.drawImage(g2, -26 * f, -11 * f, 26 * f, 22 * f);
      ctx.restore();
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    }
  }

  private drawMarkers(ctx: CanvasRenderingContext2D) {
    const p = this.cars[0];
    const pad = 26;
    for (const c of this.cars) {
      if (c.player || c.respawn > 0 || c.fall > 0) continue;
      const sx = (c.x - this.camX) * this.camS + this.vw / 2;
      const sy = (c.y - this.camY) * this.camS + this.vh / 2;
      if (sx > pad && sx < this.vw - pad && sy > pad && sy < this.vh - pad) continue;
      const ang = Math.atan2(c.y - p.y, c.x - p.x);
      const rx = this.vw / 2 - pad;
      const ry = this.vh / 2 - pad;
      const t = Math.min(
        Math.abs(rx / (Math.cos(ang) || 1e-4)),
        Math.abs(ry / (Math.sin(ang) || 1e-4)),
      );
      const mx = this.vw / 2 + Math.cos(ang) * t;
      const my = this.vh / 2 + Math.sin(ang) * t;
      ctx.save();
      ctx.translate(mx, my);
      ctx.rotate(ang);
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = c.color;
      ctx.beginPath();
      ctx.moveTo(9, 0);
      ctx.lineTo(-6, 6);
      ctx.lineTo(-6, -6);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.globalAlpha = 1;
    }
  }

  miniTop = 58;

  private drawMini(ctx: CanvasRenderingContext2D) {
    if (this.phase === "menu") return;
    const size = Math.min(96, Math.max(60, this.vw * 0.16));
    const pad = 14;
    const x = this.vw - size - pad;
    const y = this.miniTop;
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = "rgba(4,6,16,0.6)";
    roundRect(ctx, x - 4, y - 4, size + 8, size + 8, 6);
    ctx.fill();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.mini, x, y, size, size);
    ctx.imageSmoothingEnabled = true;
    const k = size / WORLD;
    for (const c of this.cars) {
      if (c.respawn > 0) continue;
      ctx.fillStyle = c.player ? "#22e6ff" : c.color;
      const r = c.player ? 2.6 : 2;
      ctx.beginPath();
      ctx.arc(x + c.x * k, y + c.y * k, r, 0, 6.283);
      ctx.fill();
    }
    ctx.strokeStyle = "rgba(120,170,255,0.35)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, size, size);
    ctx.restore();
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
