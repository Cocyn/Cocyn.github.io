(function () {
    const PLUGIN_ID = 'autosync';
    const PLUGIN_NAME = 'AutoSync ViewTracker';

    const SHIKI_CLIENT_ID = 'your_client_id'; // Заменить на свой, если получаешь токен через OAuth
    const STORAGE_KEY = `${PLUGIN_ID}_config`;

    let config = Lampa.Storage.get(STORAGE_KEY, {});

    const log = (...args) => console.log(`[%c${PLUGIN_NAME}%c]`, 'color: #2196f3', '', ...args);

    function saveConfig() {
        Lampa.Storage.set(STORAGE_KEY, config);
    }

    function authBlock() {
        let html = $('<div class="settings-param selector" style="margin: 1em 0">Авторизация Shikimori (вставь токен)</div>');
        html.on('hover:enter', () => {
            Lampa.Input.show('Shikimori Token', config.shikimori_token || '', (val) => {
                config.shikimori_token = val;
                saveConfig();
                log('Shikimori токен сохранён');
            });
        });

        let kphtml = $('<div class="settings-param selector" style="margin: 1em 0">KinoPub Token (kp_remember_token)</div>');
        kphtml.on('hover:enter', () => {
            Lampa.Input.show('KinoPub Token', config.kinopub_token || '', (val) => {
                config.kinopub_token = val;
                saveConfig();
                log('KinoPub токен сохранён');
            });
        });

        return [html, kphtml];
    }

    function sendToShikimori(title, episode) {
        if (!config.shikimori_token) return;

        fetch(`https://shikimori.one/api/animes?search=${encodeURIComponent(title)}`)
            .then(r => r.json())
            .then(animes => {
                if (animes.length === 0) return;
                const animeId = animes[0].id;

                fetch(`https://shikimori.one/api/v2/user_rates`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${config.shikimori_token}`,
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    body: JSON.stringify({
                        user_rate: {
                            anime_id: animeId,
                            status: 'watching',
                            episodes: episode || 1
                        }
                    })
                })
                .then(res => res.json())
                .then(data => log('Shikimori обновлён:', data))
                .catch(err => log('Ошибка Shikimori:', err));
            });
    }

    function sendToKinoPub(title) {
        if (!config.kinopub_token) return;

        fetch(`https://api.service-kp.com/v1/history/add`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${config.kinopub_token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                title: title,
                progress: 100
            })
        })
        .then(res => res.json())
        .then(data => log('KinoPub просмотр добавлен:', data))
        .catch(err => log('Ошибка KinoPub:', err));
    }

    function handlePlaybackEnd() {
        const current = Lampa.Player.video();
        if (!current) return;

        const title = current.title || current.original_title || '';
        const episode = current.episode;

        log('Отслежено завершение просмотра:', title, episode);

        if (title.toLowerCase().includes('аниме')) {
            sendToShikimori(title, episode);
        } else {
            sendToKinoPub(title);
        }
    }

    function initSettings() {
        Lampa.Settings.listener.follow('open', function (e) {
            if (e.name === 'plugins') {
                authBlock().forEach(el => {
                    Lampa.Settings.main().append(el);
                });
            }
        });
    }

    function startPlugin() {
        log('Запуск плагина...');
        initSettings();
        Lampa.Player.listener.follow('ended', handlePlaybackEnd);
    }

    Lampa.Plugins.register(PLUGIN_ID, {
        title: PLUGIN_NAME,
        version: '1.0.0',
        description: 'Автоматическая синхронизация просмотров с Shikimori и KinoPub',
        author: 'pon4e / ChatGPT',
    });

    startPlugin();
})();
