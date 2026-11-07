import arc.*;
import arc.backend.sdl.*;
import arc.backend.sdl.jni.SDL;
import arc.files.Fi;
import arc.math.geom.Vec2;
import arc.util.I18NBundle;
import rhino.*;
import java.lang.invoke.MethodHandle;
import java.lang.reflect.Array;
import java.lang.reflect.Method;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.nio.file.Files;
import java.security.MessageDigest;
import java.util.*;
import java.util.zip.ZipFile;

/**
 * Real Arc/SDL component probe. The production adapter is evaluated byte-for-byte.
 * CLI: NativeProbe <v160.7.jar> <mod-snapshot> <isolated-output> [normal|forced-warp|backend-only] [motion-seconds=4]
 * No settings directory belonging to an installed game is opened. Native calls are confined to
 * the SDL image whose current GL window matches the window just created by this application.
 * A successful component result is not a complete game/platform certification.
 */
public final class NativeProbe implements ApplicationListener {
    static Path jar, mod, data;
    static Context cx;
    static Scriptable scope, module;
    static String scenario="normal";
    static double motionSeconds=4;
    static final Map<String,Object> report=new LinkedHashMap<>();
    static final List<Map<String,Object>> checks=new ArrayList<>();
    static long processStart=System.nanoTime();
    Scriptable adapter, warp;
    Ffm ffi;
    final Map<String,MethodHandle> functions=new LinkedHashMap<>();
    final Map<String,Object> pointers=new LinkedHashMap<>();
    final Vec2 delta=new Vec2();
    String phase="starting";
    long phaseStart;
    int frames, cycle, samples, nonzero, widthBefore, heightBefore;
    double sumX, sumY, absMotion;
    boolean done, disposed, probeOwnsMode, initializing=true, minimizeBegan;
    int modeBefore=-1, cursorBefore=-99;
    List<Map<String,Object>> cycles=new ArrayList<>();

    public static void main(String[] args) throws Exception {
        if(args.length<3 || args.length>5) throw new IllegalArgumentException("NativeProbe <v160.7.jar> <mod-snapshot> <isolated-output> [normal|forced-warp|backend-only] [motion-seconds=4]");
        jar=Path.of(args[0]).toAbsolutePath();mod=Path.of(args[1]).toAbsolutePath();data=Path.of(args[2]).toAbsolutePath();
        if(args.length>3) scenario=args[3];
        if(!scenario.equals("normal") && !scenario.equals("forced-warp") && !scenario.equals("backend-only")) throw new IllegalArgumentException("Unknown scenario: "+scenario);
        if(args.length>4) motionSeconds=Double.parseDouble(args[4]);
        if(!(motionSeconds>=0.5 && motionSeconds<=15)) throw new IllegalArgumentException("motion-seconds must be 0.5..15");
        Files.createDirectories(data);
        report.put("schema",2);report.put("kind","LIVE_TARGET_ARC_SDL_COMPONENT_PROBE");
        report.put("os",System.getProperty("os.name"));report.put("arch",System.getProperty("os.arch"));
        report.put("java",System.getProperty("java.version"));report.put("scenario",scenario);report.put("pid",ProcessHandle.current().pid());
        report.put("jarSha256",sha(Files.readAllBytes(jar)));report.put("adapterSha256",sha(Files.readAllBytes(mod.resolve("scripts/sdl-relative.js"))));
        report.put("checks",checks);report.put("cycles",new ArrayList<>());
        report.put("scope","Real JNI library loading, Arc window/GL, FFM symbols and unchanged SDL adapter. No complete Mindustry game, HUD, physical mouse, or graphical correctness certification.");
        report.put("classification","RUNNING");write();
        SdlConfig config=new SdlConfig();config.width=800;config.height=600;
        config.title="BuildWheel isolated native probe";config.disableAudio=true;config.vSyncEnabled=true;
        cx=Context.enter();cx.setLanguageVersion(Context.VERSION_ES6);cx.setOptimizationLevel(9);
        try {
            new SdlApplication(new NativeProbe(),config);
            if("RUNNING".equals(report.get("classification"))) {
                report.put("classification","INFRASTRUCTURE_EARLY_APPLICATION_EXIT");write();
            }
        } catch(Throwable t) {
            report.put("startupException",trace(t));
            if("RUNNING".equals(report.get("classification"))) report.put("classification","INFRASTRUCTURE_WINDOW_OR_NATIVE_STARTUP_ERROR");
            write();t.printStackTrace();
        } finally {Context.exit();}
        if(String.valueOf(report.get("classification")).startsWith("INFRASTRUCTURE")) System.exit(2);
        if("CONFIRMED_COMPONENT_DEFECT".equals(report.get("classification"))) System.exit(3);
    }

