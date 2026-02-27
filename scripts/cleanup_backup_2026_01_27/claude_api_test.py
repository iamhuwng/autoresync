import requests

API_KEY = "e2d0296e86ad40498f21cf25c49b94dd"
url = "https://optiqcode.com/v1/messages"

payload = {
    "model": "claude-sonnet-4.5",
    "max_tokens": 300,
    "messages": [
        {"role": "user", "content": "Summarize the concept of reinforcement learning."}
    ]
}

headers = {
    "Content-Type": "application/json",
    "Authorization": f"Bearer {API_KEY}"
}

response = requests.post(url, headers=headers, json=payload)

print(response.text)
