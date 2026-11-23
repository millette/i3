# Status bars for i3 (X11): now playing, pomodoro, workrave

Configs for eight i3 status bar setups. They all show the same three things,
**now playing**, a **pomodoro** timer and **workrave** break timers, with the same
colours and the same click actions.

All bars get their data from one small TypeScript CLI, `sbs`, which prints each
source in the format that bar understands. Your scripts only have to be wired up
once, and switching bars is just a matter of trying another config.

| Directory | Bar | Replaces i3bar? | Start from i3 |
|---|---|---|---|
| `i3status-rust/` | i3status-rust `custom` blocks | no | `i3status-rust/i3.conf` |
| `i3bar/` | own `status_command` (`bin/i3bar-status.ts`) | no | `i3bar/i3.conf` |
| `polybar/` | polybar `custom/script` | yes | `polybar/i3.conf` |
| `eww/` | eww `deflisten` widgets + SCSS | yes | `eww/i3.conf` |
| `yambar/` | yambar `script` modules | yes | `yambar/i3.conf` |
| `quickshell/` | Quickshell QML (`Feed.qml`, `Segment.qml`) | yes | `quickshell/i3.conf` |
| `lemonbar/` | lemonbar fed by `bin/lemonbar-feed.ts` | yes | `lemonbar/i3.conf` |
| `xmobar/` | xmobar `CommandReader` | yes | `xmobar/i3.conf` |

## Install

Requires Node ≥ 26 (runs `.ts` directly), with [nub](https://nubjs.com) used when it is installed (`.node-version` pins Node 26 for it), `playerctl` for the
now playing fallback, `gdbus` (from GLib) for workrave and `notify-send` for
workrave details.

```sh
cd contrib/statusbars
ln -s "$PWD/bin/sbs"            ~/.local/bin/sbs
ln -s "$PWD/bin/i3bar-status"   ~/.local/bin/i3bar-status    # i3bar option only
ln -s "$PWD/bin/lemonbar-feed"  ~/.local/bin/lemonbar-feed   # lemonbar option only
sbs pomodoro                                                 # → 🍅 start
```

Then copy the bar's config into place (the first comment in each file gives the
path) and follow its `i3.conf`. `~/.local/bin` must be on the `PATH` that i3
starts with. The wrappers use `nub` when it is on `PATH`, else `node`; set `SB_RUNTIME` to force one.

## `sbs`

```
sbs <source> [--format F] [--follow] [--interval SECONDS]
sbs <source> <action>
sbs click <source> <left|middle|right|up|down>
sbs workspaces [--format F] [--follow] [--output NAME]
sbs workspaces focus <number|name>
```

* sources: `now-playing`, `pomodoro`, `workrave`
* formats: `plain`, `json` (eww, Quickshell), `i3rs`, `i3bar`, `polybar`, `lemonbar`, `xmobar`, `yambar`
* `--follow` prints a new line whenever the output changes. An action (`sbs pomodoro toggle`)
  sends `SIGUSR2` to the followers of that source so the bar updates immediately.

### Clicks (same in every bar)

| | left | middle | right | scroll |
|---|---|---|---|---|
| now playing | play/pause | previous | next | previous / next |
| pomodoro | start · pause · resume · next phase when overdue | reset | skip | — |
| workrave | notification with all timers | — | open workrave | — |

polybar, eww, yambar, Quickshell, lemonbar and xmobar also show separate ⏮ / ⏭ buttons
around the track. In the i3bar option, Shift+left click also resets the pomodoro.

### Colours

Every source has a state: `idle`, `info`, `good`, `warning`, `critical`. i3status-rust
maps it to its theme colours, eww and yambar to their styles, and everything else uses
the palette below (Catppuccin Mocha). Override it with `SB_COLOR_IDLE`, `SB_COLOR_INFO`,
`SB_COLOR_GOOD`, `SB_COLOR_WARNING` and `SB_COLOR_CRITICAL`.

## Sources

### now playing

Runs `NOW_PLAYING_CMD` (default `now-playing-straw`) and uses its output. The command
may print either:

