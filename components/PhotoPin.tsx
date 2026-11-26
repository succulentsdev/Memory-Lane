// Polaroid-style photo pins for the map.
//
// Pure helpers (no React, no Leaflet): the map adapter turns `photoPinHtml()` into an
// L.divIcon. The file is .tsx so a React preview component can live here later.
//
// Geometry: the icon box is PIN_SIZE wide x PIN_HEIGHT tall and the tail's tip sits at
// the bottom-centre, so the anchor is PIN_ANCHOR = [PIN_SIZE / 2, PIN_HEIGHT]. Selection
// and hover only scale/translate the inner element around that tip, so the anchor never
// changes and the adapter can toggle `ml-pin--selected` without rebuilding the icon.

export interface PhotoPinOptions {
  /** Cover photo thumbnail. Empty string → a soft paper placeholder. */
  thumbUrl: string;
  /** Photos in the moment; a badge shows when > 1. */
  count: number;
  /** Trip (chapter) accent color, e.g. "#e0794a". */
  color: string;
  selected?: boolean;
  /** Position within the trip; varies the polaroid tilt so pins look hand-placed. */
  index?: number;
}

/** Image square inside the polaroid frame. */
const IMG = 44;
const FRAME_SIDE = 4;
const FRAME_BOTTOM = 10;
const TAIL = 10;

export const PIN_SIZE = IMG + FRAME_SIDE * 2; // 52
export const PIN_HEIGHT = IMG + FRAME_SIDE + FRAME_BOTTOM + TAIL; // 68
export const PIN_ANCHOR: [number, number] = [PIN_SIZE / 2, PIN_HEIGHT];

/** Class Leaflet puts on the marker element itself (the focusable one). */
export const PIN_ICON_CLASS = "ml-pin-icon";
export const PIN_SELECTED_CLASS = "ml-pin--selected";

const TILTS = [-4, 3, -2, 5, -5, 2, -3, 4];

