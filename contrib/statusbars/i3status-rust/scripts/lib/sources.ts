// GENERATED from contrib/statusbars/lib/sources.ts by tools/vendor.ts. Do not edit; run `npm run vendor`.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { env, envNumber, run, runShell } from "./run.ts";

export type State = "idle" | "info" | "good" | "warning" | "critical";
export type SourceId = "now-playing" | "pomodoro" | "workrave";
export type Button = "left" | "middle" | "right" | "up" | "down";

export const SOURCES: SourceId[] = ["now-playing", "pomodoro", "workrave"];

/** Normalized output of every source. `text` is plain text, never markup. */
export interface Status {
  id: SourceId;
  icon: string;
  text: string;
  short: string;
  state: State;
  color: string;
  tooltip: string;
}

export const PALETTE: Record<State, string> = {
  idle: env("SB_COLOR_IDLE", "#a6adc8"),
  info: env("SB_COLOR_INFO", "#89b4fa"),
  good: env("SB_COLOR_GOOD", "#a6e3a1"),
  warning: env("SB_COLOR_WARNING", "#fab387"),
  critical: env("SB_COLOR_CRITICAL", "#f38ba8"),
};

/** Which action each mouse button triggers, shared by every bar config. */
export const CLICKS: Record<SourceId, Partial<Record<Button, string>>> = {
  "now-playing": { left: "toggle", middle: "previous", right: "next", up: "previous", down: "next" },
  pomodoro: { left: "toggle", middle: "reset", right: "skip" },
  workrave: { left: "details", right: "open" },
};

/** Default refresh interval (ms) when following a source. */
export const INTERVALS: Record<SourceId, number> = {
  "now-playing": 2000,
  pomodoro: 1000,
  workrave: 5000,
};

function status(id: SourceId, icon: string, text: string, state: State, extra: Partial<Status> = {}): Status {
  return { id, icon, text, short: text, state, color: PALETTE[state], tooltip: text, ...extra };
}

const empty = (id: SourceId): Status => status(id, "", "", "idle");

export function truncate(s: string, max: number): string {
  const chars = [...s];
  return chars.length <= max ? s : chars.slice(0, max - 1).join("") + "…";
}

