import arc.input.KeyCode;
import rhino.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;

/** Host-only model: executes the production Ctrl bridge with real Rhino/reflection, no Android SDK or device. */
public final class AndroidCtrlModel {
    private static int assertions;
    private static boolean fixedLeft, fixedRight, failFull;
    public interface OnKeyListener { boolean onKey(Object view, int code, Event event); }
    public static final class LegacyMap {
        public static KeyCode getKeyCode(int code) {
            if (code == 113 && fixedLeft || code == 129) return KeyCode.controlLeft;
            if (code == 114 && fixedRight || code == 130) return KeyCode.controlRight;
            if (code >= 7 && code <= 16) return KeyCode.valueOf("num" + (code - 7));
            return KeyCode.unknown;
        }
    }
    public static final class Event {
        final long downTime, eventTime;
        final int action, code, repeat, meta, device, scan, flags, source;
        public Event(int action, int code) { this(0, 0, action, code, 0, 0, 0, 0, 0, 0, false); }
        public Event(long downTime, long eventTime, int action, int code, int repeat, int meta,
                     int device, int scan, int flags, int source) {
            this(downTime, eventTime, action, code, repeat, meta, device, scan, flags, source, true);
        }
        private Event(long downTime, long eventTime, int action, int code, int repeat, int meta,
                      int device, int scan, int flags, int source, boolean full) {
            if (full && failFull) { failFull = false; throw new IllegalStateException("fixture KeyEvent constructor failure"); }
            this.downTime = downTime; this.eventTime = eventTime; this.action = action; this.code = code;
            this.repeat = repeat; this.meta = meta; this.device = device; this.scan = scan; this.flags = flags; this.source = source;
        }
        public int getAction() { return action; }
        public int getKeyCode() { return code; }
        public long getDownTime() { return downTime; }
        public long getEventTime() { return eventTime; }
        public int getRepeatCount() { return repeat; }
        public int getMetaState() { return meta; }
        public int getDeviceId() { return device; }
        public int getScanCode() { return scan; }
        public int getFlags() { return flags; }
        public int getSource() { return source; }
    }
    public static Class<?> mapClass() { return LegacyMap.class; }
    public static void mapping(boolean left, boolean right) { fixedLeft = left; fixedRight = right; failFull = false; }
    public static void failNextFullConstructor() { failFull = true; }
    public static void check(boolean value, String detail) { assertions++; if (!value) throw new AssertionError(detail); }
    public static void main(String[] args) throws Exception {
        if (args.length != 2) throw new IllegalArgumentException("AndroidCtrlModel <repo> <isolated-output-dir>");
        Path repo = Path.of(args[0]).toAbsolutePath().normalize(), output = Path.of(args[1]).toAbsolutePath().normalize();
        if (output.startsWith(repo)) throw new IllegalArgumentException("Output must be outside repository");
        Files.createDirectories(output);
        String main = Files.readString(repo.resolve("scripts/main.js"), StandardCharsets.UTF_8);
        int start = main.indexOf("    function installAndroidCtrlBridge()"), end = main.indexOf("    androidCtrlBridge = installAndroidCtrlBridge();", Math.max(0, start));
        if (start < 0 || end < start) throw new IllegalStateException("Production Ctrl bridge markers not found");
        Context context = Context.enter();
        String status = "PASS_HOST_ANDROID_CTRL_MODEL";
        Throwable failure = null;
        try {
            context.setLanguageVersion(Context.VERSION_ES6); context.setOptimizationLevel(9);
            Scriptable scope = new ImporterTopLevel(context);
            ScriptableObject.putProperty(scope, "H", new NativeJavaClass(scope, AndroidCtrlModel.class));
            ScriptableObject.putProperty(scope, "bridgeSource", main.substring(start, end));
            context.evaluateString(scope, Files.readString(repo.resolve("tests/platform/android-ctrl-model.js")), "android-ctrl-model.js", 1);
        } catch (Throwable error) { failure = error; status = "FAIL_HOST_ANDROID_CTRL_MODEL"; error.printStackTrace(); }
        finally { Context.exit(); }
        String json = "{\n  \"status\": \"" + status + "\",\n  \"assertions\": " + assertions
            + ",\n  \"androidExecuted\": false,\n  \"scope\": \"Production bridge; real Rhino, JavaAdapter, Synchronizer and reflection; modeled AndroidInput queue and KeyEvent\"\n}\n";
        Files.writeString(output.resolve("android-ctrl-model-result.json"), json, StandardCharsets.UTF_8);
        System.out.println(status + " assertions=" + assertions);
        if (failure != null) System.exit(1);
    }
}