    public void init() {
        try {
            Core.settings.setAutosave(false);Core.settings.setDataDirectory(new Fi(data.resolve("settings").toString()));Core.settings.load();
            if(!scenario.equals("backend-only")) {
                Core.bundle=I18NBundle.createBundle(new Fi(mod.resolve("bundles/bundle").toString()),Locale.ENGLISH);
                scope=new ImporterTopLevel(cx);
                try(ZipFile zip=new ZipFile(jar.toFile())) {
                    cx.evaluateString(scope,new String(zip.getInputStream(zip.getEntry("scripts/global.js")).readAllBytes(),StandardCharsets.UTF_8),"global.js",1);
                }
                String source=Files.readString(mod.resolve("scripts/sdl-relative.js"));
                Function factory=(Function)cx.evaluateString(scope,"(function(){var exports={};\n"+source+"\n;return exports;})","unchanged-sdl-relative.js",1);
                module=(Scriptable)factory.call(cx,scope,scope,new Object[0]);
            }
            int[] version=new int[3];SDL.SDL_GetVersion(version);report.put("SDL_version",List.of(version[0],version[1],version[2]));
            report.put("window",Long.toHexString(((SdlApplication)Core.app).getWindow()));
            report.put("gl",String.valueOf(Core.graphics.getGLVersion()));
            report.put("arcInput",Core.input.getClass().getName());report.put("dimensions",dimensions());
            event("window-created",state());marker("window-ready.json",state());
            try {prepareNative();}
            catch(Throwable unavailable) {
                report.put("nativeProbeUnavailable",trace(unavailable));
                if(scenario.equals("backend-only")){report.put("classification","INFRASTRUCTURE_PROBE_SYMBOL_VERIFICATION_ERROR");finish();return;}
                // This does not replace an unavailable FFM probe with an unverified pointer call.
                adapter=(Scriptable)call(module,"create");
                report.put("adapterAvailable",prop(adapter,"available"));report.put("adapterReason",prop(adapter,"reason"));
                report.put("classification",Boolean.TRUE.equals(prop(adapter,"available")) ? "INFRASTRUCTURE_PROBE_SYMBOL_VERIFICATION_ERROR" : "SAFE_REFUSAL_ADAPTER_UNAVAILABLE");
                finish();return;
            }
            initializing=false;setPhase("waiting-focus");
        }catch(Throwable t){failure(t,initializing?"INFRASTRUCTURE_PROBE_INITIALIZATION_ERROR":"JAVA_EXCEPTION");}
    }

    /** Loader lookup only: no dlopen of a second SDL, no guessed addresses, no window passed before ownership proof. */
    void prepareNative() throws Throwable {
        ffi=new Ffm();
        String[] names={"SDL_SetRelativeMouseMode","SDL_GetRelativeMouseState","SDL_GetRelativeMouseMode","SDL_GetCurrentVideoDriver","SDL_GL_GetCurrentWindow","SDL_GetMouseFocus","SDL_GetKeyboardFocus","SDL_ShowCursor","SDL_GetMouseState","SDL_RaiseWindow","SDL_GetWindowPosition","SDL_GetHintBoolean"};
        for(String name:names) pointers.put(name,ffi.symbol(name));
        Map<String,Object> symbolAddresses=new LinkedHashMap<>();
        for(var entry:pointers.entrySet())symbolAddresses.put(entry.getKey(),Long.toHexString(ffi.address(entry.getValue())));
        report.put("nativeSymbols",symbolAddresses);
        Object anchor=ffi.symbol("Java_arc_backend_sdl_jni_SDL_SDL_1SetCursor");
        String os=System.getProperty("os.name").toLowerCase(Locale.ROOT);
        if(os.contains("linux")) {
            String maps=Files.readString(Path.of("/proc/self/maps"));
            Map<String,Object> owner=null;
            for(var e:pointers.entrySet()) {
                Map<String,Object> current=linuxImage(maps,ffi.address(e.getValue()));
                if(owner!=null && !owner.equals(current))throw new IllegalStateException("SDL exports belong to different mappings: "+e.getKey());
                owner=current;
            }
            linuxImage(maps,ffi.address(anchor));
            report.put("SDL_image",owner.get("path"));
        }else if(os.contains("mac")) {
            Object dladdr=ffi.systemSymbol("dladdr");
            MethodHandle describe=ffi.bind(dladdr,"JAVA_INT","ADDRESS","ADDRESS");
            Object info=ffi.allocate(32,8);
            Map<String,Object> owner=image(describe,info,anchor,"Java_arc_backend_sdl_jni_SDL_SDL_1SetCursor");
            for(var e:pointers.entrySet()) {
                Map<String,Object> image=image(describe,info,e.getValue(),e.getKey());
                if(!owner.get("path").equals(image.get("path")) || !owner.get("base").equals(image.get("base"))) throw new IllegalStateException("SDL export outside the JNI image: "+e.getKey());
            }
            report.put("SDL_image",owner.get("path"));
        }else throw new UnsupportedOperationException("Probe supports Linux/macOS only");
        functions.put("mode",ffi.bind(pointers.get("SDL_GetRelativeMouseMode"),"JAVA_INT"));
        functions.put("set",ffi.bind(pointers.get("SDL_SetRelativeMouseMode"),"JAVA_INT","JAVA_INT"));
        functions.put("driver",ffi.bind(pointers.get("SDL_GetCurrentVideoDriver"),"ADDRESS"));
        functions.put("current",ffi.bind(pointers.get("SDL_GL_GetCurrentWindow"),"ADDRESS"));
        functions.put("mouseFocus",ffi.bind(pointers.get("SDL_GetMouseFocus"),"ADDRESS"));
        functions.put("keyboardFocus",ffi.bind(pointers.get("SDL_GetKeyboardFocus"),"ADDRESS"));
        functions.put("cursor",ffi.bind(pointers.get("SDL_ShowCursor"),"JAVA_INT","JAVA_INT"));
        functions.put("mouse",ffi.bind(pointers.get("SDL_GetMouseState"),"JAVA_INT","ADDRESS","ADDRESS"));
        functions.put("raise",ffi.bind(pointers.get("SDL_RaiseWindow"),null,"ADDRESS"));
        functions.put("windowPosition",ffi.bind(pointers.get("SDL_GetWindowPosition"),null,"ADDRESS","ADDRESS","ADDRESS"));
        functions.put("hint",ffi.bind(pointers.get("SDL_GetHintBoolean"),"JAVA_INT","ADDRESS","JAVA_INT"));
        long current=ffi.address(invoke("current"));
        if(current!=((SdlApplication)Core.app).getWindow() || current==0) throw new IllegalStateException("SDL GL current window does not match Arc; no native mode mutation permitted");
        report.put("verifiedCurrentWindow",Long.toHexString(current));
        report.put("FFM_symbolsAndWindowVerified",true);
        report.put("SDL_driver",ffi.string(invoke("driver"),64));
        modeBefore=mode();cursorBefore=((Number)invoke("cursor",-1)).intValue();
        report.put("modeBefore",modeBefore);report.put("cursorBefore",cursorBefore);
        if(modeBefore!=0) throw new IllegalStateException("Pre-existing foreign relative mode; probe will not alter it");
        if(scenario.equals("forced-warp")) report.put("forcedWarpHintSet",SDL.SDL_SetHint("SDL_MOUSE_RELATIVE_MODE_WARP","1"));
        report.put("forcedWarpHintRead",((Number)invoke("hint",ffi.cstring("SDL_MOUSE_RELATIVE_MODE_WARP"),0)).intValue());
        invoke("raise",ffi.ofAddress(current));
        event("verified-native-functions",state());
    }

