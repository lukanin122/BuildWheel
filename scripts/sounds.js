// Загружается через require вместе со скриптами, ДО ClientLoadEvent.
// FileTree ставит эти четыре файла в очередь общего загрузчика игры; остальные звуки папки не используем.
"use strict";

exports.addBlock = Vars.tree.loadSound("add_block_1");
exports.deleteBlock = Vars.tree.loadSound("delete_block_1");
exports.sectorHover = Vars.tree.loadSound("sector_hover_1");
exports.sectorSelect = Vars.tree.loadSound("sector_select_1");
if (!Vars.headless) exports.sectorHover.setMinInterval(0); // Не пропускаем быстрые переходы; на сервере не меняем общий Sounds.none.

exports.play = function(sound) {
    sound.play(Vars.control.sound.uiBus); // Канал UI без мирового затухания; play учитывает общую громкость звуковых эффектов.
};

var silentClick = new java.lang.Runnable({run: function() {}});

// Arc запускает общий ClickListener.clicked перед обработчиком каждой кнопки.
// На время обработки отпускания мыши у нашей кнопки отключаем только этот стандартный звук.
// finally возвращает прежний обработчик даже при ошибке; остальные события и состояние кнопки сохраняются.
function withoutClickSound(original) {
    return extend(ClickListener, {
        handle: function(event) {
            if (!(event instanceof InputEvent) || event.type != InputEvent.InputEventType.touchUp) {
                return original.handle(event);
            }
            var previousClick = ClickListener.clicked;
            ClickListener.clicked = silentClick;
            try {
                return original.handle(event);
            } finally {
                ClickListener.clicked = previousClick;
            }
        },
        clicked: function(event, x, y) {
            original.clicked(event, x, y); // Сохраняем и программный вызов button.fireClick().
        }
    });
}

// Вызываем после добавления обработчика clicked: оборачиваем и внутренний слушатель Button, и слушатель действия.
exports.muteDefaultClick = function(button) {
    var listeners = button.getListeners();
    for (var i = 0; i < listeners.size; i++) {
        var listener = listeners.get(i);
        if (listener instanceof ClickListener) listeners.set(i, withoutClickSound(listener));
    }
};
