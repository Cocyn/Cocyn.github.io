(function() {
    'use strict';

    /**
     * Lampa Anilibria Auto-Skip Plugin
     * Автоматически пропускает интро и аутро в аниме, используя API Anilibria
     * 
     * Версия: 1.0.0
     * Автор: Anilibria Auto-Skip Plugin
     * Поддерживает: Web, WebOS
     */

    // Конфигурация плагина
    const CONFIG = {
        id: 'anilibria_autoskip',
        name: 'Anilibria Auto-Skip',
        version: '1.0.0',
        api: {
            baseUrl: 'https://api.anilibria.tv/v3/',
            timeout: 5000,
            retries: 3
        },
        cache: {
            prefix: 'anilibria_skip_',
            expiry: 24 * 60 * 60 * 1000, // 24 часа
            maxSize: 50 // максимальное количество записей в кэше
        },
        skip: {
            defaultDelay: 1000, // задержка пропуска в миллисекундах
            notificationDuration: 3000, // длительность уведомления
            checkInterval: 500 // интервал проверки времени
        },
        settings: {
            autoSkipEnabled: true,
            debugEnabled: false,
            skipDelay: 1000,
            cacheEnabled: true,
            showNotifications: true
        }
    };

    // Проверка наличия Lampa API
    if (typeof Lampa === 'undefined') {
        console.warn('[AnilibriaAutoSkip] Lampa API not found - plugin may not work correctly');
        return;
    }

    class AnilibriaAutoSkipPlugin {
        constructor() {
            this.settings = {...CONFIG.settings};
            this.cache = new Map();
            this.currentTitle = null;
            this.currentEpisode = null;
            this.skipData = null;
            this.timelineCheckInterval = null;
            this.lastSkipTime = 0;
            this.isInitialized = false;

            this.init();
        }

        /**
         * Инициализация плагина
         */
        init() {
            try {
                this.log('Initializing Anilibria Auto-Skip Plugin...', 'info');
                
                this.loadSettings();
                this.setupLampaIntegration();
                this.setupEventListeners();
                this.startActivityMonitoring();
                
                this.isInitialized = true;
                this.log('Plugin initialized successfully', 'success');
            } catch (error) {
                this.log(`Failed to initialize plugin: ${error.message}`, 'error');
            }
        }

        /**
         * Загрузка настроек из Storage
         */
        loadSettings() {
            this.log('Loading settings from Storage...', 'info');
            
            try {
                const stored = Lampa.Storage.get(`${CONFIG.id}_settings`);
                if (stored) {
                    this.settings = {...this.settings, ...stored};
                }
                this.log(`Settings loaded: ${JSON.stringify(this.settings)}`, 'debug');
            } catch (error) {
                this.log(`Failed to load settings: ${error.message}`, 'warning');
            }
        }

        /**
         * Сохранение настроек в Storage
         */
        saveSettings() {
            try {
                Lampa.Storage.set(`${CONFIG.id}_settings`, this.settings);
                this.log('Settings saved', 'debug');
            } catch (error) {
                this.log(`Failed to save settings: ${error.message}`, 'error');
            }
        }

        /**
         * Интеграция с интерфейсом настроек Lampa
         */
        setupLampaIntegration() {
            this.log('Setting up Lampa integration...', 'info');

            try {
                // В настоящей Lampa нет прямого API для добавления настроек через плагины
                // Настройки управляются через Lampa.Storage
                this.log('Lampa integration setup complete - using Storage API', 'success');
            } catch (error) {
                this.log(`Failed to setup Lampa integration: ${error.message}`, 'error');
            }
        }

        /**
         * Создание HTML для настроек
         */
        createSettingsHTML() {
            return `
                <div class="settings-param selector" data-type="toggle" data-name="autoSkipEnabled">
                    <div class="settings-param__name">Автоматический пропуск</div>
                    <div class="settings-param__value">
                        <div class="settings-param__descr">Автоматически пропускать интро и аутро</div>
                    </div>
                </div>
                <div class="settings-param selector" data-type="toggle" data-name="debugEnabled">
                    <div class="settings-param__name">Отладочные логи</div>
                    <div class="settings-param__value">
                        <div class="settings-param__descr">Подробные логи в консоли браузера</div>
                    </div>
                </div>
                <div class="settings-param selector" data-type="slider" data-name="skipDelay" data-min="0" data-max="5000" data-step="500">
                    <div class="settings-param__name">Задержка пропуска (мс)</div>
                    <div class="settings-param__value">
                        <div class="settings-param__descr">Задержка перед автоматическим пропуском</div>
                    </div>
                </div>
                <div class="settings-param selector" data-type="toggle" data-name="cacheEnabled">
                    <div class="settings-param__name">Кэширование</div>
                    <div class="settings-param__value">
                        <div class="settings-param__descr">Сохранять данные о пропусках</div>
                    </div>
                </div>
                <div class="settings-param selector" data-type="button" data-name="clearCache">
                    <div class="settings-param__name">Очистить кэш</div>
                    <div class="settings-param__value">
                        <div class="settings-param__descr">Удалить все сохранённые данные</div>
                    </div>
                </div>
            `;
        }

        /**
         * Привязка событий для настроек
         */
        bindSettingsEvents(container) {
            const toggles = container.querySelectorAll('[data-type="toggle"]');
            const sliders = container.querySelectorAll('[data-type="slider"]');
            const buttons = container.querySelectorAll('[data-type="button"]');

            toggles.forEach(toggle => {
                const paramName = toggle.dataset.name;
                const currentValue = this.settings[paramName];
                
                toggle.classList.toggle('active', currentValue);
                
                toggle.addEventListener('click', () => {
                    const newValue = !this.settings[paramName];
                    this.settings[paramName] = newValue;
                    toggle.classList.toggle('active', newValue);
                    this.saveSettings();
                    this.log(`Setting ${paramName} changed to ${newValue}`, 'info');
                });
            });

            buttons.forEach(button => {
                const paramName = button.dataset.name;
                if (paramName === 'clearCache') {
                    button.addEventListener('click', () => {
                        this.clearCache();
                        this.log('Cache cleared by user', 'info');
                    });
                }
            });
        }

        /**
         * Настройка слушателей событий
         */
        setupEventListeners() {
            this.log('Setting up event listeners...', 'info');

            try {
                // Отслеживаем события как в rating плагине
                Lampa.Listener.follow('full', (e) => {
                    if (e.type === 'complite') {
                        this.log(`Full event received: ${JSON.stringify(e.data)}`, 'debug');
                        if (e.data && e.data.movie) {
                            const title = e.data.movie.title || e.data.movie.name || e.data.movie.original_title || e.data.movie.original_name;
                            if (title) {
                                this.onTitleChange(title);
                            }
                        }
                    }
                });

                // Слушаем события плеера
                Lampa.Listener.follow('player', (e) => {
                    if (e.type === 'start') {
                        this.onPlayerStart();
                    } else if (e.type === 'timeupdate') {
                        this.onTimeUpdate(e.current);
                    }
                });

                // Дополнительно слушаем изменения активности
                Lampa.Listener.follow('activity', (e) => {
                    this.log(`Activity event: ${e.type}`, 'debug');
                });

                this.log('Event listeners setup complete', 'success');
            } catch (error) {
                this.log(`Failed to setup event listeners: ${error.message}`, 'error');
            }
        }

        /**
         * Мониторинг активности
         */
        startActivityMonitoring() {
            this.log('Starting activity monitoring...', 'info');
            
            setInterval(() => {
                this.checkCurrentActivity();
            }, 2000);
        }

        /**
         * Проверка текущей активности
         */
        checkCurrentActivity() {
            try {
                const activity = Lampa.Activity.active();
                if (!activity) return;

                const title = activity.title ? activity.title() : activity.movie?.title || activity.movie?.name;
                const episode = activity.episode;

                if (title && title !== this.currentTitle) {
                    this.onTitleChange(title, episode);
                }
            } catch (error) {
                this.log(`Error checking activity: ${error.message}`, 'debug');
            }
        }

        /**
         * Обработка изменения активности
         */
        onActivityChange() {
            this.log('Activity changed', 'debug');
            this.checkCurrentActivity();
        }

        /**
         * Обработка запуска плеера
         */
        onPlayerStart() {
            this.log('Player started', 'debug');
            this.startTimelineMonitoring();
        }

        /**
         * Обработка изменения заголовка
         */
        async onTitleChange(title, episode = null) {
            this.currentTitle = title;
            this.currentEpisode = episode;
            
            this.log(`Title detected: "${title}"${episode ? ` Episode: ${episode}` : ''}`, 'info');
            
            if (this.settings.autoSkipEnabled) {
                await this.fetchSkipData(title, episode);
            }
        }

        /**
         * Получение данных о пропусках из API Anilibria
         */
        async fetchSkipData(title, episode = null) {
            if (!title) return;

            try {
                this.log('Requesting Anilibria API...', 'info');

                // Проверяем кэш
                const cacheKey = `${CONFIG.cache.prefix}${title}${episode ? `_ep${episode}` : ''}`;
                
                if (this.settings.cacheEnabled) {
                    const cached = this.getFromCache(cacheKey);
                    if (cached) {
                        this.skipData = cached;
                        this.log('Using cached timing data', 'debug');
                        return;
                    }
                }

                // Ищем аниме в Anilibria
                const searchUrl = `${CONFIG.api.baseUrl}title/search?search=${encodeURIComponent(title)}&limit=5`;
                const searchResponse = await this.apiRequest(searchUrl);

                if (!searchResponse.data || searchResponse.data.length === 0) {
                    this.log(`No results found for "${title}"`, 'warning');
                    return;
                }

                // Получаем детальную информацию о первом результате
                const animeId = searchResponse.data[0].id;
                const titleUrl = `${CONFIG.api.baseUrl}title?id=${animeId}`;
                const titleResponse = await this.apiRequest(titleUrl);

                if (!titleResponse.data) {
                    this.log('No title data received', 'warning');
                    return;
                }

                // Извлекаем данные о пропусках
                const skipData = this.extractSkipData(titleResponse.data, episode);
                
                if (skipData) {
                    this.skipData = skipData;
                    
                    // Сохраняем в кэш
                    if (this.settings.cacheEnabled) {
                        this.saveToCache(cacheKey, skipData);
                    }

                    this.log(`Skip data received: ${this.formatSkipData(skipData)}`, 'success');
                } else {
                    this.log(`No skip data available for "${title}"`, 'warning');
                }

            } catch (error) {
                this.log(`API Error: ${error.message}`, 'error');
            }
        }

        /**
         * Выполнение запроса к API с повторными попытками
         */
        async apiRequest(url, retries = CONFIG.api.retries) {
            for (let i = 0; i < retries; i++) {
                try {
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), CONFIG.api.timeout);

                    const response = await fetch(url, {
                        signal: controller.signal,
                        headers: {
                            'User-Agent': `Lampa/${CONFIG.name}/${CONFIG.version}`,
                            'Accept': 'application/json'
                        }
                    });

                    clearTimeout(timeoutId);

                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                    }

                    return await response.json();
                    
                } catch (error) {
                    this.log(`API request attempt ${i + 1} failed: ${error.message}`, 'debug');
                    
                    if (i === retries - 1) {
                        throw error;
                    }
                    
                    // Экспоненциальная задержка между попытками
                    await this.sleep(Math.pow(2, i) * 1000);
                }
            }
        }

        /**
         * Извлечение данных о пропусках из ответа API
         */
        extractSkipData(data, episode = null) {
            try {
                if (!data.player || !data.player.episodes) {
                    return null;
                }

                // Если указан эпизод, ищем конкретный
                if (episode !== null) {
                    const episodeData = data.player.episodes[episode.toString()];
                    if (episodeData && episodeData.skips) {
                        return this.parseSkipTimings(episodeData.skips);
                    }
                } else {
                    // Берём данные из первого доступного эпизода
                    const episodes = Object.values(data.player.episodes);
                    if (episodes.length > 0) {
                        const firstEpisode = episodes[0];
                        if (firstEpisode.skips) {
                            return this.parseSkipTimings(firstEpisode.skips);
                        }
                    }
                }

                return null;
            } catch (error) {
                this.log(`Error extracting skip data: ${error.message}`, 'error');
                return null;
            }
        }

        /**
         * Парсинг временных меток пропусков
         */
        parseSkipTimings(skips) {
            const result = {};

            if (skips.opening && Array.isArray(skips.opening) && skips.opening.length >= 2) {
                result.intro = {
                    start: skips.opening[0],
                    end: skips.opening[1]
                };
            }

            if (skips.ending && Array.isArray(skips.ending) && skips.ending.length >= 2) {
                result.outro = {
                    start: skips.ending[0],
                    end: skips.ending[1]
                };
            }

            return Object.keys(result).length > 0 ? result : null;
        }

        /**
         * Запуск мониторинга времени
         */
        startTimelineMonitoring() {
            if (this.timelineCheckInterval) {
                clearInterval(this.timelineCheckInterval);
            }

            this.log('Timeline monitoring started', 'debug');
            
            this.timelineCheckInterval = setInterval(() => {
                if (this.settings.autoSkipEnabled && this.skipData) {
                    try {
                        const video = Lampa.Player.video();
                        if (video) {
                            this.onTimeUpdate(video.currentTime);
                        }
                    } catch (error) {
                        this.log(`Timeline check error: ${error.message}`, 'debug');
                    }
                }
            }, CONFIG.skip.checkInterval);
        }

        /**
         * Обработка обновления времени
         */
        onTimeUpdate(currentTime) {
            if (!this.settings.autoSkipEnabled || !this.skipData) return;

            // Проверяем интро
            if (this.skipData.intro && 
                currentTime >= this.skipData.intro.start && 
                currentTime <= this.skipData.intro.end) {
                this.performSkip('intro', this.skipData.intro.end);
            }
            
            // Проверяем аутро
            if (this.skipData.outro && 
                currentTime >= this.skipData.outro.start && 
                currentTime <= this.skipData.outro.end) {
                this.performSkip('outro', this.skipData.outro.end);
            }
        }

        /**
         * Выполнение пропуска
         */
        performSkip(type, targetTime) {
            if (!this.settings.autoSkipEnabled) return;
            
            const now = Date.now();
            const timeSinceLastSkip = now - this.lastSkipTime;
            
            // Предотвращаем частые пропуски
            if (timeSinceLastSkip < 2000) return;
            
            this.lastSkipTime = now;
            
            const currentTime = Lampa.Player.video().currentTime;
            this.log(`${type} detected at ${this.formatTime(currentTime)} - auto-skipping to ${this.formatTime(targetTime)}`, 'info');
            
            // Показываем уведомление
            if (this.settings.showNotifications) {
                this.showSkipNotification(type);
            }
            
            // Выполняем пропуск после задержки
            setTimeout(() => {
                try {
                    Lampa.Player.video().currentTime = targetTime;
                    this.log(`Successfully skipped ${type}`, 'success');
                } catch (error) {
                    this.log(`Failed to skip ${type}: ${error.message}`, 'error');
                }
            }, this.settings.skipDelay);
        }

        /**
         * Показ уведомления о пропуске
         */
        showSkipNotification(type) {
            const typeText = type === 'intro' ? 'интро' : 'аутро';
            
            try {
                // Используем встроенные уведомления Lampa
                if (typeof Lampa.Noty !== 'undefined') {
                    Lampa.Noty.show(`Пропуск ${typeText}...`, {timeout: CONFIG.skip.notificationDuration});
                } else {
                    this.log(`Showing skip notification: ${typeText}`, 'info');
                }
            } catch (error) {
                this.log(`Failed to show notification: ${error.message}`, 'debug');
            }
        }

        /**
         * Работа с кэшем
         */
        saveToCache(key, data) {
            try {
                // Ограничиваем размер кэша
                if (this.cache.size >= CONFIG.cache.maxSize) {
                    const firstKey = this.cache.keys().next().value;
                    this.cache.delete(firstKey);
                }

                this.cache.set(key, {
                    data: data,
                    timestamp: Date.now()
                });

                // Сохраняем в Lampa Storage
                Lampa.Storage.set(key, data);
                
                this.log(`Data cached for key: ${key}`, 'debug');
            } catch (error) {
                this.log(`Failed to save to cache: ${error.message}`, 'error');
            }
        }

        getFromCache(key) {
            try {
                // Проверяем память
                const memoryCache = this.cache.get(key);
                if (memoryCache && Date.now() - memoryCache.timestamp < CONFIG.cache.expiry) {
                    return memoryCache.data;
                }

                // Проверяем Lampa Storage
                const storageCache = Lampa.Storage.get(key);
                if (storageCache) {
                    return storageCache;
                }

                return null;
            } catch (error) {
                this.log(`Failed to get from cache: ${error.message}`, 'error');
                return null;
            }
        }

        clearCache() {
            try {
                this.cache.clear();
                
                // Очищаем из Lampa Storage
                const keys = [];
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key && key.startsWith(CONFIG.cache.prefix)) {
                        keys.push(key);
                    }
                }
                
                keys.forEach(key => {
                    Lampa.Storage.set(key, null);
                });
                
                this.log('Cache cleared successfully', 'info');
            } catch (error) {
                this.log(`Failed to clear cache: ${error.message}`, 'error');
            }
        }

        /**
         * Утилиты
         */
        formatTime(seconds) {
            const minutes = Math.floor(seconds / 60);
            const secs = Math.floor(seconds % 60);
            return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }

        formatSkipData(skipData) {
            const parts = [];
            if (skipData.intro) {
                parts.push(`intro ${this.formatTime(skipData.intro.start)}-${this.formatTime(skipData.intro.end)}`);
            }
            if (skipData.outro) {
                parts.push(`outro ${this.formatTime(skipData.outro.start)}-${this.formatTime(skipData.outro.end)}`);
            }
            return parts.join(', ');
        }

        sleep(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }

        log(message, type = 'info') {
            if (!this.settings.debugEnabled && type === 'debug') return;
            
            const timestamp = new Date().toLocaleString('ru-RU');
            const prefix = '[AnilibriaAutoSkip]';
            
            switch (type) {
                case 'success':
                    console.log(`%c${prefix} ${message}`, 'color: #10b981');
                    break;
                case 'error':
                    console.error(`%c${prefix} ${message}`, 'color: #ef4444');
                    break;
                case 'warning':
                    console.warn(`%c${prefix} ${message}`, 'color: #f59e0b');
                    break;
                case 'info':
                    console.info(`%c${prefix} ${message}`, 'color: #3b82f6');
                    break;
                case 'debug':
                    console.debug(`%c${prefix} ${message}`, 'color: #6b7280');
                    break;
            }
        }
    }

    // Инициализация плагина
    const plugin = new AnilibriaAutoSkipPlugin();

    // Экспорт для использования в Lampa
    if (typeof window !== 'undefined') {
        window.AnilibriaAutoSkipPlugin = plugin;
    }

})();
