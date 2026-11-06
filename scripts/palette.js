// ПАЛИТРА ЦВЕТОВ: ГЕКСАГОНЫ, КОПИРОВАНИЕ HEX, РЕДАКТОР HSV И ТОНИРОВАНИЕ
"use strict"; // Запрещаем случайное присваивание не объявленной переменной.

// ПОРЯДОК 216 ЦВЕТОВ ИЗ hex_palette.html
var colorCodes = [ // Строки массива продолжают друг друга; пустой центр добавляется отдельно и не расходует цвет.
    "99FF00","CCFF00","CCFF33","99CC00","CC9900","FFCC33","FFCC00","FF9900","FF6600",
    "66FF00","99FF33","CCFF66","99CC33","669900","996600","CC9933","FFCC66","FF9933","FF3300",
    "33FF00","99FF66","66CC00","333300","666600","999900","CCCC00","FFFF00","CC6600","FF9966","FF6633",
    "66FF33","66CC33","00FF00","336600","666633","999933","CCCC33","FFFF33","663300","330000",
    "CC6633","CC3300","33CC00","339900","00CC00","33FF33","669933","999966","CCCC66","FFFF66",
    "996633","663333","660000","993300","CC0033","00CC33","009933","009900","33CC33","66FF66",
    "99CC66","CCCC99","FFFF99","CC9966","996666","993333","990000","990033","FF3366","33FF66",
    "33CC66","006600","339933","66CC66","99FF99","CCFF99","FFFFCC","FFCC99","CC9999","CC6666",
    "CC3333","CC0000","CC3366","FF0033","00FF33","66FF99","003300","336633","669966","99CC99",
    "CCFFCC","999999","CCCCCC","FFCCCC","FF9999","FF6666","FF3333","FF0000","FF6699","FF0066",
    "00FF66","33FF99","00CC66","006633","339966","66CC99","99FFCC","666666","FFFFFF","FF99CC",
    "CC6699","993366","660033","CC0066","FF3399","FF0099","00FF99","66FFCC","00FFFF","33FFFF",
    "66FFFF","99FFFF","CCFFFF","333333","000000","FFCCFF","CC99CC","996699","663366","330033",
    "FF66CC","FF00CC","00FFCC","33CC99","00CCCC","33CCCC","66CCCC","99CCCC","99CCFF","CCCCFF",
    "CC99FF","FF99FF","CC66CC","993399","660066","CC3399","FF33CC","33FFCC","009966","009999",
    "339999","669999","6699CC","9999FF","9999CC","9966CC","FF66FF","CC33CC","990099","990066",
    "CC0099","00CC99","006699","006666","336666","336699","6666FF","6666CC","666699","663399",
    "FF33FF","CC00CC","660099","9900CC","0099CC","3399CC","003333","003366","3333FF","3333CC",
    "333399","333366","330066","FF00FF","9933CC","CC33FF","33CCFF","66CCFF","0066CC","0000FF",
    "0000CC","000099","000066","000033","6600CC","CC66FF","CC00FF","00CCFF","3399FF","6699FF",
    "3366CC","003399","330099","6633CC","9966FF","9933FF","9900FF","0099FF","0066FF","0033FF",
    "3366FF","0033CC","3300CC","6633FF","3300FF","6600FF"
];

