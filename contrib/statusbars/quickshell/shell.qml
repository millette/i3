// Quickshell: ~/.config/quickshell/shell.qml (+ Feed.qml, Segment.qml).
// Requires `sbs` on PATH. Run with `qs` (or `quickshell`).
//
// Each Feed runs `sbs <source> --format json --follow` and exposes the latest
// JSON object. Workspaces come from `sbs workspaces` too, so this config works
// even when your Quickshell package was built without the i3 plugin.
import QtQuick
import QtQuick.Layouts
import Quickshell

ShellRoot {
    id: root

    readonly property color bg: "#1e1e2e"
    readonly property color fg: "#cdd6f4"
    readonly property color surface: "#45475a"
    readonly property color critical: "#f38ba8"

    Feed { id: workspaces; source: "workspaces"; value: [] }
    Feed { id: nowPlaying; source: "now-playing" }
    Feed { id: pomodoro; source: "pomodoro" }
    Feed { id: workrave; source: "workrave" }

    function sbs(args) {
        Quickshell.execDetached(["sbs"].concat(args));
    }

    Variants {
        model: Quickshell.screens

        PanelWindow {
            required property var modelData
            screen: modelData
            anchors { top: true; left: true; right: true }
            implicitHeight: 26
            color: root.bg

            // ------------------------------------------------ workspaces (left)
            RowLayout {
                anchors { left: parent.left; verticalCenter: parent.verticalCenter; leftMargin: 6 }
                spacing: 2

                Repeater {
                    // One bar per screen: only this screen's workspaces.
                    model: (workspaces.value || []).filter(ws => ws.output === modelData.name)

                    Rectangle {
                        required property var modelData
                        implicitWidth: wsLabel.implicitWidth + 12
                        implicitHeight: 22
                        radius: 4
                        color: modelData.urgent ? root.critical : modelData.focused ? root.surface : "transparent"

                        Text {
                            id: wsLabel
                            anchors.centerIn: parent
                            text: modelData.name
                            color: modelData.urgent ? root.bg : root.fg
                            font.family: "monospace"
                        }
                        MouseArea {
                            anchors.fill: parent
                            cursorShape: Qt.PointingHandCursor
                            onClicked: root.sbs(["workspaces", "focus", String(modelData.num >= 0 ? modelData.num : modelData.name)])
                        }
                    }
                }
            }

            // ----------------------------------------------- now playing (center)
            RowLayout {
                anchors.centerIn: parent
                spacing: 8
                visible: nowPlaying.value.visible === true

                Segment { text: "⏮"; textColor: "#a6adc8"; onClick: (b) => root.sbs(["now-playing", "previous"]) }
                Segment {
                    status: nowPlaying.value
                    maxWidth: 480
                    onClick: (b) => root.sbs(["click", "now-playing", b])
                }
                Segment { text: "⏭"; textColor: "#a6adc8"; onClick: (b) => root.sbs(["now-playing", "next"]) }
            }

            // --------------------------------- pomodoro, workrave, clock (right)
            RowLayout {
                anchors { right: parent.right; verticalCenter: parent.verticalCenter; rightMargin: 8 }
                spacing: 12

                Segment {
                    status: pomodoro.value
                    onClick: (b) => root.sbs(["click", "pomodoro", b])
                }
                Segment {
                    status: workrave.value
                    onClick: (b) => root.sbs(["click", "workrave", b])
                }
                Text {
                    id: clock
                    color: root.fg
                    font.family: "monospace"
                    text: Qt.formatDateTime(new Date(), "ddd dd MMM HH:mm")
                    Timer {
                        interval: 10000; running: true; repeat: true
                        onTriggered: clock.text = Qt.formatDateTime(new Date(), "ddd dd MMM HH:mm")
                    }
                }
            }
        }
    }
}
