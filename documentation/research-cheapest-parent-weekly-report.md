# Cheapest Methods to Send Weekly Reports to Parents (Vietnam)

> **Scenario:** Send 1 weekly report per student to their parent's phone
> **Date:** April 2, 2026

---

## Cost Comparison (sorted cheapest → most expensive)

### Assumptions for calculation:
- **50 students** (1 parent each)
- **4 weeks/month** = **200 messages/month**
- **100 students** variant = **400 messages/month**

---

| # | Method | Cost/msg | Monthly (50 students) | Monthly (100 students) | Setup Cost | Works on iPhone? |
|---|--------|----------|----------------------|----------------------|------------|-----------------|
| 1 | **SpeedSMS Gateway** (via Android phone) | **80 VND** (~$0.003) | **64,000 VND** (~$2.50) | 128,000 VND (~$5) | Free | ✅ Yes (SMS) |
| 2 | **Zalo ZNS** | **200 VND** (~$0.008) | **160,000 VND** (~$6.25) | 320,000 VND (~$12.50) | ~200K VND | ✅ Yes (Zalo app) |
| 3 | **SpeedSMS API** (server-side) | **250 VND** (~$0.010) | **200,000 VND** (~$7.80) | 400,000 VND (~$15.60) | Free | ✅ Yes (SMS) |
| 4 | **SMS Brandname** (local providers) | **450 VND** (~$0.018) | **360,000 VND** (~$14) | 720,000 VND (~$28) | ~200-400K VND + monthly | ✅ Yes (SMS) |
| 5 | **Twilio SMS** (international) | **5,800 VND** (~$0.227) | **2,320,000 VND** (~$90.80) | 4,640,000 VND (~$181.60) | Free trial credits | ✅ Yes (SMS) |

---

## Detailed Breakdown

### ⭐ #1 — SpeedSMS Gateway (80 VND/msg = ~$0.003)

**The absolute cheapest option.**