    Map<String,Object> image(MethodHandle dladdr,Object memory,Object pointer,String name) throws Throwable {
        if(((Number)dladdr.invokeWithArguments(pointer,memory)).intValue()!=1) throw new IllegalStateException("dladdr failed for "+name);
        String path=ffi.string(ffi.pointerAt(memory,0),4096);
        long base=ffi.address(ffi.pointerAt(memory,8));
        String label=ffi.string(ffi.pointerAt(memory,16),4096);
        if(label.startsWith("_"))label=label.substring(1);
        if(!label.equals(name) || ffi.address(ffi.pointerAt(memory,24))!=ffi.address(pointer)) throw new IllegalStateException("dladdr symbol mismatch: "+name+" -> "+label);
        return Map.of("path",path,"base",base);
    }
    Map<String,Object> linuxImage(String maps,long address) {
        Map<String,Object> found=null;
        for(String line:maps.split("\\r?\\n")) {
            java.util.regex.Matcher match=java.util.regex.Pattern.compile("^([0-9a-f]+)-([0-9a-f]+)\\s+(\\S+)\\s+\\S+\\s+\\S+\\s+\\d+\\s*(.*)$").matcher(line);
            if(!match.matches() || !match.group(3).contains("x") || !match.group(4).startsWith("/") || match.group(4).endsWith(" (deleted)"))continue;
            long start=Long.parseUnsignedLong(match.group(1),16),end=Long.parseUnsignedLong(match.group(2),16);
            if(address>=start && address<end){if(found!=null)throw new IllegalStateException("Ambiguous executable mapping");found=Map.of("path",match.group(4),"start",start,"end",end);}
        }
        if(found==null)throw new IllegalStateException("No executable mapping for "+Long.toHexString(address));
        return found;
    }

