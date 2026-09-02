import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { PHRASES } from "../src/config";
import { neighbors } from "../src/keyboard";
import { frameSeconds, parseSvg, visibleAt } from "./helpers";

const get = (qs = "") => SELF.fetch(`https://example.com/${qs}`);
const getSvg = async (qs = "") => parseSvg(await (await get(qs)).text());

describe("response contract", () => {
  it("serves an SVG on GET /", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/svg+xml; charset=utf-8");
  });

  it("sets every no-cache header so the phrase can rotate", async () => {
    const res = await get();
    expect(res.headers.get("cache-control")).toBe(
      "no-cache, no-store, must-revalidate, max-age=0",
    );
    expect(res.headers.get("pragma")).toBe("no-cache");
    expect(res.headers.get("expires")).toBe("0");
  });

  it("404s on any other path", async () => {
    expect((await get("nope")).status).toBe(404);
  });
});

describe("svg document", () => {
  it("is a standalone document with balanced tags", async () => {
    const { raw } = await getSvg();
    expect(raw.startsWith("<svg xmlns=")).toBe(true);
    expect(raw.endsWith("</svg>")).toBe(true);
    for (const tag of ["svg", "g", "text"]) {
      const open = raw.match(new RegExp(`<${tag}\\b`, "g"))?.length ?? 0;
      const close = raw.match(new RegExp(`</${tag}>`, "g"))?.length ?? 0;
      expect(open, `<${tag}> balance`).toBe(close);
    }
  });

  it("sizes the viewBox to match width and height", async () => {
    const svg = await getSvg();
    expect(svg.viewBox).toBe(`0 0 ${svg.width} ${svg.height}`);
    expect(svg.width).toBeGreaterThan(0);
    expect(svg.height).toBeGreaterThan(0);
  });

  it("gives every frame an animation", async () => {
    const svg = await getSvg();
    expect(svg.frames.length).toBeGreaterThan(1);
    for (const f of svg.frames) expect(f.values.length).toBeGreaterThan(0);
  });

  it("labels itself with the completed phrase", async () => {
    const svg = await getSvg();
    expect(svg.ariaLabel).toBe(svg.frames.at(-1)!.text);
  });
});

