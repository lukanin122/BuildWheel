"use strict";
// The real Java game/UI classes and all production JS modules run on the host OS.
// Only the application/window/GL/audio/content fixtures are mocked. This cannot
// prove that a real window, system pointer, or physical input works on that OS.
var repository = String(testArguments[1]).replace(/\\/g, "/");
var kind = String(testArguments.length > 3 ? testArguments[3] : "factory");
var locale = String(testArguments.length > 4 ? testArguments[4] : "en");
var restarting = /-restart$/.test(kind), profile = kind.replace(/-restart$/, "");
var preservationProfile = /^(user-settings|malformed-block|malformed-scale|malformed-mixed)$/.test(profile);
H.assertTrue(profile === "factory" || profile === "relative-saved" || preservationProfile, "known startup scenario");
H.assertTrue(!restarting || profile !== "factory", "restart scenarios must use a persisted profile");
H.scene(); H.ui(); Binding.init();
Core.bundle = Packages.arc.util.I18NBundle.createBundle(new Fi(repository + "/bundles/bundle"), new java.util.Locale(locale));
Core.settings.load();

// Give real Arc widgets the minimum styles/assets normally created by UI.load().
var labelStyle = Core.scene.getStyle(Label.LabelStyle), drawable = Tex.whiteui;
var textStyle = new TextButton.TextButtonStyle();
textStyle.font = labelStyle.font; textStyle.fontColor = Color.white; textStyle.up = drawable; textStyle.down = drawable;
Core.scene.addStyle(Button.ButtonStyle, new Button.ButtonStyle());
Styles.defaultt = textStyle; Core.scene.addStyle(TextButton.TextButtonStyle, textStyle);
var checkStyle = new CheckBox.CheckBoxStyle();
checkStyle.font = labelStyle.font; checkStyle.fontColor = Color.white;
checkStyle.checkboxOn = drawable; checkStyle.checkboxOff = drawable; checkStyle.checkboxOver = drawable;
Core.scene.addStyle(CheckBox.CheckBoxStyle, checkStyle);
var sliderStyle = new Slider.SliderStyle();
sliderStyle.background = drawable; sliderStyle.knob = drawable;
Core.scene.addStyle(Slider.SliderStyle, sliderStyle);
var fieldStyle = new TextField.TextFieldStyle();
fieldStyle.font = labelStyle.font; fieldStyle.fontColor = Color.white; fieldStyle.cursor = drawable;
fieldStyle.selection = drawable; fieldStyle.background = drawable; fieldStyle.focusedBackground = drawable;
Core.scene.addStyle(TextField.TextFieldStyle, fieldStyle);
var imageStyle = new ImageButton.ImageButtonStyle(); imageStyle.up = drawable; imageStyle.down = drawable;
Core.scene.addStyle(ImageButton.ImageButtonStyle, imageStyle);
Styles.cleari = imageStyle; Styles.defaulti = imageStyle; Styles.squareTogglei = imageStyle; Styles.selecti = imageStyle;
var paneStyle = new ScrollPane.ScrollPaneStyle();
Core.scene.addStyle(ScrollPane.ScrollPaneStyle, paneStyle); Styles.defaultPane = paneStyle;
var iconFields = java.lang.Class.forName("mindustry.gen.Icon").getFields();
for (var f = 0; f < iconFields.length; f++) {
    if (String(iconFields[f].getType().getName()).indexOf("Drawable") >= 0) iconFields[f].set(null, drawable);
}
var wheelIcon = Core.atlas.addRegion("buildwheel-icon_wheel", Core.atlas.white()); wheelIcon.width = 128; wheelIcon.height = 128;
var paletteIcon = Core.atlas.addRegion("buildwheel-icon_color", Core.atlas.white()); paletteIcon.width = 32; paletteIcon.height = 32;
var dialogStyle = new Dialog.DialogStyle();
dialogStyle.titleFont = labelStyle.font; dialogStyle.titleFontColor = Color.white; dialogStyle.background = drawable;
Core.scene.addStyle(Dialog.DialogStyle, dialogStyle);