    public void update() {
        if(done)return;
        try {
            frames++;
            if(elapsed(processStart)>70) {report.put("classification","INFRASTRUCTURE_PROBE_DEADLINE");finish();return;}
            switch(phase) {
                case "waiting-focus":
                    if(elapsed(phaseStart)>=2) {
                        if(scenario.equals("backend-only")) {
                            report.put("backendFinalState",state());report.put("classification","COMPONENT_BACKEND_EXECUTED");
                            report.put("adapterEvaluated",false);report.put("relativeMutationsPerformed",false);finish();return;
                        }
                        if(scenario.equals("forced-warp") && !Integer.valueOf(1).equals(report.get("forcedWarpHintRead"))) {
                            report.put("classification","INFRASTRUCTURE_FORCED_WARP_HINT_NOT_APPLIED");finish();return;
                        }
                        adapter=(Scriptable)call(module,"create");
                        report.put("adapterAvailable",prop(adapter,"available"));report.put("adapterReason",prop(adapter,"reason"));
                        event("adapter-created",state());
                        if(!Boolean.TRUE.equals(prop(adapter,"available"))) {report.put("classification","SAFE_REFUSAL_ADAPTER_UNAVAILABLE");finish();return;}
                        absoluteWarp();setPhase("after-warp");
                    }
                    break;
                case "after-warp":
                    if(elapsed(phaseStart)>.5) {
                        report.put("absoluteWarpObserved",state());
                        foreignMode();setPhase("before-cycle");
                    }
                    break;
                case "before-cycle":
                    if(elapsed(phaseStart)>.5) beginCycle();
                    break;
                case "sampling":
                    sample();
                    if(!done && elapsed(phaseStart)>=motionSeconds) endCycle();
                    break;
                case "after-cycle":
                    if(elapsed(phaseStart)>.4) {
                        if(cycle<3) beginCycle();
                        else {resize();setPhase("resized");}
                    }
                    break;
                case "resized":
                    if(elapsed(phaseStart)>.6) {
                        report.put("dimensionsAfterResize",dimensions());
                        check("resize-dimensions",Core.graphics.getWidth()!=widthBefore || Core.graphics.getHeight()!=heightBefore,"INFRASTRUCTURE_WINDOW_MANAGER_LIMITATION",dimensions());
                        boolean began=Boolean.TRUE.equals(call(adapter,"begin"));
                        check("begin-after-resize",began,"SAFE_REFUSAL_FOCUS_OR_NATIVE",state());
                        if(began) {probeOwnsMode=true;boolean sampled=Boolean.TRUE.equals(call(adapter,"sample",Context.javaToJS(delta,scope)));check("sample-after-resize",sampled,"SAFE_REFUSAL_FOCUS_OR_NATIVE",state());}
                        boolean ended=Boolean.TRUE.equals(call(adapter,"end"));probeOwnsMode=!ended;
                        check("release-after-resize",ended && mode()==0,"CONFIRMED_COMPONENT_DEFECT",state());
                        minimize();setPhase("minimized");
                    }
                    break;
                case "minimized":
                    if(elapsed(phaseStart)>.6) {
                        Map<String,Object> minimized=state();report.put("minimizedState",minimized);
                        boolean focused=(SDL.SDL_GetWindowFlags(((SdlApplication)Core.app).getWindow())&SDL.SDL_WINDOW_INPUT_FOCUS)!=0;
                        if(minimizeBegan) {
                            boolean sampled=Boolean.TRUE.equals(call(adapter,"sample",Context.javaToJS(delta,scope)));
                            if(!focused)check("active-minimize-stops-and-releases",!sampled && mode()==0 && !Boolean.TRUE.equals(prop(adapter,"active")),"CONFIRMED_COMPONENT_DEFECT",state());
                            else check("active-minimize-focus-loss-observed",false,"INFRASTRUCTURE_WINDOW_MANAGER_LIMITATION",minimized);
                            boolean ended=Boolean.TRUE.equals(call(adapter,"end"));probeOwnsMode=!ended;
                            check("end-after-minimize",ended && mode()==0,"CONFIRMED_COMPONENT_DEFECT",state());
                        }
                        boolean began=Boolean.TRUE.equals(call(adapter,"begin"));
                        check("unfocused-begin-refused",!began,focused?"INFRASTRUCTURE_WINDOW_MANAGER_LIMITATION":"CONFIRMED_COMPONENT_DEFECT",minimized);
                        if(focused) check("minimize-produced-focus-loss",false,"INFRASTRUCTURE_WINDOW_MANAGER_LIMITATION",minimized);
                        if(began){probeOwnsMode=true;call(adapter,"end");}
                        SDL.SDL_RestoreWindow(((SdlApplication)Core.app).getWindow());
                        invoke("raise",ffi.ofAddress(((SdlApplication)Core.app).getWindow()));setPhase("restored");
                    }
                    break;
                case "restored":
                    if(elapsed(phaseStart)>.8) {
                        boolean began=Boolean.TRUE.equals(call(adapter,"begin"));
                        check("begin-before-dispose",began,"SAFE_REFUSAL_FOCUS_OR_NATIVE",state());
                        if(began)probeOwnsMode=true;
                        call(adapter,"dispose");disposed=true;
                        int now=mode();probeOwnsMode=now!=0;
                        check("dispose-releases-mode",now==0 && !Boolean.TRUE.equals(prop(adapter,"active")),"CONFIRMED_COMPONENT_DEFECT",state());
                        check("dispose-disables-adapter",!Boolean.TRUE.equals(prop(adapter,"available")),"CONFIRMED_COMPONENT_DEFECT",state());
                        boolean reopened=Boolean.TRUE.equals(call(adapter,"begin"));
                        check("disposed-cannot-reopen",!reopened && mode()==0,"CONFIRMED_COMPONENT_DEFECT",state());
                        finish();
                    }
                    break;
                default:throw new IllegalStateException("Unknown phase "+phase);
            }
        }catch(AssertionError t){failure(t,"CONFIRMED_COMPONENT_DEFECT");}
        catch(Throwable t){failure(t,"INFRASTRUCTURE_PROBE_RUNTIME_EXCEPTION");}
    }

