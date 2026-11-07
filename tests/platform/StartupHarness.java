import arc.*;
import arc.files.Fi;
import arc.graphics.GL20;
import arc.mock.*;
import arc.scene.Scene;
import arc.util.viewport.ScreenViewport;
import rhino.*;

import java.io.InputStream;
import java.lang.reflect.Proxy;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.nio.file.Files;
import java.util.*;
import java.util.zip.ZipFile;

/**
 * Runs the unmodified mod module graph with the game's Rhino and Arc widgets.
 * Graphics/audio/window state are fixtures; this is not a native SDL or game-play test.
 * All Settings writes go to the explicitly supplied disposable directory.
 * CLI: StartupHarness <desktop.jar> <repo> <data-dir> [scenario] [locale]
 */
public final class StartupHarness {
    static Context context;
    static Scriptable scope;
    static Path scripts, dataDirectory;
    static String scenario;
    static int assertions;
    static boolean resultWritten;

    public static final class App extends MockApplication {
        final arc.struct.Seq<ApplicationListener> listeners = new arc.struct.Seq<>();
        final ArrayDeque<Runnable> pending = new ArrayDeque<>();
        public arc.struct.Seq<ApplicationListener> getListeners() { return listeners; }
        public void post(Runnable task) { pending.add(task); }
        public long getWindow() { return 0L; }
        public void drain() {
            for (int n = 0; !pending.isEmpty(); n++) {
                if (n > 10000) throw new IllegalStateException("Application.post loop");
                pending.removeFirst().run();
            }
        }
    }

    public static final class Graphics extends MockGraphics {
        public int width = 1500, height = 1100;
        public void setCursor(arc.Graphics.Cursor cursor) { }
        public arc.Graphics.Cursor newCursor(arc.graphics.Pixmap pixmap, int x, int y) { return null; }
        public int getWidth() { return width; }
        public int getHeight() { return height; }
        public int getBackBufferWidth() { return width; }
        public int getBackBufferHeight() { return height; }
        public float getDeltaTime() { return 1f / 60; }
    }

    public static final class Input extends MockInput {
        public int x = 750, y = 550;
        public int mouseX() { return x; }
        public int mouseY() { return y; }
        public int mouseX(int pointer) { return x; }
        public int mouseY(int pointer) { return y; }
    }

    public static final class Texture extends arc.graphics.Texture {
        public Texture() { super(); width = 8; height = 8; }
    }

    public static final class Batch extends arc.graphics.g2d.Batch {
        protected void draw(arc.graphics.Texture texture, float[] vertices, int offset, int count) { }
        protected void draw(arc.graphics.g2d.TextureRegion region, float x, float y,
                            float ox, float oy, float width, float height, float rotation) { }
        protected void flush() { }
    }

    public static void ui() {
        Core.batch = new Batch();
        arc.graphics.g2d.TextureRegion region = new arc.graphics.g2d.TextureRegion(new Texture());
        Core.atlas = new arc.graphics.g2d.TextureAtlas();
        Core.atlas.addRegion("white", region);
        Core.atlas.addRegion("error", region);
        Core.atlas.setErrorRegion("error");
        mindustry.gen.Tex.whiteui = new arc.scene.style.TextureRegionDrawable(region);
        arc.graphics.g2d.Font.FontData data = new arc.graphics.g2d.Font.FontData();
        data.lineHeight = 22; data.capHeight = 17; data.ascent = 0;
        data.descent = -4; data.down = -22; data.spaceXadvance = 9;
        for (int c = 32; c < 127; c++) {
            arc.graphics.g2d.Font.Glyph glyph = new arc.graphics.g2d.Font.Glyph();
            glyph.id = c; glyph.width = 9; glyph.height = 17; glyph.xadvance = 10;
            data.setGlyph(c, glyph);
        }
        data.missingGlyph = data.getGlyph('?');
        arc.graphics.g2d.Font font = new arc.graphics.g2d.Font(data, region, false);
        arc.scene.ui.Label.LabelStyle style = new arc.scene.ui.Label.LabelStyle(font, arc.graphics.Color.white);
        Core.scene.addStyle(arc.scene.ui.Label.LabelStyle.class, style);
        mindustry.ui.Styles.outlineLabel = style;
    }

    public static void assertTrue(boolean value, String message) {
        assertions++;
        if (!value) throw new AssertionError(message);
    }
    public static void log(Object value) { System.out.println(String.valueOf(value)); }
    public static void pointer(int x, int y) { ((Input) Core.input).x = x; ((Input) Core.input).y = y; }
    public static void drain() { ((App) Core.app).drain(); }
    public static void pause() { for (ApplicationListener l : Core.app.getListeners().copy()) l.pause(); }
    public static void resume() { for (ApplicationListener l : Core.app.getListeners().copy()) l.resume(); }
    public static void scene() {
        Core.scene = new Scene(new ScreenViewport());
        Core.scene.resize(Core.graphics.getWidth(), Core.graphics.getHeight());
    }

