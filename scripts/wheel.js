// Общая основа игрового колеса и манекена: внешний вид, геометрия и создание Element.
// Подключение модуля ничего не рисует; main.js вызывает create после ClientLoadEvent.
"use strict";
var uiSounds = require("sounds"); // Этот же модуль использует меню; файлы звуков загружаются один раз.

exports.create = function(api) {
    var wheelCount = 10; // Десять номеров 0–9; порядок их переключения задаётся обработчиками ввода и меню.
    var defaultSectorCount = 8; // Исходное количество секторов; каждый комплект визуала хранит собственное значение.
    var maxSectorCount = 16; // Верхний предел числа видимых секторов; эта переменная задаёт диапазон слайдера и проверки сохраняемого визуала.

    // Общий образец заводских значений; по нему один раз создаём отдельный визуал для каждого номера.
    // «Колесо выбора» и «манекен» одного номера используют один и тот же комплект данных.
    // После изменения diameter нужно также обновить размеры виджетов и раскладку меню.
    var appearanceDefaults = {
        diameter: 260, //диаметр круга
        innerRadiusRatio: 0.24, //какую часть от круга занимает внутренний радиус?
        backgroundColor: Color.white.cpy(), // Собственная копия: будущий редактор цвета не должен менять Color.white игры.
        backgroundAlpha: 0.22,
        centerColor: Color.black.cpy(),
        centerAlpha: 0.25,
        lineColor: Color.white.cpy(),
        lineAlpha: 0.55,
        lineWidth: 1,
        innerLineColor: Color.white.cpy(), // Задаём исходный цвет внутренней окружности (собственный Color для обоих колёс).
        innerLineAlpha: 0.55, // Задаём исходную непрозрачность внутренней окружности.
        innerLineWidth: 1, // Задаём исходную толщину внутренней окружности.
        outerColor: Color.white.cpy(), // Задаём собственный цвет внешней окружности, независимый от разделителей.
        outerAlpha: 0.70, //прозрачность линии обводки внешеней границы колеса
        outerWidth: 2,  //толщина линии обводки внешеней границы колеса
        outerInset: 1,  //отступ пикселей обводки внешеней границы колеса во внутрь (бесполезная ли переменная это? Можно и автоматизировать)
        iconSizeRatio: 0.28,
        iconRadiusRatio: 0.64,
        highlightColor: Pal.accent.cpy(), //ключевой параметр, позволяет сменять цвет в drawSector
        highlightAlpha: 0.35, //ключевой параметр, позволяет сменять прозрачность в drawSector
        selectionColor: Color.green.cpy(), // Цвет выбранного для редактирования сектора; не привязан к зелёному в коде рисования.
        selectionAlpha: 0.45,
        selectionHoverMix: 0.5 // Доля цвета наведения в выбранном секторе: 0 — только выделение, 1 — только наведение.
    };

    // ДЕСЯТЬ НЕЗАВИСИМЫХ КОМПЛЕКТОВ ВИЗУАЛА
    var visuals = []; // Храним только параметры и Color; отдельные виджеты и фоновые обработчики для десяти номеров не создаём.
    for (var number = 0; number < wheelCount; number++) { // Подготавливаем данные один раз при загрузке клиентской части.
        var appearance = {}; // Собственный набор параметров этого номера.
        for (var key in appearanceDefaults) { // Копируем заводской образец, общий для всех кнопок сброса.
            var value = appearanceDefaults[key]; // Читаем число или исходный цвет.
            appearance[key] = value instanceof Color ? value.cpy() : value; // Цвета обязательно копируем: изменение Color одного номера не должно менять другой.
        }
        visuals.push({appearance: appearance, sectorCount: defaultSectorCount}); // Визуал и количество секторов образуют один комплект для будущей системы сохранений.
    }

    function getVisual(number) { // Возвращаем существующий комплект по номеру без копирования и чтения настроек.
        return visuals[number >= 0 && number < wheelCount && number == Math.floor(number) ? number : 1]; // Для ещё не открытого игрового колеса с номером -1 используем первый комплект.
    }

    // ЗАКРЕПЛЕНИЕ ОДНОГО ВИЗУАЛА ДЛЯ ИГРОВЫХ КОЛЁС
    var sharedVisualNumber = 1; // При отсутствии настройки все игровые номера используют визуал колеса №1.
    try { // Неверный тип настройки не должен мешать загрузке мода.
        var savedSharedNumber = Number(Core.settings.getInt("buildwheel.sharedVisual", 1)); // -1 означает отдельные визуалы, 0–9 — закреплённый номер.
        if (savedSharedNumber >= -1 && savedSharedNumber < wheelCount) sharedVisualNumber = savedSharedNumber; // Принимаем только существующий номер или отключение закрепления.
    } catch (error) { // Повреждённая настройка оставляет закрепление первого номера.
    }

    function getDisplayVisual(number) { // Выбираем действующий игровой визуал без копирования параметров остальных девяти номеров.
        return getVisual(sharedVisualNumber < 0 ? number : sharedVisualNumber); // Неактивные комплекты остаются обычными данными и не обрабатываются при рисовании.
    }

    function setSharedVisual(number) { // Кнопка замка передаёт номер для закрепления либо -1 для отдельных визуалов.
        if (number < -1 || number >= wheelCount || number != Math.floor(number)) return; // Не записываем несуществующий номер.
        sharedVisualNumber = number; // Последующие открытия сразу используют выбранный режим.
        Core.settings.put("buildwheel.sharedVisual", new java.lang.Integer(String(number))); // Меняем настройку в памяти; меню записывает её при закрытии.
    }

    // СБРОС ПАРАМЕТРОВ ОДНОЙ ГРУППЫ
    function resetAppearance(number, keys) { // Меню передаёт номер колеса и параметры группы, у которой нажали refresh.
        var appearance = getVisual(number).appearance; // Восстанавливаем только указанный номер, не затрагивая остальные девять.
        for (var i = 0; i < keys.length; i++) { // По очереди восстанавливаем только перечисленные параметры.
            var key = keys[i]; // Берём имя очередного параметра.
            if (!appearanceDefaults.hasOwnProperty(key)) continue; // Пропускаем имена, для которых нет исходного значения.
            var value = appearanceDefaults[key]; // Получаем значение из сохранённого образца.
            if (value instanceof Color) appearance[key].set(value); // Возвращаем исходный цвет, сохраняя существующий объект Color и ссылки на него.
            else appearance[key] = value; // Возвращаем исходное числовое значение.
        }
    }

    //=====================================================================
    //Запоминание и расчёта цвета для 'зелёного' сектора (ещё и) выделенного мышкой
    //=====================================================================
    var previousSelectionColor = new Color(); // Один общий кэш смешанного цвета обслуживает рисуемое колесо; отдельные кэши для десяти комплектов не требуются.
    var previousHighlightColor = new Color(); // Копия сохраняет прежние RGB даже при изменении исходного объекта Color через set().
    var previousHoverMix = -1; // Несовпадение с исходной долей заставит вычислить цвет при первом использовании.
    var selectionHoverColor = new Color(); // Повторно используем этот Color вместо создания объекта при каждом наведении.
    var mousePosition = new Vec2(); // Общий временный вектор: новые объекты при наведении не создаём.

    //сравнения цветовых каналов
    function sameRgb(first, second) {
        return first.r == second.r && first.g == second.g && first.b == second.b;
    }

    //Каждый раз, когда графический движок просит цвет для отрисовки, эта функция проверяет, не изменились ли настройки. Возрщает цвет.
    function getSelectionHoverColor(appearance) { // Читаем цвета именно того номера, который сейчас рисуем.
        if (!sameRgb(previousSelectionColor, appearance.selectionColor)
            || !sameRgb(previousHighlightColor, appearance.highlightColor)
            || previousHoverMix != appearance.selectionHoverMix) {
            selectionHoverColor.set(appearance.selectionColor).lerp(appearance.highlightColor, appearance.selectionHoverMix);
            previousSelectionColor.set(appearance.selectionColor);
            previousHighlightColor.set(appearance.highlightColor);
            previousHoverMix = appearance.selectionHoverMix;
        }
        return selectionHoverColor; // Прозрачность задаём отдельно: она всегда остаётся selectionAlpha.
    }
    //=====================================================================

    // x/y — координаты ВНУТРИ Element, а не экрана или сцены.
    // Игровой ввод переводит свои координаты перед вызовом; слушатель манекена уже получает локальные.
    // Определяем номер сектора кружения мышки
    function sectorAt(element, x, y, wheelNumber, useSharedVisual) { // Последний аргумент включает закреплённый визуал при обработке игрового колеса.
        var visual = useSharedVisual ? getDisplayVisual(wheelNumber) : getVisual(wheelNumber), appearance = visual.appearance; // Попадание мыши использует тот же комплект, что и рисование.
        var sectorCount = visual.sectorCount, sectorAngle = 360 / sectorCount; // Геометрия использует сохранённое количество секторов этого колеса.
        var radius = element.getWidth() / 2;
        var dx = x - radius, dy = y - element.getHeight() / 2; //координаты мышки относительно центра круга, а не угла экрана
        var distanceSquared = dx * dx + dy * dy; //удаленность курсора от центра круга
        var innerRadius = radius * appearance.innerRadiusRatio;
        if (distanceSquared < innerRadius * innerRadius
            || distanceSquared > radius * radius) return -1; // мышка не засчитывается внутри круга и снаружи
        var angle = (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360; //вычисляем угол наклона
        return Math.floor((angle + sectorAngle / 2) / sectorAngle) % sectorCount; // Округляем результат к номеру ближайшего сектора, посчёт ведётся ровно с севера
    }

    // Определяем над каким сектором кружит мышка
    function hoveredSectorAt(element, wheelNumber, useSharedVisual) { // У игрового колеса геометрия может быть взята из закреплённого номера.
        if (Core.scene.getHoverElement() !== element) return -1; //навелись ли на колесо?
        mousePosition.set(Core.input.mouseX(), Core.input.mouseY());//записывает координаты мыши в вектор
        element.screenToLocalCoordinates(mousePosition);//координаты в локальные
        return sectorAt(element, mousePosition.x, mousePosition.y, wheelNumber, useSharedVisual); // Передаём режим закрепления в общую проверку границ сектора.
    }

    // Закраски сектора с наведённой сверху мышкой; (геометрия совпадает sectorAt).
    function drawSector(centerX, centerY, radius, sector, appearance, sectorAngle) { // Используем уже выбранные параметры рисуемого колеса.
        var innerRadius = radius * appearance.innerRadiusRatio;
        var start = sector * sectorAngle - sectorAngle / 2; //угол левой линии нужного сектора
        var parts = Math.max(6, Math.ceil(sectorAngle / 7.5)); // Сохраняем плавную дугу и при 1–3 широких секторах; восемь секторов по-прежнему требуют по шесть частей.
        for (var part = 0; part < parts; part++) { // Четырёхугольники последовательно заполняют весь угол независимо от чётности числа секторов.
            var angleA = (start + sectorAngle * part / parts) * Math.PI / 180;
            var angleB = (start + sectorAngle * (part + 1) / parts) * Math.PI / 180;
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

    function draw(element, wheelNumber, hoveredSector, selectedSector, options) {
        var visual = options.useSharedVisual ? getDisplayVisual(wheelNumber) : getVisual(wheelNumber), appearance = visual.appearance; // Игровое колесо учитывает замок; «манекен» позволяет готовить собственный визуал выбранного номера.
        var sectorCount = visual.sectorCount, sectorAngle = 360 / sectorCount; // Количество секторов и их угол берём из этого же комплекта.
        var radius = element.getWidth() / 2;
        var centerX = element.x + radius;
        var centerY = element.y + element.getHeight() / 2;
        var innerRadius = radius * appearance.innerRadiusRatio;

        Draw.color(appearance.backgroundColor);
        Draw.alpha(appearance.backgroundAlpha);
        Fill.circle(centerX, centerY, radius);//Закрашиваем весь круг колеса (любого)

        // Наведение и выбранный сектор — независимые условия. При совпадении рисуем смешанный цвет,
        // иначе два разных сектора. options определяет яркость иконок для игрового режима или редактора.
        if (hoveredSector >= 0 && hoveredSector < sectorCount && hoveredSector != selectedSector) {
            Draw.color(appearance.highlightColor);
            Draw.alpha(appearance.highlightAlpha);
            drawSector(centerX, centerY, radius, hoveredSector, appearance, sectorAngle);
        }
        if (selectedSector >= 0 && selectedSector < sectorCount) {
            Draw.color(selectedSector == hoveredSector ? getSelectionHoverColor(appearance) : appearance.selectionColor);
            Draw.alpha(appearance.selectionAlpha); // Совпадение с наведением меняет RGB, но не прозрачность выделения.
            drawSector(centerX, centerY, radius, selectedSector, appearance, sectorAngle);
        }

        Draw.color(appearance.centerColor);
        Draw.alpha(appearance.centerAlpha);
        Fill.circle(centerX, centerY, innerRadius);//Закрашиваем внутренний круг
        if (appearance.innerLineWidth > 0 && innerRadius > 0) { // Рисуем внутреннюю окружность только при ненулевой толщине и положительном радиусе.
            Draw.color(appearance.innerLineColor); // Выбираем цвет внутренней окружности из общих настроек.
            Draw.alpha(appearance.innerLineAlpha); // Устанавливаем её непрозрачность.
            Lines.stroke(appearance.innerLineWidth); // Устанавливаем толщину её линии.
            Lines.circle(centerX, centerY, innerRadius); // Обводим внутренний круг «колеса выбора» или «манекена».
        }

        // ОТРИСОВКА РАЗДЕЛИТЕЛЕЙ СЕКТОРОВ
        Draw.color(appearance.lineColor); // Выбираем цвет разделительных полос.
        Draw.alpha(appearance.lineAlpha); // Устанавливаем непрозрачность разделительных полос.
        if (appearance.lineWidth > 0) Lines.stroke(appearance.lineWidth); // Задаём толщину, если разделители не скрыты нулевым значением.

        for (var sector = 0; sector < sectorCount; sector++) {
            var boundary = (sector * sectorAngle - sectorAngle / 2) * Math.PI / 180; // Получаем угол границы очередного сектора в радианах.
            if (appearance.lineWidth > 0 && sectorCount > 1) { // У единственного сектора нет разделителя; нулевая толщина также скрывает линию, сохраняя отрисовку иконки.
                Lines.line( // Соединяем точки на внутреннем и внешнем радиусах одной разделительной полосой.
                    centerX + Math.sin(boundary) * innerRadius, // Координата X начала линии у внутреннего круга.
                    centerY + Math.cos(boundary) * innerRadius, // Координата Y начала линии у внутреннего круга.
                    centerX + Math.sin(boundary) * radius, // Координата X конца линии у внешней границы.
                    centerY + Math.cos(boundary) * radius // Координата Y конца линии у внешней границы.
                );
            }

            //рисуем блоки в секторах (а если блока нет? - не рисуем)
            var block = api.getBlock(wheelNumber, sector);
            if (block != null) {
                var direction = sector * sectorAngle * Math.PI / 180; // угол на котором находятся иконки
                var icon = block.uiIcon;
                var iconSize = radius * appearance.iconSizeRatio * api.getIconScale(wheelNumber, sector);
                var iconScale = iconSize / Math.max(icon.width, icon.height); // Сохраняем пропорции картинки возможной не квадратной картинки (на будущий функционал)
                Draw.color(Color.white);
                Draw.alpha(options.getIconAlpha == null ? 1 : options.getIconAlpha(block));//проверка разрешения строительства, если прозрачность не задана - не прозрачно, иначе ставим указанную
                Draw.rect(icon,
                    centerX + Math.sin(direction) * radius * appearance.iconRadiusRatio,
                    centerY + Math.cos(direction) * radius * appearance.iconRadiusRatio,
                    icon.width * iconScale, icon.height * iconScale
                ); //рисуем иконку по координатам и внужном масштабе
                Draw.color(appearance.lineColor);
                Draw.alpha(appearance.lineAlpha); // Следующий разделитель снова рисуется цветом линий.
            }
        }

        // ОТРИСОВКА ВНЕШНЕЙ ОКРУЖНОСТИ
        var outerRadius = radius - appearance.outerInset; // Смещаем окружность внутрь от края основного круга на заданный отступ.
        if (appearance.outerWidth > 0 && outerRadius > 0) { // Пропускаем скрытую окружность и недопустимый радиус слишком маленького круга.
            Draw.color(appearance.outerColor); // Выбираем собственный цвет внешней окружности.
            Draw.alpha(appearance.outerAlpha); // Устанавливаем её непрозрачность.
            Lines.stroke(appearance.outerWidth); // Устанавливаем толщину внешней обводки.
            Lines.circle(centerX, centerY, outerRadius); // Рисуем внешнюю окружность «колеса выбора» или «манекена».
        }
        Draw.reset(); // В Arc сбрасывает цвет, прозрачность и толщину линий для следующего элемента UI.
    }

    // Фабрика — аналог метода Java, создающего настроенный анонимный наследник Element.
    // Каждый вызов создаёт виджет; общий код рисования сам выбирает комплект по getWheelNumber.
    function createElement(options) {
        var previousHoveredSector = -1;
        var previousWheelNumber = -1;
        var methods = { // Переопределения Element и дополнительный метод resetHoverSound.
            resetHoverSound: function() {
                previousHoveredSector = -1;
                previousWheelNumber = -1; // Скрытие и повторное открытие могут произойти до следующего события exit сцены.
            },
            draw: function() {
                if (options.canDraw != null && !options.canDraw()) {
                    previousHoveredSector = -1;
                    return;
                }
                var wheelNumber = options.getWheelNumber();
                var hoveredSector = hoveredSectorAt(this, wheelNumber, options.useSharedVisual); // Наведение учитывает тот же режим закрепления, что и рисование.
                var selectedSector = options.getSelectedSector == null ? -1 : options.getSelectedSector();
                draw(this, wheelNumber, hoveredSector, selectedSector, options);
                if (hoveredSector != -1 && (hoveredSector != previousHoveredSector || wheelNumber != previousWheelNumber)) {
                    uiSounds.play(uiSounds.sectorHover); // Проигрываем звук наведения мышкой на сектор 
                }
                previousHoveredSector = hoveredSector;
                previousWheelNumber = wheelNumber;
            }
        };
        // 'Колесо выбора' заменяет hit для захвата всего экрана.
        // У 'манекена' обычный Element.hit, чтобы не перекрывать остальные кнопки меню.
        if (options.hit != null) methods.hit = options.hit; //Если в объекте настроек передан кастомный метод, то добавим его в создаваемый набор методов methods.hit (зона клика мышки по виджету)
        var element = extend(Element, methods); //UI-виджет кастомных методов
        var visual = options.useSharedVisual ? getDisplayVisual(options.getWheelNumber()) : getVisual(options.getWheelNumber()); // Выбираем начальный комплект с учётом назначения виджета.
        var diameter = visual.appearance.diameter; // Задаём начальный размер; переключение размера выполняется при выборе другого колеса.
        element.setSize(diameter, diameter);

        //сброс состояния наведения при входе курсора мыши в область колеса или выходе
        element.addListener(extend(InputListener, {
            enter: function(event, x, y, pointer, fromActor) {
                if (pointer == -1) previousHoveredSector = -1; // Новое наведение не зависит от сектора, запомненного перед закрытием.
            },
            exit: function(event, x, y, pointer, toActor) {
                if (pointer == -1) previousHoveredSector = -1; // При возврате мыши или повторном открытии звук должен сработать снова.
            }
        }));
        return element;
    }

    return {
        wheelCount: wheelCount, // Общий предел номеров для меню и хранения данных.
        defaultSectorCount: defaultSectorCount, // Исходное число секторов для ещё не настроенного комплекта.
        maxSectorCount: maxSectorCount, // Редактор и библиотека используют один предел числа видимых секторов.
        getVisual: getVisual, // Открываем доступ к комплекту {appearance, sectorCount} по номеру; данные не копируются.
        getDisplayVisual: getDisplayVisual, // Игровой виджет получает закреплённый либо собственный визуал.
        getSharedVisualNumber: () => sharedVisualNumber, setSharedVisual: setSharedVisual, // Меню читает и переключает замок без обхода всех комплектов.
        appearanceDefaults: appearanceDefaults, // Предоставляем исходные значения внешнего вида (цвета хранятся отдельными копиями).
        resetAppearance: resetAppearance, // Даём меню функцию восстановления выбранных параметров по их именам.
        sectorAt: sectorAt,
        createElement: createElement
    };
};
