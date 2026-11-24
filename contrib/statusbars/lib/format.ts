import { CLICKS, PALETTE, type Button, type SourceId, type Status } from "./sources.ts";
import { workspaceRef, type Workspace } from "./workspaces.ts";
import { env } from "./run.ts";

export type Format = "plain" | "json" | "i3rs" | "i3bar" | "polybar" | "lemonbar" | "xmobar" | "yambar";
export const FORMATS: Format[] = ["plain", "json", "i3rs", "i3bar", "polybar", "lemonbar", "xmobar", "yambar"];

const BUTTON_NUMBER: Record<Button, number> = { left: 1, middle: 2, right: 3, up: 4, down: 5 };

export function escapePango(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/'/g, "&#39;").replace(/"/g, "&quot;");
}

/** polybar and lemonbar: '%' starts a tag. */
const escapePercent = (s: string) => s.replace(/%/g, "%%");
/** Inside %{A:cmd:} a ':' must be escaped. */
const escapeColon = (s: string) => s.replace(/:/g, "\\:");
/** xmobar parses <tags> in command output; swap angle brackets for look-alikes. */
const escapeXmobar = (s: string) => s.replace(/</g, "‹").replace(/>/g, "›");

const label = (s: Status) => (s.icon ? `${s.icon} ${s.text}` : s.text);
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Builds the shell command a bar runs on click. Defaults to `sbs <source> <action>`. */
let commandFor = (source: string, action: string): string => `${env("SB_CMD", "sbs")} ${source} ${action}`;

/** Per-bar scripts use this to make clicks call themselves instead of `sbs`. */
export function setClickCommand(fn: (source: string, action: string) => string): void {
  commandFor = fn;
}

/**
 * Command a bar runs on click. polybar and xmobar run it through sh;
 * lemonbar-feed interprets the bare "<source> <action>".
 */
function clickCommand(fmt: Format, source: string, action: string): string {
  return fmt === "lemonbar" ? `${source} ${action}` : commandFor(source, action);
}

/** Wrap text in clickable areas, one per button that has an action. */
function clickable(fmt: Format, source: string, text: string, actions: Partial<Record<Button, string>>): string {
  let out = text;
  for (const [button, action] of Object.entries(actions) as [Button, string][]) {
    const n = BUTTON_NUMBER[button];
    const cmd = clickCommand(fmt, source, action);
    out = fmt === "xmobar" ? `<action=\`${cmd}\` button=${n}>${out}</action>` : `%{A${n}:${escapeColon(cmd)}:}${out}%{A}`;
  }
  return out;
}

function colored(fmt: Format, color: string, text: string): string {
  return fmt === "xmobar" ? `<fc=${color}>${text}</fc>` : `%{F${color}}${text}%{F-}`;
}

/** polybar / lemonbar / xmobar markup for one status, with inline click areas. */
function tagged(fmt: "polybar" | "lemonbar" | "xmobar", s: Status): string {
  if (!s.text) return "";
  const esc = fmt === "xmobar" ? escapeXmobar : escapePercent;
  const body = clickable(fmt, s.id, colored(fmt, s.color, esc(label(s))), CLICKS[s.id]);
  if (s.id !== "now-playing") return body;
  // Separate ⏮ / ⏭ buttons around the track: only bars with inline click areas can do this.
  const prev = clickable(fmt, s.id, "⏮", { left: "previous" });
  const next = clickable(fmt, s.id, "⏭", { left: "next" });
  return `${prev} ${body} ${next}`;
}

/** i3bar protocol block (used by i3bar-status). Undefined when there is nothing to show. */
export function i3barBlock(s: Status): Record<string, unknown> | undefined {
  if (!s.text) return undefined;
  return {
    name: s.id,
    full_text: escapePango(label(s)),
    short_text: escapePango(s.icon ? `${s.icon} ${s.short}` : s.short),
    color: s.color,
    markup: "pango",
    separator_block_width: 15,
  };
}

export function render(s: Status, fmt: Format): string {
  switch (fmt) {
    case "plain":
      return label(s);
    case "json":
      // eww / Quickshell: everything, plus a visibility flag.
      return JSON.stringify({ ...s, label: label(s), visible: s.text !== "" });
    case "i3rs":
      // i3status-rust custom block, json = true. `state` picks the theme colours.
      return JSON.stringify({ state: capitalize(s.state), text: label(s), short_text: s.icon ? `${s.icon} ${s.short}` : s.short });
    case "i3bar":
      return JSON.stringify(i3barBlock(s) ?? {});
    case "polybar":
    case "lemonbar":
    case "xmobar":
      return tagged(fmt, s);
    case "yambar":
      // One tag per line, terminated by an empty line (added by the caller's newline).
      return [
        `icon|string|${s.icon}`,
        `text|string|${s.text.replace(/\n/g, " ")}`,
        `short|string|${s.short.replace(/\n/g, " ")}`,
        `state|string|${s.state}`,
        `visible|bool|${s.text !== ""}`,
        "",
      ].join("\n");
  }
}

// ----------------------------------------------------------------- workspaces

const WS_BG = { focused: env("SB_WS_FOCUSED_BG", "#45475a"), urgent: env("SB_WS_URGENT_BG", PALETTE.critical) };

export function renderWorkspaces(list: Workspace[], fmt: Format, output?: string): string {
  const shown = output ? list.filter((w) => w.output === output) : list;
  switch (fmt) {
    case "json":
      return JSON.stringify(shown);
    case "plain":
      return shown.map((w) => (w.focused ? `[${w.name}]` : ` ${w.name} `)).join("");
    case "polybar":
    case "lemonbar":
      return shown
        .map((w) => {
          const bg = w.urgent ? WS_BG.urgent : w.focused ? WS_BG.focused : "";
          const text = escapePercent(` ${w.name} `);
          const body = bg ? `%{B${bg}}${text}%{B-}` : text;
          const cmd = fmt === "lemonbar" ? `ws ${workspaceRef(w)}` : `${env("SB_CMD", "sbs")} workspaces focus ${workspaceRef(w)}`;
          return `%{A1:${escapeColon(cmd)}:}${body}%{A}`;
        })
        .join("");
    case "xmobar":
      return shown
        .map((w) => {
          const text = escapeXmobar(` ${w.name} `);
          const body = w.urgent
            ? `<fc=${PALETTE.critical}>${text}</fc>`
            : w.focused
              ? `<fc=#ffffff,${WS_BG.focused}>${text}</fc>`
              : text;
          return `<action=\`${env("SB_CMD", "sbs")} workspaces focus ${workspaceRef(w)}\` button=1>${body}</action>`;
        })
        .join("");
    default:
      throw new Error(`workspaces: format "${fmt}" not supported (json, plain, polybar, lemonbar, xmobar)`);
  }
}
