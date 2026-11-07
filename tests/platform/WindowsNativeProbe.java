import arc.*;
import arc.backend.sdl.*;
import arc.backend.sdl.jni.SDL;
import rhino.*;
import java.lang.invoke.MethodHandle;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.file.*;
import java.nio.file.Files;
import java.util.*;

/**
 * Windows counterpart to NativeProbe. Uses real Arc/SDL and the unmodified production
 * adapter, which validates its private SDL functions itself. There is deliberately no
 * second PE scanner or independently guessed native SDL address in this test.
 *
 * CLI: WindowsNativeProbe <v160.7.jar> <mod-snapshot> <isolated-output> [normal|forced-warp] [motion-seconds=4]
 * Set -Dbuildwheel.probe.inject=false to disable guarded user32 OS-motion injection.
 * The caller must also enforce a process timeout; the main-thread deadline cannot
 * interrupt a JVM stuck inside native code.
 */
public final class WindowsNativeProbe extends NativeProbe {
    final Map<String,MethodHandle> win=new LinkedHashMap<>();
    Object point,rect,cursor;
    int originalX,originalY;
    boolean savedCursor;
    final boolean inject=!"false".equalsIgnoreCase(System.getProperty("buildwheel.probe.inject","true"));
    long lastInjection;
    int injected,skippedInjection;

    public static void main(String[] args)throws Exception {
        if(args.length<3 || args.length>5)throw new IllegalArgumentException("WindowsNativeProbe <v160.7.jar> <mod-snapshot> <isolated-output> [normal|forced-warp] [motion-seconds=4]");
        if(!System.getProperty("os.name").toLowerCase(Locale.ROOT).contains("windows"))throw new UnsupportedOperationException("Windows probe only");
        jar=Path.of(args[0]).toAbsolutePath();mod=Path.of(args[1]).toAbsolutePath();data=Path.of(args[2]).toAbsolutePath();
        if(args.length>3)scenario=args[3];if(args.length>4)motionSeconds=Double.parseDouble(args[4]);
        if(!scenario.equals("normal") && !scenario.equals("forced-warp"))throw new IllegalArgumentException("Unknown scenario");
        if(!(motionSeconds>=.5 && motionSeconds<=10))throw new IllegalArgumentException("motion-seconds must be .5..10");
        Files.createDirectories(data);
        report.put("schema",2);report.put("kind","LIVE_WINDOWS_ARC_SDL_ADAPTER_PROBE");
        report.put("os",System.getProperty("os.name"));report.put("arch",System.getProperty("os.arch"));report.put("java",System.getProperty("java.version"));
        report.put("pid",ProcessHandle.current().pid());report.put("scenario",scenario);report.put("checks",checks);report.put("cycles",new ArrayList<>());
        report.put("jarSha256",sha(Files.readAllBytes(jar)));report.put("adapterSha256",sha(Files.readAllBytes(mod.resolve("scripts/sdl-relative.js"))));
        report.put("modeValidation","Production adapter's own verified SDL_GetRelativeMouseMode checks inside begin/end/sample; no independent native SDL getter");
        report.put("scope","Actual Windows Arc SDL window, Rhino and unchanged native adapter. Guarded user32 synthetic OS movement is not a physical-mouse or full-game test. No game profile is loaded.");
        report.put("classification","RUNNING");write();
        SdlConfig config=new SdlConfig();config.width=800;config.height=600;config.title="BuildWheel isolated Windows native probe";
        config.disableAudio=true;config.vSyncEnabled=true;
        cx=Context.enter();cx.setLanguageVersion(Context.VERSION_ES6);cx.setOptimizationLevel(9);
        try {new SdlApplication(new WindowsNativeProbe(),config);}
        catch(Throwable t){report.put("startupException",trace(t));report.put("classification","INFRASTRUCTURE_WINDOW_OR_NATIVE_STARTUP_ERROR");write();t.printStackTrace();}
        finally {Context.exit();}
        if("RUNNING".equals(report.get("classification"))){report.put("classification","INFRASTRUCTURE_EARLY_APPLICATION_EXIT");write();}
        if(String.valueOf(report.get("classification")).startsWith("INFRASTRUCTURE"))System.exit(2);
        if("CONFIRMED_COMPONENT_DEFECT".equals(report.get("classification")))System.exit(3);
    }

