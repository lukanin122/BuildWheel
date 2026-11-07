"use strict";
// Diagnostic only: real Arc SdlInput/InputEventQueue and unchanged BuildWheel main.
// The post-pump SDL accumulator and already encoded JNI packets are MODELED;
// this is not a native SDL/OS mouse experiment and does not claim F-02 is fixed.
var fixturePath = String(testArguments[1]).replace(/\\/g, "/") + "/tests/platform/startup.js";
var fixtureSource = String(java.nio.file.Files.readString(java.nio.file.Paths.get(fixturePath)));
var fixtureBoundary = fixtureSource.indexOf("// A cast exception is a regression now:");
if (fixtureBoundary < 0) throw new Error("Startup fixture boundary changed");
Packages.rhino.Context.getCurrentContext().evaluateString(this, fixtureSource.substring(0, fixtureBoundary), "reused-startup-fixture.js", 1);
if (startupError != null) throw startupError;
H.assertTrue(nativePrepares === 0, "ClientLoad never prepared the native adapter");

var controls = modules.menu.getControls(), mux = Core.input.getInputMultiplexer();
controls.edgeShift = 0; controls.customArrow = true; controls.showNumber = false; controls.dimMissingMaterials = false;
var east = fixtureBlocks["fixture-copper"], south = fixtureBlocks["fixture-lead"], southeast = fixtureBlocks["fixture-graphite"];
slotApi.setBlock(1, 2, east); slotApi.setBlock(1, 4, south); slotApi.setBlock(1, 3, southeast);
var west = fixtureBlocks["fixture-hidden"]; slotApi.setBlock(1, 6, west);
var aggregate = new Vec2(), reads = [], transitions = [], phase = "idle", records = [];
var fakeAdapter = {
    available: true, active: false,
    begin: function() { this.active = true; aggregate.setZero(); transitions.push("begin"); return true; },
    sample: function(out) { reads.push({phase: phase, dx: aggregate.x, dy: aggregate.y}); out.set(aggregate); aggregate.setZero(); return this.active; },
    end: function() { this.active = false; transitions.push("end"); return true; },
    dispose: function() { this.end(); this.available = false; }
};
modules["sdl-relative"].create = function() { return fakeAdapter; };
inGame = true;

// Invoke the actual encoded-packet handler and drain from the shipped Arc class.
// Arc protocol constants 2/3 and button 1 were checked in the v160.7 JAR; using
// constants avoids initializing the JNI SDL class just to access static fields.
var sdlType = java.lang.Class.forName("arc.backend.sdl.SdlInput");
var handlePacket = sdlType.getDeclaredMethod("handleInput", [java.lang.Class.forName("[I")]); handlePacket.setAccessible(true);
var drainInput = sdlType.getDeclaredMethod("update", []); drainInput.setAccessible(true);
function wire(input, values) {
    var packet = java.lang.reflect.Array.newInstance(java.lang.Integer.TYPE, 64);
    for (var i = 0; i < values.length; i++) packet[i] = values[i];
    handlePacket.invoke(input, [packet]);
}
function motion(input, x, y) { wire(input, [2, x, Core.graphics.getHeight() - y]); }
function button(input, down, x, y) { wire(input, [3, down ? 1 : 0, x, Core.graphics.getHeight() - y, 1]); }
function open() {
    H.pointer(750, 550); Vars.control.input.block = null;
    mux.keyDown(KeyCode.controlLeft); mux.keyDown(KeyCode.num1);
    mux.keyUp(KeyCode.num1); mux.keyUp(KeyCode.controlLeft);
    H.assertTrue(wheel.visible, "test wheel opened");
}
function source(trace) {
    var input = new Packages.arc.backend.sdl.SdlInput();
    input.getInputMultiplexer().addProcessor(0, extend(InputProcessor, {
        mouseMoved: function(x, y) { phase = "mouseMoved"; trace.push([phase, x, y]); return false; },
        touchDragged: function(x, y, p) { phase = "touchDragged"; trace.push([phase, x, y, p]); return false; },
        touchDown: function(x, y, p, b) { phase = "touchDown"; trace.push([phase, x, y, p, String(b)]); return false; },
        touchUp: function(x, y, p, b) { phase = "touchUp"; trace.push([phase, x, y, p, String(b)]); return false; }
    }));
    input.getInputMultiplexer().addProcessor(mux);
    return input;
}
function drain(input) { drainInput.invoke(input, []); H.drain(); }
function stagePoint(dx, dy) {
    return Core.scene.getViewport().project(new Vec2(wheel.x + wheel.getWidth() / 2 + dx, wheel.y + wheel.getHeight() / 2 + dy));
}

