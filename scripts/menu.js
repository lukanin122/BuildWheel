// BuildWheel — пункт 3: меню назначения блоков и настройки иконок.
// Подключается через require("menu"); интерфейс создаётся после ClientLoadEvent.
// API виджетов: https://github.com/Anuken/Arc/tree/master/arc-core/src/arc/scene/ui
// Категории и иконки: mindustry.ui.fragments.PlacementFragment версии игры.
"use strict"; // В частности, запрещает случайное присваивание не объявленной переменной.
var uiSounds = require("sounds"); // Общий модуль уже загружает только четыре используемых звука.
var appearanceMenuModule = require("appearance-menu"); // Подключаем модуль полей внешнего вида «колеса выбора» и «манекена».
var paletteModule = require("palette"); // Подключаем отдельное окно палитры, которое копирует выбранный цвет в буфер обмена.
var libraryModule = require("wheel-library"); // Хранилище независимых снимков четырёх типов.
var snapshotsModule = require("wheel-snapshots"); // Получение и проверяемое применение визуала, блоков, колеса или набора.
var browserModule = require("wheel-browser"); // Браузер сохранений и штатные плашки ввода имени.

// ОБЩИЕ НАСТРОЙКИ УПРАВЛЕНИЯ
var controlsCache = null; // Один набор настроек используют обработчики main.js и открываемая форма меню.
exports.getControls = function() { // Создаём настройки один раз после ClientLoadEvent, без повторного чтения при открытии колеса.
    if (controlsCache != null) return controlsCache; // Возвращаем существующие числа и переключатели.
    var prefix = "buildwheel.controls."; // Общие настройки не смешиваются с визуалами отдельных номеров.
    var controls = {edgeShift: 0.8, disableNumberKeys: true, clipOuter: false, clipInner: false, paletteInMenu: false, showNumber: false}; // Заводские значения десяти настроек левой части.
    for (var key in controls) { // Читаем переключатели и долю сдвига только при создании набора.
        try {
            if (key == "edgeShift") { // Единственное дробное значение задаёт отступ от краёв экрана.
                var saved = Number(Core.settings.getFloat(prefix + key, controls[key])); // Settings хранит долю числом Java Float.
                if (isFinite(saved) && saved >= 0 && saved <= 1) controls[key] = saved; // Не применяем повреждённый диапазон.
            } else controls[key] = Core.settings.getBool(prefix + key, controls[key]); // Для переключателей используем штатное чтение Boolean.
        } catch (error) { // Неверный тип настройки оставляет заводское значение.
        }
    }
    controls.numberColor = Color.white.cpy(); // Собственный цвет номера не меняет глобальный Color.white игры.
    try { // Неверный сохранённый цвет не мешает открытию мода.
        var hex = String(Core.settings.getString(prefix + "numberColor", "#FFFFFF")); // Цвет номера хранится отдельно от визуалов колёс.
        if (hex.length == 7 && hex.charAt(0) == "#") controls.numberColor.set(Color.valueOf(hex)); // Отдельный слайдер прозрачности для номера не требуется.
    } catch (error) { // Неизвестный HEX оставляет белый цвет.
    }
    function updateNumberContrast() { // Подбираем фон номера только при загрузке или изменении цвета, а не при каждом открытии колеса.
        function linear(value) { return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4); } // Учитываем воспринимаемую яркость RGB-канала.
        var color = controls.numberColor; // Измеряем яркость собственного цвета текста.
        controls.numberDarkBackground = 0.2126 * linear(color.r) + 0.7152 * linear(color.g) + 0.0722 * linear(color.b) > 0.179; // Выбираем чёрный либо белый фон с большим контрастом к тексту.
    }
    updateNumberContrast(); // Готовим производный параметр один раз после чтения сохранённого цвета.
    controls.set = function(key, value) { // Поля формы меняют этот же объект, поэтому новое поведение действует сразу.
        if (key == "numberColor") { // Палитра выбора цвета возвращает объект Color.
            controls.numberColor.set(value); // Сохраняем ссылку на существующий цвет для номера.
            updateNumberContrast(); // Последующее открытие номера использует готовый выбор контрастного фона.
            Core.settings.put(prefix + key, "#" + String(controls.numberColor.toString()).substring(0, 6).toUpperCase()); // Записываем только RGB.
        } else if (key == "edgeShift") { // Слайдер передаёт долю от нуля до единицы.
            controls.edgeShift = value; // Геометрия открытия читает уже готовое число.
            Core.settings.put(prefix + key, new java.lang.Float(String(value))); // Не передаём Settings автоматически упакованный JS Double.
        } else { // Остальные параметры — логические переключатели.
            controls[key] = !!value; // Нормализуем значение к true/false.
            Core.settings.put(prefix + key, !!value); // Диск записывает существующий flushSettings при закрытии настроек.
        }
    };
    var bindings = {wheels: []}; // Назначения хранятся как штатные KeyBind Mindustry и сохраняются штатным методом save.
    function binding(name, title, defaultKey) { // Добавляем только собственные действия мода, не меняя игровые назначения.
        Core.bundle.getProperties().put("keybind.buildwheel-" + name + ".name", title); // Штатное окно переназначения получает понятный заголовок.
        return KeyBind.add("buildwheel-" + name, defaultKey, "buildwheel"); // Конструктор сразу восстанавливает сохранённую клавишу либо использует исходную.
    }
    Core.bundle.getProperties().put("category.buildwheel.name", "BuildWheel"); // Собственные действия также доступны в стандартном списке управления игры.
    bindings.wheelModifier = binding("wheel-modifier", "Выбор колеса: Второстепенная", KeyCode.controlLeft); // Ctrl по умолчанию заменяет тестовый Shift.
    for (var n = 0; n < 10; n++) bindings.wheels[n] = binding("wheel-" + n, "Колесо " + n, KeyCode.valueOf("num" + n)); // Каждое колесо получает собственную переназначаемую основную клавишу.
    bindings.menuModifier = binding("menu-modifier", "Радиальное меню: Второстепенная", KeyCode.controlLeft); // Исходный модификатор меню — Ctrl.
    bindings.menuKey = binding("menu-key", "Радиальное меню: Основная", KeyCode.minus); // Исходная основная клавиша меню — минус.
    bindings.paletteModifier = binding("palette-modifier", "Палитра: Второстепенная", KeyCode.unset); // Без модификатора достаточно назначенной основной клавиши.
    bindings.paletteKey = binding("palette-key", "Палитра: Основная", KeyCode.unset); // Палитра не имеет горячей клавиши до назначения пользователем.
    bindings.scrollKey = binding("scroll-key", "Клавиша + колёсико мыши", KeyCode.unset); // Caps Lock больше не назначен по умолчанию.
    controls.bindings = bindings; // Обработчики main.js читают текущие значения этих же KeyBind.
    controls.key = function(bind) { return bind.value == null || bind.value.key == null ? KeyCode.unset : bind.value.key; }; // Отключённое назначение представляется единым KeyCode.unset.
    controlsCache = controls; // Скрытые меню не создают вторых наборов параметров и обработчиков.
    return controls; // main.js получает те же настройки, которые позднее показывает меню.
};