// Minimal native-game fixture; BaseDialog, Scene and every widget remain real.
var MenuButton = Packages.mindustry.ui.fragments.MenuFragment.MenuButton;
var submenu = java.lang.reflect.Array.newInstance(java.lang.Class.forName("mindustry.ui.fragments.MenuFragment$MenuButton"), 2);
submenu[0] = new MenuButton("@schematics", drawable, function() {});
submenu[1] = new MenuButton("@database", drawable, function() {});
var menuRoots = new Seq();
menuRoots.add(new MenuButton("@database.button", drawable, run(function() {}), submenu));
var pausedContent = new Table(), pausedStack = new Stack(), pausedCallbacks = [];
pausedStack.add(pausedContent); pausedStack.setSize(400, 300);
var inGame = false;
// Small content objects are fixtures; slot loading and all Settings I/O are real.
var fixtureBlocks = {};
function fixtureBlock(name) {
    var block = {name: name, localizedName: name, uiIcon: Core.atlas.white(), fullIcon: Core.atlas.white(),
        placeablePlayer: true, category: Category.distribution, requirements: []};
    block.isVisible = block.isPlaceable = block.unlockedNowHost = block.environmentBuildable = block.supportsEnv = function() { return true; };
    fixtureBlocks[name] = block; return block;
}
fixtureBlock("fixture-copper"); fixtureBlock("fixture-lead"); fixtureBlock("fixture-graphite"); fixtureBlock("fixture-hidden");
var loadRequests = [], soundPlays = 0;
Core.audio = new Packages.arc.audio.Audio(false); Core.audio.sfxVolume = 1;
var Vars = {
    headless: false, mobile: false,
    state: {isGame: function() { return inGame; }, isMenu: function() { return !inGame; }, rules: new Rules()},
    player: {team: function() { return Team.sharded; }, core: function() { return null; }},
    content: {blocks: function() { return new Seq(); }, planets: function() { return new Seq(); }, block: function(name) { return fixtureBlocks[String(name)] || null; }},
    control: {input: {commandMode: false, selectPlans: new Seq(), linePlans: new Seq(), block: null}, sound: {uiBus: null}},
    tree: {loadSound: function(name) {
        loadRequests.push(String(name));
        return extend(Packages.arc.audio.Sound, {play: function() { soundPlays++; return 1; }});
    }},
    ui: {
        paused: {cont: pausedContent, shown: function(callback) { pausedCallbacks.push(callback); },
            isShown: function() { return false; }, validate: function() { pausedStack.validate(); }, hide: function() {}},
        menufrag: {desktopButtons: menuRoots},
        getIcon: function() { return drawable; },
        addDescTooltip: function(actor, text) { actor.addListener(new Tooltip(function(table) { table.add(String(text)); })); }
    }
};
BaseDialog = Packages.mindustry.ui.dialogs.BaseDialog;

