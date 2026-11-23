#!/bin/sh
# ~/.config/polybar/launch.sh — one bar per connected monitor.
polybar-msg cmd quit >/dev/null 2>&1
# Stop old followers so a restart does not leave orphans behind.
pkill -f 'sbs\.ts .*--format polybar --follow' 2>/dev/null
for m in $(polybar --list-monitors | cut -d: -f1); do
    MONITOR=$m polybar --reload main >/dev/null 2>&1 &
done
