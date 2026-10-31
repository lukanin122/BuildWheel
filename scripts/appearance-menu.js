// Поля внешнего вида и их сохранение. Меняет общий appearance, поэтому настройки одинаковы у обоих колёс.
"use strict";

exports.create = function(wheelView, onChanged) {
    var appearance = wheelView.appearance;
    var settingsPrefix = "buildwheel.appearance.";

    // Описание групп одновременно задаёт состав UI, правила проверки и параметры группового сброса.
    var groups = [
        {id: "background", title: "Основной круг", metric: {key: "diameter", label: "Диаметр", type: "number", min: 1, max: 4096, integer: true}, color: "backgroundColor", alpha: "backgroundAlpha"},
        {id: "outer", title: "Внешняя окружность", metric: {key: "outerWidth", label: "Толщина", type: "number", min: 0, max: 256}, color: "outerColor", alpha: "outerAlpha"},
        {id: "dividers", title: "Разделительные полосы", metric: {key: "lineWidth", label: "Толщина", type: "number", min: 0, max: 256}, color: "lineColor", alpha: "lineAlpha"},
        {id: "center", title: "Внутренний круг", metric: {key: "innerRadiusRatio", label: "Доля", type: "ratio", min: 0, max: 1}, color: "centerColor", alpha: "centerAlpha"},
        {id: "inner", title: "Внутренняя окружность", metric: {key: "innerLineWidth", label: "Толщина", type: "number", min: 0, max: 256}, color: "innerLineColor", alpha: "innerLineAlpha"},
        {id: "highlight", title: "Подсветка сектора", color: "highlightColor", alpha: "highlightAlpha"}
    ];
    var fields = [];
    for (var g = 0; g < groups.length; g++) {
        var group = groups[g];
        group.fields = [];
        if (group.metric != null) group.fields.push(group.metric);
        group.colorField = {key: group.color, label: "Цвет", type: "color"};
        group.alphaField = {key: group.alpha, label: "Прозр.", type: "alpha", min: 0, max: 1};
        group.fields.push(group.colorField, group.alphaField);
        for (var f = 0; f < group.fields.length; f++) fields.push(group.fields[f]);
    }

    function colorText(color) {
        return "#" + String(color.toString()).substring(0, 6).toUpperCase(); // Alpha настраивается отдельным слайдером.
    }

    function numberText(value) {
        return String(Math.round(value * 1000) / 1000); // Не показываем погрешность Java Float после загрузки настроек.
    }

    function validNumber(field, value) {
        return isFinite(value) && value >= field.min && value <= field.max
            && (!field.integer || value == Math.floor(value));
    }

    function parseNumber(field, text) {
        text = String(text);
        if (text.length == 0) return NaN;
        var dot = -1;
        for (var i = 0; i < text.length; i++) {
            var character = text.charAt(i);
            if (character >= "0" && character <= "9") continue;
            if (!field.integer && character == "." && dot == -1 && i > 0 && i < text.length - 1) dot = i;
            else return NaN;
        }
        if (dot != -1 && text.length - dot - 1 > 3) return NaN;
        var value = Number(text);
        return validNumber(field, value) ? value : NaN;
    }

    function validColor(text) {
        text = String(text).toLowerCase();
        if (text.length != 7 || text.charAt(0) != "#") return false;
        for (var i = 1; i < text.length; i++) {
            if ("0123456789abcdef".indexOf(text.charAt(i)) == -1) return false;
        }
        return true; // Незавершённый код остаётся в поле, не меняя колесо.
    }

    // Загружаем настройки до создания манекена. Повреждённые или устаревшие значения пропускаем.
    for (var i = 0; i < fields.length; i++) {
        var field = fields[i];
        try {
            if (field.type == "color") {
                var savedColor = String(Core.settings.getString(settingsPrefix + field.key, colorText(appearance[field.key])));
                if (validColor(savedColor)) appearance[field.key].set(Color.valueOf(savedColor));
            } else {
                var savedNumber = Number(Core.settings.getFloat(settingsPrefix + field.key, appearance[field.key]));
                if (validNumber(field, savedNumber)) appearance[field.key] = savedNumber;
            }
        } catch (error) {
            // Значение другого типа не должно мешать открыть меню: остаётся исходное значение appearance.
        }
    }

    function saveField(field) {
        var value = appearance[field.key];
        var key = settingsPrefix + field.key;
        if (field.type == "color") Core.settings.put(key, colorText(value));
        else Core.settings.put(key, new java.lang.Float(String(value))); // Settings принимает Float, а не Double от числа JS.
    }

    function applyNumber(field, value) {
        if (!validNumber(field, value) || appearance[field.key] == value) return;
        appearance[field.key] = value;
        saveField(field);
        onChanged(field.key == "diameter");
    }

    function addTooltip(element, text) {
        element.addListener(new Tooltip(table => table.add(text)));
    }

    // Все поля одного типа получают одну и ту же ширину, вычисленную для всей формы.
    function buildControl(field, width, synchronize) {
        var block = new Table();
        block.top();
        var label = block.add(field.label).width(width).height(20).left().get();
        block.row();
        var control;
        var sync;
        if (field.type == "number") {
            control = new TextField(numberText(appearance[field.key]));
            control.setFilter(field.integer ? TextField.TextFieldFilter.digitsOnly : TextField.TextFieldFilter.floatsOnly);
            control.setMaxLength(10);
            control.setValidator(text => !isNaN(parseNumber(field, text)));
            control.setProgrammaticChangeEvents(false);
            control.changed(() => applyNumber(field, parseNumber(field, control.getText())));
            addTooltip(control, "От " + field.min + " до " + field.max + (field.integer ? "; целое число" : "; можно дробное число с точкой"));
            sync = () => control.setText(numberText(appearance[field.key]));
        } else if (field.type == "color") {
            control = new TextField(colorText(appearance[field.key]));
            control.setMaxLength(7);
            control.setValidator(text => validColor(text));
            control.setProgrammaticChangeEvents(false);
            control.changed(() => {
                var text = String(control.getText());
                if (!validColor(text)) return;
                appearance[field.key].set(Color.valueOf(text)); // Не заменяем объект Color, на который уже могут ссылаться другие части UI.
                saveField(field);
                onChanged(false);
            });
            addTooltip(control, "Цвет в формате #RRGGBB, например #7D4DFF");
            sync = () => control.setText(colorText(appearance[field.key]));
        } else {
            control = new Slider(0, 1, 0.01, false);
            control.setValue(appearance[field.key], false);
            var updateLabel = () => label.setText(field.type == "ratio"
                ? "Доля: " + Math.round(control.getValue() * 100) + "%"
                : "Прозр.: " + Number(control.getValue()).toFixed(2));
            control.moved(value => {
                applyNumber(field, Number(value));
                updateLabel();
            });
            addTooltip(control, field.type == "ratio" ? "Доля внутреннего радиуса: 0–100%"
                : "Прозрачность: 0 — невидимо, 1 — полностью непрозрачно");
            sync = () => {
                control.setValue(appearance[field.key], false);
                updateLabel();
            };
            updateLabel();
        }
        control.name = "buildwheel-appearance-" + field.key;
        block.add(control).width(width).height(44); // Стандартный бегунок помещается целиком и не накрывает подпись.
        synchronize.push(sync);
        return block;
    }

    function buildGroup(group, widths, wide) {
        var table = new Table();
        table.left();
        table.add(group.title).colspan(wide ? 4 : 2).left().padBottom(4);
        table.row();
        var synchronize = [];
        var metric = group.metric == null ? new Table() : buildControl(group.metric, widths.metric, synchronize);
        var color = buildControl(group.colorField, widths.color, synchronize);
        var alpha = buildControl(group.alphaField, widths.alpha, synchronize);
        var resetBlock = new Table();
        resetBlock.add("").height(20);
        resetBlock.row();
        var reset = resetBlock.button(Icon.refresh, Styles.cleari, () => {
            var keys = [];
            for (var i = 0; i < group.fields.length; i++) keys.push(group.fields[i].key);
            wheelView.resetAppearance(keys);
            for (var i = 0; i < group.fields.length; i++) saveField(group.fields[i]);
            for (var i = 0; i < synchronize.length; i++) synchronize[i]();
            onChanged(group.metric != null && group.metric.key == "diameter");
        }).size(widths.reset, 44).name("buildwheel-appearance-reset-" + group.id).get();
        reset.resizeImage(24);
        addTooltip(reset, "Сбросить по умолчанию");

        table.add(metric).width(widths.metric).padRight(6).top();
        table.add(color).width(widths.color).top();
        if (wide) {
            table.add(alpha).width(widths.alpha).padLeft(6).top();
            table.add(resetBlock).width(widths.reset).padLeft(6).top();
        } else {
            table.row();
            // У двух строк разные ширины колонок, поэтому вторую размещаем собственной таблицей.
            var secondRow = new Table();
            secondRow.add(alpha).width(widths.alpha).padRight(6).top();
            secondRow.add(resetBlock).width(widths.reset).top();
            table.add(secondRow).colspan(2).left().padTop(4);
        }
        return table;
    }

    function build(width) {
        var wide = width >= 410;
        var widths = {
            metric: wide ? 88 : (width - 6) / 2,
            color: wide ? 112 : (width - 6) / 2,
            alpha: wide ? width - 88 - 112 - 40 - 18 : width - 40 - 6,
            reset: 40
        };
        var table = new Table();
        table.name = "buildwheel-appearance-settings";
        table.left();
        for (var i = 0; i < groups.length; i++) {
            table.add(buildGroup(groups[i], widths, wide)).width(width).left().padBottom(10);
            table.row();
        }
        return table;
    }

    return {build: build};
};
