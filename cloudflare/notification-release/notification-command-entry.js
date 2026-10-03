var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// notification-command-entry.mjs
import activeWorker, { NotificationBridgeObject as ActiveNotificationBridgeObject } from "./notification-command-active.mjs";
var __defProp2 = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = /* @__PURE__ */ __name((fn, res, err) => /* @__PURE__ */ __name(function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
}, "__init"), "__esm");
var __export = /* @__PURE__ */ __name((target, all) => {
  for (var name in all)
    __defProp2(target, name, { get: all[name], enumerable: true });
}, "__export");
function concat(...buffers) {
  const size = buffers.reduce((acc, { length }) => acc + length, 0);
  const buf = new Uint8Array(size);
  let i = 0;
  for (const buffer of buffers) {
    buf.set(buffer, i);
    i += buffer.length;
  }
  return buf;
}
__name(concat, "concat");
function encode(string) {
  const bytes = new Uint8Array(string.length);
  for (let i = 0; i < string.length; i++) {
    const code = string.charCodeAt(i);
    if (code > 127) {
      throw new TypeError("non-ASCII string encountered in encode()");
    }
    bytes[i] = code;
  }
  return bytes;
}
__name(encode, "encode");
var encoder;
var decoder;
var MAX_INT32;
var init_buffer_utils = __esm({
  "cloudflare/node_modules/jose/dist/webapi/lib/buffer_utils.js"() {
    encoder = new TextEncoder();
    decoder = new TextDecoder();
    MAX_INT32 = 2 ** 32;
  }
});
function encodeBase64(input) {
  if (Uint8Array.prototype.toBase64) {
    return input.toBase64();
  }
  const CHUNK_SIZE = 32768;
  const arr = [];
  for (let i = 0; i < input.length; i += CHUNK_SIZE) {
    arr.push(String.fromCharCode.apply(null, input.subarray(i, i + CHUNK_SIZE)));
  }
  return btoa(arr.join(""));
}
__name(encodeBase64, "encodeBase64");
function decodeBase64(encoded) {
  if (Uint8Array.fromBase64) {
    return Uint8Array.fromBase64(encoded);
  }
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
__name(decodeBase64, "decodeBase64");
var init_base64 = __esm({
  "cloudflare/node_modules/jose/dist/webapi/lib/base64.js"() {
  }
});
function decode(input) {
  if (Uint8Array.fromBase64) {
    return Uint8Array.fromBase64(typeof input === "string" ? input : decoder.decode(input), {
      alphabet: "base64url"
    });
  }
  let encoded = input;
  if (encoded instanceof Uint8Array) {
    encoded = decoder.decode(encoded);
  }
  encoded = encoded.replace(/-/g, "+").replace(/_/g, "/");
  try {
    return decodeBase64(encoded);
  } catch {
    throw new TypeError("The input to be decoded is not correctly encoded.");
  }
}
__name(decode, "decode");
function encode2(input) {
  let unencoded = input;
  if (typeof unencoded === "string") {
    unencoded = encoder.encode(unencoded);
  }
  if (Uint8Array.prototype.toBase64) {
    return unencoded.toBase64({ alphabet: "base64url", omitPadding: true });
  }
  return encodeBase64(unencoded).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
__name(encode2, "encode2");
var init_base64url = __esm({
  "cloudflare/node_modules/jose/dist/webapi/util/base64url.js"() {
    init_buffer_utils();
    init_base64();
  }
});
function getHashLength(hash) {
  return parseInt(hash.name.slice(4), 10);
}
__name(getHashLength, "getHashLength");
function checkHashLength(algorithm, expected) {
  const actual = getHashLength(algorithm.hash);
  if (actual !== expected)
    throw unusable(`SHA-${expected}`, "algorithm.hash");
}
__name(checkHashLength, "checkHashLength");
function getNamedCurve(alg) {
  switch (alg) {
    case "ES256":
      return "P-256";
    case "ES384":
      return "P-384";
    case "ES512":
      return "P-521";
    default:
      throw new Error("unreachable");
  }
}
__name(getNamedCurve, "getNamedCurve");
function checkUsage(key, usage) {
  if (usage && !key.usages.includes(usage)) {
    throw new TypeError(`CryptoKey does not support this operation, its usages must include ${usage}.`);
  }
}
__name(checkUsage, "checkUsage");
function checkSigCryptoKey(key, alg, usage) {
  switch (alg) {
    case "HS256":
    case "HS384":
    case "HS512": {
      if (!isAlgorithm(key.algorithm, "HMAC"))
        throw unusable("HMAC");
      checkHashLength(key.algorithm, parseInt(alg.slice(2), 10));
      break;
    }
    case "RS256":
    case "RS384":
    case "RS512": {
      if (!isAlgorithm(key.algorithm, "RSASSA-PKCS1-v1_5"))
        throw unusable("RSASSA-PKCS1-v1_5");
      checkHashLength(key.algorithm, parseInt(alg.slice(2), 10));
      break;
    }
    case "PS256":
    case "PS384":
    case "PS512": {
      if (!isAlgorithm(key.algorithm, "RSA-PSS"))
        throw unusable("RSA-PSS");
      checkHashLength(key.algorithm, parseInt(alg.slice(2), 10));
      break;
    }
    case "Ed25519":
    case "EdDSA": {
      if (!isAlgorithm(key.algorithm, "Ed25519"))
        throw unusable("Ed25519");
      break;
    }
    case "ML-DSA-44":
    case "ML-DSA-65":
    case "ML-DSA-87": {
      if (!isAlgorithm(key.algorithm, alg))
        throw unusable(alg);
      break;
    }
    case "ES256":
    case "ES384":
    case "ES512": {
      if (!isAlgorithm(key.algorithm, "ECDSA"))
        throw unusable("ECDSA");
      const expected = getNamedCurve(alg);
      const actual = key.algorithm.namedCurve;
      if (actual !== expected)
        throw unusable(expected, "algorithm.namedCurve");
      break;
    }
    default:
      throw new TypeError("CryptoKey does not support this operation");
  }
  checkUsage(key, usage);
}
__name(checkSigCryptoKey, "checkSigCryptoKey");
var unusable;
var isAlgorithm;
var init_crypto_key = __esm({
  "cloudflare/node_modules/jose/dist/webapi/lib/crypto_key.js"() {
    unusable = /* @__PURE__ */ __name((name, prop = "algorithm.name") => new TypeError(`CryptoKey does not support this operation, its ${prop} must be ${name}`), "unusable");
    isAlgorithm = /* @__PURE__ */ __name((algorithm, name) => algorithm.name === name, "isAlgorithm");
  }
});
function message(msg, actual, ...types) {
  types = types.filter(Boolean);
  if (types.length > 2) {
    const last = types.pop();
    msg += `one of type ${types.join(", ")}, or ${last}.`;
  } else if (types.length === 2) {
    msg += `one of type ${types[0]} or ${types[1]}.`;
  } else {
    msg += `of type ${types[0]}.`;
  }
  if (actual == null) {
    msg += ` Received ${actual}`;
  } else if (typeof actual === "function" && actual.name) {
    msg += ` Received function ${actual.name}`;
  } else if (typeof actual === "object" && actual != null) {
    if (actual.constructor?.name) {
      msg += ` Received an instance of ${actual.constructor.name}`;
    }
  }
  return msg;
}
__name(message, "message");
var invalidKeyInput;
var withAlg;
var init_invalid_key_input = __esm({
  "cloudflare/node_modules/jose/dist/webapi/lib/invalid_key_input.js"() {
    invalidKeyInput = /* @__PURE__ */ __name((actual, ...types) => message("Key must be ", actual, ...types), "invalidKeyInput");
    withAlg = /* @__PURE__ */ __name((alg, actual, ...types) => message(`Key for the ${alg} algorithm must be `, actual, ...types), "withAlg");
  }
});
var JOSEError;
var JWTClaimValidationFailed;
var JWTExpired;
var JOSEAlgNotAllowed;
var JOSENotSupported;
var JWSInvalid;
var JWTInvalid;
var JWKSInvalid;
var JWKSNoMatchingKey;
var JWKSMultipleMatchingKeys;
var JWKSTimeout;
var JWSSignatureVerificationFailed;
var init_errors = __esm({
  "cloudflare/node_modules/jose/dist/webapi/util/errors.js"() {
    JOSEError = class extends Error {
      static {
        __name(this, "JOSEError");
      }
      static code = "ERR_JOSE_GENERIC";
      code = "ERR_JOSE_GENERIC";
      constructor(message2, options) {
        super(message2, options);
        this.name = this.constructor.name;
        Error.captureStackTrace?.(this, this.constructor);
      }
    };
    JWTClaimValidationFailed = class extends JOSEError {
      static {
        __name(this, "JWTClaimValidationFailed");
      }
      static code = "ERR_JWT_CLAIM_VALIDATION_FAILED";
      code = "ERR_JWT_CLAIM_VALIDATION_FAILED";
      claim;
      reason;
      payload;
      constructor(message2, payload, claim = "unspecified", reason = "unspecified") {
        super(message2, { cause: { claim, reason, payload } });
        this.claim = claim;
        this.reason = reason;
        this.payload = payload;
      }
    };
    JWTExpired = class extends JOSEError {
      static {
        __name(this, "JWTExpired");
      }
      static code = "ERR_JWT_EXPIRED";
      code = "ERR_JWT_EXPIRED";
      claim;
      reason;
      payload;
      constructor(message2, payload, claim = "unspecified", reason = "unspecified") {
        super(message2, { cause: { claim, reason, payload } });
        this.claim = claim;
        this.reason = reason;
        this.payload = payload;
      }
    };
    JOSEAlgNotAllowed = class extends JOSEError {
      static {
        __name(this, "JOSEAlgNotAllowed");
      }
      static code = "ERR_JOSE_ALG_NOT_ALLOWED";
      code = "ERR_JOSE_ALG_NOT_ALLOWED";
    };
    JOSENotSupported = class extends JOSEError {
      static {
        __name(this, "JOSENotSupported");
      }
      static code = "ERR_JOSE_NOT_SUPPORTED";
      code = "ERR_JOSE_NOT_SUPPORTED";
    };
    JWSInvalid = class extends JOSEError {
      static {
        __name(this, "JWSInvalid");
      }
      static code = "ERR_JWS_INVALID";
      code = "ERR_JWS_INVALID";
    };
    JWTInvalid = class extends JOSEError {
      static {
        __name(this, "JWTInvalid");
      }
      static code = "ERR_JWT_INVALID";
      code = "ERR_JWT_INVALID";
    };
    JWKSInvalid = class extends JOSEError {
      static {
        __name(this, "JWKSInvalid");
      }
      static code = "ERR_JWKS_INVALID";
      code = "ERR_JWKS_INVALID";
    };
    JWKSNoMatchingKey = class extends JOSEError {
      static {
        __name(this, "JWKSNoMatchingKey");
      }
      static code = "ERR_JWKS_NO_MATCHING_KEY";
      code = "ERR_JWKS_NO_MATCHING_KEY";
      constructor(message2 = "no applicable key found in the JSON Web Key Set", options) {
        super(message2, options);
      }
    };
    JWKSMultipleMatchingKeys = class extends JOSEError {
      static {
        __name(this, "JWKSMultipleMatchingKeys");
      }
      [Symbol.asyncIterator];
      static code = "ERR_JWKS_MULTIPLE_MATCHING_KEYS";
      code = "ERR_JWKS_MULTIPLE_MATCHING_KEYS";
      constructor(message2 = "multiple matching keys found in the JSON Web Key Set", options) {
        super(message2, options);
      }
    };
    JWKSTimeout = class extends JOSEError {
      static {
        __name(this, "JWKSTimeout");
      }
      static code = "ERR_JWKS_TIMEOUT";
      code = "ERR_JWKS_TIMEOUT";
      constructor(message2 = "request timed out", options) {
        super(message2, options);
      }
    };
    JWSSignatureVerificationFailed = class extends JOSEError {
      static {
        __name(this, "JWSSignatureVerificationFailed");
      }
      static code = "ERR_JWS_SIGNATURE_VERIFICATION_FAILED";
      code = "ERR_JWS_SIGNATURE_VERIFICATION_FAILED";
      constructor(message2 = "signature verification failed", options) {
        super(message2, options);
      }
    };
  }
});
var isCryptoKey;
var isKeyObject;
var isKeyLike;
var init_is_key_like = __esm({
  "cloudflare/node_modules/jose/dist/webapi/lib/is_key_like.js"() {
    isCryptoKey = /* @__PURE__ */ __name((key) => {
      if (key?.[Symbol.toStringTag] === "CryptoKey")
        return true;
      try {
        return key instanceof CryptoKey;
      } catch {
        return false;
      }
    }, "isCryptoKey");
    isKeyObject = /* @__PURE__ */ __name((key) => key?.[Symbol.toStringTag] === "KeyObject", "isKeyObject");
    isKeyLike = /* @__PURE__ */ __name((key) => isCryptoKey(key) || isKeyObject(key), "isKeyLike");
  }
});
function assertNotSet(value, name) {
  if (value) {
    throw new TypeError(`${name} can only be called once`);
  }
}
__name(assertNotSet, "assertNotSet");
function decodeBase64url(value, label, ErrorClass) {
  try {
    return decode(value);
  } catch {
    throw new ErrorClass(`Failed to base64url decode the ${label}`);
  }
}
__name(decodeBase64url, "decodeBase64url");
var init_helpers = __esm({
  "cloudflare/node_modules/jose/dist/webapi/lib/helpers.js"() {
    init_base64url();
  }
});
function isObject(input) {
  if (!isObjectLike(input) || Object.prototype.toString.call(input) !== "[object Object]") {
    return false;
  }
  if (Object.getPrototypeOf(input) === null) {
    return true;
  }
  let proto = input;
  while (Object.getPrototypeOf(proto) !== null) {
    proto = Object.getPrototypeOf(proto);
  }
  return Object.getPrototypeOf(input) === proto;
}
__name(isObject, "isObject");
function isDisjoint(...headers) {
  const sources = headers.filter(Boolean);
  if (sources.length === 0 || sources.length === 1) {
    return true;
  }
  let acc;
  for (const header of sources) {
    const parameters = Object.keys(header);
    if (!acc || acc.size === 0) {
      acc = new Set(parameters);
      continue;
    }
    for (const parameter of parameters) {
      if (acc.has(parameter)) {
        return false;
      }
      acc.add(parameter);
    }
  }
  return true;
}
__name(isDisjoint, "isDisjoint");
var isObjectLike;
var isJWK;
var isPrivateJWK;
var isPublicJWK;
var isSecretJWK;
var init_type_checks = __esm({
  "cloudflare/node_modules/jose/dist/webapi/lib/type_checks.js"() {
    isObjectLike = /* @__PURE__ */ __name((value) => typeof value === "object" && value !== null, "isObjectLike");
    isJWK = /* @__PURE__ */ __name((key) => isObject(key) && typeof key.kty === "string", "isJWK");
    isPrivateJWK = /* @__PURE__ */ __name((key) => key.kty !== "oct" && (key.kty === "AKP" && typeof key.priv === "string" || typeof key.d === "string"), "isPrivateJWK");
    isPublicJWK = /* @__PURE__ */ __name((key) => key.kty !== "oct" && key.d === void 0 && key.priv === void 0, "isPublicJWK");
    isSecretJWK = /* @__PURE__ */ __name((key) => key.kty === "oct" && typeof key.k === "string", "isSecretJWK");
  }
});
function checkKeyLength(alg, key) {
  if (alg.startsWith("RS") || alg.startsWith("PS")) {
    const { modulusLength } = key.algorithm;
    if (typeof modulusLength !== "number" || modulusLength < 2048) {
      throw new TypeError(`${alg} requires key modulusLength to be 2048 bits or larger`);
    }
  }
}
__name(checkKeyLength, "checkKeyLength");
function subtleAlgorithm(alg, algorithm) {
  const hash = `SHA-${alg.slice(-3)}`;
  switch (alg) {
    case "HS256":
    case "HS384":
    case "HS512":
      return { hash, name: "HMAC" };
    case "PS256":
    case "PS384":
    case "PS512":
      return { hash, name: "RSA-PSS", saltLength: parseInt(alg.slice(-3), 10) >> 3 };
    case "RS256":
    case "RS384":
    case "RS512":
      return { hash, name: "RSASSA-PKCS1-v1_5" };
    case "ES256":
    case "ES384":
    case "ES512":
      return { hash, name: "ECDSA", namedCurve: algorithm.namedCurve };
    case "Ed25519":
    case "EdDSA":
      return { name: "Ed25519" };
    case "ML-DSA-44":
    case "ML-DSA-65":
    case "ML-DSA-87":
      return { name: alg };
    default:
      throw new JOSENotSupported(`alg ${alg} is not supported either by JOSE or your javascript runtime`);
  }
}
__name(subtleAlgorithm, "subtleAlgorithm");
async function getSigKey(alg, key, usage) {
  if (key instanceof Uint8Array) {
    if (!alg.startsWith("HS")) {
      throw new TypeError(invalidKeyInput(key, "CryptoKey", "KeyObject", "JSON Web Key"));
    }
    return crypto.subtle.importKey("raw", key, { hash: `SHA-${alg.slice(-3)}`, name: "HMAC" }, false, [usage]);
  }
  checkSigCryptoKey(key, alg, usage);
  return key;
}
__name(getSigKey, "getSigKey");
async function sign(alg, key, data) {
  const cryptoKey = await getSigKey(alg, key, "sign");
  checkKeyLength(alg, cryptoKey);
  const signature = await crypto.subtle.sign(subtleAlgorithm(alg, cryptoKey.algorithm), cryptoKey, data);
  return new Uint8Array(signature);
}
__name(sign, "sign");
async function verify(alg, key, signature, data) {
  const cryptoKey = await getSigKey(alg, key, "verify");
  checkKeyLength(alg, cryptoKey);
  const algorithm = subtleAlgorithm(alg, cryptoKey.algorithm);
  try {
    return await crypto.subtle.verify(algorithm, cryptoKey, signature, data);
  } catch {
    return false;
  }
}
__name(verify, "verify");
var init_signing = __esm({
  "cloudflare/node_modules/jose/dist/webapi/lib/signing.js"() {
    init_errors();
    init_crypto_key();
    init_invalid_key_input();
  }
});
function subtleMapping(jwk) {
  let algorithm;
  let keyUsages;
  switch (jwk.kty) {
    case "AKP": {
      switch (jwk.alg) {
        case "ML-DSA-44":
        case "ML-DSA-65":
        case "ML-DSA-87":
          algorithm = { name: jwk.alg };
          keyUsages = jwk.priv ? ["sign"] : ["verify"];
          break;
        default:
          throw new JOSENotSupported(unsupportedAlg);
      }
      break;
    }
    case "RSA": {
      switch (jwk.alg) {
        case "PS256":
        case "PS384":
        case "PS512":
          algorithm = { name: "RSA-PSS", hash: `SHA-${jwk.alg.slice(-3)}` };
          keyUsages = jwk.d ? ["sign"] : ["verify"];
          break;
        case "RS256":
        case "RS384":
        case "RS512":
          algorithm = { name: "RSASSA-PKCS1-v1_5", hash: `SHA-${jwk.alg.slice(-3)}` };
          keyUsages = jwk.d ? ["sign"] : ["verify"];
          break;
        case "RSA-OAEP":
        case "RSA-OAEP-256":
        case "RSA-OAEP-384":
        case "RSA-OAEP-512":
          algorithm = {
            name: "RSA-OAEP",
            hash: `SHA-${parseInt(jwk.alg.slice(-3), 10) || 1}`
          };
          keyUsages = jwk.d ? ["decrypt", "unwrapKey"] : ["encrypt", "wrapKey"];
          break;
        default:
          throw new JOSENotSupported(unsupportedAlg);
      }
      break;
    }
    case "EC": {
      switch (jwk.alg) {
        case "ES256":
        case "ES384":
        case "ES512":
          algorithm = {
            name: "ECDSA",
            namedCurve: { ES256: "P-256", ES384: "P-384", ES512: "P-521" }[jwk.alg]
          };
          keyUsages = jwk.d ? ["sign"] : ["verify"];
          break;
        case "ECDH-ES":
        case "ECDH-ES+A128KW":
        case "ECDH-ES+A192KW":
        case "ECDH-ES+A256KW":
          algorithm = { name: "ECDH", namedCurve: jwk.crv };
          keyUsages = jwk.d ? ["deriveBits"] : [];
          break;
        default:
          throw new JOSENotSupported(unsupportedAlg);
      }
      break;
    }
    case "OKP": {
      switch (jwk.alg) {
        case "Ed25519":
        case "EdDSA":
          algorithm = { name: "Ed25519" };
          keyUsages = jwk.d ? ["sign"] : ["verify"];
          break;
        case "ECDH-ES":
        case "ECDH-ES+A128KW":
        case "ECDH-ES+A192KW":
        case "ECDH-ES+A256KW":
          algorithm = { name: jwk.crv };
          keyUsages = jwk.d ? ["deriveBits"] : [];
          break;
        default:
          throw new JOSENotSupported(unsupportedAlg);
      }
      break;
    }
    default:
      throw new JOSENotSupported('Invalid or unsupported JWK "kty" (Key Type) Parameter value');
  }
  return { algorithm, keyUsages };
}
__name(subtleMapping, "subtleMapping");
async function jwkToKey(jwk) {
  if (!jwk.alg) {
    throw new TypeError('"alg" argument is required when "jwk.alg" is not present');
  }
  const { algorithm, keyUsages } = subtleMapping(jwk);
  const keyData = { ...jwk };
  if (keyData.kty !== "AKP") {
    delete keyData.alg;
  }
  delete keyData.use;
  return crypto.subtle.importKey("jwk", keyData, algorithm, jwk.ext ?? (jwk.d || jwk.priv ? false : true), jwk.key_ops ?? keyUsages);
}
__name(jwkToKey, "jwkToKey");
var unsupportedAlg;
var init_jwk_to_key = __esm({
  "cloudflare/node_modules/jose/dist/webapi/lib/jwk_to_key.js"() {
    init_errors();
    unsupportedAlg = 'Invalid or unsupported JWK "alg" (Algorithm) Parameter value';
  }
});
async function normalizeKey(key, alg) {
  if (key instanceof Uint8Array) {
    return key;
  }
  if (isCryptoKey(key)) {
    return key;
  }
  if (isKeyObject(key)) {
    if (key.type === "secret") {
      return key.export();
    }
    if ("toCryptoKey" in key && typeof key.toCryptoKey === "function") {
      try {
        return handleKeyObject(key, alg);
      } catch (err) {
        if (err instanceof TypeError) {
          throw err;
        }
      }
    }
    let jwk = key.export({ format: "jwk" });
    return handleJWK(key, jwk, alg);
  }
  if (isJWK(key)) {
    if (key.k) {
      return decode(key.k);
    }
    return handleJWK(key, key, alg, true);
  }
  throw new Error("unreachable");
}
__name(normalizeKey, "normalizeKey");
var unusableForAlg;
var cache;
var handleJWK;
var handleKeyObject;
var init_normalize_key = __esm({
  "cloudflare/node_modules/jose/dist/webapi/lib/normalize_key.js"() {
    init_type_checks();
    init_base64url();
    init_jwk_to_key();
    init_is_key_like();
    unusableForAlg = "given KeyObject instance cannot be used for this algorithm";
    handleJWK = /* @__PURE__ */ __name(async (key, jwk, alg, freeze = false) => {
      cache ||= /* @__PURE__ */ new WeakMap();
      let cached = cache.get(key);
      if (cached?.[alg]) {
        return cached[alg];
      }
      const cryptoKey = await jwkToKey({ ...jwk, alg });
      if (freeze)
        Object.freeze(key);
      if (!cached) {
        cache.set(key, { [alg]: cryptoKey });
      } else {
        cached[alg] = cryptoKey;
      }
      return cryptoKey;
    }, "handleJWK");
    handleKeyObject = /* @__PURE__ */ __name((keyObject, alg) => {
      cache ||= /* @__PURE__ */ new WeakMap();
      let cached = cache.get(keyObject);
      if (cached?.[alg]) {
        return cached[alg];
      }
      const isPublic = keyObject.type === "public";
      const extractable = isPublic ? true : false;
      let cryptoKey;
      if (keyObject.asymmetricKeyType === "x25519") {
        switch (alg) {
          case "ECDH-ES":
          case "ECDH-ES+A128KW":
          case "ECDH-ES+A192KW":
          case "ECDH-ES+A256KW":
            break;
          default:
            throw new TypeError(unusableForAlg);
        }
        cryptoKey = keyObject.toCryptoKey(keyObject.asymmetricKeyType, extractable, isPublic ? [] : ["deriveBits"]);
      }
      if (keyObject.asymmetricKeyType === "ed25519") {
        if (alg !== "EdDSA" && alg !== "Ed25519") {
          throw new TypeError(unusableForAlg);
        }
        cryptoKey = keyObject.toCryptoKey(keyObject.asymmetricKeyType, extractable, [
          isPublic ? "verify" : "sign"
        ]);
      }
      switch (keyObject.asymmetricKeyType) {
        case "ml-dsa-44":
        case "ml-dsa-65":
        case "ml-dsa-87": {
          if (alg !== keyObject.asymmetricKeyType.toUpperCase()) {
            throw new TypeError(unusableForAlg);
          }
          cryptoKey = keyObject.toCryptoKey(keyObject.asymmetricKeyType, extractable, [
            isPublic ? "verify" : "sign"
          ]);
        }
      }
      if (keyObject.asymmetricKeyType === "rsa") {
        let hash;
        switch (alg) {
          case "RSA-OAEP":
            hash = "SHA-1";
            break;
          case "RS256":
          case "PS256":
          case "RSA-OAEP-256":
            hash = "SHA-256";
            break;
          case "RS384":
          case "PS384":
          case "RSA-OAEP-384":
            hash = "SHA-384";
            break;
          case "RS512":
          case "PS512":
          case "RSA-OAEP-512":
            hash = "SHA-512";
            break;
          default:
            throw new TypeError(unusableForAlg);
        }
        if (alg.startsWith("RSA-OAEP")) {
          return keyObject.toCryptoKey({
            name: "RSA-OAEP",
            hash
          }, extractable, isPublic ? ["encrypt"] : ["decrypt"]);
        }
        cryptoKey = keyObject.toCryptoKey({
          name: alg.startsWith("PS") ? "RSA-PSS" : "RSASSA-PKCS1-v1_5",
          hash
        }, extractable, [isPublic ? "verify" : "sign"]);
      }
      if (keyObject.asymmetricKeyType === "ec") {
        const nist = /* @__PURE__ */ new Map([
          ["prime256v1", "P-256"],
          ["secp384r1", "P-384"],
          ["secp521r1", "P-521"]
        ]);
        const namedCurve = nist.get(keyObject.asymmetricKeyDetails?.namedCurve);
        if (!namedCurve) {
          throw new TypeError(unusableForAlg);
        }
        const expectedCurve = { ES256: "P-256", ES384: "P-384", ES512: "P-521" };
        if (expectedCurve[alg] && namedCurve === expectedCurve[alg]) {
          cryptoKey = keyObject.toCryptoKey({
            name: "ECDSA",
            namedCurve
          }, extractable, [isPublic ? "verify" : "sign"]);
        }
        if (alg.startsWith("ECDH-ES")) {
          cryptoKey = keyObject.toCryptoKey({
            name: "ECDH",
            namedCurve
          }, extractable, isPublic ? [] : ["deriveBits"]);
        }
      }
      if (!cryptoKey) {
        throw new TypeError(unusableForAlg);
      }
      if (!cached) {
        cache.set(keyObject, { [alg]: cryptoKey });
      } else {
        cached[alg] = cryptoKey;
      }
      return cryptoKey;
    }, "handleKeyObject");
  }
});
function parsePKCS8Header(state) {
  expectTag(state, 48, "Invalid PKCS#8 structure");
  parseLength(state);
  expectTag(state, 2, "Expected version field");
  const verLen = parseLength(state);
  state.pos += verLen;
  expectTag(state, 48, "Expected algorithm identifier");
  const algIdLen = parseLength(state);
  const algIdStart = state.pos;
  return { algIdStart, algIdLength: algIdLen };
}
__name(parsePKCS8Header, "parsePKCS8Header");
var bytesEqual;
var createASN1State;
var parseLength;
var expectTag;
var getSubarray;
var parseAlgorithmOID;
var parseECAlgorithmIdentifier;
var genericImport;
var processPEMData;
var fromPKCS8;
var init_asn1 = __esm({
  "cloudflare/node_modules/jose/dist/webapi/lib/asn1.js"() {
    init_base64();
    init_errors();
    bytesEqual = /* @__PURE__ */ __name((a, b) => {
      if (a.byteLength !== b.length)
        return false;
      for (let i = 0; i < a.byteLength; i++) {
        if (a[i] !== b[i])
          return false;
      }
      return true;
    }, "bytesEqual");
    createASN1State = /* @__PURE__ */ __name((data) => ({ data, pos: 0 }), "createASN1State");
    parseLength = /* @__PURE__ */ __name((state) => {
      const first = state.data[state.pos++];
      if (first & 128) {
        const lengthOfLen = first & 127;
        let length = 0;
        for (let i = 0; i < lengthOfLen; i++) {
          length = length << 8 | state.data[state.pos++];
        }
        return length;
      }
      return first;
    }, "parseLength");
    expectTag = /* @__PURE__ */ __name((state, expectedTag, errorMessage) => {
      if (state.data[state.pos++] !== expectedTag) {
        throw new Error(errorMessage);
      }
    }, "expectTag");
    getSubarray = /* @__PURE__ */ __name((state, length) => {
      const result = state.data.subarray(state.pos, state.pos + length);
      state.pos += length;
      return result;
    }, "getSubarray");
    parseAlgorithmOID = /* @__PURE__ */ __name((state) => {
      expectTag(state, 6, "Expected algorithm OID");
      const oidLen = parseLength(state);
      return getSubarray(state, oidLen);
    }, "parseAlgorithmOID");
    parseECAlgorithmIdentifier = /* @__PURE__ */ __name((state) => {
      const algOid = parseAlgorithmOID(state);
      if (bytesEqual(algOid, [43, 101, 110])) {
        return "X25519";
      }
      if (!bytesEqual(algOid, [42, 134, 72, 206, 61, 2, 1])) {
        throw new Error("Unsupported key algorithm");
      }
      expectTag(state, 6, "Expected curve OID");
      const curveOidLen = parseLength(state);
      const curveOid = getSubarray(state, curveOidLen);
      for (const { name, oid } of [
        { name: "P-256", oid: [42, 134, 72, 206, 61, 3, 1, 7] },
        { name: "P-384", oid: [43, 129, 4, 0, 34] },
        { name: "P-521", oid: [43, 129, 4, 0, 35] }
      ]) {
        if (bytesEqual(curveOid, oid)) {
          return name;
        }
      }
      throw new Error("Unsupported named curve");
    }, "parseECAlgorithmIdentifier");
    genericImport = /* @__PURE__ */ __name(async (keyFormat, keyData, alg, options) => {
      let algorithm;
      let keyUsages;
      const isPublic = keyFormat === "spki";
      const getSigUsages = /* @__PURE__ */ __name(() => isPublic ? ["verify"] : ["sign"], "getSigUsages");
      const getEncUsages = /* @__PURE__ */ __name(() => isPublic ? ["encrypt", "wrapKey"] : ["decrypt", "unwrapKey"], "getEncUsages");
      switch (alg) {
        case "PS256":
        case "PS384":
        case "PS512":
          algorithm = { name: "RSA-PSS", hash: `SHA-${alg.slice(-3)}` };
          keyUsages = getSigUsages();
          break;
        case "RS256":
        case "RS384":
        case "RS512":
          algorithm = { name: "RSASSA-PKCS1-v1_5", hash: `SHA-${alg.slice(-3)}` };
          keyUsages = getSigUsages();
          break;
        case "RSA-OAEP":
        case "RSA-OAEP-256":
        case "RSA-OAEP-384":
        case "RSA-OAEP-512":
          algorithm = {
            name: "RSA-OAEP",
            hash: `SHA-${parseInt(alg.slice(-3), 10) || 1}`
          };
          keyUsages = getEncUsages();
          break;
        case "ES256":
        case "ES384":
        case "ES512": {
          const curveMap = { ES256: "P-256", ES384: "P-384", ES512: "P-521" };
          algorithm = { name: "ECDSA", namedCurve: curveMap[alg] };
          keyUsages = getSigUsages();
          break;
        }
        case "ECDH-ES":
        case "ECDH-ES+A128KW":
        case "ECDH-ES+A192KW":
        case "ECDH-ES+A256KW": {
          try {
            const namedCurve = options.getNamedCurve(keyData);
            algorithm = namedCurve === "X25519" ? { name: "X25519" } : { name: "ECDH", namedCurve };
          } catch (cause) {
            throw new JOSENotSupported("Invalid or unsupported key format");
          }
          keyUsages = isPublic ? [] : ["deriveBits"];
          break;
        }
        case "Ed25519":
        case "EdDSA":
          algorithm = { name: "Ed25519" };
          keyUsages = getSigUsages();
          break;
        case "ML-DSA-44":
        case "ML-DSA-65":
        case "ML-DSA-87":
          algorithm = { name: alg };
          keyUsages = getSigUsages();
          break;
        default:
          throw new JOSENotSupported('Invalid or unsupported "alg" (Algorithm) value');
      }
      return crypto.subtle.importKey(keyFormat, keyData, algorithm, options?.extractable ?? (isPublic ? true : false), keyUsages);
    }, "genericImport");
    processPEMData = /* @__PURE__ */ __name((pem, pattern) => {
      return decodeBase64(pem.replace(pattern, ""));
    }, "processPEMData");
    fromPKCS8 = /* @__PURE__ */ __name((pem, alg, options) => {
      const keyData = processPEMData(pem, /(?:-----(?:BEGIN|END) PRIVATE KEY-----|\s)/g);
      let opts = options;
      if (alg?.startsWith?.("ECDH-ES")) {
        opts ||= {};
        opts.getNamedCurve = (keyData2) => {
          const state = createASN1State(keyData2);
          parsePKCS8Header(state);
          return parseECAlgorithmIdentifier(state);
        };
      }
      return genericImport("pkcs8", keyData, alg, opts);
    }, "fromPKCS8");
  }
});
async function importPKCS8(pkcs8, alg, options) {
  if (typeof pkcs8 !== "string" || pkcs8.indexOf("-----BEGIN PRIVATE KEY-----") !== 0) {
    throw new TypeError('"pkcs8" must be PKCS#8 formatted string');
  }
  return fromPKCS8(pkcs8, alg, options);
}
__name(importPKCS8, "importPKCS8");
async function importJWK(jwk, alg, options) {
  if (!isObject(jwk)) {
    throw new TypeError("JWK must be an object");
  }
  let ext;
  alg ??= jwk.alg;
  ext ??= options?.extractable ?? jwk.ext;
  switch (jwk.kty) {
    case "oct":
      if (typeof jwk.k !== "string" || !jwk.k) {
        throw new TypeError('missing "k" (Key Value) Parameter value');
      }
      return decode(jwk.k);
    case "RSA":
      if ("oth" in jwk && jwk.oth !== void 0) {
        throw new JOSENotSupported('RSA JWK "oth" (Other Primes Info) Parameter value is not supported');
      }
      return jwkToKey({ ...jwk, alg, ext });
    case "AKP": {
      if (typeof jwk.alg !== "string" || !jwk.alg) {
        throw new TypeError('missing "alg" (Algorithm) Parameter value');
      }
      if (alg !== void 0 && alg !== jwk.alg) {
        throw new TypeError("JWK alg and alg option value mismatch");
      }
      return jwkToKey({ ...jwk, ext });
    }
    case "EC":
    case "OKP":
      return jwkToKey({ ...jwk, alg, ext });
    default:
      throw new JOSENotSupported('Unsupported "kty" (Key Type) Parameter value');
  }
}
__name(importJWK, "importJWK");
var init_import = __esm({
  "cloudflare/node_modules/jose/dist/webapi/key/import.js"() {
    init_base64url();
    init_asn1();
    init_jwk_to_key();
    init_errors();
    init_type_checks();
  }
});
function validateCrit(Err, recognizedDefault, recognizedOption, protectedHeader, joseHeader) {
  if (joseHeader.crit !== void 0 && protectedHeader?.crit === void 0) {
    throw new Err('"crit" (Critical) Header Parameter MUST be integrity protected');
  }
  if (!protectedHeader || protectedHeader.crit === void 0) {
    return /* @__PURE__ */ new Set();
  }
  if (!Array.isArray(protectedHeader.crit) || protectedHeader.crit.length === 0 || protectedHeader.crit.some((input) => typeof input !== "string" || input.length === 0)) {
    throw new Err('"crit" (Critical) Header Parameter MUST be an array of non-empty strings when present');
  }
  let recognized;
  if (recognizedOption !== void 0) {
    recognized = new Map([...Object.entries(recognizedOption), ...recognizedDefault.entries()]);
  } else {
    recognized = recognizedDefault;
  }
  for (const parameter of protectedHeader.crit) {
    if (!recognized.has(parameter)) {
      throw new JOSENotSupported(`Extension Header Parameter "${parameter}" is not recognized`);
    }
    if (joseHeader[parameter] === void 0) {
      throw new Err(`Extension Header Parameter "${parameter}" is missing`);
    }
    if (recognized.get(parameter) && protectedHeader[parameter] === void 0) {
      throw new Err(`Extension Header Parameter "${parameter}" MUST be integrity protected`);
    }
  }
  return new Set(protectedHeader.crit);
}
__name(validateCrit, "validateCrit");
var init_validate_crit = __esm({
  "cloudflare/node_modules/jose/dist/webapi/lib/validate_crit.js"() {
    init_errors();
  }
});
function validateAlgorithms(option, algorithms) {
  if (algorithms !== void 0 && (!Array.isArray(algorithms) || algorithms.some((s) => typeof s !== "string"))) {
    throw new TypeError(`"${option}" option must be an array of strings`);
  }
  if (!algorithms) {
    return void 0;
  }
  return new Set(algorithms);
}
__name(validateAlgorithms, "validateAlgorithms");
var init_validate_algorithms = __esm({
  "cloudflare/node_modules/jose/dist/webapi/lib/validate_algorithms.js"() {
  }
});
function checkKeyType(alg, key, usage) {
  switch (alg.substring(0, 2)) {
    case "A1":
    case "A2":
    case "di":
    case "HS":
    case "PB":
      symmetricTypeCheck(alg, key, usage);
      break;
    default:
      asymmetricTypeCheck(alg, key, usage);
  }
}
__name(checkKeyType, "checkKeyType");
var tag;
var jwkMatchesOp;
var symmetricTypeCheck;
var asymmetricTypeCheck;
var init_check_key_type = __esm({
  "cloudflare/node_modules/jose/dist/webapi/lib/check_key_type.js"() {
    init_invalid_key_input();
    init_is_key_like();
    init_type_checks();
    tag = /* @__PURE__ */ __name((key) => key?.[Symbol.toStringTag], "tag");
    jwkMatchesOp = /* @__PURE__ */ __name((alg, key, usage) => {
      if (key.use !== void 0) {
        let expected;
        switch (usage) {
          case "sign":
          case "verify":
            expected = "sig";
            break;
          case "encrypt":
          case "decrypt":
            expected = "enc";
            break;
        }
        if (key.use !== expected) {
          throw new TypeError(`Invalid key for this operation, its "use" must be "${expected}" when present`);
        }
      }
      if (key.alg !== void 0 && key.alg !== alg) {
        throw new TypeError(`Invalid key for this operation, its "alg" must be "${alg}" when present`);
      }
      if (Array.isArray(key.key_ops)) {
        let expectedKeyOp;
        switch (true) {
          case (usage === "sign" || usage === "verify"):
          case alg === "dir":
          case alg.includes("CBC-HS"):
            expectedKeyOp = usage;
            break;
          case alg.startsWith("PBES2"):
            expectedKeyOp = "deriveBits";
            break;
          case /^A\d{3}(?:GCM)?(?:KW)?$/.test(alg):
            if (!alg.includes("GCM") && alg.endsWith("KW")) {
              expectedKeyOp = usage === "encrypt" ? "wrapKey" : "unwrapKey";
            } else {
              expectedKeyOp = usage;
            }
            break;
          case (usage === "encrypt" && alg.startsWith("RSA")):
            expectedKeyOp = "wrapKey";
            break;
          case usage === "decrypt":
            expectedKeyOp = alg.startsWith("RSA") ? "unwrapKey" : "deriveBits";
            break;
        }
        if (expectedKeyOp && key.key_ops?.includes?.(expectedKeyOp) === false) {
          throw new TypeError(`Invalid key for this operation, its "key_ops" must include "${expectedKeyOp}" when present`);
        }
      }
      return true;
    }, "jwkMatchesOp");
    symmetricTypeCheck = /* @__PURE__ */ __name((alg, key, usage) => {
      if (key instanceof Uint8Array)
        return;
      if (isJWK(key)) {
        if (isSecretJWK(key) && jwkMatchesOp(alg, key, usage))
          return;
        throw new TypeError(`JSON Web Key for symmetric algorithms must have JWK "kty" (Key Type) equal to "oct" and the JWK "k" (Key Value) present`);
      }
      if (!isKeyLike(key)) {
        throw new TypeError(withAlg(alg, key, "CryptoKey", "KeyObject", "JSON Web Key", "Uint8Array"));
      }
      if (key.type !== "secret") {
        throw new TypeError(`${tag(key)} instances for symmetric algorithms must be of type "secret"`);
      }
    }, "symmetricTypeCheck");
    asymmetricTypeCheck = /* @__PURE__ */ __name((alg, key, usage) => {
      if (isJWK(key)) {
        switch (usage) {
          case "decrypt":
          case "sign":
            if (isPrivateJWK(key) && jwkMatchesOp(alg, key, usage))
              return;
            throw new TypeError(`JSON Web Key for this operation must be a private JWK`);
          case "encrypt":
          case "verify":
            if (isPublicJWK(key) && jwkMatchesOp(alg, key, usage))
              return;
            throw new TypeError(`JSON Web Key for this operation must be a public JWK`);
        }
      }
      if (!isKeyLike(key)) {
        throw new TypeError(withAlg(alg, key, "CryptoKey", "KeyObject", "JSON Web Key"));
      }
      if (key.type === "secret") {
        throw new TypeError(`${tag(key)} instances for asymmetric algorithms must not be of type "secret"`);
      }
      if (key.type === "public") {
        switch (usage) {
          case "sign":
            throw new TypeError(`${tag(key)} instances for asymmetric algorithm signing must be of type "private"`);
          case "decrypt":
            throw new TypeError(`${tag(key)} instances for asymmetric algorithm decryption must be of type "private"`);
        }
      }
      if (key.type === "private") {
        switch (usage) {
          case "verify":
            throw new TypeError(`${tag(key)} instances for asymmetric algorithm verifying must be of type "public"`);
          case "encrypt":
            throw new TypeError(`${tag(key)} instances for asymmetric algorithm encryption must be of type "public"`);
        }
      }
    }, "asymmetricTypeCheck");
  }
});
async function flattenedVerify(jws, key, options) {
  if (!isObject(jws)) {
    throw new JWSInvalid("Flattened JWS must be an object");
  }
  if (jws.protected === void 0 && jws.header === void 0) {
    throw new JWSInvalid('Flattened JWS must have either of the "protected" or "header" members');
  }
  if (jws.protected !== void 0 && typeof jws.protected !== "string") {
    throw new JWSInvalid("JWS Protected Header incorrect type");
  }
  if (jws.payload === void 0) {
    throw new JWSInvalid("JWS Payload missing");
  }
  if (typeof jws.signature !== "string") {
    throw new JWSInvalid("JWS Signature missing or incorrect type");
  }
  if (jws.header !== void 0 && !isObject(jws.header)) {
    throw new JWSInvalid("JWS Unprotected Header incorrect type");
  }
  let parsedProt = {};
  if (jws.protected) {
    try {
      const protectedHeader = decode(jws.protected);
      parsedProt = JSON.parse(decoder.decode(protectedHeader));
    } catch {
      throw new JWSInvalid("JWS Protected Header is invalid");
    }
  }
  if (!isDisjoint(parsedProt, jws.header)) {
    throw new JWSInvalid("JWS Protected and JWS Unprotected Header Parameter names must be disjoint");
  }
  const joseHeader = {
    ...parsedProt,
    ...jws.header
  };
  const extensions = validateCrit(JWSInvalid, /* @__PURE__ */ new Map([["b64", true]]), options?.crit, parsedProt, joseHeader);
  let b64 = true;
  if (extensions.has("b64")) {
    b64 = parsedProt.b64;
    if (typeof b64 !== "boolean") {
      throw new JWSInvalid('The "b64" (base64url-encode payload) Header Parameter must be a boolean');
    }
  }
  const { alg } = joseHeader;
  if (typeof alg !== "string" || !alg) {
    throw new JWSInvalid('JWS "alg" (Algorithm) Header Parameter missing or invalid');
  }
  const algorithms = options && validateAlgorithms("algorithms", options.algorithms);
  if (algorithms && !algorithms.has(alg)) {
    throw new JOSEAlgNotAllowed('"alg" (Algorithm) Header Parameter value not allowed');
  }
  if (b64) {
    if (typeof jws.payload !== "string") {
      throw new JWSInvalid("JWS Payload must be a string");
    }
  } else if (typeof jws.payload !== "string" && !(jws.payload instanceof Uint8Array)) {
    throw new JWSInvalid("JWS Payload must be a string or an Uint8Array instance");
  }
  let resolvedKey = false;
  if (typeof key === "function") {
    key = await key(parsedProt, jws);
    resolvedKey = true;
  }
  checkKeyType(alg, key, "verify");
  const data = concat(jws.protected !== void 0 ? encode(jws.protected) : new Uint8Array(), encode("."), typeof jws.payload === "string" ? b64 ? encode(jws.payload) : encoder.encode(jws.payload) : jws.payload);
  const signature = decodeBase64url(jws.signature, "signature", JWSInvalid);
  const k = await normalizeKey(key, alg);
  const verified = await verify(alg, k, signature, data);
  if (!verified) {
    throw new JWSSignatureVerificationFailed();
  }
  let payload;
  if (b64) {
    payload = decodeBase64url(jws.payload, "payload", JWSInvalid);
  } else if (typeof jws.payload === "string") {
    payload = encoder.encode(jws.payload);
  } else {
    payload = jws.payload;
  }
  const result = { payload };
  if (jws.protected !== void 0) {
    result.protectedHeader = parsedProt;
  }
  if (jws.header !== void 0) {
    result.unprotectedHeader = jws.header;
  }
  if (resolvedKey) {
    return { ...result, key: k };
  }
  return result;
}
__name(flattenedVerify, "flattenedVerify");
var init_verify = __esm({
  "cloudflare/node_modules/jose/dist/webapi/jws/flattened/verify.js"() {
    init_base64url();
    init_signing();
    init_errors();
    init_buffer_utils();
    init_helpers();
    init_type_checks();
    init_type_checks();
    init_check_key_type();
    init_validate_crit();
    init_validate_algorithms();
    init_normalize_key();
  }
});
async function compactVerify(jws, key, options) {
  if (jws instanceof Uint8Array) {
    jws = decoder.decode(jws);
  }
  if (typeof jws !== "string") {
    throw new JWSInvalid("Compact JWS must be a string or Uint8Array");
  }
  const { 0: protectedHeader, 1: payload, 2: signature, length } = jws.split(".");
  if (length !== 3) {
    throw new JWSInvalid("Invalid Compact JWS");
  }
  const verified = await flattenedVerify({ payload, protected: protectedHeader, signature }, key, options);
  const result = { payload: verified.payload, protectedHeader: verified.protectedHeader };
  if (typeof key === "function") {
    return { ...result, key: verified.key };
  }
  return result;
}
__name(compactVerify, "compactVerify");
var init_verify2 = __esm({
  "cloudflare/node_modules/jose/dist/webapi/jws/compact/verify.js"() {
    init_verify();
    init_errors();
    init_buffer_utils();
  }
});
function secs(str) {
  const matched = REGEX.exec(str);
  if (!matched || matched[4] && matched[1]) {
    throw new TypeError("Invalid time period format");
  }
  const value = parseFloat(matched[2]);
  const unit = matched[3].toLowerCase();
  let numericDate;
  switch (unit) {
    case "sec":
    case "secs":
    case "second":
    case "seconds":
    case "s":
      numericDate = Math.round(value);
      break;
    case "minute":
    case "minutes":
    case "min":
    case "mins":
    case "m":
      numericDate = Math.round(value * minute);
      break;
    case "hour":
    case "hours":
    case "hr":
    case "hrs":
    case "h":
      numericDate = Math.round(value * hour);
      break;
    case "day":
    case "days":
    case "d":
      numericDate = Math.round(value * day);
      break;
    case "week":
    case "weeks":
    case "w":
      numericDate = Math.round(value * week);
      break;
    default:
      numericDate = Math.round(value * year);
      break;
  }
  if (matched[1] === "-" || matched[4] === "ago") {
    return -numericDate;
  }
  return numericDate;
}
__name(secs, "secs");
function validateInput(label, input) {
  if (!Number.isFinite(input)) {
    throw new TypeError(`Invalid ${label} input`);
  }
  return input;
}
__name(validateInput, "validateInput");
function validateClaimsSet(protectedHeader, encodedPayload, options = {}) {
  let payload;
  try {
    payload = JSON.parse(decoder.decode(encodedPayload));
  } catch {
  }
  if (!isObject(payload)) {
    throw new JWTInvalid("JWT Claims Set must be a top-level JSON object");
  }
  const { typ } = options;
  if (typ && (typeof protectedHeader.typ !== "string" || normalizeTyp(protectedHeader.typ) !== normalizeTyp(typ))) {
    throw new JWTClaimValidationFailed('unexpected "typ" JWT header value', payload, "typ", "check_failed");
  }
  const { requiredClaims = [], issuer, subject, audience, maxTokenAge } = options;
  const presenceCheck = [...requiredClaims];
  if (maxTokenAge !== void 0)
    presenceCheck.push("iat");
  if (audience !== void 0)
    presenceCheck.push("aud");
  if (subject !== void 0)
    presenceCheck.push("sub");
  if (issuer !== void 0)
    presenceCheck.push("iss");
  for (const claim of new Set(presenceCheck.reverse())) {
    if (!(claim in payload)) {
      throw new JWTClaimValidationFailed(`missing required "${claim}" claim`, payload, claim, "missing");
    }
  }
  if (issuer && !(Array.isArray(issuer) ? issuer : [issuer]).includes(payload.iss)) {
    throw new JWTClaimValidationFailed('unexpected "iss" claim value', payload, "iss", "check_failed");
  }
  if (subject && payload.sub !== subject) {
    throw new JWTClaimValidationFailed('unexpected "sub" claim value', payload, "sub", "check_failed");
  }
  if (audience && !checkAudiencePresence(payload.aud, typeof audience === "string" ? [audience] : audience)) {
    throw new JWTClaimValidationFailed('unexpected "aud" claim value', payload, "aud", "check_failed");
  }
  let tolerance;
  switch (typeof options.clockTolerance) {
    case "string":
      tolerance = secs(options.clockTolerance);
      break;
    case "number":
      tolerance = options.clockTolerance;
      break;
    case "undefined":
      tolerance = 0;
      break;
    default:
      throw new TypeError("Invalid clockTolerance option type");
  }
  const { currentDate } = options;
  const now = epoch(currentDate || /* @__PURE__ */ new Date());
  if ((payload.iat !== void 0 || maxTokenAge) && typeof payload.iat !== "number") {
    throw new JWTClaimValidationFailed('"iat" claim must be a number', payload, "iat", "invalid");
  }
  if (payload.nbf !== void 0) {
    if (typeof payload.nbf !== "number") {
      throw new JWTClaimValidationFailed('"nbf" claim must be a number', payload, "nbf", "invalid");
    }
    if (payload.nbf > now + tolerance) {
      throw new JWTClaimValidationFailed('"nbf" claim timestamp check failed', payload, "nbf", "check_failed");
    }
  }
  if (payload.exp !== void 0) {
    if (typeof payload.exp !== "number") {
      throw new JWTClaimValidationFailed('"exp" claim must be a number', payload, "exp", "invalid");
    }
    if (payload.exp <= now - tolerance) {
      throw new JWTExpired('"exp" claim timestamp check failed', payload, "exp", "check_failed");
    }
  }
  if (maxTokenAge) {
    const age = now - payload.iat;
    const max = typeof maxTokenAge === "number" ? maxTokenAge : secs(maxTokenAge);
    if (age - tolerance > max) {
      throw new JWTExpired('"iat" claim timestamp check failed (too far in the past)', payload, "iat", "check_failed");
    }
    if (age < 0 - tolerance) {
      throw new JWTClaimValidationFailed('"iat" claim timestamp check failed (it should be in the past)', payload, "iat", "check_failed");
    }
  }
  return payload;
}
__name(validateClaimsSet, "validateClaimsSet");
var epoch;
var minute;
var hour;
var day;
var week;
var year;
var REGEX;
var normalizeTyp;
var checkAudiencePresence;
var JWTClaimsBuilder;
var init_jwt_claims_set = __esm({
  "cloudflare/node_modules/jose/dist/webapi/lib/jwt_claims_set.js"() {
    init_errors();
    init_buffer_utils();
    init_type_checks();
    epoch = /* @__PURE__ */ __name((date) => Math.floor(date.getTime() / 1e3), "epoch");
    minute = 60;
    hour = minute * 60;
    day = hour * 24;
    week = day * 7;
    year = day * 365.25;
    REGEX = /^(\+|\-)? ?(\d+|\d+\.\d+) ?(seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|years?|yrs?|y)(?: (ago|from now))?$/i;
    normalizeTyp = /* @__PURE__ */ __name((value) => {
      if (value.includes("/")) {
        return value.toLowerCase();
      }
      return `application/${value.toLowerCase()}`;
    }, "normalizeTyp");
    checkAudiencePresence = /* @__PURE__ */ __name((audPayload, audOption) => {
      if (typeof audPayload === "string") {
        return audOption.includes(audPayload);
      }
      if (Array.isArray(audPayload)) {
        return audOption.some(Set.prototype.has.bind(new Set(audPayload)));
      }
      return false;
    }, "checkAudiencePresence");
    JWTClaimsBuilder = class {
      static {
        __name(this, "JWTClaimsBuilder");
      }
      #payload;
      constructor(payload) {
        if (!isObject(payload)) {
          throw new TypeError("JWT Claims Set MUST be an object");
        }
        this.#payload = structuredClone(payload);
      }
      data() {
        return encoder.encode(JSON.stringify(this.#payload));
      }
      get iss() {
        return this.#payload.iss;
      }
      set iss(value) {
        this.#payload.iss = value;
      }
      get sub() {
        return this.#payload.sub;
      }
      set sub(value) {
        this.#payload.sub = value;
      }
      get aud() {
        return this.#payload.aud;
      }
      set aud(value) {
        this.#payload.aud = value;
      }
      set jti(value) {
        this.#payload.jti = value;
      }
      set nbf(value) {
        if (typeof value === "number") {
          this.#payload.nbf = validateInput("setNotBefore", value);
        } else if (value instanceof Date) {
          this.#payload.nbf = validateInput("setNotBefore", epoch(value));
        } else {
          this.#payload.nbf = epoch(/* @__PURE__ */ new Date()) + secs(value);
        }
      }
      set exp(value) {
        if (typeof value === "number") {
          this.#payload.exp = validateInput("setExpirationTime", value);
        } else if (value instanceof Date) {
          this.#payload.exp = validateInput("setExpirationTime", epoch(value));
        } else {
          this.#payload.exp = epoch(/* @__PURE__ */ new Date()) + secs(value);
        }
      }
      set iat(value) {
        if (value === void 0) {
          this.#payload.iat = epoch(/* @__PURE__ */ new Date());
        } else if (value instanceof Date) {
          this.#payload.iat = validateInput("setIssuedAt", epoch(value));
        } else if (typeof value === "string") {
          this.#payload.iat = validateInput("setIssuedAt", epoch(/* @__PURE__ */ new Date()) + secs(value));
        } else {
          this.#payload.iat = validateInput("setIssuedAt", value);
        }
      }
    };
  }
});
async function jwtVerify(jwt, key, options) {
  const verified = await compactVerify(jwt, key, options);
  if (verified.protectedHeader.crit?.includes("b64") && verified.protectedHeader.b64 === false) {
    throw new JWTInvalid("JWTs MUST NOT use unencoded payload");
  }
  const payload = validateClaimsSet(verified.protectedHeader, verified.payload, options);
  const result = { payload, protectedHeader: verified.protectedHeader };
  if (typeof key === "function") {
    return { ...result, key: verified.key };
  }
  return result;
}
__name(jwtVerify, "jwtVerify");
var init_verify3 = __esm({
  "cloudflare/node_modules/jose/dist/webapi/jwt/verify.js"() {
    init_verify2();
    init_jwt_claims_set();
    init_errors();
  }
});
var FlattenedSign;
var init_sign = __esm({
  "cloudflare/node_modules/jose/dist/webapi/jws/flattened/sign.js"() {
    init_base64url();
    init_signing();
    init_type_checks();
    init_errors();
    init_buffer_utils();
    init_check_key_type();
    init_validate_crit();
    init_normalize_key();
    init_helpers();
    FlattenedSign = class {
      static {
        __name(this, "FlattenedSign");
      }
      #payload;
      #protectedHeader;
      #unprotectedHeader;
      constructor(payload) {
        if (!(payload instanceof Uint8Array)) {
          throw new TypeError("payload must be an instance of Uint8Array");
        }
        this.#payload = payload;
      }
      setProtectedHeader(protectedHeader) {
        assertNotSet(this.#protectedHeader, "setProtectedHeader");
        this.#protectedHeader = protectedHeader;
        return this;
      }
      setUnprotectedHeader(unprotectedHeader) {
        assertNotSet(this.#unprotectedHeader, "setUnprotectedHeader");
        this.#unprotectedHeader = unprotectedHeader;
        return this;
      }
      async sign(key, options) {
        if (!this.#protectedHeader && !this.#unprotectedHeader) {
          throw new JWSInvalid("either setProtectedHeader or setUnprotectedHeader must be called before #sign()");
        }
        if (!isDisjoint(this.#protectedHeader, this.#unprotectedHeader)) {
          throw new JWSInvalid("JWS Protected and JWS Unprotected Header Parameter names must be disjoint");
        }
        const joseHeader = {
          ...this.#protectedHeader,
          ...this.#unprotectedHeader
        };
        const extensions = validateCrit(JWSInvalid, /* @__PURE__ */ new Map([["b64", true]]), options?.crit, this.#protectedHeader, joseHeader);
        let b64 = true;
        if (extensions.has("b64")) {
          b64 = this.#protectedHeader.b64;
          if (typeof b64 !== "boolean") {
            throw new JWSInvalid('The "b64" (base64url-encode payload) Header Parameter must be a boolean');
          }
        }
        const { alg } = joseHeader;
        if (typeof alg !== "string" || !alg) {
          throw new JWSInvalid('JWS "alg" (Algorithm) Header Parameter missing or invalid');
        }
        checkKeyType(alg, key, "sign");
        let payloadS;
        let payloadB;
        if (b64) {
          payloadS = encode2(this.#payload);
          payloadB = encode(payloadS);
        } else {
          payloadB = this.#payload;
          payloadS = "";
        }
        let protectedHeaderString;
        let protectedHeaderBytes;
        if (this.#protectedHeader) {
          protectedHeaderString = encode2(JSON.stringify(this.#protectedHeader));
          protectedHeaderBytes = encode(protectedHeaderString);
        } else {
          protectedHeaderString = "";
          protectedHeaderBytes = new Uint8Array();
        }
        const data = concat(protectedHeaderBytes, encode("."), payloadB);
        const k = await normalizeKey(key, alg);
        const signature = await sign(alg, k, data);
        const jws = {
          signature: encode2(signature),
          payload: payloadS
        };
        if (this.#unprotectedHeader) {
          jws.header = this.#unprotectedHeader;
        }
        if (this.#protectedHeader) {
          jws.protected = protectedHeaderString;
        }
        return jws;
      }
    };
  }
});
var CompactSign;
var init_sign2 = __esm({
  "cloudflare/node_modules/jose/dist/webapi/jws/compact/sign.js"() {
    init_sign();
    CompactSign = class {
      static {
        __name(this, "CompactSign");
      }
      #flattened;
      constructor(payload) {
        this.#flattened = new FlattenedSign(payload);
      }
      setProtectedHeader(protectedHeader) {
        this.#flattened.setProtectedHeader(protectedHeader);
        return this;
      }
      async sign(key, options) {
        const jws = await this.#flattened.sign(key, options);
        if (jws.payload === void 0) {
          throw new TypeError("use the flattened module for creating JWS with b64: false");
        }
        return `${jws.protected}.${jws.payload}.${jws.signature}`;
      }
    };
  }
});
var SignJWT;
var init_sign3 = __esm({
  "cloudflare/node_modules/jose/dist/webapi/jwt/sign.js"() {
    init_sign2();
    init_errors();
    init_jwt_claims_set();
    SignJWT = class {
      static {
        __name(this, "SignJWT");
      }
      #protectedHeader;
      #jwt;
      constructor(payload = {}) {
        this.#jwt = new JWTClaimsBuilder(payload);
      }
      setIssuer(issuer) {
        this.#jwt.iss = issuer;
        return this;
      }
      setSubject(subject) {
        this.#jwt.sub = subject;
        return this;
      }
      setAudience(audience) {
        this.#jwt.aud = audience;
        return this;
      }
      setJti(jwtId) {
        this.#jwt.jti = jwtId;
        return this;
      }
      setNotBefore(input) {
        this.#jwt.nbf = input;
        return this;
      }
      setExpirationTime(input) {
        this.#jwt.exp = input;
        return this;
      }
      setIssuedAt(input) {
        this.#jwt.iat = input;
        return this;
      }
      setProtectedHeader(protectedHeader) {
        this.#protectedHeader = protectedHeader;
        return this;
      }
      async sign(key, options) {
        const sig = new CompactSign(this.#jwt.data());
        sig.setProtectedHeader(this.#protectedHeader);
        if (Array.isArray(this.#protectedHeader?.crit) && this.#protectedHeader.crit.includes("b64") && this.#protectedHeader.b64 === false) {
          throw new JWTInvalid("JWTs MUST NOT use unencoded payload");
        }
        return sig.sign(key, options);
      }
    };
  }
});
function getKtyFromAlg(alg) {
  switch (typeof alg === "string" && alg.slice(0, 2)) {
    case "RS":
    case "PS":
      return "RSA";
    case "ES":
      return "EC";
    case "Ed":
      return "OKP";
    case "ML":
      return "AKP";
    default:
      throw new JOSENotSupported('Unsupported "alg" value for a JSON Web Key Set');
  }
}
__name(getKtyFromAlg, "getKtyFromAlg");
function isJWKSLike(jwks) {
  return jwks && typeof jwks === "object" && Array.isArray(jwks.keys) && jwks.keys.every(isJWKLike);
}
__name(isJWKSLike, "isJWKSLike");
function isJWKLike(key) {
  return isObject(key);
}
__name(isJWKLike, "isJWKLike");
async function importWithAlgCache(cache2, jwk, alg) {
  const cached = cache2.get(jwk) || cache2.set(jwk, {}).get(jwk);
  if (cached[alg] === void 0) {
    const key = await importJWK({ ...jwk, ext: true }, alg);
    if (key instanceof Uint8Array || key.type !== "public") {
      throw new JWKSInvalid("JSON Web Key Set members must be public keys");
    }
    cached[alg] = key;
  }
  return cached[alg];
}
__name(importWithAlgCache, "importWithAlgCache");
function createLocalJWKSet(jwks) {
  const set = new LocalJWKSet(jwks);
  const localJWKSet = /* @__PURE__ */ __name(async (protectedHeader, token2) => set.getKey(protectedHeader, token2), "localJWKSet");
  Object.defineProperties(localJWKSet, {
    jwks: {
      value: /* @__PURE__ */ __name(() => structuredClone(set.jwks()), "value"),
      enumerable: false,
      configurable: false,
      writable: false
    }
  });
  return localJWKSet;
}
__name(createLocalJWKSet, "createLocalJWKSet");
var LocalJWKSet;
var init_local = __esm({
  "cloudflare/node_modules/jose/dist/webapi/jwks/local.js"() {
    init_import();
    init_errors();
    init_type_checks();
    LocalJWKSet = class {
      static {
        __name(this, "LocalJWKSet");
      }
      #jwks;
      #cached = /* @__PURE__ */ new WeakMap();
      constructor(jwks) {
        if (!isJWKSLike(jwks)) {
          throw new JWKSInvalid("JSON Web Key Set malformed");
        }
        this.#jwks = structuredClone(jwks);
      }
      jwks() {
        return this.#jwks;
      }
      async getKey(protectedHeader, token2) {
        const { alg, kid } = { ...protectedHeader, ...token2?.header };
        const kty = getKtyFromAlg(alg);
        const candidates = this.#jwks.keys.filter((jwk2) => {
          let candidate = kty === jwk2.kty;
          if (candidate && typeof kid === "string") {
            candidate = kid === jwk2.kid;
          }
          if (candidate && (typeof jwk2.alg === "string" || kty === "AKP")) {
            candidate = alg === jwk2.alg;
          }
          if (candidate && typeof jwk2.use === "string") {
            candidate = jwk2.use === "sig";
          }
          if (candidate && Array.isArray(jwk2.key_ops)) {
            candidate = jwk2.key_ops.includes("verify");
          }
          if (candidate) {
            switch (alg) {
              case "ES256":
                candidate = jwk2.crv === "P-256";
                break;
              case "ES384":
                candidate = jwk2.crv === "P-384";
                break;
              case "ES512":
                candidate = jwk2.crv === "P-521";
                break;
              case "Ed25519":
              case "EdDSA":
                candidate = jwk2.crv === "Ed25519";
                break;
            }
          }
          return candidate;
        });
        const { 0: jwk, length } = candidates;
        if (length === 0) {
          throw new JWKSNoMatchingKey();
        }
        if (length !== 1) {
          const error = new JWKSMultipleMatchingKeys();
          const _cached = this.#cached;
          error[Symbol.asyncIterator] = async function* () {
            for (const jwk2 of candidates) {
              try {
                yield await importWithAlgCache(_cached, jwk2, alg);
              } catch {
              }
            }
          };
          throw error;
        }
        return importWithAlgCache(this.#cached, jwk, alg);
      }
    };
  }
});
function isCloudflareWorkers() {
  return typeof WebSocketPair !== "undefined" || typeof navigator !== "undefined" && true || typeof EdgeRuntime !== "undefined" && EdgeRuntime === "vercel";
}
__name(isCloudflareWorkers, "isCloudflareWorkers");
async function fetchJwks(url, headers, signal, fetchImpl = fetch) {
  const response = await fetchImpl(url, {
    method: "GET",
    signal,
    redirect: "manual",
    headers
  }).catch((err) => {
    if (err.name === "TimeoutError") {
      throw new JWKSTimeout();
    }
    throw err;
  });
  if (response.status !== 200) {
    throw new JOSEError("Expected 200 OK from the JSON Web Key Set HTTP response");
  }
  try {
    return await response.json();
  } catch {
    throw new JOSEError("Failed to parse the JSON Web Key Set HTTP response as JSON");
  }
}
__name(fetchJwks, "fetchJwks");
function isFreshJwksCache(input, cacheMaxAge) {
  if (typeof input !== "object" || input === null) {
    return false;
  }
  if (!("uat" in input) || typeof input.uat !== "number" || Date.now() - input.uat >= cacheMaxAge) {
    return false;
  }
  if (!("jwks" in input) || !isObject(input.jwks) || !Array.isArray(input.jwks.keys) || !Array.prototype.every.call(input.jwks.keys, isObject)) {
    return false;
  }
  return true;
}
__name(isFreshJwksCache, "isFreshJwksCache");
function createRemoteJWKSet(url, options) {
  const set = new RemoteJWKSet(url, options);
  const remoteJWKSet = /* @__PURE__ */ __name(async (protectedHeader, token2) => set.getKey(protectedHeader, token2), "remoteJWKSet");
  Object.defineProperties(remoteJWKSet, {
    coolingDown: {
      get: /* @__PURE__ */ __name(() => set.coolingDown(), "get"),
      enumerable: true,
      configurable: false
    },
    fresh: {
      get: /* @__PURE__ */ __name(() => set.fresh(), "get"),
      enumerable: true,
      configurable: false
    },
    reload: {
      value: /* @__PURE__ */ __name(() => set.reload(), "value"),
      enumerable: true,
      configurable: false,
      writable: false
    },
    reloading: {
      get: /* @__PURE__ */ __name(() => set.pendingFetch(), "get"),
      enumerable: true,
      configurable: false
    },
    jwks: {
      value: /* @__PURE__ */ __name(() => set.jwks(), "value"),
      enumerable: true,
      configurable: false,
      writable: false
    }
  });
  return remoteJWKSet;
}
__name(createRemoteJWKSet, "createRemoteJWKSet");
var USER_AGENT;
var customFetch;
var jwksCache;
var RemoteJWKSet;
var init_remote = __esm({
  "cloudflare/node_modules/jose/dist/webapi/jwks/remote.js"() {
    init_errors();
    init_local();
    init_type_checks();
    if (typeof navigator === "undefined" || !"Cloudflare-Workers"?.startsWith?.("Mozilla/5.0 ")) {
      const NAME = "jose";
      const VERSION = "v6.2.3";
      USER_AGENT = `${NAME}/${VERSION}`;
    }
    customFetch = /* @__PURE__ */ Symbol();
    jwksCache = /* @__PURE__ */ Symbol();
    RemoteJWKSet = class {
      static {
        __name(this, "RemoteJWKSet");
      }
      #url;
      #timeoutDuration;
      #cooldownDuration;
      #cacheMaxAge;
      #jwksTimestamp;
      #pendingFetch;
      #headers;
      #customFetch;
      #local;
      #cache;
      constructor(url, options) {
        if (!(url instanceof URL)) {
          throw new TypeError("url must be an instance of URL");
        }
        this.#url = new URL(url.href);
        this.#timeoutDuration = typeof options?.timeoutDuration === "number" ? options?.timeoutDuration : 5e3;
        this.#cooldownDuration = typeof options?.cooldownDuration === "number" ? options?.cooldownDuration : 3e4;
        this.#cacheMaxAge = typeof options?.cacheMaxAge === "number" ? options?.cacheMaxAge : 6e5;
        this.#headers = new Headers(options?.headers);
        if (USER_AGENT && !this.#headers.has("User-Agent")) {
          this.#headers.set("User-Agent", USER_AGENT);
        }
        if (!this.#headers.has("accept")) {
          this.#headers.set("accept", "application/json");
          this.#headers.append("accept", "application/jwk-set+json");
        }
        this.#customFetch = options?.[customFetch];
        if (options?.[jwksCache] !== void 0) {
          this.#cache = options?.[jwksCache];
          if (isFreshJwksCache(options?.[jwksCache], this.#cacheMaxAge)) {
            this.#jwksTimestamp = this.#cache.uat;
            this.#local = createLocalJWKSet(this.#cache.jwks);
          }
        }
      }
      pendingFetch() {
        return !!this.#pendingFetch;
      }
      coolingDown() {
        return typeof this.#jwksTimestamp === "number" ? Date.now() < this.#jwksTimestamp + this.#cooldownDuration : false;
      }
      fresh() {
        return typeof this.#jwksTimestamp === "number" ? Date.now() < this.#jwksTimestamp + this.#cacheMaxAge : false;
      }
      jwks() {
        return this.#local?.jwks();
      }
      async getKey(protectedHeader, token2) {
        if (!this.#local || !this.fresh()) {
          await this.reload();
        }
        try {
          return await this.#local(protectedHeader, token2);
        } catch (err) {
          if (err instanceof JWKSNoMatchingKey) {
            if (this.coolingDown() === false) {
              await this.reload();
              return this.#local(protectedHeader, token2);
            }
          }
          throw err;
        }
      }
      async reload() {
        if (this.#pendingFetch && isCloudflareWorkers()) {
          this.#pendingFetch = void 0;
        }
        this.#pendingFetch ||= fetchJwks(this.#url.href, this.#headers, AbortSignal.timeout(this.#timeoutDuration), this.#customFetch).then((json) => {
          this.#local = createLocalJWKSet(json);
          if (this.#cache) {
            this.#cache.uat = Date.now();
            this.#cache.jwks = json;
          }
          this.#jwksTimestamp = Date.now();
          this.#pendingFetch = void 0;
        }).catch((err) => {
          this.#pendingFetch = void 0;
          throw err;
        });
        await this.#pendingFetch;
      }
    };
  }
});
var init_webapi = __esm({
  "cloudflare/node_modules/jose/dist/webapi/index.js"() {
    init_verify3();
    init_sign3();
    init_remote();
    init_import();
  }
});
var OAUTH2_TOKEN_URL;
var IDENTITY_TOOLKIT_CUSTOM_TOKEN_URL;
var FIREBASE_CUSTOM_TOKEN_AUDIENCE;
var FIREBASE_SCOPES;
var ID;
var PATH_ID;
var OPERATION;
var REFRESH_BUFFER_MS;
var TokenCache;
var tokenCaches;
var getTokenCache;
var stableCourseClaims;
var assertCourseClaims;
var jwtClaimsFor;
var createCourseBookAuthority102TokenProvider;
var parseJsonBody;
var encodeRtdbPath;
var rtdbUrl;
var withQuery;
var PATCH_PATH;
var FirebaseRtdbRestClient;
var init_rtdb = __esm({
  "../../../../tmp/notification-successor-qualified-20261001/cloudflare/src/upload-worker/listening-authoring/rtdb.ts"() {
    "use strict";
    init_webapi();
    OAUTH2_TOKEN_URL = "https://oauth2.googleapis.com/token";
    IDENTITY_TOOLKIT_CUSTOM_TOKEN_URL = "https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken";
    FIREBASE_CUSTOM_TOKEN_AUDIENCE = "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit";
    FIREBASE_SCOPES = [
      "https://www.googleapis.com/auth/firebase.database",
      "https://www.googleapis.com/auth/datastore",
      "https://www.googleapis.com/auth/userinfo.email"
    ].join(" ");
    ID = /^[A-Za-z0-9][A-Za-z0-9:_-]{2,159}$/u;
    PATH_ID = /^[A-Za-z0-9._:@-]{1,160}$/u;
    OPERATION = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
    REFRESH_BUFFER_MS = 5 * 60 * 1e3;
    TokenCache = class {
      static {
        __name(this, "TokenCache");
      }
      constructor(saKeyJson) {
        this.saKeyJson = saKeyJson;
      }
      saKeyJson;
      cachedToken = null;
      expiresAt = 0;
      async getToken(fetchImpl) {
        if (this.cachedToken && Date.now() < this.expiresAt - REFRESH_BUFFER_MS) {
          return this.cachedToken;
        }
        let serviceAccount;
        try {
          serviceAccount = JSON.parse(this.saKeyJson);
        } catch {
          throw new Error("invalid_google_sa_key");
        }
        if (!serviceAccount.client_email || !serviceAccount.private_key) {
          throw new Error("invalid_google_sa_key");
        }
        const privateKey = await importPKCS8(serviceAccount.private_key, "RS256");
        const now = Math.floor(Date.now() / 1e3);
        const assertion = await new SignJWT({
          iss: serviceAccount.client_email,
          sub: serviceAccount.client_email,
          aud: OAUTH2_TOKEN_URL,
          iat: now,
          exp: now + 3600,
          scope: FIREBASE_SCOPES
        }).setProtectedHeader({ alg: "RS256" }).sign(privateKey);
        const response = await fetchImpl.call(globalThis, OAUTH2_TOKEN_URL, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${assertion}`
        });
        const body = await response.text();
        if (!response.ok) throw new Error(`google_oauth_failed:${response.status}:${body}`);
        const token2 = JSON.parse(body);
        if (typeof token2.access_token !== "string" || token2.access_token === "") {
          throw new Error("google_oauth_failed:invalid_response");
        }
        this.cachedToken = token2.access_token;
        this.expiresAt = Date.now() + Math.max(0, (token2.expires_in || 3600) * 1e3);
        return this.cachedToken;
      }
    };
    tokenCaches = /* @__PURE__ */ new Map();
    getTokenCache = /* @__PURE__ */ __name((saKeyJson) => {
      let cache2 = tokenCaches.get(saKeyJson);
      if (!cache2) {
        cache2 = new TokenCache(saKeyJson);
        tokenCaches.set(saKeyJson, cache2);
      }
      return cache2;
    }, "getTokenCache");
    stableCourseClaims = /* @__PURE__ */ __name((claims) => {
      switch (claims.operation) {
        case "enrollment-transition":
          return JSON.stringify({
            operation: claims.operation,
            actorUid: claims.actorUid,
            courseId: claims.courseId,
            studentId: claims.studentId,
            legacyEnrollmentId: claims.legacyEnrollmentId,
            expectedLegacyRevision: claims.expectedLegacyRevision,
            expectedAuthorityRevision: claims.expectedAuthorityRevision,
            operationId: claims.operationId
          });
        case "release-transition":
          return JSON.stringify({
            operation: claims.operation,
            actorUid: claims.actorUid,
            courseId: claims.courseId,
            moduleId: claims.moduleId,
            studentId: claims.studentId,
            expectedReleaseRevision: claims.expectedReleaseRevision,
            operationId: claims.operationId
          });
        case "enrollment-request-transition":
          return JSON.stringify({
            operation: claims.operation,
            actorUid: claims.actorUid,
            courseId: claims.courseId,
            studentId: claims.studentId,
            legacyEnrollmentId: claims.legacyEnrollmentId,
            requestId: claims.requestId,
            requestType: claims.requestType,
            expectedLegacyRevision: claims.expectedLegacyRevision,
            expectedAuthorityRevision: claims.expectedAuthorityRevision,
            operationId: claims.operationId
          });
        default:
          throw new Error("invalid_course_book_authority_102_claims");
      }
    }, "stableCourseClaims");
    assertCourseClaims = /* @__PURE__ */ __name((claims) => {
      if (!claims || typeof claims !== "object" || Array.isArray(claims)) {
        throw new Error("invalid_course_book_authority_102_claims");
      }
      if (claims.operation === "enrollment-transition") {
        const keys = Object.keys(claims).sort();
        if (keys.join("\0") !== [
          "actorUid",
          "courseId",
          "expectedAuthorityRevision",
          "expectedLegacyRevision",
          "legacyEnrollmentId",
          "operation",
          "operationId",
          "studentId"
        ].sort().join("\0")) {
          throw new Error("invalid_course_book_authority_102_claims");
        }
        if (!ID.test(claims.actorUid) || ![claims.courseId, claims.studentId, claims.legacyEnrollmentId].every((value) => typeof value === "string" && PATH_ID.test(value)) || !OPERATION.test(claims.operationId) || !Number.isSafeInteger(claims.expectedLegacyRevision) || !Number.isSafeInteger(claims.expectedAuthorityRevision) || claims.expectedLegacyRevision < 0 || claims.expectedAuthorityRevision < 0) {
          throw new Error("invalid_course_book_authority_102_claims");
        }
        return;
      }
      if (claims.operation === "release-transition") {
        const keys = Object.keys(claims).sort();
        if (keys.join("\0") !== [
          "actorUid",
          "courseId",
          "expectedReleaseRevision",
          "moduleId",
          "operation",
          "operationId",
          "studentId"
        ].sort().join("\0")) {
          throw new Error("invalid_course_book_authority_102_claims");
        }
        if (![claims.actorUid, claims.courseId, claims.moduleId, claims.studentId].every((value) => typeof value === "string" && ID.test(value)) || !OPERATION.test(claims.operationId) || !Number.isSafeInteger(claims.expectedReleaseRevision) || claims.expectedReleaseRevision < 0) {
          throw new Error("invalid_course_book_authority_102_claims");
        }
        return;
      }
      if (claims.operation === "enrollment-request-transition") {
        const keys = Object.keys(claims).sort();
        if (keys.join("\0") !== [
          "actorUid",
          "courseId",
          "expectedAuthorityRevision",
          "expectedLegacyRevision",
          "legacyEnrollmentId",
          "operation",
          "operationId",
          "requestId",
          "requestType",
          "studentId"
        ].sort().join("\0")) throw new Error("invalid_course_book_authority_102_claims");
        if (!ID.test(claims.actorUid) || ![claims.courseId, claims.studentId, claims.legacyEnrollmentId].every((value) => typeof value === "string" && PATH_ID.test(value)) || !/^[A-Za-z0-9_-]{1,128}$/u.test(claims.requestId) || claims.requestType !== "join" && claims.requestType !== "unenroll" || !OPERATION.test(claims.operationId) || !Number.isSafeInteger(claims.expectedLegacyRevision) || !Number.isSafeInteger(claims.expectedAuthorityRevision) || claims.expectedLegacyRevision < 0 || claims.expectedAuthorityRevision < 0) {
          throw new Error("invalid_course_book_authority_102_claims");
        }
        return;
      }
      throw new Error("invalid_course_book_authority_102_claims");
    }, "assertCourseClaims");
    jwtClaimsFor = /* @__PURE__ */ __name((claims) => {
      switch (claims.operation) {
        case "enrollment-transition":
          return {
            courseBookAuthority102: true,
            operation: claims.operation,
            actorUid: claims.actorUid,
            courseId: claims.courseId,
            studentId: claims.studentId,
            legacyEnrollmentId: claims.legacyEnrollmentId,
            expectedLegacyRevision: claims.expectedLegacyRevision,
            expectedAuthorityRevision: claims.expectedAuthorityRevision,
            operationId: claims.operationId
          };
        case "release-transition":
          return {
            courseBookAuthority102: true,
            operation: claims.operation,
            actorUid: claims.actorUid,
            courseId: claims.courseId,
            moduleId: claims.moduleId,
            studentId: claims.studentId,
            expectedReleaseRevision: claims.expectedReleaseRevision,
            operationId: claims.operationId
          };
        case "enrollment-request-transition":
          return {
            courseBookAuthority102: true,
            operation: claims.operation,
            actorUid: claims.actorUid,
            courseId: claims.courseId,
            studentId: claims.studentId,
            legacyEnrollmentId: claims.legacyEnrollmentId,
            requestId: claims.requestId,
            requestType: claims.requestType,
            expectedLegacyRevision: claims.expectedLegacyRevision,
            expectedAuthorityRevision: claims.expectedAuthorityRevision,
            operationId: claims.operationId
          };
        default:
          throw new Error("invalid_course_book_authority_102_claims");
      }
    }, "jwtClaimsFor");
    createCourseBookAuthority102TokenProvider = /* @__PURE__ */ __name((options) => {
      const fetchImpl = options.fetchImpl ?? globalThis.fetch;
      const now = options.now ?? Date.now;
      const tokenCache = /* @__PURE__ */ new Map();
      return async (claims) => {
        assertCourseClaims(claims);
        const serviceAccountJson = options.env.GOOGLE_SA_KEY?.trim();
        const apiKey = options.env.FIREBASE_WEB_API_KEY?.trim();
        if (!serviceAccountJson) throw new Error("missing_course_book_authority_google_sa_key");
        if (!apiKey) throw new Error("missing_course_book_authority_firebase_web_api_key");
        let serviceAccount;
        try {
          serviceAccount = JSON.parse(serviceAccountJson);
        } catch {
          throw new Error("invalid_course_book_authority_google_sa_key");
        }
        if (!serviceAccount || typeof serviceAccount !== "object" || Array.isArray(serviceAccount) || typeof serviceAccount.client_email !== "string" || !serviceAccount.client_email.trim() || typeof serviceAccount.private_key !== "string" || !serviceAccount.private_key.trim()) {
          throw new Error("invalid_course_book_authority_google_sa_key");
        }
        const cacheKey = JSON.stringify([
          apiKey,
          serviceAccountJson,
          stableCourseClaims(claims)
        ]);
        const cached = tokenCache.get(cacheKey);
        if (cached && now() < cached.expiresAt - 6e4) return cached.token;
        const issuedAt = Math.floor(now() / 1e3);
        const privateKey = await importPKCS8(serviceAccount.private_key, "RS256");
        const customToken = await new SignJWT({
          iss: serviceAccount.client_email,
          sub: serviceAccount.client_email,
          aud: FIREBASE_CUSTOM_TOKEN_AUDIENCE,
          iat: issuedAt,
          exp: issuedAt + 300,
          uid: `course-book-authority-102:${claims.operationId}`,
          claims: jwtClaimsFor(claims)
        }).setProtectedHeader({ alg: "RS256", typ: "JWT" }).sign(privateKey);
        let response;
        try {
          response = await fetchImpl.call(globalThis, `${IDENTITY_TOOLKIT_CUSTOM_TOKEN_URL}?key=${encodeURIComponent(apiKey)}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: customToken, returnSecureToken: true })
          });
        } catch {
          throw new Error("course_book_authority_token_exchange_transport_failed");
        }
        const raw = await response.text();
        if (!response.ok) throw new Error(`course_book_authority_token_exchange_failed:${response.status}`);
        let exchanged;
        try {
          exchanged = JSON.parse(raw);
        } catch {
          throw new Error("course_book_authority_token_exchange_invalid_response");
        }
        const expiresIn = exchanged.expiresIn;
        const expiresInString = typeof expiresIn === "number" ? Number.isSafeInteger(expiresIn) ? String(expiresIn) : "" : typeof expiresIn === "string" ? expiresIn : "";
        const expiresInSeconds = Number(expiresInString);
        if (typeof exchanged.idToken !== "string" || exchanged.idToken.length < 16 || exchanged.idToken.trim() !== exchanged.idToken || !/^\d+$/u.test(expiresInString) || !Number.isSafeInteger(expiresInSeconds) || expiresInSeconds < 1) {
          throw new Error("course_book_authority_token_exchange_invalid_response");
        }
        const lifetime = Math.min(300, expiresInSeconds) * 1e3;
        tokenCache.set(cacheKey, { token: exchanged.idToken, expiresAt: now() + lifetime });
        return exchanged.idToken;
      };
    }, "createCourseBookAuthority102TokenProvider");
    parseJsonBody = /* @__PURE__ */ __name((value) => {
      if (!value.trim()) return null;
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    }, "parseJsonBody");
    encodeRtdbPath = /* @__PURE__ */ __name((path) => path.split("/").filter(Boolean).map((part) => encodeURIComponent(part)).join("/"), "encodeRtdbPath");
    rtdbUrl = /* @__PURE__ */ __name((env, path) => {
      const baseUrl = env.FIREBASE_DB_URL?.trim().replace(/\/$/u, "");
      if (!baseUrl) throw new Error("missing_firebase_db_url");
      const encodedPath = encodeRtdbPath(path);
      return encodedPath ? `${baseUrl}/${encodedPath}.json` : `${baseUrl}/.json`;
    }, "rtdbUrl");
    withQuery = /* @__PURE__ */ __name((url, query, authToken) => {
      const parameters = new URLSearchParams();
      if (query) {
        parameters.set("orderBy", JSON.stringify(query.orderBy));
        if (query.equalTo !== void 0) parameters.set("equalTo", JSON.stringify(query.equalTo));
        if (query.startAt !== void 0) parameters.set("startAt", JSON.stringify(query.startAt));
        if (query.limitToFirst !== void 0) parameters.set("limitToFirst", String(query.limitToFirst));
        if (query.limitToLast !== void 0) parameters.set("limitToLast", String(query.limitToLast));
      }
      if (authToken !== void 0) parameters.set("auth", authToken);
      const encoded = parameters.toString();
      return encoded ? `${url}?${encoded}` : url;
    }, "withQuery");
    PATCH_PATH = /^[A-Za-z0-9_-]{1,160}(?:\/[A-Za-z0-9_-]{1,160})*$/u;
    FirebaseRtdbRestClient = class {
      static {
        __name(this, "FirebaseRtdbRestClient");
      }
      constructor(options) {
        this.options = options;
      }
      options;
      async readValue(path, query) {
        if (this.options.env.readDatabaseValue) {
          return this.options.env.readDatabaseValue(path, query);
        }
        const auth = await this.requestAuth(path, query);
        const response = await this.options.fetchImpl.call(globalThis, auth.url, {
          method: "GET",
          headers: auth.headers
        });
        const body = parseJsonBody(await response.text());
        if (!response.ok) throw new Error(`firebase_rtdb_get_failed:${response.status}`);
        return body;
      }
      async readWithEtag(path) {
        const auth = await this.requestAuth(path);
        const response = await this.options.fetchImpl.call(globalThis, auth.url, {
          method: "GET",
          headers: {
            ...auth.headers,
            "X-Firebase-ETag": "true"
          }
        });
        const body = parseJsonBody(await response.text());
        if (!response.ok) throw new Error(`firebase_rtdb_get_failed:${response.status}`);
        const etag = response.headers.get("etag");
        if (!etag) throw new Error(`missing_firebase_etag:${path || "/"}`);
        return { data: body, etag };
      }
      async patchMultiLocation(updates) {
        if (!this.options.firebaseAuthToken) {
          throw new Error("firebase_rtdb_multi_location_patch_requires_firebase_auth_token");
        }
        if (!Array.isArray(updates) || updates.length < 2) {
          throw new Error("firebase_rtdb_multi_location_patch_invalid");
        }
        const payload = {};
        for (const update of updates) {
          const path = update?.path;
          if (typeof path !== "string" || !PATCH_PATH.test(path) || Object.prototype.hasOwnProperty.call(payload, path) || Object.keys(payload).some((other) => path.startsWith(`${other}/`) || other.startsWith(`${path}/`))) {
            throw new Error("firebase_rtdb_multi_location_patch_invalid");
          }
          payload[path] = update.value;
        }
        const auth = await this.requestAuth("");
        let response;
        try {
          response = await this.options.fetchImpl.call(globalThis, auth.url, {
            method: "PATCH",
            headers: { ...auth.headers, "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });
        } catch {
          throw new Error("firebase_rtdb_multi_location_patch_transport_failed");
        }
        if (!response.ok) throw new Error(`firebase_rtdb_multi_location_patch_failed:${response.status}`);
      }
      async writeIfMatch(path, value, etag) {
        const auth = await this.requestAuth(path);
        const response = await this.options.fetchImpl.call(globalThis, auth.url, {
          method: "PUT",
          headers: {
            ...auth.headers,
            "Content-Type": "application/json",
            "if-match": etag
          },
          body: JSON.stringify(value)
        });
        if (response.status === 412) return false;
        if (!response.ok) {
          const body = (await response.text()).slice(0, 240).replace(/[\r\n]+/gu, " ");
          throw new Error(`firebase_rtdb_put_failed:${response.status}:${body}`);
        }
        return true;
      }
      async accessToken(request) {
        if (this.options.getAccessToken) return this.options.getAccessToken(request);
        return this.getAccessToken();
      }
      getAccessToken() {
        const saKey = this.options.env.GOOGLE_SA_KEY?.trim();
        if (!saKey) throw new Error("missing_google_sa_key");
        return getTokenCache(saKey).getToken(this.options.fetchImpl);
      }
      async requestAuth(path, query) {
        if (this.options.firebaseAuthToken) {
          const getFirebaseAuthToken = this.options.getFirebaseAuthToken ?? this.options.getAccessToken;
          if (!getFirebaseAuthToken) {
            throw new Error("firebase_rtdb_multi_location_patch_requires_firebase_auth_token");
          }
          const token2 = await getFirebaseAuthToken({ path, query });
          if (typeof token2 !== "string" || !token2.trim()) {
            throw new Error("firebase_rtdb_multi_location_patch_requires_firebase_auth_token");
          }
          return { url: withQuery(rtdbUrl(this.options.env, path), query, token2), headers: {} };
        }
        return {
          url: withQuery(rtdbUrl(this.options.env, path), query),
          headers: { Authorization: `Bearer ${await this.accessToken({ path, query })}` }
        };
      }
    };
  }
});
var ID2;
var PATH_ID2;
var OPERATION2;
var clone;
var stable;
var FirebaseCourseEnrollmentAuthorityPort;
var init_enrollment_authority = __esm({
  "../../../../tmp/notification-successor-qualified-20261001/cloudflare/src/upload-worker/course-book-placement/enrollment-authority.ts"() {
    "use strict";
    init_rtdb();
    ID2 = /^[A-Za-z0-9][A-Za-z0-9:_-]{2,159}$/u;
    PATH_ID2 = /^[A-Za-z0-9._:@-]{1,160}$/u;
    OPERATION2 = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
    clone = /* @__PURE__ */ __name((value) => structuredClone(value), "clone");
    stable = /* @__PURE__ */ __name((value) => JSON.stringify(value, Object.keys(value).sort()), "stable");
    FirebaseCourseEnrollmentAuthorityPort = class {
      static {
        __name(this, "FirebaseCourseEnrollmentAuthorityPort");
      }
      constructor(options) {
        this.options = options;
        const fetchImpl = options.fetchImpl ?? globalThis.fetch;
        this.read = new FirebaseRtdbRestClient({ env: options.env, fetchImpl });
        this.tokenFor = createCourseBookAuthority102TokenProvider({ env: options.env, fetchImpl });
      }
      options;
      read;
      tokenFor;
      async transitionDirectCourseEnrollment(input) {
        if (![input.actorUid, input.courseId, input.studentId, input.legacyEnrollmentId].every((value) => ID2.test(value)) || !OPERATION2.test(input.operationId)) throw new Error("invalid_course_enrollment_transition");
        const [legacyRaw, authorityRaw, receiptRaw] = await Promise.all([
          this.read.readValue(`course_enrollments/${input.legacyEnrollmentId}`),
          this.read.readValue(`course_book_authority/enrollments/${input.courseId}/${input.studentId}`),
          this.read.readValue(`course_book_authority/operations/${input.operationId}`)
        ]);
        if (!legacyRaw || typeof legacyRaw !== "object" || Array.isArray(legacyRaw)) throw new Error("course_enrollment_not_found");
        const legacy = legacyRaw;
        if (legacy.courseId !== input.courseId || legacy.studentId !== input.studentId || legacy.enrollmentType === "class-based") {
          throw new Error("course_enrollment_not_direct_course");
        }
        const previousAuthority = authorityRaw && typeof authorityRaw === "object" && !Array.isArray(authorityRaw) ? authorityRaw : null;
        const legacyRevision = Number.isSafeInteger(legacy.revision) ? Number(legacy.revision) : 0;
        const authorityRevision = previousAuthority && Number.isSafeInteger(previousAuthority.revision) ? Number(previousAuthority.revision) : 0;
        const fingerprint = stable({ ...input, expiresAt: input.expiresAt ?? null });
        if (receiptRaw !== null && receiptRaw !== void 0) {
          const receipt2 = receiptRaw;
          if (receipt2.fingerprint !== fingerprint) return { status: "conflict" };
          return { status: "replayed" };
        }
        const now = this.options.now?.() ?? (/* @__PURE__ */ new Date()).toISOString();
        const nextLegacy = { ...clone(legacy), status: input.status, ...input.expiresAt ? { expiresAt: input.expiresAt } : {}, revision: legacyRevision + 1, operationId: input.operationId };
        const nextAuthority = {
          legacyEnrollmentId: input.legacyEnrollmentId,
          courseId: input.courseId,
          studentId: input.studentId,
          status: input.status,
          ...input.expiresAt ? { expiresAt: input.expiresAt } : {},
          revision: authorityRevision + 1,
          operationId: input.operationId,
          updatedAt: now
        };
        const receipt = { operationId: input.operationId, courseId: input.courseId, studentId: input.studentId, legacyEnrollmentId: input.legacyEnrollmentId, fingerprint, createdAt: now };
        const token2 = await this.tokenFor({ operation: "enrollment-transition", actorUid: input.actorUid, courseId: input.courseId, studentId: input.studentId, legacyEnrollmentId: input.legacyEnrollmentId, expectedLegacyRevision: legacyRevision, expectedAuthorityRevision: authorityRevision, operationId: input.operationId });
        const patch = new FirebaseRtdbRestClient({ env: this.options.env, fetchImpl: this.options.fetchImpl ?? globalThis.fetch, firebaseAuthToken: true, getAccessToken: /* @__PURE__ */ __name(async () => {
          throw new Error("course_book_authority_oauth_forbidden");
        }, "getAccessToken"), getFirebaseAuthToken: /* @__PURE__ */ __name(async () => token2, "getFirebaseAuthToken") });
        await patch.patchMultiLocation([
          { path: `course_enrollments/${input.legacyEnrollmentId}`, value: nextLegacy },
          { path: `course_book_authority/enrollments/${input.courseId}/${input.studentId}`, value: nextAuthority },
          { path: `course_book_authority/operations/${input.operationId}`, value: receipt }
        ]);
        return { status: "transitioned", legacyEnrollment: nextLegacy, authorityEnrollment: nextAuthority };
      }
      async approveCourseRequest(input) {
        const requestIdPattern = /^[A-Za-z0-9_-]{1,128}$/u;
        if (!ID2.test(input.actorUid) || !requestIdPattern.test(input.requestId) || !OPERATION2.test(input.operationId)) {
          throw new Error("invalid_course_request_transition");
        }
        const requestPath = `course_requests/${input.requestId}`;
        const [requestRaw, userRaw, initialReceipt] = await Promise.all([
          this.read.readValue(requestPath),
          this.read.readValue(`users/${input.actorUid}`),
          this.read.readValue(`course_book_authority/operations/${input.operationId}`)
        ]);
        if (initialReceipt !== null && initialReceipt !== void 0) {
          const receipt2 = initialReceipt;
          return receipt2.requestId === input.requestId && receipt2.actorUid === input.actorUid ? "replayed" : "conflict";
        }
        if (!requestRaw || typeof requestRaw !== "object" || Array.isArray(requestRaw) || !userRaw || typeof userRaw !== "object" || Array.isArray(userRaw)) throw new Error("course_request_not_found");
        const request = requestRaw;
        const user = userRaw;
        const courseId = String(request.courseId ?? "");
        const studentId = String(request.studentId ?? "");
        const requestType = request.type;
        if (!PATH_ID2.test(courseId) || !PATH_ID2.test(studentId) || request.id !== input.requestId || user.role !== "teacher" || request.teacherId !== input.actorUid || request.status !== "pending" || typeof request.expiresAt !== "number" || !Number.isSafeInteger(request.requestedAt) || Number(request.requestedAt) <= 0 || request.expiresAt <= Date.now() || requestType !== "join" && requestType !== "unenroll") {
          throw new Error("course_request_denied");
        }
        const processedAt = Math.max(Date.now(), Number(request.requestedAt) + 1);
        const [courseRaw, enrollmentsRaw, authorityRaw] = await Promise.all([
          this.read.readValue(`courses/${courseId}`),
          this.read.readValue("course_enrollments", { orderBy: "studentId", equalTo: studentId }),
          this.read.readValue(`course_book_authority/enrollments/${courseId}/${studentId}`)
        ]);
        if (!courseRaw || typeof courseRaw !== "object" || Array.isArray(courseRaw) || courseRaw.ownerId !== input.actorUid || courseRaw.isClassInstance === true || courseRaw.archivedAt) throw new Error("course_request_owner_denied");
        const rows = enrollmentsRaw && typeof enrollmentsRaw === "object" && !Array.isArray(enrollmentsRaw) ? Object.values(enrollmentsRaw).filter((value) => Boolean(value) && typeof value === "object" && !Array.isArray(value)) : [];
        const exactRows = rows.filter((row2) => row2.courseId === courseId && row2.studentId === studentId);
        const activeRows = exactRows.filter((row2) => row2.status === "active");
        const directRows = activeRows.filter((row2) => row2.enrollmentType !== "class-based");
        const authority = authorityRaw && typeof authorityRaw === "object" && !Array.isArray(authorityRaw) ? authorityRaw : null;
        let legacyEnrollmentId;
        let nextLegacy;
        let nextAuthorityStatus;
        if (requestType === "join") {
          if (activeRows.length || authority?.status === "active") throw new Error("course_request_enrollment_conflict");
          legacyEnrollmentId = `course-request-${input.requestId}`;
          if (rows.some((row2) => row2.id === legacyEnrollmentId)) throw new Error("course_request_enrollment_conflict");
          nextLegacy = {
            id: legacyEnrollmentId,
            courseId,
            studentId,
            enrollmentType: "individual",
            enrolledAt: processedAt,
            expiresAt: 0,
            status: "active",
            revision: 1,
            operationId: input.operationId
          };
          nextAuthorityStatus = "active";
        } else {
          if (activeRows.length !== 1 || directRows.length !== 1) throw new Error("course_request_enrollment_conflict");
          const row2 = directRows[0];
          legacyEnrollmentId = String(row2.id ?? "");
          if (!PATH_ID2.test(legacyEnrollmentId)) throw new Error("course_request_enrollment_conflict");
          if (authority && authority.legacyEnrollmentId !== legacyEnrollmentId) throw new Error("course_request_enrollment_conflict");
          const revision = Number.isSafeInteger(row2.revision) ? Number(row2.revision) : 0;
          nextLegacy = { ...clone(row2), status: "expired", revision: revision + 1, operationId: input.operationId };
          nextAuthorityStatus = "revoked";
        }
        const authorityRevision = authority && Number.isSafeInteger(authority.revision) ? Number(authority.revision) : 0;
        const fingerprint = stable({ requestId: input.requestId, actorUid: input.actorUid, courseId, studentId, requestType, legacyEnrollmentId });
        const nextAuthority = {
          legacyEnrollmentId,
          courseId,
          studentId,
          status: nextAuthorityStatus,
          revision: authorityRevision + 1,
          operationId: input.operationId,
          updatedAt: new Date(processedAt).toISOString()
        };
        const receipt = {
          operation: "enrollment-request-transition",
          operationId: input.operationId,
          requestId: input.requestId,
          actorUid: input.actorUid,
          courseId,
          studentId,
          requestType,
          legacyEnrollmentId,
          fingerprint,
          revision: nextAuthority.revision,
          createdAt: new Date(processedAt).toISOString()
        };
        const claims = {
          operation: "enrollment-request-transition",
          actorUid: input.actorUid,
          courseId,
          studentId,
          legacyEnrollmentId,
          requestId: input.requestId,
          requestType,
          expectedLegacyRevision: requestType === "join" ? 0 : Number.isSafeInteger(directRows[0]?.revision) ? Number(directRows[0].revision) : 0,
          expectedAuthorityRevision: authorityRevision,
          operationId: input.operationId
        };
        const token2 = await this.tokenFor(claims);
        const patch = new FirebaseRtdbRestClient({ env: this.options.env, fetchImpl: this.options.fetchImpl ?? globalThis.fetch, firebaseAuthToken: true, getAccessToken: /* @__PURE__ */ __name(async () => {
          throw new Error("course_book_authority_oauth_forbidden");
        }, "getAccessToken"), getFirebaseAuthToken: /* @__PURE__ */ __name(async () => token2, "getFirebaseAuthToken") });
        await patch.patchMultiLocation([
          { path: `course_enrollments/${legacyEnrollmentId}`, value: nextLegacy },
          { path: `course_book_authority/enrollments/${courseId}/${studentId}`, value: nextAuthority },
          { path: `course_book_authority/operations/${input.operationId}`, value: receipt },
          { path: requestPath, value: { ...request, status: "approved", processedBy: input.actorUid, processedAt } }
        ]);
        return "transitioned";
      }
    };
  }
});
var firebase_verification_exports = {};
__export(firebase_verification_exports, {
  FIREBASE_JWKS_URL: /* @__PURE__ */ __name(() => FIREBASE_JWKS_URL, "FIREBASE_JWKS_URL"),
  createFirebaseVerifier: /* @__PURE__ */ __name(() => createFirebaseVerifier, "createFirebaseVerifier")
});
function extractBearerToken(authHeader) {
  if (!authHeader) {
    return { valid: false, reason: "missing_authorization" };
  }
  if (!authHeader.startsWith("Bearer ")) {
    return { valid: false, reason: "malformed_authorization" };
  }
  const token2 = authHeader.slice("Bearer ".length).trim();
  if (!token2) {
    return { valid: false, reason: "missing_token" };
  }
  return { valid: true, token: token2 };
}
__name(extractBearerToken, "extractBearerToken");
function getFirebaseProjectId(env) {
  return typeof env?.FIREBASE_PROJECT_ID === "string" ? env.FIREBASE_PROJECT_ID.trim() : "";
}
__name(getFirebaseProjectId, "getFirebaseProjectId");
async function verifyFirebaseJwt(token2, env, jwtVerify2, jwks) {
  const projectId = getFirebaseProjectId(env);
  if (!projectId) {
    return { valid: false, reason: "missing_project_id" };
  }
  try {
    const { payload } = await jwtVerify2(token2, jwks, {
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId
    });
    if (typeof payload.sub !== "string" || payload.sub.length === 0) {
      return { valid: false, reason: "missing_subject" };
    }
    return {
      valid: true,
      uid: payload.sub,
      email: typeof payload.email === "string" ? payload.email : void 0,
      emailVerified: payload.email_verified === true
    };
  } catch {
    return { valid: false, reason: "invalid_token" };
  }
}
__name(verifyFirebaseJwt, "verifyFirebaseJwt");
function createFirebaseVerifier({
  verifyToken,
  jwtVerify: jwtVerify2 = jwtVerify,
  jwks = DEFAULT_JWKS
} = {}) {
  const tokenVerifier = verifyToken ?? ((token2, env) => verifyFirebaseJwt(token2, env, jwtVerify2, jwks));
  return {
    verifyToken: tokenVerifier,
    async verifyAuthorizationHeader(authHeader, env) {
      const extracted = extractBearerToken(authHeader);
      if (!extracted.valid) return extracted;
      return tokenVerifier(extracted.token, env);
    }
  };
}
__name(createFirebaseVerifier, "createFirebaseVerifier");
var FIREBASE_JWKS_URL;
var DEFAULT_JWKS;
var init_firebase_verification = __esm({
  "../../../../tmp/notification-successor-qualified-20261001/cloudflare/src/upload-worker/firebase-verification.js"() {
    "use strict";
    init_webapi();
    FIREBASE_JWKS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
    DEFAULT_JWKS = createRemoteJWKSet(new URL(FIREBASE_JWKS_URL));
  }
});
var course_enrollment_approval_route_exports = {};
__export(course_enrollment_approval_route_exports, {
  approveCourseEnrollmentRequest: /* @__PURE__ */ __name(() => approveCourseEnrollmentRequest, "approveCourseEnrollmentRequest")
});
var REQUEST_ID;
var SOURCE_ID;
var OPERATION_ID;
var DEADLINE_MS;
var record;
var exactBody;
var scopedEnv;
var currentOwnerState;
var approveCourseEnrollmentRequest;
var init_course_enrollment_approval_route = __esm({
  "../../../../tmp/notification-successor-qualified-20261001/cloudflare/course-enrollment-approval-route.ts"() {
    "use strict";
    init_enrollment_authority();
    REQUEST_ID = /^[A-Za-z0-9_-]{1,128}$/u;
    SOURCE_ID = /^[A-Za-z0-9._:@-]{1,160}$/u;
    OPERATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
    DEADLINE_MS = 1e4;
    record = /* @__PURE__ */ __name((value) => value && typeof value === "object" && !Array.isArray(value) ? value : null, "record");
    exactBody = /* @__PURE__ */ __name((value) => Object.keys(value).length === 2 && Object.hasOwn(value, "requestId") && Object.hasOwn(value, "operationId") && typeof value.requestId === "string" && REQUEST_ID.test(value.requestId) && typeof value.operationId === "string" && OPERATION_ID.test(value.operationId) ? { requestId: value.requestId, operationId: value.operationId } : null, "exactBody");
    scopedEnv = /* @__PURE__ */ __name((env) => {
      const serviceKey = env.NOTIFICATION_COMMAND_GOOGLE_SA_KEY?.trim();
      if (!serviceKey || !env.FIREBASE_WEB_API_KEY?.trim()) throw new Error("course_request_unavailable");
      return {
        FIREBASE_PROJECT_ID: env.FIREBASE_PROJECT_ID,
        FIREBASE_DB_URL: env.FIREBASE_DB_URL,
        FIREBASE_WEB_API_KEY: env.FIREBASE_WEB_API_KEY,
        GOOGLE_SA_KEY: serviceKey
      };
    }, "scopedEnv");
    currentOwnerState = /* @__PURE__ */ __name(async (input, actorUid, readSource, fetchImpl) => {
      const [userValue, requestValue, receiptValue] = await Promise.all([
        readSource(`users/${actorUid}`, fetchImpl),
        readSource(`course_requests/${input.requestId}`, fetchImpl),
        readSource(`course_book_authority/operations/${input.operationId}`, fetchImpl)
      ]);
      const user = record(userValue);
      const courseRequest = record(requestValue);
      if (!user || user.role !== "teacher" || !courseRequest || courseRequest.id !== input.requestId || courseRequest.teacherId !== actorUid || !SOURCE_ID.test(String(courseRequest.courseId ?? "")) || !SOURCE_ID.test(String(courseRequest.studentId ?? "")) || courseRequest.type !== "join" && courseRequest.type !== "unenroll") {
        throw new Error("course_request_denied");
      }
      const courseId = String(courseRequest.courseId);
      const course = record(await readSource(`courses/${courseId}`, fetchImpl));
      if (!course || course.ownerId !== actorUid || course.isClassInstance === true || Boolean(course.archivedAt)) {
        throw new Error("course_request_owner_denied");
      }
      if (courseRequest.status === "pending") {
        if (!Number.isSafeInteger(courseRequest.requestedAt) || Number(courseRequest.requestedAt) <= 0 || typeof courseRequest.expiresAt !== "number" || courseRequest.expiresAt <= Date.now()) {
          throw new Error("course_request_denied");
        }
        if (receiptValue !== null && receiptValue !== void 0) throw new Error("course_request_conflict");
        return "pending";
      }
      const receipt = record(receiptValue);
      if (courseRequest.status === "approved" && courseRequest.processedBy === actorUid && Number.isSafeInteger(courseRequest.processedAt) && receipt?.operation === "enrollment-request-transition" && receipt.operationId === input.operationId && receipt.requestId === input.requestId && receipt.actorUid === actorUid && receipt.courseId === courseId && receipt.studentId === courseRequest.studentId && receipt.requestType === courseRequest.type) {
        return "replay";
      }
      throw new Error("course_request_conflict");
    }, "currentOwnerState");
    approveCourseEnrollmentRequest = /* @__PURE__ */ __name(async (args) => {
      const body = exactBody(args.input);
      if (!body) throw new Error("course_request_invalid");
      if (args.env.COURSE_ENROLLMENT_APPROVAL_ENABLED !== "true") {
        throw new Error("course_request_denied");
      }
      const controller = new AbortController();
      let rejectDeadline;
      const deadline = new Promise((_, reject) => {
        rejectDeadline = reject;
      });
      const timer = setTimeout(() => {
        controller.abort();
        rejectDeadline(new Error("course_request_timeout"));
      }, DEADLINE_MS);
      const boundedFetch = /* @__PURE__ */ __name((input, init = {}) => {
        const signal = init.signal ? AbortSignal.any([controller.signal, init.signal]) : controller.signal;
        return args.fetcher.call(globalThis, input, { ...init, signal });
      }, "boundedFetch");
      const work = /* @__PURE__ */ __name(async () => {
        const { createFirebaseVerifier: createFirebaseVerifier2 } = await Promise.resolve().then(() => (init_firebase_verification(), firebase_verification_exports));
        const identity = await createFirebaseVerifier2().verifyAuthorizationHeader(args.authorization, args.env);
        if (controller.signal.aborted) throw new Error("course_request_timeout");
        if (!identity.valid || typeof identity.uid !== "string" || !SOURCE_ID.test(identity.uid)) {
          throw new Error("course_request_unauthenticated");
        }
        const actorUid = identity.uid;
        if (!args.env.NOTIFICATION_RATE_LIMITER?.limit) throw new Error("course_request_unavailable");
        const limited = await args.env.NOTIFICATION_RATE_LIMITER.limit({ key: `course-enrollment-approval:${actorUid}` });
        if (!limited.success) {
          throw new Error("course_request_rate_limited");
        }
        if (controller.signal.aborted) throw new Error("course_request_timeout");
        const state = await currentOwnerState(body, actorUid, args.readSource, boundedFetch);
        if (controller.signal.aborted) throw new Error("course_request_timeout");
        if (state === "replay") return "replayed";
        const authority = new FirebaseCourseEnrollmentAuthorityPort({ env: scopedEnv(args.env), fetchImpl: boundedFetch });
        const result = await authority.approveCourseRequest({ actorUid, requestId: body.requestId, operationId: body.operationId });
        if (result === "conflict") throw new Error("course_request_conflict");
        if (await currentOwnerState(body, actorUid, args.readSource, boundedFetch) !== "replay") {
          throw new Error("course_request_conflict");
        }
        return result;
      }, "work");
      try {
        return await Promise.race([work(), deadline]);
      } finally {
        clearTimeout(timer);
        controller.abort();
      }
    }, "approveCourseEnrollmentRequest");
  }
});
init_webapi();
var TOKEN_URL = "https://oauth2.googleapis.com/token";
var cachedKey;
var cachedKeyJson = "";
var cachedToken;
var token = /* @__PURE__ */ __name(async (env, fetcher, requestRay) => {
  if (cachedToken && cachedToken.until > Date.now() + 3e4) {
    console.info("notification_bridge_oauth", { requestRay, cache: "cached" });
    return cachedToken.value;
  }
  const keyJson = env.NOTIFICATION_COMMAND_GOOGLE_SA_KEY;
  const service = JSON.parse(keyJson);
  if (!service.private_key || service.client_email !== env.NOTIFICATION_COMMAND_SERVICE_IDENTITY) throw Error("service_identity");
  const profile = { requestRay, cache: cachedKeyJson === keyJson && cachedKey ? "refresh" : "cold", keyImportWallMs: 0, signWallMs: 0, oauthWallMs: 0 };
  if (cachedKeyJson !== keyJson || !cachedKey) {
    const started = performance.now();
    cachedKey = await importPKCS8(service.private_key, "RS256");
    profile.keyImportWallMs = performance.now() - started;
    cachedKeyJson = keyJson;
  }
  const now = Math.floor(Date.now() / 1e3);
  const signStarted = performance.now();
  const assertion = await new SignJWT({ scope: "https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/datastore" }).setProtectedHeader({ alg: "RS256" }).setIssuer(service.client_email).setSubject(service.client_email).setAudience(TOKEN_URL).setIssuedAt(now).setExpirationTime(now + 3600).sign(cachedKey);
  profile.signWallMs = performance.now() - signStarted;
  const oauthStarted = performance.now();
  const response = await fetcher(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion })
  });
  profile.oauthWallMs = performance.now() - oauthStarted;
  console.info("notification_bridge_oauth", profile);
  if (!response.ok) throw Error("token_failed");
  const body = await response.json();
  if (typeof body.access_token !== "string" || !body.access_token) throw Error("token_invalid");
  cachedToken = { value: body.access_token, until: Date.now() + (typeof body.expires_in === "number" ? body.expires_in : 3600) * 1e3 };
  return cachedToken.value;
}, "token");
var PATH = "/course-enrollment-approval";
var ORIGINS = /* @__PURE__ */ new Set(["https://kahut1.web.app", "https://hocthem.net", "http://localhost:5173", "http://localhost:5174"]);
var reply = /* @__PURE__ */ __name((request, status, value) => {
  const headers = new Headers({ "Content-Type": "application/json", "Cache-Control": "no-store", Vary: "Origin" });
  const origin = request.headers.get("Origin");
  if (origin && ORIGINS.has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  }
  return new Response(JSON.stringify({ status: value }), { status, headers });
}, "reply");
var row = /* @__PURE__ */ __name((value) => value && typeof value === "object" && !Array.isArray(value) ? value : null, "row");
var handleCourseEnrollmentApproval = /* @__PURE__ */ __name(async (request, env, fetcher = fetch, parsedInput) => {
  const url = new URL(request.url);
  if (url.pathname !== PATH || url.search || url.hash) return reply(request, 404, "not_found");
  const origin = request.headers.get("Origin");
  if (origin && !ORIGINS.has(origin)) return reply(request, 403, "origin_denied");
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: reply(request, 200, "ok").headers });
  if (request.method !== "POST") return reply(request, 405, "method_denied");
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ") || !authorization.slice(7)) return reply(request, 401, "unauthenticated");
  if (!request.headers.get("Content-Type")?.toLowerCase().startsWith("application/json")) return reply(request, 400, "invalid_content_type");
  let input;
  if (parsedInput === void 0) {
    const reader = request.body?.getReader();
    const decoder2 = new TextDecoder();
    let raw = "";
    let bytes = 0;
    if (reader) {
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          bytes += chunk.value.byteLength;
          if (bytes > 512) {
            await reader.cancel();
            return reply(request, 413, "body_too_large");
          }
          raw += decoder2.decode(chunk.value, { stream: true });
        }
        raw += decoder2.decode();
      } finally {
        reader.releaseLock();
      }
    }
    try {
      input = row(JSON.parse(raw));
    } catch {
      input = null;
    }
  } else {
    input = row(parsedInput);
  }
  if (!input) return reply(request, 400, "invalid_course_request");
  const ray = request.headers.get("CF-Ray");
  try {
    const { approveCourseEnrollmentRequest: approveCourseEnrollmentRequest2 } = await Promise.resolve().then(() => (init_course_enrollment_approval_route(), course_enrollment_approval_route_exports));
    let readToken;
    const readSource = /* @__PURE__ */ __name(async (path, boundedFetcher) => {
      readToken ??= token(env, boundedFetcher, ray && /^[a-f0-9]{16,32}(?:-[A-Z0-9]{3,10})?$/iu.test(ray) ? ray : null);
      const accessToken = await readToken;
      const base = env.FIREBASE_DB_URL.replace(/\/$/u, "");
      const encodedPath = path.split("/").map(encodeURIComponent).join("/");
      const response = await boundedFetcher(`${base}/${encodedPath}.json`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if ([401, 403].includes(response.status)) throw new Error("course_request_denied");
      if (!response.ok) throw new Error("course_request_unavailable");
      return response.json();
    }, "readSource");
    const status = await approveCourseEnrollmentRequest2({ request, env, input, authorization, fetcher, readSource });
    return reply(request, 200, status);
  } catch (error) {
    const code = error instanceof Error ? error.message : "course_request_unavailable";
    const status = code === "course_request_invalid" ? 400 : code === "course_request_unauthenticated" ? 401 : code === "course_request_denied" || code === "course_request_owner_denied" ? 403 : code === "course_request_not_found" ? 404 : code === "course_request_conflict" ? 409 : code === "course_request_rate_limited" ? 429 : code === "course_request_timeout" ? 504 : 503;
    return reply(request, status, status === 503 || status === 504 ? "course_request_unavailable" : code);
  }
}, "handleCourseEnrollmentApproval");
var COURSE_APPROVAL_PATH = "/course-enrollment-approval";
var WRITING_PRODUCT_PATH = "/writing-product";
var WRITING_BODY_LIMIT = 131072;
var WRITING_ORIGINS = /* @__PURE__ */ new Set(["https://kahut1.web.app", "https://hocthem.net", "http://localhost:5173", "http://localhost:5174"]);
var course_do_entry_default = activeWorker;
async function writingOperation(request) {
  if (Number(request.headers.get("Content-Length") ?? 0) > WRITING_BODY_LIMIT) return "delegate";
  const reader = request.clone().body?.getReader();
  if (!reader) return "delegate";
  const decoder2 = new TextDecoder();
  let raw = "";
  let bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > WRITING_BODY_LIMIT) {
        void reader.cancel().catch(() => {
        });
        return "delegate";
      }
      raw += decoder2.decode(chunk.value, { stream: true });
    }
    raw += decoder2.decode();
  } catch {
    return "delegate";
  } finally {
    reader.releaseLock();
  }
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return "delegate";
    return value.operation === "capture" ? "capture" : "excluded";
  } catch {
    return "delegate";
  }
}
__name(writingOperation, "writingOperation");
function writingDenied(request) {
  const headers = new Headers({ "Content-Type": "application/json", "Cache-Control": "no-store", Vary: "Origin" });
  const origin = request.headers.get("Origin");
  if (origin && WRITING_ORIGINS.has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  }
  return new Response(JSON.stringify({ status: "writing_access_denied" }), { status: 403, headers });
}
__name(writingDenied, "writingDenied");
var NotificationBridgeObject = class extends ActiveNotificationBridgeObject {
  static {
    __name(this, "NotificationBridgeObject");
  }
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === WRITING_PRODUCT_PATH && !url.search && request.method === "POST" && (!request.headers.get("Origin") || WRITING_ORIGINS.has(request.headers.get("Origin"))) && request.headers.get("Authorization")?.startsWith("Bearer ") && Boolean(request.headers.get("Authorization").slice(7)) && request.headers.get("Content-Type")?.toLowerCase().startsWith("application/json")) {
      const operation = await writingOperation(request);
      if (operation === "excluded") return writingDenied(request);
    }
    if (url.pathname !== COURSE_APPROVAL_PATH) return super.fetch(request);
    return handleCourseEnrollmentApproval(request, this.env);
  }
};
export {
  NotificationBridgeObject,
  course_do_entry_default as default
};
//# sourceMappingURL=notification-command-entry.js.map
