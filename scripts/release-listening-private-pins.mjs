import { reviewedListeningFunctionalRelease } from './release-listening-functional-pins.mjs';
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };

// Fixed private-audio release; historical release pins remain unchanged.
export const reviewedListeningPrivateRelease = freeze({
  ...reviewedListeningFunctionalRelease,
  revision: '529854b97343b51cfbdff98618411763d8b1a9a4',
  tree: 'bff4cf29033738d1afae2f8dfddf826e94acea1a',
  baseRevision: 'bb4a74349482a874dae0cadc1a935ca93fcab785',
  filesSha256: '3f3007f0d364c7c01d8c37f264185217a717a10b7eae6dbe7b09948b25f146fa',
  bundleSha256: 'eb6ab9962858b9a067243ec5e2167e809e38eae3212a5abe83eb8266259e72b3',
  configSha256: '2241b70293a81f9941d361ad418e574c954993f5cc8d406ce5a15edb81a8af9f',
  sourceConfigSha256: 'ce0042ff96806f2b29d1547a28f042c173e5de37166bd52205d5062ebe273004',
  priorRulesSha256: 'c2e1850860225e99ad095ec2ae1fe6ce717d0e3016b0ae57fd3eed6a21241a9a',
  rulesSha256: '99b1f7ec32f8e94c0cf176e420aae8d2c1606056acc7404f69198baabbe7b520',
  priorFirestoreRulesSha256: '654a30c61436c2f9f6e2716c9d9ca397cc5d662687de2bc914c3494f335901bc',
  firestoreRulesSha256: '654a30c61436c2f9f6e2716c9d9ca397cc5d662687de2bc914c3494f335901bc',
  upload: {
    versionId: '4c8ade84-46a5-4b6b-98f3-42539972aab9',
    modules: [{ name: 'worker.js', sha256: '4e0c1819a3a2aacf5745ff4fbef01081033f0ff63ff9b516c7ab0e079efaeff5' }],
    invariantSha256: '0d6807ba1a9ecff8ff79d9a17aa773a9c57f94388ae6767a8ac9f571b7d087b0',
  },
  postUploadInvariantSha256: 'd3e2ad6f141957d7a1c015e6a76742278307c6b18c2a4f902725d37329f79202',
  privateAudio: {
    bucketName: 'luyentap-listening-audio-private',
    lifecycleSha256: '860d74ae3afb47f55a5c53de2071e1465448c542b7fc1ce8d47f56d9aa4e1199',
  },
});
