"use strict";
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeVersionMap = exports.normalizeVersionRecord = exports.normalizeDraftRecord = exports.cloneVersionRecord = exports.cloneDraftRecord = exports.extractSequence = exports.cloneRecord = exports.cloneJsonCompatibleValue = exports.isPlainObject = exports.LISTENING_AUTHORING_ROOT = void 0;
const constants_1 = require("./constants");
exports.LISTENING_AUTHORING_ROOT = (_a = constants_1.LISTENING_AUTHORING_PATHS.drafts.split('/')[0]) !== null && _a !== void 0 ? _a : 'listening_authoring';
const isPlainObject = (value) => {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        return false;
    }
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
};
exports.isPlainObject = isPlainObject;
const cloneJsonCompatibleValue = (value) => {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') {
        return value;
    }
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) {
            throw new Error('repository only supports JSON-compatible values.');
        }
        return value;
    }
    if (value === undefined) {
        return value;
    }
    if (typeof value === 'bigint' || typeof value === 'function' || typeof value === 'symbol') {
        throw new Error('repository only supports JSON-compatible values.');
    }
    if (Array.isArray(value)) {
        return value.map((entry) => {
            const normalized = (0, exports.cloneJsonCompatibleValue)(entry);
            return normalized === undefined ? null : normalized;
        });
    }
    if ((0, exports.isPlainObject)(value)) {
        return Object.fromEntries(Object.entries(value).reduce((entries, [key, entry]) => {
            const normalized = (0, exports.cloneJsonCompatibleValue)(entry);
            if (normalized !== undefined) {
                entries.push([key, normalized]);
            }
            return entries;
        }, []));
    }
    throw new Error('repository only supports JSON-compatible values.');
};
exports.cloneJsonCompatibleValue = cloneJsonCompatibleValue;
const cloneRecord = (record) => (0, exports.cloneJsonCompatibleValue)(record);
exports.cloneRecord = cloneRecord;
const extractSequence = (value, prefix) => {
    if (!value.startsWith(`${prefix}-`)) {
        return undefined;
    }
    const suffix = value.slice(prefix.length + 1);
    const parsed = Number(suffix);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
};
exports.extractSequence = extractSequence;
const cloneDraftRecord = (record) => (0, exports.cloneRecord)(record);
exports.cloneDraftRecord = cloneDraftRecord;
const cloneVersionRecord = (record) => (0, exports.cloneRecord)(record);
exports.cloneVersionRecord = cloneVersionRecord;
const normalizeDraftRecord = (record) => (0, exports.cloneDraftRecord)(record);
exports.normalizeDraftRecord = normalizeDraftRecord;
const normalizeVersionRecord = (record) => {
    const normalized = (0, exports.cloneRecord)(record);
    if (!(0, exports.isPlainObject)(normalized)) {
        throw new Error('published-version record must be a plain object.');
    }
    const versionId = typeof normalized.versionId === 'string' && normalized.versionId.trim().length > 0
        ? normalized.versionId
        : '<unknown-version>';
    switch (normalized.sourceDraftPath) {
        case 'drafts':
        case 'revision_drafts':
            if (typeof normalized.sourceDraftId !== 'string' ||
                normalized.sourceDraftId.trim().length === 0) {
                throw new Error(`published-version ${versionId} requires non-empty sourceDraftId for ${normalized.sourceDraftPath}.`);
            }
            if (normalized.sourceLegacyTestId !== undefined) {
                throw new Error(`published-version ${versionId} forbids sourceLegacyTestId for ${normalized.sourceDraftPath}.`);
            }
            break;
        case 'legacy_tests':
            if (typeof normalized.sourceLegacyTestId !== 'string' ||
                normalized.sourceLegacyTestId.trim().length === 0) {
                throw new Error(`published-version ${versionId} requires non-empty sourceLegacyTestId for legacy_tests.`);
            }
            if (normalized.sourceDraftId !== undefined) {
                throw new Error(`published-version ${versionId} forbids sourceDraftId for legacy_tests.`);
            }
            break;
        default:
            throw new Error(`published-version ${versionId} has invalid sourceDraftPath.`);
    }
    return normalized;
};
exports.normalizeVersionRecord = normalizeVersionRecord;
const normalizeVersionMap = (value) => Object.fromEntries(Object.entries(value).map(([versionId, record]) => [versionId, (0, exports.normalizeVersionRecord)(record)]));
exports.normalizeVersionMap = normalizeVersionMap;
//# sourceMappingURL=repository.shared.js.map