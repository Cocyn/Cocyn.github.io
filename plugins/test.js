function setupKinopubAccountSettings() {
    Lampa.SettingsApi.update()['kinopub'] = [];

    if (!isUserAuthenticated()) {
        Lampa.SettingsApi.addParam({
            component: 'kinopub',
            param: {
                name: 'account',
                type: 'input'
            },
            field: {
                name: 'Вход в аккаунт Kinopub',
                description: 'Введите логин и пароль для тестового входа в Kinopub (имитация)'
            },
            onRender: function(element) {
                element.append('Введите тестовые данные (например, login: test, password: 123) и нажмите сохранить.');
            },
            onChange: function(value) {
                // Имитация авторизации
                Lampa.Storage.set('kinopub_account', { username: 'test', email: 'test@example.com', expiry: Date.now() / 1000 + 3600 });
                Lampa.Noty.show({ text: 'Тестовая авторизация в Kinopub успешна!' });
                Lampa.Settings.update();
            }
        });
    } else {
        var userData = getUserData();
        Lampa.SettingsApi.addParam({
            component: 'kinopub',
            param: {
                name: 'account',
                type: 'static'
            },
            field: {
                name: 'Вы вошли как ' + (userData.username ? '@' + userData.username : userData.email),
                description: 'Нажмите для тестового выхода'
            }
        });
        Lampa.SettingsApi.addParam({
            component: 'kinopub',
            param: {
                name: 'account_status',
                type: 'static'
            },
            field: {
                name: 'Статус подписки',
                description: 'Тестовая подписка активна до ' + formatTime(userData.expiry)
            },
            onRender: function(element) {
                element.find('.settings-param__descr').text('Тестовая подписка активна до ' + formatTime(userData.expiry));
            }
        });
        Lampa.SettingsApi.addParam({
            component: 'kinopub',
            param: {
                name: 'account_exit',
                type: 'input'
            },
            field: {
                name: 'Выйти из аккаунта'
            },
            onChange: function() {
                Lampa.Storage.set('kinopub_account', {});
                Lampa.Noty.show({ text: 'Тестовый выход из аккаунта Kinopub успешен!' });
                Lampa.Settings.update();
            }
        });
    }
}

// Вспомогательные функции (заглушки для теста)
function isUserAuthenticated() { return !!Lampa.Storage.get('kinopub_account'); }
function getUserData() { return Lampa.Storage.get('kinopub_account') || {}; }
function hasPremium() { return getUserData().expiry > Date.now() / 1000; }
function formatTime(seconds) { 
    var date = new Date(seconds * 1000);
    return date.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

setupKinopubAccountSettings();