/** Deterministic tilt in degrees for a pin index. */
export function pinTilt(index = 0): number {
  return TILTS[((index % TILTS.length) + TILTS.length) % TILTS.length];
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Only allow plain CSS colors (hex / rgb() / hsl() / named) into the style attribute. */
function safeColor(c: string): string {
  return /^(#[0-9a-f]{3,8}|(rgb|hsl)a?\([\d\s.,%/-]+\)|[a-z]+)$/i.test(c.trim()) ? c.trim() : "#e0794a";
}

function formatCount(n: number): string {
  return n > 99 ? "99+" : String(n);
}

/** HTML for one pin. Safe to drop into L.divIcon({ html }). */
export function photoPinHtml({ thumbUrl, count, color, selected = false, index = 0 }: PhotoPinOptions): string {
  const cls = selected ? `ml-pin ${PIN_SELECTED_CLASS}` : "ml-pin";
  const img = thumbUrl
    ? `<img class="ml-pin__img" src="${escapeAttr(thumbUrl)}" alt="" draggable="false" decoding="async" />`
    : `<span class="ml-pin__img ml-pin__img--empty" aria-hidden="true"></span>`;
  const badge = count > 1 ? `<span class="ml-pin__badge" aria-hidden="true">${formatCount(count)}</span>` : "";
  return (
    `<div class="${cls}" style="--ml-c:${safeColor(color)};--ml-tilt:${pinTilt(index)}deg">` +
    `<span class="ml-pin__tail" aria-hidden="true"></span>` +
    `<span class="ml-pin__card">${img}</span>` +
    badge +
    `</div>`
  );
}

/**
 * Scoped styles for pins. Injected once by the adapter (see `ensurePinStyles`).
 * Transforms live on inner elements because Leaflet positions the marker element itself
 * with translate3d.
 */
export const PIN_CSS = `
.${PIN_ICON_CLASS}{background:none;border:0;outline:none;}
.ml-pin{position:relative;width:${PIN_SIZE}px;height:${PIN_HEIGHT}px;transform-origin:50% 100%;
  transition:transform .28s cubic-bezier(.2,.8,.25,1.2);will-change:transform;-webkit-tap-highlight-color:transparent;}
.ml-pin__card{position:absolute;left:0;top:0;box-sizing:border-box;width:${PIN_SIZE}px;
  padding:${FRAME_SIDE}px ${FRAME_SIDE}px ${FRAME_BOTTOM}px;background:#fffdf9;border-radius:6px;
  box-shadow:0 0 0 1.5px var(--ml-c),0 1px 2px rgb(60 40 20/.12),0 5px 14px rgb(60 40 20/.2);
  transform:rotate(var(--ml-tilt));transform-origin:50% 100%;
  transition:transform .28s cubic-bezier(.2,.8,.25,1.2),box-shadow .28s ease;}
.ml-pin__img{display:block;width:${IMG}px;height:${IMG}px;object-fit:cover;border-radius:3px;background:#f4ebdd;
  pointer-events:none;-webkit-user-drag:none;user-select:none;}
.ml-pin__img--empty{background:linear-gradient(135deg,#f4ebdd,#e6dac8);}
.ml-pin__tail{position:absolute;left:50%;bottom:0;width:12px;height:${TAIL + 4}px;margin-left:-6px;
  background:var(--ml-c);clip-path:polygon(0 0,100% 0,50% 100%);}
.ml-pin__tail::after{content:"";position:absolute;left:50%;bottom:-3px;width:6px;height:6px;margin-left:-3px;
  border-radius:50%;background:var(--ml-c);box-shadow:0 0 0 2px #fffdf9;}
.ml-pin__badge{position:absolute;top:-7px;right:-8px;min-width:20px;height:20px;padding:0 5px;box-sizing:border-box;
  border-radius:10px;background:var(--ml-c);color:#fff;font:600 11px/20px ui-sans-serif,system-ui,-apple-system,sans-serif;
  text-align:center;box-shadow:0 0 0 2px #fffdf9,0 2px 6px rgb(60 40 20/.25);
  transform:rotate(calc(var(--ml-tilt) * .5));}
.${PIN_ICON_CLASS}:hover .ml-pin,.${PIN_ICON_CLASS}:focus-visible .ml-pin{transform:translateY(-4px) scale(1.06);}
.${PIN_ICON_CLASS}:hover .ml-pin__card,.${PIN_ICON_CLASS}:focus-visible .ml-pin__card{transform:rotate(0deg);
  box-shadow:0 0 0 2px var(--ml-c),0 10px 26px rgb(60 40 20/.24);}
.${PIN_ICON_CLASS}:focus-visible .ml-pin__card{box-shadow:0 0 0 2px var(--ml-c),0 0 0 5px rgb(255 253 249/.95),0 0 0 7px var(--ml-c),0 10px 26px rgb(60 40 20/.24);}
.${PIN_ICON_CLASS} .ml-pin.${PIN_SELECTED_CLASS}{transform:translateY(-6px) scale(1.32);}
.ml-pin.${PIN_SELECTED_CLASS} .ml-pin__card{transform:rotate(0deg);
  box-shadow:0 0 0 2.5px var(--ml-c),0 14px 32px rgb(60 40 20/.3);}
@media (prefers-reduced-motion: reduce){.ml-pin,.ml-pin__card{transition:none;}}
`;

let pinStylesInjected = false;

/** Inject PIN_CSS once per document. No-op on the server. */
export function ensurePinStyles(): void {
  if (pinStylesInjected || typeof document === "undefined") return;
  if (document.getElementById("ml-pin-styles")) {
    pinStylesInjected = true;
    return;
  }
  const el = document.createElement("style");
  el.id = "ml-pin-styles";
  el.textContent = PIN_CSS;
  document.head.appendChild(el);
  pinStylesInjected = true;
}
