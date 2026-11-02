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
    var wheelOpen = false; // wheelOpen отвечает за показ и отрисовку колеса
    var activeWheelNumber = -1; // Номер последнего открытого колеса 0-9, дефолт -1
    var mousePosition = new Vec2(); 
    var numberKeys = [
        KeyCode.num0, KeyCode.num1, KeyCode.num2, KeyCode.num3, KeyCode.num4,
        KeyCode.num5, KeyCode.num6, KeyCode.num7, KeyCode.num8, KeyCode.num9
    ];
    var wheelScrollKey = KeyCode.capsLock; // Временная клавиша открытия и переключения колёс прокруткой; позднее её можно получать из настроек.
    var wheelScrollAmount = 0; // Накапливаем дробную прокрутку: одна полная единица переключает одно колесо.

    // 2) Отдельные восемь слотов для каждого колеса 0–9.
    // null означает пустой слот; непустой слот хранит сам объект Block.
    // Нумерация по часовой стрелке: 0 — север, 1 — северо-восток,
    // 2 — восток, 3 — юго-восток, 4 — юг, 5 — юго-запад,
    // 6 — запад, 7 — северо-запад.
    var wheelSlots = [];
    for (var wheelNumber = 0; wheelNumber < numberKeys.length; wheelNumber++) {
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
    var settingsMinusCaptured = false; // Минус открыл настройки: его отпускание тоже не отдаём игре.

    // Определяем наличие курсора на одном из секторов (в wheel.js). Принимает координаты сцены интерфейса, возвращает сектор 0–7 или -1.
    function sectorAt(stageX, stageY) {
        // wheel находится прямо в корне сцены: вычитание его позиции даёт локальные координаты.
        return wheelView.sectorAt(wheel, stageX - wheel.x, stageY - wheel.y, activeWheelNumber); // Проверяем сектор по визуалу открытого номера, включая его внутренний круг и число секторов.
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
    //==============================================================

    //Закрытие колеса при выходе в меню или сбросе мира.
    function closeWheel() {
        wheel.resetHoverSound(); // Повторное открытие начинает новую историю звука наведения.
        wheelOpen = false;
        activeWheelNumber = -1;
        wheel.visible = false;
        pendingSelection = null; // Отменяет ещё не выполненный запрос выбора.
        wheelScrollAmount = 0; // После закрытия не переносим незавершённый шаг прокрутки в следующее открытие.
    }

    // ПЕРЕКЛЮЧЕНИЕ КОМПЛЕКТА БЕЗ СМЕЩЕНИЯ ЦЕНТРА КОЛЕСА
    function setWheelNumber(number) { // Используется при открытии и переключении прокруткой.
        var diameter = wheelView.getVisual(number).appearance.diameter; // Читаем диаметр нужного номера из уже загруженных данных.
        var centerX = wheel.x + wheel.getWidth() / 2, centerY = wheel.y + wheel.getHeight() / 2; // Запоминаем прежний центр перед изменением размеров.
        wheel.setSize(diameter, diameter); // Применяем размер выбранного комплекта к существующему виджету.
        wheel.setPosition(centerX - diameter / 2, centerY - diameter / 2); // Сохраняем центр, даже если соседнее колесо больше или меньше предыдущего.
        activeWheelNumber = number; // Рисование и выбор блока теперь используют комплект и слоты этого номера.
        wheel.resetHoverSound(); // Первый наведённый сектор нового номера снова может издать звук.
    }

    // ОТКРЫТИЕ КОЛЕСА ПОД КУРСОРОМ ОБОИМИ СПОСОБАМИ
    function openWheel(number) { // Общая функция для Shift + цифра и клавиши переключения прокруткой.
        mousePosition.set(Core.input.mouseX(), Core.input.mouseY()); // Получаем положение курсора в момент открытия.
        Core.scene.screenToStageCoordinates(mousePosition); // Переводим экранные координаты в координаты сцены интерфейса.
        setWheelNumber(number); // Выбираем данные и диаметр именно открываемого номера.
        wheel.setPosition(mousePosition.x - wheel.getWidth() / 2, mousePosition.y - wheel.getHeight() / 2); // Центрируем колесо под курсором; у края экрана часть круга может обрезаться.
        wheelScrollAmount = 0; // Каждое открытие начинает отсчёт прокрутки с целого шага.
        wheelOpen = true; // Разрешаем отрисовку и выбор сектора.
        wheel.visible = true; // Показываем виджет на сцене.
        wheel.toFront(); // Размещаем колесо поверх остальных элементов интерфейса.
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

    //==============================================================
    // 3) Связь с настройками main.js
    //==============================================================
    // здесь, интерфейс и сохранение настроек находятся в модуле menu.js.
    var settingsMenu = menuModule.create({
        getBlock: function(w, s) { return wheelSlots[w][s]; },
        setBlock: function(w, s, block) { wheelSlots[w][s] = block; },
        wheelView: wheelView, // Тот же объект основы, с appearance, передаём манекену по ссылке.
        closeWheel: closeWheel
    });

    // Открытие меню
    // Колесо может быть закрыто; пауза допустима. Другое окно или начатый жест мыши
    function openSettingsFromKey(key) {
        if (key != KeyCode.minus || !Vars.state.isGame() || wheelInputBlocked()) return false;
        var shiftPressed = Core.input.keyDown(KeyCode.shiftLeft)
            || Core.input.keyDown(KeyCode.shiftRight);
        if (!shiftPressed || capturedLeft || capturedRight
            || Core.input.keyDown(KeyCode.mouseLeft)
            || Core.input.keyDown(KeyCode.mouseRight)) return false;

        settingsMinusCaptured = true;
        settingsMenu.show(activeWheelNumber); // show сохранит номер до сброса activeWheelNumber в closeWheel.
        return true;
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

    //==============================================================
    // 1.2) Shift + цифра или Caps Lock + прокрутка — открытие и переключение колёс.
    //==============================================================
    // InputProcessor — интерфейс Arc.
    Core.input.getInputMultiplexer().addProcessor(0, extend(InputProcessor, {//getInputMultiplexer() отбирает приоритет у keyDown, keyTap и keyRelease - риск при других модах
        keyDown: function(key) {
            
            if (settingsMenu.handleKeyDown(key)) return true;
            if (openSettingsFromKey(key)) return true; // 3) Модуль обслуживает закрытие настроек; открытие по Shift + минус — здесь.
            // 2.4) Сначала закрываем колесо и пропускаем клавишу дальше в игру.
            // Это должно работать и без Shift, и при открытии меню на паузе.
            if (closeForGameAction(key)) return false;
            if (!Vars.state.isGame()) return false; // Разрешаем открытие в игре, включая паузу; в главном меню — нельзя.
            if (wheelInputBlocked()) return false; // 2.4) Диалог, поле ввода или удерживаемое выделение области.

            //Сомнительно, но не даёт активироваться при удержанных заранее ЛКМ и ПКМ (пойдёт в доп. настройки!)
            if (capturedLeft || capturedRight
                || Core.input.keyDown(KeyCode.mouseLeft)
                || Core.input.keyDown(KeyCode.mouseRight)) return false;

            if (key == wheelScrollKey) { // Отдельная клавиша открывает колесо №1 без удержания Shift.
                if (!Core.input.keyDown(wheelScrollKey)) { // Автоповтор удерживаемой клавиши не возвращает выбранный номер обратно к 1.
                    openWheel(1); // Начинаем переключение с первого колеса и фиксируем его положение под курсором.
                    Core.input.getKeyboard().scrolled(0, 0); // Убираем прокрутку, которая могла попасть в игровой zoom ранее в этом же кадре.
                }
                return false; // Даём KeyboardDevice запомнить физическое удержание клавиши (состояние индикатора Caps Lock не используется).
            }

            var shiftPressed = Core.input.keyDown(KeyCode.shiftLeft) //определяем, нажата ли клавиша Shift (левая или правая)
                || Core.input.keyDown(KeyCode.shiftRight);
            if (!shiftPressed) return false;

            //!Цикл - сомнительный способ определения клавиши... Нет ли более эффективного? keyTap хранит нажатия целого кадра и может указать другую цифру.
            var pressedNumber = -1;
            for (var i = 0; i < numberKeys.length; i++) {
                if (key == numberKeys[i]) {
                    pressedNumber = i;
                    break;
                }
            }
            if (pressedNumber == -1) return false;

            openWheel(pressedNumber); // Прежний способ Shift + цифра использует то же открытие и позиционирование.
            return false;
        },

        // 3) Отпускания клавиш меню должны обрабатываться при открытом меню, которые так-то блокируется при запуске.
        keyUp: function(key) {
            if (key == wheelScrollKey) wheelScrollAmount = 0; // Отпускание прекращает переключение прокруткой, оставляя само колесо открытым.
            if (key == KeyCode.minus && settingsMinusCaptured) {
                settingsMinusCaptured = false;
                return true;
            }
            return settingsMenu.handleKeyUp(key);
        },

        // ПЕРЕКЛЮЧЕНИЕ НОМЕРОВ ПРОКРУТКОЙ БЕЗ МАСШТАБИРОВАНИЯ КАРТЫ
        scrolled: function(amountX, amountY) { // Arc передаёт прокрутку вперёд отрицательным amountY, назад — положительным.
            if (!Core.input.keyDown(wheelScrollKey) || !Vars.state.isGame()) return false; // Обычную прокрутку без удержания клавиши и в главном меню не перехватываем.
            if (wheelInputBlocked()) { // Диалоги, ввод текста и выделение области сохраняют приоритет перед колесом.
                closeWheel(); // Закрываем колесо, если другое окно успело появиться перед событием прокрутки.
                return !(Core.scene.hasDialog() || Core.scene.hasKeyboard()); // Прокрутку открытого интерфейса пропускаем; при выделении области продолжаем блокировать масштабирование карты.
            }
            if (!wheelOpen || capturedLeft || capturedRight) return true; // После выбора или отмены не открываем колесо заново; карту до отпускания клавиши всё ещё не масштабируем.
            wheelScrollAmount -= amountY; // Меняем направление: прокрутка вперёд увеличивает номер, назад уменьшает.
            var steps = wheelScrollAmount >= 0 ? Math.floor(wheelScrollAmount) : Math.ceil(wheelScrollAmount); // Выделяем полные шаги, сохраняя дробную часть для плавных колёсиков и тачпадов.
            if (steps == 0) return true; // Неполный шаг поглощаем, чтобы игра не использовала его для масштабирования.
            wheelScrollAmount -= steps; // Оставляем только ещё не израсходованную дробную прокрутку.
            var nextNumber = ((activeWheelNumber + steps) % numberKeys.length + numberKeys.length) % numberKeys.length; // Переключаем циклически: 1–9, 0, снова 1 (формула работает и назад).
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
            if (settingsMenu.handleKeyDown(button)) return true; // 3.1) Вызов меню может быть назначен на мышь.
            // 2.4) Действие из списка также может быть назначено на кнопку мыши.
            // Уже захваченный жест по-прежнему удерживаем до его отпускания.
            if (!capturedLeft && !capturedRight && closeForGameAction(button)) return false;
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
            if (!capturedLeft && !capturedRight) return false;
            Core.scene.mouseMoved(screenX, screenY);
            return true;
        }
    }));
});
