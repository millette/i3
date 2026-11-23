// Runs `sbs <source> --format json --follow` and keeps the last JSON value.
// Restarts the process if it exits.
import QtQuick
import Quickshell
import Quickshell.Io

Scope {
    id: feed
    required property string source
    property var value: ({ visible: false, label: "", state: "idle", color: "#a6adc8", tooltip: "" })

    Process {
        id: proc
        command: ["sbs", feed.source, "--format", "json", "--follow"]
        running: true
        stdout: SplitParser {
            onRead: (line) => {
                try { feed.value = JSON.parse(line); } catch (e) { /* ignore partial lines */ }
            }
        }
        onExited: restart.start()
    }

    Timer {
        id: restart
        interval: 2000
        onTriggered: proc.running = true
    }
}
