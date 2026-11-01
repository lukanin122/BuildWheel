// ПАЛИТРА ЦВЕТОВ: ГЕКСАГОНЫ, КОПИРОВАНИЕ HEX И РЕДАКТОР HSV
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
    var dialog = extend(BaseDialog, "Палитра цветов", { // Создаём обычное окно и дополняем действие после его полного закрытия.
        remove: function() { // Сцена удаляет окно после завершения анимации закрытия.
            hideCopiedToast(); // Убираем плашку копирования вместе с палитрой.
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
        {key: "h", label: "H", title: "Цветовой тон", max: 360, step: 0.01}, // Тон задаётся в градусах; 0 и 360 соответствуют красному.
        {key: "s", label: "S", title: "Насыщенность", max: 1, step: 0.0001}, // Доля насыщенности: ноль нужен для точного сохранения серых цветов.
        {key: "v", label: "V", title: "Яркость", max: 1, step: 0.0001} // Доля яркости: ноль нужен для чёрного и его корректного сброса.
    ];
    for (var axisIndex = 0; axisIndex < hsvAxes.length; axisIndex++) { // Один раз подготавливаем цвета и числовые кэши градиентов.
        var axis = hsvAxes[axisIndex]; // Получаем описание текущего параметра HSV.
        axis.colors = []; axis.packed = []; axis.alpha = -1; axis.slider = null; // Отдельно храним цвета перехода, их packed-представление и ссылку на слайдер.
        for (var stop = 0; stop < (axisIndex == 0 ? 7 : 2); stop++) axis.colors.push(new Color()); // Для H нужны семь границ цветовых секторов; для S и V достаточно двух концов.
    }
    updateHsvGradients(-1); // Готовим все три перехода до первого показа редактора.

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
            copyToast.add("Скопировано").get().setFontScale(0.8); // Делаем надпись меньше обычного текста интерфейса.
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
        copiedLabel.setText(lastCopied == null ? "Выберите #HEX" : "#" + lastCopied.hex); // До выбора показываем инструкцию, после выбора — полный код цвета.
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

    // ВВОД HEX И РАСЧЁТ РЕЗУЛЬТАТА HSV
    function validHex(text) { // Разрешаем только полный код #RRGGBB, не применяя частично набранную строку.
        text = String(text); // Приводим текст Java к строке JavaScript.
        if (text.length != 7 || text.charAt(0) != "#") return false; // Требуем # и ровно шесть цифр RGB.
        for (var i = 1; i < text.length; i++) { // Проверяем символы после #.
            if ("0123456789abcdef".indexOf(text.charAt(i).toLowerCase()) < 0) return false; // Допускаем цифры и буквы HEX любого регистра.
        }
        return true; // Полный цвет можно разбирать и применять.
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
        var rgb = (Math.round(hsvOutput.color.r * 255) << 16) | (Math.round(hsvOutput.color.g * 255) << 8) | Math.round(hsvOutput.color.b * 255); // Округляем каналы RGB, избегая потери единицы из-за точности float.
        hsvOutput.hex = (0x1000000 | rgb).toString(16).substring(1).toUpperCase(); // Формируем ровно шесть цифр результата с ведущими нулями.
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
    function createHsvStyle(axis) { // Создаём собственный стиль только для одного нового слайдера HSV.
        var style = new Slider.SliderStyle(); // Обычные слайдеры остальных настроек сохраняют свои прежние стили.
        style.background = extend(BaseDrawable, { // Рисуем переход цветными четырёхугольниками без создания текстур.
            draw: function(x, y, width, height) { // Нативный Slider передаёт сюда всю область своей строки.
                var alpha = Draw.getColorAlpha(); // Получаем прозрачность слайдера с учётом окна.
                if (axis.alpha != alpha) { // Пересчитываем packed-представление только при изменении цвета или прозрачности.
                    for (var i = 0; i < axis.colors.length; i++) { // Подготавливаем границы уже рассчитанного перехода.
                        var color = axis.colors[i]; // Берём готовый RGB без новых преобразований HSV в кадре.
                        axis.packed[i] = Color.toFloatBits(color.r, color.g, color.b, alpha); // Включаем прозрачность прямо в цвет вершины градиента.
                    }
                    axis.alpha = alpha; // Запоминаем прозрачность подготовленного кэша.
                }
                var left = x + Scl.scl(10), span = width - Scl.scl(20), barHeight = Math.min(height, Scl.scl(32)); // Совмещаем края перехода с центрами крайних положений обычного бегунка шириной 20.
                var bottom = y + (height - barHeight) / 2, segments = axis.colors.length - 1; // Центрируем полосу высотой 32 и определяем число её отрезков.
                Draw.mixcol(); // Не примешиваем к градиенту цвет предыдущего рисования.
                for (var part = 0; part < segments; part++) { // Шесть отрезков H или один линейный отрезок S/V.
                    var x0 = left + span * part / segments, x1 = left + span * (part + 1) / segments; // Получаем горизонтальные границы очередного отрезка.
                    Fill.quad(x0, bottom, axis.packed[part], x0, bottom + barHeight, axis.packed[part], // Задаём одинаковый цвет обеим вершинам левого края.
                        x1, bottom + barHeight, axis.packed[part + 1], x1, bottom, axis.packed[part + 1]); // Между левым и правым цветами видеокарта рисует плавный переход.
                }
            }
        });
        style.background.setMinHeight(Scl.scl(32)); // Резервируем удобную высоту цветной полосы.
        style.knob = extend(BaseDrawable, { // Метрики обычного бегунка сохраняем, но рисуем внутри него тонкую полоску.
            draw: function(x, y, width, height) { // Получаем полную область бегунка шириной 20 UI-единиц.
                var previous = Draw.getColorPacked(); // Запоминаем цвет рисования остальных элементов интерфейса.
                Draw.color(hsvKnobColor, Draw.getColorAlpha() * 0.5); // Контрастный полупрозрачный цвет оставляет видимым переход под бегунком.
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
        row.add(axis.label).width(18).tooltip(axis.title); // Показываем букву и её русское значение при наведении.
        axis.slider = new Slider(0, axis.max, axis.step, false, createHsvStyle(axis)); // Сохраняем нативные hit-test и перетаскивание, меняя только рисунок слайдера.
        axis.slider.name = "buildwheel-hsv-" + axis.key; // Постоянное имя нужного параметра для поиска в сцене.
        axis.slider.setRound(false); // Совмещаем рисунок и мышь без дополнительного округления дробных координат UI.
        axis.slider.setValue(hsvValues[index], false); // Показываем текущее значение без повторного расчёта результата.
        axis.slider.moved(value => { hsvValues[index] = Number(value); refreshHsvOutput(index); }); // Меняем только выбранный параметр; соседние бегунки остаются на месте.
        row.add(axis.slider).growX().minWidth(0).height(44).padLeft(4).padRight(4); // Выделяем всей полосе удобную область нажатия высотой 44.
        row.button(Icon.refresh, Styles.cleari, () => { // Возвращаем только этот параметр к исходному значению последнего правильного HEX.
            hsvValues[index] = Number(hsvDefaults[index]); // Точный исходный HSV хранится независимо от текущего результата.
            axis.slider.setValue(hsvValues[index], false); // Переставляем нужный бегунок, не затрагивая остальные.
            refreshHsvOutput(index); // Обновляем результат, образец и зависимые переходы.
        }).size(32, 44).name("buildwheel-hsv-reset-" + axis.key).tooltip("Сбросить " + axis.label + " к введённому цвету").get().resizeImage(20); // Кнопки refresh одинаковы по размеру и поясняют свой сброс.
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
        var editor = new Table(), columnWidth = (width - 24) / 2; // Оставляем запас под полосу прокрутки справа и зазор между колонками.
        editor.add("Изменение цвета").colspan(2).left().padBottom(8); // Отделяем новую функцию собственным заголовком.
        editor.row(); // Верхняя строка содержит исходный HEX и кнопку результата.
        hsvInput = new TextField(hsvInputText); // Восстанавливаем текст, включая незавершённый ввод после изменения окна.
        hsvInput.name = "buildwheel-hsv-input"; // Постоянное имя поля исходного цвета.
        hsvInput.setMaxLength(7); // Полный код RGB занимает семь символов вместе с #.
        hsvInput.setMessageText("#RRGGBB"); // Подсказываем формат пустого поля.
        hsvInput.setValidator(text => validHex(text)); // Неверный или частичный HEX не применяется к редактору.
        hsvInput.changed(() => acceptHsvInput(hsvInput.getText())); // Полный ввод сразу обновляет HSV и значения для сброса.
        editor.add(hsvInput).width(columnWidth).height(44).padRight(8); // Слева помещаем поле исходного цвета.
        var output = createHexButton("buildwheel-hsv-output-button", "buildwheel-hsv-output", () => true, // Результат использует такую же серую рамку, как выбранный цвет палитры.
            (source, x, y) => copyHex(hsvOutput.hex, source, x, y)); // Копирование результата показывает прежнюю плашку и не меняет выбранный гексагон.
        hsvOutputLabel = output.label; // Сохраняем надпись для динамического обновления результата.
        hsvOutputLabel.setText("#" + hsvOutput.hex); hsvOutputLabel.setColor(hsvOutput.color); // Восстанавливаем текст и цвет результата после перестройки окна.
        editor.add(output.button).width(columnWidth).height(44); // Справа ставим кнопку той же ширины и высоты, что поле ввода.
        editor.row(); // Под обоими HEX располагаем соответствующие образцы цвета.
        editor.add(createColorSwatch(hsvInputColor, "buildwheel-hsv-input-swatch")).width(columnWidth).height(16).padTop(4).padRight(8); // Прямоугольник слева сохраняет исходный цвет.
        editor.add(createColorSwatch(hsvOutput.color, "buildwheel-hsv-output-swatch")).width(columnWidth).height(16).padTop(4); // Прямоугольник справа показывает текущий результат.
        for (var i = 0; i < hsvAxes.length; i++) { // Добавляем три одинаковые по ширине строки H, S и V.
            editor.row(); // Каждая ось занимает собственный ряд под образцами.
            editor.add(createHsvRow(i)).colspan(2).growX().padTop(i == 0 ? 8 : 4); // Размещаем букву, градиентный слайдер и отдельный refresh.
        }
        return editor; // Передаём новую функцию в прокручиваемую правую панель палитры.
    }

    // ПОЛЯ РАЗМЕРА И ОТСТУПА
    function addNumberField(table, title, key, min, max, value) { // Создаём подпись и строку ввода с одинаковой шириной.
        table.add(title).growX().left().padBottom(4); // Располагаем название настройки над полем.
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
        table.add(field).growX().height(44).padBottom(16).tooltip(min + "–" + max + " пикселей"); // Задаём высоту, отступ до следующей настройки и подсказку диапазона.
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
        var scale = Scl.scl(1), width = Core.scene.getWidth() / scale, height = Core.scene.getHeight() / scale; // Используем всю ширину и высоту сцены без процентного ограничения.
        dialog.setBounds(0, 0, Core.scene.getWidth(), Core.scene.getHeight()); // Закрепляем окно у начала сцены, чтобы после уменьшения экрана оно не сохраняло прежнее смещение.
        var controlsWidth = Math.min(360, Math.max(328, width * 0.4), width - 104); //#marker# Ширина настроек: обычно 328–360 UI-единиц, чтобы в обоих полях помещался #000000; на узком экране оставляем хотя бы 104 для рисунка и зазора.
        var pictureWidth = width - controlsWidth - 16; // Всю оставшуюся ширину отдаём рисунку, оставляя зазор перед настройками.
        dialog.cont.clearChildren(); // Убираем прежние таблицы перед сборкой интерфейса.
        var body = new Table(), controls = new Table(), settings = new Table(); // Отделяем прокручиваемые настройки от закреплённых заголовка и кнопки «Назад».
        controls.top().left().margin(12); // Выравниваем настройки сверху и оставляем внутренний отступ только в правой колонке.
        dialog.title.setAlignment(Align.left); // Выравниваем стандартный заголовок окна по левому краю правой колонки.
        controls.add(dialog.title).growX().padBottom(16).name("buildwheel-palette-title"); // Располагаем название только над настройками; над рисунком общей шапки нет.
        controls.row(); // Поля начинаются ниже заголовка правой колонки.
        settings.top().left(); // Настройки начинаются у верхнего края своей прокручиваемой области.
        addNumberField(settings, "Размер гексагона", "size", 8, 80, radius); // Добавляем поле радиуса, как в исходной HTML-палитре.
        addNumberField(settings, "Отступ", "gap", 0, 30, gap); // Добавляем единый отступ между соседними гранями.
        settings.check("Показывать HEX", showLabels, value => { // Создаём переключатель подписей с сохранённым состоянием.
            showLabels = value; // Меняем только разрешение рисовать готовый кэш подписей.
            Core.settings.put(prefix + "labels", value); // Сохраняем состояние переключателя в памяти настроек игры.
            onChanged(); // Сообщаем основному меню, что настройки потребуется записать.
        }).growX().height(44).left().name("buildwheel-palette-labels"); // Даём переключателю обычную высоту и постоянное имя.
        settings.row(); // Под переключателем располагаем строку выбранного цвета.
        settings.add(createCopiedButton()).growX().height(44).padTop(12); // Резервируем одинаковую высоту под инструкцию и кнопку, чтобы рамка не сдвигала текст.
        settings.row(); // Ниже добавляем отдельную функцию изменения цвета.
        settings.add(createHsvEditor(controlsWidth - 24)).growX().padTop(20); // Выделяем редактору внутреннюю ширину правой колонки.
        var settingsPane = new ScrollPane(settings, Styles.defaultPane); // Новые функции остаются доступны при малой высоте окна.
        settingsPane.name = "buildwheel-palette-settings"; // Постоянное имя прокрутки настроек.
        settingsPane.setScrollingDisabled(true, false); // Прокручиваем настройки только по вертикали.
        settingsPane.setFadeScrollBars(false); // Оставляем нужную полосу прокрутки видимой.
        settingsPane.setOverscroll(false, false); // Не растягиваем настройки за границы содержимого.
        settingsPane.hovered(() => Core.scene.setScrollFocus(settingsPane)); // Над правой панелью колёсико мыши прокручивает настройки.
        controls.add(settingsPane).grow().minWidth(0).minHeight(0); // Панель настроек занимает всё место между заголовком и кнопкой возврата.
        controls.row(); // Последняя строка правой колонки всегда остаётся видимой.
        controls.button("Назад", Icon.left, () => hide()).growX().height(54).padTop(8).name("buildwheel-palette-back"); // Закрываем палитру, не заставляя прокручивать настройки до кнопки «Назад».
        imagePane = new ScrollPane(createImage(), Styles.defaultPane); // Разрешаем рассматривать всю палитру, даже если её размер больше экрана.
        imagePane.name = "buildwheel-palette-scroll"; // Отдельное имя помогает проверить границы видимой области рисунка.
        imagePane.setFadeScrollBars(false); // Оставляем нужные полосы прокрутки видимыми.
        imagePane.setOverscroll(false, false); // Не растягиваем рисунок за пределы его краёв при прокрутке.
        imagePane.hovered(() => Core.scene.setScrollFocus(imagePane)); // Над рисунком колёсико снова управляет самой палитрой.
        body.add(imagePane).size(pictureWidth, height); // Задаём область рисунка слева, не уменьшая сами гексагоны.
        body.add(controls).width(controlsWidth).growY().padLeft(16); // Правая колонка занимает всю высоту и отделена от рисунка.
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
        dialog.hide(); // Начинаем закрытие палитры и штатное восстановление фокуса сцены.
    }

    dialog.addListener(extend(ResizeListener, { // Слушаем изменение размеров окна без постоянной покадровой проверки.
        resized: function() { // Сцена сообщает о новой ширине или высоте.
            if (!dialog.isShown()) return; // Скрытое окно перестроится при следующем открытии.
            buildInterface(); // Меняем размеры видимых областей, сохраняя цвета, настройки и кэши подписей.
            Core.app.post(() => { if (dialog.isShown()) Core.scene.setScrollFocus(imagePane); }); // Сохраняем прокрутку за палитрой после перестройки.
        }
    }));
    return {show: show, hide: hide, isShown: () => dialog.isShown()}; // Основному меню достаточно открыть, закрыть или проверить состояние палитры.
};
