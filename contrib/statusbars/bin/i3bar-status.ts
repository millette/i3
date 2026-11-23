/**
 * A complete i3bar `status_command`: now playing, pomodoro, workrave and the
 * date, with click handling. Speaks the i3bar protocol directly, so i3bar
 * stays the bar (workspaces, tray) and this program owns the status area.
 *
 * Clicks: see CLICKS in lib/sources.ts. Shift+left on the pomodoro resets it.
 */
import { createInterface } from "node:readline";
import { exitOnClosedStdout } from "../lib/follow.ts";
import { i3barBlock } from "../lib/format.ts";
import { cached, env } from "../lib/run.ts";
import { ACTIONS, CLICKS, READERS, SOURCES, buttonName, isSource, type SourceId } from "../lib/sources.ts";

const readers: Record<SourceId, () => ReturnType<(typeof READERS)[SourceId]>> = {
  "now-playing": cached(READERS["now-playing"], 2000),
  pomodoro: READERS.pomodoro,
  workrave: cached(READERS.workrave, 5000),
};

const dateFormat = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

let busy = false;
async function tick(): Promise<void> {
  if (busy) return;
  busy = true;
  try {
    const statuses = await Promise.all(SOURCES.map((id) => readers[id]()));
    const blocks = statuses.map(i3barBlock).filter((b) => b !== undefined);
    if (env("SB_I3BAR_DATE", "1") !== "0") blocks.push({ name: "date", full_text: dateFormat.format(new Date()) });
    process.stdout.write(JSON.stringify(blocks) + ",\n");
  } finally {
    busy = false;
  }
}

interface ClickEvent {
  name?: string;
  button?: number;
  modifiers?: string[];
}

async function onClick(ev: ClickEvent): Promise<void> {
  if (!ev.name || !isSource(ev.name) || ev.button === undefined) return;
  const button = buttonName(ev.button);
  if (!button) return;
  let action = CLICKS[ev.name][button];
  if (ev.name === "pomodoro" && button === "left" && ev.modifiers?.includes("Shift")) action = "reset";
  if (!action) return;
  try {
    await ACTIONS[ev.name](action);
  } catch (e) {
    console.error(`i3bar-status: ${(e as Error).message}`);
  }
  await tick();
}

exitOnClosedStdout();
process.stdout.write(JSON.stringify({ version: 1, click_events: true }) + "\n[\n");

// i3bar sends an endless JSON array of click events: "[", then "{...}", ",{...}".
createInterface({ input: process.stdin }).on("line", (line) => {
  const json = line.trim().replace(/^[[,]/, "").trim();
  if (!json) return;
  try {
    void onClick(JSON.parse(json) as ClickEvent);
  } catch {
    // ignore malformed lines
  }
});

await tick();
setInterval(() => void tick(), 1000);
