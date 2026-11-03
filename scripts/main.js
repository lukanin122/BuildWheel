// BuildWheel — этапы 1 и 2: открытие колеса и выбор из восьми секторов.
// Пункты 1 и 1.2 проверены в игре; пункт 2 ждёт такой же проверки.
// API: https://mindustrygame.github.io/docs/
// Исходники: https://github.com/Anuken/Arc/tree/master/arc-core/src/arc

// 3) require выполняется при загрузке скрипта; само меню создаётся после ClientLoadEvent.
var menuModule = require("menu"); // настройки
var wheelModule = require("wheel"); // 'колесо выбора'
var uiSounds = require("sounds"); // Загрузка файлов звуков начинается до ClientLoadEvent.

// ClientLoadEvent вызывается после загрузки клиентской части игры
// когда клиентский интерфейс уже создан.
Events.on(ClientLoadEvent, () => {
    var controls = menuModule.getControls(); // Загружаем общие настройки до создания интерфейса и обработчиков ввода.
    var windowFocused = true; // События pause/resume не дают отложенному вводу перемещать мышь после переключения в другое приложение.
    var wheelOpen = false; // wheelOpen отвечает за показ и отрисовку колеса
    var activeWheelNumber = -1; // Номер последнего открытого колеса 0-9, дефолт -1
    var mousePosition = new Vec2(); 
    var wheelCount = controls.bindings.wheels.length; // Количество номеров берём из назначений, не создавая вторую таблицу цифровых клавиш.
    var scrollHeldKey = KeyCode.unset; // Храним физически удержанную клавишу прокрутки; состояние Caps Lock больше не используется.
    var wheelScrollAmount = 0; // Накапливаем дробную прокрутку: одна полная единица переключает одно колесо.

    // 2) Отдельные восемь слотов для каждого колеса 0–9.
    // null означает пустой слот; непустой слот хранит сам объект Block.
    // Нумерация по часовой стрелке: 0 — север, 1 — северо-восток,
    // 2 — восток, 3 — юго-восток, 4 — юг, 5 — юго-запад,
    // 6 — запад, 7 — северо-запад.
    var wheelSlots = [];
    for (var wheelNumber = 0; wheelNumber < wheelCount; wheelNumber++) {
        wheelSlots.push([null, null, null, null, null, null, null, null]);
    }
    // Назначение через меню будет в пункте 3. Для ручной проверки можно
    // временно раскомментировать: колесо 1, северный сектор — конвейер.
    // wheelSlots[1][0] = Blocks.conveyor;

    // Объект-основа, а так же универсальные функции: определение сохранённых блоков и их масштабы. (Для обоих виджетов ('колеса выбора' и 'манекена').)
    var wheelView = wheelModule.create({
        getBlock: function(w, s) { return wheelSlots[w][s]; },
        getIconScale: function(w, s) { return settingsMenu.getIconScale(w, s); } // Вызывается при рисовании, когда settingsMenu уже создано ниже.
    });

    // Захваченные кнопки удерживаем до отпускания даже после закрытия колеса.
    // Иначе игра получит отпускание без нажатия и может завершить свой жест.
    var capturedLeft = false;
    var capturedRight = false;
    var pendingSelection = null; // Запрос выбора, ожидающий выполнения в очереди приложения.

    // ПЕРЕМЕЩЕНИЕ СИСТЕМНОГО КУРСОРА ТОЛЬКО ПРИ НЕОБХОДИМОСТИ
    var cursorRobot = null, cursorDevice = null, cursorFailed = false, cursorNative = false, cursorFieldX = null, cursorFieldY = null; // Robot и отражённые поля кэшируются, а не создаются на каждом движении.
    var cursorOriginX = 0, cursorOriginY = 0, cursorScaleX = 1, cursorScaleY = 1; // Начало игрового окна в координатах рабочего стола.
    var cursorPoint = new Vec2(); // Повторно используем вектор преобразования координат курсора.
    var motionActive = false; // В обычной игре дополнительные события мыши вообще не направляются в JavaScript мода.
    var motionProcessor = extend(InputProcessor, {mouseMoved: function(x, y) { return mouseMotion(x, y); }}); // Один обработчик используется только при открытом колесе с ограничением или номером.

    function setMotionEnabled(enabled) { // Подключаем обработку движения только на время её реальной необходимости.
        if (motionActive == enabled) return; // Повторное обновление режима не меняет список обработчиков.
        motionActive = enabled; // Этим же флагом пользуется обработчик перетаскивания.
        if (enabled) Core.input.getInputMultiplexer().addProcessor(0, motionProcessor); // Ограничение срабатывает до обновления сцены и игрового ввода.
        else Core.input.removeProcessor(motionProcessor); // Закрытое колесо не добавляет вызовов JavaScript на движения мыши.
    }

    var cursorWindows = null, cursorArena = null, cursorForeignAvailable = null; // Комплектная Java 25 содержит FFM в java.base, даже когда java.awt отсутствует.
    var cursorCalibrated = false, cursorClipActive = false; // Ограничение ОС включается только для открытого колеса и подготовленного окна.
    var cursorClipLeft = 0, cursorClipTop = 0, cursorClipRight = 0, cursorClipBottom = 0; // Одинаковый визуал при прокрутке не требует повторной установки той же границы ОС.

    function prepareWindowsCursor() { // Связываем стандартные функции Windows без сторонних DLL и фоновых потоков.
        var F = Packages.java.lang.foreign; // Эти классы доступны только при фактическом выборе адаптера Java 22+.
        if (cursorWindows == null) { // Подготовка дескрипторов и памяти выполняется один раз.
            var linker = F.Linker.nativeLinker(), arena = F.Arena.ofShared(); // Область хранит два небольших буфера для координат окна.
            var type = name => java.lang.Class.forName(name); // Используем публичные интерфейсы FFM, не закрытые внутренние реализации JDK.
            var close = type("java.lang.foreign.Arena").getMethod("close", []); // Rhino не может вызывать методы внутренних jdk.internal.foreign-классов напрямую.
            cursorArena = {close: () => close.invoke(arena, [])}; // Сохраняем корректное закрытие области, включая случай ошибки дальнейшей подготовки.
            var downcall = type("java.lang.foreign.Linker").getMethod("downcallHandle", [type("java.lang.foreign.MemorySegment"), type("java.lang.foreign.FunctionDescriptor"), type("[Ljava.lang.foreign.Linker$Option;")]); // Кэшируем публичный вход создания нативных дескрипторов.
            var allocate = type("java.lang.foreign.Arena").getMethod("allocate", [java.lang.Long.TYPE, java.lang.Long.TYPE]); // Выделение памяти также вызывается через публичный интерфейс.
            var getInt = type("java.lang.foreign.MemorySegment").getMethod("get", [type("java.lang.foreign.ValueLayout$OfInt"), java.lang.Long.TYPE]); // Доступ к полям POINT/RECT нужен только при открытии колеса.
            var setInt = type("java.lang.foreign.MemorySegment").getMethod("set", [type("java.lang.foreign.ValueLayout$OfInt"), java.lang.Long.TYPE, java.lang.Integer.TYPE]); // Сохраняем публичный метод записи целого числа в буфер.
            var addressOf = type("java.lang.foreign.MemorySegment").getMethod("address", []); // Нулевой HWND проверяется без доступа к внутреннему классу сегмента.
            var options = java.lang.reflect.Array.newInstance(type("java.lang.foreign.Linker$Option"), 0); // Дополнительные режимы нативного вызова не нужны.
            var library = F.SymbolLookup.libraryLookup("user32.dll", arena); // Используем штатную библиотеку Windows.
            function link(name, result, args) { return downcall.invoke(linker, [library.find(name).orElseThrow(), F.FunctionDescriptor.of(result, args), options]); } // Дескрипторы создаются один раз через публичный интерфейс Linker.
            var address = F.ValueLayout.ADDRESS, integer = F.ValueLayout.JAVA_INT; // HWND передаётся указателем, BOOL и координаты — 32-битными числами.
            var four = new java.lang.Long("4"), zero = new java.lang.Long("0"); // Размеры и смещения полей передаются точным Java Long.
            cursorWindows = {active: link("GetActiveWindow", address, []), client: link("GetClientRect", integer, [address, address]), origin: link("ClientToScreen", integer, [address, address]), move: link("SetCursorPos", integer, [integer, integer]), clip: link("ClipCursor", integer, [address]), nullPointer: F.MemorySegment.NULL, point: allocate.invoke(arena, [new java.lang.Long("8"), four]), rect: allocate.invoke(arena, [new java.lang.Long("16"), four])}; // Буферы POINT и RECT не создаются на каждом движении.
            cursorWindows.get = (segment, offset) => Number(getInt.invoke(segment, [integer, new java.lang.Long(String(offset))])); // Чтение размеров выполняется только при открытии колеса.
            cursorWindows.set = (segment, offset, value) => setInt.invoke(segment, [integer, new java.lang.Long(String(offset)), new java.lang.Integer(String(value))]); // Границы ограничения ОС записываются только при открытии или смене размера.
            cursorWindows.zero = () => { setInt.invoke(cursorWindows.point, [integer, zero, new java.lang.Integer("0")]); setInt.invoke(cursorWindows.point, [integer, four, new java.lang.Integer("0")]); }; // Готовим POINT(0,0) перед переводом в экранные координаты.
            cursorWindows.isNull = segment => Number(addressOf.invoke(segment, [])) == 0; // Пустое окно не должно приводить к перемещению указателя другого приложения.
            var objectType = java.lang.Class.forName("java.lang.Object"); // Тип массива аргументов для MethodHandle.
            cursorWindows.empty = java.lang.reflect.Array.newInstance(objectType, 0); // Повторно используем пустой список GetActiveWindow.
            cursorWindows.args = java.lang.reflect.Array.newInstance(objectType, 2); // Два аргумента нужны каждой оставшейся функции.
            cursorWindows.clipArgs = java.lang.reflect.Array.newInstance(objectType, 1); // ClipCursor принимает только указатель на прямоугольник либо NULL для освобождения.
        }
        var native = cursorWindows, window = native.active.invokeWithArguments(native.empty); // Активное окно принадлежит текущему SDL-потоку игры.
        if (native.isNull(window)) return false; // В отсутствие активного окна не перемещаем мышь другого приложения.
        native.args[0] = window; native.args[1] = native.rect; // Получаем размер клиентской области в координатах того же Windows-контекста.
        if (Number(native.client.invokeWithArguments(native.args)) == 0) return false; // Не используем устаревшие размеры при ошибке платформы.
        native.zero(); // Начало клиентской области переводится из (0,0).
        native.args[1] = native.point; // Тот же массив аргументов обслуживает ClientToScreen.
        if (Number(native.origin.invokeWithArguments(native.args)) == 0) return false; // Не переносим курсор при неизвестном положении окна.
        cursorOriginX = native.get(native.point, 0); cursorOriginY = native.get(native.point, 4); // Начало окна в экранных координатах Windows.
        cursorScaleX = (native.get(native.rect, 8) - native.get(native.rect, 0)) / Core.graphics.getWidth(); // Масштабируем игровые координаты в реальную клиентскую область.
        cursorScaleY = (native.get(native.rect, 12) - native.get(native.rect, 4)) / Core.graphics.getHeight(); // Отдельный масштаб Y учитывает размер окна и HiDPI.
        return cursorScaleX > 0 && cursorScaleY > 0; // Свёрнутое окно не предоставляет допустимую область движения.
    }

    // ГРАНИЦА ОС УДЕРЖИВАЕТ МЫШЬ В ОКНЕ, ОКРУЖНОСТЬ УТОЧНЯЕТСЯ СОБЫТИЯМИ
    function releaseCursorClip() { // Освобождаем физическую мышь при любом способе закрытия колеса.
        if (!cursorClipActive || cursorWindows == null) return; // Выключенная настройка не обращается к Windows.
        cursorWindows.clipArgs[0] = cursorWindows.nullPointer; // NULL снимает временное ограничение операционной системы.
        cursorWindows.clip.invokeWithArguments(cursorWindows.clipArgs); // Курсор снова может покидать окно игры.
        cursorClipActive = false; // Повторное закрытие не создаёт лишних нативных вызовов.
    }

    function updateCursorClip() { // Вызывается только при открытии и переключении номера, без покадровой проверки.
        if (!cursorCalibrated || cursorWindows == null || (!controls.clipOuter && !controls.clipInner)) return; // Другие backend продолжают использовать обработку событий движения.
        var radius = wheel.getWidth() / 2, appearance = wheelView.getDisplayVisual(activeWheelNumber).appearance; // Выбираем окружность действующего игрового визуала.
        var limit = controls.clipInner ? Math.min(radius, radius * appearance.innerRadiusRatio + Scl.scl(2)) : radius; // Два включённых ограничения дают меньшую окружность.
        Core.scene.getViewport().project(cursorPoint.set(wheel.x + radius, wheel.y + wheel.getHeight() / 2)); // Получаем центр в экранных координатах игры.
        var x = cursorOriginX + cursorPoint.x * cursorScaleX, y = cursorOriginY + (Core.graphics.getHeight() - cursorPoint.y) * cursorScaleY; // Переводим центр в координаты Windows.
        var rx = (limit + 1) * Core.scene.getViewport().getScreenWidth() / Core.scene.getWidth() * cursorScaleX; // Прямоугольник включает окружность с допуском округления.
        var ry = (limit + 1) * Core.scene.getViewport().getScreenHeight() / Core.scene.getHeight() * cursorScaleY; // Отдельный масштаб Y поддерживает изменение размеров окна.
        var left = Math.max(Math.ceil(cursorOriginX), Math.floor(x - rx)), top = Math.max(Math.ceil(cursorOriginY), Math.floor(y - ry)); // Не выпускаем мышь в заголовок или соседние приложения, даже если часть круга обрезана.
        var right = Math.min(Math.floor(cursorOriginX + Core.graphics.getWidth() * cursorScaleX), Math.ceil(x + rx) + 1), bottom = Math.min(Math.floor(cursorOriginY + Core.graphics.getHeight() * cursorScaleY), Math.ceil(y + ry) + 1); // Правая и нижняя границы RECT исключают следующий пиксель.
        if (right <= left || bottom <= top) return; // Не задаём пустую область для свёрнутого или слишком маленького окна.
        if (cursorClipActive && left == cursorClipLeft && top == cursorClipTop && right == cursorClipRight && bottom == cursorClipBottom) return; // Пропускаем запись буфера и нативный вызов, если граница не изменилась.
        cursorWindows.set(cursorWindows.rect, 0, left); cursorWindows.set(cursorWindows.rect, 4, top); // Левый верхний угол временного прямоугольника.
        cursorWindows.set(cursorWindows.rect, 8, right); cursorWindows.set(cursorWindows.rect, 12, bottom); // Правый нижний угол временного прямоугольника.
        cursorWindows.clipArgs[0] = cursorWindows.rect; // Передаём уже выделенный буфер, не создавая новый при переключении.
        if (Number(cursorWindows.clip.invokeWithArguments(cursorWindows.clipArgs)) != 0) { // ОС удерживает мышь в окне; точная круглая граница остаётся в mouseMoved.
            cursorClipActive = true; cursorClipLeft = left; cursorClipTop = top; cursorClipRight = right; cursorClipBottom = bottom; // Запоминаем только успешно установленную границу.
        }
    }

    function prepareCursorFields() { // Сразу синхронизируем SDL с физической позицией, не ожидая очередного события операционной системы.
        if (cursorFieldX != null) return; // Поля ищем только при первом использовании адаптера.
        var type = Core.input.getClass(); // SDL хранит последнюю позицию в двух собственных полях.
        cursorFieldX = type.getDeclaredField("mouseX"); cursorFieldY = type.getDeclaredField("mouseY"); // Кэшируем поиск отражённых полей.
        cursorFieldX.setAccessible(true); cursorFieldY.setAccessible(true); // Обновление кэша понадобится сразу после физического перемещения.
    }

    function prepareCursor() { // SDL-версия Arc не предоставляет публичный метод установки позиции мыши.
        if (cursorFailed || Vars.mobile) return false; // На недоступной платформе не повторяем создание Robot при каждом событии.
        if (typeof Core.input.setCursorPosition == "function") { cursorNative = true; return true; } // Если другой backend предоставляет установку позиции, используем её напрямую.
        try {
            if (OS.isWindows) { // В Steam используется урезанная Java без java.desktop; FFM доступен в java.base.
                if (cursorForeignAvailable == null) { // Наличие API проверяем один раз, не создавая исключения при каждом открытии на старой Java.
                    try { java.lang.Class.forName("java.lang.foreign.Linker"); cursorForeignAvailable = true; } catch (missingForeign) { cursorForeignAvailable = false; } // Только отсутствие API включает запасной адаптер.
                }
                if (cursorForeignAvailable) { prepareCursorFields(); return prepareWindowsCursor(); } // Ошибки Windows-функций сохраняют свою настоящую причину.
            }
            var pointer = java.awt.MouseInfo.getPointerInfo(), device = pointer.getDevice(); // Определяем монитор и положение мыши один раз при открытии.
            if (cursorRobot == null || !device.equals(cursorDevice)) { cursorRobot = new java.awt.Robot(device); cursorDevice = device; } // При переносе игры на другой монитор учитываем его собственный масштаб рабочего стола.
            prepareCursorFields(); // Другие полные desktop-JRE используют AWT с тем же кэшем SDL.
            var transform = pointer.getDevice().getDefaultConfiguration().getDefaultTransform(); // Учитываем масштаб рабочего стола на текущем мониторе.
            cursorScaleX = transform.getScaleX(); cursorScaleY = transform.getScaleY(); // SDL использует экранные пиксели, Robot — координаты Java рабочего стола.
            var position = pointer.getLocation(); // Начало окна вычисляем по разности абсолютной и игровой позиции.
            cursorOriginX = position.x - Core.input.mouseX() / cursorScaleX; // Горизонтальное начало клиентской области.
            cursorOriginY = position.y - (Core.graphics.getHeight() - Core.input.mouseY()) / cursorScaleY; // Рабочий стол отсчитывает Y сверху, игра — снизу.
            return true; // Последующие события используют готовые смещения без MouseInfo и новых объектов.
        } catch (error) {
            if (cursorArena != null) { cursorArena.close(); cursorArena = null; cursorWindows = null; } // Не оставляем выделенную память после ошибки подготовки адаптера.
            cursorFailed = true; // Повторяющаяся ошибка платформы не должна нагружать обработку мыши.
            Log.warn("BuildWheel: перемещение системного курсора недоступно: @", String(error)); // Один раз оставляем точную причину в журнале игры.
            return false;
        }
    }

    function moveCursor(stageX, stageY, deferScene) { // Получаем целевую позицию в координатах сцены интерфейса.
        if (!cursorCalibrated || (!cursorNative && cursorRobot == null && cursorWindows == null) || cursorFailed) return false; // Обычная работа без сдвига вообще не обращается к операционной системе.
        Core.scene.getViewport().project(cursorPoint.set(stageX, stageY)); // Преобразуем позицию обратно в экранные координаты без инверсии Y метода stageToScreenCoordinates.
        var x = Math.round(cursorPoint.x), y = Math.round(cursorPoint.y); // Целые координаты соответствуют позиции аппаратной мыши.
        if (x == Core.input.mouseX() && y == Core.input.mouseY()) { if (!deferScene) Core.scene.mouseMoved(x, y); return true; } // Не просим ОС повторить уже достигнутую позицию из-за пиксельного округления.
        if (cursorNative) Core.input.setCursorPosition(x, y); // Backend сам обновляет физическую позицию и кэш координат.
        else { // Для установленного SDL-клиента используем адаптер операционной системы.
            if (cursorWindows != null) { // Windows-функция использует тот же контекст координат, что GetClientRect и ClientToScreen.
                cursorWindows.args[0] = new java.lang.Integer(String(Math.round(cursorOriginX + x * cursorScaleX))); // Передаём точный C-int, а не JS Double.
                cursorWindows.args[1] = new java.lang.Integer(String(Math.round(cursorOriginY + (Core.graphics.getHeight() - y) * cursorScaleY))); // Windows отсчитывает вертикальную позицию сверху.
                if (Number(cursorWindows.move.invokeWithArguments(cursorWindows.args)) == 0) return false; // Ошибка ОС не должна обновлять только виртуальную позицию мыши.
            } else cursorRobot.mouseMove(Math.round(cursorOriginX + x / cursorScaleX), Math.round(cursorOriginY + (Core.graphics.getHeight() - y) / cursorScaleY)); // Полная desktop-JRE использует координаты Java рабочего стола.
            cursorFieldX.setInt(Core.input, x); cursorFieldY.setInt(Core.input, y); // Наведение сразу читает новую позицию, не ожидая синтетического события SDL.
        }
        if (!deferScene) Core.scene.mouseMoved(x, y); // При открытии откладываем наведение до появления колеса, чтобы сдвиг не передал фокус перекрываемому HUD.
        return true;
    }

    function constrainCursor(screenX, screenY) { // Проверяем границу только при поступлении события движения мыши.
        if (!wheelOpen || (!controls.clipOuter && !controls.clipInner) || wheelInputBlocked()) return false; // При выключенных ограничениях нет ни преобразований, ни вычисления расстояния.
        Core.scene.screenToStageCoordinates(cursorPoint.set(screenX, screenY)); // Получаем позицию события относительно сцены.
        var radius = wheel.getWidth() / 2, appearance = wheelView.getDisplayVisual(activeWheelNumber).appearance; // Ограничение соответствует реальному игровому визуалу.
        var limit = controls.clipInner ? Math.min(radius, radius * appearance.innerRadiusRatio + Scl.scl(2)) : radius; // Внутренняя граница оставляет два UI-пикселя для попадания в строительный сектор.
        var centerX = wheel.x + radius, centerY = wheel.y + wheel.getHeight() / 2; // Центр остаётся прежним при переключении колёс.
        var dx = cursorPoint.x - centerX, dy = cursorPoint.y - centerY, distance2 = dx * dx + dy * dy; // Квадрат расстояния позволяет не вычислять корень внутри допустимой области.
        if (distance2 <= (limit + 1) * (limit + 1)) return false; // Один пиксель по радиусу покрывает округление обеих координат и исключает цепочку одинаковых синтетических событий.
        var scale = limit / Math.sqrt(distance2); // Корень нужен только если курсор действительно вышел за окружность.
        return moveCursor(centerX + dx * scale, centerY + dy * scale); // Проецируем позицию на окружность, не меняя направления выбора сектора.
    }

    // Определяем наличие курсора на одном из секторов (в wheel.js). Принимает координаты сцены интерфейса, возвращает сектор 0–7 или -1.
    function sectorAt(stageX, stageY) {
        // wheel находится прямо в корне сцены: вычитание его позиции даёт локальные координаты.
        return wheelView.sectorAt(wheel, stageX - wheel.x, stageY - wheel.y, activeWheelNumber, true); // Проверяем сектор по действующему игровому визуалу, включая закрепление замком.
    }

    function canSelectBlock(block) {
        // Проверяем именно возможность ВЫБОРА, как PlacementFragment игры.
        // isPlaceable() сюда не входит: видимый запрещённый блок можно выбрать
        // для предпросмотра, хотя построить его игра не разрешит.
        // Запасы ресурсов также не ограничивают выбор и предпросмотр.
        return block != null && block.isVisible() && block.placeablePlayer
            && block.unlockedNowHost() && block.environmentBuildable()
            && block.supportsEnv(Vars.state.rules.env);
    }

    //==============================================================
    // 1) Создаём объект wheel - полупрозрачный шаблон колеса выбора.
    //==============================================================
    // Общая фабрика создаёт Element. Здесь задаём только поведение 'колеса выбора'.
    var wheel = wheelView.createElement({
        useSharedVisual: true, // Игровое колесо использует закреплённый визуал, если замок включён.
        canDraw: function() { return wheelOpen && Vars.state.isGame(); },//условия запуска
        getWheelNumber: function() { return activeWheelNumber; },//номер 'колеса выбора'
        getIconAlpha: function(block) {// Проверяем доступность блока в этом мире; количество ресурсов здесь не проверяется.
            return canSelectBlock(block) && block.isPlaceable() ? 1 : 0.30; // Доступный блок полностью непрозрачен (1), недоступный рисуется с alpha 0.30.
        },

        // Открытие колеса делает областью для клика весь экран.
        // Это сообщает сцене, что курсор над UI, и блокирует игровое наведение.
        // x/y здесь локальные; выбор сектора отдельно получает координаты сцены.
        hit: function(x, y, touchable) {
            if (!wheelOpen || !Vars.state.isGame() || Core.scene.hasDialog() || Core.scene.hasKeyboard()) return null;
            if (touchable && this.touchable != Touchable.enabled) return null;
            return this;
        }
    });

    wheel.visible = false;
    wheel.touchable = Touchable.enabled; // 2) Колесо теперь участвует в проверке попадания мыши.
    Core.scene.root.addChild(wheel); //Прикрепляем объект wheel для сцены
    var numberBadge = extend(Table, { // Номер — отдельная небольшая плашка поверх игрового колеса, без собственного update.
        draw: function() {
            if (numberCursorHidden && invisibleCursor != null) Core.graphics.cursor(invisibleCursor); // Отрисовка игры могла выбрать другой курсор; Graphics пропускает повторную установку уже выбранного курсора.
            this.super$draw(); // Плашка использует штатное рисование таблицы и надписи.
        }
    });
    numberBadge.name = "buildwheel-wheel-number-badge"; numberBadge.touchable = Touchable.disabled; numberBadge.visible = false; // Плашка не перехватывает выбор сектора мышью.
    numberBadge.margin(5); // Небольшой отступ отделяет цифру от контрастного фона.
    var numberLabel = numberBadge.add("", Styles.outlineLabel).minWidth(24).minHeight(24).get(); // Штатный шрифт с обводкой сохраняет читаемость номера.
    numberLabel.setAlignment(Align.center); // Цифра располагается в середине плашки.
    var numberAnchorX = 0, numberAnchorY = 0, invisibleCursor = null, numberCursorHidden = false, numberCursorUnavailable = false; // Положение мыши запоминается при появлении номера.
    var numberDarkBackground = null, numberLightBackground = null; // Два фона создаются при первом показе и переиспользуются без новых объектов при переключении колёс.

    // НОМЕР КОЛЕСА ДО ПЕРВОГО ДВИЖЕНИЯ МЫШИ
    function hideWheelNumber() { // Вызывается движением мыши или закрытием колеса.
        numberBadge.visible = false; // Скрытая плашка не рисуется и не обновляется.
        numberBadge.remove(); // Выключенная плашка отсутствует в сцене и не участвует даже в штатном обходе UI.
        if (numberCursorHidden) { Core.graphics.restoreCursor(); numberCursorHidden = false; } // Возвращаем аппаратный курсор, если номер перекрывал его в центре.
        setMotionEnabled(wheelOpen && (controls.clipOuter || controls.clipInner)); // Без номера оставляем обработчик только при действующем ограничении окружностью.
    }

    function showWheelNumber() { // Рисуем только для настоящего «колеса выбора», не для «манекена».
        hideWheelNumber(); // Предыдущее появление не должно оставлять скрытый системный курсор.
        if (!controls.showNumber || !wheelOpen) return; // Выключенная настройка не создаёт курсоров и фона.
        numberLabel.setText(String(activeWheelNumber)); numberLabel.setColor(controls.numberColor); // Используем выбранный пользователем цвет текста.
        if (numberDarkBackground == null) { numberDarkBackground = Tex.whiteui.tint(0, 0, 0, 0.78); numberLightBackground = Tex.whiteui.tint(1, 1, 1, 0.78); } // Фоны с разным контрастом создаются только один раз.
        numberBadge.background(controls.numberDarkBackground ? numberDarkBackground : numberLightBackground); // Используем заранее рассчитанный контраст без новых объектов и вычисления яркости.
        numberBadge.pack(); // Подгоняем рамку под одну цифру и отступы.
        numberBadge.setPosition(wheel.x + wheel.getWidth() / 2 - numberBadge.getWidth() / 2, wheel.y + wheel.getHeight() / 2 - numberBadge.getHeight() / 2); // Привязываем плашку к центру колеса.
        Core.scene.root.addChild(numberBadge); numberBadge.visible = true; numberBadge.toFront(); // Один виджет рисуется поверх кольца и иконок всех десяти номеров.
        setMotionEnabled(true); // Первое движение уберёт номер; при выключенных ограничениях обработчик затем будет удалён.
        numberAnchorX = Core.input.mouseX(); numberAnchorY = Core.input.mouseY(); // Синтетическое перемещение в эту же позицию не считается движением пользователя.
        Core.scene.screenToStageCoordinates(cursorPoint.set(numberAnchorX, numberAnchorY)); // Проверяем, накладывается ли аппаратная мышь на плашку.
        if (!numberCursorUnavailable && cursorPoint.x >= numberBadge.x && cursorPoint.x <= numberBadge.getRight() && cursorPoint.y >= numberBadge.y && cursorPoint.y <= numberBadge.getTop()) { // Курсор вне плашки скрывать незачем.
            try {
                if (invisibleCursor == null) { // Единственный прозрачный курсор создаём только при первом использовании настройки.
                    var pixel = new Pixmap(1, 1); pixel.fill(0); // Аппаратный курсор находится выше OpenGL; прозрачность позволяет цифре оставаться поверх него.
                    try { invisibleCursor = Core.graphics.newCursor(pixel, 0, 0); } finally { pixel.dispose(); } // Однопиксельная временная картинка больше не нужна.
                }
                if (invisibleCursor != null) { Core.graphics.cursor(invisibleCursor); numberCursorHidden = true; } // Реальная мышь возвращается при первом движении.
                else numberCursorUnavailable = true; // Backend без аппаратных курсоров больше не требует попыток создания.
            } catch (error) { // Плашка остаётся работоспособной и на backend без аппаратных курсоров.
                numberCursorUnavailable = true; // Не повторяем неподдерживаемую операцию при каждом открытии колеса.
            }
        }
    }

    function mouseMotion(screenX, screenY) { // Одна проверка обслуживает mouseMoved и touchDragged.
        if (numberBadge.visible && (screenX != numberAnchorX || screenY != numberAnchorY)) hideWheelNumber(); // Даже небольшое реальное движение сразу убирает номер.
        return constrainCursor(screenX, screenY); // Ограничение выполняется только при включённых параметрах и открытом колесе.
    }
    Events.on(DisposeEvent, () => { // Освобождаем нативные ресурсы один раз при завершении игры.
        closeWheel(); // Сначала снимаем ограничение ОС и возвращаем обычный курсор.
        if (invisibleCursor != null) { invisibleCursor.dispose(); invisibleCursor = null; } // Повторное событие не должно освобождать тот же аппаратный курсор дважды.
        if (cursorArena != null) { cursorArena.close(); cursorArena = null; cursorWindows = null; } // Закрываем область памяти вместе с дескрипторами Windows-функций.
    });
    //==============================================================

    //Закрытие колеса при выходе в меню или сбросе мира.
    function closeWheel() {
        wheelOpen = false; // Закрытие сначала отключает обработку движения, даже если до этого был показан номер.
        releaseCursorClip(); cursorCalibrated = false; // Закрытое колесо не ограничивает физическую мышь.
        hideWheelNumber(); // Номер и временно скрытый курсор не должны оставаться после выбора, отмены или открытия окна.
        wheel.resetHoverSound(); // Повторное открытие начинает новую историю звука наведения.
        activeWheelNumber = -1;
        wheel.visible = false;
        pendingSelection = null; // Отменяет ещё не выполненный запрос выбора.
        wheelScrollAmount = 0; // После закрытия не переносим незавершённый шаг прокрутки в следующее открытие.
    }

    // ПЕРЕКЛЮЧЕНИЕ КОМПЛЕКТА БЕЗ СМЕЩЕНИЯ ЦЕНТРА КОЛЕСА
    function setWheelNumber(number, opening) { // Используется при открытии и переключении прокруткой.
        var diameter = wheelView.getDisplayVisual(number).appearance.diameter; // Читаем диаметр действующего визуала с учётом закрепления замком.
        var centerX = wheel.x + wheel.getWidth() / 2, centerY = wheel.y + wheel.getHeight() / 2; // Запоминаем прежний центр перед изменением размеров.
        wheel.setSize(diameter, diameter); // Применяем размер выбранного комплекта к существующему виджету.
        wheel.setPosition(centerX - diameter / 2, centerY - diameter / 2); // Сохраняем центр, даже если соседнее колесо больше или меньше предыдущего.
        activeWheelNumber = number; // Рисование и выбор блока теперь используют комплект и слоты этого номера.
        wheel.resetHoverSound(); // Новый набор секторов получает собственный звук первого наведения.
        if (wheelOpen && !opening) { updateCursorClip(); constrainCursor(Core.input.mouseX(), Core.input.mouseY()); showWheelNumber(); } // Новый размер применяется к ограничениям до появления номера.
    }

    // ОТКРЫТИЕ КОЛЕСА ПОД КУРСОРОМ ОБОИМИ СПОСОБАМИ
    function openWheel(number) { // Общая функция для назначенных клавиш и переключения прокруткой.
        releaseCursorClip(); cursorCalibrated = false; // Прежняя окружность не должна мешать переносу центра нового открытия.
        mousePosition.set(Core.input.mouseX(), Core.input.mouseY()); //координаты мыши
        Core.scene.screenToStageCoordinates(mousePosition); //!переводим в координаты сцены интерфейса (проверить что конкретно за интерфейс)
        setWheelNumber(number, true); // Выбираем данные и диаметр именно открываемого номера.
        var margin = wheel.getWidth() / 2 * controls.edgeShift; // При нуле сдвига нет, при единице отступ от каждого края равен радиусу.
        var oldX = mousePosition.x, oldY = mousePosition.y; // Исходная позиция нужна только для проверки необходимости переноса курсора.
        var needsCursor = controls.clipOuter || controls.clipInner || (margin > 0 && (oldX < margin || oldY < margin || oldX > Core.scene.getWidth() - margin || oldY > Core.scene.getHeight() - margin)); // Адаптер создаётся только при реальной необходимости.
        var cursorReady = needsCursor && prepareCursor(); // Обычное открытие вдали от краёв не обращается к операционной системе.
        cursorCalibrated = cursorReady; // Не используем координаты окна, если его не удалось подготовить.
        if (margin > 0 && cursorReady) { // Центр и физический курсор сдвигаются вместе.
            mousePosition.x = Core.scene.getWidth() < margin * 2 ? Core.scene.getWidth() / 2 : Math.max(margin, Math.min(Core.scene.getWidth() - margin, oldX)); // Если колесо слишком широко, выбираем середину доступной области.
            mousePosition.y = Core.scene.getHeight() < margin * 2 ? Core.scene.getHeight() / 2 : Math.max(margin, Math.min(Core.scene.getHeight() - margin, oldY)); // Аналогично обрабатываем верхний и нижний края.
            if ((mousePosition.x != oldX || mousePosition.y != oldY) && !moveCursor(mousePosition.x, mousePosition.y, true)) mousePosition.set(oldX, oldY); // Если ОС отклонила перенос, центр остаётся под фактическим курсором.
        }
        wheel.setPosition(mousePosition.x - wheel.getWidth() / 2, mousePosition.y - wheel.getHeight() / 2); // Центрируем колесо под курсором; у края экрана часть круга может обрезаться.
        //* Позиция фиксируется в момент открытия и не следует за мышью.
        //* У края экрана круг может обрезаться: центр остаётся под курсором.
        wheelScrollAmount = 0; // Каждое открытие начинает отсчёт прокрутки с целого шага.
        wheelOpen = true; // Разрешаем отрисовку и выбор сектора.
        wheel.visible = true; //Включаем отрисовку колеса, чтобы оно отрисовывалось в draw() и было доступно для клика мышью.
        wheel.toFront(); // Перемещаем wheel в конец корневой группы, чтобы он рисовался поверх остальных элементов интерфейса.
        updateCursorClip(); constrainCursor(Core.input.mouseX(), Core.input.mouseY()); // Ограничение действует только после установки окончательного центра и размера колеса.
        Core.scene.mouseMoved(Core.input.mouseX(), Core.input.mouseY()); // Наведение теперь получает само открытое колесо, а не HUD под ним.
        showWheelNumber(); // После сдвига колеса плашка и запомненная позиция мыши используют окончательный центр.
    }

    //==============================================================
    // 2.4) Закрытие при вызове другого окна или выделения области.
    //==============================================================
    // Сравниваем клавишу с совпадающей функцией из binding.value.key при каждом нажатии клаваиши или пкм:
    // Ищет через варианты назначенные в меню управления (KeyCode) Сделано с целью внесения в список сторонних модификаций
    var closingBindings = [
        Binding.menu, Binding.minimap, Binding.schematicMenu,
        Binding.research, Binding.planetMap, Binding.blockInfo,
        Binding.schematicSelect, Binding.rebuildSelect
    ];

    function closeForGameAction(key) {
        if (key == KeyCode.unset) return false;
        for (var i = 0; i < closingBindings.length; i++) {
            var binding = closingBindings[i];
            if (binding.value != null && binding.value.key == key) {
                closeWheel();
                return true;
            }
        }
        return false;
    }
    //==============================================================

    // Нельзя снова открыть колесо, пока удерживается режим работы с областью.
    function wheelInputBlocked() {
        return Core.scene.hasDialog() || Core.scene.hasKeyboard()
            || Core.input.keyDown(Binding.schematicSelect)
            || Core.input.keyDown(Binding.rebuildSelect);
    }

    // ПЕРЕХВАТ ЦИФРОВОГО ВЫБОРА КАТЕГОРИЙ И БЛОКОВ ИГРЫ
    var blockedNumberBindings = [Binding.blockSelect01, Binding.blockSelect02, Binding.blockSelect03, Binding.blockSelect04, Binding.blockSelect05, Binding.blockSelect06, Binding.blockSelect07, Binding.blockSelect08, Binding.blockSelect09, Binding.blockSelect10]; // Используем текущие игровые назначения, не перезаписывая их в настройках Mindustry.
    var capturedKeys = []; // Отпускание перехваченной клавиши также не передаётся игре.
    function blockNumberKey(key) { // Проверяется только в событиях нажатия, без опроса каждого кадра.
        if (!controls.disableNumberKeys || !Vars.state.isGame() || Core.scene.hasDialog() || Core.scene.hasKeyboard()) return false; // Поля ввода и окна игры получают цифры как обычно.
        for (var i = 0; i < blockedNumberBindings.length; i++) { // Всего десять действий; пользовательские переназначения учитываются сразу.
            if (blockedNumberBindings[i].value.key == key) { capturedKeys[key.ordinal()] = true; return true; } // Событие не попадает в KeyboardDevice, поэтому PlacementFragment не увидит keyTap.
        }
        return false; // Клавиша не относится к отключённым действиям игры.
    }

    //==============================================================
    // 3) Связь с настройками main.js
    //==============================================================
    // здесь, интерфейс и сохранение настроек находятся в модуле menu.js.
    var settingsMenu = menuModule.create({
        getBlock: function(w, s) { return wheelSlots[w][s]; },
        setBlock: function(w, s, block) { wheelSlots[w][s] = block; },
        wheelView: wheelView, // Тот же объект основы, с appearance, передаём манекену по ссылке.
        controls: controls, // Левая часть настроек меняет тот же объект, который читают обработчики ввода.
        closeWheel: closeWheel
    });

    // НАЗНАЧАЕМЫЕ КОМБИНАЦИИ КЛАВИАТУРЫ И МЫШИ
    function keyHeld(key) { // Перехваченная клавиша тоже может быть назначена второстепенной для другой комбинации.
        return key != KeyCode.unset && (Core.input.keyDown(key) || capturedKeys[key.ordinal()] || key == scrollHeldKey); // Проверяем физическое состояние без постоянного опроса.
    }

    function modifierHeld(bind, incomingKey) { // Отключённая второстепенная клавиша означает одиночное нажатие основной.
        var key = controls.key(bind); // Читаем назначение напрямую, в том числе после изменения штатным меню управления.
        if (key == KeyCode.unset || key == incomingKey || key == scrollHeldKey) return true; // Входящее нажатие ещё не зарегистрировано KeyboardDevice.
        if (key == KeyCode.controlLeft || key == KeyCode.controlRight) return incomingKey == KeyCode.controlLeft || incomingKey == KeyCode.controlRight || keyHeld(KeyCode.controlLeft) || keyHeld(KeyCode.controlRight); // Оба Ctrl являются одним модификатором.
        if (key == KeyCode.shiftLeft || key == KeyCode.shiftRight) return incomingKey == KeyCode.shiftLeft || incomingKey == KeyCode.shiftRight || keyHeld(KeyCode.shiftLeft) || keyHeld(KeyCode.shiftRight); // То же правило для двух Shift.
        if (key == KeyCode.altLeft || key == KeyCode.altRight) return incomingKey == KeyCode.altLeft || incomingKey == KeyCode.altRight || keyHeld(KeyCode.altLeft) || keyHeld(KeyCode.altRight); // Учитываем оба Alt.
        return keyHeld(key); // Любая другая назначенная клавиша тоже может быть модификатором.
    }

    function matches(modifier, primary, key) { // Одна проверка комбинации используется для меню и палитры.
        return controls.key(primary) != KeyCode.unset && controls.key(primary) == key && modifierHeld(modifier, key); // Без основной клавиши действие выключено.
    }

    function canOpenWheel() { // Условия открытия одинаковы для назначенной клавиши, цифры и прокрутки.
        return windowFocused && Vars.state.isGame() && !wheelInputBlocked() && !capturedLeft && !capturedRight; // Пауза допустима, перехваченный жест мыши и чужой диалог — нет.
    }

    function mouseGestureAllows(modifier) { // Удержание назначенного мышиного модификатора не считается посторонним жестом строительства.
        var key = modifier == null ? KeyCode.unset : controls.key(modifier); // Для одиночной клавиши прокрутки модификатора нет.
        return (!Core.input.keyDown(KeyCode.mouseLeft) || key == KeyCode.mouseLeft) && (!Core.input.keyDown(KeyCode.mouseRight) || key == KeyCode.mouseRight); // Ранее удержанная неназначенная ЛКМ/ПКМ по-прежнему блокирует открытие.
    }

    function captureKey(key) { capturedKeys[key.ordinal()] = true; return true; } // Собственное действие поглощает и нажатие, и отпускание, чтобы игра не выполнила параллельную команду.

    function handleHotkey(key) { // Вызывается и клавиатурой, и кнопками мыши.
        if (!windowFocused) return false; // Не выполняем отложенную команду после потери фокуса игрового окна.
        if (settingsMenu.handleKeyDown(key)) return true; // Сначала даём собственным открытым окнам обработать закрытие.
        if (settingsMenu.isRebinding()) return false; // Новую клавишу принимает штатная плашка, а не действие мода.
        if (matches(controls.bindings.paletteModifier, controls.bindings.paletteKey, key) && (!Vars.state.isMenu() || controls.paletteInMenu)) { // Палитра доступна поверх других окон, в том числе вне игры при разрешении.
            settingsMenu.showPalette(); return captureKey(key); // Не открываем промежуточное «Радиальное меню».
        }
        if (canOpenWheel()) { // Все способы открытия «колеса выбора» используют одно условие.
            // Открытие меню
            // Колесо может быть закрыто; пауза допустима. Другое окно или начатый жест мыши
            if (matches(controls.bindings.menuModifier, controls.bindings.menuKey, key) && mouseGestureAllows(controls.bindings.menuModifier)) { // По умолчанию это Ctrl + минус.
                settingsMenu.show(activeWheelNumber); return captureKey(key); // show сохранит номер до сброса activeWheelNumber в closeWheel.
            }
            if (controls.key(controls.bindings.scrollKey) != KeyCode.unset && key == controls.key(controls.bindings.scrollKey) && mouseGestureAllows(null)) { // Прокрутка включается только после назначения основной клавиши.
                if (scrollHeldKey == KeyCode.unset) { scrollHeldKey = key; openWheel(1); Core.input.getKeyboard().scrolled(0, 0); } // Повторное событие удержания не сбрасывает номер обратно к первому.
                return captureKey(key); // KeyboardDevice не увидит назначенную кнопку как игровое действие.
            }
            if (modifierHeld(controls.bindings.wheelModifier, key) && mouseGestureAllows(controls.bindings.wheelModifier)) { // При отключённом модификаторе достаточно основной клавиши колеса.
                //!Цикл - сомнительный способ определения клавиши... Нет ли более эффективного? keyTap хранит нажатия целого кадра и может указать другую цифру.
                for (var i = 0; i < wheelCount; i++) { // Проверяем десять назначений только после подходящего модификатора.
                    if (controls.key(controls.bindings.wheels[i]) != KeyCode.unset && key == controls.key(controls.bindings.wheels[i])) { openWheel(i); return captureKey(key); } // Номер привязан к действию, а не к надписи на клавише.
                }
            }
        }
        // 2.4) Сначала закрываем колесо и пропускаем клавишу дальше в игру.
        // Это должно работать и без Shift, и при открытии меню на паузе.
        if (closeForGameAction(key)) return false; // Неназначенные модом игровые команды сохраняют прежнее закрытие колеса.
        return blockNumberKey(key); // Отключаем только цифровой выбор категорий и блоков при включённой настройке.
    }
    //==============================================================

    Core.scene.root.addCaptureListener(extend(FocusListener, {//о получении клавиатурного фокуса
        keyboardFocusChanged: function(event, actor, focused) {
            if (focused) closeWheel();
        },
        scrollFocusChanged: function(event, actor, focused) {//о получении scroll фокуса
            if (focused) closeWheel();
        }
    }));

    // поставить в очередь задачу строительства блоков
    function queueBlockSelection(block) {
        if (block == null) return;
        // Каждый запрос — отдельный объект, даже при выборе того же блока.
        // Это позволяет отличить отменённую задачу от более нового выбора.
        var selection = {block: block};
        pendingSelection = selection;
        Core.app.post(() => {
            // Задача остаётся в очереди после отмены, но ничего не делает.
            if (pendingSelection !== selection) return;
            pendingSelection = null;
            // Пока задача ждала, мир или доступность блока могли измениться.
            if (!Vars.state.isGame() || wheelInputBlocked()
                || !canSelectBlock(selection.block)) return;

            // 2.3) Это штатное поле выбранного строительного блока.
            // Выбор выходит из командования/схемы и режима сноса.
            var input = Vars.control.input;
            input.commandMode = false;
            input.selectPlans.clear();
            input.linePlans.clear();
            if (input instanceof DesktopInput) input.mode = PlaceMode.none;
            input.block = selection.block;
            uiSounds.play(uiSounds.sectorSelect); // Только после успешного выбора; отменённая задача звука не издаёт.
        });
    }

    Events.on(StateChangeEvent, event => { //о выходе в меню
        if (event.to == GameState.State.menu) closeWheel(); // сброс колеса
    });
    Events.on(ResetEvent, () => closeWheel()); // Сброс мира - сброс колеса
    Events.on(ResizeEvent, () => closeWheel()); // При изменении размеров окна закрываем колесо с прежней калибровкой системного курсора.
    Core.app.addListener(extend(ApplicationListener, { // Потеря фокуса окна является отдельным событием приложения, а не покадровой проверкой.
        pause: function() { windowFocused = false; closeWheel(); scrollHeldKey = KeyCode.unset; }, // Возвращаем курсор и прекращаем захват прокрутки при переключении в другое приложение.
        resume: function() { windowFocused = true; } // Возобновляем реакцию на новые события после возвращения в игру.
    }));

    //==============================================================
    // 1.2) Назначенные клавиши; по умолчанию Ctrl + цифра, прокрутка без назначения выключена.
    //==============================================================
    // InputProcessor — интерфейс Arc.
    Core.input.getInputMultiplexer().addProcessor(0, extend(InputProcessor, {//getInputMultiplexer() отбирает приоритет у keyDown, keyTap и keyRelease - риск при других модах
        keyDown: function(key) {
            return handleHotkey(key); // Обработка событий не зависит от FPS и не использует keyTap всего кадра.
        },

        // 3) Отпускания клавиш меню должны обрабатываться при открытом меню, которые так-то блокируется при запуске.
        keyUp: function(key) {
            if (key == scrollHeldKey) { scrollHeldKey = KeyCode.unset; wheelScrollAmount = 0; } // Отпускание прекращает захват прокрутки, оставляя колесо открытым.
            if (capturedKeys[key.ordinal()]) { capturedKeys[key.ordinal()] = false; return true; } // Не оставляем игре отпускание клавиши, нажатие которой было перехвачено.
            return settingsMenu.handleKeyUp(key);
        },

        // ПЕРЕКЛЮЧЕНИЕ НОМЕРОВ ПРОКРУТКОЙ БЕЗ МАСШТАБИРОВАНИЯ КАРТЫ
        scrolled: function(amountX, amountY) { // Arc передаёт прокрутку вперёд отрицательным amountY, назад — положительным.
            if (scrollHeldKey == KeyCode.unset || !Vars.state.isGame()) return false; // Обычную прокрутку без удержания назначенной клавиши и в главном меню не перехватываем.
            if (wheelInputBlocked()) { // Диалоги, ввод текста и выделение области сохраняют приоритет перед колесом.
                closeWheel(); // Закрываем колесо, если другое окно успело появиться перед событием прокрутки.
                return !(Core.scene.hasDialog() || Core.scene.hasKeyboard()); // Прокрутку открытого интерфейса пропускаем; при выделении области продолжаем блокировать масштабирование карты.
            }
            if (!wheelOpen || capturedLeft || capturedRight) return true; // После выбора или отмены не открываем колесо заново; карту до отпускания клавиши всё ещё не масштабируем.
            wheelScrollAmount -= amountY; // Меняем направление: прокрутка вперёд увеличивает номер, назад уменьшает.
            var steps = wheelScrollAmount >= 0 ? Math.floor(wheelScrollAmount) : Math.ceil(wheelScrollAmount); // Выделяем полные шаги, сохраняя дробную часть для плавных колёсиков и тачпадов.
            if (steps == 0) return true; // Неполный шаг поглощаем, чтобы игра не использовала его для масштабирования.
            wheelScrollAmount -= steps; // Оставляем только ещё не израсходованную дробную прокрутку.
            var nextNumber = ((activeWheelNumber + steps) % wheelCount + wheelCount) % wheelCount; // Переключаем циклически: 1–9, 0, снова 1 (формула работает и назад).
            if (nextNumber != activeWheelNumber) { // Десять полных шагов возвращают тот же номер и не требуют сброса наведения.
                setWheelNumber(nextNumber); // Переключаем слоты и визуал, подгоняя диаметр без сдвига центра колеса.
            }
            return true; // Событие не доходит до KeyboardDevice и игрового zoom; все способы масштабирования из настроек игры остаются прежними.
        },

        //==============================================================
        // 2.1–2.3) Обработка кликов
        //==============================================================
        //Обрабатываем именно нажатие, а не отпускание мыши.
        touchDown: function(screenX, screenY, pointer, button) {
            if (handleHotkey(button)) return true; // Любое собственное действие, включая открытие меню, может быть назначено на кнопку мыши.
            // 2.4) Действие из списка также может быть назначено на кнопку мыши.
            // Уже захваченный жест по-прежнему удерживаем до его отпускания.
            if (button != KeyCode.mouseLeft && button != KeyCode.mouseRight) return false;

            // Дополнительную кнопку во время уже захваченного жеста тоже
            // поглощаем, чтобы закрытие не превратилось в действие игры.
            if (!capturedLeft && !capturedRight) {
                if (!wheelOpen) return false;
                if (!Vars.state.isGame() || wheelInputBlocked()) {
                    closeWheel();
                    return false; // Открытый диалог должен получать свои клики.
                }
            }
            if (button == KeyCode.mouseLeft) capturedLeft = true;
            else capturedRight = true;

            if (wheelOpen) {
                var selectedBlock = null;
                if (button == KeyCode.mouseLeft) {
                    mousePosition.set(screenX, screenY);
                    Core.scene.screenToStageCoordinates(mousePosition);
                    var sector = sectorAt(mousePosition.x, mousePosition.y);
                    var block = sector == -1 ? null : wheelSlots[activeWheelNumber][sector];
                    if (canSelectBlock(block)) selectedBlock = block;
                }
                // 2.1) Вне кольца, в центре или на пустом слоте — отмена.
                // 2.2) ПКМ — отмена в любом месте. После выбора также закрываем.
                // Пустой/недоступный слот не сбрасывает прежний строительный блок.
                closeWheel();
                queueBlockSelection(selectedBlock);
            }
            // Исходное событие не доходит до сцены. Обновляем только её
            // координаты мыши, чтобы наведение на HUD не осталось в старой точке.
            Core.scene.mouseMoved(screenX, screenY);
            return true;
        },

        touchUp: function(screenX, screenY, pointer, button) {
            if (button == scrollHeldKey) { scrollHeldKey = KeyCode.unset; wheelScrollAmount = 0; } // Основная клавиша прокрутки может быть кнопкой мыши.
            if (capturedKeys[button.ordinal()]) { capturedKeys[button.ordinal()] = false; return true; } // Завершаем перехваченное назначение мыши, не отдавая отпускание игре.
            if (settingsMenu.handleKeyUp(button)) return true;
            if (button == KeyCode.mouseLeft && capturedLeft) {
                capturedLeft = false;
                Core.scene.mouseMoved(screenX, screenY);
                return true;
            }
            if (button == KeyCode.mouseRight && capturedRight) {
                capturedRight = false;
                Core.scene.mouseMoved(screenX, screenY);
                return true;
            }
            return false;
        },

        touchDragged: function(screenX, screenY, pointer) {
            if (motionActive && mouseMotion(screenX, screenY)) return true; // Движение с удержанной кнопкой подчиняется той же окружности.
            if (!capturedLeft && !capturedRight) return false;
            Core.scene.mouseMoved(screenX, screenY);
            return true;
        }
    }));
});
