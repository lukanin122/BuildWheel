"use strict";
// Android desktop-control MODEL on the host JVM. Real Arc widgets, Settings,
// production JS and host files run; AndroidInput/ART/Android Os are NOT executed.
var fixturePath = String(testArguments[1]).replace(/\\/g, "/") + "/tests/platform/startup.js";
var fixtureSource = String(java.nio.file.Files.readString(java.nio.file.Paths.get(fixturePath)));
var fixtureBoundary = fixtureSource.indexOf("var initialProcessors =");
if (fixtureBoundary < 0) throw new Error("Startup fixture boundary changed");
Packages.rhino.Context.getCurrentContext().evaluateString(this, fixtureSource.substring(0, fixtureBoundary), "reused-android-startup-fixture.js", 1);
Fonts.def = labelStyle.font; // Palette text caches use the same mock font as the fixture's real labels.
Styles.emptyTogglei = imageStyle; Styles.togglet = textStyle; Styles.noBarPane = paneStyle; // Additional stock styles normally supplied by UI.load for the browser.
var texFields = java.lang.Class.forName("mindustry.gen.Tex").getFields();
for (var texField = 0; texField < texFields.length; texField++) {
    if (String(texFields[texField].getType().getName()).indexOf("Drawable") >= 0 && texFields[texField].get(null) == null) texFields[texField].set(null, drawable);
}
var A = Packages.AndroidModelSupport, originalJava = java, originalPackages = Packages, originalOS = OS;
A.configure(String(testArguments[2]));
var profileDirectory = Core.settings.getDataDirectory();

// Guard lexical production API lookup, even if the host already cached NIO.
// H.loadModule's own Java implementation may still read source files with NIO.
var guardedNio = {charset: originalJava.nio.charset};
var forbiddenLookups = 0;
Object.defineProperty(guardedNio, "file", {get: function() { forbiddenLookups++; throw new Error("MODELED Android API 21 has no java.nio.file"); }});
java = {lang: originalJava.lang, io: originalJava.io, util: originalJava.util, nio: guardedNio, security: originalJava.security};
Packages = {arc: originalPackages.arc, mindustry: originalPackages.mindustry, rhino: originalPackages.rhino,
    java: java, android: {system: {Os: A.Os, OsConstants: A.OsConstants, ErrnoException: A.ErrnoException}}};
OS = {isAndroid: true, isWindows: false, isLinux: false, isMac: false};
Core.settings.setDataDirectory(A.directory(""));

// The real Control.updateInput() replacement is modeled here. Vars.mobile stays
// true exactly as in Android, while instanceof determines computer control.
DesktopInput = function() {
    this.commandMode = false; this.selectPlans = new Seq(); this.linePlans = new Seq();
    this.block = null; this.mode = PlaceMode.none;
};
MobileInput = function() { this.commandMode = false; this.selectPlans = new Seq(); this.linePlans = new Seq(); this.block = null; };
Vars.mobile = true; Vars.control.input = new DesktopInput();
Core.settings.put("keyboard", true);
var nativeFlags = ["relativeMouse", "clipOuter", "clipInner"];
for (var flag = 0; flag < nativeFlags.length; flag++) {
    var flagKey = "buildwheel.controls." + nativeFlags[flag];
    if (!restarting) Core.settings.put(flagKey, new java.lang.Boolean("true"));
    else H.assertTrue(Core.settings.getBool(flagKey, false), "new JVM retained saved cursor flag " + nativeFlags[flag]);
    record(flagKey, new java.lang.Boolean("true"));
}
var initialProcessors = Core.input.getInputMultiplexer().getProcessors().size;
require("main"); Events.fire(new ClientLoadEvent());
H.assertTrue(settingsApi != null && slotApi != null && wheel != null && !wheel.visible, "full graph initializes with Android desktop input model");
H.assertTrue(Core.input.getInputMultiplexer().getProcessors().size === initialProcessors + 1, "one main processor registered");
H.assertTrue(nativePrepares === 0 && warpCreates === 0, "initialization did not prepare SDL/FFM or desktop warp");
H.assertTrue(Vars.mobile && modules.menu.computerInputActive(), "DesktopInput accepted without changing Vars.mobile");
var controls = modules.menu.getControls(), mux = Core.input.getInputMultiplexer();
var mainProcessor = mux.getProcessors().get(0);
H.assertTrue(controls.relativeMouse && controls.clipOuter && controls.clipInner, "saved desktop-native options loaded without being erased");
if (restarting) H.assertTrue(controls.key(controls.bindings.wheels[1]) == KeyCode.f8, "fresh JVM restored reassigned wheel key");
else H.assertTrue(controls.key(controls.bindings.wheels[1]) == KeyCode.num1, "factory wheel key remains Ctrl+1");

