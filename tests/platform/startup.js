"use strict";
// The real Java game/UI classes and all production JS modules run on the host OS.
// Only the application/window/GL/audio/content fixtures are mocked. This cannot
// prove that a real window, system pointer, or physical input works on that OS.
var repository = String(testArguments[1]).replace(/\\/g, "/");
var kind = String(testArguments.length > 3 ? testArguments[3] : "factory");
var locale = String(testArguments.length > 4 ? testArguments[4] : "en");
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
var loadRequests = [], soundPlays = 0;
Core.audio = new Packages.arc.audio.Audio(false); Core.audio.sfxVolume = 1;
var Vars = {
    headless: false, mobile: false,
    state: {isGame: function() { return inGame; }, isMenu: function() { return !inGame; }, rules: new Rules()},
    player: {team: function() { return Team.sharded; }, core: function() { return null; }},
    content: {blocks: function() { return new Seq(); }, planets: function() { return new Seq(); }, block: function() { return null; }},
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

// Corrupt records are persisted, then read by a fresh process in the restart cases.
if (kind === "malformed-scale") Core.settings.put("buildwheel.slot.1.0.scale", "1");
if (kind === "malformed-block") Core.settings.put("buildwheel.slot.1.0.block", new java.lang.Integer("7"));
if (kind === "relative-saved") Core.settings.put("buildwheel.controls.relativeMouse", true);
if (kind === "malformed-scale" || kind === "malformed-block" || kind === "relative-saved") {
    Core.settings.manualSave(); Core.settings.clear(); Core.settings.load();
}

var modules = {}, nativePrepares = 0, warpCreates = 0;
var wheel = null, settingsApi = null, wheelView = null;
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
        module.create = function(api) { settingsApi = createMenu(api); return settingsApi; };
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

if (kind.indexOf("malformed-") === 0) {
    H.assertTrue(nativePrepares === 0, "malformed startup does not reach FFM");
    if (startupError != null) {
        var expectedCast = kind.indexOf("block") >= 0
            ? "java.lang.Integer cannot be cast to class java.lang.String"
            : "java.lang.String cannot be cast to class java.lang.Float";
        H.assertTrue(String(startupError).indexOf(expectedCast) >= 0, "failure is the audited invalid-setting cast");
        H.result("EXPECTED_DEFECT_REPRODUCED", "Persisted malformed slot crashes ClientLoad, including after process restart: " + startupError);
    } else H.result("EXPECTED_DEFECT_NOT_REPRODUCED", "Malformed slot unexpectedly survived; inspect production revision and fixture");
} else {
    if (startupError != null) throw startupError;
    H.assertTrue(loadRequests.length === 5, "all five sound loads registered");
    H.assertTrue(nativePrepares === 0 && warpCreates === 0, "ClientLoad does not initialize native adapter");
    H.assertTrue(settingsApi != null && wheel != null && !wheel.visible, "whole module graph and hidden game wheel created");
    H.assertTrue(Core.input.getInputMultiplexer().getProcessors().size === initialProcessors + 1, "one main input processor");
    H.assertTrue(Core.app.getListeners().size === initialListeners + 1, "one focus lifecycle listener");
    var controls = modules.menu.getControls();
    H.assertTrue(!controls.clipInner && !controls.clipOuter && !controls.customArrow && !controls.showNumber, "additional cursor modes off by default");
    H.assertTrue(controls.relativeMouse === (kind === "relative-saved"), "saved/default relative flag read");
    H.assertTrue(controls.dimMissingMaterials, "materials dimming on by default");
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
    if (kind === "factory") {
        inGame = true; H.pointer(750, 550);
        var multiplexer = Core.input.getInputMultiplexer();
        function openWheel() {
            multiplexer.keyDown(KeyCode.controlLeft); multiplexer.keyDown(KeyCode.num1);
            multiplexer.keyUp(KeyCode.num1); multiplexer.keyUp(KeyCode.controlLeft);
            H.assertTrue(wheel.visible, "default ordinary Ctrl+1 opens wheel");
        }
        openWheel();
        multiplexer.touchDown(750, 550, 0, KeyCode.mouseRight); multiplexer.touchUp(750, 550, 0, KeyCode.mouseRight);
        H.drain(); H.assertTrue(!wheel.visible, "RMB closes wheel");
        openWheel(); H.pause(); H.assertTrue(!wheel.visible, "focus loss closes wheel"); H.resume();
        openWheel(); Events.fire(new ResizeEvent()); H.assertTrue(!wheel.visible, "resize closes wheel");
        openWheel(); Events.fire(new ResetEvent()); H.assertTrue(!wheel.visible, "world reset closes wheel");
        H.assertTrue(nativePrepares === 0 && warpCreates === 0, "ordinary centered input avoids FFM on actual host OS");
    }
    for (var idle = 0; idle < 50; idle++) { Core.graphics.incrementFrameId(); Core.scene.act(1 / 60); }
    Events.fire(new ResetEvent()); Events.fire(new ResizeEvent()); H.pause(); H.resume(); H.drain();
    Events.fire(new DisposeEvent()); Events.fire(new DisposeEvent()); H.drain();
    H.assertTrue(nativePrepares === 0, "idle/repeated lifecycle/disposal do not initialize unused native provider");
    H.result("PASS_COMPONENTS_ONLY", "Real host OS, Java, Rhino, Arc widgets and full JS module graph; mock graphics/audio/content, no native SDL or physical input");
}
