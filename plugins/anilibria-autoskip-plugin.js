/**
 * Anilibria Auto-Skip Plugin v2.0.0
 * 
 * Универсальный плагин для автоматического пропуска заставок и титров в аниме от всех источников.
 * 
 * ОСНОВНЫЕ ИСПРАВЛЕНИЯ v2.0.0:
 * - Полностью переработана логика определения аниме для всех источников
 * - Добавлены универсальные селекторы для всех типов плееров
 * - Улучшена система извлечения названий аниме
 * - Исправлена работа с API и добавлены резервные источники данных
 * - Добавлена продвинутая система определения эпизодов
 * - Оптимизирован DOM Observer для лучшего отслеживания изменений
 * 
 * URL: http://localhost:5000/anilibria-autoskip-plugin.js
 */
(function() {
    'use strict';

    const CONFIG = {
        id: 'anilibria_autoskip',
        name: 'Anilibria Auto-Skip Universal',
        version: '2.0.5',
        api: {
            endpoints: [
                'https://api.anilibria.tv/v3/',
                'https://anilibria.tv/api/v2/',
                'https://anilibria.top/api/v1/'
            ],
            timeout: 10000,
            retries: 3,
            fallbackData: true
        },
        cache: {
            prefix: 'anilibria_skip_v2_',
            expiry: 12 * 60 * 60 * 1000, // 12 часов
            maxSize: 100
        },
        skip: {
            defaultDelay: 800,
            notificationDuration: 4000,
            checkInterval: 300
        },
        settings: {
            autoSkipEnabled: true,
            debugEnabled: false, // Отключаем избыточное логирование
            skipDelay: 800,
            cacheEnabled: true,
            showNotifications: true,
            universalMode: true // Новый режим для всех источников
        }
    };

    // Универсальные селекторы для определения эпизодов
    const EPISODE_SELECTORS = [
        // Lampa стандартные
        '.series__episode.active',
        '.series__episode.focus',
        '.episode-item.active',
        '.episode-item.focus',
        '.episode-item.selected',
        
        // Универсальные селекторы
        '.selector.active',
        '.selector.focus',
        '.selector.selected',
        '.item.active',
        '.item.focus',
        '.item.selected',
        
        // Торрент плееры
        '.torrent-item.active',
        '.torrent-item.focus',
        '.torrent-item.selected',
        
        // Онлайн плееры
        '.online-item.active',
        '.online-item.focus',
        '.online-prestige.active',
        '.online-prestige.focus',
        
        // Специфичные селекторы
        '.current-episode',
        '.selected-episode',
        '.episode-current',
        '.ep-current',
        
        // Data атрибуты
        '[data-episode]',
        '[data-ep]',
        '[data-episode-number]',
        
        // Дополнительные
        '.episode-number',
        '.ep-number',
        '.episode',
        '.ep'
    ];

    // Селекторы для определения названия аниме
    const TITLE_SELECTORS = [
        '.full-start__title',
        '.card__title',
        '.player__title',
        '.title',
        '.name',
        '.anime-title',
        '.movie-title',
        '.content-title',
        'h1',
        'h2'
    ];

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
            this.lastEpisodeFromDOM = null;
            this.domObserver = null;
            this.episodeChangeCallbacks = [];
            this.titleDatabase = new Map(); // Локальная база названий
            this.lastEpisodeChangeTime = 0;
            this.episodeChangeDelay = 3000; // 3 секунды задержки от hover
            this.isHoverEvent = false;
            this.stableEpisodeNumber = null;
            this.isMouseMoving = false;
            this.lastMouseMoveTime = 0;
            this.setupMouseDetection();
            this.init();
        }

        /**
         * Установка детекции движения мыши для блокировки hover событий
         */
        setupMouseDetection() {
            // Отслеживаем движение мыши
            document.addEventListener('mousemove', () => {
                this.isMouseMoving = true;
                this.lastMouseMoveTime = Date.now();
                
                // Очищаем флаг через 500мс после остановки движения
                clearTimeout(this.mouseMoveTimeout);
                this.mouseMoveTimeout = setTimeout(() => {
                    this.isMouseMoving = false;
                }, 500);
            });
        }

        init() {
            try {
                this.log('🚀 Инициализация универсального плагина v2.0.5...', 'info');
                this.loadSettings();
                this.setupLampaIntegration();
                this.setupUniversalEventListeners();
                this.setupAdvancedDOMObserver();
                this.startUniversalActivityMonitoring();
                this.loadLocalTitleDatabase();
                this.isInitialized = true;
                this.log('✅ Плагин успешно инициализирован в универсальном режиме', 'success');
                this.showSkipNotification('success', '🎯 Anilibria Auto-Skip v2.0.5 готов для всех источников!');
                
                this.performExtendedDiagnostics();
            } catch (error) {
                this.log(`❌ Ошибка инициализации: ${error.message}`, 'error');
            }
        }

        loadSettings() {
            this.log('📥 Загрузка настроек...', 'info');
            try {
                const stored = Lampa.Storage.get(`${CONFIG.id}_settings`);
                if (stored) this.settings = {...this.settings, ...stored};
                
                // Принудительно отключаем debug в новой версии
                this.settings.debugEnabled = false;
                
                this.log(`🔍 Настройки загружены: ${JSON.stringify(this.settings)}`, 'debug');
            } catch (error) {
                this.log(`⚠️ Ошибка загрузки настроек: ${error.message}`, 'warning');
            }
        }

        saveSettings() {
            try {
                Lampa.Storage.set(`${CONFIG.id}_settings`, this.settings);
                this.log('💾 Настройки сохранены', 'debug');
            } catch (error) {
                this.log(`❌ Ошибка сохранения настроек: ${error.message}`, 'error');
            }
        }

        setupLampaIntegration() {
            this.log('🔗 Настройка интеграции с Lampa...', 'info');
            this.log('✅ Интеграция с Lampa завершена', 'success');
        }

        /**
         * Универсальная система слушателей событий для всех источников
         */
        setupUniversalEventListeners() {
            this.log('🎧 Настройка универсальных слушателей событий...', 'info');
            try {
                // Основные события контента
                Lampa.Listener.follow('full', (e) => {
                    this.handleFullEvent(e);
                });

                // События плеера - критически важны
                Lampa.Listener.follow('player', (e) => {
                    this.handlePlayerEvent(e);
                });

                // События активности
                Lampa.Listener.follow('activity', (e) => {
                    this.handleActivityEvent(e);
                });

                // События сериалов - ключевые для эпизодов
                Lampa.Listener.follow('series', (e) => {
                    this.handleSeriesEvent(e);
                });

                // События торрентов
                Lampa.Listener.follow('torrent', (e) => {
                    this.handleTorrentEvent(e);
                });

                // События онлайн плееров
                Lampa.Listener.follow('online', (e) => {
                    this.handleOnlineEvent(e);
                });

                // События видео
                Lampa.Listener.follow('video', (e) => {
                    this.handleVideoEvent(e);
                });

                // События страниц
                Lampa.Listener.follow('page', (e) => {
                    this.handlePageEvent(e);
                });

                // События контента
                Lampa.Listener.follow('content', (e) => {
                    this.handleContentEvent(e);
                });

                this.log('✅ Универсальные слушатели событий настроены', 'success');
            } catch (error) {
                this.log(`❌ Ошибка настройки слушателей: ${error.message}`, 'error');
            }
        }

        /**
         * Обработчики событий
         */
        handleFullEvent(e) {
            if (e.type === 'complite' && e.data?.movie) {
                const title = this.extractUniversalTitle(e.data.movie);
                if (title) {
                    this.log(`📺 Событие full: обнаружено аниме "${title}"`, 'debug');
                    this.onUniversalTitleChange(title, e.data.movie);
                }
            }
        }

        handlePlayerEvent(e) {
            this.log(`🎬 Событие плеера: ${e.type}`, 'debug');
            
            switch(e.type) {
                case 'start':
                    this.currentPlayer = e.player || null;
                    this.onPlayerStart();
                    break;
                case 'timeupdate':
                    this.onTimeUpdate(e.current);
                    break;
                case 'end':
                case 'destroy':
                    this.onPlayerEnd();
                    break;
                case 'video':
                    this.currentVideoElement = e.video || null;
                    this.log('📽️ Новое видео загружено в плеер', 'debug');
                    setTimeout(() => this.universalContentRecheck(), 1000);
                    break;
            }
        }

        handleActivityEvent(e) {
            this.log(`🎭 Событие активности: ${e.type}`, 'debug');
            if (e.type === 'start' && e.object?.movie) {
                const title = this.extractUniversalTitle(e.object.movie);
                if (title) {
                    this.log(`🎯 Активность: обнаружено аниме "${title}"`, 'debug');
                    setTimeout(() => this.onUniversalTitleChange(title, e.object.movie), 500);
                }
            }
        }

        handleSeriesEvent(e) {
            this.log(`📚 Событие сериала: ${e.type}`, 'debug');
            if (e.type === 'episode' || e.type === 'season' || e.type === 'select') {
                this.log('🔄 Обнаружена смена эпизода/сезона', 'info');
                
                // Извлекаем информацию об эпизоде из события
                this.extractEpisodeFromSeriesEvent(e);
                
                setTimeout(() => this.universalContentRecheck(), 1000);
            }
        }

        handleTorrentEvent(e) {
            this.log(`🌊 Событие торрента: ${e.type}`, 'debug');
            if (e.type === 'select' || e.type === 'change' || e.type === 'episode') {
                this.log('🔄 Смена торрента - универсальная перепроверка', 'info');
                setTimeout(() => this.universalContentRecheck(), 1500);
            }
        }

        handleOnlineEvent(e) {
            this.log(`📺 Событие онлайн: ${e.type}`, 'debug');
            if (e.type === 'select' || e.type === 'change' || e.type === 'episode') {
                this.log('🔄 Смена онлайн эпизода - универсальная перепроверка', 'info');
                setTimeout(() => this.universalContentRecheck(), 1000);
            }
        }

        handleVideoEvent(e) {
            this.log(`🎥 Событие видео: ${e.type}`, 'debug');
            if (e.type === 'start' || e.type === 'load') {
                setTimeout(() => this.universalContentRecheck(), 800);
            }
        }

        handlePageEvent(e) {
            this.log(`📄 Событие страницы: ${e.type}`, 'debug');
            if (e.type === 'player') {
                setTimeout(() => this.universalContentRecheck(), 2000);
            }
        }

        handleContentEvent(e) {
            this.log(`📋 Событие контента: ${e.type}`, 'debug');
            if (e.type === 'change' || e.type === 'start') {
                setTimeout(() => this.universalContentRecheck(), 1200);
            }
        }

        /**
         * Универсальное извлечение названия аниме из различных источников
         */
        extractUniversalTitle(movieData) {
            if (!movieData) return null;

            // Все возможные поля с названиями
            const titleFields = [
                'title', 'name', 'original_title', 'original_name',
                'ru_title', 'en_title', 'jp_title', 'romaji_title',
                'russian_title', 'english_title', 'japanese_title',
                'display_title', 'full_title', 'series_title',
                'anime_title', 'show_title', 'content_title'
            ];

            // Ищем в полях объекта
            for (const field of titleFields) {
                if (movieData[field] && typeof movieData[field] === 'string') {
                    const title = this.cleanTitle(movieData[field]);
                    if (title.length > 2) return title;
                }
            }

            // Ищем в вложенных объектах
            const nestedObjects = ['movie', 'item', 'data', 'info', 'details'];
            for (const obj of nestedObjects) {
                if (movieData[obj] && typeof movieData[obj] === 'object') {
                    const nestedTitle = this.extractUniversalTitle(movieData[obj]);
                    if (nestedTitle) return nestedTitle;
                }
            }

            return null;
        }

        /**
         * Очистка названия от лишних символов
         */
        cleanTitle(title) {
            if (!title) return '';
            
            return title
                .replace(/^\d+[\.\s]+/, '') // Убираем номера в начале
                .replace(/\s*\(\d{4}\).*$/, '') // Убираем год и всё после него
                .replace(/\s*\[.*?\]/g, '') // Убираем квадратные скобки
                .replace(/\s*\(.*?\)/g, '') // Убираем круглые скобки
                .replace(/\s*-\s*сезон.*$/i, '') // Убираем "сезон"
                .replace(/\s*season.*$/i, '') // Убираем "season"
                .replace(/\s*\d+\s*сезон/i, '') // Убираем "N сезон"
                .replace(/\s*s\d+/i, '') // Убираем "S1", "S2" и т.д.
                .replace(/^\d+[\.\s]*K[\.\s]*/, '') // Убираем размер файла в начале (например "8.14K")
                .replace(/\d{4}$/, '') // Убираем год в конце
                .replace(/\s+/g, ' ') // Нормализуем пробелы
                .trim();
        }

        /**
         * Универсальная обработка смены названия
         */
        onUniversalTitleChange(title, movieData = null) {
            if (!title) return;
            
            const cleanedTitle = this.cleanTitle(title);
            if (cleanedTitle === this.currentTitle) return;

            this.log(`🎬 Обнаружено новое аниме: "${cleanedTitle}"`, 'info');
            this.currentTitle = cleanedTitle;
            
            // Сохраняем в локальную базу
            if (movieData) {
                this.titleDatabase.set(cleanedTitle, movieData);
            }
            
            // Запускаем поиск данных о пропусках
            this.loadUniversalSkipData(cleanedTitle);
        }

        /**
         * Расширенный DOM Observer для отслеживания всех изменений
         */
        setupAdvancedDOMObserver() {
            this.log('👁️ Настройка расширенного DOM Observer...', 'info');
            
            if (this.domObserver) {
                this.domObserver.disconnect();
            }

            this.domObserver = new MutationObserver((mutations) => {
                let shouldRecheck = false;
                
                mutations.forEach((mutation) => {
                    // Отслеживаем изменения классов (активные элементы)
                    if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                        const target = mutation.target;
                        if (target.classList.contains('active') || 
                            target.classList.contains('focus') || 
                            target.classList.contains('selected')) {
                            shouldRecheck = true;
                        }
                    }
                    
                    // Отслеживаем добавление/удаление элементов
                    if (mutation.type === 'childList') {
                        mutation.addedNodes.forEach((node) => {
                            if (node.nodeType === 1) { // Element node
                                const element = node;
                                // Проверяем, содержит ли добавленный элемент эпизоды
                                if (element.querySelector && 
                                    EPISODE_SELECTORS.some(selector => element.querySelector(selector))) {
                                    shouldRecheck = true;
                                }
                            }
                        });
                    }
                });

                if (shouldRecheck) {
                    // Убираем избыточное логирование DOM Observer
                    setTimeout(() => this.universalContentRecheck(), 300);
                }
            });

            // Наблюдаем за всем документом
            this.domObserver.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['class', 'data-episode', 'data-ep']
            });

            this.log('✅ Расширенный DOM Observer настроен', 'success');
        }

        /**
         * Универсальная перепроверка контента
         */
        universalContentRecheck() {
            if (this.isRecheckInProgress) return;
            this.isRecheckInProgress = true;

            this.log('🔍 Универсальная перепроверка контента...', 'debug');
            
            try {
                // 1. Определяем текущий эпизод
                const episodeInfo = this.findUniversalEpisodeNumber();
                
                // 2. Определяем текущее название (если не было определено ранее)
                if (!this.currentTitle) {
                    const title = this.findUniversalTitle();
                    if (title) {
                        this.onUniversalTitleChange(title);
                    }
                }

                // 3. Проверяем изменения
                const contentHash = this.generateContentHash(this.currentTitle, episodeInfo.season, episodeInfo.episode);
                
                if (contentHash !== this.lastContentHash) {
                    this.log(`🔄 КОНТЕНТ ИЗМЕНИЛСЯ! Старый: ${this.lastContentHash} -> Новый: ${contentHash}`, 'info');
                    
                    if (episodeInfo.episode !== this.currentEpisode) {
                        this.log(`📺 Смена эпизода: ${this.currentEpisode} -> ${episodeInfo.episode}`, 'info');
                        this.currentEpisode = episodeInfo.episode;
                    }
                    
                    if (episodeInfo.season !== this.currentSeason) {
                        this.log(`📚 Смена сезона: ${this.currentSeason} -> ${episodeInfo.season}`, 'info');
                        this.currentSeason = episodeInfo.season;
                    }
                    
                    this.lastContentHash = contentHash;
                    this.startUniversalAutoSkipMonitoring();
                }
                
            } catch (error) {
                this.log(`❌ Ошибка универсальной перепроверки: ${error.message}`, 'error');
            } finally {
                this.isRecheckInProgress = false;
            }
        }

        /**
         * Универсальный поиск номера эпизода
         */
        findUniversalEpisodeNumber() {
            this.log('🔍 Универсальный поиск номера эпизода...', 'debug');
            
            const now = Date.now();
            
            // Более мягкая защита от слишком частых вызовов (hover события)
            if (now - this.lastEpisodeChangeTime < 500 && this.stableEpisodeNumber !== null) { 
                // Возвращаем стабильный результат только если он уже установлен
                return {
                    episode: this.stableEpisodeNumber,
                    season: 1
                };
            }
            
            let foundEpisode = null;
            let foundSeason = 1; // По умолчанию первый сезон

            // 1. Проверяем все селекторы эпизодов
            for (const selector of EPISODE_SELECTORS) {
                const elements = document.querySelectorAll(selector);
                
                for (const element of elements) {
                    const episodeNum = this.extractEpisodeFromElement(element);
                    if (episodeNum !== null) {
                        this.log(`✅ Номер эпизода из ${selector}: ${episodeNum}`, 'info');
                        foundEpisode = episodeNum;
                        break;
                    }
                }
                
                if (foundEpisode !== null) break;
            }

            // 2. Если не нашли, пробуем через Lampa API
            if (foundEpisode === null) {
                foundEpisode = this.getEpisodeFromLampaActivity();
            }

            // 3. Если всё ещё не нашли, ищем в URL
            if (foundEpisode === null) {
                foundEpisode = this.extractEpisodeFromURL();
            }

            // 4. Если всё ещё не нашли, пытаемся определить по позиции
            if (foundEpisode === null) {
                foundEpisode = this.getEpisodeFromPosition();
            }

            // 5. Принудительно пытаемся получить из всех доступных источников
            if (foundEpisode === null) {
                foundEpisode = this.forceEpisodeDetection();
            }

            // Обновляем стабильный номер эпизода более гибко
            if (foundEpisode !== null && foundEpisode !== this.stableEpisodeNumber) {
                // Если это первый раз или прошло достаточно времени
                if (this.stableEpisodeNumber === null || now - this.lastEpisodeChangeTime >= 1000) {
                    this.stableEpisodeNumber = foundEpisode;
                    this.lastEpisodeChangeTime = now;
                    this.log(`🎯 Стабильный результат: сезон ${foundSeason}, эпизод ${foundEpisode}`, 'info');
                }
            }
            
            // Возвращаем стабильный результат
            const finalEpisode = this.stableEpisodeNumber || foundEpisode;
            this.log(`🎯 Результат поиска: сезон ${foundSeason}, эпизод ${finalEpisode}`, 'info');
            
            return {
                episode: finalEpisode,
                season: foundSeason
            };
        }

        /**
         * Извлечение номера эпизода из элемента DOM
         */
        extractEpisodeFromElement(element) {
            if (!element) return null;

            // 1. Проверяем data-атрибуты
            const dataAttrs = ['data-episode', 'data-ep', 'data-episode-number', 'data-number'];
            for (const attr of dataAttrs) {
                const value = element.getAttribute(attr);
                if (value) {
                    const num = parseInt(value);
                    if (!isNaN(num) && num > 0) return num;
                }
            }

            // 2. Анализируем текст элемента
            const text = element.textContent || element.innerText || '';
            
            // Различные паттерны для извлечения номера эпизода
            const patterns = [
                /^(\d+)\./, // Начинается с числа и точки
                /^(\d+)\s/, // Начинается с числа и пробела
                /эпизод\s*(\d+)/i, // "эпизод N"
                /серия\s*(\d+)/i, // "серия N"
                /episode\s*(\d+)/i, // "episode N"
                /ep\.?\s*(\d+)/i, // "ep N" или "ep. N"
                /(\d+)\s*эпизод/i, // "N эпизод"
                /(\d+)\s*серия/i, // "N серия"
                /(\d+)$/ // Заканчивается числом
            ];

            for (const pattern of patterns) {
                const match = text.match(pattern);
                if (match) {
                    const num = parseInt(match[1]);
                    if (!isNaN(num) && num > 0) {
                        this.log(`✅ Номер эпизода из паттерна ${pattern}: "${text}" -> ${num}`, 'info');
                        return num;
                    }
                }
            }

            return null;
        }

        /**
         * Получение эпизода из активности Lampa
         */
        getEpisodeFromLampaActivity() {
            try {
                if (Lampa.Activity && Lampa.Activity.active()) {
                    const activity = Lampa.Activity.active();
                    if (activity && activity.component) {
                        const component = activity.component;
                        
                        // Различные способы получения номера эпизода
                        const episodeSources = [
                            () => component.episode,
                            () => component.current_episode,
                            () => component.selected_episode,
                            () => component.data?.episode,
                            () => component.object?.episode,
                            () => component.movie?.episode,
                            () => component.movie?.episodes?.current,
                            () => component.movie?.episodes?.active,
                            () => component.torrent?.episode,
                            () => component.online?.episode,
                            () => component.player?.episode,
                            () => component.files?.active?.episode,
                            () => component.files?.current?.episode
                        ];

                        for (const source of episodeSources) {
                            try {
                                const episode = source();
                                if (episode !== undefined && episode !== null && !isNaN(parseInt(episode))) {
                                    const num = parseInt(episode);
                                    if (num > 0) {
                                        this.log(`✅ Эпизод из Lampa Activity: ${num}`, 'info');
                                        return num;
                                    }
                                }
                            } catch (e) {
                                // Игнорируем ошибки отдельных источников
                            }
                        }

                        // Попытка извлечь номер эпизода из индекса файла
                        if (component.files && component.files.current >= 0) {
                            const fileIndex = component.files.current;
                            if (fileIndex >= 0) {
                                const episodeNum = fileIndex + 1; // Индекс файла обычно начинается с 0
                                this.log(`✅ Эпизод из индекса файла: ${episodeNum}`, 'info');
                                return episodeNum;
                            }
                        }

                        // Попытка получить из torrent/online
                        if (component.torrent && component.torrent.current >= 0) {
                            const episodeNum = component.torrent.current + 1;
                            this.log(`✅ Эпизод из торрент индекса: ${episodeNum}`, 'info');
                            return episodeNum;
                        }

                        if (component.online && component.online.current >= 0) {
                            const episodeNum = component.online.current + 1;
                            this.log(`✅ Эпизод из онлайн индекса: ${episodeNum}`, 'info');
                            return episodeNum;
                        }
                    }
                }
            } catch (error) {
                this.log(`⚠️ Ошибка получения эпизода из Lampa Activity: ${error.message}`, 'warning');
            }
            
            return null;
        }

        /**
         * Извлечение эпизода из URL
         */
        extractEpisodeFromURL() {
            const url = window.location.href;
            const patterns = [
                /episode[=\/](\d+)/i,
                /ep[=\/](\d+)/i,
                /серия[=\/](\d+)/i,
                /эпизод[=\/](\d+)/i
            ];

            for (const pattern of patterns) {
                const match = url.match(pattern);
                if (match) {
                    const num = parseInt(match[1]);
                    if (!isNaN(num) && num > 0) {
                        this.log(`✅ Эпизод из URL: ${num}`, 'debug');
                        return num;
                    }
                }
            }

            return null;
        }

        /**
         * Получение эпизода по позиции в списке (ОТКЛЮЧЕНО при движении мыши)
         */
        getEpisodeFromPosition() {
            try {
                const now = Date.now();
                
                // Защита от активного движения мыши - блокируем только если мышь активно двигается
                if (this.isMouseMoving) {
                    // Если мышь активно двигается СЕЙЧАС - возвращаем стабильный результат
                    if (this.stableEpisodeNumber !== null) {
                        return this.stableEpisodeNumber;
                    }
                    // Если нет стабильного результата, не блокируем полностью - позволяем определить
                }
                
                // Дополнительная защита от частых вызовов
                if (now - this.lastEpisodeChangeTime < this.episodeChangeDelay) {
                    if (this.stableEpisodeNumber !== null) {
                        return this.stableEpisodeNumber;
                    }
                }
                
                // Выбираем селекторы в зависимости от состояния мыши
                let activeSelectors;
                if (this.isMouseMoving || (now - this.lastMouseMoveTime < 1000)) {
                    // Если мышь недавно двигалась - используем только .active
                    activeSelectors = [
                        '.selector.active:not(.selector.focus)',
                        '.item.active:not(.item.focus)', 
                        '.episode-item.active:not(.episode-item.focus)'
                    ];
                } else {
                    // Если мышь неподвижна - можем использовать .focus
                    activeSelectors = [
                        '.selector.active',
                        '.item.active', 
                        '.episode-item.active',
                        '.selector.focus',
                        '.item.focus', 
                        '.episode-item.focus'
                    ];
                }
                
                for (const activeSelector of activeSelectors) {
                    const activeElement = document.querySelector(activeSelector);
                    if (activeElement) {
                        // Проверяем hover только если мышь недавно двигалась
                        if ((this.isMouseMoving || (now - this.lastMouseMoveTime < 1000)) && 
                            activeElement.matches(':hover') && 
                            !activeElement.classList.contains('active')) {
                            continue; // Игнорируем hover элементы только при движении мыши
                        }
                        
                        // Получаем родительский контейнер
                        const container = activeElement.closest('.selector-list, .items, .episode-list, .torrent-list') || 
                                        activeElement.parentElement;
                        
                        if (container) {
                            // Получаем все элементы такого же типа
                            const allElements = container.querySelectorAll('.selector, .item, .episode-item');
                            const position = Array.from(allElements).indexOf(activeElement);
                            
                            if (position >= 0) {
                                const episodeNum = position + 1;
                                
                                // Устанавливаем новый стабильный номер
                                if (this.stableEpisodeNumber !== episodeNum) {
                                    // Если это первое определение или прошло достаточно времени
                                    if (this.stableEpisodeNumber === null || 
                                        now - this.lastEpisodeChangeTime >= 1500) { // Уменьшили с 3 секунд до 1.5
                                        this.stableEpisodeNumber = episodeNum;
                                        this.lastEpisodeChangeTime = now;
                                        this.log(`✅ Стабильный эпизод определен по позиции: ${episodeNum}`, 'info');
                                        return episodeNum;
                                    } else {
                                        // Возвращаем старый стабильный номер если изменение слишком быстрое
                                        return this.stableEpisodeNumber;
                                    }
                                } else {
                                    return episodeNum; // Возвращаем текущий стабильный
                                }
                            }
                        }
                    }
                }
                
                // Возвращаем последний стабильный номер если ничего нового не найдено
                return this.stableEpisodeNumber;
            } catch (error) {
                this.log(`⚠️ Ошибка определения эпизода по позиции: ${error.message}`, 'warning');
            }
            
            return null;
        }

        /**
         * Принудительное обнаружение эпизода из всех источников
         */
        forceEpisodeDetection() {
            try {
                // Глубокий поиск в объекте Lampa
                if (window.Lampa) {
                    const sources = [
                        () => Lampa.Player?.info?.movie?.episode,
                        () => Lampa.Activity?.active()?.movie?.episode,
                        () => Lampa.Storage.get('player_episode'),
                        () => Lampa.Storage.get('current_episode'),
                        () => Lampa.Storage.get('active_episode')
                    ];

                    for (const source of sources) {
                        try {
                            const episode = source();
                            if (episode && !isNaN(parseInt(episode))) {
                                const num = parseInt(episode);
                                if (num > 0) {
                                    this.log(`✅ Эпизод из принудительного поиска: ${num}`, 'info');
                                    return num;
                                }
                            }
                        } catch (e) {
                            // Игнорируем ошибки
                        }
                    }
                }

                // Поиск в локальном хранилище
                try {
                    const keys = Object.keys(localStorage).filter(key => 
                        key.includes('episode') || key.includes('current') || key.includes('active')
                    );
                    
                    for (const key of keys) {
                        const value = localStorage.getItem(key);
                        if (value && !isNaN(parseInt(value))) {
                            const num = parseInt(value);
                            if (num > 0 && num < 1000) { // Разумные границы для номера эпизода
                                this.log(`✅ Эпизод из localStorage (${key}): ${num}`, 'info');
                                return num;
                            }
                        }
                    }
                } catch (e) {
                    // Игнорируем ошибки localStorage
                }
            } catch (error) {
                this.log(`⚠️ Ошибка принудительного определения эпизода: ${error.message}`, 'warning');
            }

            return null;
        }

        /**
         * Поиск названия в текущем DOM
         */
        findUniversalTitle() {
            // 1. Сначала пытаемся получить из Lampa Activity
            try {
                if (Lampa.Activity && Lampa.Activity.active()) {
                    const activity = Lampa.Activity.active();
                    if (activity && activity.component && activity.component.movie) {
                        const title = this.extractUniversalTitle(activity.component.movie);
                        if (title) {
                            this.log(`🎯 Название из Lampa Activity: "${title}"`, 'debug');
                            return title;
                        }
                    }
                }
            } catch (error) {
                this.log(`⚠️ Ошибка получения названия из Activity: ${error.message}`, 'warning');
            }

            // 2. Ищем в специфичных селекторах для названий
            const specificSelectors = [
                '.full-start__title',
                '.card__title', 
                '.player__title',
                'h1.title',
                'h2.title'
            ];

            for (const selector of specificSelectors) {
                const elements = document.querySelectorAll(selector);
                for (const element of elements) {
                    const text = element.textContent || element.innerText || '';
                    const cleanedTitle = this.cleanTitle(text);
                    if (cleanedTitle.length > 3 && !this.isJunkTitle(cleanedTitle)) {
                        this.log(`🎯 Название найдено в DOM: "${cleanedTitle}"`, 'debug');
                        return cleanedTitle;
                    }
                }
            }

            // 3. Если не нашли, ищем в общих селекторах, но с фильтрацией
            for (const selector of TITLE_SELECTORS) {
                const elements = document.querySelectorAll(selector);
                for (const element of elements) {
                    const text = element.textContent || element.innerText || '';
                    const cleanedTitle = this.cleanTitle(text);
                    if (cleanedTitle.length > 5 && !this.isJunkTitle(cleanedTitle)) {
                        this.log(`🎯 Название найдено в DOM: "${cleanedTitle}"`, 'debug');
                        return cleanedTitle;
                    }
                }
            }
            return null;
        }

        /**
         * Проверка, является ли название мусорным
         */
        isJunkTitle(title) {
            if (!title) return true;
            
            const junkPatterns = [
                /^\d+[\.\s]*$/, // Только цифры
                /^[\d\.\s]+[КMГТПгмкт]/i, // Цифры с размерными единицами
                /^\d{4}$/, // Только год
                /^(HD|4K|1080p|720p)/i, // Качество видео
                /приручить.*дракон/i, // Исключаем "Как приручить дракона" - это не аниме
                /^.{1,3}$/, // Слишком короткие
                /^\d+[\.\s]*K[\.\s]*/i, // Размеры файлов типа "8.14K"
                /^(загрузка|loading|menu|меню)/i, // Системные элементы
                /^(главная|home|settings|настройки)/i // Интерфейсные элементы
            ];

            return junkPatterns.some(pattern => pattern.test(title));
        }

        /**
         * Извлечение информации об эпизоде из события сериала
         */
        extractEpisodeFromSeriesEvent(event) {
            if (!event) return;

            const data = event.data || event.object || event.item || event;
            
            // Поля для поиска номера эпизода
            const episodeFields = [
                'episode', 'episode_number', 'episodeNumber', 'ep', 'number',
                'index', 'position', 'current_episode', 'selected_episode'
            ];

            for (const field of episodeFields) {
                if (data[field] !== undefined && data[field] !== null) {
                    const num = parseInt(data[field]);
                    if (!isNaN(num) && num > 0) {
                        this.log(`✅ Эпизод из события сериала (${field}): ${num}`, 'debug');
                        this.currentEpisode = num;
                        return;
                    }
                }
            }

            // Ищем в дополнительных местах
            if (data.movie || data.item) {
                const movieData = data.movie || data.item;
                this.extractEpisodeFromSeriesEvent({data: movieData});
            }
        }

        /**
         * Генерация хэша контента для отслеживания изменений
         */
        generateContentHash(title, season, episode) {
            return `${title || 'null'}_s${season || 'null'}_e${episode || 'null'}`;
        }

        /**
         * Универсальный мониторинг активности
         */
        startUniversalActivityMonitoring() {
            this.log('🚀 Запуск универсального мониторинга активности...', 'info');
            
            // Проверяем каждые 2 секунды
            setInterval(() => {
                try {
                    const currentActivity = this.getCurrentActivityName();
                    if (currentActivity !== this.lastActivityCheck) {
                        this.log(`🔄 Смена активности: ${this.lastActivityCheck} -> ${currentActivity}`, 'debug');
                        this.lastActivityCheck = currentActivity;
                        
                        // Если активность связана с плеером, перепроверяем контент
                        if (currentActivity && (currentActivity.includes('player') || currentActivity.includes('video'))) {
                            setTimeout(() => this.universalContentRecheck(), 1000);
                        }
                    }
                } catch (error) {
                    // Игнорируем ошибки мониторинга
                }
            }, 2000);
        }

        /**
         * Получение имени текущей активности
         */
        getCurrentActivityName() {
            try {
                if (Lampa.Activity && Lampa.Activity.active()) {
                    const activity = Lampa.Activity.active();
                    return activity.activity?.name || activity.name || 'unknown';
                }
            } catch (error) {
                // Игнорируем ошибки
            }
            return null;
        }

        /**
         * Универсальная загрузка данных о пропусках
         */
        async loadUniversalSkipData(title) {
            if (!title) return;

            this.log(`🔍 Загрузка данных пропусков для: "${title}"`, 'info');

            // 1. Проверяем кэш
            const cacheKey = `${CONFIG.cache.prefix}${title}`;
            if (this.settings.cacheEnabled && this.cache.has(cacheKey)) {
                const cached = this.cache.get(cacheKey);
                if (Date.now() - cached.timestamp < CONFIG.cache.expiry) {
                    this.log('📦 Данные загружены из кэша', 'debug');
                    this.skipData = cached.data;
                    return;
                }
            }

            // 2. Пробуем загрузить из API
            try {
                const skipData = await this.fetchFromMultipleAPIs(title);
                if (skipData) {
                    this.skipData = skipData;
                    
                    // Сохраняем в кэш
                    if (this.settings.cacheEnabled) {
                        this.cache.set(cacheKey, {
                            data: skipData,
                            timestamp: Date.now()
                        });
                    }
                    
                    this.log(`✅ Данные пропусков загружены для "${title}"`, 'success');
                    return;
                }
            } catch (error) {
                this.log(`⚠️ Ошибка загрузки из API: ${error.message}`, 'warning');
            }

            // 3. Используем встроенные данные
            this.skipData = this.getBuiltInSkipData(title);
            if (this.skipData) {
                this.log('📚 Используются встроенные данные о пропусках', 'info');
            } else {
                this.log('❌ Данные о пропусках не найдены', 'warning');
            }
        }

        /**
         * Запрос к нескольким API (отключено из-за CORS)
         */
        async fetchFromMultipleAPIs(title) {
            // API запросы отключены из-за CORS ограничений
            // Используем только встроенные данные
            this.log('⚠️ API запросы пропущены из-за CORS ограничений', 'warning');
            return null;
        }

        /**
         * Запрос к API
         */
        async fetchFromAPI(endpoint, title) {
            const searchUrl = `${endpoint}title/search?search=${encodeURIComponent(title)}`;
            
            const response = await fetch(searchUrl, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'AnilibriaAutoSkip/2.0.0'
                },
                timeout: CONFIG.api.timeout
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            
            // Парсим ответ в зависимости от структуры API
            if (data.data && Array.isArray(data.data)) {
                return this.parseAPIResponse(data.data);
            } else if (Array.isArray(data)) {
                return this.parseAPIResponse(data);
            }

            return null;
        }

        /**
         * Парсинг ответа API
         */
        parseAPIResponse(apiData) {
            if (!apiData || !Array.isArray(apiData) || apiData.length === 0) {
                return null;
            }

            const anime = apiData[0]; // Берём первый результат
            
            // Извлекаем данные о пропусках из различных полей
            const skipData = {
                opening: this.extractSkipTimes(anime, 'opening'),
                ending: this.extractSkipTimes(anime, 'ending'),
                episodes: {}
            };

            // Обрабатываем эпизоды если есть
            if (anime.episodes && Array.isArray(anime.episodes)) {
                anime.episodes.forEach((episode, index) => {
                    const episodeNum = episode.episode || index + 1;
                    skipData.episodes[episodeNum] = {
                        opening: this.extractSkipTimes(episode, 'opening'),
                        ending: this.extractSkipTimes(episode, 'ending')
                    };
                });
            }

            return skipData;
        }

        /**
         * Извлечение времени пропусков
         */
        extractSkipTimes(data, type) {
            if (!data) return null;

            const fields = [
                `${type}_start`, `${type}_end`,
                `${type}Start`, `${type}End`,
                `skip_${type}_start`, `skip_${type}_end`
            ];

            const times = {};
            for (const field of fields) {
                if (data[field] !== undefined) {
                    if (field.includes('start')) {
                        times.start = parseFloat(data[field]);
                    } else if (field.includes('end')) {
                        times.end = parseFloat(data[field]);
                    }
                }
            }

            if (times.start !== undefined && times.end !== undefined) {
                return times;
            }

            return null;
        }

        /**
         * Встроенные данные о пропусках для популярных аниме
         */
        getBuiltInSkipData(title) {
            const builtInData = {
                'магия и мускулы': {
                    opening: { start: 95, end: 185 },
                    ending: { start: 1320, end: 1440 },
                    episodes: {
                        1: { opening: { start: 0, end: 90 }, ending: { start: 1320, end: 1440 } },
                        2: { opening: { start: 95, end: 185 }, ending: { start: 1310, end: 1430 } }
                    }
                },
                'восхождение героя щита': {
                    opening: { start: 90, end: 180 },
                    ending: { start: 1300, end: 1420 },
                    episodes: {
                        1: { opening: { start: 0, end: 90 }, ending: { start: 1300, end: 1420 } },
                        2: { opening: { start: 90, end: 180 }, ending: { start: 1290, end: 1410 } },
                        3: { opening: { start: 90, end: 180 }, ending: { start: 1300, end: 1420 } }
                    }
                },
                'tate no yuusha no nariagari': {
                    opening: { start: 90, end: 180 },
                    ending: { start: 1300, end: 1420 }
                },
                'the rising of the shield hero': {
                    opening: { start: 90, end: 180 },
                    ending: { start: 1300, end: 1420 }
                },
                'клинок рассекающий демонов': {
                    opening: { start: 85, end: 175 },
                    ending: { start: 1290, end: 1410 }
                },
                'атака титанов': {
                    opening: { start: 95, end: 185 },
                    ending: { start: 1320, end: 1440 }
                },
                'моя геройская академия': {
                    opening: { start: 100, end: 190 },
                    ending: { start: 1300, end: 1420 }
                }
            };

            const normalizedTitle = title.toLowerCase();
            
            // Точное совпадение
            if (builtInData[normalizedTitle]) {
                return builtInData[normalizedTitle];
            }

            // Частичное совпадение по ключевым словам
            const titleKeywords = {
                'восхождение героя щита': ['щит', 'hero', 'shield', 'tate', 'yuusha', 'nariagari', 'rising'],
                'магия и мускулы': ['магия', 'мускул', 'magic', 'muscle', 'mashle'],
                'клинок рассекающий демонов': ['клинок', 'демон', 'kimetsu', 'yaiba', 'demon', 'slayer'],
                'атака титанов': ['титан', 'shingeki', 'kyojin', 'attack', 'titan'],
                'моя геройская академия': ['герой', 'академия', 'boku', 'hero', 'academia']
            };

            for (const [animeTitle, keywords] of Object.entries(titleKeywords)) {
                for (const keyword of keywords) {
                    if (normalizedTitle.includes(keyword.toLowerCase())) {
                        this.log(`✅ Найдено совпадение по ключевому слову "${keyword}": "${normalizedTitle}" -> "${animeTitle}"`, 'info');
                        return builtInData[animeTitle];
                    }
                }
            }

            // Обычное частичное совпадение
            for (const [key, data] of Object.entries(builtInData)) {
                if (normalizedTitle.includes(key) || key.includes(normalizedTitle)) {
                    this.log(`✅ Найдено частичное совпадение: "${normalizedTitle}" -> "${key}"`, 'debug');
                    return data;
                }
            }

            return null;
        }

        /**
         * Запуск мониторинга автопропуска
         */
        startUniversalAutoSkipMonitoring() {
            if (!this.settings.autoSkipEnabled || !this.skipData) return;

            this.log('▶️ Запуск универсального мониторинга автопропуска', 'debug');

            if (this.timelineCheckInterval) {
                clearInterval(this.timelineCheckInterval);
            }

            this.timelineCheckInterval = setInterval(() => {
                this.checkUniversalSkipConditions();
            }, CONFIG.skip.checkInterval);
        }

        /**
         * Проверка условий для пропуска
         */
        checkUniversalSkipConditions() {
            try {
                const videoElement = this.findActiveVideoElement();
                if (!videoElement || videoElement.paused) return;

                const currentTime = videoElement.currentTime;
                if (!currentTime || currentTime < 1) return;

                const skipInfo = this.getSkipInfoForCurrentEpisode();
                if (!skipInfo) return;

                // Проверяем заставку
                if (skipInfo.opening && this.shouldSkip(currentTime, skipInfo.opening)) {
                    this.performSkip(videoElement, skipInfo.opening.end, 'заставку');
                }

                // Проверяем титры
                if (skipInfo.ending && this.shouldSkip(currentTime, skipInfo.ending)) {
                    this.performSkip(videoElement, skipInfo.ending.end, 'титры');
                }

            } catch (error) {
                this.log(`❌ Ошибка проверки пропуска: ${error.message}`, 'error');
            }
        }

        /**
         * Поиск активного видео элемента
         */
        findActiveVideoElement() {
            // Сначала проверяем сохранённый элемент
            if (this.currentVideoElement && !this.currentVideoElement.paused) {
                return this.currentVideoElement;
            }

            // Ищем все видео элементы
            const videos = document.querySelectorAll('video');
            for (const video of videos) {
                if (video.readyState >= 2 && video.duration > 0) { // HAVE_CURRENT_DATA
                    this.currentVideoElement = video;
                    return video;
                }
            }

            return null;
        }

        /**
         * Получение информации о пропуске для текущего эпизода
         */
        getSkipInfoForCurrentEpisode() {
            if (!this.skipData) return null;

            // Сначала ищем специфичные данные для эпизода
            if (this.currentEpisode && this.skipData.episodes && this.skipData.episodes[this.currentEpisode]) {
                return this.skipData.episodes[this.currentEpisode];
            }

            // Используем общие данные
            return {
                opening: this.skipData.opening,
                ending: this.skipData.ending
            };
        }

        /**
         * Проверка, нужно ли пропускать
         */
        shouldSkip(currentTime, skipInterval) {
            if (!skipInterval || !skipInterval.start || !skipInterval.end) return false;
            
            const now = Date.now();
            if (now - this.lastSkipTime < 5000) return false; // Защита от частых пропусков

            return currentTime >= skipInterval.start && currentTime <= skipInterval.end;
        }

        /**
         * Выполнение пропуска
         */
        performSkip(videoElement, skipToTime, type) {
            try {
                this.log(`⏭️ Пропускаем ${type} -> ${skipToTime}с`, 'info');
                
                videoElement.currentTime = skipToTime;
                this.lastSkipTime = Date.now();

                if (this.settings.showNotifications) {
                    this.showSkipNotification('info', `⏭️ Пропущена ${type}`, 2000);
                }
                
            } catch (error) {
                this.log(`❌ Ошибка пропуска: ${error.message}`, 'error');
            }
        }

        /**
         * Загрузка локальной базы названий
         */
        loadLocalTitleDatabase() {
            try {
                const stored = Lampa.Storage.get(`${CONFIG.id}_title_db`);
                if (stored) {
                    this.titleDatabase = new Map(Object.entries(stored));
                    this.log(`📚 Загружена локальная база: ${this.titleDatabase.size} названий`, 'debug');
                }
            } catch (error) {
                this.log(`⚠️ Ошибка загрузки локальной базы: ${error.message}`, 'warning');
            }
        }

        /**
         * Обработчики событий плеера
         */
        onPlayerStart() {
            this.log('🎬 Плеер запущен', 'debug');
            setTimeout(() => this.universalContentRecheck(), 1000);
        }

        onTimeUpdate(currentTime) {
            // Периодически проверяем изменения контента во время воспроизведения
            if (Math.floor(currentTime) % 30 === 0) { // Каждые 30 секунд
                this.universalContentRecheck();
            }
        }

        onPlayerEnd() {
            this.log('🛑 Плеер остановлен', 'debug');
            if (this.timelineCheckInterval) {
                clearInterval(this.timelineCheckInterval);
                this.timelineCheckInterval = null;
            }
        }

        /**
         * Расширенная диагностика
         */
        performExtendedDiagnostics() {
            this.log('🔍 === РАСШИРЕННАЯ ДИАГНОСТИКА v2.0.0 ===', 'info');
            this.log(`🔍 Lampa доступна: ${typeof Lampa !== 'undefined'}`, 'info');
            this.log(`🔍 Lampa.Player доступен: ${!!(Lampa && Lampa.Player)}`, 'info');
            this.log(`🔍 Lampa.Activity доступен: ${!!(Lampa && Lampa.Activity)}`, 'info');
            this.log(`🔍 Lampa.Listener доступен: ${!!(Lampa && Lampa.Listener)}`, 'info');
            this.log(`🔍 Универсальный режим: ${this.settings.universalMode}`, 'info');
            
            const currentActivity = this.getCurrentActivityName();
            this.log(`🔍 Текущая активность: ${currentActivity || 'нет'}`, 'info');
            
            const videoElements = document.querySelectorAll('video');
            this.log(`🔍 Найдено video элементов: ${videoElements.length}`, 'info');
            
            const episodeElements = EPISODE_SELECTORS.map(selector => 
                document.querySelectorAll(selector).length
            ).reduce((a, b) => a + b, 0);
            this.log(`🔍 Найдено элементов эпизодов: ${episodeElements}`, 'info');
            
            this.log('🔍 === КОНЕЦ ДИАГНОСТИКИ ===', 'info');
        }

        /**
         * Показ уведомлений
         */
        showSkipNotification(type, message, duration = CONFIG.skip.notificationDuration) {
            if (!this.settings.showNotifications) return;

            try {
                if (Lampa.Noty) {
                    Lampa.Noty.show(message, {
                        type: type,
                        timeout: duration
                    });
                } else {
                    console.log(`[AnilibriaAutoSkip] ${message}`);
                }
            } catch (error) {
                console.log(`[AnilibriaAutoSkip] ${message}`);
            }
        }

        /**
         * Система логирования
         */
        log(message, level = 'info') {
            if (!this.settings.debugEnabled && level === 'debug') return;

            const timestamp = new Date().toLocaleTimeString();
            const icons = {
                debug: '🔍',
                info: 'ℹ️',
                warning: '⚠️',
                error: '❌',
                success: '✅'
            };

            const fullMessage = `[AnilibriaAutoSkip] ${timestamp} ${icons[level] || 'ℹ️'} ${message}`;
            
            switch(level) {
                case 'error':
                    console.error(fullMessage);
                    break;
                case 'warning':
                    console.warn(fullMessage);
                    break;
                default:
                    console.log(fullMessage);
            }
        }
    }

    // Инициализация плагина
    try {
        const plugin = new AnilibriaAutoSkipPlugin();
        
        // Добавляем плагин в глобальную область для отладки
        window.AnilibriaAutoSkipPlugin = plugin;
        
    } catch (error) {
        console.error('[AnilibriaAutoSkip] Критическая ошибка инициализации:', error);
    }

})();
