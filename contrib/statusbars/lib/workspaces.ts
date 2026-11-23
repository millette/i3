import { spawn } from "node:child_process";
import { run } from "./run.ts";

/** Subset of i3's GET_WORKSPACES reply. */
export interface Workspace {
  num: number;
  name: string;
  focused: boolean;
  visible: boolean;
  urgent: boolean;
  output: string;
}

export async function workspaces(): Promise<Workspace[]> {
  const r = await run("i3-msg", ["-t", "get_workspaces"]);
  if (!r.ok) return [];
  try {
    return (JSON.parse(r.stdout) as Workspace[]).map(({ num, name, focused, visible, urgent, output }) => ({
      num,
      name,
      focused,
      visible,
      urgent,
      output,
    }));
  } catch {
    return [];
  }
}

/** Call `onChange` on every i3 workspace/output event. Reconnects if i3 restarts. */
export function watchWorkspaces(onChange: () => void): void {
  const p = spawn("i3-msg", ["-t", "subscribe", "-m", '["workspace","output"]'], {
    stdio: ["ignore", "pipe", "ignore"],
  });
  p.stdout.on("data", () => onChange());
  p.on("error", () => {});
  p.on("exit", () => setTimeout(() => watchWorkspaces(onChange), 2000));
}

export async function focusWorkspace(name: string): Promise<void> {
  const n = Number(name);
  // i3-msg joins its arguments into one command, so names with spaces work.
  await run("i3-msg", Number.isInteger(n) && n >= 0 ? ["workspace", "number", String(n)] : ["workspace", name]);
}

/** What to pass to `sbs workspaces focus`: the number when there is one, else the name. */
export function workspaceRef(w: Workspace): string {
  return w.num >= 0 ? String(w.num) : w.name;
}
