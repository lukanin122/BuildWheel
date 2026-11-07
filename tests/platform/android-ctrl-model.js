"use strict";
// AndroidInput's key queue is modeled; this is not Android/GPG execution or an SDL ordering test.
var KeyCode = Packages.arc.input.KeyCode, realPackages = Packages;
var factory = eval("(function(Core,Vars,OS,menuModule,Packages,Log){\n" + String(bridgeSource) + "\nreturn installAndroidCtrlBridge();})");
function equal(actual, expected, detail) { H.check(String(actual) === String(expected), detail + ": " + actual + " == " + expected); }
function fixture(options) {
    options = options || {}; H.mapping(!!options.fixedLeft, !!options.fixedRight);
    var state = {active: true, queue: [], listeners: [], errors: [], events: []};
    state.vars = {control: {input: {name: "desktop-A"}}};
    var input = {
        getClass: function() { return {getName: function() { return options.backend || "arc.backend.android.AndroidInput"; }, getClassLoader: function() { return {loadClass: function() { return H.mapClass(); }}; }}; },
        addKeyListener: function(listener) { state.listeners.push(listener); },
        onKey: function(view, code, event) {
            for (var i = 0; i < state.listeners.length; i++) if (state.listeners[i].onKey(view, code, event)) return true;
            if (event.getAction() === 0 && event.getRepeatCount() > 0) return false; // Arc ignores held-key repeats before queuing.
            state.queue.push((event.getAction() === 0 ? "down:" : "up:") + H.LegacyMap.getKeyCode(code).name());
            state.events.push(event); return false; // KEY_TYPED is irrelevant to the modifier queue assertions below.
        }
    };
    var packages = {android: {view: {View: {OnKeyListener: H.OnKeyListener}, KeyEvent: H.Event}}, rhino: {Synchronizer: realPackages.rhino.Synchronizer}};
    state.bridge = factory({input: input}, state.vars, {isAndroid: options.android !== false}, {computerInputActive: function() { return state.active; }}, packages, {err: function(message, error) { state.errors.push(String(message) + ": " + String(error)); }});
    state.raw = function(action, code, event) { return input.onKey(null, code, event || new H.Event(action, code)); };
    state.keys = function() { return state.queue.join(","); };
    return state;
}
var f = fixture(); H.check(f.bridge != null, "legacy backend installs bridge: " + f.errors.join("; ")); equal(f.listeners.length, 1, "single listener");
H.check(f.raw(0, 113), "Ctrl down consumed by bridge"); f.raw(0, 8); f.raw(1, 8); H.check(f.raw(1, 113), "Ctrl up consumed");
equal(f.keys(), "down:controlLeft,down:num1,up:num1,up:controlLeft", "same-batch key order preserved");
f.bridge.release(); equal(f.queue.length, 4, "released Ctrl not released twice");
f = fixture(); f.active = false; H.check(!f.raw(0, 113), "MobileInput Ctrl down passes through"); f.raw(1, 113);
equal(f.keys(), "down:unknown,up:unknown", "MobileInput keeps upstream mapping");
f = fixture(); f.raw(0, 113); f.active = false; H.check(f.raw(1, 113), "MobileInput still finishes owned Ctrl");
equal(f.keys(), "down:controlLeft,up:controlLeft", "owned modifier finishes across mode switch");
f = fixture(); f.raw(0, 113); f.raw(0, 114); f.bridge.release();
equal(f.keys(), "down:controlLeft,down:controlRight,up:controlLeft,up:controlRight", "pause releases both pending downs in queue order");
f.bridge.release(); equal(f.queue.length, 4, "pause release idempotent");
f = fixture(); var firstHandler = f.vars.control.input; f.raw(0, 113); f.bridge.release(firstHandler);
equal(f.queue.length, 1, "current handler retains modifier"); f.vars.control.input = {name: "desktop-B"}; f.bridge.release(f.vars.control.input);
equal(f.keys(), "down:controlLeft,up:controlLeft", "new handler cannot inherit owned Ctrl");
f.raw(0, 114); f.bridge.release(f.vars.control.input); equal(f.queue.length, 3, "new handler owns new press");
f.bridge.release(); equal(f.queue[3], "up:controlRight", "explicit release clears current owner");
f = fixture(); f.raw(0, 114); f.bridge.dispose(); H.check(!f.raw(0, 113), "disposed bridge passive");
equal(f.keys(), "down:controlRight,up:controlRight,down:unknown", "dispose queues cleanup before disabling input");
f = fixture({fixedLeft: true, fixedRight: true}); equal(f.bridge, null, "fixed backend bypasses bridge"); equal(f.listeners.length, 0, "fixed backend has no listener");
f = fixture({fixedLeft: true}); f.raw(0, 113); f.raw(1, 113); f.raw(0, 114); f.raw(1, 114);
equal(f.keys(), "down:controlLeft,up:controlLeft,down:controlRight,up:controlRight", "partially fixed backend remaps only missing side");
f = fixture({android: false}); equal(f.bridge, null, "desktop OS skips Android bridge"); equal(f.listeners.length, 0, "desktop has no Android listener");
f = fixture({backend: "arc.mock.MockInput"}); equal(f.bridge, null, "unrecognized backend safely skipped");
f = fixture(); f.raw(0, 8); f.raw(1, 8); f.raw(0, 999); equal(f.keys(), "down:num1,up:num1,down:unknown", "arbitrary keys unchanged");
f = fixture(); var metadata = new H.Event(100, 120, 0, 113, 0, 4096, 4, 29, 7, 257); f.raw(0, 113, metadata);
var mapped = f.events[0]; equal(mapped.getDownTime(), 100, "down time preserved"); equal(mapped.getEventTime(), 120, "event time preserved");
equal(mapped.getMetaState(), 4096, "meta state preserved"); equal(mapped.getDeviceId(), 4, "device preserved"); equal(mapped.getScanCode(), 29, "scan preserved");
equal(mapped.getFlags(), 7, "flags preserved"); equal(mapped.getSource(), 257, "source preserved"); equal(mapped.getKeyCode(), 129, "only code translated");
f.raw(0, 113, new H.Event(100, 130, 0, 113, 2, 4096, 4, 29, 7, 257)); equal(f.queue.length, 1, "repeat retains Arc queue policy");
f.bridge.release(); equal(f.queue.length, 2, "repeat does not lose ownership");
f = fixture(); f.raw(0, 113); H.failNextFullConstructor(); H.check(!f.raw(0, 114), "constructor failure returns input to backend");
equal(f.keys(), "down:controlLeft,up:controlLeft,down:unknown", "failure releases prior owned press then passes original key");
equal(f.errors.length, 1, "failure diagnosed once"); H.check(!f.raw(0, 113), "failed bridge stays passive");
f.bridge.release(); equal(f.queue.length, 4, "failed cleanup does not duplicate releases");
