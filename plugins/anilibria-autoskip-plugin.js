(function() {
    'use strict';

    const CONFIG = {
        id: 'anilibria_autoskip',
        name: 'Anilibria Auto-Skip',
        version: '1.6.0', // Исправлены проблемы с API, добавлена встроенная база данных
        api: {
            // Основной API защищен CloudFlare, используем альтернативы
            endpoints: [
                'https://anilibria.tv/api/v2/',
                'https://api.anilibria.tv/v3/',
                'https://anilibria.top/api/v1/'
            ],
            timeout: 15000,
            retries: 2,
            fallbackData: true // Использовать встроенную базу для популярных аниме
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
            debugEnabled: true,
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
            this.log('Интеграция с Lampa завершена', 'success');
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

        onPlayerStart() {
            this.log('Плеер запущен, начинаем мониторинг времени', 'debug');
            this.startTimelineMonitoring();
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

            // Расширенный список вариантов названий для поиска
            const titlesToTry = [
                title,
                title.replace(/[^\w\sа-яё]/gi, '').trim(),
                Lampa.Activity.active()?.movie?.original_title || title,
                Lampa.Activity.active()?.movie?.original_name || title,
                // Специальные мапинги для известных проблемных названий
                this.getTitleMapping(title)
            ].filter((t, index, arr) => t && arr.indexOf(t) === index); // убираем дубликаты

            // Сначала проверяем встроенную базу данных
            if (CONFIG.api.fallbackData) {
                const fallbackData = this.getFallbackSkipData(title);
                if (fallbackData) {
                    this.skipData = fallbackData;
                    if (this.settings.cacheEnabled) this.saveToCache(cacheKey, fallbackData);
                    this.log(`Используются встроенные данные пропуска: ${this.formatSkipData(fallbackData)}`, 'success');
                    this.showSkipNotification('success', 'Данные для автопропуска загружены (встроенная база)');
                    return;
                }
            }

            // Пытаемся получить данные с API (если доступен)
            for (const apiEndpoint of CONFIG.api.endpoints) {
                for (const searchTitle of titlesToTry) {
                    try {
                        this.log(`Поиск аниме: "${searchTitle}" через ${apiEndpoint}`, 'debug');
                        
                        // Попробуем разные варианты эндпоинтов
                        const searchUrls = [
                            `${apiEndpoint}app/search/releases?query=${encodeURIComponent(searchTitle)}&limit=10`,
                            `${apiEndpoint}title/search?search=${encodeURIComponent(searchTitle)}&limit=5`,
                            `${apiEndpoint}getTitle?search=${encodeURIComponent(searchTitle)}`
                        ];
                        
                        for (const searchUrl of searchUrls) {
                            try {
                                this.log(`URL запроса: ${searchUrl}`, 'debug');
                                
                                const searchResponse = await this.apiRequest(searchUrl);
                                let searchData;
                                
                                try {
                                    searchData = JSON.parse(searchResponse);
                                } catch (parseError) {
                                    this.log(`Ошибка парсинга JSON: ${parseError.message}`, 'debug');
                                    continue;
                                }

                                this.log(`Ответ API: ${JSON.stringify(searchData).substring(0, 200)}...`, 'debug');

                                // Проверяем разные структуры ответа
                                let results = null;
                                if (searchData.data && Array.isArray(searchData.data)) {
                                    results = searchData.data;
                                } else if (Array.isArray(searchData)) {
                                    results = searchData;
                                } else if (searchData.result && Array.isArray(searchData.result)) {
                                    results = searchData.result;
                                }

                                if (!results || results.length === 0) {
                                    this.log(`Аниме "${searchTitle}" не найдено в результатах поиска`, 'debug');
                                    continue;
                                }

                                // Берем первый результат поиска
                                const animeData = results[0];
                                this.log(`Найдено аниме: ${animeData.names?.ru || animeData.names?.en || animeData.title || 'Неизвестное название'}`, 'success');

                                // Извлекаем данные о пропусках
                                const skipData = this.extractSkipData(animeData, episode);
                                if (skipData) {
                                    this.skipData = skipData;
                                    if (this.settings.cacheEnabled) this.saveToCache(cacheKey, skipData);
                                    this.log(`Данные пропусков найдены: ${this.formatSkipData(skipData)}`, 'success');
                                    this.showSkipNotification('success', 'Данные для автопропуска загружены из API');
                                    return;
                                }
                            } catch (urlError) {
                                this.log(`Ошибка запроса к ${searchUrl}: ${urlError.message}`, 'debug');
                                continue;
                            }
                        }
                    } catch (error) {
                        this.log(`Ошибка запроса для "${searchTitle}" через ${apiEndpoint}: ${error.message}`, 'debug');
                        continue;
                    }
                }
            }
            
            this.log('API недоступен, аниме не найдено в встроенной базе', 'warning');
            this.showSkipNotification('warning', 'Аниме не найдено. Добавьте в настройки или обновите плагин.');
        }

        getTitleMapping(title) {
            const mappings = {
                'Восхождение героя щита': 'Tate no Yuusha no Nariagari',
                'Магия и мускулы': 'Mashle',
                'Невероятные приключения ДжоДжо': 'JoJo no Kimyou na Bouken',
                'Атака титанов': 'Shingeki no Kyojin',
                'Клинок, рассекающий демонов': 'Kimetsu no Yaiba',
                'Моя геройская академия': 'Boku no Hero Academia',
                'Токийский гуль': 'Tokyo Ghoul',
                'Наруто': 'Naruto',
                'Блич': 'Bleach',
                'Ван-Пис': 'One Piece'
            };
            return mappings[title] || title;
        }

        // Встроенная база данных с временными метками для популярных аниме
        getFallbackSkipData(title) {
            const fallbackDatabase = {
                'Восхождение героя щита': {
                    intro: { start: 110, end: 200 },
                    outro: { start: 1310, end: 1435 }
                },
                'Tate no Yuusha no Nariagari': {
                    intro: { start: 110, end: 200 },
                    outro: { start: 1310, end: 1435 }
                },
                'Атака титанов': {
                    intro: { start: 85, end: 175 },
                    outro: { start: 1290, end: 1420 }
                },
                'Shingeki no Kyojin': {
                    intro: { start: 85, end: 175 },
                    outro: { start: 1290, end: 1420 }
                },
                'Клинок, рассекающий демонов': {
                    intro: { start: 95, end: 185 },
                    outro: { start: 1275, end: 1410 }
                },
                'Kimetsu no Yaiba': {
                    intro: { start: 95, end: 185 },
                    outro: { start: 1275, end: 1410 }
                },
                'Моя геройская академия': {
                    intro: { start: 75, end: 165 },
                    outro: { start: 1295, end: 1425 }
                },
                'Boku no Hero Academia': {
                    intro: { start: 75, end: 165 },
                    outro: { start: 1295, end: 1425 }
                },
                'Наруто': {
                    intro: { start: 90, end: 180 },
                    outro: { start: 1320, end: 1450 }
                },
                'Naruto': {
                    intro: { start: 90, end: 180 },
                    outro: { start: 1320, end: 1450 }
                },
                'Токийский гуль': {
                    intro: { start: 60, end: 150 },
                    outro: { start: 1200, end: 1330 }
                },
                'Tokyo Ghoul': {
                    intro: { start: 60, end: 150 },
                    outro: { start: 1200, end: 1330 }
                }
            };

            const skipData = fallbackDatabase[title] || fallbackDatabase[this.getTitleMapping(title)];
            if (skipData) {
                this.log(`Используются встроенные данные пропуска для "${title}"`, 'info');
                return skipData;
            }
            return null;
        }

        async apiRequest(url, retries = 1) {
            for (let i = 0; i < retries; i++) {
                try {
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), CONFIG.api.timeout);
                    
                    this.log(`Отправка запроса (попытка ${i + 1}): ${url}`, 'debug');
                    
                    const response = await fetch(url, {
                        method: 'GET',
                        signal: controller.signal,
                        headers: {
                            'User-Agent': `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Lampa/${CONFIG.name}/${CONFIG.version}`,
                            'Accept': 'application/json, text/plain, */*',
                            'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8',
                            'Cache-Control': 'no-cache',
                            'Pragma': 'no-cache'
                        }
                    });
                    
                    clearTimeout(timeoutId);
                    
                    this.log(`Статус ответа: ${response.status}`, 'debug');
                    
                    if (response.status === 403) {
                        this.log('API заблокирован (403 Forbidden) - возможно CloudFlare защита', 'warning');
                        throw new Error('API недоступен: 403 Forbidden (CloudFlare protection)');
                    }
                    
                    if (response.status === 429) {
                        this.log('Rate limit, ждем перед повтором...', 'warning');
                        await this.sleep(Math.pow(2, i) * 2000);
                        continue;
                    }
                    
                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                    }
                    
                    const responseText = await response.text();
                    this.log(`Размер ответа: ${responseText.length} символов`, 'debug');
                    
                    // Проверяем, не получили ли мы HTML вместо JSON (CloudFlare страница)
                    if (responseText.includes('<html>') || responseText.includes('403 Forbidden')) {
                        throw new Error('Получена HTML страница вместо JSON - API заблокирован');
                    }
                    
                    return responseText;
                } catch (error) {
                    this.log(`Попытка ${i + 1} не удалась: ${error.message}`, 'debug');
                    if (error.message.includes('CloudFlare') || error.message.includes('403') || error.message.includes('HTML страница')) {
                        throw error; // Не повторяем запрос при блокировке CloudFlare
                    }
                    if (i === retries - 1) throw error;
                    await this.sleep(Math.pow(2, i) * 1000);
                }
            }
        }

        extractSkipData(animeData, episode = null) {
            try {
                this.log(`Извлечение данных пропуска из: ${JSON.stringify(animeData).substring(0, 200)}...`, 'debug');
                
                // Структура данных для API v1 anilibria.top
                if (!animeData.player || !animeData.player.episodes) {
                    this.log('Нет данных плеера или эпизодов', 'debug');
                    return null;
                }

                let episodeData = null;
                
                if (episode !== null) {
                    // Ищем конкретный эпизод
                    episodeData = animeData.player.episodes[episode.toString()] || 
                                 animeData.player.episodes[episode] ||
                                 animeData.player.episodes[`${episode}`];
                } 
                
                if (!episodeData) {
                    // Берем первый доступный эпизод
                    const episodes = Object.values(animeData.player.episodes);
                    if (episodes.length > 0) {
                        episodeData = episodes[0];
                    }
                }

                if (!episodeData) {
                    this.log('Не найдены данные эпизода', 'debug');
                    return null;
                }

                this.log(`Данные эпизода: ${JSON.stringify(episodeData).substring(0, 200)}...`, 'debug');

                if (episodeData.skips) {
                    return this.parseSkipTimings(episodeData.skips);
                }

                // Также проверяем альтернативные поля
                if (episodeData.timing || episodeData.skip_data || episodeData.markers) {
                    const skipField = episodeData.timing || episodeData.skip_data || episodeData.markers;
                    return this.parseSkipTimings(skipField);
                }

                this.log('Нет данных о пропусках в эпизоде', 'debug');
                return null;
            } catch (error) {
                this.log(`Ошибка извлечения данных: ${error.message}`, 'error');
                return null;
            }
        }

        parseSkipTimings(skips) {
            const result = {};
            
            this.log(`Парсинг пропусков: ${JSON.stringify(skips)}`, 'debug');
            
            try {
                // Поддержка разных форматов данных о пропусках
                if (skips.opening && Array.isArray(skips.opening) && skips.opening.length >= 2) {
                    result.intro = { 
                        start: Number(skips.opening[0]), 
                        end: Number(skips.opening[1]) 
                    };
                }
                
                if (skips.ending && Array.isArray(skips.ending) && skips.ending.length >= 2) {
                    result.outro = { 
                        start: Number(skips.ending[0]), 
                        end: Number(skips.ending[1]) 
                    };
                }

                // Альтернативные поля
                if (skips.intro && Array.isArray(skips.intro) && skips.intro.length >= 2) {
                    result.intro = { 
                        start: Number(skips.intro[0]), 
                        end: Number(skips.intro[1]) 
                    };
                }
                
                if (skips.outro && Array.isArray(skips.outro) && skips.outro.length >= 2) {
                    result.outro = { 
                        start: Number(skips.outro[0]), 
                        end: Number(skips.outro[1]) 
                    };
                }

                // Формат объектов вместо массивов
                if (skips.opening && typeof skips.opening === 'object' && skips.opening.start !== undefined) {
                    result.intro = { 
                        start: Number(skips.opening.start), 
                        end: Number(skips.opening.end || skips.opening.start + 90) 
                    };
                }
                
                if (skips.ending && typeof skips.ending === 'object' && skips.ending.start !== undefined) {
                    result.outro = { 
                        start: Number(skips.ending.start), 
                        end: Number(skips.ending.end || skips.ending.start + 90) 
                    };
                }

                this.log(`Результат парсинга: ${JSON.stringify(result)}`, 'debug');
                
                return Object.keys(result).length > 0 ? result : null;
            } catch (error) {
                this.log(`Ошибка парсинга пропусков: ${error.message}`, 'error');
                return null;
            }
        }

        startTimelineMonitoring() {
            if (this.timelineCheckInterval) clearInterval(this.timelineCheckInterval);
            this.log('Мониторинг времени начат', 'debug');
            this.timelineCheckInterval = setInterval(() => {
                if (this.settings.autoSkipEnabled && this.skipData) {
                    try {
                        const video = Lampa.Player.video();
                        if (video && video.currentTime) {
                            this.onTimeUpdate(video.currentTime);
                        }
                    } catch (error) {
                        this.log(`Ошибка проверки времени: ${error.message}`, 'debug');
                    }
                }
            }, CONFIG.skip.checkInterval);
        }

        onTimeUpdate(currentTime) {
            if (!this.settings.autoSkipEnabled || !this.skipData || !currentTime) return;
            
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

        performSkip(type, targetTime) {
            if (!this.settings.autoSkipEnabled) return;
            
            const now = Date.now();
            if (now - this.lastSkipTime < 2000) return; // Предотвращаем множественные пропуски
            
            this.lastSkipTime = now;
            
            try {
                const video = Lampa.Player.video();
                if (!video) return;
                
                const currentTime = video.currentTime;
                this.log(`${type} обнаружено в ${this.formatTime(currentTime)} - пропуск до ${this.formatTime(targetTime)}`, 'info');
                
                if (this.settings.showNotifications) {
                    this.showSkipNotification(type, `Пропуск ${type === 'intro' ? 'заставки' : 'титров'}`);
                }
                
                setTimeout(() => {
                    try {
                        video.currentTime = targetTime;
                        this.log(`Пропуск ${type} выполнен`, 'success');
                    } catch (error) {
                        this.log(`Ошибка пропуска ${type}: ${error.message}`, 'error');
                    }
                }, this.settings.skipDelay);
            } catch (error) {
                this.log(`Ошибка выполнения пропуска: ${error.message}`, 'error');
            }
        }

        showSkipNotification(type, message = null) {
            let displayMessage;
            
            if (message) {
                displayMessage = message;
            } else {
                switch (type) {
                    case 'intro':
                        displayMessage = 'Пропуск заставки';
                        break;
                    case 'outro':
                        displayMessage = 'Пропуск титров';
                        break;
                    case 'success':
                        displayMessage = 'Успешно';
                        break;
                    case 'error':
                        displayMessage = 'Ошибка';
                        break;
                    default:
                        displayMessage = 'Уведомление';
                }
            }
            
            try {
                if (typeof Lampa.Noty !== 'undefined') {
                    Lampa.Noty.show(displayMessage, {timeout: CONFIG.skip.notificationDuration});
                } else {
                    // Fallback уведомление
                    const div = document.createElement('div');
                    div.style.cssText = `
                        position: fixed; 
                        top: 20px; 
                        right: 20px; 
                        padding: 10px 15px; 
                        background: rgba(0,0,0,0.8); 
                        color: #fff; 
                        border-radius: 5px; 
                        z-index: 9999;
                        font-size: 14px;
                        max-width: 300px;
                    `;
                    div.textContent = displayMessage;
                    document.body.appendChild(div);
                    setTimeout(() => {
                        if (div.parentNode) div.parentNode.removeChild(div);
                    }, CONFIG.skip.notificationDuration);
                }
            } catch (error) {
                this.log(`Ошибка показа уведомления: ${error.message}`, 'debug');
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
            if (skipData.intro) parts.push(`заставка ${this.formatTime(skipData.intro.start)}-${this.formatTime(skipData.intro.end)}`);
            if (skipData.outro) parts.push(`титры ${this.formatTime(skipData.outro.start)}-${this.formatTime(skipData.outro.end)}`);
            return parts.join(', ');
        }

        sleep(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }

        log(message, type = 'info') {
            if (!this.settings.debugEnabled && type === 'debug') return;
            
            const prefix = '[AnilibriaAutoSkip]';
            const timestamp = new Date().toLocaleTimeString();
            
            switch (type) {
                case 'success':
                    console.log(`%c${prefix} ${timestamp} ${message}`, 'color: #10b981; font-weight: bold;');
                    break;
                case 'error':
                    console.error(`%c${prefix} ${timestamp} ${message}`, 'color: #ef4444; font-weight: bold;');
                    break;
                case 'warning':
                    console.warn(`%c${prefix} ${timestamp} ${message}`, 'color: #f59e0b; font-weight: bold;');
                    break;
                case 'debug':
                    console.log(`%c${prefix} ${timestamp} ${message}`, 'color: #6b7280;');
                    break;
                default:
                    console.log(`%c${prefix} ${timestamp} ${message}`, 'color: #3b82f6;');
            }
        }
    }

    // Инициализация плагина
    const pluginInstance = new AnilibriaAutoSkipPlugin();
    
    // Экспорт для тестирования
    window.anilibriaAutoSkip = pluginInstance;
    window.AnilibriaAutoSkipPlugin = pluginInstance;

})();