// ------------------------------------------------------------
// СОЗДАНИЕ РЕДАКТОРА И ЕГО СОСТОЯНИЕ
// ------------------------------------------------------------
// main.js вызывает create один раз после ClientLoadEvent.
// Вложенные функции затем работают с общими переменными этого вызова.
// Окно создаётся здесь, но появится на экране только после show().
// exports — публичная часть модуля. api содержит только функции и параметры,
// явно переданные из main.js; обратного require("main") здесь нет.
exports.create = function(api) {
    var controls = api.controls || exports.getControls(); // Главный скрипт и форма работают с одним набором настроек управления.
    var wheelView = api.wheelView; // Общая основа с игровым колесом; настройки внешнего вида не копируем.
    var wheelCount = wheelView.wheelCount; // Число номеров берём из общей основы колёс; у каждого номера свой комплект визуала.
    var settingsPrefix = "buildwheel.slot."; // Начало ключей Core.settings: отделяет наши настройки от настроек других модов.
    var iconScales = []; // Таблица [колесо][сектор]: 1 = 100%, 0.4 = 40%, 2 = 200%.
    var settingsChanged = false; // Условие вынуждающее к записи данных на диск.

    // Локальное состояние редактора не меняет номер игрового колеса.
    var editedWheel = 1; // Начинаем с колеса 1; а 10-ый номер является 0
    var editedSector = -1; // Редактируемый 'зелёный' сектор 0–7, дефолт -1
    var category = null; // null — вкладка категории «Всё», без фильтра по типам блоков. Она выбрана изначально.
    var searchText = ""; // Сохраняем запрос, чтобы восстановить поле после изменения размера окна.
    var directionNames = ["Север", "Северо-восток", "Восток", "Юго-восток",
        "Юг", "Юго-запад", "Запад", "Северо-запад"];

    var dialog = new BaseDialog("Радиальное меню"); // Объект - окно "меню настроек"
    var grid, blockPane, searchField, sectorLabel, wheelLabel, scaleLabel; // Ссылки на виджеты: присвоим их при построении содержимого окна.
    var wheelSlider, scaleSlider, clearSelectionButton, clearSlotButton;
    var blockButtons = []; // Записи {button, block}: помогают обновлять выделение без пересоздания списка.
    var categoryButtons = []; // Такие же записи для вкладок категорий.
    var campaignButtons = []; // Записи {button, planet, enabled}: каждая кампания включается независимо от остальных.
    // Однотонные фоны без рамки; создаём один раз и используем для всех кнопок кампаний.
    var campaignCheckedBackground = Tex.whiteui.tint(Color.valueOf("606060"));
    var campaignPressedBackground = Tex.whiteui.tint(Color.valueOf("707070"));
    var gridColumns = 1;
    var previewSize = 0; // Диаметр манекена в координатах сцены; берём из общих настроек колеса.
    var previewWidget, previewGroup, previewEditor; // Ссылки на сам «манекен», группу с его кнопками и таблицу с боковым слайдером.
    var previewCell, scaleSliderCell, sectorLabelCell, rightPanelCell; // Ячейки таблиц, размеры которых меняются вместе с диаметром «манекена».
    var baseRightWidth = 0; // Минимальная ширина правой панели, необходимая для её надписей и полей настроек.
    var closeKeysCaptured = []; // Отметки клавиш закрытия; индексом служит ordinal() игрового KeyCode.
    var saves = null, lockButton = null, lockLabel = null; // Ссылки на браузер и кнопку закрепления текущей сборки меню.
    var previewRowCell = null; // Ячейка объединяет «манекен» и боковые кнопки, не сдвигая круг дополнительной колонкой.
    var toolsSize = 40, toolsHeight = 258, toolsReserve = 48; // Шесть квадратных кнопок, пять зазоров по 2 и дополнительный зазор 8 после замка.
    var applyingSavedData = false; // Во время применения набора подгоняем раскладку только один раз после всех десяти комплектов.
    var bindingButtons = [], bindingModal = null, nativeRebindField = null; // Метки клавиш обновляются при изменении назначения, а не каждый кадр.
    var palette = paletteModule.create(() => { settingsChanged = true; }, () => { // Создаём палитру с уведомлениями об изменении настройки и закрытии окна.
        if (dialog.isShown()) focusBlockList(); // При возврате из палитры передаём колёсико мыши актуальному списку блоков.
        else flushSettings(); // Самостоятельно открытая палитра сохраняет изменения и без последующего закрытия «Радиального меню».
    });

    // ШТАТНЫЕ ПОДСКАЗКИ НАСТРОЕК И ПРИВЯЗКА К ЛЕВОМУ КРАЮ ЭЛЕМЕНТА
    function addTooltip(element, text, keepWhite) { // Оформление берём из игры, а для левого списка сохраняем прежний белый текст.
        Vars.ui.addDescTooltip(element, text); // Родной метод уже показывает описание под началом элемента на полупрозрачном фоне.
        var container = element.getListeners().peek().getContainer(); // Получаем только что созданную игрой подсказку.
        var cell = container.getCells().first(), label = cell.get(); // Штатное описание содержит одну надпись в таблице.
        if (keepWhite) label.setColor(Color.white); // Блоки, кампании и категории сохраняют прежнее оформление обычных игровых подсказок.
        var available = Math.max(1, Core.scene.getWidth() - container.getMarginLeft() - container.getMarginRight() - Scl.scl(8)); // Ограничиваем ширину описания размером экрана.
        if (label.getPrefWidth() > available) { // Длинное название не должно выходить за экран целиком.
            cell.width(available); label.setWrap(true); // Переносим текст самого Label без изменения его цвета или размера.
        }
        container.update(() => container.keepInStage()); // При нехватке места сдвигаем показанную подсказку внутрь экрана.
    }

    // СВЯЗЬ НАСТРОЕК ВИДА С МЕНЮ
    var appearanceEditor = appearanceMenuModule.create(wheelView, (diameterChanged, previousSectorCount) => { // Создаём редактор внешнего вида и принимаем уведомления о его изменениях.
        settingsChanged = true; // Отмечаем, что настройки потребуется записать на диск при закрытии меню.
        if (diameterChanged && !applyingSavedData) resizePreview(); // Подгоняем «манекен» редактируемого номера, сохраняя поля и фокус ввода; игровое колесо возьмёт диаметр при открытии.
        if (previousSectorCount != null) { // Число секторов изменено слайдером; блоки за новой границей должны оставаться сохранёнными.
            iconScales[editedWheel].length = Math.max(iconScales[editedWheel].length, previousSectorCount, wheelView.getVisual(editedWheel).sectorCount); // Новые места используют масштаб 100%, старые места и их значения не удаляются.
            Core.settings.put(settingsPrefix + editedWheel + ".count", new java.lang.Integer(String(iconScales[editedWheel].length))); // Сохраняем длину массива блоков независимо от числа видимых секторов.
            refreshSectorControls(); // Обновляем направления и снимаем выделение, если выбранный сектор больше не виден.
        }
    });
    if (appearanceEditor.needsSave) settingsChanged = true; // Сохраняем индивидуальные комплекты, впервые созданные из прежнего общего вида.

    // ------------------------------------------------------------
    // КЛЮЧИ НАСТРОЕК И ПРОВЕРКА НОМЕРОВ
    // ------------------------------------------------------------
    function slotKey(wheelNumber, sectorNumber) { //Персональные адреса-имена на слоты. Например, buildwheel.slot.3.0 — северный слот колеса 3.
        return settingsPrefix + wheelNumber + "." + sectorNumber;
    }

    function campaignKey(planet) {
        return "buildwheel.campaign." + planet.name + ".enabled"; // Внутреннее имя включает префикс мода и не зависит от языка игры.
    }

    function validIndex(value, count) {
        return value >= 0 && value < count && value == Math.floor(value); // Разрешены только целые индексы в пределах массива.
    }

    function getIconScale(wheelNumber, sectorNumber) {
        if (!validIndex(wheelNumber, wheelCount) || !validIndex(sectorNumber, 128)) return 1; // Скрытые своим визуалом слоты тоже сохраняют масштаб: закреплённый игровой визуал может показывать больше секторов.
        return iconScales[wheelNumber][sectorNumber] || 1; // Ещё не настроенный сектор использует масштаб 100%, в том числе после будущего увеличения числа секторов.
    }

    // ------------------------------------------------------------
    // ВОССОЗДАНИЕ СОХРАНЁННЫХ СЛОТОВ КОЛЕСА ИЗ КЭША НАСТРОЕК
    // ------------------------------------------------------------
    // Core.settings хранит имена блоков.
    for (var w = 0; w < wheelCount; w++) {
        iconScales[w] = []; // Каждому колесу создаём свой массив 'масштабов иконок'.
        var loadedSlotCount = wheelView.getVisual(w).sectorCount; // Видимый визуал задаёт минимальное количество загружаемых слотов.
        try { // Более короткий применённый визуал не должен скрыто терять блоки после перезапуска игры.
            var storedSlotCount = Number(Core.settings.getInt(settingsPrefix + w + ".count", loadedSlotCount)); // Дополнительная длина хранится вместе с блоками, отдельно от числа видимых секторов.
            if (storedSlotCount >= 1 && storedSlotCount <= 128) loadedSlotCount = Math.max(loadedSlotCount, storedSlotCount); // Загружаем и ранее сохранённый скрытый хвост массива.
        } catch (error) { // При неверном типе длины используем число секторов текущего визуала.
        }
        for (var s = 0; s < loadedSlotCount; s++) { // Восстанавливаем видимые и скрытые блоки с их собственными масштабами.
            var key = slotKey(w, s); // генерирует персональные текстовые адреса каждому сектору
            var savedName = String(Core.settings.getString(key + ".block", "")); //проверяем сохранененные адреса и при наличии вытягиваем те блоки из Core.settings
            if (savedName.length > 0) {// Если мод с блоком удалён, content.block вернёт null: слот пуст.
                api.setBlock(w, s, Vars.content.block(savedName)); // Через функцию main.js вставляем в колесо блок через адрес найденный в игре
            }
            var scale = Number(Core.settings.getFloat(key + ".scale", 1)); // Читаем параметр размера в Java Float как число JS; при отсутствии настройки берём 1.
            iconScales[w][s] = isFinite(scale) ? Math.max(0.4, Math.min(2, scale)) : 1; // Ограничиваем 40–200%; для NaN/бесконечности используем 100%.
        }
    }

    // СНИМКИ ДАННЫХ И БРАУЗЕР СОХРАНЕНИЙ
    var snapshots = snapshotsModule.create({ // Адаптер отделяет сохранения от живых массивов блоков и объектов Color.
        wheelView: wheelView, appearanceEditor: appearanceEditor, getBlock: api.getBlock, setBlock: api.setBlock, // Передаём существующие методы доступа к параметрам.
        getScale: getIconScale, setScale: function(w, s, value) { iconScales[w][s] = value; }, // Размер иконки является частью сохранённого слота блока.
        getSlotCount: function(w) { return Math.max(iconScales[w].length, wheelView.getVisual(w).sectorCount); } // Учитываем скрытые слоты при сохранении и последующем очищении лишних мест.
    });
    saves = browserModule.create({ // Создаём только окно браузера; карточки будут построены при его открытии.
        store: libraryModule.create(), addTooltip: addTooltip, topDialog: topDialog, getWheelNumber: () => editedWheel, // Четыре постоянные вкладки получают единое хранилище.
        capture: type => snapshots.capture(type, editedWheel), // Сохранение берёт собственные данные выбранного номера, не закреплённый игровой образец.
        apply: function(entry, number) { // Вызывается только после штатного подтверждения пользователем.
            if (!snapshots.valid(entry.type, entry.data)) { Vars.ui.showInfo("Сохранение содержит неверные данные."); return; } // Повреждённый набор не должен применяться частично.
            editedSector = -1; applyingSavedData = true; // Прежнее выделение сбрасываем; промежуточные диаметры не перестраивают меню.
            try { snapshots.apply(entry.type, entry.data, number); } finally { applyingSavedData = false; } // Все данные проверены до изменения первого номера.
            settingsChanged = true; // Изменены действующие настройки, а не запись в библиотеке.
            appearanceEditor.selectWheel(editedWheel); resizePreview(); refreshSectorControls(); // Показываем результат в прежних виджетах меню.
            flushSettings(); // Подтверждённое применение сразу записываем на диск.
        },
        onClosed: function() { Core.app.post(focusBlockList); } // Возврат из браузера восстанавливает прокрутку актуального списка блоков.
    });

    // ВЕРХНЕЕ ОКНО И ПЕРЕКЛЮЧАТЕЛЬ ОБЩЕГО ИГРОВОГО ВИЗУАЛА
    function topDialog() { // Проверяем окна только при действии пользователя, без покадрового обхода сцены.
        var children = Core.scene.root.getChildren(); // Диалоги игры и модов находятся в корневой группе сцены.
        for (var i = children.size - 1; i >= 0; i--) { // Последний показанный диалог располагается поверх предыдущих.
            var child = children.get(i); // Берём очередного ребёнка корневой группы.
            if (child instanceof Dialog && child.isShown()) return child; // Ввод имени и подтверждения должны получать Escape раньше родительского меню.
        }
        return null; // Сейчас открытых диалогов нет.
    }

    function refreshLock() { // Обновляем значок и текст только при смене номера, режима либо сборке меню.
        if (lockButton == null) return; // До создания панели обновлять нечего.
        var pinned = wheelView.getSharedVisualNumber(); // -1 означает независимые визуалы; остальные значения обозначают закреплённый номер.
        lockButton.getStyle().imageUp = pinned < 0 ? Icon.lockOpen : Icon.lock; // Стиль принадлежит этой кнопке, поэтому остальные иконки игры не меняются.
        var number = "[#FFD37F]" + (pinned < 0 ? editedWheel : pinned) + "[]"; // Только номер окрашиваем жёлтым HEX, оставляя описание серым.
        lockLabel.setText(pinned < 0 ? "Использовать визуал колеса № " + number + " везде" : "Визуал колеса № " + number + " используется везде"); // Подсказка отражает действие открытого замка либо источник общего вида.
        lockLabel.setWrap(false); // Измеряем полный новый текст независимо от переноса в предыдущем состоянии замка.
        var container = lockLabel.parent, available = Math.max(1, Core.scene.getWidth() - container.getMarginLeft() - container.getMarginRight() - Scl.scl(8)); // Учитываем фактическую ширину экрана и отступы штатной подсказки.
        var width = lockLabel.getPrefWidth(); // Размер описания пересчитывается только при обновлении замка.
        container.getCells().first().width(Math.min(width, available)); // Длинная изменяемая подсказка не становится шире экрана.
        lockLabel.setWrap(width > available); // Переносим только тот текст, которому не хватает места.
    }

    function createWheelTools() { // Вертикальная панель располагается слева от области «манекена» и заканчивается над «Основным кругом».
        var tools = new Table(); // Панель не добавляет колонку в таблицу самого «манекена».
        lockButton = tools.button(Icon.lock, Styles.cleari, () => { // Иконка будет уточнена по сохранённому режиму ниже.
            wheelView.setSharedVisual(wheelView.getSharedVisualNumber() < 0 ? editedWheel : -1); // Закрепляем выбранный номер либо возвращаем каждому номеру собственный вид.
            settingsChanged = true; refreshLock(); // Параметры остальных девяти комплектов остаются нетронутыми.
        }).size(toolsSize).name("buildwheel-visual-lock").get(); // Квадратная кнопка замка стоит первой.
        lockButton.resizeImage(24); // Сохраняем пространство вокруг значка.
        addTooltip(lockButton, ""); // Получаем штатный полупрозрачный фон и серый текст для изменяемого описания.
        lockLabel = lockButton.getListeners().peek().getContainer().getCells().first().get(); // Меняем текст существующей подсказки, не создавая слушатель при каждом переключении.
        refreshLock(); tools.row(); // Устанавливаем сохранённую иконку и начинаем следующий ряд.
        var actions = [ // Порядок кнопок соответствует четырём типам снимков и открытию браузера.
            {icon: Icon.fileImage, type: "visual", text: "Сохранить визуал этого колеса"},
            {icon: Icon.fileCode, type: "blocks", text: "Сохранить блоки этого колеса"},
            {icon: Icon.fileArchive, type: "wheel", text: "Сохранить и визуал, и блоки этого колеса"},
            {icon: Icon.layers, type: "wheels", text: "Сохранить данный набор колёс"},
            {icon: Icon.bookOpen, type: "browser", text: "Сохранения"}
        ];
        for (var i = 0; i < actions.length; i++) { // Создаём только пять кнопок текущей панели.
            addWheelTool(tools, actions[i], i == 0 ? 10 : 2); // После замка оставляем зазор больше, чем между остальными кнопками.
            tools.row(); // Следующее действие располагается строго ниже.
        }
        return tools; // Таблица размещается поверх свободной левой области строки «манекена».
    }

    function addWheelTool(tools, action, gap) { // Отдельный вызов сохраняет своё действие для каждого обработчика кнопки.
        var button = tools.button(action.icon, Styles.cleari, () => { // Используем те же штатные квадратные кнопки, что у замка.
            if (action.type == "browser") saves.show(); // Книга открывает список существующих записей.
            else saves.save(action.type); // Остальные кнопки вызывают штатную плашку ввода имени.
        }).size(toolsSize).padTop(gap).name("buildwheel-save-" + action.type).get(); // Служебное имя совпадает с типом действия.
        button.resizeImage(24); addTooltip(button, action.text); // Значок и подсказка не перекрывают соседнюю кнопку.
    }

    // Сохраняет блок и масштаб редактируемого сектора.
    // put меняет настройки в памяти; принудительная запись на диск всех настроек в flushSettings.
    function saveSlot() {
        if (editedSector < 0) return;
        var key = slotKey(editedWheel, editedSector);
        var block = api.getBlock(editedWheel, editedSector); // Сами блоки хранятся в main.js; редактор получает их через переданную функцию.
        Core.settings.put(key + ".block", block == null ? "" : String(block.name)); // назначение блока в сектор
        Core.settings.put(key + ".scale", new java.lang.Float(String(getIconScale(editedWheel, editedSector)))); // Размер иконки. Settings принимает Java Float, а не Double от Rhino. Так что необходима конвертация число JS -> Object String -> Float
        settingsChanged = true; // флаг сохраненить файл
    }

    // Сохранение всех настроек - вызывается при закрытии окна и завершении приложения.
    function flushSettings() {
        if (!settingsChanged) return;
        Core.settings.manualSave();
        settingsChanged = false;
    }

    // ------------------------------------------------------------
    // РЕНДЕРИНГ КНОПОК-ИКОНОК И ПАРАМЕТРОВ ДЛЯ ЗЕЛЁНОГО СЕКТОРА
    // ------------------------------------------------------------
    // Меняем доступность к настройке сектора и выделеем включённые кнопки. (таблица блоков обновляется rebuildGrid())
    function refreshSectorControls() {
        if (sectorLabel == null) return; // До buildInterface иконок ещё может не быть для обновления
        var sectorCount = wheelView.getVisual(editedWheel).sectorCount; // Подписи и допустимое выделение зависят от текущего числа секторов «манекена».
        if (editedSector >= sectorCount) editedSector = -1; // Уменьшение числа секторов снимает выделение скрытого слота, сохраняя сам блок.
        var selected = editedSector >= 0; // Есть ли 'зелёный' сектор, для которого разрешено менять настройки?
        var block = selected ? api.getBlock(editedWheel, editedSector) : null; //ставим нужный блок
        var sectorName = sectorCount == 8 ? directionNames[editedSector] : sectorCount == 4 ? directionNames[editedSector * 2] : "Сектор " + (editedSector + 1); // У восьми секторов используем все направления, у четырёх — Север, Восток, Юг, Запад; у остальных — номер с единицы.
        sectorLabel.setText(selected
            ? sectorName + ": " + (block == null ? "пустой слот" : String(block.localizedName))
            : "Выберите сектор на колесе"); //описание над колесом?
        clearSelectionButton.visible = selected; // Показываем крестик при наличии 'зелёного' сектора.
        clearSlotButton.visible = selected; // Показываем кнопку 'Сброс блока' у выбранного 'зелёному' сектору.
        clearSlotButton.setDisabled(!selected || block == null); // Уже пустой слот повторно очищать незачем.
        scaleSlider.visible = selected; // Без выбранного сектора ползунок полностью скрыт.
        scaleLabel.visible = selected; // Подпись с процентом показываем вместе с ползунком.
        scaleSlider.setDisabled(!selected); // Разблокировка ползунка размера иконки при наличии 'зелёного' сектора.
        scaleSlider.setValue(selected ? Math.round(getIconScale(editedWheel, editedSector) * 100) : 100, false); // размер в %, таблица iconScales — в коэффициентах.
        scaleLabel.setText("Размер иконки: " + Math.round(scaleSlider.getValue()) + "%"); //оглавление числа
        for (var i = 0; i < blockButtons.length; i++) {
            blockButtons[i].button.setDisabled(!selected);//блокировка/разблокировка кнопок листа блоков при наличии/отсутствии 'зелёного' сектора
            blockButtons[i].button.setChecked(selected && blockButtons[i].block == block); // setChecked - подсвечиваем выбранный блок
        }
    }

    function selectSector(sector) {//выбираем сектор 'зелёным', вариант -1 снимает выделение
        editedSector = sector;
        refreshSectorControls();
    }

    function assignBlock(block) { //назначаем блок в "колсе выбора"
        if (editedSector < 0) return;
        var previousBlock = api.getBlock(editedWheel, editedSector);
        api.setBlock(editedWheel, editedSector, block);
        saveSlot();
        refreshSectorControls();
        if (block != null) uiSounds.play(uiSounds.addBlock);//проигрываем звук добавлени блока
        else if (previousBlock != null) uiSounds.play(uiSounds.deleteBlock); // Уже пустой слот не издаёт звук удаления.
    }

    // ------------------------------------------------------------
    // СПИСОК БЛОКОВ: СОЗДАНИЕ КНОПОК И ФИЛЬТРАЦИЯ СПИСКА
    // ------------------------------------------------------------
    function addBlockButton(block) {
        var cell = grid.button(new TextureRegionDrawable(block.uiIcon), Styles.selecti, () => assignBlock(block)); // button возвращает ячейку таблицы; обработчик нажатия запоминает именно этот block.
        cell.size(48).pad(2).name("buildwheel-block-" + block.name); // Размер кнопки и отступы; name — техническое имя для поиска элемента в сцене.
        addTooltip(cell.get(), String(block.localizedName) + "\n" + block.name, true); // Сохраняем оформление названия блока и привязываем подсказку под его иконкой.
        var button = cell.get(); // Из ячейки Cell получаем сам Java-объект кнопки.
        button.resizeImage(32); // Размер картинки внутри кнопки; сама кнопка остаётся размером 48.
        button.setProgrammaticChangeEvents(false); // Изменения состояния кнопки из кода не порождают ChangeEvent.
        uiSounds.muteDefaultClick(button); // Назначение блока использует add_block_1 вместо стандартного звука интерфейся.
        blockButtons.push({button: button, block: block}); // Сохраняем связь изображения-кнопки с соответствующим блоком.
    }

    // Блок проходит, если относится хотя бы к одной включённой кампании.
    // Универсальные блоки тоже проходят isOnPlanet; если все кампании выключены, список пуст.
    function matchesCampaigns(block) {
        if (campaignButtons.length == 0) return true; // Если в сборке вообще нет кампаний, не ограничиваем каталог.
        for (var i = 0; i < campaignButtons.length; i++) {
            var campaign = campaignButtons[i];
            if (campaign.enabled && block.isOnPlanet(campaign.planet)) return true;
        }
        return false;
    }

    //Пересоставление таблиы блоков и её содержимого
    function rebuildGrid() {
        if (grid == null) return; // Таблица блоков существует?
        grid.clearChildren(); //очищаем
        blockButtons = []; //обнуляем массив
        var query = searchText.toLowerCase().trim(); // Поиск без учёта регистра и пробелов по краям.
        var blocks = Vars.content.blocks(); // Запрос базы данных всех блоков из Коллекция Java Seq: у неё .size и .get(i), а не .length и [i].
        var count = 0;
        for (var i = 0; i < blocks.size; i++) {
            var block = blocks.get(i);
            // Исключаем декорации/служебные блоки. 
            // Исследования и ресурсы не ограничивают редактор; «Всё» отключает только фильтр категорий.
            if (!block.placeablePlayer || (category != null && block.category != category)
                || !matchesCampaigns(block)
                || block.buildVisibility == BuildVisibility.hidden
                || block.buildVisibility == BuildVisibility.debugOnly) continue;
            var name = String(Strings.stripColors(String(block.localizedName))).toLowerCase(); // Цветовые теги в названии не должны мешать поиску.
            if (query.length > 0 && name.indexOf(query) < 0
                && String(block.name).toLowerCase().indexOf(query) < 0) continue;
            if (count > 0 && count % gridColumns == 0) grid.row(); // Когда текущая строка заполнена, следующие кнопки идут на новую.
            addBlockButton(block);
            count++;
        }
        if (count == 0) grid.add("Блоки не найдены").pad(12);
        grid.invalidateHierarchy(); // Сообщаем таблицам, что размеры содержимого изменились и раскладку надо пересчитать.
        blockPane.setScrollY(0); // После смены запроса или категории возвращаем список к началу.
        refreshSectorControls();
    }

    // Визуально помечает выбранную вкладку и пересобирает список по фильтру категории.
    function chooseCategory(nextCategory) {
        category = nextCategory;
        for (var i = 0; i < categoryButtons.length; i++) {
            categoryButtons[i].button.setChecked(categoryButtons[i].category == category); // Из всех вкладок отмеченной остаётся только текущая.
        }
        rebuildGrid(); // Перестраиваем кнопки, сохраняя само поле поиска и его фокус.
    }

    // Меняем только нажатую кампанию. Сохранение на диск выполняет общий flushSettings при закрытии меню.
    function toggleCampaign(campaign) {
        campaign.enabled = !campaign.enabled;
        campaign.button.setChecked(campaign.enabled);
        Core.settings.put(campaignKey(campaign.planet), campaign.enabled);
        settingsChanged = true;
        rebuildGrid(); // Категория, текст поиска и выбранный сектор сохраняются.
    }

    // Добавление кнопки-категории компании
    function addCampaignButton(table, planet, size) {
        var campaign = {planet: planet, enabled: Core.settings.getBool(campaignKey(planet), true), button: null};
        var cell = table.button(Icon.planet, Styles.squareTogglei, () => toggleCampaign(campaign));
        cell.size(size).name("buildwheel-campaign-" + planet.name);
        addTooltip(cell.get(), String(planet.localizedName), true); // Название кампании сохраняет белый цвет и появляется под началом кнопки.
        var button = cell.get();
        button.resizeImage(20); // На одну UI-единицу меньше иконок категорий.
        button.getImageCell().pad(1.5);
        var color = planet.iconColor;
        if (color == null || (color.r == 1 && color.g == 1 && color.b == 1)) color = Color.gray;
        // У Planet неуказанный цвет белый. Здесь показываем его серым; цвета кампаний берём из игры.
        // Конструктор ImageButton копирует стиль, поэтому эти цвета меняют только текущую кнопку.
        var style = button.getStyle();
        style.checked = campaignCheckedBackground; // Включённую кампанию обозначает заливка вместо жёлтой рамки.
        style.checkedOver = campaignPressedBackground;
        style.down = campaignPressedBackground;
        var iconColor = color.cpy();
        style.imageUpColor = iconColor;
        style.imageOverColor = iconColor;
        style.imageDownColor = iconColor;
        style.imageCheckedColor = iconColor;
        button.setProgrammaticChangeEvents(false);
        button.setChecked(campaign.enabled);
        campaign.button = button;
        campaignButtons.push(campaign);
    }

    //Добавление категории блоков
    function addCategoryButton(table, nextCategory, size) {       
        var allCategories = nextCategory == null; // Для «Всё» передаём null; остальные вкладки используют игровые Category.
        var categoryName = allCategories ? "all" : String(nextCategory.name());
        var categoryIcon = allCategories ? Icon.folderEmpty : Vars.ui.getIcon(categoryName);
        var cell = table.button(categoryIcon, Styles.squareTogglei,
            () => chooseCategory(nextCategory)); //запоминаем какую категорию активируем кнопкой
        cell.size(size).name("buildwheel-category-" + categoryName); // Кнопки соприкасаются рамками, без внешних отступов.
        addTooltip(cell.get(), allCategories ? "Всё" : Core.bundle.get("blocks." + categoryName, categoryName), true); // Категории сохраняют прежний вид подсказки с привязкой к началу иконки.
        var button = cell.get();
        //button.resizeImage(Math.min(24, size - 3)); // либо 24 (великовато), либо 21 (в самый раз)
        button.resizeImage(21);
        button.getImageCell().pad(1.5); // внутренний отступ от краёв рамки
        button.setProgrammaticChangeEvents(false);// отключение повторный запуск функции chooseCategory
        button.setChecked(nextCategory == category); //визуально выделяем совпадающую категория с текущей активной
        categoryButtons.push({button: button, category: nextCategory}); //вывешиваем объект кнопки и ссылку в глобальный интерфейс
    }

    // Создание кнопки-иконки 'Сброса блока' - перечёркнутый квадрат.
    // Цвет и прозрачность задаёт ImageButton, поэтому здесь меняем только толщину линий.
    function createClearSlotIcon() {
        var icon = extend(BaseDrawable, {
            draw: function(x, y, width, height) {
                var previousStroke = Lines.getStroke();
                var padding = Math.min(width, height) * 0.16; //Берется 16% от меньшей стороны элемента. Это нужно, чтобы иконка не упиралась в края своей ячейки и выглядела аккуратно
                var left = x + padding, right = x + width - padding;
                var bottom = y + padding, top = y + height - padding;
                Lines.stroke(Math.max(1, Math.min(width, height) * 0.07)); //толщина линий
                Lines.rect(left + 1, bottom + 1, right - left - 2, top - bottom - 2); //квадрат
                Lines.line(left, bottom, right, top); //диагональ снизу вверх
                Lines.line(left, top, right, bottom); //диагональ сверху вниз
                Lines.stroke(previousStroke); // Не оставляем нашу толщину для следующих элементов UI.
            }
        });
        icon.setMinWidth(24);
        icon.setMinHeight(24);
        return icon;
    }

    // ------------------------------------------------------------
    // МАНЕКЕН: КРУГ, ВЫБОР СЕКТОРА И КНОПКИ В УГЛАХ
    // ------------------------------------------------------------
    // Манекен — "колесо строительства" находящиеся в меню
    function createPreview() {
        // Group абстрактный: extend создаёт его конкретного анонимного наследника.
        var group = extend(Group, {});
        group.setTransform(false); // Группа объединяет круг и крестик; собственные поворот и масштаб ей не нужны.
        var preview = wheelView.createElement({
            getWheelNumber: function() { return editedWheel; },
            getSelectedSector: function() { return editedSector; } // Здесь указано постоянное выделение, 'зелёный' сектор. Наведение мышки на сектор определяет 'общая фабрика'.
            // *getIconAlpha убран: 'манекен' показывает и недоступные блоки с полной непрозрачностью
        });
        previewWidget = preview; // Сохраняем ссылку на круг «манекена» для изменения его размера.
        previewGroup = group; // Сохраняем группу «манекена» и угловых кнопок для подгонки её границ.
        preview.name = "buildwheel-preview";

        // Регистрируем нажатие на 'манекен', ожидание события
        preview.addListener(extend(InputListener, {
            touchDown: function(event, x, y, pointer, button) {
                if (button != KeyCode.mouseLeft) return false;
                var sector = wheelView.sectorAt(preview, x, y, editedWheel); // Границы кольца и число секторов соответствуют визуалу редактируемого номера.
                if (sector != -1) selectSector(sector); // Центр и углы не меняют выбранный сектор.
                return true;
            }
        }));
        group.addChild(preview);
        clearSelectionButton = new ImageButton(Icon.cancel, Styles.cleari);
        clearSelectionButton.name = "buildwheel-deselect";
        var crossSize = Math.min(Scl.scl(32), previewSize * 0.18);
        clearSelectionButton.setSize(crossSize, crossSize);
        clearSelectionButton.setPosition(previewSize - crossSize, previewSize - crossSize); // Верхний правый угол манекена.
        clearSelectionButton.clicked(() => {
            if (editedSector < 0) return;
            selectSector(-1); // Снимает выделение, сохраняя блок и размер иконки в слоте.
            uiSounds.play(uiSounds.deleteBlock);//проигрываем звук удаления блока
        });
        uiSounds.muteDefaultClick(clearSelectionButton);
        addTooltip(clearSelectionButton, "Снять выделение сектора"); // Показываем штатное серое описание под началом кнопки.
        group.addChild(clearSelectionButton);

        clearSlotButton = new ImageButton(createClearSlotIcon(), Styles.cleari);
        clearSlotButton.name = "buildwheel-clear-slot";
        clearSlotButton.setSize(crossSize, crossSize); // Обе угловые кнопки у 'манекена' одинакового размера.
        clearSlotButton.setPosition(0, previewSize - crossSize); // Освободившийся верхний левый угол 'Сброс блока'.
        clearSlotButton.clicked(() => assignBlock(null)); // Очищаем и сохраняем слот; зелёное выделение и масштаб остаются.
        uiSounds.muteDefaultClick(clearSlotButton);
        addTooltip(clearSlotButton, "Удалить блок из сектора"); // Показываем штатное серое описание под началом кнопки.
        group.addChild(clearSlotButton);
        return group;
    }

    // ПОДГОНКА РАЗМЕРА МАНЕКЕНА ПОД ВИЗУАЛ ЕГО НОМЕРА
    function resizePreview() { // Применяем изменение диаметра без пересоздания формы настроек.
        if (previewWidget == null) return; // Если «манекен» ещё не создан, больше изменять нечего.
        previewSize = wheelView.getVisual(editedWheel).appearance.diameter; // Читаем диаметр редактируемого номера; скрытое игровое колесо подгонится при своём открытии.
        var uiSize = previewSize / Scl.scl(); // Переводим диаметр в UI-единицы (ячейки Cell сами применяют масштаб интерфейса).
        previewWidget.setSize(previewSize, previewSize); // Задаём ширину и высоту самого круга «манекена».
        previewGroup.setSize(previewSize, previewSize); // Подгоняем границы группы, которая содержит круг и кнопки в углах.
        previewCell.size(uiSize); // Меняем размер ячейки «манекена», чтобы соседние элементы выделили ему нужное место.
        scaleSliderCell.height(uiSize); // Приравниваем высоту бокового слайдера размера иконок к диаметру «манекена».
        var crossSize = Math.min(Scl.scl(32), previewSize * 0.18); // Рассчитываем размер угловых кнопок: не больше 32 UI-единиц или 18% диаметра.
        clearSelectionButton.setSize(crossSize, crossSize); // Подгоняем размер кнопки снятия 'зелёного' выделения.
        clearSlotButton.setSize(crossSize, crossSize); // Задаём тот же размер кнопке удаления блока из сектора.
        clearSelectionButton.setPosition(previewSize - crossSize, previewSize - crossSize); // Ставим кнопку снятия выделения в правый верхний угол.
        clearSlotButton.setPosition(0, previewSize - crossSize); // Ставим кнопку удаления блока в левый верхний угол.
        var rightWidth = Math.max(baseRightWidth, uiSize + 36 + toolsReserve * 2); // Выделяем ширину для «манекена», бокового слайдера и полей настроек.
        sectorLabelCell.width(rightWidth); // Подгоняем ширину строки с названием выбранного сектора и блока.
        rightPanelCell.width(rightWidth); // Меняем ширину всей правой панели в основной таблице меню.
        previewRowCell.width(rightWidth).height(Math.max(uiSize, toolsHeight)); // Панель действий помещается по высоте, а «манекен» остаётся у прежнего верхнего края своей строки.
        previewEditor.invalidateHierarchy(); // Помечаем таблицу «манекена» и её родителей для пересчёта раскладки.
    }

    // Указывает сцене, какой ScrollPane должен получать вращение колёсика.
    // Проверка isShown не даёт отложенной задаче забрать фокус после закрытия меню.
    function focusBlockList() {
        if (dialog.isShown() && !palette.isShown() && (saves == null || !saves.isShown())) Core.scene.setScrollFocus(blockPane); // Открытая палитра сохраняет прокрутку за своим рисунком.
    }

    // ОБЩИЕ НАСТРОЙКИ ПОД СПИСКОМ БЛОКОВ
    var keySize = 40, keyWide = keySize * 2.5, keySpace = keySize + 4; // Цифровая кнопка квадратная; ячейка учитывает зазор 4, широкая кнопка в 2,5 раза длиннее.
    var resetSpace = keySize / 2 - 4; // Вместе с правым отступом предыдущей кнопки получаем перед сбросом ровно половину её ширины.
    var keyStyle = null; // Один прозрачный стиль используется всеми кнопками назначения клавиш.

    function controlLabel(row, title, width) { // Одинаковое место для подписей всех левых настроек.
        var label = row.add(title).width(width).minHeight(44).left().get(); // Длинная подпись получает место слева от колонки управления.
        label.setWrap(true); // На маленьком экране подпись переносится внутри своей строки.
        return label; // Строка с процентом сдвига дополнительно меняет свой текст.
    }

    function controlRow(table, layout, title, controlsWidth) { // Если управление не помещается рядом с подписью, переносим его целиком ниже.
        var row = new Table(); row.left(); // Внутренняя таблица не растягивает колонки соседних настроек.
        var fits = layout.start + controlsWidth <= layout.width; // Проверяем правый предел уже за вычетом места под полосу прокрутки.
        var label = controlLabel(row, title, fits ? layout.start : layout.width); // На отдельной строке подписи доступна вся ширина.
        if (!fits) row.row(); // Комбинация клавиш переносится, сохраняя одинаковый размер кнопок.
        var content = new Table(); content.left(); row.add(content).width(controlsWidth).left(); // Отдельная таблица не связывает ширину кнопки с шириной подписи предыдущего ряда.
        table.add(row).width(layout.width).left().padBottom(5); table.row(); // Между соседними настройками добавляем пять UI-пикселей.
        return {table: content, label: label}; // Вызывающий код добавляет управление вслед за подписью.
    }

    function addControlToggle(table, layout, title, key, tooltip) { // Одинаковая строка подписи и штатного переключателя.
        var row = controlRow(table, layout, title, 44).table; // Все переключатели начинаются в общей колонке.
        var toggle = new CheckBox(""); // Используем обычный игровой checkbox без собственного рисования.
        toggle.left(); // Сам значок переключателя также начинается у левого края, без центрирования внутри ячейки.
        toggle.name = "buildwheel-control-" + key; // Служебное имя настройки.
        toggle.setChecked(controls[key]); // Начальное состояние читаем из общего набора.
        toggle.changed(() => { controls.set(key, toggle.isChecked()); settingsChanged = true; }); // Применяем новое поведение сразу и отмечаем запись при закрытии меню.
        row.add(toggle).size(44).left(); // Не растягиваем checkbox до правого края панели.
        if (tooltip != null) addTooltip(toggle, tooltip); // Подсказка получает прежний штатный серый стиль.
    }

    // ПРОЗРАЧНЫЕ КНОПКИ КЛАВИШ И ЦВЕТНОЕ ПОДЧЁРКИВАНИЕ HEX
    function keyBorder(brightness) { // Рамка рисуется поверх прозрачного фона без отдельных текстур.
        return extend(Packages.arc.scene.style.BaseDrawable, {draw: function(x, y, width, height) { // Один Drawable обслуживает все кнопки с таким состоянием.
            var old = Draw.getColor(), r = old.r, g = old.g, b = old.b, a = old.a, line = Scl.scl(2); // Запоминаем цвет рисования и толщину рамки.
            Draw.color(brightness, brightness, brightness, a); // Серая рамка сохраняет прозрачность родительского окна.
            Fill.rect(x + width / 2, y + line / 2, width, line); Fill.rect(x + width / 2, y + height - line / 2, width, line); // Нижняя и верхняя стороны.
            Fill.rect(x + line / 2, y + height / 2, line, Math.max(0, height - line * 2)); Fill.rect(x + width - line / 2, y + height / 2, line, Math.max(0, height - line * 2)); // Боковые стороны без наложения углов.
            Draw.color(r, g, b, a); // Следующие элементы не наследуют серый цвет рамки.
        }});
    }

    function numberUnderline(drawable) { // Подчёркивание использует тот же объект цвета, что и номер «колеса выбора».
        if (drawable == null) return null; // У некоторых тем игры соответствующий фон отсутствует.
        return extend(Packages.arc.scene.style.BaseDrawable, drawable, {draw: function(x, y, width, height) { // Копируем также штатные размеры и отступы Drawable.
            var old = Draw.getColor(), r = old.r, g = old.g, b = old.b, a = old.a, color = controls.numberColor; // Не создаём Color во время рисования.
            Draw.color(r * color.r, g * color.g, b * color.b, a); // Окрашиваем штатную линию выбранным RGB.
            try { drawable.draw(x, y, width, height); } finally { Draw.color(r, g, b, a); } // Восстанавливаем цвет текста и соседних элементов.
        }});
    }

    function validNumberHex(text) { // Принимаем строго #RRGGBB, включая строчные буквы.
        text = String(text); // TextField передаёт Java String.
        if (text.length != 7 || text.charAt(0) != "#") return false; // Не применяем незаконченный ввод.
        for (var i = 1; i < 7; i++) if ("0123456789abcdefABCDEF".indexOf(text.charAt(i)) < 0) return false; // Проверяем каждую цифру до передачи в Color.valueOf.
        return true; // Только полностью допустимый цвет меняет настройку.
    }

    // ШТАТНОЕ ОКНО ПЕРЕНАЗНАЧЕНИЯ КЛАВИШ
    function refreshBindingButtons() { // Переписываем подписи после назначения, отключения или сброса клавиши.
        for (var i = 0; i < bindingButtons.length; i++) { // Только кнопки текущей сборки формы.
            var entry = bindingButtons[i], key = controls.key(entry.binding); // Читаем актуальный KeyCode.
            entry.button.setText(key == KeyCode.unset ? entry.empty : String(key.value)); // value содержит английское название, независимо от языка игры.
        }
    }

    function openKeyBinding(bind) { // Повторяем штатную плашку KeybindDialog: та же разметка, размеры кнопок и способы назначения.
        api.closeWheel(); // Системный курсор и игровое колесо не должны мешать вводу новой клавиши.
        var modal = new Dialog(Core.bundle.get("keybind." + bind.name + ".name", bind.name)); // Обычный Dialog использует тот же стиль, что окно управления игры.
        modal.name = "buildwheel-rebind"; modal.title.setAlignment(Align.center); // Заголовок и центрирование соответствуют штатной плашке.
        modal.cont.add("@keybind.press").pad(40); // Текст «Нажмите клавишу» получает штатные отступы.
        var blocker = extend(InputListener, {touchDown: function(event) { event.cancel(); return true; }}); // Клик по кнопке плашки не назначает её ЛКМ как новую клавишу.
        modal.buttons.button("@back", Icon.left, () => modal.hide()).size(210, 64).name("buildwheel-rebind-back").get().addListener(blocker); // Назад оставляет прежнюю клавишу.
        modal.buttons.button("@settings.unbindKey", Icon.cancel, () => { bind.unset(); bind.save(); modal.hide(); }).size(210, 64).name("buildwheel-rebind-unset").get().addListener(blocker); // Отключение сохраняет штатный KeyCode.unset.
        modal.titleTable.getCells().first().pad(4); // Заголовок получает отступ из KeybindDialog.
        var accept = key => { bind.value = new KeyBind.Axis(key); bind.save(); modal.hide(); }; // Назначение хранится обычным методом KeyBind, без собственных форматов клавиш.
        modal.addListener(extend(InputListener, { // Штатная схема принимает любую клавишу или кнопку мыши.
            keyDown: function(event, key) { accept(key); return false; }, // Escape также можно назначить, как в стандартном окне управления.
            touchDown: function(event, x, y, pointer, button) { if (!Vars.mobile) accept(button); return false; } // Кнопки «Назад»/«Отключить» остановлены blocker выше.
        }));
        bindingModal = modal; // Горячие клавиши мода оставляют ввод этой плашке.
        var previous = controls.key(bind); // Запоминаем состояние до пользовательского изменения.
        modal.hidden(() => { refreshBindingButtons(); if (controls.key(bind) != previous) settingsChanged = true; }); // Значение уже сохранено до закрытия, поэтому подписи обновляются сразу.
        modal.show(); Core.scene.setScrollFocus(modal); // Фокус получает сама плашка, без скрытого родительского окна «Управление».
    }

    function keyButton(table, bind, empty, width, name, tooltip) { // Все кнопки одного типа получают одинаковую ширину.
        var key = controls.key(bind); // Подпись отсутствующего назначения остаётся названием кнопки.
        var button = table.button(key == KeyCode.unset ? empty : String(key.value), keyStyle, () => openKeyBinding(bind)).width(width).height(keySize).padTop(2).padBottom(2).padRight(4).name("buildwheel-key-" + name).get(); // Открываем штатное переназначение по ЛКМ.
        button.getLabel().setEllipsis(true); // Длинное английское название не перекрывает соседние кнопки.
        button.getLabelCell().minWidth(0); // Разрешаем узкой цифровой кнопке сократить длинное имя клавиши.
        bindingButtons.push({binding: bind, button: button, empty: empty}); // Для обновления не нужен update-обработчик.
        if (tooltip != null) addTooltip(button, tooltip); // Например, «Колесо 1» сохраняет смысл при назначении другой клавиши.
    }

    function resetBindings(binds) { // Сбрасываем только выбранную комбинацию, а не все назначения игры.
        for (var i = 0; i < binds.length; i++) { binds[i].resetToDefault(); binds[i].save(); } // Заводские значения принадлежат собственным KeyBind мода.
        settingsChanged = true; refreshBindingButtons(); // Форма сразу показывает восстановленные клавиши.
    }

    function resetKeyButton(table, binds, name) { // Кнопки сброса имеют тот же размер и одинаковое поведение во всех строках клавиш.
        var button = table.button(Icon.refresh, Styles.cleari, () => resetBindings(binds)).size(keySize).padTop(2).padBottom(2).padRight(4).name("buildwheel-key-reset-" + name).get(); // Только значок на прозрачном фоне; не изменяем назначения других групп.
        addTooltip(button, "Сбросить по умолчанию"); // Назначение кнопки объясняется при наведении.
    }

    function buildWheelKeys(layout) { // Номера 1–9,0 переносятся на следующую строку при нехватке места.
        var table = new Table(), line = new Table(), occupied = layout.start; // Каждый ряд независим: широкая первая кнопка не растягивает цифровые кнопки нижних рядов.
        table.left(); // Переносимые ряды начинаются от одного левого края.
        line.left(); line.add().width(layout.start); // Первую кнопку начинаем в общей колонке управления.
        keyButton(line, controls.bindings.wheelModifier, "Второстепенная", keyWide, "wheel-modifier", null); // Модификатор может быть отключён.
        line.add("+").width(keySpace); // Знак вместе со свободным местом занимает одну цифровую ячейку.
        occupied += keyWide + 4 + keySpace; // Учитываем кнопку, её отступы и знак плюс.
        for (var n = 1; n <= 10; n++) { // Используем привычный порядок стандартной клавиатуры.
            if (occupied + keySpace > layout.width) { table.add(line).width(layout.width).left().padBottom(5); table.row(); line = new Table(); line.left(); occupied = 0; } // Переносим кнопку целиком, сохраняя размер и резерв справа.
            var number = n % 10; // Последнее место соответствует колесу №0.
            keyButton(line, controls.bindings.wheels[number], String(number), keySize, "wheel-" + number, "Колесо " + number); // Каждая подсказка обозначает неизменный номер колеса.
            occupied += keySpace; // Подготавливаем место следующей кнопки.
        }
        if (occupied + resetSpace + keySpace > layout.width) { table.add(line).width(layout.width).left().padBottom(5); table.row(); line = new Table(); line.left(); } // Сброс тоже переносится, если остатка строки недостаточно.
        line.add().width(resetSpace); // Суммарный зазор перед сбросом равен половине ширины цифровой кнопки.
        var binds = [controls.bindings.wheelModifier].concat(controls.bindings.wheels); // Сброс затрагивает модификатор и все десять основных клавиш этой группы.
        resetKeyButton(line, binds, "wheels"); // Возвращаем Ctrl и цифры 1–9,0.
        table.add(line).width(layout.width).left(); // Последний ряд также остаётся внутри левой панели.
        return table; // Основная форма располагает эту группу под своим заголовком.
    }

    function buildKeyCombination(table, layout, title, modifier, primary, reset, name) { // Одна строка для меню или палитры с одинаковыми кнопками клавиш.
        var required = (keyWide + 4) * 2 + keySpace + (reset ? resetSpace + keySpace : 0); // Размер комбинации известен заранее, включая все отступы.
        var row = controlRow(table, layout, title, required).table; // На узком экране подпись и комбинация занимают разные строки.
        keyButton(row, modifier, "Второстепенная", keyWide, name + "-modifier", null); // Отключённая второстепенная клавиша не требуется для срабатывания основной.
        row.add("+").width(keySpace); // Знак с обоими отступами равен цифровой ячейке.
        keyButton(row, primary, "Основная", keyWide, name + "-key", null); // Без основной клавиши действие выключено.
        if (reset) { row.add().width(resetSpace); resetKeyButton(row, [modifier, primary], name); } // Для меню восстанавливаем Ctrl + минус.
    }

    function buildControlSettings(width) { // Собираем левую часть настроек, не создавая обработчиков кадров.
        bindingButtons = []; // Перестройка окна освобождает ссылки на прежние кнопки клавиш.
        if (keyStyle == null) { // Стиль создаётся один раз, а не при каждом открытии или переносе строки.
            keyStyle = new TextButton.TextButtonStyle(Styles.defaultt); // Копия не меняет штатные кнопки игры.
            keyStyle.up = keyBorder(0.55); keyStyle.over = keyBorder(0.75); keyStyle.down = keyBorder(0.9); // Меняется только яркость серой рамки, фон остаётся прозрачным.
            keyStyle.checked = keyStyle.up; keyStyle.checkedOver = keyStyle.over; keyStyle.disabled = keyStyle.up; // Дополнительные состояния также не получают серую заливку.
        }
        var table = new Table(); // Таблица располагается сразу под списком блоков.
        table.left(); // Сохраняем общий левый край списка и подписей настроек.
        var titles = ["Сдвиг колеса при нехватке места: 100%", "Отключить \"категория/выбор блока №\"", "Ограничить курсор диаметром колеса", "Ограничить курсор внутренним кругом", "Выбор колеса", "Радиальное меню", "Палитра", "Открывать палитру в главном меню", "Клавиша + колёсико мыши", "Отображать номер колеса"]; // Учитываем все подписи и наибольшую длину процента сдвига.
        var longest = 0, measure = new Label(""); // Один временный Label измеряет фактическую ширину игрового шрифта.
        for (var i = 0; i < titles.length; i++) { measure.setText(titles[i]); longest = Math.max(longest, measure.getPrefWidth() / Scl.scl()); } // Переводим измеренные пиксели в UI-единицы, как при расчёте ширины всей панели.
        var layout = {width: width - 18}; // Постоянно оставляем справа 18 UI-пикселей под полосу прокрутки.
        var combinationWidth = (keyWide + 4) * 2 + keySpace * 2 + resetSpace; // Две широкие кнопки, плюс, квадратный сброс и отступ перед ним.
        layout.start = Math.min(longest * 1.5, Math.max(120, layout.width - combinationWidth)); // Оптимальная колонка — полторы длины самой длинной подписи; при нехватке места сдвигаем влево.
        var shiftWidth = Math.min(302, layout.width - layout.start); // 302 — максимальная ширина слайдера прозрачности «Основного круга» при правой форме шириной 600.
        var shiftRow = controlRow(table, layout, "Сдвиг колеса при нехватке места: " + Math.round(controls.edgeShift * 100) + "%", shiftWidth); // Начало слайдера совпадает с общей колонкой переключателей.
        var shiftLabel = shiftRow.label; // Точное значение видно рядом с названием.
        var shift = new Slider(0, 100, 1, false); // 0 выключает сдвиг, 100 задаёт отступ в полный радиус.
        shift.name = "buildwheel-control-edgeShift"; shift.setValue(Math.round(controls.edgeShift * 100), false); // Показываем сохранённое значение без события изменения.
        shift.moved(value => { controls.set("edgeShift", Number(value) / 100); shiftLabel.setText("Сдвиг колеса при нехватке места: " + Math.round(value) + "%"); settingsChanged = true; }); // Сохраняем долю и обновляем подпись только при перемещении ползунка.
        shiftRow.table.add(shift).width(shiftWidth).height(44); // Заполняем остаток строки до резерва прокрутки, не превышая предельную длину.
        addTooltip(shift, "Доля на которую колесо строительства отодвигается при нехватке места на экране, телепортируя и положение мыши."); // Объясняем связь колеса и физического курсора.
        addControlToggle(table, layout, "Отключить \"категория/выбор блока №\"", "disableNumberKeys", "В Mindustry цифры 0-9 в настройках управления по умолчанию используются как быстрые клавиши выбора категорий и блоков, тем самым присваивая каждому блоку свой номер."); // По умолчанию цифровой выбор игры отключён.
        addControlToggle(table, layout, "Ограничить курсор диаметром колеса", "clipOuter", "Останавливает движение курсора за границу диаметра открытого колеса строительства у это самой границы."); // Ограничиваем расстояние от центра внешним радиусом.
        addControlToggle(table, layout, "Ограничить курсор внутренним кругом", "clipInner", "Останавливает движение курсора чуть за границей внутренного круга колеса строительства - для молниеносного выбора."); // При двух включённых границах действует меньшая окружность.
        table.add("Выбор колеса").left().padTop(8); table.row(); // Заголовок отделяется от переносимых кнопок.
        table.add(buildWheelKeys(layout)).width(layout.width).left().padBottom(5); table.row(); // Включаем кнопку 0 в общий порядок переноса и соблюдаем правый резерв.
        buildKeyCombination(table, layout, "Радиальное меню", controls.bindings.menuModifier, controls.bindings.menuKey, true, "menu"); // Сброс этой строки не меняет клавиши колёс.
        buildKeyCombination(table, layout, "Палитра", controls.bindings.paletteModifier, controls.bindings.paletteKey, false, "palette"); // По умолчанию обе кнопки не назначены.
        addControlToggle(table, layout, "Открывать палитру в главном меню", "paletteInMenu", null); // Разрешение применяется только к открытию палитры горячей клавишей.
        var scrollRow = controlRow(table, layout, "Клавиша + колёсико мыши", keyWide + 4).table; // Прокрутке нужна только одна удерживаемая клавиша.
        keyButton(scrollRow, controls.bindings.scrollKey, "Основная", keyWide, "scroll-key", "Клавиша перехватывает 'Масштабирование' колёсиком, по умолчанию отключено."); // До назначения клавиши прокрутка остаётся обычной.
        var numberRow = controlRow(table, layout, "Отображать номер колеса", 44 + 8 + 132).table; // Номер и его цвет располагаются в одной строке.
        var showNumber = new CheckBox(""); showNumber.setChecked(controls.showNumber); showNumber.name = "buildwheel-control-showNumber"; // По умолчанию номер выключен.
        showNumber.left(); // Начало видимого значка совпадает с остальными переключателями и слайдером сдвига.
        showNumber.changed(() => { controls.set("showNumber", showNumber.isChecked()); settingsChanged = true; }); // Новый режим действует при следующем открытии или переключении колеса.
        numberRow.add(showNumber).size(44); // Переключатель начинается в той же колонке, что и остальные.
        var numberHex = new TextField("#" + String(controls.numberColor.toString()).substring(0, 6).toUpperCase()); // По умолчанию показываем белый #FFFFFF.
        var colorStyle = new TextField.TextFieldStyle(numberHex.getStyle()); colorStyle.invalidBackground = numberHex.getStyle().invalidBackground; // Копия сохраняет также штатное выделение ошибочного ввода.
        colorStyle.background = numberUnderline(colorStyle.background); colorStyle.focusedBackground = numberUnderline(colorStyle.focusedBackground); // Обе линии читают актуальный цвет без пересоздания стиля.
        numberHex.setStyle(colorStyle); numberHex.name = "buildwheel-control-numberColor"; // Это обычное поле HEX без открытия редактора HSV.
        numberHex.setMaxLength(7); numberHex.setValidator(validNumberHex); numberHex.setProgrammaticChangeEvents(false); // Незаконченный ввод не применяется, длина ограничена форматом #RRGGBB.
        numberHex.changed(() => { if (validNumberHex(numberHex.getText())) { controls.set("numberColor", Color.valueOf(numberHex.getText())); settingsChanged = true; } }); // Допустимый RGB сразу меняет подчёркивание и цвет номера.
        numberRow.add(numberHex).width(132).height(44).padLeft(8); // Размер HEX совпадает с полем «Основного круга» в широкой правой форме.
        return table; // Форма пересоздаётся только при открытии меню или изменении разрешения.
    }

    // ------------------------------------------------------------
    // ПОСТРОЕНИЕ ОКНА НАСТРОЕК
    // ------------------------------------------------------------
    // Вызывается при открытии настроек и изменении размера окна.
    // *При обычном вводе текста пересобирается только таблица блоков через rebuildGrid.
    function buildInterface() {       
        // РАЗМЕРЫ И СООТНОШЕНИЯ МЕНЮ НАСТРОЕК
        var screenWidth = Core.scene.getWidth() / Scl.scl();  // Cell.width/height сами умножают числа на Scl. Деление Scl.scl() переводит реальные
        var screenHeight = Core.scene.getHeight() / Scl.scl();// размеры сцены в UI-единицы, сохраняя доли экрана при любом масштабе UI.
        var contentWidth = screenWidth * 0.92; // Всё содержимое занимает 92% ширины экрана.
        var listWidth = Math.max(contentWidth * 0.50, 372); // 50% ширины отводим левой части; минимум 372 сохраняет одну строку комбинации клавиш и не даёт ей налезать на правую часть.
        previewSize = wheelView.getVisual(editedWheel).appearance.diameter; // «Манекен» получает размер из комплекта выбранного номера.
        var previewUiSize = previewSize / Scl.scl(); // Cell.size сам применит Scl: делим, чтобы размер не увеличился повторно.
        var appearanceWidth = Math.max(240, Math.min(contentWidth * 0.45 + 40, 600)); // Выбираем ширину формы по экрану (запас 40 распределяется между полями размера и HEX).
        baseRightWidth = Math.max(contentWidth * 0.45, appearanceWidth); // Задаём минимальную ширину правой панели по экрану и форме настроек.
        var rightWidth = Math.max(baseRightWidth, previewUiSize + 36 + toolsReserve * 2); // Выделяем место для «манекена» и 36 UI-единиц под боковой слайдер с отступом.
        var listHeight = screenHeight * 0.46; // Высота прокручиваемого списка блоков — 46% высоты экрана.
        gridColumns = Math.max(1, Math.floor((listWidth - 24) / 52)); // 52 = кнопка 48 пикселей + отступы по 2 пикселя с обеих сторон; 24 резерв пикселей под край/прокрутку.

        // ЛЕВАЯ ЧАСТЬ: СТРОКА ПОИСКА
        dialog.cont.clearChildren(); //очищаем главное окно
        var body = new Table();
        body.top(); //это выравнивание по верхнему краю    
        var left = new Table(); //поиск, кнопки категорий и лист блоков
        left.top();
        var searchRow = new Table(); // Значок и поле находятся в одной строке, остальные элементы левой части — под ней.
        searchRow.image(Icon.zoom).size(44).name("buildwheel-search-icon"); // Высота значка совпадает с высотой поля поиска.
        searchField = searchRow.field(searchText, text => {//поиск по названию
            searchText = String(text); // Callback поля передаёт новый текст; ту же сходу сохраняем его как строку JS.
            rebuildGrid();
        }).height(44).growX().name("buildwheel-search").get(); // фиксированная высота поиска 44, автоматическая ширина на всю ширину лева; системное имя "buildwheel-search"; get возвращает созданный TextField.
        searchField.setMessageText("Поиск блока..."); // Подсказка пустого поля.
        left.add(searchRow).growX();
        left.row(); //заканчиваем со строкой, перенося последующие элементы UI на новый ряд
        
        // ЛЕВАЯ ЧАСТЬ: ОБЩАЯ СЕТКА КАМПАНИЙ И КАТЕГОРИЙ.
        //============================================================================
        // Кампании
        //============================================================================
        var filters = new Table();
        filters.left();
        campaignButtons = [];
        categoryButtons = [];
        var filterSize = Math.min(41, listWidth / 5);
        var filterColumns = Math.max(1, Math.floor(listWidth / filterSize));
        var filterCount = 0;
        // Один счётчик для всех кнопок: новый ряд всегда начинается от левого края общей таблицы.
        function nextFilterCell() {
            if (filterCount > 0 && filterCount % filterColumns == 0) filters.row();
            filterCount++;
        }
        var planets = Vars.content.planets();
        for (var p = 0; p < planets.size; p++) {
            var planet = planets.get(p);
            // Показываем видимые доступные планеты с секторами; звёзды и декоративные спутники пропускаем.
            if (!planet.removed && planet.visible && planet.accessible && planet.isLandable()) {
                nextFilterCell();
                addCampaignButton(filters, planet, filterSize);
            }
        }
        //============================================================================
        nextFilterCell();
        addCategoryButton(filters, null, filterSize); // После кампаний — «Всё», затем остальные категории.
        for (var i = 0; i < Category.all.length; i++) {
            nextFilterCell();
            addCategoryButton(filters, Category.all[i], filterSize);
        }
        left.add(filters).growX().padTop(8).padBottom(8); // Отделяем оба набора кнопок от поиска и списка блоков.
        left.row();

        // ЛЕВАЯ ЧАСТЬ: ТАБЛИЦА БЛОКОВ
        grid = new Table();
        grid.top().left(); //выравниваем по верхнему-левому краю
        blockPane = new ScrollPane(grid, Styles.defaultPane); //добавляем стандартную прокрутку
        blockPane.name = "buildwheel-block-list";
        blockPane.setScrollingDisabled(true, false); // Горизонтальная прокрутка отключена, вертикальная разрешена.
        blockPane.setFadeScrollBars(false); // Если полоса прокрутки нужна, она не исчезает со временем.
        blockPane.setOverscroll(false, false); // Отключаем «резиновое» растягивание за пределы списка.
        blockPane.addListener(extend(InputListener, {
            scrolled: function(event, x, y, amountX, amountY) {// Перехватываем прокрутку прокрутку списка.
                if (event.handled) event.stop(); // handled уже установлен ScrollPane; stop не даёт событию дойти до внешнего контейнера (не передаём колёсико на другие прокрутки)
                return false; // Сами повторно прокрутку не выполняем: штатный слушатель уже сделал это.
            }
        }));
        left.add(blockPane).size(listWidth, listHeight); //Помещаем таблицу блоков в левую таблицу с адаптивными размерами
        left.row(); // Общие настройки начинаются под прокручиваемым списком блоков.
        left.add(buildControlSettings(listWidth)).width(listWidth).left().padTop(12); // Помещаем управление в ту же левую колонку.
        body.add(left).width(listWidth).top();

        // ПРАВАЯ ЧАСТЬ: номер колеса, выбранный сектор, масштаб и манекен.
        var right = new Table();
        right.top();

        // ПРАВАЯ ЧАСТЬ: ПОЛЗУНОК ВЫБОРА ВКЛАДКИ КОЛЕСА ВЫБОРА У МАНЕКЕНА
        wheelLabel = right.add("Колесо " + editedWheel).growX().get(); //Показ номера активного макета колеса на всю ширину, через Label для изменений
        right.row();
        wheelSlider = new Slider(1, wheelCount, 1, false); // Позиции 1–10 отображают колёса 1–9, 0; false — горизонтальная ориентация.
        wheelSlider.name = "buildwheel-wheel-number";
        wheelSlider.setValue(editedWheel == 0 ? wheelCount : editedWheel, false); // Колесо 0 показываем в последней позиции 10, без запуска moved.
        wheelSlider.moved(value => {//Callback на постоянное выполнение при сдвиге ползунка
            editedWheel = Math.round(value) % wheelCount; // Позиции 1–9 сохраняют номер; позиция 10 превращается в номер 0.
            editedSector = -1; // При смене колеса прежний сектор автоматически не выбираем.
            wheelLabel.setText("Колесо " + editedWheel);
            appearanceEditor.selectWheel(editedWheel); // Переключаем значения полей, подчёркивания и слайдеры на независимый визуал этого номера.
            resizePreview(); // Подгоняем тот же виджет «манекена» и угловые кнопки под диаметр другого комплекта.
            refreshLock(); // Открытый замок предлагает закрепить новый выбранный номер; закрытый продолжает показывать прежний источник.
            refreshSectorControls(); //обновляем видимые настройки сектора
        });
        var wheelNumberRow = new Table(); // Объединяем слайдер номера колеса и кнопку палитры в одну строку.
        wheelNumberRow.add(wheelSlider).growX().height(32); // Слайдер занимает всю ширину строки до кнопки справа.
        wheelNumberRow.button("Палитра", Core.atlas.drawable("buildwheel-icon_color"), 24, () => palette.show()) // Берём иконку из sprites мода и открываем окно палитры.
            .width(144).height(44).name("buildwheel-open-palette"); // Закрепляем кнопку у правого края без всплывающей подсказки.
        right.add(wheelNumberRow).growX().padTop(8).padBottom(8); // Отступ сверху сохраняет место под высокий стандартный бегунок слайдера.
        right.row();

        // ПРАВАЯ ЧАСТЬ: ТЕКСТОВАЯ СТРОКА ИМЕНИ БЛОКА СЕКТОРА
        sectorLabelCell = right.add("").width(rightWidth); // Создаём ячейку подписи сектора и запоминаем её для изменения ширины.
        sectorLabel = sectorLabelCell.get(); // Получаем сам Label, чтобы обновлять текст выбранного сектора и блока.
        sectorLabel.setWrap(true); // автоматический перенос длинного текста на новую строк
        right.row();
        scaleLabel = right.add("").growX().padTop(6).padBottom(6).get(); //вывод выбранного блока в секторе
        right.row();

        // ПРАВАЯ ЧАСТЬ: ПОЛЗУНОК РАЗМЕРА ИКОНКИ
        var editor = new Table();
        previewEditor = editor; // Сохраняем таблицу «манекена», чтобы пересчитывать её раскладку при изменении диаметра.
        scaleSlider = new Slider(40, 200, 1, true); // Размер 40–200%, шаг 1%; true — вертикальный ползунок слева от круга.
        scaleSlider.name = "buildwheel-icon-scale";
        scaleSlider.moved(value => {
            if (editedSector < 0) return;
            iconScales[editedWheel][editedSector] = value / 100; // Переводим проценты в коэффициент: например, 175 превращается в 1.75.
            scaleLabel.setText("Размер иконки: " + Math.round(value) + "%");
            saveSlot(); // Обновляем данные Core.settings в памяти; файл здесь ещё не записывается.
        });
        scaleSliderCell = editor.add(scaleSlider).width(28).height(previewUiSize).padRight(8); // Добавляем боковой слайдер высотой с «манекен» и сохраняем его ячейку.
        previewCell = editor.add(createPreview()).size(previewUiSize); // Создаём «манекен» и сохраняем его ячейку (Cell применяет масштаб UI к указанному размеру).
        var previewRow = new Stack(); // Слои позволяют добавить действия в свободную область без колонки, сдвигающей «манекен».
        var centeredPreview = new Table(); // Основной слой сохраняет прежнее центрирование круга и слайдера иконки.
        centeredPreview.top(); centeredPreview.add(editor).top(); // При увеличении высоты строки «манекен» остаётся у прежнего верхнего края.
        var toolsLayer = new Table(); // Второй слой содержит только вертикальную панель действий слева.
        toolsLayer.left().bottom(); toolsLayer.add(createWheelTools()).left().bottom(); // Нижняя кнопка располагается непосредственно над группой «Основной круг».
        previewRow.add(centeredPreview); previewRow.add(toolsLayer); // Прозрачные таблицы не закрывают находящиеся под ними кнопки и слайдеры.
        previewRowCell = right.add(previewRow).width(rightWidth).height(Math.max(previewUiSize, toolsHeight)).top(); // Учитываем панель по высоте, не меняя положение самого «манекена» внутри строки.
        right.row(); // Следующий ряд правой панели отводим настройкам внешнего вида.
        right.add(appearanceEditor.build(appearanceWidth, editedWheel)).width(appearanceWidth).left().padTop(12); // Строим форму для выбранного номера под «манекеном» с верхним отступом.
        rightPanelCell = body.add(right).width(rightWidth).padLeft(12).top(); // Добавляем правую панель в меню и сохраняем её ячейку для изменения ширины.


        var contentPane = new ScrollPane(body, Styles.defaultPane); //помещаем всё меню настроек в контейнер прокрутки, защищая от обрезки при малом разрешении
        contentPane.name = "buildwheel-settings-scroll"; // Общая прокрутка обслуживает и настройки под списком блоков.
        contentPane.setScrollingDisabled(false, false); // На узком окне прокручиваем содержимое и по горизонтали, сохраняя размер манекена.
        contentPane.setFadeScrollBars(false);
        contentPane.setScrollbarsOnTop(false); // Полосы общей прокрутки получают своё место, не закрывая последние настройки.
        contentPane.addListener(extend(InputListener, { // Меняем фокус прокрутки только при фактическом движении над открытым меню.
            mouseMoved: function(event) {
                var target = event.targetActor != null && event.targetActor.isDescendantOf(blockPane) ? blockPane : contentPane; // Над блоками прокручиваем список, над настройками — всё содержимое меню.
                if (Core.scene.getScrollFocus() !== target) Core.scene.setScrollFocus(target); // Не генерируем повторные события фокуса при движении внутри той же области.
                return false; // Поля и кнопки продолжают получать своё обычное наведение.
            }
        }));
        dialog.cont.add(contentPane).width(contentWidth).growY().minHeight(0); // В наше Меню контейнер прокрутки: Заполняем оставшуюся высоту диалога; minHeight(0) разрешает сжатие с прокруткой.
        rebuildGrid();
        refreshSectorControls();
    }

    // ------------------------------------------------------------
    // ОТКРЫТИЕ, ЗАКРЫТИЕ И ПЕРЕСТРОЙКА ПО РАЗМЕРУ ОКНА
    // ------------------------------------------------------------
    function hide() { //Закрыть меню настроек
        if (bindingModal != null && bindingModal.isShown()) bindingModal.hide(); // Сброс мира не оставляет плашку назначения над закрытым меню.
        saves.hide(); // Не оставляем браузер или его дочернее окно над закрытым меню.
        palette.hide(); // При закрытии всего редактора палитра тоже должна исчезнуть.
        if (dialog.isShown()) dialog.hide();
    }

    //Открытие всего меню
    function show(wheelNumber) {
        if (!Vars.state.isGame() || dialog.isShown()) return; // Не открываем из главного меню и не создаём повторное открытие того же окна.
        // *Сохраняем номер ДО closeWheel/show: слушатель в main.js сбросит
        // *activeWheelNumber при открытии любого диалога, включая наше меню.
        editedWheel = validIndex(wheelNumber, wheelCount) ? wheelNumber : 1; // При открытом игровом колесе берём его номер, иначе начинаем с колеса 1.
        editedSector = -1;
        api.closeWheel(); // Закрываем "колесо выбора" перед показом редактора.
        buildInterface();
        dialog.show();
        Core.app.post(focusBlockList); // После показа передаём прокрутку списку блоков.
    }

    // КНОПКА «РАДИАЛЬНОГО МЕНЮ» В ШТАТНОМ МЕНЮ ESC
    var pauseButtonInstalled = false, pauseButtonQueued = false; // Проверяем занятое место только при первом успешном открытии, без update-обработчиков.
    function openFromPause() { Vars.ui.paused.hide(); show(editedWheel); } // Обработчик не удерживает временный список занятых мест, собранный при первом открытии.
    if (Vars.ui.paused != null) Vars.ui.paused.shown(() => { // В этот момент штатное меню уже построило своё содержимое.
        if (pauseButtonInstalled || pauseButtonQueued) return; // Повторный показ не создаёт второй кнопки или второй проверки.
        pauseButtonQueued = true; // Не добавляем одинаковые отложенные задачи.
        Core.app.post(() => { // Даём остальным обработчикам показа, включая другие моды, добавить свои элементы.
            pauseButtonQueued = false; // Если окно успело закрыться, проверим место при следующем открытии.
            var paused = Vars.ui.paused; // Используем именно игровое меню Esc, а не собственный Dialog.
            if (pauseButtonInstalled || !paused.isShown()) return; // Не меняем раскладку уже закрытого окна.
            paused.validate(); // Координаты существующих кнопок должны соответствовать текущему размеру окна.
            var stack = paused.cont.parent; // В PausedDialog содержимое и кнопка «Настроить правила» лежат в одном Stack.
            if (!(stack instanceof Stack)) return; // Не вмешиваемся, если другой мод полностью заменил штатную структуру.
            var occupied = [], point = new Vec2(), size = Scl.scl(70), gap = Scl.scl(6); // Размер повторяет кнопку «Настроить правила», зазор отделяет соседние рамки.
            function collect(element) { // Один обход дополнительных слоёв находит кнопки других модов и штатную кнопку правил.
                if (element === paused.cont) return; // Центральные строки самого меню не являются угловой панелью.
                if (element instanceof Button) { // Сохраняем также временно скрытые кнопки: их появление не должно создать наложение.
                    element.localToAscendantCoordinates(stack, point.set(0, 0)); // Переводим левый нижний угол в координаты общего слоя.
                    occupied.push({x: point.x, y: point.y, width: element.getWidth(), height: element.getHeight()}); // Эти данные нужны только до выбора свободного места.
                } else if (element instanceof Group) { // Прозрачные таблицы сами не занимают место, проверяем их дочерние кнопки.
                    var children = element.getChildren(); // Список не меняется во время обхода.
                    for (var i = 0; i < children.size; i++) collect(children.get(i)); // Обрабатываем также вложенные панели модов.
                }
            }
            collect(stack); // Проверяем штатное нижнее левое место до добавления собственной кнопки.
            var bottom = 0, moved; // Изначально хотим занять ту же позицию, что и угловая кнопка правил.
            do { // После сдвига проверяем следующее место; каждая коллизия поднимает кнопку выше.
                moved = false; // Заканчиваем, когда прямоугольник больше ни с чем не пересекается.
                for (var i = 0; i < occupied.length; i++) { // Проверка выполняется один раз за весь срок работы мода.
                    var other = occupied[i]; // Следующая уже размещённая кнопка.
                    if (other.x < size && other.x + other.width > 0 && other.y < bottom + size && other.y + other.height > bottom) { bottom = other.y + other.height + gap; moved = true; } // При занятости поднимаем кнопку над препятствием с небольшим отступом.
                }
            } while (moved);
            var layer = new Table(); layer.bottom().left(); // Stack растягивает прозрачный слой вместе с окном при изменении разрешения.
            var button = layer.button(Icon.commandRally, Styles.defaulti, openFromPause).size(70).padBottom(bottom / Scl.scl()).name("buildwheel-pause-settings").get(); // Рамка и размер соответствуют штатной кнопке; нажатие открывает настройки мода.
            addTooltip(button, "Радиальное меню"); // Общий стиль подсказок закрепляет текст под началом кнопки.
            stack.add(layer); // Не меняем содержимое, которое PausedDialog пересоздаёт при каждом показе.
            pauseButtonInstalled = true; // Раскладка сохраняется в слое, повторные открытия ничего не сканируют.
        });
    });

    // Кнопка выхода
    dialog.buttons.button("Назад", Icon.left, () => hide()).size(200, 54).name("buildwheel-back");
    // При начале закрытия снимаем выделение и сохраняем изменённые настройки.
    // Сама анимация исчезновения диалога при этом ещё может продолжаться.
    dialog.hidden(() => {
        saves.hide(); // Внешнее закрытие родительского окна также закрывает библиотеку и её плашки.
        palette.hide(); // Закрываем дочернее окно также при внешнем вызове dialog.hide().
        editedSector = -1;
        flushSettings();
    });

    //Обновление интерфейса при изменения размеров экрана
    dialog.addListener(extend(ResizeListener, {
        resized: function() {
            if (dialog.isShown()) {
                buildInterface();
                // Обычный dialog.resized() после callback ещё раз выбирает первую
                // ScrollPane. Прямой ResizeListener оставляет фокус нашему списку.
                Core.app.post(focusBlockList);
            }
        }
    }));

    //Подписка на события - поводы для выхода
    Events.on(StateChangeEvent, event => {
        if (event.to == GameState.State.menu) hide(); // Выход в главное меню закрывает редактор; обычная пауза его не закрывает.
    });
    Events.on(ResetEvent, () => hide()); // При сбросе мира настройки не должны оставаться поверх следующей карты.
    Events.on(DisposeEvent, () => flushSettings()); // Сохраняем оставшиеся изменения при завершении приложения.

    // ------------------------------------------------------------
    // КЛАВИШИ ЗАКРЫТИЯ МЕНЮ (СОЧЕТАНИЕ ОТКРЫТИЯ НАХОДИТСЯ В MAIN.JS)
    // ------------------------------------------------------------
    // Основной InputProcessor в main.js передаёт сюда события до обработчиков игры.
    // true означает «меню забрало событие», false — «пусть обрабатывают остальные».
    function isCloseKey(key) {
        return key == KeyCode.escape || key == KeyCode.back
            || (Binding.menu.value != null && key == Binding.menu.value.key); // Кроме Esc/Назад учитываем переназначенную игровую клавишу меню.
    }

    // Эти методы вызывает уже существующий InputProcessor в main.js.
    // Отдельный глобальный обработчик ввода и покадровая проверка не нужны.
    function handleKeyDown(key) {
        if (palette.isShown() && isCloseKey(key) && topDialog() != null && String(topDialog().name) == "buildwheel-palette") { // Самостоятельная палитра закрывается той же клавишей, что и палитра поверх настроек.
            closeKeysCaptured[key.ordinal()] = true; Core.app.post(palette.hide); return true; // Сначала закрываем палитру и поглощаем отпускание клавиши.
        }
        if (dialog.isShown()) {
            if (isCloseKey(key)) {
                if (saves.isShown()) { // Сначала закрываем браузер, оставляя «Радиальное меню» открытым.
                    if (!saves.closeFromKey()) return false; // Штатный ввод имени, редактор и подтверждение получают Escape самостоятельно.
                    closeKeysCaptured[key.ordinal()] = true; // Поглощаем и отпускание собственной клавиши закрытия браузера.
                    return true; // Родительское окно этим нажатием не закрывается.
                }
                if (!palette.isShown() && topDialog() !== dialog) return false; // Не забираем Escape у штатной плашки сохранения, открытой кнопкой панели.
                closeKeysCaptured[key.ordinal()] = true; // Запоминаем перехваченную клавишу, чтобы позже поглотить её отпускание.
                Core.app.post(palette.isShown() ? palette.hide : hide); // Сначала закрываем палитру; следующее нажатие закроет основное меню настроек.
                return true;
            }
            return false;
        }
        return false;
    }

    // Завершаем только собственные перехваты: чужие отпускания должны дойти до игры.
    function handleKeyUp(key) {
        // Отпускания поглощаются даже после открытия/закрытия меню, чтобы игра
        // не получила keyRelease без соответствующего keyDown.
        if (closeKeysCaptured[key.ordinal()]) {
            closeKeysCaptured[key.ordinal()] = false;
            return true;
        }
        return false;
    }

    // ------------------------------------------------------------
    // ПУБЛИЧНЫЕ МЕТОДЫ ДЛЯ MAIN.JS
    // ------------------------------------------------------------
    // Возвращаем функции, а не результаты их вызова. Внутренние виджеты и
    // переменные редактора остаются внутри create().
    return {
        show: show,
        showPalette: function() { api.closeWheel(); palette.show(); }, // Горячая клавиша открывает палитру напрямую, не создавая родительское окно настроек.
        isRebinding: function() { // main.js оставляет ввод новой клавиши штатному диалогу игры.
            if (bindingModal != null && bindingModal.isShown()) return true; // Плашка открыта собственной кнопкой мода.
            if (!Core.scene.hasDialog() || Vars.ui.controls == null) return false; // В игре без окон нет ни отражения, ни дополнительного поиска.
            if (nativeRebindField == null) { nativeRebindField = java.lang.Class.forName("mindustry.ui.dialogs.KeybindDialog").getDeclaredField("rebindDialog"); nativeRebindField.setAccessible(true); } // Поле базового класса подходит и модифицированному наследнику меню управления; ищем его один раз.
            var nativeModal = nativeRebindField.get(Vars.ui.controls); // Та же плашка могла быть открыта из стандартного раздела «Управление».
            return nativeModal != null && nativeModal.isShown(); // Назначение через ванильное меню также не должно запускать палитру или колесо.
        },
        getIconScale: getIconScale, // Игровое колесо запрашивает сохранённый масштаб своей иконки.
        handleKeyDown: handleKeyDown, // Закрытие настроек клавишей игрового меню или назначенной на неё кнопкой мыши.
        handleKeyUp: handleKeyUp // Отпускания перехваченных клавиш закрытия, даже если окно уже исчезло.
    };
};
