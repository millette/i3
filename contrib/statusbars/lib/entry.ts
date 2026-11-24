import { join } from "node:path";
import { parseArgs } from "node:util";
import { follow, poke } from "./follow.ts";
import { render, setClickCommand, type Format } from "./format.ts";
import { ACTIONS, CLICKS, INTERVALS, READERS, type Button, type SourceId } from "./sources.ts";

/**
 * Entry point for a per-bar script such as polybar/scripts/pomodoro.ts:
 *
 *   pomodoro.ts [--follow] [--interval SECONDS]   print in the bar's format
 *   pomodoro.ts <action>                          run an action, refresh followers
 *   pomodoro.ts click <left|middle|right|up|down>
 *
 * Click areas the script prints call the script itself, so the bar's folder
 * works on its own without `sbs` on PATH.
 */
export async function main(source: SourceId, format: Format, scriptDir: string): Promise<void> {
  setClickCommand((src, action) => `${join(scriptDir, `${src}.ts`)} ${action}`);
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      follow: { type: "boolean", default: false },
      interval: { type: "string" },
    },
  });
  const [first, second] = positionals;
  try {
    const action = first === "click" ? CLICKS[source][second as Button] : first;
    if (first === "click" && !action) return;
    if (action) {
      await ACTIONS[source](action);
      await poke(source);
      return;
    }
    const once = async () => render(await READERS[source](), format);
    if (values.follow) {
      await follow(once, values.interval ? Number(values.interval) * 1000 : INTERVALS[source], { source });
    } else {
      console.log(await once());
    }
  } catch (e) {
    console.error(`${source}: ${(e as Error).message}`);
    process.exit(1);
  }
}
