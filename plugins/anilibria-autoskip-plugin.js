(function() {
    'use strict';

    const PLUGIN_ID = 'anilibria_autoskip';
    if (window[PLUGIN_ID]) return;

    class AniLibriaAutoSkip {
        constructor() {
            this.version = '1.0.1';
            this.component = 'anilibria_autoskip';
            this.name = 'AniLibria AutoSkip';
            this.settings = Object.assign({
                enabled: true,
                autoStart: true,
                skipOpenings: true,
                skipEndings: true,
                showNotifications: true
            }, this.loadSettings());
            this.isRunning = false;
            this.video = null;
            this.timeHandler = null;
            console.log(`[${this.name}] Версия плагина: ${this.version}`);
            this.init();
        }

        init() {
            this.tryAddSettingsToLampa();
            this.tryListenPlayer();
            this.addMenuButton(); // Добавляем кнопку в меню
            if (this.settings.autoStart && this.settings.enabled) {
                this.start();
            }
            window[PLUGIN_ID] = this;
        }

        tryAddSettingsToLampa(attempt = 0) {
            if (typeof Lampa !== 'undefined' && Lampa.Settings && Lampa.Settings.component) {
                Lampa.Settings.component({
                    component: this.component,
                    name: this.name,
                    icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>'
                });
                Lampa.Settings.listener.follow('open', (e) => {
                    if (e.name === this.component) this.openSettingsModal();
                });
                console.log(`[${this.name}] Настройки успешно добавлены в Lampa.`);
            } else if (attempt < 15) { // 15 попыток по 2 секунды = 30 секунд
                console.log(`[${this.name}] Настройки не найдены, повторная попытка через 2 секунды...`);
                setTimeout(() => this.tryAddSettingsToLampa(attempt + 1), 2000);
            } else {
                console.error(`[${this.name}] Не удалось добавить настройки в Lampa за 30 секунд.`);
            }
        }

        tryListenPlayer(attempt = 0) {
            if (typeof Lampa !== 'undefined' && Lampa.Player && Lampa.Player.listener) {
                Lampa.Player.listener.follow('start', () => this.onPlayerStart());
                Lampa.Player.listener.follow('stop', () => this.onPlayerStop());
                console.log(`[${this.name}] Подписка на события плеера выполнена.`);
            } else if (attempt < 15) {
                console.log(`[${this.name}] Плеер не найден, повторная попытка через 2 секунды...`);
                setTimeout(() => this.tryListenPlayer(attempt + 1), 2000);
            } else {
                console.error(`[${this.name}] Не удалось подписаться на события плеера за 30 секунд.`);
            }
        }

        openSettingsModal() {
            const html = `
                <div style="padding:20px;max-width:400px;color:#fff">
                    <h2 style="color:#4CAF50">${this.name}</h2>
                    <label><input type="checkbox" data-setting="enabled" ${this.settings.enabled ? 'checked' : ''}/> Включить AutoSkip</label><br>
                    <label><input type="checkbox" data-setting="autoStart" ${this.settings.autoStart ? 'checked' : ''}/> Автозапуск</label><br>
                    <label><input type="checkbox" data-setting="skipOpenings" ${this.settings.skipOpenings ? 'checked' : ''}/> Пропускать опенинги</label><br>
                    <label><input type="checkbox" data-setting="skipEndings" ${this.settings.skipEndings ? 'checked' : ''}/> Пропускать эндинги</label><br>
                    <label><input type="checkbox" data-setting="showNotifications" ${this.settings.showNotifications ? 'checked' : ''}/> Показывать уведомления</label><br>
                    <div style="margin-top:10px;font-size:13px;color:#aaa">Версия: ${this.version}</div>
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

        onPlayerStart() {
            if (!this.settings.enabled) return;
            this.video = this.getVideo();
            if (this.video) {
                this.timeHandler = () => this.checkSkip();
                this.video.addEventListener('timeupdate', this.timeHandler);
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

            // Пример данных для пропуска
            const skipData = {
                opening: { start: 85, end: 105 },
                ending: { start: d - 90, end: d - 30 }
            };

            if (this.settings.skipOpenings && t >= skipData.opening.start && t <= skipData.opening.end) {
                this.video.currentTime = skipData.opening.end;
                this.notify('Опенинг пропущен');
            }
            if (this.settings.skipEndings && t >= skipData.ending.start && t <= skipData.ending.end) {
                this.video.currentTime = d - 1;
                this.notify('Эндинг пропущен');
            }
        }

        notify(msg) {
            if (!this.settings.showNotifications) return;
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

        start() {
            console.log(`[${this.name}] Автоскип запущен.`);
        }

        stop() {
            console.log(`[${this.name}] Автоскип остановлен.`);
        }

        addMenuButton() {
            const tryAdd = () => {
                console.log('[AutoSkip] Попытка добавить кнопку в меню...');
                const menu = document.querySelector('.menu__list');
                if (menu) {
                    if (!menu.querySelector('.menu-autoskip')) {
                        const btn = document.createElement('li');
                        btn.className = 'menu__item menu-autoskip selector focusable';
                        btn.tabIndex = 0;
                        btn.innerHTML = `<span>AutoSkip</span>`;
                        btn.onclick = () => {
                            console.log('[AutoSkip] Клик по кнопке AutoSkip');
                            this.openSettingsModal();
                        };
                        menu.appendChild(btn);
                        console.log('[AutoSkip] Кнопка добавлена в меню');
                    } else {
                        console.log('[AutoSkip] Кнопка уже есть в меню');
                    }
                } else {
                    console.log('[AutoSkip] Меню не найдено');
                }
            };
            setInterval(tryAdd, 2000); // Проверяем каждые 2 секунды
            tryAdd(); // И сразу при инициализации
        }
    }

    new AniLibriaAutoSkip();
})();