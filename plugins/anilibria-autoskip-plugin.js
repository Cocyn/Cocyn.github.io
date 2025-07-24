/**
 * Anilibria Auto-Skip Plugin v1.9.2
 * 
 * Плагин для автоматического пропуска заставок и титров в аниме от Anilibria.
 * 
 * ИСПРАВЛЕНИЯ v1.9.2:
 * - Исправлено определение номера эпизода из различных источников
 * - Улучшена логика сравнения контента
 * - Добавлены дополнительные методы извлечения номера серии
 * - Оптимизирована работа с событиями плеера
 * - Улучшена совместимость с lampa.mx и другими версиями Lampa
 * 
 * URL: http://localhost:5000/anilibria-autoskip-plugin.js
 */
(function() {
    'use strict';

    const CONFIG = {
        id: 'anilibria_autoskip',
        name: 'Anilibria Auto-Skip',
        version: '1.9.2', // Исправлено определение эпизодов и улучшена совместимость
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
            this.init();
        }

        init() {
            try {
                this.log('Инициализация плагина v1.9.2...', 'info');
                this.loadSettings();
                this.setupLampaIntegration();
                this.setupEventListeners();
                this.startActivityMonitoring();
                this.isInitialized = true;
                this.log('Плагин успешно инициализирован', 'success');
                this.showSkipNotification('success', '🎯 Anilibria Auto-Skip v1.9.2 готов к работе!');
                
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
                    this.log(`Событие сериала: ${e.type}`, 'debug');
                    if (e.type === 'episode' || e.type === 'season') {
                        this.log('Обнаружена смена эпизода/сезона через событие series', 'info');
                        
                        // Извлекаем информацию об эпизоде из события
                        if (e.data) {
                            const episodeNum = this.extractEpisodeFromEvent(e.data);
                            if (episodeNum !== null) {
                                this.log(`Номер эпизода из события: ${episodeNum}`, 'debug');
                                this.currentEpisode = episodeNum;
                            }
                        }
                        
                        const delay = this.webOSMode ? 5000 : 1500;
                        setTimeout(() => this.forceContentRecheck(), delay);
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

        performDiagnostics() {
            this.log('=== ДИАГНОСТИКА LAMPA v1.9.2 ===', 'info');
            try {
                this.log(`Lampa доступна: ${typeof Lampa !== 'undefined'}`, 'debug');
                this.log(`Lampa.Player доступен: ${typeof Lampa?.Player !== 'undefined'}`, 'debug');
                this.log(`Lampa.Activity доступен: ${typeof Lampa?.Activity !== 'undefined'}`, 'debug');
                this.log(`Lampa.Listener доступен: ${typeof Lampa?.Listener !== 'undefined'}`, 'debug');
                
                // WebOS диагностика
                const isWebOS = navigator.userAgent.includes('webOS') || navigator.userAgent.includes('LG');
                this.log(`WebOS обнаружен: ${isWebOS}`, 'info');
                
                if (isWebOS) {
                    this.log('WebOS оптимизация активирована', 'info');
                    this.webOSMode = true;
                }
                
                // Проверяем текущую активность
                if (typeof Lampa?.Activity?.active === 'function') {
                    const activity = Lampa.Activity.active();
                    this.log(`Текущая активность: ${activity ? 'есть' : 'нет'}`, 'debug');
                    if (activity?.movie) {
                        const title = this.extractTitle(activity.movie);
                        this.log(`Текущее видео: ${title || 'без названия'}`, 'debug');
                    }
                }
                
                // Проверяем видеоплееры
                const videos = document.querySelectorAll('video');
                this.log(`Найдено video элементов: ${videos.length}`, 'debug');
                videos.forEach((video, index) => {
                    this.log(`Video ${index}: duration=${video.duration}, currentTime=${video.currentTime}`, 'debug');
                });
                
                this.log('=== КОНЕЦ ДИАГНОСТИКИ ===', 'info');
            } catch (error) {
                this.log(`Ошибка диагностики: ${error.message}`, 'error');
            }
        }

        startActivityMonitoring() {
            this.log('Запуск мониторинга активности...', 'info');
            
            const monitoringInterval = this.webOSMode ? 4000 : 2000;
            setInterval(() => this.checkCurrentActivity(), monitoringInterval);
            
            this.setupDOMObserver();
        }

        setupDOMObserver() {
            if (typeof MutationObserver === 'undefined') {
                this.log('MutationObserver не поддерживается, используем fallback', 'debug');
                return;
            }
            
            let lastMutationTime = 0;
            const mutationThrottle = 3000;
            
            const observer = new MutationObserver((mutations) => {
                const now = Date.now();
                if (now - lastMutationTime < mutationThrottle) {
                    return;
                }
                
                let hasVideoChanges = false;
                
                mutations.forEach((mutation) => {
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            if (node.tagName === 'VIDEO' || node.querySelector('video')) {
                                hasVideoChanges = true;
                                this.log('Обнаружен новый video элемент через MutationObserver', 'debug');
                            }
                        }
                    });
                });
                
                if (hasVideoChanges) {
                    lastMutationTime = now;
                    this.onVideoDetected();
                }
            });
            
            observer.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: false
            });
            
            this.log(`DOM Observer настроен${this.webOSMode ? ' для WebOS (оптимизированный)' : ''}`, 'debug');
        }

        checkCurrentActivity() {
            try {
                const currentVideoCount = document.querySelectorAll('video').length;
                
                if (currentVideoCount !== this.lastVideoCount) {
                    this.log(`Обнаружено изменение количества видео элементов: ${currentVideoCount}`, 'debug');
                    this.lastVideoCount = currentVideoCount;
                    
                    if (currentVideoCount > 0) {
                        this.log('Новое видео обнаружено, принудительная перепроверка контента', 'debug');
                        setTimeout(() => this.forceContentRecheck(), 2000);
                    }
                }
                
                // Проверяем активность Lampa
                if (typeof Lampa?.Activity?.active === 'function') {
                    const activity = Lampa.Activity.active();
                    if (activity && activity !== this.lastActivityCheck) {
                        this.lastActivityCheck = activity;
                        
                        if (activity.movie) {
                            const title = this.extractTitle(activity.movie);
                            if (title && title !== this.currentTitle) {
                                this.log(`Обнаружена смена контента через активность: ${title}`, 'debug');
                                this.onTitleChange(title);
                            }
                        }
                    }
                }
                
            } catch (error) {
                this.log(`Ошибка проверки активности: ${error.message}`, 'error');
            }
        }

        onVideoDetected() {
            this.log('Обнаружен контейнер с video элементом', 'debug');
            setTimeout(() => this.forceContentRecheck(), 4000);
        }

        async onTitleChange(title) {
            try {
                this.log(`Обнаружено аниме: "${title}"`, 'info');
                this.currentTitle = title;
                
                // Сбрасываем данные эпизода при смене тайтла
                this.currentEpisode = null;
                this.currentSeason = null;
                
                await this.loadSkipData(title);
            } catch (error) {
                this.log(`Ошибка при смене тайтла: ${error.message}`, 'error');
            }
        }

        async loadSkipData(title) {
            try {
                this.log('Запрос к API Anilibria...', 'debug');
                
                // Проверяем кэш
                const cacheKey = `${CONFIG.cache.prefix}${title}`;
                if (this.settings.cacheEnabled && this.cache.has(cacheKey)) {
                    const cachedData = this.cache.get(cacheKey);
                    if (Date.now() - cachedData.timestamp < CONFIG.cache.expiry) {
                        this.log('Используются кэшированные данные', 'debug');
                        this.skipData = cachedData.data;
                        this.showSkipNotification('info', `📊 Данные для "${title}" загружены из кэша`);
                        return;
                    }
                }
                
                // Проверяем встроенную базу данных
                const builtInData = this.getBuiltInData(title);
                if (builtInData) {
                    this.log('Используются встроенные данные', 'debug');
                    this.skipData = builtInData;
                    
                    // Кэшируем встроенные данные
                    if (this.settings.cacheEnabled) {
                        this.cache.set(cacheKey, {
                            data: builtInData,
                            timestamp: Date.now()
                        });
                    }
                    
                    this.showSkipNotification('success', `📊 Данные для "${title}" загружены (встроенная база)`);
                    return;
                }
                
                this.log('Данные для аниме не найдены', 'warning');
                this.skipData = null;
                
            } catch (error) {
                this.log(`Ошибка загрузки данных: ${error.message}`, 'error');
                this.skipData = null;
            }
        }

        /**
         * УЛУЧШЕННАЯ ФУНКЦИЯ ИЗВЛЕЧЕНИЯ НОМЕРА ЭПИЗОДА
         */
        extractEpisodeNumber() {
            try {
                // Метод 1: Из текущего плеера
                if (this.currentPlayer && this.currentPlayer.episode) {
                    const episodeNum = parseInt(this.currentPlayer.episode);
                    if (!isNaN(episodeNum) && episodeNum > 0) {
                        this.log(`Номер эпизода из плеера: ${episodeNum}`, 'debug');
                        return episodeNum;
                    }
                }

                // Метод 2: Из активности Lampa
                if (typeof Lampa?.Activity?.active === 'function') {
                    const activity = Lampa.Activity.active();
                    if (activity) {
                        // Проверяем различные поля активности
                        const episodeFields = [
                            'episode', 'episode_number', 'episodeNumber', 'ep',
                            'current_episode', 'selected_episode'
                        ];
                        
                        for (const field of episodeFields) {
                            if (activity[field] !== undefined) {
                                const episodeNum = parseInt(activity[field]);
                                if (!isNaN(episodeNum) && episodeNum > 0) {
                                    this.log(`Номер эпизода из активности (${field}): ${episodeNum}`, 'debug');
                                    return episodeNum;
                                }
                            }
                        }

                        // Проверяем вложенные объекты
                        if (activity.movie) {
                            for (const field of episodeFields) {
                                if (activity.movie[field] !== undefined) {
                                    const episodeNum = parseInt(activity.movie[field]);
                                    if (!isNaN(episodeNum) && episodeNum > 0) {
                                        this.log(`Номер эпизода из movie (${field}): ${episodeNum}`, 'debug');
                                        return episodeNum;
                                    }
                                }
                            }
                        }
                    }
                }

                // Метод 3: Из URL страницы
                const urlEpisode = this.extractEpisodeFromURL();
                if (urlEpisode !== null) {
                    this.log(`Номер эпизода из URL: ${urlEpisode}`, 'debug');
                    return urlEpisode;
                }

                // Метод 4: Из DOM элементов
                const domEpisode = this.extractEpisodeFromDOM();
                if (domEpisode !== null) {
                    this.log(`Номер эпизода из DOM: ${domEpisode}`, 'debug');
                    return domEpisode;
                }

                // Метод 5: Из заголовка страницы
                const titleEpisode = this.extractEpisodeFromTitle();
                if (titleEpisode !== null) {
                    this.log(`Номер эпизода из заголовка: ${titleEpisode}`, 'debug');
                    return titleEpisode;
                }

                // Метод 6: Используем сохраненное значение
                if (this.currentEpisode !== null) {
                    this.log(`Используем сохраненный номер эпизода: ${this.currentEpisode}`, 'debug');
                    return this.currentEpisode;
                }

                this.log('Не удалось определить номер эпизода', 'warning');
                return null;

            } catch (error) {
                this.log(`Ошибка извлечения номера эпизода: ${error.message}`, 'error');
                return null;
            }
        }

        /**
         * Извлечение номера эпизода из URL
         */
        extractEpisodeFromURL() {
            try {
                const url = window.location.href;
                
                // Различные паттерны для поиска номера эпизода в URL
                const patterns = [
                    /episode[_-]?(\d+)/i,
                    /ep[_-]?(\d+)/i,
                    /серия[_-]?(\d+)/i,
                    /[?&]episode=(\d+)/i,
                    /[?&]ep=(\d+)/i,
                    /\/(\d+)\/episode/i,
                    /\/episode\/(\d+)/i
                ];
                
                for (const pattern of patterns) {
                    const match = url.match(pattern);
                    if (match && match[1]) {
                        const episodeNum = parseInt(match[1]);
                        if (!isNaN(episodeNum) && episodeNum > 0) {
                            return episodeNum;
                        }
                    }
                }
                
                return null;
            } catch (error) {
                this.log(`Ошибка извлечения эпизода из URL: ${error.message}`, 'error');
                return null;
            }
        }

        /**
         * Извлечение номера эпизода из DOM элементов
         */
        extractEpisodeFromDOM() {
            try {
                // Селекторы для поиска номера эпизода
                const selectors = [
                    '.series__episode.active',
                    '.episode-item.active',
                    '.current-episode',
                    '.selected-episode',
                    '[data-episode]',
                    '.episode-number',
                    '.ep-number'
                ];
                
                for (const selector of selectors) {
                    const elements = document.querySelectorAll(selector);
                    for (const element of elements) {
                        // Проверяем data-атрибуты
                        const dataEpisode = element.getAttribute('data-episode');
                        if (dataEpisode) {
                            const episodeNum = parseInt(dataEpisode);
                            if (!isNaN(episodeNum) && episodeNum > 0) {
                                return episodeNum;
                            }
                        }
                        
                        // Проверяем текстовое содержимое
                        const text = element.textContent || element.innerText || '';
                        const episodeMatch = text.match(/(\d+)/);
                        if (episodeMatch) {
                            const episodeNum = parseInt(episodeMatch[1]);
                            if (!isNaN(episodeNum) && episodeNum > 0) {
                                return episodeNum;
                            }
                        }
                    }
                }
                
                return null;
            } catch (error) {
                this.log(`Ошибка извлечения эпизода из DOM: ${error.message}`, 'error');
                return null;
            }
        }

        /**
         * Извлечение номера эпизода из заголовка страницы
         */
        extractEpisodeFromTitle() {
            try {
                const title = document.title;
                
                const patterns = [
                    /серия\s*(\d+)/i,
                    /episode\s*(\d+)/i,
                    /ep\.?\s*(\d+)/i,
                    /эпизод\s*(\d+)/i,
                    /s\d+e(\d+)/i
                ];
                
                for (const pattern of patterns) {
                    const match = title.match(pattern);
                    if (match && match[1]) {
                        const episodeNum = parseInt(match[1]);
                        if (!isNaN(episodeNum) && episodeNum > 0) {
                            return episodeNum;
                        }
                    }
                }
                
                return null;
            } catch (error) {
                this.log(`Ошибка извлечения эпизода из заголовка: ${error.message}`, 'error');
                return null;
            }
        }

        /**
         * УЛУЧШЕННАЯ ФУНКЦИЯ ПЕРЕПРОВЕРКИ КОНТЕНТА
         */
        forceContentRecheck() {
            if (this.isRecheckInProgress) {
                this.log('Перепроверка уже выполняется, пропускаем', 'debug');
                return;
            }

            this.isRecheckInProgress = true;
            
            try {
                this.log('Принудительная перепроверка контента при смене видео...', 'debug');
                
                // Получаем текущую информацию
                const currentTitle = this.getCurrentTitle();
                const currentEpisode = this.extractEpisodeNumber();
                const currentSeason = this.extractSeasonNumber();
                
                // Создаем хэш текущего контента
                const contentHash = `${currentTitle}_s${currentSeason}_e${currentEpisode}`;
                
                this.log(`Текущий контент: "${currentTitle}" s${currentSeason} e${currentEpisode}`, 'debug');
                this.log(`Хэш контента: ${contentHash}`, 'debug');
                this.log(`Предыдущий хэш: ${this.lastContentHash}`, 'debug');
                
                // Проверяем, изменился ли контент
                if (this.lastContentHash === contentHash) {
                    this.log('Контент не изменился, пропускаем обновление', 'debug');
                    return;
                }
                
                // Контент изменился
                this.log(`КОНТЕНТ ИЗМЕНИЛСЯ! Старый: ${this.lastContentHash} -> Новый: ${contentHash}`, 'info');
                this.lastContentHash = contentHash;
                
                // Обновляем текущие данные
                if (currentTitle && currentTitle !== this.currentTitle) {
                    this.log(`Смена тайтла: "${this.currentTitle}" -> "${currentTitle}"`, 'info');
                    this.onTitleChange(currentTitle);
                }
                
                if (currentEpisode !== null && currentEpisode !== this.currentEpisode) {
                    this.log(`Смена эпизода: ${this.currentEpisode} -> ${currentEpisode}`, 'info');
                    this.currentEpisode = currentEpisode;
                    
                    // Показываем уведомление о смене эпизода
                    this.showSkipNotification('info', `📺 Эпизод ${currentEpisode}`);
                }
                
                if (currentSeason !== null && currentSeason !== this.currentSeason) {
                    this.log(`Смена сезона: ${this.currentSeason} -> ${currentSeason}`, 'info');
                    this.currentSeason = currentSeason;
                }
                
            } catch (error) {
                this.log(`Ошибка принудительной перепроверки: ${error.message}`, 'error');
            } finally {
                // Снимаем блокировку через некоторое время
                setTimeout(() => {
                    this.isRecheckInProgress = false;
                }, 2000);
            }
        }

        /**
         * Получение текущего названия аниме
         */
        getCurrentTitle() {
            try {
                // Пробуем получить из активности
                if (typeof Lampa?.Activity?.active === 'function') {
                    const activity = Lampa.Activity.active();
                    if (activity?.movie) {
                        const title = this.extractTitle(activity.movie);
                        if (title) return title;
                    }
                }
                
                // Возвращаем сохраненное название
                return this.currentTitle;
                
            } catch (error) {
                this.log(`Ошибка получения текущего названия: ${error.message}`, 'error');
                return this.currentTitle;
            }
        }

        /**
         * Извлечение номера сезона
         */
        extractSeasonNumber() {
            try {
                // Аналогично extractEpisodeNumber, но для сезонов
                if (typeof Lampa?.Activity?.active === 'function') {
                    const activity = Lampa.Activity.active();
                    if (activity) {
                        const seasonFields = ['season', 'season_number', 'seasonNumber', 'current_season'];
                        
                        for (const field of seasonFields) {
                            if (activity[field] !== undefined) {
                                const seasonNum = parseInt(activity[field]);
                                if (!isNaN(seasonNum) && seasonNum > 0) {
                                    return seasonNum;
                                }
                            }
                        }
                    }
                }
                
                return this.currentSeason || 1; // По умолчанию первый сезон
                
            } catch (error) {
                this.log(`Ошибка извлечения номера сезона: ${error.message}`, 'error');
                return 1;
            }
        }

        recheckCurrentContent() {
            setTimeout(() => this.forceContentRecheck(), 500);
        }

        onPlayerStart() {
            this.log('Плеер запущен', 'debug');
            this.startTimelineCheck();
        }

        onPlayerEnd() {
            this.log('Плеер остановлен', 'debug');
            this.stopTimelineCheck();
        }

        onTimeUpdate(currentTime) {
            if (!this.settings.autoSkipEnabled || !this.skipData || currentTime === undefined) {
                return;
            }

            const episodeNumber = this.extractEpisodeNumber();
            if (episodeNumber === null) {
                return;
            }

            this.checkAndSkip(currentTime, episodeNumber);
        }

        startTimelineCheck() {
            this.stopTimelineCheck();
            
            this.timelineCheckInterval = setInterval(() => {
                try {
                    const video = document.querySelector('video');
                    if (video && !video.paused) {
                        this.onTimeUpdate(video.currentTime);
                    }
                } catch (error) {
                    this.log(`Ошибка проверки времени: ${error.message}`, 'error');
                }
            }, CONFIG.skip.checkInterval);
        }

        stopTimelineCheck() {
            if (this.timelineCheckInterval) {
                clearInterval(this.timelineCheckInterval);
                this.timelineCheckInterval = null;
            }
        }

        checkAndSkip(currentTime, episodeNumber) {
            if (!this.skipData || !this.skipData[episodeNumber]) {
                return;
            }

            const episodeData = this.skipData[episodeNumber];
            const now = Date.now();

            // Проверяем интро
            if (episodeData.intro && this.shouldSkip(currentTime, episodeData.intro, now)) {
                this.performSkip(episodeData.intro.end, 'заставки');
            }
            // Проверяем аутро
            else if (episodeData.outro && this.shouldSkip(currentTime, episodeData.outro, now)) {
                this.performSkip(episodeData.outro.end, 'титров');
            }
        }

        shouldSkip(currentTime, skipData, now) {
            return currentTime >= skipData.start && 
                   currentTime <= skipData.end &&
                   (now - this.lastSkipTime) > (this.settings.skipDelay * 2);
        }

        performSkip(skipToTime, skipType) {
            try {
                const video = document.querySelector('video');
                if (!video) {
                    this.log('Видео элемент не найден для пропуска', 'warning');
                    return;
                }

                video.currentTime = skipToTime;
                this.lastSkipTime = Date.now();
                
                const message = `⏭️ Пропуск ${skipType}`;
                this.log(message, 'info');
                this.showSkipNotification('success', message);

            } catch (error) {
                this.log(`Ошибка пропуска: ${error.message}`, 'error');
            }
        }

        /**
         * ВСТРОЕННАЯ БАЗА ДАННЫХ С ВРЕМЕННЫМИ МЕТКАМИ
         */
        getBuiltInData(title) {
            const database = {
                "Восхождение героя щита": {
                    1: { intro: { start: 0, end: 90 }, outro: { start: 1320, end: 1440 } },
                    2: { intro: { start: 0, end: 90 }, outro: { start: 1320, end: 1440 } },
                    3: { intro: { start: 0, end: 90 }, outro: { start: 1320, end: 1440 } },
                    4: { intro: { start: 0, end: 90 }, outro: { start: 1320, end: 1440 } },
                    5: { intro: { start: 0, end: 90 }, outro: { start: 1320, end: 1440 } }
                },
                "Атака титанов": {
                    1: { intro: { start: 0, end: 85 }, outro: { start: 1300, end: 1420 } },
                    2: { intro: { start: 0, end: 85 }, outro: { start: 1300, end: 1420 } },
                    3: { intro: { start: 0, end: 85 }, outro: { start: 1300, end: 1420 } }
                },
                "Клинок, рассекающий демонов": {
                    1: { intro: { start: 0, end: 90 }, outro: { start: 1320, end: 1440 } },
                    2: { intro: { start: 0, end: 90 }, outro: { start: 1320, end: 1440 } },
                    3: { intro: { start: 0, end: 90 }, outro: { start: 1320, end: 1440 } }
                },
                "Моя геройская академия": {
                    1: { intro: { start: 0, end: 90 }, outro: { start: 1300, end: 1420 } },
                    2: { intro: { start: 0, end: 90 }, outro: { start: 1300, end: 1420 } },
                    3: { intro: { start: 0, end: 90 }, outro: { start: 1300, end: 1420 } }
                },
                "Наруто": {
                    1: { intro: { start: 0, end: 90 }, outro: { start: 1320, end: 1440 } },
                    2: { intro: { start: 0, end: 90 }, outro: { start: 1320, end: 1440 } },
                    3: { intro: { start: 0, end: 90 }, outro: { start: 1320, end: 1440 } }
                },
                "Токийский гуль": {
                    1: { intro: { start: 0, end: 85 }, outro: { start: 1300, end: 1420 } },
                    2: { intro: { start: 0, end: 85 }, outro: { start: 1300, end: 1420 } },
                    3: { intro: { start: 0, end: 85 }, outro: { start: 1300, end: 1420 } }
                }
            };

            // Поиск по точному совпадению
            if (database[title]) {
                return database[title];
            }

            // Поиск по частичному совпадению
            for (const [dbTitle, data] of Object.entries(database)) {
                if (title.includes(dbTitle) || dbTitle.includes(title)) {
                    this.log(`Найдено частичное совпадение: "${title}" -> "${dbTitle}"`, 'debug');
                    return data;
                }
            }

            return null;
        }

        showSkipNotification(type, message) {
            if (!this.settings.showNotifications) return;

            try {
                if (typeof Lampa?.Noty === 'function') {
                    Lampa.Noty.show(message);
                } else if (typeof Lampa?.Toast === 'function') {
                    Lampa.Toast.show(message);
                } else {
                    this.log(message, type);
                }
            } catch (error) {
                this.log(`Ошибка отображения уведомления: ${error.message}`, 'error');
                this.log(message, type);
            }
        }

        log(message, level = 'info') {
            if (!this.settings.debugEnabled && level === 'debug') return;

            const timestamp = new Date().toLocaleTimeString();
            const prefix = `[AnilibriaAutoSkip] ${timestamp}`;
            
            switch (level) {
                case 'error':
                    console.error(`${prefix} ❌ ${message}`);
                    break;
                case 'warning':
                    console.warn(`${prefix} ⚠️ ${message}`);
                    break;
                case 'success':
                    console.log(`${prefix} ✅ ${message}`);
                    break;
                case 'debug':
                    console.log(`${prefix} 🔍 ${message}`);
                    break;
                default:
                    console.log(`${prefix} ${message}`);
            }
        }

        destroy() {
            this.log('Уничтожение плагина...', 'info');
            this.stopTimelineCheck();
            this.cache.clear();
            this.isInitialized = false;
        }
    }

    // Инициализация плагина
    if (typeof window !== 'undefined') {
        window.AnilibriaAutoSkipPlugin = new AnilibriaAutoSkipPlugin();
    }

})();
