import { reviewedListeningProbeRelease } from './release-listening-probe-pins.mjs';
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
export const reviewedListeningFunctionalRelease = freeze({
  ...reviewedListeningProbeRelease,
  ...{
  "revision": "bb4a74349482a874dae0cadc1a935ca93fcab785",
  "tree": "7e3dae95d35affa6b65268938cf57abb316a7a0f",
  "filesSha256": "92d076e905a34b9b430d773fea23f76faf427abaec38583dd017380ff4aef0eb",
  "bundleSha256": "4e0c1819a3a2aacf5745ff4fbef01081033f0ff63ff9b516c7ab0e079efaeff5",
  "configSha256": "3b11b8968b46309ab21845a2d763942d3ad1f5ed4f861c39edf48c5f20da6bac",
  "priorRulesSha256": "0310f19cc07a8970ce2b12672e60fe6389acaf255910319a4286058e39fbdbc3",
  "rulesSha256": "c2e1850860225e99ad095ec2ae1fe6ce717d0e3016b0ae57fd3eed6a21241a9a",
  "priorFirestoreRulesSha256": "969e91d6633707574ed0e56425ac8724e5829967519458fb9b2934cf5bf57208",
  "firestoreRulesSha256": "654a30c61436c2f9f6e2716c9d9ca397cc5d662687de2bc914c3494f335901bc"
},
  upload: { ...reviewedListeningProbeRelease.upload, versionId: 'b2ae0aa6-53e2-4f6e-adf1-265fdcf7a3f1', modules: [{ name: 'worker.js', sha256: reviewedListeningProbeRelease.bundleSha256 }] },
});
