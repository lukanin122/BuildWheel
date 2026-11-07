// Test-only diagnostics, concatenated with android-probe.js inside the disposable APK.
// No runtime source is patched. Keyboard events always enter Android View/AndroidInput.
function buildWheelAndroidKeyDiagnostics(api) {
    var H = Packages.mindustry.android.BuildWheelAndroidProbe, A = Packages.android.view.KeyEvent;
    var controls = api.controls, binds = controls.bindings, Axis = Packages.arc.input.KeyBind.Axis;
    var initial = String(H.stage()) === "initial", scenario = "setup", ticket = 0;
    var preCount = 0, postCount = 0, mobilePre = 0, mobilePost = 0;
    var registryCount = Packages.arc.input.KeyBind.all.size, previousNumber = controls.showNumber;
    var mux = Core.input.getInputMultiplexer(), before, after;
    var families = [
        {name: "Shift", keys: [KeyCode.shiftLeft, KeyCode.shiftRight], raw: [A.KEYCODE_SHIFT_LEFT, A.KEYCODE_SHIFT_RIGHT]},
        {name: "Alt", keys: [KeyCode.altLeft, KeyCode.altRight], raw: [A.KEYCODE_ALT_LEFT, A.KEYCODE_ALT_RIGHT]},
        {name: "Ctrl", keys: [KeyCode.controlLeft, KeyCode.controlRight], raw: [A.KEYCODE_CTRL_LEFT, A.KEYCODE_CTRL_RIGHT]}
    ];
    function diag(pass, message, details) { H.diagnostic(!!pass, scenario + ": " + message, details == null ? "" : String(details)); }
    function save(bind, key) { bind.value = new Axis(key); bind.save(); }
    function disabled() {
        for (var n = 0; n < 10; n++) save(binds.wheels[n], KeyCode.unset);
        save(binds.wheelModifier, KeyCode.unset); save(binds.menuModifier, KeyCode.unset); save(binds.menuKey, KeyCode.unset);
        save(binds.paletteModifier, KeyCode.unset); save(binds.paletteKey, KeyCode.unset); save(binds.scrollKey, KeyCode.unset);
    }
    function digits() { for (var n = 0; n < 10; n++) save(binds.wheels[n], KeyCode.valueOf("num" + n)); }
    function trace(kind, key) {
        H.trace(kind, scenario, key.name(), "handler=" + Vars.control.input.getClass().getSimpleName()
            + ",ctrl=" + Core.input.ctrl() + ",shift=" + Core.input.shift() + ",alt=" + Core.input.alt());
    }
    function observer(kind) {
        return extend(Packages.arc.input.InputProcessor, {
            keyDown: function(key) { if (kind === "pre") preCount++; else postCount++; trace(kind + "-down", key); return false; },
            keyUp: function(key) { if (kind === "pre") preCount++; else postCount++; trace(kind + "-up", key); return false; }
        });
    }
    function send(codes, states, done) {
        api.step(function() { ticket = H.keys(codes, states); }, 1);
        api.step(function() { if (done) done(); }, 2, function() { return H.keysProcessed(ticket); });
    }
    function tap(code, done) { send([code, code], [true, false], done); }
    function chord(modifier, primary, done) {
        if (modifier == null) tap(primary, done);
        else send([modifier, primary, primary, modifier], [true, true, false, false], done);
    }
    function expect(action, number) {
        var wheel = api.wheel(), dialog = Core.scene.getDialog();
        var label = Core.scene.root.find("buildwheel-wheel-number-label");
        var actual = wheel != null ? "wheel:" + (label == null ? "missing-number" : label.getText())
            : dialog == null ? "none" : dialog.find("buildwheel-preview") != null ? "editor" : String(dialog.name) === "buildwheel-palette" ? "palette" : "other-dialog";
        diag(actual === (action === "wheel" ? "wheel:" + number : action), "requested action", "expected=" + action + (number == null ? "" : ":" + number) + ",actual=" + actual);
    }
    function close() {
        tap(A.KEYCODE_ESCAPE);
        api.step(api.closeDialogs, 12); // Let existing dialog hide actions finish before another hotkey.
        waitForDialogs();
    }
    function waitForDialogs() {
        api.step(function() {}, 1, function() {
            var children = Core.scene.root.getChildren();
            for (var i = 0; i < children.size; i++) if (children.get(i) instanceof Packages.arc.scene.ui.Dialog) return false;
            return Core.scene.getDialog() == null;
        }); // isShown remains true during the real 0.4-second fade, regardless of emulator frame rate.
    }
    function setup(name, action) {
        api.step(function() { scenario = name; api.closeDialogs(); disabled(); if (action) action(); }, 12);
    }
    function assertKey(bind, expected) { diag(controls.key(bind) === expected, "same universal KeyBind received key", bind.name + "=" + controls.key(bind).name()); }
    function uiBind(widget, bind, raw, key, button) {
        api.step(function() { scenario = "UI assignment " + widget + "=" + (key == null ? button : key.name()); api.getEditor().show(); }, 16);
        api.step(function() { api.click("buildwheel-key-" + widget); }, 16);
        api.step(function() { diag(String(Core.scene.getDialog().name) === "buildwheel-rebind", "existing rebind dialog opened"); }, 1);
        if (button) api.step(function() { api.click("buildwheel-rebind-" + button); }, 16);
        else tap(raw);
        api.step(function() { assertKey(bind, key); api.closeDialogs(); }, 16);
        waitForDialogs();
    }
    function checkpointAssignments() {
        disabled(); save(binds.wheelModifier, KeyCode.f2); save(binds.wheels[1], KeyCode.u);
        save(binds.menuModifier, KeyCode.f3); save(binds.menuKey, KeyCode.i);
        save(binds.paletteModifier, KeyCode.f4); save(binds.paletteKey, KeyCode.o);
    }
    function checkpointActions(prefix) {
        api.step(function() { scenario = prefix; api.computer(true); controls.set("showNumber", true); }, 12);
        chord(A.KEYCODE_F2, A.KEYCODE_U, function() { expect("wheel", 1); }); close();
        chord(A.KEYCODE_F3, A.KEYCODE_I, function() { expect("editor"); }); close();
        chord(A.KEYCODE_F4, A.KEYCODE_O, function() { expect("palette"); }); close();
    }
    function familyMatrix(family, configured, physical) {
        setup(family.name + " secondary=" + family.keys[configured].name() + ",physical=" + family.keys[physical].name(), function() {
            digits(); save(binds.wheelModifier, family.keys[configured]);
        });
        send([family.raw[physical]], [true], function() {
            diag(Core.input.keyDown(family.keys[physical]), "actual Android backend holds requested side"); expect("none");
        });
        for (var d = 1; d <= 10; d++) (function(number) {
            tap(A.KEYCODE_0 + number, function() { expect("wheel", number); });
        })(d % 10);
        send([family.raw[physical]], [false], function() {
            diag(!Core.input.keyDown(family.keys[0]) && !Core.input.keyDown(family.keys[1]), "both modifier sides released");
        });
        close();
    }
    function primarySide(family, side) {
        setup("Exact primary " + family.keys[side].name(), function() { save(binds.wheels[1], family.keys[side]); });
        tap(family.raw[1 - side], function() { expect("none"); });
        tap(family.raw[side], function() { expect("wheel", 1); }); close();
    }
    function mobileChord(name, modifier, primary) {
        api.step(function() { scenario = "MobileInput passthrough " + name; mobilePre = preCount; mobilePost = postCount; }, 1);
        chord(modifier, primary, function() {
            expect("none");
            diag(preCount > mobilePre && preCount - mobilePre === postCount - mobilePost, "every Arc down/up passed BuildWheel", "before=" + (preCount - mobilePre) + ",after=" + (postCount - mobilePost));
        });
    }
    return {
        baseline: function() { H.bindingBaseline(initial); },
        beforeBaseline: function() {
            if (!initial) {
                api.step(function() { H.keyCheckpoint(false); }, 1); // Inspect auto-loaded values before changing any binding.
                checkpointActions("Fresh process executes saved arbitrary assignments");
                api.step(function() { H.restoreBindings(); controls.set("showNumber", previousNumber); api.computer(false); }, 12);
            }
        },
        schedule: function() {
            api.step(function() {
                scenario = "Universal registry"; controls.set("showNumber", true); api.computer(true);
                before = observer("pre"); after = observer("post");
                mux.addProcessor(0, before); mux.addProcessor(2, after); // Runtime BuildWheel processor remains unchanged, between the observers.
                var count = 0;
                for (var n = 0; n < Packages.arc.input.KeyBind.all.size; n++) {
                    var bind = Packages.arc.input.KeyBind.all.get(n);
                    if (String(bind.name).indexOf("buildwheel-") === 0) count++;
                }
                diag(count === 16 && registryCount === Packages.arc.input.KeyBind.all.size, "existing sixteen platform-independent bindings", "count=" + count);
                var references = [binds.wheelModifier, binds.menuModifier, binds.menuKey, binds.paletteModifier, binds.paletteKey, binds.scrollKey].concat(binds.wheels);
                for (var r = 0; r < references.length; r++) diag(references[r] instanceof Packages.arc.input.KeyBind
                    && Packages.arc.input.KeyBind.all.contains(references[r], true), "controls reference registered universal KeyBind", references[r].name);
            }, 12);
            if (initial) {
                for (var f = 0; f < families.length; f++) for (var configured = 0; configured < 2; configured++) for (var physical = 0; physical < 2; physical++) familyMatrix(families[f], configured, physical);
                for (var p = 0; p < families.length; p++) for (var side = 0; side < 2; side++) primarySide(families[p], side);
                setup("All digits without secondary", digits);
                for (var number = 1; number <= 10; number++) (function(n) {
                    tap(A.KEYCODE_0 + n, function() { expect("wheel", n); });
                })(number % 10);
                close();
                for (var u = 0; u < families.length; u++) for (var s = 0; s < 2; s++) uiBind("wheel-modifier", binds.wheelModifier, families[u].raw[s], families[u].keys[s]);
                uiBind("wheel-modifier", binds.wheelModifier, A.KEYCODE_F2, KeyCode.f2);
                uiBind("wheel-1", binds.wheels[1], A.KEYCODE_U, KeyCode.u);
                uiBind("menu-modifier", binds.menuModifier, A.KEYCODE_F3, KeyCode.f3);
                uiBind("menu-key", binds.menuKey, A.KEYCODE_I, KeyCode.i);
                uiBind("palette-modifier", binds.paletteModifier, A.KEYCODE_F4, KeyCode.f4);
                uiBind("palette-key", binds.paletteKey, A.KEYCODE_O, KeyCode.o);
                checkpointActions("Arbitrary UI assignments execute");
                // Back preserves a prior key; Unset and single-key execution use the same existing dialog.
                uiBind("wheel-1", binds.wheels[1], null, KeyCode.u, "back");
                uiBind("wheel-modifier", binds.wheelModifier, null, KeyCode.unset, "unset");
                uiBind("menu-modifier", binds.menuModifier, null, KeyCode.unset, "unset");
                uiBind("palette-modifier", binds.paletteModifier, null, KeyCode.unset, "unset");
                tap(A.KEYCODE_U, function() { expect("wheel", 1); }); close();
                tap(A.KEYCODE_I, function() { expect("editor"); }); close();
                tap(A.KEYCODE_O, function() { expect("palette"); }); close();
                uiBind("wheel-1", binds.wheels[1], null, KeyCode.unset, "unset");
                uiBind("menu-key", binds.menuKey, null, KeyCode.unset, "unset");
                uiBind("palette-key", binds.paletteKey, null, KeyCode.unset, "unset");
                tap(A.KEYCODE_U, function() { expect("none"); });
                tap(A.KEYCODE_I, function() { expect("none"); });
                tap(A.KEYCODE_O, function() { expect("none"); });
                api.step(function() { scenario = "Existing reset buttons"; api.getEditor().show(); }, 16);
                api.step(function() { api.click("buildwheel-key-reset-wheels"); api.click("buildwheel-key-reset-menu"); }, 2);
                api.step(function() {
                    assertKey(binds.wheelModifier, KeyCode.controlLeft); assertKey(binds.menuModifier, KeyCode.controlLeft); assertKey(binds.menuKey, KeyCode.minus);
                    for (var n = 0; n < 10; n++) assertKey(binds.wheels[n], KeyCode.valueOf("num" + n));
                    diag(controls.key(binds.paletteKey) === KeyCode.unset, "reset leaves unrelated palette assignment disabled"); api.closeDialogs();
                }, 16);
                chord(A.KEYCODE_CTRL_RIGHT, A.KEYCODE_0, function() { expect("wheel", 0); }); close();
                chord(A.KEYCODE_CTRL_LEFT, A.KEYCODE_MINUS, function() { expect("editor"); }); close();
                setup("Missing or wrong secondary", function() { save(binds.wheelModifier, KeyCode.shiftLeft); save(binds.wheels[1], KeyCode.u); });
                tap(A.KEYCODE_U, function() { expect("none"); });
                chord(A.KEYCODE_ALT_LEFT, A.KEYCODE_U, function() { expect("none"); });
                chord(A.KEYCODE_SHIFT_RIGHT, A.KEYCODE_U, function() { expect("wheel", 1); }); close();
                api.step(function() { scenario = "MobileInput matrix setup"; disabled(); digits(); api.computer(false); }, 12);
                for (var m = 0; m < families.length; m++) (function(family) {
                    api.step(function() { save(binds.wheelModifier, family.keys[0]); save(binds.menuModifier, family.keys[0]); save(binds.menuKey, KeyCode.i); save(binds.paletteModifier, family.keys[0]); save(binds.paletteKey, KeyCode.o); }, 1);
                    for (var side = 0; side < 2; side++) {
                        mobileChord(family.keys[side].name() + "+digit", family.raw[side], A.KEYCODE_1);
                        mobileChord(family.keys[side].name() + "+editor", family.raw[side], A.KEYCODE_I);
                        mobileChord(family.keys[side].name() + "+palette", family.raw[side], A.KEYCODE_O);
                    }
                })(families[m]);
                api.step(function() { save(binds.wheelModifier, KeyCode.unset); save(binds.wheels[1], KeyCode.u); save(binds.menuModifier, KeyCode.unset); save(binds.paletteModifier, KeyCode.unset); }, 1);
                mobileChord("single wheel key", null, A.KEYCODE_U); mobileChord("single editor key", null, A.KEYCODE_I); mobileChord("single palette key", null, A.KEYCODE_O);
            }
            api.step(function() {
                scenario = "Restore and persist"; mux.removeProcessor(before); mux.removeProcessor(after);
                diag(registryCount === Packages.arc.input.KeyBind.all.size, "no Android-specific or duplicate KeyBind objects added");
                H.restoreBindings(); controls.set("showNumber", previousNumber);
                // Preserve a custom checkpoint for the next independent Android process, then restore the original on the final process.
                if (String(H.stage()) !== "restart-1920") { checkpointAssignments(); H.keyCheckpoint(true); }
            }, 2);
        }
    };
}
