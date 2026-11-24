# Field notes: first real use (2026-11-24)

The README's "Status" section says nothing here was run against the real
programs. These notes record what happened when part of it was: one laptop
moved its two i3 bars from i3status to the **i3status-rust** option, with
Workrave and a pomodoro tool running. The other seven bars are still untried.

These notes were written against commit `dca9ff19`, when every bar called
`sbs`. The i3status-rust and polybar options have since become
self-contained (`scripts/<source>.ts` in place of `sbs <source>`); where the
notes say `sbs`, the same holds for those scripts, which share its sources.
The self-contained scripts themselves were not run on this machine.

## The machine

| | |
|---|---|
| i3 | 4.24, i3bar kept (workspaces, tray) |
| Bars | two `bar {}` blocks: laptop panel 1920 px, external screen 3840 px, font JetBrains Mono 16 |
| i3status-rust | 0.36.2, installed with cargo |
| Workrave | 1.11.5 (GTK), a fork with `ControlInterface` exported |
| Node | 26.13, nub installed |
| Pomodoro | [pomo](https://github.com/Bahaaio/pomo), a terminal program, not `sbs pomodoro` |
| Now playing | now-playing-straw, a long-running service that writes a text file |

## What was checked against the real programs

### `sbs workrave` works

```
$ sbs workrave --format plain
👁 16:36  ☕ 37:05  ⌛ 10h54
$ sbs workrave --format i3rs
{"state":"Good","text":"👁 16:36  ☕ 37:05  ⌛ 10h54","short_text":"☕ 37:05"}
```

The README's caveat about unverified method names can be dropped for
Workrave 1.11.5:

* `CoreInterface.GetTimerElapsed <id>` exists for `microbreak`, `restbreak`
  and `dailylimit`.
* `ConfigInterface.GetInt` returns `(value, found)`, and accepts the key with
  or without a leading slash: `/timers/micro_pause/limit` and
  `timers/micro_pause/limit` both gave `(1500, true)`.
* `CoreInterface.GetTimerRemaining <id>` also exists and equals limit minus
  elapsed (997 = 1500 − 503 at the time). Using it would halve the calls: the
  reader now spawns `gdbus` six times per refresh.

Two things to know about Workrave on D-Bus:

* **It is D-Bus activatable.** Calling a method when it is not running starts
  it. A status bar that polls would restart a Workrave the user just quit.
  Ask `org.freedesktop.DBus.NameHasOwner org.workrave.Workrave` first.
* **A timer with no limit reports a negative remaining time.** Show nothing
  for it instead of a countdown.

### `sbs pomodoro` works on its own

`sbs pomodoro --format i3rs` gave `{"state":"Idle","text":"🍅 start",...}`.
It was not used: the machine already has a pomodoro program, and two timers
would disagree.

### i3status-rust 0.36.2 `custom` blocks

`json = true` with `{"text", "short_text", "state"}` works as the config in
`i3status-rust/` assumes, and `[theme.overrides]` with `good_fg`, `info_fg`,
`warning_fg` and `critical_fg` on the `native` theme colours the text only.
Checked by reading i3status-rust's JSON output with made-up segments in each
state; the colours were not looked at on screen.

A block with a short text is emitted as two entries: one with the full text
and an empty short text (`<span/>`), one the other way round. i3bar then
switches each to its short form when the line does not fit. This is normal.

`persistent = true` with `sbs ... --follow`, and the click commands of
`i3status-rust/config.toml`, were **not** run.

## What the machine uses instead of `sbs`

The bar side of this directory was kept: i3status-rust, `custom` blocks, a
state per block, a short text, click commands. The sources were not:

* One background service reads everything every 5 seconds over a single
  D-Bus connection and writes one small JSON file per block under
  `$XDG_RUNTIME_DIR`: the task in progress, the pomodoro session, Workrave's
  micro-break and rest break.
* Each block is `command = "cat $XDG_RUNTIME_DIR/.../rest.json"`,
  `json = true`, `interval = 2`, `hide_when_empty = true`.
* A part with nothing to show is written as `{"text":""}`, and the block
  hides.

Why files instead of one `sbs --follow` process per block: with two bars,
every block would run twice, and each Workrave refresh costs six `gdbus`
processes. With files, two bars cost two `cat` per block and the readers run
once.

The states used:

| Block | State |
|---|---|
| task | `Idle`; `Warning` when left in progress during a long absence |
| pomodoro | `Good` for work, `Info` for a break |
| micro-break | `Warning` in the last minute, `Critical` when due |
| rest break | `Warning` in the last 5 minutes, `Critical` when due |

Workrave is two blocks, not one, so each is coloured by its own timer and a
click on the rest block can start a rest break
(`ControlInterface.RestBreak`, or `AppletInterface.MenuAction
'workrave.restbreak'` on a stock 1.11 build, where `ControlInterface` is not
exported).

### These files fit the `*_CMD` contract

`parseExternal` in `lib/sources.ts` accepts them as they are: it reads
`text`, lower-cases `state`, takes `short_text`, and treats an empty text as
"nothing to show". So the same setup can feed any bar here:

```sh
export POMODORO_CMD='cat "$XDG_RUNTIME_DIR/productivity-status/pomo.json"'
export NOW_PLAYING_CMD='cat ~/now-playing.txt'
```

The pomodoro click actions have no equivalent then: a terminal pomodoro
program cannot be started, paused or skipped from outside, so
`POMODORO_TOGGLE_CMD` and the others have nothing to call.

## Things that needed fixing on first start

All in the i3status-rust configuration, none in `sbs`:

* **Relative config path.** `i3status-rs try.toml` answers "Configuration
  file not found": a bare name is looked up in the XDG config directories,
  not the current directory. Give a full path in `status_command`.
* **Temperature colours.** The block is coloured by the hottest input. With
  the defaults (`idle` 45, `info` 60, `warning` 80) a laptop at 70 °C is
  permanently orange. Raising `info` and `warning` alone is not enough: `idle`
  must be raised too. Used: `idle = 80`, `info = 85`, `warning = 92`.
* **Which temperature.** One thermal zone was the Wi-Fi card. `chip =
  "acpitz-*"` keeps only the ACPI zone.
* **Battery.** A battery that reports no capacity makes the block print
  "Failed to get capacity" in red. `missing_format = ""` does not cover that
  case; the block was removed.
* **Clock cut by the tray.** On the bar that holds the tray, the last digit
  of the clock was half hidden by the first tray icon. Two trailing spaces in
  the `time` format fixed it.
* **Locale.** The `time` block prints English day names unless told
  otherwise: `$timestamp.datetime(f:'%a %Y-%m-%d %H:%M', l:fr_CA)`.
* **Number widths.** `$1m` and `$mem_avail` round to whole numbers by
  default (`L:  4`, `M:  6GB`). `.eng(w:4)` and `.eng(w:3)` give `3.95` and
  `5.7GB`.
* **Load is coloured too**, by load per core, with i3status-rust's own
  thresholds. Expected, but surprising next to uncoloured neighbours.
* **Muted sound.** `format = " V:{ $volume| muted} "`.
* **Reloading.** `pkill -USR2 i3status-rs` re-reads the configuration in
  place. With plain i3status the whole of i3 had to be restarted.
* **Old volume bindings.** i3's default config ends its volume bindings with
  `killall -SIGUSR1 i3status`. The `sound` block updates by itself, so that
  part can go.

## Notes for the other sources

* **now-playing-straw is not a print-once command here.** It is a service
  that keeps a file current. The default `NOW_PLAYING_CMD=now-playing-straw`
  would start another copy at every refresh and sample it for 3 seconds.
  `NOW_PLAYING_CMD='cat <file>'` is the right setting for it.
* **`playerctl` sees every MPRIS player**, a browser included, and acts on
  whichever it picks. The click commands used name the player:
  `playerctl -p strawberry play-pause`. `NOW_PLAYING_TOGGLE_CMD` and its
  siblings allow the same with `sbs`.
* **One config per screen.** A 1920 px panel and a 3840 px screen do not want
  the same line. Two config files, one per `bar {}` block, were simpler than
  relying on short texts alone: the small one drops now playing, the IP
  address, two of the three load figures and the seconds.

## Still untested

* The click commands, on any bar. On the machine above, a click on the rest
  block and the now playing clicks are configured but nobody has clicked.
* `bin/i3bar-status`, `bin/lemonbar-feed`, and the polybar, eww, yambar,
  Quickshell, lemonbar and xmobar configs.
* `--follow` with the `SIGUSR2` refresh, under a real bar.
* `sbs` under nub: it was run with plain `node` here.