// Every restart loads this directory unchanged in a NEW JVM; it never reseeds.
// Expected raw records also verify that fallback does not repair by deleting data.
var expectedRecords = [], expectedSlots = [];
function record(key, value) { expectedRecords.push({key: key, value: value}); }
function text(value) { return new java.lang.String(String(value)); }
function integer(value) { return new java.lang.Integer(String(value)); }
function floating(value) { return new java.lang.Float(String(value)); }
function slot(w, s, name, scale) {
    record("buildwheel.slot." + w + "." + s + ".block", text(name));
    record("buildwheel.slot." + w + "." + s + ".scale", floating(scale));
    expectedSlots.push({w: w, s: s, block: name, scale: scale});
}
function changeRecord(key, value) {
    for (var i = 0; i < expectedRecords.length; i++) if (expectedRecords[i].key === key) { expectedRecords[i].value = value; return; }
    throw new Error("Fixture setting not registered: " + key);
}
if (preservationProfile) {
    record("buildwheel.test.profile", text(profile));
    record("buildwheel.test.sentinel", text("Keep Unicode: \u041a\u043e\u043b\u0451\u0441\u0430 \uD83D\uDE80"));
    record("sfxvol", integer(37)); // An unrelated, real Mindustry setting.
    record("buildwheel.controls.edgeShift", floating(0.65));
    record("buildwheel.controls.disableNumberKeys", new java.lang.Boolean("false"));
    record("buildwheel.controls.paletteInMenu", new java.lang.Boolean("true"));
    record("buildwheel.controls.wheelOpenPitch", new java.lang.Boolean("false"));
    record("buildwheel.controls.dimMissingMaterials", new java.lang.Boolean("false"));
    record("buildwheel.controls.numberColor", text("#123456"));
    record("buildwheel.slot.1.count", integer(128));
    record("buildwheel.visual.1.appearance.diameter", floating(360));
    slot(1, 0, "fixture-copper", 1.75);
    slot(1, 1, "fixture-lead", 0.65);
    slot(1, 2, "fixture-graphite", 0.9);
    slot(1, 3, "fixture-copper", 1.25);
    slot(1, 4, "fixture-lead", 1.15);
    slot(1, 5, "fixture-graphite", 0.8);
    slot(1, 6, "fixture-copper", 1.5);
    slot(1, 127, "fixture-hidden", 1.4); // Hidden beyond the current eight sectors.
    slot(2, 3, "fixture-lead", 1.9); // A different wheel must survive too.
    slot(0, 7, "fixture-graphite", 0.5);
    if (profile === "malformed-block" || profile === "malformed-mixed") {
        changeRecord("buildwheel.slot.1.0.block", integer(7)); expectedSlots[0].block = null;
    }
    if (profile === "malformed-scale") {
        changeRecord("buildwheel.slot.1.0.scale", text("1.7")); expectedSlots[0].scale = 1;
    }
    if (profile === "malformed-mixed") {
        changeRecord("buildwheel.slot.1.1.scale", text("1.7")); expectedSlots[1].scale = 1;
        changeRecord("buildwheel.slot.1.2.scale", floating("NaN")); expectedSlots[2].scale = 1;
        changeRecord("buildwheel.slot.1.3.scale", floating("Infinity")); expectedSlots[3].scale = 1;
        changeRecord("buildwheel.slot.1.4.scale", floating("-Infinity")); expectedSlots[4].scale = 1;
        changeRecord("buildwheel.slot.1.5.scale", floating(0.2)); expectedSlots[5].scale = 0.4;
        changeRecord("buildwheel.slot.1.6.scale", floating(3)); expectedSlots[6].scale = 2;
    }
}
if (profile === "relative-saved") {
    record("buildwheel.test.profile", text(profile));
    record("buildwheel.controls.relativeMouse", new java.lang.Boolean("true"));
}
if (restarting) {
    H.assertTrue(Core.settings.has("buildwheel.test.profile"), "restart has the original persisted Settings file");
    H.assertTrue(String(Core.settings.getString("buildwheel.test.profile")) === profile, "restart loads the matching profile without reseeding");
} else if (expectedRecords.length > 0) {
    for (var initial = 0; initial < expectedRecords.length; initial++) Core.settings.put(expectedRecords[initial].key, expectedRecords[initial].value);
    Core.settings.manualSave(); Core.settings.clear(); Core.settings.load();
}

var libraryFile = Core.settings.getDataDirectory().child("buildwheel/library.json");
var libraryBaselineFile = Core.settings.getDataDirectory().child("startup-library-baseline.bin");
if (preservationProfile && !restarting) {
    // This is the PRODUCTION store, using a real UTF-8 file and atomic commit.
    var seedModule = H.loadModule("wheel-library", function() { throw new Error("Library unexpectedly required another module"); });
    var seedStore = seedModule.create(), savedSlots = [];
    for (var saved = 0; saved < 128; saved++) savedSlots.push({block: null, scale: 1});
    savedSlots[0] = {block: "fixture-copper", scale: 1.75}; savedSlots[127] = {block: "fixture-hidden", scale: 1.4};
    seedStore.add("blocks", "Startup sentinel \u041a\u043e\u043b\u0451\u0441\u0430", {slots: savedSlots});
    libraryBaselineFile.writeBytes(libraryFile.readBytes(), false);
}
if (preservationProfile) {
    H.assertTrue(libraryFile.exists() && libraryBaselineFile.exists(), "real library and original-byte fixture already exist before ClientLoad");
    H.assertTrue(java.util.Arrays.equals(libraryFile.readBytes(), libraryBaselineFile.readBytes()), "library bytes match the original seed before startup");
}
function checkRawRecords(stage) {
    for (var checked = 0; checked < expectedRecords.length; checked++) {
        var item = expectedRecords[checked];
        H.assertSettingEquals(item.key, item.value, stage);
    }
    if (preservationProfile) H.assertTrue(java.util.Arrays.equals(libraryFile.readBytes(), libraryBaselineFile.readBytes()), stage + ": wheel library bytes unchanged");
}
checkRawRecords("before ClientLoad");

