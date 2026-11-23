// One clickable piece of text. Pass either `status` (a JSON value from Feed)
// or plain `text` + `textColor`. Emits click("left" | "middle" | "right" | "up" | "down").
import QtQuick

Rectangle {
    id: seg
    property var status: null
    property string text: status ? (status.label || "") : ""
    property color textColor: status ? (status.state === "critical" ? "#1e1e2e" : status.color) : "#cdd6f4"
    property int maxWidth: 0
    signal click(string button)

    visible: text !== "" && (!status || status.visible !== false)
    implicitWidth: label.implicitWidth + 12
    implicitHeight: 22
    radius: 6
    color: status && status.state === "critical" ? "#f38ba8" : mouse.containsMouse ? "#3345475a" : "transparent"

    Text {
        id: label
        anchors.centerIn: parent
        text: seg.text
        color: seg.textColor
        font.family: "monospace"
        elide: Text.ElideRight
        width: seg.maxWidth > 0 ? Math.min(implicitWidth, seg.maxWidth) : implicitWidth
    }

    MouseArea {
        id: mouse
        anchors.fill: parent
        hoverEnabled: true
        cursorShape: Qt.PointingHandCursor
        acceptedButtons: Qt.LeftButton | Qt.MiddleButton | Qt.RightButton
        onClicked: (ev) => seg.click(ev.button === Qt.RightButton ? "right" : ev.button === Qt.MiddleButton ? "middle" : "left")
        onWheel: (ev) => seg.click(ev.angleDelta.y > 0 ? "up" : "down")
    }
}
