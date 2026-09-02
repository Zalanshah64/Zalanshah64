export type ParsedFrame = {
  text: string;
  opacity: number;
  values: number[];
  keyTimes: number[];
  /** Normalized [start, end] windows in which this frame is fully opaque. */
  windows: [number, number][];
};

export type ParsedSvg = {
  width: number;
  height: number;
  viewBox: string;
  ariaLabel: string;
  dur: number | null;
  frames: ParsedFrame[];
  raw: string;
};

const TEXT_RE = /<text\b[^>]*opacity="([\d.]+)"[^>]*>([\s\S]*?)<\/text>/g;
const ANIM_RE = /<animate attributeName="opacity" values="([^"]+)" keyTimes="([^"]+)" dur="([\d.]+)s"/;

function unescapeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Windows where the frame sits at opacity 1, from a values/keyTimes pair. */
function opaqueWindows(values: number[], keyTimes: number[]): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < values.length - 1; i++) {
    if (values[i] === 1 && values[i + 1] === 1) out.push([keyTimes[i], keyTimes[i + 1]]);
  }
  return out;
}

export function parseSvg(raw: string): ParsedSvg {
  const frames: ParsedFrame[] = [];
  let dur: number | null = null;

  for (const m of raw.matchAll(TEXT_RE)) {
    const opacity = Number(m[1]);
    let inner = m[2];

    const anim = inner.match(ANIM_RE);
    let values: number[] = [];
    let keyTimes: number[] = [];
    if (anim) {
      values = anim[1].split(";").map(Number);
      keyTimes = anim[2].split(";").map(Number);
      dur = Number(anim[3]);
    }

    inner = inner.replace(/<animate\b[^>]*\/>/g, "").replace(/<tspan\b[^>]*>[\s\S]*?<\/tspan>/g, "");

    frames.push({
      text: unescapeXml(inner),
      opacity,
      values,
      keyTimes,
      windows: opaqueWindows(values, keyTimes),
    });
  }

  return {
    width: Number(raw.match(/<svg[^>]*\bwidth="(\d+)"/)?.[1] ?? NaN),
    height: Number(raw.match(/<svg[^>]*\bheight="(\d+)"/)?.[1] ?? NaN),
    viewBox: raw.match(/viewBox="([^"]+)"/)?.[1] ?? "",
    ariaLabel: unescapeXml(raw.match(/aria-label="([^"]*)"/)?.[1] ?? ""),
    dur,
    frames,
    raw,
  };
}

/** Indices of frames opaque at normalized time `t`. */
export function visibleAt(svg: ParsedSvg, t: number): number[] {
  const out: number[] = [];
  svg.frames.forEach((f, i) => {
    if (f.windows.some(([a, b]) => t >= a && t < b)) out.push(i);
  });
  return out;
}

/** A frame's on-screen duration in seconds, derived from its opaque window. */
export function frameSeconds(svg: ParsedSvg, index: number): number {
  const f = svg.frames[index];
  const span = f.windows.reduce((sum, [a, b]) => sum + (b - a), 0);
  return span * (svg.dur ?? 0);
}
