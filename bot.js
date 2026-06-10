const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const express = require('express');
require('dotenv').config();

// --- Настройка Express (чтобы Render не усыплял бота) ---
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('LinguaFast Bot is running!'));
app.listen(PORT, () => console.log(`🚀 Сервер запущен на порту ${PORT}`));

// --- Настройка Бота ---
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

// Настраиваем axios для работы с OpenRouter API
const openrouterApi = axios.create({
  baseURL: 'https://openrouter.ai/api/v1',
  headers: {
    'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
    'Content-Type': 'application/json'
  }
});

const userStates = {}; // Хранилище состояний пользователей

const LANGUAGES = {
    'ru': 'Русский',
    'en': 'Английский',
    'de': 'Немецкий',
    'es': 'Испанский'
};

const DOMAINS = ['Учеба', 'Работа', 'Путешествия', 'Социальные сети', 'Повседневное общение'];
const STYLES = ['Формальный', 'Нейтральный', 'Разговорный'];

// Функция команды /start
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    userStates[chatId] = { step: 1 };
    askSourceLanguage(chatId);
});

function askSourceLanguage(chatId) {
    bot.sendMessage(chatId, '🌍 С какого языка нужно перевести?', {
        reply_markup: {
            inline_keyboard: [
                [{ text: 'Русский', callback_data: 'src_ru' }],
                [{ text: 'Английский', callback_data: 'src_en' }],
                [{ text: 'Немецкий', callback_data: 'src_de' }],
                [{ text: 'Испанский', callback_data: 'src_es' }]
            ]
        }
    });
}

function askTargetLanguage(chatId) {
    bot.sendMessage(chatId, '🎯 На какой язык нужно перевести?', {
        reply_markup: {
            inline_keyboard: [
                [{ text: 'Русский', callback_data: 'tgt_ru' }],
                [{ text: 'Английский', callback_data: 'tgt_en' }],
                [{ text: 'Немецкий', callback_data: 'tgt_de' }],
                [{ text: 'Испанский', callback_data: 'tgt_es' }]
            ]
        }
    });
}

function askDomain(chatId) {
    bot.sendMessage(chatId, '💼 Для какой сферы нужен перевод?', {
        reply_markup: {
            inline_keyboard: DOMAINS.map(d => [{ text: d, callback_data: `dom_${d}` }])
        }
    });
}

function askStyle(chatId) {
    bot.sendMessage(chatId, '🎨 Выберите стиль перевода:', {
        reply_markup: {
            inline_keyboard: STYLES.map(s => [{ text: s, callback_data: `sty_${s}` }])
        }
    });
}

// Обработка нажатий на кнопки
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;
    const state = userStates[chatId];

    if (!state) return;

    if (data.startsWith('src_')) {
        state.fromLang = LANGUAGES[data.split('_')[1]];
        state.step = 2;
        askTargetLanguage(chatId);
    } else if (data.startsWith('tgt_')) {
        state.toLang = LANGUAGES[data.split('_')[1]];
        state.step = 3;
        askDomain(chatId);
    } else if (data.startsWith('dom_')) {
        state.domain = data.replace('dom_', '');
        state.step = 4;
        askStyle(chatId);
    } else if (data.startsWith('sty_')) {
        state.style = data.replace('sty_', '');
        state.step = 5;
        bot.sendMessage(chatId, '✅ Отлично! Теперь просто отправьте мне текст, который нужно перевести.');
    }
    
    bot.answerCallbackQuery(query.id);
});

// Обработка текстовых сообщений (сам перевод)
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const state = userStates[chatId];

    // Игнорируем команды и сообщения, если опрос не завершен
    if (!msg.text || msg.text.startsWith('/') || !state || state.step !== 5) return;

    const text = msg.text;
    bot.sendMessage(chatId, '⏳ Перевожу... Пожалуйста, подождите.');

    try {
        const prompt = `Ты - профессиональный переводчик. Переведи следующий текст с ${state.fromLang} на ${state.toLang}. 
Сфера применения: ${state.domain}. 
Стиль общения: ${state.style}.
Текст для перевода: "${text}"`;

        // Отправляем запрос к OpenRouter через axios
        const response = await openrouterApi.post('/chat/completions', {
            model: "nvidia/nemotron-3.5-content-safety:free",
            messages: [
                { role: "user", content: prompt }
            ]
        });

        const translatedText = response.data.choices[0].message.content;
        
        bot.sendMessage(chatId, `✅ *Готово!*\n\n${translatedText}`, { parse_mode: 'Markdown' });
        
    } catch (error) {
        console.error(error);
        bot.sendMessage(chatId, '❌ Произошла ошибка при переводе. Попробуйте еще раз или отправьте /start.');
    }
});

console.log('🤖 Бот успешно запущен и слушает сообщения!');