    public static Object loadModule(String name, Function require) throws Exception {
        Path file = scripts.resolve(name.endsWith(".js") ? name : name + ".js").normalize();
        if (!file.startsWith(scripts)) throw new IllegalArgumentException("Module outside scripts: " + name);
        String body = "(function(exports, require, module){\n" + Files.readString(file) + "\n;return module.exports;})";
        Function factory = (Function) context.evaluateString(scope, body, file.toString(), 1);
        Scriptable exports = context.newObject(scope), module = context.newObject(scope);
        ScriptableObject.putProperty(module, "exports", exports);
        return factory.call(context, scope, scope, new Object[]{exports, require, module});
    }

    public static void result(String status, String detail) throws Exception {
        String json = "{\n  \"status\": " + quote(status) + ",\n  \"scenario\": " + quote(scenario)
            + ",\n  \"os\": " + quote(System.getProperty("os.name"))
            + ",\n  \"arch\": " + quote(System.getProperty("os.arch"))
            + ",\n  \"java\": " + quote(System.getProperty("java.version"))
            + ",\n  \"assertions\": " + assertions
            + ",\n  \"nativeSdlExecuted\": false,\n  \"graphicsAudio\": \"mock\",\n  \"detail\": " + quote(detail) + "\n}\n";
        Files.writeString(dataDirectory.resolve("startup-result.json"), json, StandardCharsets.UTF_8);
        resultWritten = true;
        System.out.println("STARTUP_RESULT " + status + " scenario=" + scenario + " assertions=" + assertions);
    }

    private static String quote(String value) {
        StringBuilder escaped = new StringBuilder("\"");
        for (char c : value.toCharArray()) {
            if (c == '\\' || c == '\"') escaped.append('\\').append(c);
            else if (c < 32) escaped.append(String.format("\\u%04x", (int) c));
            else escaped.append(c);
        }
        return escaped.append('"').toString();
    }

    public static void main(String[] args) throws Exception {
        if (args.length < 3) throw new IllegalArgumentException(
            "StartupHarness <desktop.jar> <repo> <data-dir> [scenario] [locale]");
        Path repository = Path.of(args[1]).toAbsolutePath().normalize();
        scripts = repository.resolve("scripts");
        dataDirectory = Path.of(args[2]).toAbsolutePath().normalize();
        if (dataDirectory.startsWith(repository)) throw new IllegalArgumentException("Data directory must be outside repository");
        Files.createDirectories(dataDirectory);
        scenario = args.length > 3 ? args[3] : "factory";
        Core.app = new App(); Core.graphics = new Graphics(); Core.input = new Input();
        Core.files = new MockFiles(); Core.settings = new Settings();
        Core.settings.setAutosave(false);
        Core.settings.setDataDirectory(new Fi(dataDirectory.toFile()));
        Core.gl = Core.gl20 = (GL20) Proxy.newProxyInstance(StartupHarness.class.getClassLoader(),
            new Class<?>[]{GL20.class}, (proxy, method, values) -> {
                Class<?> type = method.getReturnType();
                if (type == boolean.class) return false;
                if (type == int.class) return 0;
                if (type == float.class) return 0f;
                if (type == long.class) return 0L;
                return null;
            });
        context = Context.enter();
        try {
            context.setLanguageVersion(Context.VERSION_ES6);
            context.setOptimizationLevel(9);
            scope = new ImporterTopLevel(context);
            ScriptableObject.putProperty(scope, "H", new NativeJavaClass(scope, StartupHarness.class));
            ScriptableObject.putProperty(scope, "testArguments", context.newArray(scope, Arrays.copyOf(args, args.length, Object[].class)));
            try (ZipFile jar = new ZipFile(args[0]);
                 InputStream stream = jar.getInputStream(jar.getEntry("scripts/global.js"))) {
                context.evaluateString(scope, new String(stream.readAllBytes(), StandardCharsets.UTF_8), "scripts/global.js", 1);
            }
            Path test = repository.resolve("tests/platform/startup.js");
            context.evaluateString(scope, Files.readString(test), test.toString(), 1);
            if (!resultWritten) throw new IllegalStateException("Script did not record a classified result");
        } catch (Throwable error) {
            error.printStackTrace();
            result("UNEXPECTED_FAILURE", String.valueOf(error));
            System.exit(1);
        } finally {
            Context.exit();
        }
    }
}
