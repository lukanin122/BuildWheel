// This fixture runs through the actual Android Scripts.run(mod, file) loader.
// The runtime BuildWheel files, layouts, assets and event processors are unchanged.
(function() {
    var H = Packages.mindustry.android.BuildWheelAndroidProbe;
    var menu = require("menu"), libraryModule = require("wheel-library"), controls = menu.getControls();
    var AndroidKey = Packages.android.view.KeyEvent, Motion = Packages.android.view.MotionEvent;
    var originalProfile = Core.settings.getDataDirectory(), previousKeyboard = Core.settings.getBool("keyboard", false);
    var frames = 0, next = 0, actions = [], editor = null, preview = null, beforeLibrary, keyTests;
    var desktop = Packages.mindustry.input.DesktopInput, mobile = Packages.mindustry.input.MobileInput;
    function check(value, message) { H.check(!!value, message); }
    function step(action, delay, ready) { actions.push({action: action, delay: delay == null ? 24 : delay, ready: ready}); }
    function find(name) { var e = Core.scene.root.find(name); check(e != null, "Actual Android widget exists: " + name); return e; }
    function click(name) { find(name).fireClick(); }
    function closeDialogs() { for (var i = 0; i < 12 && Core.scene.getDialog() != null; i++) Core.scene.getDialog().hide(); }
    function key(code, down) { H.key(code, down); }
    function tap(code) { key(code, true); key(code, false); }
    function chord(code) { key(AndroidKey.KEYCODE_CTRL_LEFT, true); key(code, true); key(code, false); key(AndroidKey.KEYCODE_CTRL_LEFT, false); }
    function computer(enabled) { Core.settings.put("keyboard", enabled); Vars.control.setInput(enabled ? new desktop() : new mobile()); Core.input.setUseKeyboard(enabled); }
    function createWorld() {
        Vars.logic.reset(); Vars.state.rules = Packages.mindustry.game.Gamemode.sandbox.apply(new Rules());
        var tags = new Packages.arc.struct.StringMap(); tags.put("name", "BuildWheel Android fixture"); Vars.state.map = new Packages.mindustry.maps.Map(tags);
        Vars.state.map.width = Vars.state.map.height = 48;
        Vars.world.loadGenerator(48, 48, function(tiles) { tiles.fill(); for (var x = 0; x < 48; x++) for (var y = 0; y < 48; y++) tiles.get(x, y).setFloor(Blocks.stone); tiles.get(24, 24).setBlock(Blocks.coreShard, Team.sharded, 0); });
        Vars.logic.play(); Vars.player.team(Team.sharded);
        var unit = UnitTypes.alpha.create(Team.sharded); unit.set(24 * Vars.tilesize, 24 * Vars.tilesize); unit.add(); Vars.player.unit(unit);
    }
    function physical(point, action, button) { H.mouse(point.x, point.y, action, button == null ? 0 : button); }
    function pressPoint(point) { physical(point, Motion.ACTION_DOWN, Motion.BUTTON_PRIMARY); physical(point, Motion.ACTION_UP, 0); }
    function at(element, relativeX, relativeY) { return element.localToStageCoordinates(new Vec2(element.getWidth() * relativeX, element.getHeight() * relativeY)); }
    function wheel() {
        var found = null, children = Core.scene.root.getChildren();
        for (var i = 0; i < children.size; i++) { var e = children.get(i);
            if (!(e instanceof Packages.arc.scene.Group) && e.visible && e.getWidth() >= 40 && Math.abs(e.getWidth() - e.getHeight()) < 0.01) {
                check(found == null, "Exactly one visible plain wheel element"); found = e;
            }
        }
        return found;
    }
    function findButton(buttons, title) {
        if (buttons == null) return null;
        var length = buttons.size == null ? buttons.length : buttons.size;
        for (var i = 0; i < length; i++) { var b = buttons.get == null ? buttons[i] : buttons.get(i);
            if (String(b.text) === String(title)) return b;
            var nested = findButton(b.submenu, title); if (nested != null) return nested;
        }
        return null;
    }
    function storageTests() {
        var settings = Core.settings, sandbox = new Packages.arc.Settings(), store;
        var directory = originalProfile.child("buildwheel-android-storage-fixture");
        directory.deleteDirectory(); sandbox.setAutosave(false); sandbox.setDataDirectory(directory); Core.settings = sandbox;
        try {
            store = libraryModule.create(); check(store.list("blocks", "").length === 0, "Android absent library loads empty");
            var first = store.add("blocks", "First ♥ Кириллица", {slots: [{block: "conveyor", scale: 1.25}]}), second = store.add("blocks", "Second", {slots: []});
            var main = directory.child("buildwheel/library.json"), backup = directory.child("buildwheel/library.json.bak");
            check(main.exists() && backup.exists(), "Android atomic writes create main and backup");
            check(libraryModule.create().get(first.id).name === "First ♥ Кириллица", "Strict Android UTF-8 reader preserves non-ASCII");
            check(libraryModule.create().get(second.id) != null, "Android reread preserves second entry");
            main.writeBytes(java.lang.reflect.Array.newInstance(java.lang.Byte.TYPE, 0), false);
            var bad = java.lang.reflect.Array.newInstance(java.lang.Byte.TYPE, 2); bad[0] = -61; bad[1] = 40; main.writeBytes(bad, false);
            var recovered = libraryModule.create(); check(recovered.get(first.id) != null && recovered.get(second.id) == null, "Malformed UTF-8 recovers previous confirmed backup");
            check(main.length() === 2, "Reading damaged main does not silently overwrite it");
            recovered.add("blocks", "Recovered", {slots: []});
            var committed = String(main.readString("UTF-8")), count = recovered.list("blocks", "").length;
            directory.child("buildwheel/library.json.tmp").mkdirs();
            var failed = false; try { recovered.add("blocks", "Must roll back", {slots: []}); } catch (error) { failed = true; }
            check(failed && String(main.readString("UTF-8")) === committed && recovered.list("blocks", "").length === count, "Android failed write preserves disk and in-memory entries");
            directory.child("buildwheel/library.json.tmp").deleteDirectory();
            var legacyDir = originalProfile.child("buildwheel-android-legacy-fixture"); legacyDir.deleteDirectory(); sandbox.setDataDirectory(legacyDir);
            sandbox.put("buildwheel.library", '{"version":1,"nextId":2,"entries":[{"id":"legacy","type":"blocks","name":"Existing","description":"","data":{"slots":[]}}]}');
            var migrated = libraryModule.create(); check(migrated.get("legacy") != null && legacyDir.child("buildwheel/library.json").exists(), "Android migrates existing legacy library");
            check(!sandbox.has("buildwheel.library"), "Legacy key removed only after confirmed Android write");
        } finally { Core.settings = settings; }
    }
    try {
        check(OS.isAndroid && Vars.mobile, "Real Android platform and Vars.mobile remain true");
        check(String(Core.input.getClass().getName()) === "arc.backend.android.AndroidInput", "Actual AndroidInput backend is running");
        check(String(Core.graphics.getClass().getName()) === "arc.backend.android.AndroidGraphics", "Actual AndroidGraphics backend is rendering");
        var noFfm = false; try { java.lang.Class.forName("java.lang.foreign.Linker"); } catch (error) { noFfm = true; }
        check(noFfm, "Android JVM has no Java FFM classes");
        var adapter = require("sdl-relative").create(); check(!adapter.available && !adapter.begin(), "Android safely declines desktop SDL/FFM adapter"); adapter.dispose();
        storageTests();
        var store = libraryModule.create(), sentinel = originalProfile.child("buildwheel-android-sentinel.txt");
        if (String(H.stage()) === "initial") {
            check(!Core.settings.has("buildwheel.android.sentinel"), "Initial emulator profile is fresh");
            Core.settings.put("buildwheel.android.sentinel", "Preserve Android settings ♥");
            store.add("blocks", "Persist across actual process restart", {slots: [{block: "conveyor", scale: 1.25}]});
            sentinel.writeString(originalProfile.child("buildwheel/library.json").readString("UTF-8"), false, "UTF-8");
        } else {
            check(String(Core.settings.getString("buildwheel.android.sentinel", "")) === "Preserve Android settings ♥", "Actual Android process restart preserved settings");
            check(store.list("blocks", "").length === 1, "Actual Android process restart preserved library entry");
            check(String(originalProfile.child("buildwheel/library.json").readString("UTF-8")) === String(sentinel.readString("UTF-8")), "Actual Android process restart preserved library bytes");
        }
        beforeLibrary = String(originalProfile.child("buildwheel/library.json").readString("UTF-8"));
        keyTests = buildWheelAndroidKeyDiagnostics({controls: controls, step: step, wheel: wheel, computer: computer,
            closeDialogs: closeDialogs, click: click, getEditor: function() { return editor; }});
        keyTests.baseline();
    } catch (error) { H.fail(String(error)); return; }

    step(function() { closeDialogs(); createWorld(); computer(false); check(!menu.computerInputActive(), "MobileInput disables BuildWheel computer actions"); });
    keyTests.beforeBaseline();
    step(function() { chord(AndroidKey.KEYCODE_MINUS); });
    step(function() { check(Core.scene.getDialog() == null, "MobileInput chord did not open editor"); computer(true); });
    step(function() { check(menu.computerInputActive() && Vars.mobile, "DesktopInput switch enabled mod without changing Vars.mobile"); chord(AndroidKey.KEYCODE_MINUS); });
    step(function() {
        editor = Core.scene.getDialog(); check(editor != null && editor.find("buildwheel-preview") != null, "Ctrl+minus through Android key queue opened actual editor");
        check(editor.find("buildwheel-control-dimMissingMaterials") != null, "Existing global settings are present");
        H.screenshot("editor"); click("buildwheel-key-wheel-9");
    }, 24);
    step(function() { check(String(Core.scene.getDialog().name) === "buildwheel-rebind", "Actual rebind dialog opened"); tap(AndroidKey.KEYCODE_F6); });
    step(function() { check(controls.key(controls.bindings.wheels[9]) === KeyCode.f6, "Android key event rebound wheel to F6"); click("buildwheel-key-reset-wheels"); });
    step(function() { check(controls.key(controls.bindings.wheels[9]) === KeyCode.num9, "Actual reset button restored wheel bindings"); click("buildwheel-open-palette"); });
    step(function() { check(String(Core.scene.getDialog().name) === "buildwheel-palette", "Existing palette opened"); find("buildwheel-hsv-input").setText("#12A4F8"); find("buildwheel-tint-base").setText("#123456"); H.screenshot("palette"); click("buildwheel-palette-back"); }, 24);
    step(function() { click("buildwheel-save-browser"); });
    step(function() { check(String(Core.scene.getDialog().name) === "buildwheel-saves", "Existing wheel browser opened"); H.screenshot("browser"); tap(AndroidKey.KEYCODE_ESCAPE); }, 24);
    step(function() {
        check(Core.scene.getDialog() === editor, "Browser closed to existing editor");
        preview = find("buildwheel-preview"); var point = at(preview, .5, .82); physical(point, Motion.ACTION_HOVER_MOVE); pressPoint(point);
    });
    step(function() { click("buildwheel-block-conveyor"); });
    step(function() {
        check(String(Core.settings.getString("buildwheel.slot.1.0.block", "")) === "conveyor", "Android mouse selected mannequin sector and assigned conveyor");
        click("buildwheel-back");
    });
    step(function() {
        closeDialogs(); controls.set("edgeShift", 0); controls.set("relativeMouse", false); controls.set("clipOuter", false); controls.set("clipInner", false);
        physical(new Vec2(Core.scene.getWidth() / 2, Core.scene.getHeight() / 2), Motion.ACTION_HOVER_MOVE);
    }, 30);
    step(function() { chord(AndroidKey.KEYCODE_1); });
    step(function() { var e = wheel(); check(e != null, "Android Ctrl+1 opened real selection wheel"); H.screenshot("wheel"); pressPoint(at(e, .5, .82)); });
    step(function() { check(wheel() == null && Vars.control.input.block === Blocks.conveyor, "Android LMB selected conveyor and closed wheel"); chord(AndroidKey.KEYCODE_1); });
    step(function() { check(wheel() != null, "Android wheel reopened"); computer(false); });
    step(function() { check(!menu.computerInputActive() && wheel() == null, "Runtime switch to MobileInput closed wheel safely"); chord(AndroidKey.KEYCODE_1); });
    step(function() { check(wheel() == null, "MobileInput did not intercept wheel chord"); computer(true); key(AndroidKey.KEYCODE_CTRL_LEFT, true); });
    step(function() { computer(false); tap(AndroidKey.KEYCODE_1); }); // Detect handler change inside the actual fixed-length Android key queue.
    step(function() { key(AndroidKey.KEYCODE_CTRL_LEFT, false); });
    step(function() { computer(true); tap(AndroidKey.KEYCODE_1); });
    step(function() {
        check(!Core.input.ctrl() && wheel() == null, "Mode change during input drain did not strand Ctrl or create a phantom wheel chord");
        controls.set("relativeMouse", true); controls.set("clipOuter", true); controls.set("clipInner", true); chord(AndroidKey.KEYCODE_1);
    });
    step(function() { check(wheel() != null, "Unsupported Android relative settings preserve absolute wheel opening"); tap(AndroidKey.KEYCODE_ESCAPE); });
    step(function() {
        check(wheel() == null, "Android Escape closed wheel with unsupported relative settings");
        controls.set("relativeMouse", false); controls.set("clipOuter", false); controls.set("clipInner", false);
    });
    keyTests.schedule();
    step(function() {
        Core.settings.put("keyboard", previousKeyboard); Core.settings.manualSave();
        check(String(originalProfile.child("buildwheel/library.json").readString("UTF-8")) === beforeLibrary, "Editor/input operations preserved unrelated library bytes");
        H.finish();
    });
    Core.app.addListener(extend(Packages.arc.ApplicationListener, {
        update: function() {
            if (H.done() || ++frames < next || actions.length === 0) return;
            var current = actions[0];
            try {
                if (current.ready && !current.ready()) return;
                actions.shift(); next = frames + current.delay; current.action();
            } catch (error) { H.fail(String(error)); }
        }
    }));
})();