| Detail | Info |
|--------|------|
| Provider | [SpeedSMS.vn](https://speedsms.vn) |
| How it works | Uses a **spare Android phone** as an SMS gateway — messages are sent from the phone's SIM card |
| Price | **80 VND/SMS** (~$0.003 USD) |
| Monthly cost (50 students) | **64,000 VND** (~$2.50 USD) |
| Monthly cost (100 students) | **128,000 VND** (~$5 USD) |
| Setup | Need 1 Android phone + SIM card with SMS plan |
| Brandname | ❌ No — shows as a regular phone number |
| API | ✅ Yes — REST API available |
| Reliability | ⚠️ Medium — depends on phone staying powered/connected |

**Pros:** Dirt cheap, works on all phones (iPhone/Android), actual SMS delivery.
**Cons:** Unprofessional (no brandname), requires a dedicated Android phone, not reliable for critical messages. Carrier may flag/block high-volume personal sending.

---

### ⭐ #2 — Zalo ZNS (200 VND/msg = ~$0.008)

**Best balance of cost, reliability, and professionalism.**

| Detail | Info |
|--------|------|
| Provider | Zalo (via authorized partner) |
| How it works | Sends notification messages through **Zalo app** to parent's phone |
| Price | **~200 VND/msg** for transactional templates |
| Monthly cost (50 students) | **160,000 VND** (~$6.25 USD) |
| Monthly cost (100 students) | **320,000 VND** (~$12.50 USD) |
| Setup | OA registration (~200K VND), template approval |
| Brandname | ✅ Yes — shows your school/app name |
| API | ✅ Yes — REST API |
| Reliability | ✅ High — direct Zalo delivery |
| Fallback | Can auto-fallback to SMS if parent doesn't have Zalo |

**Pros:** Very cheap, professional branding, 41% iOS coverage (Zalo works great on iPhone), templates support rich content (images, buttons, links).
**Cons:** Requires verified business, parent must have Zalo (but ~95% in Hanoi do). ZNS requires phone number — parent must have provided it.

---

### #3 — SpeedSMS API (250 VND/msg = ~$0.010)

| Detail | Info |
|--------|------|
| Provider | [SpeedSMS.vn](https://speedsms.vn) |
| How it works | Server-side SMS API — messages sent through SpeedSMS infrastructure |
| Price | **250 VND/SMS** |
| Monthly cost (50 students) | **200,000 VND** (~$7.80 USD) |
| Monthly cost (100 students) | **400,000 VND** (~$15.60 USD) |
| Setup | Account registration, free test credit (2,000 VND) |
| Brandname | ❌ Optional (extra cost if yes) |
| API | ✅ REST API |
| Reliability | ✅ High |

**Pros:** No dedicated phone needed, reliable server infrastructure, simple API.
**Cons:** No brandname at this price tier, still shows as generic number.

---

### #4 — SMS Brandname via Local Provider (450+ VND/msg)

Full professional SMS with your school/app name appearing as sender.

| Detail | Info |
|--------|------|
| Providers | SpeedSMS, eSMS.vn, Viettel Enterprise, Mobifone HA |
| Price (Customer Care) | **450 VND/SMS** (Viettel/Mobi/Vina) |
| Price (Education sector) | May qualify for ~450 VND tier |
| Monthly cost (50 students) | **360,000 VND** (~$14 USD) |
| Monthly cost (100 students) | **720,000 VND** (~$28 USD) |
| Brandname registration | **200,000 VND** one-time |
| Monthly maintenance | **200,000 VND/month** |
| Total monthly (50 students) | **~560,000 VND** (~$22 USD) incl. maintenance |

**Pros:** Professional, trusted by parents, guaranteed delivery.
**Cons:** Most expensive local option, requires business registration and template approval.

---

### #5 — Twilio (International) — ❌ TOO EXPENSIVE

| Detail | Info |
|--------|------|
| Price | **$0.227/SMS** (~5,800 VND) |
| Monthly cost (50 students) | **~$90 USD** (2.3M VND) |

**Verdict:** 30x more expensive than local. Not recommended.

---

## My Recommendation

### For a small tutoring center (50-100 students):

```
┌─────────────── CHEAPEST PATH ───────────────┐
│                                              │
│   Zalo ZNS (200 VND/msg) + SMS fallback     │
│                                              │
│   Monthly: ~160K-320K VND ($6-$13 USD)      │
│   Works on: ✅ Android ✅ iPhone             │
│   Professional: ✅ Branded templates         │
│   Reliable: ✅ Direct Zalo delivery          │
│   Fallback: Auto-SMS if no Zalo              │
│                                              │
└──────────────────────────────────────────────┘
```

### Why Zalo ZNS wins:
1. **Cheapest reliable option** at 200 VND/msg (~$0.008)
2. **Works natively on iPhone** (Zalo app)
3. **Rich content** — can include weekly stats, charts, links back to your app
4. **95%+ Zalo adoption** in Hanoi — almost guaranteed delivery
5. **Only ~$6.25/month** for 50 students weekly

### Budget Summary

| Scale | Zalo ZNS/month | + SMS fallback (~5%) | Total |
|-------|---------------|---------------------|-------|
| 50 students | 160,000 VND | ~40,000 VND | **~200,000 VND** (~$8) |
| 100 students | 320,000 VND | ~80,000 VND | **~400,000 VND** (~$16) |
| 200 students | 640,000 VND | ~160,000 VND | **~800,000 VND** (~$31) |

---

## Implementation Architecture

```
Firebase Cloud Function (weekly cron, e.g. every Sunday 8pm)
  │
  ├─ Query Firestore: homework submissions vs deadlines
  ├─ Generate weekly report per student
  │
  ├─ Check parent contact method:
  │   ├─ Has Zalo ID? → Send Zalo ZNS message (200 VND)
  │   ├─ No Zalo, has phone? → Send SMS via SpeedSMS API (250 VND)
  │   └─ Has email? → Send email (FREE)
  │
  └─ Log delivery status to Firestore
```

## Next Steps
- [ ] Register Zalo OA (requires Vietnamese business license)
- [ ] Apply for ZNS API access via authorized partner
- [ ] Design weekly report template for ZNS approval
- [ ] Implement Cloud Function for weekly report generation
- [ ] Build parent phone number + Zalo linking in enrollment flow
