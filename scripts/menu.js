// BuildWheel — пункт 3: меню назначения блоков и настройки иконок.
// Подключается через require("menu"); интерфейс создаётся после ClientLoadEvent.
// API виджетов: https://github.com/Anuken/Arc/tree/master/arc-core/src/arc/scene/ui
// Категории и иконки: mindustry.ui.fragments.PlacementFragment версии игры.
"use strict";

// exports — публичная часть модуля. api содержит только функции и параметры,
// явно переданные из main.js; обратного require("main") здесь нет.
exports.create = function(api) {
    var wheelCount = 10;
    var sectorCount = 8;
    var settingsPrefix = "buildwheel.slot.";
    var iconScales = [];
    var settingsChanged = false;

    // Локальное состояние редактора не меняет номер игрового колеса.
    var editedWheel = 0;
    var editedSector = -1;
    var category = Category.distribution;
    var searchText = "";
    var directionNames = ["Север", "Северо-восток", "Восток", "Юго-восток",
        "Юг", "Юго-запад", "Запад", "Северо-запад"];

    var dialog = new BaseDialog("BuildWheel — настройки");
    var grid, blockPane, searchField, sectorLabel, wheelLabel, scaleLabel;
    var wheelSlider, scaleSlider, clearSelectionButton;
    var blockButtons = [];
    var categoryButtons = [];
    var gridColumns = 1;
    var previewSize = 0;
    var tabCaptured = false;
    var minusCaptured = false;
    var closeKeysCaptured = [];

    function slotKey(wheelNumber, sectorNumber) {
        return settingsPrefix + wheelNumber + "." + sectorNumber;
    }

    function validIndex(value, count) {
        return value >= 0 && value < count && value == Math.floor(value);
    }

    function getIconScale(wheelNumber, sectorNumber) {
        if (!validIndex(wheelNumber, wheelCount) || !validIndex(sectorNumber, sectorCount)) return 1;
        return iconScales[wheelNumber][sectorNumber];
    }

    // Core.settings хранит имена блоков, а не Java-объекты и не числовые ID.
    // Благодаря этому загрузка не зависит от порядка установленных модов.
    for (var w = 0; w < wheelCount; w++) {
        iconScales[w] = [];
        for (var s = 0; s < sectorCount; s++) {
            var key = slotKey(w, s);
            var savedName = String(Core.settings.getString(key + ".block", ""));
            if (savedName.length > 0) {
                // Если мод с блоком удалён, content.block вернёт null: слот пуст.
                api.setBlock(w, s, Vars.content.block(savedName));
            }
            var scale = Number(Core.settings.getFloat(key + ".scale", 1));
            iconScales[w][s] = isFinite(scale) ? Math.max(0.4, Math.min(2, scale)) : 1;
        }
    }

    function saveSlot() {
        if (editedSector < 0) return;
        var key = slotKey(editedWheel, editedSector);
        var block = api.getBlock(editedWheel, editedSector);
        Core.settings.put(key + ".block", block == null ? "" : String(block.name));
        // Settings принимает Java Float, но не Double, в который Rhino обычно
        // превращает число JS при передаче аргумента типа Object.
        Core.settings.put(key + ".scale", new java.lang.Float(String(getIconScale(editedWheel, editedSector))));
        settingsChanged = true;
    }

    function flushSettings() {
        if (!settingsChanged) return;
        // Ползунок меняет значения в памяти. На диск пишем один раз при закрытии,
        // чтобы не сохранять файл при каждом небольшом движении ползунка.
        Core.settings.manualSave();
        settingsChanged = false;
    }

    function refreshSectorControls() {
        if (sectorLabel == null) return;
        var selected = editedSector >= 0;
        var block = selected ? api.getBlock(editedWheel, editedSector) : null;
        sectorLabel.setText(selected
            ? directionNames[editedSector] + ": " + (block == null ? "пустой слот" : String(block.localizedName))
            : "Выберите сектор на колесе справа");
        clearSelectionButton.visible = selected;
        scaleSlider.setDisabled(!selected);
        // false запрещает запуск moved() при программной синхронизации.
        scaleSlider.setValue(selected ? Math.round(getIconScale(editedWheel, editedSector) * 100) : 100, false);
        scaleLabel.setText("Размер иконки: " + Math.round(scaleSlider.getValue()) + "%");
        for (var i = 0; i < blockButtons.length; i++) {
            blockButtons[i].button.setDisabled(!selected);
            blockButtons[i].button.setChecked(selected && blockButtons[i].block == block);
        }
    }

    function selectSector(sector) {
        editedSector = sector;
        refreshSectorControls();
    }

    function assignBlock(block) {
        if (editedSector < 0) return;
        // Можно настроить слот для другой планеты или ещё не исследованного блока.
        // Строительное колесо само проверит возможность выбора в текущей игре.
        api.setBlock(editedWheel, editedSector, block);
        saveSlot();
        refreshSectorControls();
    }

    function addBlockButton(block) {
        var cell = grid.button(new TextureRegionDrawable(block.uiIcon), Styles.selecti, () => assignBlock(block));
        cell.size(48).pad(2).name("buildwheel-block-" + block.name);
        cell.tooltip(String(block.localizedName) + "\n" + block.name);
        var button = cell.get();
        button.resizeImage(32);
        button.setProgrammaticChangeEvents(false);
        blockButtons.push({button: button, block: block});
    }

    function rebuildGrid() {
        if (grid == null) return;
        // Меняем только таблицу блоков: поле поиска сохраняет фокус и курсор.
        grid.clearChildren();
        blockButtons = [];
        var query = searchText.toLowerCase().trim();
        var blocks = Vars.content.blocks();
        var count = 0;
        for (var i = 0; i < blocks.size; i++) {
            var block = blocks.get(i);
            // Исключаем декорации/служебные блоки. Исследования, планета и ресурсы
            // не фильтруют настройки: здесь видны все строительные блоки категории.
            if (!block.placeablePlayer || block.category != category
                || block.buildVisibility == BuildVisibility.hidden
                || block.buildVisibility == BuildVisibility.debugOnly) continue;
            var name = String(Strings.stripColors(String(block.localizedName))).toLowerCase();
            if (query.length > 0 && name.indexOf(query) < 0
                && String(block.name).toLowerCase().indexOf(query) < 0) continue;
            if (count > 0 && count % gridColumns == 0) grid.row();
            addBlockButton(block);
            count++;
        }
        if (count == 0) grid.add("Блоки не найдены").pad(12);
        grid.invalidateHierarchy();
        blockPane.setScrollY(0);
        refreshSectorControls();
    }

    function chooseCategory(nextCategory) {
        category = nextCategory;
        for (var i = 0; i < categoryButtons.length; i++) {
            categoryButtons[i].button.setChecked(categoryButtons[i].category == category);
        }
        rebuildGrid();
    }

    function addCategoryButton(table, nextCategory, size) {
        // Берём те же изображения и порядок Category.all, что штатное меню.
        var cell = table.button(Vars.ui.getIcon(nextCategory.name()), Styles.clearTogglei,
            () => chooseCategory(nextCategory));
        cell.size(size).name("buildwheel-category-" + nextCategory.name());
        cell.tooltip(Core.bundle.get("blocks." + nextCategory.name(), nextCategory.name()));
        var button = cell.get();
        button.resizeImage(24);
        button.setProgrammaticChangeEvents(false);
        button.setChecked(nextCategory == category);
        categoryButtons.push({button: button, category: nextCategory});
    }

    // Манекен — отдельный элемент, не игровое колесо. Его hit ограничен размером
    // самого элемента, поэтому список и ползунки меню остаются доступными мыши.
    function createPreview() {
        // Group абстрактный: extend создаёт его конкретного анонимного наследника.
        var group = extend(Group, {});
        group.setTransform(false);
        var preview = extend(Element, {
            draw: function() {
                var radius = this.getWidth() / 2;
                var cx = this.x + radius, cy = this.y + this.getHeight() / 2;
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
                        var size = radius * 0.28 * getIconScale(editedWheel, sector);
                        var scale = size / Math.max(icon.width, icon.height);
                        Draw.alpha(1);
                        Draw.rect(icon, cx + Math.sin(angle) * radius * 0.64,
                            cy + Math.cos(angle) * radius * 0.64,
                            icon.width * scale, icon.height * scale);
                        Draw.alpha(0.70);
                    }
                }
                Draw.reset();
            }
        });
        preview.name = "buildwheel-preview";
        preview.setSize(previewSize, previewSize);
        preview.addListener(extend(InputListener, {
            touchDown: function(event, x, y, pointer, button) {
                if (button != KeyCode.mouseLeft) return false;
                var radius = preview.getWidth() / 2;
                var dx = x - radius, dy = y - radius;
                var distance = dx * dx + dy * dy;
                var inner = radius * api.innerRadiusRatio;
                if (distance >= inner * inner && distance <= radius * radius) {
                    var angle = (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;
                    selectSector(Math.floor((angle + 22.5) / 45) % 8);
                }
                return true;
            }
        }));
        group.addChild(preview);
        clearSelectionButton = new ImageButton(Icon.cancel, Styles.cleari);
        clearSelectionButton.name = "buildwheel-deselect";
        var crossSize = Math.min(Scl.scl(32), previewSize * 0.18);
        clearSelectionButton.setSize(crossSize, crossSize);
        clearSelectionButton.setPosition(0, previewSize - crossSize);
        clearSelectionButton.clicked(() => selectSector(-1));
        group.addChild(clearSelectionButton);
        return group;
    }

    function focusBlockList() {
        if (dialog.isShown()) Core.scene.setScrollFocus(blockPane);
    }

    function buildInterface() {
        // Cell.width/height сами умножают числа на Scl. Деление переводит реальные
        // размеры сцены в UI-единицы, сохраняя доли экрана при любом масштабе UI.
        var screenWidth = Core.scene.getWidth() / Scl.scl();
        var screenHeight = Core.scene.getHeight() / Scl.scl();
        var contentWidth = screenWidth * 0.92;
        var listWidth = contentWidth * 0.55;
        var rightWidth = contentWidth * 0.40;
        var listHeight = screenHeight * 0.46;
        var previewUiSize = Math.max(60, Math.min(rightWidth - 44, screenHeight * 0.40));
        previewSize = Scl.scl(previewUiSize);
        gridColumns = Math.max(1, Math.floor((listWidth - 24) / 52));

        dialog.cont.clearChildren();
        var body = new Table();
        body.top();
        var left = new Table();
        left.top();
        searchField = left.field(searchText, text => {
            searchText = String(text);
            rebuildGrid();
        }).height(44).growX().name("buildwheel-search").get();
        searchField.setMessageText("Поиск по названию блока");
        left.row();

        var categories = new Table();
        categoryButtons = [];
        var categorySize = Math.min(40, listWidth / 5);
        var categoryColumns = Math.max(1, Math.floor(listWidth / categorySize));
        for (var i = 0; i < Category.all.length; i++) {
            if (i > 0 && i % categoryColumns == 0) categories.row();
            addCategoryButton(categories, Category.all[i], categorySize);
        }
        left.add(categories).growX().padBottom(8);
        left.row();
        grid = new Table();
        grid.top().left();
        blockPane = new ScrollPane(grid, Styles.defaultPane);
        blockPane.name = "buildwheel-block-list";
        blockPane.setScrollingDisabled(true, false);
        blockPane.setFadeScrollBars(false);
        blockPane.setOverscroll(false, false);
        blockPane.addListener(extend(InputListener, {
            scrolled: function(event, x, y, amountX, amountY) {
                // Штатный слушатель ScrollPane уже обработал прокрутку списка.
                // Не передаём то же вращение внешней прокрутке всего меню.
                if (event.handled) event.stop();
                return false;
            }
        }));
        left.add(blockPane).size(listWidth, listHeight);
        body.add(left).width(listWidth).top();

        var right = new Table();
        right.top();
        wheelLabel = right.add("Колесо " + editedWheel).growX().get();
        right.row();
        wheelSlider = new Slider(0, 9, 1, false);
        wheelSlider.name = "buildwheel-wheel-number";
        wheelSlider.setValue(editedWheel, false);
        wheelSlider.moved(value => {
            editedWheel = Math.round(value);
            editedSector = -1;
            wheelLabel.setText("Колесо " + editedWheel);
            refreshSectorControls();
        });
        right.add(wheelSlider).growX().height(32).padBottom(8);
        right.row();
        sectorLabel = right.add("").width(rightWidth).get();
        sectorLabel.setWrap(true);
        right.row();
        scaleLabel = right.add("").growX().padTop(6).padBottom(6).get();
        right.row();
        var editor = new Table();
        scaleSlider = new Slider(40, 200, 1, true);
        scaleSlider.name = "buildwheel-icon-scale";
        scaleSlider.moved(value => {
            if (editedSector < 0) return;
            iconScales[editedWheel][editedSector] = value / 100;
            scaleLabel.setText("Размер иконки: " + Math.round(value) + "%");
            saveSlot();
        });
        editor.add(scaleSlider).width(28).height(previewUiSize).padRight(8);
        editor.add(createPreview()).size(previewUiSize);
        right.add(editor).top();
        body.add(right).width(rightWidth).padLeft(12).top();

        // На маленьком окне прокручивается и всё содержимое, а не обрезаются
        // ползунки. У списка блоков при этом остаётся собственная прокрутка.
        var contentPane = new ScrollPane(body, Styles.defaultPane);
        contentPane.setScrollingDisabled(true, false);
        contentPane.setFadeScrollBars(false);
        dialog.cont.add(contentPane).width(contentWidth).growY().minHeight(0);
        rebuildGrid();
        refreshSectorControls();
    }

    function hide() {
        if (dialog.isShown()) dialog.hide();
    }

    function show(wheelNumber) {
        if (!Vars.state.isGame() || dialog.isShown()) return;
        // Сохраняем номер ДО closeWheel/show: слушатель фокуса в main.js сбросит
        // activeWheelNumber при открытии любого диалога, включая наше меню.
        editedWheel = validIndex(wheelNumber, wheelCount) ? wheelNumber : 0;
        editedSector = -1;
        api.closeWheel();
        buildInterface();
        dialog.show();
        Core.app.post(focusBlockList);
    }

    // Кнопка находится в нижнем блоке Dialog, после всего содержимого.
    dialog.buttons.button("Назад", Icon.left, () => hide()).size(200, 54).name("buildwheel-back");
    dialog.hidden(() => {
        editedSector = -1;
        flushSettings();
    });
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
    Events.on(StateChangeEvent, event => {
        if (event.to == GameState.State.menu) hide();
    });
    Events.on(ResetEvent, () => hide());
    Events.on(DisposeEvent, () => flushSettings());

    function isCloseKey(key) {
        return key == KeyCode.escape || key == KeyCode.back
            || (Binding.menu.value != null && key == Binding.menu.value.key);
    }

    // Эти методы вызывает уже существующий InputProcessor в main.js.
    // Отдельный глобальный обработчик ввода и покадровая проверка не нужны.
    function handleKeyDown(key) {
        if (dialog.isShown()) {
            if (isCloseKey(key)) {
                closeKeysCaptured[key.ordinal()] = true;
                Core.app.post(hide);
                return true;
            }
            return false;
        }
        if (!api.isWheelOpen() || api.isInputBlocked()) return false;
        if (key == KeyCode.tab) {
            // Tab штатно вызывает список игроков. Пока колесо открыто, это наш
            // модификатор меню: не передаём его нажатие KeyboardDevice.
            tabCaptured = true;
            return true;
        }
        if (key == KeyCode.minus && (tabCaptured || Core.input.keyDown(KeyCode.tab))) {
            minusCaptured = true;
            show(api.getWheelNumber());
            return true;
        }
        return false;
    }

    function handleKeyUp(key) {
        // Отпускания поглощаются даже после открытия/закрытия меню, чтобы игра
        // не получила keyRelease без соответствующего keyDown.
        if (key == KeyCode.tab && tabCaptured) {
            tabCaptured = false;
            return true;
        }
        if (key == KeyCode.minus && minusCaptured) {
            minusCaptured = false;
            return true;
        }
        if (closeKeysCaptured[key.ordinal()]) {
            closeKeysCaptured[key.ordinal()] = false;
            return true;
        }
        return false;
    }

    return {
        show: show,
        getIconScale: getIconScale,
        handleKeyDown: handleKeyDown,
        handleKeyUp: handleKeyUp
    };
};
