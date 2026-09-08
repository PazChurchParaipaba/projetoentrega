import requests

API_KEY_GERANET = "gn_l53W1f4YIv46aQC5H2jrmIVgIwKrOBSygutikYEzqq5FiJuSZtV39bHW6Qdg"

url = "https://nfe.geranet.net/api/v1/nfe"
headers = {"Authorization": f"Bearer {API_KEY_GERANET}"}

# Test different query params
params_list = [
    {},
    {"data_inicio": "2026-08-01", "data_fim": "2026-08-31"},
    {"data_inicial": "2026-08-01", "data_final": "2026-08-31"},
    {"dataInicial": "2026-08-01", "dataFinal": "2026-08-31"},
    {"cnpj": "44192642000105"}
]

for p in params_list:
    print(f"Testing params: {p}")
    r = requests.get(url, headers=headers, params=p)
    print("Status:", r.status_code)
    if r.status_code == 200:
        data = r.json()
        print("Keys:", data.keys() if isinstance(data, dict) else type(data))
        if isinstance(data, dict) and 'data' in data:
            print("Items count:", len(data['data']))
        elif isinstance(data, list):
            print("Items count:", len(data))
        else:
            print(data)
        break
    else:
        print("Response:", r.text[:200])
    print("---")
