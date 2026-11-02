// НАСТРОЙКИ ВИДА «КОЛЕСА ВЫБОРА» И «МАНЕКЕНА»
"use strict"; // Запрещаем присваивания переменным, которые не были объявлены.

exports.create = function(wheelView, onChanged) { // Создаём редактор; onChanged сообщает меню о применённой настройке.
    var editedWheel = 1; // Номер комплекта, который сейчас редактирует форма.
    var appearance = wheelView.getVisual(editedWheel).appearance; // «Колесо выбора» и «манекен» этого номера используют те же объекты параметров и цветов.
    var settingsPrefix = "buildwheel.visual."; // У каждого номера собственные ключи вида buildwheel.visual.1.appearance.diameter.
    var legacyPrefix = "buildwheel.appearance."; // Старые общие параметры служат исходным видом для ещё не перенесённых номеров.
    var synchronizeGroups = []; // Функции переключения уже созданных полей; при смене номера форму не пересоздаём.
    var needsSave = false; // Сообщаем меню, что впервые созданные индивидуальные настройки нужно записать на диск.

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

    // ОДНОКРАТНАЯ ЗАГРУЗКА И ПЕРЕНОС ПРЕЖНЕГО ОБЩЕГО ВИДА
    for (var number = 0; number < wheelView.wheelCount; number++) { // Все десять небольших комплектов читаются только при создании редактора, а не при открытии колёс.
        var visual = wheelView.getVisual(number), savedAppearance = visual.appearance; // Заполняем существующие объекты: ссылки рисования на них сохраняются.
        for (var i = 0; i < fields.length; i++) { // Читаем настройки до создания «манекена».
            var field = fields[i], key = fieldKey(number, field); // Получаем отдельный ключ параметра этого номера.
            var hasIndividual = Core.settings.has(key); // Индивидуальный параметр всегда имеет приоритет перед старым общим.
            var sourceKey = hasIndividual ? key : legacyPrefix + field.key; // При первом переходе переносим прежний визуал на каждый номер.
            try { // Обрабатываем неверный тип сохранённого значения без срыва открытия меню.
                if (field.type == "color") { // Цвета хранятся как строки HEX.
                    var savedColor = String(Core.settings.getString(sourceKey, colorText(savedAppearance[field.key]))); // При отсутствии старого значения оставляем заводской цвет.
                    if (validColor(savedColor)) savedAppearance[field.key].set(Color.valueOf(savedColor)); // Меняем собственный Color этого номера, не затрагивая другие комплекты.
                } else {
                    var savedNumber = Number(Core.settings.getFloat(sourceKey, savedAppearance[field.key])); // Читаем число с заводским значением по умолчанию.
                    if (validNumber(field, savedNumber)) savedAppearance[field.key] = savedNumber; // Применяем только число в прежних допустимых пределах.
                }
            } catch (error) { // При ошибке чтения сохраняем исходное значение appearance.
            }
            if (!hasIndividual) { // Материализуем перенос один раз; дальнейшие изменения старых общих ключей на этот номер уже не влияют.
                saveField(field, number); // Сохраняем полученное значение в памяти Core.settings по новому адресу.
                needsSave = true; // Закрытие меню или приложения запишет перенесённые значения вместе с другими настройками.
            }
        }
        var countKey = settingsPrefix + number + ".sectorCount"; // Количество секторов хранится рядом с appearance того же комплекта.
        try { // Проверяем число заранее, чтобы повреждённые настройки не создавали чрезмерно длинные циклы рисования.
            var count = Number(Core.settings.getInt(countKey, wheelView.defaultSectorCount)); // Читаем сохранённый Java Integer; дробный тип будет отклонён без округления.
            if (isFinite(count) && count >= 1 && count <= 128 && count == Math.floor(count)) visual.sectorCount = count; // Принимаем целое число 1–128; отдельного поля изменения числа секторов в интерфейсе пока нет.
        } catch (error) { // При неверном типе сохраняем исходные восемь секторов.
        }
        if (!Core.settings.has(countKey)) { // Впервые записываем число секторов даже у колеса без пользовательских правок.
            Core.settings.put(countKey, new java.lang.Integer(String(visual.sectorCount))); // Java Integer сохраняется штатным Settings как целое число.
            needsSave = true; // Отмечаем необходимость записи нового комплекта на диск.
        }
    }

    // СОХРАНЕНИЕ И ПРИМЕНЕНИЕ ПАРАМЕТРА
    function fieldKey(number, field) { // Собираем адрес одного параметра внутри комплекта указанного номера.
        return settingsPrefix + number + ".appearance." + field.key; // Ключи разных номеров не пересекаются; старые общие ключи остаются нетронутыми.
    }

    function saveField(field, number) { // Меняем настройку в памяти Core.settings; запись на диск выполняет меню при закрытии.
        if (number == null) number = editedWheel; // Обычный ввод сохраняет редактируемое колесо; перенос передаёт номер явно.
        var value = wheelView.getVisual(number).appearance[field.key]; // Читаем параметр именно сохраняемого комплекта.
        var key = fieldKey(number, field); // Используем индивидуальный адрес параметра этого колеса.
        if (field.type == "color") Core.settings.put(key, colorText(value)); // Сохраняем цвет строкой #RRGGBB.
        else Core.settings.put(key, new java.lang.Float(String(value))); // Сохраняем число как Java Float (Settings не записывает Double от обычного числа JS).
    }

    function applyNumber(field, value) { // Применяем число, введённое в поле или выбранное слайдером.
        if (!validNumber(field, value) || appearance[field.key] == value) return; // Игнорируем недопустимый ввод и неизменившееся значение.
        appearance[field.key] = value; // Обновляем параметр «колеса выбора» и «манекена» только редактируемого номера.
        saveField(field); // Передаём значение в Core.settings.
        onChanged(field.key == "diameter"); // Сообщаем меню об изменении (true дополнительно требует пересчёта размеров).
    }

    function addTooltip(element, text) { // Добавляем элементу всплывающую подсказку.
        Vars.ui.addDescTooltip(element, text); // Штатная подсказка настроек Mindustry: полупрозрачный фон, серый текст, начало под левым краем элемента.
        var container = element.getListeners().peek().getContainer(); // Метод игры добавляет свой Tooltip последним слушателем элемента.
        var cell = container.getCells().first(), label = cell.get(); // Получаем штатную надпись, сохраняя её оформление.
        var available = Math.max(1, Core.scene.getWidth() - container.getMarginLeft() - container.getMarginRight() - Scl.scl(8)); // Не разрешаем длинному описанию стать шире экрана.
        if (label.getPrefWidth() > available) { // Ограничиваем только те описания, которым действительно не хватает места.
            cell.width(available); label.setWrap(true); // Задаём ширину и включаем перенос непосредственно у Label, сохраняя размер шрифта.
        }
        container.update(() => container.keepInStage()); // Только показанная подсказка сдвигается у края экрана; обычная остаётся под началом элемента.
    }

    // ОКРАСКА ПОДЧЁРКИВАНИЙ И СЛАЙДЕРОВ ГРУППЫ
    function coloredUnderline(drawable, visuals) { // Оборачиваем штатное подчёркивание, сохраняя его рисунок, размеры и отступы.
        if (drawable == null) return null; // Не создаём фон для состояния, у которого его изначально нет.
        return extend(BaseDrawable, drawable, { // Конструктор BaseDrawable копирует размеры исходного Drawable для правильного размещения текста.
            draw: function(x, y, width, height) { // Игра вызывает отрисовку подчёркивания в обычных границах поля.
                var previous = Draw.getColor(); // Читаем цвет, с которым TextField собирался рисовать свой фон.
                var r = previous.r, g = previous.g, b = previous.b, a = previous.a; // Сохраняем компоненты отдельно: Draw.color изменяет тот же объект Color.
                var color = visuals.color; // Ссылка обновляется при смене номера; сам Drawable и его стиль остаются прежними.
                Draw.color(r * color.r, g * color.g, b * color.b, a); // Окрашиваем подчёркивание цветом группы, сохраняя прозрачность интерфейса.
                try { // Возвращаем цвет рисования даже при ошибке внутри штатного Drawable.
                    drawable.draw(x, y, width, height); // Рисуем прежнее подчёркивание; новые текстуры не создаются.
                } finally {
                    Draw.color(r, g, b, a); // Восстанавливаем цвет для текста, курсора и следующих элементов интерфейса.
                }
            }
        });
    }

    function refreshSliders(visuals) { // Обновляем окраску слайдеров только той группы, в которой изменился HEX.
        for (var i = 0; i < visuals.sliders.length; i++) visuals.sliders[i](); // Вызываем сохранённую функцию окраски каждого слайдера группы.
    }

    // СОЗДАНИЕ ПОЛЯ С ПОДПИСЬЮ
    function buildControl(field, width, synchronize, visuals) { // Создаём поле; synchronize обновляет значения, visuals связывает оформление с цветом группы.
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
                refreshSliders(visuals); // Передаём новый цвет дорожкам и бегункам этой группы (подчёркивания уже ссылаются на тот же Color).
                saveField(field); // Сохраняем принятый цвет в памяти настроек игры.
                onChanged(false); // Сообщаем меню об изменении (пересчитывать диаметр не требуется).
            });
            addTooltip(control, "Цвет в формате #RRGGBB, например #7D4DFF"); // Подсказываем нужную запись цвета.
            sync = () => control.setText(colorText(appearance[field.key])); // Подготавливаем показ текущего цвета после сброса.
        } else { // Доля внутреннего радиуса и прозрачность задаются слайдерами.
            control = new Slider(0, 1, 0.01, false); // Создаём горизонтальный слайдер от 0 до 1 с шагом 0.01.
            control.setValue(appearance[field.key], false); // Устанавливаем исходное значение без события изменения.
            var updateColor = () => { // Связываем оформление штатного слайдера с настройками этой группы.
                control.setColor(visuals.color); // Штатный Slider применяет этот цвет и к дорожке, и к бегунку, сохраняя их форму.
                control.color.a = field.type == "alpha" ? 0.5 + 0.5 * appearance[field.key] : 1; // Видимость «Прозр.» меняется от половины стандартной до полной; слайдер «Доля» остаётся обычной видимости.
            };
            visuals.sliders.push(updateColor); // Запоминаем обновление окраски для последующих изменений HEX этой группы.
            var updateLabel = () => label.setText(field.type == "ratio" // Выбираем текст подписи по назначению слайдера.
                ? "Доля: " + Math.round(control.getValue() * 100) + "%" // Долю радиуса показываем в процентах.
                : "Прозр.: " + Number(control.getValue()).toFixed(2)); // Прозрачность показываем числом с двумя знаками после точки.
            control.moved(value => { // Реагируем на изменение положения бегунка.
                applyNumber(field, Number(value)); // Применяем новое значение к общему внешнему виду обоих колёс.
                updateColor(); // Сразу меняем видимость дорожки и бегунка «Прозр.» вслед за его значением.
                updateLabel(); // Показываем новое число рядом с названием слайдера.
            });
            addTooltip(control, field.type == "ratio" ? "Доля внутреннего радиуса: 0–100%" // Для доли поясняем диапазон процентов.
                : "Прозрачность: 0 — невидимо, 1 — полностью непрозрачно"); // Для прозрачности поясняем смысл крайних значений.
            sync = () => { // Подготавливаем обновление слайдера после сброса группы.
                control.setValue(appearance[field.key], false); // Переставляем бегунок без повторного применения настройки.
                updateColor(); // Возвращаем цвет и видимость слайдера к текущим параметрам после сброса.
                updateLabel(); // Приводим подпись в соответствие со значением бегунка.
            };
            updateLabel(); // Показываем текущее значение сразу при создании поля.
            updateColor(); // Применяем цвет и видимость сразу, включая загруженные настройки.
        }
        if (control instanceof TextField) { // Числовые поля и HEX получают окрашенное подчёркивание; текст сохраняет штатный цвет.
            var style = new TextField.TextFieldStyle(control.getStyle()); // Копируем стиль только этого поля, не меняя оформление остальных полей игры.
            style.invalidBackground = control.getStyle().invalidBackground; // Сохраняем обозначение ошибки отдельно: конструктор копии TextFieldStyle его не переносит.
            style.background = coloredUnderline(style.background, visuals); // Окрашиваем подчёркивание в обычном состоянии цветом выбранного номера.
            style.focusedBackground = coloredUnderline(style.focusedBackground, visuals); // Фон фокуса использует ту же переключаемую ссылку на цвет группы.
            control.setStyle(style); // Применяем отдельный стиль (красное подчёркивание ошибочного ввода остаётся штатным).
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
        var visuals = {color: appearance[group.color], sliders: []}; // Общая ссылка на цвет и список обновлений слайдеров только этой группы и этой сборки меню.
        var metric = group.metric == null ? new Table() : buildControl(group.metric, widths.metric, synchronize, visuals); // Создаём размер или оставляем пустое место, если размера нет.
        var color = buildControl(group.colorField, widths.color, synchronize, visuals); // Создаём HEX-поле, управляющее цветом оформления всей группы.
        var alpha = buildControl(group.alphaField, widths.alpha, synchronize, visuals); // Создаём слайдер прозрачности с изменяемой видимостью собственной дорожки и бегунка.
        synchronizeGroups.push(() => { // Запоминаем обновление этой группы при переключении номера колеса в меню.
            visuals.color = appearance[group.color]; // Перепривязываем подчёркивания и слайдеры к цвету другого комплекта, не меняя старые Color.
            for (var i = 0; i < synchronize.length; i++) synchronize[i](); // Обновляем текст, значения слайдеров, их окраску и видимость из выбранного appearance.
        });
        var resetBlock = new Table(); // Создаём ячейку для кнопки сброса.
        resetBlock.add("").height(20); // Оставляем над кнопкой место высотой с подпись соседних полей.
        resetBlock.row(); // Располагаем кнопку на уровне полей ввода.
        var reset = resetBlock.button(Icon.refresh, Styles.cleari, () => { // Добавляем refresh и задаём его действие.
            var keys = []; // Собираем имена параметров, которые относятся к этой группе.
            for (var i = 0; i < group.fields.length; i++) keys.push(group.fields[i].key); // Не включаем параметры соседних групп.
            wheelView.resetAppearance(editedWheel, keys); // Восстанавливаем заводской вид группы только у редактируемого номера.
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

    // ПЕРЕКЛЮЧЕНИЕ НОМЕРА БЕЗ ПЕРЕСОЗДАНИЯ ПОЛЕЙ
    function selectWheel(number) { // Вызывается только при смене редактируемого колеса.
        editedWheel = number; // Следующие изменения и сброс относятся к этому номеру.
        appearance = wheelView.getVisual(number).appearance; // Меняем ссылку на существующий комплект; никакие параметры между номерами не копируются.
        for (var i = 0; i < synchronizeGroups.length; i++) synchronizeGroups[i](); // Показываем новый комплект в тех же полях и стилях формы.
    }

    // НЕЗАВИСИМЫЙ СНИМОК ВИЗУАЛА И ПРИМЕНЕНИЕ СОХРАНЕНИЯ
    function capture(number) { // Преобразуем параметры колеса в обычные данные для библиотеки, без ссылок на Java Color.
        var visual = wheelView.getVisual(number), data = {}; // Читаем собственный комплект указанного номера.
        for (var i = 0; i < fields.length; i++) { // Сохраняем все параметры шести пользовательских групп.
            var field = fields[i], value = visual.appearance[field.key]; // Получаем текущее значение параметра.
            data[field.key] = field.type == "color" ? colorText(value) : Number(value); // Цвет записываем как HEX, числа оставляем числами JSON.
        }
        return {appearance: data, sectorCount: visual.sectorCount}; // Количество секторов остаётся частью того же визуала.
    }

    function validSnapshot(data) { // Полная проверка выполняется до замены хотя бы одного действующего параметра.
        if (data == null || data.appearance == null || typeof data.sectorCount != "number" || !validNumber({min: 1, max: 128, integer: true}, data.sectorCount)) return false; // Отсеиваем неполный визуал и неверное число секторов.
        for (var i = 0; i < fields.length; i++) { // Требуем весь набор параметров, а не частичное повреждённое сохранение.
            var field = fields[i], value = data.appearance[field.key]; // Читаем параметр без изменения рабочего appearance.
            if (field.type == "color" ? typeof value != "string" || !validColor(value) : typeof value != "number" || !validNumber(field, value)) return false; // Используем те же ограничения, что у полей настроек.
        }
        return true; // Все параметры можно применить одним комплектом.
    }

    function applySnapshot(number, data) { // Вызывается браузером после подтверждения и общей проверки сохранения.
        if (!validSnapshot(data)) return false; // Неверные данные не должны частично менять колесо.
        var visual = wheelView.getVisual(number); // Меняем существующий комплект, сохраняя ссылки рисования и подчёркиваний.
        for (var i = 0; i < fields.length; i++) { // Восстанавливаем параметры ровно одного номера.
            var field = fields[i], value = data.appearance[field.key]; // Берём проверенное значение сохранения.
            if (field.type == "color") visual.appearance[field.key].set(Color.valueOf(value)); // Сохраняем сам объект Color этого номера.
            else visual.appearance[field.key] = value; // Числа заменяем непосредственно в appearance.
            saveField(field, number); // Обновляем индивидуальные ключи активных настроек.
        }
        visual.sectorCount = data.sectorCount; // Применяем геометрию из того же визуала.
        Core.settings.put(settingsPrefix + number + ".sectorCount", new java.lang.Integer(String(data.sectorCount))); // Сохраняем число секторов как Java Integer.
        if (number == editedWheel) selectWheel(number); // Открытая форма сразу показывает восстановленные значения.
        onChanged(true); // Меню отмечает изменения и подгоняет «манекен» под актуальный диаметр.
        return true; // Сообщаем об успешном применении без пересоздания самого колеса.
    }

    // РАСЧЁТ ШИРИН И СБОРКА ВСЕЙ ФОРМЫ
    function build(width, number) { // Вызывается меню при построении интерфейса; width задана в UI-единицах, number задаёт редактируемое колесо.
        synchronizeGroups = []; // Освобождаем ссылки на поля прежней сборки при открытии меню или изменении разрешения.
        selectWheel(number == null ? editedWheel : number); // До создания полей выбираем комплект нужного номера без обращения к старой форме.
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

    return {build: build, selectWheel: selectWheel, needsSave: needsSave, capture: capture, validSnapshot: validSnapshot, applySnapshot: applySnapshot}; // Меню переключает данные готовой формы и учитывает однократный перенос настроек при сохранении.
};