    @Override void prepareNative()throws Throwable {
        // Only trusted public user32 exports are added; private SDL addresses are left to the adapter.
        ffi=new Ffm();
        Object user32=ffi.lookup.getMethod("libraryLookup",String.class,ffi.arenaType).invoke(null,"user32.dll",ffi.arena);
        bindWin(user32,"GetActiveWindow","ADDRESS");bindWin(user32,"GetForegroundWindow","ADDRESS");
        bindWin(user32,"SetForegroundWindow","JAVA_INT","ADDRESS");
        bindWin(user32,"GetCursorPos","JAVA_INT","ADDRESS");bindWin(user32,"SetCursorPos","JAVA_INT","JAVA_INT","JAVA_INT");
        bindWin(user32,"GetCursorInfo","JAVA_INT","ADDRESS");
        bindWin(user32,"GetClientRect","JAVA_INT","ADDRESS","ADDRESS");bindWin(user32,"ClientToScreen","JAVA_INT","ADDRESS","ADDRESS");
        bindWin(user32,"mouse_event",null,"JAVA_INT","JAVA_INT","JAVA_INT","JAVA_INT","JAVA_LONG");
        point=ffi.allocate(8,4);rect=ffi.allocate(16,4);cursor=ffi.allocate(24,8);
        if(number(win("GetCursorPos",point))!=0){originalX=buffer(point).getInt(0);originalY=buffer(point).getInt(4);savedCursor=true;}
        report.put("originalCursor",Map.of("captured",savedCursor,"x",originalX,"y",originalY));
        report.put("injectionRequested",inject);
        Object active=win("GetActiveWindow");
        if(ffi.address(active)!=0)report.put("foregroundRequestReturn",number(win("SetForegroundWindow",active)));
        if(scenario.equals("forced-warp"))report.put("forcedWarpHintSet",SDL.SDL_SetHint("SDL_MOUSE_RELATIVE_MODE_WARP","1"));
    }
    void bindWin(Object lookup,String name,String result,String... args)throws Exception {
        Object pointer=((Optional<?>)ffi.lookup.getMethod("find",String.class).invoke(lookup,name)).orElseThrow();win.put(name,ffi.bind(pointer,result,args));
    }
    Object win(String method,Object...args)throws Throwable{return win.get(method).invokeWithArguments(args);}
    static int number(Object value){return ((Number)value).intValue();}
    ByteBuffer buffer(Object segment)throws Exception{return ((ByteBuffer)ffi.asBuffer.invoke(segment)).order(ByteOrder.nativeOrder());}
    boolean foregroundOwned()throws Throwable{return ffi.address(win("GetActiveWindow"))!=0 && ffi.address(win("GetActiveWindow"))==ffi.address(win("GetForegroundWindow"));}

