"use strict";
// Real production main/menu/wheel and Arc widgets; native SDL effects are modeled here.
// The existing NativeProbe/WindowsNativeProbe exercise the actual FFM/OS boundary separately.
var prefix = String(java.nio.file.Files.readString(java.nio.file.Paths.get(String(testArguments[1]), "tests/platform/startup.js")));
var cut = prefix.indexOf("// A cast exception is a regression now:");
if (cut < 0) throw new Error("Startup fixture boundary changed");
Packages.rhino.Context.getCurrentContext().evaluateString(this, prefix.substring(0, cut), "cursor-startup-fixture.js", 1);
if (startupError != null) throw startupError;
var nativeModule = modules["sdl-relative"], observations = [];

// Parse the real bundled Windows DLL, including a safe unknown-hash path and damaged code.
var archive = new java.util.zip.ZipFile(String(testArguments[0])), dll;
try { var stream = archive.getInputStream(archive.getEntry("sdl-arc64.dll")); try { dll = stream.readAllBytes(); } finally { stream.close(); } }
finally { archive.close(); }
var pe = nativeModule.inspect(dll);
H.assertTrue(pe.warp === 0x462d0 && pe.realWarp === 0x4eca0 && pe.realWarpHandler === 0x4ebd0, "verified known PE warp wrapper/public body/handler");
function changedByte(bytes, offset) { var clone = java.util.Arrays.copyOf(bytes, bytes.length); clone[offset] = (clone[offset] & 255) ^ 1; return clone; }
var unknown = changedByte(dll, dll.length - 1), searched = nativeModule.inspect(unknown);
H.assertTrue(searched.automatic && searched.warp === pe.warp, "unknown hash discovers complete matching warp, without native execution");
function rejectPe(bytes, message) { var rejected = false; try { nativeModule.inspect(bytes); } catch (error) { rejected = true; } H.assertTrue(rejected, message); }
rejectPe(changedByte(dll, pe.offset(pe.realWarpHandler, 1)), "changed full warp handler is rejected");
rejectPe(changedByte(dll, pe.offset(pe.realWarp + 4, 1)), "wrong public warp tail target is rejected");
rejectPe(changedByte(dll, pe.offset(pe.warp + 3, 1)), "wrong DynAPI warp slot is rejected");

