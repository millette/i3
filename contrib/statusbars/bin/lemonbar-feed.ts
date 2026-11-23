/**
 * Starts lemonbar, feeds it workspaces | now playing | pomodoro, workrave, date
 * and runs the commands lemonbar prints when an area is clicked.
 *
 *   lemonbar-feed [lemonbar arguments...]
 *
 * Click commands printed by lemonbar: "ws <number|name>" or "<source> <action>".
 */
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { render, renderWorkspaces } from "../lib/format.ts";
import { cached, env } from "../lib/run.ts";
import { ACTIONS, PALETTE, READERS, isSource, type SourceId } from "../lib/sources.ts";
import { focusWorkspace, watchWorkspaces, workspaces } from "../lib/workspaces.ts";

const bg = env("SB_BG", "#1e1e2e");
const fg = env("SB_FG", "#cdd6f4");
const args = process.argv.length > 2
  ? process.argv.slice(2)
  : ["-p", "-g", "x26", "-B", bg, "-F", fg, "-f", env("SB_FONT", "monospace:size=11"), "-a", "40", "-n", "lemonbar"];

const bar = spawn(env("LEMONBAR", "lemonbar"), args, { stdio: ["pipe", "pipe", "inherit"] });
bar.on("exit", (code) => process.exit(code ?? 0));
bar.stdin.on("error", () => process.exit(0));

const readers: Record<SourceId, () => ReturnType<(typeof READERS)[SourceId]>> = {
  "now-playing": cached(READERS["now-playing"], 2000),
  pomodoro: READERS.pomodoro,
  workrave: cached(READERS.workrave, 5000),
};

const dateFormat = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

let busy = false;
async function tick(): Promise<void> {
  if (busy) return;
  busy = true;
  try {
    const [ws, np, pomo, wr] = await Promise.all([
      workspaces(),
      readers["now-playing"](),
      readers.pomodoro(),
      readers.workrave(),
    ]);
    const sep = `%{F${PALETTE.idle}} │ %{F-}`;
    const right = [render(pomo, "lemonbar"), render(wr, "lemonbar"), dateFormat.format(new Date())].filter(Boolean).join(sep);
    bar.stdin.write(`%{l}${renderWorkspaces(ws, "lemonbar")}%{c}${render(np, "lemonbar")}%{r}${right} \n`);
  } finally {
    busy = false;
  }
}

createInterface({ input: bar.stdout }).on("line", async (line) => {
  const [what, ...rest] = line.trim().split(" ");
  try {
    if (what === "ws") await focusWorkspace(rest.join(" "));
    else if (what && isSource(what) && rest[0]) await ACTIONS[what](rest[0]);
  } catch (e) {
    console.error(`lemonbar-feed: ${(e as Error).message}`);
  }
  await tick();
});

watchWorkspaces(() => void tick());
await tick();
setInterval(() => void tick(), 1000);
