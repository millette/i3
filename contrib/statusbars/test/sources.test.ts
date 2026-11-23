import { strict as assert } from "node:assert";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

// Isolate the pomodoro state file before the module reads XDG_RUNTIME_DIR.
process.env.XDG_RUNTIME_DIR = mkdtempSync(join(tmpdir(), "sbs-test-"));
process.env.POMODORO_WORK_MIN = "25";

const { gdbusInt, mmss, parseExternal, pomodoro, pomodoroAction, stripMarkup, truncate } = await import("../lib/sources.ts");
const { escapePango, i3barBlock, render, renderWorkspaces } = await import("../lib/format.ts");

const sample = {
  id: "now-playing" as const,
  icon: "♪",
  text: "Simon & Garfunkel — 100% <live>",
  short: "100% <live>",
  state: "good" as const,
  color: "#a6e3a1",
  tooltip: "",
};

test("mmss formats minutes, hours and overdue time", () => {
  assert.equal(mmss(65_000), "1:05");
  assert.equal(mmss(3_725_000), "1:02:05");
  assert.equal(mmss(-30_000), "-0:30");
});

test("truncate counts characters, not UTF-16 units", () => {
  assert.equal(truncate("🍅🍅🍅🍅", 3), "🍅🍅…");
  assert.equal(truncate("abc", 3), "abc");
});

test("parseExternal accepts plain text, JSON and markup, last line wins", () => {
  assert.deepEqual(parseExternal("old\nnew song\n"), { text: "new song" });
  assert.equal(parseExternal('{"text":"<b>Hi</b> &amp; co","state":"Warning"}')?.state, "warning");
  assert.equal(parseExternal('{"full_text":"%{F#fff}x%{F-}"}')?.text, "x");
  assert.equal(parseExternal("   \n"), null);
  assert.equal(stripMarkup("<span foreground='red'>a &lt;b&gt;</span>"), "a <b>");
});

test("gdbusInt ignores type annotations", () => {
  assert.equal(gdbusInt("(int32 600,)"), 600);
  assert.equal(gdbusInt("(170,)"), 170);
  assert.equal(gdbusInt("(uint64 2700, true)"), 2700);
  assert.equal(gdbusInt("Error"), null);
});

test("pango output is escaped", () => {
  assert.equal(escapePango(`<a & "b">`), "&lt;a &amp; &quot;b&quot;&gt;");
  assert.match(String(i3barBlock(sample)?.full_text), /Simon &amp; Garfunkel — 100% &lt;live&gt;/);
  assert.equal(i3barBlock({ ...sample, text: "" }), undefined);
});

test("polybar and lemonbar escape % and add click areas", () => {
  const poly = render(sample, "polybar");
  assert.match(poly, /100%% <live>/);
  assert.match(poly, /%\{A1:sbs now-playing toggle:\}/);
  assert.match(poly, /%\{A1:sbs now-playing previous:\}⏮%\{A\}/);
  const lemon = render(sample, "lemonbar");
  assert.match(lemon, /%\{A1:now-playing toggle:\}/);
  assert.equal(render({ ...sample, text: "" }, "polybar"), "");
});

test("xmobar output replaces angle brackets and uses <action>", () => {
  const x = render(sample, "xmobar");
  assert.match(x, /‹live›/);
  assert.match(x, /<action=`sbs now-playing toggle` button=1>/);
});

test("i3rs and yambar formats", () => {
  assert.deepEqual(JSON.parse(render(sample, "i3rs")), {
    state: "Good",
    text: "♪ Simon & Garfunkel — 100% <live>",
    short_text: "♪ 100% <live>",
  });
  const y = render({ ...sample, text: "a\nb" }, "yambar");
  assert.match(y, /^icon\|string\|♪\ntext\|string\|a b\n/);
  assert.ok(y.endsWith("visible|bool|true\n"), "ends with a newline so the caller's newline makes the blank terminator");
});

test("workspace click commands escape ':' in names", () => {
  const ws = [{ num: -1, name: "web:mail", focused: true, visible: true, urgent: false, output: "eDP-1" }];
  assert.match(renderWorkspaces(ws, "lemonbar"), /%\{A1:ws web\\:mail:\}/);
  assert.equal(renderWorkspaces(ws, "plain"), "[web:mail]");
  assert.equal(renderWorkspaces(ws, "json", "HDMI-1"), "[]");
});

test("pomodoro: start, pause, resume, skip, reset", async () => {
  assert.equal((await pomodoro()).text, "start");
  await pomodoroAction("toggle");
  let s = await pomodoro();
  assert.equal(s.icon, "🍅");
  assert.equal(s.state, "good");
  await pomodoroAction("toggle");
  assert.equal((await pomodoro()).icon, "⏸");
  await pomodoroAction("toggle");
  await pomodoroAction("skip");
  s = await pomodoro();
  assert.equal(s.icon, "☕");
  assert.match(s.text, /×1$/);
  await pomodoroAction("reset");
  assert.equal((await pomodoro()).text, "start");
  await assert.rejects(pomodoroAction("nope"));
});
