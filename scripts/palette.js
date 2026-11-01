// ПАЛИТРА ЦВЕТОВ: ОКНО, ГЕКСАГОНЫ И КОПИРОВАНИЕ HEX
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
                        var luminance = 0.2126 * linearComponent(cell.color.r) + 0.7152 * linearComponent(cell.color.g) + 0.0722 * linearComponent(cell.color.b); // Получаем яркость с учётом чувствительности глаза к каналам RGB.
                        cell.textColor = (luminance + 0.05) / 0.05 >= 1.05 / (luminance + 0.05) ? Color.black : Color.white; // Выбираем чёрный или белый по большему контрасту с фоном.
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

    function copyColor(cell, source, x, y) { // Один обработчик копирует цвет как из гексагона, так и из правой кнопки.
        if (cell == null) return; // До выбора цвета копировать нечего.
        Core.app.setClipboardText("#" + cell.hex); // Передаём выбранный #RRGGBB в системный буфер обмена.
        lastCopied = cell; // Запоминаем цвет для подписи, повторного копирования и перестройки окна.
        refreshCopiedControl(); // Показываем код нужным цветом и включаем кнопку с рамкой.
        if (source != image) { // Существующая плашка принимает координаты рисунка, поэтому переводим в них щелчок по кнопке.
            source.localToStageCoordinates(copyPoint.set(x, y)); // Получаем положение щелчка в сцене.
            image.stageToLocalCoordinates(copyPoint); // Учитываем положение и прокрутку рисунка палитры.
            x = copyPoint.x; y = copyPoint.y; // Передаём плашке координаты в прежнем формате.
        }
        showCopiedToast(x, y); // Показываем прежнюю плашку возле реального места щелчка.
    }

    function createCopiedButton() { // Одинаковая ячейка сначала показывает инструкцию, затем становится кнопкой с серой рамкой.
        copiedButton = extend(Button, new Button.ButtonStyle(), { // Пустой стиль не рисует фон и не меняет цвет вложенной надписи.
            draw: function() { // Сначала рисуем надпись, затем рамку, если цвет уже выбран.
                this.super$draw(); // Выполняем штатное рисование кнопки и её текста.
                if (lastCopied == null) return; // Инструкция отображается без рамки.
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
        copiedButton.name = "buildwheel-palette-copy"; // Постоянное имя кнопки повторного копирования.
        copiedButton.margin(0, 8, 0, 8); // Заранее оставляем место до будущей рамки; при её появлении отступы не меняются.
        copiedLabel = copiedButton.add("").growX().name("buildwheel-palette-copied").get(); // Создаём одну надпись для инструкции и выбранного HEX.
        copiedLabel.setAlignment(Align.left); // Сохраняем одинаковое выравнивание инструкции и кода.
        copiedButton.addListener(extend(ClickListener, KeyCode.mouseLeft, { // Получаем точное место нажатия для прежней плашки «Скопировано».
            clicked: function(event, x, y) { copyColor(lastCopied, copiedButton, x, y); } // Повторно копируем выбранный HEX и показываем подтверждение.
        }));
        refreshCopiedControl(); // Применяем начальную инструкцию либо цвет, выбранный до перестройки окна.
        return copiedButton; // Передаём кнопку правой колонке настроек.
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
        var controlsWidth = Math.min(240, width * 0.4); //#marker# Ширина правой колонки настроек в UI-единицах; здесь можно отдать ей больше места.
        var pictureWidth = width - controlsWidth - 16; // Всю оставшуюся ширину отдаём рисунку, оставляя зазор перед настройками.
        dialog.cont.clearChildren(); // Убираем прежние таблицы перед сборкой интерфейса.
        var body = new Table(), controls = new Table(); // Создаём общую строку и правую колонку настроек.
        controls.top().left().margin(12); // Выравниваем настройки сверху и оставляем внутренний отступ только в правой колонке.
        dialog.title.setAlignment(Align.left); // Выравниваем стандартный заголовок окна по левому краю правой колонки.
        controls.add(dialog.title).growX().padBottom(16).name("buildwheel-palette-title"); // Располагаем название только над настройками; над рисунком общей шапки нет.
        controls.row(); // Поля начинаются ниже заголовка правой колонки.
        addNumberField(controls, "Размер гексагона", "size", 8, 80, radius); // Добавляем поле радиуса, как в исходной HTML-палитре.
        addNumberField(controls, "Отступ", "gap", 0, 30, gap); // Добавляем единый отступ между соседними гранями.
        controls.check("Показывать HEX", showLabels, value => { // Создаём переключатель подписей с сохранённым состоянием.
            showLabels = value; // Меняем только разрешение рисовать готовый кэш подписей.
            Core.settings.put(prefix + "labels", value); // Сохраняем состояние переключателя в памяти настроек игры.
            onChanged(); // Сообщаем основному меню, что настройки потребуется записать.
        }).growX().height(44).left().name("buildwheel-palette-labels"); // Даём переключателю обычную высоту и постоянное имя.
        controls.row(); // Под переключателем располагаем строку выбранного цвета.
        controls.add(createCopiedButton()).growX().height(44).padTop(12); // Резервируем одинаковую высоту под инструкцию и кнопку, чтобы рамка не сдвигала текст.
        controls.row(); // Оставшееся место отдаём пустой растягиваемой ячейке.
        controls.add().growY(); // Прижимаем следующую кнопку к нижнему краю правой колонки.
        controls.row(); // Последняя строка колонки предназначена для возврата.
        controls.button("Назад", Icon.left, () => hide()).growX().height(54).name("buildwheel-palette-back"); // Закрываем палитру и возвращаемся к настройкам «колеса выбора» и «манекена».
        imagePane = new ScrollPane(createImage(), Styles.defaultPane); // Разрешаем рассматривать всю палитру, даже если её размер больше экрана.
        imagePane.name = "buildwheel-palette-scroll"; // Отдельное имя помогает проверить границы видимой области рисунка.
        imagePane.setFadeScrollBars(false); // Оставляем нужные полосы прокрутки видимыми.
        imagePane.setOverscroll(false, false); // Не растягиваем рисунок за пределы его краёв при прокрутке.
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
