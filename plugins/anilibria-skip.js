/**
 * Плагин пропуска интро для Lampa (упрощенная версия)
 * Автоматически пропускает интро в аниме
 */

(function() {
    'use strict';

    // Конфигурация
    const PLUGIN_NAME = 'intro_skip';
    const DEFAULT_SETTINGS = {
        enabled: true,
        auto_skip: true,
        default_skip_time: 30,
        show_notifications: true
    };

    /**
     * Основной класс плагина
     */
    class IntroSkipPlugin {
        constructor() {
            this.settings = this.loadSettings();
            this.currentVideoData = null;
            this.skipButton = null;
            this.isProcessing = false;
            
            this.init();
        }

        /**
         * Инициализация плагина
         */
        init() {
            this.setupVideoEventListeners();
            this.log('Плагин пропуска интро инициализирован');
        }

        /**
         * Настройка слушателей событий видеоплеера
         */
        setupVideoEventListeners() {
            try {
                // Попытка подключиться к событиям Lampa
                if (typeof Lampa !== 'undefined' && Lampa.PlayerVideo) {
                    Lampa.PlayerVideo.listener.follow('start', (data) => {
                        this.onVideoStart(data);
                    });
                    
                    Lampa.PlayerVideo.listener.follow('timeupdate', (data) => {
                        this.onTimeUpdate(data);
                    });
                    
                    this.log('События видеоплеера настроены');
                }
            } catch (error) {
                this.log('Ошибка настройки событий:', error);
            }
        }

        /**
         * Обработка начала воспроизведения видео
         */
        onVideoStart(data) {
            if (!this.settings.enabled) return;

            try {
                // Извлечение информации о видео
                this.currentVideoData = this.extractVideoMetadata(data);
                
                if (this.isAnimeContent(this.currentVideoData)) {
                    this.log('Обнаружен аниме контент:', this.currentVideoData.title);
                    this.handleAnimeVideo();
                }
            } catch (error) {
                this.log('Ошибка при обработке начала видео:', error);
            }
        }

        /**
         * Обработка обновления времени воспроизведения
         */
        onTimeUpdate(data) {
            if (!this.settings.enabled || !this.currentVideoData) return;

            try {
                const currentTime = data.currentTime || 0;
                
                // Проверка на интро (первые 30-90 секунд)
                if (currentTime > 10 && currentTime < 90 && this.settings.auto_skip) {
                    this.checkAndSkipIntro(currentTime);
                }
            } catch (error) {
                this.log('Ошибка при обновлении времени:', error);
            }
        }

        /**
         * Извлечение метаданных видео
         */
        extractVideoMetadata(data) {
            return {
                title: data.title || data.movie?.title || 'Неизвестно',
                year: data.year || data.movie?.year || null,
                season: data.season || null,
                episode: data.episode || null,
                source: data.source || 'unknown'
            };
        }

        /**
         * Проверка, является ли контент аниме
         */
        isAnimeContent(videoData) {
            if (!videoData || !videoData.title) return false;
            
            const title = videoData.title.toLowerCase();
            const animeKeywords = ['аниме', 'anime', 'наруто', 'naruto', 'ван пис', 'one piece', 
                                 'атака титанов', 'attack on titan', 'токийский гуль', 'tokyo ghoul'];
            
            return animeKeywords.some(keyword => title.includes(keyword));
        }

        /**
         * Обработка аниме видео
         */
        handleAnimeVideo() {
            // Показываем кнопку пропуска через 10 секунд
            setTimeout(() => {
                if (this.currentVideoData) {
                    this.showSkipButton();
                }
            }, 10000);
        }

        /**
         * Проверка и пропуск интро
         */
        checkAndSkipIntro(currentTime) {
            // Простая логика: если прошло 15-45 секунд, предлагаем пропустить
            if (currentTime >= 15 && currentTime <= 45 && !this.skipButton) {
                this.showSkipButton();
            }
        }

        /**
         * Показать кнопку пропуска интро
         */
        showSkipButton() {
            if (this.skipButton) return;

            try {
                // Создание кнопки пропуска
                this.skipButton = document.createElement('div');
                this.skipButton.innerHTML = 'Пропустить интро';
                this.skipButton.style.cssText = `
                    position: fixed;
                    bottom: 100px;
                    right: 20px;
                    background: rgba(0, 0, 0, 0.8);
                    color: white;
                    padding: 10px 20px;
                    border-radius: 5px;
                    cursor: pointer;
                    z-index: 10000;
                    font-family: Arial, sans-serif;
                    font-size: 14px;
                    border: 2px solid #007bff;
                `;

                // Обработчик клика
                this.skipButton.onclick = () => {
                    this.skipIntro();
                };

                // Добавление на страницу
                document.body.appendChild(this.skipButton);

                // Автоматическое скрытие через 10 секунд
                setTimeout(() => {
                    this.hideSkipButton();
                }, 10000);

                this.showNotification('Нажмите кнопку для пропуска интро');

            } catch (error) {
                this.log('Ошибка создания кнопки пропуска:', error);
            }
        }

        /**
         * Скрыть кнопку пропуска
         */
        hideSkipButton() {
            if (this.skipButton && this.skipButton.parentNode) {
                this.skipButton.parentNode.removeChild(this.skipButton);
                this.skipButton = null;
            }
        }

        /**
         * Пропустить интро
         */
        skipIntro() {
            try {
                const skipTime = this.settings.default_skip_time;
                
                // Попытка использовать API Lampa для перемотки
                if (typeof Lampa !== 'undefined' && Lampa.PlayerVideo && Lampa.PlayerVideo.player) {
                    const player = Lampa.PlayerVideo.player;
                    if (player.currentTime !== undefined) {
                        player.currentTime = skipTime;
                        this.showNotification(`Интро пропущено (+${skipTime}с)`);
                    }
                }

                this.hideSkipButton();
                
            } catch (error) {
                this.log('Ошибка пропуска интро:', error);
                this.showNotification('Ошибка пропуска интро');
            }
        }

        /**
         * Загрузить настройки
         */
        loadSettings() {
            try {
                const saved = localStorage.getItem(`${PLUGIN_NAME}_settings`);
                if (saved) {
                    return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
                }
                return { ...DEFAULT_SETTINGS };
            } catch (error) {
                this.log('Ошибка загрузки настроек:', error);
                return { ...DEFAULT_SETTINGS };
            }
        }

        /**
         * Сохранить настройки
         */
        saveSettings() {
            try {
                localStorage.setItem(`${PLUGIN_NAME}_settings`, JSON.stringify(this.settings));
                this.log('Настройки сохранены');
            } catch (error) {
                this.log('Ошибка сохранения настроек:', error);
            }
        }

        /**
         * Показать уведомление
         */
        showNotification(message) {
            if (!this.settings.show_notifications) return;

            try {
                // Попытка использовать уведомления Lampa
                if (typeof Lampa !== 'undefined' && Lampa.Noty) {
                    Lampa.Noty({
                        title: 'Пропуск интро',
                        descr: message,
                        type: 'info'
                    });
                    return;
                }

                // Fallback уведомление
                this.createCustomNotification(message);

            } catch (error) {
                this.log('Ошибка показа уведомления:', error);
            }
        }

        /**
         * Создать собственное уведомление
         */
        createCustomNotification(message) {
            const notification = document.createElement('div');
            notification.textContent = message;
            notification.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: #007bff;
                color: white;
                padding: 15px;
                border-radius: 5px;
                z-index: 10001;
                font-family: Arial, sans-serif;
                font-size: 14px;
                max-width: 300px;
            `;

            document.body.appendChild(notification);

            // Автоматическое удаление через 3 секунды
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 3000);
        }

        /**
         * Логирование
         */
        log(message, data = null) {
            console.log(`[IntroSkip] ${message}`, data || '');
        }
    }

    // Инициализация плагина
    function initializePlugin() {
        try {
            // Проверка доступности Lampa
            if (typeof Lampa === 'undefined') {
                console.log('[IntroSkip] Ожидание загрузки Lampa...');
                setTimeout(initializePlugin, 1000);
                return;
            }

            // Создание экземпляра плагина
            new IntroSkipPlugin();
            console.log('[IntroSkip] Плагин успешно инициализирован');

        } catch (error) {
            console.error('[IntroSkip] Ошибка инициализации плагина:', error);
        }
    }

    // Запуск инициализации
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializePlugin);
    } else {
        initializePlugin();
    }

})();
