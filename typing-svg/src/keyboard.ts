const QWERTY: Record<string, string> = {
  "1": "2q",
  "2": "13qw",
  "3": "24we",
  "4": "35er",
  "5": "46rt",
  "6": "57ty",
  "7": "68yu",
  "8": "79ui",
  "9": "80io",
  "0": "9op",
  q: "12wa",
  w: "q23eas",
  e: "w34rsd",
  r: "e45tdf",
  t: "r56yfg",
  y: "t67ugh",
  u: "y78ihj",
  i: "u89ojk",
  o: "i90pkl",
  p: "o0l;",
  a: "qwszx",
  s: "awedxzc",
  d: "serfcxv",
  f: "drtgvcb",
  g: "ftyhbvn",
  h: "gyujnbm",
  j: "huikmn",
  k: "jiolm",
  l: "kop;",
  z: "asx",
  x: "zsdc",
  c: "xdfv",
  v: "cfgb",
  b: "vghn",
  n: "bhjm",
  m: "njk",
  ";": "lp'",
  ",": "mkl.",
  ".": ",l;/",
  "/": ".;",
  "-": "0=p",
  "=": "-[",
};

/** Physically adjacent keys, case-matched to `ch`. Empty when `ch` has no entry. */
export function neighbors(ch: string): string[] {
  const lower = ch.toLowerCase();
  const row = QWERTY[lower];
  if (!row) return [];
  if (ch === lower) return [...row];
  return [...row].filter((n) => n >= "a" && n <= "z").map((n) => n.toUpperCase());
}
