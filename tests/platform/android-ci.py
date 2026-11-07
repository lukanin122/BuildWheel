#!/usr/bin/env python3
"""Build a disposable test-only Mindustry Android APK, then exercise an actual AVD.

No local Android emulation, repository clone, runtime source patch or user profile
is created by merely checking this file. CI uses RUNNER_TEMP exclusively.
The only upstream launcher changes are the test hook and its probe asset.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import shlex
import shutil
import subprocess
import sys
import tarfile
import time
import urllib.request
import zipfile

SOURCE = "17012d61d9e4c3cbd9820d87e81c24495486ac53"  # Mindustry v160.7
ARC = "7445105cd2"
JAR_SHA = "36d94941a1639478ad1d9be25a9d802c6f77552f400c6da0338b7b019f63a0d1"
PACKAGE = "io.anuke.mindustry"
EXTERNAL = f"/sdcard/Android/data/{PACKAGE}/files"
ROOT = Path(__file__).resolve().parents[2]


def json_write(path: Path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def download(url: str, path: Path, expected: str | None = None):
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        with urllib.request.urlopen(url, timeout=120) as incoming, path.open("wb") as target:
            shutil.copyfileobj(incoming, target)
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if expected is not None and digest != expected:
        raise RuntimeError(f"Pinned download SHA mismatch: {path.name}")
    return digest


def command(args, output: Path, cwd=None, timeout=1800, check=True):
    print("+", " ".join(str(x) for x in args), flush=True)
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("w", encoding="utf-8") as log:
        result = subprocess.run([str(x) for x in args], cwd=cwd, stdout=log, stderr=subprocess.STDOUT,
                                timeout=timeout, text=True)
    if check and result.returncode:
        print(output.read_text(encoding="utf-8", errors="replace")[-15000:], flush=True)
        raise RuntimeError(f"Command exited {result.returncode}; see {output.name}")
    return result.returncode


def adb(*args, check=True):
    completed = subprocess.run(["adb", *map(str, args)], capture_output=True, text=True, timeout=90)
    if check and completed.returncode:
        raise RuntimeError(f"adb {' '.join(map(str,args))}: {completed.stderr.strip()}")
    return completed.stdout


def app_write(source: Path, destination: str):
    # Android 11 scoped storage reserves package-directory creation for the app.
    # The disposable debuggable APK created it in bootstrap; run-as preserves UID.
    script = "mkdir -p " + shlex.quote(str(Path(destination).parent)) + " && cat > " + shlex.quote(destination)
    command = "run-as " + shlex.quote(PACKAGE) + " sh -c " + shlex.quote(script)
    payload = source.read_bytes()
    result = subprocess.run(["adb", "shell", "-T", command], input=payload, capture_output=True, timeout=90)
    if result.returncode:
        raise RuntimeError("run-as runtime file write failed: " + result.stderr.decode("utf-8", "replace"))
    verified = subprocess.run(["adb", "exec-out", "run-as", PACKAGE, "cat", destination], capture_output=True, timeout=90)
    if verified.returncode or verified.stdout != payload:
        raise RuntimeError("Android runtime file differs after transfer: " + str(source))


def app_collect(remote: str, destination: Path):
    for name in ("result.json", "editor.png", "palette.png", "browser.png", "wheel.png"):
        result = subprocess.run(["adb", "exec-out", "run-as", PACKAGE, "cat", remote + "/" + name],
                                capture_output=True, timeout=90)
        if result.returncode == 0:
            (destination / name).write_bytes(result.stdout)


def prepare(output: Path, supplied_jar: Path | None):
    if os.name != "posix" or not os.environ.get("RUNNER_TEMP"):
        raise RuntimeError("APK preparation is intended for an isolated POSIX GitHub runner with RUNNER_TEMP")
    output.mkdir(parents=True, exist_ok=True)
    source_dir = output / "upstream"
    archive = output / "mindustry-source.tar.gz"
    source_sha = download(f"https://codeload.github.com/Anuken/Mindustry/tar.gz/{SOURCE}", archive)
    if source_dir.exists():
        raise RuntimeError("APK source directory already exists; refusing to patch a reused upstream tree")
    with tarfile.open(archive) as packed:
        for member in packed.getmembers():
            target = (output / member.name).resolve()
            if not target.is_relative_to(output.resolve()):
                raise RuntimeError("Unsafe upstream archive path")
        packed.extractall(output, filter="data")
    (output / f"Mindustry-{SOURCE}").rename(source_dir)
    properties = (source_dir / "gradle.properties").read_text(encoding="utf-8")
    if f"archash={ARC}" not in properties:
        raise RuntimeError("Upstream Arc revision differs from the audited game")

    # Reuse the pinned release's generated packed sprites/fonts. The original
    # game code, manifest, renderer, Android backend and SDK APIs remain real.
    jar = supplied_jar or output / "Mindustry.jar"
    jar_sha = download("https://github.com/Anuken/Mindustry/releases/download/v160.7/Mindustry.jar", jar, JAR_SHA)
    with zipfile.ZipFile(jar) as packed:
        for name in packed.namelist():
            if name.endswith("/") or not name.startswith(("sprites/", "fonts/")):
                continue
            target = source_dir / "core/assets" / name
            if not target.resolve().is_relative_to((source_dir / "core/assets").resolve()):
                raise RuntimeError("Unsafe release asset path")
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(packed.read(name))
    (source_dir / "core/build").mkdir(parents=True, exist_ok=True)
    (source_dir / "core/build/last_pack_version").write_text("8", encoding="utf-8")

    launcher = source_dir / "android/src/mindustry/android/AndroidLauncher.java"
    text = launcher.read_text(encoding="utf-8")
    anchor = "        initialize(new ClientLauncher(){"
    if text.count(anchor) != 1:
        raise RuntimeError("Pinned Android launcher hook anchor is not unique")
    launcher.write_text(text.replace(anchor, "        BuildWheelAndroidProbe.install(this);\n\n" + anchor), encoding="utf-8")
    shutil.copyfile(ROOT / "tests/platform/android-probe.java.template", launcher.parent / "BuildWheelAndroidProbe.java")
    asset_dir = source_dir / "android/assets"
    asset_dir.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(ROOT / "tests/platform/android-probe.js", asset_dir / "buildwheel-android-probe.js")

    # AGP 8.2.2's documented Gradle baseline is 8.2. Keep this build-only tool
    # override explicit; no game/Arc runtime sources are changed by it.
    wrapper = source_dir / "gradle/wrapper/gradle-wrapper.properties"
    wrapper_text = wrapper.read_text(encoding="utf-8")
    prior_gradle = next(line for line in wrapper_text.splitlines() if line.startswith("distributionUrl="))
    wrapper.write_text(wrapper_text.replace(prior_gradle,
        "distributionUrl=https\\://services.gradle.org/distributions/gradle-8.2.1-bin.zip"), encoding="utf-8")
    android_gradle = source_dir / "android/build.gradle"
    android_gradle.write_text(android_gradle.read_text(encoding="utf-8") +
        "\ntasks.matching { it.name == 'mergeDebugNativeLibs' }.configureEach { dependsOn copyAndroidNatives }\n",
        encoding="utf-8")
    (source_dir / "gradlew").chmod(0o755)
    provenance = {
        "mindustry_commit": SOURCE, "arc_revision": ARC, "source_archive_sha256": source_sha,
        "release_assets_jar_sha256": jar_sha, "source_ref": "v160.7",
        "test_only_upstream_changes": ["AndroidLauncher ClientLoad probe registration", "probe Java class and JS asset",
            "Gradle wrapper 9.3.1 -> 8.2.1 for AGP 8.2.2", "mergeDebugNativeLibs depends on copyAndroidNatives"],
        "runtime_mod_changes": [], "java": subprocess.run(["java", "-version"], capture_output=True, text=True).stderr,
        "scope": "Actual Android APK and emulator; not Google Play Games or a stock signed release APK",
    }
    json_write(output / "build-provenance.json", provenance)
    command(["./gradlew", ":android:assembleDebug", "-PnoLocalArc", "-Pbuildversion=160.7", "--no-daemon", "--max-workers=2", "--stacktrace",
        "-Dorg.gradle.jvmargs=-Xms256m -Xmx4096m --add-opens=jdk.compiler/com.sun.tools.javac.api=ALL-UNNAMED --add-opens=jdk.compiler/com.sun.tools.javac.code=ALL-UNNAMED --add-opens=jdk.compiler/com.sun.tools.javac.model=ALL-UNNAMED --add-opens=jdk.compiler/com.sun.tools.javac.processing=ALL-UNNAMED --add-opens=jdk.compiler/com.sun.tools.javac.parser=ALL-UNNAMED --add-opens=jdk.compiler/com.sun.tools.javac.util=ALL-UNNAMED --add-opens=jdk.compiler/com.sun.tools.javac.tree=ALL-UNNAMED --add-opens=jdk.compiler/com.sun.tools.javac.file=ALL-UNNAMED --add-opens=jdk.compiler/com.sun.tools.javac.main=ALL-UNNAMED --add-opens=jdk.compiler/com.sun.tools.javac.jvm=ALL-UNNAMED --add-opens=jdk.compiler/com.sun.tools.javac.comp=ALL-UNNAMED --add-opens=java.base/sun.reflect.annotation=ALL-UNNAMED"],
        output / "android-build.log", cwd=source_dir, timeout=2400)
    apks = list((source_dir / "android/build/outputs/apk/debug").glob("*.apk"))
    if len(apks) != 1:
        raise RuntimeError(f"Expected one real debug APK, found {apks}")
    shutil.copyfile(apks[0], output / "Mindustry-probe.apk")
    provenance["apk_sha256"] = hashlib.sha256((output / "Mindustry-probe.apk").read_bytes()).hexdigest()
    json_write(output / "build-provenance.json", provenance)


def run(output: Path):
    output.mkdir(parents=True, exist_ok=True)
    json_write(output / "emulator-context.json", {
        "getprop": adb("shell", "getprop"), "wm": adb("shell", "wm", "size"),
        "input_devices": adb("shell", "dumpsys", "input"), "graphics": adb("shell", "dumpsys", "SurfaceFlinger"),
        "scope": "Real Android OS/ART with synthetic keyboard and mouse dispatch; no Google Play Games claim",
    })
    adb("install", "-r", output / "Mindustry-probe.apk")
    adb("shell", "pm", "clear", PACKAGE)  # This is the newly installed disposable AVD app only.
    # Ask Context.getExternalFilesDir to create the package root. ADB mkdir at
    # Android/data is forbidden on API30 even when shell can access existing files.
    adb("shell", "am", "start", "-W", "-n", PACKAGE + "/mindustry.android.AndroidLauncher",
        "--es", "buildwheel.probe.stage", "bootstrap")
    bootstrap = None
    for attempt in range(30):
        raw = adb("shell", "run-as", PACKAGE, "cat", EXTERNAL + "/buildwheel-android-results/bootstrap/result.json", check=False)
        try:
            candidate = json.loads(raw)
            if candidate.get("status") == "BOOTSTRAP_EXTERNAL_DIRECTORY_READY":
                bootstrap = candidate
                break
        except json.JSONDecodeError:
            pass
        time.sleep(1)
    if bootstrap is None:
        raise RuntimeError("Debug APK could not create its own external directory; bootstrap/run-as unavailable")
    json_write(output / "android-bootstrap.json", bootstrap)
    adb("shell", "am", "force-stop", PACKAGE)
    manifest = json.loads((ROOT / "tests/platform/source-lock.json").read_text(encoding="utf-8"))
    copied = {}
    for relative, expected in manifest["files"].items():
        source = ROOT / relative
        # CI Linux checkout is exactly the committed Git blob representation.
        actual = hashlib.sha256(source.read_bytes()).hexdigest()
        if actual != expected:
            raise RuntimeError(f"Runtime source-lock mismatch: {relative}")
        destination = EXTERNAL + "/mods/BuildWheel/" + relative
        app_write(source, destination)
        copied[relative] = actual
    json_write(output / "android-runtime-source-hashes.json", copied)
    outcomes = []
    for stage, width, height in [("initial", 1280, 720), ("restart-1600", 1600, 900), ("restart-1920", 1920, 1080)]:
        stage_output = output / stage
        stage_output.mkdir(parents=True, exist_ok=True)
        adb("shell", "am", "force-stop", PACKAGE)
        # The AVD's natural orientation is portrait; the game's unmodified
        # landscape manifest rotates these dimensions into a computer window.
        adb("shell", "wm", "size", f"{height}x{width}")
        adb("shell", "wm", "density", "160")
        adb("shell", "settings", "put", "system", "accelerometer_rotation", "0")
        adb("shell", "settings", "put", "system", "user_rotation", "1")
        adb("logcat", "-c")
        adb("shell", "am", "start", "-W", "-n", PACKAGE + "/mindustry.android.AndroidLauncher",
            "--es", "buildwheel.probe.stage", stage)
        started = time.monotonic()
        remote = EXTERNAL + f"/buildwheel-android-results/{stage}"
        result = None
        while time.monotonic() - started < 260:
            raw = adb("shell", "run-as", PACKAGE, "cat", remote + "/result.json", check=False)
            try:
                candidate = json.loads(raw)
                if candidate.get("status") != "STARTING":
                    result = candidate
                    break
            except json.JSONDecodeError:
                pass
            time.sleep(2)
        (stage_output / "logcat.txt").write_text(adb("logcat", "-d", "-v", "threadtime"), encoding="utf-8")
        app_collect(remote, stage_output)
        adb("shell", "screencap", "-p", "/sdcard/buildwheel-screen.png")
        adb("pull", "/sdcard/buildwheel-screen.png", stage_output / "android-screen.png", check=False)
        adb("shell", "am", "force-stop", PACKAGE)
        if result is None:
            result = {"status": "NO_PROBE_COMPLETION", "stage": stage,
                "scope": "APK may have failed before ClientLoad or exceeded watchdog; inspect logcat"}
        result["requested_computer_window"] = [width, height]
        json_write(stage_output / "result.json", result)
        outcomes.append(result)
        if result.get("status") != "PASS_REAL_ANDROID_COMPONENTS":
            break  # A missing initial persistent fixture cannot be tested by reseeding restart.
    json_write(output / "android-summary.json", {"schema": 1, "results": outcomes,
        "not_tested": ["Google Play Games on Windows", "physical keyboard/mouse or real user gestures", "SDL/FFM on Android (unsupported by design)", "phone/touch UI adaptation"]})
    if len(outcomes) != 3 or any(x.get("status") != "PASS_REAL_ANDROID_COMPONENTS" for x in outcomes):
        raise RuntimeError("Real Android fixture did not pass all three process/resolution stages")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("operation", choices=["prepare", "run"])
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--jar", type=Path)
    arguments = parser.parse_args()
    output = arguments.output.resolve()
    try:
        if arguments.operation == "prepare":
            prepare(output, arguments.jar)
        else:
            run(output)
    except Exception as error:
        json_write(output / f"{arguments.operation}-failure.json", {
            "status": "BUILD_OR_INFRASTRUCTURE_FAILURE" if arguments.operation == "prepare" else "ANDROID_EXECUTION_FAILURE",
            "error": repr(error), "production_runtime_was_not_modified_by_fixture": True})
        raise


if __name__ == "__main__":
    main()
