// BuildWheel — пункт 3: меню назначения блоков и настройки иконок.
// Подключается через require("menu"); интерфейс создаётся после ClientLoadEvent.
// API виджетов: https://github.com/Anuken/Arc/tree/master/arc-core/src/arc/scene/ui
// Категории и иконки: mindustry.ui.fragments.PlacementFragment версии игры.
"use strict"; // В частности, запрещает случайное присваивание не объявленной переменной.
var uiSounds = require("sounds"); // Общий модуль уже загружает только четыре используемых звука.

// ------------------------------------------------------------
// СОЗДАНИЕ РЕДАКТОРА И ЕГО СОСТОЯНИЕ
// ------------------------------------------------------------
// main.js вызывает create один раз после ClientLoadEvent.
// Вложенные функции затем работают с общими переменными этого вызова.
// Окно создаётся здесь, но появится на экране только после show().
// exports — публичная часть модуля. api содержит только функции и параметры,
// явно переданные из main.js; обратного require("main") здесь нет.
exports.create = function(api) {
    var wheelView = api.wheelView; // Общая основа с игровым колесом; настройки внешнего вида не копируем.
    var wheelCount = 10; // Номер колеса 0–9.
    var sectorCount = wheelView.sectorCount;
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
    var gridColumns = 1;
    var previewSize = 0; // Диаметр манекена в координатах сцены; берём из общих настроек колеса.
    var closeKeysCaptured = []; // Отметки клавиш закрытия; индексом служит ordinal() игрового KeyCode.

    // ------------------------------------------------------------
    // КЛЮЧИ НАСТРОЕК И ПРОВЕРКА НОМЕРОВ
    // ------------------------------------------------------------
    function slotKey(wheelNumber, sectorNumber) { //Персональные адреса-имена на слоты. Например, buildwheel.slot.3.0 — северный слот колеса 3.
        return settingsPrefix + wheelNumber + "." + sectorNumber;
    }

    function validIndex(value, count) {
        return value >= 0 && value < count && value == Math.floor(value); // Разрешены только целые индексы в пределах массива.
    }

    function getIconScale(wheelNumber, sectorNumber) {
        if (!validIndex(wheelNumber, wheelCount) || !validIndex(sectorNumber, sectorCount)) return 1; // Защита от неверных номеров: возвращаем обычный масштаб 100%.
        return iconScales[wheelNumber][sectorNumber];
    }

    // ------------------------------------------------------------
    // ВОССОЗДАНИЕ СОХРАНЁННЫХ СЛОТОВ КОЛЕСА ИЗ КЭША НАСТРОЕК
    // ------------------------------------------------------------
    // Core.settings хранит имена блоков.
    for (var w = 0; w < wheelCount; w++) {
        iconScales[w] = []; // Каждому колесу создаём свой массив 'масштабов иконок'.
        for (var s = 0; s < sectorCount; s++) {
            var key = slotKey(w, s); // генерирует персональные текстовые адреса каждому сектору
            var savedName = String(Core.settings.getString(key + ".block", "")); //проверяем сохранененные адреса и при наличии вытягиваем те блоки из Core.settings
            if (savedName.length > 0) {// Если мод с блоком удалён, content.block вернёт null: слот пуст.
                api.setBlock(w, s, Vars.content.block(savedName)); // Через функцию main.js вставляем в колесо блок через адрес найденный в игре
            }
            var scale = Number(Core.settings.getFloat(key + ".scale", 1)); // Читаем параметр размера в Java Float как число JS; при отсутствии настройки берём 1.
            iconScales[w][s] = isFinite(scale) ? Math.max(0.4, Math.min(2, scale)) : 1; // Ограничиваем 40–200%; для NaN/бесконечности используем 100%.
        }
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
        var selected = editedSector >= 0; // Есть ли 'зелёный' сектор, для которого разрешено менять настройки?
        var block = selected ? api.getBlock(editedWheel, editedSector) : null; //ставим нужный блок
        sectorLabel.setText(selected
            ? directionNames[editedSector] + ": " + (block == null ? "пустой слот" : String(block.localizedName))
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
        cell.tooltip(String(block.localizedName) + "\n" + block.name); // Подсказка показывает название игроку и внутреннее имя блока.
        var button = cell.get(); // Из ячейки Cell получаем сам Java-объект кнопки.
        button.resizeImage(32); // Размер картинки внутри кнопки; сама кнопка остаётся размером 48.
        button.setProgrammaticChangeEvents(false); // Изменения состояния кнопки из кода не порождают ChangeEvent.
        uiSounds.muteDefaultClick(button); // Назначение блока использует add_block_1 вместо стандартного звука интерфейся.
        blockButtons.push({button: button, block: block}); // Сохраняем связь изображения-кнопки с соответствующим блоком.
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
            // Исследования, планета и ресурсы не фильтруются; «Всё» отключает только фильтры остальных категорий.
            if (!block.placeablePlayer || (category != null && block.category != category)
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

    //Добавление категории блоков
    function addCategoryButton(table, nextCategory, size) {       
        var allCategories = nextCategory == null; // Для «Всё» передаём null; остальные вкладки используют игровые Category.
        var categoryName = allCategories ? "all" : String(nextCategory.name());
        var categoryIcon = allCategories ? Icon.folderEmpty : Vars.ui.getIcon(categoryName);
        var cell = table.button(categoryIcon, Styles.squareTogglei,
            () => chooseCategory(nextCategory)); //запоминаем какую категорию активируем кнопкой
        cell.size(size).name("buildwheel-category-" + categoryName); // Кнопки соприкасаются рамками, без внешних отступов.
        cell.tooltip(allCategories ? "Всё" : Core.bundle.get("blocks." + categoryName, categoryName));
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
        preview.name = "buildwheel-preview";

        // Регистрируем нажатие на 'манекен', ожидание события
        preview.addListener(extend(InputListener, {
            touchDown: function(event, x, y, pointer, button) {
                if (button != KeyCode.mouseLeft) return false;
                var sector = wheelView.sectorAt(preview, x, y); // Те же границы кольца и нумерация, что в игре.
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
        clearSelectionButton.addListener(new Tooltip(table => table.add("Снять выделение сектора")));
        group.addChild(clearSelectionButton);

        clearSlotButton = new ImageButton(createClearSlotIcon(), Styles.cleari);
        clearSlotButton.name = "buildwheel-clear-slot";
        clearSlotButton.setSize(crossSize, crossSize); // Обе угловые кнопки у 'манекена' одинакового размера.
        clearSlotButton.setPosition(0, previewSize - crossSize); // Освободившийся верхний левый угол 'Сброс блока'.
        clearSlotButton.clicked(() => assignBlock(null)); // Очищаем и сохраняем слот; зелёное выделение и масштаб остаются.
        uiSounds.muteDefaultClick(clearSlotButton);
        clearSlotButton.addListener(new Tooltip(table => table.add("Удалить блок из сектора")));
        group.addChild(clearSlotButton);
        return group;
    }

    // Указывает сцене, какой ScrollPane должен получать вращение колёсика.
    // Проверка isShown не даёт отложенной задаче забрать фокус после закрытия меню.
    function focusBlockList() {
        if (dialog.isShown()) Core.scene.setScrollFocus(blockPane);
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
        var listWidth = contentWidth * 0.50; // 50% ширины отводим левой части.
        previewSize = wheelView.appearance.diameter; // Один источник размера для манекена и игрового колеса.
        var previewUiSize = previewSize / Scl.scl(); // Cell.size сам применит Scl: делим, чтобы размер не увеличился повторно.
        var rightWidth = Math.max(contentWidth * 0.45, previewUiSize + 36); // 45% или не меньше манекена + 36 (ползунок шириной 28 и отступ 8).
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
        
        // ЛЕВАЯ ЧАСТЬ: КНОПКИ КАТЕГОРИЙ
        var categories = new Table();
        categoryButtons = []; //на всякий обновляем массив
        var categorySize = Math.min(41, listWidth / 5); // пятая часть ширины левой области
        var categoryColumns = Math.max(1, Math.floor(listWidth / categorySize)); // На узком окне категории переходят на следующую строку.
        addCategoryButton(categories, null, categorySize); // Первая вкладка — «Всё», значок пустой папки.
        for (var i = 0; i < Category.all.length; i++) {
            if ((i + 1) % categoryColumns == 0) categories.row(); // Учитываем уже добавленную первую вкладку.
            addCategoryButton(categories, Category.all[i], categorySize); //добавление кнопки
        }
        left.add(categories).growX().padTop(8).padBottom(8); // Отделяем категории от поиска сверху и списка блоков снизу.
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
            refreshSectorControls(); //обновляем видимые настройки сектора
        });
        right.add(wheelSlider).growX().height(32).padTop(8).padBottom(8); // Отступ сверху не даёт высокому стандартному бегунку перекрывать подпись колеса.
        right.row();

        // ПРАВАЯ ЧАСТЬ: ТЕКСТОВАЯ СТРОКА ИМЕНИ БЛОКА СЕКТОРА
        sectorLabel = right.add("").width(rightWidth).get();
        sectorLabel.setWrap(true); // автоматический перенос длинного текста на новую строк
        right.row();
        scaleLabel = right.add("").growX().padTop(6).padBottom(6).get(); //вывод выбранного блока в секторе
        right.row();

        // ПРАВАЯ ЧАСТЬ: ПОЛЗУНОК РАЗМЕРА ИКОНКИ
        var editor = new Table();
        scaleSlider = new Slider(40, 200, 1, true); // Размер 40–200%, шаг 1%; true — вертикальный ползунок слева от круга.
        scaleSlider.name = "buildwheel-icon-scale";
        scaleSlider.moved(value => {
            if (editedSector < 0) return;
            iconScales[editedWheel][editedSector] = value / 100; // Переводим проценты в коэффициент: например, 175 превращается в 1.75.
            scaleLabel.setText("Размер иконки: " + Math.round(value) + "%");
            saveSlot(); // Обновляем данные Core.settings в памяти; файл здесь ещё не записывается.
        });
        editor.add(scaleSlider).width(28).height(previewUiSize).padRight(8); // Ползунок по высоте равен манекену; ширина и отступ заданы в UI-единицах.
        editor.add(createPreview()).size(previewUiSize); // После масштабирования Cell размер совпадёт с диаметром игрового колеса.
        right.add(editor).top();
        body.add(right).width(rightWidth).padLeft(12).top();//добавляем панель с отступом слева в 12 пикселей


        var contentPane = new ScrollPane(body, Styles.defaultPane); //помещаем всё меню настроек в контейнер прокрутки, защищая от обрезки при малом разрешении
        contentPane.setScrollingDisabled(false, false); // На узком окне прокручиваем содержимое и по горизонтали, сохраняя размер манекена.
        contentPane.setFadeScrollBars(false);
        dialog.cont.add(contentPane).width(contentWidth).growY().minHeight(0); // В наше Меню контейнер прокрутки: Заполняем оставшуюся высоту диалога; minHeight(0) разрешает сжатие с прокруткой.
        rebuildGrid();
        refreshSectorControls();
    }

    // ------------------------------------------------------------
    // ОТКРЫТИЕ, ЗАКРЫТИЕ И ПЕРЕСТРОЙКА ПО РАЗМЕРУ ОКНА
    // ------------------------------------------------------------
    function hide() { //Закрыть меню настроек
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

    // Кнопка выхода
    dialog.buttons.button("Назад", Icon.left, () => hide()).size(200, 54).name("buildwheel-back");
    // При начале закрытия снимаем выделение и сохраняем изменённые настройки.
    // Сама анимация исчезновения диалога при этом ещё может продолжаться.
    dialog.hidden(() => {
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
        if (dialog.isShown()) {
            if (isCloseKey(key)) {
                closeKeysCaptured[key.ordinal()] = true; // Запоминаем перехваченную клавишу, чтобы позже поглотить её отпускание.
                Core.app.post(hide); // Передаём функцию без скобок: закрытие выполнится через очередь приложения.
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
        getIconScale: getIconScale, // Игровое колесо запрашивает сохранённый масштаб своей иконки.
        handleKeyDown: handleKeyDown, // Закрытие настроек клавишей игрового меню или назначенной на неё кнопкой мыши.
        handleKeyUp: handleKeyUp // Отпускания перехваченных клавиш закрытия, даже если окно уже исчезло.
    };
};