    void absoluteWarp() throws Throwable {
        warp=(Scriptable)call(module,"createWarp",adapter);
        report.put("absoluteWarpBefore",state());
        boolean moved=Boolean.TRUE.equals(call(warp,"move",410,310));
        report.put("absoluteWarpReturned",moved);report.put("absoluteWarpImmediate",state());
        String driver=String.valueOf(report.get("SDL_driver"));
        if(driver.equals("wayland"))check("wayland-absolute-warp-refused",!moved,"CONFIRMED_COMPONENT_DEFECT",state());
        else check("absolute-warp",moved,"SAFE_REFUSAL_FOCUS_OR_NATIVE",state());
    }

    void foreignMode() throws Throwable {
        if(mode()!=0)throw new IllegalStateException("Unexpected pre-existing mode before foreign-ownership test");
        int enabled=((Number)invoke("set",1)).intValue();
        int after=mode();probeOwnsMode=after==1;
        report.put("foreignModeEnable",Map.of("return",enabled,"mode",after,"SDL_error",String.valueOf(SDL.SDL_GetError())));
        if(enabled!=0 || after!=1) {check("foreign-mode-test",false,"INFRASTRUCTURE_RELATIVE_MODE_UNAVAILABLE",state());cleanupProbeMode();return;}
        try {
            boolean began=Boolean.TRUE.equals(call(adapter,"begin"));
            check("refuse-foreign-mode",!began && !Boolean.TRUE.equals(prop(adapter,"active")),"CONFIRMED_COMPONENT_DEFECT",state());
            boolean ended=Boolean.TRUE.equals(call(adapter,"end"));
            check("leave-foreign-mode-untouched",ended && mode()==1,"CONFIRMED_COMPONENT_DEFECT",state());
        }finally {cleanupProbeMode();}
        check("foreign-owner-cleanup",mode()==0,"INFRASTRUCTURE_NATIVE_RELEASE_FAILURE",state());
    }

    void beginCycle() throws Throwable {
        cycle++;samples=0;nonzero=0;sumX=0;sumY=0;absMotion=0;
        if(cycle>1 && !Boolean.TRUE.equals(prop(adapter,"available"))) {
            check("adapter-remains-available",false,"SAFE_REFUSAL_ADAPTER_UNAVAILABLE",state());finish();return;
        }
        report.put("stateBeforeBegin"+cycle,state());
        boolean began=Boolean.TRUE.equals(call(adapter,"begin"));
        int after=mode();
        if(began)probeOwnsMode=true;
        report.put("begin"+cycle,Map.of("return",began,"mode",after,"reason",String.valueOf(prop(adapter,"reason")),"SDL_error",String.valueOf(SDL.SDL_GetError())));
        if(scenario.equals("forced-warp")) {
            boolean rejected=!began;
            check("forced-warp-rejected",rejected,"CONFIRMED_COMPONENT_DEFECT",state());
            report.put("forcedWarpClassification",rejected?"SAFE_REFUSAL_WARP_POLICY":"POLICY_DEFECT_FORCED_WARP_ACCEPTED");
        }
        if(!began) {
            check("begin-cycle-"+cycle,false,"SAFE_REFUSAL_FOCUS_OR_NATIVE",state());
            check("failed-begin-releases-mode",after==0,"CONFIRMED_COMPONENT_DEFECT",state());
            report.put("classification",hasDefect()?"CONFIRMED_COMPONENT_DEFECT":"SAFE_REFUSAL_BEGIN_FOCUS_OR_NATIVE");finish();return;
        }
        check("begin-cycle-"+cycle,after==1 && Boolean.TRUE.equals(prop(adapter,"active")),"CONFIRMED_COMPONENT_DEFECT",state());
        setPhase("sampling");
        Map<String,Object> marker=new LinkedHashMap<>(state());marker.put("cycle",cycle);marker.put("motionSeconds",motionSeconds);
        marker("relative-ready.json",marker);marker("relative-ready-"+cycle+".json",marker);
    }

