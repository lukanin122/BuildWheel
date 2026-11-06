// БРАУЗЕР СОХРАНЁННЫХ ВИЗУАЛОВ, БЛОКОВ И НАБОРОВ КОЛЁС
"use strict";

exports.create = function(api) { // Меню передаёт хранилище, получение снимка и применение выбранного сохранения.
    var store = api.store; // Данные загружаются хранилищем один раз; построение карточек не читает файл.
    var dialog = extend(BaseDialog, Core.bundle.get("buildwheel.browser.title"), { // Отдельное окно поверх «Радиального меню».
        remove: function() { // Возвращаем прокрутку родителю после завершения анимации, когда браузер уже покинул сцену.
            var removed = this.super$remove(); // Выполняем штатное удаление окна.
            if (removed) { clearPreviews(); visibility = {}; showAll = {}; if (grid != null) grid.clearChildren(); api.onClosed(); } // Закрытый браузер освобождает карточки, визуалы и временные флаги показа.
            return removed; // Сохраняем результат штатного метода Scene.
        }
    });
    var activeType = "visual", query = ""; // При открытии начинаем со вкладки «Визуал» и пустого поиска.
    var grid = null, pane = null, childDialog = null; // Храним только актуальную сетку, её прокрутку и одно дочернее окно.
    var tabButtons = []; // Ссылки нужны для переключения вкладок без постоянных update-обработчиков.
    var titles = {visual: Core.bundle.get("buildwheel.browser.save.visual"), blocks: Core.bundle.get("buildwheel.browser.save.blocks"), wheel: Core.bundle.get("buildwheel.browser.save.wheel"), wheels: Core.bundle.get("buildwheel.browser.save.wheels")}; // Заголовки штатного окна ввода имени.
    var previews = [], readyPreviews = [], showAll = {}, visibility = {}, showAllButton = null; // Состояние показа отделено от сохранений и не записывается на диск.
    var maxHiddenPreviews = 64, trimmedFrame = -1; // При подготовке новых данных оставляем видимые модели и запас 64 давно скрытых; видимость не становится причиной аварийного выключения.
    var contentPadding = 3; // Штатный отступ Dialog: по три UI-единицы вокруг cont и вокруг его ячейки прокрутки.
    var wheelIcon = api.wheelIcon || new TextureRegionDrawable(Core.atlas.find("buildwheel-icon_wheel")); // Используем имеющуюся иконку без загрузки новой текстуры.

    // ИМЯ СОХРАНЕНИЯ И ШТАТНЫЕ ПОДТВЕРЖДЕНИЯ
    function requestSave(type) { // Вызывается квадратной кнопкой соответствующего типа в «Радиальном меню».
        Vars.ui.showTextInput(titles[type], "@name", 1000, "", name => { // Тот же метод и размеры поля, что при сохранении схемы Mindustry.
            name = String(name).trim(); // Убираем только пробелы вокруг имени, сохраняя введённый текст внутри.
            if (name.length == 0) return; // Пустое имя не создаёт запись.
            if (!accessLibrary(() => store.add(type, name, api.capture(type)))) return; // Ошибка записи не выдаётся за успешное сохранение независимого снимка.
            if (dialog.isShown()) rebuildGrid(); // Открытый браузер сразу показывает новую запись.
        });
        childDialog = api.topDialog(); // Запоминаем штатное окно, чтобы закрыть его вместе с модом при сбросе мира.
    }

    function accessLibrary(action) { // Ошибка чтения или записи остаётся внутри обработчика UI; хранилище сохраняет прежнюю версию данных.
        try { action(); return true; } // Продолжаем работу интерфейса только после успешного чтения или записи.
        catch (error) { Vars.ui.showInfo(Core.bundle.format("buildwheel.browser.storage-failed", String(error))); return false; } // Сообщаем причину отказа без закрытия редактора и без ложного подтверждения успеха.
    }

    function requestApply(entry, member) { // Ячейка набора может передать номер одного колеса, заголовок — весь набор.
        var number = api.getWheelNumber(); // Фиксируем целевой номер до открытия подтверждения.
        var selected = member == null ? entry : {type: "wheel", data: entry.data != null && Array.isArray(entry.data.wheels) ? entry.data.wheels[member] : null}; // Повреждённый набор передаётся обычной проверке данных, не вызывая исключение обработчика кнопки.
        Vars.ui.showConfirm(Core.bundle.get("buildwheel.browser.confirm"), Core.bundle.get("buildwheel.browser.apply-confirm"), () => { // Используем штатную плашку подтверждения игры.
            api.apply(selected, number); // Меняем выбранное колесо; из заголовка набор применяется ко всем десяти номерам.
        });
        childDialog = api.topDialog(); // Escape сначала должен закрывать подтверждение, а не весь браузер.
    }

    function requestDelete(entry, member) { // Удаление требует такого же подтверждения, как удаление схемы.
        var message = member == null ? Core.bundle.format("buildwheel.browser.delete-confirm", entry.name) : Core.bundle.format("buildwheel.browser.clear-confirm", String(member), entry.name); // Отдельная ячейка не удаляет весь набор и не сдвигает номера.
        Vars.ui.showConfirm("@confirm", message, () => { // Имя позволяет проверить, какая именно карточка будет удалена.
            if (!accessLibrary(() => { if (member == null) store.remove(entry.id); else store.replaceWheel(entry.id, member, api.emptyWheel()); })) return; // При отказе записи карточка и данные остаются прежними.
            rebuildGrid(); // Убираем карточку из списка без пересоздания окна.
        });
        childDialog = api.topDialog(); // Сохраняем ссылку на последнюю дочернюю плашку.
    }

    // РЕДАКТИРОВАНИЕ ИМЕНИ И ОПИСАНИЯ ПО ШАБЛОНУ СХЕМ
    function requestEdit(entry, member) { // Иконка pencil открывает отдельный редактор метаданных сохранения или колеса набора.
        var metadata = member == null ? entry : entry.data != null && Array.isArray(entry.data.wheels) ? entry.data.wheels[member] || {} : {}; // Имя отдельного колеса хранится только при явном вводе пользователем.
        var edit = new BaseDialog(member == null ? Core.bundle.get("buildwheel.browser.edit") : Core.bundle.format("buildwheel.browser.edit-wheel", String(member))); // Данные колеса в редакторе имени не изменяются.
        edit.name = "buildwheel-save-editor"; // Служебное имя для проверки и поиска окна в сцене.
        edit.setFillParent(true); // Редактор схем Mindustry также занимает всё окно.
        edit.cont.margin(30); // Сохраняем отступы штатного редактора схем.
        edit.cont.add("@name").padRight(6); // Подпись поля имени.
        var name = edit.cont.field(metadata.name || "", value => {}).size(400, 55).name("buildwheel-save-name").get(); // Поле имеет размеры из редактора схем.
        edit.cont.row(); // Описание располагается ниже имени.
        edit.cont.add("@description").padRight(6); // Описание сохраняется вместе с именем, как у схемы.
        var description = new TextArea(metadata.description || "", Styles.areaField); // Многострочное поле использует штатное оформление игры.
        description.name = "buildwheel-save-description"; // Служебное имя поля описания.
        edit.cont.add(description).size(400, 140); // Размер поля соответствует редактору схем.
        var accept = () => { // Один обработчик обслуживает кнопку OK и Enter.
            if (member == null && String(name.getText()).trim().length == 0) return; // Отдельному колесу набора собственное имя не обязательно.
            if (!accessLibrary(() => { if (member == null) store.rename(entry.id, String(name.getText()).trim(), String(description.getText())); else store.renameWheel(entry.id, member, String(name.getText()).trim(), String(description.getText())); })) return; // Ошибка записи оставляет введённое имя и описание в открытом редакторе.
            edit.hide(); // Возвращаемся в браузер.
            rebuildGrid(); // Показываем новое имя и учитываем его в текущем поиске.
        };
        edit.buttons.button("@ok", Icon.ok, accept).size(210, 64).pad(4).name("buildwheel-save-edit-ok") // Порядок и размеры кнопок повторяют редактор схем.
            .disabled(() => member == null && String(name.getText()).trim().length == 0); // Проверяем доступность только у открытого окна редактирования.
        edit.buttons.button("@cancel", Icon.cancel, () => edit.hide()).size(210, 64).pad(4); // Отмена сохраняет прежнее имя и описание.
        edit.keyDown(KeyCode.enter, () => { if (Core.scene.getKeyboardFocus() !== description) accept(); }); // Enter внутри описания переносит строку, в остальных случаях подтверждает.
        edit.addCloseListener(); // Escape и Back закрывают редактор без применения правок.
        edit.show(); // Показываем редактор поверх браузера.
        Core.scene.setKeyboardFocus(name); // Можно сразу вводить новое имя.
        name.selectAll(); // Первое введённое слово заменит прежнее имя.
        childDialog = edit; // Сброс мира закроет редактор вместе с браузером.
    }

    // ЛЕНИВЫЕ ПРЕВЬЮ И ОГРАНИЧЕННЫЙ КЭШ ДАННЫХ
    function clearPreviews() { previews = []; readyPreviews = []; trimmedFrame = -1; } // Старые виджеты и Color не удерживаются браузером после перестройки или закрытия.

    function releasePreview(state) { // Выключенное превью сразу освобождает свои подготовленные данные.
        state.model = null;
        var index = readyPreviews.indexOf(state); if (index >= 0) readyPreviews.splice(index, 1); // Кэш небольшой; поиск выполняется только при действии пользователя или вытеснении.
    }

    function setAllPreviews(enabled) { // Общая кнопка меняет флаги, не подготавливая сотни изображений заранее.
        showAll[activeType] = enabled; visibility[activeType] = Object.create(null); // Сбрасываем индивидуальные исключения только текущего раздела.
        for (var i = 0; i < previews.length; i++) { var state = previews[i]; state.enabled = enabled; state.element.visible = enabled; state.button.setChecked(enabled); if (!enabled) releasePreview(state); } // Скрытый Element вообще не получает вызов draw; новые Color здесь не нужны.
        if (showAllButton != null) showAllButton.setChecked(enabled); // Отображаем действующее состояние общей кнопки.
    }

    function togglePreview(state) { // Отдельная кнопка не перестраивает сетку и не сбрасывает прокрутку.
        if (showAll[activeType]) { // Переход от общего показа к индивидуальному сохраняет состояние остальных текущих карточек.
            var entries;
            if (!accessLibrary(() => { entries = store.list(activeType, ""); })) return; // При ошибке чтения сохраняем прежние рисунки и состояние общей кнопки.
            showAll[activeType] = false;
            for (var i = 0; i < entries.length; i++) { if (activeType === "wheels") { for (var number = 0; number < 10; number++) visibility[activeType][entries[i].id + "-" + number] = true; } else visibility[activeType][entries[i].id] = true; } // Только при нажатии сохраняем прежнее включение всех остальных колёс раздела.
            showAllButton.setChecked(false);
        }
        state.enabled = !state.enabled; state.element.visible = state.enabled; visibility[activeType][state.key] = state.enabled; state.button.setChecked(state.enabled); // Скрытый Element не получает draw; состояние сохраняется при поиске и изменении размеров окна.
        if (!state.enabled) releasePreview(state); // Включение остаётся ленивым: вне экрана данные не подготавливаются.
    }

    function previewFailure(error) { // Не повторяем ошибку рисования каждый кадр и не оставляем общий режим включённым.
        setAllPreviews(false); // Ошибка одной карточки выключает показ всего открытого раздела и очищает его кэш.
        Log.warn(Core.bundle.get("buildwheel.log.preview-disabled"), String(error));
        Core.app.post(() => Vars.ui.showInfo(Core.bundle.format("buildwheel.browser.preview-disabled", String(error)))); // Сообщение открываем после завершения рисования и восстановления обрезки.
    }

    function preparePreview(state, frame) { // Подготавливаем только реально попавшие в область обрезки модели.
        if (state.model == null && trimmedFrame != frame) { // Очищаем кэш только при необходимости новых данных и не чаще раза за кадр; неподвижный список не требует обхода кэша.
            trimmedFrame = frame;
            var hidden = 0, i, cached;
            for (i = 0; i < readyPreviews.length; i++) if (readyPreviews[i].frame < frame - 1) hidden++; // Модели прошлого кадра сохраняем: их видимость в текущем ещё не определена.
            var excess = hidden - maxHiddenPreviews, kept = 0; // Ограничение относится только к давно не рисовавшимся моделям.
            for (i = 0; i < readyPreviews.length; i++) {
                cached = readyPreviews[i];
                if (excess > 0 && cached.frame < frame - 1) { cached.model = null; excess--; } // Скрытая модель восстановится лениво при возвращении в видимую область.
                else readyPreviews[kept++] = cached; // Все текущие и прошлые видимые модели остаются независимо от разрешения и масштаба.
            }
            readyPreviews.length = kept; // Убираем вытесненные ссылки без создания второго массива кэша.
        }
        if (state.model == null) { state.model = api.preview(state.entry, state.member); readyPreviews.push(state); } // HEX и имена блоков разрешаются один раз до выключения или вытеснения.
        state.frame = frame; return state.model; // Обычный кадр читает только существующие данные.
    }

    function createPreview(state) { // Пассивный Element содержит только draw, без update, hover, звуков и обработчиков мыши.
        var element = extend(Element, {
            draw: function() {
                if (!state.enabled) return;
                var failure = null, clipping = false;
                try { if (!this.clipBegin()) return; clipping = true; api.drawPreview(this, preparePreview(state, Core.graphics.getFrameId())); } // Невидимые карточки отбрасываются до подготовки данных, включая вложенные ячейки наборов.
                catch (error) { failure = error; }
                finally { Draw.reset(); if (clipping) try { this.clipEnd(); } catch (error) { failure = error; } } // Восстанавливаем цвет и обрезку даже при ошибке рисунка; неисправный показ выключается.
                if (failure != null) previewFailure(failure);
            }
        });
        element.touchable = Touchable.disabled; element.visible = state.enabled; element.name = "buildwheel-save-preview-" + state.key; state.element = element; return element; // Картинка не участвует в выборе секторов; выключенная не получает draw.
    }

    // КАРТОЧКИ СОХРАНЕНИЙ С ПАССИВНОЙ ОБЛАСТЬЮ РИСУНКА
    function addAction(bar, icon, name, tooltip, action) { // Все четыре действия карточки имеют одинаковые размеры и оформление.
        var button = bar.button(icon, Styles.emptyi, action).size(50).name(name).get(); // Штатные кнопки панели схем размером 50×50.
        api.addTooltip(button, tooltip); // Получаем полупрозрачную серую подсказку под левым краем кнопки.
        return button; // Кнопка показа обновляет checked только при действии пользователя.
    }

    function addCard(parent, entry, member) { // Одна карточка показывает отдельное сохранение либо колесо внутри набора.
        var key = entry.id + (member == null ? "" : "-" + member), state = {key: key, entry: entry, member: member, model: null, frame: -1}; // Состояние картинки не меняет сохранённые данные.
        state.enabled = Object.prototype.hasOwnProperty.call(visibility[activeType], key) ? visibility[activeType][key] : !!showAll[activeType];
        var card = new Table(Tex.pane); // Штатный фон карточки схем, не затрагивающий общие стили игры.
        card.name = "buildwheel-save-" + key; // Номер внутри набора отличает его десять ячеек.
        card.top(); // Штатные отступы Tex.pane оставляют рамку вне подложек кнопок и названия.
        var bar = new Table(Styles.black8); // Чёрная панель явно отделяет действия от области будущего изображения.
        bar.left(); // Кнопки идут слева направо: использовать, отобразить, редактировать, удалить.
        addAction(bar, Icon.ok, "buildwheel-save-use-" + key, Core.bundle.get("buildwheel.browser.action.use"), () => requestApply(entry, member)); // Применение всегда требует подтверждения.
        state.button = addAction(bar, wheelIcon, "buildwheel-save-display-" + key, Core.bundle.get("buildwheel.browser.action.show"), () => togglePreview(state)); // Повторное нажатие скрывает только этот рисунок.
        state.button.setChecked(state.enabled); previews.push(state); // Без update-обработчика показываем выбранное состояние.
        addAction(bar, Icon.pencil, "buildwheel-save-edit-" + key, Core.bundle.get("buildwheel.browser.action.edit"), () => requestEdit(entry, member)); // Редактор получает родительскую запись и при необходимости номер внутри набора.
        addAction(bar, Icon.trash, "buildwheel-save-delete-" + key, Core.bundle.get("buildwheel.browser.action.delete"), () => requestDelete(entry, member)); // Действующие игровые колёса удалением записи не затрагиваются.
        card.add(bar).width(200).height(50); // Размер верхней панели соответствует шаблону схем.
        card.row(); // Остальная часть карточки располагается под действиями.
        var body = new Stack(); // Превью занимает весь квадрат; название накладывается поверх в его нижней части.
        body.add(createPreview(state)); // Отдельные текстуры и интерактивное колесо для сохранения не создаются.
        if (member == null) { // У отдельных колёс набора собственной подписи в карточке нет.
            var overlay = new Table(); // Полоса имени накладывается на изображение, сохраняя квадрат размером 200.
            overlay.bottom(); // Имя располагается в нижней части, как у карточки схемы.
            var caption = new Table(Styles.black3); // Полупрозрачная полоса под названием.
            caption.margin(1); // Повторяем небольшой внутренний отступ полосы имени схемы.
            var label = caption.add(entry.name, Styles.outlineLabel).pad(4).maxWidth(192).get(); // Одинаковая ширина названий для всех четырёх типов.
            label.setEllipsis(true); // Длинное имя сокращается в карточке, сохраняя полный текст в редакторе.
            overlay.add(caption).growX(); body.add(overlay); // Подложка имени занимает всю ширину карточки.
        }
        card.add(body).size(200); // Сохранённый диаметр 260 занимает 180 из 200 единиц; больший визуал обрезается границами квадрата.
        parent.add(card).pad(4).top(); // Карточки располагаются близко друг к другу одинаковыми прямоугольниками.
    }

    // НАБОР ИЗ ДЕСЯТИ КОЛЁС С ОБЩИМ ЗАГОЛОВКОМ И РАМКОЙ
    function addSet(entry, columns) { // Каждому набору отводится отдельный блок; на узком экране его карточки переносятся внутри рамки.
        var group = new Table(), heading = new Table(); heading.left(); // Заголовок расположен чуть выше верхней линии рамки.
        var title = heading.add(entry.name, Styles.outlineLabel).minWidth(0).growX().left().get(); title.setEllipsis(true); // Длинное имя сокращается в доступном месте и не выталкивает кнопки за экран.
        addAction(heading, Icon.ok, "buildwheel-set-use-" + entry.id, Core.bundle.get("buildwheel.browser.set.use"), () => requestApply(entry)); // Сохраняем возможность применить сразу все десять номеров.
        addAction(heading, Icon.pencil, "buildwheel-set-edit-" + entry.id, Core.bundle.get("buildwheel.browser.set.edit"), () => requestEdit(entry));
        addAction(heading, Icon.trash, "buildwheel-set-delete-" + entry.id, Core.bundle.get("buildwheel.browser.set.delete"), () => requestDelete(entry));
        var frame = extend(Table, {
            draw: function() { this.super$draw(); Draw.color(Color.gray); Lines.stroke(Scl.scl(1)); Lines.rect(this.x, this.y, this.getWidth(), this.getHeight()); Draw.reset(); } // Одна тонкая рамка охватывает все десять ячеек, без текстуры на каждый набор.
        });
        frame.top().left().margin(4);
        for (var order = 0; order < 10; order++) { if (order > 0 && order % columns == 0) frame.row(); addCard(frame, entry, (order + 1) % 10); } // Порядок как у клавиатуры: 1–9, затем 0.
        group.add(heading).growX().padBottom(3); group.row(); group.add(frame).growX(); // Заголовок не касается тонкой границы.
        grid.add(group).growX().pad(4).padBottom(12); grid.row(); // Следующий набор начинается отдельной строкой даже при широком окне.
    }

    function rebuildGrid() { // Перестраиваем только список при поиске, смене вкладки или изменении записей.
        if (grid == null) return false; // До первого открытия список ещё не создан.
        var entries;
        if (!accessLibrary(() => { entries = store.list(activeType, query); })) return false; // При ошибке не очищаем уже показанные карточки и кэш рисунков.
        clearPreviews(); // Перестроенный список не удерживает Color и ссылки Block от прежних карточек.
        grid.clearChildren(); // Старые карточки больше не удерживаются сеткой.
        if (visibility[activeType] == null) visibility[activeType] = Object.create(null); // Ключи записей безопасны даже при нестандартном содержимом библиотеки.
        var background = pane.getStyle().background; // Вычитаем реальные отступы фонов, а не предполагаем ширину рамки карточки.
        var available = Core.scene.getWidth() - dialog.getMarginLeft() - dialog.getMarginRight() - dialog.cont.getMarginLeft() - dialog.cont.getMarginRight() - Scl.scl(contentPadding * 4) - pane.getScrollBarWidth(); // Две пары штатных отступов и полоса прокрутки не должны перекрывать последнюю колонку.
        if (background != null) available -= background.getLeftWidth() + background.getRightWidth(); // Учитываем и собственный фон ScrollPane, если он задан стилем.
        if (activeType === "wheels") available -= Scl.scl(16); // Набор дополнительно содержит общую рамку и отступы вокруг неё.
        var columns = Math.max(1, Math.floor(available / (Scl.scl(208) + Tex.pane.getLeftWidth() + Tex.pane.getRightWidth()))); // Квадрат 200, отступы карточки 4 с каждой стороны и штатные поля Tex.pane.
        for (var i = 0; i < entries.length; i++) { // Для остальных вкладок карточки сейчас не создаются.
            if (activeType === "wheels") addSet(entries[i], columns); // Десять ячеек переносятся внутри собственного набора.
            else { if (i > 0 && i % columns == 0) grid.row(); addCard(grid, entries[i], null); } // Остальные разделы сохраняют обычную сетку карточек.
        }
        if (entries.length == 0) grid.add(Core.bundle.get("buildwheel.browser.empty")).pad(20); // Пустая вкладка и пустой результат поиска имеют понятное пояснение.
        for (var t = 0; t < tabButtons.length; t++) tabButtons[t].button.setChecked(tabButtons[t].type == activeType); // Выделяем только текущую вкладку.
        if (showAllButton != null) showAllButton.setChecked(!!showAll[activeType]); // Смена раздела показывает его собственный режим показа.
        if (pane != null) pane.setScrollY(0); // Новый список начинается сверху.
        return true; // Смена вкладки подтверждается только после успешного получения списка.
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
        showAllButton = tabs.button(wheelIcon, Styles.emptyTogglei, () => setAllPreviews(!showAll[activeType])).size(50).padRight(6).name("buildwheel-saves-display-all").get(); // Подготавливаем только флаг общего показа, не все изображения сразу.
        api.addTooltip(showAllButton, Core.bundle.get("buildwheel.browser.show-all"));
        tabButtons = []; // Старые кнопки после перестройки больше не нужны.
        for (var i = 0; i < store.types.length; i++) { // Порядок типов задаёт хранилище.
            let type = store.types[i]; // Отдельная ссылка нужна каждому обработчику кнопки.
            var button = tabs.button(type.title, Styles.togglet, () => { // Переключение подтверждается только после успешного чтения списка.
                var previous = activeType; activeType = type.id;
                if (!rebuildGrid()) { activeType = previous; for (var t = 0; t < tabButtons.length; t++) tabButtons[t].button.setChecked(tabButtons[t].type == activeType); } // При ошибке возвращаем прежнюю вкладку и её выделение, сохраняя карточки.
            })
                .height(50).minWidth(120).pad(2).name("buildwheel-saves-tab-" + type.id).get(); // Единый размер вкладок с читаемыми названиями.
            tabButtons.push({type: type.id, button: button}); // Запоминаем кнопку для обновления выделения при переключении.
        }
        tabs.add().width(56); // Симметричный резерв справа оставляет четыре вкладки на прежнем месте относительно центра окна.
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
        dialog.cont.add(pane).grow().minHeight(0).pad(contentPadding); // Явно задаём штатный отступ, учтённый при расчёте колонок.
        rebuildGrid(); // Заполняем выбранную вкладку и выделяем её кнопку.
    }

    function hide() { // Закрывается и кнопкой «Назад», и при сбросе мира.
        if (childDialog != null && childDialog.isShown()) childDialog.hide(); // Дочерняя плашка не должна оставаться над закрытым браузером.
        childDialog = null; // Освобождаем ссылку на закрытый редактор или подтверждение.
        if (dialog.isShown()) dialog.hide(); // Основное «Радиальное меню» остаётся под браузером.
    }

    dialog.name = "buildwheel-saves"; // Служебное имя окна.
    dialog.setFillParent(true); // Используем доступную площадь, как браузер схем.
    dialog.getCell(dialog.cont).pad(contentPadding); // Сохраняем штатный отступ содержимого и известную ширину для расчёта колонок.
    dialog.buttons.button(Core.bundle.get("buildwheel.actions.back"), Icon.left, hide).size(200, 54).name("buildwheel-saves-back"); // Возвращаемся к настройке выбранного колеса.
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
            if (!accessLibrary(() => store.list("visual", ""))) return; // Проверяем ленивую загрузку до очистки прежнего окна; повреждённый файл не выглядит пустой библиотекой.
            activeType = "visual"; query = ""; build(); dialog.show(); // Параметры колёс при просмотре библиотеки не изменяются.
            Core.scene.setScrollFocus(pane); // Колёсико прокручивает список сохранений поверх родительского меню.
        }
    };
};
