import { run } from "./run.ts";

/** Exit quietly when the bar that reads our stdout goes away. */
export function exitOnClosedStdout(): void {
  process.stdout.on("error", () => process.exit(0));
}

/**
 * Print `render()` every `intervalMs`, and immediately on SIGUSR2 (sent by
 * `sbs <source> <action>` after a click). Only prints when the output changed.
 * SIGUSR1 is not used because Node reserves it for the inspector.
 */
export async function follow(render: () => Promise<string>, intervalMs: number, wakeOn?: (wake: () => void) => void): Promise<never> {
  exitOnClosedStdout();
  let wake: () => void = () => {};
  process.on("SIGUSR2", () => wake());
  wakeOn?.(() => wake());
  let last: string | undefined;
  for (;;) {
    const out = await render();
    if (out !== last) {
      process.stdout.write(out + "\n");
      last = out;
    }
    await new Promise<void>((resolve) => {
      const t = setTimeout(resolve, intervalMs);
      wake = () => {
        clearTimeout(t);
        resolve();
      };
    });
  }
}

/** Tell every `sbs <source> … --follow` process to refresh now. */
export async function poke(source: string): Promise<void> {
  await run("pkill", ["-USR2", "-f", `sbs\\.ts ${source} .*--follow`]);
}