    void sample() throws Throwable {
        boolean ok=Boolean.TRUE.equals(call(adapter,"sample",Context.javaToJS(delta,scope)));
        if(!ok) {
            report.put("stoppedSample",Map.of("cycle",cycle,"frame",frames,"state",state()));
            check("sampling-retained-focus",false,"INFRASTRUCTURE_FOCUS_LOST_OR_ADAPTER_RELEASE",state());
            check("stopped-sample-release",mode()==0 && !Boolean.TRUE.equals(prop(adapter,"active")),"CONFIRMED_COMPONENT_DEFECT",state());
            endCycle();return;
        }
        samples++;sumX+=delta.x;sumY+=delta.y;
        if(delta.x!=0 || delta.y!=0){nonzero++;absMotion+=Math.abs(delta.x)+Math.abs(delta.y);}
        if(!Float.isFinite(delta.x) || !Float.isFinite(delta.y))throw new AssertionError("Non-finite SDL relative movement");
    }

    void endCycle() throws Throwable {
        boolean ended=Boolean.TRUE.equals(call(adapter,"end"));
        int after=mode();probeOwnsMode=!ended || after!=0;
        Map<String,Object> item=new LinkedHashMap<>();item.put("cycle",cycle);item.put("samples",samples);item.put("nonzeroSamples",nonzero);
        item.put("sumDx",sumX);item.put("sumDy",sumY);item.put("absoluteDeltaSum",absMotion);item.put("endReturned",ended);item.put("modeAfterEnd",after);item.put("SDL_error",String.valueOf(SDL.SDL_GetError()));
        item.put("movementClassification",nonzero==0?"INCONCLUSIVE_NO_OBSERVED_MOTION":"OBSERVED_SDL_RELATIVE_DELTAS_SOURCE_REQUIRES_RUNNER_CORRELATION");
        cycles.add(item);report.put("cycles",cycles);event("cycle-ended",item);
        check("end-cycle-"+cycle,ended && after==0 && !Boolean.TRUE.equals(prop(adapter,"active")),"CONFIRMED_COMPONENT_DEFECT",state());
        if(!ended || after!=0){finish();return;}
        setPhase("after-cycle");
    }

    void resize() throws Throwable {
        widthBefore=Core.graphics.getWidth();heightBefore=Core.graphics.getHeight();
        SDL.SDL_SetWindowSize(((SdlApplication)Core.app).getWindow(),720,520);
        event("requested-resize",state());
    }
    void minimize() throws Throwable {
        minimizeBegan=Boolean.TRUE.equals(call(adapter,"begin"));
        if(minimizeBegan)probeOwnsMode=true;
        check("begin-before-minimize",minimizeBegan,"SAFE_REFUSAL_FOCUS_OR_NATIVE",state());
        SDL.SDL_MinimizeWindow(((SdlApplication)Core.app).getWindow());event("requested-minimize",state());
    }
    public void pause(){event("arc-pause",safeState());}
    public void resume(){event("arc-resume",safeState());}
    public void resize(int width,int height){event("arc-resize",Map.of("width",width,"height",height));}
    public void dispose(){
        if(!done){report.put("classification","INFRASTRUCTURE_APPLICATION_EXIT_DURING_PROBE");finishWithoutExit();}
        closeFfm();write();
    }

