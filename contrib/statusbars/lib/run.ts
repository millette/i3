import { execFile } from "node:child_process";

export interface RunResult {
  ok: boolean;
  stdout: string;
}

/**
 * Run a command without a shell. Never throws: a missing binary, a non-zero
 * exit or a timeout all resolve with ok=false. On timeout, whatever the
 * command printed so far is still returned, so a streaming program (one that
 * never exits) can be sampled.
 */
export function run(cmd: string, args: string[], timeoutMs = 2000): Promise<RunResult> {
  return new Promise((resolve) => {
    execFile(
      cmd,
      args,
      { timeout: timeoutMs, encoding: "utf8", maxBuffer: 1 << 20 },
      (err, stdout) => resolve({ ok: !err, stdout: stdout ?? "" }),
    );
  });
}

/** Run a user-supplied command line through sh (for *_CMD env overrides). */
export function runShell(commandLine: string, timeoutMs = 2000): Promise<RunResult> {
  return run("sh", ["-c", commandLine], timeoutMs);
}

/** Memoize an async function for `ms` milliseconds. */
export function cached<T>(fn: () => Promise<T>, ms: number): () => Promise<T> {
  let at = 0;
  let value: Promise<T> | undefined;
  return () => {
    const now = Date.now();
    if (!value || now - at >= ms) {
      at = now;
      value = fn();
    }
    return value;
  };
}

export function env(name: string, fallback: string): string {
  const v = process.env[name];
  return v === undefined || v === "" ? fallback : v;
}

export function envNumber(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
