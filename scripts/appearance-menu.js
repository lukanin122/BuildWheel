// НАСТРОЙКИ ВИДА «КОЛЕСА ВЫБОРА» И «МАНЕКЕНА»
"use strict"; // Запрещаем присваивания переменным, которые не были объявлены.

exports.create = function(wheelView, onChanged) { // Создаём редактор; onChanged сообщает меню о применённой настройке.
    var appearance = wheelView.appearance; // Получаем ссылку на общие параметры «колеса выбора» и «манекена».
    var settingsPrefix = "buildwheel.appearance."; // Начало имён сохранённых настроек внешнего вида.

    // СОСТАВ ГРУПП НАСТРОЕК
    var groups = [ // id — имя группы в коде; title — заголовок; metric — размер; color и alpha — имена параметров appearance.
        {id: "background", title: "Основной круг", metric: {key: "diameter", label: "Диаметр", type: "number", min: 1, max: 4096, integer: true}, color: "backgroundColor", alpha: "backgroundAlpha"}, // Размер, цвет и прозрачность основного круга.
        {id: "outer", title: "Внешняя окружность", metric: {key: "outerWidth", label: "Толщина", type: "number", min: 0, max: 256}, color: "outerColor", alpha: "outerAlpha"}, // Толщина, цвет и прозрачность внешней обводки.
        {id: "dividers", title: "Разделительные полосы", metric: {key: "lineWidth", label: "Толщина", type: "number", min: 0, max: 256}, color: "lineColor", alpha: "lineAlpha"}, // Параметры линий между секторами.
        {id: "center", title: "Внутренний круг", metric: {key: "innerRadiusRatio", label: "Доля", type: "ratio", min: 0, max: 1}, color: "centerColor", alpha: "centerAlpha"}, // Доля внутреннего радиуса, цвет и прозрачность центрального круга.
        {id: "inner", title: "Внутренняя окружность", metric: {key: "innerLineWidth", label: "Толщина", type: "number", min: 0, max: 256}, color: "innerLineColor", alpha: "innerLineAlpha"}, // Параметры обводки внутреннего круга.
        {id: "highlight", title: "Подсветка сектора", color: "highlightColor", alpha: "highlightAlpha"} // Цвет и прозрачность наведения (поле размера здесь не требуется).
    ];
    var fields = []; // Общий список описаний всех полей для загрузки сохранённых значений.
    for (var g = 0; g < groups.length; g++) { // По очереди готовим каждую группу.
        var group = groups[g]; // Берём описание текущей группы из массива.
        group.fields = []; // Отдельный список её параметров (используется при сбросе группы).
        if (group.metric != null) group.fields.push(group.metric); // Добавляем размер, если он предусмотрен у этой группы.
        group.colorField = {key: group.color, label: "Цвет", type: "color"}; // Описываем текстовое поле HEX.
        group.alphaField = {key: group.alpha, label: "Прозр.", type: "alpha", min: 0, max: 1}; // Описываем слайдер прозрачности.
        group.fields.push(group.colorField, group.alphaField); // Включаем цвет и прозрачность в групповой сброс.
        for (var f = 0; f < group.fields.length; f++) fields.push(group.fields[f]); // Собираем параметры всех групп в общий список.
    }

    // ПОДГОТОВКА ЗНАЧЕНИЙ ДЛЯ ПОЛЕЙ
    function colorText(color) { // Преобразуем объект Color в текст для HEX-поля и сохранения.
        return "#" + String(color.toString()).substring(0, 6).toUpperCase(); // Берём шесть RGB-цифр, переводим буквы в верхний регистр и добавляем # (alpha задаётся отдельно).
    }

    function numberText(value) { // Подготавливаем число для строки ввода.
        return String(Math.round(value * 1000) / 1000); // Округляем до трёх знаков после точки и превращаем в текст (скрываем погрешность Java Float).
    }

    // ПРОВЕРКА ЧИСЛА И HEX
    function validNumber(field, value) { // Проверяем значение по ограничениям из описания поля.
        return isFinite(value) && value >= field.min && value <= field.max // Исключаем NaN, бесконечность и выход за допустимые границы.
            && (!field.integer || value == Math.floor(value)); // Для диаметра дополнительно требуем целое число.
    }

    function parseNumber(field, text) { // Разбираем введённый текст; NaN означает, что его пока нельзя применять.
        text = String(text); // Получаем строку JavaScript, независимо от типа переданного текста.
        if (text.length == 0) return NaN; // Пустое поле считаем незавершённым вводом, а не нулём.
        var dot = -1; // Запоминаем положение десятичной точки (-1 — точки пока нет).
        for (var i = 0; i < text.length; i++) { // Проверяем каждый символ.
            var character = text.charAt(i); // Читаем символ с текущим номером.
            if (character >= "0" && character <= "9") continue; // Цифра допустима; переходим к следующему символу.
            if (!field.integer && character == "." && dot == -1 && i > 0 && i < text.length - 1) dot = i; // Разрешаем одну точку между цифрами только у дробного поля.
            else return NaN; // Буква, знак, лишняя точка или точка без цифр делают ввод недопустимым.
        }
        if (dot != -1 && text.length - dot - 1 > 3) return NaN; // Разрешаем не больше трёх цифр после точки.
        var value = Number(text); // Превращаем проверенный текст в число JavaScript.
        return validNumber(field, value) ? value : NaN; // Возвращаем число, только если оно проходит ограничения поля.
    }

    function validColor(text) { // Проверяем полный цвет вида #RRGGBB.
        text = String(text).toLowerCase(); // Приводим буквы к одному регистру для проверки.
        if (text.length != 7 || text.charAt(0) != "#") return false; // Требуем # и ровно шесть цифр цвета.
        for (var i = 1; i < text.length; i++) { // Проверяем символы после #.
            if ("0123456789abcdef".indexOf(text.charAt(i)) == -1) return false; // Разрешаем только шестнадцатеричные цифры.
        }
        return true; // Все символы корректны: цвет можно применить к «колесу выбора» и «манекену».
    }

    // ЗАГРУЗКА СОХРАНЁННОГО ВНЕШНЕГО ВИДА
    for (var i = 0; i < fields.length; i++) { // Читаем настройки до создания «манекена».
        var field = fields[i]; // Берём описание очередного параметра.
        try { // Обрабатываем неверный тип сохранённого значения без срыва открытия меню.
            if (field.type == "color") { // Цвета хранятся как строки HEX.
                var savedColor = String(Core.settings.getString(settingsPrefix + field.key, colorText(appearance[field.key]))); // Читаем цвет; при отсутствии настройки используем исходный.
                if (validColor(savedColor)) appearance[field.key].set(Color.valueOf(savedColor)); // Разбираем корректный HEX и меняем существующий объект Color.
            } else {
                var savedNumber = Number(Core.settings.getFloat(settingsPrefix + field.key, appearance[field.key])); // Читаем Java Float и получаем число JavaScript.
                if (validNumber(field, savedNumber)) appearance[field.key] = savedNumber; // Применяем сохранённое число, если оно допустимо.
            }
        } catch (error) { // При ошибке чтения сохраняем исходное значение appearance.
        }
    }

    // СОХРАНЕНИЕ И ПРИМЕНЕНИЕ ПАРАМЕТРА
    function saveField(field) { // Меняем настройку в памяти Core.settings; запись на диск выполняет меню при закрытии.
        var value = appearance[field.key]; // Получаем текущее значение параметра общего внешнего вида.
        var key = settingsPrefix + field.key; // Собираем постоянное имя настройки, например buildwheel.appearance.diameter.
        if (field.type == "color") Core.settings.put(key, colorText(value)); // Сохраняем цвет строкой #RRGGBB.
        else Core.settings.put(key, new java.lang.Float(String(value))); // Сохраняем число как Java Float (Settings не записывает Double от обычного числа JS).
    }

    function applyNumber(field, value) { // Применяем число, введённое в поле или выбранное слайдером.
        if (!validNumber(field, value) || appearance[field.key] == value) return; // Игнорируем недопустимый ввод и неизменившееся значение.
        appearance[field.key] = value; // Обновляем общий параметр «колеса выбора» и «манекена».
        saveField(field); // Передаём значение в Core.settings.
        onChanged(field.key == "diameter"); // Сообщаем меню об изменении (true дополнительно требует пересчёта размеров).
    }

    function addTooltip(element, text) { // Добавляем элементу всплывающую подсказку.
        element.addListener(new Tooltip(table => table.add(text))); // Tooltip показывает переданный текст при наведении мыши.
    }

    // СОЗДАНИЕ ПОЛЯ С ПОДПИСЬЮ
    function buildControl(field, width, synchronize) { // Создаём одно поле; synchronize собирает функции обновления полей после сброса.
        var block = new Table(); // Объединяем подпись и её поле в маленькую таблицу.
        block.top(); // Выравниваем содержимое по верхнему краю.
        var label = block.add(field.label).width(width).height(20).left().get(); // Добавляем подпись заданной ширины и сохраняем ссылку на Label.
        block.row(); // Поле располагаем на следующей строке, под подписью.
        var control; // Ссылка на создаваемый TextField или Slider.
        var sync; // Функция, которая позднее покажет в поле текущее значение appearance.
        if (field.type == "number") { // Диаметр и толщины задаются вводом числа.
            control = new TextField(numberText(appearance[field.key])); // Заполняем поле текущим размером или толщиной.
            control.setFilter(field.integer ? TextField.TextFieldFilter.digitsOnly : TextField.TextFieldFilter.floatsOnly); // Ограничиваем ввод целыми или дробными числами.
            control.setMaxLength(10); // Разрешаем не больше десяти символов.
            control.setValidator(text => !isNaN(parseNumber(field, text))); // Сообщаем TextField, допустим ли текущий текст (неверное значение не применяется).
            control.setProgrammaticChangeEvents(false); // setText из кода не должен повторно запускать обработчик пользовательского ввода.
            control.changed(() => applyNumber(field, parseNumber(field, control.getText()))); // При вводе разбираем текст и применяем допустимое число.
            addTooltip(control, "От " + field.min + " до " + field.max + (field.integer ? "; целое число" : "; можно дробное число с точкой")); // Показываем диапазон и разрешённый формат числа.
            sync = () => control.setText(numberText(appearance[field.key])); // Подготавливаем обновление текста после сброса этой группы.
        } else if (field.type == "color") { // Цвет задаётся строкой HEX.
            control = new TextField(colorText(appearance[field.key])); // Показываем текущий цвет с начальным #.
            control.setMaxLength(7); // Оставляем место ровно для # и шести цифр RGB.
            control.setValidator(text => validColor(text)); // Проверяем завершённость и правильность HEX-кода.
            control.setProgrammaticChangeEvents(false); // Обновление поля при сбросе не считается новым пользовательским вводом.
            control.changed(() => { // Реагируем на изменение текста пользователем.
                var text = String(control.getText()); // Получаем введённую строку.
                if (!validColor(text)) return; // До завершения правильного HEX сохраняем прежний цвет «колеса выбора» и «манекена».
                appearance[field.key].set(Color.valueOf(text)); // Разбираем HEX и меняем существующий Color (ссылки на него остаются действительными).
                saveField(field); // Сохраняем принятый цвет в памяти настроек игры.
                onChanged(false); // Сообщаем меню об изменении (пересчитывать диаметр не требуется).
            });
            addTooltip(control, "Цвет в формате #RRGGBB, например #7D4DFF"); // Подсказываем нужную запись цвета.
            sync = () => control.setText(colorText(appearance[field.key])); // Подготавливаем показ текущего цвета после сброса.
        } else { // Доля внутреннего радиуса и прозрачность задаются слайдерами.
            control = new Slider(0, 1, 0.01, false); // Создаём горизонтальный слайдер от 0 до 1 с шагом 0.01.
            control.setValue(appearance[field.key], false); // Устанавливаем исходное значение без события изменения.
            var updateLabel = () => label.setText(field.type == "ratio" // Выбираем текст подписи по назначению слайдера.
                ? "Доля: " + Math.round(control.getValue() * 100) + "%" // Долю радиуса показываем в процентах.
                : "Прозр.: " + Number(control.getValue()).toFixed(2)); // Прозрачность показываем числом с двумя знаками после точки.
            control.moved(value => { // Реагируем на изменение положения бегунка.
                applyNumber(field, Number(value)); // Применяем новое значение к общему внешнему виду обоих колёс.
                updateLabel(); // Показываем новое число рядом с названием слайдера.
            });
            addTooltip(control, field.type == "ratio" ? "Доля внутреннего радиуса: 0–100%" // Для доли поясняем диапазон процентов.
                : "Прозрачность: 0 — невидимо, 1 — полностью непрозрачно"); // Для прозрачности поясняем смысл крайних значений.
            sync = () => { // Подготавливаем обновление слайдера после сброса группы.
                control.setValue(appearance[field.key], false); // Переставляем бегунок без повторного применения настройки.
                updateLabel(); // Приводим подпись в соответствие со значением бегунка.
            };
            updateLabel(); // Показываем текущее значение сразу при создании поля.
        }
        control.name = "buildwheel-appearance-" + field.key; // Задаём служебное имя поля для поиска в сцене и проверок.
        block.add(control).width(width).height(44); // Задаём ширину типа поля и высоту 44 (стандартный бегунок помещается целиком).
        synchronize.push(sync); // Регистрируем обновление этого поля в списке сброса группы.
        return block; // Возвращаем таблицу с подписью и полем для размещения в группе настроек.
    }

    // СОЗДАНИЕ ГРУППЫ И КНОПКИ СБРОСА
    function buildGroup(group, widths, wide) { // Собираем одну группу: заголовок, поля и refresh.
        var table = new Table(); // Создаём отдельную таблицу группы.
        table.left(); // Выравниваем группу по левому краю.
        table.add(group.title).colspan(wide ? 4 : 2).left().padBottom(4); // Заголовок занимает все колонки; под ним оставляем отступ.
        table.row(); // Поля начинаются под заголовком.
        var synchronize = []; // Список функций для обновления полей именно этой группы.
        var metric = group.metric == null ? new Table() : buildControl(group.metric, widths.metric, synchronize); // Создаём размер или оставляем пустое место, если размера нет.
        var color = buildControl(group.colorField, widths.color, synchronize); // Создаём HEX-поле цвета.
        var alpha = buildControl(group.alphaField, widths.alpha, synchronize); // Создаём слайдер прозрачности.
        var resetBlock = new Table(); // Создаём ячейку для кнопки сброса.
        resetBlock.add("").height(20); // Оставляем над кнопкой место высотой с подпись соседних полей.
        resetBlock.row(); // Располагаем кнопку на уровне полей ввода.
        var reset = resetBlock.button(Icon.refresh, Styles.cleari, () => { // Добавляем refresh и задаём его действие.
            var keys = []; // Собираем имена параметров, которые относятся к этой группе.
            for (var i = 0; i < group.fields.length; i++) keys.push(group.fields[i].key); // Не включаем параметры соседних групп.
            wheelView.resetAppearance(keys); // Возвращаем выбранные параметры к исходному виду «колеса выбора» и «манекена».
            for (var i = 0; i < group.fields.length; i++) saveField(group.fields[i]); // Сохраняем значения, полученные после сброса.
            for (var i = 0; i < synchronize.length; i++) synchronize[i](); // Показываем эти значения в полях и подписях слайдеров.
            onChanged(group.metric != null && group.metric.key == "diameter"); // Помечаем настройки изменёнными; для диаметра также обновляем размеры обоих колёс.
        }).size(widths.reset, 44).name("buildwheel-appearance-reset-" + group.id).get(); // Задаём размер, служебное имя и получаем объект кнопки.
        reset.resizeImage(24); // Задаём размер значка refresh внутри кнопки.
        addTooltip(reset, "Сбросить по умолчанию"); // Показываем действие кнопки при наведении.

        table.add(metric).width(widths.metric).padRight(6).top(); // Слева ставим размер; справа от него оставляем зазор.
        table.add(color).width(widths.color).top(); // Следом размещаем HEX-поле.
        if (wide) { // На широкой панели все четыре типа элементов помещаются в одном ряду.
            table.add(alpha).width(widths.alpha).padLeft(6).top(); // Добавляем слайдер прозрачности после цвета.
            table.add(resetBlock).width(widths.reset).padLeft(6).top(); // Завершаем ряд кнопкой refresh.
        } else { // На узкой панели прозрачность и refresh располагаются ниже.
            table.row(); // Переходим к следующему ряду группы.
            var secondRow = new Table(); // Отдельная таблица позволяет задать нижнему ряду собственные ширины колонок.
            secondRow.add(alpha).width(widths.alpha).padRight(6).top(); // Слайдер занимает основную ширину нижнего ряда.
            secondRow.add(resetBlock).width(widths.reset).top(); // Кнопка refresh находится справа от слайдера.
            table.add(secondRow).colspan(2).left().padTop(4); // Нижний ряд занимает обе колонки верхнего ряда.
        }
        return table; // Возвращаем готовую группу для размещения под «манекеном».
    }

    // РАСЧЁТ ШИРИН И СБОРКА ВСЕЙ ФОРМЫ
    function build(width) { // Вызывается меню при построении интерфейса; width задана в UI-единицах.
        var wide = width >= 450; // Выбираем один или два ряда элементов в каждой группе по доступной ширине.
        var widths = { // Общие ширины для всех групп: одинаковые типы полей получают одинаковое место.
            metric: wide ? 108 : (width - 6) / 2, // Ширина поля размера или слайдера доли внутреннего радиуса.
            color: wide ? 132 : (width - 6) / 2, // Ширина HEX-поля, включая видимый # и все шесть цифр.
            alpha: wide ? width - 108 - 132 - 40 - 18 : width - 40 - 6, // Остаток ряда для прозрачности после вычета остальных полей и зазоров.
            reset: 40 // Единая ширина всех кнопок refresh.
        };
        var table = new Table(); // Создаём общую таблицу настроек внешнего вида.
        table.name = "buildwheel-appearance-settings"; // Задаём служебное имя всей формы.
        table.left(); // Прижимаем группы к левому краю формы.
        for (var i = 0; i < groups.length; i++) { // Добавляем группы в порядке их описания.
            table.add(buildGroup(groups[i], widths, wide)).width(width).left().padBottom(16); // Размещаем группу и оставляем под ней отступ от следующей секции.
            table.row(); // Каждая группа начинается с нового ряда общей формы.
        }
        return table; // Передаём меню форму для размещения под «манекеном».
    }

    return {build: build}; // Открываем меню доступ к сборке формы; загрузка и обработчики остаются внутри этого редактора.
};
