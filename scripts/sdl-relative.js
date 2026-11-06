// Относительный ввод SDL2: проверка DLL выполняется один раз; движение использует готовые FFM-дескрипторы.
"use strict";
var knownHash = "cd1ad4237499606b174a190d9b7943e2b36f14c2f94fd119a36c877bb6e857d5"; // Проверенная DLL Mindustry 160.7, SDL 2.32.8.
var templates = {"get": {"hex": "4885c974088b05????????89014885d274088b05????????89028b15????????48c705????????0000000085d27e39488b05????????4863ca31d24c8d04c883e101740c8b50044883c0084c39c0740f0b50044883c0100b50fc4c39c075f189d0c3660f1f44000031d289d0c3", "rip": [[7, 11], [20, 24], [28, 32], [35, 43], [50, 54]], "calls": []}, "set": {"hex": "56534883ec2889cbe8????????391d????????4889c6747185db0f85a00000008b15????????85d2746ec705????????00000000c705????????0000000048c705????????000000004885f6742a4889f1e8????????448b05????????4889f18b15????????41b901000000e8????????31c9e8????????31c9e8????????b900040000e8????????31c04883c4285b5ec3660f1f440000488b05????????4885c0749031c9ffd0c705????????0000000048c705????????00000000eb8a9048833d????????00746e31d2488d0d????????e8????????85c00f84c8000000c705????????0100000031c9891d????????48c705????????00000000e8????????4885f60f8474ffffff4889f1e8????????8b05????????85c075534889f1e8????????31c9e8????????e94effffff0f1f8000000000488b05????????4885c0741289d9ffd085c0799e48833d????????00758a488d0d????????4883c4285b5ee9????????0f1f8400000000008b462c4889f141b9010000004189c041c1e81f4101c08b462841d1f889c2c1ea1f01c2d1fae8????????4889f1e8????????eb810f1f4000488b05????????4885c07590eb96", "rip": [[15, 19], [34, 38], [44, 52], [54, 62], [65, 73], [89, 93], [98, 102], [155, 159], [170, 178], [181, 189], [195, 200], [207, 211], [226, 234], [238, 242], [245, 253], [277, 281], [315, 319], [335, 340], [345, 349], [427, 431]], "calls": [[9, 13], [82, 86], [109, 113], [116, 120], [123, 127], [133, 137], [212, 216], [254, 258], [271, 275], [289, 293], [296, 300], [356, 360], [406, 410], [414, 418]]}, "mode": {"hex": "8b05????????c3", "rip": [[2, 6]], "calls": []}}; // Машинные шаблоны ниже допускают изменение только адресных операндов, а не логики инструкций.

