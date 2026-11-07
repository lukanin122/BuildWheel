import Foundation
import AppKit
import CoreGraphics

let args = CommandLine.arguments
let pid = args.count > 1 ? Int32(args[1]) ?? 0 : 0
let mode = args.count > 2 ? args[2] : "prepare"
var info: [String: Any] = ["eventSource": "CoreGraphics synthetic HID events", "postEventAccess": CGPreflightPostEventAccess(), "pid": pid, "mode": mode]
if pid > 0, let app = NSRunningApplication(processIdentifier: pid) {
    info["activated"] = app.activate(options: [.activateIgnoringOtherApps])
}
Thread.sleep(forTimeInterval: 0.12)
let windows = CGWindowListCopyWindowInfo([.optionAll], kCGNullWindowID) as? [[String: Any]] ?? []
var rect: CGRect?
for window in windows {
    if (window[kCGWindowOwnerPID as String] as? Int32) == pid,
       let bounds = window[kCGWindowBounds as String] as? NSDictionary,
       let r = CGRect(dictionaryRepresentation: bounds), r.width > 100, r.height > 100 {
        rect = r
        break
    }
}
if rect == nil { rect = CGDisplayBounds(CGMainDisplayID()); info["usedDisplayFallback"] = true }
let area = rect!
let point = CGPoint(x: area.midX, y: area.midY)
info["centerX"] = point.x
info["centerY"] = point.y
info["frontmostPID"] = NSWorkspace.shared.frontmostApplication?.processIdentifier ?? 0
if CGPreflightPostEventAccess() {
    func moved(_ p: CGPoint, _ dx: Int64, _ dy: Int64) {
        if let event = CGEvent(mouseEventSource: nil, mouseType: .mouseMoved, mouseCursorPosition: p, mouseButton: .left) {
            event.setIntegerValueField(.mouseEventDeltaX, value: dx)
            event.setIntegerValueField(.mouseEventDeltaY, value: dy)
            event.post(tap: .cghidEventTap)
        }
    }
    if mode == "prepare" {
        moved(point, 0, 0)
        Thread.sleep(forTimeInterval: 0.12)
        CGEvent(mouseEventSource: nil, mouseType: .leftMouseDown, mouseCursorPosition: point, mouseButton: .left)?.post(tap: .cghidEventTap)
        CGEvent(mouseEventSource: nil, mouseType: .leftMouseUp, mouseCursorPosition: point, mouseButton: .left)?.post(tap: .cghidEventTap)
        info["posted"] = 3
    } else {
        for n in 0..<8 {
            let dx: Int64 = n % 2 == 0 ? 24 : -12
            let dy: Int64 = n % 3 == 0 ? 8 : -4
            moved(CGPoint(x: point.x + CGFloat(dx), y: point.y + CGFloat(dy)), dx, dy)
            Thread.sleep(forTimeInterval: 0.06)
        }
        info["posted"] = 8
    }
} else {
    info["posted"] = 0
    info["limitation"] = "CGPreflightPostEventAccess denied; no TCC settings were modified"
}
let data = try JSONSerialization.data(withJSONObject: info, options: [.sortedKeys])
print(String(data: data, encoding: .utf8)!)
