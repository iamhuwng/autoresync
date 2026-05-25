import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const repoRoot = 'C:/Users/The Lord/Desktop/luyentap-writing-import-rebased';
const clippingRoot = 'C:/Users/The Lord/Desktop/luyentap/Clippings';
const outputDir = path.join(repoRoot, 'output/reading-v2-auto-v4-task-type-fixtures');

const sources = {
  cam10t01: path.join(clippingRoot, 'Practice Cam 10 Reading Test 01.md'),
  cam11t02: path.join(clippingRoot, 'Practice Cam 11 Reading Test 02.md'),
  cam15t01: path.join(clippingRoot, 'Practice Cam 15 Reading Test 01.md'),
  cam16t04: path.join(clippingRoot, 'Practice Cam 16 Reading Test 04.md'),
  ielts002: path.join(clippingRoot, 'IELTS Reading/002 - Reading Practice Test 02.md'),
};

const stripProcessedAppendix = (text) => {
  const marker = '## Codex Structured Materials';
  const index = text.indexOf(marker);
  return index >= 0 ? text.slice(0, index).trimEnd() : text;
};

const readLines = async (filePath) => {
  const text = stripProcessedAppendix(await readFile(filePath, 'utf8'));
  return text.split(/\r?\n/);
};

const segment = async (filePath, startLine, endLine) => {
  const lines = await readLines(filePath);
  return lines.slice(startLine - 1, endLine).join('\n').trim();
};

const replaceMany = (input, replacements) =>
  replacements.reduce((text, [from, to]) => text.replaceAll(from, to), input);

const romanRenumber = (text, mapping) => {
  let output = text;
  for (const [from, to] of mapping) {
    output = output.replaceAll(`**${from}**`, `**${to}**`);
  }
  return output;
};

const writeFixture = async (fileName, sections, answerRows, gold) => {
  const fixtureText = [
    `# ${gold.title}`,
    '',
    '<!-- Generated from actual Clippings raw passages/questions. Only question/passage numbers were adjusted where source passages were combined into this fixture. -->',
    '',
    ...sections.flatMap((section) => [section.trim(), '']),
    `## Answer ${gold.title}`,
    '',
    ...answerRows,
    '',
  ].join('\n');

  await writeFile(path.join(outputDir, `${fileName}.md`), fixtureText, 'utf8');
  await writeFile(path.join(outputDir, `${fileName}.gold.json`), JSON.stringify(gold, null, 2), 'utf8');
};

