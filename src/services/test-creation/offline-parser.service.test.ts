import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OfflineParserService } from './offline-parser.service';

describe('OfflineParserService', () => {
  let service: OfflineParserService;

  beforeEach(() => {
    service = new OfflineParserService();
    (service as any).idbManager = {
      save: vi.fn().mockResolvedValue(undefined),
    };
  });

  it('parses markdown-bold IELTS question numbering in offline fallback', async () => {
    const input = `# Engineering a solution to climate change

## Questions 35-40
**35.** removes carbon dioxide as soon as it is produced
**36.** increases the reflectivity of white clouds
**37.** cleans carbon dioxide from the air naturally`;

    const result = await service.parseOffline(input, 'pasted-content.txt');

    expect(result.questions).toHaveLength(3);
    expect(result.questions.map((question) => question.questionNumber)).toEqual([35, 36, 37]);
    expect(result.questions[0]?.questionText).toContain('removes carbon dioxide');
  });

  it('parses Question-prefixed numbering with text on the next line', async () => {
    const input = `Question 23.
What is the main idea of the passage?

Question 24.
The word magnet in paragraph 1 is closest in meaning to:`;

    const result = await service.parseOffline(input, 'question-prefix.txt');

    expect(result.questions).toHaveLength(2);
    expect(result.questions[0]?.questionText).toBe('What is the main idea of the passage?');
    expect(result.questions[1]?.questionText).toContain('The word magnet');
  });
});
