import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const DEFAULT_URL = 'http://127.0.0.1:5174/__smoke/reading-v2-studio';
const url = process.argv[2] ?? process.env.READING_V2_STUDIO_URL ?? DEFAULT_URL;
const outputDir = path.resolve('output/playwright/task-type-gates');

const taskTypes = [
  ['sentence-completion', 'Sentence Completion'],
  ['summary-completion-text', 'Summary Completion: words from passage'],
  ['summary-completion-list', 'Summary Completion: choose from list'],
  ['note-completion', 'Note Completion'],
  ['table-completion', 'Table Completion'],
  ['flowchart-completion', 'Flowchart Completion'],
  ['diagram-labeling', 'Diagram Labelling'],
  ['true-false-not-given', 'True / False / Not Given'],
  ['yes-no-not-given', 'Yes / No / Not Given'],
  ['matching-headings', 'Matching Headings'],
  ['matching-information', 'Matching Information'],
  ['matching-features', 'Matching Features'],
  ['matching-sentence-endings', 'Matching Sentence Endings'],
  ['multiple-choice', 'Multiple Choice'],
  ['multiple-select', 'Multiple Selection'],
  ['short-answer', 'Short Answer Questions'],
];

const exactText = (value) => new RegExp(`^${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);

const cardFor = (page, label) =>
  page.locator('article.reading-v2-build-card').filter({
    has: page.getByRole('heading', { name: exactText(label) }),
  }).last();

const addQuestionGroup = async (page, label) => {
  await page.getByRole('button', { name: 'Add Question Group' }).first().click();
  await page.getByLabel('Search question types').fill(label);
  await page.getByRole('button', { name: exactText(label) }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await cardFor(page, label).waitFor({ state: 'visible' });
};

const ensureVisible = async (locator, description) => {
  await locator.scrollIntoViewIfNeeded();
  await locator.waitFor({ state: 'visible' });
  return description;
};

const assertSameVisualRow = async (first, second, description) => {
  const [firstBox, secondBox] = await Promise.all([
    first.boundingBox(),
    second.boundingBox(),
  ]);
  if (!firstBox || !secondBox) {
    throw new Error(`${description}: expected both controls to be visible`);
  }
  const overlap = Math.min(firstBox.y + firstBox.height, secondBox.y + secondBox.height)
    - Math.max(firstBox.y, secondBox.y);
  if (overlap <= 0) {
    throw new Error(`${description}: controls must remain on the same visual row`);
  }
};

const fillFirst = async (card, label, value) => {
  const input = card.getByLabel(label).first();
  await input.scrollIntoViewIfNeeded();
  const tagName = await input.evaluate((element) => element.tagName.toLowerCase());
  if (tagName === 'select') {
    await input.selectOption(value);
    return;
  }

  await input.fill(value);
};

const setContentEditableText = async (locator, value) => {
  await locator.scrollIntoViewIfNeeded();
  await locator.evaluate((node, nextValue) => {
    node.textContent = nextValue;
    node.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      data: nextValue,
      inputType: 'insertText',
    }));
  }, value);
};

const clickFirst = async (card, role, options) => {
  const button = card.getByRole(role, options).first();
  await button.scrollIntoViewIfNeeded();
  await button.click();
};

const assertNoVisibleChildOverlap = async (locator, description) => {
  const overlap = await locator.evaluate((root) => {
    const visibleChildren = Array.from(root.children)
      .map((element, index) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return {
          index,
          tagName: element.tagName,
          text: element.textContent?.trim().slice(0, 80) ?? '',
          hidden: style.display === 'none' || style.visibility === 'hidden' || rect.width <= 0 || rect.height <= 0,
          rect: {
            left: rect.left,
            right: rect.right,
            top: rect.top,
            bottom: rect.bottom,
          },
        };
      })
      .filter((item) => !item.hidden);

    for (let leftIndex = 0; leftIndex < visibleChildren.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < visibleChildren.length; rightIndex += 1) {
        const left = visibleChildren[leftIndex];
        const right = visibleChildren[rightIndex];
        const xOverlap = Math.min(left.rect.right, right.rect.right) - Math.max(left.rect.left, right.rect.left);
        const yOverlap = Math.min(left.rect.bottom, right.rect.bottom) - Math.max(left.rect.top, right.rect.top);
        if (xOverlap > 2 && yOverlap > 2) {
          return { left, right, xOverlap, yOverlap };
        }
      }
    }

    return null;
  });

  if (overlap) {
    throw new Error(`${description}: visible children overlap (${overlap.left.text} / ${overlap.right.text})`);
  }
};

const assertCardActionsSingleRow = async (card, description) => {
  const actions = card.locator('.reading-v2-build-card__actions').first();
  await ensureVisible(actions, `${description}: action cluster is visible`);
  const layout = await actions.evaluate((root) => {
    const rootRect = root.getBoundingClientRect();
    const buttonRects = Array.from(root.querySelectorAll('.reading-v2-build-card__action-button')).map((button) => {
      const rect = button.getBoundingClientRect();
      return {
        text: button.textContent?.trim() ?? '',
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      };
    });

    return {
      root: {
        left: rootRect.left,
        right: rootRect.right,
        top: rootRect.top,
        bottom: rootRect.bottom,
        height: rootRect.height,
      },
      buttonRects,
    };
  });

  if (layout.buttonRects.length !== 3) {
    throw new Error(`${description}: expected 3 card action buttons, got ${layout.buttonRects.length}`);
  }

  const topSpread = Math.max(...layout.buttonRects.map((rect) => rect.top)) - Math.min(...layout.buttonRects.map((rect) => rect.top));
  if (topSpread > 2) {
    throw new Error(`${description}: Edit, Duplicate, Delete must stay on one row`);
  }

  const maxButtonHeight = Math.max(...layout.buttonRects.map((rect) => rect.height));
  if (layout.root.height > maxButtonHeight + 4) {
    throw new Error(`${description}: action cluster is taller than one button row`);
  }
};

const runCompletionGate = async (card, id) => {
  await ensureVisible(card.getByLabel(/dedicated editor$/), `${id}: dedicated editor is visible`);
  const legacyBeforeAfterCount = await card.getByLabel(/Question \d+ text (before|after) blank/).count();
  if (legacyBeforeAfterCount > 0) {
    throw new Error(`${id}: should not expose before/after sentence fields`);
  }
  const sentenceField = card.getByLabel(/Question \d+ sentence text/).first();
  await sentenceField.fill('The sentence completion row keeps context in one text field');
  await sentenceField.focus();
  await sentenceField.evaluate((element) => {
    element.selectionStart = element.value.length;
    element.selectionEnd = element.value.length;
  });
  await clickFirst(card, 'button', { name: /Insert blank for Question \d+/ });
  const sentenceValue = await sentenceField.inputValue();
  if (!sentenceValue.includes('_____')) {
    throw new Error(`${id}: inserted blank marker must live inside sentence text`);
  }
  const perQuestionWordLimitCount = await card.getByLabel(/Word limit for Question \d+/).count();
  if (perQuestionWordLimitCount > 0) {
    throw new Error(`${id}: word limit must be group-level, not per question`);
  }
  await fillFirst(card, 'Sentence completion word limit', '3');
  await fillFirst(card, /Accepted answers for Question \d+/, 'answer | alternative');
  await clickFirst(card, 'button', { name: 'Add blank' });
};

const runSummaryTextGate = async (page, card, id) => {
  await ensureVisible(card.getByLabel('Summary Completion: words from passage dedicated editor'), `${id}: dedicated editor is visible`);
  const summaryBody = card.getByLabel('Summary completion text body').first();
  await ensureVisible(summaryBody, `${id}: continuous summary body is visible`);
  const rowFieldCount = await card.getByLabel(/Question \d+ text before blank/).count();
  if (rowFieldCount > 0) {
    throw new Error(`${id}: should not expose separate before/after blank row fields`);
  }
  await setContentEditableText(summaryBody, 'The free-text summary keeps [1] inline with its context and continues to [2] in the same body.');
  await page.setViewportSize({ width: 874, height: 876 });
  await card.scrollIntoViewIfNeeded();
  const missingAnswerRow = card.locator('.reading-v2-summary-list-editor__answer-row').filter({ hasText: 'Add the answer for this blank.' }).first();
  await ensureVisible(missingAnswerRow, `${id}: missing answer row remains visible at annotated width`);
  await assertNoVisibleChildOverlap(missingAnswerRow, `${id}: free-text answer row layout at 874px`);
  await missingAnswerRow.screenshot({ path: path.join(outputDir, `${id}-answer-row-responsive-gate.png`) });
  await page.setViewportSize({ width: 1366, height: 900 });
  await fillFirst(card, /Accepted answers for Question \d+/, 'summary answer | alternative');
  await fillFirst(card, 'Summary completion word limit', '3');
  await clickFirst(card, 'button', { name: 'Insert Blank' });
};

const runSummaryListGate = async (card, id) => {
  await ensureVisible(card.getByLabel(/dedicated editor$/), `${id}: dedicated editor is visible`);
  const summaryBody = card.getByLabel('Summary completion list body').first();
  await ensureVisible(summaryBody, `${id}: continuous summary body is visible`);
  const rowFieldCount = await card.getByLabel(/Question \d+ text before blank/).count();
  if (rowFieldCount > 0) {
    throw new Error(`${id}: should not expose separate before/after blank row fields`);
  }
  await ensureVisible(card.getByLabel('Option H text'), `${id}: word bank supports unused distractor options`);
  await fillFirst(card, 'Option H text', 'unused distractor');
  await clickFirst(card, 'button', { name: 'Add option' });
  await clickFirst(card, 'button', { name: 'Add option' });
  await ensureVisible(card.getByLabel('Option J text'), `${id}: word bank can grow to A-J clipping shape`);
  await fillFirst(card, 'Option J text', 'extra clipping distractor');
  await setContentEditableText(summaryBody, 'The summary chooses [1] from the list, then chooses [2] with another distractor still unused.');
  const answerSelect = card.getByLabel(/Answer key for Question \d+/).first();
  await answerSelect.scrollIntoViewIfNeeded();
  await answerSelect.selectOption('A');
  await clickFirst(card, 'button', { name: 'Insert Blank' });
};

const runNoteGate = async (card) => {
  await ensureVisible(card.getByLabel('Note Completion dedicated editor'), 'note-completion: dedicated editor is visible');
  await fillFirst(card, 'Note completion heading', 'FOUNDATIONAL NOTE STRUCTURE');
  await fillFirst(card, 'Note completion word limit', '2');
  const legacyBeforeAfterCount = await card.getByLabel(/Question \d+ note text (before|after) blank/).count();
  if (legacyBeforeAfterCount > 0) {
    throw new Error('note-completion: should not expose before/after blank note fields');
  }
  const noteField = card.getByLabel(/Question \d+ note text/).first();
  await noteField.fill('Before note blank');
  await noteField.focus();
  await noteField.evaluate((element) => {
    element.selectionStart = element.value.length;
    element.selectionEnd = element.value.length;
  });
  await clickFirst(card, 'button', { name: /Insert blank for Question \d+/ });
  const noteValue = await noteField.inputValue();
  if (!noteValue.includes('_____')) {
    throw new Error('note-completion: inserted blank marker must live inside note text');
  }
  await ensureVisible(card.getByRole('button', { name: /Bold note text for Question \d+/ }).first(), 'note-completion: bold formatting control is visible');
  await ensureVisible(card.getByRole('button', { name: /Italic note text for Question \d+/ }).first(), 'note-completion: italic formatting control is visible');
  await ensureVisible(card.getByRole('button', { name: /Underline note text for Question \d+/ }).first(), 'note-completion: underline formatting control is visible');
  await ensureVisible(card.getByRole('button', { name: /Add bullet line for Question \d+/ }).first(), 'note-completion: bullet formatting control is visible');
  await fillFirst(card, /Accepted answers for Question \d+/, 'note answer');
  await clickFirst(card, 'button', { name: 'Add note blank' });
};

const runTableGate = async (card) => {
  await ensureVisible(card.getByLabel('Table Completion Builder'), 'table-completion: table builder is visible');
  await fillFirst(card, 'Table title', 'Foundation Table');
  await clickFirst(card, 'button', { name: 'Paste' });
  const pasteDialog = card.getByRole('dialog', { name: 'Paste Table' });
  await ensureVisible(pasteDialog, 'table-completion: paste table modal is visible');
  await pasteDialog.getByLabel('Paste table from spreadsheet').fill('Feature\tDetail\nPlant\t_____');
  await pasteDialog.getByRole('button', { name: 'Apply Pasted Table' }).click();
  await ensureVisible(card.getByLabel('Table cell 2.2 text'), 'table-completion: pasted inline blank cell is visible');
  const clearSelection = card.getByRole('button', { name: 'Clear selection' }).first();
  if (await clearSelection.isEnabled()) {
    await clearSelection.click();
  }
  await clickFirst(card, 'button', { name: 'Select Cells' });
  await card.getByLabel('Table cell 1.1 text').click();
  await card.getByLabel('Table cell 1.2 text').click();
  await ensureVisible(card.getByRole('status', { name: /Ready to merge into one table cell/ }), 'table-completion: merge readiness indicator is visible');
  await clickFirst(card, 'button', { name: 'Merge' });
  const mergedHeaderValue = await card.getByLabel('Table cell 1.1 text').inputValue();
  if (mergedHeaderValue !== 'Feature Detail') {
    throw new Error(`table-completion: merged header cell should preserve both source texts, got "${mergedHeaderValue}"`);
  }
  const selectCellsToggle = card.getByRole('button', { name: 'Select Cells' }).first();
  if ((await selectCellsToggle.getAttribute('aria-pressed')) === 'true') {
    await selectCellsToggle.click();
  }
  await card.getByLabel('Table cell 1.1 text').click();
  await ensureVisible(card.getByRole('button', { name: 'Split' }), 'table-completion: split control is visible after merge');
  await clickFirst(card, 'button', { name: 'Split' });
  const splitHeaderFirstValue = await card.getByLabel('Table cell 1.1 text').inputValue();
  const splitHeaderSecondValue = await card.getByLabel('Table cell 1.2 text').inputValue();
  if (splitHeaderFirstValue !== 'Feature' || splitHeaderSecondValue !== 'Detail') {
    throw new Error('table-completion: split must restore header source text after merge');
  }
  if (await clearSelection.isEnabled()) {
    await clearSelection.click();
  }
  if ((await selectCellsToggle.getAttribute('aria-pressed')) !== 'true') {
    await selectCellsToggle.click();
  }
  await card.getByLabel('Table cell 2.1 text').click();
  await card.getByLabel('Table cell 2.2 text').click();
  await clickFirst(card, 'button', { name: 'Merge' });
  const mergedBlankValue = await card.getByLabel('Table cell 2.1 text').inputValue();
  if (!mergedBlankValue.includes('Plant') || !mergedBlankValue.includes('_____')) {
    throw new Error('table-completion: merged blank row must preserve source text and inline blank marker');
  }
  if ((await selectCellsToggle.getAttribute('aria-pressed')) === 'true') {
    await selectCellsToggle.click();
  }
  await card.getByLabel('Table cell 2.1 text').click();
  await clickFirst(card, 'button', { name: 'Split' });
  const splitBlankFirstValue = await card.getByLabel('Table cell 2.1 text').inputValue();
  const splitBlankSecondValue = await card.getByLabel('Table cell 2.2 text').inputValue();
  if (splitBlankFirstValue !== 'Plant' || !splitBlankSecondValue.includes('_____')) {
    throw new Error('table-completion: split must restore blank marker to original table cell');
  }
  if (await clearSelection.isEnabled()) {
    await clearSelection.click();
  }
  await card.getByLabel('Table cell 1.1 text').click();
  await clickFirst(card, 'button', { name: 'Insert blank' });
  const updatedCellValue = await card.getByLabel('Table cell 1.1 text').inputValue();
  if (!updatedCellValue.includes('_____')) {
    throw new Error('table-completion: inserted blank marker must live inside the table cell text');
  }
  await fillFirst(card, /Correct answers for Question \d+/, 'table answer');
  const studentPreview = card.locator('section[aria-label="Student Preview"]');
  const previewBeforeOpen = await studentPreview.count();
  if (previewBeforeOpen > 0) {
    throw new Error('table-completion: student preview should be collapsed by default');
  }
  await clickFirst(card, 'button', { name: 'Show student preview' });
  await ensureVisible(studentPreview, 'table-completion: student preview is visible');
};

const runFlowchartGate = async (card) => {
  await ensureVisible(card.getByLabel('Flowchart Completion dedicated editor'), 'flowchart-completion: dedicated editor is visible');
  await fillFirst(card, 'Flowchart title', 'Foundation Flowchart');
  await fillFirst(card, 'Flowchart step 1 text', 'Start');
  await fillFirst(card, /Flowchart answer for Question \d+/, 'flow answer');
  await clickFirst(card, 'button', { name: 'Add Step' });
};

const runDiagramGate = async (card) => {
  await ensureVisible(card.getByLabel('Diagram Labelling dedicated editor'), 'diagram-labeling: dedicated editor is visible');
  await fillFirst(card, 'Diagram title', 'Foundation Diagram');
  if (await card.getByLabel('Diagram image alt text').count() > 0) {
    throw new Error('diagram-labeling: alt text must not be a teacher-facing field');
  }
  if (await card.getByRole('button', { name: /Drag diagram label Question/ }).count() > 0) {
    throw new Error('diagram-labeling: diagram image already carries target indicators; no draggable callouts allowed');
  }
  await clickFirst(card, 'button', { name: 'Upload file' });
  await ensureVisible(card.getByLabel('Diagram image file'), 'diagram-labeling: upload-file source is available');
  await clickFirst(card, 'button', { name: 'Use URL' });
  await fillFirst(card, 'Diagram image URL', 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 120"><rect width="200" height="120" fill="white"/><circle cx="80" cy="60" r="30" fill="none" stroke="black"/></svg>');
  await ensureVisible(card.getByLabel('Diagram image preview'), 'diagram-labeling: diagram preview is visible');
  if (await card.getByLabel(/Diagram target label for Question \d+/).count() > 0) {
    throw new Error('diagram-labeling: target-label text fields are not part of this maker');
  }
  if (await card.getByLabel(/Question \d+ x position/).count() > 0 || await card.getByLabel(/Question \d+ y position/).count() > 0) {
    throw new Error('diagram-labeling: coordinate controls are hidden implementation details now');
  }
  await fillFirst(card, /Diagram answer for Question \d+/, 'diagram answer');
  await clickFirst(card, 'button', { name: 'Add answer field' });
  const answerFields = card.getByLabel(/Diagram answer for Question \d+/);
  if (await answerFields.count() < 2) {
    throw new Error('diagram-labeling: Add answer field must create another answer-key input');
  }
  await answerFields.last().fill('second diagram answer');
  const answerCountAfterAdd = await answerFields.count();
  await card.getByRole('button', { name: /Delete answer field for Question \d+/ }).last().click();
  if (await answerFields.count() !== answerCountAfterAdd - 1) {
    throw new Error('diagram-labeling: Delete answer field must remove one answer-key input');
  }
};

const runJudgementGate = async (card, id, firstAnswer) => {
  await ensureVisible(card.getByLabel(/dedicated editor$/), `${id}: dedicated editor is visible`);
  await fillFirst(card, /Statement \d+ text/, `${id} statement text`);
  await clickFirst(card, 'button', { name: firstAnswer });
  await clickFirst(card, 'button', { name: /Add Statement/ });
};

const runMatchingGate = async (card, id) => {
  await ensureVisible(card.getByLabel(/dedicated editor$/), `${id}: dedicated editor is visible`);
  const optionTable = card.locator('.reading-v2-build-options--table table').first();
  await ensureVisible(optionTable, `${id}: matching option bank uses compact table layout`);
  const tableMetrics = await optionTable.evaluate((table) => {
    const firstRow = table.querySelector('tbody tr');
    const labelCell = firstRow?.children?.[0];
    const textInput = firstRow?.querySelector('input[aria-label*=" text"]');
    const labelWidth = labelCell?.getBoundingClientRect().width ?? 0;
    const textWidth = textInput?.getBoundingClientRect().width ?? 0;
    return {
      tagName: table.tagName,
      labelText: labelCell?.textContent?.trim() ?? '',
      labelWidth,
      textWidth,
      visibleRowText: firstRow?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    };
  });
  if (tableMetrics.tagName !== 'TABLE') {
    throw new Error(`${id}: matching option bank must be a semantic table`);
  }
  if (/^(Option|Feature|Ending|Paragraph)\s/i.test(tableMetrics.labelText)) {
    throw new Error(`${id}: option-bank row labels must be concise to leave room for fields`);
  }
  if (tableMetrics.textWidth < 220 || tableMetrics.textWidth <= tableMetrics.labelWidth * 3) {
    throw new Error(`${id}: option text field is too narrow for the matching bank table`);
  }
  if (id === 'matching-headings' && /Paragraph or section\s+Paragraph or section/i.test(tableMetrics.visibleRowText)) {
    throw new Error(`${id}: repeated source labels consume row width`);
  }

  if (id === 'matching-headings') {
    await ensureVisible(card.getByLabel('Roman numeral heading list for Matching Headings'), `${id}: roman heading bank is visible`);
    const optionAnswerControls = await card.getByLabel(/Answer key for option/).count();
    if (optionAnswerControls > 0) {
      throw new Error(`${id}: heading options must not own answer keys`);
    }
    const rowAnswerSelects = await card.getByLabel(/Correct match for Question \d+/).count();
    if (rowAnswerSelects > 0) {
      throw new Error(`${id}: answer-key rows should be folded into option source fields`);
    }
    const headingOptionCount = await card.getByLabel(/Option [ivx]+ text/).count();
    const sourceFieldCount = await card.getByLabel(/Paragraph or section for option [ivx]+/).count();
    if (headingOptionCount !== sourceFieldCount) {
      throw new Error(`${id}: every heading option needs one source field so empty source means distractor`);
    }
    await fillFirst(card, /Paragraph or section for option [ivx]+/, `${id} paragraph row`);
  } else if (id === 'matching-information') {
    await ensureVisible(card.getByLabel('Paragraph choices for Matching Information'), `${id}: paragraph bank is visible`);
    await ensureVisible(card.getByLabel('Option H text'), `${id}: paragraph bank supports A-H clipping shape`);
    await ensureVisible(card.getByLabel('Information statements for option H'), `${id}: empty paragraph source field marks unused paragraph`);
    await ensureVisible(card.getByText('Reuse paragraphs'), `${id}: paragraph reuse control is task-native`);
    await fillFirst(card, 'Information statements for option H', `${id} information statement\n${id} second reused paragraph statement`);
    await clickFirst(card, 'button', { name: 'Add paragraph' });
    await ensureVisible(card.getByLabel('Option I text'), `${id}: paragraph bank can grow beyond A-H`);
  } else if (id === 'matching-features') {
    await ensureVisible(card.getByLabel('Feature list for Matching Features'), `${id}: feature bank is visible`);
    await ensureVisible(card.getByLabel('Option E text'), `${id}: feature bank supports A-E clipping shape`);
    if (await card.getByLabel(/Feature statements for option/).count() > 0) {
      throw new Error(`${id}: feature bank must not squeeze statement text into each feature option row`);
    }
    await ensureVisible(card.getByLabel('Feature statements for Matching Features'), `${id}: statements are split below the feature bank`);
    await fillFirst(card, /Statement for Question \d+/, `${id} feature statement`);
    await card.getByLabel(/Correct match for Question \d+/).first().selectOption('E');
    await ensureVisible(card.getByText('Reuse features'), `${id}: feature reuse control is task-native`);
    const statementCountBefore = await card.getByLabel(/Statement for Question \d+/).count();
    await clickFirst(card, 'button', { name: 'Add statement' });
    if (await card.getByLabel(/Statement for Question \d+/).count() !== statementCountBefore + 1) {
      throw new Error(`${id}: Add statement must create a separate mapped statement row`);
    }
    await clickFirst(card, 'button', { name: 'Add feature' });
    await ensureVisible(card.getByLabel('Option F text'), `${id}: feature bank can grow beyond A-E`);
    await clickFirst(card, 'button', { name: 'Remove option F' });
    await card.getByLabel('Option F text').waitFor({ state: 'detached', timeout: 1000 }).catch(() => {});
    if (await card.getByLabel('Option F text').count() > 0) {
      throw new Error(`${id}: newly added feature can be removed from the compact bank`);
    }
  } else if (id === 'matching-sentence-endings') {
    await ensureVisible(card.getByLabel('Ending options for Matching Sentence Endings'), `${id}: ending bank is visible`);
    await ensureVisible(card.getByLabel('Option G text'), `${id}: ending bank supports A-G clipping shape`);
    if (await card.getByLabel(/Sentence beginning for option/).count() > 0) {
      throw new Error(`${id}: ending bank must not squeeze sentence beginnings into each ending row`);
    }
    await ensureVisible(card.getByLabel('Sentence beginnings for Matching Sentence Endings'), `${id}: sentence beginnings are split below the ending bank`);
    await fillFirst(card, /Sentence beginning for Question \d+/, `${id} sentence beginning`);
    await card.getByLabel(/Correct match for Question \d+/).first().selectOption('C');
    await ensureVisible(card.getByText('Reuse endings'), `${id}: ending reuse control is task-native`);
    const beginningCountBefore = await card.getByLabel(/Sentence beginning for Question \d+/).count();
    await clickFirst(card, 'button', { name: 'Add sentence beginning' });
    if (await card.getByLabel(/Sentence beginning for Question \d+/).count() !== beginningCountBefore + 1) {
      throw new Error(`${id}: Add sentence beginning must create a separate mapped beginning row`);
    }
    await clickFirst(card, 'button', { name: 'Add ending' });
    await ensureVisible(card.getByLabel('Option H text'), `${id}: ending bank can grow beyond A-G`);
    await clickFirst(card, 'button', { name: 'Remove option H' });
    await card.getByLabel('Option H text').waitFor({ state: 'detached', timeout: 1000 }).catch(() => {});
    if (await card.getByLabel('Option H text').count() > 0) {
      throw new Error(`${id}: newly added ending can be removed from the compact bank`);
    }
  } else {
    await fillFirst(card, /for option/, `${id} source row`);
  }
  const optionAnswerControls = await card.getByLabel(/Answer key for option/).count();
  if (optionAnswerControls > 0) {
    throw new Error(`${id}: option bank rows must not own answer keys`);
  }
  if ((id === 'matching-headings' || id === 'matching-information') && await card.getByLabel(/Correct match for Question \d+/).count() > 0) {
    throw new Error(`${id}: source-owned matching tasks should not expose separate answer selects`);
  }
  await clickFirst(card, 'button', { name: 'Allowed' });
  if ((id === 'matching-headings' || id === 'matching-information') && await card.locator('textarea[aria-label*="for option"]').count() === 0) {
    throw new Error(`${id}: allowed reuse should turn option source into a multi-line field`);
  }
  await clickFirst(card, 'button', { name: 'No reuse' });

  if (id === 'matching-headings' || id === 'matching-information') {
    const removableOption = id === 'matching-headings' ? 'iii' : 'H';
    await clickFirst(card, 'button', { name: `Remove option ${removableOption}` });
    if (await card.getByLabel(new RegExp(`for option ${removableOption}$`)).count() > 0) {
      throw new Error(`${id}: deleting a bank option must remove its folded source field`);
    }
  }
};

const assertNoVisibleInlineErrors = async (card, description) => {
  const errors = card.locator('.reading-v2-task-editor__error');
  const count = await errors.count();
  for (let index = 0; index < count; index += 1) {
    if (await errors.nth(index).isVisible()) {
      throw new Error(`${description}: inline error text should not consume visible space`);
    }
  }
};

const runChoiceGate = async (page, card, id, multiple) => {
  await ensureVisible(card.getByLabel(/dedicated editor$/), `${id}: dedicated editor is visible`);
  if (multiple) {
    const countInPromptRow = await card.getByLabel(/Selection count for Question \d+/).first().evaluate((input) =>
      Boolean(input.closest('.reading-v2-choice-editor__prompt-row--with-count')),
    );
    if (!countInPromptRow) {
      throw new Error(`${id}: selection-count control must share the prompt row`);
    }
  }
  await fillFirst(card, /Question \d+ question text/, `${id} question text`);
  await fillFirst(card, /Question \d+ option A/, `${id} option A`);
  await card.getByLabel(/Mark option A correct for Question \d+/).first().check({ force: true });
  if (multiple) {
    await card.getByLabel(/Mark option B correct for Question \d+/).first().check({ force: true });
  }
  await clickFirst(card, 'button', { name: 'Add option' });
  const firstQuestion = card.locator('.reading-v2-choice-editor__question').first();
  const actionsInSameRow = await firstQuestion.evaluate((question) => {
    const addOption = Array.from(question.querySelectorAll('button')).find((button) => button.textContent?.trim() === 'Add option');
    const deleteQuestion = Array.from(question.querySelectorAll('button')).find((button) => button.textContent?.trim() === 'Delete question');
    return Boolean(addOption && deleteQuestion && addOption.closest('.reading-v2-choice-editor__row-actions') === deleteQuestion.closest('.reading-v2-choice-editor__row-actions'));
  });
  if (!actionsInSameRow) {
    throw new Error(`${id}: Add option and Delete question must share one action row`);
  }
  await assertSameVisualRow(
    firstQuestion.getByRole('button', { name: 'Add option' }),
    firstQuestion.getByRole('button', { name: 'Delete question' }),
    `${id}: Add option and Delete question visual row`,
  );
  if (multiple) {
    await assertSameVisualRow(
      firstQuestion.getByLabel(/Question \d+ question text/),
      firstQuestion.getByLabel(/Selection count for Question \d+/),
      `${id}: prompt and selection count visual row`,
    );
  }
  await page.setViewportSize({ width: 640, height: 900 });
  await firstQuestion.scrollIntoViewIfNeeded();
  await assertSameVisualRow(
    firstQuestion.getByRole('button', { name: 'Add option' }),
    firstQuestion.getByRole('button', { name: 'Delete question' }),
    `${id}: Add option and Delete question mobile visual row`,
  );
  if (multiple) {
    await assertSameVisualRow(
      firstQuestion.getByLabel(/Question \d+ question text/),
      firstQuestion.getByLabel(/Selection count for Question \d+/),
      `${id}: prompt and selection count mobile visual row`,
    );
  }
  await page.setViewportSize({ width: 1366, height: 900 });
  await firstQuestion.scrollIntoViewIfNeeded();
  await assertNoVisibleInlineErrors(card, `${id}: validation highlight`);
  await clickFirst(card, 'button', { name: 'Add Question' });
};

const runShortAnswerGate = async (page, card) => {
  await ensureVisible(card.getByLabel('Short Answer Questions dedicated editor'), 'short-answer: dedicated editor is visible');
  await fillFirst(card, 'Short Answer Questions word limit', '3');
  if (await card.getByLabel(/Word limit for Question \d+/).count() > 0) {
    throw new Error('short-answer: word limit must be shared by the whole group');
  }
  const primaryRowLayout = await card.getByLabel(/Primary answer for Question \d+/).first().evaluate((input) =>
    Boolean(input.closest('.reading-v2-short-answer-editor__primary-row')?.querySelector('button')),
  );
  if (!primaryRowLayout) {
    throw new Error('short-answer: Add accepted answer must sit beside the primary answer field');
  }
  await assertSameVisualRow(
    card.getByLabel(/Primary answer for Question \d+/).first(),
    card.getByRole('button', { name: 'Add accepted answer' }).first(),
    'short-answer: primary answer and Add accepted answer visual row',
  );
  await page.setViewportSize({ width: 640, height: 900 });
  await card.scrollIntoViewIfNeeded();
  await assertSameVisualRow(
    card.getByLabel(/Primary answer for Question \d+/).first(),
    card.getByRole('button', { name: 'Add accepted answer' }).first(),
    'short-answer: primary answer and Add accepted answer mobile visual row',
  );
  await page.setViewportSize({ width: 1366, height: 900 });
  await card.scrollIntoViewIfNeeded();
  await assertNoVisibleInlineErrors(card, 'short-answer: validation highlight');
  await fillFirst(card, /Question \d+ short answer prompt/, 'Short answer prompt');
  await fillFirst(card, /Primary answer for Question \d+/, 'primary answer');
  await clickFirst(card, 'button', { name: 'Add accepted answer' });
  await fillFirst(card, /Alternative 1 for Question \d+/, 'alternative answer');
  await clickFirst(card, 'button', { name: 'Add Question' });
};

const runTaskGate = async (page, id, label) => {
  let card = cardFor(page, label);
  await page.setViewportSize({ width: 1208, height: 876 });
  await card.scrollIntoViewIfNeeded();
  await assertCardActionsSingleRow(card, `${id}: card actions at 1208px`);
  if (id === 'summary-completion-text') {
    await card.locator('.reading-v2-build-card__actions').first().screenshot({
      path: path.join(outputDir, `${id}-card-actions-single-row-gate.png`),
    });
  }
  await page.setViewportSize({ width: 1366, height: 900 });
  card = cardFor(page, label);
  await card.scrollIntoViewIfNeeded();
  await ensureVisible(card.getByRole('button', { name: `Edit ${label}` }), `${id}: edit action is visible`);
  const duplicateButton = card.getByRole('button', { name: 'Duplicate' }).first();
  await ensureVisible(duplicateButton, `${id}: duplicate action is visible`);
  if (await duplicateButton.isDisabled()) {
    throw new Error(`${id}: duplicate action must be enabled and create a copied group`);
  }
  const matchingCards = page.locator('article.reading-v2-build-card').filter({
    has: page.getByRole('heading', { name: exactText(label) }),
  });
  const beforeDuplicateCount = await matchingCards.count();
  await duplicateButton.click();
  await matchingCards.nth(beforeDuplicateCount).waitFor({ state: 'visible' });
  const afterDuplicateCount = await matchingCards.count();
  if (afterDuplicateCount !== beforeDuplicateCount + 1) {
    throw new Error(`${id}: duplicate action should create exactly one copied group`);
  }
  card = cardFor(page, label);
  await clickFirst(card, 'button', { name: 'Delete' });
  await ensureVisible(card.getByText(new RegExp(`Delete this ${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} group\\?`)), `${id}: delete confirmation is visible`);
  await clickFirst(card, 'button', { name: 'Keep group' });

  if (id === 'sentence-completion') {
    await runCompletionGate(card, id);
  } else if (id === 'summary-completion-text') {
    await runSummaryTextGate(page, card, id);
  } else if (id === 'summary-completion-list') {
    await runSummaryListGate(card, id);
  } else if (id === 'note-completion') {
    await runNoteGate(card);
  } else if (id === 'table-completion') {
    await runTableGate(card);
  } else if (id === 'flowchart-completion') {
    await runFlowchartGate(card);
  } else if (id === 'diagram-labeling') {
    await runDiagramGate(card);
  } else if (id === 'true-false-not-given') {
    await runJudgementGate(card, id, 'TRUE');
  } else if (id === 'yes-no-not-given') {
    await runJudgementGate(card, id, 'YES');
  } else if (id.startsWith('matching-')) {
    await runMatchingGate(card, id);
  } else if (id === 'multiple-choice') {
    await runChoiceGate(page, card, id, false);
  } else if (id === 'multiple-select') {
    await runChoiceGate(page, card, id, true);
  } else if (id === 'short-answer') {
    await runShortAnswerGate(page, card);
  }
};

const main = async () => {
  await mkdir(outputDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  page.setDefaultTimeout(15000);
  const consoleMessages = [];
  page.on('console', (message) => {
    consoleMessages.push({ type: message.type(), text: message.text() });
  });

  const results = [];
  const writeSummary = async (partial = false) => {
    const relevantConsole = consoleMessages.filter((message) =>
      message.type === 'error'
      && !message.text.includes('Firebase')
      && !message.text.includes('analytics')
      && !message.text.includes('installations')
      && !message.text.includes('the server responded with a status of 403'),
    );
    const summary = {
      url,
      generatedAt: new Date().toISOString(),
      partial,
      total: results.length,
      passed: results.filter((result) => result.status === 'passed').length,
      failed: results.filter((result) => result.status === 'failed').length,
      allPassed: !partial && results.every((result) => result.status === 'passed') && relevantConsole.length === 0,
      results,
      relevantConsole,
    };

    await writeFile(
      path.join(outputDir, 'all-task-types-foundation-interaction-gate.json'),
      `${JSON.stringify(summary, null, 2)}\n`,
      'utf8',
    );

    return summary;
  };

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.getByRole('button', { name: exactText('Add Passage') }).click();
    await ensureVisible(page.getByLabel('Passage 2 editor'), 'workspace: add passage creates an editable passage');
    await page.getByRole('button', { name: 'Remove Passage 2' }).click();
    await ensureVisible(page.getByLabel('Passage 1 editor'), 'workspace: remove passage returns to Passage 1');
    await page.getByLabel('Passage title').fill('Foundation browser gate passage');
    await page.getByRole('button', { name: 'Add table' }).click();
    const passageDraft = await page.getByLabel('Passage editor').textContent();
    if (!passageDraft?.includes('Header')) {
      throw new Error('workspace: passage editor table insertion did not update the passage text');
    }
    await page.getByLabel('Passage editor').fill('A passage for the Reading V2 task type browser gate.');

    for (const [, label] of taskTypes) {
      await addQuestionGroup(page, label);
    }

    await page.screenshot({ path: path.join(outputDir, 'all-task-types-foundation-inventory.png'), fullPage: true });

    for (const [id, label] of taskTypes) {
      const startedAt = new Date().toISOString();
      try {
        await runTaskGate(page, id, label);
        await cardFor(page, label).screenshot({ path: path.join(outputDir, `${id}-foundation-gate.png`) });
        results.push({ id, label, status: 'passed', startedAt, finishedAt: new Date().toISOString() });
      } catch (error) {
        await page.screenshot({ path: path.join(outputDir, `${id}-foundation-gate-failure.png`), fullPage: true });
        results.push({
          id,
          label,
          status: 'failed',
          startedAt,
          finishedAt: new Date().toISOString(),
          error: error instanceof Error ? error.message : String(error),
        });
      }
      await writeSummary(true);
    }

    await page.screenshot({
      path: path.join(outputDir, 'all-task-types-foundation-after-interactions.png'),
      fullPage: false,
      timeout: 30000,
    });
  } finally {
    await browser.close();
  }

  const summary = await writeSummary(false);

  if (!summary.allPassed) {
    throw new Error(`Reading V2 task type foundation gate failed: ${summary.failed} task failure(s), ${summary.relevantConsole.length} console error(s).`);
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
