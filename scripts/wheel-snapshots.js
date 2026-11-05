// СНИМКИ ВИЗУАЛА, БЛОКОВ И НАБОРА КОЛЁС
"use strict"; // Запрещаем присваивания необъявленным переменным.

exports.create = function(api) { // Связываем обычные данные библиотеки с действующими колёсами и настройками.
    var wheelCount = 10; // Набор содержит все номера от 0 до 9.
    var maxSlots = 128; // Предел хранения учитывает и скрытые слоты старых сохранений; число видимых секторов отдельно ограничено в wheel.js.
    var settingsPrefix = "buildwheel.slot."; // Используем обычные ключи слотов, которые уже читает радиальное меню.

    // ПРОВЕРКА НОМЕРА И КОЛИЧЕСТВА СЛОТОВ
    function validNumber(number) { // Не допускаем изменения чужого номера через некорректные данные.
        return typeof number === "number" && number >= 0 && number < wheelCount && number === Math.floor(number); // Принимаем только целые номера существующих колёс.
    }

    function slotCount(number) { // Учитываем как видимые секторы, так и сохранённые за пределами текущего визуала слоты.
        var count = Math.max(Number(api.wheelView.getVisual(number).sectorCount), Number(api.getSlotCount(number))); // Уменьшение числа секторов не должно терять скрытые блоки при сохранении.
        return isFinite(count) ? Math.max(1, Math.min(maxSlots, Math.floor(count))) : 1; // Возвращаем безопасное количество в пределах размера снимка.
    }

    function validScale(value) { // Масштаб иконки проверяем независимо от доступности самого блока.
        return typeof value === "number" && isFinite(value) && value >= 0.4 && value <= 2; // Допускаем те же 40–200%, что и обычный ползунок размера иконки.
    }

    // СОЗДАНИЕ НЕЗАВИСИМЫХ СНИМКОВ
    function captureBlocks(number) { // Сохраняем имена блоков вместо ссылок на игровые объекты Block.
        var slots = [], count = slotCount(number); // Новый массив никак не связан с изменяемыми массивами слотов игры.
        for (var sector = 0; sector < count; sector++) { // Включаем скрытые слоты, если раньше секторов было больше.
            var block = api.getBlock(number, sector), scale = Number(api.getScale(number, sector)); // Читаем действующий блок и собственный масштаб его иконки.
            slots.push({block: block == null ? null : String(block.name), scale: validScale(scale) ? scale : 1}); // Пустые и ещё не настроенные слоты получают обычный масштаб 100%.
        }
        return {slots: slots}; // Этот комплект можно сохранить отдельно от визуала.
    }

    function captureWheel(number) { // Объединяем два независимых типа данных в одно колесо.
        return {visual: api.appearanceEditor.capture(number), blocks: captureBlocks(number)}; // Визуал содержит и собственное количество секторов.
    }

    function capture(type, number) { // Создаём данные для выбранной кнопки сохранения.
        if (type === "wheels") { // Набор включает все номера независимо от открытого в меню номера.
            var wheels = []; // Каждому номеру отводим соответствующую позицию массива.
            for (var w = 0; w < wheelCount; w++) wheels.push(captureWheel(w)); // Сохраняем все десять собственных визуалов, даже если один из них закреплён для игры.
            return {wheels: wheels}; // Библиотека получает только обычные объекты, массивы, строки и числа.
        }
        if (!validNumber(number)) return null; // Нельзя создать снимок несуществующего номера.
        if (type === "visual") return api.appearanceEditor.capture(number); // Кнопка визуала сохраняет только параметры рисования и число секторов.
        if (type === "blocks") return captureBlocks(number); // Кнопка блоков сохраняет только назначения и масштабы иконок.
        if (type === "wheel") return captureWheel(number); // Кнопка колеса сохраняет обе части вместе.
        return null; // Неизвестному типу не создаём случайный формат данных.
    }

    // ПОЛНАЯ ПРОВЕРКА СОХРАНЕНИЯ ДО ИЗМЕНЕНИЯ КОЛЁС
    function validBlocks(data) { // Проверяем комплект слотов целиком, включая пустые слоты.
        if (data == null || !Array.isArray(data.slots) || data.slots.length < 1 || data.slots.length > maxSlots) return false; // Отсеиваем отсутствующий массив и недопустимый размер.
        for (var sector = 0; sector < data.slots.length; sector++) { // Не применяем даже первый слот, пока не проверен последний.
            var slot = data.slots[sector]; // Проверяем запись без обращения к действующему колесу.
            if (slot == null || (slot.block !== null && (typeof slot.block !== "string" || slot.block.length === 0)) || !validScale(slot.scale)) return false; // Блок задаётся непустым именем либо null, масштаб — допустимым числом.
        }
        return true; // Сохранение блоков можно безопасно перенести.
    }

    function validWheel(data) { // Проверяем обе части комбинированного сохранения.
        return data != null && api.appearanceEditor.validSnapshot(data.visual) && validBlocks(data.blocks); // Ошибка в одной части отклоняет всё колесо.
    }

    function valid(type, data) { // Браузер может проверить запись до показа подтверждения применения.
        if (type === "visual") return api.appearanceEditor.validSnapshot(data); // Все ограничения визуала определены в одном месте — редакторе его полей.
        if (type === "blocks") return validBlocks(data); // Отдельный комплект блоков не требует визуала.
        if (type === "wheel") return validWheel(data); // Колесо обязано содержать обе исправные части.
        if (type !== "wheels" || data == null || !Array.isArray(data.wheels) || data.wheels.length !== wheelCount) return false; // Набор содержит ровно десять колёс.
        for (var w = 0; w < wheelCount; w++) if (!validWheel(data.wheels[w])) return false; // Проверяем весь набор до замены первого номера.
        return true; // Все номера набора прошли проверку.
    }

    // ПЕРЕНОС ПРОВЕРЕННЫХ ДАННЫХ В РАДИАЛЬНОЕ МЕНЮ
    function applyBlocks(number, data, previousCount) { // Меняем назначения, сохраняя визуал и его количество секторов.
        var count = Math.max(previousCount, slotCount(number), data.slots.length); // Старый длинный список должен очищаться и при применении более короткого.
        Core.settings.put(settingsPrefix + number + ".count", new java.lang.Integer(String(count))); // После перезапуска загружаем и скрытые слоты, если видимый визуал короче сохранённого массива блоков.
        for (var sector = 0; sector < count; sector++) { // Обрабатываем новые слоты и оставшиеся от прежнего содержимого хвостовые слоты.
            var slot = sector < data.slots.length ? data.slots[sector] : null; // За пределами сохранённого списка назначаем пустой слот с обычным масштабом.
            var block = slot == null || slot.block === null ? null : Vars.content.block(slot.block); // Если мод с блоком удалён, несуществующее имя превращается в пустой слот.
            var scale = slot == null ? 1 : slot.scale; // Не переносим старый масштаб в очищенный хвост списка.
            api.setBlock(number, sector, block); // Обновляем действующий массив блоков через API основного меню.
            api.setScale(number, sector, scale); // Масштаб применяется отдельно, в том числе к скрытым слотам.
            var key = settingsPrefix + number + "." + sector; // Адрес слота совпадает с адресом обычного редактирования блока.
            Core.settings.put(key + ".block", block == null ? "" : String(block.name)); // Записываем разрешённое имя блока либо пустую строку для пустого слота.
            Core.settings.put(key + ".scale", new java.lang.Float(String(scale))); // Settings требует Java Float вместо автоматически получаемого из Rhino Double.
        }
    }

    function applyWheel(number, data) { // Применяем уже проверенные визуал и блоки одного номера.
        var previousCount = slotCount(number); // Запоминаем прежнюю длину до возможного уменьшения числа секторов визуалом.
        api.appearanceEditor.applySnapshot(number, data.visual); // Редактор сохраняет параметры визуала в обычные ключи настроек.
        applyBlocks(number, data.blocks, previousCount); // Заменяем блоки и очищаем прежние лишние слоты.
    }

    function apply(type, data, number) { // Вызывается только после пользовательского подтверждения в браузере.
        if (!valid(type, data) || (type !== "wheels" && !validNumber(number))) return false; // Ни один параметр не меняем при ошибке в любой части входных данных.
        if (type === "wheels") { // Применение набора затрагивает все десять номеров.
            for (var w = 0; w < wheelCount; w++) applyWheel(w, data.wheels[w]); // Используем проверенный набор, не изменяя сами данные сохранения.
        } else if (type === "visual") { // При загрузке одного визуала назначения блоков сохраняются.
            Core.settings.put(settingsPrefix + number + ".count", new java.lang.Integer(String(slotCount(number)))); // Запоминаем прежнюю длину до возможного уменьшения количества видимых секторов.
            api.appearanceEditor.applySnapshot(number, data); // Меняем только визуал, сохраняя весь массив назначенных блоков и масштабов.
        }
        else if (type === "blocks") applyBlocks(number, data, slotCount(number)); // При загрузке блоков сохраняются и визуал, и количество видимых секторов.
        else applyWheel(number, data); // Для полного колеса заменяем обе части одного номера.
        return true; // Меню после этого обновляет интерфейс и отмечает необходимость записи настроек на диск.
    }

    // ПОДГОТОВКА ПАССИВНОГО ПРЕВЬЮ БЕЗ ИЗМЕНЕНИЯ НАСТРОЕК
    function preview(type, data, number, member) { // Вызывается лениво, когда включённая карточка действительно попала в видимую область.
        if (type === "wheels") { if (data == null || !Array.isArray(data.wheels) || data.wheels.length !== wheelCount || !validNumber(member)) throw new Error("Неверный набор колёс."); data = data.wheels[member]; type = "wheel"; } // Подготавливаем только одно видимое колесо набора.
        if (!valid(type, data) || !validNumber(number)) throw new Error("Сохранение содержит неверные данные."); // Повреждённые цвета и размеры не попадают в общий код рисования.
        var visual = api.wheelView.getVisual(number), saved = type === "visual" ? data : type === "wheel" ? data.visual : null; // Блоки без визуала используют собственный вид открытого «манекена».
        if (saved != null) visual = api.appearanceEditor.previewSnapshot(saved); // Редактор знает проверенные поля и технические значения по умолчанию; живые колёса не изменяются.
        var result = {visual: visual}, blocks = type === "blocks" ? data : type === "wheel" ? data.blocks : null; // Визуал без блоков не создаёт массив назначений.
        if (blocks != null) {
            result.blocks = []; result.scales = []; // Разрешаем имена блоков только для видимых секторов, не копируя скрытый хвост сохранения.
            for (var sector = 0; sector < visual.sectorCount; sector++) { var slot = blocks.slots[sector]; result.blocks.push(slot == null || slot.block == null ? null : Vars.content.block(slot.block)); result.scales.push(slot == null ? 1 : slot.scale); } // Отсутствующий мод даёт пустой слот; масштаб иконки сохраняется.
        }
        return result; // Браузер хранит готовые Color и ссылки Block до выключения или вытеснения превью из кэша.
    }

    function emptyWheel() { // Очищаем одно место сохранённого набора, не меняя порядок остальных девяти номеров.
        var visual = api.appearanceEditor.defaultSnapshot(), slots = [];
        for (var sector = 0; sector < visual.sectorCount; sector++) slots.push({block: null, scale: 1}); // Заводское колесо не содержит назначенных блоков.
        return {visual: visual, blocks: {slots: slots}};
    }

    return {capture: capture, valid: valid, apply: apply, preview: preview, emptyWheel: emptyWheel}; // Хранилище библиотеки и пользовательский интерфейс остаются за пределами адаптера.
};
