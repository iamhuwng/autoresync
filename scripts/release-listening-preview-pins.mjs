import { reviewedListeningProbeRelease } from './release-listening-probe-pins.mjs';
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };

// Fixed fresh-upload preview correction; historical release pins remain unchanged.
export const reviewedListeningPreviewRelease = freeze({
  ...reviewedListeningProbeRelease,
  revision: 'c77cdb7c229bead2ff0d027273586599c34cad45',
  tree: '6eca91a1791fd310e42dd27a4db8b99da0ea9d2f',
  baseRevision: '529854b97343b51cfbdff98618411763d8b1a9a4',
  filesSha256: '654bdba8aeb50f12ba938ad5b437932461e8eaa823ff10810b21d21a3fea0222',
  bundleSha256: 'a4c38392c8d8dd0970d2fc4c3cd8c6204842dd061ce94ec61c9f4bdff09b6a2c',
  configSha256: '2241b70293a81f9941d361ad418e574c954993f5cc8d406ce5a15edb81a8af9f',
  sourceConfigSha256: 'ce0042ff96806f2b29d1547a28f042c173e5de37166bd52205d5062ebe273004',
  rulesSha256: '99b1f7ec32f8e94c0cf176e420aae8d2c1606056acc7404f69198baabbe7b520',
  firestoreRulesSha256: '654a30c61436c2f9f6e2716c9d9ca397cc5d662687de2bc914c3494f335901bc',
  upload: {
    versionId: '30503e0b-fedd-4e61-a7fc-0b2b3b548493',
    modules: [{ name: 'worker.js', sha256: 'eb6ab9962858b9a067243ec5e2167e809e38eae3212a5abe83eb8266259e72b3' }],
    invariantSha256: 'd3e2ad6f141957d7a1c015e6a76742278307c6b18c2a4f902725d37329f79202',
  },
  privateAudio: {
    bucketName: 'luyentap-listening-audio-private',
    lifecycleSha256: '860d74ae3afb47f55a5c53de2071e1465448c542b7fc1ce8d47f56d9aa4e1199',
  },
});
