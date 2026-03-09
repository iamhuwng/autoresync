# Research: Free AI API Services for Kahoot Pipeline

**Date:** 2026-03-06  
**Purpose:** Identify additional free AI API services to supplement/fallback for existing Gemini + Groq providers.

---

## Current Setup Summary

| Provider | Model | Role | Free Tier |
|----------|-------|------|-----------|
| **Google Gemini** | `gemini-2.5-flash` | Primary | ~1M tokens/day, 5-30 RPM |
| **Groq** | `llama-3.3-70b-versatile` | Fallback | ~14,400 req/day, 30 RPM |

**Key requirements for any new provider:**
- ✅ JSON output mode (structured `response_format`)
- ✅ Free tier with reasonable limits
- ✅ Large context window (tests can be 10K+ tokens)
- ✅ Good instruction following (complex prompts for IELTS/THCS parsing)
- ✅ Browser-compatible (client-side calls via `fetch` or SDK)
- ✅ No credit card required for free tier

---

## Recommended Services (Ranked by Fit)

### 🥇 1. OpenRouter (BEST NEW ADDITION)

| Detail | Value |
|--------|-------|
| **Website** | [openrouter.ai](https://openrouter.ai) |
| **Free Models** | Many models at $0.00/token (DeepSeek R1, Llama 3.3 70B, Gemma 2 9B, Qwen 2.5, etc.) |
| **Rate Limit** | ~200 requests/day per model (free tier) |
| **JSON Mode** | ✅ `response_format: { type: "json_object" }` and `json_schema` |
| **Context Window** | Varies by model (up to 128K+ for some) |
| **API Style** | OpenAI-compatible (`/api/v1/chat/completions`) |
| **Auth** | API key (free, no credit card) |
| **Browser-safe** | ✅ REST API via fetch |

**Why it's great:**
- **Single API key → access dozens of free models** — acts as a unified gateway
- OpenAI-compatible API means minimal code changes (similar to Groq's interface)
- Can access DeepSeek, Llama, Qwen, Gemma, Mistral models all through one endpoint
- If one model is down/rate-limited, switch to another within the same provider
- Supports structured JSON output natively

**Integration effort:** LOW — OpenAI-compatible chat completions API, very similar to existing Groq implementation.

---

### 🥈 2. Mistral AI (La Plateforme)

| Detail | Value |
|--------|-------|
| **Website** | [console.mistral.ai](https://console.mistral.ai) |
| **Free Models** | `mistral-small-2506`, `mistral-large-2512`, `open-mistral-nemo`, `codestral-2508`, `pixtral-large-2411`, `ministral-3b/8b/14b` |
| **Rate Limit** | 1 RPS global, 50K tokens/min, 4M tokens/month (standard pool) |
| **JSON Mode** | ✅ `response_format: { type: "json_object" }` and `json_schema` |
| **Context Window** | 32K-128K depending on model |
| **API Style** | OpenAI-compatible |
| **Auth** | API key (free, phone verification, no credit card) |
| **Browser-safe** | ✅ REST API via fetch |

**Why it's great:**
- Mistral Large is extremely capable — near GPT-4 quality
- Pixtral Large is multimodal (could handle image-based test parsing in the future)
- 4M tokens/month free is very generous
- European company — good for GDPR if relevant
- Native JSON schema support ensures reliable structured output

**Integration effort:** LOW — OpenAI-compatible API.

---

### 🥉 3. Cloudflare Workers AI

| Detail | Value |
|--------|-------|
| **Website** | [developers.cloudflare.com/workers-ai](https://developers.cloudflare.com/workers-ai) |
| **Free Models** | Llama 3.x, Mistral 7B, Gemma, and others |
| **Rate Limit** | 10,000 Neurons/day free (per account) |
| **JSON Mode** | Partial — prompt-based JSON, no native `response_format` |
| **Context Window** | Model-dependent (typically 4K-8K for free models) |
| **API Style** | Cloudflare REST API |
| **Auth** | Cloudflare account + API token |
| **Browser-safe** | ⚠️ Better suited for server-side / Workers (CORS restrictions) |

**Why it's great:**
- You already use Cloudflare (backup worker deployed there)
- Free tier is genuinely free forever, not a trial
- Could be used server-side in a Cloudflare Worker for heavier processing
- Models run at the edge = low latency

**Caveats:**
- Context windows on free models are smaller → may not handle full IELTS tests
- No native JSON mode — would need prompt engineering + JSON repair
- Best integrated as a Cloudflare Worker middleman rather than direct client calls
- 10K Neurons/day may not cover many large parsing requests

**Integration effort:** MEDIUM — different API format, CORS challenges for client-side.

---

### 4. GitHub Models

| Detail | Value |
|--------|-------|
| **Website** | [github.com/marketplace/models](https://github.com/marketplace/models) |
| **Free Models** | DeepSeek, Grok, Llama, Mistral, Gemma, Qwen |
| **Rate Limit** | Very restrictive input/output token limits |
| **JSON Mode** | Model-dependent |
| **Auth** | GitHub Personal Access Token (PAT) |
| **Browser-safe** | ⚠️ Not designed for client-side use |

**Why it's great:**
- Free access to many frontier models
- Good for testing/prototyping

**Caveats:**
- Extremely restrictive token limits on free tier
- Not designed for production client-side use
- PAT tokens shouldn't be exposed in browser

**Integration effort:** MEDIUM — OpenAI-compatible but token limits are too low for test parsing.

---

### 5. Cohere

| Detail | Value |
|--------|-------|
| **Website** | [dashboard.cohere.com](https://dashboard.cohere.com) |
| **Free Models** | Command R, Command R+ |
| **Rate Limit** | Rate-limited trial access |
| **JSON Mode** | ✅ Supports structured output |
| **Context Window** | 128K |
| **Auth** | API key (free trial) |

**Why it's great:**
- Command R+ is very capable for text analysis
- 128K context window is excellent for long documents
- Strong at retrieval-style tasks

**Caveats:**
- Free tier is a "trial" — may expire or be limited
- Less commonly used, smaller community
- Unclear long-term free tier sustainability

**Integration effort:** MEDIUM — unique API format, not OpenAI-compatible.

---

### 6. Together AI

| Detail | Value |
|--------|-------|
| **Website** | [api.together.ai](https://api.together.ai) |
| **Free Credits** | $25 free credits on signup |
| **Models** | Llama 4 Scout, DeepSeek, Qwen, many open-source |
| **JSON Mode** | ✅ Supports structured output via JSON schema |
| **API Style** | OpenAI-compatible |

**Why it's great:**
- $25 free credits goes a long way with open-source models
- Access to cutting-edge models like Llama 4

**Caveats:**
- Credits-based, not perpetually free
- Once credits run out, requires payment

**Integration effort:** LOW — OpenAI-compatible.

---

### 7. NVIDIA NIM

| Detail | Value |
|--------|-------|
| **Website** | [build.nvidia.com](https://build.nvidia.com) |
| **Free Models** | DeepSeek V3, Kimi K2.5, and others |
| **Rate Limit** | ~40 RPM |
| **Auth** | NVIDIA account + phone verification |

**Why it's great:**
- Access to powerful models like DeepSeek V3
- Good for prototyping

**Caveats:**
- Primarily for testing/prototyping
- Not designed for production browser-side use
- Rate limits may be tight for production

**Integration effort:** MEDIUM

---

## Feature Comparison Matrix

| Provider | JSON Mode | Context | Free Limit | API Compat | Browser-Safe | Effort |
|----------|-----------|---------|------------|------------|--------------|--------|
| **Gemini** (current) | ✅ Native | 1M | ~1M tok/day | Google SDK | ✅ | — |
| **Groq** (current) | ✅ Prompt | 128K | 14.4K req/day | OpenAI | ✅ | — |
| **OpenRouter** | ✅ Native | 128K+ | 200 req/day/model | OpenAI | ✅ | LOW |
| **Mistral** | ✅ Native | 128K | 4M tok/month | OpenAI | ✅ | LOW |
| **CF Workers AI** | ⚠️ Prompt | 4-8K | 10K neurons/day | Cloudflare | ⚠️ | MEDIUM |
| **GitHub Models** | ⚠️ Varies | Varies | Very low | OpenAI | ❌ | MEDIUM |
| **Cohere** | ✅ Native | 128K | Trial | Cohere | ✅ | MEDIUM |
| **Together AI** | ✅ Native | Varies | $25 credit | OpenAI | ✅ | LOW |
| **NVIDIA NIM** | ⚠️ Varies | Varies | 40 RPM | OpenAI | ⚠️ | MEDIUM |

---

## Recommendation

### Phase 1: Add OpenRouter (Highest ROI)

**Why:** Single API key gives access to ~20+ free models. OpenAI-compatible API means the implementation can closely mirror the existing `GroqProvider`. If one model hits rate limits, the provider can try another model — all within a single provider class.

**Implementation plan:**
1. Create `openrouter.provider.ts` following the same `IAIService` interface
2. Use `fetch()` with OpenAI-compatible chat completions format
3. Add `response_format: { type: "json_object" }` for reliable JSON
4. Implement model rotation within the provider (e.g., try DeepSeek → Llama → Qwen)
5. Register in `router.service.ts` as a third fallback

### Phase 2: Add Mistral (Quality Upgrade)

**Why:** Mistral Large is extremely capable and the 4M tokens/month free tier is very generous. It would serve as a high-quality alternative when Gemini is rate-limited.

### Phase 3 (Optional): Cloudflare Workers AI

**Why:** You already have Cloudflare infrastructure. Could be used as a server-side middleman for heavy processing, bypassing client-side rate limits.

---

## Integration Architecture

```
Current:  Gemini → Groq (fallback)

Proposed: Gemini → Mistral → OpenRouter → Groq (fallback chain)
                                    ↓
                              [DeepSeek → Llama → Qwen] (model rotation within OpenRouter)
```

The router service already supports provider ordering — adding new providers is straightforward with the existing `IAIService` interface.

---

> [!IMPORTANT]
> All these services are **free tiers** with rate limits. For a production app with many concurrent users, you'll eventually need paid tiers. But for your current scale, combining 2-3 free providers should provide excellent availability.
