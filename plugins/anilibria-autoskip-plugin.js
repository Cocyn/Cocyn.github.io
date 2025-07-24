(function() {
    'use strict';

    const CONFIG = {
        id: 'anilibria_autoskip',
        name: 'Anilibria Auto-Skip',
        version: '1.4.1',
        api: {
            baseUrl: 'https://anilibria.top/api/v1/',
            proxies: ['https://api.allorigins.win/get?url='],
            timeout: 10000,
            retries: 5
        },
        cache: {
            prefix: 'anilibria_skip_',
            expiry: 24 * 60 * 60 * 1000,
            maxSize: 50
        },
        skip: {
            defaultDelay: 1000,
            notificationDuration: 3000,
            checkInterval: 500
        },
        settings: {
            autoSkipEnabled: true,
            debugEnabled: false,
            skipDelay: 1000,
            cacheEnabled: true,
            showNotifications: true
        }
    };

    if (typeof Lampa === 'undefined') {
        console.warn('[AnilibriaAutoSkip] Lampa API не найден');
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

        init() {
            try {
                this.log('Инициализация плагина...', 'info');
                this.loadSettings();
                this.setupLampaIntegration();
                this.setupEventListeners();
                this.startActivityMonitoring();
                this.isInitialized = true;
                this.log('Плагин успешно инициализирован', 'success');
            } catch (error) {
                this.log(`Ошибка инициализации: ${error.message}`, 'error');
            }
        }

        loadSettings() {
            this.log('Загрузка настроек...', 'info');
            try {
                const stored = Lampa.Storage.get(`${CONFIG.id}_settings`);
                if (stored) this.settings = {...this.settings, ...stored};
                this.log(`Настройки загружены: ${JSON.stringify(this.settings)}`, 'debug');
            } catch (error) {
                this.log(`Ошибка загрузки настроек: ${error.message}`, 'warning');
            }
        }

        saveSettings() {
            try {
                Lampa.Storage.set(`${CONFIG.id}_settings`, this.settings);
                this.log('Настройки сохранены', 'debug');
            } catch (error) {
                this.log(`Ошибка сохранения настроек: ${error.message}`, 'error');
            }
        }

        setupLampaIntegration() {
            this.log('Настройка интеграции с Lampa...', 'info');
            try {
                this.log('Интеграция с Lampa завершена', 'success');
            } catch (error) {
                this.log(`Ошибка интеграции: ${error.message}`, 'error');
            }
        }

        setupEventListeners() {
            this.log('Настройка слушателей событий...', 'info');
            try {
                Lampa.Listener.follow('full', (e) => {
                    if (e.type === 'complite' && e.data?.movie) {
                        const title = e.data.movie.title || e.data.movie.name || e.data.movie.original_title || e.data.movie.original_name;
                        if (title) this.onTitleChange(title);
                    }
                });

                Lampa.Listener.follow('player', (e) => {
                    if (e.type === 'start') this.onPlayerStart();
                    else if (e.type === 'timeupdate') this.onTimeUpdate(e.current);
                });

                this.log('Слушатели событий настроены', 'success');
            } catch (error) {
                this.log(`Ошибка настройки слушателей: ${error.message}`, 'error');
            }
        }

        startActivityMonitoring() {
            this.log('Запуск мониторинга активности...', 'info');
            setInterval(() => this.checkCurrentActivity(), 2000);
        }

        checkCurrentActivity() {
            try {
                const activity = Lampa.Activity.active();
                if (!activity) return;
                const title = activity.movie?.title || activity.movie?.name || activity.movie?.original_title || activity.movie?.original_name;
                const episode = activity.episode ?? Lampa.Player?.episode?.number;
                if (title && title !== this.currentTitle) this.onTitleChange(title, episode);
            } catch (error) {
                this.log(`Ошибка проверки активности: ${error.message}`, 'debug');
            }
        }

        async onTitleChange(title, episode = null) {
            this.currentTitle = title;
            this.currentEpisode = episode;
            this.log(`Обнаружено аниме: "${title}"${episode ? ` Эпизод: ${episode}` : ''}`, 'info');
            if (this.settings.autoSkipEnabled) await this.fetchSkipData(title, episode);
        }

        async fetchSkipData(title, episode = null) {
            if (!title) return;
            this.log('Запрос к API Anilibria...', 'info');
            const cacheKey = `${CONFIG.cache.prefix}${title}${episode ? `_ep${episode}` : ''}`;

            if (this.settings.cacheEnabled) {
                const cached = this.getFromCache(cacheKey);
                if (cached) {
                    this.skipData = cached;
                    this.log('Используются кэшированные данные', 'debug');
                    return;
                }
            }

            for (const proxy of CONFIG.api.proxies) {
                try {
                    const searchUrl = this.buildProxyUrl(proxy, `${CONFIG.api.baseUrl}app/search/releases?query=${encodeURIComponent(title)}`);
                    let searchResponse = await this.apiRequest(searchUrl, proxy);
                    if (proxy.includes('allorigins.win')) {
                        searchResponse = JSON.parse(searchResponse.contents);
                    }
                    if (!searchResponse.list || searchResponse.list.length === 0) {
                        this.log(`Аниме "${title}" не найдено`, 'warning');
                        this.showSkipNotification('error', 'Аниме не найдено в API');
                        continue;
                    }

                    const animeId = searchResponse.list[0].id;
                    const titleUrl = this.buildProxyUrl(proxy, `${CONFIG.api.baseUrl}app/releases/${animeId}`);
                    let titleResponse = await this.apiRequest(titleUrl, proxy);
                    if (proxy.includes('allorigins.win')) {
                        titleResponse = JSON.parse(titleResponse.contents);
                    }
                    if (!titleResponse) {
                        this.log('Данные аниме не получены', 'warning');
                        this.showSkipNotification('error', 'Ошибка получения данных');
                        continue;
                    }

                    const skipData = this.extractSkipData(titleResponse, episode);
                    if (skipData) {
                        this.skipData = skipData;
                        if (this.settings.cacheEnabled) this.saveToCache(cacheKey, skipData);
                        this.log(`Данные пропусков: ${this.formatSkipData(skipData)}`, 'success');
                        return;
                    } else {
                        this.log(`Нет данных пропусков для "${title}"`, 'warning');
                        this.showSkipNotification('error', 'Нет данных для пропуска');
                        continue;
                    }
                } catch (error) {
                    this.log(`Ошибка с прокси ${proxy}: ${error.message}`, 'error');
                    if (error.message.includes('403') || error.message.includes('Failed to fetch')) {
                        continue;
                    }
                    this.showSkipNotification('error', 'Ошибка связи с API');
                    break;
                }
            }
            this.log('Все прокси не сработали', 'error');
            this.showSkipNotification('error', 'Не удалось подключиться к API');
        }

        buildProxyUrl(proxy, url) {
            if (proxy.includes('allorigins.win')) {
                return `${proxy}${encodeURIComponent(url)}`;
            }
            return `${proxy}${url}`;
        }

        async apiRequest(url, proxy, retries = CONFIG.api.retries) {
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
                    if (response.status === 429) {
                        await this.sleep(Math.pow(2, i) * 2000);
                        continue;
                    }
                    if (!response.ok) throw new Error(`HTTP ${response.status}`);
                    return await response.json();
                } catch (error) {
                    this.log(`Попытка ${i + 1} не удалась: ${error.message}`, 'debug');
                    if (i === retries - 1) throw error;
                    await this.sleep(Math.pow(2, i) * 1000);
                }
            }
        }

        extractSkipData(data, episode = null) {
            try {
                if (!data.player || !data.player.episodes) return null;
                if (episode !== null) {
                    const episodeData = data.player.episodes[episode.toString()];
                    if (episodeData?.skips) return this.parseSkipTimings(episodeData.skips);
                } else {
                    const episodes = Object.values(data.player.episodes);
                    if (episodes.length > 0 && episodes[0].skips) {
                        return this.parseSkipTimings(episodes[0].skips);
                    }
                }
                return null;
            } catch (error) {
                this.log(`Ошибка извлечения данных: ${error.message}`, 'error');
                return null;
            }
        }

        parseSkipTimings(skips) {
            const result = {};
            if (skips.opening && Array.isArray(skips.opening) && skips.opening.length >= 2) {
                result.intro = { start: skips.opening[0], end: skips.opening[1] };
            }
            if (skips.ending && Array.isArray(skips.ending) && skips.ending.length >= 2) {
                result.outro = { start: skips.ending[0], end: skips.ending[1] };
            }
            return Object.keys(result).length > 0 ? result : null;
        }

        startTimelineMonitoring() {
            if (this.timelineCheckInterval) clearInterval(this.timelineCheckInterval);
            this.log('Мониторинг времени начат', 'debug');
            this.timelineCheckInterval = setInterval(() => {
                if (this.settings.autoSkipEnabled && this.skipData) {
                    try {
                        const video = Lampa.Player.video();
                        if (video) this.onTimeUpdate(video.currentTime);
                    } catch (error) {
                        this.log(`Ошибка проверки времени: ${error.message}`, 'debug');
                    }
                }
            }, CONFIG.skip.checkInterval);
        }

        onTimeUpdate(currentTime) {
            if (!this.settings.autoSkipEnabled || !this.skipData) return;
            if (this.skipData.intro && currentTime >= this.skipData.intro.start && currentTime <= this.skipData.intro.end) {
                this.performSkip('intro', this.skipData.intro.end);
            }
            if (this.skipData.outro && currentTime >= this.skipData.outro.start && currentTime <= this.skipData.outro.end) {
                this.performSkip('outro', this.skipData.outro.end);
            }
        }

        performSkip(type, targetTime) {
            if (!this.settings.autoSkipEnabled) return;
            const now = Date.now();
            if (now - this.lastSkipTime < 2000) return;
            this.lastSkipTime = now;
            const currentTime = Lampa.Player.video().currentTime;
            this.log(`${type} обнаружено в ${this.formatTime(currentTime)} - пропуск до ${this.formatTime(targetTime)}`, 'info');
            if (this.settings.showNotifications) this.showSkipNotification(type);
            setTimeout(() => {
                try {
                    Lampa.Player.video().currentTime = targetTime;
                    this.log(`Пропуск ${type} выполнен`, 'success');
                } catch (error) {
                    this.log(`Ошибка пропуска ${type}: ${error.message}`, 'error');
                }
            }, this.settings.skipDelay);
        }

        showSkipNotification(type, message = null) {
            const typeText = message || (type === 'intro' ? 'интро' : type === 'outro' ? 'аутро' : 'ошибка');
            try {
                if (typeof Lampa.Noty !== 'undefined') {
                    Lampa.Noty.show(`${typeText}...`, {timeout: CONFIG.skip.notificationDuration});
                } else {
                    const div = document.createElement('div');
                    div.style.cssText = 'position: fixed; top: 10px; right: 10px; padding: 10px; background: #000; color: #fff;';
                    div.textContent = `${typeText}...`;
                    document.body.appendChild(div);
                    setTimeout(() => div.remove(), CONFIG.skip.notificationDuration);
                }
            } catch (error) {
                this.log(`Ошибка уведомления: ${error.message}`, 'debug');
            }
        }

        saveToCache(key, data) {
            try {
                if (this.cache.size >= CONFIG.cache.maxSize) {
                    const firstKey = this.cache.keys().next().value;
                    this.cache.delete(firstKey);
                }
                this.cache.set(key, { data, timestamp: Date.now() });
                Lampa.Storage.set(key, data);
                this.log(`Данные закэшированы: ${key}`, 'debug');
            } catch (error) {
                this.log(`Ошибка кэширования: ${error.message}`, 'error');
            }
        }

        getFromCache(key) {
            try {
                const memoryCache = this.cache.get(key);
                if (memoryCache && Date.now() - memoryCache.timestamp < CONFIG.cache.expiry) {
                    return memoryCache.data;
                }
                const storageCache = Lampa.Storage.get(key);
                if (storageCache) return storageCache;
                return null;
            } catch (error) {
                this.log(`Ошибка чтения кэша: ${error.message}`, 'error');
                return null;
            }
        }

        clearCache() {
            try {
                this.cache.clear();
                const keys = [];
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (key?.startsWith(CONFIG.cache.prefix)) keys.push(key);
                }
                keys.forEach(key => Lampa.Storage.set(key, null));
                this.log('Кэш успешно очищен', 'info');
            } catch (error) {
                this.log(`Ошибка очистки кэша: ${error.message}`, 'error');
            }
        }

        formatTime(seconds) {
            const minutes = Math.floor(seconds / 60);
            const secs = Math.floor(seconds % 60);
            return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }

        formatSkipData(skipData) {
            const parts = [];
            if (skipData.intro) parts.push(`интро ${this.formatTime(skipData.intro.start)}-${this.formatTime(skipData.intro.end)}`);
            if (skipData.outro) parts.push(`аутро ${this.formatTime(skipData.outro.start)}-${this.formatTime(skipData.outro.end)}`);
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

    const plugin = new AnilibriaAutoSkipPlugin();
    if (typeof window !== 'undefined') {
        window.AnilibriaAutoSkipPlugin = plugin;
    }
})();