const fixture1 = async () => {
  const p1 = await segment(sources.cam15t01, 53, 123);

  const roman = replaceMany(await segment(sources.cam16t04, 53, 115), [
    ['### READING PASSAGE 1', '### READING PASSAGE 2'],
    ['Questions** **1-13', 'Questions** **14-26'],
    ['Reading Passage 1 below', 'Reading Passage 2 below'],
    ['**Questions 1-6**', '**Questions 14-19**'],
    ['boxes **1-6**', 'boxes **14-19**'],
    ['#### Questions 7-10', '#### Questions 20-23'],
    ['Reading Passage 1?', 'Reading Passage 2?'],
    ['boxes **7-10**', 'boxes **20-23**'],
    ['#### Questions 11-13', '#### Questions 24-26'],
    ['boxes 11-13', 'boxes 24-26'],
  ]);
  const p2 = romanRenumber(roman, [
    ['1', '14'], ['2', '15'], ['3', '16'], ['4', '17'], ['5', '18'], ['6', '19'],
    ['7', '20'], ['8', '21'], ['9', '22'], ['10', '23'], ['11', '24'], ['12', '25'], ['13', '26'],
  ]);

  const cacaoRaw = await segment(sources.ielts002, 21, 108);
  const cacao = replaceMany(cacaoRaw, [
    ['Questions 1-5', 'Questions 27-31'],
    ['boxes 1-5', 'boxes 27-31'],
    ['1 the part', '27 the part'],
    ['2 average', '28 average'],
    ['3 risks', '29 risks'],
    ['4 where', '30 where'],
    ['5 how', '31 how'],
    ['Questions 6-10', 'Questions 32-36'],
    ['boxes 6-10', 'boxes 32-36'],
    ['6 use', '32 use'],
    ['7 The Spanish', '33 The Spanish'],
    ['8 The forastero', '34 The forastero'],
    ['9 some parts', '35 some parts'],
    ['10 Chocolate', '36 Chocolate'],
    ['Questions 11-14', 'Questions 37-40'],
    ['boxes 11-14', 'boxes 37-40'],
    ['11 …', '37 …'],
    ['12 …', '38 …'],
    ['13 …', '39 …'],
    ['14 …', '40 …'],
    ['Reading passage 1 has 5 chapters', 'Reading Passage 3 has 5 chapters'],
  ]);
  const p3 = [
    '### READING PASSAGE 3',
    '',
    'You should spend about 20 minutes on **Questions 27-40** which are based on Reading Passage 3 below.',
    '',
    cacao,
  ].join('\n');

  const answerRows = [
    '##### Passage 1',
    '',
    '1. oval',
    '2. husk',
    '3. seed',
    '4. mace',
    '5. FALSE',
    '6. NOT GIVEN',
    '7. TRUE',
    '8. Arabs',
    '9. plague',
    '10. lime',
    '11. Run',
    '12. Mauritius',
    '13. tsunami',
    '',
    '##### Passage 2',
    '',
    '14. posts',
    '15. canal',
    '16. ventilation',
    '17. lid',
    '18. weight',
    '19. climbing',
    '20. FALSE',
    '21. NOT GIVEN',
    '22. FALSE',
    '23. TRUE',
    '24. gold',
    '25. (the) architect(s) (name)',
    '26. (the) harbour / harbor',
    '',
    '##### Passage 3',
    '',
    '27. D',
    '28. E',
    '29. D',
    '30. C',
    '31. B',
    '32. FALSE',
    '33. NOT GIVEN',
    '34. NOT GIVEN',
    '35. TRUE',
    '36. TRUE',
    '37. Covering',
    '38. Chocolate liquor',
    '39. Cocoa fat',
    '40. Mold (form)',
  ];

  await writeFixture('fixture-1-layout-heavy', [p1, p2, p3], answerRows, {
    schemaVersion: 'reading-v2-e2e-gold-v1',
    fixtureId: 'fixture-1-layout-heavy',
    title: 'Reading V2 Fixture 1 - Layout Heavy Completion',
    purpose: 'Covers note, table, diagram, short-answer, matching-information, and flowchart contracts using real Clippings passages.',
    sources: [
      { file: sources.cam15t01, lines: '53-123', passage: 1 },
      { file: sources.cam16t04, lines: '53-115', passage: 2, transformed: 'renumbered original Passage 1/Q1-13 to fixture Passage 2/Q14-26' },
      { file: sources.ielts002, lines: '21-108', passage: 3, transformed: 'renumbered original Q1-14 to fixture Q27-40' },
    ],
    sourceAnomalies: [
      'Cam 15 note-completion instruction says boxes 1-8 although group heading is Questions 1-4.',
      'IELTS Reading 002 contains web-player clutter before the passage; fixture starts at the real passage title.',
    ],
    passages: [
      { passage: 1, title: 'Nutmeg - a valuable spice', questionRange: '1-13' },
      { passage: 2, title: 'Roman tunnels', questionRange: '14-26' },
      { passage: 3, title: 'The Cacao: a Sweet History', questionRange: '27-40' },
    ],
    groups: [
      { passage: 1, range: '1-4', taskType: 'note-completion', strict: false, expectedBlankCount: 4, answerRule: 'ONE WORD ONLY' },
      { passage: 1, range: '5-7', taskType: 'true-false-not-given', strict: true, vocabulary: ['TRUE', 'FALSE', 'NOT GIVEN'] },
      { passage: 1, range: '8-13', taskType: 'table-completion', strict: true, expectedBlankCount: 6, answerRule: 'ONE WORD ONLY' },
      { passage: 2, range: '14-19', taskType: 'diagram-labeling', strict: true, expectedBlankCount: 6, answerRule: 'ONE WORD ONLY', expectedImageCount: 2 },
      { passage: 2, range: '20-23', taskType: 'true-false-not-given', strict: true, vocabulary: ['TRUE', 'FALSE', 'NOT GIVEN'] },
      { passage: 2, range: '24-26', taskType: 'short-answer', strict: true, answerRule: 'NO MORE THAN TWO WORDS' },
      { passage: 3, range: '27-31', taskType: 'matching-information', strict: true, expectedOptionLabels: ['A', 'B', 'C', 'D', 'E'], optionSource: 'chapter labels' },
      { passage: 3, range: '32-36', taskType: 'true-false-not-given', strict: true, vocabulary: ['TRUE', 'FALSE', 'NOT GIVEN'] },
      { passage: 3, range: '37-40', taskType: 'flowchart-completion', strict: true, expectedBlankCount: 4, answerRule: 'NO MORE THAN THREE WORDS' },
    ],
    answers: answerRows
      .filter((line) => /^\d+\./.test(line))
      .map((line) => {
        const [, question, answer] = line.match(/^(\d+)\.\s*(.+)$/);
        return { question: Number(question), answer };
      }),
  });
};

