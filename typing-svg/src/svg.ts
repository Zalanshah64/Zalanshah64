import type { Options } from "./config";
import type { Frame } from "./typewriter";

export type RenderOptions = Pick<Options, "font" | "size" | "fg" | "bg" | "caret" | "loop">;

const CARET = "▌";
const ADVANCE = 0.62; // monospace advance width, as a fraction of font size
const PAD_RATIO = 0.6; // padding around the text, as a fraction of font size
const LINE_RATIO = 1.25; // line box height, as a fraction of font size
const BLINK_SECONDS = 1;

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function fmt(n: number): string {
  return Number(n.toFixed(5)).toString();
}

/** Monospace cells occupied: emoji take two, zero-width joiners and selectors take none. */
function columns(text: string): number {
  let n = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp === 0x200d || cp === 0xfe0f) continue;
    const wide =
      cp > 0xffff || (cp >= 0x2600 && cp <= 0x27bf) || (cp >= 0x2b00 && cp <= 0x2bff);
    n += wide ? 2 : 1;
  }
  return n;
}

/**
 * Rectangular opacity pulse for a frame visible during [start, end], normalized by `total`.
 * Duplicated keyTimes make each edge an instant switch rather than a fade.
 */
function pulse(index: number, last: number, start: number, end: number, total: number): string {
  const s = fmt(Math.min(1, start / total));
  const e = fmt(Math.min(1, end / total));
  if (index === 0) return `values="1;1;0;0" keyTimes="0;${e};${e};1"`;
  if (index === last) return `values="0;0;1;1" keyTimes="0;${s};${s};1"`;
  return `values="0;0;1;1;0;0" keyTimes="0;${s};${s};${e};${e};1"`;
}

/** A standalone SVG document that animates `frames` by stacking one <text> per frame. */
export function renderSvg(frames: Frame[], o: RenderOptions): string {
  if (frames.length === 0) throw new Error("renderSvg: frames must not be empty");

  const total = frames.reduce((sum, f) => sum + f.dur, 0);
  const widest = frames.reduce((max, f) => Math.max(max, columns(f.text)), 0);
  const pad = o.size * PAD_RATIO;
  const cols = widest + (o.caret ? 1 : 0);
  const width = Math.ceil(pad * 2 + cols * o.size * ADVANCE);
  const height = Math.ceil(pad * 2 + o.size * LINE_RATIO);
  const last = frames.length - 1;

  const x = fmt(pad);
  const y = fmt(pad + o.size);
  const dur = fmt(total);
  const repeat = o.loop ? ' repeatCount="indefinite"' : ' fill="freeze"';
  const caretSpan = o.caret ? `<tspan class="k">${CARET}</tspan>` : "";

  let acc = 0;
  const texts = frames.map((f, i) => {
    const start = acc;
    acc += f.dur;
    const anim =
      last > 0
        ? `<animate attributeName="opacity" ${pulse(i, last, start, acc, total)} dur="${dur}s"${repeat}/>`
        : "";
    // The static opacity is the no-SMIL fallback: show the completed phrase, hide the rest.
    return `<text x="${x}" y="${y}" opacity="${i === last ? 1 : 0}">${esc(f.text)}${caretSpan}${anim}</text>`;
  });

  const style = o.caret
    ? `<style>.k{animation:k ${BLINK_SECONDS}s step-end infinite}@keyframes k{0%,49%{opacity:1}50%,100%{opacity:0}}</style>`
    : "";
  const rect =
    o.bg === "none" || o.bg === "transparent"
      ? ""
      : `<rect width="100%" height="100%" fill="${esc(o.bg)}"/>`;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xml:space="preserve" role="img" aria-label="${esc(frames[last].text)}">`,
    style,
    rect,
    `<g font-family="${esc(o.font)}" font-size="${fmt(o.size)}" fill="${esc(o.fg)}">`,
    ...texts,
    "</g>",
    "</svg>",
  ].join("");
}
