// GENERATED from contrib/statusbars/lib/follow.ts by tools/vendor.ts. Do not edit; run `npm run vendor`.
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { env } from "./run.ts";

const followDir = (source: string) => join(env("XDG_RUNTIME_DIR", tmpdir()), "statusbars", "follow", source);

/** Exit quietly when the bar that reads our stdout goes away. */
export function exitOnClosedStdout(): void {
  process.stdout.on("error", () => process.exit(0));
}

/** Record this process as a follower of `source`, so `poke` can find it. */
async function register(source: string): Promise<void> {
  const dir = followDir(source);
  await mkdir(dir, { recursive: true });
  const file = join(dir, String(process.pid));
  await writeFile(file, "");
  const cleanup = () => rmSync(file, { force: true });
  process.on("exit", cleanup);
  for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
    process.on(sig, () => {
      cleanup();
      process.exit(0);
    });
  }
}

export interface FollowOptions {
  /** Register as a follower so `poke(source)` refreshes immediately. */
  source?: string;
  /** Extra trigger, e.g. i3 workspace events. */
  wakeOn?: (wake: () => void) => void;
}

/**
 * Print `render()` every `intervalMs`, and immediately on SIGUSR2 (sent by
 * `poke` after a click). Only prints when the output changed.
 * SIGUSR1 is not used because Node reserves it for the inspector.
 */
export async function follow(render: () => Promise<string>, intervalMs: number, opts: FollowOptions = {}): Promise<never> {
  exitOnClosedStdout();
  let wake: () => void = () => {};
  process.on("SIGUSR2", () => wake());
  opts.wakeOn?.(() => wake());
  if (opts.source) await register(opts.source);
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

/**
 * Tell every follower of `source` to refresh now. A PID is only signalled if
 * /proc shows it is still one of our followers, so a stale file whose PID was
 * reused by another program never gets a signal (SIGUSR2 would kill it).
 */
export async function poke(source: string): Promise<void> {
  const dir = followDir(source);
  let pids: string[];
  try {
    pids = await readdir(dir);
  } catch {
    return;
  }
  await Promise.all(
    pids.map(async (pid) => {
      try {
        const cmdline = (await readFile(`/proc/${pid}/cmdline`, "utf8")).split("\0");
        if (cmdline.includes("--follow") && cmdline.some((a) => a === source || a.endsWith(`/${source}.ts`))) {
          process.kill(Number(pid), "SIGUSR2");
          return;
        }
      } catch {
        // process gone
      }
      await rm(join(dir, pid), { force: true });
    }),
  );
}
