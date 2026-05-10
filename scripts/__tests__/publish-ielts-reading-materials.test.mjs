import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockFs = vi.hoisted(() => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
}));

const mockExecFileSync = vi.hoisted(() => vi.fn());
const mockBuildReadingTestData = vi.hoisted(() => vi.fn());
const mockBuildStudentSafeTestData = vi.hoisted(() => vi.fn());
const mockBuildTableCompletionPublishReport = vi.hoisted(() => vi.fn());
const mockAssertSupportedQuestionGroups = vi.hoisted(() => vi.fn());
const mockCloseTableCompletionRuntime = vi.hoisted(() => vi.fn());

vi.mock('node:fs/promises', () => ({
  default: mockFs,
  ...mockFs,
}));

vi.mock('node:child_process', () => ({
  execFileSync: mockExecFileSync,
}));

vi.mock('../ielts-reading-materials-firebase.mjs', () => ({
  assertSupportedQuestionGroups: mockAssertSupportedQuestionGroups,
  buildReadingTestData: mockBuildReadingTestData,
  buildStudentSafeTestData: mockBuildStudentSafeTestData,
  buildTableCompletionPublishReport: mockBuildTableCompletionPublishReport,
}));

vi.mock('../table-completion-runtime.mjs', () => ({
  closeTableCompletionRuntime: mockCloseTableCompletionRuntime,
}));

describe('publish-ielts-reading-materials', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.resetModules();
    process.exitCode = 0;
  });

  it('fails closed on schema rejection before any filesystem write or publish call', async () => {
    mockFs.readFile.mockResolvedValue(JSON.stringify({
      materials: [
        {
          title: 'Blocked material',
          sourceFile: 'Practice Cam 17 Reading Test 04.md',
          passageNumber: 1,
          questionGroups: [{ schemaVersion: 2 }],
        },
      ],
    }));
    mockAssertSupportedQuestionGroups.mockImplementation(() => {
      throw new Error('Unsupported table-completion schemaVersion 2 for group "broken-group".');
    });
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    const { publishMaterials } = await import('../publish-ielts-reading-materials.mjs');
    const result = await publishMaterials({
      manifestPath: 'manifest.json',
      createdBy: 'teacher-1',
      ownerId: 'teacher-1',
      isPublic: true,
    });

    expect(result).toEqual([]);
    expect(process.exitCode).toBe(1);
    expect(mockFs.mkdir).not.toHaveBeenCalled();
    expect(mockFs.writeFile).not.toHaveBeenCalled();
    expect(mockExecFileSync).not.toHaveBeenCalled();
    expect(stderrSpy).toHaveBeenCalledWith(
      expect.stringContaining('"kind": "schema-rejection"'),
    );
  });

  it('writes canonical and student-safe payloads only after validation passes', async () => {
    const manifest = {
      materials: [
        {
          title: 'Publishable material',
          sourceFile: 'Practice Cam 17 Reading Test 04.md',
          passageNumber: 1,
          questionGroups: [],
        },
      ],
    };
    const canonicalTest = {
      id: 'test-1',
      title: 'Publishable material',
      ownerId: 'teacher-1',
      createdBy: 'teacher-1',
      isPublic: true,
    };

    mockFs.readFile.mockResolvedValue(JSON.stringify(manifest));
    mockBuildTableCompletionPublishReport.mockResolvedValue({
      diagnostics: [],
      highestSeverity: 'none',
      hasBlocking: false,
      hasAcknowledgementRequired: false,
      isPublishable: true,
    });
    mockBuildReadingTestData.mockResolvedValue(canonicalTest);
    mockBuildStudentSafeTestData.mockResolvedValue({ id: 'test-1', title: 'student-safe' });

    const { publishMaterials } = await import('../publish-ielts-reading-materials.mjs');
    const result = await publishMaterials({
      manifestPath: 'manifest.json',
      outputPath: 'published.json',
      createdBy: 'teacher-1',
      ownerId: 'teacher-1',
      isPublic: true,
    });

    expect(result).toEqual([canonicalTest]);
    expect(process.exitCode).toBe(0);
    expect(mockFs.mkdir).toHaveBeenCalled();
    expect(mockFs.writeFile).toHaveBeenCalledTimes(3);
    expect(mockExecFileSync).toHaveBeenCalledTimes(2);
    expect(mockExecFileSync).toHaveBeenNthCalledWith(
      1,
      'cmd',
      expect.arrayContaining(['/tests/test-1']),
      expect.any(Object),
    );
    expect(mockExecFileSync).toHaveBeenNthCalledWith(
      2,
      'cmd',
      expect.arrayContaining(['/student_safe_tests/test-1']),
      expect.any(Object),
    );
  });
});
