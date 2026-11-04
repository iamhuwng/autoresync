// Exact product source and provider snapshot reviewed for this isolated release.
export const reviewedWritingHomeworkRelease = Object.freeze({
  "revision": "9dc6bdb51469d19c983950994133275e5b46a24f",
  "tree": "52efc93bee4498a8b966f58c7f2854666ba78216",
  "baseRevision": "2feb29e558aefdc8ee09440c272e1a3b0685c6a6",
  "files": [
    "cloudflare/homework-result-authority.ts",
    "cloudflare/notification-firestore-bridge.ts",
    "cloudflare/notification-release/notification-command-active.mjs",
    "cloudflare/test/homework-result-authority.test.ts",
    "cloudflare/test/notification-release-homework.test.ts",
    "cloudflare/wrangler.notifications.jsonc",
    "documentation/architecture/changelog/teacher-writing-homework-access-2026-11-04.md",
    "documentation/release-audits/notification-writing-homework-release.wrangler.json",
    "scripts/__tests__/repair-teacher-writing-homework-access.test.mjs",
    "scripts/repair-teacher-writing-homework-access.mjs",
    "src/__tests__/security/teacher-writing-homework-access.emulator.test.ts",
    "src/components/results/ResultDetailModal.test.tsx",
    "src/components/results/ResultDetailModal.tsx",
    "vitest.security-emulator.config.ts"
  ],
  "bundleSha256": "ff2f130d7d33d1b32f2cde3e6c9bd9bee833a03d6484b2fa031bf95970cf709c",
  "entrySha256": "72a358e0f7313fd37e89f7bf1d85cd1337c199192dc6c297881bf1b71258d270",
  "configSha256": "593146eabea52d672fbb74da446d16241f3ed58b9f66232a6479ab5d801b3591",
  "outsideTargetSha256": "1fe376a161f57869ec7c7c86b37586e0403754ee7ee754da3b06a8a2c8c952b6",
  "provider": {
    "command": {
      "versionId": "a184d75b-8823-485a-885d-e23354646f45",
      "settings": {
        "placement": {},
        "compatibility_date": "2026-09-19",
        "compatibility_flags": [
          "nodejs_compat"
        ],
        "usage_model": "standard",
        "tags": [],
        "tail_consumers": [],
        "logpush": false,
        "observability": {
          "enabled": true,
          "head_sampling_rate": 1,
          "redact_query_string": false,
          "logs": {
            "enabled": true,
            "head_sampling_rate": 1,
            "persist": true,
            "invocation_logs": true
          },
          "traces": {
            "enabled": false,
            "persist": true,
            "head_sampling_rate": 1
          }
        },
        "bindings": [
          {
            "name": "COURSE_ENROLLMENT_APPROVAL_ENABLED",
            "text": "true",
            "type": "plain_text"
          },
          {
            "name": "FIREBASE_DB_URL",
            "text": "https://temp-a1437-default-rtdb.firebaseio.com",
            "type": "plain_text"
          },
          {
            "name": "FIREBASE_PROJECT_ID",
            "text": "temp-a1437",
            "type": "plain_text"
          },
          {
            "name": "FIREBASE_WEB_API_KEY",
            "type": "secret_text"
          },
          {
            "name": "HOMEWORK_NOTIFICATION_RULES_CUTOFF",
            "text": "2026-10-02T02:22:09.862Z",
            "type": "plain_text"
          },
          {
            "name": "HOMEWORK_RESULT_AUTHORITY_QA_ACTOR",
            "text": "disabled",
            "type": "plain_text"
          },
          {
            "name": "HOMEWORK_RESULT_AUTHORITY_QA_RESULT_ID",
            "text": "disabled",
            "type": "plain_text"
          },
          {
            "class_name": "NotificationBridgeObject",
            "name": "NOTIFICATION_BRIDGE_OBJECT",
            "namespace_id": "c1cdcde985f94e69a5d0b51371ae4298",
            "type": "durable_object_namespace"
          },
          {
            "name": "NOTIFICATION_BRIDGE_QA_ACTOR",
            "text": "glMHCrzMnyS6AqFcb9I0nlOqQ6X2",
            "type": "plain_text"
          },
          {
            "name": "NOTIFICATION_BRIDGE_QA_EVENT_ID",
            "text": "homework-89df8956-470b-4a5f-8565-4f22cbbc19ea",
            "type": "plain_text"
          },
          {
            "name": "NOTIFICATION_COMMAND_GOOGLE_SA_KEY",
            "type": "secret_text"
          },
          {
            "name": "NOTIFICATION_COMMAND_SERVICE_IDENTITY",
            "text": "notification-command-runtime@temp-a1437.iam.gserviceaccount.com",
            "type": "plain_text"
          },
          {
            "name": "NOTIFICATION_RATE_LIMITER",
            "namespace_id": "205512",
            "simple": {
              "limit": 30,
              "period": 60
            },
            "type": "ratelimit"
          },
          {
            "name": "NOTIFICATION_RETRY_BATCH",
            "text": "class-homework",
            "type": "plain_text"
          },
          {
            "name": "WRITING_NOTIFICATION_RULES_CUTOFF",
            "text": "2026-10-02T02:22:09.862Z",
            "type": "plain_text"
          },
          {
            "name": "WRITING_PRODUCT_QA_ACTOR",
            "text": "disabled",
            "type": "plain_text"
          },
          {
            "name": "WRITING_PRODUCT_QA_SUBMISSION_ID",
            "text": "disabled",
            "type": "plain_text"
          },
          {
            "name": "WRITING_PRODUCT_SOURCE_CUTOFF",
            "text": "disabled",
            "type": "plain_text"
          }
        ]
      },
      "modules": {
        "notification-command-active.mjs": "9734197c765b06de9d746e68fea9a4912780447e05ddb12057e1ac3c6e2f9ed7",
        "notification-command-entry.js": "72a358e0f7313fd37e89f7bf1d85cd1337c199192dc6c297881bf1b71258d270"
      },
      "outsideTargetSha256": "1fe376a161f57869ec7c7c86b37586e0403754ee7ee754da3b06a8a2c8c952b6",
      "schedules": {
        "schedules": []
      },
      "subdomain": {
        "enabled": true,
        "previews_enabled": false
      }
    },
    "public": {
      "versionId": "5696e963-c5ed-463d-a495-30db3c07bc98",
      "settings": {
        "placement": {},
        "compatibility_date": "2026-09-19",
        "compatibility_flags": [],
        "usage_model": "standard",
        "tags": [],
        "tail_consumers": [],
        "logpush": false,
        "observability": {
          "enabled": true,
          "head_sampling_rate": 1,
          "redact_query_string": false,
          "logs": {
            "enabled": true,
            "head_sampling_rate": 1,
            "persist": true,
            "invocation_logs": true
          },
          "traces": {
            "enabled": false,
            "persist": true,
            "head_sampling_rate": 1
          }
        },
        "bindings": [
          {
            "class_name": "NotificationBridgeObject",
            "name": "NOTIFICATION_BRIDGE_OBJECT",
            "namespace_id": "c1cdcde985f94e69a5d0b51371ae4298",
            "script_name": "luyentap-notification-command",
            "type": "durable_object_namespace"
          }
        ]
      },
      "modules": {
        "notification-firestore-do.js": "fa9ba9fe7df75fb940aeec73372d214a0ceab8fdc363b2f909fdaba9a4c7a7cf"
      },
      "schedules": {
        "schedules": []
      },
      "subdomain": {
        "enabled": true,
        "previews_enabled": false
      }
    },
    "rtdbRulesSha256": "99b1f7ec32f8e94c0cf176e420aae8d2c1606056acc7404f69198baabbe7b520",
    "firestore": {
      "rulesetName": "projects/temp-a1437/rulesets/fbd67e85-0ea9-4e86-a351-df53fb6ca796",
      "sourceSha256": "b02c642769937926ee4b879357a7d16fb2ca4665b382f935117dca93ec0fae82"
    },
    "domains": [],
    "routes": []
  }
});
