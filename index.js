import os
import time
import requests
from notion_client import Client

NOTION_TOKEN = os.getenv("NOTION_TOKEN")
DATABASE_ID = os.getenv("DATABASE_ID")
TELEGRAM_TOKEN = os.getenv("TELEGRAM_TOKEN")
CHAT_ID = os.getenv("CHAT_ID")

notion = Client(auth=NOTION_TOKEN)
last_state = {}


def fetch_database():
    try:
        response = notion.databases.query(database_id=DATABASE_ID)
        return response.get("results", [])
    except Exception as e:
        print("Ошибка получения базы:", e)
        return []


def extract_fields(page):
    try:
        props = page.get("properties", {})
        title_data = props.get("Name", {}).get("title", [])
        name = title_data[0].get("plain_text") if title_data else "Без названия"

        status = props.get("Status", {}).get("select", {}).get("name", "Без статуса")

        responsible = props.get("Responsible", {}).get("people", [])
        responsible_name = responsible[0].get("name", "Не назначен") if responsible else "Не назначен"

        deadline = props.get("Deadline", {}).get("date", {}).get("start", "Без срока")

        return name, status, responsible_name, deadline
    except Exception as e:
        print("Ошибка извлечения полей:", e)
        return "Ошибка", "Ошибка", "Ошибка", "Ошибка"


def send_telegram_message(text):
    url = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage"
    payload = {"chat_id": CHAT_ID, "text": text, "parse_mode": "HTML"}
    try:
        requests.post(url, json=payload)
    except Exception as e:
        print("Ошибка отправки сообщения в Telegram:", e)


def format_message(event_type, name, status, responsible, deadline):
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


def track_changes():
    global last_state
    pages = fetch_database()
    for page in pages:
        page_id = page["id"]
        name, status, responsible, deadline = extract_fields(page)
        current = f"{name}|{status}|{responsible}|{deadline}"

        if page_id not in last_state:
            msg = format_message("new", name, status, responsible, deadline)
            send_telegram_message(msg)
        elif last_state[page_id] != current:
            msg = format_message("update", name, status, responsible, deadline)
            send_telegram_message(msg)

        last_state[page_id] = current


if __name__ == "__main__":
    while True:
        try:
            track_changes()
            time.sleep(20)
        except Exception as e:
            print("Основная ошибка:", e)
            send_telegram_message(f"⚠️ <b>Ошибка в боте:</b> {str(e)}")
            time.sleep(60)
