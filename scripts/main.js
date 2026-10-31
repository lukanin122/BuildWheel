// BuildWheel — этапы 1 и 2: открытие колеса и выбор из восьми секторов.
// Пункты 1 и 1.2 проверены в игре; пункт 2 ждёт такой же проверки.
// API: https://mindustrygame.github.io/docs/
// Исходники: https://github.com/Anuken/Arc/tree/master/arc-core/src/arc

// 3) require выполняется при загрузке скрипта; само меню создаётся после ClientLoadEvent.
var menuModule = require("menu");
var wheelModule = require("wheel"); // Общая основа игрового колеса и манекена загружается один раз.

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

    // Единственная основа для двух виджетов. Функции передают актуальные блоки и масштабы,
    // не копируя их: изменения в редакторе сразу доступны игровому колесу.
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

    // Определяем наличие курсора на одном из секторов
    // Принимает координаты сцены интерфейса, возвращает сектор 0–7 или -1.
    function sectorAt(stageX, stageY) {
        // wheel находится прямо в корне сцены: вычитание его позиции даёт локальные координаты.
        return wheelView.sectorAt(wheel, stageX - wheel.x, stageY - wheel.y);
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
    // Общая фабрика создаёт Element. Здесь задаём только поведение игрового режима.
    var wheel = wheelView.createElement({
        canDraw: function() { return wheelOpen && Vars.state.isGame(); },
        getWheelNumber: function() { return activeWheelNumber; },
        getHighlightedSector: function() {
            mousePosition.set(Core.input.mouseX(), Core.input.mouseY());
            Core.scene.screenToStageCoordinates(mousePosition);
            return sectorAt(mousePosition.x, mousePosition.y);
        },
        getIconAlpha: function(block) {
            // Запрещённый блок остаётся выбираемым для предпросмотра, но рисуется тускло.
            return canSelectBlock(block) && block.isPlaceable() ? 1 : 0.30;
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
        wheelOpen = false;
        activeWheelNumber = -1;
        wheel.visible = false;
        pendingSelection = null; // Отменяет ещё не выполненный запрос выбора.
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
        wheelView: wheelView, // Тот же объект основы, включая appearance, передаём манекену по ссылке.
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
        });
    }

    Events.on(StateChangeEvent, event => { //о выходе в меню
        if (event.to == GameState.State.menu) closeWheel(); // сброс колеса
    });
    Events.on(ResetEvent, () => closeWheel()); // Сброс мира - сброс колеса

    //==============================================================
    // 1.2) Shift + цифра - отрисовка выбранного колеса поверх интерфейса по координатам курсора.
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

            mousePosition.set(Core.input.mouseX(), Core.input.mouseY()); //координаты мыши
            Core.scene.screenToStageCoordinates(mousePosition); //!переводим в координаты сцены интерфейса (проверить что конкретно за интерфейс)
            wheel.setSize(wheelView.appearance.diameter, wheelView.appearance.diameter); // При открытии берём актуальный общий размер.
            wheel.setPosition(
                mousePosition.x - wheel.getWidth() / 2,
                mousePosition.y - wheel.getHeight() / 2
            );

            //* Позиция фиксируется в момент открытия и не следует за мышью.
            //* У края экрана круг может обрезаться: центр остаётся под курсором.
            activeWheelNumber = pressedNumber;
            wheelOpen = true;
            wheel.visible = true; //Включаем отрисовку колеса, чтобы оно отрисовывалось в draw() и было доступно для клика мышью.
            wheel.toFront(); // Перемещаем wheel в конец корневой группы, чтобы он рисовался поверх остальных элементов интерфейса.

            return false;
        },

        // 3) Отпускания клавиш меню должны обрабатываться при открытом меню, которые так-то блокируется при запуске.
        keyUp: function(key) {
            if (key == KeyCode.minus && settingsMinusCaptured) {
                settingsMinusCaptured = false;
                return true;
            }
            return settingsMenu.handleKeyUp(key);
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
