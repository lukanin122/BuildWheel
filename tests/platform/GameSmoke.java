import arc.ApplicationListener;
import arc.Core;
import arc.Events;
import arc.files.Fi;
import arc.scene.Element;
import arc.scene.Group;
import arc.scene.ui.Dialog;
import arc.util.ScreenUtils;
import mindustry.Vars;
import mindustry.desktop.DesktopLauncher;
import mindustry.game.EventType.ClientLoadEvent;
import mindustry.mod.Mods.LoadedMod;
import mindustry.ui.fragments.MenuFragment.MenuButton;

import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.concurrent.*;

/**
 * Starts the actual game and unmodified mod with a native SDL/OpenGL window.
 * No mock Vars, Input, GL, assets, mod loader, JS loader, widgets or renderer.
 * Requires -Dmindustry.data.dir=<disposable-profile> and a mod copy in profile/mods.
 * CLI: GameSmoke <output-dir> [seconds-of-real-editor-rendering=3]
 */
public final class GameSmoke {
    static Path output, profile;
    static volatile String stage = "PRE_CLIENTLOAD";
    static volatile String failure;
    static volatile boolean rendered, launcherReturned, nativeWindowConfirmed;
    static volatile int renderedFrames, nodes, processors;
    static volatile long firstEditorFrame, finalFrame;
    static double renderSeconds;
    static String glVersion = "unavailable", appClass = "unavailable";
    static Dialog editor;

    static MenuButton findMenuButton(Iterable<MenuButton> buttons, String title) {
        if (buttons == null) return null;
        for (MenuButton button : buttons) {
            if (title.equals(button.text)) return button;
            MenuButton nested = findMenuButton(button.submenu, title);
            if (nested != null) return nested;
        }
        return null;
    }

    static int countNodes(Element element) {
        int count = 1;
        if (element instanceof Group group) {
            for (Element child : group.getChildren()) count += countNodes(child);
        }
        return count;
    }

    static void startEditorProbe() {
        try {
            stage = "CLIENTLOAD_CALLBACKS_COMPLETE";
            LoadedMod mod = Vars.mods.getMod("buildwheel");
            if (mod == null || !mod.enabled() || mod.hasContentErrors())
                throw new IllegalStateException("BuildWheel missing, disabled, or has content errors: " + mod);
            Path actualProfile = Core.settings.getDataDirectory().file().toPath().toAbsolutePath().normalize();
            if (!actualProfile.equals(profile))
                throw new IllegalStateException("Game escaped disposable profile: " + actualProfile);
            appClass = Core.app.getClass().getName();
            if (!appClass.equals("arc.backend.sdl.SdlApplication"))
                throw new IllegalStateException("Unexpected native backend: " + appClass);
            glVersion = String.valueOf(Core.graphics.getGLVersion());
            nativeWindowConfirmed = true;
            String title = Core.bundle.get("buildwheel.menu.radial-title");
            MenuButton button = findMenuButton(Vars.ui.menufrag.desktopButtons, title);
            if (button == null) throw new IllegalStateException("BuildWheel database entry was not registered");
            stage = "OPENING_EDITOR";
            button.runnable.run();
            editor = Core.scene.getDialog();
            if (editor == null || editor.find("buildwheel-preview") == null)
                throw new IllegalStateException("Radial editor or mannequin was not created");
            if (editor.find("buildwheel-control-dimMissingMaterials") == null)
                throw new IllegalStateException("Factory global settings were not built");
            processors = Core.input.getInputMultiplexer().getProcessors().size;
            firstEditorFrame = Core.graphics.getFrameId();
            final long openedNanos = System.nanoTime();
            stage = "RENDERING_EDITOR";
            Core.app.addListener(new ApplicationListener() {
                @Override public void update() {
                    if (failure != null || rendered) return;
                    try {
                        if (!editor.isShown()) throw new IllegalStateException("Editor disappeared during render test");
                        renderedFrames++;
                        if (renderedFrames >= 3 && System.nanoTime() - openedNanos >= renderSeconds * 1_000_000_000d) {
                            nodes = countNodes(editor);
                            finalFrame = Core.graphics.getFrameId();
                            if (nodes < 20 || finalFrame <= firstEditorFrame)
                                throw new IllegalStateException("No meaningful real UI frames were produced");
                            // Called after the actual ClientLauncher has drawn this frame.
                            ScreenUtils.saveScreenshot(new Fi(output.resolve("native-editor.png").toFile()));
                            rendered = true;
                            stage = "EDITOR_RENDERED_REQUESTING_NORMAL_EXIT";
                            Core.app.exit();
                        }
                    } catch (Throwable error) { fail(error); }
                }
            });
        } catch (Throwable error) { fail(error); }
    }

