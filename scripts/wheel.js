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
        diameter: 260,
        innerRadiusRatio: 0.24,
        backgroundColor: Color.white.cpy(), // Собственная копия: будущий редактор цвета не должен менять Color.white игры.
        backgroundAlpha: 0.22,
        centerColor: Color.black.cpy(),
        centerAlpha: 0.25,
        lineColor: Color.white.cpy(),
        lineAlpha: 0.55,
        lineWidth: 1,
        outerAlpha: 0.70,
        outerWidth: 2,
        outerInset: 1,
        iconSizeRatio: 0.28,
        iconRadiusRatio: 0.64,
        highlightColor: Pal.accent.cpy(),
        highlightAlpha: 0.35
    };

    // x/y — координаты ВНУТРИ Element, а не экрана или сцены.
    // Игровой ввод переводит свои координаты перед вызовом; слушатель манекена уже получает локальные.
    function sectorAt(element, x, y) {
        var radius = element.getWidth() / 2;
        var dx = x - radius, dy = y - element.getHeight() / 2;
        var distanceSquared = dx * dx + dy * dy;
        var innerRadius = radius * appearance.innerRadiusRatio;
        if (distanceSquared < innerRadius * innerRadius
            || distanceSquared > radius * radius) return -1; // Центр и область вне круга не являются секторами.

        var angle = (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;
        return Math.floor((angle + sectorAngle / 2) / sectorAngle) % sectorCount; // От севера по часовой стрелке.
    }

    // Подсветка кольцевого сектора шестью четырёхугольниками; геометрия совпадает с sectorAt.
    function drawSector(centerX, centerY, radius, sector) {
        var innerRadius = radius * appearance.innerRadiusRatio;
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

    // Единственная отрисовка для обоих режимов. options содержит только различия поведения:
    // подсвеченный сектор, его цвет и яркость иконок. Сам рисунок взят из игрового колеса.
    function draw(element, wheelNumber, highlightedSector, options) {
        var radius = element.getWidth() / 2;
        var centerX = element.x + radius;
        var centerY = element.y + element.getHeight() / 2;
        var innerRadius = radius * appearance.innerRadiusRatio;

        Draw.color(appearance.backgroundColor);
        Draw.alpha(appearance.backgroundAlpha);
        Fill.circle(centerX, centerY, radius);
        if (highlightedSector >= 0 && highlightedSector < sectorCount) {
            Draw.color(options.highlightColor == null ? appearance.highlightColor : options.highlightColor);
            Draw.alpha(options.highlightAlpha == null ? appearance.highlightAlpha : options.highlightAlpha);
            drawSector(centerX, centerY, radius, highlightedSector);
        }

        Draw.color(appearance.centerColor);
        Draw.alpha(appearance.centerAlpha);
        Fill.circle(centerX, centerY, innerRadius);
        Draw.color(appearance.lineColor);
        Draw.alpha(appearance.lineAlpha);
        Lines.stroke(appearance.lineWidth);
        Lines.circle(centerX, centerY, innerRadius);

        for (var sector = 0; sector < sectorCount; sector++) {
            var boundary = (sector * sectorAngle - sectorAngle / 2) * Math.PI / 180;
            Lines.line(
                centerX + Math.sin(boundary) * innerRadius,
                centerY + Math.cos(boundary) * innerRadius,
                centerX + Math.sin(boundary) * radius,
                centerY + Math.cos(boundary) * radius
            );

            var block = api.getBlock(wheelNumber, sector);
            if (block != null) {
                var direction = sector * sectorAngle * Math.PI / 180;
                var icon = block.uiIcon;
                var iconSize = radius * appearance.iconSizeRatio * api.getIconScale(wheelNumber, sector);
                var iconScale = iconSize / Math.max(icon.width, icon.height); // Сохраняем пропорции картинки.
                Draw.color(Color.white);
                Draw.alpha(options.getIconAlpha == null ? 1 : options.getIconAlpha(block));
                Draw.rect(icon,
                    centerX + Math.sin(direction) * radius * appearance.iconRadiusRatio,
                    centerY + Math.cos(direction) * radius * appearance.iconRadiusRatio,
                    icon.width * iconScale, icon.height * iconScale
                );
                Draw.color(appearance.lineColor);
                Draw.alpha(appearance.lineAlpha); // Следующий разделитель снова рисуется цветом линий.
            }
        }

        Draw.color(appearance.lineColor);
        Draw.alpha(appearance.outerAlpha);
        Lines.stroke(appearance.outerWidth);
        Lines.circle(centerX, centerY, radius - appearance.outerInset);
        Draw.reset(); // В Arc сбрасывает цвет, прозрачность и толщину линий для следующего элемента UI.
    }

    // Фабрика — аналог метода Java, создающего настроенный анонимный наследник Element.
    // Каждый вызов создаёт отдельный виджет, но геометрия и appearance у них общие.
    function createElement(options) {
        var methods = {
            draw: function() {
                if (options.canDraw != null && !options.canDraw()) return;
                draw(this, options.getWheelNumber(), options.getHighlightedSector(this), options);
            }
        };
        // Только игровое колесо заменяет hit для захвата всего экрана.
        // У манекена остаётся обычный Element.hit, чтобы не перекрывать остальные кнопки меню.
        if (options.hit != null) methods.hit = options.hit;
        var element = extend(Element, methods);
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