    void cleanupProbeMode() throws Throwable {
        if(!probeOwnsMode || modeBefore!=0)return;
        int returned=((Number)invoke("set",0)).intValue();int after=mode();
        event("probe-owned-mode-release",Map.of("return",returned,"mode",after,"SDL_error",String.valueOf(SDL.SDL_GetError())));
        probeOwnsMode=after!=0;
    }
    void finish(){finishWithoutExit();if(Core.app!=null)Core.app.exit();}
    void finishWithoutExit(){
        if(done)return;done=true;
        try {
            if(adapter!=null && !disposed){
                Object released=call(adapter,"end");report.put("finalEndReturned",unbox(released));report.put("activeAfterEnd",prop(adapter,"active"));
                call(adapter,"dispose");disposed=true;
            }
            if(warp!=null)call(warp,"dispose");
            if(ffi!=null && functions.containsKey("mode")) {
                report.put("modeBeforeEmergencyCleanup",mode());
                if(modeBefore==0 && (probeOwnsMode || (adapter!=null && Boolean.TRUE.equals(prop(adapter,"active")))))cleanupProbeMode();
                report.put("modeAfterCleanup",mode());report.put("cursorAfterCleanup",((Number)invoke("cursor",-1)).intValue());
                if(modeBefore==0 && mode()!=0)check("final-native-mode-off",false,"CONFIRMED_COMPONENT_DEFECT",state());
                if(cursorBefore!=-99) check("cursor-visibility-restored",((Number)invoke("cursor",-1)).intValue()==cursorBefore,"CONFIRMED_COMPONENT_DEFECT",state());
            }
        }catch(Throwable t){report.put("cleanupException",trace(t));check("cleanup",false,"INFRASTRUCTURE_NATIVE_CLEANUP_EXCEPTION",safeState());}
        if(hasDefect())report.put("classification","CONFIRMED_COMPONENT_DEFECT");
        else if("RUNNING".equals(report.get("classification"))) {
            boolean limited=checks.stream().anyMatch(m->!"PASS".equals(m.get("classification")));
            report.put("classification",cycles.size()==3?(limited?"COMPONENT_EXECUTED_WITH_ENVIRONMENT_LIMITATIONS":"COMPONENT_LIFECYCLE_EXECUTED"):"INCOMPLETE_COMPONENT_EXECUTION");
        }
        report.put("elapsedSeconds",elapsed(processStart));report.put("frames",frames);report.put("finalPhase",phase);
        report.put("movementConclusion",cycles.stream().anyMatch(m->((Number)m.get("nonzeroSamples")).intValue()>0)?"NONZERO_RELATIVE_DELTAS_OBSERVED_NOT_PHYSICAL_MOUSE_CERTIFICATION":"INCONCLUSIVE_NO_OBSERVED_RELATIVE_MOVEMENT");
        write();
    }
    void closeFfm(){if(ffi!=null){try{ffi.close();report.put("probeArenaClosed",true);}catch(Throwable t){report.put("probeArenaCloseException",trace(t));}ffi=null;}}
    void failure(Throwable t,String kind){report.put("exception",trace(t));report.put("classification",kind);t.printStackTrace();finish();}
    void setPhase(String p){phase=p;phaseStart=System.nanoTime();event(p,safeState());write();}
    void check(String id,boolean ok,String failure,Object detail){Map<String,Object> item=new LinkedHashMap<>();item.put("test",id);item.put("classification",ok?"PASS":failure);item.put("detail",detail);checks.add(item);event("check",item);}
    boolean hasDefect(){return checks.stream().anyMatch(m->"CONFIRMED_COMPONENT_DEFECT".equals(m.get("classification")));}
    int mode() throws Throwable{return ((Number)invoke("mode")).intValue();}
    Object invoke(String name,Object... args) throws Throwable{return functions.get(name).invokeWithArguments(args);}
    Object call(Scriptable target,String method,Object... args){return ScriptableObject.callMethod(cx,target,method,args);}
    Object prop(Scriptable target,String name){return unbox(ScriptableObject.getProperty(target,name));}
    static Object unbox(Object value){if(value instanceof Wrapper)return ((Wrapper)value).unwrap();return value==Undefined.instance?null:value;}