// ПРОВЕРКА PE И ОГРАНИЧЕННОЕ РАСПОЗНАВАНИЕ SDL DYNAPI
exports.inspect = function(bytes) { // Ничего не загружает и не вызывает: принимает байты уже установленной DLL.
    var messages = Object.create(null); // Повторные проверки PE используют готовый перевод, не обращаясь к Java Bundle внутри каждого прохода.
    function message(key) { return messages[key] || (messages[key] = Core.bundle.get(key)); } // Кэш живёт только во время однократного анализа файла.
    function need(ok, message) { if (!ok) throw new Error("SDL: " + message); } // Любая неоднозначность запрещает дальнейшую подготовку вызова.
    function bound(p, n) { need(p >= 0 && n >= 0 && p + n <= bytes.length, message("buildwheel.sdl.pe.bounds")); } // Проверяем границы до каждого чтения.
    function u8(p) { bound(p, 1); return bytes[p] & 255; } // Java byte имеет знак; далее работаем с беззнаковыми значениями.
    function u16(p) { return u8(p) + u8(p + 1) * 256; } // Поля PE записаны в little endian.
    function u32(p) { return u16(p) + u16(p + 2) * 65536; } // Не используем знаковый сдвиг для адресов и размеров.
    var sections = [], functions = {}, entries = []; // Индексы существуют только во время подготовки адаптера.
    function section(r, n, flag) { // Находим целиком содержащую диапазон секцию с нужными правами.
        for (var i = 0; i < sections.length; i++) { var s = sections[i]; if (r >= s.rva && r + n <= s.rva + s.size && (!flag || (s.flags & flag) != 0)) return s; }
        throw new Error(message("buildwheel.sdl.pe.section"));
    }
    function offset(r, n) { var s = section(r, n, 0); need(r - s.rva + n <= s.rawSize, message("buildwheel.sdl.pe.section-bytes")); return s.raw + r - s.rva; } // BSS разрешён как данные, но не как исходный машинный код.
    function ascii(r, expected) { var p = offset(r, expected.length + 1); for (var i = 0; i < expected.length; i++) if (u8(p + i) != expected.charCodeAt(i)) return false; return u8(p + expected.length) == 0; } // Строки SDL служат дополнительными смысловыми якорями.
    function rel(r, at, next) { var v = u32(offset(r + at, 4)); return r + next + (v >= 2147483648 ? v - 4294967296 : v); } // Вычисляем цель RIP-relative инструкции или rel32-перехода.
    function match(r, hex) { var p = offset(r, hex.length / 2); for (var i = 0; i < hex.length; i += 2) if (hex.charAt(i) != "?" && u8(p + i / 2) != parseInt(hex.substr(i, 2), 16)) return false; return true; } // Полный шаблон тела, а не короткий похожий префикс.
    need(bytes.length >= 256 && bytes.length <= 33554432 && u16(0) == 0x5a4d, message("buildwheel.sdl.pe.file")); // Ограничиваем размер и проверяем DOS-заголовок.
    var pe = u32(60); need(u32(pe) == 0x4550 && u16(pe + 4) == 0x8664, message("buildwheel.sdl.pe.arch")); // Другие архитектуры отключаются без нативных вызовов.
    var count = u16(pe + 6), optSize = u16(pe + 20), opt = pe + 24; // Читаем расположение PE32+ и таблицы секций.
    need(count > 0 && count <= 32 && optSize >= 240 && u16(opt) == 0x20b, message("buildwheel.sdl.pe.header")); // Смещения каталогов имеют смысл только в этой структуре.
    var imageSize = u32(opt + 56), headersSize = u32(opt + 60); need(imageSize > 0 && imageSize <= 67108864 && headersSize >= opt + optSize + count * 40 && headersSize <= 4096, message("buildwheel.sdl.pe.sizes")); // Поддерживаем заголовки в первой отображённой странице PE.
    for (var i = 0; i < count; i++) { // Секции не должны перекрываться ни в образе, ни в файле.
        var p = opt + optSize + i * 40, s = {rva: u32(p + 12), size: Math.max(u32(p + 8), u32(p + 16)), raw: u32(p + 20), rawSize: u32(p + 16), flags: u32(p + 36)};
        need(s.rva + s.size <= imageSize, message("buildwheel.sdl.pe.section-bounds")); bound(s.raw, s.rawSize);
        for (var j = 0; j < sections.length; j++) { var old = sections[j]; need(s.rva >= old.rva + old.size || old.rva >= s.rva + s.size, message("buildwheel.sdl.pe.section-overlap")); }
        sections.push(s); // Сохраняем только границы и права доступа.
    }
    var pd = u32(opt + 112 + 3 * 8), pdSize = u32(opt + 116 + 3 * 8); // Каталог исключений x64 содержит границы машинных функций.
    need(pdSize > 0 && pdSize % 12 == 0 && pdSize / 12 < 20000, message("buildwheel.sdl.pe.pdata"));
    var previousEnd = 0; // Некорректная или пересекающаяся таблица не используется для поиска.
    for (var n = 0; n < pdSize; n += 12) {
        var at = offset(pd + n, 12), a = u32(at), b = u32(at + 4); // Начало и исключающий конец одной функции.
        need(a >= previousEnd && b > a, message("buildwheel.sdl.pe.pdata-order")); section(a, b - a, 0x20000000); offset(u32(at + 8), 4);
        functions[a] = b - a; entries.push(a); previousEnd = b; // Быстрый путь тоже проверяет границы функций.
    }
    function exported(name) { // Ищем штатные JNI-якоря, не требуя экспорта внутренних функций SDL.
        var d = u32(opt + 112), q = offset(d, 40), total = u32(q + 24), names = u32(q + 32), ords = u32(q + 36), funcs = u32(q + 28), found = [];
        need(total > 0 && total <= 10000, message("buildwheel.sdl.pe.exports"));
        for (var k = 0; k < total; k++) if (ascii(u32(offset(names + k * 4, 4)), name)) { var ordinal = u16(offset(ords + k * 2, 2)); need(ordinal < u32(q + 20), message("buildwheel.sdl.pe.ordinal")); found.push(u32(offset(funcs + ordinal * 4, 4))); }
        need(found.length == 1, message("buildwheel.sdl.pe.jni-anchor")); return found[0];
    }
    function jniTarget(name, prefix) { var r = exported("Java_arc_backend_sdl_jni_SDL_SDL_1" + name); need(functions[r] == 8 && match(r, prefix + "e9????????"), Core.bundle.format("buildwheel.sdl.jni-changed", name)); return rel(r, 4, 8); } // При новом виде обёртки не пытаемся угадать переход.
    function slot(r) { need(functions[r] == 7 && match(r, "48ff25????????"), message("buildwheel.sdl.pe.dynapi-wrapper")); var target = rel(r, 3, 7); section(target, 8, 0x80000000); need(target % 8 == 0, message("buildwheel.sdl.pe.dynapi-alignment")); return target; }
    var cursor = jniTarget("SetCursor", "4c89c1"), system = jniTarget("CreateSystemCursor", "4489c1"), cursorSlot = slot(cursor); // Два независимых штатных JNI-метода подтверждают общую таблицу.
    need(slot(system) == cursorSlot - 8, message("buildwheel.sdl.pe.dynapi-link"));
    function stub(target) { var found = []; for (var k = 0; k < entries.length; k++) { var r = entries[k]; if (functions[r] == 7 && match(r, "48ff25????????") && rel(r, 3, 7) == target) found.push(r); } need(found.length == 1, message("buildwheel.sdl.pe.dynapi-ambiguity")); return found[0]; }
    function body(key, hint) { // Для известного хеша проверяем конкретный RVA; для неизвестного ищем единственное целое тело.
        var t = templates[key], found = [], candidates = hint == null ? entries : [hint];
        for (var k = 0; k < candidates.length; k++) { var r = candidates[k]; if (functions[r] == t.hex.length / 2 && match(r, t.hex)) found.push(r); }
        need(found.length == 1, Core.bundle.format("buildwheel.sdl.template", key)); return found[0];
    }
    var digest = java.security.MessageDigest.getInstance("SHA-256").digest(bytes), hash = ""; // Хеширование выполняет Java, вне обработки мыши.
    for (var k = 0; k < digest.length; k++) hash += ("0" + (digest[k] & 255).toString(16)).slice(-2);
    var fast = hash == knownHash, get = body("get", fast ? 0x4eab0 : null), set = body("set", fast ? 0x4f710 : null); // Неизвестная DLL не получает адресов из прежней версии.
    var rawX = rel(get, 7, 11), rawY = rel(get, 20, 24), modeVariable = rel(set, 15, 19); // Смысловые связи между операндами подтверждают найденные тела.
    var warpVariable = rel(set, 34, 38); // SDL2 способен заменить нативный relative mode эмуляцией через перемещение указателя.
    need(rawX % 4 == 0 && modeVariable % 4 == 0 && warpVariable % 4 == 0 && modeVariable != warpVariable && (modeVariable >= rawX + 8 || modeVariable + 4 <= rawX), message("buildwheel.sdl.pe.field-layout")); // FFM читает именно отдельные 32-битные значения.
    need(rel(set, 44, 52) == warpVariable && rel(set, 226, 234) == warpVariable && rel(set, 277, 281) == warpVariable, message("buildwheel.sdl.pe.warp-flag")); // Подтверждаем поле по чтению, сбросу и установке внутри полного шаблона.
    need(rawY == rawX + 4 && rel(get, 35, 43) == rawX, message("buildwheel.sdl.pe.motion-state")); section(rawX, 8, 0x80000000); section(modeVariable, 4, 0x80000000);
    for (var k = 0; k < templates.get.rip.length; k++) { var operand = templates.get.rip[k]; section(rel(get, operand[0], operand[1]), operand[0] == 50 ? 8 : 4, 0x80000000); } // Все поля getter должны принадлежать доступным данным, а не машинному коду.
    for (var k = 0; k < templates.set.rip.length; k++) { var operand = templates.set.rip[k]; if (operand[0] != 207 && operand[0] != 345) section(rel(set, operand[0], operand[1]), 8, 0x80000000); } // Адреса остальных полей setter тоже проверяем до вызова.
    need(ascii(rel(set, 207, 211), "SDL_MOUSE_RELATIVE_MODE_WARP") && ascii(rel(set, 345, 349), "No relative mode implementation available"), message("buildwheel.sdl.pe.string-anchors"));
    for (var k = 0; k < templates.set.calls.length; k++) { var c = templates.set.calls[k], target = rel(set, c[0], c[1]); need(functions[target] != null, message("buildwheel.sdl.pe.call-target")); } // Не разрешаем переход в данные или середину инструкции.
    var modes = []; // Getter режима обязан читать ту же переменную, которую сравнивает setter.
    for (var k = 0; k < entries.length; k++) { var r = entries[k]; if (functions[r] == 7 && match(r, templates.mode.hex) && rel(r, 2, 6) == modeVariable) modes.push(r); }
    need(modes.length == 1, message("buildwheel.sdl.pe.mode-getter"));
    return {hash: hash, automatic: !fast, imageSize: imageSize, headersSize: headersSize, baseOffset: opt + 24, warpVariable: warpVariable, get: stub(cursorSlot - 56), set: stub(cursorSlot - 40), mode: stub(cursorSlot - 32), realGet: get, realSet: set, realMode: modes[0], getSlot: cursorSlot - 56, setSlot: cursorSlot - 40, modeSlot: cursorSlot - 32, anchor: exported("Java_arc_backend_sdl_jni_SDL_SDL_1SetCursor"), functions: functions, offset: offset}; // Замыкания используются только при проверке загруженного образа.
};

