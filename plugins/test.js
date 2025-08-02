// Ждём, пока Lampa будет готова
document.addEventListener('DOMContentLoaded', function() {
    // Проверяем, доступен ли Lampa
    if (typeof Lampa === 'undefined') {
        console.error('Lampa не загружено. Код не может быть выполнен.');
        return;
    }

    function setupKinopubAccountSettings() {
        // Инициализация компонента kinopub
        if (!Lampa.Component.get('kinopub')) {
            Lampa.Component.add('kinopub', {});
        }

        // Проверка авторизации
        function isUserAuthenticated() { return !!Lampa.Storage.get('kinopub_account'); }
        function getUserData() { return Lampa.Storage.get('kinopub_account') || {}; }
        function hasPremium() { return getUserData().expiry > Date.now() / 1000; }
        function formatTime(seconds) { 
            var date = new Date(seconds * 1000);
            return date.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        }

        // Удаляем существующие параметры, если они есть
        Lampa.Settings.main().remove('.settings-kinopub');

        if (!isUserAuthenticated()) {
            Lampa.Settings.main().append('<div class="settings-kinopub">');
            Lampa.Settings.param({
                component: 'kinopub',
                name: 'account',
                type: 'input',
                field: {
                    name: 'Вход в аккаунт Kinopub',
                    description: 'Введите тестовые данные (например, login: test, password: 123) и нажмите сохранить (имитация)'
                },
                onRender: function(element) {
                    element.append('<div>Введите тестовые данные и сохраните для имитации авторизации.</div>');
                },
                onChange: function(value) {
                    Lampa.Storage.set('kinopub_account', { username: 'test', email: 'test@example.com', expiry: Date.now() / 1000 + 3600 });
                    Lampa.Noty.show({ text: 'Тестовая авторизация в Kinopub успешна!' });
                    setupKinopubAccountSettings(); // Переинициализация для отображения нового статуса
                }
            });
            Lampa.Settings.main().append('</div>');
        } else {
            var userData = getUserData();
            Lampa.Settings.main().append('<div class="settings-kinopub">');
            Lampa.Settings.param({
                component: 'kinopub',
                name: 'account',
                type: 'static',
                field: {
                    name: 'Вы вошли как ' + (userData.username ? '@' + userData.username : userData.email),
                    description: 'Нажмите для тестового выхода'
                }
            });
            Lampa.Settings.param({
                component: 'kinopub',
                name: 'account_status',
                type: 'static',
                field: {
                    name: 'Статус подписки',
                    description: 'Тестовая подписка активна до ' + formatTime(userData.expiry)
                },
                onRender: function(element) {
                    element.find('.settings-param__descr').text('Тестовая подписка активна до ' + formatTime(userData.expiry));
                }
            });
            Lampa.Settings.param({
                component: 'kinopub',
                name: 'account_exit',
                type: 'input',
                field: {
                    name: 'Выйти из аккаунта'
                },
                onChange: function() {
                    Lampa.Storage.set('kinopub_account', {});
                    Lampa.Noty.show({ text: 'Тестовый выход из аккаунта Kinopub успешен!' });
                    setupKinopubAccountSettings(); // Переинициализация
                }
            });
            Lampa.Settings.main().append('</div>');
        }
    }

    // Запуск настройки
    setupKinopubAccountSettings();
});