const fixture2 = async () => {
  const easterRaw = await segment(sources.cam11t02, 131, 235);
  const easter = replaceMany(easterRaw, [
    ['### READING PASSAGE 2', '### READING PASSAGE 1'],
    ['Questions 14-26', 'Questions 1-13'],
    ['Reading Passage 2 below', 'Reading Passage 1 below'],
    ['#### Questions 14-20', '#### Questions 1-7'],
    ['Reading Passage 2 has seven paragraphs', 'Reading Passage 1 has seven paragraphs'],
    ['boxes **14-20**', 'boxes **1-7**'],
    ['**14** Paragraph', '**1** Paragraph'],
    ['**15** Paragraph', '**2** Paragraph'],
    ['**16** Paragraph', '**3** Paragraph'],
    ['**17** Paragraph', '**4** Paragraph'],
    ['**18** Paragraph', '**5** Paragraph'],
    ['**19** Paragraph', '**6** Paragraph'],
    ['**20** Paragraph', '**7** Paragraph'],
    ['#### Questions 21-24', '#### Questions 8-11'],
    ['boxes **21-24**', 'boxes **8-11**'],
    ['**21** …', '**8** …'],
    ['**22** …', '**9** …'],
    ['**23** …', '**10** …'],
    ['**24** …', '**11** …'],
    ['#### Questions 25 and 26', '#### Questions 12 and 13'],
    ['boxes **25** and **26**', 'boxes **12** and **13**'],
  ]);

  const p2 = await segment(sources.cam16t04, 117, 223);
  const p3 = await segment(sources.cam10t01, 257, 383);

  const answerRows = [
    '##### Passage 1',
    '',
    '1. ii',
    '2. ix',
    '3. viii',
    '4. i',
    '5. iv',
    '6. vii',
    '7. vi',
    '8. farming',
    '9. canoes',
    '10. birds',
    '11. wood',
    '12. B',
    '13. C',
    '',
    '##### Passage 2',
    '',
    '14. A',
    '15. B',
    '16. D',
    '17. B',
    '18. D',
    '19. H',
    '20. F',
    '21. B',
    '22. C',
    '23. YES',
    '24. NO',
    '25. NOT GIVEN',
    '26. YES',
    '',
    '##### Passage 3',
    '',
    '27. C',
    '28. A',
    '29. D',
    '30. B',
    '31. G',
    '32. E',
    '33. A',
    '34. F',
    '35. B',
    '36. NO',
    '37. YES',
    '38. NOT GIVEN',
    '39. NOT GIVEN',
    '40. NO',
  ];

  await writeFixture('fixture-2-option-matching', [easter, p2, p3], answerRows, {
    schemaVersion: 'reading-v2-e2e-gold-v1',
    fixtureId: 'fixture-2-option-matching',
    title: 'Reading V2 Fixture 2 - Option Banks And Matching',
    purpose: 'Covers heading banks, multiple-select, per-question multiple choice, list summary, YNNG, and matching sentence endings using real Clippings passages.',
    sources: [
      { file: sources.cam11t02, lines: '131-235', passage: 1, transformed: 'renumbered original Passage 2/Q14-26 to fixture Passage 1/Q1-13' },
      { file: sources.cam16t04, lines: '117-223', passage: 2 },
      { file: sources.cam10t01, lines: '257-383', passage: 3 },
    ],
    sourceAnomalies: [
      'Cam 16 Passage 2 Q23-26 asks about writer views but the clipped instruction prints TRUE/FALSE while official key uses YES/NO.',
    ],
    passages: [
      { passage: 1, title: 'What destroyed the civilisation of Easter Island?', questionRange: '1-13' },
      { passage: 2, title: 'Changes in reading habits', questionRange: '14-26' },
      { passage: 3, title: 'The psychology of innovation', questionRange: '27-40' },
    ],
    groups: [
      { passage: 1, range: '1-7', taskType: 'matching-headings', strict: true, expectedOptionLabels: ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix'], expectedParagraphLabels: ['A', 'B', 'C', 'D', 'E', 'F', 'G'] },
      { passage: 1, range: '8-11', taskType: 'summary-completion-text', strict: false, expectedBlankCount: 4, answerRule: 'ONE WORD ONLY' },
      { passage: 1, range: '12-13', taskType: 'multiple-select', strict: true, expectedOptionLabels: ['A', 'B', 'C', 'D', 'E'], selectionCount: 2 },
      { passage: 2, range: '14-17', taskType: 'multiple-choice', strict: true, expectedOptionLabels: ['A', 'B', 'C', 'D'] },
      { passage: 2, range: '18-22', taskType: 'summary-completion-list', strict: true, expectedOptionLabels: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'], expectedBlankCount: 5 },
      { passage: 2, range: '23-26', taskType: 'yes-no-not-given', strict: true, vocabulary: ['YES', 'NO', 'NOT GIVEN'], sourceConflict: 'source instruction prints TRUE/FALSE labels despite writer-views wording and official YES/NO key' },
      { passage: 3, range: '27-30', taskType: 'multiple-choice', strict: true, expectedOptionLabels: ['A', 'B', 'C', 'D'] },
      { passage: 3, range: '31-35', taskType: 'matching-sentence-endings', strict: true, expectedOptionLabels: ['A', 'B', 'C', 'D', 'E', 'F', 'G'] },
      { passage: 3, range: '36-40', taskType: 'yes-no-not-given', strict: true, vocabulary: ['YES', 'NO', 'NOT GIVEN'] },
    ],
    answers: answerRows
      .filter((line) => /^\d+\./.test(line))
      .map((line) => {
        const [, question, answer] = line.match(/^(\d+)\.\s*(.+)$/);
        return { question: Number(question), answer };
      }),
  });
};

await mkdir(outputDir, { recursive: true });
await fixture1();
await fixture2();

await writeFile(path.join(outputDir, 'manifest.json'), JSON.stringify({
  generatedAt: new Date().toISOString(),
  fixtureCount: 2,
  fixtures: [
    {
      fixtureId: 'fixture-1-layout-heavy',
      rawPath: path.join(outputDir, 'fixture-1-layout-heavy.md'),
      goldPath: path.join(outputDir, 'fixture-1-layout-heavy.gold.json'),
      coveredTaskTypes: ['note-completion', 'true-false-not-given', 'table-completion', 'diagram-labeling', 'short-answer', 'matching-information', 'flowchart-completion'],
    },
    {
      fixtureId: 'fixture-2-option-matching',
      rawPath: path.join(outputDir, 'fixture-2-option-matching.md'),
      goldPath: path.join(outputDir, 'fixture-2-option-matching.gold.json'),
      coveredTaskTypes: ['matching-headings', 'summary-completion-text', 'multiple-select', 'multiple-choice', 'summary-completion-list', 'yes-no-not-given', 'matching-sentence-endings'],
    },
  ],
}, null, 2), 'utf8');

console.log(`Wrote mixed Reading V2 fixtures to ${outputDir}`);