var modules = {}, nativePrepares = 0, warpCreates = 0;
var wheel = null, settingsApi = null, wheelView = null, slotApi = null;
function require(name) {
    if (modules[name]) return modules[name];
    var module = H.loadModule(name, require); modules[name] = module;
    if (name === "sdl-relative") {
        var nativeCreate = module.create, warpCreate = module.createWarp;
        module.create = function() { nativePrepares++; return nativeCreate(); };
        module.createWarp = function(adapter) { warpCreates++; return warpCreate(adapter); };
    }
    if (name === "menu") {
        var createMenu = module.create;
        module.create = function(api) { slotApi = api; settingsApi = createMenu(api); return settingsApi; };
    }
    if (name === "wheel") {
        var createWheel = module.create;
        module.create = function(api) {
            wheelView = createWheel(api);
            var createElement = wheelView.createElement;
            wheelView.createElement = function(options) {
                var element = createElement(options); if (options.useSharedVisual) wheel = element; return element;
            };
            return wheelView;
        };
    }
    return module;
}
var initialProcessors = Core.input.getInputMultiplexer().getProcessors().size;
var initialListeners = Core.app.getListeners().size;
var startupError = null;
try { require("main"); Events.fire(new ClientLoadEvent()); }
catch (error) {
    startupError = error; H.log("CAUGHT_STARTUP_FAILURE " + kind + " " + error);
    if (error.stack != null) H.log(String(error.stack));
    if (error.javaException != null) error.javaException.printStackTrace();
}

// A cast exception is a regression now: no expected-crash or green-by-skipping path.
if (startupError != null) throw startupError;
H.assertTrue(loadRequests.length === 5, "all five sound loads registered");
H.assertTrue(nativePrepares === 0 && warpCreates === 0, "ClientLoad does not initialize native adapter");
H.assertTrue(settingsApi != null && slotApi != null && wheel != null && !wheel.visible, "whole module graph and hidden game wheel created");
H.assertTrue(Core.input.getInputMultiplexer().getProcessors().size === initialProcessors + 1, "one main input processor");
H.assertTrue(Core.app.getListeners().size === initialListeners + 1, "one focus lifecycle listener");
var controls = modules.menu.getControls();
H.assertTrue(!controls.clipInner && !controls.clipOuter && !controls.customArrow && !controls.showNumber, "additional cursor modes off by default");
H.assertTrue(controls.relativeMouse === (profile === "relative-saved"), "saved/default relative flag read");
H.assertTrue(controls.dimMissingMaterials === !preservationProfile, "saved/default materials dimming flag read");
if (preservationProfile) {
    H.assertTrue(Math.abs(controls.edgeShift - 0.65) < 0.00001, "custom edge shift survives malformed sibling slots");
    H.assertTrue(!controls.disableNumberKeys && controls.paletteInMenu && !controls.wheelOpenPitch, "other user switches preserved");
    H.assertTrue(String(controls.numberColor).substring(0, 6) === "123456", "user number color preserved");
    H.assertTrue(Math.abs(wheelView.getVisual(1).appearance.diameter - 360) < 0.00001, "user wheel appearance preserved");
}
function checkLoadedSlots(stage) {
    for (var checked = 0; checked < expectedSlots.length; checked++) {
        var item = expectedSlots[checked], actual = slotApi.getBlock(item.w, item.s);
        H.assertTrue((item.block == null && actual == null) || actual === fixtureBlocks[item.block], stage + ": independent block fallback / sibling preserved " + item.w + "." + item.s);
        H.assertTrue(Math.abs(settingsApi.getIconScale(item.w, item.s) - item.scale) < 0.00001, stage + ": independent scale fallback / sibling preserved " + item.w + "." + item.s);
    }
}
checkLoadedSlots("after ClientLoad"); checkRawRecords("after ClientLoad");
settingsApi.show(1); H.drain();
var dialog = Core.scene.getDialog();
H.assertTrue(dialog != null, "real radial dialog built and shown");
H.assertTrue(dialog.find("buildwheel-control-dimMissingMaterials") != null, "materials dimming widget created");
H.assertTrue(dialog.find("buildwheel-preview") != null, "mannequin created");
H.assertTrue(settingsApi.canOpenPaletteFromKey(), "own dialog keyboard focus allowed");
var focusField = new TextField(""); dialog.cont.add(focusField); Core.scene.setKeyboardFocus(focusField);
H.assertTrue(!settingsApi.canOpenPaletteFromKey(), "child text focus blocks palette shortcut");
dialog.hide();
for (var frame = 0; frame < 30; frame++) Core.scene.act(1 / 60);
H.drain(); Core.scene.setKeyboardFocus(null); Core.scene.setScrollFocus(null);
H.assertTrue(nativePrepares === 0, "building actual settings does not initialize native adapter");
checkLoadedSlots("after actual UI"); checkRawRecords("after actual UI");

