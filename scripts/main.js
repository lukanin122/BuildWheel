// BuildWheel — этапы 1 и 2: открытие колеса и выбор из восьми секторов.
// Пункты 1 и 1.2 проверены в игре; пункт 2 ждёт такой же проверки.
// API: https://mindustrygame.github.io/docs/
// Исходники: https://github.com/Anuken/Arc/tree/master/arc-core/src/arc

// 3) require выполняется при загрузке скрипта; само меню создаётся после ClientLoadEvent.
var menuModule = require("menu"); // настройки
var wheelModule = require("wheel"); // 'колесо выбора'
var uiSounds = require("sounds"); // Загрузка файлов звуков начинается до ClientLoadEvent.
var relativeModule = require("sdl-relative"); // Подключаем файл, пока загрузчик Mindustry знает текущий мод; FFM создаём после ClientLoadEvent.

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

    // ВИРТУАЛЬНЫЙ КУРСОР: ОДНО ЧТЕНИЕ НАКОПИТЕЛЯ SDL НА КАДР
    var relative = relativeModule.create(); // Проверяем DLL и готовим FFM один раз после загрузки клиента.
    var virtualActive = false, virtualPosition = new Vec2(), relativeDelta = new Vec2(); // Позиция и смещение переиспользуются всё время работы мода.
    var cursorPoint = new Vec2(), sampleFrame = -1, motionActive = false; // Дополнительные события мыши подключены только при открытом колесе.
    var requestedRelative = false, previousOuter = false, previousInner = false, previousRatio = 0; // Изменение режима во время открытого колеса обрабатываем явно.
    var standardCursorTexture = null, standardCursorRegion = null, standardCursorScale = 1; // Штатное изображение Mindustry загружается один раз, только если оно потребуется.
    var absoluteCursor = null; // Адаптер разового сдвига обычной мыши создаём только при открытии колеса у края.
    var motionProcessor = extend(InputProcessor, {mouseMoved: function(x, y) { return mouseMotion(x, y); }}); // Перехватываем наведение раньше сцены и игрового ввода.

    function setMotionEnabled(enabled) { // Закрытое колесо не получает дополнительных вызовов JavaScript от движения мыши.
        if (motionActive == enabled) return;
        motionActive = enabled;
        if (enabled) Core.input.getInputMultiplexer().addProcessor(0, motionProcessor);
        else Core.input.removeProcessor(motionProcessor);
    }

    function wantsRelative() { return !!(controls.clipOuter || controls.clipInner || controls.relativeMouse); } // Без ограничителей и отдельного разрешения используется обычный системный курсор.

    function prepareStandardCursor() { // Используем тот же PNG и центральную точку привязки, что Fonts.loadSystemCursors.
        if (standardCursorTexture != null) return true;
        try { standardCursorTexture = new Texture(Core.files.internal("cursors/cursor.png")); standardCursorRegion = new TextureRegion(standardCursorTexture); standardCursorScale = Fonts.cursorScale(); return true; }
        catch (error) { if (standardCursorTexture != null) standardCursorTexture.dispose(); standardCursorTexture = null; Log.warn(Core.bundle.get("buildwheel.log.cursor-image"), String(error)); return false; } // Не оставляем невидимый режим при ошибке загрузки изображения.
    }

    function wheelFrame() { // Лёгкая проверка работает только у открытого колеса; нативный ввод читается только в relative mode.
        if (!wheelOpen) return;
        if (!windowFocused || !Vars.state.isGame() || wheelInputBlocked() || wantsRelative() != requestedRelative) { closeWheel(); return; } // Смена способа ввода завершает текущий захват, следующее открытие использует новые настройки.
        if (!virtualActive) return;
        if (!controls.customArrow && !prepareStandardCursor()) { closeWheel(); return; }
        sampleRelative();
    }

    function syncBoundary() { // Настройка границы применяется до выбора, даже если накопитель этого кадра уже прочитан.
        var ratio = wheelView.getDisplayVisual(activeWheelNumber).appearance.innerRadiusRatio;
        if (previousOuter != controls.clipOuter || previousInner != controls.clipInner || previousRatio != ratio) { previousOuter = controls.clipOuter; previousInner = controls.clipInner; previousRatio = ratio; clampVirtual(); }
    }

    // #ограничить курсор# ГРАНИЦА В КООРДИНАТАХ СЦЕНЫ
    function cursorLimit() {
        var radius = wheel.getWidth() / 2, limit = controls.clipOuter ? Math.max(0, radius - 0.01) : Infinity; // Малый допуск защищает выбор сектора от погрешности float.
        if (controls.clipInner) limit = Math.min(limit, Math.max(0, Math.min(radius - 0.01, radius * wheelView.getDisplayVisual(activeWheelNumber).appearance.innerRadiusRatio + Scl.scl(2)))); // При двух настройках действует меньшая окружность.
        return limit;
    }

    function clampPoint(cx, cy, limit, width, height) { // Общая геометрия не запрашивает размеры сцены и колеса на каждом подшаге.
        var dx = virtualPosition.x - cx, dy = virtualPosition.y - cy, length2 = dx * dx + dy * dy;
        if (length2 > limit * limit) { var scale = limit / Math.sqrt(length2); virtualPosition.set(cx + dx * scale, cy + dy * scale); }
        virtualPosition.x = Math.max(0, Math.min(width, virtualPosition.x)); // При выключенной окружности указатель остаётся в доступной области интерфейса.
        virtualPosition.y = Math.max(0, Math.min(height, virtualPosition.y));
    }

    function clampVirtual() { // Изменение диаметра ограничивает существующую позицию без скрытого смещения.
        clampPoint(wheel.x + wheel.getWidth() / 2, wheel.y + wheel.getHeight() / 2, cursorLimit(), Core.scene.getWidth(), Core.scene.getHeight());
    }

    function moveVirtual(dx, dy) { // #ограничить курсор# Скольжение сохраняет касательную часть движения.
        var limit = cursorLimit(), radius = wheel.getWidth() / 2, cx = wheel.x + radius, cy = wheel.y + wheel.getHeight() / 2;
        var width = Core.scene.getWidth(), height = Core.scene.getHeight(), edge2 = Math.pow(Math.max(0, limit - 0.01), 2); // Размеры и допуск вычисляем один раз для всего накопленного движения.
        var endX = virtualPosition.x + dx, endY = virtualPosition.y + dy, fromX = virtualPosition.x - cx, fromY = virtualPosition.y - cy;
        if (fromX * fromX + fromY * fromY <= limit * limit && (endX - cx) * (endX - cx) + (endY - cy) * (endY - cy) <= limit * limit && endX >= 0 && endX <= width && endY >= 0 && endY <= height) { virtualPosition.set(endX, endY); return; } // Окружность и экран выпуклы: допустимый прямой отрезок не требует подшагов.
        var steps = isFinite(limit) ? Math.min(64, Math.max(1, Math.ceil(Math.sqrt(dx * dx + dy * dy) / Math.max(2, limit * 0.15)))) : 1; // Ограниченные подшаги уменьшают зависимость скольжения от частоты кадров.
        dx /= steps; dy /= steps;
        for (var i = 0; i < steps; i++) {
            var sx = dx, sy = dy, px = virtualPosition.x - cx, py = virtualPosition.y - cy, distance2 = px * px + py * py;
            if (limit > 0 && isFinite(limit) && distance2 > 0 && distance2 >= edge2) { // Допуск учитывает float32 в Vec2; у границы удаляем только направленное наружу движение.
                var distance = Math.sqrt(distance2), nx = px / distance, ny = py / distance, outward = sx * nx + sy * ny;
                if (outward > 0) { sx -= nx * outward; sy -= ny * outward; } // Касательное и обратное движение остаются свободными.
            }
            virtualPosition.add(sx, sy); clampPoint(cx, cy, limit, width, height); // Сохраняем ограниченную точку после каждого шага.
        }
    }

    function sampleRelative() { // Вызывается до выбора по клику и перед рисованием, после обработки очереди SDL.
        if (!wheelOpen || !virtualActive) return;
        if (!windowFocused || !Vars.state.isGame() || wheelInputBlocked() || !wantsRelative()) { closeWheel(); return; } // Чужое окно, потеря фокуса и отключение режима освобождают захват даже до проверки кадра.
        syncBoundary(); // Эта проверка тоже предшествует защите от повторного чтения.
        var frame = Core.graphics.getFrameId();
        if (sampleFrame == frame) return; // GetRelativeMouseState обнуляет накопитель, поэтому читаем его только один раз.
        sampleFrame = frame;
        var sampled;
        try { sampled = relative.sample(relativeDelta); } catch (error) { closeWheel(); Log.warn("BuildWheel SDL: @", String(error)); return; } // Неожиданное исключение адаптера также освобождает режим.
        if (!sampled) { closeWheel(); return; } // Ошибка SDL не оставляет колесо со скрытым указателем.
        if (relativeDelta.x == 0 && relativeDelta.y == 0) return;
        if (numberBadge.visible) requestNumberHide(); // Настоящее движение запускает задержку исчезновения номера один раз.
        var viewport = Core.scene.getViewport(); // Чувствительность выбрана как один логический пиксель на единицу SDL.
        moveVirtual(relativeDelta.x * viewport.getWorldWidth() / viewport.getScreenWidth(), -relativeDelta.y * viewport.getWorldHeight() / viewport.getScreenHeight()); // Меняем направление Y один раз; масштаб UI повторно не применяем.
    }

    function pointerPosition(out) { // Выбор и подсветка используют один источник координат.
        if (virtualActive) return out.set(virtualPosition);
        return Core.scene.screenToStageCoordinates(out.set(Core.input.mouseX(), Core.input.mouseY())); // Неподдерживаемый backend сохраняет обычную мышь без прежнего ограничителя.
    }

    function drawVirtualCursor() { // Контрастная стрелка рисуется поверх секторов и иконок существующего колеса.
        if (!virtualActive) return; // Стрелка рисуется непрерывно; расположенная выше надпись перекрывает её только своими буквами.
        if (!controls.customArrow) { // Системный указатель в relative mode скрыт SDL; воспроизводим штатную стрелку в виртуальной точке.
            if (!prepareStandardCursor()) { closeWheel(); return; }
            var viewport = Core.scene.getViewport(), width = standardCursorRegion.width * standardCursorScale * viewport.getWorldWidth() / viewport.getScreenWidth(), height = standardCursorRegion.height * standardCursorScale * viewport.getWorldHeight() / viewport.getScreenHeight(); // У аппаратной стрелки нет дополнительного множителя Scl.
            Draw.color(Color.white); Draw.rect(standardCursorRegion, virtualPosition.x, virtualPosition.y, width, height); Draw.reset(); return; // Hotspot штатного PNG находится в центре.
        }
        var x = virtualPosition.x, y = virtualPosition.y, size = Scl.scl(9);
        Draw.color(Color.black); Fill.tri(x - 1, y + 1, x + size * 0.35, y - size - 2, x + size + 2, y - size * 0.35);
        Draw.color(Color.white); Fill.tri(x, y, x + size * 0.35, y - size * 0.8, x + size * 0.8, y - size * 0.35); Draw.reset(); // Не передаём цвет следующим элементам интерфейса.
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
        getHoveredSector: function() { pointerPosition(mousePosition); return sectorAt(mousePosition.x, mousePosition.y); }, // Подсветка и выбор по клику используют одну виртуальную позицию.
        drawCursor: drawVirtualCursor, // «Манекен» продолжает рисоваться без виртуального указателя.
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
    var numberBadge = extend(Table, { // Номер — отдельная надпись поверх игрового колеса, без собственного update.
        draw: function() {
            if (numberCursorHidden && invisibleCursor != null) { var current = gameCursor(); if (current != null && !java.util.Objects.equals(current, invisibleCursor)) numberPreviousCursor = current; Core.graphics.cursor(invisibleCursor); } // Сохраняем новое изображение игры перед временным скрытием.
            this.super$draw(); // Таблица рисует надпись штатным шрифтом с обводкой.
        }
    });
    numberBadge.name = "buildwheel-wheel-number-badge"; numberBadge.touchable = Touchable.disabled; numberBadge.visible = false; // Плашка не перехватывает выбор сектора мышью.
    numberBadge.margin(0); // Размер элемента определяется надписью; отдельный фон не создаётся.
    var numberLabel = numberBadge.add("", Styles.outlineLabel).get(); // Штатный шрифт с обводкой сохраняет читаемость номера.
    numberLabel.name = "buildwheel-wheel-number-label";
    numberLabel.setAlignment(Align.center); // Цифра располагается в середине плашки.
    var numberAnchorX = 0, numberAnchorY = 0, invisibleCursor = null, numberCursorHidden = false, numberCursorUnavailable = false; // Положение мыши запоминается при появлении номера.
    var numberHideQueued = false, numberHideDelay = 0.4; // Первое движение назначает исчезновение; следующие движения не отодвигают срок.
    var cursorStateField = null, numberPreviousCursor = null; // Для временного прозрачного курсора сохраняем именно выбранное игрой изображение.
    try { cursorStateField = java.lang.Class.forName("arc.Graphics").getDeclaredField("lastCursor"); cursorStateField.setAccessible(true); } catch (ignored) {} // Отсутствие внутреннего поля не блокирует работу колеса.
    function gameCursor() { try { return cursorStateField == null ? null : cursorStateField.get(Core.graphics); } catch (ignored) { return null; } } // Сбой необязательного чтения не мешает освобождению ввода.

    // НОМЕР КОЛЕСА И ЗАДЕРЖКА ЕГО СКРЫТИЯ
    function hideWheelNumber() { // Вызывается после задержки, при переключении номера или закрытии колеса.
        numberBadge.clearActions(); numberHideQueued = false; // Отменяем задержку прежнего номера при закрытии или переключении колеса.
        numberBadge.visible = false; // Скрытая плашка не рисуется и не обновляется.
        numberBadge.remove(); // Выключенная плашка отсутствует в сцене и не участвует даже в штатном обходе UI.
        restoreNumberCursor(); // Возвращаем аппаратный курсор, если надпись временно закрывала его.
        setMotionEnabled(wheelOpen && virtualActive); // Относительные события остаются захваченными до закрытия колеса.
    }

    function restoreNumberCursor() { // Восстановление картинки мыши не требует скрывать ещё читаемый номер.
        if (numberCursorHidden) { // Не перезаписываем курсор, который успела установить игра или другой мод.
            var current = gameCursor();
            if (current == null || java.util.Objects.equals(current, invisibleCursor)) { if (numberPreviousCursor != null) Core.graphics.cursor(numberPreviousCursor); else Core.graphics.restoreCursor(); }
            numberCursorHidden = false; numberPreviousCursor = null;
        }
    }

    function requestNumberHide() { // Одна штатная Action обслуживает задержку после первого движения, без отдельного таймера или опроса.
        if (!numberBadge.visible || numberHideQueued) return;
        numberHideQueued = true;
        numberBadge.addAction(Actions.sequence(Actions.delay(numberHideDelay), Actions.run(hideWheelNumber)));
    }

    function showWheelNumber() { // Рисуем только для настоящего «колеса выбора», не для «манекена».
        numberBadge.clearActions(); numberHideQueued = false; // Обновляем номер без промежуточного показа аппаратного курсора.
        if (!controls.showNumber || !wheelOpen) { hideWheelNumber(); return; } // Выключенная настройка не оставляет скрытый курсор или надпись.
        numberLabel.setText(String(activeWheelNumber)); numberLabel.setColor(controls.numberColor); // Используем выбранный пользователем цвет текста.
        var radius = wheel.getWidth() / 2, innerRadius = radius * wheelView.getDisplayVisual(activeWheelNumber).appearance.innerRadiusRatio;
        var font = numberLabel.getStyle().font, capHeight = font.getCapHeight() / font.getData().scaleY; // Получаем высоту заглавного символа при масштабе шрифта 1, не меняя общий Font.
        numberLabel.setFontScale(Math.max(radius * 0.2, innerRadius * 0.8) / Math.max(1, capHeight)); // Высота символа равна большему из двух размеров, рассчитанных по радиусам.
        numberBadge.pack(); // Подгоняем границы под масштабированную цифру.
        numberBadge.setPosition(wheel.x + wheel.getWidth() / 2 - numberBadge.getWidth() / 2, wheel.y + wheel.getHeight() / 2 - numberBadge.getHeight() / 2); // Привязываем плашку к центру колеса.
        Core.scene.root.addChild(numberBadge); numberBadge.visible = true; numberBadge.toFront(); // Один виджет рисуется поверх кольца и иконок всех десяти номеров.
        setMotionEnabled(true); // Первое движение начнёт задержку; после исчезновения ненужный обработчик будет удалён.
        numberAnchorX = Core.input.mouseX(); numberAnchorY = Core.input.mouseY(); // Синтетическое перемещение в эту же позицию не считается движением пользователя.
        syncNumberCursor(numberAnchorX, numberAnchorY);
    }

    function syncNumberCursor(screenX, screenY) { // Пока номер виден, скрываем обычную мышь только непосредственно под надписью.
        if (virtualActive || !numberBadge.visible) return; // В relative mode аппаратную мышь скрывает SDL.
        Core.scene.screenToStageCoordinates(cursorPoint.set(screenX, screenY));
        if (cursorPoint.x < numberBadge.x || cursorPoint.x > numberBadge.getRight() || cursorPoint.y < numberBadge.y || cursorPoint.y > numberBadge.getTop()) { restoreNumberCursor(); return; }
        if (!numberCursorHidden && !numberCursorUnavailable) {
            try {
                if (invisibleCursor == null) { // Единственный прозрачный курсор создаём только при первом использовании настройки.
                    var pixel = new Pixmap(1, 1); pixel.fill(0); // Аппаратный курсор находится выше OpenGL; прозрачность позволяет цифре оставаться поверх него.
                    try { invisibleCursor = Core.graphics.newCursor(pixel, 0, 0); } finally { pixel.dispose(); } // Однопиксельная временная картинка больше не нужна.
                }
                if (invisibleCursor != null) { numberPreviousCursor = gameCursor(); Core.graphics.cursor(invisibleCursor); numberCursorHidden = true; } // Прежняя картинка возвращается при выходе мыши из-под текста или скрытии номера.
                else numberCursorUnavailable = true; // Backend без аппаратных курсоров больше не требует попыток создания.
            } catch (error) { // Плашка остаётся работоспособной и на backend без аппаратных курсоров.
                numberCursorUnavailable = true; // Не повторяем неподдерживаемую операцию при каждом открытии колеса.
            }
        }
    }

    function mouseMotion(screenX, screenY) { // Одна проверка обслуживает mouseMoved и touchDragged. #ограничить курсор#
        if (virtualActive) { sampleRelative(); return true; } // Внутри режима движение получает только BuildWheel.
        if (numberBadge.visible) { if (screenX != numberAnchorX || screenY != numberAnchorY) requestNumberHide(); syncNumberCursor(screenX, screenY); } // Задержка сохраняет читаемость цифры, а мышь вне надписи остаётся видимой.
        return false; // Неподдерживаемая платформа сохраняет обычное наведение.
    }
    Events.on(DisposeEvent, () => { // Освобождаем нативные ресурсы один раз при завершении игры.
        closeWheel(); // Сначала снимаем ограничение ОС и возвращаем обычный курсор.
        if (invisibleCursor != null) { invisibleCursor.dispose(); invisibleCursor = null; } // Повторное событие не должно освобождать тот же аппаратный курсор дважды.
        if (standardCursorTexture != null) { standardCursorTexture.dispose(); standardCursorTexture = null; standardCursorRegion = null; } // Освобождаем только собственную текстуру, а не курсоры Mindustry.
        if (absoluteCursor != null) absoluteCursor.dispose(); // Разовый сдвиг не захватывает мышь; освобождаем только его буферы FFM.
        relative.dispose(); // Закрываем FFM-память только после отключения своего режима SDL.
    });
    //==============================================================

    //Закрытие колеса при выходе в меню или сбросе мира.
    function closeWheel() {
        wheelOpen = false; // Закрытие сначала отключает обработку движения, даже если до этого был показан номер.
        wheel.update(null); virtualActive = false; // Сначала прекращаем чтение накопителя и отображение виртуального указателя.
        try { relative.end(); } catch (error) { Log.err(Core.bundle.get("buildwheel.log.sdl-release"), String(error)); } // Остальная очистка выполняется даже при ошибке адаптера.
        setMotionEnabled(false); // Убираем обработчик наведения из цепочки ввода.
        hideWheelNumber(); // Номер и временно скрытый курсор не должны оставаться после выбора, отмены или открытия окна.
        wheel.resetHoverSound(); // Повторное открытие начинает новую историю звука наведения.
        activeWheelNumber = -1;
        wheel.visible = false;
        pendingSelection = null; // Отменяет ещё не выполненный запрос выбора.
        wheelScrollAmount = 0; // После закрытия не переносим незавершённый шаг прокрутки в следующее открытие.
    }

    // РАЗОВОЕ РАЗМЕЩЕНИЕ КОЛЕСА И КУРСОРА ПРИ ОТКРЫТИИ
    function positionWheel() { // mousePosition содержит текущую видимую позицию мыши в координатах сцены.
        var originalX = mousePosition.x, originalY = mousePosition.y, margin = wheel.getWidth() / 2 * controls.edgeShift; // При нуле сдвига нет, при единице отступ от каждого края равен радиусу.
        if (margin > 0) {
            mousePosition.x = Core.scene.getWidth() < margin * 2 ? Core.scene.getWidth() / 2 : Math.max(margin, Math.min(Core.scene.getWidth() - margin, mousePosition.x)); // Если колесо слишком широко, выбираем середину доступной области.
            mousePosition.y = Core.scene.getHeight() < margin * 2 ? Core.scene.getHeight() / 2 : Math.max(margin, Math.min(Core.scene.getHeight() - margin, mousePosition.y)); // Аналогично обрабатываем верхний и нижний края.
        }
        if (!virtualActive && (mousePosition.x != originalX || mousePosition.y != originalY)) { // Обычную мышь переносим только при реальном сдвиге центра, без обработки каждого движения.
            Core.scene.getViewport().project(cursorPoint.set(mousePosition)); // Получаем экранные координаты Arc с осью Y снизу вверх.
            var x = Math.round(cursorPoint.x), y = Math.round(cursorPoint.y), moved = x == Core.input.mouseX() && y == Core.input.mouseY(); // Целая позиция совпадает с точностью системной мыши.
            try { if (!moved) { if (absoluteCursor == null) absoluteCursor = relativeModule.createWarp(relative); moved = absoluteCursor.move(x, y); } }
            catch (error) { Log.warn(Core.bundle.get("buildwheel.log.absolute-shift"), String(error)); } // Ошибка не оставляет колесо отдельно от фактического курсора.
            if (moved) Core.scene.screenToStageCoordinates(mousePosition.set(Core.input.mouseX(), Core.input.mouseY())); // Фактическая целая позиция курсора становится центром, включая крайний пиксель окна.
            else mousePosition.set(originalX, originalY); // При отказе платформы сохраняем обычное открытие непосредственно под мышью.
        }
        wheel.setPosition(mousePosition.x - wheel.getWidth() / 2, mousePosition.y - wheel.getHeight() / 2); // Центрируем колесо под выбранной точкой открытия.
        virtualPosition.set(mousePosition); // В относительном режиме сдвигаются и колесо, и его указатель; физическую мышь не трогаем.
    }

    // ПЕРЕКЛЮЧЕНИЕ КОМПЛЕКТА ПОД ВИДИМЫМ КУРСОРОМ
    function playWheelOpen() { // Порядок звука совпадает с клавиатурой: 1–9, затем 0.
        if (!wheelOpen) return; // Чужое окно могло отменить открытие во время обновления наведения.
        var order = activeWheelNumber == 0 ? wheelCount - 1 : activeWheelNumber - 1;
        uiSounds.play(uiSounds.wheelOpen, controls.wheelOpenPitch ? 1.06 - 0.12 * order / (wheelCount - 1) : 1); // Меняем высоту тона линейно; громкость и канал остаются в sounds.js.
    }

    function setWheelNumber(number, opening) { // Используется при открытии и переключении прокруткой.
        if (wheelOpen && !opening) { if (virtualActive) sampleRelative(); if (!wheelOpen) return; pointerPosition(mousePosition); } // Сначала учитываем движение относительно старого колеса, затем запоминаем видимую точку нового открытия.
        var diameter = wheelView.getDisplayVisual(number).appearance.diameter; // Читаем диаметр действующего визуала с учётом закрепления замком.
        wheel.setSize(diameter, diameter); // Применяем размер выбранного комплекта к существующему виджету.
        activeWheelNumber = number; // Рисование и выбор блока теперь используют комплект и слоты этого номера.
        wheel.resetHoverSound(); // Новый набор секторов получает собственный звук первого наведения.
        if (wheelOpen && !opening) { positionWheel(); Core.scene.mouseMoved(Core.input.mouseX(), Core.input.mouseY()); showWheelNumber(); playWheelOpen(); } // Меняем центр без выключения SDL relative mode; обновляем надпись и звук.
    }

    // ОТКРЫТИЕ КОЛЕСА ПОД КУРСОРОМ ОБОИМИ СПОСОБАМИ
    function openWheel(number) { // Общая функция для назначенных клавиш и переключения прокруткой.
        if (wheelOpen) { setWheelNumber(number, false); return; } // Переключение переиспользует виджет и захват, не показывая промежуточный системный курсор.
        mousePosition.set(Core.input.mouseX(), Core.input.mouseY()); //координаты мыши
        Core.scene.screenToStageCoordinates(mousePosition); //!переводим в координаты сцены интерфейса (проверить что конкретно за интерфейс)
        setWheelNumber(number, true); // Выбираем данные и диаметр именно открываемого номера.
        requestedRelative = wantsRelative(); // Независимый переключатель и оба ограничителя являются тремя условиями включения одного механизма.
        var nativeReady = requestedRelative && relative.available; // Другая платформа сохраняет обычный выбор; занятый или потерянный захват не забираем.
        if (nativeReady && !controls.customArrow && !prepareStandardCursor()) { closeWheel(); return; }
        try { virtualActive = nativeReady && relative.begin(); } catch (error) { closeWheel(); Log.warn("BuildWheel SDL: @", String(error)); return; } // Без запроса relative mode даже не вызываем begin.
        if ((nativeReady || relative.active) && !virtualActive) { closeWheel(); return; } // При ошибке входа или чужом relative mode отменяем именно это открытие.
        positionWheel(); // Сдвиг у края работает с обычным и относительным вводом.
        sampleFrame = Core.graphics.getFrameId(); // Входной накопитель уже очищен, старые события этого кадра не смещают указатель.
        //* Позиция фиксируется в момент открытия и не следует за мышью.
        //* При выключенном сдвиге у края экрана круг может обрезаться.
        wheelScrollAmount = 0; // Каждое открытие начинает отсчёт прокрутки с целого шага.
        wheelOpen = true; // Разрешаем отрисовку и выбор сектора.
        wheel.visible = true; //Включаем отрисовку колеса, чтобы оно отрисовывалось в draw() и было доступно для клика мышью.
        wheel.toFront(); // Перемещаем wheel в конец корневой группы, чтобы он рисовался поверх остальных элементов интерфейса.
        wheel.update(wheelFrame); // Проверки состояния выключаются при закрытии; обычный ввод не читает SDL-накопитель.
        if (virtualActive) { previousOuter = controls.clipOuter; previousInner = controls.clipInner; previousRatio = wheelView.getDisplayVisual(activeWheelNumber).appearance.innerRadiusRatio; clampVirtual(); setMotionEnabled(true); } // Ограничения включаются лишь при действительно захваченном режиме.
        Core.scene.mouseMoved(Core.input.mouseX(), Core.input.mouseY()); // Наведение теперь получает само открытое колесо, а не HUD под ним.
        showWheelNumber(); // После сдвига колеса плашка и запомненная позиция мыши используют окончательный центр.
        playWheelOpen(); // Звук относится к успешно открытому колесу; отказ захвата сюда не доходит.
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
    function resetCapturedInput() { capturedLeft = false; capturedRight = false; capturedKeys = []; scrollHeldKey = KeyCode.unset; wheelScrollAmount = 0; } // Потерянное вне окна отпускание не должно блокировать следующие открытия.
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
        if (event.to == GameState.State.menu) { closeWheel(); resetCapturedInput(); } // сброс колеса
    });
    Events.on(ResetEvent, () => { closeWheel(); resetCapturedInput(); }); // Сброс мира - сброс колеса
    Events.on(ResizeEvent, () => closeWheel()); // При изменении размеров окна освобождаем режим с прежним масштабом координат.
    Core.app.addListener(extend(ApplicationListener, { // Потеря фокуса окна является отдельным событием приложения, а не покадровой проверкой.
        pause: function() { windowFocused = false; closeWheel(); resetCapturedInput(); }, // Возвращаем курсор и прекращаем захват прокрутки при переключении в другое приложение.
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
            if (virtualActive && scrollHeldKey == KeyCode.unset) return true; // Виртуальное колесо не передаёт прокрутку карте или чужому HUD.
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
                setWheelNumber(nextNumber); // Открываем следующий комплект под видимым курсором с учётом отступа от краёв.
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
            if (button != KeyCode.mouseLeft && button != KeyCode.mouseRight) { // Неназначенные дополнительные кнопки не должны уходить в мир за виртуальным курсором.
                if (virtualActive && wheelOpen && !wheelInputBlocked()) { capturedKeys[button.ordinal()] = true; return true; } // Отпускание этой же кнопки поглотит существующий обработчик capturedKeys.
                return false;
            }

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
                    sampleRelative();
                    if (!wheelOpen) return true; // Ошибка чтения или потеря фокуса отменяет выбор.
                    pointerPosition(mousePosition);
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
