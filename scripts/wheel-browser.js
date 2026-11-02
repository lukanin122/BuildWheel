// БРАУЗЕР СОХРАНЁННЫХ ВИЗУАЛОВ, БЛОКОВ И НАБОРОВ КОЛЁС
"use strict";

exports.create = function(api) { // Меню передаёт хранилище, получение снимка и применение выбранного сохранения.
    var store = api.store; // Данные загружаются хранилищем один раз; построение карточек не читает файл.
    var dialog = extend(BaseDialog, "Браузер колёс строительства", { // Отдельное окно поверх «Радиального меню».
        remove: function() { // Возвращаем прокрутку родителю после завершения анимации, когда браузер уже покинул сцену.
            var removed = this.super$remove(); // Выполняем штатное удаление окна.
            if (removed) api.onClosed(); // Не возвращаем фокус списку блоков, пока браузер ещё закрывается.
            return removed; // Сохраняем результат штатного метода Scene.
        }
    });
    var activeType = "visual", query = ""; // При открытии начинаем со вкладки «Визуал» и пустого поиска.
    var grid = null, pane = null, childDialog = null; // Храним только актуальную сетку, её прокрутку и одно дочернее окно.
    var tabButtons = []; // Ссылки нужны для переключения вкладок без постоянных update-обработчиков.
    var titles = {visual: "Сохранить визуал...", blocks: "Сохранить блоки...", wheel: "Сохранить колесо...", wheels: "Сохранить колёса..."}; // Заголовки штатного окна ввода имени.

    // ИМЯ СОХРАНЕНИЯ И ШТАТНЫЕ ПОДТВЕРЖДЕНИЯ
    function requestSave(type) { // Вызывается квадратной кнопкой соответствующего типа в «Радиальном меню».
        Vars.ui.showTextInput(titles[type], "@name", 1000, "", name => { // Тот же метод и размеры поля, что при сохранении схемы Mindustry.
            name = String(name).trim(); // Убираем только пробелы вокруг имени, сохраняя введённый текст внутри.
            if (name.length == 0) return; // Пустое имя не создаёт запись.
            store.add(type, name, api.capture(type)); // Сохраняем независимый снимок параметров, а не ссылки на действующее колесо.
            if (dialog.isShown()) rebuildGrid(); // Открытый браузер сразу показывает новую запись.
        });
        childDialog = api.topDialog(); // Запоминаем штатное окно, чтобы закрыть его вместе с модом при сбросе мира.
    }

    function requestApply(entry) { // Карточка передаёт сохранение, выбранное кнопкой ok.
        var number = api.getWheelNumber(); // Фиксируем целевой номер до открытия подтверждения.
        Vars.ui.showConfirm("Подтверждение", "Данные будут перенесены в Радиальное меню", () => { // Используем штатную плашку подтверждения игры.
            api.apply(entry, number); // Меняем только указанные сохранением данные; набор применяется ко всем десяти номерам.
        });
        childDialog = api.topDialog(); // Escape сначала должен закрывать подтверждение, а не весь браузер.
    }

    function requestDelete(entry) { // Удаление требует такого же подтверждения, как удаление схемы.
        Vars.ui.showConfirm("@confirm", "Удалить сохранение «" + entry.name + "»?", () => { // Имя позволяет проверить, какая именно карточка будет удалена.
            store.remove(entry.id); // Удаляем только сохранённую запись; действующие колёса не меняются.
            rebuildGrid(); // Убираем карточку из списка без пересоздания окна.
        });
        childDialog = api.topDialog(); // Сохраняем ссылку на последнюю дочернюю плашку.
    }

    // РЕДАКТИРОВАНИЕ ИМЕНИ И ОПИСАНИЯ ПО ШАБЛОНУ СХЕМ
    function requestEdit(entry) { // Иконка pencil открывает отдельный редактор метаданных сохранения.
        var edit = new BaseDialog("Редактировать сохранение"); // Данные колеса в редакторе имени не изменяются.
        edit.name = "buildwheel-save-editor"; // Служебное имя для проверки и поиска окна в сцене.
        edit.setFillParent(true); // Редактор схем Mindustry также занимает всё окно.
        edit.cont.margin(30); // Сохраняем отступы штатного редактора схем.
        edit.cont.add("@name").padRight(6); // Подпись поля имени.
        var name = edit.cont.field(entry.name, value => {}).size(400, 55).name("buildwheel-save-name").get(); // Поле имеет размеры из редактора схем.
        edit.cont.row(); // Описание располагается ниже имени.
        edit.cont.add("@description").padRight(6); // Описание сохраняется вместе с именем, как у схемы.
        var description = new TextArea(entry.description || "", Styles.areaField); // Многострочное поле использует штатное оформление игры.
        description.name = "buildwheel-save-description"; // Служебное имя поля описания.
        edit.cont.add(description).size(400, 140); // Размер поля соответствует редактору схем.
        var accept = () => { // Один обработчик обслуживает кнопку OK и Enter.
            if (String(name.getText()).trim().length == 0) return; // Не разрешаем заменить имя пустым текстом.
            store.rename(entry.id, String(name.getText()).trim(), String(description.getText())); // Сохраняем метаданные; снимок блоков и визуала остаётся прежним.
            edit.hide(); // Возвращаемся в браузер.
            rebuildGrid(); // Показываем новое имя и учитываем его в текущем поиске.
        };
        edit.buttons.button("@ok", Icon.ok, accept).size(210, 64).pad(4).name("buildwheel-save-edit-ok") // Порядок и размеры кнопок повторяют редактор схем.
            .disabled(() => String(name.getText()).trim().length == 0); // Проверяем доступность только у открытого окна редактирования.
        edit.buttons.button("@cancel", Icon.cancel, () => edit.hide()).size(210, 64).pad(4); // Отмена сохраняет прежнее имя и описание.
        edit.keyDown(KeyCode.enter, () => { if (Core.scene.getKeyboardFocus() !== description) accept(); }); // Enter внутри описания переносит строку, в остальных случаях подтверждает.
        edit.addCloseListener(); // Escape и Back закрывают редактор без применения правок.
        edit.show(); // Показываем редактор поверх браузера.
        Core.scene.setKeyboardFocus(name); // Можно сразу вводить новое имя.
        name.selectAll(); // Первое введённое слово заменит прежнее имя.
        childDialog = edit; // Сброс мира закроет редактор вместе с браузером.
    }

    // КАРТОЧКИ СОХРАНЕНИЙ БЕЗ ЗАГРУЗКИ ИЗОБРАЖЕНИЙ
    function addAction(bar, icon, name, tooltip, action) { // Все три действия карточки имеют одинаковые размеры и оформление.
        var button = bar.button(icon, Styles.emptyi, action).size(50).name(name).get(); // Штатные кнопки панели схем размером 50×50.
        api.addTooltip(button, tooltip); // Получаем полупрозрачную серую подсказку под левым краем кнопки.
    }

    function addCard(entry) { // Создаём только видимую карточку выбранной вкладки.
        var card = new Table(Tex.pane); // Штатный фон карточки схем, не затрагивающий общие стили игры.
        card.name = "buildwheel-save-" + entry.id; // Идентификатор записи сохраняется при переименовании.
        card.top().margin(0); // Верхняя панель примыкает к границе карточки.
        var bar = new Table(Styles.black8); // Чёрная панель явно отделяет действия от области будущего изображения.
        bar.left(); // Кнопки идут слева направо: использовать, редактировать, удалить.
        addAction(bar, Icon.ok, "buildwheel-save-use-" + entry.id, "Использовать", () => requestApply(entry)); // Применение всегда требует подтверждения.
        addAction(bar, Icon.pencil, "buildwheel-save-edit-" + entry.id, "Редактировать", () => requestEdit(entry)); // Изменяем имя и описание.
        addAction(bar, Icon.trash, "buildwheel-save-delete-" + entry.id, "Удалить", () => requestDelete(entry)); // Действующее колесо удалением записи не затрагивается.
        card.add(bar).width(200).height(50); // Размер верхней панели соответствует шаблону схем.
        card.row(); // Остальная часть карточки располагается под действиями.
        var body = new Table(); // Область изображения пока оставляем пустой: текстуры для сохранений не создаются.
        body.bottom(); // Имя располагается в нижней части, как у карточки схемы.
        var caption = new Table(Styles.black3); // Полупрозрачная полоса под названием.
        caption.margin(1); // Повторяем небольшой внутренний отступ полосы имени схемы.
        var label = caption.add(entry.name, Styles.outlineLabel).pad(4).maxWidth(192).get(); // Одинаковая ширина названий для всех четырёх типов.
        label.setEllipsis(true); // Длинное имя сокращается в карточке, сохраняя полный текст в редакторе.
        body.add(caption).growX(); // Подложка имени занимает всю ширину карточки.
        card.add(body).size(200); // Размер области совпадает с превью схемы, но изображения пока нет.
        grid.add(card).pad(4).top(); // Карточки располагаются близко друг к другу одинаковыми прямоугольниками.
    }

    function rebuildGrid() { // Перестраиваем только список при поиске, смене вкладки или изменении записей.
        if (grid == null) return; // До первого открытия список ещё не создан.
        grid.clearChildren(); // Старые карточки больше не удерживаются сеткой.
        var entries = store.list(activeType, query); // Фильтруем по неудаляемому типу и тексту поиска в памяти.
        var columns = Math.max(1, Math.floor(Core.scene.getWidth() / Scl.scl(230))); // Число колонок рассчитывается по шаблону браузера схем Mindustry.
        for (var i = 0; i < entries.length; i++) { // Для остальных вкладок карточки сейчас не создаются.
            if (i > 0 && i % columns == 0) grid.row(); // Переносим очередную карточку при заполнении ряда.
            addCard(entries[i]); // Создаём карточку существующей записи.
        }
        if (entries.length == 0) grid.add("Сохранений не найдено").pad(20); // Пустая вкладка и пустой результат поиска имеют понятное пояснение.
        for (var t = 0; t < tabButtons.length; t++) tabButtons[t].button.setChecked(tabButtons[t].type == activeType); // Выделяем только текущую вкладку.
        if (pane != null) pane.setScrollY(0); // Новый список начинается сверху.
    }

    // СБОРКА ОКНА И ВОЗВРАТ В РАДИАЛЬНОЕ МЕНЮ
    function build() { // Вызывается при открытии и изменении размера окна.
        dialog.cont.clearChildren(); // Освобождаем ссылки на прежнюю раскладку браузера.
        var search = new Table(); // Значок zoom и строка поиска располагаются над вкладками.
        search.image(Icon.zoom).size(44); // Высота значка совпадает с полем ввода.
        search.field(query, value => { query = String(value); rebuildGrid(); }).height(44).growX().name("buildwheel-saves-search"); // Поиск не меняет активную вкладку.
        dialog.cont.add(search).growX().padBottom(4); // Располагаем поиск по ширине окна.
        dialog.cont.row(); // Вкладки начинаются под поиском.
        var tabs = new Table(); // Четыре типа данных нельзя переименовать или удалить.
        tabButtons = []; // Старые кнопки после перестройки больше не нужны.
        for (var i = 0; i < store.types.length; i++) { // Порядок типов задаёт хранилище.
            let type = store.types[i]; // Отдельная ссылка нужна каждому обработчику кнопки.
            var button = tabs.button(type.title, Styles.togglet, () => { activeType = type.id; rebuildGrid(); }) // Переключаем только фильтр списка сохранений.
                .height(50).minWidth(120).pad(2).name("buildwheel-saves-tab-" + type.id).get(); // Единый размер вкладок с читаемыми названиями.
            tabButtons.push({type: type.id, button: button}); // Запоминаем кнопку для обновления выделения при переключении.
        }
        var tabsPane = new ScrollPane(tabs, Styles.noBarPane); // На узком экране вкладки можно прокрутить горизонтально, не обрезая подписи.
        tabsPane.setScrollingDisabled(false, true); // Вертикальная прокрутка вкладкам не нужна.
        dialog.cont.add(tabsPane).growX().height(56); // Сохраняем одну строку вкладок над списком.
        dialog.cont.row(); // Список карточек располагается ниже вкладок.
        grid = new Table(); // Сетка содержит только карточки текущего фильтра.
        grid.top().left(); // Заполняем список от верхнего левого края.
        pane = new ScrollPane(grid, Styles.defaultPane); // Используем штатную прокрутку схем.
        pane.name = "buildwheel-saves-list"; // Служебное имя прокручиваемого списка.
        pane.setScrollingDisabled(true, false); // Карточки переносятся по строкам, поэтому горизонтальная прокрутка не требуется.
        pane.setFadeScrollBars(false); // Полоса остаётся видимой, пока список не помещается в окно.
        dialog.cont.add(pane).grow().minHeight(0); // Список занимает оставшееся пространство браузера.
        rebuildGrid(); // Заполняем выбранную вкладку и выделяем её кнопку.
    }

    function hide() { // Закрывается и кнопкой «Назад», и при сбросе мира.
        if (childDialog != null && childDialog.isShown()) childDialog.hide(); // Дочерняя плашка не должна оставаться над закрытым браузером.
        childDialog = null; // Освобождаем ссылку на закрытый редактор или подтверждение.
        if (dialog.isShown()) dialog.hide(); // Основное «Радиальное меню» остаётся под браузером.
    }

    dialog.name = "buildwheel-saves"; // Служебное имя окна.
    dialog.setFillParent(true); // Используем доступную площадь, как браузер схем.
    dialog.buttons.button("Назад", Icon.left, hide).size(200, 54).name("buildwheel-saves-back"); // Возвращаемся к настройке выбранного колеса.
    dialog.addListener(extend(ResizeListener, { // Разрешение меняет колонки только у открытого браузера.
        resized: function() {
            if (!dialog.isShown()) return; // Закрытое окно не требует новой сетки и фокуса.
            build(); // Заново размещаем поиск, вкладки и карточки по доступной ширине.
            Core.app.post(() => { if (api.topDialog() === dialog) Core.scene.setScrollFocus(pane); }); // Штатный resized может выбрать строку вкладок; возвращаем прокрутку актуальному списку карточек.
        }
    }));
    return { // Публичные действия используются кнопками и обработчиком клавиш «Радиального меню».
        save: requestSave, hide: hide, isShown: () => dialog.isShown(), // Сохранение открывает штатную плашку; hide закрывает и дочернюю плашку.
        closeFromKey: function() { // Не перехватываем Escape у штатного подтверждения или редактора имени.
            if (api.topDialog() !== dialog) return false; // Верхнее дочернее окно сначала обслужит собственную клавишу закрытия.
            Core.app.post(hide); // Закрываем браузер после завершения текущего события ввода.
            return true; // Меню поглотит соответствующее отпускание клавиши.
        },
        show: function() { // Каждое открытие начинается с вкладки «Визуал», как запрошено.
            activeType = "visual"; query = ""; build(); dialog.show(); // Параметры колёс при просмотре библиотеки не изменяются.
            Core.scene.setScrollFocus(pane); // Колёсико прокручивает список сохранений поверх родительского меню.
        }
    };
};