// Ordinary mode retains the click's own point even when the global mouse cache
// and the final queued movement already refer to a different position.
controls.relativeMouse = false; controls.clipInner = false; controls.clipOuter = false;
open();
var absoluteTrace = [], absolute = source(absoluteTrace), click = stagePoint(45, -5), later = stagePoint(5, -45);
motion(absolute, Math.round(click.x), Math.round(click.y));
button(absolute, true, Math.round(click.x), Math.round(click.y));
button(absolute, false, Math.round(click.x), Math.round(click.y));
motion(absolute, Math.round(later.x), Math.round(later.y));
H.pointer(Math.round(later.x), Math.round(later.y));
drain(absolute);
H.assertTrue(Vars.control.input.block === east, "ordinary selection uses the click point, not later global coordinates");
H.assertTrue(absoluteTrace[0][0] === "touchDown", "real Arc coalesced the earlier mouseMoved across the click");
H.assertTrue(reads.length === 0, "ordinary control did not sample the modeled relative provider");
records.push({kind: "ordinary", outcome: "correct-east", callbacks: absoluteTrace});

// Both legal SDL histories have identical encoded x/y at SDL's lower-right
// clamp and identical final accumulator (50,50), but different pre-click sectors.
// A prior relative movement can reach this SDL clamp independently of the wheel's
// virtual point; switching wheels recentres that virtual point without resetting SDL.
var modes = [
    {name: "relative-only", outer: false, inner: false, explicit: true},
    {name: "outer", outer: true, inner: false, explicit: false},
    {name: "inner", outer: false, inner: true, explicit: false},
    {name: "both", outer: true, inner: true, explicit: false}
];
for (var m = 0; m < modes.length; m++) for (var drag = 0; drag < 2; drag++) {
    var pair = [];
    for (var history = 0; history < 2; history++) {
        controls.relativeMouse = modes[m].explicit; controls.clipOuter = modes[m].outer; controls.clipInner = modes[m].inner;
        open();
        H.assertTrue(fakeAdapter.active, "mode activates the modeled relative provider: " + modes[m].name);
        var trace = [], input = source(trace), beforeReads = reads.length;
        var cornerX = Core.graphics.getWidth() - 1, cornerY = 1; // JNI flips SDL's H-1 into Arc's y=1.
        motion(input, cornerX, cornerY); button(input, true, cornerX, cornerY);
        if (drag === 0) button(input, false, cornerX, cornerY);
        motion(input, cornerX, cornerY);
        if (drag !== 0) button(input, false, cornerX, cornerY);
        aggregate.set(50, 50); Core.graphics.incrementFrameId();
        H.pointer(cornerX, cornerY); drain(input);
        var actual = Vars.control.input.block;
        H.assertTrue(actual === southeast, "F-02 reproduced: both histories choose the post-pump southeast aggregate");
        H.assertTrue(reads.length === beforeReads + 1, "one destructive accumulator sample per production frame");
        H.assertTrue(!wheel.visible && !fakeAdapter.active, "selection closed wheel and released modeled ownership");
        H.assertTrue(trace[0][0] === (drag === 0 ? "touchDown" : "mouseMoved"), "expected real Arc coalescing/drag callback order");
        var observation = {
            kind: "relative", mode: modes[m].name, afterClickDrag: drag !== 0,
            history: history === 0 ? "(45,5), down, (5,45)" : "(5,45), down, (45,5)",
            expectedSector: history === 0 ? "east" : "south", actualSector: "southeast",
            accumulator: [50, 50], callbacks: trace, sample: reads[reads.length - 1]
        };
        records.push(observation); pair.push(observation);
    }
    H.assertTrue(JSON.stringify(pair[0].callbacks) === JSON.stringify(pair[1].callbacks), "distinct physical histories yield identical real Arc callback payloads");
}

