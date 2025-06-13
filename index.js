require('dotenv').config();
const axios = require('axios');
const winston = require('winston');

// Настройка логирования
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message }) => `${timestamp} [${level.toUpperCase()}] ${message}`)
  ),
  transports: [new winston.transports.Console()]
});

// Переменные окружения
const NOTION_TOKEN = process.env.NOTION_TOKEN;
const DATABASE_ID = process.env.DATABASE_ID;
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

// Проверка переменных окружения
if (!NOTION_TOKEN || !DATABASE_ID || !TELEGRAM_TOKEN || !CHAT_ID) {
  logger.error('Отсутствуют необходимые переменные окружения: NOTION_TOKEN, DATABASE_ID, TELEGRAM_TOKEN или CHAT_ID');
  process.exit(1);
}

let previousState = {};

async function fetchTasks() {
  try {
    logger.info('Запуск проверки задач в Notion');
    const res = await axios.post(
      `https://api.notion.com/v1/databases/${DATABASE_ID}/query`,
      {},
      {
        headers: {
          Authorization: `Bearer ${NOTION_TOKEN}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json'
        },
        timeout: 10000 // Таймаут 10 секунд
      }
    );

    const changes = [];
    for (const page of res.data.results) {
      const id = page.id;
      const props = page.properties;

      // Логирование структуры свойств для отладки
      logger.debug(`Свойства страницы ${id}: ${JSON.stringify(props, null, 2)}`);

      // Извлечение полей с проверкой на существование
      const name = props.Name?.title?.[0]?.plain_text || 'Без названия';
      const status = props.Status?.select?.name || 'Без статуса';
      const responsible = props.Responsible?.people?.[0]?.name || 'Без ответственного';
      const deadline = props.Deadline?.date?.start || 'Без срока';

      const current = `${name}|${status}|${responsible}|${deadline}`;

      // Форматирование сообщения с эмодзи и HTML
      const formatMessage = (type) => `
        ${type === 'new' ? '🆕 <b>Новая задача</b>' : '🔄 <b>Изменено</b>'}
        📌 <b>Задача:</b> ${name}
        📊 <b>Статус:</b> ${status}
        👤 <b>Ответственный:</b> ${responsible}
        📅 <b>Срок:</b> ${deadline}
      `;

      if (!previousState[id]) {
        changes.push(formatMessage('new'));
        logger.info(`Новая задача: ${current}`);
      } else if (previousState[id] !== current) {
        changes.push(formatMessage('update'));
        logger.info(`Изменение задачи: ${current}`);
      }

      previousState[id] = current;
    }

    if (changes.length > 0) {
      await axios.post(
        `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
        {
          chat_id: CHAT_ID,
          text: changes.join('\n\n'),
          parse_mode: 'HTML'
        },
        { timeout: 10000 }
      );
      logger.info(`Отправлено ${changes.length} уведомлений в Telegram`);
    } else {
      logger.info('Изменений не обнаружено');
    }
  } catch (error) {
    const errorMsg = error.response?.data?.message || error.message;
    logger.error(`Ошибка при получении задач: ${errorMsg}`);
    await axios.post(
      `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
      {
        chat_id: CHAT_ID,
        text: `⚠️ <b>Ошибка в боте:</b> ${errorMsg}`,
        parse_mode: 'HTML'
      },
      { timeout: 10000 }
    ).catch((err) => logger.error(`Не удалось отправить ошибку в Telegram: ${err.message}`));
  }
}

// Запуск каждые 120 секунд (2 минуты)
setInterval(() => {
  fetchTasks().catch((err) => logger.error(`Ошибка в setInterval: ${err.message}`));
}, 120000);

// Первый запуск
fetchTasks().catch((err) => logger.error(`Ошибка при первом запуске: ${err.message}`));
