import anthropic

client = anthropic.Anthropic(
    api_key="e2d0296e86ad40498f21cf25c49b94dd",
    base_url="https://optiqcode.com"
)

response = client.messages.create(
    model="claude-sonnet-4.5",
    max_tokens=300,
    messages=[{"role": "user", "content": "Summarize the concept of reinforcement learning."}]
)

print(response.content[0].text)
