import uuid
from supabase import create_client
from datetime import datetime, timezone

URL = "https://groezaseypdbpgymgpvo.supabase.co"
KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdyb2V6YXNleXBkYnBneW1ncHZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwNjkxNjYsImV4cCI6MjA4MTY0NTE2Nn0.5U5QeoGmZn_i9Y8POoUCkatBUAdSW-cjHRyfxpm_pyM"
supabase = create_client(URL, KEY)

store_id = "c8acb3db-27d4-4626-9b32-74ff3731b687"

# Fake items payload
items = [
    {
        "id": "e33cbab6-43bb-4e8d-a68a-7a07ca77ae78",
        "nome": "Skol, Brahma DM e Brahma Chopp 600ml",
        "qtd": 95,
        "price": 13.0,
        "categoria": "Bebidas",
        "added_at": "2026-07-19T12:00:00.000Z",
        "garcom": "Sistema"
    },
    {
        "id": "54206952-9677-4b15-9bed-b5afd3bd4014",
        "nome": "Heineken 600ml",
        "qtd": 84,
        "price": 18.0,
        "categoria": "Bebidas",
        "added_at": "2026-07-19T12:00:00.000Z",
        "garcom": "Sistema"
    }
]

comanda_id = str(uuid.uuid4())
total = (95 * 13.0) + (84 * 18.0)

payload = {
    "id": comanda_id,
    "store_id": store_id,
    "numero": 9999,
    "status": "paid",
    "items": items,
    "total_pago": total,
    "created_at": "2026-07-19T12:00:00.000Z",
    "updated_at": "2026-07-19T12:00:00.000Z",
    "obs_geral": "Ajuste manual de 95 Skol e 84 Heineken no domingo"
}

res = supabase.table("comandas").insert(payload).execute()
print("Inserido comanda de ajuste:", res.data)
