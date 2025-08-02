(function () {
    'use strict';

    // Инициализация плагина
    const PLUGIN_NAME = 'SyncPlugin';
    const STORAGE_PREFIX = 'sync_plugin_';
    const log = (...args) => console.log(`[${PLUGIN_NAME}]`, ...args);

    // Настройки по умолчанию
    const defaultSettings = {
        enabled: false,
        shikimoriToken: '',
        kinopubToken: '',
    };

    // Получение и сохранение настроек
    const getSetting = (key) => Lampa.Storage.get(`${STORAGE_PREFIX}${key}`, defaultSettings[key]);
    const setSetting = (key, value) => Lampa.Storage.set(`${STORAGE_PREFIX}${key}`, value);

    // API-конфигурация
    const SHIKIMORI_API = 'https://shikimori.one/api';
    const KINOPUB_API = 'https://api.kinopub.me/v1';

    // Слушатель окончания воспроизведения
    Lampa.Player.listener.follow('ended', (e) => {
        if (!getSetting('enabled')) return;
        const data = e.data;
        log('Playback ended:', data);

        const title = data.movie.title || data.movie.name;
        const isAnime = data.movie.type === 'anime';
        const episode = data.episode || 1;
        const season = data.season || 1;

        if (isAnime && getSetting('shikimoriToken')) {
            syncShikimori(title, episode);
        } else if (getSetting('kinopubToken')) {
            syncKinoPub(title, isAnime ? null : season, episode);
        }
    });

    // Синхронизация с Shikimori
    async function syncShikimori(title, episode) {
        try {
            log('Searching Shikimori for:', title);
            const searchResponse = await fetch(`${SHIKIMORI_API}/animes?search=${encodeURIComponent(title)}`, {
                headers: { 'Authorization': `Bearer ${getSetting('shikimoriToken')}` }
            });
            const animes = await searchResponse.json();
            if (!animes.length) throw new Error('Anime not found');

            const animeId = animes[0].id;
            log('Found anime ID:', animeId);

            const rateResponse = await fetch(`${SHIKIMORI_API}/v2/user_rates/${animeId}`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${getSetting('shikimoriToken')}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    user_rate: { episodes: episode, status: 'watching' }
                })
            });
            if (rateResponse.ok) {
                log('Shikimori updated successfully');
            } else {
                throw new Error('Failed to update Shikimori');
            }
        } catch (error) {
            log('Shikimori sync error:', error.message);
        }
    }

    // Синхронизация с KinoPub
    async function syncKinoPub(title, season, episode) {
        try {
            log('Sending to KinoPub:', title);
            const response = await fetch(`${KINOPUB_API}/history/add`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${getSetting('kinopubToken')}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    title,
                    season: season || undefined,
                    episode: episode || undefined
                })
            });
            if (response.ok) {
                log('KinoPub updated successfully');
            } else {
                throw new Error('Failed to update KinoPub');
            }
        } catch (error) {
            log('KinoPub sync error:', error.message);
        }
    }

    // Добавление настроек в интерфейс Lampa
    Lampa.Settings.add('plugins', {
        id: 'sync_plugin',
        name: 'Синхронизация просмотров',
        items: [
            {
                type: 'toggle',
                name: 'Включить синхронизацию',
                value: () => getSetting('enabled'),
                onChange: (value) => setSetting('enabled', value)
            },
            {
                type: 'input',
                name: 'Токен Shikimori',
                value: () => getSetting('shikimoriToken'),
                onChange: (value) => setSetting('shikimoriToken', value),
                placeholder: 'Введите access_token'
            },
            {
                type: 'input',
                name: 'Токен KinoPub',
                value: () => getSetting('kinopubToken'),
                onChange: (value) => setSetting('kinopubToken', value),
                placeholder: 'Введите kp_remember_token'
            },
            {
                type: 'button',
                name: 'Очистить токены',
                onClick: () => {
                    setSetting('shikimoriToken', '');
                    setSetting('kinopubToken', '');
                    Lampa.Settings.update();
                    log('Tokens cleared');
                }
            },
            {
                type: 'html',
                name: 'Инструкция',
                html: () => `
                    <div style="padding: 10px;">
                        <p>1. Shikimori: Используйте OAuth2 для получения токена.</p>
                        <p>2. KinoPub: Введите токен из cookies (kp_remember_token).</p>
                        <p>Логи доступны в консоли разработчика.</p>
                    </div>
                `
            }
        ]
    });

    log('Plugin initialized');
})();