// Compile and execute the actual adapter's release functions with modeled native handles.
var source = String(java.nio.file.Files.readString(java.nio.file.Paths.get(String(testArguments[1]), "scripts/sdl-relative.js")));
var warpStart = source.indexOf("        function cursorWindowReady("), warpEnd = source.indexOf("        result.warpAbsolute =", warpStart);
var releaseStart = source.indexOf("        function cursorVisibility("), releaseEnd = source.indexOf("        function fail(error)", releaseStart);
if (warpStart < 0 || warpEnd < 0 || releaseStart < 0 || releaseEnd < 0) throw new Error("Release function boundaries changed");
var releaseCode = source.substring(warpStart, warpEnd) + source.substring(releaseStart, releaseEnd);
var savedApp = Core.app, savedInput = Core.input;
Core.app = new JavaAdapter(Packages.arc.mock.MockApplication, {getMainThread: function() { return java.lang.Thread.currentThread(); }});
function releaseFixture(s) {
    Core.input = new Packages.arc.backend.sdl.SdlInput();
    var state = {owned: true, mode: 1, visible: 1, focused: true, valid: true, ready: true, legacy: true, calls: [], systemX: 1200, systemY: 1000};
    for (var key in s) state[key] = s[key];
    var owned = state.owned, closing = false, disposing = false, releaseAttempted = false, exitPending = false, exitX = 0, exitY = 0;
    var result = {active: owned, available: true, cursorSynced: false}, warpArgs = null, cursorFields = null, window = 123;
    var on = [1], off = [0], none = [], queryCursor = [-1];
    function array(items) { return items; }
    function focused() { if (state.focusError) throw new Error("window backend unavailable"); return state.focused; }
    function stopReleaseRetry() { state.stopped = true; }
    function retryRelease() { state.deferred = true; }
    var ofAddress = {invoke: function(receiver, args) { return args[0]; }};
    var mode = {invokeWithArguments: function() { if (state.modeErrorOnce) { state.modeErrorOnce = false; throw new Error("mode getter failure once"); } return state.mode; }};
    var set = {invokeWithArguments: function(args) {
        state.calls.push("set:" + args[0]);
        if (state.setFailOnce) { state.setFailOnce = false; throw new Error("mode failure once"); }
        state.mode = Number(args[0]); state.systemX = 1200; state.systemY = 1000; return 0; // Model the old SDL restoration that previously caused teleportation.
    }};
    var nativeFunctions = {
        valid: function() { return state.valid; }, endReady: function() { return state.ready; },
        checkEnd: function() { if (state.checkError) throw new Error("Cocoa did not actually release"); },
        cursor: {invokeWithArguments: function(args) { var n = Number(args[0]); state.calls.push("cursor:" + n); if (n >= 0) state.visible = n; return state.visible; }},
        warp: {invokeWithArguments: function(args) { state.calls.push("warp:" + state.mode); if (state.warpError) throw new Error("warp failure"); state.systemX = Number(args[1]); state.systemY = Number(args[2]); }}
    };
    eval(releaseCode); // Replaced before compiling this factory; never executed as a direct eval.
    return {state: state, adapter: result, owns: function() { return owned; }};
}
var factorySource = "(" + String(releaseFixture).replace("eval(releaseCode);", releaseCode) + ")";
releaseFixture = Packages.rhino.Context.getCurrentContext().evaluateString(this, factorySource, "actual-release-functions-with-modeled-handles.js", 1); // Preserve normal function-local scope; direct eval has unrelated Rhino scoping bugs.
try {
    var r = releaseFixture({});
    H.assertTrue(r.adapter.end(200, 300) && r.adapter.cursorSynced && !r.owns(), "legacy close releases ownership and synchronizes final point");
    H.assertTrue(r.state.systemX === 200 && r.state.systemY === 800 && Core.input.mouseX() === 200 && Core.input.mouseY() === 300, "post-warp replaces old SDL restoration, preserving Arc Y");
    H.assertTrue(r.state.calls.indexOf("warp:1") < r.state.calls.indexOf("set:0") && r.state.calls.indexOf("set:0") < r.state.calls.indexOf("warp:0") && r.state.calls[r.state.calls.length - 1] === "cursor:1", "pre-warp, disable, post-warp, visibility restoration order");
    r = releaseFixture({visible: 0}); r.adapter.end(200, 300); H.assertTrue(r.state.visible === 0, "previously hidden cursor stays hidden");
    r = releaseFixture({ready: false, valid: false});
    H.assertTrue(!r.adapter.end(210, 310) && r.state.calls.length === 0 && r.owns(), "deferred Cocoa close does not warp or alter visibility");
    r.state.ready = true; r.state.valid = true; H.assertTrue(r.adapter.end() && r.state.systemX === 210 && r.state.systemY === 790, "deferred close retains the requested point through temporary invalid Cocoa listener state");
    r = releaseFixture({ready: false}); r.adapter.end(210, 310); r.state.ready = true; r.state.focused = false;
    H.assertTrue(r.adapter.end() && !r.adapter.cursorSynced && r.state.calls.join(",") === "set:0", "focus loss releases without restoring an old position");
    r = releaseFixture({owned: false}); H.assertTrue(r.adapter.end(210, 310) && r.state.mode === 1 && r.state.calls.length === 0, "foreign mode is neither disabled nor repositioned");
    r = releaseFixture({mode: 0}); H.assertTrue(r.adapter.end(210, 310) && !r.owns() && r.state.calls.length === 0, "externally released mode is not recaptured or warped");
    r = releaseFixture({modeErrorOnce: true}); H.assertTrue(r.adapter.end(210, 310) && !r.owns() && !r.adapter.cursorSynced && r.state.mode === 0, "mode getter failure does not block releasing owned input");
    r = releaseFixture({focusError: true}); H.assertTrue(r.adapter.end(210, 310) && !r.adapter.cursorSynced && !r.owns(), "window/focus lookup exception does not prevent release");
    r = releaseFixture({warpError: true}); H.assertTrue(r.adapter.end(210, 310) && !r.adapter.cursorSynced && !r.owns() && r.state.visible === 1, "warp errors do not strand mode or visibility");
    r = releaseFixture({setFailOnce: true}); H.assertTrue(r.adapter.end(210, 310) && r.state.visible === 1 && !r.owns(), "transient release error retries with visibility restored");
    r = releaseFixture({checkError: true}); H.assertTrue(!r.adapter.end(210, 310) && r.owns() && r.state.visible === 1 && !r.adapter.available, "Cocoa release error retains ownership/resources and restores visibility");
    H.assertTrue(!r.adapter.end() && r.owns(), "SDL false flag after failed release is not mistaken for foreign cleanup");
    r = releaseFixture({}); H.assertTrue(r.adapter.end(NaN, Infinity) && !r.adapter.cursorSynced && r.state.calls.join(",") === "set:0", "invalid point only releases mode");
    r = releaseFixture({}); r.adapter.end(-50, 0);
    H.assertTrue(r.state.systemX === 0 && r.state.systemY === 1099 && Core.input.mouseY() === 1, "bottom boundary is clamped inside SDL window, without mirror jump");
} finally { Core.app = savedApp; Core.input = savedInput; }

