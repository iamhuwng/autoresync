import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { closeTableCompletionRuntime, loadTableCompletionSharedModules } from './table-completion-runtime.mjs';

const ROOT = process.cwd();
const SOURCE_DIR = path.join(ROOT, 'Clippings');
const DEFAULT_OUTPUT_PATH = path.join(ROOT, 'public', 'tmp', 'ielts-reading-materials-import.json');
const STRUCTURED_BLOCK_START = '<!-- CODEX_IELTS_READING_MATERIALS_START -->';
const STRUCTURED_BLOCK_END = '<!-- CODEX_IELTS_READING_MATERIALS_END -->';

const BOOK_START = 16;
const BOOK_END = 18;
const TEST_START = 1;
const TEST_END = 4;

const WORD_LIMITS = new Map([
  ['one', 1],
  ['two', 2],
  ['three', 3],
  ['four', 4],
  ['five', 5],
  ['six', 6],
  ['seven', 7],
  ['eight', 8],
  ['nine', 9],
  ['ten', 10],
]);

const ROMAN_LABELS = [
  'i',
  'ii',
  'iii',
  'iv',
  'v',
  'vi',
  'vii',
  'viii',
  'ix',
  'x',
  'xi',
  'xii',
  'xiii',
];

const QUESTION_HEADING_PATTERN =
  /^(?:(?:#{2,6})\s+Questions\s+(\d+)(?:\s*(?:[-–]|and|&)\s*(\d+))?|[*]{2}Questions\s+(\d+)(?:\s*(?:[-–]|and|&)\s*(\d+))?[*]{2})\s*$/gim;

const PASSAGE_PATTERN = /^###\s+READING PASSAGE\s+(\d+)\s*$/gm;
const ANSWER_PATTERN = /^##\s+Answer\b.*$/m;
const MOJIBAKE_REPLACEMENTS = new Map([
  ['â€™', '’'],
  ['â€˜', '‘'],
  ['â€œ', '“'],
  ['â€', '”'],
  ['â€“', '–'],
  ['â€”', '—'],
  ['â€¦', '…'],
  ['Â£', '£'],
  ['Â', ''],
  ['â€¢', '•'],
  ['â—', '●'],
]);

function createStructuredScriptError(report) {
  const error = new Error(report.error || report.code);
  error.report = report;
  return error;
}

async function assertSupportedQuestionGroups(questionGroups = [], context = {}) {
  if (!Array.isArray(questionGroups)) {
    throw createStructuredScriptError({
      code: 'table-completion-schema-rejected',
      ...context,
      error: 'questionGroups must be an array when present.',
    });
  }

  const { tableCompletionTypes } = await loadTableCompletionSharedModules();

  questionGroups.forEach((group) => {
    try {
      tableCompletionTypes.assertSupportedTableCompletionGroupSchema(group);
    } catch (error) {
      throw createStructuredScriptError({
        code: 'table-completion-schema-rejected',
        ...context,
        groupId: group?.groupId ?? null,
        schemaVersion: group?.schemaVersion ?? null,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
}

function parseCliOptions(argv) {
  const options = {
    outputPath: DEFAULT_OUTPUT_PATH,
    sourceFile: undefined,
    passageNumber: undefined,
  };

  for (const arg of argv) {
    if (arg.startsWith('--output=')) {
      options.outputPath = path.resolve(ROOT, arg.slice('--output='.length));
      continue;
    }

    if (arg.startsWith('--source-file=')) {
      options.sourceFile = arg.slice('--source-file='.length);
      continue;
    }

    if (arg.startsWith('--passage=')) {
      const rawValue = Number(arg.slice('--passage='.length));
      if (Number.isFinite(rawValue) && rawValue > 0) {
        options.passageNumber = rawValue;
      }
    }
  }

  return options;
}

function repairMojibake(text) {
  let repaired = text;
  const shouldAttemptLatin1Repair = /[\u00C2\u00C3]/.test(text);

  if (shouldAttemptLatin1Repair) {
    try {
      const candidate = Buffer.from(text, 'latin1').toString('utf8');
      const currentNoise = (text.match(/[\u00C2\u00C3]/g) ?? []).length;
      const candidateNoise = (candidate.match(/[\u00C2\u00C3]/g) ?? []).length;
      if (!candidate.includes('ï¿½') && candidateNoise < currentNoise) {
        repaired = candidate;
      }
    } catch {
      repaired = text;
    }
  }

  if (/[ÃÂâ]/.test(text)) {
    try {
      const candidate = Buffer.from(text, 'latin1').toString('utf8');
      const currentNoise = (text.match(/[ÃÂâ]/g) ?? []).length;
      const candidateNoise = (candidate.match(/[ÃÂâ]/g) ?? []).length;
      if (!candidate.includes('�') && candidateNoise < currentNoise) {
        repaired = candidate;
      }
    } catch {
      repaired = text;
    }
  }

  for (const [bad, good] of MOJIBAKE_REPLACEMENTS.entries()) {
    repaired = repaired.replaceAll(bad, good);
  }

  return repaired;
}

function stripFrontmatter(text) {
  return text.replace(/^---\n[\s\S]*?\n---\n*/, '');
}

function getMojibakeNoiseScore(value) {
  return (
    (value.match(/Â/g) ?? []).length
    + (value.match(/Ã/g) ?? []).length
    + (value.match(/â€¦/g) ?? []).length
    + (value.match(/â€“/g) ?? []).length
    + (value.match(/â€”/g) ?? []).length
    + (value.match(/â€˜/g) ?? []).length
    + (value.match(/â€™/g) ?? []).length
    + (value.match(/â€œ/g) ?? []).length
    + (value.match(/â€/g) ?? []).length
    + (value.match(/â—/g) ?? []).length
    + (value.match(/\uFFFD/g) ?? []).length * 2
  );
}

function repairMojibakeDeep(text) {
  let repaired = repairMojibake(text);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const candidate = repairMojibake(Buffer.from(repaired, 'latin1').toString('utf8'));
      if (!candidate.includes('\uFFFD') && getMojibakeNoiseScore(candidate) < getMojibakeNoiseScore(repaired)) {
        repaired = candidate;
        continue;
      }
    } catch {
      break;
    }

    break;
  }

  return repaired;
}

function stripStructuredMaterialsBlock(text) {
  const pattern = new RegExp(
    `\\n*## Codex Structured Materials\\s*\\n${STRUCTURED_BLOCK_START}[\\s\\S]*?${STRUCTURED_BLOCK_END}\\s*$`,
    'm',
  );

  return text.replace(pattern, '').trimEnd();
}

function normalizeRawText(text) {
  return repairMojibakeDeep(stripStructuredMaterialsBlock(stripFrontmatter(text)))
    .replace(/\r\n?/g, '\n')
    .replace(/\u00A0/g, ' ')
    .replace(/Advertisements\s*\n/g, '\n')
    .replace(/^#{2,6}\s+Cam\s+\d+\s+Reading\s*Test\s+\d+\s*$/gim, '')
    .replace(/\n{3,}/g, '\n\n');
}

function toPlainText(text) {
  return text
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/â—/g, '•')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function normalizePlaceholderLine(line) {
  return line
    .replace(/[.…·•]{3,}/g, ' _____ ')
    .replace(/_{3,}/g, ' _____ ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function stripListMarkerPrefix(text) {
  return text.replace(/^(?:[\u2022\u25CF*+-]|â€¢|â—)\s*/, '').trim();
}

function cleanupQuestionBlankNumbers(text) {
  return text
    .replace(/\b\d+\b(?=\s+_____)/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .trim();
}

function containsQuestionNumberedBlank(line, startNumber, endNumber) {
  return [...line.matchAll(/\b(\d+)\b(?=\s+_____)/g)]
    .some((match) => {
      const value = Number(match[1]);
      return value >= startNumber && value <= endNumber;
    });
}

function isMeaningfulContextLine(line) {
  if (!line) return false;
  if (isInstructionLine(line)) return false;
  if (/^Questions\s+\d+/.test(line)) return false;
  if (/^\d+\s+/.test(line)) return false;
  if (/^(?:[A-Z]|(?:xiii|xii|xi|x|ix|viii|vii|vi|v|iv|iii|ii|i))\s+/.test(line)) return false;
  return true;
}

function combineCompletionContext(prefixLines, questionText) {
  const parts = [
    ...prefixLines.map((line) => cleanupQuestionBlankNumbers(stripListMarkerPrefix(normalizePlaceholderLine(line)))),
    cleanupQuestionBlankNumbers(stripListMarkerPrefix(questionText)),
  ].filter(Boolean);

  return parts.join(' ').replace(/\s{2,}/g, ' ').trim();
}

function findNextQuestionBoundary(line, searchStart, nextQuestionIndex) {
  const between = line.slice(searchStart, nextQuestionIndex);
  const sentenceBoundary = between.match(/[.!?;:]\s+/);
  if (sentenceBoundary && sentenceBoundary.index !== undefined) {
    return searchStart + sentenceBoundary.index + sentenceBoundary[0].length;
  }

  const clauseBoundary = between.match(/\s+(?=(?:This|These|Those|They|He|She|It|However|Moreover|But|Meanwhile|In|As|For|If|When|While|A|An|The)\b)/);
  if (clauseBoundary && clauseBoundary.index !== undefined) {
    return searchStart + clauseBoundary.index + clauseBoundary[0].length;
  }

  return null;
}

function buildSingleCompletionQuestionText(sourceText, number) {
  const normalized = normalizePlaceholderLine(sourceText);
  return cleanupQuestionBlankNumbers(
    normalized.replace(new RegExp(`\\b${number}\\b\\s+_____`), '_____'),
  );
}

function splitNumberedBlankLine(line, startNumber, endNumber) {
  const matches = [...line.matchAll(/\b(\d+)\b\s+_____/g)]
    .map((match) => ({
      index: match.index ?? 0,
      token: match[0],
      number: Number(match[1]),
    }))
    .filter((match) => match.number >= startNumber && match.number <= endNumber);

  if (matches.length === 0) {
    return [];
  }

  if (matches.length === 1) {
    return [{
      questionNumber: matches[0].number,
      questionText: buildSingleCompletionQuestionText(line, matches[0].number),
    }];
  }

  const entries = [];
  let segmentStart = 0;

  for (let index = 0; index < matches.length; index += 1) {
    const current = matches[index];
    const next = matches[index + 1];
    let segmentEnd = line.length;

    if (next) {
      segmentEnd = findNextQuestionBoundary(line, current.index + current.token.length, next.index) ?? next.index;
    }

    let segmentText = line.slice(segmentStart, segmentEnd).trim();
    let questionText = buildSingleCompletionQuestionText(segmentText, current.number);
    if (!questionText || questionText === '_____' || questionText.split(/\s+/).length < 3) {
      questionText = buildSingleCompletionQuestionText(line, current.number);
    }

    entries.push({
      questionNumber: current.number,
      questionText,
    });
    segmentStart = segmentEnd;
  }

  return entries;
}

function buildStructuredBlankQuestionText(line, targetNumber, answers) {
  const normalized = stripListMarkerPrefix(normalizePlaceholderLine(line));
  return cleanupQuestionBlankNumbers(
    normalized.replace(/\b(\d+)\b\s+_____/g, (_, rawNumber) => {
      const numericValue = Number(rawNumber);
      if (numericValue === targetNumber) {
        return '_____';
      }

      return answers.get(numericValue) ?? '_____';
    }),
  );
}

function isContinuationQuestionText(text) {
  return /^(?:This|These|Those|They|It|Its|Their|There|Here|Such|Then|Also|As a result|Therefore|This allowed)\b/i.test(text);
}

function parseStructuredLineBlankQuestions(rawGroup, startNumber, endNumber, answers) {
  const bodyLines = getBodyLines(rawGroup).map(normalizePlaceholderLine);
  const questions = [];
  let lastContextLine = '';

  for (const line of bodyLines) {
    if (!line) {
      continue;
    }

    const numberedBlanks = [...line.matchAll(/\b(\d+)\b\s+_____/g)]
      .map((match) => Number(match[1]))
      .filter((number) => number >= startNumber && number <= endNumber);

    if (numberedBlanks.length > 0) {
      numberedBlanks.forEach((questionNumber) => {
        let questionText = buildStructuredBlankQuestionText(line, questionNumber, answers);
        if (lastContextLine && isContinuationQuestionText(questionText)) {
          questionText = combineCompletionContext([lastContextLine], questionText);
        }

        questions.push({
          questionNumber,
          questionText,
        });
      });
      continue;
    }

    if (isMeaningfulContextLine(line)) {
      lastContextLine = cleanupQuestionBlankNumbers(stripListMarkerPrefix(line));
    }
  }

  return questions;
}

function extractExplicitTableHeaders(rawGroup, startNumber, endNumber) {
  const bodyLines = getBodyLines(rawGroup).map(normalizePlaceholderLine);
  const candidateLine = bodyLines.find((line) => (
    line.includes('|')
    && !isInstructionLine(line)
    && !containsQuestionNumberedBlank(line, startNumber, endNumber)
    && line.split('|').map((cell) => cell.trim()).filter(Boolean).length >= 2
  ));

  if (!candidateLine) {
    return [];
  }

  return candidateLine
    .split('|')
    .map((cell) => stripListMarkerPrefix(cell.trim()))
    .filter(Boolean);
}

function extractSectionInstructionText(rawGroup, startNumber, endNumber, type) {
  const bodyLines = getBodyLines(rawGroup).map(normalizePlaceholderLine);
  const sectionLines = [];

  for (const line of bodyLines) {
    if (containsQuestionNumberedBlank(line, startNumber, endNumber) || /^\d+\s+/.test(line)) {
      break;
    }

    if (isMeaningfulContextLine(line) || isInstructionLine(line)) {
      sectionLines.push(cleanupQuestionBlankNumbers(stripListMarkerPrefix(line)));
    }
  }

  const baseInstruction = sectionLines.join(' ').replace(/\s{2,}/g, ' ').trim();
  if (!baseInstruction) {
    return undefined;
  }

  if (type !== 'table-completion') {
    return baseInstruction;
  }

  const tableHeaders = extractExplicitTableHeaders(rawGroup, startNumber, endNumber);
  if (tableHeaders.length === 0) {
    return baseInstruction;
  }

  return `TABLE_HEADERS: ${tableHeaders.join(' | ')}. ${baseInstruction}`;
}

function extractWordLimit(text) {
  const normalized = text.toLowerCase();
  const andNumberMatch = normalized.match(/(?:no more than )?(\d+|one|two|three|four|five)\s+words?\s+and\/or\s+a\s+number/);
  if (andNumberMatch) {
    const value = andNumberMatch[1];
    return WORD_LIMITS.get(value) ?? Number(value);
  }

  const wordsOnlyMatch = normalized.match(/(?:no more than )?(\d+|one|two|three|four|five)\s+words?\s+only/);
  if (wordsOnlyMatch) {
    const value = wordsOnlyMatch[1];
    return WORD_LIMITS.get(value) ?? Number(value);
  }

  return undefined;
}

function parseBookAndTest(fileName) {
  const match = fileName.match(/^Practice Cam (\d+) Reading Test (\d+)\.md$/);
  if (!match) {
    return null;
  }

  return {
    book: Number(match[1]),
    test: Number(match[2]),
  };
}

function sortByBookAndTest(a, b) {
  if (a.book !== b.book) {
    return a.book - b.book;
  }
  return a.test - b.test;
}

function getExpectedFileNames() {
  const results = [];
  for (let book = BOOK_START; book <= BOOK_END; book += 1) {
    for (let test = TEST_START; test <= TEST_END; test += 1) {
      results.push(`Practice Cam ${book} Reading Test ${String(test).padStart(2, '0')}.md`);
    }
  }
  return results;
}

function parseAnswerLines(sectionText) {
  const answers = new Map();
  const lines = toPlainText(sectionText).split('\n').map((line) => line.trim()).filter(Boolean);

  for (const line of lines) {
    const combinedMatch = line.match(/^(\d+)\s*&\s*(\d+)\s+(.+)$/);
    if (combinedMatch) {
      const numbers = [Number(combinedMatch[1]), Number(combinedMatch[2])];
      const rawAnswers = combinedMatch[3].split(',').map((item) => item.trim()).filter(Boolean);
      if (rawAnswers.length === numbers.length) {
        numbers.forEach((number, index) => answers.set(number, rawAnswers[index]));
        continue;
      }
    }

    const singleMatch = line.match(/^(\d+)\s+(.+)$/);
    if (singleMatch) {
      answers.set(Number(singleMatch[1]), singleMatch[2].trim());
    }
  }

  return answers;
}

function parseAnswerKey(answerText) {
  const passageBlocks = [...answerText.matchAll(/^#####\s+Passage\s+(\d+)\s*$/gm)];
  const result = new Map();

  passageBlocks.forEach((match, index) => {
    const passageNumber = Number(match[1]);
    const start = match.index + match[0].length;
    const end = index + 1 < passageBlocks.length ? passageBlocks[index + 1].index : answerText.length;
    result.set(passageNumber, parseAnswerLines(answerText.slice(start, end)));
  });

  return result;
}

function getPassageBlocks(content) {
  const matches = [...content.matchAll(PASSAGE_PATTERN)];
  return matches.map((match, index) => {
    const passageNumber = Number(match[1]);
    const start = match.index + match[0].length;
    const end = index + 1 < matches.length ? matches[index + 1].index : content.length;
    return {
      passageNumber,
      raw: content.slice(start, end).trim(),
    };
  });
}

function getQuestionGroups(rawPassage) {
  const matches = [...rawPassage.matchAll(QUESTION_HEADING_PATTERN)];
  return matches.map((match, index) => {
    const startNumber = Number(match[1] ?? match[3]);
    const endNumber = Number(match[2] ?? match[4] ?? match[1] ?? match[3]);
    const start = match.index;
    const end = index + 1 < matches.length ? matches[index + 1].index : rawPassage.length;
    return {
      startNumber,
      endNumber,
      raw: rawPassage.slice(start, end).trim(),
    };
  });
}

function getPassageTitle(rawPassage) {
  const match = rawPassage.match(/^##\s+(.+)$/m);
  return match ? toPlainText(match[1]).trim() : 'Untitled Passage';
}

function getPassageText(rawPassage) {
  const groups = getQuestionGroups(rawPassage);
  const firstGroupIndex = groups.length > 0 ? rawPassage.indexOf(groups[0].raw) : rawPassage.length;
  const rawText = rawPassage.slice(0, firstGroupIndex);
  const titleMatch = rawText.match(/^##\s+(.+)$/m);
  const startIndex = titleMatch ? titleMatch.index + titleMatch[0].length : 0;

  return toPlainText(rawText.slice(startIndex))
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line, index, lines) => !(line === '' && lines[index - 1] === ''))
    .join('\n')
    .trim();
}

function extractSectionReferences(passageText) {
  return passageText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^[A-Z]$/.test(line))
    .map((label) => ({ label }));
}

function classifyGroupType(text) {
  const normalized = toPlainText(text).toLowerCase();

  if (normalized.includes('list of headings')) return 'matching-headings';
  if (normalized.includes('list of endings')) return 'matching-sentence-endings';
  if (normalized.includes('contains the following information') || normalized.includes('which paragraph contains')) return 'matching-information';
  if (normalized.includes('you may use any letter more than once') || normalized.includes('match each statement')) return 'matching-features';
  if (normalized.includes('true if the statement agrees') || normalized.includes('false if the statement contradicts')) return 'true-false-not-given';
  if (normalized.includes('yes if the statement agrees') || normalized.includes('claims of the writer')) return 'yes-no-not-given';
  if (normalized.includes('choose two letters') || normalized.includes('choose three letters') || normalized.includes('which two of the following') || normalized.includes('which three of the following')) return 'multiple-select';
  if (normalized.includes('choose the correct letter') || normalized.includes('choose the correct answer')) return 'multiple-choice';
  if (normalized.includes('complete the summary')) return normalized.includes('list of words') || /\b[A-G]\b/.test(normalized) ? 'summary-completion-list' : 'summary-completion-text';
  if (normalized.includes('complete the table')) return 'table-completion';
  if (normalized.includes('complete the notes') || normalized.includes('complete the form')) return 'note-completion';
  if (normalized.includes('complete the flow-chart') || normalized.includes('flow chart')) return 'flowchart-completion';
  if (normalized.includes('label the diagram') || normalized.includes('look at the diagram')) return 'diagram-labeling';
  if (normalized.includes('complete the sentences')) return 'sentence-completion';
  if (normalized.includes('answer the following questions')) return 'short-answer';
  return 'sentence-completion';
}

function getBodyLines(rawGroup) {
  const plainLines = toPlainText(rawGroup).split('\n').map((line) => line.trim()).filter(Boolean);
  return plainLines.filter((line) => !/^Questions\s+\d+/.test(line));
}

function isInstructionLine(line) {
  return /^(?:Choose|Write|In boxes|NB|Complete the \w+ below|Look at the following|Match each\b|Do the following statements|Answer the following questions)\b/i.test(line);
}

function getExplicitQuestionChunks(rawGroup) {
  const lines = toPlainText(rawGroup).split('\n');
  const chunks = [];
  let current = null;

  for (const originalLine of lines) {
    const line = originalLine.trim();
    if (!line || /^Questions\s+\d+/.test(line)) {
      continue;
    }

    const match = line.match(/^(\d+)\s+(.+)$/);
    if (match) {
      if (current) {
        chunks.push(current);
      }
      current = {
        number: Number(match[1]),
        lines: [match[2].trim()],
      };
      continue;
    }

    if (current && /^List of\b/i.test(line)) {
      chunks.push(current);
      current = null;
      continue;
    }

    if (current) {
      current.lines.push(line);
    }
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}

function cleanQuestionText(text) {
  return normalizePlaceholderLine(text)
    .replace(/\s+List of\b[\s\S]*$/i, '')
    .trim();
}

function parseLineOptions(lines, expectedFormat = 'letter') {
  const options = [];
  let current = null;

  const labelPattern = expectedFormat === 'roman'
    ? /^((?:xiii|xii|xi|x|ix|viii|vii|vi|v|iv|iii|ii|i))\s+(.+)$/i
    : expectedFormat === 'number'
      ? /^(\d+)\s+(.+)$/
      : /^([A-Z])\s+(.+)$/;

  for (const rawLine of lines) {
    const line = normalizePlaceholderLine(rawLine);
    const match = line.match(labelPattern);
    if (match) {
      if (current) {
        options.push(current);
      }
      current = {
        label: expectedFormat === 'roman' ? match[1].toLowerCase() : match[1],
        text: match[2].trim(),
      };
      continue;
    }

    if (current) {
      current.text = `${current.text} ${line}`.replace(/\s{2,}/g, ' ').trim();
    }
  }

  if (current) {
    options.push(current);
  }

  return normalizeParsedOptions(options, expectedFormat);
}

function parseInlineOptions(text, expectedFormat = 'letter') {
  const normalized = normalizePlaceholderLine(toPlainText(text));
  const labelPattern = expectedFormat === 'roman'
    ? '(?:xiii|xii|xi|x|ix|viii|vii|vi|v|iv|iii|ii|i)'
    : expectedFormat === 'number'
      ? '\\d+'
      : '[A-Z]';
  const startMatcher = new RegExp(`^${labelPattern}\\s+`, expectedFormat === 'roman' ? 'i' : '');
  if (!startMatcher.test(normalized)) {
    return [];
  }

  const splitter = new RegExp(`\\s+(?=${labelPattern}\\s+)`, expectedFormat === 'roman' ? 'i' : '');
  const options = normalized
    .split(splitter)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const match = part.match(new RegExp(`^(${labelPattern})\\s+([\\s\\S]+)$`, expectedFormat === 'roman' ? 'i' : ''));
      if (!match) {
        return null;
      }

      return {
        label: expectedFormat === 'roman' ? match[1].toLowerCase() : match[1],
        text: match[2].trim(),
      };
    })
    .filter(Boolean);

  return normalizeParsedOptions(options, expectedFormat);
}

function parseSharedOptions(rawGroup, expectedFormat) {
  const bodyLines = getBodyLines(rawGroup);
  const explicitChunks = getExplicitQuestionChunks(rawGroup);
  const firstQuestionNumber = explicitChunks[0]?.number;
  const preQuestionLines = [];
  const postQuestionLines = [];
  let afterQuestions = false;

  for (const line of bodyLines) {
    const startsNumber = /^\d+\s+/.test(line);
    if (startsNumber) {
      afterQuestions = true;
      continue;
    }
    if (!afterQuestions) {
      preQuestionLines.push(line);
    } else {
      postQuestionLines.push(line);
    }
  }

  const preOptionLines = getOptionCandidateLines(preQuestionLines, expectedFormat);
  const postOptionLines = getOptionCandidateLines(postQuestionLines, expectedFormat);

  const preOptions = parseLineOptions(preOptionLines, expectedFormat);
  const inlinePreOptions = parseInlineOptions(preOptionLines.join(' '), expectedFormat);
  if (inlinePreOptions.length > preOptions.length) {
    return inlinePreOptions;
  }
  if (preOptions.length > 0) {
    return preOptions;
  }

  const postOptions = parseLineOptions(postOptionLines, expectedFormat);
  const inlinePostOptions = parseInlineOptions(postOptionLines.join(' '), expectedFormat);
  if (inlinePostOptions.length > postOptions.length) {
    return inlinePostOptions;
  }
  if (postOptions.length > 0) {
    return postOptions;
  }

  if (inlinePostOptions.length > 0) {
    return inlinePostOptions;
  }

  if (firstQuestionNumber !== undefined) {
    const beforeFirstQuestion = bodyLines.slice(0, bodyLines.findIndex((line) => line.startsWith(`${firstQuestionNumber} `)));
    const inlineBefore = parseInlineOptions(beforeFirstQuestion.join(' '), expectedFormat);
    if (inlineBefore.length > 0) {
      return inlineBefore;
    }
  }

  return [];
}

function buildOptionLabel(index, expectedFormat) {
  if (expectedFormat === 'roman') {
    return ROMAN_LABELS[index] ?? String(index + 1);
  }
  if (expectedFormat === 'number') {
    return String(index + 1);
  }
  return String.fromCharCode(65 + index);
}

function normalizeParsedOptions(options, expectedFormat) {
  if (options.length === 0) {
    return options;
  }

  const normalizedLabels = options.map((option) => String(option.label).toLowerCase());
  const expectedLabels = options.map((_, index) => buildOptionLabel(index, expectedFormat).toLowerCase());
  const hasDuplicates = new Set(normalizedLabels).size !== normalizedLabels.length;
  const isSequential = normalizedLabels.every((label, index) => label === expectedLabels[index]);

  if (!hasDuplicates && isSequential) {
    return options;
  }

  return options.map((option, index) => ({
    ...option,
    label: buildOptionLabel(index, expectedFormat),
  }));
}

function getOptionStartPattern(expectedFormat) {
  if (expectedFormat === 'roman') {
    return /^(?:xiii|xii|xi|x|ix|viii|vii|vi|v|iv|iii|ii|i)\s+/i;
  }
  if (expectedFormat === 'number') {
    return /^\d+\s+/;
  }
  return /^[A-Z]\s+/;
}

function getOptionCandidateLines(lines, expectedFormat) {
  const cleaned = lines.filter((line) => !isInstructionLine(line));
  const startPattern = getOptionStartPattern(expectedFormat);
  const startIndex = cleaned.findIndex((line) => startPattern.test(line));
  return startIndex >= 0 ? cleaned.slice(startIndex) : cleaned;
}

function parseEmbeddedBlankQuestions(rawGroup, startNumber, endNumber) {
  const bodyLines = getBodyLines(rawGroup).map(normalizePlaceholderLine);
  const questions = [];
  const groupContext = [];
  let sectionContext = [];
  let sawQuestionLine = false;

  for (const line of bodyLines) {
    if (!line) {
      continue;
    }

    const entries = splitNumberedBlankLine(line, startNumber, endNumber);
    if (entries.length > 0) {
      sawQuestionLine = true;
      const inheritedContext = [...groupContext, ...sectionContext];
      for (const entry of entries) {
        questions.push({
          questionNumber: entry.questionNumber,
          questionText: combineCompletionContext(inheritedContext, entry.questionText),
        });
      }
      continue;
    }

    if (!isMeaningfulContextLine(line)) {
      continue;
    }

    if (!sawQuestionLine) {
      groupContext.push(line);
      continue;
    }

    sectionContext = [line];
  }

  return questions;
}

function parseMultipleChoiceQuestions(rawGroup, answers, passageId, wordLimit) {
  return getExplicitQuestionChunks(rawGroup).map((chunk) => {
    const [stem, ...optionLines] = chunk.lines;
    return {
      id: `q-${chunk.number}`,
      number: chunk.number,
      questionNumber: chunk.number,
      questionText: cleanQuestionText(stem),
      question: cleanQuestionText(stem),
      type: 'multiple-choice',
      labeledOptions: parseLineOptions(optionLines, 'letter'),
      optionLabelFormat: 'letter',
      answer: answers.get(chunk.number) ?? '',
      answerSource: 'answer-key',
      passageId,
      confidence: 99,
      points: 1,
      ...(wordLimit ? { wordLimit } : {}),
    };
  });
}

function parseSharedStemQuestions(rawGroup, startNumber, endNumber, answers, passageId, type, options, sectionReferences, wordLimit) {
  const bodyLines = getBodyLines(rawGroup);
  const explicitChunks = getExplicitQuestionChunks(rawGroup);
  const stem = bodyLines.find((line) => (
    !isInstructionLine(line)
    && !/^\d+\s+/.test(line)
    && !/^[A-Z]\s+/.test(line)
    && !/^(?:xiii|xii|xi|x|ix|viii|vii|vi|v|iv|iii|ii|i)\s+/i.test(line)
  )) ?? `Questions ${startNumber}-${endNumber}`;

  if (explicitChunks.length > 0) {
    return explicitChunks.map((chunk) => ({
      id: `q-${chunk.number}`,
      number: chunk.number,
      questionNumber: chunk.number,
      questionText: cleanQuestionText(chunk.lines.join(' ')),
      question: cleanQuestionText(chunk.lines.join(' ')),
      type,
      ...(options.length > 0 ? { labeledOptions: options } : {}),
      ...(options.length > 0 ? { optionLabelFormat: /^[ivx]+$/i.test(options[0].label) ? 'roman' : 'letter' } : {}),
      ...(sectionReferences?.length ? { sectionReferences } : {}),
      answer: answers.get(chunk.number) ?? '',
      answerSource: 'answer-key',
      passageId,
      confidence: 99,
      points: 1,
      ...(wordLimit ? { wordLimit } : {}),
    }));
  }

  const questionText = cleanQuestionText(stem);
  const questions = [];
  for (let number = startNumber; number <= endNumber; number += 1) {
    questions.push({
      id: `q-${number}`,
      number,
      questionNumber: number,
      questionText,
      question: questionText,
      type,
      ...(options.length > 0 ? { labeledOptions: options } : {}),
      ...(options.length > 0 ? { optionLabelFormat: /^[ivx]+$/i.test(options[0].label) ? 'roman' : 'letter' } : {}),
      ...(sectionReferences?.length ? { sectionReferences } : {}),
      answer: answers.get(number) ?? '',
      answerSource: 'answer-key',
      passageId,
      confidence: 95,
      points: 1,
      ...(wordLimit ? { wordLimit } : {}),
    });
  }

  return questions;
}

function parseStatementQuestions(rawGroup, answers, passageId, type, options, sectionReferences, wordLimit) {
  return getExplicitQuestionChunks(rawGroup).map((chunk) => {
    const questionText = cleanQuestionText(chunk.lines.join(' '));
    const result = {
      id: `q-${chunk.number}`,
      number: chunk.number,
      questionNumber: chunk.number,
      questionText,
      question: questionText,
      type,
      answer: answers.get(chunk.number) ?? '',
      answerSource: 'answer-key',
      passageId,
      confidence: 99,
      points: 1,
      ...(wordLimit ? { wordLimit } : {}),
    };

    if (options.length > 0) {
      result.labeledOptions = options;
      result.optionLabelFormat = /^[ivx]+$/i.test(options[0].label) ? 'roman' : 'letter';
    }

    if (sectionReferences?.length) {
      result.sectionReferences = sectionReferences;
    }

    return result;
  });
}

function parseCompletionQuestions(rawGroup, startNumber, endNumber, answers, passageId, type, options, wordLimit) {
  const embedded = type === 'table-completion' || type === 'note-completion' || type === 'flowchart-completion'
    ? parseStructuredLineBlankQuestions(rawGroup, startNumber, endNumber, answers)
    : parseEmbeddedBlankQuestions(rawGroup, startNumber, endNumber);
  const source = embedded.length > 0
    ? embedded
    : getExplicitQuestionChunks(rawGroup).map((chunk) => ({
      questionNumber: chunk.number,
      questionText: normalizePlaceholderLine(chunk.lines.join(' ')),
    }));
  const fallbackStem = (() => {
    const plainLines = getBodyLines(rawGroup)
      .filter((line) => !isInstructionLine(line))
      .map((line) => normalizePlaceholderLine(line));
    const imageUrls = [...rawGroup.matchAll(/!\[\]\((https?:\/\/[^)]+)\)/g)].map((match) => match[1]);
    const base = plainLines[0] || 'Complete the question using the passage.';
    return imageUrls.length > 0 ? `${base} Diagram source: ${imageUrls.join(' ')}` : base;
  })();
  const normalizedSource = source.length > 0
    ? source
    : Array.from({ length: endNumber - startNumber + 1 }, (_, index) => ({
      questionNumber: startNumber + index,
      questionText: cleanQuestionText(`${fallbackStem} Item ${startNumber + index}.`),
    }));

  return normalizedSource.map((entry) => {
    const number = entry.questionNumber;
    const question = {
      id: `q-${number}`,
      number,
      questionNumber: number,
      questionText: entry.questionText,
      question: entry.questionText,
      type,
      answer: answers.get(number) ?? '',
      answerSource: 'answer-key',
      passageId,
      confidence: 99,
      points: 1,
      ...(wordLimit ? { wordLimit } : {}),
    };

    if (options.length > 0) {
      question.labeledOptions = options;
      question.optionLabelFormat = /^[ivx]+$/i.test(options[0].label) ? 'roman' : 'letter';
    }

    return question;
  });
}

async function parseQuestionGroup(group, answers, passageId, sectionReferences, sourceFile) {
  const type = classifyGroupType(group.raw);
  const wordLimit = extractWordLimit(group.raw);
  const sectionInstructionText = extractSectionInstructionText(group.raw, group.startNumber, group.endNumber, type);
  const sectionInstructionId = sectionInstructionText
    ? `${passageId}-section-${group.startNumber}-${group.endNumber}`
    : undefined;
  const attachSectionInstruction = (questions) => sectionInstructionId
    ? questions.map((question) => ({ ...question, sectionInstructionId }))
    : questions;
  const buildResult = (questions) => ({
    questions: attachSectionInstruction(questions),
    sectionInstruction: sectionInstructionText
      ? {
        id: sectionInstructionId,
        text: sectionInstructionText,
        questionRange: {
          start: group.startNumber,
          end: group.endNumber,
        },
      }
      : null,
    questionGroups: [],
    tableCompletionDiagnostics: [],
  });

  if (type === 'multiple-choice') {
    return buildResult(parseMultipleChoiceQuestions(group.raw, answers, passageId, wordLimit));
  }

  if (type === 'matching-headings') {
    const options = parseSharedOptions(group.raw, 'roman');
    return buildResult(parseStatementQuestions(group.raw, answers, passageId, type, options, [], wordLimit));
  }

  if (type === 'matching-information') {
    return buildResult(parseStatementQuestions(group.raw, answers, passageId, type, [], sectionReferences, wordLimit));
  }

  if (type === 'matching-features') {
    const options = parseSharedOptions(group.raw, 'letter');
    return buildResult(parseStatementQuestions(group.raw, answers, passageId, type, options, [], wordLimit));
  }

  if (type === 'matching-sentence-endings') {
    const options = parseSharedOptions(group.raw, 'letter');
    return buildResult(parseStatementQuestions(group.raw, answers, passageId, type, options, [], wordLimit));
  }

  if (type === 'multiple-select') {
    const options = parseSharedOptions(group.raw, 'letter');
    return buildResult(parseSharedStemQuestions(group.raw, group.startNumber, group.endNumber, answers, passageId, type, options, [], wordLimit));
  }

  if (type === 'true-false-not-given' || type === 'yes-no-not-given' || type === 'short-answer' || type === 'sentence-completion') {
    return buildResult(parseStatementQuestions(group.raw, answers, passageId, type, [], [], wordLimit));
  }

  if (type === 'summary-completion-list') {
    const options = parseSharedOptions(group.raw, 'letter');
    return buildResult(parseCompletionQuestions(group.raw, group.startNumber, group.endNumber, answers, passageId, type, options, wordLimit));
  }

  if (type === 'table-completion') {
    const { canonicalizer, transforms, validator } = await loadTableCompletionSharedModules();
    const legacyQuestions = parseCompletionQuestions(
      group.raw,
      group.startNumber,
      group.endNumber,
      answers,
      passageId,
      type,
      [],
      wordLimit,
    );
    const canonicalization = canonicalizer.canonicalizeTableCompletionGroup({
      groupId: sectionInstructionId || `${passageId}-section-${group.startNumber}-${group.endNumber}`,
      passageId,
      questions: legacyQuestions.map((question) => ({
        questionNumber: question.questionNumber,
        questionText: question.questionText,
        answer: question.answer,
        sectionInstruction: sectionInstructionText,
        options: question.labeledOptions || question.options || [],
      })),
      rawExcerpt: group.raw,
      sourceWorkflow: 'script-material',
    });
    const issues = validator.validateTableCompletionCanonicalization(canonicalization);
    const diagnostic = validator.buildTableCompletionDiagnostic(canonicalization, issues);

    if (canonicalization.group) {
      const canonicalGroup = canonicalization.group;
      await assertSupportedQuestionGroups([canonicalGroup], {
        sourceFile,
        passageId,
        questionRange: {
          start: group.startNumber,
          end: group.endNumber,
        },
      });
      const canonicalQuestions = transforms.deriveTableCompletionQuestionsFromGroup(canonicalGroup);
      return {
        questions: canonicalQuestions,
        sectionInstruction: {
          id: canonicalGroup.groupId,
          text: transforms.buildTableCompletionSectionInstruction(canonicalGroup),
          questionRange: {
            start: group.startNumber,
            end: group.endNumber,
          },
        },
        questionGroups: [canonicalGroup],
        tableCompletionDiagnostics: [diagnostic],
      };
    }

    return {
      ...buildResult(legacyQuestions),
      tableCompletionDiagnostics: [diagnostic],
    };
  }

  return buildResult(parseCompletionQuestions(group.raw, group.startNumber, group.endNumber, answers, passageId, type, [], wordLimit));
}

function validateQuestionSet(fileName, passageNumber, questions, answers) {
  const expectedNumbers = [...answers.keys()].sort((a, b) => a - b);
  const actualNumbers = questions.map((question) => question.questionNumber).sort((a, b) => a - b);

  if (expectedNumbers.length !== actualNumbers.length) {
    throw new Error(
      `${fileName} passage ${passageNumber}: expected ${expectedNumbers.length} questions from answers, parsed ${actualNumbers.length}.`,
    );
  }

  const missing = expectedNumbers.filter((number) => !actualNumbers.includes(number));
  if (missing.length > 0) {
    throw new Error(`${fileName} passage ${passageNumber}: missing question numbers ${missing.join(', ')}.`);
  }
}

async function buildMaterial(fileName, meta, passageNumber, passageRaw, passageAnswers) {
  const passageTitle = getPassageTitle(passageRaw);
  const passageContent = getPassageText(passageRaw);
  const passageId = `cam-${meta.book}-test-${String(meta.test).padStart(2, '0')}-passage-${passageNumber}`;
  const groups = getQuestionGroups(passageRaw);
  const sectionReferences = extractSectionReferences(passageContent);
  const parsedGroups = await Promise.all(
    groups.map((group) => parseQuestionGroup(group, passageAnswers, passageId, sectionReferences, fileName)),
  );
  const questions = parsedGroups.flatMap((group) => group.questions);
  const questionGroups = parsedGroups.flatMap((group) => group.questionGroups || []);
  const tableCompletionDiagnostics = parsedGroups.flatMap(
    (group) => group.tableCompletionDiagnostics || [],
  );
  const sectionInstructions = parsedGroups
    .map((group) => group.sectionInstruction)
    .filter(Boolean);

  await assertSupportedQuestionGroups(questionGroups, {
    sourceFile: fileName,
    passageNumber,
    passageId,
  });

  validateQuestionSet(fileName, passageNumber, questions, passageAnswers);

  const questionNumbers = questions.map((question) => question.questionNumber);
  const questionStart = Math.min(...questionNumbers);
  const questionEnd = Math.max(...questionNumbers);

  return {
    sourceFile: fileName,
    book: meta.book,
    test: meta.test,
    passageNumber,
    title: `Cam ${meta.book} Reading Test ${String(meta.test).padStart(2, '0')} - Passage ${passageNumber} - ${passageTitle}`,
    metadata: {
      title: `Cam ${meta.book} Reading Test ${String(meta.test).padStart(2, '0')} - Passage ${passageNumber} - ${passageTitle}`,
      type: 'IELTS',
      skill: 'Reading',
      duration: 20,
      difficulty: 'Advanced',
      description: passageTitle,
      tags: [
        'IELTS',
        'Reading',
        `Cam ${meta.book}`,
        `Test ${String(meta.test).padStart(2, '0')}`,
        `Passage ${passageNumber}`,
      ],
    },
    passages: [
      {
        id: passageId,
        title: passageTitle,
        content: passageContent,
        type: 'text',
        wordCount: passageContent.split(/\s+/).filter(Boolean).length,
        questionStart,
        questionEnd,
        createdAt: new Date().toISOString(),
      },
    ],
    sectionInstructions,
    questions,
    ...(questionGroups.length > 0 ? { questionGroups } : {}),
    ...(tableCompletionDiagnostics.length > 0 ? { tableCompletionDiagnostics } : {}),
  };
}

function writeStructuredError(report) {
  process.stderr.write(`${JSON.stringify(report, null, 2)}\n`);
}

export async function buildImportManifest(cliOptions) {
  const sourceDir = cliOptions.sourceDir ?? SOURCE_DIR;
  const expectedFiles = getExpectedFileNames();
  const dirEntries = await fs.readdir(sourceDir, { withFileTypes: true });
  const availableFiles = dirEntries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name);

  const filteredExpectedFiles = cliOptions.sourceFile
    ? expectedFiles.filter((fileName) => fileName === cliOptions.sourceFile)
    : expectedFiles;
  const missingFiles = filteredExpectedFiles.filter((fileName) => !availableFiles.includes(fileName));
  const sourceFiles = filteredExpectedFiles.filter((fileName) => availableFiles.includes(fileName));
  const materials = [];

  for (const fileName of sourceFiles) {
    const meta = parseBookAndTest(fileName);
    if (!meta) {
      continue;
    }

    const filePath = path.join(sourceDir, fileName);
    const rawFile = await fs.readFile(filePath, 'utf8');
    const normalized = normalizeRawText(rawFile);
    const answerIndexMatch = normalized.match(ANSWER_PATTERN);
    if (!answerIndexMatch || answerIndexMatch.index === undefined) {
      throw new Error(`${fileName}: answer section not found.`);
    }

    const contentText = normalized.slice(0, answerIndexMatch.index).trim();
    const answerText = normalized.slice(answerIndexMatch.index).trim();
    const passageBlocks = getPassageBlocks(contentText);
    const answerKey = parseAnswerKey(answerText);

    for (const passageBlock of passageBlocks) {
      if (cliOptions.passageNumber && passageBlock.passageNumber !== cliOptions.passageNumber) {
        continue;
      }

      const passageAnswers = answerKey.get(passageBlock.passageNumber);
      if (!passageAnswers) {
        throw new Error(`${fileName}: missing answers for passage ${passageBlock.passageNumber}.`);
      }

      materials.push(
        await buildMaterial(fileName, meta, passageBlock.passageNumber, passageBlock.raw, passageAnswers),
      );
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    missingFiles,
    materialCount: materials.length,
    materials,
  };
}

export async function main(argv = process.argv.slice(2)) {
  const cliOptions = parseCliOptions(argv);

  try {
    const manifest = await buildImportManifest(cliOptions);

    await fs.mkdir(path.dirname(cliOptions.outputPath), { recursive: true });
    await fs.writeFile(
      cliOptions.outputPath,
      JSON.stringify(manifest, null, 2),
      'utf8',
    );

    console.log(JSON.stringify({
      outputPath: cliOptions.outputPath,
      materialCount: manifest.materialCount,
      missingFiles: manifest.missingFiles,
    }, null, 2));
  } catch (error) {
    writeStructuredError(
      error?.report || {
        code: 'table-completion-import-build-error',
        outputPath: cliOptions.outputPath,
        error: error instanceof Error ? error.message : String(error),
      },
    );
    process.exitCode = 1;
  } finally {
    await closeTableCompletionRuntime();
  }
}

const currentFilePath = fileURLToPath(import.meta.url);

if (process.argv[1] && path.resolve(process.argv[1]) === currentFilePath) {
  main();
}
