import type { Options } from "./config";
import { neighbors } from "./keyboard";

export type Frame = { text: string; dur: number };

export type TimelineOptions = Pick<Options, "cps" | "variance" | "errorRate">;

const TYPO_HOLD_MIN = 2;
const TYPO_HOLD_MAX = 3;
const END_HOLD_SECONDS = 2.5;
const MIN_KEYSTROKE_RATIO = 0.2;

function pick<T>(items: readonly T[], rng: () => number): T | undefined {
  return items.length ? items[Math.floor(rng() * items.length)] : undefined;
}

/** Ordered full-string snapshots of the phrase being typed, with typos mixed in. */
export function buildTimeline(
  phrase: string,
  opts: TimelineOptions,
  rng: () => number = Math.random,
): Frame[] {
  const base = 1 / opts.cps;
  const keystroke = (): number =>
    Math.max(base * MIN_KEYSTROKE_RATIO, base * (1 + (rng() * 2 - 1) * opts.variance));

  const frames: Frame[] = [];
  let typed = "";

  for (const ch of phrase) {
    const wrong = rng() < opts.errorRate ? pick(neighbors(ch), rng) : undefined;
    if (wrong !== undefined) {
      // The mistake is one frame held long enough to register, then one frame for the backspace.
      const hold = TYPO_HOLD_MIN + rng() * (TYPO_HOLD_MAX - TYPO_HOLD_MIN);
      frames.push({ text: typed + wrong, dur: keystroke() * hold });
      frames.push({ text: typed, dur: keystroke() });
    }
    typed += ch;
    frames.push({ text: typed, dur: keystroke() });
  }

  frames.push({ text: typed, dur: END_HOLD_SECONDS });
  return frames;
}