    static void fail(Throwable error) {
        failure = error.toString();
        error.printStackTrace();
        writeResult("GAME_OR_MOD_FAILURE");
        if (Core.app != null) Core.app.exit();
    }

    static String quote(String text) {
        StringBuilder escaped = new StringBuilder("\"");
        for (char c : String.valueOf(text).toCharArray()) {
            if (c == '\\' || c == '"') escaped.append('\\').append(c);
            else if (c < 32) escaped.append(String.format("\\u%04x", (int)c));
            else escaped.append(c);
        }
        return escaped.append('"').toString();
    }

    static synchronized void writeResult(String status) {
        try {
            String json = "{\n  \"status\": " + quote(status)
                + ",\n  \"stage\": " + quote(stage)
                + ",\n  \"os\": " + quote(System.getProperty("os.name"))
                + ",\n  \"arch\": " + quote(System.getProperty("os.arch"))
                + ",\n  \"java\": " + quote(System.getProperty("java.version"))
                + ",\n  \"appClass\": " + quote(appClass)
                + ",\n  \"glVersion\": " + quote(glVersion)
                + ",\n  \"profile\": " + quote(String.valueOf(profile))
                + ",\n  \"nativeWindowAndContextConfirmed\": " + nativeWindowConfirmed
                + ",\n  \"mockGraphics\": false,\n  \"physicalMouseTested\": false"
                + ",\n  \"editorFrames\": " + renderedFrames
                + ",\n  \"firstEditorFrame\": " + firstEditorFrame
                + ",\n  \"finalFrame\": " + finalFrame
                + ",\n  \"editorNodes\": " + nodes
                + ",\n  \"inputProcessors\": " + processors
                + ",\n  \"launcherReturned\": " + launcherReturned
                + ",\n  \"failure\": " + quote(failure) + "\n}\n";
            Files.writeString(output.resolve("game-smoke-result.json"), json, StandardCharsets.UTF_8);
            System.out.println("GAME_SMOKE_RESULT " + status + " stage=" + stage);
        } catch (Exception error) { error.printStackTrace(); }
    }

    public static void main(String[] args) throws Exception {
        if (args.length < 1) throw new IllegalArgumentException("GameSmoke <output-dir> [render-seconds=3]");
        output = Path.of(args[0]).toAbsolutePath().normalize();
        Files.createDirectories(output);
        String explicitProfile = System.getProperty("mindustry.data.dir");
        if (explicitProfile == null || explicitProfile.isBlank())
            throw new IllegalArgumentException("Refusing to launch without an explicit disposable mindustry.data.dir");
        profile = Path.of(explicitProfile).toAbsolutePath().normalize();
        if (!Files.isDirectory(profile.resolve("mods")))
            throw new IllegalArgumentException("Disposable profile has no prepared mods directory");
        renderSeconds = args.length > 1 ? Double.parseDouble(args[1]) : 3;
        if (!Double.isFinite(renderSeconds) || renderSeconds < 1 || renderSeconds > 30)
            throw new IllegalArgumentException("Render seconds outside 1..30");
        System.setProperty("nodiscord", "true");
        writeResult("STARTING");
        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            if (!launcherReturned) writeResult("ABNORMAL_JVM_EXIT");
        }, "buildwheel-smoke-shutdown-diagnostics"));
        ScheduledExecutorService watchdog = Executors.newSingleThreadScheduledExecutor(runnable -> {
            Thread thread = new Thread(runnable, "buildwheel-smoke-watchdog"); thread.setDaemon(true); return thread;
        });
        watchdog.schedule(() -> {
            failure = "Wall-clock limit of 120s exceeded";
            writeResult("TIMEOUT_" + stage);
            Runtime.getRuntime().halt(124);
        }, 120, TimeUnit.SECONDS);
        // Posting is necessary: our listener is registered before the mod's own
        // listener, so direct checks here would run before BuildWheel initializes.
        Events.on(ClientLoadEvent.class, event -> Core.app.post(GameSmoke::startEditorProbe));
        try {
            DesktopLauncher.main(new String[0]);
            launcherReturned = true;
            if (failure == null && rendered) {
                stage = "NATIVE_APP_DISPOSED";
                writeResult("FULL_GAME_CLIENTLOAD_EDITOR_RENDERED");
            } else {
                if (failure == null) failure = "Launcher returned before editor rendered";
                writeResult("GAME_OR_INFRASTRUCTURE_FAILURE");
                System.exit(1);
            }
        } catch (Throwable error) {
            launcherReturned = true;
            failure = error.toString(); error.printStackTrace();
            writeResult("GAME_OR_INFRASTRUCTURE_FAILURE");
            System.exit(1);
        } finally { watchdog.shutdownNow(); }
    }
}
