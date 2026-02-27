import requests, json

API_KEY = "e2d0296e86ad40498f21cf25c49b94dd"
url = "https://optiqcode.com/v1/models"

headers = {
    "Authorization": f"Bearer {API_KEY}"
}

r = requests.get(url, headers=headers, timeout=30)
print(r.status_code)
print(json.dumps(r.json(), ensure_ascii=False, indent=2))
