// BuildWheel — этап 1: открытие колеса в положении курсора.
// Пункты 1 и 1.2 пока без звёздочек: нужна ручная проверка в игре.
// API: https://mindustrygame.github.io/docs/
// Исходники: https://github.com/Anuken/Arc/tree/master/arc-core/src/arc

var wheelDiameter = 180; // Пока диаметр общий для всех колёс; настройка размера будет в пункте 4.2.

// ClientLoadEvent вызывается после загрузки клиентской части игры
// когда клиентский интерфейс уже создан.
Events.on(ClientLoadEvent, () => {
    var wheelOpen = false; // wheelOpen отвечает за показ
    var activeWheelNumber = -1; // Номер последнего открытого колеса 0-9, дефолт -1
    var mousePosition = new Vec2(); 
    var numberKeys = [
        KeyCode.num0, KeyCode.num1, KeyCode.num2, KeyCode.num3, KeyCode.num4,
        KeyCode.num5, KeyCode.num6, KeyCode.num7, KeyCode.num8, KeyCode.num9
    ];

    // 1) Полупрозрачный шаблон колеса. Секторы появятся в пункте 2.
    // extend создаёт наследника Element (элемент интерфейса Arc) и переопределяет его метод draw().
    var wheel = extend(Element, {
        draw: function() {
            if (!wheelOpen || !Vars.state.isGame()) return;

            var radius = this.getWidth() / 2; // Размер читаем через публичный метод Java, а не защищённое поле width.
            var centerX = this.x + radius;
            var centerY = this.y + this.getHeight() / 2;

            Draw.color(Color.white);
            Draw.alpha(0.22);
            Fill.circle(centerX, centerY, radius);

            Draw.alpha(0.70);
            Lines.stroke(2);
            Lines.circle(centerX, centerY, radius - 1);

            // Сбрасывает цвет, прозрачность и толщину линий для следующего UI.
            Draw.reset();
        }
    });

    wheel.setSize(wheelDiameter, wheelDiameter);
    wheel.visible = false;
    wheel.touchable = Touchable.disabled;
    Core.scene.root.addChild(wheel);

    function closeWheel() {
        wheelOpen = false;
        activeWheelNumber = -1;
        wheel.visible = false;
    }

    // Сбрасываем состояние сразу при выходе в меню, даже без нажатия клавиш.
    // StateChangeEvent приходит ДО смены Vars.state, поэтому смотрим event.to.
    Events.on(StateChangeEvent, event => {
        if (event.to == GameState.State.menu) closeWheel();
    });
    // Сброс мира?
    Events.on(ResetEvent, () => closeWheel());

    // 1) Shift + цифра; 1.2) выбранное колесо поверх интерфейса под курсором.
    // InputProcessor — интерфейс Arc.
    Core.input.addProcessor(extend(InputProcessor, {
        keyDown: function(key) {
            // Пока сохраняем ограничение наброска: открываем только в активной
            // игре. На паузе новые колёса не открываются.
            if (!Vars.state.isPlaying()) return false;

            // В диалоге, чате или поле ввода сочетание не открывает колесо.
            if (Core.scene.hasDialog() || Core.scene.hasKeyboard()) return false;

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
            Core.scene.screenToStageCoordinates(mousePosition); //переводим в координаты сцены
            wheel.setPosition(
                mousePosition.x - wheel.getWidth() / 2,
                mousePosition.y - wheel.getHeight() / 2
            );

            // Позиция фиксируется в момент открытия и не следует за мышью.
            // У края экрана круг может обрезаться: центр остаётся под курсором.
            activeWheelNumber = pressedNumber;
            wheelOpen = true;
            wheel.visible = true;
            // Последний ребёнок корневой группы рисуется поверх остальных.
            wheel.toFront();

            // Событие остаётся доступным другим обработчикам. Штатные действия
            // игры на Shift/цифры пока сохраняются; false их не блокирует.
            return false;
        }
    }));
});
