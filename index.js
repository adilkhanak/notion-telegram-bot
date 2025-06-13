import os
import asyncio
import logging
from notion_client import AsyncClient
import aiohttp
from uuid import uuid4

# Настройка логирования для отладки
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler()]
)
logger = logging.getLogger(__name__)

# Загрузка переменных окружения
NOTION_TOKEN = os.getenv("NOTION_TOKEN")
DATABASE_ID = os.getenv("DATABASE_ID")
TELEGRAM_TOKEN = os.getenv("TELEGRAM_TOKEN")
CHAT_ID = os.getenv("CHAT_ID")

# Проверка переменных окружения
if not all([NOTION_TOKEN, DATABASE_ID, TELEGRAM_TOKEN, CHAT_ID]):
    logger.error("Отсутствуют необходимые переменные окружения")
    raise EnvironmentError("NOTION_TOKEN, DATABASE_ID, TELEGRAM_TOKEN или CHAT_ID не установлены")

# Инициализация асинхронного клиента Notion
notion = AsyncClient(auth=NOTION_TOKEN)
last_state = {}


async def fetch_database():
    """Получение данных из базы Notion."""
    try:
        response = await notion.databases.query(database_id=DATABASE_ID)
        logger.info("Успешно получены данные из Notion")
        return response.get("results", [])
    except Exception as e:
        logger.error(f"Ошибка получения базы данных Notion: {e}")
        return []


async def extract_fields(page):
    """Извлечение полей из страницы Notion."""
    try:
        props = page.get("properties", {})
        title_data = props.get("Name", {}).get("title", [])
        name = title_data[0].get("plain_text", "Без названия") if title_data else "Без названия"
        status = props.get("Status", {}).get("select", {}).get("name", "Без статуса")
        responsible = props.get("Responsible", {}).get("people", [])
        responsible_name = responsible[0].get("name", "Не назначен") if responsible else "Не назначен"
        deadline = props.get("Deadline", {}).get("date", {}).get("start", "Без срока")
        return name, status, responsible_name, deadline
    except Exception as e:
        logger.error(f"Ошибка извлечения полей: {e}")
        return "Ошибка", "Ошибка", "Ошибка", "Ошибка"


async def send_telegram_message(text):
    """Отправка сообщения в Telegram."""
    url = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage"
    payload = {"chat_id": CHAT_ID, "text": text, "parse_mode": "HTML"}
    async with aiohttp.ClientSession() as session:
        try:
            async with session.post(url, json=payload) as response:
                if response.status == 200:
                    logger.info("Сообщение успешно отправлено в Telegram")
                else:
                    logger.error(f"Ошибка Telegram API: {response.status} - {await response.text()}")
        except Exception as e:
            logger.error(f"Ошибка отправки сообщения в Telegram: {e}")


def format_message(event_type, name, status, responsible, deadline):
    """Форматирование сообщения для Telegram."""
    emojis = {
        "new": "🆕",
        "update": "🔄",
        "task": "📌",
        "status": "📊",
        "user": "👤",
        "date": "📅"
    }
    return (
        f"{emojis[event_type]} <b>{'Новая задача' if event_type == 'new' else 'Изменено'}</b>\n"
        f"{emojis['task']} <b>{name}</b>\n"
        f"{emojis['status']} <b>Статус:</b> {status}\n"
        f"{emojis['user']} <b>Ответственный:</b> {responsible}\n"
        f"{emojis['date']} <b>Срок:</b> {deadline}"
    )


async def track_changes():
    """Отслеживание изменений в базе Notion."""
    global last_state
    pages = await fetch_database()
    for page in pages:
        page_id = page["id"]
        name, status, responsible, deadline = await extract_fields(page)
        current = f"{name}|{status}|{responsible}|{deadline}"

        if page_id not in last_state:
            msg = format_message("new", name, status, responsible, deadline)
            await send_telegram_message(msg)
        elif last_state[page_id] != current:
            msg = format_message("update", name, status, responsible, deadline)
            await send_telegram_message(msg)

        last_state[page_id] = current


async def main():
    """Основной цикл программы."""
    while True:
        try:
            logger.info("Запуск проверки изменений в Notion")
            await track_changes()
            await asyncio.sleep(20)  # Проверка каждые 20 секунд
        except Exception as e:
            logger.error(f"Основная ошибка: {e}")
            await send_telegram_message(f"⚠️ <b>Ошибка в боте:</b> {str(e)}")
            await asyncio.sleep(60)  # Задержка при ошибке


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as e:
        logger.error(f"Критическая ошибка при запуске: {e}")
        raise