    @Override public void update(){
        if(done)return;
        try {
            frames++;
            if(elapsed(processStart)>45){report.put("classification","INFRASTRUCTURE_PROBE_DEADLINE");finish();return;}
            if(phase.equals("waiting-focus") && elapsed(phaseStart)>2) {
                adapter=(Scriptable)call(module,"create");report.put("adapterAvailable",prop(adapter,"available"));report.put("adapterReason",prop(adapter,"reason"));
                report.put("adapterHash",prop(adapter,"hash"));report.put("adapterAutomaticDiscovery",prop(adapter,"automatic"));
                if(!Boolean.TRUE.equals(prop(adapter,"available"))){report.put("classification","SAFE_REFUSAL_ADAPTER_UNAVAILABLE");finish();return;}
                if(scenario.equals("forced-warp") && !Boolean.TRUE.equals(report.get("forcedWarpHintSet"))){report.put("classification","INFRASTRUCTURE_FORCED_WARP_HINT_NOT_APPLIED");finish();return;}
                cursorState("cursorBeforeRelative");
                warp=(Scriptable)call(module,"createWarp",adapter);
                boolean shifted=Boolean.TRUE.equals(call(warp,"move",410,310));
                check("ordinary-absolute-warp",shifted,"SAFE_REFUSAL_FOCUS_OR_NATIVE",safeState());
                centerPointer();setPhase("windows-before-cycle");
            }else if(phase.equals("windows-before-cycle") && elapsed(phaseStart)>.4)startCycle();
            else if(phase.equals("windows-sampling")) {
                boolean sampled=Boolean.TRUE.equals(call(adapter,"sample",Context.javaToJS(delta,scope)));
                if(!sampled) {
                    check("sample-remains-active",false,"SAFE_REFUSAL_FOCUS_OR_NATIVE",safeState());
                    check("stopped-sample-clears-active",!Boolean.TRUE.equals(prop(adapter,"active")),"CONFIRMED_COMPONENT_DEFECT",safeState());
                    report.put("classification","SAFE_REFUSAL_SAMPLE_STOPPED");finish();return;
                }
                samples++;sumX+=delta.x;sumY+=delta.y;
                if(delta.x!=0 || delta.y!=0){nonzero++;absMotion+=Math.abs(delta.x)+Math.abs(delta.y);}
                if(!Float.isFinite(delta.x) || !Float.isFinite(delta.y))throw new AssertionError("Nonfinite relative movement");
                if(inject && elapsed(lastInjection)>.08)injectMotion();
                if(elapsed(phaseStart)>=motionSeconds)completeCycle();
            }else if(phase.equals("windows-after-cycle") && elapsed(phaseStart)>.4) {
                if(cycle<3)startCycle();else {
                    boolean began=Boolean.TRUE.equals(call(adapter,"begin"));
                    check("begin-before-dispose",began,"SAFE_REFUSAL_FOCUS_OR_NATIVE",safeState());
                    call(adapter,"dispose");disposed=true;
                    check("dispose-clears-active",!Boolean.TRUE.equals(prop(adapter,"active")),"CONFIRMED_COMPONENT_DEFECT",safeState());
                    check("dispose-disables-adapter",!Boolean.TRUE.equals(prop(adapter,"available")),"CONFIRMED_COMPONENT_DEFECT",safeState());
                    check("disposed-begin-refused",!Boolean.TRUE.equals(call(adapter,"begin")),"CONFIRMED_COMPONENT_DEFECT",safeState());
                    check("disposed-end-idempotent",Boolean.TRUE.equals(call(adapter,"end")),"CONFIRMED_COMPONENT_DEFECT",safeState());
                    cursorState("cursorAfterRelative");finish();
                }
            }
        }catch(AssertionError t){failure(t,"CONFIRMED_COMPONENT_DEFECT");}
        catch(Throwable t){failure(t,"INFRASTRUCTURE_PROBE_RUNTIME_EXCEPTION");}
    }
    void startCycle()throws Throwable {
        cycle++;samples=0;nonzero=0;sumX=0;sumY=0;absMotion=0;injected=0;skippedInjection=0;lastInjection=System.nanoTime();
        boolean began=Boolean.TRUE.equals(call(adapter,"begin"));
        report.put("begin"+cycle,Map.of("return",began,"reason",String.valueOf(prop(adapter,"reason")),"SDL_error",String.valueOf(SDL.SDL_GetError())));
        if(scenario.equals("forced-warp")) {
            String expected=Core.bundle.get("buildwheel.sdl.warp-rejected"),reason=String.valueOf(prop(adapter,"reason"));
            boolean policyRefusal=!began && !Boolean.TRUE.equals(prop(adapter,"active")) && reason.contains(expected) && Boolean.TRUE.equals(report.get("forcedWarpHintSet"));
            if(policyRefusal) {
                check("forced-warp-rejected",true,"CONFIRMED_COMPONENT_DEFECT",safeState());
                report.put("classification","SAFE_REFUSAL_FORCED_WARP_POLICY");finish();return;
            }
            if(began){check("forced-warp-rejected",false,"CONFIRMED_COMPONENT_DEFECT",safeState());call(adapter,"end");finish();return;}
            report.put("classification","SAFE_REFUSAL_FORCED_WARP_NOT_TESTED_FOCUS_OR_OTHER");finish();return;
        }
        if(!began){check("begin-cycle-"+cycle,false,"SAFE_REFUSAL_FOCUS_OR_NATIVE",safeState());report.put("classification","SAFE_REFUSAL_BEGIN_FOCUS_OR_NATIVE");finish();return;}
        check("begin-cycle-"+cycle,Boolean.TRUE.equals(prop(adapter,"active")),"CONFIRMED_COMPONENT_DEFECT",safeState());
        setPhase("windows-sampling");marker("relative-ready-"+cycle+".json",safeState());
    }
    void injectMotion()throws Throwable {
        lastInjection=System.nanoTime();
        if(!foregroundOwned()){skippedInjection++;return;}
        // user32 posts OS motion; no SDL_PushEvent, absolute-coordinate polling or invented deltas.
        int dx=(injected%12)<6?5:-5,dy=(injected%8)<4?3:-3;
        win("mouse_event",1,dx,dy,0,0L);injected++;
    }
    void centerPointer()throws Throwable {
        if(!inject || !foregroundOwned())return;
        Object active=win("GetActiveWindow");buffer(point).putInt(0,0).putInt(4,0);
        if(number(win("GetClientRect",active,rect))==0 || number(win("ClientToScreen",active,point))==0)return;
        int x=buffer(point).getInt(0)+buffer(rect).getInt(8)/2,y=buffer(point).getInt(4)+buffer(rect).getInt(12)/2;
        report.put("testPointerCentered",number(win("SetCursorPos",x,y))!=0);
    }
    void completeCycle()throws Throwable {
        boolean ended=Boolean.TRUE.equals(call(adapter,"end"));
        Map<String,Object> item=new LinkedHashMap<>();item.put("cycle",cycle);item.put("samples",samples);item.put("nonzeroSamples",nonzero);item.put("sumDx",sumX);item.put("sumDy",sumY);item.put("absoluteDeltaSum",absMotion);
        item.put("OSMotionInjectionCalls",injected);item.put("OSMotionInjectionSkippedForeground",skippedInjection);item.put("endReturned",ended);item.put("SDL_error",String.valueOf(SDL.SDL_GetError()));
        item.put("successfulEndValidatedByAdapter",ended);item.put("movementClassification",nonzero==0?"INCONCLUSIVE_NO_OBSERVED_MOTION":"OBSERVED_REAL_SDL_DELTAS_WITH_SYNTHETIC_OS_MOTION");
        cycles.add(item);report.put("cycles",cycles);event("windows-cycle-ended",item);
        check("end-cycle-"+cycle,ended && !Boolean.TRUE.equals(prop(adapter,"active")),"CONFIRMED_COMPONENT_DEFECT",safeState());
        if(!ended){finish();return;}setPhase("windows-after-cycle");
    }
    void cursorState(String key)throws Throwable {
        buffer(cursor).putInt(0,24);
        int ok=number(win("GetCursorInfo",cursor));
        report.put(key,Map.of("GetCursorInfoReturn",ok,"flags",buffer(cursor).getInt(4),"hCursor",Long.toHexString(buffer(cursor).getLong(8)),"screenX",buffer(cursor).getInt(16),"screenY",buffer(cursor).getInt(20)));
    }
    @Override void closeFfm(){
        if(ffi!=null && savedCursor)try {
            if(adapter==null || !Boolean.TRUE.equals(prop(adapter,"active"))) {
                boolean moved=number(win("SetCursorPos",originalX,originalY))!=0;
                boolean read=number(win("GetCursorPos",point))!=0;
                report.put("originalCursorRestored",moved && read && buffer(point).getInt(0)==originalX && buffer(point).getInt(4)==originalY);
            }else report.put("originalCursorRestoreSkipped","Adapter remains active after release failure");
        }catch(Throwable t){report.put("cursorRestoreException",trace(t));}
        super.closeFfm();
    }
}
