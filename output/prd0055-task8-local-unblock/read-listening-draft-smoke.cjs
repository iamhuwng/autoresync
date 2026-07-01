const { execFileSync } = require('child_process');

const targetTitle = process.argv[2] || 'Codex Local Listening Upload Smoke';

const raw = execFileSync(
  'powershell.exe',
  [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    'C:\\Users\\The Lord\\AppData\\Roaming\\npm\\firebase.ps1',
    'database:get',
    '/listening_authoring/drafts',
    '--project',
    'temp-a1437',
  ],
  {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    maxBuffer: 64 * 1024 * 1024,
  },
);

const drafts = JSON.parse(raw);
const matches = Object.entries(drafts || {})
  .filter(([, record]) => record?.document?.title === targetTitle)
  .map(([draftId, record]) => {
    const section = record?.document?.audioSections?.[0] ?? {};
    return {
      draftId,
      conflictToken: record?.conflictToken,
      state: record?.state,
      title: record?.document?.title,
      difficulty: record?.document?.difficulty,
      questionCount: record?.document?.questionCount,
      isPublic: record?.document?.isPublic,
      isComplete: record?.document?.isComplete,
      audioSectionCount: record?.document?.audioSections?.length ?? 0,
      sectionAssetIdPresent: Boolean(section.assetId),
      sectionAudioUrlPresent: Boolean(section.audioUrl),
      sectionStreamUrlPresent: Boolean(section.streamUrl),
      sectionAudioUrl: section.audioUrl || null,
      sectionStreamUrl: section.streamUrl || null,
      forbiddenTempKeyPresent: Object.prototype.hasOwnProperty.call(section, 'tempKey'),
      forbiddenUploadSessionPresent: Object.prototype.hasOwnProperty.call(section, 'uploadSessionId'),
      forbiddenContentTypePresent: Object.prototype.hasOwnProperty.call(section, 'contentType'),
      forbiddenSizeBytesPresent: Object.prototype.hasOwnProperty.call(section, 'sizeBytes'),
    };
  });

matches.sort((left, right) => String(left.draftId).localeCompare(String(right.draftId)));
console.log(JSON.stringify(matches.at(-1) ?? null, null, 2));
