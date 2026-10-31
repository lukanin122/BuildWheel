// Общая основа игрового колеса и манекена: внешний вид, геометрия и создание Element.
// Подключение модуля ничего не рисует; main.js вызывает create после ClientLoadEvent.
"use strict";

exports.create = function(api) {
    var sectorCount = 8;
    var sectorAngle = 360 / sectorCount;

    // Один объект настроек для обоих колёс. Отрисовка читает его заново каждый кадр,
    // поэтому цвета, прозрачность и пропорции можно менять без создания нового Element.
    // После изменения diameter нужно также обновить размеры виджетов и раскладку меню.
    var appearance = {
        diameter: 260, //диаметр круга
        innerRadiusRatio: 0.24, //какую часть от круга занимает внутренний радиус?
        backgroundColor: Color.white.cpy(), // Собственная копия: будущий редактор цвета не должен менять Color.white игры.
        backgroundAlpha: 0.22,
        centerColor: Color.black.cpy(),
        centerAlpha: 0.25,
        lineColor: Color.white.cpy(),
        lineAlpha: 0.55,
        lineWidth: 1,
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

    //=====================================================================
    //Запоминание и расчёта цвета для 'зелёного' сектора (ещё и) выделенного мышкой
    //=====================================================================
    var previousSelectionColor = appearance.selectionColor.cpy(); // Цвет пересечения вычисляем заранее, а затем обновляем только при изменении исходных цветов или доли смешивания.
    var previousHighlightColor = appearance.highlightColor.cpy(); // Копии сохраняют прежние значения даже при изменении того же объекта Color через set().
    var previousHoverMix = appearance.selectionHoverMix;
    var selectionHoverColor = appearance.selectionColor.cpy().lerp(appearance.highlightColor, previousHoverMix);
    var mousePosition = new Vec2(); // Общий временный вектор: новые объекты при наведении не создаём.

    //сравнения цветовых каналов
    function sameRgb(first, second) {
        return first.r == second.r && first.g == second.g && first.b == second.b;
    }

    //Каждый раз, когда графический движок просит цвет для отрисовки, эта функция проверяет, не изменились ли настройки. Возрщает цвет.
    function getSelectionHoverColor() {
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
    function sectorAt(element, x, y) {
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
    function hoveredSectorAt(element) {
        if (Core.scene.getHoverElement() !== element) return -1; //навелись ли на колесо?
        mousePosition.set(Core.input.mouseX(), Core.input.mouseY());//записывает координаты мыши в вектор
        element.screenToLocalCoordinates(mousePosition);//координаты в локальные
        return sectorAt(element, mousePosition.x, mousePosition.y);//возвращаем номер сектора
    }

    // Закраски сектора с наведённой сверху мышкой; (геометрия совпадает sectorAt).
    function drawSector(centerX, centerY, radius, sector) {
        var innerRadius = radius * appearance.innerRadiusRatio;
        var start = sector * sectorAngle - sectorAngle / 2; //угол левой линии нужного сектора
        for (var part = 0; part < 6; part++) { //тут можно будет настроить круговитость или убрать вовсе; фактически один сектор состоит из 5 многоукголинокв
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

    function draw(element, wheelNumber, hoveredSector, selectedSector, options) {
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
            drawSector(centerX, centerY, radius, hoveredSector);
        }
        if (selectedSector >= 0 && selectedSector < sectorCount) {
            Draw.color(selectedSector == hoveredSector ? getSelectionHoverColor() : appearance.selectionColor);
            Draw.alpha(appearance.selectionAlpha); // Совпадение с наведением меняет RGB, но не прозрачность выделения.
            drawSector(centerX, centerY, radius, selectedSector);
        }

        Draw.color(appearance.centerColor);
        Draw.alpha(appearance.centerAlpha);
        Fill.circle(centerX, centerY, innerRadius);//Закрашиваем внутренний круг
        Draw.color(appearance.lineColor);
        Draw.alpha(appearance.lineAlpha);
        Lines.stroke(appearance.lineWidth);
        Lines.circle(centerX, centerY, innerRadius);//рисуем обводку-окружность внутреннего круга

        for (var sector = 0; sector < sectorCount; sector++) {
            var boundary = (sector * sectorAngle - sectorAngle / 2) * Math.PI / 180;
            // границы-линии разделяющие сектора по их колличеству
            Lines.line(
                centerX + Math.sin(boundary) * innerRadius,
                centerY + Math.cos(boundary) * innerRadius,
                centerX + Math.sin(boundary) * radius,
                centerY + Math.cos(boundary) * radius
            );

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

        //рисуем внешнюю обводку-окружность
        Draw.color(appearance.lineColor); //не дублирование, так как там может быть block = null
        Draw.alpha(appearance.outerAlpha);
        Lines.stroke(appearance.outerWidth);
        Lines.circle(centerX, centerY, radius - appearance.outerInset);
        Draw.reset(); // В Arc сбрасывает цвет, прозрачность и толщину линий для следующего элемента UI.
    }

    // Фабрика — аналог метода Java, создающего настроенный анонимный наследник Element.
    // Каждый вызов создаёт отдельный виджет-колесо, но геометрия и appearance у обоих общие.
    function createElement(options) {
        var methods = { // кастомное поведение для перезаписи стандартных методов
            draw: function() {
                if (options.canDraw != null && !options.canDraw()) return; //услвия запуска в main.js
                var selectedSector = options.getSelectedSector == null ? -1 : options.getSelectedSector();
                draw(this, options.getWheelNumber(), hoveredSectorAt(this), selectedSector, options);
            }
        };
        // 'Колесо выбора' заменяет hit для захвата всего экрана.
        // У 'манекена' обычный Element.hit, чтобы не перекрывать остальные кнопки меню.
        if (options.hit != null) methods.hit = options.hit; //Если в объекте настроек передан кастомный метод, то добавим его в создаваемый набор методов methods.hit (зона клика мышки по виджету)
        var element = extend(Element, methods); //UI-виджет кастомных методов
        element.setSize(appearance.diameter, appearance.diameter);
        return element;
    }

    return {
        appearance: appearance,
        sectorCount: sectorCount,
        sectorAt: sectorAt,
        createElement: createElement
    };
};