// LINUX: ПРОВЕРКА УЖЕ ЗАГРУЖЕННЫХ ЭКСПОРТОВ ПО КАРТЕ ПАМЯТИ
exports.linuxImage = function(text, addresses, minimum) { // Ничего не загружает и не вызывает: проверяет адреса, найденные loaderLookup.
    var mappings = [], lines = String(text).split(/\r?\n/); // procfs описывает отображения именно текущего процесса.
    for (var i = 0; i < lines.length; i++) {
        var m = /^([0-9a-f]+)-([0-9a-f]+)\s+(\S+)\s+\S+\s+\S+\s+\d+\s*(.*)$/.exec(lines[i]);
        if (m == null || m[3].indexOf("x") < 0 || m[4].charAt(0) != "/") continue; // Анонимные области и данные не служат адресами SDL.
        var path = m[4].replace(/\\([0-7][0-7][0-7])/g, (all, code) => String.fromCharCode(parseInt(code, 8))); // procfs экранирует пробелы и обратную косую черту восьмеричными кодами.
        if (path.indexOf(" (deleted)") >= 0) continue; // Не пытаемся подтверждать уже заменённую библиотеку.
        mappings.push({start: parseInt(m[1], 16), end: parseInt(m[2], 16), path: path});
    }
    var owner = null, count = 0;
    for (var key in addresses) {
        var address = addresses[key], found = []; // Экспорты должны принадлежать одному исполняемому отображению, а не только совпадать именем файла.
        if (!(address > 0 && address <= 9007199254740991 && Math.floor(address) == address)) throw new Error(Core.bundle.format("buildwheel.sdl.linux-address", key));
        for (var i = 0; i < mappings.length; i++) if (address >= mappings[i].start && address < mappings[i].end) found.push(mappings[i]);
        if (found.length != 1) throw new Error(Core.bundle.format("buildwheel.sdl.linux-map", key));
        var image = found[0];
        if (owner != null && (image.path != owner.path || image.start != owner.start || image.end != owner.end)) throw new Error(Core.bundle.get("buildwheel.sdl.linux.images"));
        owner = image; count++;
    }
    if (count < (minimum == null ? 7 : minimum) || owner == null) throw new Error(Core.bundle.get("buildwheel.sdl.linux.exports"));
    return owner;
};