    Map<String,Object> dimensions(){return Map.of("logicalWidth",Core.graphics.getWidth(),"logicalHeight",Core.graphics.getHeight(),"backBufferWidth",Core.graphics.getBackBufferWidth(),"backBufferHeight",Core.graphics.getBackBufferHeight(),"density",Core.graphics.getDensity());}
    Map<String,Object> state() throws Throwable {
        Map<String,Object> out=new LinkedHashMap<>();long window=((SdlApplication)Core.app).getWindow();
        out.put("phase",phase);out.put("elapsed",elapsed(processStart));out.put("flags",SDL.SDL_GetWindowFlags(window));
        out.put("arcMouseX",Core.input.mouseX());out.put("arcMouseY",Core.input.mouseY());out.put("SDL_error",String.valueOf(SDL.SDL_GetError()));
        if(ffi!=null && functions.containsKey("mode")) {
            out.put("mode",mode());out.put("cursorShown",((Number)invoke("cursor",-1)).intValue());
            out.put("mouseFocus",Long.toHexString(ffi.address(invoke("mouseFocus"))));out.put("keyboardFocus",Long.toHexString(ffi.address(invoke("keyboardFocus"))));
            Object x=ffi.allocate(4,4),y=ffi.allocate(4,4);invoke("mouse",x,y);out.put("SDL_mouseX",ffi.integer(x));out.put("SDL_mouseY",ffi.integer(y));
            invoke("windowPosition",ffi.ofAddress(window),x,y);out.put("windowX",ffi.integer(x));out.put("windowY",ffi.integer(y));
        }
        if(adapter!=null){out.put("adapterActive",prop(adapter,"active"));out.put("adapterAvailable",prop(adapter,"available"));out.put("adapterReason",String.valueOf(prop(adapter,"reason")));}
        return out;
    }
    Map<String,Object> safeState(){try{return Core.app==null?Map.of():state();}catch(Throwable t){return Map.of("stateException",trace(t));}}
    static double elapsed(long since){return (System.nanoTime()-since)/1e9;}
    static String sha(byte[] bytes)throws Exception{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));}
    static String trace(Throwable t){StringBuilder s=new StringBuilder();for(Throwable e=t;e!=null;e=e.getCause()){if(s.length()>0)s.append(" <- ");s.append(e);};return s.toString();}
    static void marker(String file,Object value){try{atomic(data.resolve(file),json(value)+"\n");}catch(Exception e){throw new RuntimeException(e);}}
    static void event(String type,Object values){try{Map<String,Object> e=new LinkedHashMap<>();e.put("timeSeconds",elapsed(processStart));e.put("event",type);e.put("detail",values);Files.writeString(data.resolve("native-probe-events.jsonl"),json(e)+"\n",StandardOpenOption.CREATE,StandardOpenOption.APPEND);System.out.println("BW_PROBE "+json(e));}catch(Exception e){throw new RuntimeException(e);}}
    static void write(){try{atomic(data.resolve("native-probe-result.json"),json(report)+"\n");}catch(Exception e){e.printStackTrace();}}
    static void atomic(Path target,String text)throws Exception{Path temp=target.resolveSibling(target.getFileName()+".tmp");Files.writeString(temp,text);Files.move(temp,target,StandardCopyOption.REPLACE_EXISTING,StandardCopyOption.ATOMIC_MOVE);}
    static String json(Object v){
        if(v==null)return "null";if(v instanceof Number || v instanceof Boolean)return v.toString();
        if(v instanceof Map){StringJoiner j=new StringJoiner(",","{","}");for(var e:((Map<?,?>)v).entrySet())j.add(json(String.valueOf(e.getKey()))+":"+json(e.getValue()));return j.toString();}
        if(v instanceof Iterable){StringJoiner j=new StringJoiner(",","[","]");for(Object item:(Iterable<?>)v)j.add(json(item));return j.toString();}
        StringBuilder s=new StringBuilder("\"");for(char c:String.valueOf(v).toCharArray()){switch(c){case '\\':s.append("\\\\");break;case '"':s.append("\\\"");break;case '\n':s.append("\\n");break;case '\r':s.append("\\r");break;case '\t':s.append("\\t");break;default:if(c<32)s.append(String.format("\\u%04x",(int)c));else s.append(c);}}return s.append('"').toString();
    }

    /** Reflection keeps the probe source compatible with javac 17; the actual native execution requires Java 25. */
    static final class Ffm {
        final Class<?> lookup=Class.forName("java.lang.foreign.SymbolLookup"),segment=Class.forName("java.lang.foreign.MemorySegment"),layout=Class.forName("java.lang.foreign.MemoryLayout"),descriptor=Class.forName("java.lang.foreign.FunctionDescriptor"),linkerType=Class.forName("java.lang.foreign.Linker"),option=Class.forName("java.lang.foreign.Linker$Option"),arenaType=Class.forName("java.lang.foreign.Arena"),addressType=Class.forName("java.lang.foreign.AddressLayout");
        final Object symbols=lookup.getMethod("loaderLookup").invoke(null),linker=linkerType.getMethod("nativeLinker").invoke(null),arena=arenaType.getMethod("ofConfined").invoke(null);
        final Method address=segment.getMethod("address"),reinterpret=segment.getMethod("reinterpret",long.class),getString=segment.getMethod("getString",long.class),asBuffer=segment.getMethod("asByteBuffer");
        Ffm()throws Exception{}
        Object symbol(String name)throws Exception{return ((Optional<?>)lookup.getMethod("find",String.class).invoke(symbols,name)).orElseThrow(()->new IllegalStateException("loaderLookup did not find "+name));}
        Object systemSymbol(String name)throws Exception{Object system=linkerType.getMethod("defaultLookup").invoke(linker);return ((Optional<?>)lookup.getMethod("find",String.class).invoke(system,name)).orElseThrow(()->new IllegalStateException("defaultLookup did not find "+name));}
        Object value(String field)throws Exception{return Class.forName("java.lang.foreign.ValueLayout").getField(field).get(null);}
        Object allocate(long count,long align)throws Exception{return arenaType.getMethod("allocate",long.class,long.class).invoke(arena,count,align);}
        Object cstring(String text)throws Exception{return arenaType.getMethod("allocateFrom",String.class).invoke(arena,text);}
        long address(Object pointer)throws Exception{return ((Number)address.invoke(pointer)).longValue();}
        Object ofAddress(long pointer)throws Exception{return segment.getMethod("ofAddress",long.class).invoke(null,pointer);}
        String string(Object pointer,long maximum)throws Exception{if(address(pointer)==0)return "";return String.valueOf(getString.invoke(reinterpret.invoke(pointer,maximum),0L));}
        Object pointerAt(Object memory,long offset)throws Exception{return segment.getMethod("get",addressType,long.class).invoke(memory,value("ADDRESS"),offset);}
        int integer(Object memory)throws Exception{return ((ByteBuffer)asBuffer.invoke(memory)).order(ByteOrder.nativeOrder()).getInt(0);}
        MethodHandle bind(Object pointer,String result,String... arguments)throws Exception{
            Object args=Array.newInstance(layout,arguments.length);for(int i=0;i<arguments.length;i++)Array.set(args,i,value(arguments[i]));
            Object desc=result==null?descriptor.getMethod("ofVoid",args.getClass()).invoke(null,args):descriptor.getMethod("of",layout,args.getClass()).invoke(null,value(result),args);
            Object options=Array.newInstance(option,0);
            return (MethodHandle)linkerType.getMethod("downcallHandle",segment,descriptor,options.getClass()).invoke(linker,pointer,desc,options);
        }
        void close()throws Exception{arenaType.getMethod("close").invoke(arena);}
    }
}