function settle() { for (var frame = 0; frame < 30; frame++) Core.scene.act(1 / 60); H.drain(); Core.scene.setKeyboardFocus(null); Core.scene.setScrollFocus(null); }
function closeUi() { settingsApi.inputDisabled(); settle(); }
function wheelKey() { return controls.key(controls.bindings.wheels[1]); }
function openWheel(x, y) {
    H.pointer(x == null ? 750 : x, y == null ? 550 : y);
    mux.keyDown(KeyCode.controlLeft); mux.keyDown(wheelKey());
    mux.keyUp(wheelKey()); mux.keyUp(KeyCode.controlLeft);
    H.assertTrue(wheel.visible, "Android DesktopInput opens assigned wheel");
}
function clickNorth() {
    var point = new Vec2(wheel.x + wheel.getWidth() / 2, wheel.y + wheel.getHeight() * 0.875);
    Core.scene.getViewport().project(point);
    H.assertTrue(mux.touchDown(Math.round(point.x), Math.round(point.y), 0, KeyCode.mouseLeft), "wheel LMB consumed");
    H.assertTrue(mux.touchUp(Math.round(point.x), Math.round(point.y), 0, KeyCode.mouseLeft), "matching wheel release consumed");
}
inGame = true; slotApi.setBlock(1, 0, fixtureBlocks["fixture-copper"]);
openWheel(); clickNorth(); H.drain();
H.assertTrue(!wheel.visible && Vars.control.input.block === fixtureBlocks["fixture-copper"], "ordinary absolute click selected the correct block despite saved native options");
openWheel(0, 0);
mux.touchDown(0, 0, 0, KeyCode.mouseRight); mux.touchUp(0, 0, 0, KeyCode.mouseRight); H.drain();
H.assertTrue(!wheel.visible && nativePrepares === 0 && warpCreates === 0, "edge opening and cancellation never initialize unsupported cursor machinery");

// A queued click belongs to its original handler, including a change to another
// DesktopInput. This models the render-thread replacement between event/post.
openWheel(); var oldHandler = Vars.control.input; oldHandler.block = fixtureBlocks["fixture-lead"];
clickNorth(); Vars.control.input = new DesktopInput(); H.drain();
H.assertTrue(oldHandler.block === fixtureBlocks["fixture-lead"] && Vars.control.input.block == null, "handler replacement cancels queued selection instead of redirecting it");
openWheel(); clickNorth(); Vars.control.input = new MobileInput(); Core.settings.put("keyboard", false); H.drain();
H.assertTrue(!wheel.visible && Vars.control.input.block == null, "switch to MobileInput cancels queued selection");

function mobileUnconsumed() {
    H.assertTrue(!mainProcessor.keyDown(KeyCode.num1) && !mainProcessor.keyUp(KeyCode.num1), "MobileInput digit press and release not intercepted");
    H.assertTrue(!mainProcessor.touchDown(700, 500, 0, KeyCode.mouseLeft), "MobileInput touch down not intercepted");
    H.assertTrue(!mainProcessor.touchDragged(710, 510, 0), "MobileInput drag not intercepted");
    H.assertTrue(!mainProcessor.touchUp(710, 510, 0, KeyCode.mouseLeft), "MobileInput touch up not intercepted");
    H.assertTrue(!mainProcessor.scrolled(0, 1), "MobileInput scroll not intercepted");
    H.assertTrue(wheel.hit(5, 5, true) == null, "hidden/mobile wheel cannot absorb scene touches");
}
mobileUnconsumed(); settingsApi.show(1); settingsApi.showPalette(); H.drain();
H.assertTrue(!Core.scene.hasDialog() && !modules.menu.computerInputActive(), "MobileInput cannot open editor or palette");
Vars.control.input = new DesktopInput(); Core.settings.put("keyboard", true);
openWheel(); Vars.control.input = new MobileInput(); Core.settings.put("keyboard", false); Core.scene.act(1 / 60);
H.assertTrue(!wheel.visible, "open wheel notices control-mode switch without another input event");
mobileUnconsumed();
Vars.control.input = new DesktopInput(); Core.settings.put("keyboard", true);

