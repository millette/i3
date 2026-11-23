/**
 * sbs — status bar sources: now playing, pomodoro and workrave, printed in the
 * format each bar understands.
 *
 *   sbs <source> [--format F] [--follow] [--interval SECONDS]
 *   sbs <source> <action>                 run an action, then refresh followers
 *   sbs click <source> <button>           left|middle|right|up|down → action
 *   sbs workspaces [--format F] [--follow] [--output NAME]
 *   sbs workspaces focus <number|name>
 *
 * sources: now-playing, pomodoro, workrave
 * formats: plain json i3rs i3bar polybar lemonbar xmobar yambar
 */
import { parseArgs } from "node:util";
import { follow, poke } from "../lib/follow.ts";
import { FORMATS, render, renderWorkspaces, type Format } from "../lib/format.ts";
import { ACTIONS, CLICKS, INTERVALS, READERS, SOURCES, isSource, type Button } from "../lib/sources.ts";
import { focusWorkspace, watchWorkspaces, workspaces } from "../lib/workspaces.ts";

function usage(code: number): never {
  const out = code === 0 ? console.log : console.error;
  out(`usage:
  sbs <source> [--format F] [--follow] [--interval SECONDS]
  sbs <source> <action>
  sbs click <source> <left|middle|right|up|down>
  sbs workspaces [--format F] [--follow] [--output NAME]
  sbs workspaces focus <number|name>

sources: ${SOURCES.join(", ")}
formats: ${FORMATS.join(", ")}
actions: now-playing toggle|next|previous · pomodoro toggle|skip|reset · workrave details|open`);
  process.exit(code);
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    format: { type: "string", short: "f", default: "plain" },
    follow: { type: "boolean", default: false },
    interval: { type: "string" },
    output: { type: "string" },
    help: { type: "boolean", short: "h", default: false },
  },
});

if (values.help) usage(0);
const fmt = values.format as Format;
if (!FORMATS.includes(fmt)) usage(2);
const [cmd, ...rest] = positionals;

async function runAction(source: string, action: string): Promise<void> {
  if (!isSource(source)) usage(2);
  await ACTIONS[source](action);
  await poke(source);
}

try {
  if (cmd === "workspaces") {
    if (rest[0] === "focus" && rest[1] !== undefined) {
      await focusWorkspace(rest.slice(1).join(" "));
    } else {
      const once = async () => renderWorkspaces(await workspaces(), fmt, values.output);
      if (values.follow) await follow(once, 30_000, watchWorkspaces);
      else console.log(await once());
    }
  } else if (cmd === "click") {
    const [source, button] = rest;
    if (!source || !isSource(source)) usage(2);
    const action = CLICKS[source][button as Button];
    if (action) await runAction(source, action);
  } else if (cmd && isSource(cmd)) {
    if (rest[0]) {
      await runAction(cmd, rest[0]);
    } else {
      const once = async () => render(await READERS[cmd](), fmt);
      const interval = values.interval ? Number(values.interval) * 1000 : INTERVALS[cmd];
      if (values.follow) await follow(once, interval);
      else console.log(await once());
    }
  } else {
    usage(cmd ? 2 : 0);
  }
} catch (e) {
  console.error(`sbs: ${(e as Error).message}`);
  process.exit(1);
}
