// ХРАНИЛИЩЕ СОХРАНЁННЫХ КОЛЁС
"use strict"; // Запрещаем присваивания необъявленным переменным.

exports.create = function() { // Читаем библиотеку при первом обращении к сохранениям, а не при запуске игры.
    var settingsKey = "buildwheel.library"; // Старую строку Settings используем только для переноса существующих записей.
    var types = [ // Эти четыре типа соответствуют постоянным вкладкам браузера сохранений.
        {id: "visual", title: Core.bundle.get("buildwheel.browser.tab.visual")},
        {id: "blocks", title: Core.bundle.get("buildwheel.browser.tab.blocks")},
        {id: "wheel", title: Core.bundle.get("buildwheel.browser.tab.wheel")},
        {id: "wheels", title: Core.bundle.get("buildwheel.browser.tab.wheels")}
    ];
    var entries = []; // В памяти находятся только обычные данные, без виджетов, текстур и обработчиков кадров.
    var nextId = 1; // Счётчик обеспечивает постоянный номер сохранения независимо от его имени и положения в списке.
    var loaded = false, committedText = null, mainFile = null, backupFile = null, temporaryFile = null; // Последний подтверждённый JSON нужен для резервной копии перед следующей записью.
    var android = OS.isAndroid, files = null, moveOptions = null, androidOs = null, androidErrors = null, decoderFactory = null; // Файловый API выбираем при первом обращении к библиотеке, отдельно от режима управления.
    var charset = java.nio.charset.Charset.forName("UTF-8"); // UTF-8 в отдельном файле не ограничен пределом writeUTF настроек игры.

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

    // ФАЙЛОВЫЙ API НАСТОЛЬНОЙ СИСТЕМЫ И ANDROID
    function prepareStorage() { // Android до API 26 не содержит java.nio.file, а Files.readString появился ещё позднее.
        if (android) {
            androidOs = Packages.android.system.Os; androidErrors = Packages.android.system.OsConstants; // Публичные stat и rename доступны с Android API 21.
            decoderFactory = java.lang.Class.forName("java.nio.charset.Charset").getMethod("newDecoder", []); // Вызываем публичный Charset, не закрытый класс его реализации.
        }
        else { files = java.nio.file.Files; moveOptions = [java.nio.file.StandardCopyOption.ATOMIC_MOVE, java.nio.file.StandardCopyOption.REPLACE_EXISTING]; } // Без атомарной замены отказываемся от записи, сохраняя прежнюю библиотеку.
    }

    function storagePath(file) { // На Android оставляем обычный File, не вызывая отсутствующий File.toPath.
        return android ? file : file.toPath();
    }

    function missing(path) { // Отсутствие файла отличаем от отказа доступа: только первое позволяет создать новую библиотеку.
        if (!android) return files.notExists(path);
        try { androidOs.stat(path.getAbsolutePath()); return false; } catch (error) {
            var nativeError = error.javaException || (error instanceof java.lang.Throwable ? error : null);
            if (nativeError instanceof Packages.android.system.ErrnoException && Number(nativeError.errno) === Number(androidErrors.ENOENT)) return true; // ENOTDIR, EACCES и прочие ошибки не считаем отсутствием сохранений.
            throw error;
        }
    }

    function replace(source, target) { // Оба файла находятся в одном каталоге; копирование с удалением вместо атомарной замены запрещено.
        if (android) androidOs.rename(source.getAbsolutePath(), target.getAbsolutePath()); // Публичный POSIX rename заменяет файл одним действием или сообщает ошибку.
        else files.move(source, target, moveOptions);
    }

    // ПРОВЕРКА ФАЙЛА И ПЕРЕНОС СТАРЫХ СОХРАНЕНИЙ
    function decode(text) { // Не превращаем повреждённую библиотеку в пустую, которую можно случайно записать поверх неё.
        var saved = JSON.parse(text), ids = Object.create(null);
        if (saved != null && Object.prototype.hasOwnProperty.call(saved, "version") && saved.version !== 1) { var unsupported = new Error(Core.bundle.get("buildwheel.error.library-format")); unsupported.unsupportedLibraryVersion = true; throw unsupported; } // Явно указанную неизвестную версию нельзя затирать старой резервной копией, независимо от типа её номера.
        if (saved == null || saved.version !== 1 || !Array.isArray(saved.entries) || !isFinite(saved.nextId) || saved.nextId < 1 || saved.nextId >= 9007199254740991 || Math.floor(saved.nextId) !== saved.nextId) throw new Error(Core.bundle.get("buildwheel.error.library-format"));
        for (var i = 0; i < saved.entries.length; i++) { // Сначала проверяем весь файл, не изменяя действующее состояние хранилища.
            var entry = saved.entries[i];
            if (entry == null || typeof entry.id !== "string" || entry.id.length === 0 || ids[entry.id] || !validType(entry.type) || typeof entry.name !== "string" || cleanName(entry.name).length === 0 || entry.data == null || typeof entry.data !== "object" || (entry.description !== undefined && typeof entry.description !== "string")) throw new Error(Core.bundle.get("buildwheel.error.library-format"));
            ids[entry.id] = true;
            if (entry.description === undefined) entry.description = ""; // Старые записи без описания сохраняют прежнее поведение.
        }
        return saved; // Идентификаторы, имена, описания и снимки не перенумеровываем и не пересобираем.
    }

    function read(path) { // Повреждённые байты UTF-8 должны вызвать восстановление, а не незаметно заменить буквы символом �.
        if (!android) return String(files.readString(path, charset)); // Публичный Files.readString проверяет кодировку, не обращаясь из Rhino к закрытым классам JDK.
        var decoder = decoderFactory.invoke(charset, []).onMalformedInput(java.nio.charset.CodingErrorAction.REPORT).onUnmappableCharacter(java.nio.charset.CodingErrorAction.REPORT); // Одинаково строго проверяем UTF-8 и на Android.
        var buffer = java.lang.reflect.Array.newInstance(java.lang.Character.TYPE, 4096), text = new java.lang.StringBuilder(), count = 0; // Один буфер обслуживает всё чтение файла.
        var stream = new java.io.FileInputStream(path), reader = null;
        try {
            reader = new java.io.InputStreamReader(stream, decoder); // Этот конструктор не требует новых Android API.
            while ((count = reader.read(buffer, 0, buffer.length)) !== -1) text.append(buffer, 0, count); // Читаем порциями без отдельного Java-вызова на каждый символ.
        } finally { if (reader != null) reader.close(); else stream.close(); } // Поток закрываем и при ошибке декодирования или создания reader.
        return String(text.toString()); // Возврат после finally обходит ошибку генерации байткода в используемом Rhino.
    }

    function ensureLoaded() { // Повторные list/get используют память; закрытая библиотека не выполняет файловый ввод.
        if (loaded) return;
        try {
            prepareStorage(); // Настольные классы NIO на Android не загружаются, даже при первом открытии браузера.
            var directory = Core.settings.getDataDirectory().child("buildwheel");
            mainFile = storagePath(directory.child("library.json").file()); backupFile = storagePath(directory.child("library.json.bak").file()); temporaryFile = storagePath(directory.child("library.json.tmp").file());
            var saved = null, text = null, failure = null, present = false;
            var candidates = [mainFile, backupFile]; // Резервная копия используется только при отсутствии или повреждении основного файла.
            for (var i = 0; i < candidates.length && saved == null; i++) {
                if (missing(candidates[i])) continue; // Ошибку доступа не принимаем за отсутствие файла: она должна запретить перезапись пустым списком.
                present = true;
                try { text = read(candidates[i]); saved = decode(text); } catch (error) {
                    var nativeError = error.javaException || (error instanceof java.lang.Throwable ? error : null); // Повреждённую кодировку отличаем от отказа доступа или другой ошибки диска.
                    if (error.unsupportedLibraryVersion || (nativeError != null && !(nativeError instanceof java.nio.charset.CharacterCodingException))) throw error; // Нечитаемый актуальный файл нельзя позднее заменить устаревшей резервной копией.
                    failure = error; // Только повреждённые данные допускают восстановление из предыдущей подтверждённой версии.
                }
            }
            if (saved == null && present) throw failure; // Нечитаемый новый файл не подменяем старым Settings или пустым списком.
            var legacy = saved == null && Core.settings.has(settingsKey);
            if (legacy) { text = String(Core.settings.getString(settingsKey)); saved = decode(text); }
            if (saved != null) { entries = saved.entries; nextId = Number(saved.nextId); }
            committedText = legacy ? null : text;
            if (legacy) save(); // Сначала подтверждаем отдельный файл; при сбое исходная строка Settings остаётся нетронутой.
            if (saved != null && Core.settings.has(settingsKey)) Core.settings.remove(settingsKey); // Убираем только уже перенесённую строку из памяти, не перезаписывая все настройки игры.
            loaded = true;
        } catch (error) {
            entries = []; nextId = 1; committedText = null; // Не оставляем частично загруженные записи доступными для изменения.
            throw new Error(Core.bundle.format("buildwheel.error.library-read", String(error))); // Интерфейс сообщает об ошибке вместо ложного успешного сохранения.
        }
    }

    // АТОМАРНАЯ ЗАПИСЬ И РЕЗЕРВНАЯ КОПИЯ
    function writeConfirmed(path, text) { // Синхронизируем временный файл до того, как он сможет заменить рабочую библиотеку.
        var stream = new java.io.FileOutputStream(android ? path : path.toFile());
        try { stream.write(new java.lang.String(text).getBytes(charset)); stream.getFD().sync(); } finally { stream.close(); }
        if (read(path) !== text) throw new Error(Core.bundle.get("buildwheel.error.library-format")); // Проверяем полный текст до атомарного переименования.
    }

    function save() { // Вызываем запись только после добавления, переименования или удаления сохранения.
        try {
            var text = JSON.stringify({version: 1, nextId: nextId, entries: entries}); // Версия позволяет в дальнейшем отличить другой формат данных.
            if (android) { var parent = mainFile.getParentFile(); if (!parent.mkdirs() && !parent.isDirectory()) throw new java.io.IOException(String(parent)); } // Не продолжаем запись, если каталог создать не удалось.
            else files.createDirectories(mainFile.getParent());
            if (committedText != null) { writeConfirmed(temporaryFile, committedText); replace(temporaryFile, backupFile); } // Сбой здесь не изменяет основной файл и прежнюю библиотеку в памяти.
            writeConfirmed(temporaryFile, text); replace(temporaryFile, mainFile); // После синхронизации заменяем файл одним атомарным действием.
            committedText = text; // Ни одна операция, способная сорвать запись, после подтверждения не выполняется.
        } catch (error) { throw new Error(Core.bundle.format("buildwheel.error.library-write", String(error))); }
    }

    function list(type, query) { // Возвращаем записи выбранной вкладки с учётом строки поиска.
        ensureLoaded();
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
        ensureLoaded();
        name = cleanName(name); // Убираем лишние пробелы перед проверкой имени.
        if (!validType(type) || name.length === 0) throw new Error(Core.bundle.get("buildwheel.error.save-type-name")); // Не записываем неполную карточку.
        var snapshot = copyData(data); // Копирование выполняем до изменения списка, чтобы ошибка не оставила пустую запись.
        var id, previousNextId = nextId; // Подбираем свободный постоянный идентификатор.
        do { // Не допускаем потери точности счётчика и бесконечного поиска уже занятого идентификатора.
            if (nextId >= 9007199254740990) { nextId = previousNextId; throw new Error(Core.bundle.get("buildwheel.error.library-format")); }
            id = "wheel-" + nextId++;
        } while (findIndex(id) >= 0); // Счётчик и проверка защищают от повторения номера после повреждения настроек.
        var entry = {id: id, type: type, name: name, description: "", data: snapshot}; // Объединяем подпись, описание, тип и независимый комплект данных.
        entries.push(entry); // Добавляем запись в библиотеку.
        try { save(); } catch (error) { entries.pop(); nextId = previousNextId; throw error; } // При сбое возвращаем и список, и счётчик к подтверждённому состоянию.
        return entry; // Возвращаем созданное сохранение для отображения в браузере.
    }

    function rename(id, name, description) { // Меняем подпись и при необходимости описание существующей карточки.
        ensureLoaded();
        var index = findIndex(id); // Находим сохранение независимо от его прежнего имени.
        name = cleanName(name); // Проверяем уже очищенную строку из поля ввода.
        if (index < 0 || name.length === 0) return false; // Не переименовываем отсутствующую запись и не оставляем карточку без имени.
        description = description === undefined ? entries[index].description : String(description == null ? "" : description); // Необязательный аргумент позволяет сохранить прежнее описание.
        if (entries[index].name === name && entries[index].description === description) return false; // Без фактического изменения диск не трогаем.
        var previousName = entries[index].name, previousDescription = entries[index].description;
        entries[index].name = name; // Содержимое и идентификатор сохранения остаются прежними.
        entries[index].description = description; // Сохраняем текст описания с его переносами строк.
        try { save(); } catch (error) { entries[index].name = previousName; entries[index].description = previousDescription; throw error; } // Ошибка диска не должна выглядеть успешным переименованием.
        return true; // Сообщаем интерфейсу, что список изменился.
    }

    function remove(id) { // Удаляем одно сохранение по постоянному идентификатору.
        ensureLoaded();
        var index = findIndex(id); // Определяем позицию записи во внутреннем списке.
        if (index < 0) return false; // Повторное удаление не создаёт лишней записи на диск.
        var removed = entries.splice(index, 1)[0]; // Убираем только найденную карточку.
        try { save(); } catch (error) { entries.splice(index, 0, removed); throw error; } // При отказе записи возвращаем карточку на прежнее место.
        return true; // Сообщаем интерфейсу об успешном удалении.
    }

    function get(id) { // Получаем сохранение перед применением или переименованием.
        ensureLoaded();
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
        var previousName = wheel.name, previousDescription = wheel.description;
        if (name.length > 0) wheel.name = name; else delete wheel.name; // Пустые метаданные не занимают место в сохранении.
        if (description.length > 0) wheel.description = description; else delete wheel.description;
        try { save(); } catch (error) { if (previousName === undefined) delete wheel.name; else wheel.name = previousName; if (previousDescription === undefined) delete wheel.description; else wheel.description = previousDescription; throw error; }
        return true;
    }

    function replaceWheel(id, number, data) { // Очищение заменяет только один снимок; остальные девять не копируются и не переставляются.
        var entry = memberOf(id, number); if (entry == null) return false;
        var replacement = copyData(data), previous = entry.data.wheels[number]; entry.data.wheels[number] = replacement; // Отделяем новый снимок от любых объектов редактора.
        try { save(); } catch (error) { entry.data.wheels[number] = previous; throw error; }
        return true;
    }

    return {types: types, list: list, add: add, rename: rename, remove: remove, get: get, renameWheel: renameWheel, replaceWheel: replaceWheel}; // Предоставляем меню операции с данными, не создавая сам интерфейс.
};
