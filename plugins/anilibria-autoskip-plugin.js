(function() {
    'use strict';

    const PLUGIN_ID = 'anilibria_autoskip';
    if (window[PLUGIN_ID]) return;

    class AniLibriaAutoSkip {
        constructor() {
            this.version = '2.0.0';
            this.name = 'AniLibria AutoSkip';
            this.settings = Object.assign({
                enabled: true,
                skipOpenings: true,
                skipEndings: true
            }, this.loadSettings());
            this.stats = Object.assign({
                skips: 0,
                seconds: 0
            }, this.loadStats());
            this.video = null;
            this.timeHandler = null;
            console.log(`[${this.name}] Версия: ${this.version}`);
            this.init();
        }

        init() {
            this.addMenuButton();
            this.listenPlayer();
            window[PLUGIN_ID] = this;
        }

        addMenuButton() {
            const tryAdd = () => {
                const menu = document.querySelector('.menu__list');
                if (menu) {
                    if (!menu.querySelector('.menu-autoskip')) {
                        const btn = document.createElement('li');
                        btn.className = 'menu__item menu-autoskip selector focusable';
                        btn.tabIndex = 0;
                        btn.innerHTML = `<span>AutoSkip</span>`;
                        btn.onclick = () => this.openSettingsModal();
                        menu.appendChild(btn);
                        console.log('[AutoSkip] Кнопка добавлена в меню');
                    }
                }
            };
            setInterval(tryAdd, 2000);
            tryAdd();
        }

        openSettingsModal() {
            const html = `
                <div style="padding:20px;max-width:400px;color:#fff">
                    <h2 style="color:#4CAF50">${this.name}</h2>
                    <label><input type="checkbox" data-setting="enabled" ${this.settings.enabled ? 'checked' : ''}/> Включить AutoSkip</label><br>
                    <label><input type="checkbox" data-setting="skipOpenings" ${this.settings.skipOpenings ? 'checked' : ''}/> Пропускать опенинги</label><br>
                    <label><input type="checkbox" data-setting="skipEndings" ${this.settings.skipEndings ? 'checked' : ''}/> Пропускать эндинги</label><br>
                    <div style="margin-top:10px;font-size:13px;color:#aaa">Версия: ${this.version}</div>
                    <div style="margin-top:10px;font-size:15px;color:#fff">Пропусков: <b>${this.stats.skips}</b></div>
                    <div style="font-size:15px;color:#fff">Сэкономлено времени: <b>${this.stats.seconds}</b> сек.</div>
                </div>
            `;
            if (typeof Lampa !== 'undefined' && Lampa.Modal) {
                Lampa.Modal.open({
                    title: this.name,
                    html,
                    onBack: () => { Lampa.Modal.close(); }
                });
                setTimeout(() => {
                    document.querySelectorAll('[data-setting]').forEach(el => {
                        el.onchange = (e) => {
                            this.settings[e.target.dataset.setting] = e.target.checked;
                            this.saveSettings();
                        };
                    });
                }, 100);
            } else {
                alert('Настройки доступны только в Lampa!');
            }
        }

        listenPlayer() {
            const tryListen = () => {
                if (typeof Lampa !== 'undefined' && Lampa.Player && Lampa.Player.listener) {
                    Lampa.Player.listener.follow('start', () => this.onPlayerStart());
                    Lampa.Player.listener.follow('stop', () => this.onPlayerStop());
                    console.log('[AutoSkip] Подписка на события плеера выполнена.');
                } else {
                    setTimeout(tryListen, 2000);
                }
            };
            tryListen();
        }

        onPlayerStart() {
            if (!this.settings.enabled) return;
            this.video = this.getVideo();
            if (this.video) {
                this.timeHandler = () => this.checkSkip();
                this.video.addEventListener('timeupdate', this.timeHandler);
                console.log('[AutoSkip] Видео найдено, обработчик добавлен');
            }
        }

        onPlayerStop() {
            if (this.video && this.timeHandler) {
                this.video.removeEventListener('timeupdate', this.timeHandler);
            }
            this.video = null;
            this.timeHandler = null;
        }

        getVideo() {
            return document.querySelector('video');
        }

        checkSkip() {
            if (!this.video) return;
            const t = this.video.currentTime;
            const d = this.video.duration;
            // Примерные значения, можно сделать настройками
            const skipData = {
                opening: { start: 85, end: 105 },
                ending: { start: d - 90, end: d - 30 }
            };
            if (this.settings.skipOpenings && t >= skipData.opening.start && t <= skipData.opening.end) {
                const skipped = skipData.opening.end - t;
                this.video.currentTime = skipData.opening.end;
                this.stats.skips++;
                this.stats.seconds += Math.round(skipped);
                this.saveStats();
                this.notify(`Опенинг пропущен: ${Math.round(skipped)} сек.`);
                console.log(`[AutoSkip] Опенинг пропущен, сэкономлено: ${Math.round(skipped)} сек.`);
            }
            if (this.settings.skipEndings && t >= skipData.ending.start && t <= skipData.ending.end) {
                const skipped = d - 1 - t;
                this.video.currentTime = d - 1;
                this.stats.skips++;
                this.stats.seconds += Math.round(skipped);
                this.saveStats();
                this.notify(`Эндинг пропущен: ${Math.round(skipped)} сек.`);
                console.log(`[AutoSkip] Эндинг пропущен, сэкономлено: ${Math.round(skipped)} сек.`);
            }
        }

        notify(msg) {
            if (typeof Lampa !== 'undefined' && Lampa.Noty) {
                Lampa.Noty.show(msg);
            } else {
                alert(msg);
            }
        }

        loadSettings() {
            try {
                return JSON.parse(localStorage.getItem('anilibria_autoskip_settings') || '{}');
            } catch (e) { return {}; }
        }
        saveSettings() {
            localStorage.setItem('anilibria_autoskip_settings', JSON.stringify(this.settings));
        }
        loadStats() {
            try {
                return JSON.parse(localStorage.getItem('anilibria_autoskip_stats') || '{}');
            } catch (e) { return {skips:0,seconds:0}; }
        }
        saveStats() {
            localStorage.setItem('anilibria_autoskip_stats', JSON.stringify(this.stats));
        }
    }

    new AniLibriaAutoSkip();
})();