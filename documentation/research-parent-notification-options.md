# Parent Notification Options — Missed Deadline Alerts (Hanoi, Vietnam)

> **Goal:** Send automated messages to parents' phone numbers (for free) when a student misses a homework deadline.
>
> **Date:** April 2, 2026

---

## TL;DR — Recommendation Matrix

| Option | Cost | Reach in VN | Effort | Reliability | **Verdict** |
|--------|------|-------------|--------|-------------|-------------|
| ⭐ **Firebase Cloud Messaging (FCM)** | **FREE forever** | High (Android), Low (iOS web) | Medium | High | **Best for your stack** |
| ⭐ **Zalo OA Consulting Messages** | Free (8 msg/user/48h) | Very High (~75M users) | High | High | **Best reach, needs opt-in** |
| Telegram Bot API | **FREE forever** | Low (~5-10%) | Low | High | Niche audience only |
| Zalo ZNS (Notification Service) | ~200–400 VND/msg | Very High | High | Very High | Paid, not free |
| WhatsApp Business API | ~$0.03-0.05/msg | Low in VN | Medium | High | Low adoption in VN |
| Traditional SMS (Twilio/Plivo) | ~$0.03-0.08/msg + brandname reg | Universal | Medium | Very High | Not free, regulated |
| Email-to-SMS Gateway | N/A | N/A | N/A | N/A | ❌ Does not exist in VN |

---

## Option 1: Firebase Cloud Messaging (FCM) — ⭐ RECOMMENDED

### Why This Is Your Best Option
- **100% free**, no per-message charges, no volume caps (only technical rate limits)
- **Already in your stack** — you're using Firebase extensively
- Works on **Android Chrome** (most Vietnamese parents use Android)
- Can be implemented as **web push** (no separate app download needed)

### How It Works
1. Parent visits your web app and grants notification permission
2. Your app registers a **Service Worker** (`firebase-messaging-sw.js`)
3. Backend stores the parent's **FCM token** linked to their student
4. When a deadline is missed, a **Firebase Cloud Function** sends a push via FCM

### Limitations
- ❌ **Requires opt-in** — parent must visit the website and click "Allow notifications"
- ❌ **iOS Safari** — web push only works if the site is added to home screen as a PWA
- ❌ **Not SMS** — won't reach parents who never visit the website
- ⚠️ Android battery optimization may delay delivery on some devices

### Architecture Fit
```
Scheduled Cloud Function (cron)
  → Check overdue homework in Firestore
  → Look up parent FCM tokens from /users/{parentId}
  → Send FCM push notification
```

### Effort: ~2-3 days
- Service Worker setup, FCM token collection, Cloud Function for deadline checks

---

## Option 2: Zalo Official Account (OA) — ⭐ BEST REACH IN VIETNAM

### Why Consider This
- **Zalo has ~75M monthly active users** in Vietnam — near-universal adoption
- Most parents in Hanoi already use Zalo daily
- **8 free consulting messages per user** within 48h of their last interaction

### Free Messaging Rules
| Type | Free? | Limit |
|------|-------|-------|
| Consulting Messages | ✅ First 8/user/48h | Within 48h of user interaction |
| Consulting (excess) | ❌ 55 VND/msg | After 8 free messages |
| Broadcast Messages | ❌ Quota varies | Max 1/day/follower per OA package |
| ZNS (Notifications) | ❌ ~200-400 VND/msg | Template-based, fully paid |

### How to Maximize Free Tier
1. **Require parents to follow your OA** during student enrollment
2. **Encourage periodic interaction** (weekly class summary, menu items, chatbot greetings)
3. Each interaction resets the 48-hour window → sending deadline alerts within that window = **free**
4. Design a **chatbot menu** with options like "Check homework status" to keep parents engaging