// All profiles exercise the same ordinary input and lifecycle, including recovery.
// The relative-saved profile keeps its persisted true value; only this in-memory
// test phase selects ordinary input. Native behavior has a separate real SDL probe.
var savedRelativeFlag = controls.relativeMouse; controls.relativeMouse = false;
inGame = true; H.pointer(750, 550);
var multiplexer = Core.input.getInputMultiplexer();
function openWheel() {
    multiplexer.keyDown(KeyCode.controlLeft); multiplexer.keyDown(KeyCode.num1);
    multiplexer.keyUp(KeyCode.num1); multiplexer.keyUp(KeyCode.controlLeft);
    H.assertTrue(wheel.visible, "ordinary Ctrl+1 opens wheel after startup/recovery");
}
openWheel();
multiplexer.touchDown(750, 550, 0, KeyCode.mouseRight); multiplexer.touchUp(750, 550, 0, KeyCode.mouseRight);
H.drain(); H.assertTrue(!wheel.visible, "RMB closes wheel");
openWheel(); H.pause(); H.assertTrue(!wheel.visible, "focus loss closes wheel"); H.resume();
openWheel(); Events.fire(new ResizeEvent()); H.assertTrue(!wheel.visible, "resize closes wheel");
openWheel(); Events.fire(new ResetEvent()); H.assertTrue(!wheel.visible, "world reset closes wheel");
// Click the north sector using queued event coordinates, preserving the normal
// block selection path even when a bad scale fell back or a bad name became null.
var previousSelection = fixtureBlocks["fixture-lead"];
Vars.control.input.block = previousSelection;
openWheel();
var point = new Vec2(wheel.x + wheel.getWidth() / 2, wheel.y + wheel.getHeight() * 0.875);
Core.scene.getViewport().project(point);
multiplexer.touchDown(Math.round(point.x), Math.round(point.y), 0, KeyCode.mouseLeft);
multiplexer.touchUp(Math.round(point.x), Math.round(point.y), 0, KeyCode.mouseLeft); H.drain();
H.assertTrue(!wheel.visible, "LMB completes selection or empty-slot cancellation");
H.assertTrue(Vars.control.input.block === (slotApi.getBlock(1, 0) || previousSelection), "loaded valid block remains selectable; invalid block preserves previous selection");
H.assertTrue(nativePrepares === 0 && warpCreates === 0, "ordinary centered input avoids FFM on actual host OS");
controls.relativeMouse = savedRelativeFlag;
for (var idle = 0; idle < 50; idle++) { Core.graphics.incrementFrameId(); Core.scene.act(1 / 60); }
Events.fire(new ResetEvent()); Events.fire(new ResizeEvent()); H.pause(); H.resume(); H.drain();
Events.fire(new DisposeEvent()); Events.fire(new DisposeEvent()); H.drain();
H.assertTrue(nativePrepares === 0, "idle/repeated lifecycle/disposal do not initialize unused native provider");
checkLoadedSlots("after ordinary input/lifecycle"); checkRawRecords("after ordinary input/lifecycle");
// Flush, clear, and read once more here; a separately launched -restart JVM must
// subsequently prove that this same Settings file survives process recreation.
Core.settings.manualSave(); Core.settings.clear(); Core.settings.load();
checkRawRecords("after final Settings disk reload");
if (preservationProfile) {
    var verificationModule = H.loadModule("wheel-library", function() { throw new Error("Library unexpectedly required another module"); });
    var preservedEntries = verificationModule.create().list("blocks", "");
    H.assertTrue(preservedEntries.length === 1, "existing real library entry remains readable");
    H.assertTrue(preservedEntries[0].data.slots.length === 128 && preservedEntries[0].data.slots[127].block === "fixture-hidden", "library hidden data remains intact");
    checkRawRecords("after independent real library reread");
}
H.result(preservationProfile ? "PASS_RECOVERY_AND_PRESERVATION" : "PASS_COMPONENTS_ONLY",
    "Real host OS, Settings files, Java/Rhino/Arc UI and full module graph; independent field fallback, ordinary input and lifecycle; "
    + (restarting ? "fresh JVM loaded existing fixture without reseeding; " : "initial fixture; ")
    + "mock graphics/audio/content, no native SDL or physical input");
