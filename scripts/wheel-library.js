// ХРАНИЛИЩЕ СОХРАНЁННЫХ КОЛЁС
"use strict"; // Запрещаем присваивания необъявленным переменным.

exports.create = function() { // Загружаем библиотеку один раз при создании меню.
    var settingsKey = "buildwheel.library"; // Храним библиотеку отдельной строкой, не затрагивая настройки действующих колёс.
    var types = [ // Эти четыре типа соответствуют постоянным вкладкам браузера сохранений.
        {id: "visual", title: Core.bundle.get("buildwheel.browser.tab.visual")},
        {id: "blocks", title: Core.bundle.get("buildwheel.browser.tab.blocks")},
        {id: "wheel", title: Core.bundle.get("buildwheel.browser.tab.wheel")},
        {id: "wheels", title: Core.bundle.get("buildwheel.browser.tab.wheels")}
    ];
    var entries = []; // В памяти находятся только обычные данные, без виджетов, текстур и обработчиков кадров.
    var nextId = 1; // Счётчик обеспечивает постоянный номер сохранения независимо от его имени и положения в списке.

    // ПРОВЕРКА ТИПА И КОПИРОВАНИЕ ДАННЫХ
    function validType(type) { // Не допускаем появления случайных типов вкладок в библиотеке.
        for (var i = 0; i < types.length; i++) if (types[i].id === type) return true; // Сравниваем с четырьмя поддерживаемыми типами.
        return false; // Неизвестный тип не принимаем.
    }

    function copyData(data) { // Отделяем сохранённый снимок от изменяемых параметров колеса.
        if (data == null || typeof data !== "object") throw new Error(Core.bundle.get("buildwheel.error.save-object")); // Не сохраняем отсутствующий комплект параметров.
        return JSON.parse(JSON.stringify(data)); // Копируем вложенные массивы и объекты вместе с их значениями.
    }

    function cleanName(name) { // Приводим имя из текстового поля к обычной строке без пробелов по краям.
        return name == null ? "" : String(name).trim(); // Пустое поле остаётся пустым и не превращается в слово null.
    }

    function findIndex(id) { // Ищем запись по её постоянному идентификатору.
        for (var i = 0; i < entries.length; i++) if (entries[i].id === id) return i; // Возвращаем позицию найденного сохранения.
        return -1; // Отсутствие записи обозначаем отрицательной позицией.
    }

    // ЗАГРУЗКА БИБЛИОТЕКИ
    try { // Повреждённая строка настроек не должна препятствовать открытию радиального меню.
        var saved = JSON.parse(String(Core.settings.getString(settingsKey, "{}"))); // Разбираем JSON только при создании хранилища.
        if (saved != null && saved.version === 1 && Array.isArray(saved.entries)) { // Читаем только известный формат библиотеки.
            if (isFinite(saved.nextId) && saved.nextId >= 1 && Math.floor(saved.nextId) === saved.nextId) nextId = Number(saved.nextId); // Восстанавливаем счётчик, если он корректен.
            for (var i = 0; i < saved.entries.length; i++) { // Проверяем записи по отдельности, сохраняя исправные соседние записи.
                var entry = saved.entries[i]; // Берём очередной сохранённый комплект.
                if (entry == null || typeof entry.id !== "string" || entry.id.length === 0 || findIndex(entry.id) >= 0) continue; // Пропускаем записи без уникального идентификатора.
                if (!validType(entry.type) || cleanName(entry.name).length === 0 || entry.data == null || typeof entry.data !== "object") continue; // Отбрасываем неизвестный тип, пустое имя и отсутствующие данные.
                entries.push({id: entry.id, type: entry.type, name: cleanName(entry.name), description: typeof entry.description === "string" ? entry.description : "", data: entry.data}); // Переносим данные; старым записям без описания оставляем пустую строку.
            }
        }
    } catch (error) { // Синтаксическая ошибка JSON означает, что читаемого списка сохранений нет.
        entries = []; // Оставляем пустую библиотеку; другие настройки игры не изменяем.
        nextId = 1; // Начинаем нумерацию новой библиотеки заново.
    }

    // ЗАПИСЬ БИБЛИОТЕКИ
    function save() { // Вызываем запись только после добавления, переименования или удаления сохранения.
        Core.settings.put(settingsKey, JSON.stringify({version: 1, nextId: nextId, entries: entries})); // Версия позволяет в дальнейшем отличить другой формат данных.
        Core.settings.manualSave(); // Сразу записываем пользовательское действие на диск, не ожидая закрытия меню.
    }

    function list(type, query) { // Возвращаем записи выбранной вкладки с учётом строки поиска.
        var result = []; // Создаём отдельный список, чтобы сортировка интерфейса не переставляла внутренние записи.
        var search = cleanName(query).toLowerCase(); // Поиск не зависит от регистра букв и пробелов по краям.
        for (var i = entries.length - 1; i >= 0; i--) { // Сначала показываем новые сохранения.
            var entry = entries[i]; // Данные самих записей не копируем при каждом обновлении поиска.
            if (entry.type === type && entry.name.toLowerCase().indexOf(search) >= 0) result.push(entry); // Оставляем совпавшие тип и имя.
        }
        return result; // Передаём браузеру готовый список.
    }

    // ДОБАВЛЕНИЕ И ИЗМЕНЕНИЕ СОХРАНЕНИЙ
    function add(type, name, data) { // Создаём самостоятельный снимок выбранных параметров.
        name = cleanName(name); // Убираем лишние пробелы перед проверкой имени.
        if (!validType(type) || name.length === 0) throw new Error(Core.bundle.get("buildwheel.error.save-type-name")); // Не записываем неполную карточку.
        var snapshot = copyData(data); // Копирование выполняем до изменения списка, чтобы ошибка не оставила пустую запись.
        var id; // Подбираем свободный постоянный идентификатор.
        do { id = "wheel-" + nextId++; } while (findIndex(id) >= 0); // Счётчик и проверка защищают от повторения номера после повреждения настроек.
        var entry = {id: id, type: type, name: name, description: "", data: snapshot}; // Объединяем подпись, описание, тип и независимый комплект данных.
        entries.push(entry); // Добавляем запись в библиотеку.
        save(); // Сохраняем запись вместе с новым значением счётчика.
        return entry; // Возвращаем созданное сохранение для отображения в браузере.
    }

    function rename(id, name, description) { // Меняем подпись и при необходимости описание существующей карточки.
        var index = findIndex(id); // Находим сохранение независимо от его прежнего имени.
        name = cleanName(name); // Проверяем уже очищенную строку из поля ввода.
        if (index < 0 || name.length === 0) return false; // Не переименовываем отсутствующую запись и не оставляем карточку без имени.
        description = description === undefined ? entries[index].description : String(description == null ? "" : description); // Необязательный аргумент позволяет сохранить прежнее описание.
        if (entries[index].name === name && entries[index].description === description) return false; // Без фактического изменения диск не трогаем.
        entries[index].name = name; // Содержимое и идентификатор сохранения остаются прежними.
        entries[index].description = description; // Сохраняем текст описания с его переносами строк.
        save(); // Записываем новое имя на диск.
        return true; // Сообщаем интерфейсу, что список изменился.
    }

    function remove(id) { // Удаляем одно сохранение по постоянному идентификатору.
        var index = findIndex(id); // Определяем позицию записи во внутреннем списке.
        if (index < 0) return false; // Повторное удаление не создаёт лишней записи на диск.
        entries.splice(index, 1); // Убираем только найденную карточку.
        save(); // Сохраняем оставшуюся библиотеку.
        return true; // Сообщаем интерфейсу об успешном удалении.
    }

    function get(id) { // Получаем сохранение перед применением или переименованием.
        var index = findIndex(id); // Проверяем, существует ли запись на момент действия.
        return index < 0 ? null : entries[index]; // Отсутствующая запись возвращается как null.
    }

    // ОТДЕЛЬНОЕ КОЛЕСО В СОХРАНЁННОМ НАБОРЕ
    function memberOf(id, number) { // Не допускаем изменения чужой записи или сдвига десяти позиций набора.
        var entry = get(id);
        return entry != null && entry.type === "wheels" && entry.data != null && Array.isArray(entry.data.wheels) && entry.data.wheels.length === 10 && number >= 0 && number < 10 && number === Math.floor(number) ? entry : null;
    }

    function renameWheel(id, number, name, description) { // Имя и описание необязательны и не создают подпись на карточке колеса.
        var entry = memberOf(id, number); if (entry == null || entry.data.wheels[number] == null) return false;
        var wheel = entry.data.wheels[number]; name = cleanName(name); description = String(description || "");
        if ((wheel.name || "") === name && (wheel.description || "") === description) return false; // Без фактического изменения диск не трогаем.
        if (name.length > 0) wheel.name = name; else delete wheel.name; // Пустые метаданные не занимают место в сохранении.
        if (description.length > 0) wheel.description = description; else delete wheel.description;
        save(); return true;
    }

    function replaceWheel(id, number, data) { // Очищение заменяет только один снимок; остальные девять не копируются и не переставляются.
        var entry = memberOf(id, number); if (entry == null) return false;
        var replacement = copyData(data); entry.data.wheels[number] = replacement; // Отделяем новый снимок от любых объектов редактора.
        save(); return true;
    }

    return {types: types, list: list, add: add, rename: rename, remove: remove, get: get, renameWheel: renameWheel, replaceWheel: replaceWheel}; // Предоставляем меню операции с данными, не создавая сам интерфейс.
};
