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
        print("Fetch error:", e)
        return []

def extract_fields(page):
    props = page.get("properties", {})
    name = props.get("Name", {}).get("title", [])
    name_text = name[0].get("plain_text") if name else "Без названия"
    status = props.get("Status", {}).get("select", {}).get("name", "Без статуса")
    responsible_list = props.get("Responsible", {}).get("people", [])
    responsible_name = responsible_list[0].get("name") if responsible_list else "Не назначен"
    deadline_data = props.get("Deadline", {}).get("date", {})
    deadline = deadline_data.get("start", "Без срока")
    return name_text, status, responsible_name, deadline

def send_telegram_message(text):
    url = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage"
    payload = {
        "chat_id": CHAT_ID,
        "text": text,
        "parse_mode": "HTML"
    }
    try:
        requests.post(url, json=payload)
    except Exception as e:
        print("Telegram error:", e)

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
        page_id = page.get("id")
        name, status, responsible, deadline = extract_fields(page)
        current_state = f"{name}|{status}|{responsible}|{deadline}"

        if page_id not in last_state:
            message = format_message("new", name, status, responsible, deadline)
            send_telegram_message(message)
        elif last_state[page_id] != current_state:
            message = format_message("update", name, status, responsible, deadline)
            send_telegram_message(message)

        last_state[page_id] = current_state

if __name__ == "__main__":
    while True:
        try:
            track_changes()
            time.sleep(20)
        except Exception as error:
            print("Runtime error:", error)
            time.sleep(60)
