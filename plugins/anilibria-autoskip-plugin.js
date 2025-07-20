// ==UserScript==
// @name         AniLibria AutoSkip for Lampa (clean)
// @version      1.0.0
// @description  Автоматический пропуск опенингов и эндингов в Lampa
// @author       OpenAI + community
// @match        *://*/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const PLUGIN_ID = 'anilibria_autoskip_clean';
    if (window[PLUGIN_ID]) return;

    class AniLibriaAutoSkip {
        constructor() {
            this.version = '1.0.0';
            this.component = 'anilibria_autoskip';
            this.name = 'AniLibria AutoSkip';
            this.settings = Object.assign({
                enabled: true,
                skipOpenings: true,
                skipEndings: true,
                showNotifications: true
            }, this.loadSettings());
            this.isRunning = false;
            this.lastSkip = 0;
            this.skipData = null;
            this.video = null;
            this.timeHandler = null;
            this.init();
        }

        init() {
            this.addSettingsToLampa();
            this.listenPlayer();
            window[PLUGIN_ID] = this;
        }

        addSettingsToLampa() {
            if (typeof Lampa !== 'undefined' && Lampa.Settings && Lampa.Settings.component) {
                Lampa.Settings.component({
                    component: this.component,
                    name: this.name,
                    icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>'
                });
                Lampa.Settings.listener.follow('open', (e) => {
                    if (e.name === this.component) this.openSettingsModal();
                });
            }
        }

        openSettingsModal() {
            const html = `
                <div style="padding:20px;max-width:400px;color:#fff">
                    <h2 style="color:#4CAF50">${this.name}</h2>
                    <label><input type="checkbox" data-setting="enabled" ${this.settings.enabled ? 'checked' : ''}/> Включить AutoSkip</label><br>
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

        listenPlayer() {
            if (typeof Lampa !== 'undefined' && Lampa.Player && Lampa.Player.listener) {
                Lampa.Player.listener.follow('start', () => this.onPlayerStart());
                Lampa.Player.listener.follow('stop', () => this.onPlayerStop());
            }
        }

        onPlayerStart() {
            if (!this.settings.enabled) return;
            this.video = this.getVideo();
            this.lastSkip = 0;
            this.skipData = this.getDefaultSkipData();
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

        getDefaultSkipData() {
            // Можно расширить для получения реальных данных с AniLibria API
            return {
                opening: { start: 85, end: 105 }, // 1:25 - 1:45
                ending: { start: -90, end: -30 }  // последние 1:30 - 0:30
            };
        }

        checkSkip() {
            if (!this.video || !this.skipData) return;
            const t = this.video.currentTime;
            const d = this.video.duration;
            // Не скипать слишком часто
            if (Math.abs(t - this.lastSkip) < 5) return;

            // Opening
            if (this.settings.skipOpenings && t >= this.skipData.opening.start && t <= this.skipData.opening.end) {
                this.video.currentTime = this.skipData.opening.end;
                this.lastSkip = this.skipData.opening.end;
                this.notify('Опенинг пропущен');
            }
            // Ending
            if (this.settings.skipEndings && d && t >= d + this.skipData.ending.start && t <= d + this.skipData.ending.end) {
                this.video.currentTime = d - 1;
                this.lastSkip = d - 1;
                this.notify('Эндинг пропущен');
            }
        }

        notify(msg) {
            if (!this.settings.showNotifications) return;
            if (typeof Lampa !== 'undefined' && Lampa.Noty) {
                Lampa.Noty.show(msg);
            } else {
                // fallback
                let n = document.createElement('div');
                n.style = 'position:fixed;top:20px;right:20px;background:#222;color:#fff;padding:10px 20px;z-index:9999;border-radius:8px';
                n.textContent = msg;
                document.body.appendChild(n);
                setTimeout(() => n.remove(), 2000);
            }
        }

        loadSettings() {
            try {
                return JSON.parse(localStorage.getItem('anilibria_autoskip_settings') || '{}');
            } catch(e){ return {}; }
        }
        saveSettings() {
            localStorage.setItem('anilibria_autoskip_settings', JSON.stringify(this.settings));
        }
    }

    new AniLibriaAutoSkip();
})();