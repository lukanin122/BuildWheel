// BuildWheel — этапы 1 и 2: открытие колеса и выбор из восьми секторов.
// Пункты 1 и 1.2 проверены в игре; пункт 2 ждёт такой же проверки.
// API: https://mindustrygame.github.io/docs/
// Исходники: https://github.com/Anuken/Arc/tree/master/arc-core/src/arc

// ClientLoadEvent вызывается после загрузки клиентской части игры
// когда клиентский интерфейс уже создан.
Events.on(ClientLoadEvent, () => {
    var wheelDiameter = 260; // Пока диаметр общий для всех колёс; настройка размера будет в пункте 4.2.
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

    var innerRadiusRatio = 0.24; // Центр без сектора - в долях от круга.
    var sectorAngle = 360 / 8; // Угол сектора в градусах.
    // Захваченные кнопки удерживаем до отпускания даже после закрытия колеса.
    // Иначе игра получит отпускание без нажатия и может завершить свой жест.
    var capturedLeft = false;
    var capturedRight = false;
    var pendingSelection = null; // Запрос выбора, ожидающий выполнения в очереди приложения.

    // Определяем наличие курсора на одном из секторов
    // Принимает координаты сцены интерфейса, возвращает сектор 0–7 или -1.
    function sectorAt(stageX, stageY) {
        var radius = wheel.getWidth() / 2;
        var dx = stageX - (wheel.x + radius);
        var dy = stageY - (wheel.y + wheel.getHeight() / 2);//Координаты мыши относительно колеса
        
        var distanceSquared = dx * dx + dy * dy;
        var innerRadius = radius * innerRadiusRatio;
        if (distanceSquared < innerRadius * innerRadius
            || distanceSquared > radius * radius) return -1;// Курсор вне кольца или в центре — отмена выбора.

        var angle = (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360; //Угол направления от центра к точке от севера по часовой стрелке
        return Math.floor((angle + sectorAngle / 2) / sectorAngle) % 8; //возвращает сектор 0–7 или -1. Половина угла сектора плюсуется для отсчёта ровно по северу сектора.
    }

    function canSelectBlock(block) { // Проверяем доступность для строительства так же, как строительное меню игры.
        return block != null && block.placeablePlayer && block.isPlaceable()
            && block.unlockedNowHost() && block.environmentBuildable();
    }

    // Рисуем подсветку целевого сектора шестью небольшими четырёхугольниками.
    // Все углы, как и в sectorAt, отсчитываются от севера по часовой стрелке.
    function drawSector(centerX, centerY, radius, sector) {
        var innerRadius = radius * innerRadiusRatio;
        var start = sector * sectorAngle - sectorAngle / 2;
        for (var part = 0; part < 6; part++) {
            var angleA = (start + sectorAngle * part / 6) * Math.PI / 180;
            var angleB = (start + sectorAngle * (part + 1) / 6) * Math.PI / 180;
            var sinA = Math.sin(angleA), cosA = Math.cos(angleA);
            var sinB = Math.sin(angleB), cosB = Math.cos(angleB);
            Fill.quad(
                centerX + sinA * innerRadius, centerY + cosA * innerRadius,
                centerX + sinA * radius, centerY + cosA * radius,
                centerX + sinB * radius, centerY + cosB * radius,
                centerX + sinB * innerRadius, centerY + cosB * innerRadius
            );
        }
    }

    // 1) Создаём объект wheel - полупрозрачный шаблон колеса.
    // extend создаёт наследника Element (элемент интерфейса Arc) и переопределяет его метод draw().
    var wheel = extend(Element, {
        draw: function() {
            if (!wheelOpen || !Vars.state.isGame()) return;

            var radius = this.width / 2;
            var centerX = this.x + radius;
            var centerY = this.y + this.height / 2;

            Draw.color(Color.white);// Цвет фона колеса.
            Draw.alpha(0.22);
            Fill.circle(centerX, centerY, radius);

            //Подсветка сектора от наведённой мышки; центр остаётся зоной отмены.
            mousePosition.set(Core.input.mouseX(), Core.input.mouseY());
            Core.scene.screenToStageCoordinates(mousePosition);
            var hoveredSector = sectorAt(mousePosition.x, mousePosition.y);
            if (hoveredSector != -1) {
                Draw.color(Pal.accent);
                Draw.alpha(0.35);
                drawSector(centerX, centerY, radius, hoveredSector);
            }

            var innerRadius = radius * innerRadiusRatio;
            Draw.color(Color.black);
            Draw.alpha(0.25);
            Fill.circle(centerX, centerY, innerRadius);//внутренний круг
            Draw.color(Color.white);
            Draw.alpha(0.55);
            Lines.stroke(1);
            Lines.circle(centerX, centerY, innerRadius);//обводка внутреннего круга

            //Восемь линий, разделяющих кольцо на секторы
            for (var sector = 0; sector < 8; sector++) {
                var boundary = (sector * sectorAngle - sectorAngle / 2) * Math.PI / 180;//Вычисляет угол очередного разделителя
                Lines.line(
                    centerX + Math.sin(boundary) * innerRadius,//
                    centerY + Math.cos(boundary) * innerRadius,
                    centerX + Math.sin(boundary) * radius,
                    centerY + Math.cos(boundary) * radius
                );

                // Пустой слот не рисует иконку. Недоступный блок рисуется тускло.
                var block = wheelSlots[activeWheelNumber][sector];
                if (block != null) {
                    var direction = sector * sectorAngle * Math.PI / 180;
                    var icon = block.uiIcon;
                    var iconSize = radius * 0.28;
                    // Сохраняем пропорции исходной иконки в квадрате iconSize.
                    var iconScale = iconSize / Math.max(icon.width, icon.height);
                    Draw.color(Color.white);
                    Draw.alpha(canSelectBlock(block) ? 1 : 0.30);// Тускнеет, если блок недоступен.
                    Draw.rect(icon,
                        centerX + Math.sin(direction) * radius * 0.64,
                        centerY + Math.cos(direction) * radius * 0.64,
                        icon.width * iconScale, icon.height * iconScale
                    );
                    // Возвращаем цвет разделителей для следующего сектора.
                    Draw.alpha(0.55);
                }
            }

            Draw.alpha(0.70);
            Lines.stroke(2);
            Lines.circle(centerX, centerY, radius - 1);

            Draw.reset(); // Сбрасывает цвет, прозрачность и толщину линий для следующего UI.
        },

        // Открытие колеса делает областью для клика весь экран.
        // Это сообщает сцене, что курсор над UI, и блокирует игровое наведение.
        // x/y здесь локальные; выбор сектора отдельно получает координаты сцены.
        hit: function(x, y, touchable) {
            if (!wheelOpen || !Vars.state.isGame()
                || Core.scene.hasDialog() || Core.scene.hasKeyboard()) return null;
            if (touchable && this.touchable != Touchable.enabled) return null;
            return this;
        }
    });

    wheel.setSize(wheelDiameter, wheelDiameter);
    wheel.visible = false;
    wheel.touchable = Touchable.enabled; // 2) Колесо теперь участвует в проверке попадания мыши.
    Core.scene.root.addChild(wheel); //Прикрепляем объект wheel для сцены

    //Закрытие колеса при выходе в меню или сбросе мира.
    function closeWheel() {
        wheelOpen = false;
        activeWheelNumber = -1;
        wheel.visible = false;
        pendingSelection = null; // Отменяет ещё не выполненный запрос выбора.
    }

    // Ставим одну задачу только после выбора непустого сектора.
    // В настольной версии очередь post выполняется после обновления игры и UI:
    // горячая клавиша открытия уже не сможет перезаписать наш выбор в этом кадре.
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
            if (!Vars.state.isGame() || !canSelectBlock(selection.block)) return;

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

    Events.on(StateChangeEvent, event => {
        if (event.to == GameState.State.menu) closeWheel();
    });   // Выход в меню - сброс колеса.

    Events.on(ResetEvent, () => closeWheel()); // Сброс мира - сброс колеса


    // 1.2) Shift + цифра; отрисовка выбранного колеса поверх интерфейса по координатам курсора.
    // InputProcessor — интерфейс Arc.
    Core.input.getInputMultiplexer().addProcessor(0, extend(InputProcessor, {//getInputMultiplexer() отбирает приоритет у keyDown, keyTap и keyRelease - риск при других модах
        keyDown: function(key) {
            if (!Vars.state.isPlaying()) return false; // Открываем только в активной - ни пауза, ни меню, ни загрузка.
            if (Core.scene.hasDialog() || Core.scene.hasKeyboard()) return false; // В диалоге, чате или поле ввода сочетание не открывает колесо.

            //Сомнительно, но не даёт активироваться при удержанных заранее ЛКМ и ПКМ (в доп. настройки пойдёт!)
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

        //==============================================================
        // 2.1–2.3) Обработка кликов
        //==============================================================
        //Обрабатываем именно нажатие, а не отпускание мыши.
        touchDown: function(screenX, screenY, pointer, button) {
            if (button != KeyCode.mouseLeft && button != KeyCode.mouseRight) return false;

            // Дополнительную кнопку во время уже захваченного жеста тоже
            // поглощаем, чтобы закрытие не превратилось в действие игры.
            if (!capturedLeft && !capturedRight) {
                if (!wheelOpen) return false;
                if (!Vars.state.isGame() || Core.scene.hasDialog() || Core.scene.hasKeyboard()) {
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