// Real Arc dialogs and named widgets, at desktop-window scene sizes. This
// validates creation/listeners only; mocked GL cannot prove rendering or DPI.
var sizes = [[1280, 720], [1600, 900], [1920, 1080]];
for (var size = 0; size < sizes.length; size++) {
    Core.graphics.width = sizes[size][0]; Core.graphics.height = sizes[size][1]; Core.scene.resize(sizes[size][0], sizes[size][1]);
    settingsApi.show(1); H.drain(); var editor = Core.scene.getDialog(); editor.validate();
    H.assertTrue(editor != null && editor.find("buildwheel-preview") != null, "editor/mannequin builds at logical scene " + sizes[size]);
    H.assertTrue(editor.find("buildwheel-control-dimMissingMaterials") != null && editor.find("buildwheel-key-wheel-1") != null, "editor controls present at logical scene " + sizes[size]);
    closeUi();
}
settingsApi.show(1); H.drain(); var editor = Core.scene.getDialog();
editor.find("buildwheel-save-browser").fireClick(); H.drain();
var openedBrowser = Core.scene.getDialog(), browserList = openedBrowser == null ? null : openedBrowser.find("buildwheel-saves-list");
H.assertTrue(openedBrowser != null && String(openedBrowser.name) === "buildwheel-saves" && browserList != null, "existing wheel browser opens with Android storage branch; top=" + (openedBrowser == null ? "null" : String(openedBrowser.name)) + ", list=" + browserList);
closeUi(); settingsApi.show(1); H.drain(); editor = Core.scene.getDialog();
var keyButton = editor.find("buildwheel-key-wheel-1");
keyButton.fire(new Packages.arc.scene.event.ChangeListener.ChangeEvent()); H.drain();
var keyModal = Core.scene.getDialog();
H.assertTrue(String(keyModal.name) === "buildwheel-rebind" && settingsApi.isRebinding(), "actual reassignment dialog opens under Android desktop control");
var keyEvent = new InputEvent(); keyEvent.type = InputEvent.InputEventType.keyDown; keyEvent.keyCode = KeyCode.f8; keyModal.fire(keyEvent);
settle(); H.assertTrue(controls.key(controls.bindings.wheels[1]) == KeyCode.f8, "actual dialog listener accepts and saves keyboard reassignment");
keyButton = editor.find("buildwheel-key-palette-key"); keyButton.fire(new Packages.arc.scene.event.ChangeListener.ChangeEvent()); H.drain();
keyModal = Core.scene.getDialog();
var mouseEvent = new InputEvent(); mouseEvent.type = InputEvent.InputEventType.touchDown; mouseEvent.keyCode = KeyCode.mouseMiddle; mouseEvent.pointer = 0;
keyModal.fire(mouseEvent); settle();
H.assertTrue(controls.key(controls.bindings.paletteKey) == KeyCode.mouseMiddle, "rebind listener accepts mouse button with Vars.mobile=true and DesktopInput");
closeUi();
settingsApi.showPalette(); H.drain();
H.assertTrue(String(Core.scene.getDialog().name) === "buildwheel-palette" && Core.scene.getDialog().find("buildwheel-hsv-input") != null, "existing palette builds without layout adaptation");
closeUi();
settingsApi.show(1); H.drain(); Vars.control.input = new MobileInput(); Core.settings.put("keyboard", false);
mainProcessor.keyDown(KeyCode.num2); settle();
H.assertTrue(!Core.scene.hasDialog(), "input-handler change closes the editor instead of leaving a touch interceptor");
mobileUnconsumed(); Vars.control.input = new DesktopInput(); Core.settings.put("keyboard", true);
openWheel(); H.pause(); H.assertTrue(!wheel.visible, "Android-model pause closes ordinary wheel"); H.resume();
H.assertTrue(nativePrepares === 0 && warpCreates === 0, "all Android-model input/UI/lifecycle paths avoided native adapter preparation");

// Storage regressions use separate subdirectories of the SAME isolated profile.
// Public android.system.Os is modeled using host Java atomic moves, not JNI.
var libraryModule = modules["wheel-library"];
function caseDirectory(name) { return (restarting && name !== "persistent" ? "android-storage-restart-" : "android-storage-") + name; }
function useLibrary(name) { Core.settings.setDataDirectory(A.directory(caseDirectory(name))); return libraryModule.create(); }
function leaf(name, file) { return caseDirectory(name) + "/buildwheel/" + file; }
function makeJson(name, version) { return JSON.stringify({version: version == null ? 1 : version, nextId: 2, entries: [{id: "wheel-1", type: "blocks", name: name, description: "", data: {slots: [{block: "conveyor", scale: 1}]}}]}); }
function mustFail(action, description) { var failed = false; try { action(); } catch (expected) { failed = true; } H.assertTrue(failed, description); }
function onlyEntry(store, expected) { var items = store.list("blocks", ""); H.assertTrue(items.length === 1 && items[0].name === expected, "confirmed library entry retained: " + expected); return items[0]; }