* a plain line of text (pango or polybar markup is stripped), or
* JSON: `{"text": "...", "state": "good", "icon": "♪", "short": "..."}`.

If the command keeps running, `sbs` reads it for `NOW_PLAYING_TIMEOUT_MS` (3000)
and uses the last line. Prefer a command that prints once and exits.

When the command is missing or prints nothing, `sbs` falls back to `playerctl`,
which works with any MPRIS player. Set `NOW_PLAYING_CMD=playerctl` to use
playerctl only.

Actions use `playerctl` (`play-pause`, `next`, `previous`). Override them with
`NOW_PLAYING_TOGGLE_CMD`, `NOW_PLAYING_NEXT_CMD` and `NOW_PLAYING_PREVIOUS_CMD`.
Also set: `NOW_PLAYING_MAX` (60 characters) and `NOW_PLAYING_SHORT_MAX` (25).

### pomodoro

A built-in timer keeps its state in `$XDG_RUNTIME_DIR/statusbars/pomodoro.json`,
so every bar and every click shares it. Settings: `POMODORO_WORK_MIN` (25),
`POMODORO_BREAK_MIN` (5), `POMODORO_LONG_BREAK_MIN` (15), `POMODORO_LONG_EVERY` (4)
and `POMODORO_WARN_SEC` (120). Colours: work is green, break is blue, the last
2 minutes are orange and overdue is red.

To keep your own pomodoro tool, set `POMODORO_CMD`, which uses the same output
contract as now playing, plus `POMODORO_TOGGLE_CMD`, `POMODORO_SKIP_CMD` and
`POMODORO_RESET_CMD`.

### workrave

Reads Workrave's D-Bus interface (`org.workrave.Workrave`,
`/org/workrave/Workrave/Core`). For each of the micro break, rest break and daily
limit it calls `GetTimerElapsed` and reads the limit with
`ConfigInterface.GetInt /timers/<id>/limit`, then shows the time remaining. The
timer closest to its limit sets the colour (`WORKRAVE_WARN_RATIO`, default 0.1).
`WORKRAVE_SHOW=restbreak,dailylimit` hides timers. The block shows `👁 off` when
Workrave is not running.

> The method names come from Workrave's `dbus-example.py`. I could not find the
> current D-Bus XML, so check them against your version with
> `gdbus introspect --session --dest org.workrave.Workrave --object-path /org/workrave/Workrave/Core`.
> If they differ, adjust `lib/sources.ts` or override the actions with
> `WORKRAVE_DETAILS_CMD` and `WORKRAVE_OPEN_CMD`.

## Layout

```
bin/sbs.ts             CLI used by every config
bin/i3bar-status.ts    i3bar status_command (i3bar protocol, click events)
bin/lemonbar-feed.ts   starts lemonbar, feeds it, runs its click commands
bin/sbs, bin/i3bar-status, bin/lemonbar-feed   sh wrappers: nub if installed, else node
lib/sources.ts         now playing, pomodoro, workrave, palette, click map
lib/format.ts          one renderer per bar format (escaping included)
lib/workspaces.ts      i3 workspaces for eww, lemonbar, xmobar, Quickshell
test/                  node:test unit tests (npm test / nub run test)
```

## Status

* Tested: `sbs` in every format, actions, `--follow` with the SIGUSR2 refresh,
  `i3bar-status` with simulated i3bar clicks, `lemonbar-feed` against a fake
  lemonbar, and workrave parsing against a fake `gdbus`, all on Node 26.13 with no
  flags. Unit tests pass (`npm test`) and the code passes `tsc --strict`.
* Not run against the real programs (none were installed where this was written):
  i3status-rust, polybar, eww, yambar, Quickshell, lemonbar, xmobar, Workrave,
  now-playing-straw and nub itself (only plain `node` was used). The configs follow each program's documented
  syntax, but expect small fixes on first start. The most likely to need them are
  yambar (`~visible` conditions), eww (`:onscroll`) and Quickshell
  (`Quickshell.execDetached` needs a recent version).
