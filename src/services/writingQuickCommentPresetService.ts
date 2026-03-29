import { doc, getDoc, setDoc } from 'firebase/firestore';
// @ts-ignore - JS firebase module
import { firestore as db } from './firebase';
import { deepRemoveUndefined } from './draftCloudService';
import { withRestoreGuard } from './restoreGuard';
import {
    COMMENT_CATEGORIES,
    type CommentCategoryId,
    type QuickCommentPreset,
} from '../types/ielts-writing.types';

const PRESET_DOC_ID = 'writingQuickCommentPresets';

export const DEFAULT_QUICK_COMMENT_PRESETS: QuickCommentPreset[] = [
    { id: 'gra-1', text: 'Subject-verb agreement', categoryId: 'gra', categoryLabel: 'GRA', color: COMMENT_CATEGORIES.gra.color, isDefault: true },
    { id: 'gra-2', text: 'Wrong tense', categoryId: 'gra', categoryLabel: 'GRA', color: COMMENT_CATEGORIES.gra.color, isDefault: true },
    { id: 'gra-3', text: 'Article error', categoryId: 'gra', categoryLabel: 'GRA', color: COMMENT_CATEGORIES.gra.color, isDefault: true },
    { id: 'gra-4', text: 'Run-on sentence', categoryId: 'gra', categoryLabel: 'GRA', color: COMMENT_CATEGORIES.gra.color, isDefault: true },
    { id: 'gra-5', text: 'Fragment', categoryId: 'gra', categoryLabel: 'GRA', color: COMMENT_CATEGORIES.gra.color, isDefault: true },
    { id: 'lr-1', text: 'Word choice', categoryId: 'lr', categoryLabel: 'LR', color: COMMENT_CATEGORIES.lr.color, isDefault: true },
    { id: 'lr-2', text: 'Repetitive vocabulary', categoryId: 'lr', categoryLabel: 'LR', color: COMMENT_CATEGORIES.lr.color, isDefault: true },
    { id: 'lr-3', text: 'Informal register', categoryId: 'lr', categoryLabel: 'LR', color: COMMENT_CATEGORIES.lr.color, isDefault: true },
    { id: 'lr-4', text: 'Spelling error', categoryId: 'lr', categoryLabel: 'LR', color: COMMENT_CATEGORIES.lr.color, isDefault: true },
    { id: 'cc-1', text: 'Needs transition word', categoryId: 'cc', categoryLabel: 'CC', color: COMMENT_CATEGORIES.cc.color, isDefault: true },
    { id: 'cc-2', text: 'Weak paragraph structure', categoryId: 'cc', categoryLabel: 'CC', color: COMMENT_CATEGORIES.cc.color, isDefault: true },
    { id: 'cc-3', text: 'Unclear reference', categoryId: 'cc', categoryLabel: 'CC', color: COMMENT_CATEGORIES.cc.color, isDefault: true },
    { id: 'ta-1', text: 'Off-topic', categoryId: 'ta', categoryLabel: 'TA', color: COMMENT_CATEGORIES.ta.color, isDefault: true },
    { id: 'ta-2', text: "Doesn't address the prompt", categoryId: 'ta', categoryLabel: 'TA', color: COMMENT_CATEGORIES.ta.color, isDefault: true },
    { id: 'ta-3', text: 'Missing key info', categoryId: 'ta', categoryLabel: 'TA', color: COMMENT_CATEGORIES.ta.color, isDefault: true },
];

function normalizePreset(preset: QuickCommentPreset): QuickCommentPreset {
    const categoryId = (
        preset.categoryId in COMMENT_CATEGORIES
            ? preset.categoryId
            : 'uncategorized'
    ) as CommentCategoryId;
    const category = COMMENT_CATEGORIES[categoryId];

    return {
        ...preset,
        categoryId,
        categoryLabel: category.label,
        color: category.color,
    };
}

function getPresetDocRef(teacherId: string) {
    return doc(db, 'users', teacherId, 'settings', PRESET_DOC_ID);
}

function getCustomPresets(presets: QuickCommentPreset[]): QuickCommentPreset[] {
    return presets
        .filter((preset) => !preset.isDefault)
        .map((preset) => ({
            ...normalizePreset(preset),
            isDefault: false,
        }));
}

export async function getTeacherQuickCommentPresets(
    teacherId: string
): Promise<QuickCommentPreset[]> {
    try {
        const snap = await getDoc(getPresetDocRef(teacherId));
        if (!snap.exists()) {
            return [...DEFAULT_QUICK_COMMENT_PRESETS];
        }

        const data = snap.data();
        const customPresets = Array.isArray(data.presets)
            ? (data.presets as QuickCommentPreset[]).map(normalizePreset)
            : [];

        return [...DEFAULT_QUICK_COMMENT_PRESETS, ...customPresets];
    } catch (error) {
        console.error('Failed to load writing quick comment presets:', error);
        return [...DEFAULT_QUICK_COMMENT_PRESETS];
    }
}

export const saveTeacherQuickCommentPresets = withRestoreGuard<void>(
    'WritingQuickCommentPresetsSave',
    undefined as unknown as void
)(async (
    teacherId: string,
    presets: QuickCommentPreset[]
): Promise<void> => {
    const customPresets = getCustomPresets(presets);
    const sanitized = deepRemoveUndefined({
        presets: customPresets,
        updatedAt: Date.now(),
    });

    await setDoc(getPresetDocRef(teacherId), sanitized, { merge: true });
});

export async function addTeacherQuickCommentPreset(
    teacherId: string,
    preset: QuickCommentPreset
): Promise<QuickCommentPreset[]> {
    const existing = await getTeacherQuickCommentPresets(teacherId);
    const custom = existing.filter((item) => !item.isDefault && item.id !== preset.id);
    const next = [...DEFAULT_QUICK_COMMENT_PRESETS, ...custom, normalizePreset({
        ...preset,
        isDefault: false,
        createdByTeacherId: teacherId,
        updatedAt: Date.now(),
    })];

    await saveTeacherQuickCommentPresets(teacherId, next);
    return next;
}

export async function deleteTeacherQuickCommentPreset(
    teacherId: string,
    presetId: string
): Promise<QuickCommentPreset[]> {
    const existing = await getTeacherQuickCommentPresets(teacherId);
    const preset = existing.find((item) => item.id === presetId);

    if (!preset || preset.isDefault) {
        return existing;
    }

    const next = existing.filter((item) => item.id !== presetId);
    await saveTeacherQuickCommentPresets(teacherId, next);
    return next;
}

const writingQuickCommentPresetService = {
    DEFAULT_QUICK_COMMENT_PRESETS,
    getTeacherQuickCommentPresets,
    saveTeacherQuickCommentPresets,
    addTeacherQuickCommentPreset,
    deleteTeacherQuickCommentPreset,
};

export default writingQuickCommentPresetService;