var unicode = "Колёса \uD83D\uDE80", longDescription = new Array(9001).join(unicode + "\n");
var roundtrip = useLibrary("roundtrip"), saved = roundtrip.add("blocks", unicode, {slots: [{block: "conveyor", scale: 1.75}]});
H.assertTrue(roundtrip.rename(saved.id, unicode, longDescription), "large UTF-8 description committed");
var androidJson = String(A.read(leaf("roundtrip", "library.json")));
H.assertTrue(androidJson.length > 65535 && JSON.parse(androidJson).entries[0].description === longDescription, "strict reader preserves UTF-8 across chunks beyond writeUTF limit");
var freshAndroid = libraryModule.create(); H.assertTrue(onlyEntry(freshAndroid, unicode).description === longDescription, "independent Android library instance reads committed bytes");
// The file format is the same: execute the existing desktop NIO path as well.
java = originalJava; OS.isAndroid = false; Core.settings.setDataDirectory(new Fi(A.path(caseDirectory("roundtrip"))));
var desktopStore = libraryModule.create(); H.assertTrue(onlyEntry(desktopStore, unicode).description === longDescription, "desktop NIO reads Android-produced version-1 JSON");
desktopStore.rename(saved.id, unicode + " desktop", longDescription);
OS.isAndroid = true; java = {lang: originalJava.lang, io: originalJava.io, util: originalJava.util, nio: guardedNio, security: originalJava.security};
Core.settings.setDataDirectory(A.directory(caseDirectory("roundtrip")));
H.assertTrue(onlyEntry(libraryModule.create(), unicode + " desktop").description === longDescription, "Android reads desktop-produced version-1 JSON");

var legacyKey = "buildwheel.library", legacyText = makeJson("legacy " + unicode);
var legacy = useLibrary("legacy"); Core.settings.put(legacyKey, legacyText);
onlyEntry(legacy, "legacy " + unicode);
H.assertTrue(!Core.settings.has(legacyKey) && String(A.read(leaf("legacy", "library.json"))) === legacyText, "legacy migration removes only the successfully committed source key");
var legacyFailure = useLibrary("legacy-failure"); Core.settings.put(legacyKey, legacyText);
A.failRename(leaf("legacy-failure", "library.json")); mustFail(function() { legacyFailure.list("blocks", ""); }, "failed migration reports failure");
H.assertTrue(Core.settings.has(legacyKey) && String(Core.settings.getString(legacyKey)) === legacyText && !A.exists(leaf("legacy-failure", "library.json")), "failed migration preserves legacy source and does not invent primary");
A.clearFaults(); onlyEntry(legacyFailure, "legacy " + unicode); H.assertTrue(!Core.settings.has(legacyKey), "migration retry can commit original source");

var recoveryCases = ["bad-json", "bad-utf8", "missing-main"];
for (var r = 0; r < recoveryCases.length; r++) {
    var recoveryName = recoveryCases[r], recoveryText = makeJson("backup " + recoveryName);
    A.write(leaf(recoveryName, "library.json.bak"), recoveryText);
    if (recoveryName === "bad-json") A.write(leaf(recoveryName, "library.json"), "{broken");
    if (recoveryName === "bad-utf8") A.malformedUtf8(leaf(recoveryName, "library.json"));
    var recovery = useLibrary(recoveryName); onlyEntry(recovery, "backup " + recoveryName);
    H.assertTrue(String(A.read(leaf(recoveryName, "library.json.bak"))) === recoveryText, "recovery does not modify intact backup at read time");
}
var unknownText = makeJson("future", 2); A.write(leaf("unknown", "library.json"), unknownText); A.write(leaf("unknown", "library.json.bak"), makeJson("stale"));
var unknown = useLibrary("unknown"); mustFail(function() { unknown.list("blocks", ""); }, "unknown format cannot be overwritten by old backup");
H.assertTrue(String(A.read(leaf("unknown", "library.json"))) === unknownText, "unknown format bytes preserved");
for (var errorNumber = 0; errorNumber < 2; errorNumber++) {
    var accessName = "access-" + errorNumber, deniedText = makeJson("current");
    A.write(leaf(accessName, "library.json"), deniedText); A.write(leaf(accessName, "library.json.bak"), makeJson("stale"));
    var denied = useLibrary(accessName), beforeStats = A.statCalls;
    Core.settings.put(legacyKey, legacyText); A.failStat(leaf(accessName, "library.json"), errorNumber === 0 ? 13 : 20);
    mustFail(function() { denied.list("blocks", ""); }, "stat access/parent error aborts without fallback");
    H.assertTrue(A.statCalls === beforeStats + 1 && Core.settings.has(legacyKey), "access error did not inspect backup or migrate legacy");
    H.assertTrue(String(A.read(leaf(accessName, "library.json"))) === deniedText, "access error preserved primary bytes");
    A.clearFaults(); Core.settings.remove(legacyKey);
}

