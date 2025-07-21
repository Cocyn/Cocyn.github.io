(function(){
    'use strict';

    var version = '2.0.0';
    var stats = JSON.parse(localStorage.getItem('anilibria_autoskip_stats') || '{"skips":0,"seconds":0}');
    var settings = JSON.parse(localStorage.getItem('anilibria_autoskip_settings') || '{"enabled":true,"skipOpenings":true,"skipEndings":true}');
    var video = null;
    var timeHandler = null;

    function log(msg) {
        console.log('[AutoSkip]', msg);
    }

    function saveSettings() {
        localStorage.setItem('anilibria_autoskip_settings', JSON.stringify(settings));
    }
    function saveStats() {
        localStorage.setItem('anilibria_autoskip_stats', JSON.stringify(stats));
    }

    function openSettingsModal() {
        var html = `
            <div style="padding:20px;max-width:400px;color:#fff">
                <h2 style="color:#4CAF50">AniLibria AutoSkip</h2>
                <label><input type="checkbox" id="as_enabled" ${settings.enabled ? 'checked' : ''}/> Включить AutoSkip</label><br>
                <label><input type="checkbox" id="as_skipOpenings" ${settings.skipOpenings ? 'checked' : ''}/> Пропускать опенинги</label><br>
                <label><input type="checkbox" id="as_skipEndings" ${settings.skipEndings ? 'checked' : ''}/> Пропускать эндинги</label><br>
                <div style="margin-top:10px;font-size:13px;color:#aaa">Версия: ${version}</div>
                <div style="margin-top:10px;font-size:15px;color:#fff">Пропусков: <b>${stats.skips}</b></div>
                <div style="font-size:15px;color:#fff">Сэкономлено времени: <b>${stats.seconds}</b> сек.</div>
            </div>
        `;
        if (window.Lampa && Lampa.Modal) {
            Lampa.Modal.open({
                title: 'AniLibria AutoSkip',
                html: html,
                onBack: function(){ Lampa.Modal.close(); }
            });
            setTimeout(function(){
                document.getElementById('as_enabled').onchange = function(e){
                    settings.enabled = e.target.checked; saveSettings();
                };
                document.getElementById('as_skipOpenings').onchange = function(e){
                    settings.skipOpenings = e.target.checked; saveSettings();
                };
                document.getElementById('as_skipEndings').onchange = function(e){
                    settings.skipEndings = e.target.checked; saveSettings();
                };
            }, 100);
        } else {
            alert('Настройки доступны только в Lampa!');
        }
    }

    function addMenuButton() {
        var tryAdd = function(){
            var menu = document.querySelector('.menu__list');
            if (menu && !menu.querySelector('.menu-autoskip')) {
                var btn = document.createElement('li');
                btn.className = 'menu__item menu-autoskip selector focusable';
                btn.tabIndex = 0;
                btn.innerHTML = '<span>AutoSkip</span>';
                btn.onclick = openSettingsModal;
                menu.appendChild(btn);
                log('Кнопка добавлена в меню');
            }
        };
        setInterval(tryAdd, 2000);
        tryAdd();
    }

    function checkSkip() {
        if (!video) return;
        var t = video.currentTime;
        var d = video.duration;
        var skipData = {
            opening: { start: 85, end: 105 },
            ending: { start: d - 90, end: d - 30 }
        };
        if (settings.skipOpenings && t >= skipData.opening.start && t <= skipData.opening.end) {
            var skipped = skipData.opening.end - t;
            video.currentTime = skipData.opening.end;
            stats.skips++;
            stats.seconds += Math.round(skipped);
            saveStats();
            notify('Опенинг пропущен: ' + Math.round(skipped) + ' сек.');
            log('Опенинг пропущен, сэкономлено: ' + Math.round(skipped) + ' сек.');
        }
        if (settings.skipEndings && t >= skipData.ending.start && t <= skipData.ending.end) {
            var skipped2 = d - 1 - t;
            video.currentTime = d - 1;
            stats.skips++;
            stats.seconds += Math.round(skipped2);
            saveStats();
            notify('Эндинг пропущен: ' + Math.round(skipped2) + ' сек.');
            log('Эндинг пропущен, сэкономлено: ' + Math.round(skipped2) + ' сек.');
        }
    }

    function notify(msg) {
        if (window.Lampa && Lampa.Noty) Lampa.Noty.show(msg);
        else alert(msg);
    }

    function listenPlayer() {
        var tryListen = function(){
            if (window.Lampa && Lampa.Player && Lampa.Player.listener) {
                Lampa.Player.listener.follow('start', onPlayerStart);
                Lampa.Player.listener.follow('stop', onPlayerStop);
                log('Подписка на события плеера выполнена.');
            } else {
                setTimeout(tryListen, 2000);
            }
        };
        tryListen();
    }

    function onPlayerStart() {
        if (!settings.enabled) return;
        video = document.querySelector('video');
        if (video) {
            timeHandler = checkSkip;
            video.addEventListener('timeupdate', timeHandler);
            log('Видео найдено, обработчик добавлен');
        }
    }
    function onPlayerStop() {
        if (video && timeHandler) video.removeEventListener('timeupdate', timeHandler);
        video = null;
        timeHandler = null;
    }

    // Инициализация
    log('Версия: ' + version);
    addMenuButton();
    listenPlayer();

})();
