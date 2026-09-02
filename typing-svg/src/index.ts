import { Hono } from "hono";
import { DEFAULTS, PHRASES, type Options } from "./config";
import { buildTimeline } from "./typewriter";
import { renderSvg } from "./svg";

const COLOR =
  /^(none|transparent|#[0-9a-fA-F]{3,8}|[a-zA-Z]{3,20}|(rgb|hsl)a?\([\d\s.,%/]{1,40}\))$/;
const FONT = /^[\w\s,'"-]{1,120}$/;

function num(raw: string | undefined, def: number, min: number, max: number): number {
  const n = Number(raw);
  if (raw === undefined || raw === "" || !Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}

function bool(raw: string | undefined, def: boolean): boolean {
  if (raw === undefined || raw === "") return def;
  return !/^(0|false|no|off)$/i.test(raw);
}

function str(raw: string | undefined, def: string, allowed: RegExp): string {
  return raw !== undefined && allowed.test(raw) ? raw : def;
}

function pickPhrase(phrases: string[]): string {
  const [n] = crypto.getRandomValues(new Uint32Array(1));
  return phrases[n % phrases.length];
}

const app = new Hono();

app.get("/", (c) => {
  const q = c.req.query();
  const opts: Options = {
    cps: num(q.cps, DEFAULTS.cps, 1, 60),
    variance: num(q.variance, DEFAULTS.variance, 0, 1),
    errorRate: num(q.errorRate, DEFAULTS.errorRate, 0, 1),
    font: str(q.font, DEFAULTS.font, FONT),
    size: num(q.size, DEFAULTS.size, 8, 160),
    fg: str(q.fg, DEFAULTS.fg, COLOR),
    bg: str(q.bg, DEFAULTS.bg, COLOR),
    caret: bool(q.caret, DEFAULTS.caret),
    loop: bool(q.loop, DEFAULTS.loop),
  };

  const svg = renderSvg(buildTimeline(pickPhrase(PHRASES), opts), opts);

  return c.body(svg, 200, {
    "Content-Type": "image/svg+xml; charset=utf-8",
    "Cache-Control": "no-cache, no-store, must-revalidate, max-age=0",
    Pragma: "no-cache",
    Expires: "0",
  });
});

export default app;