var rollback = useLibrary("rollback"), original = rollback.add("blocks", "confirmed", {slots: []});
var primaryBefore = A.bytes(leaf("rollback", "library.json"));
A.failRename(leaf("rollback", "library.json.bak")); mustFail(function() { rollback.rename(original.id, "uncommitted backup"); }, "backup rename failure rejects update");
H.assertTrue(A.unchanged(leaf("rollback", "library.json"), primaryBefore), "backup failure leaves primary unchanged"); onlyEntry(rollback, "confirmed"); A.clearFaults();
A.failRename(leaf("rollback", "library.json")); mustFail(function() { rollback.add("blocks", "uncommitted new", {slots: []}); }, "primary rename failure rejects append");
H.assertTrue(A.unchanged(leaf("rollback", "library.json"), primaryBefore), "primary failure leaves previous bytes intact"); onlyEntry(rollback, "confirmed");
H.assertTrue(A.unchanged(leaf("rollback", "library.json.bak"), primaryBefore), "backup is the previous committed primary"); A.clearFaults();
A.delete(leaf("rollback", "library.json.tmp")); A.mkdir(leaf("rollback", "library.json.tmp"));
mustFail(function() { rollback.remove(original.id); }, "temporary-file write failure rejects removal");
H.assertTrue(A.unchanged(leaf("rollback", "library.json"), primaryBefore), "write failure preserves primary bytes"); onlyEntry(rollback, "confirmed");
A.delete(leaf("rollback", "library.json.tmp"));
var appended = rollback.add("blocks", "next confirmed", {slots: []});
H.assertTrue(appended.id === "wheel-2" && rollback.list("blocks", "").length === 2, "failed append rolled back counter and successful retry retains both entries");

// Kept separate from destructive cases: a NEW JVM must read the same file,
// saved key binding and settings without reseeding or rewriting these bytes.
var persistent = useLibrary("persistent");
if (!restarting) {
    persistent.add("blocks", "restart " + unicode, {slots: [{block: "conveyor", scale: 1.25}]});
    A.copy(leaf("persistent", "library.json"), "android-model-library-baseline.bin");
} else {
    H.assertTrue(A.exists("android-model-library-baseline.bin"), "fresh JVM has the prior library-byte baseline");
}
onlyEntry(persistent, "restart " + unicode);
H.assertTrue(A.unchanged(leaf("persistent", "library.json"), A.bytes("android-model-library-baseline.bin")), "persistent library bytes unchanged across new instance/JVM");
Core.settings.setDataDirectory(profileDirectory); checkRawRecords("after Android model");
Events.fire(new DisposeEvent()); Events.fire(new DisposeEvent()); H.drain();
Core.settings.manualSave(); Core.settings.clear(); Core.settings.load(); checkRawRecords("after Android model Settings reload");
H.assertTrue(nativePrepares === 0 && warpCreates === 0, "Android mode never prepared desktop native resources including disposal");
H.assertTrue(forbiddenLookups === 0 && A.forbiddenToPathCalls === 0, "Android branch did not evaluate java.nio.file or File.toPath");
H.assertTrue(A.statCalls > 0 && A.renameCalls > 0, "Android storage branch actually used modeled public Os calls");
H.result("PASS_ANDROID_MODEL", "Host JVM/Arc/Rhino and real isolated files; Android OS/handlers/Os MODELED. Input-mode switches, queued selection, editor/palette/rebinding, UTF-8/migration/backup/error rollback and restart; no ART, AndroidInput, Google Play Games, actual Android syscalls or physical mouse.");