// FFM: ПОДГОТОВКА ПЛАТФОРМЕННЫХ АДРЕСОВ И ОБЩЕЕ ВЛАДЕНИЕ РЕЖИМОМ
exports.create = function() {
    var result = {available: false, active: false, reason: Core.bundle.get("buildwheel.sdl.unsupported")}, arena = null, owned = false; // Отказ оставляет обычный ввод и не включает прежний ограничитель.
    var closing = false, disposing = false, releaseListener = null; // Отложенное освобождение Cocoa не разрешает повторный захват и сохраняет память FFM до завершения.
    result.begin = () => false; result.sample = () => false; result.end = () => true; result.dispose = () => {}; // Безопасные методы для других ОС, Java и backend.
    if ((!OS.isWindows && !OS.isLinux && !OS.isMac) || String(Core.input.getClass().getName()) != "arc.backend.sdl.SdlInput" || typeof Core.app.getWindow != "function") return result;
    try {
        var type = n => java.lang.Class.forName(n), F = Packages.java.lang.foreign, seg = type("java.lang.foreign.MemorySegment"), layout = type("java.lang.foreign.MemoryLayout"), look = type("java.lang.foreign.SymbolLookup"), arenas = type("java.lang.foreign.Arena"), linkerType = type("java.lang.foreign.Linker"); // Старые Java завершают подготовку здесь, до чтения нативной памяти.
        var address = F.ValueLayout.ADDRESS, integer = F.ValueLayout.JAVA_INT, byteLayout = F.ValueLayout.JAVA_BYTE; // ABI SDL2: bool/int/Uint32 имеют размер четыре байта.
        var zero = new java.lang.Long("0"), four = new java.lang.Long("4"), eight = new java.lang.Long("8"), objectType = type("java.lang.Object"); // Точные Java-числа не создаются при каждом движении.
        function array(items) { var a = java.lang.reflect.Array.newInstance(objectType, items.length); for (var i = 0; i < items.length; i++) a[i] = items[i]; return a; } // Постоянные массивы аргументов для reflection и MethodHandle.
        var none = array([]), getAddress = seg.getMethod("address", []), ofAddress = seg.getMethod("ofAddress", [java.lang.Long.TYPE]), reinterpret = seg.getMethod("reinterpret", [java.lang.Long.TYPE]);
        var getInt = seg.getMethod("get", [type("java.lang.foreign.ValueLayout$OfInt"), java.lang.Long.TYPE]), getPointer = seg.getMethod("get", [type("java.lang.foreign.AddressLayout"), java.lang.Long.TYPE]), copy = seg.getMethod("toArray", [type("java.lang.foreign.ValueLayout$OfByte")]);
        var close = arenas.getMethod("close", []), allocate = arenas.getMethod("allocate", [java.lang.Long.TYPE, java.lang.Long.TYPE]);
        arena = arenas.getMethod("ofShared", []).invoke(null, none); // Буферы живут до DisposeEvent, а не до конца одного кадра.
        var linker = linkerType.getMethod("nativeLinker", []).invoke(null, none), downcall = linkerType.getMethod("downcallHandle", [seg, type("java.lang.foreign.FunctionDescriptor"), type("[Ljava.lang.foreign.Linker$Option;")]);
        var options = java.lang.reflect.Array.newInstance(type("java.lang.foreign.Linker$Option"), 0); // Дополнительных режимов вызова не требуется.
        function bind(pointer, returns, args) { return downcall.invoke(linker, array([pointer, F.FunctionDescriptor.of(returns, args), options])); } // Адрес передаём только после всех проверок ниже.
        function addr(p) { return Number(getAddress.invoke(p, none)); } // Преобразуем адрес FFM в число; допустимый диапазон затем проверяет платформенный адаптер.
        var symbols = look.getMethod("loaderLookup", []).invoke(null, none), find = look.getMethod("find", [type("java.lang.String")]); // Ищем в уже загруженных JNI-библиотеках, не открывая второй экземпляр SDL.
        var anchor = find.invoke(symbols, ["Java_arc_backend_sdl_jni_SDL_SDL_1SetCursor"]).orElseThrow();
        var SDL = Packages.arc.backend.sdl.jni.SDL, window = Core.app.getWindow(), readArgs = array([integer, zero]);
        function windowsBindings() {
            var kernel = F.SymbolLookup.libraryLookup("kernel32.dll", arena); // Штатные экспортированные функции Windows нужны лишь для установления подлинного загруженного файла.
            var module = allocate.invoke(arena, [eight, eight]), path = allocate.invoke(arena, [new java.lang.Long("65536"), new java.lang.Long("2")]);
            var moduleOf = bind(kernel.find("GetModuleHandleExW").orElseThrow(), integer, [integer, address, address]), filename = bind(kernel.find("GetModuleFileNameW").orElseThrow(), integer, [address, address, integer]);
            if (Number(moduleOf.invokeWithArguments(array([new java.lang.Integer("6"), anchor, module]))) == 0) throw new Error(Core.bundle.get("buildwheel.sdl.windows.module")); // FROM_ADDRESS|UNCHANGED_REFCOUNT не меняет владение библиотекой.
            var modulePointer = getPointer.invoke(module, [address, zero]), base = addr(modulePointer); // Это фактическая база с учётом ASLR.
            var moduleInfo = allocate.invoke(arena, [new java.lang.Long("24"), eight]); // MODULEINFO x64 содержит подлинный размер образа, полученный от Windows.
            var describe = bind(kernel.find("K32GetModuleInformation").orElseThrow(), integer, [address, address, address, integer]);
            var process = ofAddress.invoke(null, [new java.lang.Long("-1")]); // Псевдодескриптор текущего процесса не требует открытия или закрытия HANDLE.
            if (Number(describe.invokeWithArguments(array([process, modulePointer, moduleInfo, new java.lang.Integer("24")]))) == 0) throw new Error(Core.bundle.get("buildwheel.sdl.windows.bounds"));
            var liveSize = Number(getInt.invoke(moduleInfo, [integer, eight])); // Не доверяем размеру из файла при чтении живой памяти.
            var length = Number(filename.invokeWithArguments(array([modulePointer, path, new java.lang.Integer("32768")]))); // UTF-16 путь именно загруженной DLL.
            if (length <= 0 || length >= 32768) throw new Error(Core.bundle.get("buildwheel.sdl.windows.path"));
            var getString = seg.getMethod("getString", [java.lang.Long.TYPE, type("java.nio.charset.Charset")]), file = String(getString.invoke(path, [zero, java.nio.charset.StandardCharsets.UTF_16LE]));
            var fileBytes = java.nio.file.Files.readAllBytes(java.nio.file.Paths.get(file)), info = exports.inspect(fileBytes); // Хеш, PE и распознавание выполняются однократно.
            if (liveSize != info.imageSize || addr(getPointer.invoke(moduleInfo, [address, zero])) != base) throw new Error(Core.bundle.get("buildwheel.sdl.windows.image"));
            if (addr(anchor) != base + info.anchor) throw new Error(Core.bundle.get("buildwheel.sdl.windows.anchor"));
            function memory(r, size) { if (r < 0 || size < 0 || r + size > liveSize) throw new Error(Core.bundle.get("buildwheel.sdl.windows.read")); return reinterpret.invoke(ofAddress.invoke(null, [new java.lang.Long(String(base + r))]), [new java.lang.Long(String(size))]); } // Любой диапазон дополнительно ограничен настоящим размером Windows-модуля.
            var liveHeaders = copy.invoke(memory(0, info.headersSize), [byteLayout]); // Первая страница заголовков отображена загрузчиком Windows.
            var headerBase = 0; for (var i = 0; i < 8; i++) headerBase += (liveHeaders[info.baseOffset + i] & 255) * Math.pow(256, i); // Загрузчик Windows заменяет ImageBase фактической базой при ASLR.
            if (headerBase != base) throw new Error(Core.bundle.get("buildwheel.sdl.windows.base"));
            for (var i = 0; i < liveHeaders.length; i++) if ((i < info.baseOffset || i >= info.baseOffset + 8) && liveHeaders[i] != fileBytes[i]) throw new Error(Core.bundle.format("buildwheel.sdl.live-header", i.toString(16))); // Остальные поля и секции должны совпасть до чтения производных RVA.
            function same(r, size) { var live = copy.invoke(memory(r, size), [byteLayout]), p = info.offset(r, size); for (var i = 0; i < size; i++) if (live[i] != fileBytes[p + i]) throw new Error(Core.bundle.get("buildwheel.sdl.windows.code")); } // Выбранные RIP-relative тела не содержат ASLR-релокаций.
            var names = [[info.get, info.getSlot, info.realGet], [info.set, info.setSlot, info.realSet], [info.mode, info.modeSlot, info.realMode]];
            for (var i = 0; i < names.length; i++) { var n = names[i]; same(n[0], 7); same(n[2], info.functions[n[2]]); if (addr(getPointer.invoke(memory(n[1], 8), [address, zero])) != base + n[2]) throw new Error(Core.bundle.get("buildwheel.sdl.windows.dynapi")); } // Чужой SDL_DYNAMIC_API не захватываем.
            var set = bind(memory(info.set, 7), integer, [integer]), get = bind(memory(info.get, 7), integer, [address, address]), mode = bind(memory(info.mode, 7), integer, []); // Первый вызов приватного SDL разрешён только теперь.
            var flag = memory(info.warpVariable, 4);
            var nativeFunctions = {set: set, get: get, mode: mode, hash: info.hash, automatic: info.automatic, description: Core.bundle.get(info.automatic ? "buildwheel.sdl.discovery.automatic" : "buildwheel.sdl.discovery.known"), allowed: () => Number(getInt.invoke(flag, readArgs)) == 0};
            info = null; fileBytes = null; names = null; liveHeaders = null; moduleOf = null; filename = null; describe = null; kernel = null;
            return nativeFunctions;
        }
        function linuxBindings() { // Публичные SDL2-экспорты берём из зависимостей уже загруженного JNI-модуля.
            if (!java.lang.Thread.currentThread().equals(Core.app.getMainThread())) throw new Error(Core.bundle.get("buildwheel.sdl.linux.thread")); // Текущий GL-контекст хранится в TLS потока, создавшего окно игры.
            var names = {set: "SDL_SetRelativeMouseMode", get: "SDL_GetRelativeMouseState", mode: "SDL_GetRelativeMouseMode", wasInit: "SDL_WasInit", currentWindow: "SDL_GL_GetCurrentWindow", version: "SDL_GetVersion"};
            var pointers = {}, addresses = {};
            for (var key in names) { pointers[key] = find.invoke(symbols, [names[key]]).orElseThrow(); addresses[key] = addr(pointers[key]); } // Отсутствие экспортов, в том числе у статической сборки, даёт безопасный отказ.
            var maps = String(java.nio.file.Files.readString(java.nio.file.Paths.get("/proc/self/maps")));
            var owner = exports.linuxImage(maps, addresses, 6); // Не используем dlopen("libSDL2.so"): второй экземпляр SDL не загружается.
            exports.linuxImage(maps, {anchor: addr(anchor)}, 1); // JNI-якорь тоже должен находиться в доступном исполняемом образе.
            var version = java.lang.reflect.Array.newInstance(java.lang.Integer.TYPE, 3); SDL.SDL_GetVersion(version);
            if (version[0] != 2) throw new Error(Core.bundle.get("buildwheel.sdl.linux.abi")); // Версия системной SDL может отличаться от Windows 2.32.8.
            var wasInit = bind(pointers.wasInit, integer, [integer]), currentWindow = bind(pointers.currentWindow, address, []); // Getter без аргументов читает только собственное состояние SDL, не принимая чужой SDL_Window.
            var expectedWindow = Number(window); // Адрес Arc нужен только для сравнения; нативному адаптеру его не передаём.
            if (!(expectedWindow > 0 && expectedWindow <= 9007199254740991 && Math.floor(expectedWindow) == expectedWindow) || Core.app.getWindow() != window) throw new Error(Core.bundle.get("buildwheel.sdl.linux.window"));
            if ((Number(wasInit.invokeWithArguments(array([new java.lang.Integer("32")]))) & 32) == 0) throw new Error(Core.bundle.get("buildwheel.sdl.linux.video"));
            if (addr(currentWindow.invokeWithArguments(none)) != expectedWindow) throw new Error(Core.bundle.get("buildwheel.sdl.linux.context")); // SDL возвращает собственное окно; сравнение адресов не разыменовывает окно Arc.
            var found = {set: bind(pointers.set, integer, [integer]), get: bind(pointers.get, integer, [address, address]), mode: bind(pointers.mode, integer, []), description: "Linux SDL2 " + version[0] + "." + version[1] + "." + version[2], image: owner.path, allowed: () => true}; // Публичный Linux API не раскрывает внутренний флаг warp fallback.
            try { // Разовый перенос обычного указателя не является условием доступности относительного ввода.
                var warp = find.invoke(symbols, ["SDL_WarpMouseInWindow"]).orElseThrow();
                exports.linuxImage(maps, {warp: addr(warp), currentWindow: addresses.currentWindow}, 2); // Принадлежность окна уже проверена; дополнительный экспорт должен находиться в том же образе SDL.
                found.warp = downcall.invoke(linker, array([warp, F.FunctionDescriptor.ofVoid([address, integer, integer]), options])); // Публичная SDL-функция принимает окно и координаты от верхнего левого угла.
            } catch (unsupportedWarp) {} // Отсутствующий экспорт отключает только сдвиг обычного указателя.
            maps = null; addresses = null; pointers = null; names = null; return found; // Текст карты памяти не остаётся в рабочих замыканиях.
        }
        // MACOS: ЭКСПОРТЫ ЗАГРУЖЕННОЙ SDL И ПРОВЕРКА ОТЛОЖЕННОГО ВХОДА COCOA
        function macBindings() {
            if (!java.lang.Thread.currentThread().equals(Core.app.getMainThread()) || Number(layout.getMethod("byteSize", []).invoke(address, none)) != 8) throw new Error(Core.bundle.get("buildwheel.sdl.mac.thread")); // Публичный MemoryLayout обходит закрытый класс реализации Java; AppKit вызывается только основным потоком.
            var version = java.lang.reflect.Array.newInstance(java.lang.Integer.TYPE, 3); SDL.SDL_GetVersion(version);
            if (version[0] != 2 || version[1] != 0 || version[2] != 16) throw new Error(Core.bundle.get("buildwheel.sdl.mac.version")); // В другой версии сначала требуется проверить правила отложенного включения и ABI оконной информации.
            var names = {set: "SDL_SetRelativeMouseMode", get: "SDL_GetRelativeMouseState", mode: "SDL_GetRelativeMouseMode", currentWindow: "SDL_GL_GetCurrentWindow", wasInit: "SDL_WasInit", mouseFocus: "SDL_GetMouseFocus", keyboardFocus: "SDL_GetKeyboardFocus", wmInfo: "SDL_GetWindowWMInfo", hint: "SDL_GetHintBoolean", clear: "SDL_ClearError", driver: "SDL_GetCurrentVideoDriver"};
            var pointers = {}, symbolArgs = array([null]); // Поиск идёт только в уже загруженных JNI-библиотеках и их зависимостях.
            function symbol(name) { symbolArgs[0] = name; return find.invoke(symbols, symbolArgs).orElseThrow(); }
            for (var key in names) pointers[key] = symbol(names[key]);
            var system = linkerType.getMethod("defaultLookup", []).invoke(linker, none), dladdr = bind(find.invoke(system, ["dladdr"]).orElseThrow(), integer, [address, address]); // Штатный dyld сообщает владельца адреса; новую SDL не загружаем.
            var info = allocate.invoke(arena, [new java.lang.Long("32"), eight]), infoArgs = array([anchor, info]); // Dl_info содержит четыре 64-битных указателя.
            var getString = seg.getMethod("getString", [java.lang.Long.TYPE]), stringSpace = new java.lang.Long("4096");
            function number(p) { var n = addr(p); if (!(n > 0 && n <= 9007199254740991 && Math.floor(n) == n)) throw new Error(Core.bundle.get("buildwheel.sdl.mac.address")); return n; } // Не допускаем потери точности адреса при переходе в JavaScript.
            function string(p) { number(p); return String(getString.invoke(reinterpret.invoke(p, [stringSpace]), [zero])); } // Строки принадлежат dyld, SDL или Objective-C runtime; чтение ограничено 4096 байтами.
            function image(p, name) {
                var value = number(p); infoArgs[0] = p;
                if (Number(dladdr.invokeWithArguments(infoArgs)) == 0) throw new Error(Core.bundle.get("buildwheel.sdl.mac.owner"));
                var path = string(getPointer.invoke(info, [address, zero])), base = number(getPointer.invoke(info, [address, eight]));
                if (name != null) { // Для экспортов дополнительно проверяем начало и имя символа, а не только ближайшую библиотеку.
                    var label = string(getPointer.invoke(info, [address, new java.lang.Long("16")]));
                    if (label.charAt(0) == "_") label = label.substring(1);
                    if (label != name || number(getPointer.invoke(info, [address, new java.lang.Long("24")])) != value) throw new Error(Core.bundle.format("buildwheel.sdl.mac-symbol", name));
                }
                return {path: path, base: base};
            }
            var owner = image(anchor, "Java_arc_backend_sdl_jni_SDL_SDL_1SetCursor");
            function sameImage(p, name) { var found = image(p, name); if (found.base != owner.base || found.path != owner.path) throw new Error(Core.bundle.get("buildwheel.sdl.mac.image")); } // База dyld уже учитывает ASLR.
            for (var key in names) sameImage(pointers[key], names[key]); // Ни одна найденная функция SDL ещё не вызывалась.
            var currentWindow = bind(pointers.currentWindow, address, []), wasInit = bind(pointers.wasInit, integer, [integer]), driver = bind(pointers.driver, address, []);
            var windowPointer = ofAddress.invoke(null, [new java.lang.Long(String(window))]), expectedWindow = number(windowPointer); // На этом этапе окно используется только как число для сравнения.
            if ((Number(wasInit.invokeWithArguments(array([new java.lang.Integer("32")]))) & 32) == 0 || addr(currentWindow.invokeWithArguments(none)) != expectedWindow || string(driver.invokeWithArguments(none)) != "cocoa") throw new Error(Core.bundle.get("buildwheel.sdl.mac.context"));
            var wmInfo = bind(pointers.wmInfo, integer, [address, address]), wm = allocate.invoke(arena, [new java.lang.Long("72"), eight]); // Публичный SDL_SysWMinfo: версия, subsystem и union размером 64 байта.
            var wmBytes = seg.getMethod("asByteBuffer", []).invoke(wm, none).order(java.nio.ByteOrder.nativeOrder());
            wmBytes.put(0, version[0]); wmBytes.put(1, version[1]); wmBytes.put(2, version[2]);
            var wmArgs = array([windowPointer, wm]); // Указатель передаём SDL только после проверки её образа и собственного GL-окна.
            function cocoaWindow() { if (Core.app.getWindow() != window || Number(wmInfo.invokeWithArguments(wmArgs)) != 1 || wmBytes.getInt(4) != 4) throw new Error(Core.bundle.get("buildwheel.sdl.mac.window")); var p = getPointer.invoke(wm, [address, eight]); number(p); return p; }
            var nsWindow = cocoaWindow(), nsAddress = number(nsWindow);
            var objcNames = ["sel_registerName", "objc_msgSend", "object_getClass", "class_getInstanceMethod", "method_getTypeEncoding", "method_getImplementation"], objc = {}, objcOwner = null;
            for (var i = 0; i < objcNames.length; i++) { // Objective-C runtime уже загружен AppKit; его файлы могут находиться только в dyld shared cache.
                var name = objcNames[i], p = symbol(name), found = image(p, null);
                if (found.path != "/usr/lib/libobjc.A.dylib" || (objcOwner != null && found.base != objcOwner)) throw new Error(Core.bundle.get("buildwheel.sdl.mac.objc"));
                objcOwner = found.base; objc[name] = p;
            }
            var allocateString = arenas.getMethod("allocateFrom", [type("java.lang.String")]);
            function text(value) { return allocateString.invoke(arena, [value]); } // C-строки и массивы аргументов создаются при подготовке, а не при движении.
            var register = bind(objc.sel_registerName, address, [address]), send = bind(objc.objc_msgSend, address, [address, address]);
            var selector = register.invokeWithArguments(array([text("delegate")])), pendingSelector = register.invokeWithArguments(array([text("isMovingOrFocusClickPending")]));
            number(selector); number(pendingSelector);
            var delegateArgs = array([nsWindow, selector]), listener = send.invokeWithArguments(delegateArgs); number(listener);
            var classOf = bind(objc.object_getClass, address, [address]), methodOf = bind(objc.class_getInstanceMethod, address, [address, address]);
            var encoding = bind(objc.method_getTypeEncoding, address, [address]), implementation = bind(objc.method_getImplementation, address, [address]);
            var listenerArgs = array([listener]), listenerClass = classOf.invokeWithArguments(listenerArgs); number(listenerClass);
            var method = methodOf.invokeWithArguments(array([listenerClass, pendingSelector])); number(method);
            var methodArgs = array([method]), signature = string(encoding.invokeWithArguments(methodArgs));
            if (!/^[cB]16@0:8$/.test(signature)) throw new Error(Core.bundle.get("buildwheel.sdl.mac.signature")); // BOOL(self, selector): один байт результата и два указателя на обеих архитектурах.
            var imp = implementation.invokeWithArguments(methodArgs); sameImage(imp, null); // Адрес метода получен из runtime и принадлежит проверенной SDL, а не угадан по смещению.
            var pending = bind(objc.objc_msgSend, byteLayout, [address, address]), pendingArgs = array([listener, pendingSelector]); // Типизированная отправка сообщения сохраняет штатную диспетчеризацию Objective-C.
            var mouseFocus = bind(pointers.mouseFocus, address, []), keyboardFocus = bind(pointers.keyboardFocus, address, []);
            var hint = bind(pointers.hint, integer, [address, integer]), hintArgs = array([text("SDL_MOUSE_RELATIVE_MODE_WARP"), new java.lang.Integer("0")]);
            var clear = downcall.invoke(linker, array([pointers.clear, F.FunctionDescriptor.ofVoid([]), options]));
            function sameListener() {
                if (!java.lang.Thread.currentThread().equals(Core.app.getMainThread()) || Core.app.getWindow() != window || addr(cocoaWindow()) != nsAddress) return false;
                return addr(classOf.invokeWithArguments(listenerArgs)) == addr(listenerClass) && addr(implementation.invokeWithArguments(methodArgs)) == addr(imp);
            }
            function stable() {
                if (!sameListener()) return false;
                var current = send.invokeWithArguments(delegateArgs); // Проверяем свежий delegate перед использованием запомнённого обработчика.
                return addr(current) == addr(listener) && Number(pending.invokeWithArguments(pendingArgs)) == 0;
            }
            var found = {set: bind(pointers.set, integer, [integer]), get: bind(pointers.get, integer, [address, address]), mode: bind(pointers.mode, integer, []), description: "macOS Cocoa SDL2 2.0.16", image: owner.path};
            try { var warp = symbol("SDL_WarpMouseInWindow"); sameImage(warp, "SDL_WarpMouseInWindow"); found.warp = downcall.invoke(linker, array([warp, F.FunctionDescriptor.ofVoid([address, integer, integer]), options])); } catch (unsupportedWarp) {} // Разовый перенос разрешён только через экспорт уже подтверждённой SDL.
            found.ready = () => stable() && addr(mouseFocus.invokeWithArguments(none)) == expectedWindow && addr(keyboardFocus.invokeWithArguments(none)) == expectedWindow && Number(hint.invokeWithArguments(hintArgs)) == 0; // Отложенное включение и принудительный warp отвергаем до захвата.
            found.beforeBegin = () => clear.invokeWithArguments(none); // Отделяем новую ошибку CoreGraphics от прежних сообщений SDL.
            found.allowed = function() { var error = String(SDL.SDL_GetError()); found.rejection = "SDL Cocoa: " + (error.length > 0 ? error : Core.bundle.get("buildwheel.sdl.mac.listener")); return error.length == 0 && stable(); }; // В SDL 2.0.16 ошибка native-пути сохраняется даже после успешного warp fallback.
            found.valid = stable; // Замена окна, обработчика или ожидающий фокусный клик прекращают чтение относительного ввода.
            var deferredEnd = false, releaseError = ""; // SDL не должен сбросить свой флаг раньше, чем Cocoa действительно сможет отключить нативный режим.
            found.endReady = function() { if (!sameListener()) return true; if (Number(pending.invokeWithArguments(pendingArgs)) != 0) { deferredEnd = true; return false; } return !deferredEnd || addr(mouseFocus.invokeWithArguments(none)) == expectedWindow; }; // При pending ждём; замена внешнего delegate не мешает SDL освободить собственный обработчик.
            found.beforeEnd = () => clear.invokeWithArguments(none);
            found.checkEnd = function() { var error = String(SDL.SDL_GetError()); if (error.length > 0) releaseError = error; if (releaseError.length > 0) throw new Error(Core.bundle.format("buildwheel.sdl.cocoa-release", releaseError)); deferredEnd = false; }; // SDL 2.0.16 способен скрыть ошибку выключения за успешным return; такую ошибку не забываем при повторе.
            pointers = null; names = null; objc = null; objcNames = null; return found;
        }
        var nativeFunctions = OS.isWindows ? windowsBindings() : OS.isLinux ? linuxBindings() : macBindings();
        var set = nativeFunctions.set, get = nativeFunctions.get, mode = nativeFunctions.mode;
        var x = allocate.invoke(arena, [four, four]), y = allocate.invoke(arena, [four, four]), sampleArgs = array([x, y]); // Постоянные буферы исключают создание POINT/RECT и упаковку координат движения.
        var asBuffer = seg.getMethod("asByteBuffer", []), xBuffer = asBuffer.invoke(x, none).order(java.nio.ByteOrder.nativeOrder()), yBuffer = asBuffer.invoke(y, none).order(java.nio.ByteOrder.nativeOrder()); // Представления той же памяти создаём один раз, чтобы читать числа без reflection на каждом кадре.
        var on = array([new java.lang.Integer("1")]), off = array([new java.lang.Integer("0")]);
        function focused() { if (Core.app.getWindow() != window) return false; var flags = SDL.SDL_GetWindowFlags(window); return (flags & SDL.SDL_WINDOW_INPUT_FOCUS) != 0 && (flags & SDL.SDL_WINDOW_MINIMIZED) == 0; } // Не используем старое окно при его замене и не захватываем неактивное.
        result.absoluteMode = () => !owned && !closing && focused() && Number(mode.invokeWithArguments(none)) == 0; // Разовый перенос не вмешивается в собственный или чужой относительный режим.
        var warpArgs = null; // Аргументы обычного переноса не нужны, пока пользователь не открыл колесо у края экрана.
        result.warpAbsolute = function(screenX, screenY) {
            if (nativeFunctions.warp == null || !result.absoluteMode() || (nativeFunctions.valid != null && !nativeFunctions.valid())) return false; // В Cocoa не переносим указатель во время отложенного фокусного клика или замены оконного обработчика.
            if (warpArgs == null) warpArgs = array([ofAddress.invoke(null, [new java.lang.Long(String(window))]), null, null]); // Используем только подтверждённый указатель игрового окна.
            warpArgs[1] = new java.lang.Integer(String(screenX)); warpArgs[2] = new java.lang.Integer(String(Core.graphics.getHeight() - screenY)); // Это обратное преобразование SdlInput.handleInput для координат мыши.
            nativeFunctions.warp.invokeWithArguments(warpArgs); return true; // Синхронизацию Java-позиции выполняет общий разовый адаптер ниже.
        };
        function stopReleaseRetry() { if (releaseListener == null) return; var listener = releaseListener; releaseListener = null; Core.app.post(() => Core.app.removeListener(listener)); } // Удаление выполняется вне обхода слушателей приложения.
        function retryRelease() { // Дополнительный update существует только на время отложенного закрытия Cocoa.
            if (disposing || releaseListener != null) return;
            releaseListener = extend(ApplicationListener, {update: function() { if (closing && !disposing) result.end(); }, resume: function() { if (closing && !disposing) result.end(); }});
            Core.app.addListener(releaseListener);
        }
        result.end = function() { // Вызывается также при исключении между включением режима и его подтверждением.
            if (!owned) return true;
            var failure;
            for (var attempt = 0; attempt < 2; attempt++) try {
                if (nativeFunctions.endReady != null && !nativeFunctions.endReady()) { closing = true; retryRelease(); return false; } // Cocoa pending возвращает ложный успех при выключении; сохраняем владение до настоящего освобождения.
                if (nativeFunctions.beforeEnd != null) nativeFunctions.beforeEnd();
                if (Number(set.invokeWithArguments(off)) != 0 || Number(mode.invokeWithArguments(none)) != 0) throw new Error(Core.bundle.get("buildwheel.sdl.release"));
                if (nativeFunctions.checkEnd != null) nativeFunctions.checkEnd();
                owned = false; result.active = false; closing = false; stopReleaseRetry(); return true;
            } catch (error) { failure = error; } // Идемпотентное отключение можно повторить при единичном сбое.
            closing = false; stopReleaseRetry(); result.available = false; // После ошибки прекращаем автоматические повторы; владение и дескрипторы остаются для явного освобождения.
            var reason = String(failure); if (result.reason != reason) Log.err("BuildWheel: @", reason); result.reason = reason; return false; // Одинаковая ошибка не засоряет журнал при последующих событиях закрытия.
        };
        function fail(error) { result.available = false; result.reason = String(error); result.end(); Log.warn("BuildWheel SDL: @", result.reason); return false; } // Ошибка не включает старый Win32-ограничитель.
        result.begin = function() {
            if (!result.available || closing) return false;
            try { if (!focused()) return false; if (owned) return result.active; if (Number(mode.invokeWithArguments(none)) != 0) return false; if (nativeFunctions.ready != null && !nativeFunctions.ready()) return false; if (nativeFunctions.beforeBegin != null) nativeFunctions.beforeBegin(); owned = true; result.active = true; if (Number(set.invokeWithArguments(on)) != 0 || Number(mode.invokeWithArguments(none)) != 1) throw new Error(String(SDL.SDL_GetError())); if (!nativeFunctions.allowed()) throw new Error(nativeFunctions.rejection || Core.bundle.get("buildwheel.sdl.warp-rejected")); get.invokeWithArguments(sampleArgs); return true; } // Не забираем чужой режим; active также защищает незавершённый откат от открытия обычного колеса.
            catch (error) { return fail(error); }
        };
        result.sample = function(out) {
            if (!result.active) return false;
            try { if (!focused() || Number(mode.invokeWithArguments(none)) != 1) { result.end(); return false; } if (nativeFunctions.valid != null && !nativeFunctions.valid()) { result.end(); return false; } get.invokeWithArguments(sampleArgs); out.set(xBuffer.getInt(0), yBuffer.getInt(0)); return true; } // Один накопленный вектор на кадр; SDL Y направлен вниз.
            catch (error) { return fail(error); }
        };
        result.dispose = function() { disposing = true; var released = result.end(); stopReleaseRetry(); if (released && arena != null) { close.invoke(arena, none); arena = null; } result.available = false; }; // После Dispose не опрашиваем окно; при незавершённом освобождении память остаётся до завершения процесса.
        result.available = true; result.reason = ""; result.hash = nativeFunctions.hash; result.automatic = nativeFunctions.automatic; // Индексы PE и байты DLL после выхода не нужны обработчику движения.
        Log.info(Core.bundle.get("buildwheel.log.sdl-ready"), nativeFunctions.description);
    } catch (error) {
        result.available = false; result.active = false; result.reason = String(error); // Недоступность FFM, другая DLL или отличающийся машинный код дают безопасный отказ.
        if (arena != null) try { type("java.lang.foreign.Arena").getMethod("close", []).invoke(arena, []); arena = null; } catch (ignored) {} // До проверки адресов приватный режим ещё не включался.
        Log.warn(Core.bundle.get("buildwheel.log.sdl-disabled"), result.reason);
    }
    return result;
};

