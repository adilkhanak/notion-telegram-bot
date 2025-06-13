require('dotenv').config();
const axios = require('axios');

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const DATABASE_ID = process.env.DATABASE_ID;
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

async function checkNotion() {
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

  const tasks = res.data.results.map(item => item.properties.Name.title[0]?.plain_text || 'Без названия');

  await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    chat_id: CHAT_ID,
    text: `Найдены задачи:\n\n${tasks.join('\n')}`
  });
}

checkNotion();