describe("phrase selection", () => {
  it("types a phrase from the list verbatim", async () => {
    for (let i = 0; i < 25; i++) {
      const svg = await getSvg();
      expect(PHRASES).toContain(svg.frames.at(-1)!.text);
    }
  });

  it("varies the phrase across requests", async () => {
    const seen = new Set<string>();
    for (let i = 0; i < 60; i++) seen.add((await getSvg()).frames.at(-1)!.text);
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe("animation timeline", () => {
  it("shares one duration across every animate so frames stay in sync", async () => {
    const { raw, dur } = await getSvg();
    const durs = new Set([...raw.matchAll(/dur="([\d.]+)s"/g)].map((m) => m[1]));
    expect(durs.size).toBe(1);
    expect(dur).toBeGreaterThan(0);
  });

  it("emits keyTimes that span 0 to 1 and never go backwards", async () => {
    const svg = await getSvg("?errorRate=0.3");
    for (const [i, f] of svg.frames.entries()) {
      expect(f.values.length, `frame ${i} values/keyTimes length`).toBe(f.keyTimes.length);
      expect(f.keyTimes[0], `frame ${i} starts at 0`).toBe(0);
      expect(f.keyTimes.at(-1), `frame ${i} ends at 1`).toBe(1);
      for (let j = 1; j < f.keyTimes.length; j++) {
        expect(f.keyTimes[j], `frame ${i} keyTimes monotonic`).toBeGreaterThanOrEqual(
          f.keyTimes[j - 1],
        );
      }
    }
  });

  it("shows exactly one frame at every moment of the loop", async () => {
    const svg = await getSvg("?errorRate=0.3");
    for (let s = 0; s < 500; s++) {
      const t = (s + 0.5) / 500;
      expect(visibleAt(svg, t), `t=${t.toFixed(4)}`).toHaveLength(1);
    }
  });

  it("opens on the first frame and rests on the last", async () => {
    const svg = await getSvg();
    expect(visibleAt(svg, 0)).toEqual([0]);
    expect(visibleAt(svg, 0.9999)).toEqual([svg.frames.length - 1]);
  });

  it("holds the completed phrase at the end", async () => {
    const svg = await getSvg("?cps=30");
    const last = svg.frames.length - 1;
    expect(frameSeconds(svg, last)).toBeGreaterThan(frameSeconds(svg, 1) * 5);
  });
});

describe("typing progression", () => {
  it("grows one character at a time with no typos when errorRate is 0", async () => {
    const svg = await getSvg("?errorRate=0");
    const phrase = svg.frames.at(-1)!.text;
    const texts = svg.frames.map((f) => f.text);
    // Final frame repeats the phrase as the end hold, so drop it before checking growth.
    const typing = texts.slice(0, -1);
    expect(typing).toEqual([...phrase].map((_, i) => [...phrase].slice(0, i + 1).join("")));
  });

  it("backspaces a neighbouring key when errorRate is 1", async () => {
    const svg = await getSvg("?errorRate=1&variance=0&cps=10");
    const phrase = svg.frames.at(-1)!.text;
    const texts = svg.frames.map((f) => f.text);

    const backspaces = texts.filter((t, i) => i > 0 && t.length < texts[i - 1].length);
    expect(backspaces.length).toBeGreaterThan(0);

    for (const [i, text] of texts.entries()) {
      if (i === 0 || texts[i].length >= texts[i - 1].length) continue;
      const mistake = texts[i - 1];
      const wrong = mistake.at(-1)!;
      const correct = [...phrase][[...text].length];
      expect(neighbors(correct), `"${wrong}" should neighbour "${correct}"`).toContain(wrong);
      expect(text, "backspace returns to the prefix").toBe(mistake.slice(0, -1));
    }
  });

  it("holds a mistake longer than a normal keystroke", async () => {
    const svg = await getSvg("?errorRate=1&variance=0&cps=10");
    const texts = svg.frames.map((f) => f.text);
    const mistakes: number[] = [];
    const normal: number[] = [];
    texts.forEach((t, i) => {
      if (i === 0 || i === texts.length - 1) return;
      if (texts[i + 1] !== undefined && texts[i + 1].length < t.length) mistakes.push(i);
      else normal.push(i);
    });
    expect(mistakes.length).toBeGreaterThan(0);
    const slowest = Math.max(...normal.map((i) => frameSeconds(svg, i)));
    for (const i of mistakes) {
      expect(frameSeconds(svg, i), `mistake at frame ${i}`).toBeGreaterThan(slowest * 1.9);
    }
  });
});

describe("tunable options", () => {
  it("types faster at a higher cps", async () => {
    const slow = await getSvg("?cps=4&errorRate=0&variance=0");
    const fast = await getSvg("?cps=25&errorRate=0&variance=0");
    const per = (s: typeof slow) => (s.dur ?? 0) / s.frames.length;
    expect(per(fast)).toBeLessThan(per(slow));
  });

  it("applies font, size and colours", async () => {
    const { raw } = await getSvg("?font=Georgia&size=40&fg=%23ff0000&bg=%23112233");
    expect(raw).toContain('font-family="Georgia"');
    expect(raw).toContain('font-size="40"');
    expect(raw).toContain('fill="#ff0000"');
    expect(raw).toContain('<rect width="100%" height="100%" fill="#112233"/>');
  });

  it("omits the background rect when bg is none", async () => {
    expect((await getSvg("?bg=none")).raw).not.toContain("<rect");
  });

  it("scales the viewBox with size", async () => {
    const small = await getSvg("?size=10&caret=false");
    const large = await getSvg("?size=100&caret=false");
    expect(large.height).toBeGreaterThan(small.height);
  });

  it("toggles the caret", async () => {
    const on = await getSvg("?caret=true");
    expect(on.raw).toContain("▌");
    expect(on.raw).toContain("@keyframes");

    const off = await getSvg("?caret=false");
    expect(off.raw).not.toContain("▌");
    expect(off.raw).not.toContain("<style>");
  });

  it("loops or freezes on the last frame", async () => {
    const looping = await getSvg("?loop=true");
    expect(looping.raw).toContain('repeatCount="indefinite"');
    expect(looping.raw).not.toContain('fill="freeze"');

    const once = await getSvg("?loop=false");
    expect(once.raw).toContain('fill="freeze"');
    expect(once.raw).not.toContain("repeatCount");
  });

  it("accepts the documented falsey spellings", async () => {
    for (const v of ["0", "false", "no", "off", "FALSE"]) {
      expect((await getSvg(`?caret=${v}`)).raw, v).not.toContain("▌");
    }
  });
});

describe("input validation", () => {
  it("clamps out-of-range numbers", async () => {
    expect((await getSvg("?size=99999")).raw).toContain('font-size="160"');
    expect((await getSvg("?size=-5")).raw).toContain('font-size="8"');
    const fast = await getSvg("?cps=100000");
    expect(fast.dur).toBeGreaterThan(0);
    expect(Number.isFinite(fast.dur)).toBe(true);
  });

  it("falls back to defaults on unparseable input", async () => {
    const { raw } = await getSvg("?cps=abc&size=&fg=!!!&font=%3Cbad%3E");
    expect(raw).toContain('font-size="26"');
    expect(raw).toContain('fill="#1f6feb"');
  });

  it("neutralises attribute injection through fg and font", async () => {
    const { raw } = await getSvg(
      "?fg=%22%3E%3Cscript%3Ealert(1)%3C%2Fscript%3E&font=%22%20onload%3D%22evil()",
    );
    expect(raw).not.toContain("<script");
    expect(raw).not.toContain("onload=");
  });

  it("ignores unknown query parameters", async () => {
    const res = await get("?bogus=1&phrase=hacked");
    expect(res.status).toBe(200);
    const svg = parseSvg(await res.text());
    expect(PHRASES).toContain(svg.frames.at(-1)!.text);
  });
});