// РАЗОВЫЙ СДВИГ ОБЫЧНОГО УКАЗАТЕЛЯ ПРИ ОТКРЫТИИ У КРАЯ ЭКРАНА
exports.createWarp = function(relative) { // Не удерживает курсор и не выполняет работу при его движении.
    var fields = null, nativeMove = null, arena = null, closeArena = null, failed = false, disposed = false;
    function prepareWindows() { // Используем публичные функции Windows независимо от распознавания приватной SDL.
        if (!/^(amd64|x86_64)$/.test(String(java.lang.System.getProperty("os.arch")))) throw new Error(Core.bundle.get("buildwheel.sdl.windows.warp-arch")); // Размер CURSORINFO ниже соответствует 64-битному ABI.
        var type = n => java.lang.Class.forName(n), F = Packages.java.lang.foreign, seg = type("java.lang.foreign.MemorySegment"), arenas = type("java.lang.foreign.Arena"), linkerType = type("java.lang.foreign.Linker");
        var integer = F.ValueLayout.JAVA_INT, address = F.ValueLayout.ADDRESS, objectType = type("java.lang.Object");
        function array(values) { var a = java.lang.reflect.Array.newInstance(objectType, values.length); for (var i = 0; i < values.length; i++) a[i] = values[i]; return a; } // Упаковываем точные Java-типы для FFM.
        var none = array([]), eight = new java.lang.Long("8");
        arena = arenas.getMethod("ofShared", []).invoke(null, none); closeArena = () => arenas.getMethod("close", []).invoke(arena, none); // Буферы создаются однажды и освобождаются при завершении мода.
        var allocate = arenas.getMethod("allocate", [java.lang.Long.TYPE, java.lang.Long.TYPE]), asBuffer = seg.getMethod("asByteBuffer", []), getAddress = seg.getMethod("address", []);
        var library = F.SymbolLookup.libraryLookup("user32.dll", arena), linker = linkerType.getMethod("nativeLinker", []).invoke(null, none), downcall = linkerType.getMethod("downcallHandle", [seg, type("java.lang.foreign.FunctionDescriptor"), type("[Ljava.lang.foreign.Linker$Option;")]);
        var options = java.lang.reflect.Array.newInstance(type("java.lang.foreign.Linker$Option"), 0);
        function link(name, result, args) { return downcall.invoke(linker, array([library.find(name).orElseThrow(), F.FunctionDescriptor.of(result, args), options])); } // Адреса получены из системной user32.dll, без поиска машинного кода.
        function buffer(size) { var memory = allocate.invoke(arena, [new java.lang.Long(String(size)), eight]); return {memory: memory, data: asBuffer.invoke(memory, none).order(java.nio.ByteOrder.nativeOrder())}; }
        var point = buffer(8), rect = buffer(16), cursor = buffer(24); // POINT, RECT и CURSORINFO имеют постоянные размеры в Windows x64.
        var active = link("GetActiveWindow", address, []), foreground = link("GetForegroundWindow", address, []), client = link("GetClientRect", integer, [address, address]), origin = link("ClientToScreen", integer, [address, address]);
        var info = link("GetCursorInfo", integer, [address]), move = link("SetCursorPos", integer, [integer, integer]);
        var clientArgs = array([null, rect.memory]), originArgs = array([null, point.memory]), infoArgs = array([cursor.memory]), moveArgs = array([null, null]); // Повторные открытия используют те же массивы и буферы.
        nativeMove = function(x, y) {
            var window = active.invokeWithArguments(none), hwnd = Number(getAddress.invoke(window, none)); // GetActiveWindow относится к текущему потоку Arc.
            if (hwnd == 0 || Number(getAddress.invoke(foreground.invokeWithArguments(none), none)) != hwnd) return false; // Не перемещаем указатель над другим приложением.
            cursor.data.putInt(0, 24); // Перед каждым GetCursorInfo заново задаём cbSize: Windows может обнулить его при заполнении этого же буфера.
            if (Number(info.invokeWithArguments(infoArgs)) == 0 || (cursor.data.getInt(4) & 1) == 0) return false; // Скрытый системный указатель может принадлежать чужому относительному вводу.
            clientArgs[0] = window; originArgs[0] = window; point.data.putInt(0, 0); point.data.putInt(4, 0);
            if (Number(client.invokeWithArguments(clientArgs)) == 0 || Number(origin.invokeWithArguments(originArgs)) == 0) return false;
            var width = rect.data.getInt(8) - rect.data.getInt(0), height = rect.data.getInt(12) - rect.data.getInt(4); // Размер клиентской области учитывает текущий монитор и масштаб Windows.
            if (width <= 0 || height <= 0) return false;
            var left = point.data.getInt(0), top = point.data.getInt(4), currentX = cursor.data.getInt(16), currentY = cursor.data.getInt(20);
            if (currentX < left || currentX >= left + width || currentY < top || currentY >= top + height) return false; // Сдвиг предназначен только для указателя внутри игрового окна.
            moveArgs[0] = new java.lang.Integer(String(Math.round(left + x * width / Core.graphics.getWidth()))); // Переводим экранные координаты Arc в координаты рабочего стола.
            moveArgs[1] = new java.lang.Integer(String(Math.round(top + (Core.graphics.getHeight() - y) * height / Core.graphics.getHeight())));
            return Number(move.invokeWithArguments(moveArgs)) != 0;
        };
    }
    return {
        move: function(screenX, screenY) {
            if (disposed || failed || Vars.mobile || String(Core.input.getClass().getName()) != "arc.backend.sdl.SdlInput" || !java.lang.Thread.currentThread().equals(Core.app.getMainThread())) return false;
            if (!isFinite(screenX) || !isFinite(screenY) || Core.graphics.getWidth() <= 0 || Core.graphics.getHeight() <= 0 || relative.active) return false;
            try {
                var SDL = Packages.arc.backend.sdl.jni.SDL, flags = SDL.SDL_GetWindowFlags(Core.app.getWindow());
                if ((flags & SDL.SDL_WINDOW_INPUT_FOCUS) == 0 || (flags & SDL.SDL_WINDOW_MINIMIZED) != 0 || (relative.absoluteMode != null && !relative.absoluteMode())) return false;
                if (fields == null) { fields = [Core.input.getClass().getDeclaredField("mouseX"), Core.input.getClass().getDeclaredField("mouseY")]; fields[0].setAccessible(true); fields[1].setAccessible(true); } // Проверяем доступ к кэшу Arc до физического переноса.
                var x = Math.max(0, Math.min(Core.graphics.getWidth() - 1, Math.round(screenX))), y = Math.max(0, Math.min(Core.graphics.getHeight() - 1, Math.round(screenY)));
                if (OS.isWindows) { if (nativeMove == null) prepareWindows(); if (!nativeMove(x, y)) return false; }
                else if (relative.warpAbsolute == null || !relative.warpAbsolute(x, y)) return false; // Linux/macOS используют только уже проверенные экспорты игрового SDL.
                fields[0].setInt(Core.input, x); fields[1].setInt(Core.input, y); return true; // Наведение и немедленный клик читают новую позицию, не дожидаясь события ОС.
            } catch (error) { failed = true; Log.warn(Core.bundle.get("buildwheel.log.cursor-shift"), String(error)); return false; }
        },
        dispose: function() { disposed = true; nativeMove = null; if (arena != null) { try { closeArena(); } finally { arena = null; } } } // Обычное закрытие колеса не требует освобождать или захватывать курсор.
    };
};
