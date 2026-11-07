#!/usr/bin/env python3
"""Actual target-OS CI orchestration. Test data and native diagnostics live outside the checkout."""
import argparse, hashlib, json, os, pathlib, platform, shutil, signal, subprocess, sys, time, urllib.request, zipfile

JAR_URL = "https://github.com/Anuken/Mindustry/releases/download/v160.7/Mindustry.jar"
JAR_SHA = "36d94941a1639478ad1d9be25a9d802c6f77552f400c6da0338b7b019f63a0d1"
ROOT = pathlib.Path(__file__).resolve().parents[2]
args = argparse.ArgumentParser()
args.add_argument("--output", required=True)
args.add_argument("--prepare-only", action="store_true")
ARGS = args.parse_args()
OUT = pathlib.Path(ARGS.output).resolve()
OUT.mkdir(parents=True, exist_ok=True)
CLASSES = OUT / "classes"
JAR = OUT / "Mindustry.jar"
RESULTS = []
SERVICES = []
IS_MAC = platform.system() == "Darwin"
IS_LINUX = platform.system() == "Linux"

def save(path, value):
    path = pathlib.Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")

def capture(command, logfile, env=None, timeout=60, cwd=None):
    logfile = pathlib.Path(logfile)
    logfile.parent.mkdir(parents=True, exist_ok=True)
    started = time.monotonic()
    with logfile.open("w", encoding="utf-8") as stream:
        try:
            p = subprocess.Popen([str(x) for x in command], cwd=cwd or ROOT, env=env, stdout=stream, stderr=subprocess.STDOUT, start_new_session=True)
            try:
                code = p.wait(timeout=timeout)
                return {"exit": code, "seconds": round(time.monotonic()-started, 2)}
            except subprocess.TimeoutExpired:
                os.killpg(p.pid, signal.SIGKILL)
                p.wait()
                return {"exit": -999, "seconds": round(time.monotonic()-started, 2), "timeout": True}
        except OSError as exc:
            stream.write(str(exc))
            return {"exit": -998, "exception": str(exc)}

def read_result(path):
    try:
        return json.loads(pathlib.Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}

def record(name, group, execution, result, note=""):
    classification = result.get("classification", result.get("status", result.get("outcome", "")))
    if not classification:
        classification = "INFRASTRUCTURE_TIMEOUT" if execution.get("timeout") else "INFRASTRUCTURE_NO_RESULT"
    value = {"test": name, "group": group, "classification": classification, "execution": execution, "result": result, "note": note}
    RESULTS.append(value)
    save(OUT / "results.json", RESULTS)
    print(name, classification, execution, flush=True)

def environment(case):
    env = os.environ.copy()
    home = case / "home"
    home.mkdir(parents=True, exist_ok=True)
    env.update({"HOME": str(home), "XDG_DATA_HOME": str(case / "xdg"), "MINDUSTRY_DATA_DIR": str(case / "profile")})
    return env

def java_command(main, case, *app_args, extra_flags=()):
    cmd = ["java", "-Xms16m", "-Xmx768m", "--enable-native-access=ALL-UNNAMED",
           "-Duser.home=" + str(case / "home"), "-Djava.io.tmpdir=" + str(case / "tmp"),
           "-XX:ErrorFile=" + str(case / "hs_err_pid%p.log")]
    if IS_MAC:
        cmd.append("-XstartOnFirstThread")
    cmd.extend(extra_flags)
    (case / "tmp").mkdir(parents=True, exist_ok=True)
    cmd.extend(["-cp", str(CLASSES) + os.pathsep + str(JAR), main])
    cmd.extend(str(x) for x in app_args)
    return cmd

def start_service(command, name, env):
    log = (OUT / (name + ".log")).open("w", encoding="utf-8")
    p = subprocess.Popen(command, env=env, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
    SERVICES.append((p, log))
    return p

def stop_service(process):
    if process.poll() is None:
        os.killpg(process.pid, signal.SIGTERM)
        try: process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL)
            process.wait()