// СОЗДАНИЕ ОКНА И ОБЩЕГО СОСТОЯНИЯ
exports.create = function(onChanged, onClosed) { // Меню создаёт одну палитру; onChanged сообщает об изменении настройки, onClosed возвращает прокрутку редактору после закрытия.
    var prefix = "buildwheel.palette."; // Отделяем настройки палитры от внешнего вида «колеса выбора» и «манекена».
    var radius = readInteger("size", 28, 8, 80); // Размер — расстояние от центра гексагона до вершины в пикселях сцены.
    var gap = readInteger("gap", 2, 0, 30); // Отступ — расстояние между параллельными гранями соседних гексагонов.
    var showLabels = Core.settings.getBool(prefix + "labels", true); // По умолчанию показываем шесть цифр HEX внутри каждого цветного гексагона.
    var dialog = extend(BaseDialog, Core.bundle.get("buildwheel.palette.title"), { // Создаём обычное окно и дополняем действие после его полного закрытия.
        remove: function() { // Сцена удаляет окно после завершения анимации закрытия.
            hideCopiedToast(); // Убираем плашку копирования вместе с палитрой.
            hideCustomClear(); // Закрываем также кнопку очистки отдельного образца.
            var removed = this.super$remove(); // Выполняем штатное удаление BaseDialog из сцены.
            if (removed && onClosed != null) onClosed(); // Возвращаем прокрутку редактору, когда палитра уже не может перехватить его фокус.
            return removed; // Сохраняем штатный результат удаления для кода сцены.
        }
    });
    dialog.name = "buildwheel-palette"; // Даём окну постоянное имя для поиска в сцене.
    dialog.setCentered(false); // Полноэкранному окну не требуется повторное центрирование при изменении размеров сцены.
    dialog.clearChildren(); // Убираем стандартные строки общей шапки и нижних кнопок окна.
    dialog.margin(0); // Разрешаем содержимому доходить до всех краёв экрана.
    dialog.cont.margin(0); // Убираем внешний отступ у контейнера палитры и её настроек.
    dialog.add(dialog.cont).grow().pad(0); // Единственный контейнер занимает всю площадь окна, без стандартного отступа ячейки Dialog.
    var cells = [], rows = []; // cells хранит 217 мест, включая пустой центр; rows хранит начала и длины 17 рядов.
    var sqrt3 = Math.sqrt(3); // Корень из трёх нужен для геометрии правильного гексагона.
    var stepX = 0, stepY = 0, apothem = 0, originY = 0; // Расстояния между центрами, расстояние до грани и высота начала первого ряда.
    var imageWidth = 0, imageHeight = 0; // Габариты всей палитры, включая небольшой прозрачный край.
    var blackText = null, whiteText = null, image = null, imagePane = null, copiedLabel = null; // Ссылки заполняются при первом показе; до этого виджетов и кэшей ещё нет.
    var maxTextWidth = 0, maxTextHeight = 0; // Наибольшие размеры подписей при масштабе шрифта 1.
    var lastCopied = null, copyToast = null; // Запоминаем выбранный цвет и повторно используем одну плашку «Скопировано».
    var copiedButton = null, copyPoint = new Vec2(); // Храним кнопку повторного копирования и координаты щелчка по ней.
    var toastPoint = new Vec2(), toastTimeLeft = 0, toastAccelerated = false; // Храним координаты и оставшееся время показа плашки без новых объектов каждый кадр.
    var hsvInputText = "#FFFFFF", hsvInputColor = Color.white.cpy(); // Начинаем редактор с белого цвета; введённый текст сохраняем отдельно от результата.
    var hsvDefaults = java.lang.reflect.Array.newInstance(java.lang.Float.TYPE, 3); // Один Java float[3] принимает H, S и V из Color.toHsv.
    hsvInputColor.toHsv(hsvDefaults); // Запоминаем исходные параметры для трёх отдельных кнопок сброса.
    var hsvValues = [0, 0, 1], hsvOutput = {hex: "FFFFFF", color: Color.white.cpy()}; // Текущие HSV и результат живут отдельно, чтобы не терять тон при нулевых S или V.
    var hsvKnobColor = Color.black; // На исходном белом цвете тонкие бегунки должны быть тёмными и заметными.
    var hsvInput = null, hsvOutputLabel = null; // Ссылки на поле ввода и надпись результата появляются при построении окна.
    var hsvAxes = [ // Общее описание трёх строк: пределы, шаг, подпись и подсказка.
        {key: "h", label: "H", title: Core.bundle.get("buildwheel.palette.hsv.hue"), max: 360, step: 0.01}, // Тон задаётся в градусах; 0 и 360 соответствуют красному.
        {key: "s", label: "S", title: Core.bundle.get("buildwheel.palette.hsv.saturation"), max: 1, step: 0.0001}, // Доля насыщенности: ноль нужен для точного сохранения серых цветов.
        {key: "v", label: "V", title: Core.bundle.get("buildwheel.palette.hsv.value"), max: 1, step: 0.0001} // Доля яркости: ноль нужен для чёрного и его корректного сброса.
    ];
    for (var axisIndex = 0; axisIndex < hsvAxes.length; axisIndex++) { // Один раз подготавливаем цвета и числовые кэши градиентов.
        var axis = hsvAxes[axisIndex]; // Получаем описание текущего параметра HSV.
        axis.colors = []; axis.packed = []; axis.alpha = -1; axis.slider = null; // Отдельно храним цвета перехода, их packed-представление и ссылку на слайдер.
        for (var stop = 0; stop < (axisIndex == 0 ? 7 : 2); stop++) axis.colors.push(new Color()); // Для H нужны семь границ цветовых секторов; для S и V достаточно двух концов.
    }
    updateHsvGradients(-1); // Готовим все три перехода до первого показа редактора.
    var tintInputs = [{text: "#FFFFFF", color: Color.white.cpy()}, {text: "#000000", color: Color.black.cpy()}]; // Храним текст и последний правильный цвет отдельно для базового и целевого полей.
    var tintPercent = 0, tintOutput = {hex: "FFFFFF", color: Color.white.cpy()}; // Нулевой процент оставляет базовый цвет без изменения.
    var tintOutputLabel = null, tintPercentLabel = null; // Надписи результата и процента появятся при построении блока тонирования.
    var tintKnobColor = Color.black; // На исходном белом результате бегунок должен быть тёмным.
    var tintGradient = {colors: [tintInputs[0].color, tintInputs[1].color], packed: [], alpha: -1}; // Линейному переходу RGB достаточно двух цветов, которые уже существуют в полях ввода.
    var customRows = readInteger("custom.rows", 2, 2, 128), customSamples = []; // Число видимых рядов хранится отдельно от постоянных 128 мест.
    var clearSampleIndex = -1, customClearButton = null, customPoint = new Vec2(); // Храним выбранное для очистки место, одну всплывающую кнопку и её координаты.
    for (var sampleIndex = 0; sampleIndex < 128; sampleIndex++) { // Загружаем все места, включая скрытые в данный момент ряды.
        var savedSample = ""; // Пустая строка обозначает образец без цвета.
        try { savedSample = String(Core.settings.getString(prefix + "custom." + sampleIndex, "")); } // Читаем сохранённый #RRGGBB данного места.
        catch (error) { } // Неверный тип старой настройки оставляет образец пустым.
        customSamples.push(validHex(savedSample) ? {hex: savedSample.substring(1).toUpperCase(), color: Color.valueOf(savedSample)} : {hex: null, color: null}); // Принимаем только полный HEX, остальные значения не превращаем в цвета.
    }

    // ПРОВЕРКА И ЗАГРУЗКА ЧИСЛОВЫХ НАСТРОЕК
    function readInteger(key, fallback, min, max) { // Читаем сохранённое целое; неподходящее значение заменяем исходным.
        try { // Повреждённый тип настройки не должен мешать открытию редактора.
            var value = Number(Core.settings.getInt(prefix + key, fallback)); // Получаем число JavaScript из настроек игры.
            if (isFinite(value) && value >= min && value <= max && value == Math.floor(value)) return value; // Принимаем только целое число из нужного диапазона.
        } catch (error) { // При ошибке чтения используем значение по умолчанию ниже.
        }
        return fallback; // Возвращаем исходный размер или отступ.
    }

    function parseInteger(text, min, max) { // Проверяем незавершённый ввод, не меняя изображение до получения допустимого числа.
        text = String(text); // Приводим текст Java к строке JavaScript.
        if (text.length == 0) return NaN; // Пустая строка ещё не является значением настройки.
        for (var i = 0; i < text.length; i++) { // Проверяем каждый введённый символ.
            if (text.charAt(i) < "0" || text.charAt(i) > "9") return NaN; // Буквы, знаки и дробные числа здесь не подходят.
        }
        var value = Number(text); // Преобразуем проверенную строку в число.
        return isFinite(value) && value >= min && value <= max ? value : NaN; // Возвращаем число в границах или признак недопустимого ввода.
    }

    // ПОДГОТОВКА ЦВЕТОВ, КОНТРАСТА И ПОРЯДКА ЯЧЕЕК
    function linearComponent(value) { // Переводим канал sRGB в линейную яркость для оценки читаемости текста.
        return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4); // Учитываем, что видимая яркость не пропорциональна числу RGB.
    }

    function contrastColor(color) { // Выбираем чёрный или белый для подписи либо бегунка на текущем фоне.
        var luminance = 0.2126 * linearComponent(color.r) + 0.7152 * linearComponent(color.g) + 0.0722 * linearComponent(color.b); // Учитываем разную чувствительность глаза к каналам RGB.
        return (luminance + 0.05) / 0.05 >= 1.05 / (luminance + 0.05) ? Color.black : Color.white; // Выбираем цвет с большим отношением контраста к фону.
    }

    function prepareCells() { // Выполняем эту подготовку лишь при первом открытии палитры.
        blackText = new FontCache(Fonts.def, false); // Кэш чёрных подписей хранит готовые вершины букв без округления координат.
        whiteText = new FontCache(Fonts.def, false); // Белые подписи храним отдельно, чтобы анимация прозрачности сохраняла их цвет.
        blackText.setColor(Color.black); // Цвет всего первого кэша — чёрный.
        whiteText.setColor(Color.white); // Цвет всего второго кэша — белый.
        var data = Fonts.def.getData(), oldX = data.scaleX, oldY = data.scaleY; // Запоминаем масштаб общего шрифта игры.
        var colorIndex = 0; // Номер следующего цвета из исходного списка 0–215.
        try { // Восстанавливаем общий шрифт даже при ошибке подготовки.
            data.setScale(1); // Измеряем все подписи в одном исходном масштабе.
            for (var row = 0; row < 17; row++) { // Готовим ряды длиной 9, 10, ... 17, ... 10, 9.
                var length = 17 - Math.abs(row - 8); // До середины прибавляем по гексагону, после середины убавляем.
                rows.push({start: Math.max(0, row - 8), offset: cells.length, length: length}); // После девятого ряда сдвигаем начало каждого следующего ряда вправо.
                for (var column = 0; column < length; column++) { // Перебираем места текущего ряда слева направо и вверх.
                    var cell = {row: row, column: rows[row].start + column, hex: null}; // Сохраняем положение места в общей сетке.
                    if (row != 8 || column != 8) { // Центральное место остаётся прозрачным и не получает цвет.
                        cell.hex = colorCodes[colorIndex++]; // Берём следующий HEX, не пропуская цвет из-за пустого центра.
                        cell.color = Color.valueOf(cell.hex); // Разбираем строку в Color один раз за всё время работы палитры.
                        cell.textColor = contrastColor(cell.color); // Подпись получает чёрный или белый цвет с большим контрастом к своему гексагону.
                        cell.layout = new GlyphLayout(); // Создаём измеритель и раскладку шести символов для этой ячейки.
                        cell.layout.setText(Fonts.def, cell.hex, cell.textColor, 0, Align.left, false); // Измеряем HEX без #, переноса строки и цветовой разметки.
                        maxTextWidth = Math.max(maxTextWidth, cell.layout.width); // Запоминаем ширину самой длинной подписи.
                        maxTextHeight = Math.max(maxTextHeight, cell.layout.height); // Запоминаем наибольшую высоту подписи.
                    }
                    cells.push(cell); // Сохраняем и цветные места, и единственное пустое.
                }
            }
        } finally { // Общий шрифт продолжает использоваться остальным интерфейсом.
            data.setScale(oldX, oldY); // Возвращаем оба исходных масштаба шрифта игры.
        }
    }

    // ПЕРЕСЧЁТ ГЕОМЕТРИИ И КЭША ПОДПИСЕЙ
    function rebuildGeometry() { // Вызываем при первом показе и изменении размера или отступа, а не каждый кадр.
        apothem = radius * sqrt3 / 2; // Расстояние от центра до верхней или нижней грани гексагона.
        stepY = apothem * 2 + gap; // Следующий ряд начинается ниже на полную высоту гексагона с отступом.
        stepX = stepY * sqrt3 / 2; // Такое смещение по X обеспечивает тот же отступ между наклонными гранями.
        originY = 12 * stepY + apothem + 2; // Располагаем первый гексагон с учётом всех нижних рядов и края в два пикселя.
        imageWidth = Math.ceil(16 * stepX + radius * 2 + 4); // Находим ширину всех 17 столбцов и прозрачных краёв.
        imageHeight = Math.ceil(16 * stepY + apothem * 2 + 4); // Находим высоту всей фигуры и прозрачных краёв.
        blackText.clear(); // Удаляем прежние вершины чёрных подписей перед пересчётом.
        whiteText.clear(); // Так же обновляем белые подписи.
        var data = Fonts.def.getData(), oldX = data.scaleX, oldY = data.scaleY; // Сохраняем масштаб общего шрифта перед временным изменением.
        try { // Не оставляем общий шрифт уменьшенным при исключении.
            data.setScale(Math.min(radius * 1.6 / maxTextWidth, radius * 0.61 / maxTextHeight)); // Увеличиваем подписи примерно на 10%, подгоняя общий масштаб по самой широкой строке (включая 000000).
            for (var i = 0; i < cells.length; i++) { // Обновляем центры всех мест и вершины букв цветных ячеек.
                var cell = cells[i]; // Берём ранее подготовленное место в сетке.
                cell.x = radius + 2 + cell.column * stepX; // Сдвигаем каждый следующий гексагон ряда вправо.
                cell.y = originY - cell.row * stepY + cell.column * stepY / 2; // Внутри ряда поднимаемся на половину шага, между рядами опускаемся на полный шаг.
                if (cell.hex == null) continue; // Для прозрачного центра подпись не нужна.
                cell.layout.setText(Fonts.def, cell.hex, cell.textColor, 0, Align.left, false); // Пересчитываем размер букв в выбранном масштабе.
                var cache = cell.textColor == Color.black ? blackText : whiteText; // Выбираем кэш нужного контрастного цвета.
                cache.addText(cell.layout, cell.x - cell.layout.width / 2, cell.y + cell.layout.height / 2); // Центрируем готовые буквы по горизонтали и вертикали.
            }
        } finally { // Изменение масштаба касается только подготовки вершин наших подписей.
            data.setScale(oldX, oldY); // Возвращаем шрифту его прежние настройки.
        }
        if (image != null) image.setSize(imageWidth, imageHeight); // Обновляем размер рисунка для прокрутки.
        if (imagePane != null) imagePane.invalidateHierarchy(); // Просим таблицы пересчитать доступную область и полосы прокрутки.
    }

    // РИСОВАНИЕ И ПОИСК ГЕКСАГОНА ПОД МЫШЬЮ
    function drawPalette(x, y, alpha) { // Рисуем цветные гексагоны и готовые подписи внутри окна палитры.
        Draw.mixcol(); // Не примешиваем к выбранным HEX дополнительный цвет от предыдущего рисования.
        for (var i = 0; i < cells.length; i++) { // За один проход рисуем только цветные гексагоны.
            var cell = cells[i]; // Получаем готовые координаты и цвет без создания новых объектов.
            if (cell.hex == null) continue; // Центр оставляем полностью прозрачным.
            Draw.color(cell.color, alpha); // Устанавливаем цвет гексагона с прозрачностью окна.
            Fill.poly(x + cell.x, y + cell.y, 6, radius, 0); // Рисуем правильный гексагон с горизонтальными верхней и нижней гранями.
        }
        Draw.color(); // Возвращаем обычный цвет рисования, сохраняя масштаб и толщину линий других элементов UI.
        if (!showLabels) return; // При выключенных подписях кэши текста вообще не рисуем.
        blackText.setPosition(x, y); // Переносим готовые чёрные подписи вместе с рисунком и его прокруткой.
        whiteText.setPosition(x, y); // Так же переносим белые подписи.
        blackText.draw(alpha); // Выводим чёрные буквы без нового расчёта строк.
        whiteText.draw(alpha); // Выводим белые буквы, сохраняя прозрачность окна.
    }

    function cellAt(x, y) { // Ищем ячейку по координатам рисунка; весь список из 216 цветов перебирать не требуется.
        var nearestColumn = Math.round((x - radius - 2) / stepX); // Приблизительно определяем столбец по горизонтальной координате.
        for (var column = nearestColumn - 1; column <= nearestColumn + 1; column++) { // Проверяем также соседние столбцы, поскольку вершины гексагонов выступают в стороны.
            var row = Math.round((originY + column * stepY / 2 - y) / stepY); // Находим ближайший ряд в этом столбце.
            if (row < 0 || row >= rows.length) continue; // За верхней и нижней границами рядов нет.
            var line = rows[row], offset = column - line.start; // Переводим номер общего столбца в номер места внутри ряда.
            if (offset < 0 || offset >= line.length) continue; // За краями короткого ряда ячеек тоже нет.
            var cell = cells[line.offset + offset]; // Получаем конкретное место напрямую по индексу.
            var dx = Math.abs(x - cell.x), dy = Math.abs(y - cell.y); // Измеряем расстояния от точки до центра ячейки.
            if (cell.hex != null && dx <= radius && dy <= apothem && sqrt3 * dx + dy <= sqrt3 * radius) return cell; // Проверяем прямые и наклонные грани; зазор и пустой центр не выбираются.
        }
        return null; // Мышь находится между гексагонами или за пределами фигуры.
    }

    // ПЛАШКА КОПИРОВАНИЯ РЯДОМ С КУРСОРОМ
    function hideCopiedToast() { // Убираем прежнюю плашку сразу, не дожидаясь её анимации.
        if (copyToast == null) return; // До первого копирования плашка ещё не создана.
        copyToast.clearActions(); // Останавливаем прежнее исчезновение перед закрытием или повторным показом.
        copyToast.remove(); // Удаляем плашку из сцены; объект сохраняем для следующего копирования.
    }

    function showCopiedToast(x, y) { // Получаем координаты щелчка внутри рисунка палитры.
        hideCopiedToast(); // Новая плашка сразу заменяет предыдущую, поэтому они не накапливаются.
        if (copyToast == null) { // Создаём оформление и поведение только при первом копировании.
            copyToast = extend(Table, { // Дополняем обычную таблицу проверкой наведения во время её короткого показа.
                act: function(delta) { // Сцена вызывает act только у находящейся в ней плашки.
                    this.super$act(delta); // Выполняем обычную анимацию прозрачности и удаление в её конце.
                    if (!this.hasParent() || toastAccelerated) return; // Удалённой или уже ускоренной плашке проверка мыши больше не нужна.
                    toastTimeLeft = Math.max(0, toastTimeLeft - delta); // Отсчитываем оставшееся время обычного исчезновения.
                    toastPoint.set(Core.input.mouseX(), Core.input.mouseY()); // Читаем экранное положение мыши в уже созданный Vec2.
                    this.screenToLocalCoordinates(toastPoint); // Переводим его в координаты плашки с учётом расположения окна.
                    if (toastPoint.x < 0 || toastPoint.y < 0 || toastPoint.x > this.getWidth() || toastPoint.y > this.getHeight()) return; // Пока мышь снаружи, сохраняем обычную скорость исчезновения.
                    toastAccelerated = true; // Ускоряем исчезновение только один раз за показ.
                    this.clearActions(); // Прерываем прежний темп, сохраняя текущую прозрачность.
                    this.addAction(Actions.sequence(Actions.fadeOut(Math.min(0.2, toastTimeLeft)), Actions.remove())); // При наведении исчезаем максимум за 0,2 секунды, не продлевая уже заканчивающийся показ.
                }
            });
            copyToast.name = "buildwheel-palette-toast"; // Даём плашке постоянное имя для поиска и проверки.
            copyToast.touchable = Touchable.disabled; // Мышь и щелчки проходят сквозь плашку к гексагонам под ней.
            copyToast.background(Tex.whiteui.tint(Color.valueOf("242424E6"))); // Задаём небольшой тёмный полупрозрачный фон без рамки.
            copyToast.margin(6, 9, 6, 9); // Оставляем немного места между текстом и краями плашки.
            copyToast.add(Core.bundle.get("buildwheel.palette.copied")).get().setFontScale(0.8); // Делаем надпись меньше обычного текста интерфейса.
        }
        copyToast.color.a = 1; // Каждое новое копирование начинает показ с полной видимости.
        copyToast.pack(); // Подгоняем размер плашки под её надпись и внутренние отступы.
        toastPoint.set(x, y); // Берём точное место щелчка, а не более позднее положение мыши.
        image.localToAscendantCoordinates(dialog, toastPoint); // Переводим место щелчка в координаты окна, обходя прокрутку рисунка.
        var offset = Scl.scl(10); // Отодвигаем плашку немного вправо и вниз от курсора.
        copyToast.setPosition(Math.max(0, Math.min(toastPoint.x + offset, dialog.getWidth() - copyToast.getWidth())), // Удерживаем плашку внутри правого и левого краёв окна.
            Math.max(0, Math.min(toastPoint.y - copyToast.getHeight() - offset, dialog.getHeight() - copyToast.getHeight()))); // Так же удерживаем её внутри нижнего и верхнего краёв.
        toastTimeLeft = 0.6; // Обычный показ длится около 0,6 секунды.
        toastAccelerated = false; // Новая плашка снова может ускорить исчезновение при наведении.
        dialog.addChild(copyToast); // Рисуем плашку поверх палитры, не занимая места в её таблицах.
        copyToast.addAction(Actions.sequence(Actions.fadeOut(toastTimeLeft), Actions.remove())); // Плавно уменьшаем прозрачность до нуля и затем удаляем плашку из сцены.
    }

    // ПОДСКАЗКА И ПОВТОРНОЕ КОПИРОВАНИЕ ВЫБРАННОГО HEX
    function refreshCopiedControl() { // Меняем содержимое уже созданной строки, сохраняя её размеры и положение текста.
        copiedLabel.setText(lastCopied == null ? Core.bundle.get("buildwheel.palette.select-hex") : "#" + lastCopied.hex); // До выбора показываем инструкцию, после выбора — полный код цвета.
        copiedLabel.setColor(lastCopied == null ? Color.white : lastCopied.color); // Код сохраняет цвет выбранного гексагона; инструкция остаётся белой.
        copiedButton.touchable = lastCopied == null ? Touchable.disabled : Touchable.enabled; // Разрешаем нажимать строку только после выбора цвета.
    }

    function copyHex(hex, source, x, y) { // Общий путь копирования обслуживает палитру, её правую кнопку и результат редактора HSV.
        Core.app.setClipboardText("#" + hex); // Передаём #RRGGBB в системный буфер обмена.
        if (source != image) { // Существующая плашка принимает координаты рисунка, поэтому переводим в них щелчок по кнопке.
            source.localToStageCoordinates(copyPoint.set(x, y)); // Получаем положение щелчка в сцене.
            image.stageToLocalCoordinates(copyPoint); // Учитываем положение и прокрутку рисунка палитры.
            x = copyPoint.x; y = copyPoint.y; // Передаём плашке координаты в прежнем формате.
        }
        showCopiedToast(x, y); // Показываем прежнюю плашку возле реального места щелчка.
    }

    function copyColor(cell, source, x, y) { // Дополнительно обновляем выбранный цвет только при копировании из самой палитры.
        if (cell == null) return; // Пустой центр и зазоры ничего не копируют.
        lastCopied = cell; // Запоминаем цвет для подписи и повторного копирования.
        refreshCopiedControl(); // Показываем код нужным цветом и включаем кнопку с рамкой.
        copyHex(cell.hex, source, x, y); // Копируем через общий обработчик с прежней плашкой.
    }

    function createHexButton(name, labelName, hasValue, onCopy) { // Один вид кнопки используется и выбранным гексагоном, и результатом HSV.
        var button = extend(Button, new Button.ButtonStyle(), { // Пустой стиль не рисует фон и не меняет цвет вложенной надписи.
            draw: function() { // Сначала рисуем надпись, затем рамку, если цвет уже выбран.
                this.super$draw(); // Выполняем штатное рисование кнопки и её текста.
                if (!hasValue()) return; // До появления значения инструкция отображается без рамки.
                var stroke = Lines.getStroke(), color = Draw.getColorPacked(), alpha = this.color.a; // Сохраняем параметры рисования и начинаем расчёт прозрачности рамки.
                for (var parent = this.parent; parent != null; parent = parent.parent) alpha *= parent.color.a; // Рамка исчезает вместе с родительским окном.
                var inset = Scl.scl(0.5); // Помещаем линию внутри границ кнопки.
                Draw.color(Color.gray, alpha); // Задаём серый цвет рамки с прозрачностью окна.
                Lines.stroke(Scl.scl(1)); // Толщина рамки — одна UI-единица.
                Lines.rect(this.x + inset, this.y + inset, this.getWidth() - inset * 2, this.getHeight() - inset * 2); // Обводим кнопку, не меняя расположение текста и соседних строк.
                Lines.stroke(stroke); // Возвращаем прежнюю толщину линий для других элементов интерфейса.
                Draw.color(color); // Возвращаем прежний цвет рисования.
            }
        });
        button.name = name; // Назначаем собственное имя каждой кнопке копирования.
        button.margin(0, 8, 0, 8); // Заранее оставляем место до рамки; при её появлении отступы не меняются.
        var label = button.add("").growX().name(labelName).get(); // Создаём надпись с цветом, независимым от оформления кнопки.
        label.setAlignment(Align.left); // Сохраняем одинаковое выравнивание инструкции и кода.
        button.addListener(extend(ClickListener, KeyCode.mouseLeft, { // Получаем точное место нажатия для прежней плашки «Скопировано».
            clicked: function(event, x, y) { if (hasValue()) onCopy(button, x, y); } // Передаём действие конкретной кнопке, когда ей есть что копировать.
        }));
        return {button: button, label: label}; // Возвращаем обе ссылки для размещения кнопки и обновления её надписи.
    }

    function createCopiedButton() { // Сначала показываем инструкцию, затем — выбранный HEX в общей кнопке с рамкой.
        var control = createHexButton("buildwheel-palette-copy", "buildwheel-palette-copied", () => lastCopied != null, // Рамка появляется после выбора гексагона.
            (source, x, y) => copyColor(lastCopied, source, x, y)); // Повторное копирование использует прежний выбранный цвет.
        copiedButton = control.button; copiedLabel = control.label; // Сохраняем ссылки для обновления при выборе гексагона.
        refreshCopiedControl(); // Применяем начальную инструкцию либо цвет, выбранный до перестройки окна.
        return copiedButton; // Передаём кнопку правой колонке настроек.
    }

    //=======================================================================================================
    //HSV-РЕДАКТОР С ПОЛНЫМ HEX И РЕЗУЛЬТАТОМ
    //=======================================================================================================
    // ВВОД HEX И РАСЧЁТ РЕЗУЛЬТАТА HSV
    function validHex(text) { // Разрешаем только полный код #RRGGBB, не применяя частично набранную строку.
        text = String(text); // Приводим текст Java к строке JavaScript.
        if (text.length != 7 || text.charAt(0) != "#") return false; // Требуем # и ровно шесть цифр RGB.
        for (var i = 1; i < text.length; i++) { // Проверяем символы после #.
            if ("0123456789abcdef".indexOf(text.charAt(i).toLowerCase()) < 0) return false; // Допускаем цифры и буквы HEX любого регистра.
        }
        return true; // Полный цвет можно разбирать и применять.
    }

    // ОПИСАНИЯ НАСТРОЕК КАК В ГРАФИЧЕСКОМ МЕНЮ MINDUSTRY
    function addTooltip(cell, text) { // Сохраняем удобное добавление описания к ячейке, используя родной метод игры.
        var element = cell.get(); // Получаем кнопку, поле или надпись, над которой наводят мышь.
        Vars.ui.addDescTooltip(element, text); // Родной Tooltip задаёт полупрозрачный фон, серый текст и положение под левым краем элемента.
        var container = element.getListeners().peek().getContainer(); // Получаем созданную игрой таблицу подсказки.
        var textCell = container.getCells().first(), label = textCell.get(); // Работаем только с описанием настройки; плашка «Скопировано» не затрагивается.
        var available = Math.max(1, Core.scene.getWidth() - container.getMarginLeft() - container.getMarginRight() - Scl.scl(8)); // Ограничиваем ширину размером экрана.
        if (label.getPrefWidth() > available) { // Длинному описанию выделяем ширину в пределах экрана.
            textCell.width(available); label.setWrap(true); // Включаем перенос у самой надписи, не уменьшая шрифт.
        }
        container.update(() => container.keepInStage()); // У края экрана подсказка сдвигается внутрь, сохраняя обычную привязку в остальных случаях.
        return cell; // Позволяем продолжить цепочку настройки размеров или получения элемента.
    }

    function colorHex(color) { // Общая запись цвета для результатов HSV и тонирования.
        var rgb = (Math.round(color.r * 255) << 16) | (Math.round(color.g * 255) << 8) | Math.round(color.b * 255); // Округляем каждый канал до ближайшего байта RGB.
        return (0x1000000 | rgb).toString(16).substring(1).toUpperCase(); // Получаем ровно шесть цифр с ведущими нулями, без #.
    }

    function updateHsvGradients(changedAxis) { // Обновляем только переходы, которые зависят от изменённого параметра.
        for (var i = 0; i < hsvAxes.length; i++) { // Просматриваем H, S и V.
            if (i == changedAxis) continue; // Собственный градиент слайдера от его значения не зависит.
            var axis = hsvAxes[i]; // Получаем заранее созданные цвета перехода.
            for (var stop = 0; stop < axis.colors.length; stop++) { // Для H рассчитываем семь цветов, для S или V — два.
                axis.colors[stop].fromHsv(i == 0 ? stop * 60 : hsvValues[0], // На полосе H меняется тон, на остальных сохраняется выбранный тон.
                    i == 1 ? stop : hsvValues[1], i == 2 ? stop : hsvValues[2]); // На S меняется насыщенность, на V — яркость; остальные параметры сохраняются.
            }
            axis.alpha = -1; // Просим рисование один раз обновить packed-цвета после изменения перехода.
        }
    }

    function refreshHsvOutput(changedAxis) { // Пересчитываем RGB из текущих HSV без обратного преобразования и потери тона.
        hsvOutput.color.fromHsv(hsvValues[0], hsvValues[1], hsvValues[2]); // Получаем итоговый цвет после движения слайдера или сброса.
        hsvOutput.hex = colorHex(hsvOutput.color); // Записываем результат в HEX с округлением каналов и сохранением ведущих нулей.
        Color.valueOf(hsvOutput.color, hsvOutput.hex); // Приводим образец к точному цвету отображаемого HEX.
        hsvKnobColor = contrastColor(hsvOutput.color); // На светлом участке бегунок становится чёрным, на тёмном — белым.
        hsvOutputLabel.setText("#" + hsvOutput.hex); // Обновляем копируемую надпись результата.
        hsvOutputLabel.setColor(hsvOutput.color); // Красим надпись в полученный цвет.
        updateHsvGradients(changedAxis); // Готовим новые переходы соседних слайдеров без изменения их положений.
    }

    function acceptHsvInput(text) { // Новый полный HEX становится исходным цветом и набором значений для сброса.
        hsvInputText = String(text); // Сохраняем даже незавершённый ввод для перестройки окна.
        if (!validHex(hsvInputText)) return; // До завершения ввода сохраняем прежние образцы, HSV и значения сброса.
        Color.valueOf(hsvInputColor, hsvInputText); // Разбираем исходный цвет в уже существующий Color.
        hsvInputColor.toHsv(hsvDefaults); // Получаем новые H, S и V для трёх отдельных кнопок refresh.
        for (var i = 0; i < hsvAxes.length; i++) { // Одновременно устанавливаем все три исходных параметра.
            hsvValues[i] = Number(hsvDefaults[i]); // Храним точное значение отдельно от округления шага слайдера.
            hsvAxes[i].slider.setValue(hsvValues[i], false); // Переставляем бегунок без события ручного изменения.
        }
        refreshHsvOutput(-1); // Пересчитываем результат и все три перехода для нового исходного цвета.
    }

    // ГРАДИЕНТЫ И ТОНКИЕ БЕГУНКИ С НАТИВНЫМ ПЕРЕТАСКИВАНИЕМ
    function createGradientStyle(gradient, getKnobColor) { // Одно оформление цветной полосы и бегунка обслуживает HSV и тонирование.
        var style = new Slider.SliderStyle(); // Обычные слайдеры остальных настроек сохраняют свои прежние стили.
        style.background = extend(BaseDrawable, { // Рисуем переход цветными четырёхугольниками без создания текстур.
            draw: function(x, y, width, height) { // Нативный Slider передаёт сюда всю область своей строки.
                var alpha = Draw.getColorAlpha(); // Получаем прозрачность слайдера с учётом окна.
                if (gradient.alpha != alpha) { // Пересчитываем packed-представление только при изменении цвета или прозрачности.
                    for (var i = 0; i < gradient.colors.length; i++) { // Подготавливаем границы уже рассчитанного перехода.
                        var color = gradient.colors[i]; // Берём готовый RGB без пересчёта смешивания или HSV в кадре.
                        gradient.packed[i] = Color.toFloatBits(color.r, color.g, color.b, alpha); // Включаем прозрачность прямо в цвет вершины градиента.
                    }
                    gradient.alpha = alpha; // Запоминаем прозрачность подготовленного кэша.
                }
                var left = x + Scl.scl(10), span = width - Scl.scl(20), barHeight = Math.min(height, Scl.scl(32)); // Совмещаем края перехода с центрами крайних положений обычного бегунка шириной 20.
                var bottom = y + (height - barHeight) / 2, segments = gradient.colors.length - 1; // Центрируем полосу высотой 32 и определяем число её отрезков.
                Draw.mixcol(); // Не примешиваем к градиенту цвет предыдущего рисования.
                for (var part = 0; part < segments; part++) { // Шесть отрезков для H; один — для S, V или тонирования.
                    var x0 = left + span * part / segments, x1 = left + span * (part + 1) / segments; // Получаем горизонтальные границы очередного отрезка.
                    Fill.quad(x0, bottom, gradient.packed[part], x0, bottom + barHeight, gradient.packed[part], // Задаём одинаковый цвет обеим вершинам левого края.
                        x1, bottom + barHeight, gradient.packed[part + 1], x1, bottom, gradient.packed[part + 1]); // Между левым и правым цветами видеокарта рисует плавный переход.
                }
            }
        });
        style.background.setMinHeight(Scl.scl(32)); // Резервируем удобную высоту цветной полосы.
        style.knob = extend(BaseDrawable, { // Метрики обычного бегунка сохраняем, но рисуем внутри него тонкую полоску.
            draw: function(x, y, width, height) { // Получаем полную область бегунка шириной 20 UI-единиц.
                var previous = Draw.getColorPacked(); // Запоминаем цвет рисования остальных элементов интерфейса.
                Draw.color(getKnobColor(), Draw.getColorAlpha() * 0.5); // Берём контрастный цвет текущего редактора и оставляем видимым переход под бегунком.
                Fill.rect(x + width / 2, y + height / 2, Scl.scl(3), height); // Рисуем полоску шириной 3 по центру нативной области бегунка.
                Draw.color(previous); // Возвращаем прежний цвет рисования.
            }
        });
        style.knob.setMinWidth(Scl.scl(20)); // Обычная ширина метрик сохраняет удобную нативную обработку мыши.
        style.knob.setMinHeight(Scl.scl(32)); // Высота бегунка совпадает с высотой градиента.
        style.knobOver = style.knob; style.knobDown = style.knob; // При наведении и перетаскивании размеры и внешний вид не прыгают.
        return style; // Возвращаем изолированный стиль для стандартного Slider.
    }

    function createHsvRow(index) { // Общий шаблон строки H, S или V с одинаковой длиной слайдера.
        var axis = hsvAxes[index], row = new Table(); // Берём параметры оси и создаём отдельную строку.
        addTooltip(row.add(axis.label).width(18), axis.title); // Показываем русское значение буквы под её левым краем.
        axis.slider = new Slider(0, axis.max, axis.step, false, createGradientStyle(axis, () => hsvKnobColor)); // Сохраняем нативное перетаскивание, используя общее оформление цветных слайдеров.
        axis.slider.name = "buildwheel-hsv-" + axis.key; // Постоянное имя нужного параметра для поиска в сцене.
        axis.slider.setRound(false); // Совмещаем рисунок и мышь без дополнительного округления дробных координат UI.
        axis.slider.setValue(hsvValues[index], false); // Показываем текущее значение без повторного расчёта результата.
        axis.slider.moved(value => { hsvValues[index] = Number(value); refreshHsvOutput(index); }); // Меняем только выбранный параметр; соседние бегунки остаются на месте.
        row.add(axis.slider).growX().minWidth(0).height(44).padLeft(4).padRight(4); // Выделяем всей полосе удобную область нажатия высотой 44.
        var reset = row.button(Icon.refresh, Styles.cleari, () => { // Возвращаем только этот параметр к исходному значению последнего правильного HEX.
            hsvValues[index] = Number(hsvDefaults[index]); // Точный исходный HSV хранится независимо от текущего результата.
            axis.slider.setValue(hsvValues[index], false); // Переставляем нужный бегунок, не затрагивая остальные.
            refreshHsvOutput(index); // Обновляем результат, образец и зависимые переходы.
        }).size(32, 44).name("buildwheel-hsv-reset-" + axis.key); // Кнопки refresh одинаковы по размеру.
        addTooltip(reset, Core.bundle.format("buildwheel.palette.hsv.reset", axis.label)).get().resizeImage(20); // Описание сброса использует серый текст и штатный полупрозрачный фон.
        return row; // Возвращаем готовую строку редактору HSV.
    }

    function createColorSwatch(color, name) { // Рисуем прямоугольный образец по ссылке на исходный или итоговый Color.
        var swatch = extend(Element, { // Образец не требует собственной текстуры или покадрового расчёта цвета.
            draw: function() { // Сцена рисует образец вместе с остальными полями.
                var previous = Draw.getColorPacked(), alpha = this.color.a; // Сохраняем цвет рисования и собственную прозрачность элемента.
                for (var parent = this.parent; parent != null; parent = parent.parent) alpha *= parent.color.a; // Учитываем анимацию и прозрачность окна.
                Draw.color(color, alpha); // Берём актуальный цвет из того же объекта, который меняют ввод и слайдеры.
                Fill.rect(this.x + this.getWidth() / 2, this.y + this.getHeight() / 2, this.getWidth(), this.getHeight()); // Заполняем весь прямоугольник образца.
                Draw.color(previous); // Не оставляем этот цвет следующим элементам интерфейса.
            }
        });
        swatch.name = name; // Различаем исходный и итоговый образцы в сцене.
        return swatch; // Размер задаёт общая таблица двух колонок.
    }

    function createHsvEditor(width) { // Собираем HEX и образцы в две колонки, а три слайдера располагаем ниже.
        var editor = new Table(), columnWidth = (width - 24) / 2, widthCells = []; // Запоминаем ячейки одинаковой ширины, чтобы позже сдвигать их края при появлении прокрутки.
        editor.add(Core.bundle.get("buildwheel.palette.hsv.title")).colspan(2).left().padBottom(12); // Отделяем заголовок от полей немного большим промежутком.
        editor.row(); // Верхняя строка содержит исходный HEX и кнопку результата.
        hsvInput = new TextField(hsvInputText); // Восстанавливаем текст, включая незавершённый ввод после изменения окна.
        hsvInput.name = "buildwheel-hsv-input"; // Постоянное имя поля исходного цвета.
        hsvInput.setMaxLength(7); // Полный код RGB занимает семь символов вместе с #.
        hsvInput.setMessageText("#RRGGBB"); // Подсказываем формат пустого поля.
        hsvInput.setValidator(text => validHex(text)); // Неверный или частичный HEX не применяется к редактору.
        hsvInput.changed(() => acceptHsvInput(hsvInput.getText())); // Полный ввод сразу обновляет HSV и значения для сброса.
        widthCells.push(editor.add(hsvInput).width(columnWidth).height(44).padRight(8)); // Слева помещаем поле исходного цвета и сохраняем его ячейку.
        var output = createHexButton("buildwheel-hsv-output-button", "buildwheel-hsv-output", () => true, // Результат использует такую же серую рамку, как выбранный цвет палитры.
            (source, x, y) => copyHex(hsvOutput.hex, source, x, y)); // Копирование результата показывает прежнюю плашку и не меняет выбранный гексагон.
        hsvOutputLabel = output.label; // Сохраняем надпись для динамического обновления результата.
        hsvOutputLabel.setText("#" + hsvOutput.hex); hsvOutputLabel.setColor(hsvOutput.color); // Восстанавливаем текст и цвет результата после перестройки окна.
        widthCells.push(editor.add(output.button).width(columnWidth).height(44)); // Справа ставим кнопку той же ширины и сохраняем её ячейку.
        editor.row(); // Под обоими HEX располагаем соответствующие образцы цвета.
        widthCells.push(editor.add(createColorSwatch(hsvInputColor, "buildwheel-hsv-input-swatch")).width(columnWidth).height(16).padTop(4).padRight(8)); // Левый образец меняет ширину вместе с полем исходного цвета.
        widthCells.push(editor.add(createColorSwatch(hsvOutput.color, "buildwheel-hsv-output-swatch")).width(columnWidth).height(16).padTop(4)); // Правый образец меняет ширину вместе с кнопкой результата.
        for (var i = 0; i < hsvAxes.length; i++) { // Добавляем три одинаковые по ширине строки H, S и V.
            editor.row(); // Каждая ось занимает собственный ряд под образцами.
            editor.add(createHsvRow(i)).colspan(2).growX().padTop(i == 0 ? 8 : 4); // Размещаем букву, градиентный слайдер и отдельный refresh.
        }
        return resizableEditor(editor, widthCells, 2, 24); // Передаём таблицу и возможность менять ширину колонок без пересоздания полей.
    }
    //=======================================================================================================

    // ТОНИРОВАНИЕ: ДОЛЯ ЦЕЛЕВОГО ЦВЕТА В БАЗОВОМ
    function refreshTintOutput() { // Пересчитываем результат только после ввода цвета или изменения процента.
        tintOutput.color.set(tintInputs[0].color).lerp(tintInputs[1].color, tintPercent / 100); // Смешиваем каналы RGB: 0% оставляет базовый цвет, 100% даёт целевой, 50% даёт равные доли.
        tintOutput.hex = colorHex(tintOutput.color); // Получаем копируемый HEX с округлением каналов до целых байтов.
        Color.valueOf(tintOutput.color, tintOutput.hex); // Цвет образца точно соответствует отображаемому коду.
        tintKnobColor = contrastColor(tintOutput.color); // Бегунок остаётся заметным на светлом и тёмном участке полосы.
        tintOutputLabel.setText("#" + tintOutput.hex); // Обновляем надпись центральной кнопки.
        tintOutputLabel.setColor(tintOutput.color); // Красим надпись в цвет результата, как у вывода HSV.
        tintPercentLabel.setText((Math.round(tintPercent * 10) / 10) + "%"); // Показываем долю целевого цвета с точностью до одной десятой процента.
    }

    function createTintField(index) { // Общий шаблон поля базового или целевого цвета.
        var input = tintInputs[index], field = new TextField(input.text); // Восстанавливаем введённую строку, включая незавершённый HEX после изменения окна.
        field.name = index == 0 ? "buildwheel-tint-base" : "buildwheel-tint-target"; // Различаем два независимых источника цвета.
        field.setMaxLength(7); // Полный #RRGGBB занимает семь символов.
        field.setMessageText("#RRGGBB"); // Напоминаем формат, если пользователь очистил поле.
        field.setValidator(text => validHex(text)); // Неполная строка не становится новым цветом перехода.
        field.changed(() => { // Реагируем на ввод в конкретное поле.
            input.text = String(field.getText()); // Сохраняем текущий текст, даже если он ещё не завершён.
            if (!validHex(input.text)) return; // До завершения правильного HEX сохраняем прежние образцы и результат.
            Color.valueOf(input.color, input.text); // Меняем существующий Color, который использует образец и конец градиента.
            tintGradient.alpha = -1; // Обновляем кэш полосы один раз после изменения одного из её концов.
            refreshTintOutput(); // Пересчитываем результат при прежнем проценте смешивания.
        });
        return field; // Передаём поле соответствующей колонке тонирования.
    }

    function createTintEditor(width) { // Располагаем базовый цвет, результат и целевой цвет в одном ряду, а слайдер — ниже.
        var editor = new Table(), columnWidth = (width - 32) / 3, widthCells = []; // Сохраняем ячейки трёх колонок для подгонки под реальную ширину прокрутки.
        widthCells.push(editor.add(Core.bundle.get("buildwheel.palette.tint.title")).width(columnWidth).left().padRight(8).padBottom(12)); // Заголовок занимает первую колонку над базовым цветом.
        var percentCell = editor.add((Math.round(tintPercent * 10) / 10) + "%").width(columnWidth).padRight(8).padBottom(12).name("buildwheel-tint-percent"); // Процент занимает такую же ячейку, как центральная кнопка.
        widthCells.push(percentCell); tintPercentLabel = percentCell.get(); // Сохраняем надпись и её изменяемую по ширине ячейку.
        tintPercentLabel.setAlignment(Align.left); // Сохраняем положение начала текста при изменении числа процентов.
        widthCells.push(editor.add().width(columnWidth)); // Пустая третья ячейка тоже сохраняет общую ширину колонок.
        editor.row(); // Верхняя строка содержит три HEX-кода.
        widthCells.push(addTooltip(editor.add(createTintField(0)).width(columnWidth).height(44).padRight(8), Core.bundle.get("buildwheel.palette.tint.base"))); // Под исходным полем показываем серое описание его назначения.
        var output = createHexButton("buildwheel-tint-output-button", "buildwheel-tint-output", () => true, // Центральная кнопка использует ту же рамку и отступы, что результат HSV.
            (source, x, y) => copyHex(tintOutput.hex, source, x, y)); // Копируем результат с прежней плашкой, не меняя выбранный гексагон и редактор HSV.
        tintOutputLabel = output.label; // Сохраняем ссылку на надпись результата для обновления при перетаскивании.
        tintOutputLabel.setText("#" + tintOutput.hex); tintOutputLabel.setColor(tintOutput.color); // Восстанавливаем результат при перестройке окна.
        widthCells.push(editor.add(output.button).width(columnWidth).height(44).padRight(8)); // Центральная кнопка результата меняет ширину вместе с полями.
        widthCells.push(addTooltip(editor.add(createTintField(1)).width(columnWidth).height(44), Core.bundle.get("buildwheel.palette.tint.target"))); // Под целевым полем показываем серое описание его назначения.
        editor.row(); // Следом располагаем три одинаковых прямоугольника под соответствующими HEX.
        widthCells.push(editor.add(createColorSwatch(tintInputs[0].color, "buildwheel-tint-base-swatch")).width(columnWidth).height(16).padTop(4).padRight(8)); // Левый образец сохраняет ширину своего поля.
        widthCells.push(editor.add(createColorSwatch(tintOutput.color, "buildwheel-tint-output-swatch")).width(columnWidth).height(16).padTop(4).padRight(8)); // Центральный образец сохраняет ширину кнопки результата.
        widthCells.push(editor.add(createColorSwatch(tintInputs[1].color, "buildwheel-tint-target-swatch")).width(columnWidth).height(16).padTop(4)); // Правый образец сохраняет ширину целевого поля.
        editor.row(); // Полосу смешивания размещаем под всеми тремя образцами.
        var slider = new Slider(0, 100, 0.1, false, createGradientStyle(tintGradient, () => tintKnobColor)); // Берём прежние размеры полосы, тонкий бегунок и удобное нативное перетаскивание.
        slider.name = "buildwheel-tint-amount"; // Постоянное имя процента тонирования в сцене.
        slider.setRound(false); // Сохраняем совпадение рисунка и координат мыши при дробном масштабе UI.
        slider.setValue(tintPercent, false); // Восстанавливаем процент без повторного применения смешивания.
        slider.moved(value => { tintPercent = Number(value); refreshTintOutput(); }); // Пересчитываем только результат; готовый градиент не зависит от положения бегунка.
        editor.add(slider).colspan(3).growX().height(44).padTop(8); // Одна полоса занимает общую ширину трёх колонок без дополнительной всплывающей инструкции.
        return resizableEditor(editor, widthCells, 3, 32); // Передаём тонирование вместе с подгонкой всех трёх колонок.
    }

    // ПОДГОНКА КОЛОНОК ПОД МЕСТО СЛЕВА ОТ ПОЛОСЫ ПРОКРУТКИ
    function resizableEditor(table, cells, columns, reserved) { // Общая подгонка полей HSV и тонирования не меняет их текст, фокус и обработчики.
        return {table: table, resize: function(width) { // Окно передаёт доступную ширину редактора в UI-единицах.
            var columnWidth = (width - reserved) / columns; // Вычитаем промежутки и делим место поровну между колонками.
            for (var i = 0; i < cells.length; i++) cells[i].width(columnWidth); // Меняем реальные размеры ячеек, а не добавляем пустоту за прежней таблицей.
        }};
    }

    // КАСТОМНАЯ ПАЛИТРА: ПОСТОЯННЫЕ МЕСТА И ОЧИСТКА ОБРАЗЦА
    function storeCustomSample(index, hex) { // Меняем только выбранное место, независимо от числа видимых рядов.
        var sample = customSamples[index]; // Получаем постоянную запись одного из 128 образцов.
        sample.hex = hex; sample.color = hex == null ? null : Color.valueOf(hex); // Пустое место не рисует заливку; заполненное хранит готовый Color.
        Core.settings.put(prefix + "custom." + index, hex == null ? "" : "#" + hex); // Записываем полный HEX либо пустое значение при явной очистке.
        onChanged(); // Просим основное меню сохранить изменения вместе с остальными настройками.
    }

    function hideCustomClear() { // Закрываем всплывающую кнопку, не меняя сохранённый цвет.
        clearSampleIndex = -1; // Снимаем выбор места для очистки.
        if (customClearButton != null) customClearButton.remove(); // Убираем единственную кнопку из сцены, сохраняя объект для следующего вызова.
    }

    function showCustomClear(index, source) { // ПКМ по заполненному образцу открывает очистку непосредственно над ним.
        hideCustomClear(); // Не оставляем несколько кнопок очистки над разными местами.
        if (customClearButton == null) { // Создаём всплывающую кнопку только при первом использовании.
            customClearButton = new ImageButton(Icon.none, Styles.defaulti); // Используем запрошенную игровую иконку none и обычное оформление кнопки.
            customClearButton.name = "buildwheel-custom-clear"; // Постоянное имя кнопки очистки.
            customClearButton.resizeImage(20); // Иконка помещается внутри квадрата размером 32 UI-единицы.
            customClearButton.clicked(() => { // Очищаем место только явным нажатием ЛКМ на эту кнопку.
                if (clearSampleIndex < 0) return; // Уже закрытая кнопка ничего не удаляет.
                storeCustomSample(clearSampleIndex, null); // Удаляем HEX и заливку выбранного образца.
                hideCustomClear(); // После очистки убираем всплывающую кнопку.
            });
        }
        clearSampleIndex = index; // Запоминаем конкретное место для последующего нажатия none.
        customClearButton.setSize(Scl.scl(32), Scl.scl(32)); // Кнопка очистки имеет тот же квадратный размер, что образец.
        customPoint.set((source.getWidth() - customClearButton.getWidth()) / 2, source.getHeight() + Scl.scl(4)); // Центрируем кнопку над образцом с небольшим промежутком.
        source.localToAscendantCoordinates(dialog, customPoint); // Учитываем положение и обе прокрутки правой панели.
        customClearButton.setPosition(Math.max(0, Math.min(customPoint.x, dialog.getWidth() - customClearButton.getWidth())), // Не выпускаем кнопку за боковые края окна.
            Math.max(0, Math.min(customPoint.y, dialog.getHeight() - customClearButton.getHeight()))); // Сохраняем кнопку на экране и у верхнего края.
        dialog.addChild(customClearButton); // Показываем кнопку поверх настроек, не сдвигая саму палитру.
    }

    function createCustomSample(index) { // Создаём квадратное представление постоянного места, а не копию его данных.
        var sample = customSamples[index]; // Ссылка остаётся действующей при заполнении и очистке.
        var button = extend(Button, new Button.ButtonStyle(), { // Пустой стиль позволяет рисовать бесцветный образец без стандартной заливки.
            draw: function() { // Рисуем сохранённый цвет и тонкую серую рамку.
                this.super$draw(); // Сохраняем обычное поведение кнопки сцены.
                var previous = Draw.getColorPacked(), stroke = Lines.getStroke(), alpha = this.color.a; // Запоминаем параметры рисования и собственную прозрачность.
                for (var parent = this.parent; parent != null; parent = parent.parent) alpha *= parent.color.a; // Образцы исчезают вместе с окном палитры.
                if (sample.color != null) { // Пустое место оставляем прозрачным.
                    Draw.color(sample.color, alpha); // Берём цвет, сохранённый в этом конкретном месте.
                    Fill.rect(this.x + this.getWidth() / 2, this.y + this.getHeight() / 2, this.getWidth(), this.getHeight()); // Закрашиваем квадрат целиком.
                }
                var inset = Scl.scl(0.5); // Располагаем тонкую рамку внутри квадрата.
                Draw.color(Color.gray, alpha); Lines.stroke(Scl.scl(1)); // Серая рамка одинакова у пустого и заполненного образца.
                Lines.rect(this.x + inset, this.y + inset, this.getWidth() - inset * 2, this.getHeight() - inset * 2); // Обводим образец без скругления углов.
                Lines.stroke(stroke); Draw.color(previous); // Не оставляем свои параметры рисования другим элементам.
            }
        });
        button.name = "buildwheel-custom-sample-" + index; // Номер всегда обозначает одно и то же постоянное место 0–127.
        button.addListener(extend(ClickListener, KeyCode.mouseLeft, { // ЛКМ заполняет пустое место или копирует уже сохранённый цвет.
            clicked: function(event, x, y) { // Получаем точку нажатия для прежней плашки копирования.
                hideCustomClear(); // Обычное нажатие закрывает ранее открытое меню очистки.
                if (sample.hex != null) { copyHex(sample.hex, button, x, y); return; } // Заполненный образец копирует свой HEX и показывает только «Скопировано».
                var text = Core.app.getClipboardText(); // Пустой образец читает системный буфер обмена.
                if (text == null || !validHex(text)) return; // Строго требуем # и шесть цифр, без пробелов, сокращений или alpha.
                storeCustomSample(index, String(text).substring(1).toUpperCase()); // Сохраняем корректный RGB; сама заливка обновится при следующем рисовании.
            }
        }));
        button.addListener(extend(ClickListener, KeyCode.mouseRight, { // ПКМ не очищает образец сразу.
            clicked: function() { if (sample.hex != null) showCustomClear(index, button); } // Кнопка none появляется только над заполненным местом.
        }));
        return button; // Размер и расположение задаёт сетка образцов.
    }

    function createRowIcon(plus) { // Рисуем собственные значки + и − без дополнительных файлов изображений.
        var icon = extend(BaseDrawable, { // ImageButton задаёт цвет и прозрачность иконки, включая недоступное состояние.
            draw: function(x, y, width, height) { // Получаем область значка внутри квадратной кнопки.
                var stroke = Lines.getStroke(), cx = x + width / 2, cy = y + height / 2; // Сохраняем толщину линий и находим центр.
                Lines.stroke(Math.max(1, width / 10)); // Делаем линии хорошо различимыми при текущем масштабе UI.
                Lines.line(cx - width * 0.3, cy, cx + width * 0.3, cy); // Горизонтальная линия нужна обоим значкам.
                if (plus) Lines.line(cx, cy - height * 0.3, cx, cy + height * 0.3); // Вертикальная линия превращает минус в плюс.
                Lines.stroke(stroke); // Возвращаем прежнюю толщину линий.
            }
        });
        icon.setMinWidth(20); icon.setMinHeight(20); // Ненулевые размеры позволяют Image правильно масштабировать собственный значок.
        return icon; // Возвращаем готовый drawable для кнопки + или −.
    }

    function createCustomEditor(width) { // Видимые ряды используют первые места из общего массива, не удаляя остальные.
        var editor = new Table(), grid = new Table(), columns = Math.max(1, Math.floor((width + 4) / 36)); // Квадрат 32 UI и промежуток 4 UI определяют автоматический перенос.
        editor.name = "buildwheel-custom-palette"; grid.name = "buildwheel-custom-grid"; // Постоянные имена блока и сетки помогают различать их в сцене.
        grid.top().left(); // Каждый ряд начинается от левого края палитры.
        var add = null, subtract = null; // Ссылки на кнопки нужны для обновления доступности у пределов.
        function rebuild() { // Перестраиваем только сетку при изменении числа рядов или колонок.
            hideCustomClear(); // Перенос образцов закрывает кнопку со старыми координатами.
            grid.clearChildren(); // Убираем прежние кнопки; постоянные данные 128 мест остаются в customSamples.
            var rows = Math.min(customRows, Math.max(2, Math.ceil(128 / columns))); // Показываем запрошенное число рядов, пока не достигнут предел мест.
            var count = Math.min(128, rows * columns); // Последний ряд при необходимости содержит меньше квадратов.
            for (var i = 0; i < count; i++) { // Порядок мест остаётся постоянным, слева направо и сверху вниз.
                if (i > 0 && i % columns == 0) grid.row(); // Новая строка начинается автоматически после заполнения текущей.
                grid.add(createCustomSample(i)).size(32).padRight(i % columns == columns - 1 ? 0 : 4).padBottom(Math.floor(i / columns) == rows - 1 ? 0 : 4); // Квадраты размером с ширину refresh сохраняют ровные ряды, включая неполный последний.
            }
            add.setDisabled(count == 128); // Больше 128 образцов добавлять нельзя.
            subtract.setDisabled(rows <= 2); // Минимум два ряда остаются видимыми.
        }
        function changeRows(delta) { // Кнопки меняют видимость рядов, а не количество сохранённых цветов.
            var maxRows = Math.max(2, Math.ceil(128 / columns)); // Предел зависит от доступного числа колонок.
            customRows = Math.max(2, Math.min(maxRows, Math.min(customRows, maxRows) + delta)); // Добавляем или скрываем один ряд с учётом обоих ограничений.
            Core.settings.put(prefix + "custom.rows", new java.lang.Integer(String(customRows))); // Запоминаем выбранное число видимых рядов.
            onChanged(); // Отмечаем изменение настройки для записи на диск.
            rebuild(); // Перестраиваем сетку, не изменяя ни одного сохранённого HEX.
        }
        editor.add(Core.bundle.get("buildwheel.palette.custom.title")).growX().left(); // Название занимает начало строки, а кнопки уходят в её правый конец.
        add = editor.button(createRowIcon(true), Styles.cleari, () => changeRows(1)).size(32).name("buildwheel-custom-add-row").get(); // Плюс добавляет один видимый ряд.
        subtract = editor.button(createRowIcon(false), Styles.cleari, () => changeRows(-1)).size(32).name("buildwheel-custom-remove-row").get(); // Минус скрывает один ряд, сохраняя его цвета.
        add.resizeImage(20); subtract.resizeImage(20); // Иконки + и − имеют одинаковые размеры.
        editor.row(); // Сетка образцов начинается ниже заголовка и кнопок.
        editor.add(grid).colspan(3).growX().padTop(12); // Оставляем между заголовком и квадратами тот же аккуратный зазор.
        rebuild(); // Изначально показываем два ряда либо сохранённое пользователем число.
        return {table: editor, resize: function(nextWidth) { // Окно может менять количество колонок при изменении доступной ширины.
            var nextColumns = Math.max(1, Math.floor((nextWidth + 4) / 36)); // Рассчитываем, сколько квадратов теперь помещается в ряд.
            if (columns == nextColumns) return; // Прежняя сетка не нуждается в пересоздании, если число колонок не изменилось.
            columns = nextColumns; rebuild(); // Переносим те же постоянные места в новую сетку.
        }};
    }


    // ПОЛЯ РАЗМЕРА И ОТСТУПА
    function addNumberField(table, title, key, min, max, value) { // Создаём подпись и строку ввода с одинаковой шириной.
        table.add(title).growX().left().padBottom(2); // Оставляем между названием и полем на две UI-единицы меньше.
        table.row(); // Само поле помещаем ниже названия.
        var field = new TextField(String(value)); // Показываем текущее значение настройки.
        field.name = "buildwheel-palette-" + key; // Различаем поле размера и поле отступа по постоянному имени.
        field.setFilter(TextField.TextFieldFilter.digitsOnly); // При обычном вводе разрешаем только цифры.
        field.setValidator(text => isFinite(parseInteger(text, min, max))); // Подсвечиваем незавершённое или выходящее за границы значение как ошибочное.
        field.changed(() => { // Реагируем только на изменение строки ввода.
            var number = parseInteger(field.getText(), min, max); // Разбираем введённое целое число.
            if (!isFinite(number) || number == (key == "size" ? radius : gap)) return; // Не пересчитываем рисунок из-за недопустимого или прежнего значения.
            if (key == "size") radius = number; // Меняем радиус типового гексагона.
            else gap = number; // Либо меняем общий отступ между его соседями.
            Core.settings.put(prefix + key, new java.lang.Integer(String(number))); // Сохраняем целое как Java Integer, который умеет записывать Settings.
            onChanged(); // Просим основное меню сохранить настройки на диск при закрытии.
            rebuildGeometry(); // Один раз обновляем координаты и готовые подписи.
        });
        addTooltip(table.add(field).growX().height(44).padBottom(16), Core.bundle.format("buildwheel.palette.pixels-range", min, max)); // Диапазон показываем серым текстом под началом числового поля.
        table.row(); // Следующая настройка начинается с нового ряда.
    }

    // РИСУНОК КАК ОДИН ЭЛЕМЕНТ ИНТЕРФЕЙСА
    function createImage() { // Для всей палитры нужен один Element вместо 216 отдельных кнопок и надписей.
        image = extend(Element, { // Переопределяем только размер и рисование обычного элемента сцены.
            getPrefWidth: function() { return imageWidth; }, // Сообщаем прокрутке полную ширину рисунка в координатах сцены.
            getPrefHeight: function() { return imageHeight; }, // Так же сообщаем полную высоту рисунка.
            draw: function() { // Сцена вызывает этот метод только для видимого окна.
                var alpha = this.color.a; // Начинаем с собственной прозрачности элемента.
                for (var parent = this.parent; parent != null; parent = parent.parent) alpha *= parent.color.a; // Учитываем прозрачность родительских таблиц и анимации окна.
                drawPalette(this.x + (this.getWidth() - imageWidth) / 2, this.y + (this.getHeight() - imageHeight) / 2, alpha); // Центрируем рисунок, если область прокрутки шире или выше него.
            }
        });
        image.name = "buildwheel-palette-image"; // Постоянное имя самого рисунка в сцене.
        image.addListener(extend(ClickListener, KeyCode.mouseLeft, { // Обрабатываем обычный щелчок только левой кнопкой мыши.
            clicked: function(event, x, y) { // Получаем координаты щелчка внутри элемента рисунка.
                var cell = cellAt(x - (image.getWidth() - imageWidth) / 2, y - (image.getHeight() - imageHeight) / 2); // Убираем центрирующий отступ и находим конкретный гексагон.
                copyColor(cell, image, x, y); // Общая функция копирует цвет; зазоры и пустой центр оставляет без действия.
            }
        }));
        return image; // Передаём рисунок контейнеру прокрутки.
    }

    // СОДЕРЖИМОЕ ОКНА: ПАЛИТРА СЛЕВА, НАСТРОЙКИ И «НАЗАД» СПРАВА
    function buildInterface() { // Перестраиваем таблицы при открытии и изменении размера окна, сохраняя геометрию палитры.
        hideCopiedToast(); // При изменении размера окна убираем плашку с уже устаревшими координатами.
        hideCustomClear(); // Кнопка очистки не должна оставаться над прежним положением образца.
        var scale = Scl.scl(1), width = Core.scene.getWidth() / scale, height = Core.scene.getHeight() / scale; // Используем всю ширину и высоту сцены без процентного ограничения.
        dialog.setBounds(0, 0, Core.scene.getWidth(), Core.scene.getHeight()); // Закрепляем окно у начала сцены, чтобы после уменьшения экрана оно не сохраняло прежнее смещение.
        var controlsWidth = Math.min(520, Math.max(472, width * 0.4), width - 104); //#marker# Ширина настроек под три HEX-кода: обычно 472–520 UI-единиц; на узком экране оставляем хотя бы 104 для рисунка и зазора.
        var settingsWidth = Math.max(448, controlsWidth - 24); // Сохраняем читаемую ширину полей даже в узкой панели, где включается горизонтальная прокрутка.
        var pictureWidth = width - controlsWidth - 16; // Всю оставшуюся ширину отдаём рисунку, оставляя зазор перед настройками.
        dialog.cont.clearChildren(); // Убираем прежние таблицы перед сборкой интерфейса.
        var body = new Table(), controls = new Table(), settings = new Table(); // Отделяем прокручиваемые настройки от закреплённых заголовка и кнопки «Назад».
        controls.top().left().margin(12); // Выравниваем настройки сверху и оставляем внутренний отступ только в правой колонке.
        dialog.title.setAlignment(Align.left); // Выравниваем стандартный заголовок окна по левому краю правой колонки.
        controls.add(dialog.title).growX().padBottom(16).name("buildwheel-palette-title"); // Располагаем название только над настройками; над рисунком общей шапки нет.
        controls.row(); // Поля начинаются ниже заголовка правой колонки.
        settings.top().left(); // Настройки начинаются у верхнего края своей прокручиваемой области.
        addNumberField(settings, Core.bundle.get("buildwheel.palette.hex-size"), "size", 8, 80, radius); // Добавляем поле радиуса, как в исходной HTML-палитре.
        addNumberField(settings, Core.bundle.get("buildwheel.palette.gap"), "gap", 0, 30, gap); // Добавляем единый отступ между соседними гранями.
        var selectionRow = new Table(); // Объединяем выбранный HEX и переключатель подписей в один ряд.
        selectionRow.add(createCopiedButton()).growX().height(44).padRight(12); // Слева показываем инструкцию или кнопку копирования, сохраняя место под рамку.
        selectionRow.check(Core.bundle.get("buildwheel.palette.show-hex"), showLabels, value => { // Справа создаём переключатель подписей с сохранённым состоянием.
            showLabels = value; // Меняем только разрешение рисовать готовый кэш подписей.
            Core.settings.put(prefix + "labels", value); // Сохраняем состояние переключателя в памяти настроек игры.
            onChanged(); // Сообщаем основному меню, что настройки потребуется записать.
        }).height(44).left().name("buildwheel-palette-labels"); // Переключатель занимает обычную высоту и остаётся после кнопки HEX.
        settings.add(selectionRow).growX(); // Вставляем оба элемента в одну строку правой панели.
        settings.row(); // Ниже добавляем отдельную функцию изменения цвета.
        var hsvEditor = createHsvEditor(settingsWidth); // Сохраняем доступ к изменению внутренних размеров HSV.
        var hsvCell = settings.add(hsvEditor.table).width(settingsWidth).padTop(32); // Отделяем редактор HSV от предыдущих настроек заметным промежутком.
        settings.row(); // Вторую функцию размещаем под редактором HSV.
        var tintEditor = createTintEditor(settingsWidth); // Сохраняем доступ к изменению трёх колонок тонирования.
        var tintCell = settings.add(tintEditor.table).width(settingsWidth).padTop(32); // Оставляем такой же промежуток перед отдельным блоком тонирования.
        settings.row(); // Последний блок настроек располагается ниже тонирования.
        var customEditor = createCustomEditor(settingsWidth); // Создаём сетку образцов из постоянных 128 мест.
        var customCell = settings.add(customEditor.table).width(settingsWidth).left().padTop(32); // Сохраняем промежуток между блоками и выравниваем сетку по левому краю.
        var customWidth = settingsWidth; // В отличие от HEX-полей, квадраты могут переноситься по фактической видимой ширине панели.
        var pictureCell = null, controlsCell = null, rightReserve = 0; // Ячейки обеих половин позволяют отдать место правой полосе, сдвигая настройки влево.
        var settingsPane = extend(ScrollPane, settings, Styles.defaultPane, { // Подгоняем реальные размеры таблиц под область слева от правой полосы.
            layout: function() { // Пересчёт запускается обычной системой раскладки, а не постоянной проверкой в каждом кадре.
                this.super$layout(); // Сначала даём ScrollPane определить, какие полосы действительно нужны.
                var reserve = this.isScrollY() ? Math.min(this.getScrollBarWidth() / Scl.scl(1) + 8, Math.max(0, pictureWidth - 88)) : 0; // Резервируем справа ширину полосы и зазор, пока у рисунка есть свободная ширина.
                if (pictureCell != null && controlsCell != null && Math.abs(rightReserve - reserve) >= 0.01) { // Меняем разделение окна только при появлении или исчезновении полосы.
                    rightReserve = reserve; pictureCell.width(pictureWidth - reserve); // Рисунок уступает ровно необходимое место.
                    controlsCell.width(controlsWidth + reserve); // Левый край настроек сдвигается влево, а справа освобождается место для полосы.
                }
                var gap = this.isScrollY() ? 8 : 0, visible = Math.max(32, this.getScrollWidth() / Scl.scl(1) - gap); // Получаем фактическое место слева от правой полосы и зазора.
                var available = Math.max(448, visible); // HEX-полям сохраняем читаемую ширину; в узком окне они доступны горизонтальной прокруткой.
                if (Math.abs(settingsWidth - available) < 0.01 && Math.abs(customWidth - visible) < 0.01 && settings.getMarginRight() == Scl.scl(gap)) return; // При неизменившейся области никакие ячейки не трогаем.
                settingsWidth = available; settings.marginRight(gap); // Меняем ширину содержимого и оставляем зазор только справа.
                hsvEditor.resize(available); hsvCell.width(available); // Уменьшаем обе колонки HSV, сдвигая правые кнопки влево от полосы.
                tintEditor.resize(available); tintCell.width(available); // Так же уменьшаем реальные поля и образцы тонирования.
                customWidth = visible; customEditor.resize(visible); customCell.width(visible); // Квадраты переносятся по видимой ширине, даже когда широкие HEX-поля требуют прокрутки.
                this.super$layout(); // Применяем новые размеры и пересчитываем пределы обеих прокруток.
            }
        });
        settingsPane.name = "buildwheel-palette-settings"; // Постоянное имя прокрутки настроек.
        settingsPane.setScrollingDisabled(false, false); // В узком окне разрешаем обе прокрутки, сохраняя три HEX-поля в одной строке и полностью читаемыми.
        settingsPane.setFadeScrollBars(false); // Оставляем нужную полосу прокрутки видимой.
        settingsPane.setScrollbarsOnTop(false); // Сама полоса получает отдельную область; содержимое не рисуется под ней.
        settingsPane.setScrollBarPositions(true, true); // Горизонтальная полоса находится снизу, вертикальная — именно справа.
        settingsPane.setOverscroll(false, false); // Не растягиваем настройки за границы содержимого.
        settingsPane.hovered(() => Core.scene.setScrollFocus(settingsPane)); // Над правой панелью колёсико мыши прокручивает настройки.
        controls.add(settingsPane).grow().minWidth(0).minHeight(0); // Панель настроек занимает всё место между заголовком и кнопкой возврата.
        controls.row(); // Последняя строка правой колонки всегда остаётся видимой.
        controls.button(Core.bundle.get("buildwheel.palette.back"), Icon.left, () => hide()).growX().height(54).padTop(8).name("buildwheel-palette-back"); // Закрываем палитру, не заставляя прокручивать настройки до кнопки «Назад».
        imagePane = new ScrollPane(createImage(), Styles.defaultPane); // Разрешаем рассматривать всю палитру, даже если её размер больше экрана.
        imagePane.name = "buildwheel-palette-scroll"; // Отдельное имя помогает проверить границы видимой области рисунка.
        imagePane.setFadeScrollBars(false); // Оставляем нужные полосы прокрутки видимыми.
        imagePane.setOverscroll(false, false); // Не растягиваем рисунок за пределы его краёв при прокрутке.
        imagePane.hovered(() => Core.scene.setScrollFocus(imagePane)); // Над рисунком колёсико снова управляет самой палитрой.
        pictureCell = body.add(imagePane).size(pictureWidth, height); // Сохраняем ячейку рисунка для выделения места полосе справа.
        controlsCell = body.add(controls).width(controlsWidth).growY().padLeft(16); // Правая колонка занимает всю высоту и может сдвигаться влево на ширину полосы.
        dialog.cont.add(body).grow(); // Обе части занимают всё окно, а рисунок получает полную доступную высоту.
    }

    // ОТКРЫТИЕ, ЗАКРЫТИЕ И ПОДГОНКА ОКНА
    function show() { // Эту функцию вызывает кнопка «Палитра» в основном меню настроек.
        if (dialog.isShown()) return; // Не показываем то же окно повторно.
        if (cells.length == 0) { prepareCells(); rebuildGeometry(); } // Создаём цвета и геометрию только при первом открытии.
        buildInterface(); // Собираем окно под текущий размер экрана.
        dialog.show(); // Показываем палитру поверх меню настроек.
        Core.app.post(() => { if (dialog.isShown()) Core.scene.setScrollFocus(imagePane); }); // Передаём колёсико мыши рисунку после открытия окна.
    }

    function hide() { // Этот же способ закрытия используют «Назад» и клавиши основного меню.
        if (!dialog.isShown()) return; // Уже закрытое окно повторно не закрываем.
        hideCopiedToast(); // Плашка исчезает сразу при выходе из палитры.
        hideCustomClear(); // Закрываем и контекстную кнопку очистки образца.
        dialog.hide(); // Начинаем закрытие палитры и штатное восстановление фокуса сцены.
    }

    dialog.addCaptureListener(extend(InputListener, { // Закрываем маленькое меню очистки обычными действиями внутри окна палитры.
        touchDown: function(event) { // Нажатие вне кнопки none закрывает её, не мешая назначению исходного нажатия.
            if (customClearButton != null && customClearButton.hasParent() && event.targetActor != null && !event.targetActor.isDescendantOf(customClearButton)) hideCustomClear(); // Самой кнопке очистки даём обработать свой ЛКМ.
            return false; // Не забираем щелчок у полей, слайдеров и образцов.
        },
        scrolled: function() { hideCustomClear(); return false; } // Прокрутка закрывает кнопку со старыми координатами и продолжает обычную работу.
    }));

    dialog.addListener(extend(ResizeListener, { // Слушаем изменение размеров окна без постоянной покадровой проверки.
        resized: function() { // Сцена сообщает о новой ширине или высоте.
            if (!dialog.isShown()) return; // Скрытое окно перестроится при следующем открытии.
            buildInterface(); // Меняем размеры видимых областей, сохраняя цвета, настройки и кэши подписей.
            Core.app.post(() => { if (dialog.isShown()) Core.scene.setScrollFocus(imagePane); }); // Сохраняем прокрутку за палитрой после перестройки.
        }
    }));
    return {show: show, hide: hide, isShown: () => dialog.isShown()}; // Основному меню достаточно открыть, закрыть или проверить состояние палитры.
};
