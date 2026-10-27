// Fixed independently reviewed Worker-only probe correction.
const freeze = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};
export const reviewedListeningProbeRelease = freeze({
  "revision": "25861289735ff13b954b4ecb5bd64c1336a38151",
  "tree": "f1141a079bb7f42cb73dedb944e9cca92917d93a",
  "baseRevision": "5090b7ef1e02562c4f0d873d2172a594df4ab29f",
  "filesSha256": "53700a5e2119594dc802a7c1fd83471c87073783192a2f185df19a905de49a60",
  "bundleSha256": "a64f8889eec9256f4716b80d9ef6d5f870bc5d5881a2ceb8e1040be7375e5329",
  "configSha256": "39dd362796e79689f0afe1516cc0203b938b9f76cc964ac937d724e46bdeec5a",
  "sourceConfigSha256": "fcac57397e7b6ee7604d1e1cffb56a7176cdc1556a71483ad115898c941540ec",
  "envSha256": "8ec86efb1aa5967b5aa05d1a901bf7bd99244c3d34fafc0998bd3be113a8ea57",
  "rulesSha256": "0310f19cc07a8970ce2b12672e60fe6389acaf255910319a4286058e39fbdbc3",
  "commonSha256": "5b7c5cc18708132a4f54e450349c3c1a0bca2f48f4747a22f0de6109e39c9588",
  "unchangedWorkers": {
    "r2-backup-worker": {
      "versionId": "e9cac4c7-430a-4398-ba1f-72034c0fd45e",
      "modules": [
        {
          "name": "index.js",
          "sha256": "64e0e529f924805ec7983986206b51775ed5710837a370bfb45ae1f78206aec1"
        }
      ],
      "invariantSha256": "c984cf3a91e222ad339732c343bfb896846eef13d75cb66fe55afd6760b5d708"
    },
    "luyentap-notification-command": {
      "versionId": "a184d75b-8823-485a-885d-e23354646f45",
      "modules": [
        {
          "name": "notification-command-active.mjs",
          "sha256": "9734197c765b06de9d746e68fea9a4912780447e05ddb12057e1ac3c6e2f9ed7"
        },
        {
          "name": "notification-command-entry.js",
          "sha256": "72a358e0f7313fd37e89f7bf1d85cd1337c199192dc6c297881bf1b71258d270"
        }
      ],
      "invariantSha256": "2607c64ddaafc5bb3ddcea24223b52e73bd3763271bfa10f469893c97e43a87e"
    },
    "luyentap-notification-firestore-qa": {
      "versionId": "5696e963-c5ed-463d-a495-30db3c07bc98",
      "modules": [
        {
          "name": "notification-firestore-do.js",
          "sha256": "fa9ba9fe7df75fb940aeec73372d214a0ceab8fdc363b2f909fdaba9a4c7a7cf"
        }
      ],
      "invariantSha256": "f8258abd467010f11cb559ca6987b7b2837c1854983a40b8d68203ac24a98355"
    }
  },
  "upload": {
    "versionId": "e375af21-3936-4c3f-8967-95a82b2b7d55",
    "modules": [
      {
        "name": "worker.js",
        "sha256": "a87f00b21c94642104f47cadf8e9ecf34996da751b767c1e547a7c2272d10f88"
      }
    ],
    "invariantSha256": "0d6807ba1a9ecff8ff79d9a17aa773a9c57f94388ae6767a8ac9f571b7d087b0"
  }
});
