"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireStringArray = exports.parseStringArray = exports.assertAllowedFields = exports.cloneJsonCompatibleValue = exports.rejectBrowserOwnerId = exports.optionalText = exports.optionalBoolean = exports.optionalPositiveInteger = exports.optionalNonNegativeInteger = exports.requirePositiveInteger = exports.requireNonNegativeInteger = exports.optionalString = exports.requireBoolean = exports.requireText = exports.requireString = exports.isPlainObject = exports.isRecord = void 0;
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
exports.isRecord = isRecord;
const isPlainObject = (value) => {
    if (!(0, exports.isRecord)(value)) {
        return false;
    }
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
};
exports.isPlainObject = isPlainObject;
const requireString = (value, fieldName) => {
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new Error(`${fieldName} must be a non-empty string.`);
    }
    return value.trim();
};
exports.requireString = requireString;
const requireText = (value, fieldName) => {
    if (typeof value !== 'string') {
        throw new Error(`${fieldName} must be a string.`);
    }
    return value;
};
exports.requireText = requireText;
const requireBoolean = (value, fieldName) => {
    if (typeof value !== 'boolean') {
        throw new Error(`${fieldName} must be a boolean.`);
    }
    return value;
};
exports.requireBoolean = requireBoolean;
const optionalString = (value, fieldName) => {
    if (value === undefined) {
        return undefined;
    }
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new Error(`${fieldName} must be a non-empty string.`);
    }
    return value.trim();
};
exports.optionalString = optionalString;
const requireNonNegativeInteger = (value, fieldName) => {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
        throw new Error(`${fieldName} must be a non-negative integer.`);
    }
    return value;
};
exports.requireNonNegativeInteger = requireNonNegativeInteger;
const requirePositiveInteger = (value, fieldName) => {
    if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
        throw new Error(`${fieldName} must be a positive integer.`);
    }
    return value;
};
exports.requirePositiveInteger = requirePositiveInteger;
const optionalNonNegativeInteger = (value, fieldName) => {
    if (value === undefined) {
        return undefined;
    }
    return (0, exports.requireNonNegativeInteger)(value, fieldName);
};
exports.optionalNonNegativeInteger = optionalNonNegativeInteger;
const optionalPositiveInteger = (value, fieldName) => {
    if (value === undefined) {
        return undefined;
    }
    return (0, exports.requirePositiveInteger)(value, fieldName);
};
exports.optionalPositiveInteger = optionalPositiveInteger;
const optionalBoolean = (value, fieldName) => {
    if (value === undefined) {
        return undefined;
    }
    if (typeof value !== 'boolean') {
        throw new Error(`${fieldName} must be a boolean.`);
    }
    return value;
};
exports.optionalBoolean = optionalBoolean;
const optionalText = (value, fieldName) => {
    if (value === undefined) {
        return undefined;
    }
    if (typeof value !== 'string') {
        throw new Error(`${fieldName} must be a string.`);
    }
    return value;
};
exports.optionalText = optionalText;
const rejectBrowserOwnerId = (body) => {
    if (Object.prototype.hasOwnProperty.call(body, 'ownerId')) {
        throw new Error('ownerId is server-derived');
    }
};
exports.rejectBrowserOwnerId = rejectBrowserOwnerId;
const cloneJsonCompatibleValue = (value) => {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') {
        return value;
    }
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) {
            throw new Error('document must contain JSON-compatible values.');
        }
        return value;
    }
    if (value === undefined) {
        throw new Error('document must contain JSON-compatible values.');
    }
    if (typeof value === 'bigint' || typeof value === 'function' || typeof value === 'symbol') {
        throw new Error('document must contain JSON-compatible values.');
    }
    if (Array.isArray(value)) {
        return value.map((entry) => (0, exports.cloneJsonCompatibleValue)(entry));
    }
    if ((0, exports.isPlainObject)(value)) {
        return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, (0, exports.cloneJsonCompatibleValue)(entry)]));
    }
    throw new Error('document must contain JSON-compatible values.');
};
exports.cloneJsonCompatibleValue = cloneJsonCompatibleValue;
const assertAllowedFields = (value, fieldName, allowedFields) => {
    const allowed = new Set(allowedFields);
    const unknownField = Object.keys(value).find((key) => !allowed.has(key));
    if (unknownField !== undefined) {
        throw new Error(`${fieldName}.${unknownField} is not an approved field.`);
    }
};
exports.assertAllowedFields = assertAllowedFields;
const parseStringArray = (value, fieldName) => {
    if (value === undefined) {
        return undefined;
    }
    if (!Array.isArray(value) || !value.every((entry) => typeof entry === 'string')) {
        throw new Error(`${fieldName} must be a string array.`);
    }
    return [...value];
};
exports.parseStringArray = parseStringArray;
const requireStringArray = (value, fieldName) => {
    const parsed = (0, exports.parseStringArray)(value, fieldName);
    if (parsed === undefined) {
        throw new Error(`${fieldName} must be a string array.`);
    }
    return parsed;
};
exports.requireStringArray = requireStringArray;
//# sourceMappingURL=validation.primitives.js.map