// index.js
require('dotenv').config();
const axios = require('axios');

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const DATABASE_ID = process.env.DATABASE_ID;
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

let previousState = {};

async function fetchTasks() {
  try {
    const res = await axios.post(
      `https://api.notion.com/v1/databases/${DATABASE_ID}/query`,
      {},
      {
        headers: {
          Authorization: `Bearer ${NOTION_TOKEN}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json'
        }
      }
    );

    const changes = [];

    for (const page of res.data.results) {
      const id = page.id;
      const props = page.properties;

      const name =
        props.Name?.title?.[0]?.plain_text?.trim() || '📝 Без названия';
      const status =
        props.Status?.select?.name?.trim() || '🔄 Без статуса';
      const responsible =
        props.Responsible?.people?.[0]?.name?.trim() || '👤 Не назначен';
      const deadline =
        props.Deadline?.date?.start?.trim() || '📅 Без срока';

      const formatted = 
        `📌 <b>${name}</b>\n` +
        `📊 Статус: ${status}\n` +
        `👤 Ответственный: ${responsible}\n` +
        `📅 Срок: ${deadline}`;

      const current = `${name}|${status}|${responsible}|${deadline}`;

      if (previousState[id] && previousState[id] !== current) {
        changes.push(`🔄 <b>Изменено</b>\n${formatted}`);
      } else if (!previousState[id]) {
        changes.push(`🆕 <b>Новая задача</b>\n${formatted}`);
      }

      previousState[id] = current;
    }

    if (changes.length > 0) {
      await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
        chat_id: CHAT_ID,
        text: changes.join('\n\n'),
        parse_mode: 'HTML'
      });
    }
  } catch (error) {
    console.error('Ошибка при получении задач:', error.response?.data || error.message);
  }
}

// Запуск каждые 60 секунд
setInterval(fetchTasks, 60000);

// Первый запуск
fetchTasks();