// No SDL edge clamp is needed for this second loss: with a circular limit,
// (+200,0),(-200,0) and the reverse have the same zero net delta / click point,
// but different constrained endpoints. Use the SAME production geometry with
// separate frames as reference, rather than inventing an approximate oracle.
for (var bounded = 1; bounded < modes.length; bounded++) for (var direction = -1; direction <= 1; direction += 2) {
    var expected = direction > 0 ? west : east;
    for (var batched = 0; batched < 2; batched++) {
        controls.relativeMouse = false; controls.clipOuter = modes[bounded].outer; controls.clipInner = modes[bounded].inner;
        open();
        var loopTrace = [], loopInput = source(loopTrace), origin = stagePoint(0, 0);
        var far = stagePoint(200 * direction, 0);
        motion(loopInput, Math.round(far.x), Math.round(far.y));
        if (batched === 0) {
            aggregate.set(200 * direction, 0); Core.graphics.incrementFrameId(); drain(loopInput);
            H.assertTrue(wheel.visible, "reference first motion retains open wheel");
        }
        motion(loopInput, Math.round(origin.x), Math.round(origin.y));
        aggregate.set(batched === 0 ? -200 * direction : 0, 0); Core.graphics.incrementFrameId();
        button(loopInput, true, Math.round(origin.x), Math.round(origin.y));
        button(loopInput, false, Math.round(origin.x), Math.round(origin.y));
        H.pointer(Math.round(origin.x), Math.round(origin.y)); drain(loopInput);
        H.assertTrue(Vars.control.input.block === (batched === 0 ? expected : null), "production geometry preserves ordered path, zero aggregate loses it");
        H.assertTrue(!wheel.visible && !fakeAdapter.active, "bounded reference/batch released modeled provider");
        records.push({kind: "constrained-loop", mode: modes[bounded].name, firstDx: 200 * direction,
            delivery: batched === 0 ? "separate-frames-reference" : "single-pump-zero-sum",
            expectedSector: direction > 0 ? "west" : "east", actualSector: batched === 0 ? (direction > 0 ? "west" : "east") : "cancel",
            callbacks: loopTrace});
    }
}
H.assertTrue(nativePrepares === 0, "no production FFM preparation or native mode call in this model");
Events.fire(new DisposeEvent()); H.drain();
Core.settings.getDataDirectory().child("input-order-observations.json").writeString(JSON.stringify({
    classification: "F02_INFORMATION_LOSS_REPRODUCED", nativeSdlExecuted: false,
    realComponents: ["SdlInput.handleInput", "InputEventQueue", "InputMultiplexer", "unchanged main.js and wheel.js"],
    modeledComponents: ["post-pump SDL accumulator", "encoded JNI packets", "graphics/audio/content"],
    records: records, transitions: transitions
}, null, 2));
H.result("F02_INFORMATION_LOSS_REPRODUCED", "Diagnostic: ordinary control correct; 16 relative histories reproduce east/south -> southeast; 6 constrained paths compared as ordered vs zero-sum batches in unchanged main. Real Arc SdlInput and queue; SDL accumulator is modeled. This is evidence of the limitation, NOT a fixed or native-platform input test.");
