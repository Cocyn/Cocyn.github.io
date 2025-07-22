/**
 * Lampa Anime Intro Skip Plugin
 * Automatically skips anime intros using Anilibria and KinopoiskDev APIs
 * 
 * This plugin integrates with Lampa media player to:
 * - Detect anime content from current video metadata
 * - Fetch intro timing data from external APIs
 * - Automatically skip intros or allow manual marking
 * - Provide comprehensive settings management
 */

(function() {
    'use strict';

    // Plugin configuration
    const PLUGIN_NAME = 'intro_skip';
    const PLUGIN_VERSION = '1.0.0';
    
    // API endpoints
    const APIS = {
        KINOPOISK: 'https://api.kinopoisk.dev/v1.4',
        ANILIBRIA: 'https://anilibria.top/api/v1'
    };

    // Default settings
    const DEFAULT_SETTINGS = {
        enabled: true,
        kinopoisk_api_key: '',
        anilibria_api_key: '',
        timing_offset: 0,
        default_skip_time: 30,
        auto_skip: true,
        show_notifications: true
    };

    /**
     * Main plugin class
     */
    class IntroSkipPlugin {
        constructor() {
            this.settings = this.loadSettings();
            this.customTimings = this.loadCustomTimings();
            this.currentVideoData = null;
            this.skipButton = null;
            this.isProcessing = false;
            
            this.init();
        }

        /**
         * Initialize the plugin
         */
        init() {
            // Register plugin with Lampa
            this.registerPlugin();
            
            // Add settings to Lampa interface
            this.addSettingsInterface();
            
            // Hook into video events
            this.setupVideoEventListeners();
            
            this.log('Plugin initialized successfully');
        }

        /**
         * Register plugin with Lampa plugin system
         */
        registerPlugin() {
            if (typeof Lampa !== 'undefined' && Lampa.Plugins) {
                Lampa.Plugins.register(PLUGIN_NAME, {
                    name: 'Anime Intro Skip',
                    version: PLUGIN_VERSION,
                    description: 'Automatically skips anime intros using Anilibria and KinopoiskDev APIs',
                    author: 'IntroSkip Plugin Developer',
                    init: () => {
                        this.log('Plugin registered with Lampa');
                    }
                });
            }
        }

        /**
         * Add settings interface to Lampa settings
         */
        addSettingsInterface() {
            // Add to Lampa settings if available
            if (typeof Lampa !== 'undefined' && Lampa.Settings) {
                // Create settings section
                Lampa.Settings.listener.follow('open', (e) => {
                    if (e.name === 'main') {
                        this.createSettingsSection();
                    }
                });
            }
        }

        /**
         * Create settings section in Lampa interface
         */
        createSettingsSection() {
            try {
                const settingsContainer = document.querySelector('.settings-main');
                if (!settingsContainer) return;

                // Check if settings section already exists
                if (document.querySelector('.intro-skip-settings')) return;

                const settingsSection = document.createElement('div');
                settingsSection.className = 'intro-skip-settings settings-param';
                settingsSection.innerHTML = `
                    <div class="settings-param__name">Anime Intro Skip</div>
                    <div class="settings-param__value">
                        <div class="settings-param__descr">Configure intro skip settings</div>
                        <div class="intro-skip-controls">
                            <button class="intro-skip-btn" data-action="toggle-plugin">
                                Plugin: ${this.settings.enabled ? 'Enabled' : 'Disabled'}
                            </button>
                            <button class="intro-skip-btn" data-action="open-advanced">
                                Advanced Settings
                            </button>
                            <button class="intro-skip-btn" data-action="manage-timings">
                                Manage Custom Timings
                            </button>
                        </div>
                    </div>
                `;

                // Add event listeners
                settingsSection.addEventListener('click', (e) => {
                    const action = e.target.getAttribute('data-action');
                    this.handleSettingsAction(action);
                });

                settingsContainer.appendChild(settingsSection);

                // Add custom styles
                this.addCustomStyles();
            } catch (error) {
                this.handleError('Failed to create settings section', error);
            }
        }

        /**
         * Handle settings actions
         */
        handleSettingsAction(action) {
            switch (action) {
                case 'toggle-plugin':
                    this.togglePlugin();
                    break;
                case 'open-advanced':
                    this.openAdvancedSettings();
                    break;
                case 'manage-timings':
                    this.openTimingsManager();
                    break;
            }
        }

        /**
         * Toggle plugin enabled/disabled state
         */
        togglePlugin() {
            this.settings.enabled = !this.settings.enabled;
            this.saveSettings();
            
            const button = document.querySelector('[data-action="toggle-plugin"]');
            if (button) {
                button.textContent = `Plugin: ${this.settings.enabled ? 'Enabled' : 'Disabled'}`;
            }
            
            this.showNotification(
                `Plugin ${this.settings.enabled ? 'enabled' : 'disabled'}`,
                'info'
            );
        }

        /**
         * Open advanced settings modal
         */
        openAdvancedSettings() {
            const modal = this.createModal('Advanced Settings', `
                <div class="intro-skip-form">
                    <div class="form-group">
                        <label>KinopoiskDev API Key:</label>
                        <input type="text" id="kinopoisk-key" value="${this.settings.kinopoisk_api_key}" 
                               placeholder="Enter API key from kinopoisk.dev">
                    </div>
                    <div class="form-group">
                        <label>Anilibria API Key (optional):</label>
                        <input type="text" id="anilibria-key" value="${this.settings.anilibria_api_key}" 
                               placeholder="Enter Anilibria API key if required">
                    </div>
                    <div class="form-group">
                        <label>Timing Offset (seconds):</label>
                        <input type="number" id="timing-offset" value="${this.settings.timing_offset}" 
                               min="-30" max="30" step="1">
                        <small>Adjust timing by ±30 seconds for different sources</small>
                    </div>
                    <div class="form-group">
                        <label>Default Skip Time (seconds):</label>
                        <input type="number" id="default-skip" value="${this.settings.default_skip_time}" 
                               min="10" max="60" step="5">
                        <small>Used when no timing data is available</small>
                    </div>
                    <div class="form-group">
                        <label>
                            <input type="checkbox" id="auto-skip" ${this.settings.auto_skip ? 'checked' : ''}>
                            Auto-skip intros
                        </label>
                    </div>
                    <div class="form-group">
                        <label>
                            <input type="checkbox" id="show-notifications" ${this.settings.show_notifications ? 'checked' : ''}>
                            Show notifications
                        </label>
                    </div>
                    <div class="form-buttons">
                        <button class="btn-save">Save Settings</button>
                        <button class="btn-cancel">Cancel</button>
                    </div>
                </div>
            `);

            // Add save functionality
            modal.querySelector('.btn-save').addEventListener('click', () => {
                this.saveAdvancedSettings();
                this.closeModal(modal);
            });

            modal.querySelector('.btn-cancel').addEventListener('click', () => {
                this.closeModal(modal);
            });
        }

        /**
         * Save advanced settings
         */
        saveAdvancedSettings() {
            try {
                this.settings.kinopoisk_api_key = document.getElementById('kinopoisk-key').value.trim();
                this.settings.anilibria_api_key = document.getElementById('anilibria-key').value.trim();
                this.settings.timing_offset = parseInt(document.getElementById('timing-offset').value) || 0;
                this.settings.default_skip_time = parseInt(document.getElementById('default-skip').value) || 30;
                this.settings.auto_skip = document.getElementById('auto-skip').checked;
                this.settings.show_notifications = document.getElementById('show-notifications').checked;

                this.saveSettings();
                this.showNotification('Settings saved successfully', 'success');
            } catch (error) {
                this.handleError('Failed to save settings', error);
            }
        }

        /**
         * Open timings manager modal
         */
        openTimingsManager() {
            const timingsList = this.generateTimingsList();
            const modal = this.createModal('Manage Custom Timings', `
                <div class="timings-manager">
                    <div class="timings-list">
                        ${timingsList}
                    </div>
                    <div class="timings-actions">
                        <button class="btn-clear-all">Clear All Timings</button>
                        <button class="btn-close">Close</button>
                    </div>
                </div>
            `);

            // Add event listeners
            modal.querySelector('.btn-clear-all').addEventListener('click', () => {
                if (confirm('Are you sure you want to clear all custom timings?')) {
                    this.customTimings = {};
                    this.saveCustomTimings();
                    this.closeModal(modal);
                    this.showNotification('All custom timings cleared', 'info');
                }
            });

            modal.querySelector('.btn-close').addEventListener('click', () => {
                this.closeModal(modal);
            });

            // Add delete functionality for individual timings
            modal.querySelectorAll('.timing-delete').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const timingKey = e.target.getAttribute('data-key');
                    this.deleteCustomTiming(timingKey);
                    e.target.closest('.timing-item').remove();
                });
            });
        }

        /**
         * Generate HTML for custom timings list
         */
        generateTimingsList() {
            if (Object.keys(this.customTimings).length === 0) {
                return '<div class="no-timings">No custom timings saved</div>';
            }

            return Object.entries(this.customTimings).map(([key, timing]) => `
                <div class="timing-item">
                    <div class="timing-info">
                        <strong>${timing.title}</strong>
                        <div class="timing-details">
                            Season ${timing.season}, Episode ${timing.episode}
                            <br>Skip to: ${timing.end_time}s
                        </div>
                    </div>
                    <button class="timing-delete" data-key="${key}">Delete</button>
                </div>
            `).join('');
        }

        /**
         * Setup video event listeners
         */
        setupVideoEventListeners() {
            // Listen for Lampa video events
            if (typeof Lampa !== 'undefined' && Lampa.VideoPlayer) {
                // Hook into video start event
                Lampa.VideoPlayer.listener.follow('start', () => {
                    if (this.settings.enabled) {
                        this.onVideoStart();
                    }
                });

                // Hook into video time update
                Lampa.VideoPlayer.listener.follow('timeupdate', (e) => {
                    if (this.settings.enabled && e && e.currentTime) {
                        this.onVideoTimeUpdate(e.currentTime);
                    }
                });

                // Hook into video loaded event
                Lampa.VideoPlayer.listener.follow('loaded', () => {
                    if (this.settings.enabled) {
                        this.onVideoLoaded();
                    }
                });
            }
        }

        /**
         * Handle video start event
         */
        async onVideoStart() {
            try {
                // Get current video metadata from Lampa
                this.currentVideoData = this.getCurrentVideoData();
                
                if (!this.currentVideoData || !this.isAnimeContent()) {
                    return;
                }

                this.log('Anime detected, processing intro skip', this.currentVideoData);
                
                // Show manual skip button immediately
                this.showSkipButton();
                
                // Try to get automatic timing data
                await this.processIntroTiming();
                
            } catch (error) {
                this.handleError('Failed to process video start', error);
            }
        }

        /**
         * Handle video time update
         */
        onVideoTimeUpdate(currentTime) {
            // Handle automatic skipping logic here if needed
            if (this.currentVideoData && this.currentVideoData.introTiming) {
                const timing = this.currentVideoData.introTiming;
                if (currentTime >= timing.start && currentTime < timing.end && this.settings.auto_skip) {
                    this.skipToTime(timing.end + this.settings.timing_offset);
                }
            }
        }

        /**
         * Handle video loaded event
         */
        onVideoLoaded() {
            this.log('Video loaded, ready for intro skip processing');
        }

        /**
         * Get current video data from Lampa
         */
        getCurrentVideoData() {
            try {
                // Try to get data from Lampa's current video context
                if (typeof Lampa !== 'undefined' && Lampa.Activity && Lampa.Activity.active) {
                    const activity = Lampa.Activity.active();
                    if (activity && activity.card) {
                        const card = activity.card;
                        return {
                            title: card.title || card.name || '',
                            year: card.year || card.first_air_date ? new Date(card.first_air_date).getFullYear() : null,
                            season: this.getCurrentSeason(),
                            episode: this.getCurrentEpisode(),
                            id: card.id,
                            type: card.type || 'movie'
                        };
                    }
                }

                // Fallback: try to get from page title or other sources
                return this.parseVideoDataFromPage();
                
            } catch (error) {
                this.handleError('Failed to get current video data', error);
                return null;
            }
        }

        /**
         * Parse video data from page elements as fallback
         */
        parseVideoDataFromPage() {
            try {
                const titleElement = document.querySelector('.player-panel__title, .full-start__title, h1');
                const title = titleElement ? titleElement.textContent.trim() : '';
                
                // Try to extract season/episode from title or URL
                const seasonMatch = window.location.href.match(/season[\/=](\d+)/i) || title.match(/сезон\s*(\d+)|season\s*(\d+)/i);
                const episodeMatch = window.location.href.match(/episode[\/=](\d+)/i) || title.match(/серия\s*(\d+)|episode\s*(\d+)/i);
                
                return {
                    title: title.replace(/сезон\s*\d+.*$/i, '').replace(/season\s*\d+.*$/i, '').trim(),
                    year: null, // Will try to get from API
                    season: seasonMatch ? parseInt(seasonMatch[1]) : 1,
                    episode: episodeMatch ? parseInt(episodeMatch[1]) : 1,
                    type: 'tv'
                };
            } catch (error) {
                this.log('Failed to parse video data from page', error);
                return null;
            }
        }

        /**
         * Get current season number
         */
        getCurrentSeason() {
            try {
                // Try multiple methods to get season info
                const url = window.location.href;
                const seasonMatch = url.match(/season[\/=](\d+)/i);
                if (seasonMatch) return parseInt(seasonMatch[1]);

                // Check if Lampa has season info
                if (typeof Lampa !== 'undefined' && Lampa.Activity && Lampa.Activity.active) {
                    const activity = Lampa.Activity.active();
                    if (activity && activity.season) {
                        return activity.season;
                    }
                }

                return 1; // Default to season 1
            } catch (error) {
                return 1;
            }
        }

        /**
         * Get current episode number
         */
        getCurrentEpisode() {
            try {
                // Try multiple methods to get episode info
                const url = window.location.href;
                const episodeMatch = url.match(/episode[\/=](\d+)/i);
                if (episodeMatch) return parseInt(episodeMatch[1]);

                // Check if Lampa has episode info
                if (typeof Lampa !== 'undefined' && Lampa.Activity && Lampa.Activity.active) {
                    const activity = Lampa.Activity.active();
                    if (activity && activity.episode) {
                        return activity.episode;
                    }
                }

                return 1; // Default to episode 1
            } catch (error) {
                return 1;
            }
        }

        /**
         * Check if current content is anime
         */
        isAnimeContent() {
            if (!this.currentVideoData) return false;

            const title = this.currentVideoData.title.toLowerCase();
            const animeKeywords = ['anime', 'аниме', 'манга', 'manga'];
            
            // Check if title contains anime keywords
            const hasAnimeKeywords = animeKeywords.some(keyword => title.includes(keyword));
            
            // Additional checks can be added here (genre, source, etc.)
            return hasAnimeKeywords || this.currentVideoData.type === 'anime';
        }

        /**
         * Process intro timing - main logic for getting timing data
         */
        async processIntroTiming() {
            try {
                this.isProcessing = true;
                
                // First, check if we have custom timing saved locally
                const customTiming = this.getCustomTiming();
                if (customTiming) {
                    this.log('Using custom timing', customTiming);
                    this.currentVideoData.introTiming = customTiming;
                    this.updateSkipButton(customTiming.end);
                    return;
                }

                // Try to get timing from APIs
                const apiTiming = await this.getApiTiming();
                if (apiTiming) {
                    this.log('Using API timing', apiTiming);
                    this.currentVideoData.introTiming = apiTiming;
                    this.updateSkipButton(apiTiming.end);
                    return;
                }

                // No timing found, keep manual button
                this.log('No timing data found, using manual mode');
                
            } catch (error) {
                this.handleError('Failed to process intro timing', error);
            } finally {
                this.isProcessing = false;
            }
        }

        /**
         * Get timing data from APIs
         */
        async getApiTiming() {
            try {
                // Step 1: Get anime ID from KinopoiskDev
                const animeId = await this.getAnimeIdFromKinopoisk();
                if (!animeId) {
                    this.log('No anime ID found from Kinopoisk');
                    return null;
                }

                // Step 2: Get intro timing from Anilibria
                const timing = await this.getTimingFromAnilibria(animeId);
                if (timing) {
                    return timing;
                }

                return null;
                
            } catch (error) {
                this.log('Failed to get API timing', error);
                return null;
            }
        }

        /**
         * Get anime ID from KinopoiskDev API
         */
        async getAnimeIdFromKinopoisk() {
            try {
                if (!this.settings.kinopoisk_api_key) {
                    this.log('No Kinopoisk API key configured');
                    return null;
                }

                const searchParams = new URLSearchParams({
                    name: this.currentVideoData.title,
                    limit: 10
                });

                if (this.currentVideoData.year) {
                    searchParams.append('year', this.currentVideoData.year);
                }

                const response = await fetch(`${APIS.KINOPOISK}/anime?${searchParams}`, {
                    headers: {
                        'X-API-KEY': this.settings.kinopoisk_api_key,
                        'accept': 'application/json'
                    }
                });

                if (!response.ok) {
                    throw new Error(`Kinopoisk API error: ${response.status}`);
                }

                const data = await response.json();
                
                if (data.docs && data.docs.length > 0) {
                    // Find best match
                    const bestMatch = this.findBestAnimeMatch(data.docs);
                    return bestMatch ? bestMatch.id : null;
                }

                return null;

            } catch (error) {
                this.log('Kinopoisk API error', error);
                return null;
            }
        }

        /**
         * Find best matching anime from search results
         */
        findBestAnimeMatch(animeList) {
            if (!animeList || animeList.length === 0) return null;

            const targetTitle = this.currentVideoData.title.toLowerCase();
            const targetYear = this.currentVideoData.year;

            // Score each anime based on title similarity and year match
            let bestMatch = null;
            let bestScore = 0;

            for (const anime of animeList) {
                let score = 0;
                
                // Title similarity score
                const animeTitle = (anime.name || anime.title || '').toLowerCase();
                if (animeTitle === targetTitle) {
                    score += 100; // Exact match
                } else if (animeTitle.includes(targetTitle) || targetTitle.includes(animeTitle)) {
                    score += 50; // Partial match
                }

                // Year match score
                if (targetYear && anime.year === targetYear) {
                    score += 25;
                }

                // Type preference (prefer TV series for anime)
                if (anime.type === 'tv-series' || anime.type === 'anime') {
                    score += 10;
                }

                if (score > bestScore) {
                    bestScore = score;
                    bestMatch = anime;
                }
            }

            return bestScore > 0 ? bestMatch : animeList[0]; // Return best match or first result
        }

        /**
         * Get intro timing from Anilibria API
         */
        async getTimingFromAnilibria(animeId) {
            try {
                // Note: This is a hypothetical API call since Anilibria's exact timing API structure
                // may vary. Adjust according to actual API documentation.
                const url = `${APIS.ANILIBRIA}/anime/${animeId}/timing/${this.currentVideoData.season}/${this.currentVideoData.episode}`;
                
                const headers = {};
                if (this.settings.anilibria_api_key) {
                    headers['Authorization'] = `Bearer ${this.settings.anilibria_api_key}`;
                }

                const response = await fetch(url, { headers });

                if (!response.ok) {
                    if (response.status === 404) {
                        this.log('No timing data found for this episode');
                        return null;
                    }
                    throw new Error(`Anilibria API error: ${response.status}`);
                }

                const data = await response.json();
                
                if (data && typeof data.intro_start === 'number' && typeof data.intro_end === 'number') {
                    return {
                        start: data.intro_start,
                        end: data.intro_end,
                        source: 'anilibria'
                    };
                }

                return null;

            } catch (error) {
                this.log('Anilibria API error', error);
                return null;
            }
        }

        /**
         * Get custom timing from local storage
         */
        getCustomTiming() {
            const key = this.getTimingKey();
            return this.customTimings[key] || null;
        }

        /**
         * Generate timing key for current video
         */
        getTimingKey() {
            return `${this.currentVideoData.title}_S${this.currentVideoData.season}_E${this.currentVideoData.episode}`;
        }

        /**
         * Show skip button in video player
         */
        showSkipButton() {
            try {
                // Remove existing button
                this.removeSkipButton();

                // Create skip button
                this.skipButton = document.createElement('div');
                this.skipButton.className = 'intro-skip-button';
                this.skipButton.innerHTML = `
                    <button class="skip-btn">
                        <span class="skip-text">Skip Intro</span>
                        <span class="skip-time"></span>
                    </button>
                `;

                // Add styles
                this.skipButton.style.cssText = `
                    position: absolute;
                    bottom: 80px;
                    right: 20px;
                    z-index: 1000;
                    font-family: Arial, sans-serif;
                `;

                const button = this.skipButton.querySelector('.skip-btn');
                button.style.cssText = `
                    background: rgba(0, 0, 0, 0.8);
                    color: white;
                    border: 2px solid #fff;
                    padding: 10px 15px;
                    border-radius: 5px;
                    cursor: pointer;
                    font-size: 14px;
                    transition: all 0.3s ease;
                `;

                // Add hover effect
                button.addEventListener('mouseenter', () => {
                    button.style.background = 'rgba(255, 255, 255, 0.2)';
                });
                button.addEventListener('mouseleave', () => {
                    button.style.background = 'rgba(0, 0, 0, 0.8)';
                });

                // Add click handler
                button.addEventListener('click', () => {
                    this.handleSkipButtonClick();
                });

                // Find video container and append button
                const videoContainer = this.getVideoContainer();
                if (videoContainer) {
                    videoContainer.appendChild(this.skipButton);
                    this.log('Skip button added to video player');
                } else {
                    this.log('Could not find video container for skip button');
                }

            } catch (error) {
                this.handleError('Failed to show skip button', error);
            }
        }

        /**
         * Update skip button text with timing info
         */
        updateSkipButton(endTime) {
            if (this.skipButton) {
                const timeSpan = this.skipButton.querySelector('.skip-time');
                if (timeSpan) {
                    timeSpan.textContent = ` (${endTime}s)`;
                }
            }
        }

        /**
         * Remove skip button from video player
         */
        removeSkipButton() {
            if (this.skipButton && this.skipButton.parentNode) {
                this.skipButton.parentNode.removeChild(this.skipButton);
                this.skipButton = null;
            }
        }

        /**
         * Get video container element
         */
        getVideoContainer() {
            // Try multiple selectors to find video container
            const selectors = [
                '.video-player',
                '.player-container',
                '.lampa-player',
                '.video-container',
                'video',
                '.full-start__video'
            ];

            for (const selector of selectors) {
                const container = document.querySelector(selector);
                if (container) {
                    // If it's a video element, get its parent
                    return container.tagName.toLowerCase() === 'video' ? container.parentNode : container;
                }
            }

            return document.body; // Fallback to body
        }

        /**
         * Handle skip button click
         */
        handleSkipButtonClick() {
            try {
                let skipTime;

                if (this.currentVideoData && this.currentVideoData.introTiming) {
                    // Use API or custom timing
                    skipTime = this.currentVideoData.introTiming.end + this.settings.timing_offset;
                } else {
                    // Use default skip time or prompt user to mark intro end
                    this.promptForIntroEnd();
                    return;
                }

                this.skipToTime(skipTime);
                
            } catch (error) {
                this.handleError('Failed to handle skip button click', error);
            }
        }

        /**
         * Prompt user to mark intro end manually
         */
        promptForIntroEnd() {
            try {
                const currentTime = this.getCurrentVideoTime();
                
                const modal = this.createModal('Mark Intro End', `
                    <div class="intro-end-prompt">
                        <p>No timing data found for this episode.</p>
                        <p>Current time: <strong>${Math.round(currentTime)}s</strong></p>
                        <div class="prompt-actions">
                            <button class="btn-mark-end">Mark Current Time as Intro End</button>
                            <button class="btn-skip-default">Skip ${this.settings.default_skip_time}s</button>
                            <button class="btn-cancel">Cancel</button>
                        </div>
                    </div>
                `);

                // Add event listeners
                modal.querySelector('.btn-mark-end').addEventListener('click', () => {
                    this.markIntroEnd(currentTime);
                    this.closeModal(modal);
                });

                modal.querySelector('.btn-skip-default').addEventListener('click', () => {
                    this.skipToTime(currentTime + this.settings.default_skip_time);
                    this.closeModal(modal);
                });

                modal.querySelector('.btn-cancel').addEventListener('click', () => {
                    this.closeModal(modal);
                });

            } catch (error) {
                this.handleError('Failed to prompt for intro end', error);
            }
        }

        /**
         * Mark intro end time and save to custom timings
         */
        markIntroEnd(endTime) {
            try {
                const timing = {
                    title: this.currentVideoData.title,
                    season: this.currentVideoData.season,
                    episode: this.currentVideoData.episode,
                    start: 0,
                    end: Math.round(endTime),
                    source: 'manual'
                };

                // Save to custom timings
                const key = this.getTimingKey();
                this.customTimings[key] = timing;
                this.saveCustomTimings();

                // Update current video timing
                this.currentVideoData.introTiming = timing;

                // Skip to marked time
                this.skipToTime(endTime);

                this.showNotification('Intro end marked and saved', 'success');
                this.log('Manual intro timing saved', timing);

            } catch (error) {
                this.handleError('Failed to mark intro end', error);
            }
        }

        /**
         * Skip video to specified time
         */
        skipToTime(time) {
            try {
                // Try Lampa's video API
                if (typeof Lampa !== 'undefined' && Lampa.VideoPlayer) {
                    Lampa.VideoPlayer.seek(time);
                    this.showNotification(`Skipped to ${Math.round(time)}s`, 'info');
                    return;
                }

                // Fallback: try direct video element manipulation
                const videoElement = document.querySelector('video');
                if (videoElement) {
                    videoElement.currentTime = time;
                    this.showNotification(`Skipped to ${Math.round(time)}s`, 'info');
                    return;
                }

                throw new Error('No video player found');

            } catch (error) {
                this.handleError('Failed to skip video time', error);
            }
        }

        /**
         * Get current video time
         */
        getCurrentVideoTime() {
            try {
                // Try Lampa's video API
                if (typeof Lampa !== 'undefined' && Lampa.VideoPlayer) {
                    return Lampa.VideoPlayer.currentTime() || 0;
                }

                // Fallback: try direct video element
                const videoElement = document.querySelector('video');
                if (videoElement) {
                    return videoElement.currentTime;
                }

                return 0;

            } catch (error) {
                this.log('Failed to get current video time', error);
                return 0;
            }
        }

        /**
         * Create modal dialog
         */
        createModal(title, content) {
            const modal = document.createElement('div');
            modal.className = 'intro-skip-modal';
            modal.innerHTML = `
                <div class="modal-overlay">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h3>${title}</h3>
                            <button class="modal-close">&times;</button>
                        </div>
                        <div class="modal-body">
                            ${content}
                        </div>
                    </div>
                </div>
            `;

            // Add styles
            modal.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                z-index: 10000;
                font-family: Arial, sans-serif;
            `;

            // Close modal on overlay click or close button
            modal.querySelector('.modal-overlay').addEventListener('click', (e) => {
                if (e.target === modal.querySelector('.modal-overlay')) {
                    this.closeModal(modal);
                }
            });

            modal.querySelector('.modal-close').addEventListener('click', () => {
                this.closeModal(modal);
            });

            document.body.appendChild(modal);
            return modal;
        }

        /**
         * Close modal dialog
         */
        closeModal(modal) {
            if (modal && modal.parentNode) {
                modal.parentNode.removeChild(modal);
            }
        }

        /**
         * Delete custom timing
         */
        deleteCustomTiming(key) {
            delete this.customTimings[key];
            this.saveCustomTimings();
            this.showNotification('Custom timing deleted', 'info');
        }

        /**
         * Add custom styles to page
         */
        addCustomStyles() {
            if (document.querySelector('#intro-skip-styles')) return;

            const styles = document.createElement('style');
            styles.id = 'intro-skip-styles';
            styles.textContent = `
                .intro-skip-controls {
                    display: flex;
                    gap: 10px;
                    flex-wrap: wrap;
                    margin-top: 10px;
                }

                .intro-skip-btn {
                    background: #333;
                    color: white;
                    border: 1px solid #555;
                    padding: 8px 12px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 12px;
                    transition: background 0.3s;
                }

                .intro-skip-btn:hover {
                    background: #555;
                }

                .intro-skip-modal .modal-overlay {
                    background: rgba(0, 0, 0, 0.8);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                .intro-skip-modal .modal-content {
                    background: #2a2a2a;
                    color: white;
                    border-radius: 8px;
                    max-width: 500px;
                    width: 90%;
                    max-height: 80vh;
                    overflow-y: auto;
                }

                .intro-skip-modal .modal-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 15px 20px;
                    border-bottom: 1px solid #444;
                }

                .intro-skip-modal .modal-header h3 {
                    margin: 0;
                    font-size: 18px;
                }

                .intro-skip-modal .modal-close {
                    background: none;
                    border: none;
                    color: white;
                    font-size: 24px;
                    cursor: pointer;
                    padding: 0;
                    width: 30px;
                    height: 30px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }

                .intro-skip-modal .modal-body {
                    padding: 20px;
                }

                .intro-skip-form .form-group {
                    margin-bottom: 15px;
                }

                .intro-skip-form label {
                    display: block;
                    margin-bottom: 5px;
                    font-weight: bold;
                }

                .intro-skip-form input[type="text"],
                .intro-skip-form input[type="number"] {
                    width: 100%;
                    padding: 8px;
                    border: 1px solid #555;
                    border-radius: 4px;
                    background: #333;
                    color: white;
                }

                .intro-skip-form small {
                    display: block;
                    margin-top: 5px;
                    color: #aaa;
                    font-size: 11px;
                }

                .form-buttons {
                    display: flex;
                    gap: 10px;
                    justify-content: flex-end;
                    margin-top: 20px;
                }

                .btn-save, .btn-cancel, .btn-mark-end, .btn-skip-default, .btn-clear-all, .btn-close {
                    padding: 10px 15px;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 14px;
                }

                .btn-save, .btn-mark-end {
                    background: #007bff;
                    color: white;
                }

                .btn-cancel, .btn-close {
                    background: #6c757d;
                    color: white;
                }

                .btn-skip-default {
                    background: #28a745;
                    color: white;
                }

                .btn-clear-all {
                    background: #dc3545;
                    color: white;
                }

                .timing-item {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 10px;
                    border: 1px solid #444;
                    border-radius: 4px;
                    margin-bottom: 10px;
                }

                .timing-info {
                    flex: 1;
                }

                .timing-details {
                    font-size: 12px;
                    color: #aaa;
                    margin-top: 5px;
                }

                .timing-delete {
                    background: #dc3545;
                    color: white;
                    border: none;
                    padding: 5px 10px;
                    border-radius: 3px;
                    cursor: pointer;
                    font-size: 12px;
                }

                .no-timings {
                    text-align: center;
                    color: #aaa;
                    padding: 20px;
                }

                .intro-end-prompt {
                    text-align: center;
                }

                .prompt-actions {
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                    margin-top: 20px;
                }

                .timings-actions {
                    display: flex;
                    gap: 10px;
                    justify-content: flex-end;
                    margin-top: 20px;
                }
            `;

            document.head.appendChild(styles);
        }

        /**
         * Load settings from local storage
         */
        loadSettings() {
            try {
                const saved = localStorage.getItem(`${PLUGIN_NAME}_settings`);
                if (saved) {
                    return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
                }
                return { ...DEFAULT_SETTINGS };
            } catch (error) {
                this.log('Failed to load settings', error);
                return { ...DEFAULT_SETTINGS };
            }
        }

        /**
         * Save settings to local storage
         */
        saveSettings() {
            try {
                localStorage.setItem(`${PLUGIN_NAME}_settings`, JSON.stringify(this.settings));
                this.log('Settings saved');
            } catch (error) {
                this.handleError('Failed to save settings', error);
            }
        }

        /**
         * Load custom timings from local storage
         */
        loadCustomTimings() {
            try {
                const saved = localStorage.getItem(`${PLUGIN_NAME}_timings`);
                return saved ? JSON.parse(saved) : {};
            } catch (error) {
                this.log('Failed to load custom timings', error);
                return {};
            }
        }

        /**
         * Save custom timings to local storage
         */
        saveCustomTimings() {
            try {
                localStorage.setItem(`${PLUGIN_NAME}_timings`, JSON.stringify(this.customTimings));
                this.log('Custom timings saved');
            } catch (error) {
                this.handleError('Failed to save custom timings', error);
            }
        }

        /**
         * Show notification to user
         */
        showNotification(message, type = 'info') {
            if (!this.settings.show_notifications) return;

            try {
                // Try to use Lampa's notification system
                if (typeof Lampa !== 'undefined' && Lampa.Noty) {
                    Lampa.Noty({
                        title: 'Intro Skip',
                        descr: message,
                        type: type
                    });
                    return;
                }

                // Fallback: create custom notification
                this.createCustomNotification(message, type);

            } catch (error) {
                this.log('Failed to show notification', error);
            }
        }

        /**
         * Create custom notification (fallback)
         */
        createCustomNotification(message, type) {
            const notification = document.createElement('div');
            notification.className = 'intro-skip-notification';
            notification.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: ${type === 'success' ? '#28a745' : type === 'error' ? '#dc3545' : '#007bff'};
                color: white;
                padding: 15px;
                border-radius: 5px;
                z-index: 10000;
                max-width: 300px;
                font-family: Arial, sans-serif;
                font-size: 14px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.3);
                animation: slideInRight 0.3s ease-out;
            `;
            notification.textContent = message;

            // Add animation styles
            if (!document.querySelector('#intro-skip-animation-styles')) {
                const animationStyles = document.createElement('style');
                animationStyles.id = 'intro-skip-animation-styles';
                animationStyles.textContent = `
                    @keyframes slideInRight {
                        from { transform: translateX(100%); opacity: 0; }
                        to { transform: translateX(0); opacity: 1; }
                    }
                `;
                document.head.appendChild(animationStyles);
            }

            document.body.appendChild(notification);

            // Auto-remove after 3 seconds
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.style.animation = 'slideInRight 0.3s ease-out reverse';
                    setTimeout(() => {
                        if (notification.parentNode) {
                            notification.parentNode.removeChild(notification);
                        }
                    }, 300);
                }
            }, 3000);
        }

        /**
         * Handle errors with logging and user notification
         */
        handleError(message, error) {
            this.log(`ERROR: ${message}`, error);
            this.showNotification(`Error: ${message}`, 'error');
        }

        /**
         * Log messages (development helper)
         */
        log(message, data = null) {
            console.log(`[IntroSkip] ${message}`, data || '');
        }
    }

    // Initialize plugin when DOM is ready
    function initializePlugin() {
        try {
            // Check if Lampa is available
            if (typeof Lampa === 'undefined') {
                console.log('[IntroSkip] Waiting for Lampa to load...');
                setTimeout(initializePlugin, 1000);
                return;
            }

            // Initialize the plugin
            new IntroSkipPlugin();
            console.log('[IntroSkip] Plugin initialized successfully');

        } catch (error) {
            console.error('[IntroSkip] Failed to initialize plugin:', error);
        }
    }

    // Start initialization
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializePlugin);
    } else {
        initializePlugin();
    }

})();
