// BuildWheel — пункт 3: меню назначения блоков и настройки иконок.
// Подключается через require("menu"); интерфейс создаётся после ClientLoadEvent.
// API виджетов: https://github.com/Anuken/Arc/tree/master/arc-core/src/arc/scene/ui
// Категории и иконки: mindustry.ui.fragments.PlacementFragment версии игры.
"use strict"; // В частности, запрещает случайное присваивание не объявленной переменной.

// ------------------------------------------------------------
// СОЗДАНИЕ РЕДАКТОРА И ЕГО СОСТОЯНИЕ
// ------------------------------------------------------------
// main.js вызывает create один раз после ClientLoadEvent.
// Вложенные функции затем работают с общими переменными этого вызова.
// Окно создаётся здесь, но появится на экране только после show().
// exports — публичная часть модуля. api содержит только функции и параметры,
// явно переданные из main.js; обратного require("main") здесь нет.
exports.create = function(api) {
    var wheelCount = 10; // Номер колеса 0–9.
    var sectorCount = 8;
    var settingsPrefix = "buildwheel.slot."; // Начало ключей Core.settings: отделяет наши настройки от настроек других модов.
    var iconScales = []; // Таблица [колесо][сектор]: 1 = 100%, 0.4 = 40%, 2 = 200%.
    var settingsChanged = false; // Условие вынуждающее к записи данных на диск.

    // Локальное состояние редактора не меняет номер игрового колеса.
    var editedWheel = 0; // Какое колесо сейчас редактируем в манекене.
    var editedSector = -1; // Редактируемый 'зелёный' сектор 0–7, дефолт -1
    var category = Category.distribution;
    var searchText = ""; // Сохраняем запрос, чтобы восстановить поле после изменения размера окна.
    var directionNames = ["Север", "Северо-восток", "Восток", "Юго-восток",
        "Юг", "Юго-запад", "Запад", "Северо-запад"];

    var dialog = new BaseDialog("BuildWheel — настройки"); // Объект - окно "меню настроек"
    var grid, blockPane, searchField, sectorLabel, wheelLabel, scaleLabel; // Ссылки на виджеты: присвоим их при построении содержимого окна.
    var wheelSlider, scaleSlider, clearSelectionButton;
    var blockButtons = []; // Записи {button, block}: помогают обновлять выделение без пересоздания списка.
    var categoryButtons = []; // Такие же записи для вкладок категорий.
    var gridColumns = 1;
    var previewSize = 0; // Размер манекена в координатах сцены; ниже он рассчитывается из размеров экрана.
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
            : "Выберите сектор на колесе справа"); //описание над колесом?
        clearSelectionButton.visible = selected; // Показываем крестик при наличии 'зелёного' сектора.
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
        api.setBlock(editedWheel, editedSector, block);
        saveSlot();
        refreshSectorControls();
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
            // Исследования, планета и ресурсы не фильтруются: здесь видны все строительные блоки категории.
            if (!block.placeablePlayer || block.category != category
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
        // Берём те же изображения и порядок Category.all, что штатное меню.
        var cell = table.button(Vars.ui.getIcon(nextCategory.name()), //создает кнопку-переключатель привязывая к ней системную иконку Mindustry
            () => chooseCategory(nextCategory)); //запоминаем какую категорию активируем кнопкой
        cell.size(size).name("buildwheel-category-" + nextCategory.name()); // Размер кнопки и отступы;
        cell.tooltip(Core.bundle.get("blocks." + nextCategory.name(), nextCategory.name())); // // Подсказка показывает название. Берём перевод из игры; если его нет (а его нет), показываем имя категории.
        var button = cell.get();
        button.resizeImage(24);
        button.setProgrammaticChangeEvents(false);// отключение повторный запуск функции chooseCategory
        button.setChecked(nextCategory == category); //визуально выделяем совпадающую категория с текущей активной
        categoryButtons.push({button: button, category: nextCategory}); //вывешиваем объект кнопки и ссылку в глобальный интерфейс
    }

    // ------------------------------------------------------------
    // МАНЕКЕН: КРУГ, ВЫБОР СЕКТОРА И КРЕСТИК
    // ------------------------------------------------------------
    // Манекен — "колесо строительства" находящиеся в меню
    function createPreview() {
        // Group абстрактный: extend создаёт его конкретного анонимного наследника.
        var group = extend(Group, {});
        group.setTransform(false); // Группа объединяет круг и крестик; собственные поворот и масштаб ей не нужны.
        var preview = extend(Element, {
            draw: function() {
                var radius = this.getWidth() / 2;
                var cx = this.x + radius, cy = this.y + this.getHeight() / 2; // Центр круга с учётом положения элемента внутри его группы.
                var inner = radius * api.innerRadiusRatio;
                Draw.color(Color.white);
                Draw.alpha(0.22);
                Fill.circle(cx, cy, radius);
                if (editedSector >= 0) {
                    Draw.color(Color.green);
                    Draw.alpha(0.45);
                    // Та же функция подсветки, что используется игровым колесом.
                    api.drawSector(cx, cy, radius, editedSector);
                }
                Draw.color(Color.black);
                Draw.alpha(0.25);
                Fill.circle(cx, cy, inner);
                Draw.color(Color.white);
                Draw.alpha(0.70);
                Lines.stroke(1);
                Lines.circle(cx, cy, inner);
                Lines.circle(cx, cy, radius - 1);
                for (var sector = 0; sector < sectorCount; sector++) {
                    var edge = (sector * 45 - 22.5) * Math.PI / 180;
                    Lines.line(cx + Math.sin(edge) * inner, cy + Math.cos(edge) * inner,
                        cx + Math.sin(edge) * radius, cy + Math.cos(edge) * radius);
                    var block = api.getBlock(editedWheel, sector);
                    if (block != null) {
                        var angle = sector * 45 * Math.PI / 180;
                        var icon = block.uiIcon;
                        var size = radius * 0.28 * getIconScale(editedWheel, sector); // Манекен использует тот же базовый размер и индивидуальный масштаб, что игровое колесо.
                        var scale = size / Math.max(icon.width, icon.height); // Сохраняем пропорции картинки.
                        Draw.alpha(1);
                        Draw.rect(icon, cx + Math.sin(angle) * radius * 0.64,
                            cy + Math.cos(angle) * radius * 0.64,
                            icon.width * scale, icon.height * scale);
                        Draw.alpha(0.70);
                    }
                }
                Draw.reset(); // Цвет и прозрачность не должны повлиять на следующий виджет меню.
            }
        });
        preview.name = "buildwheel-preview";
        preview.setSize(previewSize, previewSize);
        // Здесь InputListener самого элемента, а не глобальный InputProcessor.
        // Поэтому x/y уже локальные: начало координат находится в углу манекена.
        preview.addListener(extend(InputListener, {
            touchDown: function(event, x, y, pointer, button) {
                if (button != KeyCode.mouseLeft) return false;
                var radius = preview.getWidth() / 2;
                var dx = x - radius, dy = y - radius;
                var distance = dx * dx + dy * dy; // Несмотря на имя, это квадрат расстояния: сравниваем с квадратами радиусов.
                var inner = radius * api.innerRadiusRatio;
                if (distance >= inner * inner && distance <= radius * radius) { // Только точки на кольце могут выбрать сектор; центр и углы прямоугольника пропускаем.
                    var angle = (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;
                    selectSector(Math.floor((angle + 22.5) / 45) % 8); // Та же нумерация секторов: от севера по часовой стрелке.
                }
                return true;
            }
        }));
        group.addChild(preview);
        clearSelectionButton = new ImageButton(Icon.cancel, Styles.cleari);
        clearSelectionButton.name = "buildwheel-deselect";
        var crossSize = Math.min(Scl.scl(32), previewSize * 0.18);
        clearSelectionButton.setSize(crossSize, crossSize);
        clearSelectionButton.setPosition(0, previewSize - crossSize); // Верхний левый угол группы; при перемещении манекена крестик перемещается вместе с ним.
        clearSelectionButton.clicked(() => selectSector(-1)); // Снимает выделение, сохраняя блок и размер иконки в слоте.
        group.addChild(clearSelectionButton);
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
        var listWidth = contentWidth * 0.55; // 55% ширины отводим левой части.
        var rightWidth = contentWidth * 0.40; // 40% ширины — правой; оставшаяся ширина даёт место для зазора по середине.
        var listHeight = screenHeight * 0.46; // Высота прокручиваемого списка блоков — 46% высоты экрана.
        var previewUiSize = Math.max(60, Math.min(rightWidth - 44, screenHeight * 0.40)); //размер окна превью равным 40% от высоты экрана, но если экран слишком узкий — сжимает его под ширину правой панели, и при любых условиях не дает ему стать меньше 60 единиц.
        previewSize = Scl.scl(previewUiSize); // Element.setSize использует реальные координаты сцены, поэтому применяем масштаб здесь.
        gridColumns = Math.max(1, Math.floor((listWidth - 24) / 52)); // 52 = кнопка 48 пикселей + отступы по 2 пикселя с обеих сторон; 24 резерв пикселей под край/прокрутку.

        // ЛЕВАЯ ЧАСТЬ: СТРОКА ПОИСКА
        dialog.cont.clearChildren(); //очищаем главное окно
        var body = new Table();
        body.top(); //это выравнивание по верхнему краю    
        var left = new Table(); //поиск, кнопки категорий и лист блоков
        left.top();
        searchField = left.field(searchText, text => {//поиск по названию
            searchText = String(text); // Callback поля передаёт новый текст; ту же сходу сохраняем его как строку JS.
            rebuildGrid();
        }).height(44).growX().name("buildwheel-search").get(); // фиксированная высота поиска 44, автоматическая ширина на всю ширину лева; системное имя "buildwheel-search"; get возвращает созданный TextField.
        searchField.setMessageText("Поиск по названию блока"); // Подсказка пустого поля.
        left.row(); //заканчиваем со строкой, перенося последующие элементы UI на новый ряд
        
        // ЛЕВАЯ ЧАСТЬ: КНОПКИ КАТЕГОРИЙ
        var categories = new Table();
        categoryButtons = []; //на всякий обновляем массив
        var categorySize = Math.min(40, listWidth / 5); //пятая часть ширины левой области
        var categoryColumns = Math.max(1, Math.floor(listWidth / categorySize)); // На узком окне категории переходят на следующую строку.
        for (var i = 0; i < Category.all.length; i++) {
            if (i > 0 && i % categoryColumns == 0) categories.row(); //перенос
            addCategoryButton(categories, Category.all[i], categorySize); //добавление кнопки
        }
        left.add(categories).growX().padBottom(8); //добавляем в left по всей ширине и нижним отступом в 8 пикселей
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
        wheelSlider = new Slider(0, 9, 1, false); // Диапазон 0–9, шаг 1; false — горизонтальная ориентация.
        wheelSlider.name = "buildwheel-wheel-number";
        wheelSlider.setValue(editedWheel, false); // Начальное значение без запуска обработчика moved.
        wheelSlider.moved(value => {//Callback на постоянное выполнение при сдвиге ползунка
            editedWheel = Math.round(value); // Значение ползунка становится редактируемым номером колеса.
            editedSector = -1; // При смене колеса прежний сектор автоматически не выбираем.
            wheelLabel.setText("Колесо " + editedWheel);
            refreshSectorControls(); //обновляем видимые настройки сектора
        });
        right.add(wheelSlider).growX().height(32).padBottom(8);
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
        editor.add(scaleSlider).width(28).height(previewUiSize).padRight(8);//ширина 28 пикселей, высота по % настройкам меню, отступ справа в 8 пикселей
        editor.add(createPreview()).size(previewUiSize);//отображает манекен колеса с размером равным previewUiSize... фигня, надо задать от оригинала в main.js!
        right.add(editor).top();
        body.add(right).width(rightWidth).padLeft(12).top();//добавляем панель с отступом слева в 12 пикселей


        var contentPane = new ScrollPane(body, Styles.defaultPane); //помещаем всё меню настроек в контейнер прокрутки, защищая от обрезки при малом разрешении
        contentPane.setScrollingDisabled(true, false);
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
        editedWheel = validIndex(wheelNumber, wheelCount) ? wheelNumber : 0; // При корректном номере начинаем с него, иначе с колеса 0.
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