### Requirements
- Verified **Zalo Official Account** (requires Vietnamese business registration)
- API integration via [Zalo for Developers](https://developers.zalo.me/)
- Parent must **follow** the OA and **interact** for free message window

### Daily API Limits
- ≤ 10,000 followers: max **500 requests/day**
- > 10,000 followers: max **5% of total followers/day**

### Effort: ~1-2 weeks
- OA registration + verification, webhook handler, student-parent linking flow, Cloud Function

---

## Option 3: Telegram Bot API — FREE BUT LOW ADOPTION

### Why Consider This
- **100% free**, no limits (within reason), no per-message charges
- Very simple API — just HTTPS POST requests
- Great for tech-savvy parents or as an opt-in secondary channel

### How It Works
1. Create a bot via `@BotFather`
2. Parents click a link like `t.me/YourSchoolBot` and press "Start"
3. Bot receives `chat_id` → link to student record
4. Backend sends notifications via `POST https://api.telegram.org/bot<token>/sendMessage`

### Limitations
- ❌ **Cannot send to phone numbers directly** — requires user opt-in via bot link
- ❌ **Low adoption in Vietnam** — Telegram is ~5-10% market share
- Most parents in Hanoi won't have Telegram installed

### Effort: ~1 day
- Bot creation, simple API integration, linking flow

---

## Option 4: Traditional SMS — NOT FREE

### Reality in Vietnam
- **No free SMS APIs exist** for Vietnam
- All carriers (Viettel, MobiFone, Vinaphone) require:
  - **Brandname registration** (paid, ~1-5M VND/month)
  - **Template pre-approval**
  - **Per-message fees** (~200-800 VND/msg depending on provider)
- **Email-to-SMS gateways do NOT exist** for Vietnamese carriers
- Using international SMS gateways (Twilio/Plivo) costs ~$0.03-0.08/msg

### Verdict
❌ Not viable for free messaging. Budget ~500K-2M VND/month for even modest volume.

---

## Option 5: WhatsApp Business API — LOW ADOPTION IN VN

- Not widely used for school communication in Vietnam
- Free only for **service messages within 24h customer service window**
- Requires BSP (Business Solution Provider) with platform fees
- ❌ **Not recommended** for Vietnam market

---

## Recommended Strategy: Multi-Channel (Free)

### Phase 1: FCM Web Push (Immediate — fits your stack)
1. Add Service Worker to your existing web app
2. Prompt parents to enable notifications on first login
3. Cloud Function checks deadlines → sends FCM push
4. **Cost: $0** — already have Firebase

### Phase 2: Zalo OA (High impact — if you can get business registration)
1. Register and verify Zalo OA
2. Build parent linking flow (student code → Zalo follower)
3. Design chatbot menu to encourage regular interaction (keeps free window open)
4. Cloud Function sends consulting messages within free quota
5. **Cost: $0** for consulting messages within free tier

### Phase 3 (Optional): Telegram Bot (Bonus channel)
1. Create bot, add as opt-in secondary channel
2. **Cost: $0**

---

## Key Decision: "To Phone Number" vs "To Account"

> ⚠️ **Critical insight:** There is **no way to send a free message directly to a phone number** in Vietnam. Every free option requires the parent to **opt in** to a platform first.

| Method | Reaches phone number directly? | Requires opt-in? |
|--------|-------------------------------|-------------------|
| SMS | ✅ Yes | No, but costs money |
| FCM Push | ❌ No (reaches browser/app) | ✅ Yes |
| Zalo OA | ❌ No (reaches Zalo account) | ✅ Yes (must follow OA) |
| Telegram | ❌ No (reaches Telegram) | ✅ Yes (must start bot) |

**Bottom line:** If you need to reach parents for free, you must design an onboarding flow that gets them to opt in. The good news is that FCM can piggyback on your existing web app login, making the opt-in nearly invisible.

---

## Next Steps

- [ ] Decide on Phase 1 (FCM) vs Phase 2 (Zalo OA) priority
- [ ] If Zalo OA: Investigate business registration requirements
- [ ] Design parent notification opt-in UX flow
- [ ] Create Knowns task for implementation
