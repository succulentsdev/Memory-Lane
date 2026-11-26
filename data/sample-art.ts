// Sample "photos" for the demo scrapbook, drawn in code as small flat-illustration SVG postcards.
// No image files: everything is a data URL, so the static export works anywhere.

export type SceneKind =
  | "rose-garden"
  | "japanese-garden"
  | "museum"
  | "bridge-truss"
  | "bridge-lift"
  | "bridge-cable"
  | "bridge-suspension"
  | "cafe"
  | "city-square"
  | "beach-haystack"
  | "forest-trail"
  | "column"
  | "lighthouse"
  | "viewpoint"
  | "cliffs-sunset"
  | "palm-park"
  | "old-town"
  | "pasture"
  | "cove";

export interface SceneOptions {
  /** Gaussian blur radius in scene units (≈ px at 400px wide). 0 = crisp. */
  blur?: number;
  /** Output width/height attributes. Defaults: 800×600 landscape or 600×800 portrait. */
  w?: number;
  h?: number;
  /** Force orientation; otherwise picked by seed (about one in four is portrait). */
  portrait?: boolean;
  /** Accent color for bridges and similar painted structures. */
  tint?: string;
}

// --- tiny helpers -----------------------------------------------------------

function rng(seed: number): () => number {
  let a = (seed * 2654435761) >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type R = () => number;
const ri = (r: R, a: number, b: number) => Math.round(a + r() * (b - a));
const pick = <T,>(r: R, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];

const rc = (x: number, y: number, w: number, h: number, f: string, ex = "") =>
  `<rect x='${x}' y='${y}' width='${w}' height='${h}' fill='${f}'${ex}/>`;
const ci = (x: number, y: number, rad: number, f: string, ex = "") => `<circle cx='${x}' cy='${y}' r='${rad}' fill='${f}'${ex}/>`;
const el = (x: number, y: number, rx: number, ry: number, f: string, ex = "") =>
  `<ellipse cx='${x}' cy='${y}' rx='${rx}' ry='${ry}' fill='${f}'${ex}/>`;
const pa = (d: string, f: string, ex = "") => `<path d='${d}' fill='${f}'${ex}/>`;
const st = (d: string, s: string, w: number, ex = "") =>
  `<path d='${d}' fill='none' stroke='${s}' stroke-width='${w}'${ex}/>`;
/** A row of lit windows drawn as one dashed stroke. */
const win = (x: number, y: number, len: number, c = "#fde9b8", w = 5, dash = "5 6") =>
  st(`M${x} ${y}h${len}`, c, w, ` stroke-dasharray='${dash}'`);

interface Palette {
  top: string;
  bot: string;
  sun: string;
}
const SKIES: Palette[] = [
  { top: "#8fcbe2", bot: "#fde9c9", sun: "#ffd27a" }, // morning
  { top: "#79bde0", bot: "#eaf5ef", sun: "#fff1b8" }, // noon
  { top: "#f2a985", bot: "#fde2ae", sun: "#fff0bd" }, // golden
  { top: "#9fb7e6", bot: "#fbd9c4", sun: "#ffe3a1" }, // soft afternoon
];
const DUSK: Palette = { top: "#6f68c4", bot: "#f7a57f", sun: "#ffcf86" };

function cloud(x: number, y: number, s: number) {
  return `<g fill='#fff' opacity='.78'>${el(x, y, 26 * s, 8 * s, "#fff")}${el(x - 10 * s, y - 6 * s, 13 * s, 9 * s, "#fff")}${el(x + 8 * s, y - 8 * s, 15 * s, 11 * s, "#fff")}</g>`;
}

/** Two little travellers ("us"), optionally. */
function us(x: number, y: number, a = "#e0794a", b = "#2f8f83") {
  return `<g>${ci(x, y - 20, 4, "#6b4a3a")}${pa(`M${x - 5} ${y}v-11q0-5 5-5t5 5v11z`, a)}${ci(x + 13, y - 19, 4, "#3a2a24")}${pa(`M${x + 8} ${y}v-10q0-5 5-5t5 5v10z`, b)}</g>`;
}

function mtHood(x: number) {
  return pa(`M${x - 55} 190L${x} 118L${x + 55} 190z`, "#b8b2d0") + pa(`M${x - 14} 135L${x} 118L${x + 14} 135l-7 4-7-5-7 5z`, "#fff");
}

const river = (y = 200, c = "#5d93b0") =>
  rc(-60, y, 520, 140, c) + st(`M30 ${y + 18}h40M150 ${y + 30}h60M280 ${y + 14}h50M90 ${y + 48}h50`, "#cfe6ef", 2, " opacity='.7'");

const tree = (x: number, y: number, s: number, c = "#3f7d4a") =>
  rc(x - 2, y, 4, 14 * s, "#6b4a3a") + ci(x, y - 4 * s, 13 * s, c) + ci(x - 7 * s, y + 3 * s, 9 * s, c);

const pine = (x: number, y: number, h: number, c = "#2f5d46") =>
  pa(`M${x} ${y - h}L${x + h * 0.32} ${y}H${x - h * 0.32}z`, c);

const palm = (x: number, y: number, h: number) =>
  st(`M${x} ${y}q6 ${-h / 2} -2 ${-h}`, "#8a6040", 5) +
  st(`M${x - 2} ${y - h}q-22-6-30 8M${x - 2} ${y - h}q22-8 30 6M${x - 2} ${y - h}q-14-16-28-12M${x - 2} ${y - h}q12-18 26-14`, "#3f8a4e", 5, " stroke-linecap='round'");

// --- scenes (drawn in a 400×300 frame, horizon ≈ y190) ------------------------

type Scene = (r: R, opts: SceneOptions) => string;

const SCENES: Record<SceneKind, Scene> = {
  "rose-garden": (r) => {
    let s = mtHood(ri(r, 150, 260)) + pa("M-60 195Q60 160 180 188T460 182V220H-60z", "#7fae84") + rc(-60, 190, 520, 160, "#8cc06e");
    s += pa("M180 300L198 190h6L222 300z", "#ead8b4");
    const roses = ["#e0566f", "#f28aa0", "#f6c445", "#e8794a", "#fff1f0"];
    const dots: string[] = roses.map(() => "");
    let bush = "";
    for (let row = 0; row < 3; row++) {
      const y = 205 + row * 30;
      const rad = 3 + row;
      for (let x = -20 + (row % 2) * 18; x < 420; x += 44 + row * 8) {
        if (x > 170 && x < 230) continue;
        bush += `<ellipse cx='${x}' cy='${y}' rx='${17 + row * 4}' ry='${9 + row * 3}'/>`;
        for (let k = 0; k < 2; k++) dots[Math.floor(r() * roses.length)] += `<circle cx='${x - 6 + k * 12}' cy='${y - 3 + k * 3}' r='${rad}'/>`;
      }
    }
    s += `<g fill='#3f7d4a'>${bush}</g>` + dots.map((g, i) => (g ? `<g fill='${roses[i]}'>${g}</g>` : "")).join("");
    return s;
  },
  "japanese-garden": (r) => {
    let s = pa("M-60 190Q100 120 260 170T460 160V300H-60z", "#3d6b4f") + rc(-60, 195, 520, 120, "#6f9f62");
    s += el(200, 250, 190, 42, "#7fb8c4") + st("M70 250h40M240 262h60", "#d7eef2", 2);
    s += st("M110 245Q200 185 290 245", "#c8452f", 8) + st("M110 232Q200 172 290 232", "#c8452f", 3) + st("M140 228v12M170 212v12M200 205v12M230 212v12M260 228v12", "#c8452f", 3);
    const reds = ["#d9573b", "#e9894a", "#c4412f"];
    s += rc(48, 160, 6, 50, "#5a3b2c") + ci(40, 150, 26, pick(r, reds)) + ci(68, 140, 22, pick(r, reds)) + ci(55, 122, 18, pick(r, reds));
    s += pine(340, 215, 90) + pine(372, 220, 70, "#24503c");
    s += rc(305, 215, 6, 18, "#9a958c") + pa("M296 217h24l-12-9z", "#7e7a72") + rc(302, 233, 12, 4, "#7e7a72");
    return s;
  },
  museum: (r, o) => {
    const brick = o.tint ?? "#c98a63";
    let s = tree(40, 176, 1.6) + tree(368, 172, 1.8) + rc(-60, 205, 520, 120, "#cbbba6") + rc(-60, 203, 520, 4, "#b3a38d");
    s += rc(90, 92, 220, 113, brick) + rc(84, 86, 232, 10, "#e9dcc6") + pa("M84 86L200 58L316 86z", "#e9dcc6");
    for (let y = 112; y < 175; y += 22) s += win(104, y, 192, "#f3e3c3", 9, "9 9");
    s += rc(178, 168, 44, 37, "#5a3b2c") + pa("M178 168q22-16 44 0z", "#5a3b2c");
    const banners = ["#e0794a", "#2f8f83", "#c4517a", "#6d6bd1"];
    s += rc(118, 112, 14, 44, pick(r, banners)) + rc(268, 112, 14, 44, pick(r, banners));
    s += rc(160, 205, 80, 5, "#e9dcc6") + rc(150, 210, 100, 5, "#ddd0b8");
    return s;
  },
  "bridge-truss": (r, o) => bridgeTruss(r, o, false),
  "bridge-lift": (r, o) => bridgeTruss(r, o, true),
  "bridge-cable": (r) => {
    let s = mtHood(ri(r, 280, 340)) + city(r, 0.6) + river(205);
    s += pa("M-60 186Q200 170 460 186v6Q200 176-60 192z", "#ece8df");
    for (const tx of [130, 280]) {
      s += pa(`M${tx - 6} 210L${tx - 3} 60h6L${tx + 6} 210z`, "#f4f1ea");
      let c = "";
      for (let k = 1; k <= 6; k++) c += `M${tx} ${66 + k * 4}L${tx - k * 18} 182M${tx} ${66 + k * 4}L${tx + k * 18} 182`;
      s += st(c, "#fbf8f2", 1.3);
    }
    s += st("M-60 189Q200 173 460 189", "#c9c3b8", 1.5);
    return s;
  },
  "bridge-suspension": (r, o) => {
    const c = o.tint ?? "#c0583a";
    let s = pa("M-60 200Q80 150 200 185T460 175V220H-60z", "#7a9a86") + river(200);
    s += rc(-60, 176, 520, 7, "#4a4a52");
    let h = "";
    for (let x = 126; x < 276; x += 10) {
      const t = (x - 120) / 160;
      const y = (1 - t) * (1 - t) * 70 + 2 * t * (1 - t) * 175 + t * t * 70;
      h += `M${x} ${y.toFixed(0)}V176`;
    }
    s += st(h, c, 1.2) + st("M120 70Q200 175 280 70M-60 150Q60 130 120 70M280 70Q340 130 460 150", c, 3);
    s += rc(114, 62, 12, 150, c) + rc(274, 62, 12, 150, c) + rc(112, 100, 16, 5, c) + rc(272, 100, 16, 5, c);
    void r;
    return s;
  },
  cafe: (r) => {
    let s = city(r, 1);
    s += st("M200 -120V212M-60 90H460", "#7a4e33", 8);
    s += rc(-60, 200, 520, 120, "#a86c45") + rc(-60, 196, 520, 8, "#8a5535");
    const cx = ri(r, 150, 210);
    s += el(cx, 262, 52, 12, "#f3ece1") + pa(`M${cx - 32} 222h64l-6 34q-26 10-52 0z`, "#fffaf2") + st(`M${cx + 32} 230q16 0 12 14t-14 8`, "#fffaf2", 5);
    s += el(cx, 223, 31, 7, "#b97a4c") + pa(`M${cx} 230c-12-8-6-15 0-9c6-6 12 1 0 9z`, "#f8eadb");
    s += st(`M${cx - 8} 210q-6-10 0-18t0-18M${cx + 8} 208q-6-10 0-18`, "#fff", 2.5, " opacity='.7' stroke-linecap='round'");
    s += pa(`M${cx + 80} 262q30-36 64 0q-10 8-32 8t-32-8z`, "#e2a65a") + st(`M${cx + 96} 248l6 16M${cx + 112} 240v22M${cx + 128} 248l-6 16`, "#c07f3a", 2);
    return s;
  },
  "city-square": (r) => {
    let s = city(r, 1.2) + rc(-60, 190, 520, 140, "#c98d6c");
    s += st("M-60 215H460M-60 240H460M-60 268H460", "#b77a5a", 1.5) + st("M0 190v120M60 190v120M120 190v120M180 190v120M240 190v120M300 190v120M360 190v120", "#b77a5a", 1, " opacity='.5'");
    for (let i = 0; i < 4; i++) s += rc(40 + i * 14, 196 + i * 10, 320 - i * 28, 10, i % 2 ? "#d8a487" : "#e3b597");
    s += rc(60, 150, 3, 46, "#3c3a3a") + ci(61, 148, 5, "#fde9b8") + rc(338, 150, 3, 46, "#3c3a3a") + ci(339, 148, 5, "#fde9b8");
    const ppl = ["#2f8f83", "#c4517a", "#6d6bd1", "#d9a23b", "#e0794a"];
    for (let i = 0; i < 6; i++) {
      const x = ri(r, 20, 380);
      const y = ri(r, 250, 290);
      s += ci(x, y - 14, 3.5, "#5a3b2c") + rc(x - 4, y - 10, 8, 12, pick(r, ppl), " rx='3'");
    }
    return s;
  },
  "beach-haystack": (r) => {
    let s = rc(-60, 168, 520, 60, "#6fa9bd") + st("M20 180h30M120 186h40M300 178h30", "#e6f3f6", 2);
    const hx = ri(r, 190, 250);
    s += pa(`M${hx - 70} 215q8-70 34-104q22-22 44 0q30 40 36 104z`, "#4b3b36") + pa(`M${hx - 30} 115q20-16 38-4q-18 4-38 4z`, "#5b7a4a");
    s += pa(`M${hx + 70} 215l10-40 6 4 8 36z`, "#3f322e") + pa(`M${hx + 98} 215l5-24 7 24z`, "#3f322e");
    s += pa("M-60 212Q200 200 460 214V330H-60z", "#d7bf91") + pa("M-60 236Q200 222 460 240V330H-60z", "#ead6a8");
    s += st("M-60 214Q100 206 200 212T460 214", "#fff", 3, " opacity='.85'");
    s += st(`M${ri(r, 60, 140)} 70l6 5 6-5M${ri(r, 260, 340)} 58l5 4 5-4`, "#3a3a44", 1.8);
    s += el(ri(r, 60, 120), 270, 20, 5, "#b7d6dc");
    return s;
  },
  "forest-trail": (r) => {
    let s = "";
    for (let i = 0; i < 9; i++) s += pine(-20 + i * 55 + ri(r, -8, 8), 200, ri(r, 120, 170), "#5f8a6c");
    s += rc(-60, 196, 520, 130, "#557a4e") + pa("M210 300Q170 260 205 230T200 196h8Q238 228 214 252T262 300z", "#d8c49a");
    s += pa("M120 -100L170 -100L250 300L170 300z", "#fff", " opacity='.12'");
    for (let i = 0; i < 6; i++) s += pine(-40 + i * 90 + ri(r, -10, 10), 300, ri(r, 170, 230), i % 2 ? "#2f5d46" : "#24503c");
    s += st("M60 300q-10-30-30-40M60 300q6-28 26-40M330 300q-8-26-28-36", "#4f8a4e", 4, " stroke-linecap='round'");
    return s;
  },
  column: (r) => {
    let s = river(178, "#7fb0c2") + st("M-60 172L460 166", "#6a7280", 2.5);
    s += pa("M-60 215Q200 150 460 215V330H-60z", "#5e9160");
    s += tree(90, 196, 1.6, "#3f7d4a") + tree(320, 196, 1.8, "#356b40");
    s += rc(188, 46, 24, 150, "#ddcba6");
    s += st("M188 70l24-12M188 96l24-12M188 122l24-12M188 148l24-12M188 174l24-12", "#9c7b55", 6, " opacity='.7'");
    s += rc(182, 40, 36, 8, "#c9b48c") + pa("M190 40q10-16 20 0z", "#8aa27c") + rc(184, 192, 32, 8, "#c9b48c");
    s += st(`M${ri(r, 230, 300)} ${ri(r, 60, 90)}l14-4-8 8`, "#fff", 1.8);
    return s;
  },
  lighthouse: (r) => {
    let s = rc(-60, 176, 520, 160, "#5f97b4") + st("M20 200h40M100 222h50M40 252h40", "#d3e8ef", 2);
    const lx = ri(r, 235, 275);
    s += pa(`M150 300Q170 220 220 196T460 180V330z`, "#5a6b4a") + pa("M150 300Q200 246 260 232T460 220V330z", "#45583a");
    s += pa(`M${lx - 12} 196l4-66h16l4 66z`, "#fff") + rc(lx - 9, 150, 18, 7, "#c0583a") + rc(lx - 8, 114, 16, 16, "#3a3a44") + pa(`M${lx - 11} 114l11-12 11 12z`, "#c0583a");
    s += pa(`M${lx} 122L${lx - 170} 92V146z`, "#fff6cf", " opacity='.45'");
    s += pine(380, 196, 60, "#2f5d46");
    return s;
  },
  viewpoint: (r) => {
    let s = rc(-60, 160, 520, 170, "#6aa3b8") + pa("M200 168Q290 120 460 130V200H260z", "#4d7a5e") + pa("M300 168q20-26 40 0z", "#3f5a4a");
    for (let i = 0; i < 3; i++) {
      const x = ri(r, 130, 260);
      s += pa(`M${x} 190l6-${ri(r, 14, 26)} 8 2 4 24z`, "#3f322e");
    }
    s += st("M200 168Q280 162 460 168", "#e6f3f6", 2, " opacity='.5'");
    s += pine(-10, 300, 220, "#24503c") + pine(48, 300, 170, "#2f5d46") + pine(410, 300, 200, "#24503c");
    s += st("M60 262H360M60 248H360M80 248v26M200 248v26M320 248v26", "#8a6040", 4);
    return s;
  },
  "cliffs-sunset": (r) => {
    let s = rc(-60, 180, 520, 160, "#4f5f98");
    let ref = "";
    for (let i = 0; i < 6; i++) ref += `M${200 - 40 + i * 6} ${190 + i * 9}h${80 - i * 12}`;
    s += st(ref, "#ffcf86", 3, " opacity='.8'");
    s += pa("M-60 150Q20 140 60 170L110 196L130 300H-60z", "#3f3049") + pa("M-60 200Q40 196 90 230L150 330H-60z", "#2b2235");
    s += pa("M460 160Q380 156 340 196L300 330H460z", "#4a3a54") + pa("M460 210Q380 206 350 250L330 330H460z", "#2b2235");
    if (r() > 0.4) s += `<g fill='#1e1826'>${ci(68, 150, 4, "#1e1826")}${rc(64, 154, 8, 14, "#1e1826")}${ci(80, 151, 4, "#1e1826")}${rc(76, 155, 8, 13, "#1e1826")}</g>`;
    return s;
  },
  "palm-park": (r) => {
    let s = rc(-60, 205, 520, 120, "#9cc07a") + rc(70, 220, 260, 40, "#7fb8c4") + rc(70, 220, 260, 4, "#cfe6ef");
    s += rc(40, 150, 320, 60, "#f0dcbc") + win(54, 186, 300, "#b98a5e", 22, "14 10") + pa("M40 150h320l-10-10H50z", "#c0583a");
    s += rc(178, 60, 44, 95, "#f3e2c4") + rc(172, 92, 56, 8, "#e4cba3") + rc(186, 40, 28, 22, "#f3e2c4") + pa("M184 42q16-34 32 0z", "#3c7fb0") + ci(200, 14, 3, "#d9a23b");
    s += win(188, 74, 24, "#7a5a3c", 8, "6 6") + win(190, 120, 22, "#7a5a3c", 12, "6 5");
    s += palm(ri(r, 10, 40), 215, 120) + palm(ri(r, 350, 385), 215, 135);
    return s;
  },
  "old-town": (r) => {
    let s = rc(-60, 200, 520, 130, "#d8b98e");
    s += rc(10, 120, 150, 85, "#ecd2ad") + pa("M0 124l85-22 85 22z", "#c0583a") + pa("M60 205v-30q15-16 30 0v30z", "#6b4a3a") + rc(26, 150, 18, 18, "#6b8fa8") + rc(124, 150, 18, 18, "#6b8fa8");
    s += rc(220, 110, 170, 95, "#e7c49a") + pa("M210 114l95-20 95 20z", "#b44f33") + pa("M285 205v-34q20-18 40 0v34z", "#5a3b2c") + rc(240, 140, 20, 22, "#6b8fa8") + rc(350, 140, 20, 22, "#6b8fa8");
    let flags = "";
    const cols = ["#e0794a", "#2f8f83", "#c4517a", "#6d6bd1", "#d9a23b"];
    for (let x = -10; x < 420; x += 22) flags += pa(`M${x} ${84 + Math.sin(x / 60) * 6}h16l-8 14z`, pick(r, cols));
    s += st("M-60 82Q200 104 460 82", "#5a3b2c", 1.2) + flags;
    s += pa("M190 205v-50q0-8 8-8t8 8v50z", "#4f8a4e") + st("M190 178h-10v-14M206 172h10v-14", "#4f8a4e", 7, " stroke-linecap='round'");
    return s;
  },
  pasture: (r) => {
    let s = pa("M-60 175Q120 130 260 165T460 150V330H-60z", "#7fae6c") + pa("M-60 205Q160 170 460 200V330H-60z", "#93c27a");
    s += rc(250, 128, 70, 50, "#b8442f") + pa("M244 130l41-28 41 28z", "#7a2e22") + rc(276, 150, 18, 28, "#f6efe3") + st("M276 150l18 28M294 150l-18 28", "#b8442f", 2);
    s += st("M-60 236H460M-60 252H460", "#8a6040", 2) + st("M0 228v32M60 228v32M120 228v32M180 228v32M240 228v32M300 228v32M360 228v32", "#8a6040", 3);
    for (let i = 0; i < 3; i++) {
      const x = ri(r, 40 + i * 110, 90 + i * 110);
      const y = ri(r, 200, 214);
      s += el(x, y, 15, 9, "#fdfaf4") + ci(x - 4, y - 2, 4, "#2b2420") + ci(x + 6, y + 2, 3, "#2b2420") + el(x + 16, y - 5, 6, 5, "#fdfaf4") + st(`M${x - 8} ${y + 6}v8M${x + 8} ${y + 6}v8`, "#2b2420", 2.5);
    }
    return s;
  },
  cove: (r) => {
    let s = rc(-60, 150, 520, 180, "#4fb3bf") + rc(-60, 150, 520, 30, "#3d8fb0");
    s += pa("M-60 120Q60 110 120 170L170 330H-60z", "#c9a77a") + pa("M-60 160Q50 160 90 220L120 330H-60z", "#a8825a");
    for (let i = 0; i < 4; i++) s += rc(-20 + i * 30, 98 - (i % 2) * 6, 22, 16, ["#f6efe3", "#f3d7b5", "#e8c4c4"][i % 3]) + pa(`M${-22 + i * 30} ${98 - (i % 2) * 6}l13-8 13 8z`, "#c0583a");
    s += pa("M180 250q30-40 90-30q50 10 60 40z", "#6b5a4a") + pa("M230 220q20-10 40 0z", "#5a4a3c");
    for (let i = 0; i < 3; i++) s += el(ri(r, 200, 300), ri(r, 232, 248), 12, 5, "#3f3a3a");
    s += el(ri(r, 300, 380), ri(r, 180, 200), 12, 3, pick(r, ["#e0794a", "#d9a23b", "#c4517a"]));
    s += st("M180 280h40M320 300h30", "#e6f3f6", 2);
    return s;
  },
};

function city(r: R, scale: number) {
  // Two building tones and one window layer, each a single path, to keep the SVG small.
  const d = ["", ""];
  let w = "";
  let x = -60;
  let i = 0;
  while (x < 460) {
    const bw = ri(r, 30, 56);
    const h = Math.round(ri(r, 40, 110) * scale);
    d[i++ % 2] += `M${x} ${192 - h}h${bw - 4}V192h${4 - bw}z`;
    if (h > 50) w += `M${x + 5} ${204 - h}h${bw - 14}M${x + 5} ${220 - h}h${bw - 14}`;
    x += bw;
  }
  return pa(d[0], pick(r, ["#a7a3c4", "#9c98b8"])) + pa(d[1], pick(r, ["#b8b0c9", "#c2b6c8"])) + st(w, "#f4ead2", 3, " stroke-dasharray='3 5'");
}

function bridgeTruss(r: R, o: SceneOptions, lift: boolean) {
  const c = o.tint ?? "#2f6a5a";
  let s = city(r, 1) + river(195);
  for (const px of [60, 200, 340]) s += rc(px - 8, 178, 16, 60, "#7d7468");
  s += rc(-60, 174, 520, 8, "#3c4a5a");
  let z = "M-60 174";
  for (let x = -60; x < 460; x += 20) z += `L${x + 10} 146L${x + 20} 174`;
  s += st(z, c, 2.5) + st("M-60 146H460", c, 4);
  if (lift) {
    for (const tx of [148, 252]) s += rc(tx - 6, 70, 12, 108, c) + rc(tx - 10, 64, 20, 8, c) + rc(tx - 5, 84, 10, 14, "#8b8b8b");
    s += st("M142 78H258", c, 3);
  }
  return s;
}

// --- public API -------------------------------------------------------------

/** Scenes with dry ground in the foreground, where the two of us can stand. */
const PEOPLE_OK = new Set<SceneKind>(["rose-garden", "museum", "city-square", "beach-haystack", "forest-trail", "column", "old-town", "palm-park", "pasture"]);

/** Natural pixel size of a scene for a given seed (so Photo.width/height match). */
export function sceneSize(seed: number, opts: SceneOptions = {}): { w: number; h: number; portrait: boolean } {
  const portrait = opts.portrait ?? rng(seed * 7 + 3)() < 0.25;
  return { w: opts.w ?? (portrait ? 600 : 800), h: opts.h ?? (portrait ? 800 : 600), portrait };
}

/** Raw SVG markup for a sample postcard. */
export function sceneSvg(kind: SceneKind, seed: number, opts: SceneOptions = {}): string {
  const r = rng(seed);
  const { w, h, portrait } = sceneSize(seed, opts);
  const sky = kind === "cliffs-sunset" ? DUSK : pick(r, SKIES);
  const blur = opts.blur ?? 0;

  const sunX = kind === "cliffs-sunset" ? 200 : ri(r, 90, 310);
  const sunY = kind === "cliffs-sunset" ? 178 : ri(r, 30, 100);
  let bg = ci(sunX, sunY, ri(r, 18, 28), sky.sun);
  if (kind === "cliffs-sunset") bg = ci(sunX, sunY, 34, sky.sun, " opacity='.35'") + bg;
  const clouds = ri(r, 1, 3);
  for (let i = 0; i < clouds; i++) bg += cloud(ri(r, 0, 400), ri(r, -40, 110), 0.7 + r() * 0.7);

  // Slight reframing per seed so photos of one spot differ.
  const dx = ri(r, -14, 14);
  const dy = ri(r, -6, 8);
  const sc = (1 + r() * 0.1).toFixed(3);
  let fg = SCENES[kind](r, opts);
  if (r() < 0.35 && PEOPLE_OK.has(kind)) fg += us(ri(r, 60, 330), ri(r, 262, 285));

  const vb = portrait ? "50 -100 300 400" : "0 0 400 300";
  const filt = blur > 0 ? `<filter id='b' x='-5%' y='-5%' width='110%' height='110%'><feGaussianBlur stdDeviation='${blur}' edgeMode='duplicate'/></filter>` : "";
  const g = blur > 0 ? " filter='url(#b)'" : "";
  return (
    `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='${vb}' preserveAspectRatio='xMidYMid slice'>` +
    `<defs><linearGradient id='s' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='${sky.top}'/><stop offset='1' stop-color='${sky.bot}'/></linearGradient>${filt}</defs>` +
    rc(-60, -120, 520, 460, sky.bot) +
    `<g${g}>` +
    rc(-60, -120, 520, 440, "url(#s)") +
    bg +
    `<g transform='translate(${200 + dx} ${150 + dy}) scale(${sc}) translate(-200 -150)'>${fg}</g>` +
    `</g></svg>`
  );
}

/** A sample postcard as a `data:image/svg+xml` URL. Use the same URL for url and thumbUrl. */
export function sceneDataUrl(kind: SceneKind, seed: number, opts: SceneOptions = {}): string {
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(sceneSvg(kind, seed, opts));
}
