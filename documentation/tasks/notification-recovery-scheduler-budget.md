# Notification recovery scheduler budget

Checked against source on 2026-09-24. The recovery plan's earlier five-minute class/homework-only Cron description predates the other notification families. The current Worker uses two Cron Triggers: `* * * * *` for the three bulk families, and `*/2 * * * *` for 14 small-family slots, including two slots each for class and homework. Each invocation runs one bounded family; the triggers can both fire on even minutes.

| Queue | Maximum interval between its passes | Maximum delay after a one-hour retry due time |
|---|---:|---:|
| Course announcement, THCS homework, session | 3 minutes | 3 minutes |
| Class and homework | 20 minutes | 20 minutes |
| Other small families | 28 minutes | 28 minutes |

For a 30-recipient bulk event at 10 recipients per pass, an immediate first pass leaves two Cron passes, so nominal completion is within 6 more minutes when the backend is healthy. A 500-recipient session takes up to 150 minutes if it waits for Cron from the start. The configured 1,000-recipient announcement ceiling takes up to 300 minutes on the same assumption. Busy queues add delay; there is no per-student polling loop. Failed recipient batches become due for one retry about one hour after the initial pass finishes.

At idle, the two schedules invoke the Worker 1,440 + 720 = 2,160 times per UTC day, 2.16% of the Workers Free 100,000-request daily limit. They use two of the account's five Cron Trigger slots. The source caps a bulk invocation at 10 recipients and a small-family due scan at one to three intents. On even minutes both triggers fire as **separate invocations**, so the per-invocation subrequest and CPU limits apply independently while both count toward the daily request limit.

The THCS Firestore store now shares the RTDB client's OAuth token, whose scope includes Firestore, instead of signing and exchanging a token on every Firestore request. A focused Workerd test measures **23 external fetches** for an empty THCS due scan plus ten inbox creates: one OAuth, one Firestore query, one RTDB queue query, ten idempotency reads, and ten inbox writes. Source-path accounting for a ten-recipient scheduled pass gives 29 requests for course announcements with a terminal admin issue, 30 for sessions with a terminal admin issue, and up to **41 for THCS homework** with a class roster, terminal issue, and all three conditional-write attempts on both Firestore intent updates. These are no-redirect counts, not runtime measurements of a fully populated queue. Other small-family paths and Cloudflare CPU time remain unmeasured. Cloudflare Free currently allows 50 external subrequests and 10 ms CPU per invocation. Redirects count as extra subrequests. [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [Cron Trigger handler](https://developers.cloudflare.com/workers/runtime-apis/handlers/scheduled/).

The release check must confirm the account has two free Cron slots, measure subrequests/CPU for a composed 30-recipient event and failed batch, and read back the scheduled queue progress. The RTDB rules compiler error was fixed; Linux CI run 35984381971 passed 33/33 RTDB emulator tests, 26/26 Firestore emulator tests, 60/60 Workerd tests, and the Wrangler dry-run bundle before the THCS OAuth correction. Runtime budget and deployed behavior remain unproven.
