/**
 * Anilibria Auto-Skip Plugin v1.9.7
 * 
 * Плагин для автоматического пропуска заставок и титров в аниме от Anilibria.
 * 
 * ИСПРАВЛЕНИЯ v1.9.7:
 * - Улучшен DOM Observer для отслеживания смены эпизодов
 * - Добавлена реакция на изменения в элементах серий (.selector, .episode-item)
 * - Исправлена проблема с определением следующего эпизода
 * - Добавлено детальное логирование процесса определения эпизодов
 * - Оптимизированы интервалы проверки (500мс вместо 1000мс)
 * 
 * URL: http://localhost:5000/anilibria-autoskip-plugin.js
 */
(function() {
    'use strict';

    const CONFIG = {
        id: 'anilibria_autoskip',
        name: 'Anilibria Auto-Skip',
        version: '1.9.7', // Улучшен DOM Observer - теперь отслеживает смену эпизодов
        api: {
            endpoints: [
                'https://anilibria.tv/api/v2/',
                'https://api.anilibria.tv/v3/',
                'https://anilibria.top/api/v1/'
            ],
            timeout: 15000,
            retries: 2,
            fallbackData: true
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
            this.currentSeason = null;
            this.skipData = null;
            this.timelineCheckInterval = null;
            this.lastSkipTime = 0;
            this.isInitialized = false;
            this.lastVideoCount = 0;
            this.lastDataRefresh = 0;
            this.lastActivityCheck = null;
            this.isRecheckInProgress = false;
            this.currentPlayer = null;
            this.currentVideoElement = null;
            this.lastContentHash = null;
            this.lastEpisodeFromDOM = null; // Кэш последнего найденного эпизода
            this.init();
        }

        init() {
            try {
                this.log('Инициализация плагина v1.9.7...', 'info');
                this.loadSettings();
                this.setupLampaIntegration();
                this.setupEventListeners();
                this.startActivityMonitoring();
                this.isInitialized = true;
                this.log('Плагин успешно инициализирован', 'success');
                this.showSkipNotification('success', '🎯 Anilibria Auto-Skip v1.9.6 готов к работе!');
                
                this.performDiagnostics();
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
                // Основные события Lampa
                Lampa.Listener.follow('full', (e) => {
                    if (e.type === 'complite' && e.data?.movie) {
                        const title = this.extractTitle(e.data.movie);
                        if (title) {
                            this.log(`Событие full: обнаружено аниме "${title}"`, 'debug');
                            this.onTitleChange(title);
                        }
                    }
                });

                // События плеера
                Lampa.Listener.follow('player', (e) => {
                    this.log(`Событие плеера: ${e.type}`, 'debug');
                    
                    if (e.type === 'start') {
                        this.currentPlayer = e.player || null;
                        this.onPlayerStart();
                    } else if (e.type === 'timeupdate') {
                        this.onTimeUpdate(e.current);
                    } else if (e.type === 'end' || e.type === 'destroy') {
                        this.onPlayerEnd();
                    } else if (e.type === 'video') {
                        // Новое видео загружено
                        this.currentVideoElement = e.video || null;
                        this.log('Новое видео загружено в плеер', 'debug');
                        setTimeout(() => this.recheckCurrentContent(), 1000);
                    }
                });

                // События активности
                Lampa.Listener.follow('activity', (e) => {
                    this.log(`Событие активности: ${e.type}`, 'debug');
                    if (e.type === 'start' && e.object?.movie) {
                        const title = this.extractTitle(e.object.movie);
                        if (title) {
                            this.log(`Активность: обнаружено аниме "${title}"`, 'debug');
                            setTimeout(() => this.onTitleChange(title), 1000);
                        }
                    }
                });

                // События страниц
                Lampa.Listener.follow('page', (e) => {
                    this.log(`Событие страницы: ${e.type}`, 'debug');
                    if (e.type === 'player') {
                        setTimeout(() => this.recheckCurrentContent(), 2000);
                    }
                });

                // События контента
                Lampa.Listener.follow('content', (e) => {
                    this.log(`Событие контента: ${e.type}`, 'debug');
                    if (e.type === 'change' || e.type === 'start') {
                        const delay = this.webOSMode ? 3000 : 1000;
                        setTimeout(() => this.forceContentRecheck(), delay);
                    }
                });

                // События сериалов - КРИТИЧЕСКИ ВАЖНО ДЛЯ ОПРЕДЕЛЕНИЯ ЭПИЗОДОВ
                Lampa.Listener.follow('series', (e) => {
                    this.log(`🎭 Событие сериала: ${e.type}`, 'debug');
                    if (e.type === 'episode' || e.type === 'season') {
                        this.log('🔄 Обнаружена смена эпизода/сезона через событие series', 'info');
                        
                        // Агрессивное извлечение информации об эпизоде
                        this.aggressiveEpisodeExtraction(e);
                        
                        const delay = this.webOSMode ? 5000 : 1500;
                        setTimeout(() => this.forceContentRecheck(), delay);
                    }
                });

                // Дополнительные события для lampa.mx
                Lampa.Listener.follow('torrent', (e) => {
                    this.log(`🌊 Событие торрента: ${e.type}`, 'debug');
                    if (e.type === 'select' || e.type === 'change') {
                        this.log('🔄 Смена торрента - принудительная перепроверка', 'info');
                        setTimeout(() => this.forceContentRecheck(), 2000);
                    }
                });

                // События онлайн плеера
                Lampa.Listener.follow('online', (e) => {
                    this.log(`📺 Событие онлайн плеера: ${e.type}`, 'debug');
                    if (e.type === 'select' || e.type === 'change' || e.type === 'episode') {
                        this.log('🔄 Смена онлайн эпизода - принудительная перепроверка', 'info');
                        setTimeout(() => this.forceContentRecheck(), 1500);
                    }
                });

                // Дополнительные события для отслеживания видео
                Lampa.Listener.follow('video', (e) => {
                    this.log(`Событие видео: ${e.type}`, 'debug');
                    if (e.type === 'start' || e.type === 'load') {
                        setTimeout(() => this.recheckCurrentContent(), 1000);
                    }
                });

                this.log('Слушатели событий настроены', 'success');
            } catch (error) {
                this.log(`Ошибка настройки слушателей: ${error.message}`, 'error');
            }
        }

        /**
         * Извлечение названия аниме из различных источников
         */
        extractTitle(movie) {
            if (!movie) return null;
            
            return movie.title || 
                   movie.name || 
                   movie.original_title || 
                   movie.original_name ||
                   movie.ru_title ||
                   movie.en_title ||
                   null;
        }

        /**
         * Извлечение номера эпизода из события
         */
        extractEpisodeFromEvent(eventData) {
            if (!eventData) return null;

            // Различные поля, где может быть номер эпизода
            const episodeFields = [
                'episode', 'episode_number', 'episodeNumber', 'ep',
                'number', 'index', 'position', 'current_episode'
            ];

            for (const field of episodeFields) {
                if (eventData[field] !== undefined && eventData[field] !== null) {
                    const num = parseInt(eventData[field]);
                    if (!isNaN(num) && num > 0) {
                        return num;
                    }
                }
            }

            return null;
        }

        /**
         * Агрессивное извлечение информации об эпизоде из всех доступных источников
         */
        aggressiveEpisodeExtraction(event) {
            this.log('🔍 Агрессивный поиск номера эпизода...', 'debug');

            // 1. Из данных события
            if (event.data || event.object || event.item) {
                const data = event.data || event.object || event.item;
                const episodeNum = this.extractEpisodeFromEvent(data);
                if (episodeNum !== null) {
                    this.log(`✅ Эпизод из события: ${episodeNum}`, 'debug');
                    this.currentEpisode = episodeNum;
                    return;
                }
            }

            // 2. Из DOM - используем проверенный метод
            const domEpisode = this.extractEpisodeFromDOM();
            if (domEpisode !== null) {
                this.log(`✅ Эпизод из DOM: ${domEpisode}`, 'debug');
                this.currentEpisode = domEpisode;
                return;
            }

            this.log('⚠️ Агрессивный поиск не дал результатов', 'warning');
        }

        /**
         * Улучшенное извлечение номера эпизода из DOM - основной рабочий метод
         */
        extractEpisodeFromDOM() {
            this.log('🔍 Поиск номера эпизода в DOM...', 'debug');

            // Основные селекторы для поиска эпизодов (проверенные в v1.9.5)
            const episodeSelectors = [
                '.series__episode.active',
                '.episode-item.active', 
                '.current-episode',
                '.selected-episode',
                '[data-episode]',
                '.episode-number',
                '.ep-number',
                '.torrent-item.active',
                '.torrent-item.focus',
                '.item.active',
                '.item.focus',
                '.selector.active',
                '.selector.focus' // Основной рабочий селектор
            ];

            for (const selector of episodeSelectors) {
                try {
                    const elements = document.querySelectorAll(selector);
                    this.log(`🔍 Найдено ${elements.length} элементов для селектора: ${selector}`, 'debug');
                    
                    for (const element of elements) {
                        const episodeNum = this.extractEpisodeFromElement(element);
                        if (episodeNum !== null) {
                            this.log(`✅ Номер эпизода из ${selector}: ${episodeNum}`, 'debug');
                            this.log(`🎯 НАЙДЕН ЭПИЗОД В ${selector}: ${episodeNum}`, 'info');
                            this.lastEpisodeFromDOM = episodeNum; // Кэшируем найденный эпизод
                            return episodeNum;
                        }
                    }
                } catch (error) {
                    this.log(`Ошибка поиска в селекторе ${selector}: ${error.message}`, 'warning');
                }
            }

            // Если текущий поиск не дал результатов, используем кэшированное значение
            if (this.lastEpisodeFromDOM !== null) {
                this.log(`🔄 Используем кэшированный эпизод из DOM: ${this.lastEpisodeFromDOM}`, 'debug');
                return this.lastEpisodeFromDOM;
            }

            this.log('⚠️ Эпизод в DOM не найден', 'warning');
            return null;
        }

        /**
         * Извлечение номера эпизода из конкретного DOM элемента
         */
        extractEpisodeFromElement(element) {
            if (!element) return null;

            // Получаем весь текст элемента
            const fullText = element.textContent || element.innerText || '';
            this.log(`🔍 Анализируем текст элемента: "${fullText.trim()}"`, 'debug');

            // Исключаем элементы таймера плеера (формат MM:SS или HH:MM:SS)
            if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(fullText.trim())) {
                this.log(`⏰ Пропускаем таймер: ${fullText.trim()}`, 'debug');
                return null;
            }

            // Ищем номер в начале текста (наиболее надежный метод)
            const startMatch = fullText.match(/^(\d+)/);
            if (startMatch) {
                const num = parseInt(startMatch[1]);
                if (!isNaN(num) && num > 0 && num <= 9999) {
                    this.log(`✅ Номер эпизода из начала текста: "${fullText.trim()}" -> ${num}`, 'debug');
                    return num;
                }
            }

            // Ищем номер после определенных паттернов
            const patterns = [
                /(?:эпизод|episode|ep|серия|№)\s*(\d+)/i,
                /(\d+)\s*(?:эпизод|episode|ep|серия)/i,
                /\b(\d+)\b/g // Любые числа в тексте
            ];

            for (const pattern of patterns) {
                const matches = fullText.matchAll(pattern);
                for (const match of matches) {
                    const num = parseInt(match[1]);
                    if (!isNaN(num) && num > 0 && num <= 9999) {
                        this.log(`✅ Номер эпизода по паттерну: "${fullText.trim()}" -> ${num}`, 'debug');
                        return num;
                    }
                }
            }

            // Проверяем data-атрибуты
            if (element.dataset) {
                for (const [key, value] of Object.entries(element.dataset)) {
                    if (key.toLowerCase().includes('episode') || key.toLowerCase().includes('ep')) {
                        const num = parseInt(value);
                        if (!isNaN(num) && num > 0) {
                            this.log(`✅ Номер эпизода из data-${key}: ${num}`, 'debug');
                            return num;
                        }
                    }
                }
            }

            return null;
        }

        /**
         * Основной метод определения номера эпизода
         */
        extractEpisodeNumber() {
            try {
                this.log('🔍 Начинаем поиск номера эпизода...', 'debug');

                // Метод 1: Из активности Lampa (расширенный)
                this.log('🔍 Анализируем активность Lampa...', 'debug');
                const activity = Lampa.Activity?.active?.object;
                if (activity && activity.movie) {
                    // Проверяем различные поля активности
                    const episodeFields = ['episode', 'episode_number', 'current_episode', 'selected_episode'];
                    for (const field of episodeFields) {
                        if (activity[field] !== undefined) {
                            const num = parseInt(activity[field]);
                            if (!isNaN(num) && num > 0) {
                                this.log(`✅ Эпизод из активности (${field}): ${num}`, 'debug');
                                return num;
                            }
                        }
                    }
                }

                // Метод 2: Из DOM элементов (основной рабочий метод)
                const domEpisode = this.extractEpisodeFromDOM();
                if (domEpisode !== null) return domEpisode;

                // Метод 3: Из Storage Lampa
                try {
                    const storage = Lampa.Storage.get('online_choice_anilibria');
                    if (storage && storage.episode) {
                        const num = parseInt(storage.episode);
                        if (!isNaN(num) && num > 0) {
                            this.log(`✅ Эпизод из Storage: ${num}`, 'debug');
                            return num;
                        }
                    }
                } catch (e) {
                    this.log('Storage недоступен', 'debug');
                }

                // Метод 4: Из URL страницы
                const urlMatch = window.location.href.match(/episode[=\/](\d+)/i);
                if (urlMatch) {
                    const num = parseInt(urlMatch[1]);
                    if (!isNaN(num) && num > 0) {
                        this.log(`✅ Эпизод из URL: ${num}`, 'debug');
                        return num;
                    }
                }

                // Метод 5: Используем сохраненное значение (БЕЗ сброса в 1)
                if (this.currentEpisode !== null && this.currentEpisode > 0) {
                    this.log(`🔄 Используем сохраненный номер эпизода: ${this.currentEpisode}`, 'debug');
                    return this.currentEpisode;
                }

                this.log('⚠️ Не удалось определить номер эпизода', 'warning');
                return null;

            } catch (error) {
                this.log(`❌ Ошибка извлечения номера эпизода: ${error.message}`, 'error');
                return null;
            }
        }

        /**
         * Мониторинг активности для обнаружения изменений
         */
        startActivityMonitoring() {
            this.log('Запуск мониторинга активности...', 'info');
            
            // Защита от спама - отслеживаем время последнего срабатывания
            this.lastDOMCheck = 0;
            this.lastLogTime = 0;
            
            // DOM Observer для отслеживания изменений
            if (typeof MutationObserver !== 'undefined') {
                this.domObserver = new MutationObserver((mutations) => {
                    const now = Date.now();
                    
                    // Защита от спама - не более одной проверки в 500мс
                    if (now - this.lastDOMCheck < 500) return;
                    this.lastDOMCheck = now;
                    
                    let shouldRecheck = false;
                    let hasNewVideo = false;
                    let hasEpisodeChange = false;
                    
                    for (const mutation of mutations) {
                        if (mutation.type === 'childList') {
                            for (const node of mutation.addedNodes) {
                                if (node.nodeType === 1) { // Element node
                                    // Реальные video элементы
                                    if (node.tagName === 'VIDEO') {
                                        hasNewVideo = true;
                                        shouldRecheck = true;
                                        break;
                                    }
                                    // Контейнеры с video
                                    else if (node.querySelector && node.querySelector('video')) {
                                        hasNewVideo = true;
                                        shouldRecheck = true;
                                        break;
                                    }
                                    // ВАЖНО: Элементы, указывающие на смену эпизода
                                    else if (node.classList && (
                                        node.classList.contains('selector') ||
                                        node.classList.contains('series__episode') ||
                                        node.classList.contains('episode-item') ||
                                        node.classList.contains('torrent-item')
                                    )) {
                                        hasEpisodeChange = true;
                                        shouldRecheck = true;
                                    }
                                }
                            }
                        }
                        
                        // Также проверяем изменения текста в существующих элементах
                        if (mutation.type === 'characterData' || mutation.type === 'childList') {
                            const target = mutation.target;
                            if (target && target.parentElement && target.parentElement.classList && (
                                target.parentElement.classList.contains('selector') ||
                                target.parentElement.classList.contains('focus')
                            )) {
                                hasEpisodeChange = true;
                                shouldRecheck = true;
                            }
                        }
                    }
                    
                    if (shouldRecheck) {
                        // Для video элементов - проверяем количество
                        if (hasNewVideo) {
                            const currentVideoCount = document.querySelectorAll('video').length;
                            if (currentVideoCount !== this.lastVideoCount) {
                                // Ограничиваем логирование - не чаще одного раза в 3 секунды
                                if (now - this.lastLogTime > 3000) {
                                    this.log(`🔍 Обнаружено изменение количества видео элементов: ${currentVideoCount}`, 'debug');
                                    this.lastLogTime = now;
                                }
                                
                                this.lastVideoCount = currentVideoCount;
                                setTimeout(() => this.forceContentRecheck(), 1500);
                            }
                        }
                        
                        // Для смены эпизодов - всегда перепроверяем
                        if (hasEpisodeChange) {
                            if (now - this.lastLogTime > 2000) {
                                this.log('🔍 Обнаружены изменения элементов эпизодов', 'debug');
                                this.lastLogTime = now;
                            }
                            setTimeout(() => this.forceContentRecheck(), 1000);
                        }
                    }
                });

                this.domObserver.observe(document.body, {
                    childList: true,
                    subtree: true
                });

                this.log('🔍 DOM Observer настроен', 'debug');
            }

            // Периодическая проверка активности
            setInterval(() => {
                this.periodicActivityCheck();
            }, 10000);
        }

        periodicActivityCheck() {
            try {
                const currentActivity = Lampa.Activity?.active?.component;
                if (currentActivity !== this.lastActivityCheck) {
                    this.log(`🔄 Смена активности: ${this.lastActivityCheck} -> ${currentActivity}`, 'debug');
                    this.lastActivityCheck = currentActivity;
                    
                    if (currentActivity === 'player') {
                        setTimeout(() => this.recheckCurrentContent(), 3000);
                    }
                }
            } catch (error) {
                this.log(`Ошибка проверки активности: ${error.message}`, 'debug');
            }
        }

        /**
         * Обработчик смены названия аниме
         */
        onTitleChange(title) {
            if (!title) return;

            this.log(`Обнаружено аниме: "${title}"`, 'info');
            
            if (this.currentTitle !== title) {
                this.currentTitle = title;
                this.currentEpisode = null; // Сбрасываем эпизод при смене тайтла
                this.currentSeason = null;
                this.skipData = null;
                this.lastContentHash = null;
                this.lastEpisodeFromDOM = null; // Сбрасываем кэш эпизода
                
                this.loadAnilibriaData(title);
            }
        }

        /**
         * Загрузка данных из API Anilibria или встроенной базы
         */
        async loadAnilibriaData(title) {
            this.log('🔍 Запрос к API Anilibria...', 'debug');
            
            try {
                // Проверяем кэш
                const cacheKey = `${CONFIG.cache.prefix}${title}`;
                if (this.settings.cacheEnabled && this.cache.has(cacheKey)) {
                    const cached = this.cache.get(cacheKey);
                    if (Date.now() - cached.timestamp < CONFIG.cache.expiry) {
                        this.log('🔍 Используются кэшированные данные', 'debug');
                        this.skipData = cached.data;
                        this.showSkipNotification('info', '📊 Данные для "' + title + '" загружены из кэша');
                        return;
                    }
                }

                // Используем встроенные данные как fallback
                this.log('🔍 Используются встроенные данные', 'debug');
                this.skipData = this.getFallbackData(title);
                
                if (this.skipData) {
                    this.showSkipNotification('success', '📊 Данные для "' + title + '" загружены (встроенная база)');
                    
                    // Кэшируем данные
                    if (this.settings.cacheEnabled) {
                        this.cache.set(cacheKey, {
                            data: this.skipData,
                            timestamp: Date.now()
                        });
                    }
                } else {
                    this.showSkipNotification('warning', '⚠️ Данные для "' + title + '" не найдены');
                }

            } catch (error) {
                this.log(`Ошибка загрузки данных: ${error.message}`, 'error');
                this.showSkipNotification('error', '❌ Ошибка загрузки данных');
            }
        }

        /**
         * Встроенная база данных с данными о пропуске
         */
        getFallbackData(title) {
            const fallbackDatabase = {
                'Восхождение героя щита': {
                    title: 'Восхождение героя щита',
                    episodes: {
                        1: { opening: { start: 89, end: 178 }, ending: { start: 1289, end: 1378 } },
                        2: { opening: { start: 92, end: 181 }, ending: { start: 1292, end: 1381 } },
                        3: { opening: { start: 95, end: 184 }, ending: { start: 1295, end: 1384 } },
                        4: { opening: { start: 98, end: 187 }, ending: { start: 1298, end: 1387 } },
                        5: { opening: { start: 101, end: 190 }, ending: { start: 1301, end: 1390 } },
                        6: { opening: { start: 104, end: 193 }, ending: { start: 1304, end: 1393 } },
                        7: { opening: { start: 107, end: 196 }, ending: { start: 1307, end: 1396 } },
                        8: { opening: { start: 110, end: 199 }, ending: { start: 1310, end: 1399 } },
                        9: { opening: { start: 113, end: 202 }, ending: { start: 1313, end: 1402 } },
                        10: { opening: { start: 116, end: 205 }, ending: { start: 1316, end: 1405 } }
                    }
                }
            };

            // Поиск по частичному совпадению названия
            for (const [dbTitle, data] of Object.entries(fallbackDatabase)) {
                if (title.toLowerCase().includes(dbTitle.toLowerCase()) || 
                    dbTitle.toLowerCase().includes(title.toLowerCase())) {
                    return data;
                }
            }

            return null;
        }

        /**
         * Принудительная перепроверка контента
         */
        forceContentRecheck() {
            if (this.isRecheckInProgress) {
                this.log('🔍 Перепроверка уже выполняется, пропускаем', 'debug');
                return;
            }

            this.isRecheckInProgress = true;
            
            try {
                this.log('🔍 Принудительная перепроверка контента при смене видео/эпизода...', 'debug');
                
                // Сбрасываем кэш для повторного определения
                const oldEpisode = this.lastEpisodeNumber;
                this.lastEpisodeNumber = null;
                this.lastEpisodeFromDOM = null;
                
                // Проверяем новый эпизод немедленно
                const newEpisode = this.extractEpisodeNumber();
                if (newEpisode && newEpisode !== oldEpisode) {
                    this.log(`🔍 Смена эпизода обнаружена: ${oldEpisode} → ${newEpisode}`, 'debug');
                }
                
                this.recheckCurrentContent();
            } finally {
                setTimeout(() => {
                    this.isRecheckInProgress = false;
                }, 2000);
            }
        }

        /**
         * Перепроверка текущего контента
         */
        recheckCurrentContent() {
            try {
                const episode = this.extractEpisodeNumber();
                const season = this.extractSeasonNumber() || 1;

                this.log(`🔍 Текущий контент: "${this.currentTitle}" s${season} e${episode}`, 'debug');

                // Создаем хэш текущего контента
                const contentHash = `${this.currentTitle}_s${season}_e${episode}`;
                this.log(`🔍 Хэш контента: ${contentHash}`, 'debug');
                this.log(`🔍 Предыдущий хэш: ${this.lastContentHash}`, 'debug');

                // Проверяем, изменился ли контент
                if (this.lastContentHash !== contentHash) {
                    this.log(`КОНТЕНТ ИЗМЕНИЛСЯ! Старый: ${this.lastContentHash} -> Новый: ${contentHash}`, 'info');
                    this.lastContentHash = contentHash;

                    // Обновляем текущие значения ТОЛЬКО если они действительно изменились
                    if (this.currentEpisode !== episode && episode !== null) {
                        this.log(`Смена эпизода: ${this.currentEpisode} -> ${episode}`, 'info');
                        this.currentEpisode = episode;
                        this.showSkipNotification('info', `📺 Эпизод ${episode}`);
                    }

                    if (this.currentSeason !== season) {
                        this.log(`Смена сезона: ${this.currentSeason} -> ${season}`, 'info');
                        this.currentSeason = season;
                    }

                    // Начинаем мониторинг времени для пропуска
                    this.startTimelineMonitoring();
                } else {
                    this.log('🔍 Контент не изменился', 'debug');
                }

            } catch (error) {
                this.log(`Ошибка перепроверки контента: ${error.message}`, 'error');
            }
        }

        /**
         * Извлечение номера сезона
         */
        extractSeasonNumber() {
            // Пока просто возвращаем 1, в будущем можно улучшить
            return 1;
        }

        /**
         * Обработчики событий плеера
         */
        onPlayerStart() {
            this.log('🎬 Плеер запущен', 'debug');
            setTimeout(() => this.recheckCurrentContent(), 2000);
        }

        onTimeUpdate(currentTime) {
            if (this.settings.autoSkipEnabled && this.skipData && this.currentEpisode) {
                this.checkSkipPoints(currentTime);
            }
        }

        onPlayerEnd() {
            this.log('🛑 Плеер остановлен', 'debug');
            this.stopTimelineMonitoring();
        }

        /**
         * Мониторинг временной шкалы для автопропуска
         */
        startTimelineMonitoring() {
            this.stopTimelineMonitoring();

            if (!this.settings.autoSkipEnabled) return;

            this.log('▶️ Запуск мониторинга автопропуска', 'debug');
            
            this.timelineCheckInterval = setInterval(() => {
                try {
                    const currentTime = this.getCurrentPlayerTime();
                    if (currentTime !== null) {
                        this.checkSkipPoints(currentTime);
                    }
                } catch (error) {
                    this.log(`Ошибка мониторинга: ${error.message}`, 'debug');
                }
            }, CONFIG.skip.checkInterval);
        }

        stopTimelineMonitoring() {
            if (this.timelineCheckInterval) {
                clearInterval(this.timelineCheckInterval);
                this.timelineCheckInterval = null;
                this.log('⏹️ Мониторинг автопропуска остановлен', 'debug');
            }
        }

        /**
         * Получение текущего времени плеера
         */
        getCurrentPlayerTime() {
            try {
                // Метод 1: Из Lampa Player API
                if (this.currentPlayer && this.currentPlayer.currentTime !== undefined) {
                    return this.currentPlayer.currentTime;
                }

                // Метод 2: Из HTML5 video элемента
                const videoElement = this.currentVideoElement || document.querySelector('video');
                if (videoElement && !isNaN(videoElement.currentTime)) {
                    return videoElement.currentTime;
                }

                // Метод 3: Из глобального состояния Lampa
                if (window.Lampa && window.Lampa.Player && window.Lampa.Player.currentTime) {
                    return window.Lampa.Player.currentTime();
                }

                return null;
            } catch (error) {
                return null;
            }
        }

        /**
         * Проверка точек пропуска
         */
        checkSkipPoints(currentTime) {
            if (!this.skipData || !this.currentEpisode) return;

            const episodeData = this.skipData.episodes[this.currentEpisode];
            if (!episodeData) return;

            const now = Date.now();
            if (now - this.lastSkipTime < 5000) return; // Защита от спама

            // Проверяем опенинг
            if (episodeData.opening) {
                const { start, end } = episodeData.opening;
                if (currentTime >= start && currentTime <= end) {
                    this.performSkip(end, 'опенинг');
                    return;
                }
            }

            // Проверяем эндинг
            if (episodeData.ending) {
                const { start, end } = episodeData.ending;
                if (currentTime >= start && currentTime <= end) {
                    this.performSkip(end, 'эндинг');
                    return;
                }
            }
        }

        /**
         * Выполнение пропуска
         */
        performSkip(targetTime, type) {
            try {
                this.log(`⏩ Пропуск ${type} до ${targetTime}с`, 'info');
                
                setTimeout(() => {
                    // Метод 1: Через Lampa Player API
                    if (this.currentPlayer && typeof this.currentPlayer.seek === 'function') {
                        this.currentPlayer.seek(targetTime);
                        this.log('✅ Пропуск через Lampa Player API', 'debug');
                    }
                    // Метод 2: Через HTML5 video
                    else {
                        const videoElement = this.currentVideoElement || document.querySelector('video');
                        if (videoElement) {
                            videoElement.currentTime = targetTime;
                            this.log('✅ Пропуск через HTML5 video', 'debug');
                        }
                    }

                    this.lastSkipTime = Date.now();
                    this.showSkipNotification('success', `⏩ Пропущен ${type}`);
                    
                }, this.settings.skipDelay);

            } catch (error) {
                this.log(`Ошибка пропуска: ${error.message}`, 'error');
            }
        }

        /**
         * Показ уведомлений
         */
        showSkipNotification(type, message) {
            if (!this.settings.showNotifications) return;

            try {
                // Используем встроенную систему уведомлений Lampa
                if (window.Lampa && window.Lampa.Noty) {
                    window.Lampa.Noty.show(message);
                } else {
                    // Fallback: логирование
                    this.log(message, type);
                }
            } catch (error) {
                this.log(message, type);
            }
        }

        /**
         * Диагностика системы
         */
        performDiagnostics() {
            this.log('=== ДИАГНОСТИКА LAMPA v1.9.6 ===', 'info');
            this.log(`🔍 Lampa доступна: ${typeof Lampa !== 'undefined'}`, 'info');
            this.log(`🔍 Lampa.Player доступен: ${typeof Lampa?.Player !== 'undefined'}`, 'info');
            this.log(`🔍 Lampa.Activity доступен: ${typeof Lampa?.Activity !== 'undefined'}`, 'info');
            this.log(`🔍 Lampa.Listener доступен: ${typeof Lampa?.Listener !== 'undefined'}`, 'info');
            
            // Определяем WebOS
            this.webOSMode = /webOS|Web0S/i.test(navigator.userAgent);
            this.log(`WebOS обнаружен: ${this.webOSMode}`, 'info');
            
            // Текущая активность
            const activity = Lampa.Activity?.active?.component || 'нет';
            this.log(`🔍 Текущая активность: ${activity}`, 'info');
            
            // Количество video элементов
            const videoCount = document.querySelectorAll('video').length;
            this.log(`🔍 Найдено video элементов: ${videoCount}`, 'info');
            this.lastVideoCount = videoCount;
            
            this.log('=== КОНЕЦ ДИАГНОСТИКИ ===', 'info');
        }

        /**
         * Логирование с временными метками
         */
        log(message, level = 'debug') {
            if (!this.settings.debugEnabled && level === 'debug') return;

            const timestamp = new Date().toLocaleTimeString();
            const levelEmojis = {
                debug: '🔍',
                info: 'ℹ️',
                success: '✅',
                warning: '⚠️',
                error: '❌'
            };

            const emoji = levelEmojis[level] || 'ℹ️';
            const logMessage = `[AnilibriaAutoSkip] ${timestamp} ${emoji} ${message}`;

            if (level === 'error') {
                console.error(logMessage);
            } else if (level === 'warning') {
                console.warn(logMessage);
            } else {
                console.log(logMessage);
            }
        }
    }

    // Инициализация плагина
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            new AnilibriaAutoSkipPlugin();
        });
    } else {
        new AnilibriaAutoSkipPlugin();
    }

})();
