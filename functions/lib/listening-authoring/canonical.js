"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hmacSha256Hex = exports.requestHash = exports.canonicalJson = void 0;
const crypto_1 = require("crypto");
const isPlainObject = (value) => {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        return false;
    }
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
};
const canonicalize = (value) => {
    if (value === null ||
        typeof value === 'boolean' ||
        typeof value === 'number' ||
        typeof value === 'string') {
        if (typeof value === 'number' && !Number.isFinite(value)) {
            throw new Error('canonicalJson only supports JSON-compatible values.');
        }
        return value;
    }
    if (Array.isArray(value)) {
        return value.map((entry) => {
            const normalized = canonicalize(entry);
            return normalized === undefined ? null : normalized;
        });
    }
    if (isPlainObject(value)) {
        return Object.fromEntries(Object.keys(value)
            .sort()
            .reduce((entries, key) => {
            const normalized = canonicalize(value[key]);
            if (normalized !== undefined) {
                entries.push([key, normalized]);
            }
            return entries;
        }, []));
    }
    if (value === undefined) {
        return undefined;
    }
    throw new Error('canonicalJson only supports JSON-compatible values.');
};
const canonicalJson = (value) => {
    const normalized = canonicalize(value);
    const json = JSON.stringify(normalized);
    if (json === undefined) {
        throw new Error('canonicalJson cannot serialize undefined at the top level.');
    }
    return json;
};
exports.canonicalJson = canonicalJson;
const requestHash = (value) => (0, crypto_1.createHash)('sha256').update((0, exports.canonicalJson)(value)).digest('hex');
exports.requestHash = requestHash;
const hmacSha256Hex = (secret, payload) => (0, crypto_1.createHmac)('sha256', secret).update(payload).digest('hex');
exports.hmacSha256Hex = hmacSha256Hex;
//# sourceMappingURL=canonical.js.map