// Проверяем поддержку axios или используем fetch
const useAxios = typeof axios !== 'undefined';

// API ключи для KinopoiskDev и Anilibria
let kinopoiskApiKey = 'C0JDGQR-QN7MQ1Z-P5YDSXB-WWZ0DPT';
let anilibriaApiKey = 'eyJpdiI6IitHZWZmcDhXcEsvREVpbzliYUtkeWc9PSIsInZhbHVlIjoiYzBScjJXcUZZcGhPRFpPVkVzTEdHL3pZZDhZTVB6b1ZacGcxVEJQT3BrQjBRZzJOY1Nwc2RiTDdNMm4yb2dWeSIsIm1hYyI6ImY4YWQ2N2UzMTE2ZmM2NGY0ZjljNTEwMmE2MGQzODA0Y2M2MTQxODA2ZGUxYmNhNjNlZGNjZmZkNDY3YzdkODciLCJ0YWciOiIifQ==';

// Функция для запроса метаданных из KinopoiskDev
async function getAnimeId(title, year) {
    const url = `https://kinopoisk.dev/api/v2.1/films/search?query=${encodeURIComponent(title)}&year=${year}`;
    try {
        const response = useAxios ? await axios.get(url, { headers: { 'X-API-KEY': kinopoiskApiKey } }) : await fetch(url, { headers: { 'X-API-KEY': kinopoiskApiKey } });
        const data = await response.json();
        if (data && data.films && data.films.length > 0) {
            return data.films[0].kinopoisk_id;
        }
    } catch (error) {
        console.error('Ошибка получения ID аниме:', error);
    }
    return null;
}

// Функция для получения таймингов интро из Anilibria
async function getIntroTimings(animeId, season, episode) {
    const url = `https://api.anilibria.tv/v3/intro/${animeId}?season=${season}&episode=${episode}`;
    try {
        const response = useAxios ? await axios.get(url, { headers: { 'Authorization': `Bearer ${anilibriaApiKey}` } }) : await fetch(url, { headers: { 'Authorization': `Bearer ${anilibriaApiKey}` } });
        const data = await response.json();
        if (data && data.intro_start !== undefined && data.intro_end !== undefined) {
            return { start: data.intro_start, end: data.intro_end };
        }
    } catch (error) {
        console.error('Ошибка получения таймингов интро:', error);
    }
    return null;
}

// Функция для автоматической перемотки видео в Lampa
function skipIntro(introEndTime) {
    const player = document.querySelector('.lampa-player'); // Селектор для плеера в Lampa
    if (player) {
        player.currentTime = introEndTime; // Перематываем на конец интро
    }
}

// Получение метаданных видео из Lampa
function getVideoMetadata() {
    // Пример получения метаданных, они могут быть разными в зависимости от плеера
    const title = document.title; // Название аниме
    const year = 2023; // Год из метаданных, здесь просто пример
    const season = 1; // Сезон
    const episode = 1; // Эпизод
    return { title, year, season, episode };
}

// Основная логика плагина
async function main() {
    const { title, year, season, episode } = getVideoMetadata();
    const animeId = await getAnimeId(title, year);
    if (animeId) {
        const timings = await getIntroTimings(animeId, season, episode);
        if (timings) {
            // Автоматически пропускаем интро
            skipIntro(timings.end);
        } else {
            // Тайминги отсутствуют, отображаем кнопку для ручной настройки
            const button = document.createElement('button');
            button.textContent = 'Отметить конец интро';
            button.onclick = () => {
                const endTime = prompt('Введите время окончания интро в секундах');
                if (endTime) {
                    skipIntro(parseFloat(endTime));
                }
            };
            document.body.appendChild(button);
        }
    }
}

// Инициализация плагина при загрузке страницы
window.addEventListener('load', main);