export function mmss(ms: number): string {
  const total = Math.round(Math.abs(ms) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const sign = ms < 0 ? "-" : "";
  return h > 0
    ? `${sign}${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${sign}${m}:${String(s).padStart(2, "0")}`;
}

const STATES: State[] = ["idle", "info", "good", "warning", "critical"];
function toState(v: unknown): State | undefined {
  const s = String(v ?? "").toLowerCase();
  return (STATES as string[]).includes(s) ? (s as State) : undefined;
}

/** Remove pango / polybar / lemonbar markup that an external command may print. */
export function stripMarkup(s: string): string {
  return s
    .replace(/<[^>]*>/g, "")
    .replace(/%\{[^}]*\}/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

/**
 * Contract for external commands (NOW_PLAYING_CMD, POMODORO_CMD): print either
 * a plain text line or a JSON object {"text", "state"?, "icon"?, "short"?}.
 * If the command keeps running, the last line printed before the timeout wins.
 */
export function parseExternal(out: string): { text: string; state?: State; icon?: string; short?: string } | null {
  const line = out
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .at(-1);
  if (!line) return null;
  if (line.startsWith("{")) {
    try {
      const j = JSON.parse(line) as Record<string, unknown>;
      const text = stripMarkup(String(j.text ?? j.full_text ?? ""));
      if (!text) return null;
      return {
        text,
        state: toState(j.state),
        icon: typeof j.icon === "string" ? j.icon : undefined,
        short: typeof j.short === "string" ? stripMarkup(j.short) : typeof j.short_text === "string" ? stripMarkup(j.short_text) : undefined,
      };
    } catch {
      // not JSON after all: fall through to plain text
    }
  }
  const text = stripMarkup(line);
  return text ? { text } : null;
}

// ---------------------------------------------------------------- now playing

export async function nowPlaying(): Promise<Status> {
  const max = envNumber("NOW_PLAYING_MAX", 60);
  const shortMax = envNumber("NOW_PLAYING_SHORT_MAX", 25);
  const cmd = env("NOW_PLAYING_CMD", "now-playing-straw");

  if (cmd !== "playerctl") {
    const ext = parseExternal((await runShell(cmd, envNumber("NOW_PLAYING_TIMEOUT_MS", 3000))).stdout);
    if (ext) {
      return status("now-playing", ext.icon ?? "♪", truncate(ext.text, max), ext.state ?? "good", {
        short: truncate(ext.short ?? ext.text, shortMax),
        tooltip: ext.text,
      });
    }
  }

  // Fallback: any MPRIS player through playerctl.
  const r = await run("playerctl", ["metadata", "--format", "{{status}}\t{{artist}}\t{{title}}"]);
  if (!r.ok) return empty("now-playing");
  const [playerStatus = "", artist = "", title = ""] = r.stdout.trim().split("\t");
  if (!title && !artist) return empty("now-playing");
  const full = artist ? `${artist} — ${title}` : title;
  const playing = playerStatus === "Playing";
  return status("now-playing", playing ? "▶" : "⏸", truncate(full, max), playing ? "good" : "idle", {
    short: truncate(title || full, shortMax),
    tooltip: full,
  });
}

export async function nowPlayingAction(action: string): Promise<void> {
  const playerctl: Record<string, string> = { toggle: "play-pause", next: "next", previous: "previous" };
  if (!(action in playerctl)) throw new Error(`now-playing: unknown action "${action}" (toggle, next, previous)`);
  const override = process.env[`NOW_PLAYING_${action.toUpperCase()}_CMD`];
  if (override) await runShell(override, 5000);
  else await run("playerctl", [playerctl[action]]);
}

// ------------------------------------------------------------------- pomodoro

type Phase = "idle" | "work" | "break" | "long-break";
interface PomodoroState {
  phase: Phase;
  endsAt: number; // epoch ms, when running
  pausedRemaining: number | null; // ms, when paused
  done: number; // completed work sessions
}

const POMODORO_FILE = join(env("XDG_RUNTIME_DIR", tmpdir()), "statusbars", "pomodoro.json");
const minutes = (name: string, fallback: number) => envNumber(name, fallback) * 60_000;
const durations = (): Record<Exclude<Phase, "idle">, number> => ({
  work: minutes("POMODORO_WORK_MIN", 25),
  break: minutes("POMODORO_BREAK_MIN", 5),
  "long-break": minutes("POMODORO_LONG_BREAK_MIN", 15),
});

async function loadPomodoro(): Promise<PomodoroState> {
  try {
    return JSON.parse(await readFile(POMODORO_FILE, "utf8")) as PomodoroState;
  } catch {
    return { phase: "idle", endsAt: 0, pausedRemaining: null, done: 0 };
  }
}

async function savePomodoro(s: PomodoroState): Promise<void> {
  await mkdir(dirname(POMODORO_FILE), { recursive: true });
  await writeFile(POMODORO_FILE, JSON.stringify(s));
}

function startPhase(s: PomodoroState, phase: Exclude<Phase, "idle">): PomodoroState {
  return { ...s, phase, endsAt: Date.now() + durations()[phase], pausedRemaining: null };
}

function nextPhase(s: PomodoroState): PomodoroState {
  if (s.phase === "work") {
    const done = s.done + 1;
    const every = envNumber("POMODORO_LONG_EVERY", 4);
    return startPhase({ ...s, done }, done % every === 0 ? "long-break" : "break");
  }
  return startPhase(s, "work");
}

export async function pomodoro(): Promise<Status> {
  const ext = process.env.POMODORO_CMD;
  if (ext) {
    const p = parseExternal((await runShell(ext)).stdout);
    return p ? status("pomodoro", p.icon ?? "🍅", p.text, p.state ?? "good", { short: p.short ?? p.text }) : empty("pomodoro");
  }

  const s = await loadPomodoro();
  const tally = s.done > 0 ? ` ×${s.done}` : "";
  if (s.phase === "idle") return status("pomodoro", "🍅", `start${tally}`, "idle", { short: "start" });

  const icon = s.phase === "work" ? "🍅" : "☕";
  if (s.pausedRemaining !== null) {
    return status("pomodoro", "⏸", `${mmss(s.pausedRemaining)}${tally}`, "idle", { short: mmss(s.pausedRemaining) });
  }
  const left = s.endsAt - Date.now();
  if (left <= 0) {
    const msg = s.phase === "work" ? "take a break" : "back to work";
    return status("pomodoro", icon, `${msg} (${mmss(left)})`, "critical", { short: mmss(left) });
  }
  const state: State = left <= envNumber("POMODORO_WARN_SEC", 120) * 1000 ? "warning" : s.phase === "work" ? "good" : "info";
  return status("pomodoro", icon, `${mmss(left)}${tally}`, state, { short: mmss(left) });
}

export async function pomodoroAction(action: string): Promise<void> {
  const ext = process.env[`POMODORO_${action.toUpperCase()}_CMD`];
  if (ext) {
    await runShell(ext, 5000);
    return;
  }
  const s = await loadPomodoro();
  switch (action) {
    case "toggle": // start / pause / resume, or advance when the timer is overdue
      if (s.phase === "idle") return savePomodoro(startPhase(s, "work"));
      if (s.pausedRemaining !== null) return savePomodoro({ ...s, endsAt: Date.now() + s.pausedRemaining, pausedRemaining: null });
      if (s.endsAt <= Date.now()) return savePomodoro(nextPhase(s));
      return savePomodoro({ ...s, pausedRemaining: s.endsAt - Date.now() });
    case "skip":
      return savePomodoro(s.phase === "idle" ? startPhase(s, "work") : nextPhase(s));
    case "reset":
      return savePomodoro({ phase: "idle", endsAt: 0, pausedRemaining: null, done: 0 });
    default:
      throw new Error(`pomodoro: unknown action "${action}" (toggle, skip, reset)`);
  }
}

// ------------------------------------------------------------------- workrave

const WR = ["--session", "--dest", "org.workrave.Workrave", "--object-path", "/org/workrave/Workrave/Core"];
const TIMERS = [
  { id: "microbreak", config: "micro_pause", icon: "👁", label: "micro", fallbackMin: 3 },
  { id: "restbreak", config: "rest_break", icon: "☕", label: "rest", fallbackMin: 45 },
  { id: "dailylimit", config: "daily_limit", icon: "⌛", label: "daily", fallbackMin: 240 },
] as const;

/** First integer in gdbus output such as "(123,)" or "(int32 123, true)". */
export function gdbusInt(out: string): number | null {
  const m = out.replace(/\b(?:u?int(?:16|32|64)|byte|double)\b/g, "").match(/-?\d+/);
  return m ? Number(m[0]) : null;
}

async function gdbus(method: string, ...args: string[]): Promise<number | null> {
  const r = await run("gdbus", ["call", ...WR, "--method", method, ...args], 1500);
  return r.ok ? gdbusInt(r.stdout) : null;
}

export async function workrave(): Promise<Status> {
  const timers = await Promise.all(
    TIMERS.map(async (t) => {
      const elapsed = await gdbus("org.workrave.CoreInterface.GetTimerElapsed", t.id);
      if (elapsed === null) return null;
      const limit =
        (await gdbus("org.workrave.ConfigInterface.GetInt", `/timers/${t.config}/limit`)) ?? t.fallbackMin * 60;
      return { ...t, remaining: (limit - elapsed) * 1000, limit: limit * 1000 };
    }),
  );
  if (timers.some((t) => t === null)) {
    return status("workrave", "👁", "off", "idle", { tooltip: "Workrave is not running or its D-Bus interface did not answer" });
  }
  const list = timers as NonNullable<(typeof timers)[number]>[];
  const fmtLeft = (ms: number) => (ms >= 3_600_000 ? `${Math.floor(ms / 3_600_000)}h${String(Math.floor((ms % 3_600_000) / 60_000)).padStart(2, "0")}` : mmss(ms));

  // The timer closest to its limit decides the colour.
  const urgent = list.reduce((a, b) => (b.remaining / b.limit < a.remaining / a.limit ? b : a));
  const warnRatio = envNumber("WORKRAVE_WARN_RATIO", 0.1);
  const state: State = urgent.remaining <= 0 ? "critical" : urgent.remaining / urgent.limit <= warnRatio ? "warning" : "good";

  const show = env("WORKRAVE_SHOW", "microbreak,restbreak,dailylimit").split(",");
  const text = list
    .filter((t) => show.includes(t.id))
    .map((t) => `${t.icon} ${fmtLeft(t.remaining)}`)
    .join("  ");
  return status("workrave", "", text, state, {
    short: `${urgent.icon} ${fmtLeft(urgent.remaining)}`,
    tooltip: list.map((t) => `${t.label}: ${fmtLeft(t.remaining)} left`).join("\n"),
  });
}

export async function workraveAction(action: string): Promise<void> {
  const override = process.env[`WORKRAVE_${action.toUpperCase()}_CMD`];
  if (override) {
    await runShell(override, 5000);
    return;
  }
  switch (action) {
    case "details": {
      const s = await workrave();
      await run("notify-send", ["-a", "workrave", "Workrave", s.tooltip]);
      return;
    }
    case "open":
      // Starting workrave again brings the running instance forward.
      await runShell("setsid -f workrave >/dev/null 2>&1", 2000);
      return;
    default:
      throw new Error(`workrave: unknown action "${action}" (details, open)`);
  }
}

// -------------------------------------------------------------------- dispatch

export const READERS: Record<SourceId, () => Promise<Status>> = {
  "now-playing": nowPlaying,
  pomodoro,
  workrave,
};

export const ACTIONS: Record<SourceId, (action: string) => Promise<void>> = {
  "now-playing": nowPlayingAction,
  pomodoro: pomodoroAction,
  workrave: workraveAction,
};

export function isSource(s: string): s is SourceId {
  return (SOURCES as string[]).includes(s);
}

/** i3bar / X11 button numbers to names. */
export function buttonName(n: number): Button | undefined {
  return ({ 1: "left", 2: "middle", 3: "right", 4: "up", 5: "down" } as Record<number, Button>)[n];
}