// Actual production input/selection logic with a controlled relative provider.
var frameId = 1;
Core.graphics = new JavaAdapter(Packages.arc.mock.MockGraphics, {
    getWidth: function() { return 1500; }, getHeight: function() { return 1100; },
    getDeltaTime: function() { return 1 / 60; }, getFrameId: function() { return frameId; }
});
var controls = modules.menu.getControls(), mux = Core.input.getInputMultiplexer(), delta = new Vec2(), transfers = [], ends = [];
H.assertTrue(!controls.returnCursorAfterSelection, "return-to-center defaults off");
settingsApi.show(1); H.drain();
var dialog = Core.scene.getDialog(), toggle = dialog.find("buildwheel-control-returnCursorAfterSelection");
H.assertTrue(toggle != null && !toggle.isChecked(), "new setting is built in existing editor");
toggle.fireClick(); H.assertTrue(controls.returnCursorAfterSelection && Core.settings.getBool("buildwheel.controls.returnCursorAfterSelection"), "standard toggle updates cached and persisted Boolean");
toggle.fireClick(); dialog.hide(); for (var i = 0; i < 35; i++) Core.scene.act(1 / 60);
H.drain(); Core.scene.setKeyboardFocus(null); Core.scene.setScrollFocus(null);
controls.edgeShift = 0; controls.customArrow = true; controls.showNumber = false; controls.dimMissingMaterials = false; inGame = true;
var block = fixtureBlocks["fixture-copper"]; slotApi.setBlock(1, 2, block);
var model = {
    available: true, active: false, cursorSynced: false,
    begin: function() { this.active = true; this.cursorSynced = false; delta.setZero(); return true; },
    sample: function(out) { out.set(delta); delta.setZero(); return this.active; },
    end: function(x, y) { this.cursorSynced = false; if (!this.active) return true; ends.push([x, y]); this.active = false; if (isFinite(x) && isFinite(y)) { transfers.push([x, y]); H.pointer(Math.round(x), Math.round(y)); this.cursorSynced = true; } return true; },
    warpAbsolute: function(x, y) { H.assertTrue(!this.active, "absolute return does not activate relative mode"); transfers.push([x, y]); H.pointer(Math.round(x), Math.round(y)); return true; }
};
nativeModule.create = function() { return model; };
function openWheel() {
    H.pointer(750, 550); Vars.control.input.block = null; frameId++;
    mux.keyDown(KeyCode.controlLeft); mux.keyDown(KeyCode.num1); mux.keyUp(KeyCode.num1); mux.keyUp(KeyCode.controlLeft);
    H.assertTrue(wheel.visible, "selection wheel opened");
}
function move(x, y) { delta.set(x, -y); frameId++; mux.mouseMoved(1400, 30); }
function same(a, b) { return Math.abs(a - b) < 0.1; }
var sceneType = java.lang.Class.forName("arc.scene.Scene"), sceneX = sceneType.getDeclaredField("mouseScreenX"), sceneY = sceneType.getDeclaredField("mouseScreenY"); sceneX.setAccessible(true); sceneY.setAccessible(true);
function finishClick(button, x, y) { frameId++; mux.touchDown(Math.round(x), Math.round(y), 0, button); mux.touchUp(Math.round(x), Math.round(y), 0, button); H.drain(); H.assertTrue(!wheel.visible && !model.active, "closing releases wheel and modeled mode"); H.assertTrue(sceneX.getInt(Core.scene) === Core.input.mouseX() && sceneY.getInt(Core.scene) === Core.input.mouseY(), "captured mouse-up does not restore the old HUD hover after cursor sync"); }
for (var enabled = 0; enabled < 2; enabled++) {
    controls.relativeMouse = false; controls.clipOuter = false; controls.clipInner = false; controls.returnCursorAfterSelection = !!enabled;
    openWheel(); var cx = wheel.x + wheel.getWidth() / 2, cy = wheel.y + wheel.getHeight() / 2, radius = wheel.getWidth() / 2;
    H.pointer(Math.round(cx + radius * .7), Math.round(cy)); var before = transfers.length;
    finishClick(KeyCode.mouseLeft, Core.input.mouseX(), Core.input.mouseY());
    H.assertTrue(Vars.control.input.block === block && transfers.length === before + enabled, "absolute selection obeys return switch without changing selected block");
    H.assertTrue(same(Core.input.mouseX(), enabled ? cx : cx + radius * .7) && same(Core.input.mouseY(), cy), "absolute cursor ends at selected point or center");
}
var modes = [{outer: true, inner: false, explicit: false}, {outer: false, inner: true, explicit: false}, {outer: true, inner: true, explicit: false}, {outer: false, inner: false, explicit: true}];
for (var m = 0; m < modes.length; m++) for (var enabled = 0; enabled < 2; enabled++) for (var action = 0; action < 4; action++) {
    controls.clipOuter = modes[m].outer; controls.clipInner = modes[m].inner; controls.relativeMouse = modes[m].explicit; controls.returnCursorAfterSelection = !!enabled;
    openWheel(); var cx = wheel.x + wheel.getWidth() / 2, cy = wheel.y + wheel.getHeight() / 2, radius = wheel.getWidth() / 2;
    var limit = modes[m].inner ? Math.min(radius - .01, radius * wheelView.getDisplayVisual(1).appearance.innerRadiusRatio + Scl.scl(2)) : modes[m].outer ? radius - .01 : radius * .7;
    var empty = action === 1;
    if (empty) move(0, -limit * 3); else move(limit, 0);
    if (modes[m].outer || modes[m].inner) for (var push = 0; push < 8; push++) move(empty ? 0 : 500, empty ? -500 : 0); // Continue outward after touching the circle.
    var offset = modes[m].outer || modes[m].inner ? limit : limit * (empty ? 3 : 1);
    var expectedX = cx + (empty ? 0 : offset), expectedY = cy - (empty ? offset : 0);
    if (enabled && action === 0) { expectedX = cx; expectedY = cy; }
    H.pointer(1450, 20); var before = transfers.length;
    if (action === 3) { mux.keyDown(KeyCode.escape); mux.keyUp(KeyCode.escape); H.drain(); }
    else finishClick(action === 2 ? KeyCode.mouseRight : KeyCode.mouseLeft, 1450, 20);
    H.assertTrue(!wheel.visible && !model.active && transfers.length === before + 1, "relative close synchronizes exactly once: mode/return/action=" + m + "/" + enabled + "/" + action);
    var point = transfers[transfers.length - 1];
    H.assertTrue(same(point[0], expectedX) && same(point[1], expectedY), "final point follows visible bound or successful selection center");
    H.assertTrue(action === 0 ? Vars.control.input.block === block : Vars.control.input.block == null, "selection/cancel semantics: mode/return/action=" + m + "/" + enabled + "/" + action);
    observations.push({mode: m, center: !!enabled, action: action, expected: [expectedX, expectedY], supplied: point});
}
openWheel(); var before = transfers.length; H.pause(); H.resume();
H.assertTrue(!wheel.visible && !model.active && transfers.length === before, "focus loss releases without physical transfer");
openWheel(); var before = transfers.length, viewport = Core.scene.getViewport(); Core.scene.setViewport(null);
try { slotApi.closeWheel(true); } finally { Core.scene.setViewport(viewport); }
H.assertTrue(!wheel.visible && !model.active && transfers.length === before, "projection failure still releases mode without transfer");
var savedMobile = Vars.mobile; Vars.mobile = true; openWheel(); var before = transfers.length;
slotApi.closeWheel(); Vars.mobile = savedMobile;
H.assertTrue(!wheel.visible && !model.active && transfers.length === before + 1, "desktop mobile-UI flag does not discard an owned SDL exit position");
controls.relativeMouse = false; controls.clipOuter = false; controls.clipInner = false; controls.returnCursorAfterSelection = false;
new Fi(String(testArguments[2])).child("cursor-release-observations.json").writeString(JSON.stringify(observations, null, 2), false);
H.result("PASS_CURSOR_RELEASE_MODEL_AND_PE", "Actual production main/Arc selection, PE discovery and verbatim adapter release with modeled native effects. Separate native probes test real OS cursor positions; this model does not certify physical cursor behavior.");
