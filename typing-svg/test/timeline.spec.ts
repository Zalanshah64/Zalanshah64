import { describe, expect, it } from "vitest";
import { neighbors } from "../src/keyboard";
import { buildTimeline } from "../src/typewriter";
import { renderSvg } from "../src/svg";

const OPTS = { cps: 10, variance: 0, errorRate: 0 };
const RENDER = { font: "monospace", size: 20, fg: "#000", bg: "none", caret: true, loop: true };

/** rng stub: always returns `v`, so timelines are fully deterministic. */
const fixed = (v: number) => () => v;

describe("buildTimeline", () => {
  it("emits one frame per character plus a final hold", () => {
    const frames = buildTimeline("hello", OPTS, fixed(0.99));
    expect(frames.map((f) => f.text)).toEqual(["h", "he", "hel", "hell", "hello", "hello"]);
  });

  it("holds the completed phrase far longer than a keystroke", () => {
    const frames = buildTimeline("hi", OPTS, fixed(0.99));
    expect(frames.at(-1)!.dur).toBeGreaterThan(frames[0].dur * 5);
  });

  it("never emits a zero or negative duration, even at maximum variance", () => {
    const frames = buildTimeline("the quick brown fox", { ...OPTS, variance: 1 }, Math.random);
    for (const f of frames) expect(f.dur).toBeGreaterThan(0);
  });

  it("expands a typo into mistake, backspace, correction", () => {
    const frames = buildTimeline("hel", { ...OPTS, errorRate: 1 }, fixed(0));
    const texts = frames.map((f) => f.text);
    // rng 0 picks the first neighbour of each key and rolls a typo on every character.
    expect(texts).toEqual([
      neighbors("h")[0],
      "",
      "h",
      "h" + neighbors("e")[0],
      "h",
      "he",
      "he" + neighbors("l")[0],
      "he",
      "hel",
      "hel",
    ]);
  });

  it("holds the mistake between 2x and 3x a keystroke", () => {
    const frames = buildTimeline("l", { ...OPTS, errorRate: 1 }, fixed(0));
    const keystroke = 1 / OPTS.cps;
    expect(frames[0].dur).toBeGreaterThanOrEqual(keystroke * 2);
    expect(frames[0].dur).toBeLessThanOrEqual(keystroke * 3);
  });

  it("skips typos for characters with no keyboard neighbours", () => {
    const frames = buildTimeline("   ", { ...OPTS, errorRate: 1 }, fixed(0));
    expect(frames.map((f) => f.text)).toEqual([" ", "  ", "   ", "   "]);
  });

  it("types multi-byte characters as single keystrokes", () => {
    const frames = buildTimeline("a\u{1F44B}b", OPTS, fixed(0.99));
    expect(frames.map((f) => f.text)).toEqual([
      "a",
      "a\u{1F44B}",
      "a\u{1F44B}b",
      "a\u{1F44B}b",
    ]);
  });
});

describe("neighbors", () => {
  it("returns physically adjacent keys", () => {
    expect(neighbors("l")).toEqual(["k", "o", "p", ";"]);
  });

  it("matches the case of the requested key", () => {
    expect(neighbors("L")).toEqual(["K", "O", "P"]);
    expect(neighbors("L").every((n) => n === n.toUpperCase())).toBe(true);
  });

  it("returns nothing for keys it has no data for", () => {
    for (const ch of [" ", "\u{1F44B}", "é", "!"]) expect(neighbors(ch)).toEqual([]);
  });
});

describe("renderSvg", () => {
  it("rejects an empty timeline rather than emitting broken geometry", () => {
    expect(() => renderSvg([], RENDER)).toThrow(/must not be empty/);
  });

  it("renders a single frame statically, with no animation", () => {
    const svg = renderSvg([{ text: "hi", dur: 1 }], RENDER);
    expect(svg).not.toContain("<animate");
    expect(svg).toContain('opacity="1"');
  });

  it("widens the viewBox for double-width emoji", () => {
    const plain = renderSvg([{ text: "aa", dur: 1 }], RENDER);
    const emoji = renderSvg([{ text: "a\u{1F44B}", dur: 1 }], RENDER);
    const width = (s: string) => Number(s.match(/width="(\d+)"/)![1]);
    expect(width(emoji)).toBeGreaterThan(width(plain));
  });

  it("escapes markup in the phrase", () => {
    const svg = renderSvg([{ text: '<b>&"x', dur: 1 }], RENDER);
    expect(svg).toContain("&lt;b&gt;&amp;&quot;x");
    expect(svg).not.toContain("<b>");
  });
});
