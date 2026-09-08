import requests

API_KEY_GERANET = "gn_l53W1f4YIv46aQC5H2jrmIVgIwKrOBSygutikYEzqq5FiJuSZtV39bHW6Qdg"

# Known valid chave from previous logs
chave = "23260844192642000105650020000048141439091370"
id_nuvem = "nfc_3a22d5ecdf15415bb25da956aaea6b8c"

headers = {"Authorization": f"Bearer {API_KEY_GERANET}"}

endpoints = [
    f"https://nfe.geranet.net/api/v1/nfe/{chave}",
    f"https://nfe.geranet.net/api/v1/nfe/chave/{chave}",
    f"https://nfe.geranet.net/api/v1/nfe/{id_nuvem}",
    f"https://nfe.geranet.net/api/v1/nfe/{id_nuvem}/xml",
    f"https://nfe.geranet.net/api/v1/nfe/xml/{chave}"
]

for url in endpoints:
    print(f"Testing {url} ...")
    r = requests.get(url, headers=headers)
    print("Status:", r.status_code)
    if r.status_code == 200:
        data = r.json()
        print("Success! Keys:", data.keys())
        if 'xml' in data:
            print("Found XML length:", len(data['xml']))
    print("---")
