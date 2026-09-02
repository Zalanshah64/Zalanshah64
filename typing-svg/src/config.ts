export type Options = {
  cps: number;
  variance: number;
  errorRate: number;
  font: string;
  size: number;
  fg: string;
  bg: string;
  caret: boolean;
  loop: boolean;
};

export const DEFAULTS: Options = {
  cps: 11,
  variance: 0.45,
  errorRate: 0.06,
  font: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  size: 26,
  fg: "#1f6feb",
  bg: "none",
  caret: true,
  loop: false,
};

export const PHRASES: string[] = [
  "Hi there, I'm Shah",
  'echo "hello, world" > /dev/null',
  "segfault at 0x00000000 -- again",
  "It works on my machine.",
  'git commit -m "Doesn\'t work totally yet :/"',
  "Ship it. Fix it. Ship it again.",
  "while (!(succeed = try()));",
  "Have you tried turning it off and on again?",
  "rm -rf ./doubt",
  "There's no place like 127.0.0.1",
  'printf("here\\n"); // the real debugger',
  "Undefined behavior is still behavior.",
  "*** stack smashing detected ***",
  "make: *** No rule to make 'sense'.  Stop.",
  "Compiles clean.  Suspicious.",
  "The bug was in the last place I looked.",
  "git push --force  # I know what I'm doing",
  "cat /dev/urandom | grep -a motivation",
  "Two hard things: naming and off-by-one.",
  "sudo !!  # that's better",
  "free(): double free detected in tcache 2",
  "Permission denied (publickey).",
  "fatal: refusing to merge unrelated histories",
  "warning: unused variable 'result'",
  "Arduino: 98% of program storage used.",
  "Connection reset by peer",
  "git blame says it was me.",
  "Reverting the revert.",
  "LGTM (did not read)",
  "The tests pass locally, which proves nothing.",
  "TODO: remove before shipping (2019)",
  "delay(1000);  // load-bearing",
  "except: pass  # future me's problem",
  "// this should never happen",
  "Index starts at 0. Every time.",
  "502 Bad Gateway (it was me)",
];
