const { Client } = require('@notionhq/client');
const axios = require('axios');

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const DATABASE_ID = process.env.DATABASE_ID;
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

const notion = new Client({ auth: NOTION_TOKEN });
let previousTasks = {};

async function fetchTasks() {
  const response = await notion.databases.query({
    database_id: DATABASE_ID,
  });

  return response.results.map(page => {
    const name = page.properties.Name?.title?.[0]?.plain_text || "Без названия";
    const stage = page.properties.Stage?.select?.name || "Нет стадии";
    return {
      id: page.id,
      name,
      stage,
    };
  });
}

async function checkChanges() {
  const currentTasks = await fetchTasks();

  for (const task of currentTasks) {
    const prev = previousTasks[task.id];

    if (!prev) {
      await sendMessage(`🆕 Новая задача: *${task.name}*\nСтадия: ${task.stage}`);
    }

    if (prev && prev.stage !== task.stage) {
      await sendMessage(`🔄 Задача: *${task.name}*\nСтадия изменена: ${prev.stage} → ${task.stage}`);
    }

    previousTasks[task.id] = task;
  }
}

async function sendMessage(text) {
  await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    chat_id: CHAT_ID,
    text,
    parse_mode: 'Markdown'
  });
}

setInterval(checkChanges, 60 * 1000);
console.log("🚀 Бот запущен и слушает изменения...");