def setup_graphics():
    env = os.environ.copy()
    if IS_LINUX:
        env.update({"DISPLAY": ":97", "LIBGL_ALWAYS_SOFTWARE": "1", "GALLIUM_DRIVER": "llvmpipe"})
        runtime = OUT / "runtime"
        runtime.mkdir(mode=0o700, exist_ok=True)
        runtime.chmod(0o700)
        env["XDG_RUNTIME_DIR"] = str(runtime)
        p = start_service(["Xvfb", ":97", "-screen", "0", "1600x1000x24", "+extension", "GLX", "+extension", "RANDR", "+render", "-noreset"], "xvfb", env)
        ready = False
        for _ in range(80):
            if p.poll() is not None: break
            if subprocess.run(["xdpyinfo"], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0:
                ready = True
                break
            time.sleep(.1)
        if not ready: raise RuntimeError("Xvfb failed to create a usable X11 display; see xvfb.log")
        start_service(["openbox"], "openbox", env)
        time.sleep(.8)
        capture(["glxinfo", "-B"], OUT / "glxinfo.log", env)
        capture(["xinput", "list", "--long"], OUT / "xinput-devices.log", env)
        start_service(["stdbuf", "-oL", "xinput", "test-xi2", "--root"], "xinput-events", env)
        return env
    if IS_MAC:
        capture(["sh", "-c", "printf 'show State:/Users/ConsoleUser\\n' | scutil"], OUT / "console-user.log")
        capture(["launchctl", "print", "gui/" + str(os.getuid())], OUT / "launchctl-gui.log")
        capture(["system_profiler", "SPDisplaysDataType"], OUT / "displays.log")
        result = capture(["swiftc", "-O", str(ROOT / "tests/platform/Pointer.swift"), "-o", str(OUT / "pointer")], OUT / "swift-compile.log", timeout=120)
        if result["exit"] != 0:
            print("Swift pointer helper unavailable; native tests still run and record no movement", flush=True)
        return env
    raise RuntimeError("This workflow is restricted to real Linux or macOS")

def nested_wayland(base_env):
    env = dict(base_env)
    env["WAYLAND_DISPLAY"] = "buildwheel-wayland"
    socket = pathlib.Path(env["XDG_RUNTIME_DIR"]) / env["WAYLAND_DISPLAY"]
    for renderer in ["gl", "pixman"]:
        if socket.exists():
            # Only our own compositor socket, after its process has exited.
            socket.unlink()
        p = start_service(["weston", "--backend=x11", "--renderer=" + renderer, "--no-config",
                           "--shell=kiosk-shell.so", "--idle-time=0", "--socket=" + env["WAYLAND_DISPLAY"],
                           "--width=1280", "--height=900"], "weston-" + renderer, env)
        for _ in range(100):
            if p.poll() is not None: break
            if socket.exists():
                result = capture(["wayland-info"], OUT / "wayland-info.log", env, timeout=10)
                if result["exit"] == 0:
                    env["MINDUSTRY_FORCE_WAYLAND"] = "1"
                    env["SDL_VIDEODRIVER"] = "wayland"
                    save(OUT / "wayland-environment.json", {"renderer": renderer, "socket": str(socket), "input": "XTest -> real Weston X11 backend -> actual Wayland protocol -> SDL"})
                    return env
                break
            time.sleep(.1)
        stop_service(p)
    return None

def x_window(env, wayland):
    pattern = "^Weston Compositor" if wayland else "^BuildWheel isolated native probe$"
    p = subprocess.run(["xdotool", "search", "--name", pattern], env=env, capture_output=True, text=True)
    lines = p.stdout.splitlines()
    return lines[-1] if p.returncode == 0 and lines else None

def inject(env, proc, case, mode, wayland=False):
    logfile = case / "input-injection.jsonl"
    try:
        if IS_MAC and (OUT / "pointer").exists():
            result = subprocess.run([str(OUT / "pointer"), str(proc.pid), mode, str(case / "probe-phase.json")], env=env, capture_output=True, text=True, timeout=8)
            value = {"source": "CoreGraphics synthetic HID", "mode": mode, "exit": result.returncode, "stdout": result.stdout[-4000:], "stderr": result.stderr[-1000:]}
        elif IS_LINUX:
            window = x_window(env, wayland)
            if window is None: return
            commands = []
            if mode == "prepare":
                commands = [["xdotool", "windowactivate", "--sync", window],
                            ["xdotool", "mousemove", "--window", window, "400", "300"],
                            ["xdotool", "click", "1"]]
            else:
                for dx, dy in [(24,8),(-12,-4),(16,6),(-28,-10)]:
                    commands.append(["xdotool", "mousemove_relative", "--", str(dx), str(dy)])
            values = []
            for command in commands:
                r = subprocess.run(command, env=env, capture_output=True, text=True, timeout=4)
                values.append({"command": command, "exit": r.returncode, "stderr": r.stderr[-500:]})
                if mode != "prepare": time.sleep(.04)
            value = {"source": "XTest relative -> Weston -> Wayland" if wayland else "XTest relative -> X11", "mode": mode, "window": window, "calls": values}
        else: return
        with logfile.open("a", encoding="utf-8") as stream:
            value["timestamp"] = time.time()
            stream.write(json.dumps(value) + "\n")
    except Exception as exc:
        with logfile.open("a", encoding="utf-8") as stream:
            stream.write(json.dumps({"injectionError": str(exc)}) + "\n")

def native_case(name, base_env, scenario="normal", wayland=False, system_sdl=False, raw_sdl=False):
    case = OUT / name
    case.mkdir(exist_ok=True)
    env = environment(case)
    env.update({k: v for k, v in base_env.items() if k in {"DISPLAY","LIBGL_ALWAYS_SOFTWARE","GALLIUM_DRIVER","XDG_RUNTIME_DIR","WAYLAND_DISPLAY","MINDUSTRY_FORCE_WAYLAND","SDL_VIDEODRIVER"}})
    if IS_LINUX and not wayland: env["SDL_VIDEODRIVER"] = "x11"
    flags = ["-DSDL2_STATIC=1"] if system_sdl else []
    if raw_sdl: flags.append("-Dbuildwheel.probe.raw-sdl=true")
    command = java_command("NativeProbe", case, JAR, ROOT, case, scenario, "3", extra_flags=flags)
    save(case / "launch.json", {"command": command, "environment": {k: env.get(k) for k in ["DISPLAY","WAYLAND_DISPLAY","MINDUSTRY_FORCE_WAYLAND","SDL_VIDEODRIVER","XDG_RUNTIME_DIR"]}, "systemSDL": system_sdl})
    started = time.monotonic()
    with (case / "process.log").open("w", encoding="utf-8") as log:
        p = subprocess.Popen(command, cwd=case, env=env, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
        prepared = False
        last_motion = 0
        timed_out = False
        while p.poll() is None:
            now = time.monotonic()
            if now-started > 100:
                os.killpg(p.pid, signal.SIGKILL)
                p.wait()
                timed_out = True
                break
            phase = read_result(case / "probe-phase.json").get("phase")
            if not prepared and (case / "probe-phase.json").exists():
                inject(env, p, case, "prepare", wayland)
                prepared = True
            if phase == "sampling" and (case / "relative-ready.json").exists() and now-last_motion > .8:
                inject(env, p, case, "motion", wayland)
                last_motion = now
            time.sleep(.1)
        execution = {"exit": p.wait(), "seconds": round(time.monotonic()-started,2), "timeout": timed_out}
    report = read_result(case / "native-probe-result.json")
    record(name, "REAL_SDL_FFM_WITH_GRAPHICS_FACADE" if raw_sdl else "REAL_NATIVE_COMPONENT", execution, report,
           "Actual SDL window/context/events and FFM; mock graphics dimensions bypass Arc GLEW only in this standalone component test, not in the game" if raw_sdl else "Synthetic OS input through actual SDL; no physical-device or whole-mod certification")
    if IS_LINUX:
        capture(["xprop", "-root", "_NET_ACTIVE_WINDOW"], case / "x-focus-after.log", base_env, timeout=5)

def game_smoke(name, base_env, wayland=False, system_sdl=False):
    case = OUT / name
    profile = case / "profile"
    target = profile / "mods/BuildWheel"
    target.mkdir(parents=True, exist_ok=True)
    lock = read_result(ROOT / "tests/platform/source-lock.json")
    for rel in lock["files"]:
        dst = target / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(ROOT / rel, dst)
    env = environment(case)
    env.update({k: v for k, v in base_env.items() if k in {"DISPLAY","LIBGL_ALWAYS_SOFTWARE","GALLIUM_DRIVER","XDG_RUNTIME_DIR","WAYLAND_DISPLAY","MINDUSTRY_FORCE_WAYLAND","SDL_VIDEODRIVER"}})
    if IS_LINUX and not wayland: env["SDL_VIDEODRIVER"] = "x11"
    flags = ["-Dmindustry.data.dir=" + str(profile), "-Dnodiscord=true"]
    if system_sdl: flags.append("-DSDL2_STATIC=1")
    command = java_command("GameSmoke", case, case, "3", extra_flags=flags)
    execution = capture(command, case / "process.log", env=env, cwd=case, timeout=150)
    record(name, "REAL_FULL_GAME_SMOKE", execution, read_result(case / "game-smoke-result.json"),
           "Actual DesktopLauncher, unmodified BuildWheel, native GL and real assets; default editor only")

def startup_tests():
    for scenario, locale in [("factory","en"),("factory","ru"),("relative-saved","en"),
                             ("malformed-block","en"),("malformed-block-restart","en"),
                             ("malformed-scale","en"),("malformed-scale-restart","en")]:
        name = "startup-" + scenario + "-" + locale
        data_name = scenario.replace("-restart", "") if "malformed" in scenario else scenario + "-" + locale
        data = OUT / ("startup-data-" + data_name)
        data.mkdir(exist_ok=True)
        env = environment(data)
        execution = capture(java_command("StartupHarness", data, JAR, ROOT, data, scenario, locale), OUT / (name + ".log"), env=env, timeout=90)
        result = read_result(data / "startup-result.json")
        save(OUT / (name + ".json"), result)
        record(name, "REAL_JVM_MOCK_GRAPHICS_STARTUP", execution, result, "Real target JVM/Rhino/widgets, mocked window/graphics/audio; not native-game proof")

def setup():
    expected = os.environ.get("EXPECTED_MACHINE")
    if expected and platform.machine() != expected: raise RuntimeError("Wrong runner CPU: " + platform.machine() + " expected " + expected)
    save(OUT / "host.json", {"system": platform.system(), "release": platform.release(), "machine": platform.machine(), "platform": platform.platform(),
                             "label": os.environ.get("PLATFORM_LABEL"), "run": os.environ.get("GITHUB_RUN_ID"), "commit": os.environ.get("GITHUB_SHA")})
    lock = read_result(ROOT / "tests/platform/source-lock.json")
    observed = {}
    for rel, sha in lock["files"].items():
        digest = hashlib.sha256((ROOT / rel).read_bytes()).hexdigest()
        if digest != sha: raise RuntimeError("Production source differs from locked main: " + rel)
        observed[rel] = digest
    save(OUT / "verified-production-hashes.json", observed)
    if not JAR.exists() or hashlib.sha256(JAR.read_bytes()).hexdigest() != JAR_SHA:
        print("Downloading official Mindustry v160.7", flush=True)
        for attempt in range(3):
            try:
                urllib.request.urlretrieve(JAR_URL, JAR)
                if hashlib.sha256(JAR.read_bytes()).hexdigest() != JAR_SHA: raise RuntimeError("Official JAR hash mismatch")
                break
            except Exception:
                if attempt == 2: raise
                time.sleep(2 + attempt)
    natives = {}
    with zipfile.ZipFile(JAR) as jar:
        for name in ["libsdl-arc64.so","libSDL2.so","libsdl-arc64.dylib","libsdl-arcarm64.dylib"]:
            natives[name] = {"size": jar.getinfo(name).file_size, "sha256": hashlib.sha256(jar.read(name)).hexdigest()}
    save(OUT / "native-library-hashes.json", natives)
    capture(["java","-XshowSettings:properties","-version"], OUT / "java-version.log")
    CLASSES.mkdir(exist_ok=True)
    sources = sorted(str(x) for x in (ROOT / "tests/platform").glob("*.java"))
    compiled = capture(["javac","-cp",str(JAR),"-d",str(CLASSES)] + sources, OUT / "javac.log", timeout=120)
    if compiled["exit"] != 0: raise RuntimeError("Java test infrastructure compilation failed; inspect javac.log")

def summarize():
    lines = ["# BuildWheel platform compatibility", "", "Runner: " + platform.platform(), "", "| Test | Evidence | Classification |", "|---|---|---|"]
    for r in RESULTS:
        lines.append("| " + r["test"] + " | " + r["group"] + " | " + str(r["classification"]) + " |")
    lines += ["", "A successful GitHub job is not whole-platform certification. Zero received deltas are inconclusive.",
              "Expected malformed-settings failures and forced-warp policy defects are retained as findings; they are not fixed here.",
              "Only the test branch contains this infrastructure. Production files are SHA-256 checked against main.", ""]
    text = "\n".join(lines)
    (OUT / "SUMMARY.md").write_text(text, encoding="utf-8")
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as stream: stream.write(text)

try:
    setup()
    if not ARGS.prepare_only:
        startup_tests()
        graphics = setup_graphics()
        native_case("native-backend-only", graphics, "backend-only")
        native_case("native-normal", graphics)
        native_case("native-forced-warp", graphics, "forced-warp")
        if IS_LINUX:
            native_case("native-x11-system-sdl", graphics, system_sdl=True)
            wayland = nested_wayland(graphics)
            if wayland is None:
                record("native-wayland", "REAL_NATIVE_COMPONENT", {"exit":2}, {"classification":"INFRASTRUCTURE_WESTON_UNAVAILABLE"})
            else:
                native_case("native-wayland-backend-only", wayland, "backend-only", wayland=True)
                native_case("native-wayland-normal", wayland, wayland=True)
                native_case("native-wayland-forced-warp", wayland, "forced-warp", wayland=True)
                native_case("native-wayland-system-backend-only", wayland, "backend-only", wayland=True, system_sdl=True)
                native_case("native-wayland-system-normal", wayland, wayland=True, system_sdl=True)
                native_case("native-wayland-system-forced-warp", wayland, "forced-warp", wayland=True, system_sdl=True)
                native_case("native-wayland-raw-backend-only", wayland, "backend-only", wayland=True, system_sdl=True, raw_sdl=True)
                native_case("native-wayland-raw-normal", wayland, wayland=True, system_sdl=True, raw_sdl=True)
                native_case("native-wayland-raw-forced-warp", wayland, "forced-warp", wayland=True, system_sdl=True, raw_sdl=True)
                game_smoke("full-game-wayland-system-editor", wayland, wayland=True, system_sdl=True)
        game_smoke("full-game-default-editor", graphics)
except Exception as exc:
    import traceback
    (OUT / "orchestrator-error.log").write_text(traceback.format_exc(),encoding="utf-8")
    record("orchestrator", "INFRASTRUCTURE", {"exit":1}, {"classification":"INFRASTRUCTURE_ERROR","exception":str(exc)})
finally:
    for process, logfile in reversed(SERVICES):
        try: stop_service(process)
        except OSError: pass
        logfile.close()
    summarize()
# Preserve all results. A red job flags unanticipated infrastructure/crash/normal-case defects;
# known deliberately injected invalid-settings/forced-warp cases remain visible in the summary.
bad = any((r["execution"].get("exit",0) != 0 or str(r["classification"]).startswith(("INFRASTRUCTURE","UNEXPECTED_FAILURE","CONFIRMED_COMPONENT_DEFECT")))
          and "forced-warp" not in r["test"] and "malformed" not in r["test"] for r in RESULTS)
sys.exit(1 if bad else 0)
