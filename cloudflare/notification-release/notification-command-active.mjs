var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// ../../../Users/The Lord/repos/luyentap-prd0062/cloudflare/node_modules/jose/dist/webapi/lib/buffer_utils.js
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
var encoder, decoder, MAX_INT32;
var init_buffer_utils = __esm({
  "../../../Users/The Lord/repos/luyentap-prd0062/cloudflare/node_modules/jose/dist/webapi/lib/buffer_utils.js"() {
    encoder = new TextEncoder();
    decoder = new TextDecoder();
    MAX_INT32 = 2 ** 32;
    __name(concat, "concat");
    __name(encode, "encode");
  }
});

// ../../../Users/The Lord/repos/luyentap-prd0062/cloudflare/node_modules/jose/dist/webapi/lib/base64.js
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
var init_base64 = __esm({
  "../../../Users/The Lord/repos/luyentap-prd0062/cloudflare/node_modules/jose/dist/webapi/lib/base64.js"() {
    __name(encodeBase64, "encodeBase64");
    __name(decodeBase64, "decodeBase64");
  }
});

// ../../../Users/The Lord/repos/luyentap-prd0062/cloudflare/node_modules/jose/dist/webapi/util/base64url.js
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
var init_base64url = __esm({
  "../../../Users/The Lord/repos/luyentap-prd0062/cloudflare/node_modules/jose/dist/webapi/util/base64url.js"() {
    init_buffer_utils();
    init_base64();
    __name(decode, "decode");
    __name(encode2, "encode");
  }
});

// ../../../Users/The Lord/repos/luyentap-prd0062/cloudflare/node_modules/jose/dist/webapi/lib/crypto_key.js
function getHashLength(hash) {
  return parseInt(hash.name.slice(4), 10);
}
function checkHashLength(algorithm, expected) {
  const actual = getHashLength(algorithm.hash);
  if (actual !== expected)
    throw unusable(`SHA-${expected}`, "algorithm.hash");
}
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
function checkUsage(key, usage) {
  if (usage && !key.usages.includes(usage)) {
    throw new TypeError(`CryptoKey does not support this operation, its usages must include ${usage}.`);
  }
}
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
var unusable, isAlgorithm;
var init_crypto_key = __esm({
  "../../../Users/The Lord/repos/luyentap-prd0062/cloudflare/node_modules/jose/dist/webapi/lib/crypto_key.js"() {
    unusable = /* @__PURE__ */ __name((name, prop = "algorithm.name") => new TypeError(`CryptoKey does not support this operation, its ${prop} must be ${name}`), "unusable");
    isAlgorithm = /* @__PURE__ */ __name((algorithm, name) => algorithm.name === name, "isAlgorithm");
    __name(getHashLength, "getHashLength");
    __name(checkHashLength, "checkHashLength");
    __name(getNamedCurve, "getNamedCurve");
    __name(checkUsage, "checkUsage");
    __name(checkSigCryptoKey, "checkSigCryptoKey");
  }
});

// ../../../Users/The Lord/repos/luyentap-prd0062/cloudflare/node_modules/jose/dist/webapi/lib/invalid_key_input.js
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
var invalidKeyInput, withAlg;
var init_invalid_key_input = __esm({
  "../../../Users/The Lord/repos/luyentap-prd0062/cloudflare/node_modules/jose/dist/webapi/lib/invalid_key_input.js"() {
    __name(message, "message");
    invalidKeyInput = /* @__PURE__ */ __name((actual, ...types) => message("Key must be ", actual, ...types), "invalidKeyInput");
    withAlg = /* @__PURE__ */ __name((alg, actual, ...types) => message(`Key for the ${alg} algorithm must be `, actual, ...types), "withAlg");
  }
});

// ../../../Users/The Lord/repos/luyentap-prd0062/cloudflare/node_modules/jose/dist/webapi/util/errors.js
var JOSEError, JWTClaimValidationFailed, JWTExpired, JOSEAlgNotAllowed, JOSENotSupported, JWSInvalid, JWTInvalid, JWKSInvalid, JWKSNoMatchingKey, JWKSMultipleMatchingKeys, JWKSTimeout, JWSSignatureVerificationFailed;
var init_errors = __esm({
  "../../../Users/The Lord/repos/luyentap-prd0062/cloudflare/node_modules/jose/dist/webapi/util/errors.js"() {
    JOSEError = class extends Error {
      static {
        __name(this, "JOSEError");
      }
      static code = "ERR_JOSE_GENERIC";
      code = "ERR_JOSE_GENERIC";
      constructor(message3, options) {
        super(message3, options);
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
      constructor(message3, payload, claim2 = "unspecified", reason = "unspecified") {
        super(message3, { cause: { claim: claim2, reason, payload } });
        this.claim = claim2;
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
      constructor(message3, payload, claim2 = "unspecified", reason = "unspecified") {
        super(message3, { cause: { claim: claim2, reason, payload } });
        this.claim = claim2;
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
      constructor(message3 = "no applicable key found in the JSON Web Key Set", options) {
        super(message3, options);
      }
    };
    JWKSMultipleMatchingKeys = class extends JOSEError {
      static {
        __name(this, "JWKSMultipleMatchingKeys");
      }
      [Symbol.asyncIterator];
      static code = "ERR_JWKS_MULTIPLE_MATCHING_KEYS";
      code = "ERR_JWKS_MULTIPLE_MATCHING_KEYS";
      constructor(message3 = "multiple matching keys found in the JSON Web Key Set", options) {
        super(message3, options);
      }
    };
    JWKSTimeout = class extends JOSEError {
      static {
        __name(this, "JWKSTimeout");
      }
      static code = "ERR_JWKS_TIMEOUT";
      code = "ERR_JWKS_TIMEOUT";
      constructor(message3 = "request timed out", options) {
        super(message3, options);
      }
    };
    JWSSignatureVerificationFailed = class extends JOSEError {
      static {
        __name(this, "JWSSignatureVerificationFailed");
      }
      static code = "ERR_JWS_SIGNATURE_VERIFICATION_FAILED";
      code = "ERR_JWS_SIGNATURE_VERIFICATION_FAILED";
      constructor(message3 = "signature verification failed", options) {
        super(message3, options);
      }
    };
  }
});

// ../../../Users/The Lord/repos/luyentap-prd0062/cloudflare/node_modules/jose/dist/webapi/lib/is_key_like.js
var isCryptoKey, isKeyObject, isKeyLike;
var init_is_key_like = __esm({
  "../../../Users/The Lord/repos/luyentap-prd0062/cloudflare/node_modules/jose/dist/webapi/lib/is_key_like.js"() {
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

// ../../../Users/The Lord/repos/luyentap-prd0062/cloudflare/node_modules/jose/dist/webapi/lib/helpers.js
function assertNotSet(value, name) {
  if (value) {
    throw new TypeError(`${name} can only be called once`);
  }
}
function decodeBase64url(value, label, ErrorClass) {
  try {
    return decode(value);
  } catch {
    throw new ErrorClass(`Failed to base64url decode the ${label}`);
  }
}
var init_helpers = __esm({
  "../../../Users/The Lord/repos/luyentap-prd0062/cloudflare/node_modules/jose/dist/webapi/lib/helpers.js"() {
    init_base64url();
    __name(assertNotSet, "assertNotSet");
    __name(decodeBase64url, "decodeBase64url");
  }
});

// ../../../Users/The Lord/repos/luyentap-prd0062/cloudflare/node_modules/jose/dist/webapi/lib/type_checks.js
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
function isDisjoint(...headers2) {
  const sources = headers2.filter(Boolean);
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
var isObjectLike, isJWK, isPrivateJWK, isPublicJWK, isSecretJWK;
var init_type_checks = __esm({
  "../../../Users/The Lord/repos/luyentap-prd0062/cloudflare/node_modules/jose/dist/webapi/lib/type_checks.js"() {
    isObjectLike = /* @__PURE__ */ __name((value) => typeof value === "object" && value !== null, "isObjectLike");
    __name(isObject, "isObject");
    __name(isDisjoint, "isDisjoint");
    isJWK = /* @__PURE__ */ __name((key) => isObject(key) && typeof key.kty === "string", "isJWK");
    isPrivateJWK = /* @__PURE__ */ __name((key) => key.kty !== "oct" && (key.kty === "AKP" && typeof key.priv === "string" || typeof key.d === "string"), "isPrivateJWK");
    isPublicJWK = /* @__PURE__ */ __name((key) => key.kty !== "oct" && key.d === void 0 && key.priv === void 0, "isPublicJWK");
    isSecretJWK = /* @__PURE__ */ __name((key) => key.kty === "oct" && typeof key.k === "string", "isSecretJWK");
  }
});

// ../../../Users/The Lord/repos/luyentap-prd0062/cloudflare/node_modules/jose/dist/webapi/lib/signing.js
function checkKeyLength(alg, key) {
  if (alg.startsWith("RS") || alg.startsWith("PS")) {
    const { modulusLength } = key.algorithm;
    if (typeof modulusLength !== "number" || modulusLength < 2048) {
      throw new TypeError(`${alg} requires key modulusLength to be 2048 bits or larger`);
    }
  }
}
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
async function sign(alg, key, data) {
  const cryptoKey = await getSigKey(alg, key, "sign");
  checkKeyLength(alg, cryptoKey);
  const signature = await crypto.subtle.sign(subtleAlgorithm(alg, cryptoKey.algorithm), cryptoKey, data);
  return new Uint8Array(signature);
}
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
var init_signing = __esm({
  "../../../Users/The Lord/repos/luyentap-prd0062/cloudflare/node_modules/jose/dist/webapi/lib/signing.js"() {
    init_errors();
    init_crypto_key();
    init_invalid_key_input();
    __name(checkKeyLength, "checkKeyLength");
    __name(subtleAlgorithm, "subtleAlgorithm");
    __name(getSigKey, "getSigKey");
    __name(sign, "sign");
    __name(verify, "verify");
  }
});

// ../../../Users/The Lord/repos/luyentap-prd0062/cloudflare/node_modules/jose/dist/webapi/lib/jwk_to_key.js
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
var unsupportedAlg;
var init_jwk_to_key = __esm({
  "../../../Users/The Lord/repos/luyentap-prd0062/cloudflare/node_modules/jose/dist/webapi/lib/jwk_to_key.js"() {
    init_errors();
    unsupportedAlg = 'Invalid or unsupported JWK "alg" (Algorithm) Parameter value';
    __name(subtleMapping, "subtleMapping");
    __name(jwkToKey, "jwkToKey");
  }
});

// ../../../Users/The Lord/repos/luyentap-prd0062/cloudflare/node_modules/jose/dist/webapi/lib/normalize_key.js
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
var unusableForAlg, cache, handleJWK, handleKeyObject;
var init_normalize_key = __esm({
  "../../../Users/The Lord/repos/luyentap-prd0062/cloudflare/node_modules/jose/dist/webapi/lib/normalize_key.js"() {
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
    __name(normalizeKey, "normalizeKey");
  }
});

// ../../../Users/The Lord/repos/luyentap-prd0062/cloudflare/node_modules/jose/dist/webapi/lib/asn1.js
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
var bytesEqual, createASN1State, parseLength, expectTag, getSubarray, parseAlgorithmOID, parseECAlgorithmIdentifier, genericImport, processPEMData, fromPKCS8;
var init_asn1 = __esm({
  "../../../Users/The Lord/repos/luyentap-prd0062/cloudflare/node_modules/jose/dist/webapi/lib/asn1.js"() {
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
    __name(parsePKCS8Header, "parsePKCS8Header");
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

// ../../../Users/The Lord/repos/luyentap-prd0062/cloudflare/node_modules/jose/dist/webapi/key/import.js
async function importPKCS8(pkcs8, alg, options) {
  if (typeof pkcs8 !== "string" || pkcs8.indexOf("-----BEGIN PRIVATE KEY-----") !== 0) {
    throw new TypeError('"pkcs8" must be PKCS#8 formatted string');
  }
  return fromPKCS8(pkcs8, alg, options);
}
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
var init_import = __esm({
  "../../../Users/The Lord/repos/luyentap-prd0062/cloudflare/node_modules/jose/dist/webapi/key/import.js"() {
    init_base64url();
    init_asn1();
    init_jwk_to_key();
    init_errors();
    init_type_checks();
    __name(importPKCS8, "importPKCS8");
    __name(importJWK, "importJWK");
  }
});

// ../../../Users/The Lord/repos/luyentap-prd0062/cloudflare/node_modules/jose/dist/webapi/lib/validate_crit.js
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
var init_validate_crit = __esm({
  "../../../Users/The Lord/repos/luyentap-prd0062/cloudflare/node_modules/jose/dist/webapi/lib/validate_crit.js"() {
    init_errors();
    __name(validateCrit, "validateCrit");
  }
});

// ../../../Users/The Lord/repos/luyentap-prd0062/cloudflare/node_modules/jose/dist/webapi/lib/validate_algorithms.js
function validateAlgorithms(option, algorithms) {
  if (algorithms !== void 0 && (!Array.isArray(algorithms) || algorithms.some((s) => typeof s !== "string"))) {
    throw new TypeError(`"${option}" option must be an array of strings`);
  }
  if (!algorithms) {
    return void 0;
  }
  return new Set(algorithms);
}
var init_validate_algorithms = __esm({
  "../../../Users/The Lord/repos/luyentap-prd0062/cloudflare/node_modules/jose/dist/webapi/lib/validate_algorithms.js"() {
    __name(validateAlgorithms, "validateAlgorithms");
  }
});

// ../../../Users/The Lord/repos/luyentap-prd0062/cloudflare/node_modules/jose/dist/webapi/lib/check_key_type.js
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
var tag, jwkMatchesOp, symmetricTypeCheck, asymmetricTypeCheck;
var init_check_key_type = __esm({
  "../../../Users/The Lord/repos/luyentap-prd0062/cloudflare/node_modules/jose/dist/webapi/lib/check_key_type.js"() {
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
    __name(checkKeyType, "checkKeyType");
  }
});

// ../../../Users/The Lord/repos/luyentap-prd0062/cloudflare/node_modules/jose/dist/webapi/jws/flattened/verify.js
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
var init_verify = __esm({
  "../../../Users/The Lord/repos/luyentap-prd0062/cloudflare/node_modules/jose/dist/webapi/jws/flattened/verify.js"() {
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
    __name(flattenedVerify, "flattenedVerify");
  }
});

// ../../../Users/The Lord/repos/luyentap-prd0062/cloudflare/node_modules/jose/dist/webapi/jws/compact/verify.js
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
var init_verify2 = __esm({
  "../../../Users/The Lord/repos/luyentap-prd0062/cloudflare/node_modules/jose/dist/webapi/jws/compact/verify.js"() {
    init_verify();
    init_errors();
    init_buffer_utils();
    __name(compactVerify, "compactVerify");
  }
});

// ../../../Users/The Lord/repos/luyentap-prd0062/cloudflare/node_modules/jose/dist/webapi/lib/jwt_claims_set.js
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
function validateInput(label, input) {
  if (!Number.isFinite(input)) {
    throw new TypeError(`Invalid ${label} input`);
  }
  return input;
}
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
  for (const claim2 of new Set(presenceCheck.reverse())) {
    if (!(claim2 in payload)) {
      throw new JWTClaimValidationFailed(`missing required "${claim2}" claim`, payload, claim2, "missing");
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
var epoch, minute, hour, day, week, year, REGEX, normalizeTyp, checkAudiencePresence, JWTClaimsBuilder;
var init_jwt_claims_set = __esm({
  "../../../Users/The Lord/repos/luyentap-prd0062/cloudflare/node_modules/jose/dist/webapi/lib/jwt_claims_set.js"() {
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
    __name(secs, "secs");
    __name(validateInput, "validateInput");
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
    __name(validateClaimsSet, "validateClaimsSet");
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

// ../../../Users/The Lord/repos/luyentap-prd0062/cloudflare/node_modules/jose/dist/webapi/jwt/verify.js
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
var init_verify3 = __esm({
  "../../../Users/The Lord/repos/luyentap-prd0062/cloudflare/node_modules/jose/dist/webapi/jwt/verify.js"() {
    init_verify2();
    init_jwt_claims_set();
    init_errors();
    __name(jwtVerify, "jwtVerify");
  }
});

// ../../../Users/The Lord/repos/luyentap-prd0062/cloudflare/node_modules/jose/dist/webapi/jws/flattened/sign.js
var FlattenedSign;
var init_sign = __esm({
  "../../../Users/The Lord/repos/luyentap-prd0062/cloudflare/node_modules/jose/dist/webapi/jws/flattened/sign.js"() {
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

// ../../../Users/The Lord/repos/luyentap-prd0062/cloudflare/node_modules/jose/dist/webapi/jws/compact/sign.js
var CompactSign;
var init_sign2 = __esm({
  "../../../Users/The Lord/repos/luyentap-prd0062/cloudflare/node_modules/jose/dist/webapi/jws/compact/sign.js"() {
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

// ../../../Users/The Lord/repos/luyentap-prd0062/cloudflare/node_modules/jose/dist/webapi/jwt/sign.js
var SignJWT;
var init_sign3 = __esm({
  "../../../Users/The Lord/repos/luyentap-prd0062/cloudflare/node_modules/jose/dist/webapi/jwt/sign.js"() {
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

// ../../../Users/The Lord/repos/luyentap-prd0062/cloudflare/node_modules/jose/dist/webapi/jwks/local.js
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
function isJWKSLike(jwks) {
  return jwks && typeof jwks === "object" && Array.isArray(jwks.keys) && jwks.keys.every(isJWKLike);
}
function isJWKLike(key) {
  return isObject(key);
}
async function importWithAlgCache(cache3, jwk, alg) {
  const cached = cache3.get(jwk) || cache3.set(jwk, {}).get(jwk);
  if (cached[alg] === void 0) {
    const key = await importJWK({ ...jwk, ext: true }, alg);
    if (key instanceof Uint8Array || key.type !== "public") {
      throw new JWKSInvalid("JSON Web Key Set members must be public keys");
    }
    cached[alg] = key;
  }
  return cached[alg];
}
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
var LocalJWKSet;
var init_local = __esm({
  "../../../Users/The Lord/repos/luyentap-prd0062/cloudflare/node_modules/jose/dist/webapi/jwks/local.js"() {
    init_import();
    init_errors();
    init_type_checks();
    __name(getKtyFromAlg, "getKtyFromAlg");
    __name(isJWKSLike, "isJWKSLike");
    __name(isJWKLike, "isJWKLike");
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
    __name(importWithAlgCache, "importWithAlgCache");
    __name(createLocalJWKSet, "createLocalJWKSet");
  }
});

// ../../../Users/The Lord/repos/luyentap-prd0062/cloudflare/node_modules/jose/dist/webapi/jwks/remote.js
function isCloudflareWorkers() {
  return typeof WebSocketPair !== "undefined" || typeof navigator !== "undefined" && true || typeof EdgeRuntime !== "undefined" && EdgeRuntime === "vercel";
}
async function fetchJwks(url, headers2, signal, fetchImpl = fetch) {
  const response10 = await fetchImpl(url, {
    method: "GET",
    signal,
    redirect: "manual",
    headers: headers2
  }).catch((err) => {
    if (err.name === "TimeoutError") {
      throw new JWKSTimeout();
    }
    throw err;
  });
  if (response10.status !== 200) {
    throw new JOSEError("Expected 200 OK from the JSON Web Key Set HTTP response");
  }
  try {
    return await response10.json();
  } catch {
    throw new JOSEError("Failed to parse the JSON Web Key Set HTTP response as JSON");
  }
}
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
var USER_AGENT, customFetch, jwksCache, RemoteJWKSet;
var init_remote = __esm({
  "../../../Users/The Lord/repos/luyentap-prd0062/cloudflare/node_modules/jose/dist/webapi/jwks/remote.js"() {
    init_errors();
    init_local();
    init_type_checks();
    __name(isCloudflareWorkers, "isCloudflareWorkers");
    if (typeof navigator === "undefined" || !"Cloudflare-Workers"?.startsWith?.("Mozilla/5.0 ")) {
      const NAME = "jose";
      const VERSION = "v6.2.3";
      USER_AGENT = `${NAME}/${VERSION}`;
    }
    customFetch = /* @__PURE__ */ Symbol();
    __name(fetchJwks, "fetchJwks");
    jwksCache = /* @__PURE__ */ Symbol();
    __name(isFreshJwksCache, "isFreshJwksCache");
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
        this.#pendingFetch ||= fetchJwks(this.#url.href, this.#headers, AbortSignal.timeout(this.#timeoutDuration), this.#customFetch).then((json3) => {
          this.#local = createLocalJWKSet(json3);
          if (this.#cache) {
            this.#cache.uat = Date.now();
            this.#cache.jwks = json3;
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
    __name(createRemoteJWKSet, "createRemoteJWKSet");
  }
});

// ../../../Users/The Lord/repos/luyentap-prd0062/cloudflare/node_modules/jose/dist/webapi/index.js
var init_webapi = __esm({
  "../../../Users/The Lord/repos/luyentap-prd0062/cloudflare/node_modules/jose/dist/webapi/index.js"() {
    init_verify3();
    init_sign3();
    init_remote();
    init_import();
  }
});

// ../src/constants/routes.ts
var ROUTES, buildRoute;
var init_routes = __esm({
  "../src/constants/routes.ts"() {
    "use strict";
    ROUTES = {
      // Authentication
      LOGIN: "/",
      PROFILE: "/profile",
      // Teacher Routes
      TEACHER_LOBBY: "/teacher-lobby/:sessionCode",
      TEACHER_TEST_MONITOR: "/teacher-test/:sessionCode",
      TEACHER_TEST_RESULTS: "/teacher-test-results/:sessionCode",
      TEACHER_QUIZ: "/teacher-quiz/:gameSessionId",
      TEACHER_FEEDBACK: "/teacher-feedback/:gameSessionId",
      TEACHER_RESULTS: "/teacher-results/:gameSessionId",
      TEACHER_WAITING: "/teacher-wait/:gameSessionId",
      TEACHER_CLASSES: "/teacher/classes",
      TEACHER_CLASS_DETAIL: "/teacher/classes/:classId",
      TEACHER_COURSES: "/teacher/courses",
      TEACHER_COURSE_DETAIL: "/teacher/courses/:courseId",
      TEACHER_STUDENT_HISTORY: "/teacher/student/:studentId/history",
      // Student Routes
      STUDENT_DASHBOARD: "/student/dashboard",
      STUDENT_COURSES: "/student/courses",
      STUDENT_COURSE_DETAIL: "/student/courses/:courseId",
      STUDENT_COURSE_CATALOG: "/student/courses/catalog",
      STUDENT_CLASS_DETAIL: "/student/classes/:classId",
      STUDENT_WAITING: "/student-wait/:gameSessionId",
      STUDENT_TEST: "/student-test/:sessionCode",
      STUDENT_TEST_RESULTS: "/student-test-results/:sessionCode",
      SUBMISSION_COMPLETE: "/submission-complete",
      STUDENT_QUIZ: "/student-quiz/:gameSessionId",
      STUDENT_FEEDBACK: "/student-feedback/:gameSessionId",
      STUDENT_RESULTS: "/student-results/:gameSessionId",
      // Admin Routes (Super Admin Only)
      ADMIN_DASHBOARD: "/admin/dashboard",
      ADMIN_MATERIALS: "/admin/materials",
      ADMIN_SESSIONS: "/admin/sessions",
      ADMIN_USERS: "/admin/users",
      ADMIN_COURSES: "/admin/courses",
      ADMIN_CLASSES: "/admin/classes",
      ADMIN_SETTINGS: "/admin/settings",
      ADMIN_BACKUP: "/admin/backup",
      ADMIN_REPORTS: "/admin/reports",
      // Teacher Routes - Student Management
      TEACHER_STUDENTS: "/teacher/students",
      // Teacher Routes - Homework (PRD-0016)
      TEACHER_HOMEWORK: "/teacher/homework",
      TEACHER_HOMEWORK_CREATE: "/teacher/homework/create",
      TEACHER_HOMEWORK_DETAIL: "/teacher/homework/:homeworkId",
      TEACHER_HOMEWORK_EDIT: "/teacher/homework/:homeworkId/edit",
      TEACHER_HOMEWORK_STUDENT: "/teacher/homework/student/:studentId",
      // Teacher Routes - Test Creation (PRD-0020)
      TEACHER_TEST_CREATE: "/teacher/test/create",
      TEACHER_READING_V2_CREATE: "/teacher/reading-v2/create",
      TEACHER_READING_V2_IMPORT: "/teacher/reading-v2/import",
      TEACHER_READING_V2_DRAFT: "/teacher/reading-v2/drafts/:draftId",
      TEACHER_READING_V2_REVISE: "/teacher/reading-v2/materials/:materialId/revise",
      TEACHER_MATERIAL_BOOK: "/teacher/materials/books/:bookId",
      // Teacher Routes - Test Review (PRD-0022)
      TEACHER_TEST_REVIEW: "/teacher/test/review/:draftId",
      // Teacher Routes - THCS-THPT Test Editor (PRD-0027)
      TEACHER_THCS_CREATE: "/teacher/thcs-test/create",
      TEACHER_THCS_EDIT: "/teacher/thcs-test/edit/:draftId",
      // Teacher Routes - THCS Grading Tab (PRD-0028)
      TEACHER_GRADING: "/teacher/grading",
      // Teacher Routes - IELTS Writing (PRD-0030)
      TEACHER_WRITING_CREATE: "/teacher/writing-test/create",
      TEACHER_WRITING_EDIT: "/teacher/writing-test/edit/:draftId",
      TEACHER_GRADING_QUEUE: "/teacher/grading/writing",
      TEACHER_GRADING_DETAIL: "/teacher/grading/writing/:submissionId",
      SESSIONS: "/sessions",
      CREATE_TEST: "/create-test",
      // LOBBY route - used for "back to lobby" when no session is active
      LOBBY: "/lobby",
      // Student Routes - Homework & Library (PRD-0016)
      STUDENT_HOMEWORK: "/student/homework",
      STUDENT_HOMEWORK_DETAIL: "/student/homework/:homeworkId",
      STUDENT_LIBRARY: "/student/library",
      STUDENT_ACADEMIC_RECORD: "/student/academic-record",
      STUDENT_PRACTICE: "/student/practice/:materialId",
      BOOK_RUNTIME_SMOKE: "/__smoke/book-runtime",
      BOOK_HOMEWORK_COMPLETION_SMOKE: "/__smoke/book-homework-completion",
      BOOK_ACTIVITY_EVALUATION_SMOKE: "/__smoke/book-activity-evaluation",
      RESULT_DETAIL: "/result/:resultId",
      MATERIAL_UNAVAILABLE: "/material-unavailable/:materialId"
    };
    buildRoute = /* @__PURE__ */ __name((route, params) => {
      let path = ROUTES[route];
      if (params) {
        Object.entries(params).forEach(([key, value]) => {
          if (value !== void 0 && value !== null) {
            path = path.replace(`:${key}`, String(value));
          }
        });
      }
      return path;
    }, "buildRoute");
  }
});

// ../cloudflare/homework-notification.ts
async function deliverHomeworkNotice(input) {
  const { kind, eventId, actorUid } = input;
  if (!ID.test(eventId) || !ID.test(actorUid) || input.studentId !== void 0 && !ID.test(input.studentId)) return deny();
  let homeworkId = eventId;
  let studentId = input.studentId;
  let occurredAt;
  let resultId;
  let resetResultId;
  let resetSubmissionId;
  let source;
  let proof;
  if (kind === "homework-submitted" || kind === "thcs-homework-assigned") {
    proof = (await input.readSource(
      "homework_notification_proofs",
      eventId,
      ["eventId", "kind", "actorUid", "homeworkId", "studentId", "resultId", "occurredAt"]
    )).data;
    if (proof.eventId !== eventId || proof.kind !== kind || proof.actorUid !== actorUid) return deny();
  }
  if (kind !== "thcs-homework-assigned") {
    const collection = kind === "homework-submitted" ? "homework_submissions" : kind === "homework-reminder" ? "homework_manual_reminder_intents" : "homework_reset_notification_intents";
    source = (await input.readSource(collection, eventId, [
      "id",
      "eventId",
      "homeworkId",
      "studentId",
      "teacherId",
      "actorUid",
      "occurredAt",
      "submittedAt",
      "resultId",
      "sourceSubmissionId",
      "status",
      "administrativeImport"
    ])).data;
    homeworkId = source.homeworkId;
    studentId = source.studentId;
    if (kind === "homework-submitted") {
      if (source.id !== eventId || source.studentId !== actorUid || source.administrativeImport || !["submitted", "graded"].includes(String(source.status)) || proof?.homeworkId !== homeworkId || proof?.studentId !== studentId || proof?.resultId !== source.resultId || proof?.occurredAt !== source.submittedAt) return deny();
      occurredAt = source.submittedAt;
      resultId = source.resultId;
    } else {
      if (source.eventId !== eventId || source.actorUid !== actorUid) return deny();
      occurredAt = source.occurredAt;
      if (kind === "homework-reset") {
        resetSubmissionId = source.sourceSubmissionId;
        resetResultId = source.resultId;
        if (typeof resetSubmissionId !== "string" || !ID.test(resetSubmissionId) || resetResultId !== void 0 && (typeof resetResultId !== "string" || !ID.test(resetResultId))) return deny();
        const prior = await input.readSource("homework_submissions", resetSubmissionId, ["id"]);
        if (prior.exists !== false) return deny();
      }
    }
  }
  if (typeof homeworkId !== "string" || !ID.test(homeworkId) || typeof studentId !== "string" || !ID.test(studentId)) return deny();
  const assignment = (await input.readSource(
    "homework_assignments",
    homeworkId,
    ["id", "createdBy", "createdAt", "materialId", "materialType", "target", "assignmentKind", "archived"]
  )).data;
  const owner = assignment.createdBy;
  if (assignment.id !== homeworkId || typeof owner !== "string" || !ID.test(owner) || assignment.assignmentKind || assignment.materialType === "book" || assignment.archived === true) return deny();
  if (kind === "homework-submitted" ? source?.teacherId !== owner : actorUid !== owner) return deny();
  if (kind === "thcs-homework-assigned") {
    if (assignment.materialType !== "thcs-test" || proof?.homeworkId !== homeworkId || proof?.studentId !== studentId || proof?.occurredAt !== assignment.createdAt) return deny();
    occurredAt = assignment.createdAt;
  }
  if (!time(occurredAt) || Number(occurredAt) > Date.now()) return deny();
  const db = await input.database();
  const [ownerRole, studentRole, restoring] = await Promise.all([
    db.read(`users/${owner}/role`),
    db.read(`users/${studentId}/role`),
    db.read("system_flags/restore_in_progress")
  ]);
  if (ownerRole !== "teacher" || studentRole !== "student" || restoring === true) return deny();
  const target = row(assignment.target);
  if (target?.type === "class") {
    if (typeof target.classId !== "string" || !ID.test(target.classId)) return deny();
    const path2 = `classes/${target.classId}`;
    const [classOwner, status, member] = await Promise.all([
      db.read(`${path2}/createdBy`),
      db.read(`${path2}/status`),
      db.read(`${path2}/students/${studentId}/status`)
    ]);
    if (classOwner !== owner || status !== "active" || member !== "active") return deny();
  } else if (["students", "group"].includes(String(target?.type))) {
    if (!Array.isArray(target?.studentIds) || !target.studentIds.includes(studentId)) return deny();
    if (target.type === "group") {
      if (typeof target.groupId !== "string" || !ID.test(target.groupId)) return deny();
      const group = (await input.readSource("student_groups", target.groupId, ["id", "teacherId", "studentIds"])).data;
      if (group.id !== target.groupId || group.teacherId !== owner || !Array.isArray(group.studentIds) || !group.studentIds.includes(studentId)) return deny();
    }
  } else return deny();
  if (kind === "homework-submitted") {
    if (typeof resultId !== "string" || !ID.test(resultId)) return deny();
    const path2 = `test_results/${resultId}`;
    const [savedId, student, contextType] = await Promise.all([db.read(`${path2}/resultId`), db.read(`${path2}/studentId`), db.read(`${path2}/context/type`)]);
    const [sourceId, material, submittedAt] = await Promise.all([db.read(`${path2}/context/source/id`), db.read(`${path2}/testId`), db.read(`${path2}/submittedAt`)]);
    if (savedId !== resultId || student !== studentId || contextType !== "homework" || sourceId !== homeworkId || material !== assignment.materialId || !time(submittedAt) || submittedAt > Number(occurredAt)) return deny();
  }

  const recipient = kind === "homework-submitted" ? owner : studentId;
  const noticeId = `ordinary_${kind.replaceAll("-", "_")}_${eventId}_${recipient}`;
  const notice = {
    id: noticeId,
    type: kind === "homework-reminder" ? "homework_reminder" : "info",
    title: kind === "homework-submitted" ? "Homework submitted" : kind === "homework-reset" ? "Homework reset" : kind === "homework-reminder" ? "Homework reminder" : "New THCS homework",
    message: kind === "homework-submitted" ? "A student submitted homework for review." : kind === "homework-reset" ? "Your teacher removed a homework attempt. Open Homework to check your current status." : kind === "homework-reminder" ? "Your teacher reminded you to complete your homework." : "Your teacher assigned new THCS homework.",
    link: buildRoute(kind === "homework-submitted" ? "TEACHER_HOMEWORK_DETAIL" : "STUDENT_HOMEWORK_DETAIL", { homeworkId }),
    createdAt: occurredAt,
    read: false
  };
  if (new TextEncoder().encode(JSON.stringify(notice)).byteLength > 1024) return deny();
  const path = `notifications/${recipient}/${noticeId}`;
  if (await db.create(path, notice)) return "created";
  const saved = row(await db.read(path));
  if (!saved) throw Error("homework_unknown");
  if (Object.keys(saved).some((key) => !Object.hasOwn(notice, key)) || Object.entries(notice).some(([key, value]) => key !== "read" && saved[key] !== value)) throw Error("homework_conflict");
  return "replayed";
}
var ID, row, deny, time, HOMEWORK_KINDS;
var init_homework_notification = __esm({
  "../cloudflare/homework-notification.ts"() {
    "use strict";
    init_routes();
    ID = /^[A-Za-z0-9_-]{1,128}$/u;
    row = /* @__PURE__ */ __name((value) => value && typeof value === "object" && !Array.isArray(value) ? value : null, "row");
    deny = /* @__PURE__ */ __name(() => {
      throw Error("homework_denied");
    }, "deny");
    time = /* @__PURE__ */ __name((value) => Number.isSafeInteger(value) && Number(value) > 0, "time");
    HOMEWORK_KINDS = ["homework-submitted", "thcs-homework-assigned", "homework-reminder", "homework-reset"];
    __name(deliverHomeworkNotice, "deliverHomeworkNotice");
  }
});

// ../cloudflare/homework-result-authority.ts
async function verifyHomeworkResultAuthority(input) {
  const { env, resultId, actorUid } = input;
  if (!ID2.test(resultId) || !ID2.test(actorUid)) return deny2();
  const ruleset = env.RESULT_NOTIFICATION_AUTHORITY_RULESET_NAME;
  const cutoff = env.RESULT_NOTIFICATION_AUTHORITY_RULES_CUTOFF;
  if (!ruleset?.startsWith(`projects/${env.FIREBASE_PROJECT_ID}/rulesets/`) || !/^projects\/[^/]+\/rulesets\/[^/]+$/u.test(ruleset) || !cutoff)
    throw Error("authority_unavailable");
  const cutover = time2(cutoff);
  if (!env.NOTIFICATION_RATE_LIMITER?.limit) throw Error("authority_unavailable");
  if (!(await env.NOTIFICATION_RATE_LIMITER.limit({ key: `homework-result-authority:${actorUid}` })).success)
    throw Error("authority_rate_limited");
  const writingDoc = await input.readSource(
    "writing_submissions",
    resultId,
    [
      "id",
      "studentId",
      "submittedAt",
      "context.type",
      "context.homeworkId",
      "context.homeworkSubmissionId",
      "context.assigningTeacherId",
      "context.externalImport",
      "context.classId",
      "context.courseId",
      "context.sessionCode",
      "context.selectedTeacherId",
      "testMeta.testId"
    ]
  );
  const writing = writingDoc.data;
  const context = record(writing.context);
  const studentId = writing.studentId;
  const homeworkId = context?.homeworkId;
  const homeworkSubmissionId = context?.homeworkSubmissionId;
  const testId = record(writing.testMeta)?.testId;
  const teacherId = context?.assigningTeacherId;
  if (writing.id !== resultId || context?.type !== "homework" || !timestamp(writing.submittedAt) || ![studentId, homeworkId, homeworkSubmissionId, testId, teacherId].every((id) => typeof id === "string" && ID2.test(id)) || [context.externalImport, context.classId, context.courseId, context.sessionCode, context.selectedTeacherId].some(Boolean) || actorUid !== studentId && actorUid !== teacherId) return deny2();
  const [assignmentDoc, homeworkDoc] = await Promise.all([
    input.readSource("homework_assignments", String(homeworkId), ["id", "createdBy", "target", "contentRef", "materialId", "materialSkill"]),
    input.readSource("homework_submissions", String(homeworkSubmissionId), ["id", "studentId", "teacherId", "homeworkId", "resultId", "submittedAt", "status", "administrativeImport"])
  ]);
  const assignment = assignmentDoc.data;
  const target = record(assignment.target);
  const content = record(assignment.contentRef);
  const homework = homeworkDoc.data;
  if (assignment.id !== homeworkId || assignment.createdBy !== teacherId || target?.type !== "students" || !Array.isArray(target.studentIds) || !target.studentIds.includes(studentId) || assignment.materialSkill !== "writing" || assignment.materialId !== testId || content?.contentKind !== "ielts_writing" || content.contentId !== testId || homework.id !== homeworkSubmissionId || homework.homeworkId !== homeworkId || homework.studentId !== studentId || homework.teacherId !== teacherId || homework.resultId !== resultId || !timestamp(homework.submittedAt) || !["submitted", "graded"].includes(String(homework.status)) || homework.administrativeImport) return deny2();
  for (const [collection, id, document] of [
    ["writing_submissions", resultId, writingDoc],
    ["homework_assignments", homeworkId, assignmentDoc],
    ["homework_submissions", homeworkSubmissionId, homeworkDoc]
  ]) {
    if (document.name !== `projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/${collection}/${id}` || time2(document.createTime) <= cutover) return deny2();
  }
  const requestTime = (input.now ?? Date.now)();
  if (!timestamp(requestTime)) throw Error("authority_unavailable");
  const requestNs = BigInt(requestTime) * 1000000n;
  const writingNs = BigInt(writing.submittedAt) * 1000000n;
  const homeworkNs = BigInt(homework.submittedAt) * 1000000n;
  const writingCreatedNs = time2(writingDoc.createTime);
  if (writingNs <= cutover || writingNs > requestNs || writingNs < writingCreatedNs - OCCURRENCE_CLOCK_SKEW_NS || writingNs > writingCreatedNs + OCCURRENCE_CLOCK_SKEW_NS || homeworkNs < writingNs || homeworkNs > requestNs || homeworkNs < time2(homeworkDoc.createTime) - OCCURRENCE_CLOCK_SKEW_NS) return deny2();
  const authority2 = {
    schemaVersion: 2,
    resultId,
    studentId: String(studentId),
    ownerTeacherId: String(teacherId),
    contextType: "homework",
    homeworkId: String(homeworkId),
    homeworkSubmissionId: String(homeworkSubmissionId),
    testId: String(testId),
    writingSubmittedAt: writing.submittedAt,
    homeworkSubmittedAt: homework.submittedAt,
    submittedAt: writing.submittedAt,
    sourceRulesetName: ruleset,
    sourceRulesCutoff: cutoff
  };
  const database = await input.database();
  const identityPaths = [
    "resultId",
    "studentId",
    "testId",
    "testType",
    "testSkill",
    "isGuest",
    "submittedAt",
    "createdAt",
    "writingData/submissionId",
    "context/type",
    "context/source/type",
    "context/source/id",
    "context/source/submissionId",
    "context/assignment/homeworkId",
    "sessionCode",
    "classId",
    "courseId",
    "moduleId",
    "context/sessionCode",
    "context/classId",
    "context/courseId",
    "context/source/classId",
    "context/source/courseId"
  ];
  const paths = identityPaths.map((path) => `test_results/${resultId}/${path}`);
  paths.push(`users/${studentId}/role`, `users/${teacherId}/role`, "system_flags/restore_in_progress");
  const values = [];
  for (let index = 0; index < paths.length; index += 3) values.push(...await Promise.all(paths.slice(index, index + 3).map((path) => database.read(path))));
  const result = {};
  identityPaths.forEach((path, index) => {
    const segments = path.split("/");
    let parent = result;
    for (const segment of segments.slice(0, -1)) parent = parent[segment] ??= {};
    parent[segments.at(-1)] = values[index];
  });
  if (!sameCanonicalIdentity(result, authority2) || values.at(-3) !== "student" || values.at(-2) !== "teacher") return deny2();
  if (values.at(-1) === true) throw Error("authority_unavailable");
  const receiptPath = `result_notification_authority/${resultId}`;
  if (await database.create(receiptPath, authority2)) return "created";
  const prior = verifiedProof(await database.read(receiptPath));
  if (!prior || keys.some((key) => prior[key] !== authority2[key])) throw Error("authority_conflict");
  return "replayed";
}
var ID2, record, timestamp, OCCURRENCE_CLOCK_SKEW_NS, deny2, time2, keys, verifiedProof, sameCanonicalIdentity;
var init_homework_result_authority = __esm({
  "../cloudflare/homework-result-authority.ts"() {
    "use strict";
    ID2 = /^[A-Za-z0-9_-]{1,128}$/u;
    record = /* @__PURE__ */ __name((value) => value && typeof value === "object" && !Array.isArray(value) ? value : null, "record");
    timestamp = /* @__PURE__ */ __name((value) => Number.isSafeInteger(value) && Number(value) >= 0, "timestamp");
    OCCURRENCE_CLOCK_SKEW_NS = 300000000000n;
    deny2 = /* @__PURE__ */ __name(() => {
      throw Error("authority_denied");
    }, "deny");
    time2 = /* @__PURE__ */ __name((value) => {
      const match = typeof value === "string" && /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?Z$/u.exec(value);
      if (!match) throw Error("authority_unavailable");
      const milliseconds = Date.parse(`${match[1]}Z`);
      if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString().slice(0, 19) !== match[1]) throw Error("authority_unavailable");
      return BigInt(milliseconds) * 1000000n + BigInt((match[2] ?? "").padEnd(9, "0"));
    }, "time");
    keys = [
      "schemaVersion",
      "resultId",
      "studentId",
      "ownerTeacherId",
      "contextType",
      "homeworkId",
      "homeworkSubmissionId",
      "testId",
      "writingSubmittedAt",
      "homeworkSubmittedAt",
      "submittedAt",
      "sourceRulesetName",
      "sourceRulesCutoff"
    ];
    verifiedProof = /* @__PURE__ */ __name((value) => {
      const receipt = record(value);
      if (!receipt || Object.keys(receipt).length !== keys.length || !keys.every((key) => Object.hasOwn(receipt, key)) || receipt.schemaVersion !== 2 || receipt.contextType !== "homework" || !["resultId", "studentId", "ownerTeacherId", "homeworkId", "homeworkSubmissionId", "testId"].every((key) => typeof receipt[key] === "string" && ID2.test(String(receipt[key]))) || !["writingSubmittedAt", "homeworkSubmittedAt", "submittedAt"].every((key) => timestamp(receipt[key])) || receipt.submittedAt !== receipt.writingSubmittedAt || typeof receipt.sourceRulesetName !== "string" || !/^projects\/[^/]+\/rulesets\/[^/]+$/u.test(receipt.sourceRulesetName)) return null;
      try {
        time2(receipt.sourceRulesCutoff);
      } catch {
        return null;
      }
      return receipt;
    }, "verifiedProof");
    sameCanonicalIdentity = /* @__PURE__ */ __name((result, authority2) => {
      const context = record(result.context);
      const source = record(context?.source);
      return result.resultId === authority2.resultId && result.studentId === authority2.studentId && result.testId === authority2.testId && result.testType === "homework" && result.testSkill === "writing" && result.isGuest === false && result.submittedAt === authority2.submittedAt && result.createdAt === authority2.writingSubmittedAt && record(result.writingData)?.submissionId === authority2.resultId && context?.type === "homework" && source?.type === "homework" && source.id === authority2.homeworkId && source.submissionId === authority2.resultId && record(context.assignment)?.homeworkId === authority2.homeworkId && ![
        result.sessionCode,
        result.classId,
        result.courseId,
        result.moduleId,
        context.sessionCode,
        context.classId,
        context.courseId,
        source.classId,
        source.courseId
      ].some(Boolean);
    }, "sameCanonicalIdentity");
    __name(verifyHomeworkResultAuthority, "verifyHomeworkResultAuthority");
  }
});

// ../cloudflare/writing-product.ts
async function classAccess(store, classId, studentId, actor) {
  if (typeof classId !== "string" || !ID3.test(classId)) return deny3();
  const [owner, status, member] = await Promise.all([
    store.rtdb(`classes/${classId}/createdBy`),
    store.rtdb(`classes/${classId}/status`),
    store.rtdb(`classes/${classId}/students/${studentId}/status`)
  ]);
  if (owner !== actor || status !== "active" || member !== "active") return deny3();
}
async function authority(store, source, actor, capture) {
  const context = record2(source.context);
  const student = source.studentId;
  if (!context || !ID3.test(String(student)) || !ID3.test(String(source.testMeta?.testId)) || !Number.isSafeInteger(source.submittedAt)) return deny3();
  if (context.type === "solo-practice") {
    if (capture || context.selectedTeacherId !== actor || source.sourceActorUid !== student) return deny3();
    await classAccess(store, context.classId, student, actor);
  } else if (context.type === "live-session") {
    if (!ID3.test(String(context.sessionCode))) return deny3();
    const session = await store.rtdb(`game_sessions/${context.sessionCode}`);
    if (!session || (session.createdByUserId || session.createdBy) !== actor || context.assigningTeacherId !== actor || !session.players?.[student] || !(session.testId === source.testMeta.testId || session.students?.[student]?.assignedTestId === source.testMeta.testId || Object.values(session.activeTests ?? {}).some((test) => test.testId === source.testMeta.testId && test.assignedStudents?.includes(student)))) return deny3();
    if (capture) {
      const frozen = session.students?.[student]?.writing;
      if (!frozen || frozen.resultId !== source.id || frozen.submittedAt !== source.submittedAt) return deny3();
      if (frozen.pendingSubmission) {
        if (!same(frozen.pendingSubmission, source)) return deny3();
      } else {
        const result = await store.rtdb(`test_results/${source.id}`);
        if (frozen.submitted !== true || result?.resultId !== source.id || result.studentId !== student || result.sessionCode !== context.sessionCode || result.testId !== source.testMeta.testId || result.createdAt !== source.submittedAt || result.writingData?.submissionId !== source.id) return deny3();
      }
    }
  } else if (context.type === "homework") {
    if (!ID3.test(String(context.homeworkId)) || context.assigningTeacherId !== actor) return deny3();
    const assignment = await store.read("homework_assignments", context.homeworkId, ["id", "createdBy", "materialId", "materialSkill", "target"]);
    const data = assignment?.data;
    if (data?.id !== context.homeworkId || data.createdBy !== actor || data.materialSkill !== "writing" || data.materialId !== source.testMeta.testId) return deny3();
    if (data.target?.type === "students") {
      if (!data.target.studentIds?.includes(student)) return deny3();
    } else if (data.target?.type === "class") await classAccess(store, data.target.classId, student, actor);
    else return deny3();
    if (capture && (context.externalImport?.source !== "external-admin-import" || context.externalImport.importedByTeacherId !== actor)) return deny3();
  } else return deny3();
  if (!capture) {
    const canonical3 = await store.rtdb(`test_results/${source.id}`);
    if (canonical3?.resultId !== source.id || canonical3.studentId !== student || canonical3.testId !== source.testMeta.testId || canonical3.submittedAt !== source.submittedAt || canonical3.writingData?.submissionId !== source.id) return deny3();
  }
}
function boundedObject(value, keys2) {
  const data = record2(value);
  if (!data || Object.keys(data).some((key) => !keys2.includes(key))) return deny3();
  return data;
}
async function writingProduct(input, actor, env, store) {
  if (!ID3.test(actor) || await store.rtdb(`users/${actor}/role`) !== "teacher") return deny3();
  const operation = String(input.operation);
  const id = String(input.submissionId);
  if (!operations.has(operation) || !ID3.test(id) || Object.keys(input).some((key) => !["operation", "submissionId", "payload", "expectedDraftVersion", "expectedPublishedVersion", "runId"].includes(key))) return deny3();
  if (!env.WRITING_PRODUCT_SOURCE_CUTOFF || !Number.isFinite(Date.parse(env.WRITING_PRODUCT_SOURCE_CUTOFF))) throw Error("writing_product_unqualified");
  if (operation === "capture") {
    const source2 = boundedObject(input.payload, ["id", "studentId", "studentName", "context", "testMeta", "tasks", "submittedAt", "totalElapsedTimeSeconds", "pasteAttemptCount", "markingStatus", "annotations", "auditTrail"]);
    if (source2.id !== id || source2.markingStatus !== "pending-review" || !same(source2.annotations ?? [], []) || !same(source2.auditTrail ?? [], []) || !Array.isArray(source2.tasks) || source2.tasks.length < 1 || source2.tasks.length > 2) return deny3();
    await authority(store, source2, actor, true);
    const existing = await store.read("writing_submissions", id);
    const sealed = { ...source2, annotations: source2.annotations ?? [], auditTrail: source2.auditTrail ?? [], sourceActorUid: actor };
    if (existing) {
      if (Date.parse(existing.createTime) <= Date.parse(env.WRITING_PRODUCT_SOURCE_CUTOFF) || ![actor, source2.studentId].includes(existing.data.sourceActorUid)) return deny3();
      const savedSource = Object.fromEntries(Object.keys(source2).map((key) => [key, existing.data[key]]));
      if (!same(savedSource, source2)) return conflict();
    } else await store.commit([{ collection: "writing_submissions", id, data: sealed, absent: true }]);
    return { status: "accepted", data: existing?.data ?? sealed };
  }
  const metadata = await store.read("writing_submissions", id, sourceMask);
  if (!metadata || Date.parse(metadata.createTime) <= Date.parse(env.WRITING_PRODUCT_SOURCE_CUTOFF)) return deny3();
  await authority(store, metadata.data, actor, false);
  if (operation === "cache-read") return { status: "accepted", data: (await store.read("writing_grading_ai_cache", id))?.data ?? null };
  if (operation === "cache-save" || operation === "cache-run-save") {
    const cache3 = record2(input.payload);
    const run = operation === "cache-run-save";
    if (!cache3 || !run && cache3.submissionId !== id) return deny3();
    if (run && (!ID3.test(String(input.runId)) || input.runId !== `${cache3.runId}__${cache3.attemptId}`)) return deny3();
    const collection = run ? `writing_grading_ai_cache/${id}/generation_runs` : "writing_grading_ai_cache";
    const targetId = run ? String(input.runId) : id;
    const previous = await store.read(collection, targetId);
    await store.commit([{ collection, id: targetId, data: cache3, ...previous ? { updateTime: previous.updateTime } : { absent: true } }]);
    return { status: "accepted" };
  }
  const [document, draftDocument] = await Promise.all([store.read("writing_submissions", id), store.read("writing_grading_drafts", id)]);
  if (!document || document.updateTime !== metadata.updateTime) return conflict();
  const source = document.data;
  const draft = draftDocument?.data;
  const publishedVersion = source.publishedGrading?.auditVersion ?? 0;
  const draftVersion = draft?.version ?? 0;
  if (operation === "detail") return { status: "accepted", data: { submission: source, gradingDraft: draft ?? null } };
  if (input.expectedPublishedVersion !== publishedVersion || input.expectedDraftVersion !== draftVersion) return conflict();
  const writes = [];
  if (operation === "draft-save") {
    const next = boundedObject(input.payload, ["submissionId", "ownerTeacherId", "ownerTeacherName", "version", "basedOnPublishedVersion", "createdAt", "updatedAt", "overallSummary", "perTask", "pendingCommentDrafts"]);
    if (next.submissionId !== id || next.ownerTeacherId !== actor || next.version !== draftVersion + 1 || next.basedOnPublishedVersion !== publishedVersion || draft && draft.ownerTeacherId !== actor) return deny3();
    writes.push({ collection: "writing_grading_drafts", id, data: next, ...draftDocument ? { updateTime: draftDocument.updateTime } : { absent: true } });
    source.gradingDraftMeta = { ownerTeacherId: actor, ownerTeacherName: next.ownerTeacherName, version: next.version, basedOnPublishedVersion: publishedVersion, updatedAt: next.updatedAt };
  } else if (operation === "publish") {
    const grade = boundedObject(input.payload, ["publishedGrading", "auditEntry", "grading", "annotations"]);
    if (grade.publishedGrading?.teacherId !== actor || grade.publishedGrading.auditVersion !== publishedVersion + 1 || grade.auditEntry?.teacherId !== actor || grade.auditEntry.version !== publishedVersion + 1 || !["published", "regraded"].includes(grade.auditEntry.action) || draft && draft.ownerTeacherId !== actor || !Number.isFinite(grade.publishedGrading.overallBand) || grade.publishedGrading.overallBand < 0 || grade.publishedGrading.overallBand > 9) return deny3();
    source.publishedGrading = grade.publishedGrading;
    if (grade.grading?.teacherId !== actor || !Array.isArray(grade.annotations)) return deny3();
    source.grading = grade.grading;
    source.annotations = grade.annotations;
    source.markingStatus = "graded";
    source.gradingDraftMeta = null;
    source.auditTrail = [...source.auditTrail ?? [], grade.auditEntry];
  } else if (operation === "discard") {
    const audit = boundedObject(input.payload, ["version", "gradedAt", "teacherId", "teacherName", "action", "reason", "previousScores"]);
    if (audit.teacherId !== actor || audit.version !== publishedVersion || audit.action !== "discarded-draft") return deny3();
    source.gradingDraftMeta = null;
    source.auditTrail = [...source.auditTrail ?? [], audit];
  } else if (operation === "grade") {
    const grade = boundedObject(input.payload, ["grading", "annotations", "markingStatus"]);
    if (grade.grading?.teacherId !== actor || !["pending-review", "graded"].includes(grade.markingStatus) || !Array.isArray(grade.annotations)) return deny3();
    Object.assign(source, grade);
  } else return deny3();
  if ((operation === "publish" || operation === "discard") && draftDocument) writes.push({ collection: "writing_grading_drafts", id, remove: true, updateTime: draftDocument.updateTime });
  writes.push({ collection: "writing_submissions", id, data: source, updateTime: document.updateTime });
  await store.commit(writes);
  return { status: "accepted", data: operation === "draft-save" ? input.payload : source };
}
var ID3, record2, deny3, conflict, same, sourceMask, operations;
var init_writing_product = __esm({
  "../cloudflare/writing-product.ts"() {
    "use strict";
    ID3 = /^[A-Za-z0-9_-]{1,128}$/u;
    record2 = /* @__PURE__ */ __name((value) => value && typeof value === "object" && !Array.isArray(value) ? value : null, "record");
    deny3 = /* @__PURE__ */ __name(() => {
      throw Error("writing_access_denied");
    }, "deny");
    conflict = /* @__PURE__ */ __name(() => {
      throw Error("writing_version_conflict");
    }, "conflict");
    same = /* @__PURE__ */ __name((a, b) => {
      if (a === b) return true;
      if (!a || !b || typeof a !== "object" || typeof b !== "object" || Array.isArray(a) !== Array.isArray(b)) return false;
      const entries = Object.entries(a);
      return entries.length === Object.keys(b).length && entries.every(([key, value]) => Object.hasOwn(b, key) && same(value, b[key]));
    }, "same");
    sourceMask = [
      "id",
      "studentId",
      "sourceActorUid",
      "context.type",
      "context.selectedTeacherId",
      "context.assigningTeacherId",
      "context.classId",
      "context.sessionCode",
      "context.homeworkId",
      "context.homeworkSubmissionId",
      "context.externalImport.source",
      "context.externalImport.importedByTeacherId",
      "submittedAt",
      "testMeta.testId"
    ];
    operations = /* @__PURE__ */ new Set(["detail", "draft-save", "publish", "discard", "grade", "cache-read", "cache-save", "cache-run-save", "capture"]);
    __name(classAccess, "classAccess");
    __name(authority, "authority");
    __name(boundedObject, "boundedObject");
    __name(writingProduct, "writingProduct");
  }
});

// ../cloudflare/src/upload-worker/firebase-verification.js
var firebase_verification_exports = {};
__export(firebase_verification_exports, {
  FIREBASE_JWKS_URL: () => FIREBASE_JWKS_URL,
  createFirebaseVerifier: () => createFirebaseVerifier
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
function getFirebaseProjectId(env) {
  return typeof env?.FIREBASE_PROJECT_ID === "string" ? env.FIREBASE_PROJECT_ID.trim() : "";
}
async function verifyFirebaseJwt(token2, env, jwtVerify3, jwks) {
  const projectId = getFirebaseProjectId(env);
  if (!projectId) {
    return { valid: false, reason: "missing_project_id" };
  }
  try {
    const { payload } = await jwtVerify3(token2, jwks, {
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
function createFirebaseVerifier({
  verifyToken,
  jwtVerify: jwtVerify3 = jwtVerify,
  jwks = DEFAULT_JWKS
} = {}) {
  const tokenVerifier = verifyToken ?? ((token2, env) => verifyFirebaseJwt(token2, env, jwtVerify3, jwks));
  return {
    verifyToken: tokenVerifier,
    async verifyAuthorizationHeader(authHeader, env) {
      const extracted = extractBearerToken(authHeader);
      if (!extracted.valid) return extracted;
      return tokenVerifier(extracted.token, env);
    }
  };
}
var FIREBASE_JWKS_URL, DEFAULT_JWKS;
var init_firebase_verification = __esm({
  "../cloudflare/src/upload-worker/firebase-verification.js"() {
    "use strict";
    init_webapi();
    FIREBASE_JWKS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
    DEFAULT_JWKS = createRemoteJWKSet(new URL(FIREBASE_JWKS_URL));
    __name(extractBearerToken, "extractBearerToken");
    __name(getFirebaseProjectId, "getFirebaseProjectId");
    __name(verifyFirebaseJwt, "verifyFirebaseJwt");
    __name(createFirebaseVerifier, "createFirebaseVerifier");
  }
});

// ../cloudflare/writing-product-route.ts
var writing_product_route_exports = {};
__export(writing_product_route_exports, {
  writingProductRoute: () => writingProductRoute
});
function encode3(value) {
  if (value === null) return { nullValue: null };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number" && Number.isFinite(value)) return Number.isSafeInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encode3) } };
  if (value && typeof value === "object") return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, child]) => [key, encode3(child)])) } };
  throw Error("writing_access_denied");
}
async function writingProductRoute(request, env, input, fetcher) {
  const identity = await createFirebaseVerifier().verifyAuthorizationHeader(request.headers.get("Authorization"), env);
  if (!identity.valid || !/^[A-Za-z0-9_-]{1,128}$/u.test(identity.uid ?? "")) throw Error("writing_unauthenticated");
  if (!(await env.NOTIFICATION_RATE_LIMITER.limit({ key: `writing-product:${identity.uid}` })).success) throw Error("writing_rate_limited");
  if (!env.WRITING_PRODUCT_SOURCE_CUTOFF || !env.WRITING_PRODUCT_QA_ACTOR || !env.WRITING_PRODUCT_QA_SUBMISSION_ID)
    throw Error("writing_product_unqualified");
  if (identity.uid !== env.WRITING_PRODUCT_QA_ACTOR || input.submissionId !== env.WRITING_PRODUCT_QA_SUBMISSION_ID)
    throw Error("writing_access_denied");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1e4);
  const trustedFetch = /* @__PURE__ */ __name((url, init) => fetcher(url, { ...init, signal: controller.signal }), "trustedFetch");
  try {
    const accessToken = await token(env, trustedFetch, request.headers.get("CF-Ray"));
    const headers2 = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };
    const project = encodeURIComponent(env.FIREBASE_PROJECT_ID);
    const documents = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents`;
    const store = {
      read: /* @__PURE__ */ __name(async (collection, id, mask) => {
        const query = new URLSearchParams();
        mask?.forEach((path) => query.append("mask.fieldPaths", path));
        const response10 = await trustedFetch(`${documents}/${collection}/${encodeURIComponent(id)}?${query}`, { headers: headers2 });
        if (response10.status === 404) return null;
        if (!response10.ok) throw Error("writing_product_unavailable");
        const value = await response10.json();
        return { data: fields(value.fields), updateTime: value.updateTime, createTime: value.createTime };
      }, "read"),
      rtdb: /* @__PURE__ */ __name(async (path) => {
        const response10 = await trustedFetch(`${env.FIREBASE_DB_URL.replace(/\/$/u, "")}/${path}.json`, { headers: headers2 });
        if (!response10.ok) throw Error("writing_product_unavailable");
        return response10.json();
      }, "rtdb"),
      commit: /* @__PURE__ */ __name(async (writes) => {
        const body = { writes: writes.map((write) => ({
          ...write.remove ? { delete: `projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/${write.collection}/${write.id}` } : { update: { name: `projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/${write.collection}/${write.id}`, fields: encode3(write.data).mapValue.fields } },
          currentDocument: write.absent ? { exists: false } : { updateTime: write.updateTime }
        })) };
        const response10 = await trustedFetch(`${documents}:commit`, { method: "POST", headers: headers2, body: JSON.stringify(body) });
        if ([409, 412].includes(response10.status)) throw Error("writing_version_conflict");
        if (!response10.ok) {
          const error = await response10.json().catch(() => null);
          if (["FAILED_PRECONDITION", "ALREADY_EXISTS", "ABORTED"].includes(error?.error?.status)) throw Error("writing_version_conflict");
          throw Error("writing_product_unavailable");
        }
      }, "commit")
    };
    return await writingProduct(input, identity.uid, env, store);
  } finally {
    clearTimeout(timer);
  }
}
var init_writing_product_route = __esm({
  "../cloudflare/writing-product-route.ts"() {
    "use strict";
    init_writing_product();
    init_notification_firestore_bridge();
    init_firebase_verification();
    __name(encode3, "encode");
    __name(writingProductRoute, "writingProductRoute");
  }
});

// ../cloudflare/notification-firestore-bridge.ts
var ID4, ORIGINS, TOKEN_URL, cachedKey, cachedKeyJson, cachedToken, row2, field, fields, json, token, createNotificationFirestoreBridge, notification_firestore_bridge_default;
var init_notification_firestore_bridge = __esm({
  "../cloudflare/notification-firestore-bridge.ts"() {
    "use strict";
    init_webapi();
    init_homework_notification();
    init_routes();
    init_homework_result_authority();
    ID4 = /^[A-Za-z0-9_-]{1,128}$/u;
    ORIGINS = /* @__PURE__ */ new Set(["https://kahut1.web.app", "https://hocthem.net", "http://localhost:5173", "http://localhost:5174"]);
    TOKEN_URL = "https://oauth2.googleapis.com/token";
    cachedKeyJson = "";
    row2 = /* @__PURE__ */ __name((value) => value && typeof value === "object" && !Array.isArray(value) ? value : null, "row");
    field = /* @__PURE__ */ __name((value) => {
      const data = row2(value);
      if (!data) return void 0;
      if (typeof data.stringValue === "string") return data.stringValue;
      if (typeof data.integerValue === "string") return Number(data.integerValue);
      if (typeof data.doubleValue === "number") return data.doubleValue;
      if (Object.hasOwn(data, "nullValue")) return null;
      if (data.mapValue) return fields(row2(data.mapValue)?.fields);
      if (data.arrayValue) return (row2(data.arrayValue)?.values ?? []).map(field);
      if (typeof data.booleanValue === "boolean") return data.booleanValue;
      return void 0;
    }, "field");
    fields = /* @__PURE__ */ __name((value) => Object.fromEntries(Object.entries(row2(value) ?? {}).map(([key, child]) => [key, field(child)])), "fields");
    json = /* @__PURE__ */ __name((request, status, statusText) => {
      const headers2 = new Headers({ "Content-Type": "application/json", "Cache-Control": "no-store", Vary: "Origin" });
      const origin = request.headers.get("Origin");
      if (origin && ORIGINS.has(origin)) {
        headers2.set("Access-Control-Allow-Origin", origin);
        headers2.set("Access-Control-Allow-Methods", "POST, OPTIONS");
        headers2.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
      }
      return new Response(JSON.stringify({ status: statusText }), { status, headers: headers2 });
    }, "json");
    token = /* @__PURE__ */ __name(async (env, fetcher, requestRay) => {
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
      const response10 = await fetcher(TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion })
      });
      profile.oauthWallMs = performance.now() - oauthStarted;
      
      if (!response10.ok) throw Error("token_failed");
      const body = await response10.json();
      if (typeof body.access_token !== "string" || !body.access_token) throw Error("token_invalid");
      const issuedAt = Date.now(); cachedToken = { value: body.access_token, until: issuedAt + (typeof body.expires_in === "number" ? body.expires_in : 3600) * 1e3 }; console.info("notification_bridge_oauth", { ...profile, issuedAt, expiresAt: cachedToken.until });
      return cachedToken.value;
    }, "token");
    createNotificationFirestoreBridge = /* @__PURE__ */ __name((fetcher = fetch) => ({
      async fetch(request, env) {
        const url = new URL(request.url);
        if (!["/events", "/homework-result-authority", "/writing-product"].includes(url.pathname) || url.search) return json(request, 404, "not_found");
        const bodyLimit = url.pathname === "/writing-product" ? 131072 : 512;
        const origin = request.headers.get("Origin");
        if (origin && !ORIGINS.has(origin)) return json(request, 403, "origin_denied");
        if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: json(request, 200, "ok").headers });
        if (request.method !== "POST") return json(request, 405, "method_denied");
        const auth = request.headers.get("Authorization");
        if (!auth?.startsWith("Bearer ") || !auth.slice(7)) return json(request, 401, "unauthenticated");
        if (!request.headers.get("Content-Type")?.toLowerCase().startsWith("application/json")) return json(request, 400, "invalid_content_type");
        if (Number(request.headers.get("Content-Length") ?? 0) > bodyLimit) return json(request, 413, "body_too_large");
        const reader = request.body?.getReader();
        const decoder3 = new TextDecoder();
        let raw = "";
        let bytes = 0;
        if (reader) {
          try {
            while (true) {
              const chunk = await reader.read();
              if (chunk.done) break;
              bytes += chunk.value.byteLength;
              if (bytes > bodyLimit) {
                await reader.cancel();
                return json(request, 413, "body_too_large");
              }
              raw += decoder3.decode(chunk.value, { stream: true });
            }
            raw += decoder3.decode();
          } finally {
            reader.releaseLock();
          }
        }
        let input;
        try {
          input = row2(JSON.parse(raw));
        } catch {
          input = null;
        }
        if (url.pathname === "/writing-product") {
          if (!input) return json(request, 400, "invalid_writing_operation");
          try {
            const { writingProductRoute: writingProductRoute2 } = await Promise.resolve().then(() => (init_writing_product_route(), writing_product_route_exports));
            const result = await writingProductRoute2(request, env, input, fetcher);
            const body = JSON.stringify(result);
            if (new TextEncoder().encode(body).length > 262144) throw Error("writing_response_too_large");
            return new Response(body, { status: 200, headers: json(request, 200, "accepted").headers });
          } catch (error) {
            const code = error instanceof Error ? error.message : "writing_product_unavailable";
            return json(request, code === "writing_access_denied" ? 403 : code === "writing_unauthenticated" ? 401 : code === "writing_version_conflict" ? 409 : code === "writing_rate_limited" ? 429 : 503, code);
          }
        }
        if (url.pathname === "/homework-result-authority") {
          if (!input || Object.keys(input).join(",") !== "resultId" || typeof input.resultId !== "string" || !ID4.test(input.resultId))
            return json(request, 400, "invalid_result");
          if (input.resultId !== env.HOMEWORK_RESULT_AUTHORITY_QA_RESULT_ID) return json(request, 403, "qa_result_denied");
          if (!env.RESULT_NOTIFICATION_AUTHORITY_RULESET_NAME || !env.RESULT_NOTIFICATION_AUTHORITY_RULES_CUTOFF)
            return json(request, 503, "authority_unavailable");
          try {
            const { createFirebaseVerifier: createFirebaseVerifier3 } = await Promise.resolve().then(() => (init_firebase_verification(), firebase_verification_exports));
            const identity = await createFirebaseVerifier3().verifyAuthorizationHeader(auth, env);
            const actor = identity.uid;
            if (!identity.valid || typeof actor !== "string" || !ID4.test(actor)) return json(request, 401, "unauthenticated");
            if (actor !== env.HOMEWORK_RESULT_AUTHORITY_QA_ACTOR) return json(request, 403, "qa_actor_denied");
            const project2 = encodeURIComponent(env.FIREBASE_PROJECT_ID);
            const status = await verifyHomeworkResultAuthority({
              resultId: input.resultId,
              actorUid: actor,
              env,
              readSource: /* @__PURE__ */ __name(async (collection, id, mask) => {
                const query = new URLSearchParams();
                mask.forEach((path) => query.append("mask.fieldPaths", path));
                const response10 = await fetcher(`https://firestore.googleapis.com/v1/projects/${project2}/databases/(default)/documents/${collection}/${encodeURIComponent(id)}?${query}`, { headers: { Authorization: auth } });
                if ([401, 403, 404].includes(response10.status)) throw Error("authority_denied");
                if (!response10.ok) throw Error("authority_unavailable");
                const document = row2(await response10.json());
                return { name: document?.name, createTime: document?.createTime, data: fields(document?.fields) };
              }, "readSource"),
              database: /* @__PURE__ */ __name(async () => {
                const accessToken = await token(env, fetcher, request.headers.get("CF-Ray"));
                const headers2 = { Authorization: `Bearer ${accessToken}` };
                const base = env.FIREBASE_DB_URL.replace(/\/$/u, "");
                return {
                  read: /* @__PURE__ */ __name(async (path) => {
                    const response10 = await fetcher(`${base}/${path}.json`, { headers: headers2 });
                    if (!response10.ok) throw Error("authority_unavailable");
                    return response10.json();
                  }, "read"),
                  create: /* @__PURE__ */ __name(async (path, value) => {
                    const response10 = await fetcher(`${base}/${path}.json`, { method: "PUT", headers: { ...headers2, "Content-Type": "application/json", "If-Match": "null_etag" }, body: JSON.stringify(value) });
                    if (response10.ok) return true;
                    if (response10.status === 412) return false;
                    throw Error("authority_unavailable");
                  }, "create")
                };
              }, "database")
            });
            return json(request, 200, status);
          } catch (error) {
            const code = error instanceof Error ? error.message : "";
            return json(
              request,
              code === "authority_denied" ? 403 : code === "authority_conflict" ? 409 : code === "authority_rate_limited" ? 429 : 503,
              ["authority_denied", "authority_conflict", "authority_rate_limited"].includes(code) ? code : "authority_unavailable"
            );
          }
        }
        if (input && HOMEWORK_KINDS.includes(input.kind)) {
          if (Object.keys(input).sort().join(",") !== (input.kind === "thcs-homework-assigned" ? "eventId,kind,studentId" : "eventId,kind") || typeof input.eventId !== "string" || !ID4.test(input.eventId) || input.kind === "thcs-homework-assigned" && (typeof input.studentId !== "string" || !ID4.test(input.studentId)))
            return json(request, 400, "invalid_event");
          const homeworkCutoff = env.HOMEWORK_NOTIFICATION_RULES_CUTOFF;
          const productionHomework = Boolean(homeworkCutoff && Number.isFinite(Date.parse(homeworkCutoff)));
          if (!productionHomework) return json(request, 503, "homework_unqualified");
          try {
            const { createFirebaseVerifier: createFirebaseVerifier3 } = await Promise.resolve().then(() => (init_firebase_verification(), firebase_verification_exports));
            const identity = await createFirebaseVerifier3().verifyAuthorizationHeader(auth, env);
            if (!identity.valid || typeof identity.uid !== "string" || !ID4.test(identity.uid)) return json(request, 401, "unauthenticated");
            if (!env.NOTIFICATION_RATE_LIMITER?.limit) return json(request, 503, "limiter_missing");
            if (!(await env.NOTIFICATION_RATE_LIMITER.limit({ key: `firestore-bridge:${identity.uid}` })).success) return json(request, 429, "rate_limited");
            const status = await deliverHomeworkNotice({
              kind: input.kind,
              eventId: input.eventId,
              studentId: input.studentId,
              actorUid: identity.uid,
              readSource: /* @__PURE__ */ __name(async (collection, id, mask) => {
                const query = new URLSearchParams();
                mask.forEach((path) => query.append("mask.fieldPaths", path));
                const authorization = collection === "student_groups" ? `Bearer ${await token(env, fetcher, request.headers.get("CF-Ray"))}` : auth;
                const response10 = await fetcher(`https://firestore.googleapis.com/v1/projects/${encodeURIComponent(env.FIREBASE_PROJECT_ID)}/databases/(default)/documents/${collection}/${encodeURIComponent(id)}?${query}`, { headers: { Authorization: authorization } });
                if (response10.status === 404 && input.kind === "homework-reset" && collection === "homework_submissions") return { data: {}, exists: false };
                if ([401, 403, 404].includes(response10.status)) throw Error("homework_denied");
                if (!response10.ok) throw Error("homework_unknown");
                const document = row2(await response10.json());
                if (collection !== "student_groups" && (!document || typeof document.createTime !== "string" || !(Date.parse(document.createTime) > Date.parse(env.HOMEWORK_NOTIFICATION_RULES_CUTOFF)))) throw Error("homework_denied");
                return { data: fields(document?.fields), createTime: document?.createTime };
              }, "readSource"),
              database: /* @__PURE__ */ __name(async () => {
                const accessToken = await token(env, fetcher, request.headers.get("CF-Ray"));
                const headers2 = { Authorization: `Bearer ${accessToken}` };
                const base = env.FIREBASE_DB_URL.replace(/\/$/u, "");
                return {
                  read: /* @__PURE__ */ __name(async (path, shallow) => {
                    const response10 = await fetcher(`${base}/${path}.json${shallow ? "?shallow=true" : ""}`, { headers: headers2 });
                    if (!response10.ok) throw Error("homework_unknown");
                    return response10.json();
                  }, "read"),
                  create: /* @__PURE__ */ __name(async (path, value) => {
                    const response10 = await fetcher(`${base}/${path}.json`, { method: "PUT", headers: { ...headers2, "Content-Type": "application/json", "If-Match": "null_etag" }, body: JSON.stringify(value) });
                    if (response10.ok) return true;
                    if (response10.status === 412) return false;
                    throw Error("homework_unknown");
                  }, "create")
                };
              }, "database")
            });
            return json(request, 200, status);
          } catch (error) {
            const code = error instanceof Error ? error.message : "homework_unknown";
            return json(
              request,
              code === "homework_denied" ? 403 : code === "homework_conflict" ? 409 : 503,
              ["homework_denied", "homework_conflict"].includes(code) ? code : "delivery_unknown"
            );
          }
        }
        if (!input || Object.keys(input).sort().join(",") !== "eventId,kind" || !["writing-submitted-student", "writing-submitted-teacher", "writing-session-submitted", "writing-graded"].includes(String(input.kind)) || typeof input.eventId !== "string" || !ID4.test(input.eventId)) {
          return json(request, 400, "invalid_event");
        }
        const eventId = input.eventId;
        const writingCutoff = env.WRITING_NOTIFICATION_RULES_CUTOFF;
        const productionWriting = Boolean(writingCutoff && Number.isFinite(Date.parse(writingCutoff)));
        if (writingCutoff && !productionWriting) return json(request, 503, "writing_unqualified");
        if (productionWriting && !["writing-submitted-student", "writing-submitted-teacher"].includes(String(input.kind))) return json(request, 403, "writing_kind_denied");
        if (!productionWriting && eventId !== env.NOTIFICATION_BRIDGE_QA_EVENT_ID) return json(request, 403, "qa_event_denied");
        const project = encodeURIComponent(env.FIREBASE_PROJECT_ID);
        const documentUrl = /* @__PURE__ */ __name((collection, id, fieldPaths) => {
          const mask = new URLSearchParams();
          for (const path of fieldPaths) mask.append("mask.fieldPaths", path);
          return `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/${collection}/${encodeURIComponent(id)}?${mask}`;
        }, "documentUrl");
        try {
          const proofResponse = await fetcher(
            documentUrl(
              "writing_notification_intents",
              eventId,
              ["eventId", "kind", "authorityRecordId", "occurrenceId", "actorUid", "occurredAt", "auditVersion", "sessionCode"]
            ),
            { headers: { Authorization: auth } }
          );
          if (proofResponse.status === 401 || proofResponse.status === 403) return json(request, 403, "actor_denied");
          if (proofResponse.status === 404) return json(request, 404, "source_missing");
          if (!proofResponse.ok) throw Error("proof_read");
          const proofDocument = row2(await proofResponse.json());
          if (productionWriting && !(typeof proofDocument?.createTime === "string" && Date.parse(proofDocument.createTime) > Date.parse(writingCutoff))) return json(request, 403, "proof_invalid");
          const proof = fields(proofDocument?.fields);
          const sourceId = proof.authorityRecordId;
          const actor = proof.actorUid;
          const grade = input.kind === "writing-graded";
          const session = input.kind === "writing-session-submitted";
          const expectedEventId = grade ? `writing-${String(sourceId)}-graded-${String(proof.auditVersion)}` : session ? `writing-${String(sourceId)}-session-ended-${String(proof.occurredAt)}` : `writing-${String(sourceId)}-submitted-${input.kind === "writing-submitted-teacher" ? "teacher" : "student"}`;
          if (proof.kind !== input.kind || proof.eventId !== eventId || proof.occurrenceId !== eventId || typeof sourceId !== "string" || !ID4.test(sourceId) || typeof actor !== "string" || !ID4.test(actor) || eventId !== expectedEventId || !Number.isSafeInteger(proof.occurredAt) || grade && (!Number.isSafeInteger(proof.auditVersion) || Number(proof.auditVersion) < 1) || session && (typeof proof.sessionCode !== "string" || !ID4.test(proof.sessionCode)))
            return json(request, 403, "proof_invalid");
          if (!productionWriting && actor !== env.NOTIFICATION_BRIDGE_QA_ACTOR) return json(request, 403, "qa_actor_denied");
          if (!env.NOTIFICATION_RATE_LIMITER?.limit) return json(request, 503, "limiter_missing");
          if (!(await env.NOTIFICATION_RATE_LIMITER.limit({ key: `firestore-bridge:${actor}` })).success) return json(request, 429, "rate_limited");
          const sourceMask2 = [
            "id",
            "studentId",
            "sourceActorUid",
            "submittedAt",
            "context.type",
            "context.selectedTeacherId",
            "context.classId",
            ...grade ? ["publishedGrading.teacherId", "publishedGrading.auditVersion", "publishedGrading.gradedAt", "auditTrail"] : [],
            ...session ? ["context.sessionCode", "context.assigningTeacherId", "testMeta.testId"] : []
          ];
          const sourceAuth = grade || session ? `Bearer ${await token(env, fetcher, request.headers.get("CF-Ray"))}` : auth;
          const sourceResponse = await fetcher(documentUrl("writing_submissions", sourceId, sourceMask2), { headers: { Authorization: sourceAuth } });
          if (sourceResponse.status === 401 || sourceResponse.status === 403 || sourceResponse.status === 404) return json(request, 403, "source_denied");
          if (!sourceResponse.ok) throw Error("source_read");
          const sourceDocument = row2(await sourceResponse.json());
          if (productionWriting && !(typeof sourceDocument?.createTime === "string" && Date.parse(sourceDocument.createTime) > Date.parse(writingCutoff))) return json(request, 403, "source_invalid");
          const source = fields(sourceDocument?.fields);
          const context = row2(source.context);
          const published = row2(source.publishedGrading);
          const auditTrail = Array.isArray(source.auditTrail) ? source.auditTrail.map(row2).filter(Boolean) : [];
          if (source.id !== sourceId || typeof source.studentId !== "string" || !ID4.test(source.studentId))
            return json(request, 403, "source_invalid");
          if (!grade && !session && (source.studentId !== actor || source.submittedAt !== proof.occurredAt || context?.type !== "solo-practice")) return json(request, 403, "source_invalid");
          if (grade && (published?.teacherId !== actor || published.auditVersion !== proof.auditVersion || published.gradedAt !== proof.occurredAt || !auditTrail.some((audit) => audit?.version === proof.auditVersion && audit.gradedAt === proof.occurredAt && audit.teacherId === actor && ["published", "regraded"].includes(String(audit.action))))) return json(request, 403, "grade_invalid");
          if (session && (context?.type !== "live-session" || context.sessionCode !== proof.sessionCode || context.assigningTeacherId !== actor || source.sourceActorUid !== source.studentId && source.sourceActorUid !== actor || typeof source.submittedAt !== "number" || source.submittedAt > Number(proof.occurredAt))) return json(request, 403, "session_source_invalid");
          const teacher = input.kind === "writing-submitted-teacher" ? context?.selectedTeacherId : void 0;
          const classId = input.kind === "writing-submitted-teacher" ? context?.classId : void 0;
          if (input.kind === "writing-submitted-teacher" && (typeof teacher !== "string" || !ID4.test(teacher) || typeof classId !== "string" || !ID4.test(classId)))
            return json(request, 403, "audience_invalid");
          const accessToken = sourceAuth.startsWith("Bearer ") && (grade || session) ? sourceAuth.slice(7) : await token(env, fetcher, request.headers.get("CF-Ray"));
          const base = env.FIREBASE_DB_URL.replace(/\/$/u, "");
          const read = /* @__PURE__ */ __name(async (path) => {
            const response10 = await fetcher(`${base}/${path}.json`, { headers: { Authorization: `Bearer ${accessToken}` } });
            if (!response10.ok) throw Error("authority_read");
            return response10.json();
          }, "read");
          const readLimited = /* @__PURE__ */ __name(async (paths) => {
            const values = [];
            for (let index = 0; index < paths.length; index += 3) {
              values.push(...await Promise.all(paths.slice(index, index + 3).map(read)));
            }
            return values;
          }, "readLimited");
          const resultPath = `test_results/${encodeURIComponent(sourceId)}`;
          const indexPath = `test_results_by_student/${encodeURIComponent(source.studentId)}/${encodeURIComponent(sourceId)}`;
          const projectionPaths = [
            `${resultPath}/resultId`,
            `${resultPath}/studentId`,
            `${resultPath}/submittedAt`,
            `${resultPath}/testSkill`,
            `${resultPath}/writingData/submissionId`,
            `${indexPath}/resultId`,
            `${indexPath}/studentId`,
            `${indexPath}/submittedAt`
          ];
          if (grade) projectionPaths.push(
            `${resultPath}/writingData/teacherId`,
            `${resultPath}/writingData/gradedAt`,
            `${indexPath}/writingData/teacherId`,
            `${indexPath}/writingData/gradedAt`
          );
          const projection = await readLimited(projectionPaths);
          const [resultId, studentId, submittedAt, skill, writingId, indexedResultId, indexedStudentId, indexedSubmittedAt] = projection;
          if (resultId !== sourceId || indexedResultId !== sourceId || studentId !== source.studentId || indexedStudentId !== source.studentId || submittedAt !== source.submittedAt || indexedSubmittedAt !== source.submittedAt || skill !== "writing" || writingId !== sourceId)
            return json(request, 403, "result_invalid");
          if (grade && (projection[8] !== actor || projection[9] !== proof.occurredAt || projection[10] !== actor || projection[11] !== proof.occurredAt)) return json(request, 403, "grade_projection_invalid");
          if (session) {
            const encodedSession = encodeURIComponent(String(proof.sessionCode));
            const encodedStudent = encodeURIComponent(source.studentId);
            const sessionPaths = [
              `game_sessions/${encodedSession}/status`,
              `game_sessions/${encodedSession}/createdByUserId`,
              `game_sessions/${encodedSession}/createdBy`,
              `game_sessions/${encodedSession}/lastTestCompletedAt`,
              `game_sessions/${encodedSession}/lastTestId`,
              `game_sessions/${encodedSession}/players/${encodedStudent}/lastTestSessionCode`,
              `game_sessions/${encodedSession}/players/${encodedStudent}/lastTestId`,
              `game_sessions/${encodedSession}/players/${encodedStudent}/lastTestEndedAt`,
              `game_sessions/${encodedSession}/players/${encodedStudent}/latestResultId`,
              `game_sessions/${encodedSession}/students/${encodedStudent}/writing/submitted`,
              `game_sessions/${encodedSession}/students/${encodedStudent}/writing/resultId`,
              `users/${encodeURIComponent(actor)}/role`
            ];
            const [
              status,
              ownerUser,
              owner,
              endedAt,
              endedTest,
              playerSession,
              playerTest,
              playerEndedAt,
              latestResultId,
              writingSubmitted,
              writingResultId,
              actorRole
            ] = await readLimited(sessionPaths);
            if (status !== "waiting" || (ownerUser || owner) !== actor || endedAt !== proof.occurredAt || endedTest !== row2(source.testMeta)?.testId || playerSession !== proof.sessionCode || playerTest !== endedTest || playerEndedAt !== proof.occurredAt || latestResultId !== sourceId || writingSubmitted !== true || writingResultId !== sourceId || actorRole !== "teacher")
              return json(request, 403, "session_occurrence_invalid");
          }
          if (typeof teacher === "string" && typeof classId === "string") {
            const [owner, status, member] = await Promise.all([
              read(`classes/${encodeURIComponent(classId)}/createdBy`),
              read(`classes/${encodeURIComponent(classId)}/status`),
              read(`classes/${encodeURIComponent(classId)}/students/${encodeURIComponent(actor)}/status`)
            ]);
            if (owner !== teacher || status !== "active" || member !== "active")
              return json(request, 403, "audience_denied");
          }
          const recipient = typeof teacher === "string" ? teacher : source.studentId;
          const inboxUrl = `${env.FIREBASE_DB_URL.replace(/\/$/u, "")}/notifications/${encodeURIComponent(recipient)}/${encodeURIComponent(eventId)}.json`;
          const notice = input.kind === "writing-submitted-teacher" ? {
            id: eventId,
            type: "info",
            title: "New writing submission",
            message: "A student submitted writing for review.",
            link: buildRoute("TEACHER_STUDENT_HISTORY", { studentId: source.studentId }),
            read: false,
            createdAt: proof.occurredAt
          } : grade ? {
            id: eventId,
            type: "success",
            title: "Writing graded",
            message: "Your teacher graded your writing submission. Open your Academic Record to view it.",
            link: buildRoute("STUDENT_ACADEMIC_RECORD"),
            read: false,
            createdAt: proof.occurredAt
          } : session ? {
            id: eventId,
            type: "info",
            title: "Writing session ended",
            message: "Your teacher ended the Writing session. Your saved essay is ready for review.",
            link: buildRoute("STUDENT_ACADEMIC_RECORD"),
            read: false,
            createdAt: proof.occurredAt
          } : {
            id: eventId,
            type: "success",
            title: "Writing submitted",
            message: "Your writing submission has been received for review.",
            link: buildRoute("STUDENT_ACADEMIC_RECORD"),
            read: false,
            createdAt: proof.occurredAt
          };
          const write = await fetcher(inboxUrl, {
            method: "PUT",
            headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", "If-Match": "null_etag" },
            body: JSON.stringify(notice)
          });
          if (write.ok) return json(request, 200, "created");
          if (write.status !== 412) throw Error("inbox_write");
          const prior = await fetcher(inboxUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
          if (!prior.ok) throw Error("inbox_read");
          const saved = row2(await prior.json());
          const expectedKeys = ["id", "type", "title", "message", "link", "read", "createdAt"];
          if (!saved || !expectedKeys.every((key) => Object.hasOwn(saved, key)) || typeof saved.read !== "boolean")
            return json(request, 503, "delivery_unknown");
          const replayed = Object.keys(saved).every((key) => expectedKeys.includes(key)) && saved.id === notice.id && saved.type === notice.type && saved.title === notice.title && saved.message === notice.message && saved.link === notice.link && saved.createdAt === notice.createdAt;
          return json(request, replayed ? 200 : 409, replayed ? "replayed" : "conflict");
        } catch {
          return json(request, 503, "delivery_unknown");
        }
      }
    }), "createNotificationFirestoreBridge");
    notification_firestore_bridge_default = createNotificationFirestoreBridge();
  }
});

// notification-command-qualified.js
init_notification_firestore_bridge();
var __defProp2 = Object.defineProperty;
var __name2 = /* @__PURE__ */ __name((target, value) => __defProp2(target, "name", { value, configurable: true }), "__name");
var encoder2 = new TextEncoder();
var decoder2 = new TextDecoder();
var MAX_INT322 = 2 ** 32;
function concat2(...buffers) {
  const size = buffers.reduce((acc, { length }) => acc + length, 0);
  const buf = new Uint8Array(size);
  let i = 0;
  for (const buffer of buffers) {
    buf.set(buffer, i);
    i += buffer.length;
  }
  return buf;
}
__name(concat2, "concat");
__name2(concat2, "concat");
function encode4(string) {
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
__name(encode4, "encode");
__name2(encode4, "encode");
function encodeBase642(input) {
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
__name(encodeBase642, "encodeBase64");
__name2(encodeBase642, "encodeBase64");
function decodeBase642(encoded) {
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
__name(decodeBase642, "decodeBase64");
__name2(decodeBase642, "decodeBase64");
function decode2(input) {
  if (Uint8Array.fromBase64) {
    return Uint8Array.fromBase64(typeof input === "string" ? input : decoder2.decode(input), {
      alphabet: "base64url"
    });
  }
  let encoded = input;
  if (encoded instanceof Uint8Array) {
    encoded = decoder2.decode(encoded);
  }
  encoded = encoded.replace(/-/g, "+").replace(/_/g, "/");
  try {
    return decodeBase642(encoded);
  } catch {
    throw new TypeError("The input to be decoded is not correctly encoded.");
  }
}
__name(decode2, "decode");
__name2(decode2, "decode");
function encode22(input) {
  let unencoded = input;
  if (typeof unencoded === "string") {
    unencoded = encoder2.encode(unencoded);
  }
  if (Uint8Array.prototype.toBase64) {
    return unencoded.toBase64({ alphabet: "base64url", omitPadding: true });
  }
  return encodeBase642(unencoded).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
__name(encode22, "encode2");
__name2(encode22, "encode");
var unusable2 = /* @__PURE__ */ __name2((name, prop = "algorithm.name") => new TypeError(`CryptoKey does not support this operation, its ${prop} must be ${name}`), "unusable");
var isAlgorithm2 = /* @__PURE__ */ __name2((algorithm, name) => algorithm.name === name, "isAlgorithm");
function getHashLength2(hash) {
  return parseInt(hash.name.slice(4), 10);
}
__name(getHashLength2, "getHashLength");
__name2(getHashLength2, "getHashLength");
function checkHashLength2(algorithm, expected) {
  const actual = getHashLength2(algorithm.hash);
  if (actual !== expected)
    throw unusable2(`SHA-${expected}`, "algorithm.hash");
}
__name(checkHashLength2, "checkHashLength");
__name2(checkHashLength2, "checkHashLength");
function getNamedCurve2(alg) {
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
__name(getNamedCurve2, "getNamedCurve");
__name2(getNamedCurve2, "getNamedCurve");
function checkUsage2(key, usage) {
  if (usage && !key.usages.includes(usage)) {
    throw new TypeError(`CryptoKey does not support this operation, its usages must include ${usage}.`);
  }
}
__name(checkUsage2, "checkUsage");
__name2(checkUsage2, "checkUsage");
function checkSigCryptoKey2(key, alg, usage) {
  switch (alg) {
    case "HS256":
    case "HS384":
    case "HS512": {
      if (!isAlgorithm2(key.algorithm, "HMAC"))
        throw unusable2("HMAC");
      checkHashLength2(key.algorithm, parseInt(alg.slice(2), 10));
      break;
    }
    case "RS256":
    case "RS384":
    case "RS512": {
      if (!isAlgorithm2(key.algorithm, "RSASSA-PKCS1-v1_5"))
        throw unusable2("RSASSA-PKCS1-v1_5");
      checkHashLength2(key.algorithm, parseInt(alg.slice(2), 10));
      break;
    }
    case "PS256":
    case "PS384":
    case "PS512": {
      if (!isAlgorithm2(key.algorithm, "RSA-PSS"))
        throw unusable2("RSA-PSS");
      checkHashLength2(key.algorithm, parseInt(alg.slice(2), 10));
      break;
    }
    case "Ed25519":
    case "EdDSA": {
      if (!isAlgorithm2(key.algorithm, "Ed25519"))
        throw unusable2("Ed25519");
      break;
    }
    case "ML-DSA-44":
    case "ML-DSA-65":
    case "ML-DSA-87": {
      if (!isAlgorithm2(key.algorithm, alg))
        throw unusable2(alg);
      break;
    }
    case "ES256":
    case "ES384":
    case "ES512": {
      if (!isAlgorithm2(key.algorithm, "ECDSA"))
        throw unusable2("ECDSA");
      const expected = getNamedCurve2(alg);
      const actual = key.algorithm.namedCurve;
      if (actual !== expected)
        throw unusable2(expected, "algorithm.namedCurve");
      break;
    }
    default:
      throw new TypeError("CryptoKey does not support this operation");
  }
  checkUsage2(key, usage);
}
__name(checkSigCryptoKey2, "checkSigCryptoKey");
__name2(checkSigCryptoKey2, "checkSigCryptoKey");
function message2(msg, actual, ...types) {
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
__name(message2, "message");
__name2(message2, "message");
var invalidKeyInput2 = /* @__PURE__ */ __name2((actual, ...types) => message2("Key must be ", actual, ...types), "invalidKeyInput");
var withAlg2 = /* @__PURE__ */ __name2((alg, actual, ...types) => message2(`Key for the ${alg} algorithm must be `, actual, ...types), "withAlg");
var JOSEError2 = class extends Error {
  static {
    __name(this, "JOSEError");
  }
  static {
    __name2(this, "JOSEError");
  }
  static code = "ERR_JOSE_GENERIC";
  code = "ERR_JOSE_GENERIC";
  constructor(message22, options) {
    super(message22, options);
    this.name = this.constructor.name;
    Error.captureStackTrace?.(this, this.constructor);
  }
};
var JWTClaimValidationFailed2 = class extends JOSEError2 {
  static {
    __name(this, "JWTClaimValidationFailed");
  }
  static {
    __name2(this, "JWTClaimValidationFailed");
  }
  static code = "ERR_JWT_CLAIM_VALIDATION_FAILED";
  code = "ERR_JWT_CLAIM_VALIDATION_FAILED";
  claim;
  reason;
  payload;
  constructor(message22, payload, claim2 = "unspecified", reason = "unspecified") {
    super(message22, { cause: { claim: claim2, reason, payload } });
    this.claim = claim2;
    this.reason = reason;
    this.payload = payload;
  }
};
var JWTExpired2 = class extends JOSEError2 {
  static {
    __name(this, "JWTExpired");
  }
  static {
    __name2(this, "JWTExpired");
  }
  static code = "ERR_JWT_EXPIRED";
  code = "ERR_JWT_EXPIRED";
  claim;
  reason;
  payload;
  constructor(message22, payload, claim2 = "unspecified", reason = "unspecified") {
    super(message22, { cause: { claim: claim2, reason, payload } });
    this.claim = claim2;
    this.reason = reason;
    this.payload = payload;
  }
};
var JOSEAlgNotAllowed2 = class extends JOSEError2 {
  static {
    __name(this, "JOSEAlgNotAllowed");
  }
  static {
    __name2(this, "JOSEAlgNotAllowed");
  }
  static code = "ERR_JOSE_ALG_NOT_ALLOWED";
  code = "ERR_JOSE_ALG_NOT_ALLOWED";
};
var JOSENotSupported2 = class extends JOSEError2 {
  static {
    __name(this, "JOSENotSupported");
  }
  static {
    __name2(this, "JOSENotSupported");
  }
  static code = "ERR_JOSE_NOT_SUPPORTED";
  code = "ERR_JOSE_NOT_SUPPORTED";
};
var JWSInvalid2 = class extends JOSEError2 {
  static {
    __name(this, "JWSInvalid");
  }
  static {
    __name2(this, "JWSInvalid");
  }
  static code = "ERR_JWS_INVALID";
  code = "ERR_JWS_INVALID";
};
var JWTInvalid2 = class extends JOSEError2 {
  static {
    __name(this, "JWTInvalid");
  }
  static {
    __name2(this, "JWTInvalid");
  }
  static code = "ERR_JWT_INVALID";
  code = "ERR_JWT_INVALID";
};
var JWKSInvalid2 = class extends JOSEError2 {
  static {
    __name(this, "JWKSInvalid");
  }
  static {
    __name2(this, "JWKSInvalid");
  }
  static code = "ERR_JWKS_INVALID";
  code = "ERR_JWKS_INVALID";
};
var JWKSNoMatchingKey2 = class extends JOSEError2 {
  static {
    __name(this, "JWKSNoMatchingKey");
  }
  static {
    __name2(this, "JWKSNoMatchingKey");
  }
  static code = "ERR_JWKS_NO_MATCHING_KEY";
  code = "ERR_JWKS_NO_MATCHING_KEY";
  constructor(message22 = "no applicable key found in the JSON Web Key Set", options) {
    super(message22, options);
  }
};
var JWKSMultipleMatchingKeys2 = class extends JOSEError2 {
  static {
    __name(this, "JWKSMultipleMatchingKeys");
  }
  static {
    __name2(this, "JWKSMultipleMatchingKeys");
  }
  [Symbol.asyncIterator];
  static code = "ERR_JWKS_MULTIPLE_MATCHING_KEYS";
  code = "ERR_JWKS_MULTIPLE_MATCHING_KEYS";
  constructor(message22 = "multiple matching keys found in the JSON Web Key Set", options) {
    super(message22, options);
  }
};
var JWKSTimeout2 = class extends JOSEError2 {
  static {
    __name(this, "JWKSTimeout");
  }
  static {
    __name2(this, "JWKSTimeout");
  }
  static code = "ERR_JWKS_TIMEOUT";
  code = "ERR_JWKS_TIMEOUT";
  constructor(message22 = "request timed out", options) {
    super(message22, options);
  }
};
var JWSSignatureVerificationFailed2 = class extends JOSEError2 {
  static {
    __name(this, "JWSSignatureVerificationFailed");
  }
  static {
    __name2(this, "JWSSignatureVerificationFailed");
  }
  static code = "ERR_JWS_SIGNATURE_VERIFICATION_FAILED";
  code = "ERR_JWS_SIGNATURE_VERIFICATION_FAILED";
  constructor(message22 = "signature verification failed", options) {
    super(message22, options);
  }
};
var isCryptoKey2 = /* @__PURE__ */ __name2((key) => {
  if (key?.[Symbol.toStringTag] === "CryptoKey")
    return true;
  try {
    return key instanceof CryptoKey;
  } catch {
    return false;
  }
}, "isCryptoKey");
var isKeyObject2 = /* @__PURE__ */ __name2((key) => key?.[Symbol.toStringTag] === "KeyObject", "isKeyObject");
var isKeyLike2 = /* @__PURE__ */ __name2((key) => isCryptoKey2(key) || isKeyObject2(key), "isKeyLike");
function assertNotSet2(value, name) {
  if (value) {
    throw new TypeError(`${name} can only be called once`);
  }
}
__name(assertNotSet2, "assertNotSet");
__name2(assertNotSet2, "assertNotSet");
function decodeBase64url2(value, label, ErrorClass) {
  try {
    return decode2(value);
  } catch {
    throw new ErrorClass(`Failed to base64url decode the ${label}`);
  }
}
__name(decodeBase64url2, "decodeBase64url");
__name2(decodeBase64url2, "decodeBase64url");
var isObjectLike2 = /* @__PURE__ */ __name2((value) => typeof value === "object" && value !== null, "isObjectLike");
function isObject2(input) {
  if (!isObjectLike2(input) || Object.prototype.toString.call(input) !== "[object Object]") {
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
__name(isObject2, "isObject");
__name2(isObject2, "isObject");
function isDisjoint2(...headers2) {
  const sources = headers2.filter(Boolean);
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
__name(isDisjoint2, "isDisjoint");
__name2(isDisjoint2, "isDisjoint");
var isJWK2 = /* @__PURE__ */ __name2((key) => isObject2(key) && typeof key.kty === "string", "isJWK");
var isPrivateJWK2 = /* @__PURE__ */ __name2((key) => key.kty !== "oct" && (key.kty === "AKP" && typeof key.priv === "string" || typeof key.d === "string"), "isPrivateJWK");
var isPublicJWK2 = /* @__PURE__ */ __name2((key) => key.kty !== "oct" && key.d === void 0 && key.priv === void 0, "isPublicJWK");
var isSecretJWK2 = /* @__PURE__ */ __name2((key) => key.kty === "oct" && typeof key.k === "string", "isSecretJWK");
function checkKeyLength2(alg, key) {
  if (alg.startsWith("RS") || alg.startsWith("PS")) {
    const { modulusLength } = key.algorithm;
    if (typeof modulusLength !== "number" || modulusLength < 2048) {
      throw new TypeError(`${alg} requires key modulusLength to be 2048 bits or larger`);
    }
  }
}
__name(checkKeyLength2, "checkKeyLength");
__name2(checkKeyLength2, "checkKeyLength");
function subtleAlgorithm2(alg, algorithm) {
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
      throw new JOSENotSupported2(`alg ${alg} is not supported either by JOSE or your javascript runtime`);
  }
}
__name(subtleAlgorithm2, "subtleAlgorithm");
__name2(subtleAlgorithm2, "subtleAlgorithm");
async function getSigKey2(alg, key, usage) {
  if (key instanceof Uint8Array) {
    if (!alg.startsWith("HS")) {
      throw new TypeError(invalidKeyInput2(key, "CryptoKey", "KeyObject", "JSON Web Key"));
    }
    return crypto.subtle.importKey("raw", key, { hash: `SHA-${alg.slice(-3)}`, name: "HMAC" }, false, [usage]);
  }
  checkSigCryptoKey2(key, alg, usage);
  return key;
}
__name(getSigKey2, "getSigKey");
__name2(getSigKey2, "getSigKey");
async function sign2(alg, key, data) {
  const cryptoKey = await getSigKey2(alg, key, "sign");
  checkKeyLength2(alg, cryptoKey);
  const signature = await crypto.subtle.sign(subtleAlgorithm2(alg, cryptoKey.algorithm), cryptoKey, data);
  return new Uint8Array(signature);
}
__name(sign2, "sign");
__name2(sign2, "sign");
async function verify2(alg, key, signature, data) {
  const cryptoKey = await getSigKey2(alg, key, "verify");
  checkKeyLength2(alg, cryptoKey);
  const algorithm = subtleAlgorithm2(alg, cryptoKey.algorithm);
  try {
    return await crypto.subtle.verify(algorithm, cryptoKey, signature, data);
  } catch {
    return false;
  }
}
__name(verify2, "verify");
__name2(verify2, "verify");
var unsupportedAlg2 = 'Invalid or unsupported JWK "alg" (Algorithm) Parameter value';
function subtleMapping2(jwk) {
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
          throw new JOSENotSupported2(unsupportedAlg2);
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
          throw new JOSENotSupported2(unsupportedAlg2);
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
          throw new JOSENotSupported2(unsupportedAlg2);
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
          throw new JOSENotSupported2(unsupportedAlg2);
      }
      break;
    }
    default:
      throw new JOSENotSupported2('Invalid or unsupported JWK "kty" (Key Type) Parameter value');
  }
  return { algorithm, keyUsages };
}
__name(subtleMapping2, "subtleMapping");
__name2(subtleMapping2, "subtleMapping");
async function jwkToKey2(jwk) {
  if (!jwk.alg) {
    throw new TypeError('"alg" argument is required when "jwk.alg" is not present');
  }
  const { algorithm, keyUsages } = subtleMapping2(jwk);
  const keyData = { ...jwk };
  if (keyData.kty !== "AKP") {
    delete keyData.alg;
  }
  delete keyData.use;
  return crypto.subtle.importKey("jwk", keyData, algorithm, jwk.ext ?? (jwk.d || jwk.priv ? false : true), jwk.key_ops ?? keyUsages);
}
__name(jwkToKey2, "jwkToKey");
__name2(jwkToKey2, "jwkToKey");
var unusableForAlg2 = "given KeyObject instance cannot be used for this algorithm";
var cache2;
var handleJWK2 = /* @__PURE__ */ __name2(async (key, jwk, alg, freeze = false) => {
  cache2 ||= /* @__PURE__ */ new WeakMap();
  let cached = cache2.get(key);
  if (cached?.[alg]) {
    return cached[alg];
  }
  const cryptoKey = await jwkToKey2({ ...jwk, alg });
  if (freeze)
    Object.freeze(key);
  if (!cached) {
    cache2.set(key, { [alg]: cryptoKey });
  } else {
    cached[alg] = cryptoKey;
  }
  return cryptoKey;
}, "handleJWK");
var handleKeyObject2 = /* @__PURE__ */ __name2((keyObject, alg) => {
  cache2 ||= /* @__PURE__ */ new WeakMap();
  let cached = cache2.get(keyObject);
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
        throw new TypeError(unusableForAlg2);
    }
    cryptoKey = keyObject.toCryptoKey(keyObject.asymmetricKeyType, extractable, isPublic ? [] : ["deriveBits"]);
  }
  if (keyObject.asymmetricKeyType === "ed25519") {
    if (alg !== "EdDSA" && alg !== "Ed25519") {
      throw new TypeError(unusableForAlg2);
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
        throw new TypeError(unusableForAlg2);
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
        throw new TypeError(unusableForAlg2);
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
      throw new TypeError(unusableForAlg2);
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
    throw new TypeError(unusableForAlg2);
  }
  if (!cached) {
    cache2.set(keyObject, { [alg]: cryptoKey });
  } else {
    cached[alg] = cryptoKey;
  }
  return cryptoKey;
}, "handleKeyObject");
async function normalizeKey2(key, alg) {
  if (key instanceof Uint8Array) {
    return key;
  }
  if (isCryptoKey2(key)) {
    return key;
  }
  if (isKeyObject2(key)) {
    if (key.type === "secret") {
      return key.export();
    }
    if ("toCryptoKey" in key && typeof key.toCryptoKey === "function") {
      try {
        return handleKeyObject2(key, alg);
      } catch (err) {
        if (err instanceof TypeError) {
          throw err;
        }
      }
    }
    let jwk = key.export({ format: "jwk" });
    return handleJWK2(key, jwk, alg);
  }
  if (isJWK2(key)) {
    if (key.k) {
      return decode2(key.k);
    }
    return handleJWK2(key, key, alg, true);
  }
  throw new Error("unreachable");
}
__name(normalizeKey2, "normalizeKey");
__name2(normalizeKey2, "normalizeKey");
var bytesEqual2 = /* @__PURE__ */ __name2((a, b) => {
  if (a.byteLength !== b.length)
    return false;
  for (let i = 0; i < a.byteLength; i++) {
    if (a[i] !== b[i])
      return false;
  }
  return true;
}, "bytesEqual");
var createASN1State2 = /* @__PURE__ */ __name2((data) => ({ data, pos: 0 }), "createASN1State");
var parseLength2 = /* @__PURE__ */ __name2((state) => {
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
var expectTag2 = /* @__PURE__ */ __name2((state, expectedTag, errorMessage) => {
  if (state.data[state.pos++] !== expectedTag) {
    throw new Error(errorMessage);
  }
}, "expectTag");
var getSubarray2 = /* @__PURE__ */ __name2((state, length) => {
  const result = state.data.subarray(state.pos, state.pos + length);
  state.pos += length;
  return result;
}, "getSubarray");
var parseAlgorithmOID2 = /* @__PURE__ */ __name2((state) => {
  expectTag2(state, 6, "Expected algorithm OID");
  const oidLen = parseLength2(state);
  return getSubarray2(state, oidLen);
}, "parseAlgorithmOID");
function parsePKCS8Header2(state) {
  expectTag2(state, 48, "Invalid PKCS#8 structure");
  parseLength2(state);
  expectTag2(state, 2, "Expected version field");
  const verLen = parseLength2(state);
  state.pos += verLen;
  expectTag2(state, 48, "Expected algorithm identifier");
  const algIdLen = parseLength2(state);
  const algIdStart = state.pos;
  return { algIdStart, algIdLength: algIdLen };
}
__name(parsePKCS8Header2, "parsePKCS8Header");
__name2(parsePKCS8Header2, "parsePKCS8Header");
var parseECAlgorithmIdentifier2 = /* @__PURE__ */ __name2((state) => {
  const algOid = parseAlgorithmOID2(state);
  if (bytesEqual2(algOid, [43, 101, 110])) {
    return "X25519";
  }
  if (!bytesEqual2(algOid, [42, 134, 72, 206, 61, 2, 1])) {
    throw new Error("Unsupported key algorithm");
  }
  expectTag2(state, 6, "Expected curve OID");
  const curveOidLen = parseLength2(state);
  const curveOid = getSubarray2(state, curveOidLen);
  for (const { name, oid } of [
    { name: "P-256", oid: [42, 134, 72, 206, 61, 3, 1, 7] },
    { name: "P-384", oid: [43, 129, 4, 0, 34] },
    { name: "P-521", oid: [43, 129, 4, 0, 35] }
  ]) {
    if (bytesEqual2(curveOid, oid)) {
      return name;
    }
  }
  throw new Error("Unsupported named curve");
}, "parseECAlgorithmIdentifier");
var genericImport2 = /* @__PURE__ */ __name2(async (keyFormat, keyData, alg, options) => {
  let algorithm;
  let keyUsages;
  const isPublic = keyFormat === "spki";
  const getSigUsages = /* @__PURE__ */ __name2(() => isPublic ? ["verify"] : ["sign"], "getSigUsages");
  const getEncUsages = /* @__PURE__ */ __name2(() => isPublic ? ["encrypt", "wrapKey"] : ["decrypt", "unwrapKey"], "getEncUsages");
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
        throw new JOSENotSupported2("Invalid or unsupported key format");
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
      throw new JOSENotSupported2('Invalid or unsupported "alg" (Algorithm) value');
  }
  return crypto.subtle.importKey(keyFormat, keyData, algorithm, options?.extractable ?? (isPublic ? true : false), keyUsages);
}, "genericImport");
var processPEMData2 = /* @__PURE__ */ __name2((pem, pattern) => {
  return decodeBase642(pem.replace(pattern, ""));
}, "processPEMData");
var fromPKCS82 = /* @__PURE__ */ __name2((pem, alg, options) => {
  const keyData = processPEMData2(pem, /(?:-----(?:BEGIN|END) PRIVATE KEY-----|\s)/g);
  let opts = options;
  if (alg?.startsWith?.("ECDH-ES")) {
    opts ||= {};
    opts.getNamedCurve = (keyData2) => {
      const state = createASN1State2(keyData2);
      parsePKCS8Header2(state);
      return parseECAlgorithmIdentifier2(state);
    };
  }
  return genericImport2("pkcs8", keyData, alg, opts);
}, "fromPKCS8");
async function importPKCS82(pkcs8, alg, options) {
  if (typeof pkcs8 !== "string" || pkcs8.indexOf("-----BEGIN PRIVATE KEY-----") !== 0) {
    throw new TypeError('"pkcs8" must be PKCS#8 formatted string');
  }
  return fromPKCS82(pkcs8, alg, options);
}
__name(importPKCS82, "importPKCS8");
__name2(importPKCS82, "importPKCS8");
async function importJWK2(jwk, alg, options) {
  if (!isObject2(jwk)) {
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
      return decode2(jwk.k);
    case "RSA":
      if ("oth" in jwk && jwk.oth !== void 0) {
        throw new JOSENotSupported2('RSA JWK "oth" (Other Primes Info) Parameter value is not supported');
      }
      return jwkToKey2({ ...jwk, alg, ext });
    case "AKP": {
      if (typeof jwk.alg !== "string" || !jwk.alg) {
        throw new TypeError('missing "alg" (Algorithm) Parameter value');
      }
      if (alg !== void 0 && alg !== jwk.alg) {
        throw new TypeError("JWK alg and alg option value mismatch");
      }
      return jwkToKey2({ ...jwk, ext });
    }
    case "EC":
    case "OKP":
      return jwkToKey2({ ...jwk, alg, ext });
    default:
      throw new JOSENotSupported2('Unsupported "kty" (Key Type) Parameter value');
  }
}
__name(importJWK2, "importJWK");
__name2(importJWK2, "importJWK");
function validateCrit2(Err, recognizedDefault, recognizedOption, protectedHeader, joseHeader) {
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
      throw new JOSENotSupported2(`Extension Header Parameter "${parameter}" is not recognized`);
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
__name(validateCrit2, "validateCrit");
__name2(validateCrit2, "validateCrit");
function validateAlgorithms2(option, algorithms) {
  if (algorithms !== void 0 && (!Array.isArray(algorithms) || algorithms.some((s) => typeof s !== "string"))) {
    throw new TypeError(`"${option}" option must be an array of strings`);
  }
  if (!algorithms) {
    return void 0;
  }
  return new Set(algorithms);
}
__name(validateAlgorithms2, "validateAlgorithms");
__name2(validateAlgorithms2, "validateAlgorithms");
var tag2 = /* @__PURE__ */ __name2((key) => key?.[Symbol.toStringTag], "tag");
var jwkMatchesOp2 = /* @__PURE__ */ __name2((alg, key, usage) => {
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
var symmetricTypeCheck2 = /* @__PURE__ */ __name2((alg, key, usage) => {
  if (key instanceof Uint8Array)
    return;
  if (isJWK2(key)) {
    if (isSecretJWK2(key) && jwkMatchesOp2(alg, key, usage))
      return;
    throw new TypeError(`JSON Web Key for symmetric algorithms must have JWK "kty" (Key Type) equal to "oct" and the JWK "k" (Key Value) present`);
  }
  if (!isKeyLike2(key)) {
    throw new TypeError(withAlg2(alg, key, "CryptoKey", "KeyObject", "JSON Web Key", "Uint8Array"));
  }
  if (key.type !== "secret") {
    throw new TypeError(`${tag2(key)} instances for symmetric algorithms must be of type "secret"`);
  }
}, "symmetricTypeCheck");
var asymmetricTypeCheck2 = /* @__PURE__ */ __name2((alg, key, usage) => {
  if (isJWK2(key)) {
    switch (usage) {
      case "decrypt":
      case "sign":
        if (isPrivateJWK2(key) && jwkMatchesOp2(alg, key, usage))
          return;
        throw new TypeError(`JSON Web Key for this operation must be a private JWK`);
      case "encrypt":
      case "verify":
        if (isPublicJWK2(key) && jwkMatchesOp2(alg, key, usage))
          return;
        throw new TypeError(`JSON Web Key for this operation must be a public JWK`);
    }
  }
  if (!isKeyLike2(key)) {
    throw new TypeError(withAlg2(alg, key, "CryptoKey", "KeyObject", "JSON Web Key"));
  }
  if (key.type === "secret") {
    throw new TypeError(`${tag2(key)} instances for asymmetric algorithms must not be of type "secret"`);
  }
  if (key.type === "public") {
    switch (usage) {
      case "sign":
        throw new TypeError(`${tag2(key)} instances for asymmetric algorithm signing must be of type "private"`);
      case "decrypt":
        throw new TypeError(`${tag2(key)} instances for asymmetric algorithm decryption must be of type "private"`);
    }
  }
  if (key.type === "private") {
    switch (usage) {
      case "verify":
        throw new TypeError(`${tag2(key)} instances for asymmetric algorithm verifying must be of type "public"`);
      case "encrypt":
        throw new TypeError(`${tag2(key)} instances for asymmetric algorithm encryption must be of type "public"`);
    }
  }
}, "asymmetricTypeCheck");
function checkKeyType2(alg, key, usage) {
  switch (alg.substring(0, 2)) {
    case "A1":
    case "A2":
    case "di":
    case "HS":
    case "PB":
      symmetricTypeCheck2(alg, key, usage);
      break;
    default:
      asymmetricTypeCheck2(alg, key, usage);
  }
}
__name(checkKeyType2, "checkKeyType");
__name2(checkKeyType2, "checkKeyType");
async function flattenedVerify2(jws, key, options) {
  if (!isObject2(jws)) {
    throw new JWSInvalid2("Flattened JWS must be an object");
  }
  if (jws.protected === void 0 && jws.header === void 0) {
    throw new JWSInvalid2('Flattened JWS must have either of the "protected" or "header" members');
  }
  if (jws.protected !== void 0 && typeof jws.protected !== "string") {
    throw new JWSInvalid2("JWS Protected Header incorrect type");
  }
  if (jws.payload === void 0) {
    throw new JWSInvalid2("JWS Payload missing");
  }
  if (typeof jws.signature !== "string") {
    throw new JWSInvalid2("JWS Signature missing or incorrect type");
  }
  if (jws.header !== void 0 && !isObject2(jws.header)) {
    throw new JWSInvalid2("JWS Unprotected Header incorrect type");
  }
  let parsedProt = {};
  if (jws.protected) {
    try {
      const protectedHeader = decode2(jws.protected);
      parsedProt = JSON.parse(decoder2.decode(protectedHeader));
    } catch {
      throw new JWSInvalid2("JWS Protected Header is invalid");
    }
  }
  if (!isDisjoint2(parsedProt, jws.header)) {
    throw new JWSInvalid2("JWS Protected and JWS Unprotected Header Parameter names must be disjoint");
  }
  const joseHeader = {
    ...parsedProt,
    ...jws.header
  };
  const extensions = validateCrit2(JWSInvalid2, /* @__PURE__ */ new Map([["b64", true]]), options?.crit, parsedProt, joseHeader);
  let b64 = true;
  if (extensions.has("b64")) {
    b64 = parsedProt.b64;
    if (typeof b64 !== "boolean") {
      throw new JWSInvalid2('The "b64" (base64url-encode payload) Header Parameter must be a boolean');
    }
  }
  const { alg } = joseHeader;
  if (typeof alg !== "string" || !alg) {
    throw new JWSInvalid2('JWS "alg" (Algorithm) Header Parameter missing or invalid');
  }
  const algorithms = options && validateAlgorithms2("algorithms", options.algorithms);
  if (algorithms && !algorithms.has(alg)) {
    throw new JOSEAlgNotAllowed2('"alg" (Algorithm) Header Parameter value not allowed');
  }
  if (b64) {
    if (typeof jws.payload !== "string") {
      throw new JWSInvalid2("JWS Payload must be a string");
    }
  } else if (typeof jws.payload !== "string" && !(jws.payload instanceof Uint8Array)) {
    throw new JWSInvalid2("JWS Payload must be a string or an Uint8Array instance");
  }
  let resolvedKey = false;
  if (typeof key === "function") {
    key = await key(parsedProt, jws);
    resolvedKey = true;
  }
  checkKeyType2(alg, key, "verify");
  const data = concat2(jws.protected !== void 0 ? encode4(jws.protected) : new Uint8Array(), encode4("."), typeof jws.payload === "string" ? b64 ? encode4(jws.payload) : encoder2.encode(jws.payload) : jws.payload);
  const signature = decodeBase64url2(jws.signature, "signature", JWSInvalid2);
  const k = await normalizeKey2(key, alg);
  const verified = await verify2(alg, k, signature, data);
  if (!verified) {
    throw new JWSSignatureVerificationFailed2();
  }
  let payload;
  if (b64) {
    payload = decodeBase64url2(jws.payload, "payload", JWSInvalid2);
  } else if (typeof jws.payload === "string") {
    payload = encoder2.encode(jws.payload);
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
__name(flattenedVerify2, "flattenedVerify");
__name2(flattenedVerify2, "flattenedVerify");
async function compactVerify2(jws, key, options) {
  if (jws instanceof Uint8Array) {
    jws = decoder2.decode(jws);
  }
  if (typeof jws !== "string") {
    throw new JWSInvalid2("Compact JWS must be a string or Uint8Array");
  }
  const { 0: protectedHeader, 1: payload, 2: signature, length } = jws.split(".");
  if (length !== 3) {
    throw new JWSInvalid2("Invalid Compact JWS");
  }
  const verified = await flattenedVerify2({ payload, protected: protectedHeader, signature }, key, options);
  const result = { payload: verified.payload, protectedHeader: verified.protectedHeader };
  if (typeof key === "function") {
    return { ...result, key: verified.key };
  }
  return result;
}
__name(compactVerify2, "compactVerify");
__name2(compactVerify2, "compactVerify");
var epoch2 = /* @__PURE__ */ __name2((date) => Math.floor(date.getTime() / 1e3), "epoch");
var minute2 = 60;
var hour2 = minute2 * 60;
var day2 = hour2 * 24;
var week2 = day2 * 7;
var year2 = day2 * 365.25;
var REGEX2 = /^(\+|\-)? ?(\d+|\d+\.\d+) ?(seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|years?|yrs?|y)(?: (ago|from now))?$/i;
function secs2(str) {
  const matched = REGEX2.exec(str);
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
      numericDate = Math.round(value * minute2);
      break;
    case "hour":
    case "hours":
    case "hr":
    case "hrs":
    case "h":
      numericDate = Math.round(value * hour2);
      break;
    case "day":
    case "days":
    case "d":
      numericDate = Math.round(value * day2);
      break;
    case "week":
    case "weeks":
    case "w":
      numericDate = Math.round(value * week2);
      break;
    default:
      numericDate = Math.round(value * year2);
      break;
  }
  if (matched[1] === "-" || matched[4] === "ago") {
    return -numericDate;
  }
  return numericDate;
}
__name(secs2, "secs");
__name2(secs2, "secs");
function validateInput2(label, input) {
  if (!Number.isFinite(input)) {
    throw new TypeError(`Invalid ${label} input`);
  }
  return input;
}
__name(validateInput2, "validateInput");
__name2(validateInput2, "validateInput");
var normalizeTyp2 = /* @__PURE__ */ __name2((value) => {
  if (value.includes("/")) {
    return value.toLowerCase();
  }
  return `application/${value.toLowerCase()}`;
}, "normalizeTyp");
var checkAudiencePresence2 = /* @__PURE__ */ __name2((audPayload, audOption) => {
  if (typeof audPayload === "string") {
    return audOption.includes(audPayload);
  }
  if (Array.isArray(audPayload)) {
    return audOption.some(Set.prototype.has.bind(new Set(audPayload)));
  }
  return false;
}, "checkAudiencePresence");
function validateClaimsSet2(protectedHeader, encodedPayload, options = {}) {
  let payload;
  try {
    payload = JSON.parse(decoder2.decode(encodedPayload));
  } catch {
  }
  if (!isObject2(payload)) {
    throw new JWTInvalid2("JWT Claims Set must be a top-level JSON object");
  }
  const { typ } = options;
  if (typ && (typeof protectedHeader.typ !== "string" || normalizeTyp2(protectedHeader.typ) !== normalizeTyp2(typ))) {
    throw new JWTClaimValidationFailed2('unexpected "typ" JWT header value', payload, "typ", "check_failed");
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
  for (const claim2 of new Set(presenceCheck.reverse())) {
    if (!(claim2 in payload)) {
      throw new JWTClaimValidationFailed2(`missing required "${claim2}" claim`, payload, claim2, "missing");
    }
  }
  if (issuer && !(Array.isArray(issuer) ? issuer : [issuer]).includes(payload.iss)) {
    throw new JWTClaimValidationFailed2('unexpected "iss" claim value', payload, "iss", "check_failed");
  }
  if (subject && payload.sub !== subject) {
    throw new JWTClaimValidationFailed2('unexpected "sub" claim value', payload, "sub", "check_failed");
  }
  if (audience && !checkAudiencePresence2(payload.aud, typeof audience === "string" ? [audience] : audience)) {
    throw new JWTClaimValidationFailed2('unexpected "aud" claim value', payload, "aud", "check_failed");
  }
  let tolerance;
  switch (typeof options.clockTolerance) {
    case "string":
      tolerance = secs2(options.clockTolerance);
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
  const now = epoch2(currentDate || /* @__PURE__ */ new Date());
  if ((payload.iat !== void 0 || maxTokenAge) && typeof payload.iat !== "number") {
    throw new JWTClaimValidationFailed2('"iat" claim must be a number', payload, "iat", "invalid");
  }
  if (payload.nbf !== void 0) {
    if (typeof payload.nbf !== "number") {
      throw new JWTClaimValidationFailed2('"nbf" claim must be a number', payload, "nbf", "invalid");
    }
    if (payload.nbf > now + tolerance) {
      throw new JWTClaimValidationFailed2('"nbf" claim timestamp check failed', payload, "nbf", "check_failed");
    }
  }
  if (payload.exp !== void 0) {
    if (typeof payload.exp !== "number") {
      throw new JWTClaimValidationFailed2('"exp" claim must be a number', payload, "exp", "invalid");
    }
    if (payload.exp <= now - tolerance) {
      throw new JWTExpired2('"exp" claim timestamp check failed', payload, "exp", "check_failed");
    }
  }
  if (maxTokenAge) {
    const age = now - payload.iat;
    const max = typeof maxTokenAge === "number" ? maxTokenAge : secs2(maxTokenAge);
    if (age - tolerance > max) {
      throw new JWTExpired2('"iat" claim timestamp check failed (too far in the past)', payload, "iat", "check_failed");
    }
    if (age < 0 - tolerance) {
      throw new JWTClaimValidationFailed2('"iat" claim timestamp check failed (it should be in the past)', payload, "iat", "check_failed");
    }
  }
  return payload;
}
__name(validateClaimsSet2, "validateClaimsSet");
__name2(validateClaimsSet2, "validateClaimsSet");
var JWTClaimsBuilder2 = class {
  static {
    __name(this, "JWTClaimsBuilder");
  }
  static {
    __name2(this, "JWTClaimsBuilder");
  }
  #payload;
  constructor(payload) {
    if (!isObject2(payload)) {
      throw new TypeError("JWT Claims Set MUST be an object");
    }
    this.#payload = structuredClone(payload);
  }
  data() {
    return encoder2.encode(JSON.stringify(this.#payload));
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
      this.#payload.nbf = validateInput2("setNotBefore", value);
    } else if (value instanceof Date) {
      this.#payload.nbf = validateInput2("setNotBefore", epoch2(value));
    } else {
      this.#payload.nbf = epoch2(/* @__PURE__ */ new Date()) + secs2(value);
    }
  }
  set exp(value) {
    if (typeof value === "number") {
      this.#payload.exp = validateInput2("setExpirationTime", value);
    } else if (value instanceof Date) {
      this.#payload.exp = validateInput2("setExpirationTime", epoch2(value));
    } else {
      this.#payload.exp = epoch2(/* @__PURE__ */ new Date()) + secs2(value);
    }
  }
  set iat(value) {
    if (value === void 0) {
      this.#payload.iat = epoch2(/* @__PURE__ */ new Date());
    } else if (value instanceof Date) {
      this.#payload.iat = validateInput2("setIssuedAt", epoch2(value));
    } else if (typeof value === "string") {
      this.#payload.iat = validateInput2("setIssuedAt", epoch2(/* @__PURE__ */ new Date()) + secs2(value));
    } else {
      this.#payload.iat = validateInput2("setIssuedAt", value);
    }
  }
};
async function jwtVerify2(jwt, key, options) {
  const verified = await compactVerify2(jwt, key, options);
  if (verified.protectedHeader.crit?.includes("b64") && verified.protectedHeader.b64 === false) {
    throw new JWTInvalid2("JWTs MUST NOT use unencoded payload");
  }
  const payload = validateClaimsSet2(verified.protectedHeader, verified.payload, options);
  const result = { payload, protectedHeader: verified.protectedHeader };
  if (typeof key === "function") {
    return { ...result, key: verified.key };
  }
  return result;
}
__name(jwtVerify2, "jwtVerify");
__name2(jwtVerify2, "jwtVerify");
var FlattenedSign2 = class {
  static {
    __name(this, "FlattenedSign");
  }
  static {
    __name2(this, "FlattenedSign");
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
    assertNotSet2(this.#protectedHeader, "setProtectedHeader");
    this.#protectedHeader = protectedHeader;
    return this;
  }
  setUnprotectedHeader(unprotectedHeader) {
    assertNotSet2(this.#unprotectedHeader, "setUnprotectedHeader");
    this.#unprotectedHeader = unprotectedHeader;
    return this;
  }
  async sign(key, options) {
    if (!this.#protectedHeader && !this.#unprotectedHeader) {
      throw new JWSInvalid2("either setProtectedHeader or setUnprotectedHeader must be called before #sign()");
    }
    if (!isDisjoint2(this.#protectedHeader, this.#unprotectedHeader)) {
      throw new JWSInvalid2("JWS Protected and JWS Unprotected Header Parameter names must be disjoint");
    }
    const joseHeader = {
      ...this.#protectedHeader,
      ...this.#unprotectedHeader
    };
    const extensions = validateCrit2(JWSInvalid2, /* @__PURE__ */ new Map([["b64", true]]), options?.crit, this.#protectedHeader, joseHeader);
    let b64 = true;
    if (extensions.has("b64")) {
      b64 = this.#protectedHeader.b64;
      if (typeof b64 !== "boolean") {
        throw new JWSInvalid2('The "b64" (base64url-encode payload) Header Parameter must be a boolean');
      }
    }
    const { alg } = joseHeader;
    if (typeof alg !== "string" || !alg) {
      throw new JWSInvalid2('JWS "alg" (Algorithm) Header Parameter missing or invalid');
    }
    checkKeyType2(alg, key, "sign");
    let payloadS;
    let payloadB;
    if (b64) {
      payloadS = encode22(this.#payload);
      payloadB = encode4(payloadS);
    } else {
      payloadB = this.#payload;
      payloadS = "";
    }
    let protectedHeaderString;
    let protectedHeaderBytes;
    if (this.#protectedHeader) {
      protectedHeaderString = encode22(JSON.stringify(this.#protectedHeader));
      protectedHeaderBytes = encode4(protectedHeaderString);
    } else {
      protectedHeaderString = "";
      protectedHeaderBytes = new Uint8Array();
    }
    const data = concat2(protectedHeaderBytes, encode4("."), payloadB);
    const k = await normalizeKey2(key, alg);
    const signature = await sign2(alg, k, data);
    const jws = {
      signature: encode22(signature),
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
var CompactSign2 = class {
  static {
    __name(this, "CompactSign");
  }
  static {
    __name2(this, "CompactSign");
  }
  #flattened;
  constructor(payload) {
    this.#flattened = new FlattenedSign2(payload);
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
var SignJWT2 = class {
  static {
    __name(this, "SignJWT");
  }
  static {
    __name2(this, "SignJWT");
  }
  #protectedHeader;
  #jwt;
  constructor(payload = {}) {
    this.#jwt = new JWTClaimsBuilder2(payload);
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
    const sig = new CompactSign2(this.#jwt.data());
    sig.setProtectedHeader(this.#protectedHeader);
    if (Array.isArray(this.#protectedHeader?.crit) && this.#protectedHeader.crit.includes("b64") && this.#protectedHeader.b64 === false) {
      throw new JWTInvalid2("JWTs MUST NOT use unencoded payload");
    }
    return sig.sign(key, options);
  }
};
function getKtyFromAlg2(alg) {
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
      throw new JOSENotSupported2('Unsupported "alg" value for a JSON Web Key Set');
  }
}
__name(getKtyFromAlg2, "getKtyFromAlg");
__name2(getKtyFromAlg2, "getKtyFromAlg");
function isJWKSLike2(jwks) {
  return jwks && typeof jwks === "object" && Array.isArray(jwks.keys) && jwks.keys.every(isJWKLike2);
}
__name(isJWKSLike2, "isJWKSLike");
__name2(isJWKSLike2, "isJWKSLike");
function isJWKLike2(key) {
  return isObject2(key);
}
__name(isJWKLike2, "isJWKLike");
__name2(isJWKLike2, "isJWKLike");
var LocalJWKSet2 = class {
  static {
    __name(this, "LocalJWKSet");
  }
  static {
    __name2(this, "LocalJWKSet");
  }
  #jwks;
  #cached = /* @__PURE__ */ new WeakMap();
  constructor(jwks) {
    if (!isJWKSLike2(jwks)) {
      throw new JWKSInvalid2("JSON Web Key Set malformed");
    }
    this.#jwks = structuredClone(jwks);
  }
  jwks() {
    return this.#jwks;
  }
  async getKey(protectedHeader, token2) {
    const { alg, kid } = { ...protectedHeader, ...token2?.header };
    const kty = getKtyFromAlg2(alg);
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
      throw new JWKSNoMatchingKey2();
    }
    if (length !== 1) {
      const error = new JWKSMultipleMatchingKeys2();
      const _cached = this.#cached;
      error[Symbol.asyncIterator] = async function* () {
        for (const jwk2 of candidates) {
          try {
            yield await importWithAlgCache2(_cached, jwk2, alg);
          } catch {
          }
        }
      };
      throw error;
    }
    return importWithAlgCache2(this.#cached, jwk, alg);
  }
};
async function importWithAlgCache2(cache22, jwk, alg) {
  const cached = cache22.get(jwk) || cache22.set(jwk, {}).get(jwk);
  if (cached[alg] === void 0) {
    const key = await importJWK2({ ...jwk, ext: true }, alg);
    if (key instanceof Uint8Array || key.type !== "public") {
      throw new JWKSInvalid2("JSON Web Key Set members must be public keys");
    }
    cached[alg] = key;
  }
  return cached[alg];
}
__name(importWithAlgCache2, "importWithAlgCache");
__name2(importWithAlgCache2, "importWithAlgCache");
function createLocalJWKSet2(jwks) {
  const set = new LocalJWKSet2(jwks);
  const localJWKSet = /* @__PURE__ */ __name2(async (protectedHeader, token2) => set.getKey(protectedHeader, token2), "localJWKSet");
  Object.defineProperties(localJWKSet, {
    jwks: {
      value: /* @__PURE__ */ __name2(() => structuredClone(set.jwks()), "value"),
      enumerable: false,
      configurable: false,
      writable: false
    }
  });
  return localJWKSet;
}
__name(createLocalJWKSet2, "createLocalJWKSet");
__name2(createLocalJWKSet2, "createLocalJWKSet");
function isCloudflareWorkers2() {
  return typeof WebSocketPair !== "undefined" || typeof navigator !== "undefined" && true || typeof EdgeRuntime !== "undefined" && EdgeRuntime === "vercel";
}
__name(isCloudflareWorkers2, "isCloudflareWorkers");
__name2(isCloudflareWorkers2, "isCloudflareWorkers");
var USER_AGENT2;
if (typeof navigator === "undefined" || !"Cloudflare-Workers"?.startsWith?.("Mozilla/5.0 ")) {
  const NAME = "jose";
  const VERSION = "v6.2.3";
  USER_AGENT2 = `${NAME}/${VERSION}`;
}
var customFetch2 = /* @__PURE__ */ Symbol();
async function fetchJwks2(url, headers2, signal, fetchImpl = fetch) {
  const response10 = await fetchImpl(url, {
    method: "GET",
    signal,
    redirect: "manual",
    headers: headers2
  }).catch((err) => {
    if (err.name === "TimeoutError") {
      throw new JWKSTimeout2();
    }
    throw err;
  });
  if (response10.status !== 200) {
    throw new JOSEError2("Expected 200 OK from the JSON Web Key Set HTTP response");
  }
  try {
    return await response10.json();
  } catch {
    throw new JOSEError2("Failed to parse the JSON Web Key Set HTTP response as JSON");
  }
}
__name(fetchJwks2, "fetchJwks");
__name2(fetchJwks2, "fetchJwks");
var jwksCache2 = /* @__PURE__ */ Symbol();
function isFreshJwksCache2(input, cacheMaxAge) {
  if (typeof input !== "object" || input === null) {
    return false;
  }
  if (!("uat" in input) || typeof input.uat !== "number" || Date.now() - input.uat >= cacheMaxAge) {
    return false;
  }
  if (!("jwks" in input) || !isObject2(input.jwks) || !Array.isArray(input.jwks.keys) || !Array.prototype.every.call(input.jwks.keys, isObject2)) {
    return false;
  }
  return true;
}
__name(isFreshJwksCache2, "isFreshJwksCache");
__name2(isFreshJwksCache2, "isFreshJwksCache");
var RemoteJWKSet2 = class {
  static {
    __name(this, "RemoteJWKSet");
  }
  static {
    __name2(this, "RemoteJWKSet");
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
    if (USER_AGENT2 && !this.#headers.has("User-Agent")) {
      this.#headers.set("User-Agent", USER_AGENT2);
    }
    if (!this.#headers.has("accept")) {
      this.#headers.set("accept", "application/json");
      this.#headers.append("accept", "application/jwk-set+json");
    }
    this.#customFetch = options?.[customFetch2];
    if (options?.[jwksCache2] !== void 0) {
      this.#cache = options?.[jwksCache2];
      if (isFreshJwksCache2(options?.[jwksCache2], this.#cacheMaxAge)) {
        this.#jwksTimestamp = this.#cache.uat;
        this.#local = createLocalJWKSet2(this.#cache.jwks);
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
      if (err instanceof JWKSNoMatchingKey2) {
        if (this.coolingDown() === false) {
          await this.reload();
          return this.#local(protectedHeader, token2);
        }
      }
      throw err;
    }
  }
  async reload() {
    if (this.#pendingFetch && isCloudflareWorkers2()) {
      this.#pendingFetch = void 0;
    }
    this.#pendingFetch ||= fetchJwks2(this.#url.href, this.#headers, AbortSignal.timeout(this.#timeoutDuration), this.#customFetch).then((json3) => {
      this.#local = createLocalJWKSet2(json3);
      if (this.#cache) {
        this.#cache.uat = Date.now();
        this.#cache.jwks = json3;
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
function createRemoteJWKSet2(url, options) {
  const set = new RemoteJWKSet2(url, options);
  const remoteJWKSet = /* @__PURE__ */ __name2(async (protectedHeader, token2) => set.getKey(protectedHeader, token2), "remoteJWKSet");
  Object.defineProperties(remoteJWKSet, {
    coolingDown: {
      get: /* @__PURE__ */ __name2(() => set.coolingDown(), "get"),
      enumerable: true,
      configurable: false
    },
    fresh: {
      get: /* @__PURE__ */ __name2(() => set.fresh(), "get"),
      enumerable: true,
      configurable: false
    },
    reload: {
      value: /* @__PURE__ */ __name2(() => set.reload(), "value"),
      enumerable: true,
      configurable: false,
      writable: false
    },
    reloading: {
      get: /* @__PURE__ */ __name2(() => set.pendingFetch(), "get"),
      enumerable: true,
      configurable: false
    },
    jwks: {
      value: /* @__PURE__ */ __name2(() => set.jwks(), "value"),
      enumerable: true,
      configurable: false,
      writable: false
    }
  });
  return remoteJWKSet;
}
__name(createRemoteJWKSet2, "createRemoteJWKSet");
__name2(createRemoteJWKSet2, "createRemoteJWKSet");
var FIREBASE_JWKS_URL2 = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
var DEFAULT_JWKS2 = createRemoteJWKSet2(new URL(FIREBASE_JWKS_URL2));
function extractBearerToken2(authHeader) {
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
__name(extractBearerToken2, "extractBearerToken");
__name2(extractBearerToken2, "extractBearerToken");
function getFirebaseProjectId2(env) {
  return typeof env?.FIREBASE_PROJECT_ID === "string" ? env.FIREBASE_PROJECT_ID.trim() : "";
}
__name(getFirebaseProjectId2, "getFirebaseProjectId");
__name2(getFirebaseProjectId2, "getFirebaseProjectId");
async function verifyFirebaseJwt2(token2, env, jwtVerify22, jwks) {
  const projectId = getFirebaseProjectId2(env);
  if (!projectId) {
    return { valid: false, reason: "missing_project_id" };
  }
  try {
    const { payload } = await jwtVerify22(token2, jwks, {
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
__name(verifyFirebaseJwt2, "verifyFirebaseJwt");
__name2(verifyFirebaseJwt2, "verifyFirebaseJwt");
function createFirebaseVerifier2({
  verifyToken,
  jwtVerify: jwtVerify22 = jwtVerify2,
  jwks = DEFAULT_JWKS2
} = {}) {
  const tokenVerifier = verifyToken ?? ((token2, env) => verifyFirebaseJwt2(token2, env, jwtVerify22, jwks));
  return {
    verifyToken: tokenVerifier,
    async verifyAuthorizationHeader(authHeader, env) {
      const extracted = extractBearerToken2(authHeader);
      if (!extracted.valid) return extracted;
      return tokenVerifier(extracted.token, env);
    }
  };
}
__name(createFirebaseVerifier2, "createFirebaseVerifier");
__name2(createFirebaseVerifier2, "createFirebaseVerifier");
var OAUTH2_TOKEN_URL = "https://oauth2.googleapis.com/token";
var FIREBASE_SCOPES = [
  "https://www.googleapis.com/auth/firebase.database",
  "https://www.googleapis.com/auth/datastore",
  "https://www.googleapis.com/auth/userinfo.email"
].join(" ");
var REFRESH_BUFFER_MS = 5 * 60 * 1e3;
var TokenCache = class {
  static {
    __name(this, "TokenCache");
  }
  constructor(saKeyJson, fetchImpl) {
    this.saKeyJson = saKeyJson;
    this.fetchImpl = fetchImpl;
  }
  saKeyJson;
  fetchImpl;
  static {
    __name2(this, "TokenCache");
  }
  cachedToken = null;
  expiresAt = 0;
  async getToken() {
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
    const privateKey = await importPKCS82(serviceAccount.private_key, "RS256");
    const now = Math.floor(Date.now() / 1e3);
    const assertion = await new SignJWT2({
      iss: serviceAccount.client_email,
      sub: serviceAccount.client_email,
      aud: OAUTH2_TOKEN_URL,
      iat: now,
      exp: now + 3600,
      scope: FIREBASE_SCOPES
    }).setProtectedHeader({ alg: "RS256" }).sign(privateKey);
    const response10 = await this.fetchImpl.call(globalThis, OAUTH2_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${assertion}`
    });
    const body = await response10.text();
    if (!response10.ok) throw new Error(`google_oauth_failed:${response10.status}:${body}`);
    const token2 = JSON.parse(body);
    if (typeof token2.access_token !== "string" || token2.access_token === "") {
      throw new Error("google_oauth_failed:invalid_response");
    }
    this.cachedToken = token2.access_token;
    this.expiresAt = Date.now() + Math.max(0, (token2.expires_in || 3600) * 1e3);
    return this.cachedToken;
  }
};
var tokenCaches = /* @__PURE__ */ new Map();
var getTokenCache = /* @__PURE__ */ __name2((saKeyJson, fetchImpl) => {
  let cache22 = tokenCaches.get(saKeyJson);
  if (!cache22) {
    cache22 = new TokenCache(saKeyJson, fetchImpl);
    tokenCaches.set(saKeyJson, cache22);
  }
  return cache22;
}, "getTokenCache");
var parseJsonBody = /* @__PURE__ */ __name2((value) => {
  if (!value.trim()) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}, "parseJsonBody");
var encodeRtdbPath = /* @__PURE__ */ __name2((path) => path.split("/").filter(Boolean).map((part) => encodeURIComponent(part)).join("/"), "encodeRtdbPath");
var rtdbUrl = /* @__PURE__ */ __name2((env, path) => {
  const baseUrl = env.FIREBASE_DB_URL?.trim().replace(/\/$/u, "");
  if (!baseUrl) throw new Error("missing_firebase_db_url");
  const encodedPath = encodeRtdbPath(path);
  return encodedPath ? `${baseUrl}/${encodedPath}.json` : `${baseUrl}/.json`;
}, "rtdbUrl");
var withQuery = /* @__PURE__ */ __name2((url, query, authToken) => {
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
var PATCH_PATH = /^[A-Za-z0-9_-]{1,160}(?:\/[A-Za-z0-9_-]{1,160})*$/u;
var FirebaseRtdbRestClient = class {
  static {
    __name(this, "FirebaseRtdbRestClient");
  }
  constructor(options) {
    this.options = options;
  }
  options;
  static {
    __name2(this, "FirebaseRtdbRestClient");
  }
  async readValue(path, query) {
    if (this.options.env.readDatabaseValue) {
      return this.options.env.readDatabaseValue(path, query);
    }
    const auth = await this.requestAuth(path, query);
    const response10 = await this.options.fetchImpl.call(globalThis, auth.url, {
      method: "GET",
      headers: auth.headers
    });
    const body = parseJsonBody(await response10.text());
    if (!response10.ok) throw new Error(`firebase_rtdb_get_failed:${response10.status}`);
    return body;
  }
  async readWithEtag(path) {
    const auth = await this.requestAuth(path);
    const response10 = await this.options.fetchImpl.call(globalThis, auth.url, {
      method: "GET",
      headers: {
        ...auth.headers,
        "X-Firebase-ETag": "true"
      }
    });
    const body = parseJsonBody(await response10.text());
    if (!response10.ok) throw new Error(`firebase_rtdb_get_failed:${response10.status}`);
    const etag = response10.headers.get("etag");
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
    let response10;
    try {
      response10 = await this.options.fetchImpl.call(globalThis, auth.url, {
        method: "PATCH",
        headers: { ...auth.headers, "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    } catch {
      throw new Error("firebase_rtdb_multi_location_patch_transport_failed");
    }
    if (!response10.ok) throw new Error(`firebase_rtdb_multi_location_patch_failed:${response10.status}`);
  }
  async writeIfMatch(path, value, etag) {
    const auth = await this.requestAuth(path);
    const response10 = await this.options.fetchImpl.call(globalThis, auth.url, {
      method: "PUT",
      headers: {
        ...auth.headers,
        "Content-Type": "application/json",
        "if-match": etag
      },
      body: JSON.stringify(value)
    });
    if (response10.status === 412) return false;
    if (!response10.ok) {
      const body = (await response10.text()).slice(0, 240).replace(/[\r\n]+/gu, " ");
      throw new Error(`firebase_rtdb_put_failed:${response10.status}:${body}`);
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
    return getTokenCache(saKey, this.options.fetchImpl).getToken();
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
var MAX_RESPONSE_BYTES = 32 * 1024;
var MAX_BODY_BYTES = 16 * 1024;
var NotificationCommandSchemaError = class extends Error {
  static {
    __name(this, "NotificationCommandSchemaError");
  }
  constructor(code, status = 400) {
    super(code);
    this.code = code;
    this.status = status;
    this.name = "NotificationCommandSchemaError";
  }
  code;
  status;
  static {
    __name2(this, "NotificationCommandSchemaError");
  }
};
var MAX_RETRIES = 5;
var ID5 = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;
var clone = /* @__PURE__ */ __name2((value) => structuredClone(value), "clone");
var pathFor = /* @__PURE__ */ __name2((recipientId, operationId2) => `notifications/${recipientId}/${operationId2}`, "pathFor");
var canonical = /* @__PURE__ */ __name2((value) => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => [key, canonical(child)]));
  }
  return value;
}, "canonical");
var semantic = /* @__PURE__ */ __name2((value) => JSON.stringify(canonical({
  type: value.type,
  title: value.title,
  message: value.message,
  ...value.link === void 0 ? {} : { link: value.link },
  ...value.metadata === void 0 ? {} : { metadata: value.metadata }
})), "semantic");
var validStored = /* @__PURE__ */ __name2((value, operationId2) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value;
  const allowed = /* @__PURE__ */ new Set(["id", "type", "title", "message", "read", "createdAt", "link", "metadata"]);
  return Object.keys(value).every((key) => allowed.has(key)) && candidate.id === operationId2 && typeof candidate.type === "string" && typeof candidate.title === "string" && typeof candidate.message === "string" && typeof candidate.read === "boolean" && typeof candidate.createdAt === "number";
}, "validStored");
var FirebaseRestNotificationCommandRepository = class {
  static {
    __name(this, "FirebaseRestNotificationCommandRepository");
  }
  constructor(options) {
    this.options = options;
    const identity = options.env.NOTIFICATION_COMMAND_SERVICE_IDENTITY?.trim();
    if (!identity) throw new Error("missing_notification_command_service_identity");
    const keyJson = options.env.NOTIFICATION_COMMAND_GOOGLE_SA_KEY?.trim();
    if (!keyJson && !options.getAccessToken) {
      throw new Error("missing_notification_command_google_sa_key");
    }
    if (keyJson) {
      let clientEmail;
      try {
        clientEmail = JSON.parse(keyJson).client_email;
      } catch {
        throw new Error("invalid_notification_command_google_sa_key");
      }
      if (clientEmail !== identity) {
        throw new Error("notification_command_service_identity_mismatch");
      }
    }
    this.rtdb = new FirebaseRtdbRestClient({
      env: { ...options.env, GOOGLE_SA_KEY: keyJson },
      fetchImpl: options.fetchImpl ?? globalThis.fetch,
      getAccessToken: options.getAccessToken,
      firebaseAuthToken: Boolean(options.getAccessToken)
    });
  }
  options;
  static {
    __name2(this, "FirebaseRestNotificationCommandRepository");
  }
  rtdb;
  async create(input) {
    if (!ID5.test(input.recipientId)) throw new Error("invalid_notification_recipient");
    const path = pathFor(input.recipientId, input.operationId);
    const next = {
      id: input.operationId,
      ...clone(input.notification),
      read: false,
      createdAt: input.now
    };
    if (await this.rtdb.writeIfMatch(path, next, "null_etag")) {
      return { status: "created", notificationId: input.operationId };
    }
    for (let attempt = 0; attempt < (this.options.maxRetries ?? MAX_RETRIES); attempt += 1) {
      const current = await this.rtdb.readWithEtag(path);
      if (current.data !== null) {
        return {
          status: validStored(current.data, input.operationId) && semantic(current.data) === semantic(input.notification) ? "replayed" : "idempotency-conflict",
          notificationId: input.operationId
        };
      }
      if (await this.rtdb.writeIfMatch(path, next, current.etag)) {
        return { status: "created", notificationId: input.operationId };
      }
    }
    throw new Error("notification_command_cas_retries_exhausted");
  }
  async exists(recipientId, operationId2) {
    if (!ID5.test(recipientId)) throw new Error("invalid_notification_recipient");
    const current = await this.rtdb.readValue(pathFor(recipientId, operationId2));
    return validStored(current, operationId2);
  }
};
var ROUTES2 = {
  // Authentication
  LOGIN: "/",
  PROFILE: "/profile",
  // Teacher Routes
  TEACHER_LOBBY: "/teacher-lobby/:sessionCode",
  TEACHER_TEST_MONITOR: "/teacher-test/:sessionCode",
  TEACHER_TEST_RESULTS: "/teacher-test-results/:sessionCode",
  TEACHER_QUIZ: "/teacher-quiz/:gameSessionId",
  TEACHER_FEEDBACK: "/teacher-feedback/:gameSessionId",
  TEACHER_RESULTS: "/teacher-results/:gameSessionId",
  TEACHER_WAITING: "/teacher-wait/:gameSessionId",
  TEACHER_CLASSES: "/teacher/classes",
  TEACHER_CLASS_DETAIL: "/teacher/classes/:classId",
  TEACHER_COURSES: "/teacher/courses",
  TEACHER_COURSE_DETAIL: "/teacher/courses/:courseId",
  TEACHER_STUDENT_HISTORY: "/teacher/student/:studentId/history",
  // Student Routes
  STUDENT_DASHBOARD: "/student/dashboard",
  STUDENT_COURSES: "/student/courses",
  STUDENT_COURSE_DETAIL: "/student/courses/:courseId",
  STUDENT_COURSE_CATALOG: "/student/courses/catalog",
  STUDENT_CLASS_DETAIL: "/student/classes/:classId",
  STUDENT_WAITING: "/student-wait/:gameSessionId",
  STUDENT_TEST: "/student-test/:sessionCode",
  STUDENT_TEST_RESULTS: "/student-test-results/:sessionCode",
  SUBMISSION_COMPLETE: "/submission-complete",
  STUDENT_QUIZ: "/student-quiz/:gameSessionId",
  STUDENT_FEEDBACK: "/student-feedback/:gameSessionId",
  STUDENT_RESULTS: "/student-results/:gameSessionId",
  // Admin Routes (Super Admin Only)
  ADMIN_DASHBOARD: "/admin/dashboard",
  ADMIN_MATERIALS: "/admin/materials",
  ADMIN_SESSIONS: "/admin/sessions",
  ADMIN_USERS: "/admin/users",
  ADMIN_COURSES: "/admin/courses",
  ADMIN_CLASSES: "/admin/classes",
  ADMIN_SETTINGS: "/admin/settings",
  ADMIN_BACKUP: "/admin/backup",
  ADMIN_REPORTS: "/admin/reports",
  // Teacher Routes - Student Management
  TEACHER_STUDENTS: "/teacher/students",
  // Teacher Routes - Homework (PRD-0016)
  TEACHER_HOMEWORK: "/teacher/homework",
  TEACHER_HOMEWORK_CREATE: "/teacher/homework/create",
  TEACHER_HOMEWORK_DETAIL: "/teacher/homework/:homeworkId",
  TEACHER_HOMEWORK_EDIT: "/teacher/homework/:homeworkId/edit",
  TEACHER_HOMEWORK_STUDENT: "/teacher/homework/student/:studentId",
  // Teacher Routes - Test Creation (PRD-0020)
  TEACHER_TEST_CREATE: "/teacher/test/create",
  TEACHER_READING_V2_CREATE: "/teacher/reading-v2/create",
  TEACHER_READING_V2_IMPORT: "/teacher/reading-v2/import",
  TEACHER_READING_V2_DRAFT: "/teacher/reading-v2/drafts/:draftId",
  TEACHER_READING_V2_REVISE: "/teacher/reading-v2/materials/:materialId/revise",
  TEACHER_MATERIAL_BOOK: "/teacher/materials/books/:bookId",
  // Teacher Routes - Test Review (PRD-0022)
  TEACHER_TEST_REVIEW: "/teacher/test/review/:draftId",
  // Teacher Routes - THCS-THPT Test Editor (PRD-0027)
  TEACHER_THCS_CREATE: "/teacher/thcs-test/create",
  TEACHER_THCS_EDIT: "/teacher/thcs-test/edit/:draftId",
  // Teacher Routes - THCS Grading Tab (PRD-0028)
  TEACHER_GRADING: "/teacher/grading",
  // Teacher Routes - IELTS Writing (PRD-0030)
  TEACHER_WRITING_CREATE: "/teacher/writing-test/create",
  TEACHER_WRITING_EDIT: "/teacher/writing-test/edit/:draftId",
  TEACHER_GRADING_QUEUE: "/teacher/grading/writing",
  TEACHER_GRADING_DETAIL: "/teacher/grading/writing/:submissionId",
  SESSIONS: "/sessions",
  CREATE_TEST: "/create-test",
  // LOBBY route - used for "back to lobby" when no session is active
  LOBBY: "/lobby",
  // Student Routes - Homework & Library (PRD-0016)
  STUDENT_HOMEWORK: "/student/homework",
  STUDENT_HOMEWORK_DETAIL: "/student/homework/:homeworkId",
  STUDENT_LIBRARY: "/student/library",
  STUDENT_ACADEMIC_RECORD: "/student/academic-record",
  STUDENT_PRACTICE: "/student/practice/:materialId",
  BOOK_RUNTIME_SMOKE: "/__smoke/book-runtime",
  BOOK_HOMEWORK_COMPLETION_SMOKE: "/__smoke/book-homework-completion",
  BOOK_ACTIVITY_EVALUATION_SMOKE: "/__smoke/book-activity-evaluation",
  RESULT_DETAIL: "/result/:resultId",
  MATERIAL_UNAVAILABLE: "/material-unavailable/:materialId"
};
var buildRoute2 = /* @__PURE__ */ __name2((route, params) => {
  let path = ROUTES2[route];
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== void 0 && value !== null) {
        path = path.replace(`:${key}`, String(value));
      }
    });
  }
  return path;
}, "buildRoute");
var ID22 = /^[A-Za-z0-9_-]{1,128}$/u;
var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
var RETRY_DELAY_MS = 60 * 60 * 1e3;
var CLASS_INTENT_DONE_DUE_AT = 864e13;
var ACTIONS = ["join-pending", "direct-add", "approve", "reject"];
var record3 = /* @__PURE__ */ __name2((value) => value && typeof value === "object" && !Array.isArray(value) ? value : null, "record");
var text = /* @__PURE__ */ __name2((value, fallback) => typeof value === "string" && value.trim() ? value.trim().slice(0, 120) : fallback, "text");
var parseClassAction = /* @__PURE__ */ __name2(async (request) => {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    throw new Error("content_type_required");
  }
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 2048) throw new Error("class_action_body_too_large");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("class_action_invalid_json");
  }
  const value = record3(parsed);
  if (!value || Object.keys(value).sort().join(",") !== ["actionId", "actionType", "classId", "kind", "schemaVersion", "studentId"].join(",") || value.schemaVersion !== 1 || value.actionType !== "class-membership-transition" || typeof value.actionId !== "string" || !UUID.test(value.actionId) || request.headers.get("Idempotency-Key") !== value.actionId || typeof value.kind !== "string" || !ACTIONS.includes(value.kind) || typeof value.classId !== "string" || !ID22.test(value.classId) || typeof value.studentId !== "string" || !ID22.test(value.studentId)) {
    throw new Error("class_action_invalid");
  }
  return value;
}, "parseClassAction");
var hash32 = /* @__PURE__ */ __name2((value, seed) => {
  let hash = (2166136261 ^ seed) >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 16777619) >>> 0;
  }
  return hash;
}, "hash32");
var notificationId = /* @__PURE__ */ __name2((actionId, recipientId) => {
  const key = `${actionId}:${recipientId}`;
  const hex = [0, 1, 2, 3].map((seed) => hash32(`${key}:${seed}`, seed).toString(16).padStart(8, "0")).join("");
  const versioned = `${hex.slice(0, 12)}5${hex.slice(13, 16)}8${hex.slice(17)}`;
  return `${versioned.slice(0, 8)}-${versioned.slice(8, 12)}-${versioned.slice(12, 16)}-${versioned.slice(16, 20)}-${versioned.slice(20)}`;
}, "notificationId");
var noticesFor = /* @__PURE__ */ __name2((intent) => {
  const dashboard = buildRoute2("STUDENT_DASHBOARD");
  const classDetail = buildRoute2("TEACHER_CLASS_DETAIL", { classId: intent.classId });
  switch (intent.kind) {
    case "join-pending":
      return [
        {
          recipientId: intent.studentId,
          type: "info",
          title: "\u{1F3EB} Joined Class \u2014 Pending Approval",
          message: `You've requested to join ${intent.className}. Waiting for teacher approval.`,
          link: dashboard
        },
        {
          recipientId: intent.teacherId,
          type: "info",
          title: "\u{1F44B} New Student Request",
          message: `${intent.studentName} wants to join your class "${intent.className}". Review in class management.`,
          link: classDetail
        }
      ];
    case "direct-add":
      return [{
        recipientId: intent.studentId,
        type: "success",
        title: "\u2705 Added to Class",
        message: `You've been added to ${intent.className}.`,
        link: dashboard
      }];
    case "approve":
      return [{
        recipientId: intent.studentId,
        type: "success",
        title: "\u2705 Approved!",
        message: `You've been approved to join ${intent.className}.`,
        link: dashboard
      }];
    case "reject":
      return [{
        recipientId: intent.studentId,
        type: "info",
        title: "\u274C Request Declined",
        message: `Your request to join ${intent.className} was not approved.`,
        link: dashboard
      }];
  }
}, "noticesFor");
var missingClassIntentRecipients = /* @__PURE__ */ __name2(async (intent, read) => {
  let missing = 0;
  for (const { recipientId, ...notification } of noticesFor(intent)) {
    const id = notificationId(intent.actionId, recipientId);
    const row9 = record3(await read(`notifications/${recipientId}/${id}`));
    if (!row9 || row9.id !== id || row9.type !== notification.type || row9.title !== notification.title || row9.message !== notification.message || row9.link !== notification.link) missing += 1;
  }
  return missing;
}, "missingClassIntentRecipients");
var deliverClassIntent = /* @__PURE__ */ __name2(async (intent, repository) => {
  const notices = noticesFor(intent);
  let fresh = false;
  for (const [index, { recipientId, ...notification }] of notices.entries()) {
    try {
      const result = await repository.create({
        operationId: notificationId(intent.actionId, recipientId),
        recipientId,
        notification,
        now: intent.occurredAt
      });
      if (result.status === "idempotency-conflict") {
        return { delivered: false, failedRecipientCount: notices.length - index, backendFailure: false, fresh };
      }
      if (result.status === "created") fresh = true;
    } catch {
      return { delivered: false, failedRecipientCount: notices.length - index, backendFailure: true, fresh };
    }
  }
  return { delivered: true, failedRecipientCount: 0, backendFailure: false, fresh };
}, "deliverClassIntent");
var performClassAction = /* @__PURE__ */ __name2(async (input) => {
  const { command, actorUid, storage } = input;
  const existing = record3(await storage.read(`notification_intents/${command.actionId}`));
  if (existing) {
    return existing.actorUid === actorUid && existing.classId === command.classId && existing.studentId === command.studentId && existing.kind === command.kind ? { status: 200, body: { status: "replayed", actionId: command.actionId } } : { status: 409, body: { code: "class_action_id_conflict" } };
  }
  const classData = record3(await storage.read(`classes/${command.classId}`));
  const actor = record3(await storage.read(`users/${actorUid}`));
  if (!classData || classData.status !== "active" || !actor) {
    return { status: 403, body: { code: "class_action_forbidden" } };
  }
  const teacherId = classData.createdBy;
  if (typeof teacherId !== "string" || !ID22.test(teacherId)) {
    return { status: 403, body: { code: "class_action_forbidden" } };
  }
  const isOwner = actorUid === teacherId || actor.role === "super_admin";
  if (command.kind === "join-pending" ? actorUid !== command.studentId || actor.role !== "student" : !isOwner) {
    return { status: 403, body: { code: "class_action_forbidden" } };
  }
  const students = record3(classData.students) ?? {};
  const currentStudent = record3(students[command.studentId]);
  if (command.kind === "join-pending" || command.kind === "direct-add") {
    if (currentStudent || Object.values(students).some((value) => record3(value)?.uid === command.studentId)) {
      return { status: 409, body: { code: "class_action_membership_exists" } };
    }
    const max = record3(classData.settings)?.maxStudents;
    if (typeof max === "number" && Object.keys(students).length >= max) {
      return { status: 409, body: { code: "class_action_class_full" } };
    }
  } else if (!currentStudent || currentStudent.status !== "pending_approval") {
    return { status: 409, body: { code: "class_action_stale" } };
  }
  const studentProfile = command.kind === "join-pending" || command.kind === "direct-add" ? record3(await storage.read(`users/${command.studentId}`)) : null;
  if ((command.kind === "join-pending" || command.kind === "direct-add") && (!studentProfile || studentProfile.role !== "student")) {
    return { status: 403, body: { code: "class_action_student_invalid" } };
  }
  const at = input.now?.() ?? Date.now();
  const status = command.kind === "join-pending" ? "pending_approval" : "active";
  const joinedAt = typeof currentStudent?.joinedAt === "number" ? currentStudent.joinedAt : at;
  const studentName = text(currentStudent?.name ?? studentProfile?.displayName, "Student");
  const className = text(classData.name, command.classId);
  const studentRow = command.kind === "join-pending" || command.kind === "direct-add" ? {
    id: command.studentId,
    uid: command.studentId,
    name: studentName,
    ...typeof studentProfile?.email === "string" ? { email: studentProfile.email } : {},
    status,
    joinedAt,
    lastActiveAt: at,
    isOnline: true,
    assignments: {}
  } : null;
  const intent = {
    actionId: command.actionId,
    kind: command.kind,
    classId: command.classId,
    studentId: command.studentId,
    actorUid,
    teacherId,
    occurredAt: at,
    className,
    studentName,
    dueAt: at + RETRY_DELAY_MS,
    attempts: 1,
    state: "retry_due"
  };
  const updates = [
    {
      path: `classes/${command.classId}/students/${command.studentId}`,
      value: command.kind === "reject" ? null : command.kind === "approve" ? { ...currentStudent, status: "active" } : studentRow
    },
    {
      path: `student_classes/${command.studentId}/${command.classId}`,
      value: command.kind === "reject" ? null : { joinedAt, status }
    },
    { path: `notification_intents/${command.actionId}`, value: intent }
  ];
  try {
    await storage.commit({ command, actorUid, updates });
  } catch {
    return { status: 409, body: { code: "class_action_commit_failed" } };
  }
  let delivery;
  try {
    delivery = await deliverClassIntent(intent, input.repository());
  } catch {
    delivery = { delivered: false, failedRecipientCount: command.kind === "join-pending" ? 2 : 1, backendFailure: true, fresh: false };
  }
  let suppressedFailure = false;
  if (delivery.delivered) {
    if (delivery.fresh) {
      try {
        await storage.recordSuccess?.(Date.now());
      } catch {
      }
    }
    try {
      await storage.updateIntent({ ...intent, state: "done", dueAt: CLASS_INTENT_DONE_DUE_AT });
    } catch {
    }
  } else {
    try {
      if (storage.reportFailure && await storage.retrySuppressed?.()) {
        await storage.reportFailure(
          intent,
          delivery.failedRecipientCount,
          delivery.backendFailure ? "delivery_backend_error" : "inbox_conflict"
        );
        await storage.updateIntent({ ...intent, state: "failed", dueAt: CLASS_INTENT_DONE_DUE_AT });
        suppressedFailure = true;
      }
    } catch {
    }
  }
  return { status: 200, body: {
    status: "committed",
    actionId: command.actionId,
    notificationStatus: delivery.delivered ? "delivered" : suppressedFailure ? "failed" : "retry_due"
  } };
}, "performClassAction");
var initialState = { consecutiveFailures: 0, retrySuppressed: false };
var validState = /* @__PURE__ */ __name2((value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row9 = value;
  return Number.isSafeInteger(row9.consecutiveFailures) && Number(row9.consecutiveFailures) >= 0 && Number(row9.consecutiveFailures) <= 3 && typeof row9.retrySuppressed === "boolean" && (row9.failedActionIds === void 0 || Array.isArray(row9.failedActionIds) && row9.failedActionIds.length <= 3 && row9.failedActionIds.every((id) => typeof id === "string")) && (row9.lastSuccessAt === void 0 || Number.isSafeInteger(row9.lastSuccessAt)) && (row9.lastFailureAt === void 0 || Number.isSafeInteger(row9.lastFailureAt)) && (row9.lastIssuePath === void 0 || /^reports\/errors\/\d{4}-\d{2}-\d{2}\/[A-Za-z0-9_:-]{1,256}$/u.test(String(row9.lastIssuePath)));
}, "validState");
var notificationIssuePath = /* @__PURE__ */ __name2((issueId, occurredAt) => {
  if (!/^[A-Za-z0-9_:-]{1,256}$/u.test(issueId) || !Number.isSafeInteger(occurredAt) || occurredAt <= 0) {
    throw new Error("notification_issue_identity_invalid");
  }
  return `reports/errors/${new Date(occurredAt).toISOString().slice(0, 10)}/${issueId}`;
}, "notificationIssuePath");
var afterTerminalFailure = /* @__PURE__ */ __name2((state, actionId, at, issuePath) => state.failedActionIds?.includes(actionId) ? state : {
  ...state,
  consecutiveFailures: Math.min(3, state.consecutiveFailures + 1),
  failedActionIds: [...state.failedActionIds ?? [], actionId].slice(-3),
  lastFailureAt: Math.max(state.lastFailureAt ?? 0, at),
  ...issuePath ? { lastIssuePath: issuePath } : {},
  retrySuppressed: state.retrySuppressed || state.consecutiveFailures + 1 >= 3
}, "afterTerminalFailure");
var afterSuccess = /* @__PURE__ */ __name2((state, at) => ({
  ...state,
  consecutiveFailures: state.retrySuppressed ? state.consecutiveFailures : 0,
  failedActionIds: state.retrySuppressed ? state.failedActionIds : [],
  lastSuccessAt: at
}), "afterSuccess");
var RetryFamilyGate = class {
  static {
    __name(this, "RetryFamilyGate");
  }
  constructor(client) {
    this.client = client;
  }
  client;
  static {
    __name2(this, "RetryFamilyGate");
  }
  path(family) {
    if (!/^[a-z][a-z0-9-]{0,63}$/u.test(family)) throw new Error("notification_family_invalid");
    return `notification_retry_families/${family}`;
  }
  async isSuppressed(family) {
    const state = await this.client.readValue(this.path(family));
    if (state !== null && !validState(state)) throw new Error("notification_family_gate_invalid");
    return state?.retrySuppressed === true;
  }
  async recordTerminalFailure(family, actionId, issuePath) {
    if (!/^[A-Za-z0-9_:-]{1,256}$/u.test(actionId)) throw new Error("notification_action_id_invalid");
    if (issuePath && !/^reports\/errors\/\d{4}-\d{2}-\d{2}\/[A-Za-z0-9_:-]{1,256}$/u.test(issuePath)) {
      throw new Error("notification_issue_path_invalid");
    }
    const at = Date.now();
    await this.change(family, (state) => afterTerminalFailure(state, actionId, at, issuePath));
  }
  async recordSuccess(family, at) {
    const state = await this.change(family, (current) => (current.consecutiveFailures > 0 || current.lastIssuePath) && (current.lastFailureAt === void 0 || at <= current.lastFailureAt) || current.consecutiveFailures === 0 && !current.lastIssuePath || current.retrySuppressed && !current.lastIssuePath && current.lastSuccessAt !== void 0 ? current : afterSuccess(current, at));
    const issuePath = state.lastIssuePath;
    if (!issuePath || state.lastFailureAt === void 0 || at <= state.lastFailureAt) return;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const issue = await this.client.readWithEtag(issuePath);
      const context = issue.data?.contextData && typeof issue.data.contextData === "object" && !Array.isArray(issue.data.contextData) ? issue.data.contextData : {};
      if (!issue.data || Number.isSafeInteger(context.lastSuccessAt) && Number(context.lastSuccessAt) > state.lastFailureAt || await this.client.writeIfMatch(
        issuePath,
        { ...issue.data, contextData: { ...context, lastSuccessAt: at } },
        issue.etag
      )) {
        await this.change(family, (current) => current.lastIssuePath === issuePath ? { ...current, lastIssuePath: void 0 } : current);
        return;
      }
    }
    throw new Error("notification_success_report_cas_failed");
  }
  async change(family, next) {
    const path = this.path(family);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const current = await this.client.readWithEtag(path);
      if (current.data !== null && !validState(current.data)) throw new Error("notification_family_gate_invalid");
      const state = current.data ?? initialState;
      const updated = next(state);
      if (updated === state || await this.client.writeIfMatch(path, updated, current.etag)) return updated;
    }
    throw new Error("notification_family_gate_cas_failed");
  }
};
var SIGN_IN_URL = "https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken";
var AUDIENCE = "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit";
var required = /* @__PURE__ */ __name2((env, name) => {
  const value = env[name];
  if (typeof value !== "string" || !value.trim()) throw new Error(`missing_${name.toLowerCase()}`);
  return value.trim();
}, "required");
var firebaseToken = /* @__PURE__ */ __name2(async (env, command, actorUid, fetchImpl) => {
  const raw = required(env, "NOTIFICATION_COMMAND_GOOGLE_SA_KEY");
  const identity = required(env, "NOTIFICATION_COMMAND_SERVICE_IDENTITY");
  const key = JSON.parse(raw);
  if (key.client_email !== identity || !key.private_key) {
    throw new Error("notification_class_service_identity_mismatch");
  }
  const privateKey = await importPKCS82(key.private_key, "RS256");
  const issuedAt = Math.floor(Date.now() / 1e3);
  const customToken = await new SignJWT2({
    iss: identity,
    sub: identity,
    aud: AUDIENCE,
    iat: issuedAt,
    exp: issuedAt + 300,
    uid: `notification-class-action:${command.actionId}`,
    claims: {
      notificationClassAction: true,
      actionId: command.actionId,
      classId: command.classId,
      studentId: command.studentId,
      actionKind: command.kind,
      actorUid
    }
  }).setProtectedHeader({ alg: "RS256", typ: "JWT" }).sign(privateKey);
  const url = `${SIGN_IN_URL}?key=${encodeURIComponent(required(env, "FIREBASE_WEB_API_KEY"))}`;
  const response10 = await fetchImpl.call(globalThis, url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: customToken, returnSecureToken: true })
  });
  if (!response10.ok) throw new Error(`notification_class_token_failed:${response10.status}`);
  const result = await response10.json();
  if (typeof result.idToken !== "string" || !result.idToken) {
    throw new Error("notification_class_token_invalid");
  }
  return result.idToken;
}, "firebaseToken");
var FirebaseClassActionStorage = class {
  static {
    __name(this, "FirebaseClassActionStorage");
  }
  constructor(env, fetchImpl = globalThis.fetch) {
    this.env = env;
    this.fetchImpl = fetchImpl;
    this.admin = new FirebaseRtdbRestClient({
      env: {
        FIREBASE_DB_URL: required(env, "FIREBASE_DB_URL"),
        FIREBASE_PROJECT_ID: required(env, "FIREBASE_PROJECT_ID"),
        GOOGLE_SA_KEY: required(env, "NOTIFICATION_COMMAND_GOOGLE_SA_KEY")
      },
      fetchImpl
    });
    this.gate = new RetryFamilyGate(this.admin);
  }
  env;
  fetchImpl;
  static {
    __name2(this, "FirebaseClassActionStorage");
  }
  admin;
  gate;
  read(path) {
    return this.admin.readValue(path);
  }
  retrySuppressed() {
    return this.gate.isSuppressed("class-membership");
  }
  recordSuccess(at) {
    return this.gate.recordSuccess("class-membership", at);
  }
  async commit(input) {
    const token2 = await firebaseToken(this.env, input.command, input.actorUid, this.fetchImpl);
    const client = new FirebaseRtdbRestClient({
      env: {
        FIREBASE_DB_URL: required(this.env, "FIREBASE_DB_URL"),
        FIREBASE_PROJECT_ID: required(this.env, "FIREBASE_PROJECT_ID")
      },
      fetchImpl: this.fetchImpl,
      firebaseAuthToken: true,
      getFirebaseAuthToken: /* @__PURE__ */ __name2(async () => token2, "getFirebaseAuthToken")
    });
    await client.patchMultiLocation(input.updates);
  }
  async updateIntent(intent) {
    const path = `notification_intents/${intent.actionId}`;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const current = await this.admin.readWithEtag(path);
      if (!current.data || current.data.actionId !== intent.actionId || current.data.kind !== intent.kind || current.data.actorUid !== intent.actorUid) {
        throw new Error("notification_intent_identity_changed");
      }
      if (current.data.state === "done") return;
      if (await this.admin.writeIfMatch(path, intent, current.etag)) return;
    }
    throw new Error("notification_intent_cas_failed");
  }
  async claimRetry(actionId, now) {
    const path = `notification_intents/${actionId}`;
    const current = await this.admin.readWithEtag(path);
    const intent = current.data;
    if (!intent || intent.actionId !== actionId || intent.state !== "retry_due" || intent.attempts !== 1 || intent.dueAt > now) return null;
    const claimed = { ...intent, state: "retrying", attempts: 2, dueAt: now + 36e5 };
    return await this.admin.writeIfMatch(path, claimed, current.etag) ? claimed : null;
  }
  async dueIntents(now, limit = 2) {
    const rows = await this.admin.readValue("notification_intents", {
      orderBy: "dueAt",
      limitToFirst: limit
    });
    if (!rows || typeof rows !== "object" || Array.isArray(rows)) return [];
    return Object.values(rows).filter((row9) => row9 && row9.dueAt <= now && (row9.state === "retry_due" || row9.state === "retrying"));
  }
  async reportFailure(intent, failedRecipientCount, reasonCode) {
    const now = Date.now();
    const path = notificationIssuePath(intent.actionId, intent.occurredAt);
    const existing = await this.admin.readWithEtag(path);
    if (existing.data !== null) return;
    if (await this.admin.writeIfMatch(path, {
      id: intent.actionId,
      timestamp: now,
      feature: "classes",
      severity: "error",
      message: `Class notification delivery failed for ${intent.kind}; ${failedRecipientCount} recipient(s) remain (${reasonCode}).`,
      userId: intent.actorUid,
      userName: "Notification Worker",
      userRole: "service",
      duplicateCount: 1,
      contextData: {
        actionId: intent.actionId,
        classId: intent.classId,
        kind: intent.kind,
        reasonCode,
        failedRecipientCount,
        ...intent.kind === "join-pending" && failedRecipientCount === 1 ? {} : {
          failedRecipientIds: intent.kind === "join-pending" ? [intent.studentId, intent.teacherId] : [intent.studentId]
        }
      }
    }, existing.etag)) await this.gate.recordTerminalFailure("class-membership", intent.actionId, path);
  }
};
var COLLECTION = "homework_submissions";
var DONE_DUE_AT = 864e13;
var LIMIT = 1;
var ID32 = /^[A-Za-z0-9_-]{1,128}$/u;
var required2 = /* @__PURE__ */ __name2((env, key) => {
  const value = env[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`missing_${key.toLowerCase()}`);
  return value.trim();
}, "required");
var encode32 = /* @__PURE__ */ __name2((value) => {
  if (value === null) return { nullValue: "NULL_VALUE" };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "number") return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (typeof value === "object" && value !== null) return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, encode32(entry)])) } };
  throw new Error("homework_retry_firestore_value_invalid");
}, "encode");
var decode22 = /* @__PURE__ */ __name2((value) => {
  if ("nullValue" in value) return null;
  if ("booleanValue" in value) return value.booleanValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("stringValue" in value) return value.stringValue;
  if ("mapValue" in value) return Object.fromEntries(Object.entries(value.mapValue?.fields ?? {}).map(([key, entry]) => [key, decode22(entry)]));
  if ("arrayValue" in value) return (value.arrayValue?.values ?? []).map(decode22);
  return null;
}, "decode");
var decodeDocument = /* @__PURE__ */ __name2((document) => ({
  ...Object.fromEntries(Object.entries(document.fields ?? {}).map(([key, value]) => [key, decode22(value)]))
}), "decodeDocument");
var tokenFor = /* @__PURE__ */ __name2(async (env, fetchImpl) => {
  const keyJson = required2(env, "NOTIFICATION_COMMAND_GOOGLE_SA_KEY");
  const key = JSON.parse(keyJson);
  if (!key.client_email || !key.private_key) throw new Error("invalid_notification_command_service_key");
  if (key.client_email !== required2(env, "NOTIFICATION_COMMAND_SERVICE_IDENTITY")) {
    throw new Error("notification_command_service_identity_mismatch");
  }
  return new FirebaseRtdbRestClient({ env: { GOOGLE_SA_KEY: keyJson }, fetchImpl }).getAccessToken();
}, "tokenFor");
var notificationOperationId = /* @__PURE__ */ __name2((operationKey) => {
  const hash = /* @__PURE__ */ __name2((value, seed) => {
    let result = (2166136261 ^ seed) >>> 0;
    for (let index = 0; index < value.length; index += 1) result = Math.imul(result ^ value.charCodeAt(index), 16777619) >>> 0;
    return result;
  }, "hash");
  const hex = [0, 1, 2, 3].map((seed) => hash(`${operationKey}:${seed}`, seed).toString(16).padStart(8, "0")).join("");
  const versioned = `${hex.slice(0, 12)}5${hex.slice(13, 16)}8${hex.slice(17)}`;
  return `${versioned.slice(0, 8)}-${versioned.slice(8, 12)}-${versioned.slice(12, 16)}-${versioned.slice(16, 20)}-${versioned.slice(20)}`;
}, "notificationOperationId");
var fetchDue = /* @__PURE__ */ __name2(async (env, now, fetchImpl, token2) => {
  const projectId = encodeURIComponent(required2(env, "FIREBASE_PROJECT_ID"));
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`;
  const response10 = await fetchImpl.call(globalThis, url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token2}`, "Content-Type": "application/json" },
    body: JSON.stringify({ structuredQuery: {
      from: [{ collectionId: COLLECTION }],
      where: { fieldFilter: { field: { fieldPath: "notificationDelivery.dueAt" }, op: "LESS_THAN_OR_EQUAL", value: { integerValue: String(now) } } },
      orderBy: [{ field: { fieldPath: "notificationDelivery.dueAt" }, direction: "ASCENDING" }],
      limit: LIMIT
    } })
  });
  if (!response10.ok) throw new Error(`homework_retry_query_failed:${response10.status}`);
  const rows = await response10.json();
  return rows.flatMap((row9) => row9.document ? [row9.document] : []).filter((row9) => typeof row9.name === "string" && row9.updateTime).map((document) => ({
    path: document.name.split("/documents/")[1],
    document,
    submission: decodeDocument(document)
  })).filter(({ path, submission }) => path?.startsWith(`${COLLECTION}/`) && submission.notificationDelivery?.dueAt <= now && (submission.notificationDelivery.state === "retry_due" || submission.notificationDelivery.state === "retrying"));
}, "fetchDue");
var updateDelivery = /* @__PURE__ */ __name2(async (env, due, delivery, fetchImpl, token2) => {
  if (!due.document.updateTime) return null;
  const projectId = encodeURIComponent(required2(env, "FIREBASE_PROJECT_ID"));
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${due.path}?updateMask.fieldPaths=notificationDelivery&currentDocument.updateTime=${encodeURIComponent(due.document.updateTime)}`;
  const response10 = await fetchImpl.call(globalThis, url, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token2}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields: { notificationDelivery: encode32(delivery) } })
  });
  if (response10.status === 409 || response10.status === 412) return null;
  if (!response10.ok) throw new Error(`homework_retry_update_failed:${response10.status}`);
  return await response10.json();
}, "updateDelivery");
var trustedIntent = /* @__PURE__ */ __name2((intent, value) => {
  if (!intent || intent.schemaVersion !== 1 || intent.eventId !== `homework-submitted:${intent.resultId}` || !Number.isSafeInteger(intent.submittedAt) || ![intent.resultId, intent.homeworkId, intent.studentId, intent.teacherId].every((id) => typeof id === "string" && ID32.test(id))) return false;
  const result = value && typeof value === "object" && !Array.isArray(value) ? value : null;
  const context = result?.context && typeof result.context === "object" ? result.context : null;
  const visibility = result?.visibility && typeof result.visibility === "object" ? result.visibility : null;
  if (!result || !context || !visibility || result.resultId !== intent.resultId || result.studentId !== intent.studentId || context.type !== "homework" || visibility.ownershipResolved !== true || visibility.visibilityOwnerTeacherId !== intent.teacherId || visibility.homeworkId !== intent.homeworkId) return false;
  return true;
}, "trustedIntent");
var reportFailure = /* @__PURE__ */ __name2(async (admin, gate, intent, now, reasonCode) => {
  const issueId = `homework-notification-${intent.eventId}`;
  const path = notificationIssuePath(issueId, intent.submittedAt);
  const existing = await admin.readWithEtag(path);
  if (existing.data !== null) return;
  if (await admin.writeIfMatch(path, {
    id: issueId,
    timestamp: now,
    feature: "homework",
    severity: "error",
    message: `Homework submission notification delivery failed (${reasonCode}).`,
    userId: intent.studentId,
    userName: "Notification Worker",
    userRole: "service",
    duplicateCount: 1,
    contextData: {
      eventId: intent.eventId,
      resultId: intent.resultId,
      homeworkId: intent.homeworkId,
      recipientId: intent.teacherId,
      reasonCode
    }
  }, existing.etag)) await gate.recordTerminalFailure("homework-submitted", intent.eventId, path);
}, "reportFailure");
var hasCommittedHomeworkNotification = /* @__PURE__ */ __name2(async (env, input, fetchImpl = globalThis.fetch) => {
  if (![input.resultId, input.studentId, input.teacherId, input.homeworkId].every((id) => ID32.test(id))) return false;
  const token2 = await tokenFor(env, fetchImpl);
  const projectId = encodeURIComponent(required2(env, "FIREBASE_PROJECT_ID"));
  const response10 = await fetchImpl.call(globalThis, `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token2}`, "Content-Type": "application/json" },
    body: JSON.stringify({ structuredQuery: {
      from: [{ collectionId: COLLECTION }],
      where: { fieldFilter: { field: { fieldPath: "notificationIntent.resultId" }, op: "EQUAL", value: { stringValue: input.resultId } } },
      limit: 2
    } })
  });
  if (!response10.ok) throw new Error(`homework_notification_intent_query_failed:${response10.status}`);
  const rows = await response10.json();
  const matches = rows.flatMap((row9) => row9.document ? [decodeDocument(row9.document)] : []).filter((submission) => {
    const intent = submission.notificationIntent;
    return intent?.schemaVersion === 1 && intent.eventId === `homework-submitted:${input.resultId}` && intent.resultId === input.resultId && intent.studentId === input.studentId && intent.teacherId === input.teacherId && intent.homeworkId === input.homeworkId && (submission.notificationDelivery?.state === "retry_due" || submission.notificationDelivery?.state === "retrying" || submission.notificationDelivery?.state === "done");
  });
  return matches.length === 1;
}, "hasCommittedHomeworkNotification");
var markHomeworkNotificationDelivered = /* @__PURE__ */ __name2(async (env, input, fetchImpl = globalThis.fetch) => {
  if (![input.resultId, input.studentId, input.teacherId, input.homeworkId].every((id) => ID32.test(id))) return false;
  const token2 = await tokenFor(env, fetchImpl);
  const projectId = encodeURIComponent(required2(env, "FIREBASE_PROJECT_ID"));
  const response10 = await fetchImpl.call(globalThis, `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token2}`, "Content-Type": "application/json" },
    body: JSON.stringify({ structuredQuery: {
      from: [{ collectionId: COLLECTION }],
      where: { fieldFilter: { field: { fieldPath: "notificationIntent.resultId" }, op: "EQUAL", value: { stringValue: input.resultId } } },
      limit: 2
    } })
  });
  if (!response10.ok) throw new Error(`homework_notification_mark_query_failed:${response10.status}`);
  const rows = await response10.json();
  const matches = rows.flatMap((row9) => row9.document ? [row9.document] : []).filter((document) => typeof document.name === "string" && document.updateTime).map((document) => ({ document, submission: decodeDocument(document) })).filter(({ submission }) => {
    const intent = submission.notificationIntent;
    return intent?.schemaVersion === 1 && intent.eventId === `homework-submitted:${input.resultId}` && intent.resultId === input.resultId && intent.studentId === input.studentId && intent.teacherId === input.teacherId && intent.homeworkId === input.homeworkId;
  });
  if (matches.length !== 1) return false;
  const match = matches[0];
  const delivery = match.submission.notificationDelivery;
  if (!delivery) return false;
  if (delivery.state === "done") return true;
  if (delivery.state !== "retry_due" && delivery.state !== "retrying") return false;
  return Boolean(await updateDelivery(env, {
    path: match.document.name.split("/documents/")[1],
    document: match.document
  }, { state: "done", attempts: delivery.attempts, dueAt: DONE_DUE_AT }, fetchImpl, token2));
}, "markHomeworkNotificationDelivered");
var recordHomeworkImmediateOutcome = /* @__PURE__ */ __name2(async (env, input, delivered, now, fetchImpl = globalThis.fetch) => {
  const admin = new FirebaseRtdbRestClient({ env: {
    FIREBASE_DB_URL: required2(env, "FIREBASE_DB_URL"),
    FIREBASE_PROJECT_ID: required2(env, "FIREBASE_PROJECT_ID"),
    GOOGLE_SA_KEY: required2(env, "NOTIFICATION_COMMAND_GOOGLE_SA_KEY")
  }, fetchImpl });
  const gate = new RetryFamilyGate(admin);
  if (delivered) {
    await gate.recordSuccess("homework-submitted", now);
    return;
  }
  if (!await gate.isSuppressed("homework-submitted")) return;
  const token2 = await tokenFor(env, fetchImpl);
  const projectId = encodeURIComponent(required2(env, "FIREBASE_PROJECT_ID"));
  const response10 = await fetchImpl.call(
    globalThis,
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token2}`, "Content-Type": "application/json" },
      body: JSON.stringify({ structuredQuery: {
        from: [{ collectionId: COLLECTION }],
        where: { fieldFilter: { field: { fieldPath: "notificationIntent.resultId" }, op: "EQUAL", value: { stringValue: input.resultId } } },
        limit: 2
      } })
    }
  );
  if (!response10.ok) throw new Error(`homework_notification_suppressed_query_failed:${response10.status}`);
  const rows = await response10.json();
  const matches = rows.flatMap((row9) => row9.document ? [row9.document] : []).filter((document) => typeof document.name === "string" && document.updateTime).map((document) => ({ document, submission: decodeDocument(document) })).filter(({ submission }) => {
    const intent = submission.notificationIntent;
    return intent?.eventId === `homework-submitted:${input.resultId}` && intent.studentId === input.studentId && intent.teacherId === input.teacherId && intent.homeworkId === input.homeworkId && submission.notificationDelivery?.state === "retry_due";
  });
  if (matches.length !== 1) throw new Error("homework_notification_suppressed_intent_missing");
  const match = matches[0];
  await reportFailure(
    admin,
    gate,
    match.submission.notificationIntent,
    now,
    input.reasonCode ?? "delivery_unconfirmed"
  );
  await updateDelivery(
    env,
    { path: match.document.name.split("/documents/")[1], document: match.document },
    { state: "failed", attempts: 1, dueAt: DONE_DUE_AT },
    fetchImpl,
    token2
  );
}, "recordHomeworkImmediateOutcome");
var retryDueHomeworkNotifications = /* @__PURE__ */ __name2(async (env, now = Date.now(), dependencies = {}) => {
  const fetchImpl = dependencies.fetchImpl ?? globalThis.fetch;
  const token2 = await tokenFor(env, fetchImpl);
  const repository = dependencies.repository ?? new FirebaseRestNotificationCommandRepository({ env });
  const admin = new FirebaseRtdbRestClient({ env: {
    FIREBASE_DB_URL: required2(env, "FIREBASE_DB_URL"),
    FIREBASE_PROJECT_ID: required2(env, "FIREBASE_PROJECT_ID"),
    GOOGLE_SA_KEY: required2(env, "NOTIFICATION_COMMAND_GOOGLE_SA_KEY")
  }, fetchImpl });
  const gate = new RetryFamilyGate(admin);
  const readResult = dependencies.readResult ?? ((path) => admin.readValue(path));
  const readInbox = dependencies.readInbox ?? ((path) => admin.readValue(path));
  for (const due of await fetchDue(env, now, fetchImpl, token2)) {
    const intent = due.submission.notificationIntent;
    const delivery = due.submission.notificationDelivery;
    if (!intent || !delivery) continue;
    if (delivery.state === "retrying") {
      const operationId2 = notificationOperationId(`homework-submitted:teacher:${intent.resultId}:${intent.teacherId}`);
      const existing = await readInbox(`notifications/${intent.teacherId}/${operationId2}`);
      const row9 = existing && typeof existing === "object" && !Array.isArray(existing) ? existing : null;
      const delivered2 = row9?.id === operationId2 && row9.type === "info" && row9.title === "Homework Submitted" && row9.link === buildRoute2("TEACHER_HOMEWORK_DETAIL", { homeworkId: intent.homeworkId });
      if (!delivered2) await reportFailure(admin, gate, intent, now, "inbox_missing_after_claim");
      await updateDelivery(env, due, { state: delivered2 ? "done" : "failed", attempts: 2, dueAt: DONE_DUE_AT }, fetchImpl, token2);
      continue;
    }
    if (await gate.isSuppressed("homework-submitted")) continue;
    const claimed = { state: "retrying", attempts: 2, dueAt: now + 60 * 60 * 1e3 };
    const claimedDocument = await updateDelivery(env, due, claimed, fetchImpl, token2);
    if (!claimedDocument) continue;
    let delivered = false;
    let fresh = false;
    let backendFailure = false;
    let reasonCode = "source_unavailable";
    try {
      const canonical3 = trustedIntent(intent, await readResult(`test_results/${intent.resultId}`));
      if (canonical3) {
        const operationKey = `homework-submitted:teacher:${intent.resultId}`;
        const result = await repository.create({
          operationId: notificationOperationId(`${operationKey}:${intent.teacherId}`),
          recipientId: intent.teacherId,
          notification: {
            type: "info",
            title: "Homework Submitted",
            message: "A student submitted homework.",
            link: buildRoute2("TEACHER_HOMEWORK_DETAIL", { homeworkId: intent.homeworkId })
          },
          now: intent.submittedAt
        });
        delivered = result.status !== "idempotency-conflict";
        fresh = result.status === "created";
        if (!delivered) reasonCode = "inbox_conflict";
      }
    } catch {
      delivered = false;
      backendFailure = true;
      reasonCode = "delivery_backend_error";
    }
    if (backendFailure) break;
    if (!delivered) await reportFailure(admin, gate, intent, now, reasonCode);
    else if (fresh) {
      try {
        await gate.recordSuccess("homework-submitted", Date.now());
      } catch {
      }
    }
    await updateDelivery(env, { ...due, document: claimedDocument }, { state: delivered ? "done" : "failed", attempts: 2, dueAt: DONE_DUE_AT }, fetchImpl, token2);
  }
}, "retryDueHomeworkNotifications");
var record22 = /* @__PURE__ */ __name2((value) => value !== null && typeof value === "object" && !Array.isArray(value) ? value : null, "record");
var hash322 = /* @__PURE__ */ __name2((value, seed) => {
  let hash = (2166136261 ^ seed) >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 16777619) >>> 0;
  }
  return hash;
}, "hash32");
var operationId = /* @__PURE__ */ __name2((requestId, status, recipientId) => {
  const key = `course-type-${status}:${requestId}:${recipientId}`;
  const hex = [0, 1, 2, 3].map((seed) => hash322(`${key}:${seed}`, seed).toString(16).padStart(8, "0")).join("");
  const versioned = `${hex.slice(0, 12)}5${hex.slice(13, 16)}8${hex.slice(17)}`;
  return `${versioned.slice(0, 8)}-${versioned.slice(8, 12)}-${versioned.slice(12, 16)}-${versioned.slice(16, 20)}-${versioned.slice(20)}`;
}, "operationId");
var resolveCourseTypeDecisionNotice = /* @__PURE__ */ __name2((requestId, value) => {
  const status = value.status;
  if (value.id !== requestId || typeof value.teacherId !== "string" || !value.teacherId || typeof value.typeName !== "string" || !value.typeName.trim() || status !== "approved" && status !== "rejected") return null;
  const intent = record22(value.notificationIntent);
  const occurredAt = status === "approved" ? value.approvedAt : value.handledAt;
  const actor = status === "approved" ? value.approvedBy : value.handledBy;
  const retryShape = intent?.state === "due" && intent.attempts === 0 || intent?.state === "sending" && intent.attempts === 1 || intent?.state === "retry_due" && intent.attempts === 1 || intent?.state === "retrying" && intent.attempts === 2;
  if (!intent || intent.eventKind !== `course-type-${status}` || intent.authorityRecordId !== requestId || intent.occurrenceId !== `${requestId}_${status}` || intent.occurredAt !== occurredAt || typeof occurredAt !== "number" || typeof intent.dueAt !== "number" || !retryShape || typeof actor !== "string" || !actor || Object.keys(intent).sort().join(",") !== ["attempts", "authorityRecordId", "dueAt", "eventKind", "occurredAt", "occurrenceId", "state"].sort().join(",")) return null;
  const typeName = value.typeName.trim().slice(0, 120);
  const rejectedReason = typeof value.rejectionReason === "string" ? value.rejectionReason.trim().slice(0, 300) : "";
  return {
    operationId: operationId(requestId, status, value.teacherId),
    recipientId: value.teacherId,
    occurredAt,
    notification: status === "approved" ? {
      type: "success",
      title: "Course Type Approved",
      message: `Your request for course type "${typeName}" has been approved. You can now use it when creating courses.`,
      link: buildRoute2("TEACHER_COURSES")
    } : {
      type: "error",
      title: "Course Type Rejected",
      message: `Your request for course type "${typeName}" was rejected${rejectedReason ? `: ${rejectedReason}` : "."}`,
      link: buildRoute2("TEACHER_COURSES")
    }
  };
}, "resolveCourseTypeDecisionNotice");
var DONE_DUE_AT2 = 864e13;
var required3 = /* @__PURE__ */ __name2((env, key) => {
  const value = env[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`missing_${key.toLowerCase()}`);
  return value.trim();
}, "required");
var record32 = /* @__PURE__ */ __name2((value) => value && typeof value === "object" && !Array.isArray(value) ? value : null, "record");
var FirebaseCourseTypeDecisionStorage = class {
  static {
    __name(this, "FirebaseCourseTypeDecisionStorage");
  }
  static {
    __name2(this, "FirebaseCourseTypeDecisionStorage");
  }
  admin;
  constructor(env, fetchImpl = globalThis.fetch) {
    this.admin = new FirebaseRtdbRestClient({
      env: {
        FIREBASE_DB_URL: required3(env, "FIREBASE_DB_URL"),
        FIREBASE_PROJECT_ID: required3(env, "FIREBASE_PROJECT_ID"),
        GOOGLE_SA_KEY: required3(env, "NOTIFICATION_COMMAND_GOOGLE_SA_KEY"),
        readDatabaseValue: typeof env.readDatabaseValue === "function" ? env.readDatabaseValue : void 0
      },
      fetchImpl
    });
  }
  async readRequest(requestId) {
    return record32(await this.admin.readValue(`course_type_requests/${requestId}`));
  }
  async readIntent(requestId) {
    const result = await this.admin.readWithEtag(
      `course_type_requests/${requestId}/notificationIntent`
    );
    return { intent: result.data, etag: result.etag };
  }
  writeIntent(requestId, intent, etag) {
    return this.admin.writeIfMatch(`course_type_requests/${requestId}/notificationIntent`, intent, etag);
  }
  async dueRequests(limit) {
    const rows = await this.admin.readValue("course_type_requests", {
      orderBy: "notificationIntent/dueAt",
      startAt: 0,
      limitToFirst: limit
    });
    if (!rows || typeof rows !== "object" || Array.isArray(rows)) return [];
    return Object.values(rows).map(record32).filter((row9) => Boolean(row9));
  }
  async reportFailure(request, intent) {
    const now = Date.now();
    const day22 = new Date(now).toISOString().slice(0, 10);
    const path = `reports/errors/${day22}/${intent.occurrenceId}`;
    const existing = await this.admin.readWithEtag(path);
    if (existing.data !== null) return;
    const actorId = intent.eventKind === "course-type-approved" ? request.approvedBy : request.handledBy;
    await this.admin.writeIfMatch(path, {
      id: intent.occurrenceId,
      timestamp: now,
      feature: "courses",
      severity: "error",
      message: `Course type notification delivery failed; 1 recipient remains.`,
      userId: typeof actorId === "string" ? actorId : "notification-worker",
      userName: "Notification Worker",
      userRole: "service",
      duplicateCount: 1,
      contextData: {
        actionId: intent.occurrenceId,
        requestId: request.id,
        eventKind: intent.eventKind,
        failedRecipientCount: 1
      }
    }, existing.etag);
  }
};
var COURSE_TYPE_DECISION_DONE_DUE_AT = DONE_DUE_AT2;
var RETRY_DELAY_MS2 = 60 * 60 * 1e3;
var LEASE_MS = 5 * 60 * 1e3;
var MAX_DUE_PER_PASS = 2;
var REQUEST_ID = /^[A-Za-z0-9_-]{1,128}$/u;
var readCourseTypeDecisionDispatchRequest = /* @__PURE__ */ __name2(async (request) => {
  if (request.method !== "POST" || !request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    throw new Error("course_type_notification_request_invalid");
  }
  const text2 = await request.text();
  if (new TextEncoder().encode(text2).byteLength > 1024) {
    throw new Error("course_type_notification_request_too_large");
  }
  let value;
  try {
    value = JSON.parse(text2);
  } catch {
    throw new Error("course_type_notification_request_invalid_json");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("course_type_notification_request_invalid");
  }
  const command = value;
  if (Object.keys(command).sort().join(",") !== "actionType,requestId,schemaVersion" || command.schemaVersion !== 1 || command.actionType !== "dispatch-course-type-decision" || typeof command.requestId !== "string" || !REQUEST_ID.test(command.requestId)) {
    throw new Error("course_type_notification_request_invalid");
  }
  return { requestId: command.requestId };
}, "readCourseTypeDecisionDispatchRequest");
var eventActor = /* @__PURE__ */ __name2((request) => request.status === "approved" ? request.approvedBy : request.handledBy, "eventActor");
var withIntent = /* @__PURE__ */ __name2((request, intent) => ({ ...request, notificationIntent: intent }), "withIntent");
var claim = /* @__PURE__ */ __name2(async (storage, requestId, now, allowed, next) => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await storage.readIntent(requestId);
    if (!current.intent || !allowed(current.intent)) return null;
    const updated = next(current.intent);
    if (await storage.writeIntent(requestId, updated, current.etag)) return updated;
  }
  return null;
}, "claim");
var terminal = /* @__PURE__ */ __name2((intent) => ({
  ...intent,
  dueAt: COURSE_TYPE_DECISION_DONE_DUE_AT
}), "terminal");
var createCourseTypeDecisionHandlers = /* @__PURE__ */ __name2((options) => {
  const now = options.now ?? Date.now;
  const markDone = /* @__PURE__ */ __name2(async (requestId) => {
    await claim(options.storage, requestId, now(), (intent) => intent.state === "sending" || intent.state === "retrying", (intent) => ({ ...terminal(intent), state: "done" }));
  }, "markDone");
  const markFailure = /* @__PURE__ */ __name2(async (request, requestId, intent) => {
    const finalAttempt = intent.attempts === 2;
    const state = finalAttempt ? "failed" : "retry_due";
    if (finalAttempt) await options.storage.reportFailure(request, terminal(intent));
    const updated = await claim(options.storage, requestId, now(), (current) => (current.state === "sending" || current.state === "retrying") && current.attempts === intent.attempts, (current) => ({
      ...current,
      state,
      dueAt: finalAttempt ? COURSE_TYPE_DECISION_DONE_DUE_AT : now() + RETRY_DELAY_MS2
    }));
    if (!updated) throw new Error("course_type_notification_state_update_failed");
  }, "markFailure");
  const attemptDelivery = /* @__PURE__ */ __name2(async (requestId, request, intent) => {
    const saved = withIntent(request, intent);
    const notice = resolveCourseTypeDecisionNotice(requestId, saved);
    if (!notice) return { delivered: false, backendFailure: false };
    try {
      const result = await options.repository.create({
        operationId: notice.operationId,
        recipientId: notice.recipientId,
        notification: notice.notification,
        now: notice.occurredAt
      });
      if (result.status === "idempotency-conflict") throw new Error("notification_idempotency_conflict");
    } catch {
      await markFailure(request, requestId, intent);
      return { delivered: false, backendFailure: true };
    }
    await markDone(requestId);
    return { delivered: true, backendFailure: false };
  }, "attemptDelivery");
  const recoverLease = /* @__PURE__ */ __name2(async (requestId, request, intent) => {
    const notice = resolveCourseTypeDecisionNotice(requestId, withIntent(request, intent));
    if (!notice || !options.repository.exists) return;
    if (await options.repository.exists(notice.recipientId, notice.operationId)) {
      await markDone(requestId);
      return;
    }
    if (intent.attempts === 1) {
      await claim(options.storage, requestId, now(), (current) => current.state === "sending" && current.attempts === 1, (current) => ({ ...current, state: "retry_due", dueAt: now() + RETRY_DELAY_MS2 }));
      return;
    }
    await options.storage.reportFailure(request, terminal(intent));
    const failed2 = await claim(options.storage, requestId, now(), (current) => current.state === "retrying" && current.attempts === 2, (current) => ({ ...terminal(current), state: "failed" }));
    if (!failed2) return;
  }, "recoverLease");
  const dispatch = /* @__PURE__ */ __name2(async (input) => {
    const request = await options.storage.readRequest(input.requestId);
    if (!request) return { status: "not_found" };
    if (eventActor(request) !== input.actorUid) return { status: "forbidden" };
    const intent = await claim(options.storage, input.requestId, now(), (current2) => current2.state === "due" && current2.attempts === 0 && current2.dueAt <= now(), (current2) => ({ ...current2, state: "sending", attempts: 1, dueAt: now() + LEASE_MS }));
    if (!intent) return { status: "stale" };
    const result = await attemptDelivery(input.requestId, request, intent);
    if (result.delivered) return { status: "delivered" };
    const current = await options.storage.readIntent(input.requestId);
    return { status: current.intent?.state === "failed" ? "failed" : "retry_due" };
  }, "dispatch");
  const runRetryBatch = /* @__PURE__ */ __name2(async () => {
    const due = await options.storage.dueRequests(MAX_DUE_PER_PASS);
    let processed = 0;
    for (const request of due) {
      const requestId = typeof request.id === "string" ? request.id : "";
      if (!requestId) continue;
      const before = await options.storage.readIntent(requestId);
      const intent = before.intent;
      if (!intent || intent.dueAt > now() || intent.state === "done" || intent.state === "failed") continue;
      if (intent.state === "sending" || intent.state === "retrying") {
        await recoverLease(requestId, request, intent);
        processed += 1;
        continue;
      }
      const first = intent.state === "due" && intent.attempts === 0;
      const retry = intent.state === "retry_due" && intent.attempts === 1;
      if (!first && !retry) continue;
      const claimed = await claim(options.storage, requestId, now(), (current) => current.dueAt <= now() && (first ? current.state === "due" && current.attempts === 0 : current.state === "retry_due" && current.attempts === 1), (current) => ({
        ...current,
        state: first ? "sending" : "retrying",
        attempts: first ? 1 : 2,
        dueAt: now() + LEASE_MS
      }));
      if (!claimed) continue;
      const result = await attemptDelivery(requestId, request, claimed);
      processed += 1;
      if (result.backendFailure) break;
    }
    return { processed };
  }, "runRetryBatch");
  return { dispatch, runRetryBatch };
}, "createCourseTypeDecisionHandlers");
var ID42 = /^[A-Za-z0-9_-]{1,128}$/u;
var UUID2 = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
var DEADLINE_INTENT_DONE_DUE_AT = 864e13;
var RETRY_DELAY_MS3 = 60 * 60 * 1e3;
var LIMIT2 = 1;
var parseDeadlineAction = /* @__PURE__ */ __name2(async (request) => {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) throw new Error("deadline_action_content_type_required");
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 512) throw new Error("deadline_action_body_too_large");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("deadline_action_invalid_json");
  }
  const value = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  if (!value || Object.keys(value).sort().join(",") !== "eventId" || typeof value.eventId !== "string" || !UUID2.test(value.eventId) || request.headers.get("Idempotency-Key") !== value.eventId) {
    throw new Error("deadline_action_invalid");
  }
  return { eventId: value.eventId };
}, "parseDeadlineAction");
var record4 = /* @__PURE__ */ __name2((value) => value && typeof value === "object" && !Array.isArray(value) ? value : null, "record");
var deadlineNotificationId = /* @__PURE__ */ __name2((eventId, recipientId) => {
  const value = `${eventId}:${recipientId}`;
  const hash = /* @__PURE__ */ __name2((text2, seed) => {
    let result = (2166136261 ^ seed) >>> 0;
    for (let index = 0; index < text2.length; index += 1) result = Math.imul(result ^ text2.charCodeAt(index), 16777619) >>> 0;
    return result;
  }, "hash");
  const hex = [0, 1, 2, 3].map((seed) => hash(`${value}:${seed}`, seed).toString(16).padStart(8, "0")).join("");
  const versioned = `${hex.slice(0, 12)}5${hex.slice(13, 16)}8${hex.slice(17)}`;
  return `${versioned.slice(0, 8)}-${versioned.slice(8, 12)}-${versioned.slice(12, 16)}-${versioned.slice(16, 20)}-${versioned.slice(20)}`;
}, "deadlineNotificationId");
var trustedHomework = /* @__PURE__ */ __name2((intent, homework) => {
  if (!homework || homework.id !== intent.homeworkId || homework.createdBy !== intent.actorUid) return null;
  const overrides = record4(homework.studentOverrides);
  const override = record4(overrides?.[intent.studentId]);
  if (typeof override?.lastRemindedAt !== "number" || override.lastRemindedAt < intent.occurredAt || typeof override.reminderCount !== "number" || override.reminderCount < 1) return null;
  const target = record4(homework.target);
  let assigned = false;
  if (target?.type === "students" || target?.type === "group") {
    assigned = Array.isArray(target.studentIds) && target.studentIds.includes(intent.studentId);
  } else if (target?.type === "class") {
    const classStudents = record4(homework.classStudents);
    assigned = Boolean(classStudents && Object.hasOwn(classStudents, intent.studentId));
  } else if (target?.type === "course") {
    const courseEnrollments = homework.courseEnrollments;
    assigned = Array.isArray(courseEnrollments) && courseEnrollments.some((entry) => {
      const enrollment = record4(entry);
      return enrollment?.courseId === target.courseId && enrollment.studentId === intent.studentId && enrollment.status === "active" && (enrollment.expiresAt === 0 || typeof enrollment.expiresAt === "number" && enrollment.expiresAt > intent.occurredAt);
    });
  }
  if (!assigned) return null;
  return { link: buildRoute2("STUDENT_HOMEWORK_DETAIL", { homeworkId: intent.homeworkId }) };
}, "trustedHomework");
var createDeadlineNotificationHandlers = /* @__PURE__ */ __name2((options) => {
  const now = options.now ?? Date.now;
  const deliver5 = /* @__PURE__ */ __name2(async (intent) => {
    const homework = await options.storage.readHomework(intent.homeworkId, intent.studentId);
    const source = trustedHomework(intent, homework);
    if (!source) return { delivered: false, fresh: false, reasonCode: "source_unavailable" };
    const result = await options.repository.create({
      operationId: deadlineNotificationId(intent.eventId, intent.studentId),
      recipientId: intent.studentId,
      notification: {
        type: "homework_reminder",
        title: "\u26A1 Homework Reminder",
        message: "Your teacher sent you a homework reminder.",
        link: source.link
      },
      now: intent.occurredAt
    });
    return {
      delivered: result.status !== "idempotency-conflict",
      fresh: result.status === "created",
      reasonCode: result.status === "idempotency-conflict" ? "inbox_conflict" : "delivery_unconfirmed"
    };
  }, "deliver");
  const recordSuccess = /* @__PURE__ */ __name2(async () => {
    try {
      await options.storage.recordSuccess?.(now());
    } catch {
    }
  }, "recordSuccess");
  const initialState2 = /* @__PURE__ */ __name2(async (intent, outcome) => {
    const { delivered, fresh, reasonCode } = outcome;
    if (delivered) {
      if (fresh) await recordSuccess();
      return { state: "done", dueAt: DEADLINE_INTENT_DONE_DUE_AT };
    }
    try {
      if (await options.storage.retrySuppressed?.()) {
        await options.storage.reportFailure(intent, now(), reasonCode);
        return { state: "failed", dueAt: DEADLINE_INTENT_DONE_DUE_AT };
      }
    } catch {
    }
    return { state: "retry_due", dueAt: intent.dueAt };
  }, "initialState");
  const action = /* @__PURE__ */ __name2(async (input) => {
    if (!input.uid) return { body: { code: "deadline_action_unauthenticated" }, init: { status: 401 } };
    try {
      const { eventId } = await parseDeadlineAction(input.request);
      const saved = await options.storage.readIntent(eventId);
      if (!saved || !isTrustedManualReminderIntent(saved.intent, eventId) || saved.intent.actorUid !== input.uid) {
        return { body: { code: "deadline_action_forbidden" }, init: { status: 403 } };
      }
      const intent = saved.intent;
      if (intent.state === "done") return { body: { status: "replayed", eventId }, init: { status: 200 } };
      if (intent.state !== "pending" || intent.attempts !== 0) {
        return { body: { code: "deadline_action_already_claimed" }, init: { status: 409 } };
      }
      const claimed = { ...intent, state: "sending", attempts: 1, dueAt: now() + RETRY_DELAY_MS3 };
      const version = await options.storage.updateIntent(eventId, claimed, saved.version);
      if (!version) return { body: { code: "deadline_action_already_claimed" }, init: { status: 409 } };
      let outcome = { delivered: false, fresh: false, reasonCode: "delivery_backend_error" };
      try {
        outcome = await deliver5(claimed);
      } catch {
      }
      const completed = { ...claimed, ...await initialState2(claimed, outcome) };
      await options.storage.updateIntent(eventId, completed, version);
      return { body: { status: outcome.delivered ? "delivered" : completed.state === "failed" ? "failed" : "retry_scheduled", eventId }, init: { status: 200 } };
    } catch {
      return { body: { code: "deadline_action_failed" }, init: { status: 500 } };
    }
  }, "action");
  return { action, retryDue: /* @__PURE__ */ __name2(async () => {
    for (const due of await options.storage.dueIntents(now(), LIMIT2)) {
      const intent = due.intent;
      if (intent.state === "retrying") {
        const delivered = await options.storage.notificationExists(intent);
        if (!delivered) await options.storage.reportFailure(intent, now(), "inbox_missing_after_claim");
        await options.storage.updateIntent(intent.eventId, {
          ...intent,
          state: delivered ? "done" : "failed",
          attempts: 2,
          dueAt: DEADLINE_INTENT_DONE_DUE_AT
        }, due.version);
        continue;
      }
      if (intent.state === "pending" && intent.attempts === 0) {
        const claimed2 = { ...intent, state: "sending", attempts: 1, dueAt: now() + RETRY_DELAY_MS3 };
        const version2 = await options.storage.updateIntent(intent.eventId, claimed2, due.version);
        if (!version2) continue;
        let outcome2 = { delivered: false, fresh: false, reasonCode: "delivery_backend_error" };
        try {
          outcome2 = await deliver5(claimed2);
        } catch {
        }
        await options.storage.updateIntent(intent.eventId, { ...claimed2, ...await initialState2(claimed2, outcome2) }, version2);
        continue;
      }
      if (intent.state !== "retry_due" || intent.attempts !== 1) continue;
      if (await options.storage.retrySuppressed?.()) continue;
      const claimed = { ...intent, state: "retrying", attempts: 2, dueAt: now() + RETRY_DELAY_MS3 };
      const version = await options.storage.updateIntent(intent.eventId, claimed, due.version);
      if (!version) continue;
      let outcome = { delivered: false, fresh: false, reasonCode: "delivery_backend_error" };
      try {
        outcome = await deliver5(claimed);
      } catch {
      }
      if (!outcome.delivered) await options.storage.reportFailure(claimed, now(), outcome.reasonCode);
      else if (outcome.fresh) await recordSuccess();
      await options.storage.updateIntent(intent.eventId, {
        ...claimed,
        state: outcome.delivered ? "done" : "failed",
        dueAt: DEADLINE_INTENT_DONE_DUE_AT
      }, version);
    }
  }, "retryDue") };
}, "createDeadlineNotificationHandlers");
var isTrustedManualReminderIntent = /* @__PURE__ */ __name2((value, eventId) => {
  const intent = record4(value);
  return Boolean(intent && intent.eventId === eventId && UUID2.test(eventId) && typeof intent.homeworkId === "string" && ID42.test(intent.homeworkId) && typeof intent.studentId === "string" && ID42.test(intent.studentId) && typeof intent.actorUid === "string" && ID42.test(intent.actorUid) && Number.isSafeInteger(intent.occurredAt) && Number.isSafeInteger(intent.dueAt) && ["pending", "sending", "retry_due", "retrying", "done", "failed"].includes(String(intent.state)) && [0, 1, 2].includes(Number(intent.attempts)));
}, "isTrustedManualReminderIntent");
var COLLECTION2 = "homework_manual_reminder_intents";
var required4 = /* @__PURE__ */ __name2((env, key) => {
  const value = env[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`missing_${key.toLowerCase()}`);
  return value.trim();
}, "required");
var encode42 = /* @__PURE__ */ __name2((value) => {
  if (value === null) return { nullValue: "NULL_VALUE" };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "number") return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encode42) } };
  if (typeof value === "object" && value) return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encode42(item)])) } };
  throw new Error("deadline_firestore_value_invalid");
}, "encode");
var decode3 = /* @__PURE__ */ __name2((value) => {
  if ("nullValue" in value) return null;
  if ("booleanValue" in value) return value.booleanValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("stringValue" in value) return value.stringValue;
  if ("mapValue" in value) return Object.fromEntries(Object.entries(value.mapValue?.fields ?? {}).map(([key, item]) => [key, decode3(item)]));
  if ("arrayValue" in value) return (value.arrayValue?.values ?? []).map(decode3);
  return null;
}, "decode");
var decoded = /* @__PURE__ */ __name2((document) => Object.fromEntries(
  Object.entries(document.fields ?? {}).map(([key, value]) => [key, decode3(value)])
), "decoded");
var FirebaseDeadlineNotificationStorage = class {
  static {
    __name(this, "FirebaseDeadlineNotificationStorage");
  }
  constructor(env, fetchImpl = globalThis.fetch) {
    this.env = env;
    this.projectId = encodeURIComponent(required4(env, "FIREBASE_PROJECT_ID"));
    this.fetchImpl = fetchImpl;
    this.rtdb = new FirebaseRtdbRestClient({ env: {
      FIREBASE_DB_URL: required4(env, "FIREBASE_DB_URL"),
      FIREBASE_PROJECT_ID: required4(env, "FIREBASE_PROJECT_ID"),
      GOOGLE_SA_KEY: required4(env, "NOTIFICATION_COMMAND_GOOGLE_SA_KEY")
    }, fetchImpl });
    this.gate = new RetryFamilyGate(this.rtdb);
  }
  env;
  static {
    __name2(this, "FirebaseDeadlineNotificationStorage");
  }
  projectId;
  fetchImpl;
  rtdb;
  gate;
  retrySuppressed() {
    return this.gate.isSuppressed("homework-reminder");
  }
  recordSuccess(at) {
    return this.gate.recordSuccess("homework-reminder", at);
  }
  async token() {
    const key = JSON.parse(required4(this.env, "NOTIFICATION_COMMAND_GOOGLE_SA_KEY"));
    if (!key.client_email || !key.private_key || key.client_email !== required4(this.env, "NOTIFICATION_COMMAND_SERVICE_IDENTITY")) {
      throw new Error("deadline_service_identity_invalid");
    }
    return this.rtdb.getAccessToken();
  }
  documentsUrl(path = "") {
    return `https://firestore.googleapis.com/v1/projects/${this.projectId}/databases/(default)/documents${path}`;
  }
  async readIntent(eventId) {
    const token2 = await this.token();
    const response10 = await this.fetchImpl.call(globalThis, this.documentsUrl(`/${COLLECTION2}/${encodeURIComponent(eventId)}`), {
      headers: { Authorization: `Bearer ${token2}` }
    });
    if (response10.status === 404) return null;
    if (!response10.ok) throw new Error(`deadline_intent_read_failed:${response10.status}`);
    const document = await response10.json();
    if (!document.updateTime || !document.fields) return null;
    return { intent: decoded(document), version: document.updateTime };
  }
  async readHomework(homeworkId, studentId) {
    const token2 = await this.token();
    const response10 = await this.fetchImpl.call(globalThis, this.documentsUrl(`/homework_assignments/${encodeURIComponent(homeworkId)}`), {
      headers: { Authorization: `Bearer ${token2}` }
    });
    if (response10.status === 404) return null;
    if (!response10.ok) throw new Error(`deadline_homework_read_failed:${response10.status}`);
    const value = decoded(await response10.json());
    if (value.target && typeof value.target === "object" && !Array.isArray(value.target)) {
      const target = value.target;
      if (target.type === "class" && typeof target.classId === "string") {
        value.classStudents = await this.rtdb.readValue(`classes/${target.classId}/students`);
      } else if (target.type === "course" && typeof target.courseId === "string") {
        const enrollments = await this.rtdb.readValue("course_enrollments", {
          orderBy: "studentId",
          equalTo: studentId,
          limitToFirst: 30
        });
        value.courseEnrollments = enrollments && typeof enrollments === "object" && !Array.isArray(enrollments) ? Object.values(enrollments) : [];
      }
    }
    return value;
  }
  async updateIntent(eventId, intent, version) {
    const token2 = await this.token();
    const response10 = await this.fetchImpl.call(globalThis, `${this.documentsUrl(`/${COLLECTION2}/${encodeURIComponent(eventId)}`)}?updateMask.fieldPaths=${Object.keys(intent).map(encodeURIComponent).join("&updateMask.fieldPaths=")}&currentDocument.updateTime=${encodeURIComponent(version)}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token2}`, "Content-Type": "application/json" },
      body: JSON.stringify({ fields: Object.fromEntries(Object.entries(intent).map(([key, value]) => [key, encode42(value)])) })
    });
    if (response10.status === 409 || response10.status === 412) return null;
    if (!response10.ok) throw new Error(`deadline_intent_update_failed:${response10.status}`);
    const document = await response10.json();
    return document.updateTime ?? null;
  }
  async dueIntents(now, limit = 5) {
    const token2 = await this.token();
    const response10 = await this.fetchImpl.call(globalThis, `${this.documentsUrl()}:runQuery`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token2}`, "Content-Type": "application/json" },
      body: JSON.stringify({ structuredQuery: {
        from: [{ collectionId: COLLECTION2 }],
        where: { fieldFilter: { field: { fieldPath: "dueAt" }, op: "LESS_THAN_OR_EQUAL", value: { integerValue: String(now) } } },
        orderBy: [{ field: { fieldPath: "dueAt" }, direction: "ASCENDING" }],
        limit
      } })
    });
    if (!response10.ok) throw new Error(`deadline_retry_query_failed:${response10.status}`);
    const rows = await response10.json();
    return rows.flatMap((row9) => row9.document?.name && row9.document.updateTime && row9.document.fields ? [row9.document] : []).map((document) => ({ intent: decoded(document), version: document.updateTime })).filter(({ intent }) => intent.dueAt <= now && ["pending", "retry_due", "retrying"].includes(intent.state));
  }
  async notificationExists(intent) {
    const id = deadlineNotificationId(intent.eventId, intent.studentId);
    const path = `notifications/${intent.studentId}/${id}`;
    const row9 = await this.rtdb.readValue(path);
    return row9?.id === id && row9.type === "homework_reminder";
  }
  async reportFailure(intent, now, reasonCode) {
    const path = notificationIssuePath(intent.eventId, intent.occurredAt);
    const existing = await this.rtdb.readWithEtag(path);
    if (existing.data !== null) return;
    if (await this.rtdb.writeIfMatch(path, {
      id: intent.eventId,
      timestamp: now,
      feature: "homework",
      severity: "error",
      message: `Teacher homework reminder notification delivery failed (${reasonCode}).`,
      userId: intent.actorUid,
      userName: "Notification Worker",
      userRole: "service",
      duplicateCount: 1,
      contextData: {
        eventId: intent.eventId,
        homeworkId: intent.homeworkId,
        recipientId: intent.studentId,
        reasonCode
      }
    }, existing.etag)) await this.gate.recordTerminalFailure("homework-reminder", intent.eventId, path);
  }
};
var createHandlers = /* @__PURE__ */ __name2((env) => createDeadlineNotificationHandlers({
  storage: new FirebaseDeadlineNotificationStorage(env),
  repository: new FirebaseRestNotificationCommandRepository({ env })
}), "createHandlers");
var handleDeadlineNotificationAction = /* @__PURE__ */ __name2(async (request, env, uid) => {
  try {
    return await createHandlers(env).action({ request, uid });
  } catch {
    return { body: { code: "deadline_action_unavailable" }, init: { status: 503 } };
  }
}, "handleDeadlineNotificationAction");
var retryDueDeadlineNotifications = /* @__PURE__ */ __name2(async (env) => {
  await createHandlers(env).retryDue();
}, "retryDueDeadlineNotifications");
var ID52 = /^[A-Za-z0-9_-]{1,128}$/u;
var RETRY_DELAY_MS4 = 60 * 60 * 1e3;
var ENROLLMENT_INTENT_DONE_DUE_AT = 864e13;
var record5 = /* @__PURE__ */ __name2((value) => value && typeof value === "object" && !Array.isArray(value) ? value : null, "record");
var parseEnrollmentAction = /* @__PURE__ */ __name2(async (request) => {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    throw new Error("enrollment_action_content_type_required");
  }
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 1024) throw new Error("enrollment_action_body_too_large");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("enrollment_action_invalid_json");
  }
  const value = record5(parsed);
  if (!value || Object.keys(value).sort().join(",") !== "actionId,schemaVersion" || value.schemaVersion !== 1 || typeof value.actionId !== "string" || !ID52.test(value.actionId) || request.headers.get("Idempotency-Key") !== value.actionId) {
    throw new Error("enrollment_action_invalid");
  }
  return value;
}, "parseEnrollmentAction");
var hash323 = /* @__PURE__ */ __name2((value, seed) => {
  let hash = (2166136261 ^ seed) >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 16777619) >>> 0;
  }
  return hash;
}, "hash32");
var courseRequestNotificationId = /* @__PURE__ */ __name2((actionId, recipientId) => {
  const value = `${actionId}:${recipientId}`;
  const hex = [0, 1, 2, 3].map((seed) => hash323(`${value}:${seed}`, seed).toString(16).padStart(8, "0")).join("");
  const versioned = `${hex.slice(0, 12)}5${hex.slice(13, 16)}8${hex.slice(17)}`;
  return `${versioned.slice(0, 8)}-${versioned.slice(8, 12)}-${versioned.slice(12, 16)}-${versioned.slice(16, 20)}-${versioned.slice(20)}`;
}, "courseRequestNotificationId");
var validIntent = /* @__PURE__ */ __name2((request, requestId) => {
  const intent = record5(request.notificationIntent);
  if (!intent || intent.schemaVersion !== 1 || intent.actionId !== requestId || intent.kind !== "course-request-decision" || intent.occurredAt !== request.processedAt || typeof intent.dueAt !== "number" || typeof intent.attempts !== "number" || ![0, 1, 2].includes(intent.attempts) || !["pending", "sending", "retry_due", "retrying", "done", "failed"].includes(String(intent.state))) return null;
  if (intent.attempts === 0 && (intent.state !== "pending" || intent.dueAt !== Number(request.processedAt) + RETRY_DELAY_MS4)) return null;
  if (intent.attempts > 0 && intent.dueAt < Number(request.processedAt) + RETRY_DELAY_MS4) return null;
  return intent;
}, "validIntent");
var noticeFor = /* @__PURE__ */ __name2((request, course, intent) => {
  if (typeof request.studentId !== "string" || !ID52.test(request.studentId) || request.type !== "join" && request.type !== "unenroll" || request.status !== "approved" && request.status !== "denied" || typeof course.name !== "string" || !course.name.trim()) return null;
  const approved = request.status === "approved";
  const verb = request.type === "join" ? "join" : "leave";
  const title = approved ? "Course Request Approved" : "Course Request Declined";
  const message22 = `Your request to ${verb} "${course.name.trim().slice(0, 120)}" was ${approved ? "approved" : "declined"}.`;
  return {
    operationId: courseRequestNotificationId(intent.actionId, request.studentId),
    recipientId: request.studentId,
    notification: {
      type: approved ? "success" : "info",
      title,
      message: message22,
      link: buildRoute2("STUDENT_COURSES")
    }
  };
}, "noticeFor");
var deliverCourseRequestIntent = /* @__PURE__ */ __name2(async (request, course, intent, repository) => {
  const notice = noticeFor(request, course, intent);
  if (!notice) return "invalid";
  try {
    const result = await repository.create({ ...notice, now: intent.occurredAt });
    return result.status === "idempotency-conflict" ? "conflict" : "delivered";
  } catch {
    return "unavailable";
  }
}, "deliverCourseRequestIntent");
var performEnrollmentAction = /* @__PURE__ */ __name2(async (input) => {
  const request = record5(await input.storage.read(`course_requests/${input.command.actionId}`));
  if (!request) return { status: 404, body: { code: "course_request_not_found" } };
  const intent = validIntent(request, input.command.actionId);
  const courseId = request.courseId;
  if (request.id !== input.command.actionId || !intent || typeof courseId !== "string" || !ID52.test(courseId) || typeof request.studentId !== "string" || !ID52.test(request.studentId) || typeof request.expiresAt !== "number" || typeof request.processedAt !== "number" || request.processedAt > request.expiresAt || request.processedAt > (input.now ?? Date.now)() || typeof request.teacherId !== "string" || typeof request.processedBy !== "string" || request.status !== "approved" && request.status !== "denied") {
    return { status: 409, body: { code: "course_request_action_not_committed" } };
  }
  if (request.processedBy !== input.actorUid) {
    return { status: 403, body: { code: "course_request_actor_forbidden" } };
  }
  const [course, actor, student] = await Promise.all([
    input.storage.read(`courses/${courseId}`).then(record5),
    input.storage.read(`users/${input.actorUid}`).then(record5),
    input.storage.read(`users/${request.studentId}`).then(record5)
  ]);
  if (!course || !actor || course.ownerId !== request.teacherId || !student || student.role !== "student" || input.actorUid !== course.ownerId && actor.role !== "super_admin") {
    return { status: 403, body: { code: "course_request_owner_forbidden" } };
  }
  if (intent.state === "done") {
    return { status: 200, body: { status: "replayed", actionId: intent.actionId, notificationStatus: "delivered" } };
  }
  if (intent.state !== "pending" || intent.attempts !== 0) {
    return { status: 200, body: { status: "replayed", actionId: intent.actionId, notificationStatus: intent.state } };
  }
  const claimed = await input.storage.claimImmediate(input.command.actionId, (input.now ?? Date.now)());
  if (!claimed) {
    return { status: 200, body: { status: "replayed", actionId: intent.actionId, notificationStatus: "sending" } };
  }
  let delivery = "unavailable";
  try {
    delivery = await deliverCourseRequestIntent(request, course, claimed, input.repository());
  } catch {
  }
  try {
    await input.storage.updateIntent(input.command.actionId, {
      ...claimed,
      state: delivery === "delivered" ? "done" : "retry_due",
      dueAt: delivery === "delivered" ? ENROLLMENT_INTENT_DONE_DUE_AT : (input.now ?? Date.now)() + RETRY_DELAY_MS4
    });
  } catch {
  }
  return {
    status: 200,
    body: { status: "committed", actionId: intent.actionId, notificationStatus: delivery === "delivered" ? "delivered" : "retry_due" }
  };
}, "performEnrollmentAction");
var retryDueCourseRequestNotifications = /* @__PURE__ */ __name2(async (storage, repository, now = Date.now()) => {
  for (const row9 of await storage.dueRequests(now)) {
    if (row9.intent.state === "retrying" && row9.intent.attempts === 2) {
      const delivered2 = await storage.notificationExists(row9.requestId, row9.intent);
      if (!delivered2) await storage.reportFailure(row9.requestId, row9.intent);
      await storage.updateIntent(row9.requestId, {
        ...row9.intent,
        state: delivered2 ? "done" : "failed",
        dueAt: ENROLLMENT_INTENT_DONE_DUE_AT
      });
      continue;
    }
    const claimed = await storage.claimRetry(row9.requestId, now);
    if (!claimed) continue;
    const request = record5(await storage.read(`course_requests/${row9.requestId}`));
    const courseId = request?.courseId;
    const course = typeof courseId === "string" ? record5(await storage.read(`courses/${courseId}`)) : null;
    const studentId = request?.studentId;
    const student = typeof studentId === "string" ? record5(await storage.read(`users/${studentId}`)) : null;
    let delivery = "invalid";
    if (request && request.id === row9.requestId && course && student?.role === "student" && course.ownerId === request.teacherId && typeof request.processedAt === "number" && typeof request.expiresAt === "number" && request.processedAt <= request.expiresAt && typeof request.processedBy === "string" && validIntent(request, row9.requestId)) {
      delivery = await deliverCourseRequestIntent(request, course, claimed, repository);
    }
    const delivered = delivery === "delivered";
    if (!delivered && claimed.attempts === 2) await storage.reportFailure(row9.requestId, claimed);
    await storage.updateIntent(row9.requestId, {
      ...claimed,
      state: delivered ? "done" : claimed.attempts === 1 ? "retry_due" : "failed",
      dueAt: delivered || claimed.attempts === 2 ? ENROLLMENT_INTENT_DONE_DUE_AT : now + RETRY_DELAY_MS4
    });
    if (delivery === "unavailable") break;
  }
}, "retryDueCourseRequestNotifications");
var required5 = /* @__PURE__ */ __name2((env, key) => {
  const value = env[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`missing_${key.toLowerCase()}`);
  return value.trim();
}, "required");
var row3 = /* @__PURE__ */ __name2((value) => value && typeof value === "object" && !Array.isArray(value) ? value : null, "row");
var FirebaseCourseRequestNotificationStorage = class {
  static {
    __name(this, "FirebaseCourseRequestNotificationStorage");
  }
  static {
    __name2(this, "FirebaseCourseRequestNotificationStorage");
  }
  rtdb;
  constructor(env, fetchImpl = globalThis.fetch) {
    this.rtdb = new FirebaseRtdbRestClient({
      env: {
        FIREBASE_DB_URL: required5(env, "FIREBASE_DB_URL"),
        FIREBASE_PROJECT_ID: required5(env, "FIREBASE_PROJECT_ID"),
        GOOGLE_SA_KEY: required5(env, "NOTIFICATION_COMMAND_GOOGLE_SA_KEY")
      },
      fetchImpl
    });
  }
  read(path) {
    return this.rtdb.readValue(path);
  }
  async claimImmediate(requestId, now) {
    const path = `course_requests/${requestId}/notificationIntent`;
    const current = await this.rtdb.readWithEtag(path);
    const intent = current.data;
    if (!intent || intent.actionId !== requestId || intent.state !== "pending" || intent.attempts !== 0) return null;
    const claimed = { ...intent, state: "sending", attempts: 1, dueAt: now + 60 * 60 * 1e3 };
    return await this.rtdb.writeIfMatch(path, claimed, current.etag) ? claimed : null;
  }
  async updateIntent(requestId, intent) {
    const path = `course_requests/${requestId}/notificationIntent`;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const current = await this.rtdb.readWithEtag(path);
      if (!current.data || current.data.actionId !== requestId || current.data.kind !== intent.kind || current.data.occurredAt !== intent.occurredAt) {
        throw new Error("course_request_notification_intent_changed");
      }
      if (current.data.state === "done" || current.data.state === "failed") return;
      if (await this.rtdb.writeIfMatch(path, intent, current.etag)) return;
    }
    throw new Error("course_request_notification_intent_cas_failed");
  }
  async claimRetry(requestId, now) {
    const path = `course_requests/${requestId}/notificationIntent`;
    const current = await this.rtdb.readWithEtag(path);
    const intent = current.data;
    if (!intent || intent.actionId !== requestId || intent.dueAt > now || !["pending", "sending", "retry_due", "retrying"].includes(intent.state) || intent.attempts >= 2) return null;
    const claimed = {
      ...intent,
      state: "retrying",
      attempts: intent.attempts + 1,
      dueAt: now + 60 * 60 * 1e3
    };
    return await this.rtdb.writeIfMatch(path, claimed, current.etag) ? claimed : null;
  }
  async notificationExists(requestId, intent) {
    const request = row3(await this.read(`course_requests/${requestId}`));
    if (typeof request?.studentId !== "string") return false;
    const stored = await this.read(`notifications/${request.studentId}/${courseRequestNotificationId(intent.actionId, request.studentId)}`);
    return row3(stored)?.id === courseRequestNotificationId(intent.actionId, request.studentId);
  }
  async dueRequests(now, limit = 2) {
    const requests = await this.rtdb.readValue("course_requests", {
      orderBy: "notificationIntent/dueAt",
      startAt: 0,
      limitToFirst: limit
    });
    if (!requests || typeof requests !== "object" || Array.isArray(requests)) return [];
    return Object.entries(requests).flatMap(([requestId, value]) => {
      const intent = row3(row3(value)?.notificationIntent);
      if (!intent || typeof intent.dueAt !== "number" || intent.dueAt > now || !["pending", "sending", "retry_due", "retrying"].includes(String(intent.state))) return [];
      return [{ requestId, intent }];
    });
  }
  async reportFailure(requestId, intent) {
    const now = Date.now();
    const date = new Date(now).toISOString().slice(0, 10);
    const path = `reports/errors/${date}/${intent.actionId}`;
    const current = await this.rtdb.readWithEtag(path);
    if (current.data !== null) return;
    await this.rtdb.writeIfMatch(path, {
      id: intent.actionId,
      timestamp: now,
      feature: "courses",
      severity: "error",
      message: "Course request notification delivery failed after one retry.",
      userId: requestId,
      userName: "Notification Worker",
      userRole: "service",
      duplicateCount: 1,
      contextData: { actionId: intent.actionId, requestId, failedRecipientCount: 1 }
    }, current.etag);
  }
};
var ID6 = /^[A-Za-z0-9_-]{1,128}$/u;
var RETRY_DELAY_MS5 = 60 * 60 * 1e3;
var ASSIGNMENT_INTENT_DONE_DUE_AT = 864e13;
var row22 = /* @__PURE__ */ __name2((value) => value && typeof value === "object" && !Array.isArray(value) ? value : null, "row");
var parseAssignmentAction = /* @__PURE__ */ __name2(async (request) => {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) throw new Error("assignment_action_content_type_required");
  const text2 = await request.text();
  if (new TextEncoder().encode(text2).byteLength > 1024) throw new Error("assignment_action_body_too_large");
  let parsed;
  try {
    parsed = JSON.parse(text2);
  } catch {
    throw new Error("assignment_action_invalid_json");
  }
  const value = row22(parsed);
  if (!value || Object.keys(value).sort().join(",") !== "actionId,schemaVersion" || value.schemaVersion !== 1 || typeof value.actionId !== "string" || !ID6.test(value.actionId) || request.headers.get("Idempotency-Key") !== value.actionId) throw new Error("assignment_action_invalid");
  return value;
}, "parseAssignmentAction");
var hash324 = /* @__PURE__ */ __name2((value, seed) => {
  let hash = (2166136261 ^ seed) >>> 0;
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619) >>> 0;
  return hash;
}, "hash32");
var assignmentNotificationId = /* @__PURE__ */ __name2((actionId, recipientId) => {
  const value = `${actionId}:${recipientId}`;
  const hex = [0, 1, 2, 3].map((seed) => hash324(`${value}:${seed}`, seed).toString(16).padStart(8, "0")).join("");
  const v = `${hex.slice(0, 12)}5${hex.slice(13, 16)}8${hex.slice(17)}`;
  return `${v.slice(0, 8)}-${v.slice(8, 12)}-${v.slice(12, 16)}-${v.slice(16, 20)}-${v.slice(20)}`;
}, "assignmentNotificationId");
var validIntent2 = /* @__PURE__ */ __name2((request, id) => {
  const intent = row22(request.notificationIntent);
  if (!intent || intent.schemaVersion !== 1 || intent.actionId !== id || intent.kind !== "assignment-request-approved" || intent.occurredAt !== request.reviewedAt || typeof intent.dueAt !== "number" || ![0, 1, 2].includes(Number(intent.attempts)) || !["pending", "sending", "retry_due", "retrying", "done", "failed"].includes(String(intent.state))) return null;
  if (intent.attempts === 0 && (intent.state !== "pending" || intent.dueAt !== Number(request.reviewedAt) + RETRY_DELAY_MS5)) return null;
  if (intent.attempts > 0 && intent.dueAt < Number(request.reviewedAt) + RETRY_DELAY_MS5) return null;
  return intent;
}, "validIntent");
var noticesFor2 = /* @__PURE__ */ __name2((request, student, teacher, intent) => {
  if (request.status !== "approved" || typeof request.studentId !== "string" || typeof request.teacherId !== "string" || !ID6.test(request.studentId) || !ID6.test(request.teacherId)) return null;
  const studentName = typeof student.displayName === "string" && student.displayName.trim() || typeof student.email === "string" && student.email.trim() || "student";
  const teacherName2 = typeof teacher.displayName === "string" && teacher.displayName.trim() || typeof teacher.email === "string" && teacher.email.trim() || "your teacher";
  return [
    {
      recipientId: request.teacherId,
      type: "success",
      title: "Student Request Approved",
      message: `Your request for student ${studentName.slice(0, 100)} has been approved.`,
      link: buildRoute2("TEACHER_STUDENTS")
    },
    {
      recipientId: request.studentId,
      type: "info",
      title: "New Teacher Assigned",
      message: `You have been assigned to ${teacherName2.slice(0, 100)}.`,
      link: buildRoute2("STUDENT_DASHBOARD")
    }
  ].map(({ recipientId, ...notification }) => ({
    recipientId,
    operationId: assignmentNotificationId(intent.actionId, recipientId),
    notification
  }));
}, "noticesFor");
var deliver = /* @__PURE__ */ __name2(async (request, student, teacher, intent, repository) => {
  const notices = noticesFor2(request, student, teacher, intent);
  if (!notices) return "invalid";
  try {
    for (const notice of notices) {
      const result = await repository.create({ ...notice, now: intent.occurredAt });
      if (result.status === "idempotency-conflict") return "conflict";
    }
    return "delivered";
  } catch {
    return "unavailable";
  }
}, "deliver");
var performAssignmentAction = /* @__PURE__ */ __name2(async (input) => {
  const id = input.command.actionId;
  const request = row22(await input.storage.read(`student_requests/${id}`));
  const intent = request && validIntent2(request, id);
  if (!request || !intent || request.id !== id || request.status !== "approved" || request.reviewedBy !== input.actorUid || typeof request.studentId !== "string" || typeof request.assignmentId !== "string" || typeof request.reviewedAt !== "number" || request.reviewedAt > (input.now ?? Date.now)()) return { status: 409, body: { code: "assignment_action_not_committed" } };
  const [actor, assignment, student, teacher] = await Promise.all([
    input.storage.read(`users/${input.actorUid}`).then(row22),
    input.storage.read(`student_teacher_assignments/${request.assignmentId}`).then(row22),
    input.storage.read(`users/${request.studentId}`).then(row22),
    input.storage.read(`users/${request.teacherId}`).then(row22)
  ]);
  if (actor?.role !== "super_admin" || !assignment || assignment.id !== request.assignmentId || assignment.status !== "active" || assignment.studentId !== request.studentId || assignment.teacherId !== request.teacherId || student?.role !== "student" || teacher?.role !== "teacher") {
    return { status: 403, body: { code: "assignment_action_authority_invalid" } };
  }
  if (intent.state === "done") return { status: 200, body: { status: "replayed", notificationStatus: "delivered" } };
  if (intent.state !== "pending" || intent.attempts !== 0) return { status: 200, body: { status: "replayed", notificationStatus: intent.state } };
  const claimed = await input.storage.claimImmediate(id, (input.now ?? Date.now)());
  if (!claimed) return { status: 200, body: { status: "replayed", notificationStatus: "sending" } };
  let result = "unavailable";
  try {
    result = await deliver(request, student, teacher, claimed, input.repository());
  } catch {
  }
  try {
    await input.storage.updateIntent(id, {
      ...claimed,
      state: result === "delivered" ? "done" : "retry_due",
      dueAt: result === "delivered" ? ASSIGNMENT_INTENT_DONE_DUE_AT : (input.now ?? Date.now)() + RETRY_DELAY_MS5
    });
  } catch {
  }
  return { status: 200, body: { status: "committed", notificationStatus: result === "delivered" ? "delivered" : "retry_due" } };
}, "performAssignmentAction");
var retryDueAssignmentNotifications = /* @__PURE__ */ __name2(async (storage, repository, now = Date.now) => {
  for (const item of await storage.dueRequests(now())) {
    if (item.intent.state === "retrying" && item.intent.attempts === 2) {
      const delivered2 = await storage.notificationsExist(item.requestId, item.intent);
      if (!delivered2) await storage.reportFailure(item.requestId, item.intent);
      await storage.updateIntent(item.requestId, { ...item.intent, state: delivered2 ? "done" : "failed", dueAt: ASSIGNMENT_INTENT_DONE_DUE_AT });
      continue;
    }
    const claimed = await storage.claimRetry(item.requestId, now());
    if (!claimed) continue;
    const request = row22(await storage.read(`student_requests/${item.requestId}`));
    const [assignment, student, teacher] = await Promise.all([
      typeof request?.assignmentId === "string" ? storage.read(`student_teacher_assignments/${request.assignmentId}`).then(row22) : null,
      typeof request?.studentId === "string" ? storage.read(`users/${request.studentId}`).then(row22) : null,
      typeof request?.teacherId === "string" ? storage.read(`users/${request.teacherId}`).then(row22) : null
    ]);
    let result = "invalid";
    if (request && request.id === item.requestId && request.status === "approved" && validIntent2(request, item.requestId) && assignment?.status === "active" && assignment.studentId === request.studentId && assignment.teacherId === request.teacherId && student?.role === "student" && teacher?.role === "teacher") result = await deliver(request, student, teacher, claimed, repository);
    const delivered = result === "delivered";
    if (!delivered && claimed.attempts === 2) await storage.reportFailure(item.requestId, claimed);
    await storage.updateIntent(item.requestId, {
      ...claimed,
      state: delivered ? "done" : claimed.attempts === 1 ? "retry_due" : "failed",
      dueAt: delivered || claimed.attempts === 2 ? ASSIGNMENT_INTENT_DONE_DUE_AT : now() + RETRY_DELAY_MS5
    });
    if (result === "unavailable") break;
  }
}, "retryDueAssignmentNotifications");
var required6 = /* @__PURE__ */ __name2((env, key) => {
  const value = env[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`missing_${key.toLowerCase()}`);
  return value.trim();
}, "required");
var row32 = /* @__PURE__ */ __name2((value) => value && typeof value === "object" && !Array.isArray(value) ? value : null, "row");
var FirebaseAssignmentNotificationStorage = class {
  static {
    __name(this, "FirebaseAssignmentNotificationStorage");
  }
  static {
    __name2(this, "FirebaseAssignmentNotificationStorage");
  }
  rtdb;
  constructor(env, fetchImpl = globalThis.fetch) {
    this.rtdb = new FirebaseRtdbRestClient({ env: {
      FIREBASE_DB_URL: required6(env, "FIREBASE_DB_URL"),
      FIREBASE_PROJECT_ID: required6(env, "FIREBASE_PROJECT_ID"),
      GOOGLE_SA_KEY: required6(env, "NOTIFICATION_COMMAND_GOOGLE_SA_KEY")
    }, fetchImpl });
  }
  read(path) {
    return this.rtdb.readValue(path);
  }
  async updateIntent(id, intent) {
    const path = `student_requests/${id}/notificationIntent`;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const current = await this.rtdb.readWithEtag(path);
      if (!current.data || current.data.actionId !== id || current.data.kind !== intent.kind || current.data.occurredAt !== intent.occurredAt) throw new Error("assignment_notification_intent_changed");
      if (current.data.state === "done" || current.data.state === "failed") return;
      if (await this.rtdb.writeIfMatch(path, intent, current.etag)) return;
    }
    throw new Error("assignment_notification_intent_cas_failed");
  }
  async claimImmediate(id, now) {
    const path = `student_requests/${id}/notificationIntent`;
    const current = await this.rtdb.readWithEtag(path);
    const intent = current.data;
    if (!intent || intent.actionId !== id || intent.state !== "pending" || intent.attempts !== 0) return null;
    const claimed = { ...intent, state: "sending", attempts: 1, dueAt: now + 60 * 60 * 1e3 };
    return await this.rtdb.writeIfMatch(path, claimed, current.etag) ? claimed : null;
  }
  async dueRequests(now, limit = 2) {
    const requests = await this.rtdb.readValue("student_requests", { orderBy: "notificationIntent/dueAt", startAt: 0, limitToFirst: limit });
    if (!requests || typeof requests !== "object" || Array.isArray(requests)) return [];
    return Object.entries(requests).flatMap(([requestId, value]) => {
      const intent = row32(row32(value)?.notificationIntent);
      if (!intent || typeof intent.dueAt !== "number" || intent.dueAt > now || !["pending", "sending", "retry_due", "retrying"].includes(String(intent.state))) return [];
      return [{ requestId, intent }];
    });
  }
  async claimRetry(id, now) {
    const path = `student_requests/${id}/notificationIntent`;
    const current = await this.rtdb.readWithEtag(path);
    const intent = current.data;
    if (!intent || intent.actionId !== id || intent.dueAt > now || !["pending", "sending", "retry_due", "retrying"].includes(intent.state) || intent.attempts >= 2) return null;
    const claimed = { ...intent, state: "retrying", attempts: intent.attempts + 1, dueAt: now + 60 * 60 * 1e3 };
    return await this.rtdb.writeIfMatch(path, claimed, current.etag) ? claimed : null;
  }
  async notificationsExist(id, intent) {
    const request = row32(await this.read(`student_requests/${id}`));
    if (typeof request?.studentId !== "string" || typeof request.teacherId !== "string") return false;
    const [studentNotice, teacherNotice] = await Promise.all([
      this.read(`notifications/${request.studentId}/${assignmentNotificationId(intent.actionId, request.studentId)}`).then(row32),
      this.read(`notifications/${request.teacherId}/${assignmentNotificationId(intent.actionId, request.teacherId)}`).then(row32)
    ]);
    return studentNotice?.id === assignmentNotificationId(intent.actionId, request.studentId) && teacherNotice?.id === assignmentNotificationId(intent.actionId, request.teacherId);
  }
  async reportFailure(id, intent) {
    const now = Date.now();
    const date = new Date(now).toISOString().slice(0, 10);
    const path = `reports/errors/${date}/${intent.actionId}`;
    const current = await this.rtdb.readWithEtag(path);
    if (current.data !== null) return;
    await this.rtdb.writeIfMatch(path, {
      id: intent.actionId,
      timestamp: now,
      feature: "assignments",
      severity: "error",
      message: "Assignment approval notifications failed after one retry.",
      userId: id,
      userName: "Notification Worker",
      userRole: "service",
      duplicateCount: 1,
      contextData: { actionId: intent.actionId, requestId: id, failedRecipientCount: 2 }
    }, current.etag);
  }
};
var COMMAND_PATH = "/book-notifications/commands";
var CLASS_ACTION_PATH = "/class-notifications/actions";
var COURSE_TYPE_PATH = "/notifications/course-type-decisions/dispatch";
var DEADLINE_ACTION_PATH = "/deadline-notifications/actions";
var ENROLLMENT_ACTION_PATH = "/enrollment-notifications/actions";
var ASSIGNMENT_ACTION_PATH = "/assignment-notifications/actions";
var ALLOWED_ORIGINS = /* @__PURE__ */ new Set([
  "https://kahut1.web.app",
  "https://hocthem.net",
  "http://localhost:5173",
  "http://localhost:5174"
]);
var SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/u;
var stringBinding = /* @__PURE__ */ __name2((env, name) => {
  const value = env[name];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}, "stringBinding");
var corsHeaders = /* @__PURE__ */ __name2((request) => {
  const headers2 = new Headers({
    "Cache-Control": "no-store",
    Vary: "Origin, Access-Control-Request-Method, Access-Control-Request-Headers"
  });
  const origin = request.headers.get("Origin");
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers2.set("Access-Control-Allow-Origin", origin);
    headers2.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    headers2.set(
      "Access-Control-Allow-Headers",
      "Authorization, Content-Type, Idempotency-Key"
    );
  }
  return headers2;
}, "corsHeaders");
var json2 = /* @__PURE__ */ __name2((request, body, status) => {
  const headers2 = corsHeaders(request);
  headers2.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body), { status, headers: headers2 });
}, "json");
var hash325 = /* @__PURE__ */ __name2((value, seed) => {
  let hash = (2166136261 ^ seed) >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 16777619) >>> 0;
  }
  return hash;
}, "hash32");
var notificationOperationId2 = /* @__PURE__ */ __name2((operationKey) => {
  const hex = [0, 1, 2, 3].map((seed) => hash325(`${operationKey}:${seed}`, seed).toString(16).padStart(8, "0")).join("");
  const versioned = `${hex.slice(0, 12)}5${hex.slice(13, 16)}8${hex.slice(17)}`;
  return `${versioned.slice(0, 8)}-${versioned.slice(8, 12)}-${versioned.slice(12, 16)}-${versioned.slice(16, 20)}-${versioned.slice(20)}`;
}, "notificationOperationId");
var defaultRepositoryFactory = /* @__PURE__ */ __name2((env) => {
  const databaseUrl = stringBinding(env, "FIREBASE_DB_URL");
  const projectId = stringBinding(env, "FIREBASE_PROJECT_ID");
  const serviceIdentity = stringBinding(env, "NOTIFICATION_COMMAND_SERVICE_IDENTITY");
  const serviceKey = stringBinding(env, "NOTIFICATION_COMMAND_GOOGLE_SA_KEY");
  if (!databaseUrl || !projectId || !serviceIdentity || !serviceKey) {
    throw new Error("notification_command_runtime_unavailable");
  }
  return new FirebaseRestNotificationCommandRepository({
    env: {
      FIREBASE_DB_URL: databaseUrl,
      FIREBASE_PROJECT_ID: projectId,
      NOTIFICATION_COMMAND_SERVICE_IDENTITY: serviceIdentity,
      NOTIFICATION_COMMAND_GOOGLE_SA_KEY: serviceKey
    }
  });
}, "defaultRepositoryFactory");
var defaultReadDatabaseValue = /* @__PURE__ */ __name2(async (env, path) => {
  const databaseUrl = stringBinding(env, "FIREBASE_DB_URL");
  const projectId = stringBinding(env, "FIREBASE_PROJECT_ID");
  const serviceKey = stringBinding(env, "NOTIFICATION_COMMAND_GOOGLE_SA_KEY");
  if (!databaseUrl || !projectId || !serviceKey) {
    throw new Error("notification_command_runtime_unavailable");
  }
  const client = new FirebaseRtdbRestClient({
    env: {
      FIREBASE_DB_URL: databaseUrl,
      FIREBASE_PROJECT_ID: projectId,
      GOOGLE_SA_KEY: serviceKey
    },
    fetchImpl: globalThis.fetch
  });
  return client.readValue(path);
}, "defaultReadDatabaseValue");
var asRecord = /* @__PURE__ */ __name2((value) => value && typeof value === "object" && !Array.isArray(value) ? value : null, "asRecord");
var trustedHomeworkSubmission = /* @__PURE__ */ __name2((result, input) => {
  const record18 = asRecord(result);
  const context = asRecord(record18?.context);
  const visibility = asRecord(record18?.visibility);
  if (!record18 || !context || !visibility || record18.resultId !== input.resultId || record18.studentId !== input.actorUid || context.type !== "homework" || visibility.ownershipResolved !== true || typeof visibility.visibilityOwnerTeacherId !== "string" || !SAFE_ID.test(visibility.visibilityOwnerTeacherId)) {
    return null;
  }
  const homeworkId = visibility.homeworkId;
  if (typeof homeworkId !== "string" || !SAFE_ID.test(homeworkId)) return null;
  return { homeworkId, teacherId: visibility.visibilityOwnerTeacherId };
}, "trustedHomeworkSubmission");
var readCommittedEvent = /* @__PURE__ */ __name2(async (request) => {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    throw new NotificationCommandSchemaError("content_type_required");
  }
  const text2 = await request.text();
  if (new TextEncoder().encode(text2).byteLength > 1024) {
    throw new NotificationCommandSchemaError("notification_command_body_too_large", 413);
  }
  let body;
  try {
    body = JSON.parse(text2);
  } catch {
    throw new NotificationCommandSchemaError("notification_command_invalid_json");
  }
  const event = asRecord(body);
  if (!event || Object.keys(event).sort().join(",") !== "eventKind,recordId,schemaVersion" || event.schemaVersion !== 1 || event.eventKind !== "homework-submitted" || typeof event.recordId !== "string" || !SAFE_ID.test(event.recordId)) {
    throw new NotificationCommandSchemaError("notification_command_invalid");
  }
  return event.recordId;
}, "readCommittedEvent");
var limiterFrom = /* @__PURE__ */ __name2((env) => {
  const value = env.NOTIFICATION_RATE_LIMITER;
  if (!value || typeof value !== "object" || !("limit" in value)) return null;
  const limit = value.limit;
  return typeof limit === "function" ? value : null;
}, "limiterFrom");
var createHomeworkSubmissionNotificationWorker = /* @__PURE__ */ __name2((options = {}) => {
  const firebaseVerifier = options.firebaseVerifier ?? createFirebaseVerifier2();
  const repositoryFactory = options.repositoryFactory ?? defaultRepositoryFactory;
  const readDatabaseValue = options.readDatabaseValue ?? defaultReadDatabaseValue;
  const classStorageFactory = options.classStorageFactory ?? ((env) => new FirebaseClassActionStorage(env));
  const hasCommittedIntent = options.hasCommittedIntent ?? hasCommittedHomeworkNotification;
  const markDelivered = options.markDelivered ?? markHomeworkNotificationDelivered;
  const recordImmediateOutcome = options.recordImmediateOutcome ?? recordHomeworkImmediateOutcome;
  const now = options.now ?? Date.now;
  return {
    async fetch(request, env) {
      const url = new URL(request.url);
      if (url.pathname !== COMMAND_PATH && url.pathname !== CLASS_ACTION_PATH && url.pathname !== COURSE_TYPE_PATH && url.pathname !== DEADLINE_ACTION_PATH && url.pathname !== ENROLLMENT_ACTION_PATH && url.pathname !== ASSIGNMENT_ACTION_PATH || url.search || url.hash) {
        return json2(request, { code: "notification_command_not_found" }, 404);
      }
      const origin = request.headers.get("Origin");
      if (origin && !ALLOWED_ORIGINS.has(origin)) {
        return json2(request, { code: "cors_origin_denied" }, 403);
      }
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders(request) });
      }
      if (request.method !== "POST") {
        return json2(request, { code: "method_not_allowed" }, 405);
      }
      const auth = await firebaseVerifier.verifyAuthorizationHeader(
        request.headers.get("Authorization"),
        env
      );
      if (!auth.valid || typeof auth.uid !== "string" || !auth.uid) {
        return json2(request, { code: "notification_command_unauthenticated" }, 401);
      }
      const limiter = limiterFrom(env);
      if (!limiter) {
        return json2(request, { code: "notification_command_unavailable" }, 503);
      }
      const limited = await limiter.limit({
        key: `${url.pathname === CLASS_ACTION_PATH ? "class-action" : url.pathname === COURSE_TYPE_PATH ? "course-type-decision" : url.pathname === DEADLINE_ACTION_PATH ? "deadline-reminder" : url.pathname === ENROLLMENT_ACTION_PATH ? "enrollment-decision" : url.pathname === ASSIGNMENT_ACTION_PATH ? "assignment-approval" : "homework-submission"}:${auth.uid}`
      });
      if (!limited.success) {
        return json2(request, { code: "rate_limited" }, 429);
      }
      try {
        if (url.pathname === ENROLLMENT_ACTION_PATH) {
          const command = await parseEnrollmentAction(request);
          const result2 = await performEnrollmentAction({
            command,
            actorUid: auth.uid,
            storage: new FirebaseCourseRequestNotificationStorage(env),
            repository: /* @__PURE__ */ __name2(() => repositoryFactory(env), "repository"),
            now
          });
          return json2(request, result2.body, result2.status);
        }
        if (url.pathname === ASSIGNMENT_ACTION_PATH) {
          const command = await parseAssignmentAction(request);
          const result2 = await performAssignmentAction({
            command,
            actorUid: auth.uid,
            storage: new FirebaseAssignmentNotificationStorage(env),
            repository: /* @__PURE__ */ __name2(() => repositoryFactory(env), "repository"),
            now
          });
          return json2(request, result2.body, result2.status);
        }
        if (url.pathname === DEADLINE_ACTION_PATH) {
          const result2 = await handleDeadlineNotificationAction(request, env, auth.uid);
          return json2(request, result2.body, result2.init.status ?? 200);
        }
        if (url.pathname === COURSE_TYPE_PATH) {
          const command = await readCourseTypeDecisionDispatchRequest(request);
          const handlers = createCourseTypeDecisionHandlers({
            storage: new FirebaseCourseTypeDecisionStorage(env),
            repository: repositoryFactory(env),
            now
          });
          const result2 = await handlers.dispatch({ requestId: command.requestId, actorUid: auth.uid });
          const status = result2.status === "forbidden" ? 403 : result2.status === "not_found" ? 404 : result2.status === "stale" ? 409 : 200;
          return json2(request, result2, status);
        }
        if (url.pathname === CLASS_ACTION_PATH) {
          const command = await parseClassAction(request);
          const result2 = await performClassAction({
            command,
            actorUid: auth.uid,
            storage: classStorageFactory(env),
            repository: /* @__PURE__ */ __name2(() => repositoryFactory(env), "repository"),
            now
          });
          return json2(request, result2.body, result2.status);
        }
        const recordId = await readCommittedEvent(request);
        const canonical3 = trustedHomeworkSubmission(
          await readDatabaseValue(env, `test_results/${recordId}`),
          {
            resultId: recordId,
            actorUid: auth.uid
          }
        );
        if (!canonical3) {
          return json2(request, { code: "notification_command_recipient_forbidden" }, 403);
        }
        if (!await hasCommittedIntent(env, {
          resultId: recordId,
          studentId: auth.uid,
          teacherId: canonical3.teacherId,
          homeworkId: canonical3.homeworkId
        })) {
          return json2(request, { code: "notification_command_intent_missing" }, 403);
        }
        const operationId2 = notificationOperationId2(`homework-submitted:teacher:${recordId}:${canonical3.teacherId}`);
        let result;
        try {
          result = await repositoryFactory(env).create({
            operationId: operationId2,
            recipientId: canonical3.teacherId,
            notification: {
              type: "info",
              title: "Homework Submitted",
              message: "A student submitted homework.",
              link: buildRoute2("TEACHER_HOMEWORK_DETAIL", { homeworkId: canonical3.homeworkId })
            },
            now: now()
          });
        } catch (error) {
          try {
            await recordImmediateOutcome(env, {
              resultId: recordId,
              studentId: auth.uid,
              teacherId: canonical3.teacherId,
              homeworkId: canonical3.homeworkId,
              reasonCode: "delivery_backend_error"
            }, false, now());
          } catch {
          }
          throw error;
        }
        if (result.status !== "replayed") {
          try {
            await recordImmediateOutcome(
              env,
              {
                resultId: recordId,
                studentId: auth.uid,
                teacherId: canonical3.teacherId,
                homeworkId: canonical3.homeworkId,
                reasonCode: result.status === "idempotency-conflict" ? "inbox_conflict" : void 0
              },
              result.status === "created",
              now()
            );
          } catch {
          }
        }
        if (result.status !== "idempotency-conflict") {
          try {
            await markDelivered(env, {
              resultId: recordId,
              studentId: auth.uid,
              teacherId: canonical3.teacherId,
              homeworkId: canonical3.homeworkId
            });
          } catch (error) {
            console.warn("Homework notification delivery marker deferred to retry:", error);
          }
        }
        return json2(request, {
          status: result.status,
          operationId: operationId2,
          notificationId: result.notificationId
        }, result.status === "idempotency-conflict" ? 409 : 200);
      } catch (error) {
        if (error instanceof Error && (error.message === "content_type_required" || error.message.startsWith("class_action_") || error.message.startsWith("course_type_notification_") || error.message.startsWith("enrollment_action_") || error.message.startsWith("assignment_action_"))) {
          return json2(request, { code: error.message }, 400);
        }
        if (error instanceof NotificationCommandSchemaError) {
          return json2(request, { code: error.code }, error.status);
        }
        return json2(request, { code: "notification_command_failed" }, 500);
      }
    }
  };
}, "createHomeworkSubmissionNotificationWorker");
var bridgeCandidate = /* @__PURE__ */ __name((importPKCS83, SignJWT3, buildRoute3) => {
  const ID7 = /^[A-Za-z0-9_-]{1,128}$/u;
  const ORIGINS2 = /* @__PURE__ */ new Set(["https://kahut1.web.app", "https://hocthem.net", "http://localhost:5173", "http://localhost:5174"]);
  const TOKEN_URL2 = "https://oauth2.googleapis.com/token";
  let cachedKey2;
  let cachedKeyJson2 = "";
  let cachedToken2;
  const row4 = /* @__PURE__ */ __name((value) => value && typeof value === "object" && !Array.isArray(value) ? value : null, "row");
  const field2 = /* @__PURE__ */ __name((value) => {
    const data = row4(value);
    if (!data) return void 0;
    if (typeof data.stringValue === "string") return data.stringValue;
    if (typeof data.integerValue === "string") return Number(data.integerValue);
    if (data.mapValue) return fields2(row4(data.mapValue)?.fields);
    return void 0;
  }, "field");
  const fields2 = /* @__PURE__ */ __name((value) => Object.fromEntries(Object.entries(row4(value) ?? {}).map(([key, child]) => [key, field2(child)])), "fields");
  const json3 = /* @__PURE__ */ __name((request, status, statusText) => {
    const headers2 = new Headers({ "Content-Type": "application/json", "Cache-Control": "no-store", Vary: "Origin" });
    const origin = request.headers.get("Origin");
    if (origin && ORIGINS2.has(origin)) {
      headers2.set("Access-Control-Allow-Origin", origin);
      headers2.set("Access-Control-Allow-Methods", "POST, OPTIONS");
      headers2.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
    }
    return new Response(JSON.stringify({ status: statusText }), { status, headers: headers2 });
  }, "json");
  const token2 = /* @__PURE__ */ __name(async (env, fetcher, requestRay) => {
    if (cachedToken2 && cachedToken2.until > Date.now() + 3e4) {
      console.info("notification_bridge_oauth", { requestRay, cache: "cached" });
      return cachedToken2.value;
    }
    const keyJson = env.NOTIFICATION_COMMAND_GOOGLE_SA_KEY;
    const service = JSON.parse(keyJson);
    if (!service.private_key || service.client_email !== env.NOTIFICATION_COMMAND_SERVICE_IDENTITY) throw Error("service_identity");
    const profile = { requestRay, cache: cachedKeyJson2 === keyJson && cachedKey2 ? "refresh" : "cold", keyImportWallMs: 0, signWallMs: 0, oauthWallMs: 0 };
    if (cachedKeyJson2 !== keyJson || !cachedKey2) {
      const started = performance.now();
      cachedKey2 = await importPKCS83(service.private_key, "RS256");
      profile.keyImportWallMs = performance.now() - started;
      cachedKeyJson2 = keyJson;
    }
    const now = Math.floor(Date.now() / 1e3);
    const signStarted = performance.now();
    const assertion = await new SignJWT3({ scope: "https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email" }).setProtectedHeader({ alg: "RS256" }).setIssuer(service.client_email).setSubject(service.client_email).setAudience(TOKEN_URL2).setIssuedAt(now).setExpirationTime(now + 3600).sign(cachedKey2);
    profile.signWallMs = performance.now() - signStarted;
    const oauthStarted = performance.now();
    const response10 = await fetcher(TOKEN_URL2, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion })
    });
    profile.oauthWallMs = performance.now() - oauthStarted;
    
    if (!response10.ok) throw Error("token_failed");
    const body = await response10.json();
    if (typeof body.access_token !== "string" || !body.access_token) throw Error("token_invalid");
    const issuedAt = Date.now(); cachedToken2 = { value: body.access_token, until: issuedAt + (typeof body.expires_in === "number" ? body.expires_in : 3600) * 1e3 }; console.info("notification_bridge_oauth", { ...profile, issuedAt, expiresAt: cachedToken2.until });
    return cachedToken2.value;
  }, "token");
  const createNotificationFirestoreBridge3 = /* @__PURE__ */ __name((fetcher = fetch) => ({
    async fetch(request, env) {
      const url = new URL(request.url);
      if (url.pathname !== "/events" || url.search) return json3(request, 404, "not_found");
      const origin = request.headers.get("Origin");
      if (origin && !ORIGINS2.has(origin)) return json3(request, 403, "origin_denied");
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: json3(request, 200, "ok").headers });
      if (request.method !== "POST") return json3(request, 405, "method_denied");
      const auth = request.headers.get("Authorization");
      if (!auth?.startsWith("Bearer ") || !auth.slice(7)) return json3(request, 401, "unauthenticated");
      if (!request.headers.get("Content-Type")?.toLowerCase().startsWith("application/json")) return json3(request, 400, "invalid_content_type");
      if (Number(request.headers.get("Content-Length") ?? 0) > 512) return json3(request, 413, "body_too_large");
      const reader = request.body?.getReader();
      const decoder3 = new TextDecoder();
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
              return json3(request, 413, "body_too_large");
            }
            raw += decoder3.decode(chunk.value, { stream: true });
          }
          raw += decoder3.decode();
        } finally {
          reader.releaseLock();
        }
      }
      let input;
      try {
        input = row4(JSON.parse(raw));
      } catch {
        input = null;
      }
      if (!input || Object.keys(input).sort().join(",") !== "eventId,kind" || !["writing-submitted-student", "writing-submitted-teacher"].includes(String(input.kind)) || typeof input.eventId !== "string" || !ID7.test(input.eventId)) {
        return json3(request, 400, "invalid_event");
      }
      const eventId = input.eventId;
      if (eventId !== env.NOTIFICATION_BRIDGE_QA_EVENT_ID) return json3(request, 403, "qa_event_denied");
      const project = encodeURIComponent(env.FIREBASE_PROJECT_ID);
      const documentUrl = /* @__PURE__ */ __name((collection, id) => `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/${collection}/${encodeURIComponent(id)}`, "documentUrl");
      try {
        const proofResponse = await fetcher(documentUrl("writing_notification_intents", eventId), { headers: { Authorization: auth } });
        if (proofResponse.status === 401 || proofResponse.status === 403) return json3(request, 403, "actor_denied");
        if (proofResponse.status === 404) return json3(request, 404, "source_missing");
        if (!proofResponse.ok) throw Error("proof_read");
        const proof = fields2(row4(await proofResponse.json())?.fields);
        const sourceId = proof.authorityRecordId;
        const actor = proof.actorUid;
        if (proof.kind !== input.kind || proof.eventId !== eventId || proof.occurrenceId !== eventId || typeof sourceId !== "string" || !ID7.test(sourceId) || typeof actor !== "string" || !ID7.test(actor) || eventId !== `writing-${sourceId}-submitted-${input.kind === "writing-submitted-teacher" ? "teacher" : "student"}`)
          return json3(request, 403, "proof_invalid");
        if (actor !== env.NOTIFICATION_BRIDGE_QA_ACTOR) return json3(request, 403, "qa_actor_denied");
        if (!env.NOTIFICATION_RATE_LIMITER?.limit) return json3(request, 503, "limiter_missing");
        if (!(await env.NOTIFICATION_RATE_LIMITER.limit({ key: `firestore-bridge:${actor}` })).success) return json3(request, 429, "rate_limited");
        const sourceResponse = await fetcher(documentUrl("writing_submissions", sourceId), { headers: { Authorization: auth } });
        if (sourceResponse.status === 401 || sourceResponse.status === 403 || sourceResponse.status === 404) return json3(request, 403, "source_denied");
        if (!sourceResponse.ok) throw Error("source_read");
        const source = fields2(row4(await sourceResponse.json())?.fields);
        if (source.id !== sourceId || source.studentId !== actor || source.submittedAt !== proof.occurredAt || row4(source.context)?.type !== "solo-practice") return json3(request, 403, "source_invalid");
        const teacher = input.kind === "writing-submitted-teacher" ? row4(source.context)?.selectedTeacherId : void 0;
        const classId = input.kind === "writing-submitted-teacher" ? row4(source.context)?.classId : void 0;
        if (input.kind === "writing-submitted-teacher" && (typeof teacher !== "string" || !ID7.test(teacher) || typeof classId !== "string" || !ID7.test(classId)))
          return json3(request, 403, "audience_invalid");
        const accessToken = await token2(env, fetcher, request.headers.get("CF-Ray"));
        const base = env.FIREBASE_DB_URL.replace(/\/$/u, "");
        const read = /* @__PURE__ */ __name(async (path) => {
          const response10 = await fetcher(`${base}/${path}.json`, { headers: { Authorization: `Bearer ${accessToken}` } });
          if (!response10.ok) throw Error("authority_read");
          return response10.json();
        }, "read");
        const resultPath = `test_results/${encodeURIComponent(sourceId)}`;
        const indexPath = `test_results_by_student/${encodeURIComponent(actor)}/${encodeURIComponent(sourceId)}`;
        const [resultId, studentId, submittedAt, skill, writingId, indexedResultId, indexedStudentId, indexedSubmittedAt] = await Promise.all([
          read(`${resultPath}/resultId`),
          read(`${resultPath}/studentId`),
          read(`${resultPath}/submittedAt`),
          read(`${resultPath}/testSkill`),
          read(`${resultPath}/writingData/submissionId`),
          read(`${indexPath}/resultId`),
          read(`${indexPath}/studentId`),
          read(`${indexPath}/submittedAt`)
        ]);
        if (resultId !== sourceId || indexedResultId !== sourceId || studentId !== actor || indexedStudentId !== actor || submittedAt !== proof.occurredAt || indexedSubmittedAt !== proof.occurredAt || skill !== "writing" || writingId !== sourceId)
          return json3(request, 403, "result_invalid");
        if (typeof teacher === "string" && typeof classId === "string") {
          const [owner, status, member] = await Promise.all([
            read(`classes/${encodeURIComponent(classId)}/createdBy`),
            read(`classes/${encodeURIComponent(classId)}/status`),
            read(`classes/${encodeURIComponent(classId)}/students/${encodeURIComponent(actor)}/status`)
          ]);
          if (owner !== teacher || status !== "active" || member !== "active")
            return json3(request, 403, "audience_denied");
        }
        const recipient = typeof teacher === "string" ? teacher : actor;
        const inboxUrl = `${env.FIREBASE_DB_URL.replace(/\/$/u, "")}/notifications/${encodeURIComponent(recipient)}/${encodeURIComponent(eventId)}.json`;
        const notice = input.kind === "writing-submitted-teacher" ? {
          id: eventId,
          type: "info",
          title: "New writing submission",
          message: "A student submitted writing for review.",
          link: buildRoute3("TEACHER_GRADING_DETAIL", { submissionId: sourceId }),
          read: false,
          createdAt: proof.occurredAt
        } : {
          id: eventId,
          type: "success",
          title: "Writing submitted",
          message: "Your writing submission has been received for review.",
          link: buildRoute3("STUDENT_ACADEMIC_RECORD"),
          read: false,
          createdAt: proof.occurredAt
        };
        const write = await fetcher(inboxUrl, {
          method: "PUT",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", "If-Match": "null_etag" },
          body: JSON.stringify(notice)
        });
        if (write.ok) return json3(request, 200, "created");
        if (write.status !== 412) throw Error("inbox_write");
        const prior = await fetcher(inboxUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
        if (!prior.ok) throw Error("inbox_read");
        const saved = row4(await prior.json());
        const expectedKeys = ["id", "type", "title", "message", "link", "read", "createdAt"];
        if (!saved || !expectedKeys.every((key) => Object.hasOwn(saved, key)) || typeof saved.read !== "boolean")
          return json3(request, 503, "delivery_unknown");
        const replayed = Object.keys(saved).every((key) => expectedKeys.includes(key)) && saved.id === notice.id && saved.type === notice.type && saved.title === notice.title && saved.message === notice.message && saved.link === notice.link && saved.createdAt === notice.createdAt;
        return json3(request, replayed ? 200 : 409, replayed ? "replayed" : "conflict");
      } catch {
        return json3(request, 503, "delivery_unknown");
      }
    }
  }), "createNotificationFirestoreBridge");
  return createNotificationFirestoreBridge3;
}, "bridgeCandidate");
var createNotificationFirestoreBridge2 = bridgeCandidate(importPKCS82, SignJWT2, buildRoute2);
var retryDueClassNotifications = /* @__PURE__ */ __name2(async (env, now = Date.now()) => {
  const storage = new FirebaseClassActionStorage(env);
  const repository = new FirebaseRestNotificationCommandRepository({
    env
  });
  for (const due of await storage.dueIntents(now, 1)) {
    if (due.state === "retrying") {
      const missing = await missingClassIntentRecipients(due, (path) => storage.read(path));
      if (missing) await storage.reportFailure(due, missing, "inbox_missing_after_claim");
      await storage.updateIntent({ ...due, state: missing ? "failed" : "done", dueAt: CLASS_INTENT_DONE_DUE_AT });
      continue;
    }
    if (await storage.retrySuppressed()) continue;
    const claimed = await storage.claimRetry(due.actionId, now);
    if (!claimed) continue;
    const result = await deliverClassIntent(claimed, repository);
    if (result.backendFailure) break;
    if (result.delivered && result.fresh) {
      try {
        await storage.recordSuccess(Date.now());
      } catch {
      }
    }
    if (!result.delivered) await storage.reportFailure(claimed, result.failedRecipientCount, "inbox_conflict");
    await storage.updateIntent({
      ...claimed,
      state: result.delivered ? "done" : "failed",
      dueAt: CLASS_INTENT_DONE_DUE_AT
    });
  }
}, "retryDueClassNotifications");
var SIGN_IN_URL2 = "https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken";
var AUDIENCE2 = "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit";
var required7 = /* @__PURE__ */ __name2((env, name) => {
  const value = env[name];
  if (typeof value !== "string" || !value.trim()) throw new Error(`missing_${name.toLowerCase()}`);
  return value.trim();
}, "required");
var FirebaseResultReviewActionStorage = class {
  static {
    __name(this, "FirebaseResultReviewActionStorage");
  }
  constructor(env, fetchImpl = globalThis.fetch) {
    this.env = env;
    this.fetchImpl = fetchImpl;
    this.admin = new FirebaseRtdbRestClient({
      env: {
        FIREBASE_DB_URL: required7(env, "FIREBASE_DB_URL"),
        FIREBASE_PROJECT_ID: required7(env, "FIREBASE_PROJECT_ID"),
        GOOGLE_SA_KEY: required7(env, "NOTIFICATION_COMMAND_GOOGLE_SA_KEY")
      },
      fetchImpl
    });
  }
  env;
  fetchImpl;
  static {
    __name2(this, "FirebaseResultReviewActionStorage");
  }
  admin;
  read(path) {
    return this.admin.readValue(path);
  }
  async firebaseToken(input) {
    const key = JSON.parse(required7(this.env, "NOTIFICATION_COMMAND_GOOGLE_SA_KEY"));
    const identity = required7(this.env, "NOTIFICATION_COMMAND_SERVICE_IDENTITY");
    if (key.client_email !== identity || !key.private_key) throw new Error("result_review_service_identity_mismatch");
    const privateKey = await importPKCS82(key.private_key, "RS256");
    const issuedAt = Math.floor(Date.now() / 1e3);
    const customToken = await new SignJWT2({
      iss: identity,
      sub: identity,
      aud: AUDIENCE2,
      iat: issuedAt,
      exp: issuedAt + 300,
      uid: `notification-result-review:${input.command.eventId}`,
      claims: {
        notificationResultReview: true,
        actionKind: "result-reviewed",
        eventId: input.command.eventId,
        resultId: input.command.resultId,
        actorUid: input.actorUid,
        studentId: input.intent.studentId,
        occurredAt: input.intent.occurredAt
      }
    }).setProtectedHeader({ alg: "RS256", typ: "JWT" }).sign(privateKey);
    const url = `${SIGN_IN_URL2}?key=${encodeURIComponent(required7(this.env, "FIREBASE_WEB_API_KEY"))}`;
    const response10 = await this.fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: customToken, returnSecureToken: true })
    });
    if (!response10.ok) throw new Error(`result_review_token_failed:${response10.status}`);
    const value = await response10.json();
    if (typeof value.idToken !== "string" || !value.idToken) throw new Error("result_review_token_invalid");
    return value.idToken;
  }
  async commit(input) {
    const token2 = await this.firebaseToken(input);
    const client = new FirebaseRtdbRestClient({
      env: {
        FIREBASE_DB_URL: required7(this.env, "FIREBASE_DB_URL"),
        FIREBASE_PROJECT_ID: required7(this.env, "FIREBASE_PROJECT_ID")
      },
      fetchImpl: this.fetchImpl,
      firebaseAuthToken: true,
      getFirebaseAuthToken: /* @__PURE__ */ __name2(async () => token2, "getFirebaseAuthToken")
    });
    const resultPath = `test_results/${input.command.resultId}`;
    await client.patchMultiLocation([
      { path: `${resultPath}/markingStatus`, value: "reviewed" },
      { path: `${resultPath}/reviewedAt`, value: input.intent.occurredAt },
      { path: `${resultPath}/reviewedBy`, value: input.actorUid },
      { path: `${resultPath}/updatedAt`, value: input.intent.occurredAt },
      { path: `result_review_notification_intents/${input.command.eventId}`, value: input.intent }
    ]);
  }
  async updateIntent(intent) {
    const path = `result_review_notification_intents/${intent.eventId}`;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const current = await this.admin.readWithEtag(path);
      if (!current.data || current.data.eventId !== intent.eventId || current.data.kind !== intent.kind || current.data.resultId !== intent.resultId || current.data.actorUid !== intent.actorUid || current.data.studentId !== intent.studentId) {
        throw new Error("result_review_intent_identity_changed");
      }
      if (current.data.state === "done") return;
      if (await this.admin.writeIfMatch(path, intent, current.etag)) return;
    }
    throw new Error("result_review_intent_cas_failed");
  }
  async dueIntents(now, limit = 5) {
    const rows = await this.admin.readValue("result_review_notification_intents", {
      orderBy: "dueAt",
      limitToFirst: limit
    });
    if (!rows || typeof rows !== "object" || Array.isArray(rows)) return [];
    return Object.values(rows).filter((intent) => intent?.kind === "result-reviewed" && intent.dueAt <= now && (intent.state === "retry_due" || intent.state === "retrying"));
  }
  async claimRetry(eventId, now) {
    const path = `result_review_notification_intents/${eventId}`;
    const current = await this.admin.readWithEtag(path);
    const intent = current.data;
    if (!intent || intent.eventId !== eventId || intent.kind !== "result-reviewed" || intent.state !== "retry_due" || intent.attempts !== 1 || intent.dueAt > now) return null;
    const claimed = {
      ...intent,
      state: "retrying",
      attempts: 2,
      dueAt: now + 60 * 60 * 1e3
    };
    return await this.admin.writeIfMatch(path, claimed, current.etag) ? claimed : null;
  }
};
var DONE_DUE_AT3 = 864e13;
var required8 = /* @__PURE__ */ __name2((env, name) => {
  const value = env[name];
  if (typeof value !== "string" || !value.trim()) throw new Error(`missing_${name.toLowerCase()}`);
  return value.trim();
}, "required");
var record6 = /* @__PURE__ */ __name2((value) => value && typeof value === "object" && !Array.isArray(value) ? value : null, "record");
var trustedReview = /* @__PURE__ */ __name2(async (intent, read) => {
  const result = record6(await read(`test_results/${intent.resultId}`));
  const actor = record6(await read(`users/${intent.actorUid}`));
  if (!result || !actor || result.resultId !== intent.resultId || result.studentId !== intent.studentId || result.markingStatus !== "reviewed" || result.reviewedAt !== intent.occurredAt || result.reviewedBy !== intent.actorUid || !["teacher", "super_admin"].includes(String(actor.role))) return null;
  const visibility = record6(result.visibility);
  const courseId = typeof result.courseId === "string" ? result.courseId : "";
  const course = courseId ? record6(await read(`courses/${courseId}`)) : null;
  const authorized = actor.role === "super_admin" || (visibility ? visibility.ownershipResolved === true && visibility.visibilityOwnerTeacherId === intent.actorUid : result.teacherId === intent.actorUid || course?.createdBy === intent.actorUid);
  return authorized ? { result, actor } : null;
}, "trustedReview");
var reportFailure2 = /* @__PURE__ */ __name2(async (env, intent, now) => {
  const admin = new FirebaseRtdbRestClient({
    env: {
      FIREBASE_DB_URL: required8(env, "FIREBASE_DB_URL"),
      FIREBASE_PROJECT_ID: required8(env, "FIREBASE_PROJECT_ID"),
      GOOGLE_SA_KEY: required8(env, "NOTIFICATION_COMMAND_GOOGLE_SA_KEY")
    }
  });
  const date = new Date(now).toISOString().slice(0, 10);
  const path = `reports/errors/${date}/result-notification-${intent.eventId}`;
  const existing = await admin.readWithEtag(path);
  if (existing.data !== null) return;
  await admin.writeIfMatch(path, {
    id: `result-notification-${intent.eventId}`,
    timestamp: now,
    feature: "results",
    severity: "error",
    message: "Reviewed result notification delivery failed after its retry.",
    userId: intent.actorUid,
    userName: "Notification Worker",
    userRole: "service",
    duplicateCount: 1,
    contextData: { eventId: intent.eventId, resultId: intent.resultId, failedRecipientCount: 1 }
  }, existing.etag);
}, "reportFailure");
var retryDueResultReviewNotifications = /* @__PURE__ */ __name2(async (env, now = Date.now(), dependencies = {}) => {
  const storage = dependencies.storage ?? new FirebaseResultReviewActionStorage(env);
  const repository = dependencies.repository ?? new FirebaseRestNotificationCommandRepository({
    env: {
      FIREBASE_DB_URL: required8(env, "FIREBASE_DB_URL"),
      FIREBASE_PROJECT_ID: required8(env, "FIREBASE_PROJECT_ID"),
      NOTIFICATION_COMMAND_SERVICE_IDENTITY: required8(env, "NOTIFICATION_COMMAND_SERVICE_IDENTITY"),
      NOTIFICATION_COMMAND_GOOGLE_SA_KEY: required8(env, "NOTIFICATION_COMMAND_GOOGLE_SA_KEY")
    }
  });
  const read = dependencies.read ?? ((path) => storage.read(path));
  for (const intent of await storage.dueIntents(now, 2)) {
    if (intent.state === "retrying") {
      let savedValue;
      try {
        savedValue = await read(`notifications/${intent.studentId}/${intent.eventId}`);
      } catch {
        break;
      }
      const saved = record6(savedValue);
      const expected = resultReviewNotification({ resultId: intent.resultId, studentId: intent.studentId }).notification;
      const delivered2 = Boolean(expected && saved?.id === intent.eventId && saved.type === expected.type && saved.title === expected.title && saved.message === expected.message && saved.link === expected.link && typeof saved.read === "boolean" && saved.createdAt === intent.occurredAt);
      if (!delivered2) await reportFailure2(env, intent, now);
      await storage.updateIntent({ ...intent, state: delivered2 ? "done" : "failed", attempts: 2, dueAt: DONE_DUE_AT3 });
      continue;
    }
    const claimed = await storage.claimRetry(intent.eventId, now);
    if (!claimed) continue;
    let delivered = false;
    let backendFailure = false;
    try {
      const source = await trustedReview(claimed, read);
      if (source) {
        const notice = resultReviewNotification(source.result);
        const result = await repository.create({
          operationId: claimed.eventId,
          recipientId: claimed.studentId,
          notification: notice.notification,
          now: claimed.occurredAt
        });
        delivered = result.status !== "idempotency-conflict";
      }
    } catch {
      break;
    }
    if (!delivered) await reportFailure2(env, claimed, now);
    await storage.updateIntent({ ...claimed, state: delivered ? "done" : "failed", attempts: 2, dueAt: DONE_DUE_AT3 });
    if (backendFailure) break;
  }
}, "retryDueResultReviewNotifications");
var ACTION_PATH = "/result-notifications/reviewed";
var ALLOWED_ORIGINS2 = /* @__PURE__ */ new Set([
  "https://kahut1.web.app",
  "http://localhost:5173",
  "http://localhost:5174"
]);
var ID8 = /^[A-Za-z0-9_-]{1,128}$/u;
var UUID3 = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
var RETRY_DELAY_MS6 = 60 * 60 * 1e3;
var DONE_DUE_AT4 = 864e13;
var record7 = /* @__PURE__ */ __name2((value) => value && typeof value === "object" && !Array.isArray(value) ? value : null, "record");
var requiredBinding = /* @__PURE__ */ __name2((env, name) => {
  const value = env[name];
  if (typeof value !== "string" || !value.trim()) throw new Error(`missing_${name.toLowerCase()}`);
  return value.trim();
}, "requiredBinding");
var response = /* @__PURE__ */ __name2((request, body, status) => {
  const headers2 = new Headers({
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    Vary: "Origin, Access-Control-Request-Method, Access-Control-Request-Headers"
  });
  const origin = request.headers.get("Origin");
  if (origin && ALLOWED_ORIGINS2.has(origin)) {
    headers2.set("Access-Control-Allow-Origin", origin);
    headers2.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    headers2.set("Access-Control-Allow-Headers", "Authorization, Content-Type, Idempotency-Key");
  }
  return new Response(JSON.stringify(body), { status, headers: headers2 });
}, "response");
var parseResultReviewAction = /* @__PURE__ */ __name2(async (request) => {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    throw new Error("content_type_required");
  }
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 2048) throw new Error("result_review_body_too_large");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("result_review_invalid_json");
  }
  const value = record7(parsed);
  if (!value || Object.keys(value).sort().join(",") !== "actionType,eventId,resultId,schemaVersion" || value.schemaVersion !== 1 || value.actionType !== "result-reviewed" || typeof value.eventId !== "string" || !UUID3.test(value.eventId) || request.headers.get("Idempotency-Key") !== value.eventId || typeof value.resultId !== "string" || !ID8.test(value.resultId)) {
    throw new Error("result_review_invalid");
  }
  return value;
}, "parseResultReviewAction");
var trustedReviewAuthority = /* @__PURE__ */ __name2((resultValue, actorValue, command, actorUid) => {
  const result = record7(resultValue);
  const actor = record7(actorValue);
  const visibility = record7(result?.visibility);
  const actorRole = actor?.role;
  if (!result || !actor || result.resultId !== command.resultId || !ID8.test(String(result.studentId ?? "")) || !["teacher", "super_admin"].includes(String(actorRole))) return null;
  if (actorRole !== "super_admin") {
    const courseId = typeof result.courseId === "string" ? result.courseId : "";
    const course = record7(resultValue.__courseAuthority);
    const authorized = visibility ? visibility.ownershipResolved === true && visibility.visibilityOwnerTeacherId === actorUid : result.teacherId === actorUid || course?.createdBy === actorUid;
    if (!authorized) return null;
  }
  return { result, actor };
}, "trustedReviewAuthority");
var resultReviewNotification = /* @__PURE__ */ __name2((result) => {
  return {
    recipientId: String(result.studentId),
    notification: {
      type: "success",
      title: "Result Reviewed",
      message: "Your test result has been reviewed. View your score.",
      link: buildRoute2("RESULT_DETAIL", { resultId: String(result.resultId) })
    }
  };
}, "resultReviewNotification");
var performResultReviewAction = /* @__PURE__ */ __name2(async (input) => {
  const { command, actorUid, storage } = input;
  const existing = record7(await storage.read(`result_review_notification_intents/${command.eventId}`));
  if (existing) {
    if (existing.eventId !== command.eventId || existing.resultId !== command.resultId || existing.actorUid !== actorUid || existing.kind !== "result-reviewed") {
      return { status: 409, body: { code: "result_review_event_conflict" } };
    }
    return { status: 200, body: { status: "replayed", eventId: command.eventId, notificationStatus: existing.state } };
  }
  const rawResult = record7(await storage.read(`test_results/${command.resultId}`));
  const actor = record7(await storage.read(`users/${actorUid}`));
  const courseId = typeof rawResult?.courseId === "string" ? rawResult.courseId : "";
  const course = courseId ? record7(await storage.read(`courses/${courseId}`)) : null;
  const authoritative = rawResult && actor ? trustedReviewAuthority({ ...rawResult, __courseAuthority: course }, actor, command, actorUid) : null;
  if (!authoritative) return { status: 403, body: { code: "result_review_forbidden" } };
  if (authoritative.result.markingStatus !== "pending-review") {
    return { status: 409, body: { code: "result_review_stale" } };
  }
  const now = input.now ?? Date.now;
  const occurredAt = now();
  const intent = {
    schemaVersion: 1,
    eventId: command.eventId,
    kind: "result-reviewed",
    resultId: command.resultId,
    actorUid,
    studentId: String(authoritative.result.studentId),
    occurredAt,
    dueAt: occurredAt + RETRY_DELAY_MS6,
    attempts: 1,
    state: "retry_due"
  };
  try {
    await storage.commit({ command, actorUid, intent });
  } catch {
    const committed = record7(await storage.read(`result_review_notification_intents/${command.eventId}`));
    if (!committed || committed.resultId !== command.resultId || committed.actorUid !== actorUid) {
      return { status: 409, body: { code: "result_review_commit_failed" } };
    }
  }
  let notificationStatus = "retry_due";
  try {
    const result = await input.repository.create({
      operationId: command.eventId,
      recipientId: intent.studentId,
      notification: resultReviewNotification(authoritative.result).notification,
      now: occurredAt
    });
    if (result.status !== "idempotency-conflict") {
      await storage.updateIntent({ ...intent, state: "done", dueAt: DONE_DUE_AT4 });
      notificationStatus = "delivered";
    } else {
      notificationStatus = "retry_due";
    }
  } catch {
  }
  return { status: 200, body: { status: "committed", eventId: command.eventId, notificationStatus } };
}, "performResultReviewAction");
var createResultReviewNotificationWorker = /* @__PURE__ */ __name2((options = {}) => {
  const firebaseVerifier = options.firebaseVerifier ?? createFirebaseVerifier2();
  const repositoryFactory = options.repositoryFactory ?? ((env) => new FirebaseRestNotificationCommandRepository({
    env: {
      FIREBASE_DB_URL: requiredBinding(env, "FIREBASE_DB_URL"),
      FIREBASE_PROJECT_ID: requiredBinding(env, "FIREBASE_PROJECT_ID"),
      NOTIFICATION_COMMAND_SERVICE_IDENTITY: requiredBinding(env, "NOTIFICATION_COMMAND_SERVICE_IDENTITY"),
      NOTIFICATION_COMMAND_GOOGLE_SA_KEY: requiredBinding(env, "NOTIFICATION_COMMAND_GOOGLE_SA_KEY")
    }
  }));
  const actionStorageFactory = options.actionStorageFactory ?? ((env) => new FirebaseResultReviewActionStorage(env));
  const now = options.now ?? Date.now;
  return {
    async fetch(request, env) {
      const url = new URL(request.url);
      if (url.pathname !== ACTION_PATH || url.search || url.hash) {
        return response(request, { code: "result_review_not_found" }, 404);
      }
      const origin = request.headers.get("Origin");
      if (origin && !ALLOWED_ORIGINS2.has(origin)) return response(request, { code: "cors_origin_denied" }, 403);
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: response(request, {}, 200).headers });
      }
      if (request.method !== "POST") return response(request, { code: "method_not_allowed" }, 405);
      const auth = await firebaseVerifier.verifyAuthorizationHeader(request.headers.get("Authorization"), env);
      if (!auth.valid || typeof auth.uid !== "string" || !auth.uid) {
        return response(request, { code: "result_review_unauthenticated" }, 401);
      }
      const limiterValue = env.NOTIFICATION_RATE_LIMITER;
      if (!limiterValue || typeof limiterValue.limit !== "function") {
        return response(request, { code: "notification_command_unavailable" }, 503);
      }
      const limited = await limiterValue.limit({ key: `result-review:${auth.uid}` });
      if (!limited.success) return response(request, { code: "rate_limited" }, 429);
      try {
        const command = await parseResultReviewAction(request);
        const result = await performResultReviewAction({
          command,
          actorUid: auth.uid,
          storage: actionStorageFactory(env),
          repository: repositoryFactory(env),
          now
        });
        return response(request, result.body, result.status);
      } catch (error) {
        if (error instanceof Error && (error.message === "content_type_required" || error.message.startsWith("result_review_"))) {
          return response(request, { code: error.message }, 400);
        }
        return response(request, { code: "result_review_failed" }, 500);
      }
    }
  };
}, "createResultReviewNotificationWorker");
var retryDueCourseTypeDecisionNotifications = /* @__PURE__ */ __name2(async (env, now = Date.now()) => {
  const handlers = createCourseTypeDecisionHandlers({
    storage: new FirebaseCourseTypeDecisionStorage(env),
    repository: new FirebaseRestNotificationCommandRepository({
      env
    }),
    now: /* @__PURE__ */ __name2(() => now, "now")
  });
  return handlers.runRetryBatch();
}, "retryDueCourseTypeDecisionNotifications");
var SIGN_IN_URL3 = "https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken";
var AUDIENCE3 = "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit";
var required9 = /* @__PURE__ */ __name2((env, name) => {
  const value = env[name];
  if (typeof value !== "string" || !value.trim()) throw new Error(`missing_${name.toLowerCase()}`);
  return value.trim();
}, "required");
var record8 = /* @__PURE__ */ __name2((value) => value && typeof value === "object" && !Array.isArray(value) ? value : null, "record");
var FirebaseFeedbackActionStorage = class {
  static {
    __name(this, "FirebaseFeedbackActionStorage");
  }
  constructor(env, fetchImpl = globalThis.fetch) {
    this.env = env;
    this.fetchImpl = fetchImpl;
    this.admin = new FirebaseRtdbRestClient({ env: {
      FIREBASE_DB_URL: required9(env, "FIREBASE_DB_URL"),
      FIREBASE_PROJECT_ID: required9(env, "FIREBASE_PROJECT_ID"),
      GOOGLE_SA_KEY: required9(env, "NOTIFICATION_COMMAND_GOOGLE_SA_KEY")
    }, fetchImpl });
  }
  env;
  fetchImpl;
  static {
    __name2(this, "FirebaseFeedbackActionStorage");
  }
  admin;
  read(path) {
    return this.admin.readValue(path);
  }
  async firebaseToken(input) {
    const key = JSON.parse(required9(this.env, "NOTIFICATION_COMMAND_GOOGLE_SA_KEY"));
    const identity = required9(this.env, "NOTIFICATION_COMMAND_SERVICE_IDENTITY");
    if (key.client_email !== identity || !key.private_key) throw new Error("feedback_action_service_identity_mismatch");
    const privateKey = await importPKCS82(key.private_key, "RS256");
    const issuedAt = Math.floor(Date.now() / 1e3);
    const customToken = await new SignJWT2({
      iss: identity,
      sub: identity,
      aud: AUDIENCE3,
      iat: issuedAt,
      exp: issuedAt + 300,
      uid: `notification-feedback-action:${input.command.eventId}`,
      claims: {
        notificationFeedbackAction: true,
        eventId: input.command.eventId,
        resultId: input.command.resultId,
        actorUid: input.actorUid,
        studentId: input.intent.studentId,
        feedbackKind: input.command.feedbackKind,
        questionId: input.command.questionId ?? null,
        occurredAt: input.intent.occurredAt
      }
    }).setProtectedHeader({ alg: "RS256", typ: "JWT" }).sign(privateKey);
    const response10 = await this.fetchImpl(`${SIGN_IN_URL3}?key=${encodeURIComponent(required9(this.env, "FIREBASE_WEB_API_KEY"))}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: customToken, returnSecureToken: true })
    });
    if (!response10.ok) throw new Error(`feedback_action_token_failed:${response10.status}`);
    const value = await response10.json();
    if (typeof value.idToken !== "string" || !value.idToken) throw new Error("feedback_action_token_invalid");
    return value.idToken;
  }
  async commit(input) {
    const token2 = await this.firebaseToken(input);
    const client = new FirebaseRtdbRestClient({
      env: { FIREBASE_DB_URL: required9(this.env, "FIREBASE_DB_URL"), FIREBASE_PROJECT_ID: required9(this.env, "FIREBASE_PROJECT_ID") },
      fetchImpl: this.fetchImpl,
      firebaseAuthToken: true,
      getFirebaseAuthToken: /* @__PURE__ */ __name2(async () => token2, "getFirebaseAuthToken")
    });
    const { command, actorUid, actor, intent, result } = input;
    const resultPath = `test_results/${command.resultId}`;
    const displayName = [actor.displayName, actor.name, actor.fullName].find((value) => typeof value === "string" && value.trim());
    const updatedByName = typeof displayName === "string" ? displayName.trim().slice(0, 100) : "";
    const updatedBy = updatedByName || actorUid;
    const feedbackData = {
      ...command.feedbackKind === "question" ? { questionId: command.questionId } : {},
      feedback: command.feedback,
      updatedAt: intent.occurredAt,
      updatedBy,
      updatedById: actorUid,
      ...updatedByName ? { updatedByName, teacherName: updatedByName } : {},
      eventId: command.eventId
    };
    const history = {
      eventId: command.eventId,
      timestamp: intent.occurredAt,
      teacherId: actorUid,
      ...updatedByName ? { teacherName: updatedByName } : {},
      type: command.feedbackKind,
      ...command.questionId === void 0 ? {} : { questionId: command.questionId },
      feedback: command.feedback
    };
    const updates = [
      { path: `${resultPath}/feedbackHistory/${command.eventId}`, value: history },
      { path: `${resultPath}/feedbackUpdatedAt`, value: intent.occurredAt },
      { path: `${resultPath}/feedbackUpdatedBy`, value: updatedBy },
      { path: `${resultPath}/feedbackUpdatedByTeacherId`, value: actorUid },
      { path: `${resultPath}/feedbackUpdatedByTeacherName`, value: updatedByName || null },
      { path: `${resultPath}/hasFeedback`, value: true },
      { path: `feedback_notification_intents/${command.eventId}`, value: intent }
    ];
    if (command.feedbackKind === "question") {
      const questionId = command.questionId;
      const questions = Array.isArray(result.questionResults) ? result.questionResults : [];
      const questionIndex = questions.findIndex((item) => {
        const question = record8(item);
        return question && (question.questionId === questionId || String(question.questionNumber ?? "") === questionId);
      });
      if (questionIndex < 0) throw new Error("feedback_question_not_found");
      updates.push(
        { path: `${resultPath}/questionFeedback/${questionId}`, value: feedbackData },
        { path: `${resultPath}/questionResults/${questionIndex}/teacherFeedback`, value: command.feedback }
      );
    } else {
      updates.push({ path: `${resultPath}/overallFeedback`, value: feedbackData });
    }
    await client.patchMultiLocation(updates);
  }
  async updateIntent(intent) {
    const path = `feedback_notification_intents/${intent.eventId}`;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const current = await this.admin.readWithEtag(path);
      if (!current.data || current.data.eventId !== intent.eventId || current.data.resultId !== intent.resultId || current.data.actorUid !== intent.actorUid || current.data.kind !== intent.kind) throw new Error("feedback_intent_identity_changed");
      if (current.data.state === "done" || current.data.state === "failed") return;
      if (await this.admin.writeIfMatch(path, intent, current.etag)) return;
    }
    throw new Error("feedback_intent_cas_failed");
  }
  async dueIntents(now, limit = 2) {
    const rows = await this.admin.readValue("feedback_notification_intents", { orderBy: "dueAt", limitToFirst: limit });
    if (!rows || typeof rows !== "object" || Array.isArray(rows)) return [];
    return Object.values(rows).filter((intent) => intent && intent.dueAt <= now && (intent.state === "retry_due" || intent.state === "retrying"));
  }
  async claimRetry(eventId, now) {
    const path = `feedback_notification_intents/${eventId}`;
    const current = await this.admin.readWithEtag(path);
    const intent = current.data;
    if (!intent || intent.eventId !== eventId || intent.state !== "retry_due" || intent.attempts !== 1 || intent.dueAt > now) return null;
    const claimed = { ...intent, state: "retrying", attempts: 2, dueAt: now + 60 * 60 * 1e3 };
    return await this.admin.writeIfMatch(path, claimed, current.etag) ? claimed : null;
  }
};
var ID9 = /^[A-Za-z0-9_-]{1,128}$/u;
var required10 = /* @__PURE__ */ __name2((env, name) => {
  const value = env[name];
  if (typeof value !== "string" || !value.trim()) throw new Error(`missing_${name.toLowerCase()}`);
  return value.trim();
}, "required");
var record9 = /* @__PURE__ */ __name2((value) => value && typeof value === "object" && !Array.isArray(value) ? value : null, "record");
var trustedFeedbackSource = /* @__PURE__ */ __name2(async (intent, read) => {
  if (!ID9.test(intent.resultId) || !ID9.test(intent.studentId) || !ID9.test(intent.actorUid) || !["feedback-question", "feedback-overall"].includes(intent.kind)) return null;
  const result = record9(await read(`test_results/${intent.resultId}`));
  const actor = record9(await read(`users/${intent.actorUid}`));
  const history = result ? record9(record9(result.feedbackHistory)?.[intent.eventId]) : null;
  const questionFeedback = intent.questionId && result ? record9(record9(result.questionFeedback)?.[intent.questionId]) : null;
  const expectedType = intent.kind === "feedback-question" ? "question" : "overall";
  if (!result || !actor || result.resultId !== intent.resultId || result.studentId !== intent.studentId || !["teacher", "super_admin"].includes(String(actor.role)) || !history || history.eventId !== intent.eventId || history.teacherId !== intent.actorUid || history.timestamp !== intent.occurredAt || history.type !== expectedType || intent.questionId && (history.questionId !== intent.questionId || !questionFeedback || questionFeedback.eventId !== intent.eventId || questionFeedback.updatedById !== intent.actorUid || questionFeedback.updatedAt !== intent.occurredAt)) return null;
  if (actor.role !== "super_admin") {
    const visibility = record9(result.visibility);
    const courseId = typeof result.courseId === "string" ? result.courseId : "";
    const course = courseId ? record9(await read(`courses/${courseId}`)) : null;
    if (!(visibility?.ownershipResolved === true && visibility.visibilityOwnerTeacherId === intent.actorUid) && result.teacherId !== intent.actorUid && course?.createdBy !== intent.actorUid) return null;
  }
  return { result, actor };
}, "trustedFeedbackSource");
var reportFailure3 = /* @__PURE__ */ __name2(async (env, intent, now) => {
  const admin = new FirebaseRtdbRestClient({ env: {
    FIREBASE_DB_URL: required10(env, "FIREBASE_DB_URL"),
    FIREBASE_PROJECT_ID: required10(env, "FIREBASE_PROJECT_ID"),
    GOOGLE_SA_KEY: required10(env, "NOTIFICATION_COMMAND_GOOGLE_SA_KEY")
  } });
  const issueId = `feedback-notification-${intent.eventId}`;
  const path = `reports/errors/${new Date(now).toISOString().slice(0, 10)}/${issueId}`;
  const existing = await admin.readWithEtag(path);
  if (existing.data !== null) return;
  await admin.writeIfMatch(path, {
    id: issueId,
    timestamp: now,
    feature: "results",
    severity: "error",
    message: "Feedback notification delivery failed after its retry.",
    userId: intent.actorUid,
    userName: "Notification Worker",
    userRole: "service",
    duplicateCount: 1,
    contextData: { eventId: intent.eventId, resultId: intent.resultId, failedRecipientCount: 1 }
  }, existing.etag);
}, "reportFailure");
var retryDueFeedbackNotifications = /* @__PURE__ */ __name2(async (env, now = Date.now(), dependencies = {}) => {
  const storage = dependencies.storage ?? new FirebaseFeedbackActionStorage(env);
  const repository = dependencies.repository ?? new FirebaseRestNotificationCommandRepository({ env: {
    FIREBASE_DB_URL: required10(env, "FIREBASE_DB_URL"),
    FIREBASE_PROJECT_ID: required10(env, "FIREBASE_PROJECT_ID"),
    NOTIFICATION_COMMAND_SERVICE_IDENTITY: required10(env, "NOTIFICATION_COMMAND_SERVICE_IDENTITY"),
    NOTIFICATION_COMMAND_GOOGLE_SA_KEY: required10(env, "NOTIFICATION_COMMAND_GOOGLE_SA_KEY")
  } });
  const read = dependencies.read ?? ((path) => storage.read(path));
  for (const intent of await storage.dueIntents(now, 2)) {
    const wasRetrying = intent.state === "retrying";
    const claimed = wasRetrying ? intent : await storage.claimRetry(intent.eventId, now);
    if (!claimed) continue;
    let delivered = false;
    let backendFailure = false;
    try {
      if (wasRetrying) {
        const row9 = record9(await read(`notifications/${claimed.studentId}/${claimed.eventId}`));
        delivered = row9?.id === claimed.eventId && row9.type === "feedback" && row9.link === buildRoute2("RESULT_DETAIL", { resultId: claimed.resultId });
      } else {
        const source = await trustedFeedbackSource(claimed, read);
        if (source) {
          const notice = {
            type: "feedback",
            title: "New Feedback Available",
            message: "Your teacher added feedback to your test result.",
            link: buildRoute2("RESULT_DETAIL", { resultId: claimed.resultId })
          };
          const sent = await repository.create({ operationId: claimed.eventId, recipientId: claimed.studentId, notification: notice, now: claimed.occurredAt });
          delivered = sent.status !== "idempotency-conflict";
        }
      }
    } catch {
      backendFailure = true;
    }
    if (backendFailure) break;
    if (!delivered) await reportFailure3(env, claimed, now);
    await storage.updateIntent({ ...claimed, state: delivered ? "done" : "failed", attempts: 2, dueAt: FEEDBACK_INTENT_DONE_DUE_AT });
  }
}, "retryDueFeedbackNotifications");
var ACTION_PATH2 = "/feedback-notifications/actions";
var ALLOWED_ORIGINS3 = /* @__PURE__ */ new Set(["https://kahut1.web.app", "http://localhost:5173", "http://localhost:5174"]);
var ID10 = /^[A-Za-z0-9_-]{1,128}$/u;
var UUID4 = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
var RETRY_DELAY_MS7 = 60 * 60 * 1e3;
var FEEDBACK_INTENT_DONE_DUE_AT = 864e13;
var record10 = /* @__PURE__ */ __name2((value) => value && typeof value === "object" && !Array.isArray(value) ? value : null, "record");
var required11 = /* @__PURE__ */ __name2((env, name) => {
  const value = env[name];
  if (typeof value !== "string" || !value.trim()) throw new Error(`missing_${name.toLowerCase()}`);
  return value.trim();
}, "required");
var response2 = /* @__PURE__ */ __name2((request, body, status) => {
  const headers2 = new Headers({ "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8", Vary: "Origin, Access-Control-Request-Method, Access-Control-Request-Headers" });
  const origin = request.headers.get("Origin");
  if (origin && ALLOWED_ORIGINS3.has(origin)) {
    headers2.set("Access-Control-Allow-Origin", origin);
    headers2.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    headers2.set("Access-Control-Allow-Headers", "Authorization, Content-Type, Idempotency-Key");
  }
  return new Response(JSON.stringify(body), { status, headers: headers2 });
}, "response");
var parseFeedbackAction = /* @__PURE__ */ __name2(async (request) => {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) throw new Error("content_type_required");
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 12e3) throw new Error("feedback_action_body_too_large");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("feedback_action_invalid_json");
  }
  const value = record10(parsed);
  const expected = value?.feedbackKind === "question" ? ["actionType", "eventId", "feedback", "feedbackKind", "questionId", "resultId", "schemaVersion"] : ["actionType", "eventId", "feedback", "feedbackKind", "resultId", "schemaVersion"];
  if (!value || Object.keys(value).sort().join(",") !== expected.join(",") || value.schemaVersion !== 1 || value.actionType !== "save-feedback" || typeof value.eventId !== "string" || !UUID4.test(value.eventId) || request.headers.get("Idempotency-Key") !== value.eventId || typeof value.resultId !== "string" || !ID10.test(value.resultId) || !["question", "overall"].includes(String(value.feedbackKind)) || value.feedbackKind === "question" && (typeof value.questionId !== "string" || !ID10.test(value.questionId)) || typeof value.feedback !== "string" || value.feedback.length > 5e3) throw new Error("feedback_action_invalid");
  return value;
}, "parseFeedbackAction");
var feedbackNotification = /* @__PURE__ */ __name2((result) => ({
  type: "feedback",
  title: "New Feedback Available",
  message: "Your teacher added feedback to your test result.",
  link: buildRoute2("RESULT_DETAIL", { resultId: String(result.resultId) })
}), "feedbackNotification");
var trustedFeedbackActor = /* @__PURE__ */ __name2(async (storage, result, actorUid) => {
  const actor = record10(await storage.read(`users/${actorUid}`));
  if (!actor || !["teacher", "super_admin"].includes(String(actor.role))) return null;
  if (actor.role === "super_admin") return actor;
  const visibility = record10(result.visibility);
  const visibilityOwner = visibility?.ownershipResolved === true && visibility.visibilityOwnerTeacherId === actorUid;
  const directOwner = result.teacherId === actorUid;
  const courseId = typeof result.courseId === "string" ? result.courseId : "";
  const course = courseId ? record10(await storage.read(`courses/${courseId}`)) : null;
  return visibilityOwner || directOwner || course?.createdBy === actorUid ? actor : null;
}, "trustedFeedbackActor");
var performFeedbackAction = /* @__PURE__ */ __name2(async (input) => {
  const { command, actorUid, storage } = input;
  const existing = record10(await storage.read(`feedback_notification_intents/${command.eventId}`));
  if (existing) {
    if (existing.eventId !== command.eventId || existing.resultId !== command.resultId || existing.actorUid !== actorUid || existing.kind !== `feedback-${command.feedbackKind}` || (existing.questionId ?? null) !== (command.questionId ?? null)) {
      return { status: 409, body: { code: "feedback_action_event_conflict" } };
    }
    return { status: 200, body: { status: "replayed", eventId: command.eventId, notificationStatus: existing.state } };
  }
  const result = record10(await storage.read(`test_results/${command.resultId}`));
  if (!result || result.resultId !== command.resultId || typeof result.studentId !== "string" || !ID10.test(result.studentId)) {
    return { status: 404, body: { code: "feedback_result_not_found" } };
  }
  const actor = await trustedFeedbackActor(storage, result, actorUid);
  if (!actor) return { status: 403, body: { code: "feedback_action_forbidden" } };
  if (command.feedbackKind === "question") {
    const questions = Array.isArray(result.questionResults) ? result.questionResults : [];
    const questionExists = questions.some((item) => {
      const question = record10(item);
      return question && (question.questionId === command.questionId || String(question.questionNumber ?? "") === command.questionId);
    });
    if (!questionExists) return { status: 409, body: { code: "feedback_question_not_found" } };
  }
  const occurredAt = (input.now ?? Date.now)();
  const intent = {
    schemaVersion: 1,
    eventId: command.eventId,
    kind: `feedback-${command.feedbackKind}`,
    resultId: command.resultId,
    actorUid,
    studentId: result.studentId,
    ...command.questionId === void 0 ? {} : { questionId: command.questionId },
    occurredAt,
    dueAt: occurredAt + RETRY_DELAY_MS7,
    attempts: 1,
    state: "retry_due"
  };
  try {
    await storage.commit({ command, actorUid, actor, intent, result });
  } catch {
    const committed = record10(await storage.read(`feedback_notification_intents/${command.eventId}`));
    if (!committed || committed.resultId !== command.resultId || committed.actorUid !== actorUid) {
      return { status: 409, body: { code: "feedback_action_commit_failed" } };
    }
  }
  let notificationStatus = "retry_due";
  try {
    const sent = await input.repository.create({
      operationId: command.eventId,
      recipientId: intent.studentId,
      notification: feedbackNotification(result),
      now: occurredAt
    });
    if (sent.status !== "idempotency-conflict") {
      await storage.updateIntent({ ...intent, state: "done", dueAt: FEEDBACK_INTENT_DONE_DUE_AT });
      notificationStatus = "delivered";
    }
  } catch {
  }
  return { status: 200, body: { status: "committed", eventId: command.eventId, notificationStatus } };
}, "performFeedbackAction");
var createFeedbackNotificationWorker = /* @__PURE__ */ __name2((options = {}) => {
  const verifier = options.firebaseVerifier ?? createFirebaseVerifier2();
  const repositoryFactory = options.repositoryFactory ?? ((env) => new FirebaseRestNotificationCommandRepository({
    env: {
      FIREBASE_DB_URL: required11(env, "FIREBASE_DB_URL"),
      FIREBASE_PROJECT_ID: required11(env, "FIREBASE_PROJECT_ID"),
      NOTIFICATION_COMMAND_SERVICE_IDENTITY: required11(env, "NOTIFICATION_COMMAND_SERVICE_IDENTITY"),
      NOTIFICATION_COMMAND_GOOGLE_SA_KEY: required11(env, "NOTIFICATION_COMMAND_GOOGLE_SA_KEY")
    }
  }));
  const storageFactory = options.actionStorageFactory ?? ((env) => new FirebaseFeedbackActionStorage(env));
  return {
    async fetch(request, env) {
      const url = new URL(request.url);
      if (url.pathname !== ACTION_PATH2 || url.search || url.hash) return response2(request, { code: "feedback_action_not_found" }, 404);
      const origin = request.headers.get("Origin");
      if (origin && !ALLOWED_ORIGINS3.has(origin)) return response2(request, { code: "cors_origin_denied" }, 403);
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: response2(request, {}, 200).headers });
      if (request.method !== "POST") return response2(request, { code: "method_not_allowed" }, 405);
      const auth = await verifier.verifyAuthorizationHeader(request.headers.get("Authorization"), env);
      if (!auth.valid || typeof auth.uid !== "string" || !auth.uid) return response2(request, { code: "feedback_action_unauthenticated" }, 401);
      const limiter = env.NOTIFICATION_RATE_LIMITER;
      if (!limiter || typeof limiter.limit !== "function") return response2(request, { code: "notification_command_unavailable" }, 503);
      if (!(await limiter.limit({ key: `feedback:${auth.uid}` })).success) return response2(request, { code: "rate_limited" }, 429);
      try {
        const command = await parseFeedbackAction(request);
        const result = await performFeedbackAction({ command, actorUid: auth.uid, storage: storageFactory(env), repository: repositoryFactory(env), now: options.now });
        return response2(request, result.body, result.status);
      } catch (error) {
        if (error instanceof Error && (error.message === "content_type_required" || error.message.startsWith("feedback_action_"))) {
          return response2(request, { code: error.message }, 400);
        }
        return response2(request, { code: "feedback_action_failed" }, 500);
      }
    }
  };
}, "createFeedbackNotificationWorker");
var required12 = /* @__PURE__ */ __name2((env, key) => {
  const value = env[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`missing_${key.toLowerCase()}`);
  return value.trim();
}, "required");
var record11 = /* @__PURE__ */ __name2((value) => value && typeof value === "object" && !Array.isArray(value) ? value : null, "record");
var canonical2 = /* @__PURE__ */ __name2((value) => {
  if (Array.isArray(value)) return value.map(canonical2);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => [key, canonical2(child)]));
  }
  return value;
}, "canonical");
var courseAnnouncementProofPayload = /* @__PURE__ */ __name2((announcement) => JSON.stringify(canonical2({
  purpose: "course-announcement-notification-v1",
  id: announcement.id,
  courseId: announcement.courseId,
  courseName: announcement.courseName,
  teacherId: announcement.teacherId,
  teacherName: announcement.teacherName,
  targetClassIds: announcement.targetClassIds,
  title: announcement.title,
  content: announcement.content,
  attachments: announcement.attachments ?? [],
  createdAt: announcement.createdAt,
  sentToStudentIds: announcement.sentToStudentIds,
  eventId: announcement.notificationIntent?.eventId,
  kind: announcement.notificationIntent?.kind,
  intentCourseId: announcement.notificationIntent?.courseId,
  actorUid: announcement.notificationIntent?.actorUid,
  occurredAt: announcement.notificationIntent?.occurredAt
})), "courseAnnouncementProofPayload");
var FirebaseCourseAnnouncementActionStorage = class {
  static {
    __name(this, "FirebaseCourseAnnouncementActionStorage");
  }
  static {
    __name2(this, "FirebaseCourseAnnouncementActionStorage");
  }
  admin;
  signingSecret;
  signingKey;
  constructor(env, fetchImpl = globalThis.fetch) {
    let serviceAccount;
    try {
      serviceAccount = JSON.parse(required12(env, "NOTIFICATION_COMMAND_GOOGLE_SA_KEY"));
    } catch {
      throw new Error("invalid_notification_command_google_sa_key");
    }
    if (typeof serviceAccount.private_key !== "string" || !serviceAccount.private_key.trim()) {
      throw new Error("invalid_notification_command_google_sa_key");
    }
    this.signingSecret = serviceAccount.private_key;
    this.admin = new FirebaseRtdbRestClient({ env: {
      FIREBASE_DB_URL: required12(env, "FIREBASE_DB_URL"),
      FIREBASE_PROJECT_ID: required12(env, "FIREBASE_PROJECT_ID"),
      GOOGLE_SA_KEY: required12(env, "NOTIFICATION_COMMAND_GOOGLE_SA_KEY")
    }, fetchImpl });
  }
  read(path) {
    return this.admin.readValue(path);
  }
  enrollmentsForCourse(courseId) {
    const query = { orderBy: "courseId", equalTo: courseId };
    return this.admin.readValue("course_enrollments", query);
  }
  async readAnnouncement(announcementId) {
    return record11(await this.admin.readValue(`course_announcements/${announcementId}`));
  }
  async readIntent(announcementId) {
    const result = await this.admin.readWithEtag(
      `course_announcements/${announcementId}/notificationIntent`
    );
    return { intent: result.data, etag: result.etag };
  }
  async commit(input) {
    const path = `course_announcements/${input.command.actionId}`;
    const current = await this.admin.readWithEtag(path);
    if (current.data !== null) throw new Error("course_announcement_exists");
    if (!await this.admin.writeIfMatch(path, input.record, current.etag)) {
      throw new Error("course_announcement_commit_conflict");
    }
  }
  writeIntent(announcementId, intent, etag) {
    return this.admin.writeIfMatch(`course_announcements/${announcementId}/notificationIntent`, intent, etag);
  }
  hmacKey() {
    this.signingKey ??= crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(this.signingSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"]
    );
    return this.signingKey;
  }
  async signRecord(announcement) {
    const signature = await crypto.subtle.sign(
      "HMAC",
      await this.hmacKey(),
      new TextEncoder().encode(courseAnnouncementProofPayload(announcement))
    );
    return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  async verifyRecord(announcement) {
    const proof = announcement.notificationIntent?.trustProof;
    if (typeof proof !== "string" || !/^[0-9a-f]{64}$/u.test(proof)) return false;
    const signature = Uint8Array.from(proof.match(/.{2}/gu) ?? [], (byte) => Number.parseInt(byte, 16));
    return crypto.subtle.verify(
      "HMAC",
      await this.hmacKey(),
      signature,
      new TextEncoder().encode(courseAnnouncementProofPayload(announcement))
    );
  }
  async dueAnnouncements(limit) {
    const rows = await this.admin.readValue("course_announcements", {
      orderBy: "notificationIntent/dueAt",
      startAt: 0,
      limitToFirst: limit
    });
    if (!rows || typeof rows !== "object" || Array.isArray(rows)) return [];
    return Object.values(rows).map(record11).filter((row9) => Boolean(row9));
  }
  async reportFailure(announcement, intent, failedRecipientCount) {
    const now = Date.now();
    const day22 = new Date(now).toISOString().slice(0, 10);
    const path = `reports/errors/${day22}/course-announcement-${intent.eventId}`;
    const current = await this.admin.readWithEtag(path);
    if (current.data !== null) return;
    await this.admin.writeIfMatch(path, {
      id: `course-announcement-${intent.eventId}`,
      timestamp: now,
      feature: "courses",
      severity: "error",
      message: `Course announcement notification delivery failed; ${failedRecipientCount} recipient(s) remain.`,
      userId: intent.actorUid,
      userName: "Notification Worker",
      userRole: "service",
      duplicateCount: 1,
      contextData: {
        actionId: intent.eventId,
        announcementId: announcement.id,
        courseId: intent.courseId,
        failedRecipientCount
      }
    }, current.etag);
  }
};
var ACTION_PATH3 = "/course-announcements/actions";
var ALLOWED_ORIGINS4 = /* @__PURE__ */ new Set(["https://kahut1.web.app", "http://localhost:5173", "http://localhost:5174"]);
var ID11 = /^[A-Za-z0-9_-]{1,128}$/u;
var UUID5 = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
var RETRY_DELAY_MS8 = 60 * 60 * 1e3;
var LEASE_MS2 = 5 * 60 * 1e3;
var MAX_DUE_PER_PASS2 = 1;
var MAX_RECIPIENTS = 1e3;
var MAX_DELIVERIES_PER_PASS = 10;
var DONE_DUE_AT5 = 864e13;
var record12 = /* @__PURE__ */ __name2((value) => value && typeof value === "object" && !Array.isArray(value) ? value : null, "record");
var required13 = /* @__PURE__ */ __name2((env, key) => {
  const value = env[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`missing_${key.toLowerCase()}`);
  return value.trim();
}, "required");
var response3 = /* @__PURE__ */ __name2((request, body, status) => {
  const headers2 = new Headers({
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    Vary: "Origin, Access-Control-Request-Method, Access-Control-Request-Headers"
  });
  const origin = request.headers.get("Origin");
  if (origin && ALLOWED_ORIGINS4.has(origin)) {
    headers2.set("Access-Control-Allow-Origin", origin);
    headers2.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    headers2.set("Access-Control-Allow-Headers", "Authorization, Content-Type, Idempotency-Key");
  }
  return new Response(JSON.stringify(body), { status, headers: headers2 });
}, "response");
var validAttachments = /* @__PURE__ */ __name2((value) => Array.isArray(value) && value.length <= 20 && value.every((entry) => {
  const attachment = record12(entry);
  return Boolean(attachment && Object.keys(attachment).sort().join(",") === "name,size,type,url" && typeof attachment.name === "string" && attachment.name.trim().length > 0 && attachment.name.length <= 200 && typeof attachment.url === "string" && attachment.url.length <= 2048 && typeof attachment.type === "string" && attachment.type.length <= 120 && Number.isSafeInteger(attachment.size) && attachment.size >= 0);
}), "validAttachments");
var parseCourseAnnouncementAction = /* @__PURE__ */ __name2(async (request) => {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) throw new Error("content_type_required");
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 65536) throw new Error("course_announcement_body_too_large");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("course_announcement_invalid_json");
  }
  const value = record12(parsed);
  const keys2 = value ? Object.keys(value).sort().join(",") : "";
  const expected = value && Object.hasOwn(value, "attachments") ? "actionId,actionType,attachments,content,courseId,schemaVersion,targetClassIds,title" : "actionId,actionType,content,courseId,schemaVersion,targetClassIds,title";
  if (!value || keys2 !== expected || value.schemaVersion !== 1 || value.actionType !== "create-course-announcement" || typeof value.actionId !== "string" || !UUID5.test(value.actionId) || request.headers.get("Idempotency-Key") !== value.actionId || typeof value.courseId !== "string" || !ID11.test(value.courseId) || !Array.isArray(value.targetClassIds) || value.targetClassIds.length > 100 || !value.targetClassIds.every((id) => typeof id === "string" && ID11.test(id)) || new Set(value.targetClassIds).size !== value.targetClassIds.length || typeof value.title !== "string" || !value.title.trim() || value.title.length > 200 || typeof value.content !== "string" || !value.content.trim() || value.content.length > 6e4 || Object.hasOwn(value, "attachments") && !validAttachments(value.attachments)) {
    throw new Error("course_announcement_invalid");
  }
  return value;
}, "parseCourseAnnouncementAction");
var deterministicId = /* @__PURE__ */ __name2((key) => {
  const hash = /* @__PURE__ */ __name2((value, seed) => {
    let result = (2166136261 ^ seed) >>> 0;
    for (let index = 0; index < value.length; index += 1) result = Math.imul(result ^ value.charCodeAt(index), 16777619) >>> 0;
    return result;
  }, "hash");
  const hex = [0, 1, 2, 3].map((seed) => hash(`${key}:${seed}`, seed).toString(16).padStart(8, "0")).join("");
  const versioned = `${hex.slice(0, 12)}5${hex.slice(13, 16)}8${hex.slice(17)}`;
  return `${versioned.slice(0, 8)}-${versioned.slice(8, 12)}-${versioned.slice(12, 16)}-${versioned.slice(16, 20)}-${versioned.slice(20)}`;
}, "deterministicId");
var teacherName = /* @__PURE__ */ __name2((user, actorUid) => {
  for (const value of [user.displayName, user.name, user.fullName]) {
    if (typeof value === "string" && value.trim()) return value.trim().slice(0, 100);
  }
  return actorUid;
}, "teacherName");
var preview = /* @__PURE__ */ __name2((html) => html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/giu, " ").replace(/<br\s*\/?\s*>|<\/(?:p|div|li|h[1-6])\s*>/giu, " ").replace(/<[^>]*>/gu, "").replace(/&nbsp;|&#160;/giu, " ").replace(/&amp;/giu, "&").replace(/&lt;/giu, "<").replace(/&gt;/giu, ">").replace(/&quot;/giu, '"').replace(/&#39;|&apos;/giu, "'").replace(/\s+/gu, " ").trim().slice(0, 200), "preview");
var courseAnnouncementNotice = /* @__PURE__ */ __name2((announcement) => {
  const excerpt = preview(announcement.content);
  return {
    type: "info",
    title: `\u{1F4E2} ${announcement.courseName}: ${announcement.title}`.slice(0, 300),
    message: `${excerpt}${excerpt.length === 200 ? "\u2026" : ""}`,
    link: buildRoute2("STUDENT_COURSE_DETAIL", { courseId: announcement.courseId })
  };
}, "courseAnnouncementNotice");
var eventIdForRecipient = /* @__PURE__ */ __name2((eventId, recipientId) => deterministicId(`${eventId}:${recipientId}`), "eventIdForRecipient");
var recipientsFor = /* @__PURE__ */ __name2((command, enrollments) => {
  if (!enrollments || typeof enrollments !== "object" || Array.isArray(enrollments)) return [];
  const selectedClasses = new Set(command.targetClassIds);
  return [...new Set(Object.values(enrollments).flatMap((value) => {
    const enrollment = record12(value);
    if (!enrollment || enrollment.courseId !== command.courseId || enrollment.status !== "active" || typeof enrollment.studentId !== "string" || !ID11.test(enrollment.studentId)) return [];
    if (selectedClasses.size && (typeof enrollment.sourceClassId !== "string" || !selectedClasses.has(enrollment.sourceClassId))) return [];
    return [enrollment.studentId];
  }))].sort();
}, "recipientsFor");
var sameCommand = /* @__PURE__ */ __name2((announcement, command, actorUid) => announcement.id === command.actionId && announcement.courseId === command.courseId && announcement.teacherId === actorUid && announcement.title === command.title && announcement.content === command.content && JSON.stringify(announcement.targetClassIds) === JSON.stringify(command.targetClassIds) && JSON.stringify(announcement.attachments ?? []) === JSON.stringify(command.attachments ?? []), "sameCommand");
var validIntent3 = /* @__PURE__ */ __name2((announcement) => {
  if (!Array.isArray(announcement.sentToStudentIds)) return null;
  const intent = record12(announcement.notificationIntent);
  if (!intent || intent.schemaVersion !== 1 || intent.eventId !== announcement.id || intent.kind !== "course-announcement-created" || intent.courseId !== announcement.courseId || intent.actorUid !== announcement.teacherId || typeof intent.occurredAt !== "number" || typeof intent.dueAt !== "number" || ![0, 1, 2].includes(intent.attempts) || !Number.isSafeInteger(intent.cursor) || intent.cursor < 0 || intent.cursor > announcement.sentToStudentIds.length || !Number.isSafeInteger(intent.retryCursor) || intent.retryCursor < 0 || !Array.isArray(intent.failedRecipientIds) || !Array.isArray(intent.retryRecipientIds) || !Array.isArray(intent.finalFailedRecipientIds) || intent.batchRecipientIds !== void 0 && (!Array.isArray(intent.batchRecipientIds) || intent.batchRecipientIds.length > MAX_DELIVERIES_PER_PASS) || !["due", "sending", "retry_due", "retrying", "done", "failed"].includes(String(intent.state))) return null;
  return intent;
}, "validIntent");
var authoritativeAnnouncement = /* @__PURE__ */ __name2((announcement) => ID11.test(announcement.id) && ID11.test(announcement.courseId) && ID11.test(announcement.teacherId) && typeof announcement.courseName === "string" && typeof announcement.teacherName === "string" && typeof announcement.title === "string" && typeof announcement.content === "string" && typeof announcement.createdAt === "number" && Array.isArray(announcement.sentToStudentIds) && announcement.sentToStudentIds.length > 0 && announcement.sentToStudentIds.length <= MAX_RECIPIENTS && announcement.sentToStudentIds.every((id) => typeof id === "string" && ID11.test(id)) && new Set(announcement.sentToStudentIds).size === announcement.sentToStudentIds.length, "authoritativeAnnouncement");
var terminal2 = /* @__PURE__ */ __name2((intent) => ({
  ...intent,
  dueAt: DONE_DUE_AT5
}), "terminal");
var markWith = /* @__PURE__ */ __name2(async (storage, announcementId, allowed, next) => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await storage.readIntent(announcementId);
    if (!current.intent || !allowed(current.intent)) return null;
    const updated = next(current.intent);
    if (await storage.writeIntent(announcementId, updated, current.etag)) return updated;
  }
  return null;
}, "markWith");
var deliverCourseAnnouncement = /* @__PURE__ */ __name2(async (announcement, repository, recipientIds = announcement.sentToStudentIds) => {
  if (!authoritativeAnnouncement(announcement) || !validIntent3(announcement)) {
    return { delivered: false, failedRecipientIds: [...recipientIds], backendFailure: false };
  }
  const notice = courseAnnouncementNotice(announcement);
  if (recipientIds.length > MAX_DELIVERIES_PER_PASS || recipientIds.some((recipientId) => !announcement.sentToStudentIds.includes(recipientId))) {
    return { delivered: false, failedRecipientIds: [...recipientIds], backendFailure: false };
  }
  for (let index = 0; index < recipientIds.length; index += 1) {
    const recipientId = recipientIds[index];
    try {
      const result = await repository.create({
        operationId: eventIdForRecipient(announcement.id, recipientId),
        recipientId,
        notification: notice,
        now: announcement.createdAt
      });
      if (result.status === "idempotency-conflict") {
        return { delivered: false, failedRecipientIds: recipientIds.slice(index), backendFailure: false };
      }
    } catch {
      return { delivered: false, failedRecipientIds: recipientIds.slice(index), backendFailure: true };
    }
  }
  return { delivered: true, failedRecipientIds: [], backendFailure: false };
}, "deliverCourseAnnouncement");
var createCourseAnnouncementHandlers = /* @__PURE__ */ __name2((options) => {
  const now = options.now ?? Date.now;
  const completeBatch = /* @__PURE__ */ __name2(async (announcement, claimed, failedRecipientIds) => {
    const isInitial = claimed.state === "sending";
    const batch = claimed.batchRecipientIds ?? [];
    const terminalRetryFailures = !isInitial && claimed.retryCursor + batch.length >= claimed.retryRecipientIds.length ? [.../* @__PURE__ */ new Set([...claimed.finalFailedRecipientIds, ...failedRecipientIds])] : [];
    if (terminalRetryFailures.length) {
      await options.storage.reportFailure(announcement, terminal2(claimed), terminalRetryFailures.length);
    }
    const updated = await markWith(
      options.storage,
      announcement.id,
      (current) => current.state === claimed.state && current.attempts === claimed.attempts && current.cursor === claimed.cursor && current.retryCursor === claimed.retryCursor && JSON.stringify(current.batchRecipientIds) === JSON.stringify(batch),
      (current) => {
        const failed2 = isInitial ? [.../* @__PURE__ */ new Set([...current.failedRecipientIds, ...failedRecipientIds])] : current.failedRecipientIds;
        const nextCursor = isInitial ? current.cursor + batch.length : current.cursor;
        const nextRetryCursor = isInitial ? current.retryCursor : current.retryCursor + batch.length;
        const finalFailed = isInitial ? current.finalFailedRecipientIds : [.../* @__PURE__ */ new Set([...current.finalFailedRecipientIds, ...failedRecipientIds])];
        if (isInitial && nextCursor < announcement.sentToStudentIds.length) {
          return { ...current, cursor: nextCursor, failedRecipientIds: failed2, batchRecipientIds: void 0, state: "due", dueAt: now() };
        }
        if (isInitial && failed2.length) {
          return {
            ...current,
            cursor: nextCursor,
            failedRecipientIds: failed2,
            retryRecipientIds: failed2,
            retryCursor: 0,
            batchRecipientIds: void 0,
            state: "retry_due",
            dueAt: now() + RETRY_DELAY_MS8
          };
        }
        if (isInitial) return { ...terminal2(current), cursor: nextCursor, batchRecipientIds: void 0, state: "done" };
        if (nextRetryCursor < current.retryRecipientIds.length) {
          return {
            ...current,
            retryCursor: nextRetryCursor,
            finalFailedRecipientIds: finalFailed,
            batchRecipientIds: void 0,
            state: "retry_due",
            dueAt: now()
          };
        }
        return {
          ...terminal2(current),
          retryCursor: nextRetryCursor,
          finalFailedRecipientIds: finalFailed,
          batchRecipientIds: void 0,
          state: finalFailed.length ? "failed" : "done"
        };
      }
    );
    if (!updated) throw new Error("course_announcement_intent_update_failed");
    return failedRecipientIds.length === 0;
  }, "completeBatch");
  const attempt = /* @__PURE__ */ __name2(async (announcement, intent) => {
    const batch = intent.batchRecipientIds ?? [];
    const result = await deliverCourseAnnouncement({ ...announcement, notificationIntent: intent }, options.repository, batch);
    return completeBatch(announcement, intent, result.failedRecipientIds);
  }, "attempt");
  const claimBatch = /* @__PURE__ */ __name2(async (announcement, retry) => markWith(
    options.storage,
    announcement.id,
    (current) => current.dueAt <= now() && (retry ? current.state === "retry_due" && current.attempts >= 1 && current.retryCursor < current.retryRecipientIds.length : current.state === "due" && current.cursor < announcement.sentToStudentIds.length),
    (current) => {
      const ids = retry ? current.retryRecipientIds : announcement.sentToStudentIds;
      const offset = retry ? current.retryCursor : current.cursor;
      return {
        ...current,
        state: retry ? "retrying" : "sending",
        attempts: retry ? 2 : 1,
        batchRecipientIds: ids.slice(offset, offset + MAX_DELIVERIES_PER_PASS),
        dueAt: now() + LEASE_MS2
      };
    }
  ), "claimBatch");
  const recoverLease = /* @__PURE__ */ __name2(async (announcement, intent) => {
    const batch = intent.batchRecipientIds ?? [];
    const failed2 = [];
    for (const recipientId of batch) {
      if (!options.repository.exists || !await options.repository.exists(recipientId, eventIdForRecipient(intent.eventId, recipientId))) failed2.push(recipientId);
    }
    await completeBatch(announcement, intent, failed2);
  }, "recoverLease");
  const dispatch = /* @__PURE__ */ __name2(async (command, actorUid) => {
    const existing = await options.storage.readAnnouncement(command.actionId);
    if (existing) {
      const intent = validIntent3(existing);
      if (!intent || intent.actorUid !== actorUid || !sameCommand(existing, command, actorUid) || !await options.storage.verifyRecord(existing)) {
        return { status: 409, body: { code: "course_announcement_action_conflict" } };
      }
      if (intent.state === "due" && intent.dueAt <= now()) {
        const claimed2 = await claimBatch(existing, false);
        if (claimed2) {
          try {
            await attempt(existing, claimed2);
          } catch {
          }
        }
      }
      const current2 = await options.storage.readIntent(existing.id);
      return { status: 200, body: {
        status: "replayed",
        announcementId: existing.id,
        notificationStatus: current2.intent?.state ?? "failed",
        notificationIds: existing.sentToStudentIds.map((recipientId) => eventIdForRecipient(existing.id, recipientId))
      } };
    }
    const actor = record12(await options.storage.read(`users/${actorUid}`));
    if (!actor || !["teacher", "super_admin"].includes(String(actor.role))) {
      return { status: 403, body: { code: "course_announcement_forbidden" } };
    }
    const course = record12(await options.storage.read(`courses/${command.courseId}`));
    if (!course || actor.role !== "super_admin" && course.ownerId !== actorUid) {
      return { status: 403, body: { code: "course_announcement_course_forbidden" } };
    }
    const recipients = recipientsFor(command, await options.storage.enrollmentsForCourse(command.courseId));
    if (!recipients.length) return { status: 409, body: { code: "course_announcement_no_recipients" } };
    if (recipients.length > MAX_RECIPIENTS) return { status: 413, body: { code: "course_announcement_roster_too_large" } };
    const at = now();
    const draft = {
      id: command.actionId,
      courseId: command.courseId,
      courseName: typeof course.name === "string" && course.name.trim() ? course.name.trim().slice(0, 160) : command.courseId,
      teacherId: actorUid,
      teacherName: teacherName(actor, actorUid),
      targetClassIds: [...command.targetClassIds],
      title: command.title,
      content: command.content,
      ...command.attachments === void 0 ? {} : { attachments: command.attachments.map((item) => ({ ...item })) },
      createdAt: at,
      sentToStudentIds: recipients,
      notificationIntent: {
        schemaVersion: 1,
        eventId: command.actionId,
        kind: "course-announcement-created",
        courseId: command.courseId,
        actorUid,
        occurredAt: at,
        dueAt: at,
        attempts: 0,
        state: "due",
        cursor: 0,
        failedRecipientIds: [],
        retryCursor: 0,
        retryRecipientIds: [],
        finalFailedRecipientIds: []
      }
    };
    const announcement = {
      ...draft,
      notificationIntent: { ...draft.notificationIntent, trustProof: await options.storage.signRecord(draft) }
    };
    try {
      await options.storage.commit({ command, actorUid, record: announcement });
    } catch {
      const committed = await options.storage.readAnnouncement(command.actionId);
      const intent = committed && validIntent3(committed);
      if (!committed || !intent || intent.actorUid !== actorUid || !sameCommand(committed, command, actorUid) || !await options.storage.verifyRecord(committed)) {
        return { status: 409, body: { code: "course_announcement_commit_failed" } };
      }
      return { status: 200, body: {
        status: "replayed",
        announcementId: committed.id,
        notificationStatus: intent.state,
        notificationIds: committed.sentToStudentIds.map((recipientId) => eventIdForRecipient(committed.id, recipientId))
      } };
    }
    const claimed = await claimBatch(announcement, false);
    if (claimed) {
      try {
        await attempt(announcement, claimed);
      } catch {
      }
    }
    const current = await options.storage.readIntent(announcement.id);
    return { status: 200, body: {
      status: "committed",
      announcementId: announcement.id,
      notificationStatus: current.intent?.state ?? "retry_due",
      notificationIds: recipients.map((recipientId) => eventIdForRecipient(announcement.id, recipientId))
    } };
  }, "dispatch");
  const runRetryBatch = /* @__PURE__ */ __name2(async () => {
    const due = await options.storage.dueAnnouncements(MAX_DUE_PER_PASS2);
    let processed = 0;
    for (const announcement of due) {
      if (!authoritativeAnnouncement(announcement) || !await options.storage.verifyRecord(announcement)) continue;
      const current = await options.storage.readIntent(announcement.id);
      const intent = current.intent;
      if (!intent || intent.dueAt > now() || intent.state === "done" || intent.state === "failed") continue;
      if (intent.state === "sending" || intent.state === "retrying") {
        await recoverLease(announcement, intent);
        processed += 1;
        continue;
      }
      const retry = intent.state === "retry_due";
      if (intent.state !== "due" && !retry) continue;
      const claimed = await claimBatch(announcement, retry);
      if (!claimed) continue;
      const delivered = await attempt(announcement, claimed);
      processed += 1;
      if (!delivered) break;
    }
    return { processed };
  }, "runRetryBatch");
  return { dispatch, runRetryBatch };
}, "createCourseAnnouncementHandlers");
var performCourseAnnouncementAction = /* @__PURE__ */ __name2(async (input) => createCourseAnnouncementHandlers(input).dispatch(input.command, input.actorUid), "performCourseAnnouncementAction");
var retryDueCourseAnnouncementNotifications = /* @__PURE__ */ __name2(async (env, now = Date.now()) => createCourseAnnouncementHandlers({
  storage: new FirebaseCourseAnnouncementActionStorage(env),
  repository: new FirebaseRestNotificationCommandRepository({
    env
  }),
  now: /* @__PURE__ */ __name2(() => now, "now")
}).runRetryBatch(), "retryDueCourseAnnouncementNotifications");
var createCourseAnnouncementNotificationWorker = /* @__PURE__ */ __name2((options = {}) => {
  const verifier = options.firebaseVerifier ?? createFirebaseVerifier2();
  const storageFactory = options.storageFactory ?? ((env) => new FirebaseCourseAnnouncementActionStorage(env));
  const repositoryFactory = options.repositoryFactory ?? ((env) => new FirebaseRestNotificationCommandRepository({
    env: {
      FIREBASE_DB_URL: required13(env, "FIREBASE_DB_URL"),
      FIREBASE_PROJECT_ID: required13(env, "FIREBASE_PROJECT_ID"),
      NOTIFICATION_COMMAND_SERVICE_IDENTITY: required13(env, "NOTIFICATION_COMMAND_SERVICE_IDENTITY"),
      NOTIFICATION_COMMAND_GOOGLE_SA_KEY: required13(env, "NOTIFICATION_COMMAND_GOOGLE_SA_KEY")
    }
  }));
  return {
    async fetch(request, env) {
      const url = new URL(request.url);
      if (url.pathname !== ACTION_PATH3 || url.search || url.hash) return response3(request, { code: "course_announcement_not_found" }, 404);
      const origin = request.headers.get("Origin");
      if (origin && !ALLOWED_ORIGINS4.has(origin)) return response3(request, { code: "cors_origin_denied" }, 403);
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: response3(request, {}, 200).headers });
      if (request.method !== "POST") return response3(request, { code: "method_not_allowed" }, 405);
      const auth = await verifier.verifyAuthorizationHeader(request.headers.get("Authorization"), env);
      if (!auth.valid || typeof auth.uid !== "string" || !auth.uid) return response3(request, { code: "course_announcement_unauthenticated" }, 401);
      const limiter = env.NOTIFICATION_RATE_LIMITER;
      if (!limiter || typeof limiter.limit !== "function") return response3(request, { code: "notification_command_unavailable" }, 503);
      if (!(await limiter.limit({ key: `course-announcement:${auth.uid}` })).success) return response3(request, { code: "rate_limited" }, 429);
      try {
        const command = await parseCourseAnnouncementAction(request);
        const result = await performCourseAnnouncementAction({
          command,
          actorUid: auth.uid,
          storage: storageFactory(env),
          repository: repositoryFactory(env),
          now: options.now
        });
        return response3(request, result.body, result.status);
      } catch (error) {
        if (error instanceof Error && (error.message === "content_type_required" || error.message.startsWith("course_announcement_"))) {
          return response3(request, { code: error.message }, 400);
        }
        return response3(request, { code: "course_announcement_action_failed" }, 500);
      }
    }
  };
}, "createCourseAnnouncementNotificationWorker");
var UUID6 = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
var ID12 = /^[A-Za-z0-9_-]{1,128}$/u;
var RETRY_DELAY_MS9 = 60 * 60 * 1e3;
var LIMIT3 = 1;
var HOMEWORK_RESET_INTENT_DONE_DUE_AT = 864e13;
var record13 = /* @__PURE__ */ __name2((value) => value && typeof value === "object" && !Array.isArray(value) ? value : null, "record");
var parseHomeworkResetAction = /* @__PURE__ */ __name2(async (request) => {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) throw new Error("homework_reset_content_type_required");
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 512) throw new Error("homework_reset_body_too_large");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("homework_reset_invalid_json");
  }
  const value = record13(parsed);
  if (!value || Object.keys(value).sort().join(",") !== "eventId" || typeof value.eventId !== "string" || !UUID6.test(value.eventId) || request.headers.get("Idempotency-Key") !== value.eventId) throw new Error("homework_reset_invalid");
  return { eventId: value.eventId };
}, "parseHomeworkResetAction");
var homeworkResetNotificationId = /* @__PURE__ */ __name2((intent) => {
  const text2 = `${intent.eventId}:${intent.studentId}`;
  const hash = /* @__PURE__ */ __name2((seed) => {
    let value = (2166136261 ^ seed) >>> 0;
    for (let index = 0; index < text2.length; index += 1) value = Math.imul(value ^ text2.charCodeAt(index), 16777619) >>> 0;
    return value.toString(16).padStart(8, "0");
  }, "hash");
  const hex = [0, 1, 2, 3].map(hash).join("");
  const versioned = `${hex.slice(0, 12)}5${hex.slice(13, 16)}8${hex.slice(17)}`;
  return `${versioned.slice(0, 8)}-${versioned.slice(8, 12)}-${versioned.slice(12, 16)}-${versioned.slice(16, 20)}-${versioned.slice(20)}`;
}, "homeworkResetNotificationId");
var trustedSource = /* @__PURE__ */ __name2((intent, homework) => {
  if (!homework || homework.id !== intent.homeworkId || homework.createdBy !== intent.actorUid) return null;
  const target = record13(homework.target);
  let assigned = false;
  if (target?.type === "students" || target?.type === "group") {
    assigned = Array.isArray(target.studentIds) && target.studentIds.includes(intent.studentId);
  } else if (target?.type === "class") {
    assigned = Object.hasOwn(record13(homework.classStudents) ?? {}, intent.studentId);
  } else if (target?.type === "course") {
    assigned = Array.isArray(homework.courseEnrollments) && homework.courseEnrollments.some((item) => {
      const enrollment = record13(item);
      return enrollment?.courseId === target.courseId && enrollment.studentId === intent.studentId && enrollment.status === "active" && (enrollment.expiresAt === 0 || typeof enrollment.expiresAt === "number" && enrollment.expiresAt > intent.occurredAt);
    });
  }
  if (!assigned) return null;
  return { link: buildRoute2("STUDENT_HOMEWORK_DETAIL", { homeworkId: intent.homeworkId }) };
}, "trustedSource");
var createHomeworkResetNotificationHandlers = /* @__PURE__ */ __name2((options) => {
  const now = options.now ?? Date.now;
  const deliver5 = /* @__PURE__ */ __name2(async (intent) => {
    const source = trustedSource(intent, await options.storage.readHomework(intent.homeworkId, intent.studentId));
    if (!source) return { delivered: false, fresh: false, reasonCode: "source_unavailable" };
    const result = await options.repository.create({
      operationId: homeworkResetNotificationId(intent),
      recipientId: intent.studentId,
      notification: {
        type: "warning",
        title: "\u{1F504} Homework Reset",
        message: "Your teacher reset your homework. You can now retake it.",
        link: source.link
      },
      now: intent.occurredAt
    });
    return {
      delivered: result.status !== "idempotency-conflict" || await options.storage.notificationExists(intent),
      fresh: result.status === "created",
      reasonCode: result.status === "idempotency-conflict" ? "inbox_conflict" : "delivery_unconfirmed"
    };
  }, "deliver");
  const attempt = /* @__PURE__ */ __name2(async (intent, version, retry) => {
    if (retry && await options.storage.retrySuppressed?.()) return;
    const attempts = retry ? 2 : 1;
    const claimed = { ...intent, state: retry ? "retrying" : "sending", attempts, dueAt: now() + RETRY_DELAY_MS9 };
    const claimVersion = await options.storage.updateIntent(intent.eventId, claimed, version);
    if (!claimVersion) return;
    let outcome = { delivered: false, fresh: false, reasonCode: "delivery_backend_error" };
    try {
      outcome = await deliver5(claimed);
    } catch {
    }
    if (outcome.fresh) {
      try {
        await options.storage.recordSuccess?.(now());
      } catch {
      }
    }
    let failedWithoutRetry = false;
    if (!outcome.delivered && (retry || await options.storage.retrySuppressed?.())) {
      try {
        await options.storage.reportFailure(claimed, now(), outcome.reasonCode);
        failedWithoutRetry = true;
      } catch {
      }
    }
    const next = {
      ...claimed,
      state: outcome.delivered ? "done" : failedWithoutRetry ? "failed" : retry ? "retrying" : "retry_due",
      dueAt: outcome.delivered || failedWithoutRetry ? HOMEWORK_RESET_INTENT_DONE_DUE_AT : claimed.dueAt
    };
    await options.storage.updateIntent(intent.eventId, next, claimVersion);
  }, "attempt");
  return {
    action: /* @__PURE__ */ __name2(async (input) => {
      if (!input.uid) return { body: { code: "homework_reset_unauthenticated" }, status: 401 };
      try {
        const { eventId } = await parseHomeworkResetAction(input.request);
        const saved = await options.storage.readIntent(eventId);
        const intent = saved?.intent;
        if (!saved || !isTrustedHomeworkResetIntent(intent, eventId) || intent.actorUid !== input.uid) {
          return { body: { code: "homework_reset_forbidden" }, status: 403 };
        }
        if (intent.state === "done") return { body: { status: "replayed", eventId }, status: 200 };
        if (intent.state !== "retry_due" || intent.attempts !== 0) return { body: { status: "retry_scheduled", eventId }, status: 200 };
        await attempt(intent, saved.version, false);
        const latest = await options.storage.readIntent(eventId);
        return { body: { status: latest?.intent.state === "done" ? "delivered" : latest?.intent.state === "failed" ? "failed" : "retry_scheduled", eventId }, status: 200 };
      } catch {
        return { body: { code: "homework_reset_action_failed" }, status: 500 };
      }
    }, "action"),
    retryDue: /* @__PURE__ */ __name2(async () => {
      for (const due of await options.storage.dueIntents(now(), LIMIT3)) {
        if (due.intent.state === "retry_due" && due.intent.attempts === 0) await attempt(due.intent, due.version, false);
        else if (["retry_due", "sending"].includes(due.intent.state) && due.intent.attempts === 1) await attempt(due.intent, due.version, true);
        else if (due.intent.state === "retrying" && due.intent.attempts === 2) {
          const delivered = await options.storage.notificationExists(due.intent);
          if (!delivered) await options.storage.reportFailure(due.intent, now(), "inbox_missing_after_claim");
          await options.storage.updateIntent(due.intent.eventId, {
            ...due.intent,
            state: delivered ? "done" : "failed",
            dueAt: HOMEWORK_RESET_INTENT_DONE_DUE_AT
          }, due.version);
        }
      }
    }, "retryDue")
  };
}, "createHomeworkResetNotificationHandlers");
var isTrustedHomeworkResetIntent = /* @__PURE__ */ __name2((value, eventId) => {
  const intent = record13(value);
  return Boolean(intent && intent.schemaVersion === 1 && intent.eventId === eventId && UUID6.test(eventId) && typeof intent.homeworkId === "string" && ID12.test(intent.homeworkId) && typeof intent.studentId === "string" && ID12.test(intent.studentId) && typeof intent.sourceSubmissionId === "string" && ID12.test(intent.sourceSubmissionId) && typeof intent.actorUid === "string" && ID12.test(intent.actorUid) && Number.isSafeInteger(intent.occurredAt) && Number.isSafeInteger(intent.dueAt) && ["retry_due", "sending", "retrying", "done", "failed"].includes(String(intent.state)) && [0, 1, 2].includes(Number(intent.attempts)));
}, "isTrustedHomeworkResetIntent");
var COLLECTION3 = "homework_reset_notification_intents";
var required14 = /* @__PURE__ */ __name2((env, key) => {
  const value = env[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`missing_${key.toLowerCase()}`);
  return value.trim();
}, "required");
var encode5 = /* @__PURE__ */ __name2((value) => {
  if (value === null) return { nullValue: "NULL_VALUE" };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "number") return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encode5) } };
  if (typeof value === "object" && value) return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encode5(item)])) } };
  throw new Error("homework_reset_firestore_value_invalid");
}, "encode");
var decode4 = /* @__PURE__ */ __name2((value) => {
  if ("nullValue" in value) return null;
  if ("booleanValue" in value) return value.booleanValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("stringValue" in value) return value.stringValue;
  if ("mapValue" in value) return Object.fromEntries(Object.entries(value.mapValue?.fields ?? {}).map(([key, item]) => [key, decode4(item)]));
  if ("arrayValue" in value) return (value.arrayValue?.values ?? []).map(decode4);
  return null;
}, "decode");
var decoded2 = /* @__PURE__ */ __name2((document) => Object.fromEntries(
  Object.entries(document.fields ?? {}).map(([key, value]) => [key, decode4(value)])
), "decoded");
var record14 = /* @__PURE__ */ __name2((value) => value && typeof value === "object" && !Array.isArray(value) ? value : null, "record");
var FirebaseHomeworkResetNotificationStorage = class {
  static {
    __name(this, "FirebaseHomeworkResetNotificationStorage");
  }
  constructor(env, fetchImpl = globalThis.fetch) {
    this.env = env;
    this.fetchImpl = fetchImpl;
    this.projectId = encodeURIComponent(required14(env, "FIREBASE_PROJECT_ID"));
    this.rtdb = new FirebaseRtdbRestClient({ env: {
      FIREBASE_DB_URL: required14(env, "FIREBASE_DB_URL"),
      FIREBASE_PROJECT_ID: required14(env, "FIREBASE_PROJECT_ID"),
      GOOGLE_SA_KEY: required14(env, "NOTIFICATION_COMMAND_GOOGLE_SA_KEY")
    }, fetchImpl });
    this.gate = new RetryFamilyGate(this.rtdb);
  }
  env;
  fetchImpl;
  static {
    __name2(this, "FirebaseHomeworkResetNotificationStorage");
  }
  projectId;
  rtdb;
  gate;
  retrySuppressed() {
    return this.gate.isSuppressed("homework-reset");
  }
  recordSuccess(at) {
    return this.gate.recordSuccess("homework-reset", at);
  }
  documentsUrl(path = "") {
    return `https://firestore.googleapis.com/v1/projects/${this.projectId}/databases/(default)/documents${path}`;
  }
  async token() {
    const key = JSON.parse(required14(this.env, "NOTIFICATION_COMMAND_GOOGLE_SA_KEY"));
    if (!key.client_email || !key.private_key || key.client_email !== required14(this.env, "NOTIFICATION_COMMAND_SERVICE_IDENTITY")) throw new Error("homework_reset_service_identity_invalid");
    return this.rtdb.getAccessToken();
  }
  async readIntent(eventId) {
    const token2 = await this.token();
    const response10 = await this.fetchImpl.call(globalThis, this.documentsUrl(`/${COLLECTION3}/${encodeURIComponent(eventId)}`), { headers: { Authorization: `Bearer ${token2}` } });
    if (response10.status === 404) return null;
    if (!response10.ok) throw new Error(`homework_reset_intent_read_failed:${response10.status}`);
    const document = await response10.json();
    if (!document.updateTime || !document.fields) return null;
    return { intent: decoded2(document), version: document.updateTime };
  }
  async readHomework(homeworkId, studentId) {
    const token2 = await this.token();
    const response10 = await this.fetchImpl.call(globalThis, this.documentsUrl(`/homework_assignments/${encodeURIComponent(homeworkId)}`), { headers: { Authorization: `Bearer ${token2}` } });
    if (response10.status === 404) return null;
    if (!response10.ok) throw new Error(`homework_reset_source_read_failed:${response10.status}`);
    const homework = decoded2(await response10.json());
    const target = record14(homework.target);
    if (target?.type === "class" && typeof target.classId === "string") {
      homework.classStudents = await this.rtdb.readValue(`classes/${target.classId}/students`);
    } else if (target?.type === "course" && typeof target.courseId === "string") {
      const rows = await this.rtdb.readValue("course_enrollments", { orderBy: "studentId", equalTo: studentId, limitToFirst: 30 });
      homework.courseEnrollments = rows && typeof rows === "object" && !Array.isArray(rows) ? Object.values(rows) : [];
    }
    return homework;
  }
  async updateIntent(eventId, intent, version) {
    const token2 = await this.token();
    const fields2 = ["state", "attempts", "dueAt"];
    const mask = fields2.map((field2) => `updateMask.fieldPaths=${field2}`).join("&");
    const response10 = await this.fetchImpl.call(globalThis, `${this.documentsUrl(`/${COLLECTION3}/${encodeURIComponent(eventId)}`)}?${mask}&currentDocument.updateTime=${encodeURIComponent(version)}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token2}`, "Content-Type": "application/json" },
      body: JSON.stringify({ fields: Object.fromEntries(fields2.map((field2) => [field2, encode5(intent[field2])])) })
    });
    if (response10.status === 409 || response10.status === 412) return null;
    if (!response10.ok) throw new Error(`homework_reset_intent_update_failed:${response10.status}`);
    return (await response10.json()).updateTime ?? null;
  }
  async dueIntents(now, limit = 2) {
    const token2 = await this.token();
    const response10 = await this.fetchImpl.call(globalThis, `${this.documentsUrl()}:runQuery`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token2}`, "Content-Type": "application/json" },
      body: JSON.stringify({ structuredQuery: {
        from: [{ collectionId: COLLECTION3 }],
        where: { fieldFilter: { field: { fieldPath: "dueAt" }, op: "LESS_THAN_OR_EQUAL", value: { integerValue: String(now) } } },
        orderBy: [{ field: { fieldPath: "dueAt" }, direction: "ASCENDING" }],
        limit
      } })
    });
    if (!response10.ok) throw new Error(`homework_reset_queue_read_failed:${response10.status}`);
    const rows = await response10.json();
    return rows.flatMap((row9) => row9.document?.name && row9.document.updateTime && row9.document.fields ? [row9.document] : []).map((document) => ({ intent: decoded2(document), version: document.updateTime })).filter(({ intent }) => intent.dueAt <= now && ["retry_due", "sending", "retrying"].includes(intent.state));
  }
  async notificationExists(intent) {
    const id = homeworkResetNotificationId(intent);
    const notification = record14(await this.rtdb.readValue(`notifications/${intent.studentId}/${id}`));
    return notification?.id === id;
  }
  async reportFailure(intent, now, reasonCode) {
    const issueId = `homework-reset-notification-${intent.eventId}`;
    const path = notificationIssuePath(issueId, intent.occurredAt);
    const existing = await this.rtdb.readWithEtag(path);
    if (existing.data !== null) return;
    if (await this.rtdb.writeIfMatch(path, {
      id: issueId,
      timestamp: now,
      feature: "homework",
      severity: "error",
      message: `Homework reset notification delivery failed (${reasonCode}).`,
      userId: intent.actorUid,
      userName: "Notification Worker",
      userRole: "service",
      duplicateCount: 1,
      contextData: {
        eventId: intent.eventId,
        homeworkId: intent.homeworkId,
        recipientId: intent.studentId,
        reasonCode
      }
    }, existing.etag)) await this.gate.recordTerminalFailure("homework-reset", intent.eventId, path);
  }
};
var ACTION_PATH4 = "/homework-reset-notifications/actions";
var ALLOWED_ORIGINS5 = /* @__PURE__ */ new Set(["https://kahut1.web.app", "https://hocthem.net", "http://localhost:5173", "http://localhost:5174"]);
var required15 = /* @__PURE__ */ __name2((env, name) => {
  const value = env[name];
  if (typeof value !== "string" || !value.trim()) throw new Error(`missing_${name.toLowerCase()}`);
  return value.trim();
}, "required");
var headers = /* @__PURE__ */ __name2((request) => {
  const value = new Headers({ "Cache-Control": "no-store", Vary: "Origin, Access-Control-Request-Method, Access-Control-Request-Headers" });
  const origin = request.headers.get("Origin");
  if (origin && ALLOWED_ORIGINS5.has(origin)) {
    value.set("Access-Control-Allow-Origin", origin);
    value.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    value.set("Access-Control-Allow-Headers", "Authorization, Content-Type, Idempotency-Key");
  }
  return value;
}, "headers");
var response4 = /* @__PURE__ */ __name2((request, body, status) => {
  const value = headers(request);
  value.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body), { status, headers: value });
}, "response");
var createHandlers2 = /* @__PURE__ */ __name2((env, options = {}) => createHomeworkResetNotificationHandlers({
  storage: (options.storageFactory ?? ((bindings) => new FirebaseHomeworkResetNotificationStorage(bindings)))(env),
  repository: (options.repositoryFactory ?? ((bindings) => new FirebaseRestNotificationCommandRepository({ env: {
    FIREBASE_DB_URL: required15(bindings, "FIREBASE_DB_URL"),
    FIREBASE_PROJECT_ID: required15(bindings, "FIREBASE_PROJECT_ID"),
    NOTIFICATION_COMMAND_SERVICE_IDENTITY: required15(bindings, "NOTIFICATION_COMMAND_SERVICE_IDENTITY"),
    NOTIFICATION_COMMAND_GOOGLE_SA_KEY: required15(bindings, "NOTIFICATION_COMMAND_GOOGLE_SA_KEY")
  } })))(env),
  now: options.now
}), "createHandlers");
var createHomeworkResetNotificationWorker = /* @__PURE__ */ __name2((options = {}) => {
  const verifier = options.firebaseVerifier ?? createFirebaseVerifier2();
  return {
    async fetch(request, env) {
      const url = new URL(request.url);
      if (url.pathname !== ACTION_PATH4 || url.search || url.hash) return response4(request, { code: "homework_reset_action_not_found" }, 404);
      const origin = request.headers.get("Origin");
      if (origin && !ALLOWED_ORIGINS5.has(origin)) return response4(request, { code: "cors_origin_denied" }, 403);
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: headers(request) });
      if (request.method !== "POST") return response4(request, { code: "method_not_allowed" }, 405);
      const auth = await verifier.verifyAuthorizationHeader(request.headers.get("Authorization"), env);
      if (!auth.valid || typeof auth.uid !== "string" || !auth.uid) return response4(request, { code: "homework_reset_unauthenticated" }, 401);
      const limiter = env.NOTIFICATION_RATE_LIMITER;
      if (!limiter || typeof limiter.limit !== "function") return response4(request, { code: "notification_command_unavailable" }, 503);
      if (!(await limiter.limit({ key: `homework-reset:${auth.uid}` })).success) return response4(request, { code: "rate_limited" }, 429);
      try {
        const result = await createHandlers2(env, options).action({ request, uid: auth.uid });
        return response4(request, result.body, result.status);
      } catch {
        return response4(request, { code: "homework_reset_action_unavailable" }, 503);
      }
    }
  };
}, "createHomeworkResetNotificationWorker");
var retryDueHomeworkResetNotifications = /* @__PURE__ */ __name2(async (env) => {
  await createHandlers2(env).retryDue();
}, "retryDueHomeworkResetNotifications");
var ID13 = /^[A-Za-z0-9_-]{1,128}$/u;
var RETRY_DELAY_MS10 = 60 * 60 * 1e3;
var DONE_DUE_AT6 = 864e13;
var MAX_RECIPIENTS2 = 120;
var MAX_RECIPIENTS_PER_INVOCATION = 10;
var row5 = /* @__PURE__ */ __name2((value) => value && typeof value === "object" && !Array.isArray(value) ? value : null, "row");
var parseThcsNotificationAction = /* @__PURE__ */ __name2(async (request) => {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    throw new Error("thcs_notification_content_type_required");
  }
  const text2 = await request.text();
  if (new TextEncoder().encode(text2).byteLength > 1024) throw new Error("thcs_notification_body_too_large");
  let value;
  try {
    value = JSON.parse(text2);
  } catch {
    throw new Error("thcs_notification_invalid_json");
  }
  const command = row5(value);
  if (!command || Object.keys(command).sort().join(",") !== "authorityRecordId,kind,schemaVersion" || command.schemaVersion !== 1 || command.kind !== "homework-assigned" && command.kind !== "fully-graded" || typeof command.authorityRecordId !== "string" || !ID13.test(command.authorityRecordId) || request.headers.get("Idempotency-Key") !== `${command.kind}:${command.authorityRecordId}`) {
    throw new Error("thcs_notification_invalid");
  }
  return command;
}, "parseThcsNotificationAction");
var hash326 = /* @__PURE__ */ __name2((value, seed) => {
  let hash = (2166136261 ^ seed) >>> 0;
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619) >>> 0;
  return hash;
}, "hash32");
var thcsNotificationId = /* @__PURE__ */ __name2((eventId, recipientId) => {
  const value = `${eventId}:${recipientId}`;
  const hex = [0, 1, 2, 3].map((seed) => hash326(`${value}:${seed}`, seed).toString(16).padStart(8, "0")).join("");
  const versioned = `${hex.slice(0, 12)}5${hex.slice(13, 16)}8${hex.slice(17)}`;
  return `${versioned.slice(0, 8)}-${versioned.slice(8, 12)}-${versioned.slice(12, 16)}-${versioned.slice(16, 20)}-${versioned.slice(20)}`;
}, "thcsNotificationId");
var validIntent4 = /* @__PURE__ */ __name2((value, id, kind) => {
  const intent = row5(value);
  if (!intent || intent.schemaVersion !== 1 || intent.actionId !== id || intent.kind !== kind || !Number.isSafeInteger(intent.occurredAt) || !Number.isSafeInteger(intent.dueAt) || ![0, 1, 2].includes(Number(intent.attempts)) || !["pending", "sending", "retry_due", "retrying", "done", "failed"].includes(String(intent.state))) return null;
  if (intent.recipientIds !== void 0 && (!Array.isArray(intent.recipientIds) || intent.recipientIds.length > MAX_RECIPIENTS2 || intent.recipientIds.some((idValue) => typeof idValue !== "string" || !ID13.test(idValue)))) return null;
  if (intent.deliveredRecipientIds !== void 0 && (!Array.isArray(intent.deliveredRecipientIds) || intent.deliveredRecipientIds.some((idValue) => typeof idValue !== "string" || !ID13.test(idValue)))) return null;
  if (intent.nextRecipientIndex !== void 0 && (!Number.isSafeInteger(intent.nextRecipientIndex) || Number(intent.nextRecipientIndex) < 0 || Number(intent.nextRecipientIndex) > MAX_RECIPIENTS2) || intent.retryRecipientIds !== void 0 && (!Array.isArray(intent.retryRecipientIds) || intent.retryRecipientIds.some((idValue) => typeof idValue !== "string" || !ID13.test(idValue))) || intent.retryRecipientIndex !== void 0 && (!Number.isSafeInteger(intent.retryRecipientIndex) || Number(intent.retryRecipientIndex) < 0 || Number(intent.retryRecipientIndex) > MAX_RECIPIENTS2)) return null;
  return intent;
}, "validIntent");
var recipientsForHomework = /* @__PURE__ */ __name2(async (homework, teacherUid, storage) => {
  const target = row5(homework.target);
  if (!target) return null;
  let ids;
  if (target.type === "class" && typeof target.classId === "string" && ID13.test(target.classId)) {
    const classRecord = row5(await storage.readClass(target.classId));
    if (!classRecord || classRecord.createdBy !== teacherUid || !row5(classRecord.students)) return null;
    ids = Object.keys(classRecord.students).filter((id) => ID13.test(id));
  } else if ((target.type === "students" || target.type === "group") && Array.isArray(target.studentIds)) {
    ids = target.studentIds.filter((id) => typeof id === "string" && ID13.test(id));
  } else return null;
  const unique = [...new Set(ids)].sort();
  return unique.length > 0 && unique.length <= MAX_RECIPIENTS2 ? unique : null;
}, "recipientsForHomework");
var noticeFor2 = /* @__PURE__ */ __name2((kind, authority2, recipientId) => {
  if (kind === "homework-assigned") {
    const id = String(authority2.id);
    const title2 = typeof authority2.title === "string" && authority2.title.trim() || typeof authority2.materialTitle === "string" && authority2.materialTitle.trim();
    const dueAt = Number(row5(authority2.scheduling)?.dueDate);
    if (!title2 || !Number.isSafeInteger(dueAt)) return null;
    const due = new Date(dueAt).toISOString().slice(0, 10);
    return { recipientId, notification: {
      type: "info",
      title: "New THCS Homework Assigned",
      message: `Your teacher has assigned "${title2.slice(0, 160)}". Due: ${due}`,
      link: buildRoute2("STUDENT_HOMEWORK_DETAIL", { homeworkId: id })
    } };
  }
  const resultId = String(authority2.resultId);
  const title = typeof authority2.testTitle === "string" && authority2.testTitle.trim() ? authority2.testTitle.trim() : "your test";
  const score = Number(row5(authority2.thcsData)?.scaledScore);
  if (!Number.isFinite(score)) return null;
  return { recipientId, notification: {
    type: "success",
    title: "Test Fully Graded",
    message: `All answers in "${title.slice(0, 160)}" have been graded. Your score: ${score}/10.`,
    link: buildRoute2("RESULT_DETAIL", { resultId })
  } };
}, "noticeFor");
var resolveAuthority = /* @__PURE__ */ __name2(async (kind, id, actorUid, storage) => {
  const authority2 = row5(kind === "homework-assigned" ? await storage.readHomework(id) : await storage.readResult(id));
  const intent = authority2 && validIntent4(authority2.notificationIntent, id, kind);
  if (!authority2 || !intent || authority2.id !== id && authority2.resultId !== id) return null;
  const actor = row5(await storage.readUser(actorUid));
  if (kind === "homework-assigned") {
    if (authority2.materialType !== "thcs-test" || authority2.createdBy !== actorUid || actor?.role !== "teacher") return null;
  } else if (authority2.studentId !== actorUid || actor?.role !== "student" || row5(authority2.thcsData)?.gradingStatus !== "fully-graded") return null;
  return { authority: authority2, intent };
}, "resolveAuthority");
var resolveRecipients = /* @__PURE__ */ __name2(async (kind, id, actorUid, authority2, intent, storage) => {
  if (intent.recipientIds) return intent;
  if (kind === "fully-graded") {
    return typeof authority2.studentId === "string" && ID13.test(authority2.studentId) ? { ...intent, recipientIds: [authority2.studentId], deliveredRecipientIds: [] } : null;
  }
  const recipientIds = kind === "homework-assigned" ? await recipientsForHomework(authority2, actorUid, storage) : null;
  if (!recipientIds) return null;
  const first = recipientIds[0];
  const recipient = first ? row5(noticeFor2(kind, authority2, first)) : null;
  if (!recipient) return null;
  const resolved = { ...intent, recipientIds, deliveredRecipientIds: [], nextRecipientIndex: 0 };
  if (kind === "homework-assigned") await storage.saveIntent(kind, id, resolved);
  return resolved;
}, "resolveRecipients");
var deliver2 = /* @__PURE__ */ __name2(async (kind, id, actorUid, authority2, intent, storage, repository, now) => {
  const withRecipients = await resolveRecipients(kind, id, actorUid, authority2, intent, storage);
  if (!withRecipients?.recipientIds) return { ...intent, state: "failed", dueAt: DONE_DUE_AT6 };
  if (kind === "fully-graded") {
    const notice = noticeFor2(kind, authority2, withRecipients.recipientIds[0]);
    if (!notice) return { ...intent, state: "failed", dueAt: DONE_DUE_AT6 };
    try {
      const result = await repository.create({
        operationId: thcsNotificationId(`${kind}:${id}`, withRecipients.recipientIds[0]),
        recipientId: withRecipients.recipientIds[0],
        notification: notice.notification,
        now: intent.occurredAt
      });
      if (result.status !== "idempotency-conflict") return { ...intent, state: "done", dueAt: DONE_DUE_AT6 };
    } catch {
    }
    return intent.attempts >= 2 ? { ...intent, attempts: 2, state: "failed", dueAt: DONE_DUE_AT6 } : { ...intent, attempts: 1, state: "retry_due", dueAt: now + RETRY_DELAY_MS10 };
  }
  const delivered = new Set(withRecipients.deliveredRecipientIds ?? []);
  const retryPhase = withRecipients.attempts >= 1;
  const candidates = retryPhase ? withRecipients.retryRecipientIds ?? [] : withRecipients.recipientIds;
  let cursor = retryPhase ? withRecipients.retryRecipientIndex ?? 0 : withRecipients.nextRecipientIndex ?? 0;
  const end = Math.min(cursor + MAX_RECIPIENTS_PER_INVOCATION, candidates.length);
  for (; cursor < end; cursor += 1) {
    const recipientId = candidates[cursor];
    if (!retryPhase && delivered.has(recipientId)) continue;
    const notice = noticeFor2(kind, authority2, recipientId);
    if (!notice) continue;
    try {
      const result = await repository.create({
        operationId: thcsNotificationId(`${kind}:${id}`, recipientId),
        recipientId,
        notification: notice.notification,
        now: withRecipients.occurredAt
      });
      if (result.status !== "idempotency-conflict") delivered.add(recipientId);
    } catch {
    }
  }
  const remainingInitial = !retryPhase && cursor < candidates.length;
  if (remainingInitial) return {
    ...withRecipients,
    nextRecipientIndex: cursor,
    deliveredRecipientIds: [...delivered].sort(),
    state: "pending",
    dueAt: now + 6e4
  };
  if (retryPhase) {
    if (cursor < candidates.length) return {
      ...withRecipients,
      retryRecipientIndex: cursor,
      deliveredRecipientIds: [...delivered].sort(),
      attempts: 2,
      state: "retrying",
      dueAt: now + 6e4
    };
    const complete2 = delivered.size === withRecipients.recipientIds.length;
    return {
      ...withRecipients,
      deliveredRecipientIds: [...delivered].sort(),
      attempts: 2,
      state: complete2 ? "done" : "failed",
      dueAt: DONE_DUE_AT6
    };
  }
  const complete = delivered.size === withRecipients.recipientIds.length;
  if (complete) return { ...withRecipients, deliveredRecipientIds: [...delivered].sort(), state: "done", dueAt: DONE_DUE_AT6 };
  const retryRecipientIds = withRecipients.recipientIds.filter((recipientId) => !delivered.has(recipientId));
  return {
    ...withRecipients,
    deliveredRecipientIds: [...delivered].sort(),
    retryRecipientIds,
    retryRecipientIndex: 0,
    attempts: 1,
    state: "retry_due",
    dueAt: now + RETRY_DELAY_MS10
  };
}, "deliver");
var performThcsNotificationAction = /* @__PURE__ */ __name2(async (input) => {
  const now = input.now ?? Date.now;
  const { command, storage } = input;
  const resolved = await resolveAuthority(command.kind, command.authorityRecordId, input.actorUid, storage);
  if (!resolved) return { status: 403, body: { code: "thcs_notification_authority_invalid" } };
  const { authority: authority2, intent } = resolved;
  if (intent.state === "done") return { status: 200, body: { status: "replayed", notificationStatus: "delivered" } };
  if (intent.attempts !== 0 || !["pending", "sending"].includes(intent.state)) {
    return { status: 200, body: { status: "replayed", notificationStatus: intent.state } };
  }
  const sending = { ...intent, state: "sending", dueAt: now() };
  await storage.saveIntent(command.kind, command.authorityRecordId, sending);
  const result = await deliver2(
    command.kind,
    command.authorityRecordId,
    input.actorUid,
    authority2,
    sending,
    storage,
    input.repository,
    now()
  );
  await storage.saveIntent(command.kind, command.authorityRecordId, result);
  if (result.state === "failed") await storage.reportFailure(command.kind, command.authorityRecordId, result);
  return { status: 200, body: { status: "committed", notificationStatus: result.state } };
}, "performThcsNotificationAction");
var retryDueThcsNotifications = /* @__PURE__ */ __name2(async (input) => {
  const now = input.now ?? Date.now;
  for (const item of await input.storage.dueIntents(now(), 1)) {
    const resolved = await resolveAuthority(
      item.kind,
      item.recordId,
      item.kind === "homework-assigned" ? String(row5(await input.storage.readHomework(item.recordId))?.createdBy ?? "") : String(row5(await input.storage.readResult(item.recordId))?.studentId ?? ""),
      input.storage
    );
    if (!resolved || item.intent.attempts >= 2 && item.intent.state !== "retrying") {
      await input.storage.reportFailure(item.kind, item.recordId, item.intent);
      await input.storage.saveIntent(item.kind, item.recordId, { ...item.intent, state: "failed", dueAt: DONE_DUE_AT6 });
      continue;
    }
    const previous = item.intent.attempts === 0 ? { ...item.intent, state: "sending" } : { ...item.intent, attempts: 2, state: "retrying" };
    const result = await deliver2(
      item.kind,
      item.recordId,
      String(resolved.authority.studentId ?? resolved.authority.createdBy),
      resolved.authority,
      previous,
      input.storage,
      input.repository,
      now()
    );
    const terminal3 = result.state === "failed";
    if (result.state === "failed" || terminal3) await input.storage.reportFailure(item.kind, item.recordId, result);
    await input.storage.saveIntent(item.kind, item.recordId, terminal3 ? { ...result, state: "failed", dueAt: DONE_DUE_AT6 } : result);
    if (result.state === "retry_due" || result.state === "pending" || result.state === "retrying") break;
  }
}, "retryDueThcsNotifications");
var asRow = /* @__PURE__ */ __name2((value) => value && typeof value === "object" && !Array.isArray(value) ? value : null, "asRow");
var required16 = /* @__PURE__ */ __name2((env, name) => {
  const value = env[name];
  if (typeof value !== "string" || !value.trim()) throw new Error(`missing_${name.toLowerCase()}`);
  return value.trim();
}, "required");
var encode6 = /* @__PURE__ */ __name2((value) => {
  if (value === null) return { nullValue: "NULL_VALUE" };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "number") return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encode6) } };
  if (value && typeof value === "object") return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, encode6(entry)])) } };
  throw new Error("thcs_notification_firestore_value_invalid");
}, "encode");
var decode5 = /* @__PURE__ */ __name2((value) => {
  if ("nullValue" in value) return null;
  if ("booleanValue" in value) return value.booleanValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("stringValue" in value) return value.stringValue;
  if ("mapValue" in value) return Object.fromEntries(Object.entries(value.mapValue?.fields ?? {}).map(([key, entry]) => [key, decode5(entry)]));
  if ("arrayValue" in value) return (value.arrayValue?.values ?? []).map(decode5);
  return null;
}, "decode");
var decodeDocument2 = /* @__PURE__ */ __name2((document) => Object.fromEntries(
  Object.entries(document.fields ?? {}).map(([key, value]) => [key, decode5(value)])
), "decodeDocument");
var FirebaseThcsNotificationStorage = class {
  static {
    __name(this, "FirebaseThcsNotificationStorage");
  }
  constructor(env, fetchImpl = globalThis.fetch) {
    this.env = env;
    this.fetchImpl = fetchImpl;
    this.projectId = encodeURIComponent(required16(env, "FIREBASE_PROJECT_ID"));
    this.rtdb = new FirebaseRtdbRestClient({ env: {
      FIREBASE_DB_URL: required16(env, "FIREBASE_DB_URL"),
      FIREBASE_PROJECT_ID: required16(env, "FIREBASE_PROJECT_ID"),
      GOOGLE_SA_KEY: required16(env, "NOTIFICATION_COMMAND_GOOGLE_SA_KEY")
    }, fetchImpl });
  }
  env;
  fetchImpl;
  static {
    __name2(this, "FirebaseThcsNotificationStorage");
  }
  projectId;
  rtdb;
  documentsUrl(path = "") {
    return `https://firestore.googleapis.com/v1/projects/${this.projectId}/databases/(default)/documents${path}`;
  }
  async token() {
    const key = JSON.parse(required16(this.env, "NOTIFICATION_COMMAND_GOOGLE_SA_KEY"));
    if (!key.client_email || !key.private_key || key.client_email !== required16(this.env, "NOTIFICATION_COMMAND_SERVICE_IDENTITY")) {
      throw new Error("thcs_notification_service_identity_invalid");
    }
    return this.rtdb.getAccessToken();
  }
  async readDocument(path) {
    const response10 = await this.fetchImpl(this.documentsUrl(path), { headers: { Authorization: `Bearer ${await this.token()}` } });
    if (response10.status === 404) return null;
    if (!response10.ok) throw new Error(`thcs_notification_firestore_read_failed:${response10.status}`);
    const document = await response10.json();
    if (!document.fields || !document.updateTime) return null;
    return { value: decodeDocument2(document), version: document.updateTime };
  }
  async readHomework(homeworkId) {
    return (await this.readDocument(`/homework_assignments/${encodeURIComponent(homeworkId)}`))?.value ?? null;
  }
  readResult(resultId) {
    return this.rtdb.readValue(`test_results/${resultId}`);
  }
  readClass(classId) {
    return this.rtdb.readValue(`classes/${classId}`);
  }
  readUser(userId) {
    return this.rtdb.readValue(`users/${userId}`);
  }
  async saveIntent(kind, recordId, intent) {
    if (kind === "fully-graded") {
      const path = `test_results/${recordId}/notificationIntent`;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const current = await this.rtdb.readWithEtag(path);
        if (!current.data || current.data.actionId !== recordId || current.data.kind !== kind) throw new Error("thcs_notification_intent_changed");
        if (current.data.state === "done" || current.data.state === "failed") return;
        if (await this.rtdb.writeIfMatch(path, intent, current.etag)) return;
      }
      throw new Error("thcs_notification_intent_cas_failed");
    }
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const current = await this.readDocument(`/homework_assignments/${encodeURIComponent(recordId)}`);
      if (!current || asRow(current.value.notificationIntent)?.actionId !== recordId) throw new Error("thcs_notification_intent_changed");
      const response10 = await this.fetchImpl(`${this.documentsUrl(`/homework_assignments/${encodeURIComponent(recordId)}`)}?updateMask.fieldPaths=notificationIntent&currentDocument.updateTime=${encodeURIComponent(current.version)}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${await this.token()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ fields: { notificationIntent: encode6(intent) } })
      });
      if (response10.status === 409 || response10.status === 412) continue;
      if (!response10.ok) throw new Error(`thcs_notification_intent_write_failed:${response10.status}`);
      return;
    }
    throw new Error("thcs_notification_intent_cas_exhausted");
  }
  async dueIntents(now, limit = 4) {
    const token2 = await this.token();
    const query = /* @__PURE__ */ __name2(async (collectionId, kind, remaining) => {
      if (remaining <= 0) return [];
      const response10 = await this.fetchImpl(`${this.documentsUrl()}:runQuery`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token2}`, "Content-Type": "application/json" },
        body: JSON.stringify({ structuredQuery: {
          from: [{ collectionId }],
          where: { fieldFilter: { field: { fieldPath: "notificationIntent.dueAt" }, op: "LESS_THAN_OR_EQUAL", value: { integerValue: String(now) } } },
          orderBy: [{ field: { fieldPath: "notificationIntent.dueAt" }, direction: "ASCENDING" }],
          limit: remaining
        } })
      });
      if (!response10.ok) throw new Error(`thcs_notification_retry_query_failed:${response10.status}`);
      const docs = await response10.json();
      return docs.flatMap(({ document }) => {
        if (!document?.name || !document.fields) return [];
        const value = decodeDocument2(document);
        const intent = asRow(value.notificationIntent);
        const id = typeof value.id === "string" ? value.id : document.name.split("/").pop() ?? "";
        if (!intent || typeof intent.dueAt !== "number" || intent.dueAt > now || !["pending", "sending", "retry_due", "retrying"].includes(String(intent.state))) return [];
        return [{ kind, recordId: id, intent }];
      });
    }, "query");
    const homework = await query("homework_assignments", "homework-assigned", limit);
    const resultLimit = Math.max(0, limit - homework.length);
    const results = resultLimit > 0 ? await this.rtdb.readValue("test_results", {
      orderBy: "notificationIntent/dueAt",
      startAt: 0,
      limitToFirst: resultLimit
    }) : null;
    const fullyGraded = results && typeof results === "object" && !Array.isArray(results) ? Object.entries(results).flatMap(([id, value]) => {
      const intent = asRow(asRow(value)?.notificationIntent);
      return intent && typeof intent.dueAt === "number" && intent.dueAt <= now && ["pending", "sending", "retry_due", "retrying"].includes(String(intent.state)) ? [{ kind: "fully-graded", recordId: id, intent }] : [];
    }) : [];
    return [...homework, ...fullyGraded].slice(0, limit);
  }
  async reportFailure(kind, recordId, intent) {
    const now = Date.now();
    const eventId = `${kind}:${recordId}`;
    const path = `reports/errors/${new Date(now).toISOString().slice(0, 10)}/${thcsNotificationId(eventId, "report")}`;
    const current = await this.rtdb.readWithEtag(path);
    if (current.data !== null) return;
    const recipientCount = intent.recipientIds?.length ?? 1;
    const deliveredCount = intent.deliveredRecipientIds?.length ?? 0;
    await this.rtdb.writeIfMatch(path, {
      id: eventId,
      timestamp: now,
      feature: "thcs",
      severity: "error",
      message: "THCS notification delivery failed after its retry.",
      userId: "notification-worker",
      userName: "Notification Worker",
      userRole: "service",
      duplicateCount: 1,
      contextData: { eventId, authorityRecordId: recordId, failedRecipientCount: recipientCount - deliveredCount }
    }, current.etag);
  }
};
var ACTION_PATH5 = "/thcs-notifications/actions";
var ALLOWED_ORIGINS6 = /* @__PURE__ */ new Set([
  "https://kahut1.web.app",
  "http://localhost:5173",
  "http://localhost:5174"
]);
var binding = /* @__PURE__ */ __name2((env, name) => {
  const value = env[name];
  if (typeof value !== "string" || !value.trim()) throw new Error(`missing_${name.toLowerCase()}`);
  return value.trim();
}, "binding");
var response5 = /* @__PURE__ */ __name2((request, body, status) => {
  const headers2 = new Headers({
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    Vary: "Origin, Access-Control-Request-Method, Access-Control-Request-Headers"
  });
  const origin = request.headers.get("Origin");
  if (origin && ALLOWED_ORIGINS6.has(origin)) {
    headers2.set("Access-Control-Allow-Origin", origin);
    headers2.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    headers2.set("Access-Control-Allow-Headers", "Authorization, Content-Type, Idempotency-Key");
  }
  return new Response(JSON.stringify(body), { status, headers: headers2 });
}, "response");
var repositoryForEnv = /* @__PURE__ */ __name2((env) => new FirebaseRestNotificationCommandRepository({
  env: {
    FIREBASE_DB_URL: binding(env, "FIREBASE_DB_URL"),
    FIREBASE_PROJECT_ID: binding(env, "FIREBASE_PROJECT_ID"),
    NOTIFICATION_COMMAND_SERVICE_IDENTITY: binding(env, "NOTIFICATION_COMMAND_SERVICE_IDENTITY"),
    NOTIFICATION_COMMAND_GOOGLE_SA_KEY: binding(env, "NOTIFICATION_COMMAND_GOOGLE_SA_KEY")
  }
}), "repositoryForEnv");
var createThcsNotificationWorker = /* @__PURE__ */ __name2((options = {}) => {
  const firebaseVerifier = options.firebaseVerifier ?? createFirebaseVerifier2();
  const repositoryFactory = options.repositoryFactory ?? repositoryForEnv;
  const storageFactory = options.storageFactory ?? ((env) => new FirebaseThcsNotificationStorage(env));
  const now = options.now ?? Date.now;
  return {
    async fetch(request, env) {
      const url = new URL(request.url);
      if (url.pathname !== ACTION_PATH5 || url.search || url.hash) return response5(request, { code: "thcs_notification_not_found" }, 404);
      const origin = request.headers.get("Origin");
      if (origin && !ALLOWED_ORIGINS6.has(origin)) return response5(request, { code: "cors_origin_denied" }, 403);
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: response5(request, {}, 200).headers });
      if (request.method !== "POST") return response5(request, { code: "method_not_allowed" }, 405);
      const auth = await firebaseVerifier.verifyAuthorizationHeader(request.headers.get("Authorization"), env);
      if (!auth.valid || typeof auth.uid !== "string" || !auth.uid) return response5(request, { code: "notification_command_unauthenticated" }, 401);
      const limiter = env.NOTIFICATION_RATE_LIMITER;
      if (!limiter || typeof limiter.limit !== "function") return response5(request, { code: "notification_command_unavailable" }, 503);
      if (!(await limiter.limit({ key: `thcs-notification:${auth.uid}` })).success) return response5(request, { code: "rate_limited" }, 429);
      try {
        const command = await parseThcsNotificationAction(request);
        const result = await performThcsNotificationAction({
          command,
          actorUid: auth.uid,
          storage: storageFactory(env),
          repository: repositoryFactory(env),
          now
        });
        return response5(request, result.body, result.status);
      } catch (error) {
        if (error instanceof Error && error.message.startsWith("thcs_notification_")) {
          return response5(request, { code: error.message }, 400);
        }
        return response5(request, { code: "thcs_notification_failed" }, 500);
      }
    }
  };
}, "createThcsNotificationWorker");
var retryDueThcsNotificationsForEnv = /* @__PURE__ */ __name2((env, now = Date.now) => retryDueThcsNotifications({
  storage: new FirebaseThcsNotificationStorage(env),
  repository: repositoryForEnv(env),
  now
}), "retryDueThcsNotificationsForEnv");
var required17 = /* @__PURE__ */ __name2((env, name) => {
  const value = env[name];
  if (typeof value !== "string" || !value.trim()) throw new Error(`missing_${name.toLowerCase()}`);
  return value.trim();
}, "required");
var FirebaseSessionNotificationActionStorage = class {
  static {
    __name(this, "FirebaseSessionNotificationActionStorage");
  }
  static {
    __name2(this, "FirebaseSessionNotificationActionStorage");
  }
  admin;
  constructor(env, fetchImpl = globalThis.fetch) {
    this.admin = new FirebaseRtdbRestClient({ env: {
      FIREBASE_DB_URL: required17(env, "FIREBASE_DB_URL"),
      FIREBASE_PROJECT_ID: required17(env, "FIREBASE_PROJECT_ID"),
      GOOGLE_SA_KEY: required17(env, "NOTIFICATION_COMMAND_GOOGLE_SA_KEY")
    }, fetchImpl });
  }
  read(path) {
    return this.admin.readValue(path);
  }
  async updateIntent(intent) {
    const path = `session_notification_intents/${intent.eventId}`;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const current = await this.admin.readWithEtag(path);
      if (!current.data || current.data.eventId !== intent.eventId || current.data.sessionCode !== intent.sessionCode || current.data.actorUid !== intent.actorUid) {
        throw new Error("session_notification_intent_identity_changed");
      }
      if (current.data.state === "done" || current.data.state === "failed") return;
      if (await this.admin.writeIfMatch(path, intent, current.etag)) return;
    }
    throw new Error("session_notification_intent_cas_failed");
  }
  async dueIntents(now, limit = 3) {
    const rows = await this.admin.readValue("session_notification_intents", { orderBy: "dueAt", limitToFirst: limit });
    if (!rows || typeof rows !== "object" || Array.isArray(rows)) return [];
    return Object.values(rows).filter((row9) => row9?.dueAt <= now && ["initial_due", "initial_processing", "retry_due", "retrying"].includes(row9.state));
  }
  async claimInitial(eventId, now) {
    const path = `session_notification_intents/${eventId}`;
    const current = await this.admin.readWithEtag(path);
    const row9 = current.data;
    if (!row9 || row9.eventId !== eventId || row9.attempts !== 1 || !["initial_due", "initial_processing"].includes(row9.state) || row9.dueAt > now) return null;
    const claimed = { ...row9, state: "initial_processing", dueAt: now + 6e4 };
    return await this.admin.writeIfMatch(path, claimed, current.etag) ? claimed : null;
  }
  async claimRetry(eventId, now) {
    const path = `session_notification_intents/${eventId}`;
    const current = await this.admin.readWithEtag(path);
    const row9 = current.data;
    if (!row9 || row9.eventId !== eventId || !["retry_due", "retrying"].includes(row9.state) || row9.attempts < 1 || row9.attempts > 2 || row9.dueAt > now) return null;
    const claimed = { ...row9, state: "retrying", attempts: 2, dueAt: now + 6e4 };
    return await this.admin.writeIfMatch(path, claimed, current.etag) ? claimed : null;
  }
  async reportFailure(event, failedRecipientCount, now) {
    const day22 = new Date(now).toISOString().slice(0, 10);
    const path = `reports/errors/${day22}/session-notification-${event.eventId}`;
    const current = await this.admin.readWithEtag(path);
    if (current.data !== null) return;
    await this.admin.writeIfMatch(path, {
      id: `session-notification-${event.eventId}`,
      timestamp: now,
      feature: "sessions",
      severity: "error",
      message: `Session notification delivery failed for ${event.kind}; ${failedRecipientCount} recipient(s) remain.`,
      userId: event.actorUid,
      userName: "Notification Worker",
      userRole: "service",
      duplicateCount: 1,
      contextData: {
        eventId: event.eventId,
        sessionCode: event.sessionCode,
        classId: event.classId,
        kind: event.kind,
        failedRecipientCount
      }
    }, current.etag);
  }
};
var ID14 = /^[A-Za-z0-9_-]{1,128}$/u;
var EVENT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/iu;
var ACTION_PATH6 = "/session-notifications/action";
var ALLOWED_ORIGINS7 = /* @__PURE__ */ new Set(["https://kahut1.web.app", "http://localhost:5173", "http://localhost:5174"]);
var SESSION_INTENT_DONE_DUE_AT = 864e13;
var SESSION_NOTIFICATION_RECIPIENTS_PER_PASS = 10;
var record15 = /* @__PURE__ */ __name2((value) => value && typeof value === "object" && !Array.isArray(value) ? value : null, "record");
var sessionRosterMatches = /* @__PURE__ */ __name2((event, classValue) => {
  const classRecord = record15(classValue);
  const students = record15(classRecord?.students) ?? {};
  const recipients = record15(event.recipients) ?? {};
  return classRecord?.createdBy === event.actorUid && Object.keys(students).length === event.recipientCount && Object.keys(recipients).length === event.recipientCount && Object.keys(students).every((id) => recipients[id] === true);
}, "sessionRosterMatches");
var hash327 = /* @__PURE__ */ __name2((value, seed) => {
  let result = (2166136261 ^ seed) >>> 0;
  for (let index = 0; index < value.length; index += 1) result = Math.imul(result ^ value.charCodeAt(index), 16777619) >>> 0;
  return result;
}, "hash32");
var sessionNotificationId = /* @__PURE__ */ __name2((key) => {
  const hex = [0, 1, 2, 3].map((seed) => hash327(`${key}:${seed}`, seed).toString(16).padStart(8, "0")).join("");
  const versioned = `${hex.slice(0, 12)}5${hex.slice(13, 16)}8${hex.slice(17)}`;
  return `${versioned.slice(0, 8)}-${versioned.slice(8, 12)}-${versioned.slice(12, 16)}-${versioned.slice(16, 20)}-${versioned.slice(20)}`;
}, "sessionNotificationId");
var sessionNotificationFor = /* @__PURE__ */ __name2((event) => {
  switch (event.kind) {
    case "session-opened":
      return {
        type: "info",
        title: "New Session Available",
        message: `${event.className} has a new test session ready. Join with code ${event.sessionCode}.`,
        link: buildRoute2("STUDENT_WAITING", { gameSessionId: event.sessionCode })
      };
    case "test-started":
      return {
        type: "info",
        title: "Test Started",
        message: `"${event.testName}" has started in your class. Join now if you haven't already.`,
        link: buildRoute2("STUDENT_WAITING", { gameSessionId: event.sessionCode })
      };
    case "test-ended":
      return {
        type: "success",
        title: "Test Completed",
        message: `"${event.testName}" session has ended. View your results.`,
        link: buildRoute2("STUDENT_ACADEMIC_RECORD")
      };
  }
}, "sessionNotificationFor");
var deliverSessionIntentBatch = /* @__PURE__ */ __name2(async (intent, repository, now) => {
  const event = intent.event;
  const notice = sessionNotificationFor(event);
  const recipients = Object.keys(event.recipients ?? {});
  const initial = intent.attempts === 1;
  const candidates = initial ? recipients.slice(intent.initialCursor, intent.initialCursor + SESSION_NOTIFICATION_RECIPIENTS_PER_PASS) : intent.retryRecipientIds.slice(intent.retryCursor, intent.retryCursor + SESSION_NOTIFICATION_RECIPIENTS_PER_PASS);
  const firstFailures = [...intent.retryRecipientIds];
  const finalFailures = [...intent.finalFailedRecipientIds];
  for (const recipientId of candidates) {
    let failed2 = false;
    try {
      const result = await repository.create({
        operationId: sessionNotificationId(`${event.eventId}:${recipientId}`),
        recipientId,
        notification: notice,
        now: event.occurredAt
      });
      failed2 = result.status === "idempotency-conflict";
    } catch {
      failed2 = true;
    }
    if (failed2) (initial ? firstFailures : finalFailures).push(recipientId);
  }
  if (initial) {
    const initialCursor = intent.initialCursor + candidates.length;
    const complete2 = initialCursor >= recipients.length;
    const retryRecipientIds = [...new Set(firstFailures)];
    const state2 = !complete2 ? "initial_due" : retryRecipientIds.length ? "retry_due" : "done";
    return {
      ...intent,
      initialCursor,
      retryRecipientIds,
      state: state2,
      dueAt: state2 === "initial_due" ? now : state2 === "retry_due" ? intent.occurredAt + 36e5 : SESSION_INTENT_DONE_DUE_AT
    };
  }
  const retryCursor = intent.retryCursor + candidates.length;
  const complete = retryCursor >= intent.retryRecipientIds.length;
  const state = complete ? finalFailures.length ? "failed" : "done" : "retrying";
  return {
    ...intent,
    retryCursor,
    finalFailedRecipientIds: [...new Set(finalFailures)],
    state,
    dueAt: complete ? SESSION_INTENT_DONE_DUE_AT : now
  };
}, "deliverSessionIntentBatch");
var parseSessionNotificationAction = /* @__PURE__ */ __name2(async (request) => {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) throw new Error("content_type_required");
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 1024) throw new Error("session_notification_body_too_large");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("session_notification_invalid_json");
  }
  const value = record15(parsed);
  if (!value || Object.keys(value).sort().join(",") !== "actionType,eventId,schemaVersion" || value.schemaVersion !== 1 || value.actionType !== "deliver-session-notification" || typeof value.eventId !== "string" || !EVENT_ID.test(value.eventId) || request.headers.get("Idempotency-Key") !== value.eventId) throw new Error("session_notification_invalid");
  return { eventId: value.eventId };
}, "parseSessionNotificationAction");
var performSessionNotificationAction = /* @__PURE__ */ __name2(async (input) => {
  const { eventId, actorUid, storage } = input;
  const queue = record15(await storage.read(`session_notification_intents/${eventId}`));
  if (!queue || queue.eventId !== eventId || queue.actorUid !== actorUid || typeof queue.sessionCode !== "string") {
    return { status: 403, body: { code: "session_notification_forbidden" } };
  }
  const session = record15(await storage.read(`game_sessions/${queue.sessionCode}`));
  const events = record15(session?.notificationEvents);
  const savedEvent = record15(events?.[eventId]);
  const event = record15(queue.event);
  const recipients = record15(event?.recipients) ?? {};
  const savedRecipients = record15(savedEvent?.recipients) ?? {};
  const sameSnapshot = Boolean(savedEvent && event && ["eventId", "kind", "sessionCode", "actorUid", "classId", "className", "testId", "testName", "occurredAt", "recipientCount"].every((key) => (savedEvent[key] ?? null) === (event[key] ?? null)) && Object.keys(recipients).sort().join(",") === Object.keys(savedRecipients).sort().join(","));
  if (!event || !sameSnapshot || event.eventId !== eventId || event.actorUid !== actorUid || event.sessionCode !== queue.sessionCode || event.classId !== queue.classId || event.occurredAt !== queue.occurredAt || event.recipientCount !== queue.recipientCount || Object.keys(recipients).length !== queue.recipientCount || !["session-opened", "test-started", "test-ended"].includes(event.kind) || Object.keys(recipients).some((id) => !ID14.test(id))) {
    return { status: 409, body: { code: "session_notification_event_invalid" } };
  }
  if (!queue.rosterVerifiedAt && !sessionRosterMatches(
    event,
    await storage.read(`classes/${event.classId}`)
  )) {
    return { status: 409, body: { code: "session_notification_roster_invalid" } };
  }
  if (queue.state === "done") return { status: 200, body: { status: "replayed", eventId, notificationStatus: "delivered" } };
  const claimed = await storage.claimInitial(eventId, Date.now());
  if (!claimed) return { status: 200, body: { status: "committed", eventId, notificationStatus: "in_progress" } };
  const progress = await deliverSessionIntentBatch(claimed, input.repository, Date.now());
  await storage.updateIntent({ ...progress, rosterVerifiedAt: queue.rosterVerifiedAt ?? Date.now() });
  return { status: 200, body: {
    status: "committed",
    eventId,
    notificationStatus: progress.state === "done" ? "delivered" : progress.state === "failed" ? "failed" : "in_progress"
  } };
}, "performSessionNotificationAction");
var required18 = /* @__PURE__ */ __name2((env, name) => {
  const value = env[name];
  if (typeof value !== "string" || !value.trim()) throw new Error(`missing_${name.toLowerCase()}`);
  return value.trim();
}, "required");
var response6 = /* @__PURE__ */ __name2((request, body, status) => {
  const headers2 = new Headers({
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    Vary: "Origin, Access-Control-Request-Method, Access-Control-Request-Headers"
  });
  const origin = request.headers.get("Origin");
  if (origin && ALLOWED_ORIGINS7.has(origin)) {
    headers2.set("Access-Control-Allow-Origin", origin);
    headers2.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    headers2.set("Access-Control-Allow-Headers", "Authorization, Content-Type, Idempotency-Key");
  }
  return new Response(JSON.stringify(body), { status, headers: headers2 });
}, "response");
var createSessionNotificationActionWorker = /* @__PURE__ */ __name2((options = {}) => {
  const verifier = options.firebaseVerifier ?? createFirebaseVerifier2();
  const storageFactory = options.storageFactory ?? ((env) => new FirebaseSessionNotificationActionStorage(env));
  const repositoryFactory = options.repositoryFactory ?? ((env) => new FirebaseRestNotificationCommandRepository({
    env: {
      FIREBASE_DB_URL: required18(env, "FIREBASE_DB_URL"),
      FIREBASE_PROJECT_ID: required18(env, "FIREBASE_PROJECT_ID"),
      NOTIFICATION_COMMAND_SERVICE_IDENTITY: required18(env, "NOTIFICATION_COMMAND_SERVICE_IDENTITY"),
      NOTIFICATION_COMMAND_GOOGLE_SA_KEY: required18(env, "NOTIFICATION_COMMAND_GOOGLE_SA_KEY")
    }
  }));
  return {
    async fetch(request, env) {
      const url = new URL(request.url);
      if (url.pathname !== ACTION_PATH6 || url.search || url.hash) return response6(request, { code: "session_notification_not_found" }, 404);
      const origin = request.headers.get("Origin");
      if (origin && !ALLOWED_ORIGINS7.has(origin)) return response6(request, { code: "cors_origin_denied" }, 403);
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: response6(request, {}, 200).headers });
      if (request.method !== "POST") return response6(request, { code: "method_not_allowed" }, 405);
      const auth = await verifier.verifyAuthorizationHeader(request.headers.get("Authorization"), env);
      if (!auth.valid || typeof auth.uid !== "string" || !auth.uid) return response6(request, { code: "session_notification_unauthenticated" }, 401);
      const limiter = env.NOTIFICATION_RATE_LIMITER;
      if (!limiter || typeof limiter.limit !== "function") return response6(request, { code: "notification_command_unavailable" }, 503);
      if (!(await limiter.limit({ key: `session-notification:${auth.uid}` })).success) return response6(request, { code: "rate_limited" }, 429);
      try {
        const command = await parseSessionNotificationAction(request);
        const result = await performSessionNotificationAction({
          ...command,
          actorUid: auth.uid,
          storage: storageFactory(env),
          repository: repositoryFactory(env)
        });
        return response6(request, result.body, result.status);
      } catch (error) {
        if (error instanceof Error && (error.message === "content_type_required" || error.message.startsWith("session_notification_"))) {
          return response6(request, { code: error.message }, 400);
        }
        return response6(request, { code: "session_notification_failed" }, 500);
      }
    }
  };
}, "createSessionNotificationActionWorker");
var DONE_DUE_AT7 = 864e13;
var record16 = /* @__PURE__ */ __name2((value) => value && typeof value === "object" && !Array.isArray(value) ? value : null, "record");
var eventFor = /* @__PURE__ */ __name2(async (queue, read) => {
  const session = record16(await read(`game_sessions/${queue.sessionCode}`));
  const saved = record16(record16(session?.notificationEvents)?.[queue.eventId]);
  const event = record16(queue.event);
  if (!event || !saved) return null;
  const sameSnapshot = ["eventId", "kind", "sessionCode", "actorUid", "classId", "className", "testId", "testName", "occurredAt", "recipientCount"].every((key) => (event[key] ?? null) === (saved[key] ?? null));
  const recipients = record16(event.recipients) ?? {};
  const savedRecipients = record16(saved.recipients) ?? {};
  const matchesSavedEvent = sameSnapshot && Object.keys(recipients).sort().join(",") === Object.keys(savedRecipients).sort().join(",") && event.eventId === queue.eventId && event.actorUid === queue.actorUid && event.sessionCode === queue.sessionCode && event.classId === queue.classId && event.occurredAt === queue.occurredAt && event.recipientCount === queue.recipientCount && Object.keys(recipients).length === queue.recipientCount ? event : null;
  if (!matchesSavedEvent) return null;
  return queue.rosterVerifiedAt || sessionRosterMatches(
    matchesSavedEvent,
    await read(`classes/${matchesSavedEvent.classId}`)
  ) ? matchesSavedEvent : null;
}, "eventFor");
var retryDueSessionNotifications = /* @__PURE__ */ __name2(async (env, now = Date.now(), dependencies = {}) => {
  const storage = dependencies.storage ?? new FirebaseSessionNotificationActionStorage(env);
  const repository = dependencies.repository ?? new FirebaseRestNotificationCommandRepository({ env });
  const read = /* @__PURE__ */ __name2((path) => storage.read(path), "read");
  for (const due of await storage.dueIntents(now, 1)) {
    const initial = due.state === "initial_due" || due.state === "initial_processing";
    const claimed = initial ? await storage.claimInitial(due.eventId, now) : await storage.claimRetry(due.eventId, now);
    if (!claimed) continue;
    let event;
    try {
      event = await eventFor(claimed, read);
    } catch {
      break;
    }
    if (!event) {
      await storage.updateIntent({ ...claimed, state: "failed", dueAt: DONE_DUE_AT7 });
      continue;
    }
    const progress = await deliverSessionIntentBatch({ ...claimed, event }, repository, now);
    await storage.updateIntent({ ...progress, rosterVerifiedAt: claimed.rosterVerifiedAt ?? now });
    if (progress.state === "failed") await storage.reportFailure(event, progress.finalFailedRecipientIds.length, now);
  }
}, "retryDueSessionNotifications");
var ID15 = /^[A-Za-z0-9_-]{1,128}$/u;
var record17 = /* @__PURE__ */ __name2((value) => value && typeof value === "object" && !Array.isArray(value) ? value : null, "record");
var readWritingGradeNotificationAction = /* @__PURE__ */ __name2(async (request) => {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    throw new Error("writing_notification_content_type_required");
  }
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > 2048) throw new Error("writing_notification_body_too_large");
  let value;
  try {
    value = JSON.parse(body);
  } catch {
    throw new Error("writing_notification_invalid_json");
  }
  const action = record17(value);
  if (!action || Object.keys(action).sort().join(",") !== "actionType,eventId,schemaVersion,submissionId" || action.schemaVersion !== 1 || action.actionType !== "writing-notification" || typeof action.eventId !== "string" || !ID15.test(action.eventId) || request.headers.get("Idempotency-Key") !== action.eventId || typeof action.submissionId !== "string" || !ID15.test(action.submissionId)) {
    throw new Error("writing_notification_invalid_action");
  }
  return action;
}, "readWritingGradeNotificationAction");
var done = /* @__PURE__ */ __name2((intent) => ({
  ...intent,
  state: "done",
  dueAt: 864e13
}), "done");
var failed = /* @__PURE__ */ __name2((intent) => ({
  ...intent,
  state: "failed",
  dueAt: 864e13
}), "failed");
var gradeSourceAuthorized = /* @__PURE__ */ __name2(async (intent, source, storage) => {
  if (intent.kind !== "writing-graded" || !source) return true;
  const context = record17(source.context);
  const studentId = typeof source.studentId === "string" ? source.studentId : "";
  if (!ID15.test(studentId)) return false;
  if (context?.type === "live-session") {
    const sessionCode = typeof context.sessionCode === "string" ? context.sessionCode : "";
    const assigningTeacherId = typeof context.assigningTeacherId === "string" ? context.assigningTeacherId : "";
    if (!ID15.test(sessionCode) || !ID15.test(assigningTeacherId) || !await storage.readSessionSubmissionProof(sessionCode, studentId, intent.authorityRecordId, assigningTeacherId)) return false;
    return intent.actorUid === assigningTeacherId || storage.readTeacherLink(intent.actorUid, studentId);
  }
  return storage.readTeacherLink(intent.actorUid, studentId);
}, "gradeSourceAuthorized");
var deliverWritingGradeNotification = /* @__PURE__ */ __name2(async (input) => {
  const rawIntent = record17(await input.storage.readIntent(input.eventId));
  if (!rawIntent) return "not_found";
  const intent = rawIntent;
  if (intent.eventId !== input.eventId || intent.authorityRecordId !== input.submissionId || intent.actorUid !== input.actorUid) return "forbidden";
  if (intent.state === "done") return "delivered";
  if (intent.state !== "retry_due" || intent.attempts !== 1) return "forbidden";
  const source = await input.storage.readSubmission(input.submissionId);
  const sourceRecord = record17(source);
  const sourceContext = record17(sourceRecord?.context);
  if (!await gradeSourceAuthorized(intent, sourceRecord, input.storage)) return "forbidden";
  if (intent.kind === "writing-submitted-student" && sourceContext?.type === "live-session" && (typeof sourceContext.sessionCode !== "string" || typeof sourceRecord?.studentId !== "string" || !await input.storage.readSessionSubmissionProof(sourceContext.sessionCode, sourceRecord.studentId, input.submissionId, intent.actorUid))) {
    return "forbidden";
  }
  const teacherLink = intent.kind === "writing-submitted-teacher" && typeof sourceContext?.selectedTeacherId === "string" && typeof sourceRecord?.studentId === "string" ? await input.storage.readTeacherLink(sourceContext.selectedTeacherId, sourceRecord.studentId) : false;
  const notification = writingGradeNotification(intent, source, teacherLink);
  if (!notification) return "forbidden";
  try {
    const result = await input.repository.create({
      operationId: intent.eventId,
      recipientId: notification.recipientId,
      notification: notification.notification,
      now: input.now?.() ?? Date.now()
    });
    if (result.status === "idempotency-conflict") return "retry_due";
    await input.storage.updateIntent(done(intent));
    return "delivered";
  } catch {
    return "retry_due";
  }
}, "deliverWritingGradeNotification");
var retryDueWritingGradeNotifications = /* @__PURE__ */ __name2(async (input) => {
  const now = input.now ?? Date.now();
  for (const intent of await input.storage.dueIntents(now, 2)) {
    if (intent.state === "retrying" && intent.attempts === 2) {
      const source2 = record17(await input.storage.readSubmission(intent.authorityRecordId));
      const sourceRecord2 = record17(source2);
      const sourceContext2 = record17(sourceRecord2?.context);
      if (!await gradeSourceAuthorized(intent, sourceRecord2, input.storage)) {
        await input.storage.updateIntent(failed(intent));
        await input.reportFailure(intent, now);
        continue;
      }
      if (intent.kind === "writing-submitted-student" && sourceContext2?.type === "live-session" && (typeof sourceContext2.sessionCode !== "string" || typeof sourceRecord2?.studentId !== "string" || !await input.storage.readSessionSubmissionProof(sourceContext2.sessionCode, sourceRecord2.studentId, intent.authorityRecordId, intent.actorUid))) {
        await input.storage.updateIntent(failed(intent));
        await input.reportFailure(intent, now);
        continue;
      }
      const teacherId2 = String(record17(sourceRecord2?.context)?.selectedTeacherId ?? "");
      const teacherLink2 = intent.kind === "writing-submitted-teacher" && typeof sourceRecord2?.studentId === "string" ? await input.storage.readTeacherLink(teacherId2, sourceRecord2.studentId) : false;
      const notice = writingGradeNotification(intent, source2, teacherLink2);
      if (notice) {
        const existing = record17(await input.readInbox(`notifications/${notice.recipientId}/${intent.eventId}`));
        if (existing?.id === intent.eventId && existing.title === notice.notification.title && existing.message === notice.notification.message && existing.link === notice.notification.link) {
          await input.storage.updateIntent(done(intent));
          continue;
        }
      }
      await input.storage.updateIntent(failed(intent));
      await input.reportFailure(intent, now);
      continue;
    }
    if (intent.state !== "retry_due" || intent.attempts !== 1 || intent.dueAt > now) continue;
    const claimed = await input.storage.claimRetry(intent.eventId, now);
    if (!claimed) continue;
    const source = await input.storage.readSubmission(claimed.authorityRecordId);
    const sourceRecord = record17(source);
    const sourceContext = record17(sourceRecord?.context);
    const sourceAuthorized = await gradeSourceAuthorized(claimed, sourceRecord, input.storage);
    const sessionProof = claimed.kind === "writing-submitted-student" && sourceContext?.type === "live-session" ? typeof sourceContext.sessionCode === "string" && typeof sourceRecord?.studentId === "string" && await input.storage.readSessionSubmissionProof(sourceContext.sessionCode, sourceRecord.studentId, claimed.authorityRecordId, claimed.actorUid) : true;
    const teacherId = String(record17(sourceRecord?.context)?.selectedTeacherId ?? "");
    const teacherLink = claimed.kind === "writing-submitted-teacher" && typeof sourceRecord?.studentId === "string" ? await input.storage.readTeacherLink(teacherId, sourceRecord.studentId) : false;
    const notification = writingGradeNotification(claimed, source, teacherLink);
    let delivered = false;
    if (notification && sessionProof && sourceAuthorized) {
      try {
        const result = await input.repository.create({
          operationId: claimed.eventId,
          recipientId: notification.recipientId,
          notification: notification.notification,
          now
        });
        delivered = result.status !== "idempotency-conflict";
      } catch {
        delivered = false;
      }
    }
    await input.storage.updateIntent(delivered ? done(claimed) : failed(claimed));
    if (!delivered) await input.reportFailure(claimed, now);
  }
}, "retryDueWritingGradeNotifications");
var writingGradeNotification = /* @__PURE__ */ __name2((intentValue, submissionValue, teacherLinkVerified = false) => {
  const rawIntent = record17(intentValue);
  const rawSubmission = record17(submissionValue);
  if (!rawIntent || !rawSubmission) return null;
  const intent = rawIntent;
  const submission = rawSubmission;
  if (intent.schemaVersion !== 1 || !ID15.test(intent.authorityRecordId) || !ID15.test(intent.actorUid) || !ID15.test(intent.eventId) || !ID15.test(submission.id) || intent.authorityRecordId !== submission.id || intent.occurrenceId !== intent.eventId || !Number.isSafeInteger(intent.occurredAt) || intent.dueAt !== intent.occurredAt + 36e5 || !ID15.test(submission.studentId)) return null;
  if (intent.kind === "writing-graded") {
    const context2 = record17(submission.context);
    if (intent.eventId !== `writing-${submission.id}-graded-${intent.auditVersion}` || !Number.isSafeInteger(intent.auditVersion) || (intent.auditVersion ?? 0) < 1 || context2?.assigningTeacherId !== intent.actorUid && context2?.selectedTeacherId !== intent.actorUid || !Array.isArray(submission.auditTrail)) return null;
    const audit = submission.auditTrail.find((candidate) => {
      const entry = record17(candidate);
      return entry?.version === intent.auditVersion && entry.gradedAt === intent.occurredAt && entry.teacherId === intent.actorUid && (entry.action === "published" || entry.action === "regraded");
    });
    return audit ? {
      recipientId: submission.studentId,
      notification: {
        type: "success",
        title: "Writing graded",
        message: "Your writing submission has been graded. View your academic record.",
        link: buildRoute2("STUDENT_ACADEMIC_RECORD")
      }
    } : null;
  }
  if (!Number.isSafeInteger(submission.submittedAt) || intent.occurredAt !== submission.submittedAt || intent.auditVersion !== void 0) return null;
  const context = record17(submission.context);
  if (intent.kind === "writing-submitted-student") {
    if (intent.eventId !== `writing-${submission.id}-submitted-student` || intent.actorUid !== submission.studentId && intent.actorUid !== context?.assigningTeacherId) return null;
    return {
      recipientId: submission.studentId,
      notification: {
        type: "success",
        title: "Writing submitted",
        message: "Your writing submission has been received for review.",
        link: buildRoute2("STUDENT_ACADEMIC_RECORD")
      }
    };
  }
  const teacherId = context?.selectedTeacherId;
  if (intent.kind !== "writing-submitted-teacher" || context?.type !== "solo-practice" || intent.eventId !== `writing-${submission.id}-submitted-teacher` || intent.actorUid !== submission.studentId || typeof teacherId !== "string" || !ID15.test(teacherId) || !teacherLinkVerified) return null;
  return {
    recipientId: teacherId,
    notification: {
      type: "info",
      title: "New writing submission",
      message: "A student submitted writing for review.",
      link: buildRoute2("TEACHER_GRADING_DETAIL", { submissionId: submission.id })
    }
  };
}, "writingGradeNotification");
var COLLECTION4 = "writing_notification_intents";
var ID16 = /^[A-Za-z0-9_-]{1,128}$/u;
var required19 = /* @__PURE__ */ __name2((env, key) => {
  const value = env[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`missing_${key.toLowerCase()}`);
  return value.trim();
}, "required");
var encodeValue = /* @__PURE__ */ __name2((value) => {
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number" && Number.isSafeInteger(value)) return { integerValue: String(value) };
  throw new Error("writing_notification_firestore_value_invalid");
}, "encodeValue");
var decodeValue = /* @__PURE__ */ __name2((value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return void 0;
  const fields2 = value;
  if (typeof fields2.stringValue === "string") return fields2.stringValue;
  if (typeof fields2.booleanValue === "boolean") return fields2.booleanValue;
  if (typeof fields2.integerValue === "string") return Number(fields2.integerValue);
  if (typeof fields2.doubleValue === "number") return fields2.doubleValue;
  if (fields2.nullValue === "NULL_VALUE") return null;
  if (fields2.mapValue && typeof fields2.mapValue === "object") {
    const mapFields = fields2.mapValue.fields ?? {};
    return Object.fromEntries(Object.entries(mapFields).map(([key, child]) => [key, decodeValue(child)]));
  }
  if (fields2.arrayValue && typeof fields2.arrayValue === "object") {
    const values = fields2.arrayValue.values ?? [];
    return values.map(decodeValue);
  }
  return void 0;
}, "decodeValue");
var decodeDocument3 = /* @__PURE__ */ __name2((document) => Object.fromEntries(Object.entries(document.fields ?? {}).map(([key, value]) => [key, decodeValue(value)])), "decodeDocument");
var FirebaseWritingGradeNotificationStorage = class {
  static {
    __name(this, "FirebaseWritingGradeNotificationStorage");
  }
  constructor(env, fetchImpl = globalThis.fetch) {
    this.env = env;
    this.fetchImpl = fetchImpl;
    this.projectId = encodeURIComponent(required19(env, "FIREBASE_PROJECT_ID"));
    const serviceIdentity = required19(env, "NOTIFICATION_COMMAND_SERVICE_IDENTITY");
    try {
      this.key = JSON.parse(required19(env, "NOTIFICATION_COMMAND_GOOGLE_SA_KEY"));
    } catch {
      throw new Error("invalid_notification_command_google_sa_key");
    }
    if (this.key.client_email !== serviceIdentity || !this.key.private_key) {
      throw new Error("notification_command_service_identity_mismatch");
    }
    this.rtdb = new FirebaseRtdbRestClient({
      env: {
        FIREBASE_DB_URL: required19(env, "FIREBASE_DB_URL"),
        FIREBASE_PROJECT_ID: required19(env, "FIREBASE_PROJECT_ID"),
        GOOGLE_SA_KEY: required19(env, "NOTIFICATION_COMMAND_GOOGLE_SA_KEY")
      },
      fetchImpl
    });
  }
  env;
  fetchImpl;
  static {
    __name2(this, "FirebaseWritingGradeNotificationStorage");
  }
  projectId;
  key;
  rtdb;
  tokenCache = null;
  async token() {
    if (this.tokenCache && this.tokenCache.expiresAt > Date.now() + 3e4) return this.tokenCache.value;
    const privateKey = await importPKCS82(this.key.private_key, "RS256");
    const now = Math.floor(Date.now() / 1e3);
    const assertion = await new SignJWT2({ scope: "https://www.googleapis.com/auth/datastore" }).setProtectedHeader({ alg: "RS256", typ: "JWT" }).setIssuer(this.key.client_email).setSubject(this.key.client_email).setAudience("https://oauth2.googleapis.com/token").setIssuedAt(now).setExpirationTime(now + 3600).sign(privateKey);
    const response10 = await this.fetchImpl("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion
      }).toString()
    });
    if (!response10.ok) throw new Error(`writing_notification_token_failed:${response10.status}`);
    const result = await response10.json();
    if (typeof result.access_token !== "string" || !result.access_token) throw new Error("writing_notification_token_invalid");
    const expiresIn = typeof result.expires_in === "number" ? result.expires_in : 3600;
    this.tokenCache = { value: result.access_token, expiresAt: Date.now() + expiresIn * 1e3 };
    return result.access_token;
  }
  documentUrl(path) {
    return `https://firestore.googleapis.com/v1/projects/${this.projectId}/databases/(default)/documents/${path}`;
  }
  async getDocument(path) {
    const response10 = await this.fetchImpl(this.documentUrl(path), {
      headers: { Authorization: `Bearer ${await this.token()}` }
    });
    if (response10.status === 404) return null;
    if (!response10.ok) throw new Error(`writing_notification_read_failed:${response10.status}`);
    return await response10.json();
  }
  async patchIntent(current, intent) {
    if (!current.updateTime) return false;
    const response10 = await this.fetchImpl(
      `${this.documentUrl(`${COLLECTION4}/${encodeURIComponent(intent.eventId)}`)}?updateMask.fieldPaths=attempts&updateMask.fieldPaths=dueAt&updateMask.fieldPaths=state&currentDocument.updateTime=${encodeURIComponent(current.updateTime)}`,
      {
        method: "PATCH",
        headers: { Authorization: `Bearer ${await this.token()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ fields: {
          attempts: encodeValue(intent.attempts),
          dueAt: encodeValue(intent.dueAt),
          state: encodeValue(intent.state)
        } })
      }
    );
    if (response10.status === 409 || response10.status === 412) return false;
    if (!response10.ok) throw new Error(`writing_notification_update_failed:${response10.status}`);
    return true;
  }
  async readIntent(eventId) {
    const document = await this.getDocument(`${COLLECTION4}/${encodeURIComponent(eventId)}`);
    return document ? decodeDocument3(document) : null;
  }
  async readSubmission(submissionId) {
    const document = await this.getDocument(`writing_submissions/${encodeURIComponent(submissionId)}`);
    return document ? decodeDocument3(document) : null;
  }
  async readTeacherLink(teacherId, studentId) {
    if (!ID16.test(teacherId) || !ID16.test(studentId)) return false;
    const linked = await this.rtdb.readValue(`student_teacher_links/${teacherId}/${studentId}`);
    return linked === true;
  }
  async readInbox(path) {
    return this.rtdb.readValue(path);
  }
  async readSessionSubmissionProof(sessionCode, studentId, resultId, actorUid) {
    if (!ID16.test(sessionCode) || !ID16.test(studentId) || !ID16.test(resultId) || !ID16.test(actorUid)) return false;
    const session = await this.rtdb.readValue(`game_sessions/${sessionCode}`);
    if (!session || typeof session !== "object" || Array.isArray(session)) return false;
    const row9 = session;
    const students = row9.students && typeof row9.students === "object" && !Array.isArray(row9.students) ? row9.students : {};
    const student = students[studentId] && typeof students[studentId] === "object" && !Array.isArray(students[studentId]) ? students[studentId] : {};
    const writing = student.writing && typeof student.writing === "object" && !Array.isArray(student.writing) ? student.writing : {};
    return writing.submitted === true && writing.resultId === resultId && (actorUid === studentId || row9.createdByUserId === actorUid);
  }
  async reportFailure(intent, now) {
    const date = new Date(now).toISOString().slice(0, 10);
    const path = `reports/errors/${date}/writing-notification-${intent.eventId}`;
    const current = await this.rtdb.readWithEtag(path);
    if (current.data !== null) return;
    await this.rtdb.writeIfMatch(path, {
      id: `writing-notification-${intent.eventId}`,
      timestamp: now,
      feature: "writing",
      severity: "error",
      message: "Writing notification delivery failed after its retry.",
      userId: intent.actorUid,
      userName: "Notification Worker",
      userRole: "service",
      duplicateCount: 1,
      contextData: { eventId: intent.eventId, authorityRecordId: intent.authorityRecordId }
    }, current.etag);
  }
  async updateIntent(intent) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const current = await this.getDocument(`${COLLECTION4}/${encodeURIComponent(intent.eventId)}`);
      if (!current) throw new Error("writing_notification_intent_not_found");
      const value = decodeDocument3(current);
      if (value.eventId !== intent.eventId || value.authorityRecordId !== intent.authorityRecordId || value.actorUid !== intent.actorUid || value.auditVersion !== intent.auditVersion) {
        throw new Error("writing_notification_intent_identity_changed");
      }
      if (value.state === "done" || value.state === "failed") return;
      if (await this.patchIntent(current, intent)) return;
    }
    throw new Error("writing_notification_intent_cas_failed");
  }
  async dueIntents(now, limit) {
    const response10 = await this.fetchImpl(
      `https://firestore.googleapis.com/v1/projects/${this.projectId}/databases/(default)/documents:runQuery`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${await this.token()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ structuredQuery: {
          from: [{ collectionId: COLLECTION4 }],
          where: { fieldFilter: {
            field: { fieldPath: "dueAt" },
            op: "LESS_THAN_OR_EQUAL",
            value: encodeValue(now)
          } },
          orderBy: [{ field: { fieldPath: "dueAt" }, direction: "ASCENDING" }],
          limit: Math.min(5, Math.max(1, limit))
        } })
      }
    );
    if (!response10.ok) throw new Error(`writing_notification_query_failed:${response10.status}`);
    const rows = await response10.json();
    return rows.flatMap((row9) => row9.document ? [decodeDocument3(row9.document)] : []).filter((intent) => intent.dueAt <= now && (intent.state === "retry_due" || intent.state === "retrying"));
  }
  async claimRetry(eventId, now) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const current = await this.getDocument(`${COLLECTION4}/${encodeURIComponent(eventId)}`);
      if (!current) return null;
      const intent = decodeDocument3(current);
      if (intent.eventId !== eventId || intent.state !== "retry_due" || intent.attempts !== 1 || intent.dueAt > now) return null;
      const claimed = {
        ...intent,
        state: "retrying",
        attempts: 2,
        dueAt: now + 60 * 60 * 1e3
      };
      if (await this.patchIntent(current, claimed)) return claimed;
    }
    return null;
  }
};
var ACTION_PATH7 = "/writing-notifications/actions";
var ALLOWED_ORIGINS8 = /* @__PURE__ */ new Set(["https://kahut1.web.app", "http://localhost:5173", "http://localhost:5174"]);
var required20 = /* @__PURE__ */ __name2((env, key) => {
  const value = env[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`missing_${key.toLowerCase()}`);
  return value.trim();
}, "required");
var response7 = /* @__PURE__ */ __name2((request, body, status) => {
  const headers2 = new Headers({
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    Vary: "Origin, Access-Control-Request-Method, Access-Control-Request-Headers"
  });
  const origin = request.headers.get("Origin");
  if (origin && ALLOWED_ORIGINS8.has(origin)) {
    headers2.set("Access-Control-Allow-Origin", origin);
    headers2.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    headers2.set("Access-Control-Allow-Headers", "Authorization, Content-Type, Idempotency-Key");
  }
  return new Response(JSON.stringify(body), { status, headers: headers2 });
}, "response");
var repositoryForEnv2 = /* @__PURE__ */ __name2((env) => new FirebaseRestNotificationCommandRepository({ env: {
  FIREBASE_DB_URL: required20(env, "FIREBASE_DB_URL"),
  FIREBASE_PROJECT_ID: required20(env, "FIREBASE_PROJECT_ID"),
  NOTIFICATION_COMMAND_SERVICE_IDENTITY: required20(env, "NOTIFICATION_COMMAND_SERVICE_IDENTITY"),
  NOTIFICATION_COMMAND_GOOGLE_SA_KEY: required20(env, "NOTIFICATION_COMMAND_GOOGLE_SA_KEY")
} }), "repositoryForEnv");
var createWritingNotificationWorker = /* @__PURE__ */ __name2((options = {}) => {
  const verifier = options.firebaseVerifier ?? createFirebaseVerifier2();
  const now = options.now ?? Date.now;
  const repositoryFactory = options.repositoryFactory ?? repositoryForEnv2;
  const storageFactory = options.storageFactory ?? ((env) => new FirebaseWritingGradeNotificationStorage(env));
  return {
    async fetch(request, env) {
      const url = new URL(request.url);
      if (url.pathname !== ACTION_PATH7 || url.search || url.hash) return response7(request, { code: "writing_notification_not_found" }, 404);
      const origin = request.headers.get("Origin");
      if (origin && !ALLOWED_ORIGINS8.has(origin)) return response7(request, { code: "cors_origin_denied" }, 403);
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: response7(request, {}, 200).headers });
      if (request.method !== "POST") return response7(request, { code: "method_not_allowed" }, 405);
      const auth = await verifier.verifyAuthorizationHeader(request.headers.get("Authorization"), env);
      if (!auth.valid || typeof auth.uid !== "string" || !auth.uid) return response7(request, { code: "writing_notification_unauthenticated" }, 401);
      const limiter = env.NOTIFICATION_RATE_LIMITER;
      if (!limiter || typeof limiter.limit !== "function") return response7(request, { code: "writing_notification_unavailable" }, 503);
      if (!(await limiter.limit({ key: `writing-notification:${auth.uid}` })).success) return response7(request, { code: "rate_limited" }, 429);
      try {
        const action = await readWritingGradeNotificationAction(request);
        const result = await deliverWritingGradeNotification({
          eventId: action.eventId,
          submissionId: action.submissionId,
          actorUid: auth.uid,
          storage: storageFactory(env),
          repository: repositoryFactory(env),
          now
        });
        const status = result === "delivered" ? 200 : result === "not_found" ? 404 : result === "forbidden" ? 403 : 503;
        return response7(request, { status: result }, status);
      } catch (error) {
        if (error instanceof Error && error.message.startsWith("writing_notification_")) {
          return response7(request, { code: error.message }, 400);
        }
        return response7(request, { code: "writing_notification_failed" }, 503);
      }
    }
  };
}, "createWritingNotificationWorker");
var retryDueWritingNotificationsForEnv = /* @__PURE__ */ __name2(async (env, now = Date.now) => {
  const storage = new FirebaseWritingGradeNotificationStorage(env);
  await retryDueWritingGradeNotifications({
    storage,
    repository: repositoryForEnv2(env),
    now: now(),
    readInbox: /* @__PURE__ */ __name2((path) => storage.readInbox(path), "readInbox"),
    reportFailure: /* @__PURE__ */ __name2((intent, at) => storage.reportFailure(intent, at), "reportFailure")
  });
}, "retryDueWritingNotificationsForEnv");
var ID17 = /^[A-Za-z0-9_-]{1,128}$/u;
var RETRY_DELAY_MS11 = 60 * 60 * 1e3;
var DONE_DUE_AT8 = 864e13;
var row6 = /* @__PURE__ */ __name2((value) => value && typeof value === "object" && !Array.isArray(value) ? value : null, "row");
var parseTestCompleteNotificationAction = /* @__PURE__ */ __name2(async (request) => {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    throw new Error("test_complete_content_type_required");
  }
  const text2 = await request.text();
  if (new TextEncoder().encode(text2).byteLength > 1024) throw new Error("test_complete_body_too_large");
  let value;
  try {
    value = JSON.parse(text2);
  } catch {
    throw new Error("test_complete_invalid_json");
  }
  const command = row6(value);
  if (!command || Object.keys(command).sort().join(",") !== "resultId,schemaVersion" || command.schemaVersion !== 1 || typeof command.resultId !== "string" || !ID17.test(command.resultId) || request.headers.get("Idempotency-Key") !== `test-completed:${command.resultId}`) {
    throw new Error("test_complete_invalid");
  }
  return command;
}, "parseTestCompleteNotificationAction");
var validIntent5 = /* @__PURE__ */ __name2((value, resultId) => {
  const intent = row6(value);
  if (!intent || intent.schemaVersion !== 1 || intent.actionId !== resultId || intent.kind !== "test-completed" || typeof intent.actorUid !== "string" || !ID17.test(intent.actorUid) || !["student", "teacher"].includes(String(intent.actorRole)) || !Number.isSafeInteger(intent.occurredAt) || !Number.isSafeInteger(intent.dueAt) || ![0, 1, 2].includes(Number(intent.attempts)) || !["pending", "sending", "retry_due", "retrying", "done", "failed"].includes(String(intent.state))) return null;
  return intent;
}, "validIntent");
var resolveAuthority2 = /* @__PURE__ */ __name2(async (resultId, actorUid, storage) => {
  const result = row6(await storage.readResult(resultId));
  const intent = validIntent5(result?.testCompleteNotificationIntent, resultId);
  if (!result || result.resultId !== resultId || !intent || result.isGuest === true || result.thcsData !== void 0 || String(result.testType ?? "").toUpperCase() === "THCS-THPT") return null;
  const actor = row6(await storage.readUser(actorUid));
  if (!actor || intent.actorUid !== actorUid) return null;
  if (intent.actorRole === "student") {
    if (actor.role !== "student" || result.studentId !== actorUid) return null;
  } else {
    if (actor.role !== "teacher" || result.context && row6(result.context)?.type !== "class_session" || row6(row6(result.context)?.configApplied)?.source !== "teacher_override" || result.teacherId !== actorUid || typeof result.sessionCode !== "string" || !ID17.test(result.sessionCode)) return null;
    const session = row6(await storage.readSession(result.sessionCode));
    const owner = session?.createdByUserId ?? session?.createdBy ?? session?.teacherId;
    if (owner !== actorUid) return null;
  }
  return { result, intent };
}, "resolveAuthority");
var testCompleteNotificationId = /* @__PURE__ */ __name2((resultId, recipientId) => {
  const value = `${resultId}:${recipientId}`;
  const hashes = [0, 1, 2, 3].map((seed) => {
    let hash = (2166136261 ^ seed) >>> 0;
    for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619) >>> 0;
    return hash.toString(16).padStart(8, "0");
  }).join("");
  const versioned = `${hashes.slice(0, 12)}5${hashes.slice(13, 16)}8${hashes.slice(17)}`;
  return `${versioned.slice(0, 8)}-${versioned.slice(8, 12)}-${versioned.slice(12, 16)}-${versioned.slice(16, 20)}-${versioned.slice(20)}`;
}, "testCompleteNotificationId");
var notificationFor = /* @__PURE__ */ __name2((result, resultId, recipientId) => {
  if (typeof result.resultId !== "string" || !result.resultId || result.resultId !== resultId) return null;
  return {
    recipientId,
    notification: {
      type: "success",
      title: "Test Complete",
      message: "Your test result is ready.",
      link: buildRoute2("RESULT_DETAIL", { resultId })
    }
  };
}, "notificationFor");
var deliver3 = /* @__PURE__ */ __name2(async (resultId, result, intent, storage, repository, now) => {
  const notice = notificationFor(result, resultId, String(result.studentId ?? ""));
  if (!notice || !ID17.test(notice.recipientId)) return { ...intent, state: "failed", dueAt: DONE_DUE_AT8 };
  try {
    const response10 = await repository.create({
      operationId: testCompleteNotificationId(resultId, notice.recipientId),
      recipientId: notice.recipientId,
      notification: notice.notification,
      now: intent.occurredAt
    });
    if (response10.status !== "idempotency-conflict") return { ...intent, state: "done", dueAt: DONE_DUE_AT8 };
  } catch {
  }
  const failed2 = {
    ...intent,
    attempts: intent.attempts === 0 ? 1 : intent.attempts,
    state: "retry_due",
    dueAt: now + RETRY_DELAY_MS11
  };
  await storage.saveIntent(resultId, failed2);
  return failed2;
}, "deliver");
var performTestCompleteNotificationAction = /* @__PURE__ */ __name2(async (input) => {
  const resolved = await resolveAuthority2(input.resultId, input.actorUid, input.storage);
  if (!resolved) return { status: 403, body: { code: "test_complete_forbidden" } };
  if (resolved.intent.state === "done") return { status: 200, body: { status: "replayed", resultId: input.resultId } };
  if (resolved.intent.state !== "pending" || resolved.intent.attempts !== 0) {
    return { status: 200, body: { status: "committed", resultId: input.resultId } };
  }
  const claimed = await input.storage.claimInitial(input.resultId, (input.now ?? Date.now)());
  if (!claimed) return { status: 200, body: { status: "committed", resultId: input.resultId } };
  const progress = await deliver3(input.resultId, resolved.result, claimed, input.storage, input.repository, (input.now ?? Date.now)());
  await input.storage.saveIntent(input.resultId, progress);
  return { status: 200, body: { status: progress.state === "done" ? "delivered" : "retry_scheduled", resultId: input.resultId } };
}, "performTestCompleteNotificationAction");
var retryDueTestCompleteNotifications = /* @__PURE__ */ __name2(async (input) => {
  const now = (input.now ?? Date.now)();
  for (const due of await input.storage.dueIntents(now, 2)) {
    if (due.intent.kind !== "test-completed" || !(due.intent.state === "retry_due" && due.intent.attempts === 1 || due.intent.state === "sending" && due.intent.attempts === 0)) continue;
    const claimed = await input.storage.claimRetry(due.resultId, now);
    if (!claimed) continue;
    const resolved = await resolveAuthority2(due.resultId, claimed.actorUid, input.storage);
    if (!resolved || resolved.intent.actionId !== claimed.actionId) {
      const failed2 = { ...claimed, state: "failed", dueAt: DONE_DUE_AT8 };
      await input.storage.saveIntent(due.resultId, failed2);
      await input.storage.reportFailure(due.resultId, failed2);
      continue;
    }
    const progress = await deliver3(due.resultId, resolved.result, claimed, input.storage, input.repository, now);
    const final = progress.state === "retry_due" ? { ...progress, state: "failed", dueAt: DONE_DUE_AT8 } : progress;
    await input.storage.saveIntent(due.resultId, final);
    if (final.state === "failed") await input.storage.reportFailure(due.resultId, final);
  }
}, "retryDueTestCompleteNotifications");
var required21 = /* @__PURE__ */ __name2((env, name) => {
  const value = env[name];
  if (typeof value !== "string" || !value.trim()) throw new Error(`missing_${name.toLowerCase()}`);
  return value.trim();
}, "required");
var row7 = /* @__PURE__ */ __name2((value) => value && typeof value === "object" && !Array.isArray(value) ? value : null, "row");
var FirebaseTestCompleteNotificationStorage = class {
  static {
    __name(this, "FirebaseTestCompleteNotificationStorage");
  }
  constructor(env, fetchImpl = globalThis.fetch) {
    this.env = env;
    this.admin = new FirebaseRtdbRestClient({ env: {
      FIREBASE_DB_URL: required21(env, "FIREBASE_DB_URL"),
      FIREBASE_PROJECT_ID: required21(env, "FIREBASE_PROJECT_ID"),
      GOOGLE_SA_KEY: required21(env, "NOTIFICATION_COMMAND_GOOGLE_SA_KEY")
    }, fetchImpl });
  }
  env;
  static {
    __name2(this, "FirebaseTestCompleteNotificationStorage");
  }
  admin;
  readResult(id) {
    return this.admin.readValue(`test_results/${id}`);
  }
  readUser(id) {
    return this.admin.readValue(`users/${id}`);
  }
  readSession(code) {
    return this.admin.readValue(`game_sessions/${code}`);
  }
  async saveIntent(resultId, intent) {
    const path = `test_results/${resultId}/testCompleteNotificationIntent`;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const current = await this.admin.readWithEtag(path);
      if (!current.data || current.data.actionId !== resultId || current.data.kind !== "test-completed" || current.data.actorUid !== intent.actorUid) throw new Error("test_complete_intent_changed");
      if (current.data.state === "done" || current.data.state === "failed") return;
      if (await this.admin.writeIfMatch(path, intent, current.etag)) return;
    }
    throw new Error("test_complete_intent_cas_failed");
  }
  async claim(resultId, now, retry) {
    const path = `test_results/${resultId}/testCompleteNotificationIntent`;
    const current = await this.admin.readWithEtag(path);
    const intent = current.data;
    const eligible = retry ? intent?.state === "retry_due" && intent.attempts === 1 || intent?.state === "sending" && intent.attempts === 0 : intent?.state === "pending" && intent.attempts === 0;
    if (!intent || intent.actionId !== resultId || intent.kind !== "test-completed" || !eligible || intent.dueAt > now) return null;
    const claimed = {
      ...intent,
      state: retry ? "retrying" : "sending",
      attempts: retry ? 2 : 0,
      dueAt: now + 6e4
    };
    return await this.admin.writeIfMatch(path, claimed, current.etag) ? claimed : null;
  }
  claimInitial(resultId, now) {
    return this.claim(resultId, now, false);
  }
  claimRetry(resultId, now) {
    return this.claim(resultId, now, true);
  }
  async dueIntents(now, limit) {
    const results = row7(await this.admin.readValue("test_results", {
      orderBy: "testCompleteNotificationIntent/dueAt",
      startAt: 0,
      limitToFirst: limit
    }));
    if (!results) return [];
    return Object.entries(results).flatMap(([resultId, value]) => {
      const intent = row7(row7(value)?.testCompleteNotificationIntent);
      return intent && intent.kind === "test-completed" && intent.actionId === resultId && typeof intent.dueAt === "number" && intent.dueAt <= now && (intent.state === "retry_due" && intent.attempts === 1 || intent.state === "sending" && intent.attempts === 0) ? [{ resultId, intent }] : [];
    });
  }
  async reportFailure(resultId, intent) {
    const now = Date.now();
    const day22 = new Date(now).toISOString().slice(0, 10);
    const path = `reports/errors/${day22}/test-complete-${resultId}`;
    const current = await this.admin.readWithEtag(path);
    if (current.data !== null) return;
    await this.admin.writeIfMatch(path, {
      id: `test-complete:${resultId}`,
      timestamp: now,
      feature: "test-results",
      severity: "error",
      message: "Test completion notification delivery failed after its retry.",
      userId: "notification-worker",
      userName: "Notification Worker",
      userRole: "service",
      duplicateCount: 1,
      contextData: { resultId, studentId: String(row7(await this.readResult(resultId))?.studentId ?? "") }
    }, current.etag);
  }
};
var ACTION_PATH8 = "/test-complete-notifications/actions";
var ALLOWED_ORIGINS9 = /* @__PURE__ */ new Set(["https://kahut1.web.app", "http://localhost:5173", "http://localhost:5174"]);
var required22 = /* @__PURE__ */ __name2((env, name) => {
  const value = env[name];
  if (typeof value !== "string" || !value.trim()) throw new Error(`missing_${name.toLowerCase()}`);
  return value.trim();
}, "required");
var response8 = /* @__PURE__ */ __name2((request, body, status) => {
  const headers2 = new Headers({
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    Vary: "Origin, Access-Control-Request-Method, Access-Control-Request-Headers"
  });
  const origin = request.headers.get("Origin");
  if (origin && ALLOWED_ORIGINS9.has(origin)) {
    headers2.set("Access-Control-Allow-Origin", origin);
    headers2.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    headers2.set("Access-Control-Allow-Headers", "Authorization, Content-Type, Idempotency-Key");
  }
  return new Response(JSON.stringify(body), { status, headers: headers2 });
}, "response");
var repositoryForEnv3 = /* @__PURE__ */ __name2((env) => new FirebaseRestNotificationCommandRepository({
  env: {
    FIREBASE_DB_URL: required22(env, "FIREBASE_DB_URL"),
    FIREBASE_PROJECT_ID: required22(env, "FIREBASE_PROJECT_ID"),
    NOTIFICATION_COMMAND_SERVICE_IDENTITY: required22(env, "NOTIFICATION_COMMAND_SERVICE_IDENTITY"),
    NOTIFICATION_COMMAND_GOOGLE_SA_KEY: required22(env, "NOTIFICATION_COMMAND_GOOGLE_SA_KEY")
  }
}), "repositoryForEnv");
var createTestCompleteNotificationWorker = /* @__PURE__ */ __name2((options = {}) => {
  const verifier = options.firebaseVerifier ?? createFirebaseVerifier2();
  const storageFactory = options.storageFactory ?? ((env) => new FirebaseTestCompleteNotificationStorage(env));
  const repositoryFactory = options.repositoryFactory ?? repositoryForEnv3;
  const now = options.now ?? Date.now;
  return {
    async fetch(request, env) {
      const url = new URL(request.url);
      if (url.pathname !== ACTION_PATH8 || url.search || url.hash) return response8(request, { code: "test_complete_not_found" }, 404);
      const origin = request.headers.get("Origin");
      if (origin && !ALLOWED_ORIGINS9.has(origin)) return response8(request, { code: "cors_origin_denied" }, 403);
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: response8(request, {}, 200).headers });
      if (request.method !== "POST") return response8(request, { code: "method_not_allowed" }, 405);
      const auth = await verifier.verifyAuthorizationHeader(request.headers.get("Authorization"), env);
      if (!auth.valid || typeof auth.uid !== "string" || !auth.uid) return response8(request, { code: "test_complete_unauthenticated" }, 401);
      const limiter = env.NOTIFICATION_RATE_LIMITER;
      if (!limiter || typeof limiter.limit !== "function") return response8(request, { code: "notification_command_unavailable" }, 503);
      if (!(await limiter.limit({ key: `test-complete:${auth.uid}` })).success) return response8(request, { code: "rate_limited" }, 429);
      try {
        const command = await parseTestCompleteNotificationAction(request);
        const result = await performTestCompleteNotificationAction({
          resultId: command.resultId,
          actorUid: auth.uid,
          storage: storageFactory(env),
          repository: repositoryFactory(env),
          now
        });
        return response8(request, result.body, result.status);
      } catch (error) {
        if (error instanceof Error && error.message.startsWith("test_complete_")) return response8(request, { code: error.message }, 400);
        return response8(request, { code: "test_complete_failed" }, 500);
      }
    }
  };
}, "createTestCompleteNotificationWorker");
var retryDueTestCompleteNotificationsForEnv = /* @__PURE__ */ __name2(async (env, now = Date.now) => {
  await retryDueTestCompleteNotifications({
    storage: new FirebaseTestCompleteNotificationStorage(env),
    repository: repositoryForEnv3(env),
    now
  });
}, "retryDueTestCompleteNotificationsForEnv");
var ID18 = /^[A-Za-z0-9_-]{1,128}$/u;
var UUID7 = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
var RETRY_DELAY_MS12 = 60 * 60 * 1e3;
var DONE_DUE_AT9 = 864e13;
var row8 = /* @__PURE__ */ __name2((value) => value && typeof value === "object" && !Array.isArray(value) ? value : null, "row");
var parseManualGradeCommand = /* @__PURE__ */ __name2(async (request) => {
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    throw new Error("grade_notification_content_type_required");
  }
  const text2 = await request.text();
  if (new TextEncoder().encode(text2).byteLength > 2048) throw new Error("grade_notification_body_too_large");
  let value;
  try {
    value = JSON.parse(text2);
  } catch {
    throw new Error("grade_notification_invalid_json");
  }
  const command = row8(value);
  const expected = "actionType,eventId,feedback,pointsEarned,questionNumber,schemaVersion,sessionCode,studentId";
  if (!command || Object.keys(command).sort().join(",") !== expected || command.schemaVersion !== 1 || command.actionType !== "manual-question-grade" || typeof command.eventId !== "string" || !UUID7.test(command.eventId) || typeof command.sessionCode !== "string" || !ID18.test(command.sessionCode) || typeof command.studentId !== "string" || !ID18.test(command.studentId) || !Number.isSafeInteger(command.questionNumber) || Number(command.questionNumber) < 1 || Number(command.questionNumber) > 500 || typeof command.pointsEarned !== "number" || !Number.isFinite(command.pointsEarned) || command.pointsEarned < 0 || command.pointsEarned > 100 || typeof command.feedback !== "string" || command.feedback.length > 2e3 || request.headers.get("Idempotency-Key") !== command.eventId) {
    throw new Error("grade_notification_invalid");
  }
  return command;
}, "parseManualGradeCommand");
var intentMatchesCommand = /* @__PURE__ */ __name2((intent, command, actorUid) => intent.eventId === command.eventId && intent.sessionCode === command.sessionCode && intent.studentId === command.studentId && intent.actorUid === actorUid && intent.questionNumber === command.questionNumber && intent.pointsEarned === command.pointsEarned, "intentMatchesCommand");
var resolveAuthority3 = /* @__PURE__ */ __name2(async (command, actorUid, storage) => {
  const [sessionValue, actorValue, studentValue] = await Promise.all([
    storage.readSession(command.sessionCode),
    storage.readUser(actorUid),
    storage.readUser(command.studentId)
  ]);
  const session = row8(sessionValue);
  const actor = row8(actorValue);
  const student = row8(studentValue);
  if (!session || !actor || actor.role !== "teacher" || session.createdByUserId !== actorUid && session.createdBy !== actorUid || student?.role !== "student" || typeof session.testId !== "string" || !ID18.test(session.testId)) return null;
  const results = row8(session.results);
  const studentResult = row8(results?.[command.studentId]);
  const questionResults = row8(studentResult?.questionResults);
  const question = row8(questionResults?.[String(command.questionNumber)]);
  if (!studentResult || !question || typeof question.studentAnswer !== "string" || !Number.isFinite(question.pointsMax) || Number(command.pointsEarned) > Number(question.pointsMax)) return null;
  const test = row8(await storage.readTest(session.testId));
  if (!test || test.testType !== "THCS-THPT") return null;
  const testTitle = typeof test.title === "string" && test.title.trim() ? test.title.trim() : typeof row8(test.metadata)?.title === "string" && String(row8(test.metadata)?.title).trim() ? String(row8(test.metadata)?.title).trim() : session.testId;
  return { session, question, testTitle: testTitle.slice(0, 160) };
}, "resolveAuthority");
var notificationFor2 = /* @__PURE__ */ __name2((intent) => ({
  type: "success",
  title: "Grade Updated",
  message: `Your answer for Q${intent.questionNumber} in "${intent.testTitle}" has been graded: ${intent.pointsEarned} points.`
}), "notificationFor");
var deliver4 = /* @__PURE__ */ __name2(async (intent, repository, now) => {
  try {
    const result = await repository.create({
      operationId: intent.eventId,
      recipientId: intent.studentId,
      notification: notificationFor2(intent),
      now: intent.occurredAt
    });
    return result.status === "idempotency-conflict" ? "retry_due" : "done";
  } catch {
    return "retry_due";
  }
}, "deliver");
var performManualGradeAction = /* @__PURE__ */ __name2(async (input) => {
  const { command, actorUid, storage } = input;
  const existing = await storage.readIntent(command.eventId);
  if (existing) {
    if (!intentMatchesCommand(existing, command, actorUid)) return { status: 409, body: { code: "grade_notification_event_conflict" } };
    return { status: 200, body: { status: "replayed", eventId: command.eventId, notificationStatus: existing.state } };
  }
  const authority2 = await resolveAuthority3(command, actorUid, storage);
  if (!authority2) return { status: 403, body: { code: "grade_notification_authority_invalid" } };
  const now = input.now ?? Date.now;
  const occurredAt = now();
  const questionResult = {
    ...authority2.question,
    pointsEarned: command.pointsEarned,
    isCorrect: command.pointsEarned > 0,
    writingResult: {
      ...row8(authority2.question.writingResult),
      teacherScore: command.pointsEarned,
      teacherFeedback: command.feedback || null,
      gradingTier: "teacher-graded"
    }
  };
  const intent = {
    schemaVersion: 1,
    eventId: command.eventId,
    kind: "individual-question-graded",
    sessionCode: command.sessionCode,
    studentId: command.studentId,
    actorUid,
    testTitle: authority2.testTitle,
    questionNumber: command.questionNumber,
    pointsEarned: command.pointsEarned,
    occurredAt,
    dueAt: occurredAt + RETRY_DELAY_MS12,
    attempts: 1,
    state: "sending"
  };
  try {
    await storage.commitManualGrade({ command, intent, questionResult });
  } catch {
    const committed = await storage.readIntent(command.eventId);
    if (!committed || !intentMatchesCommand(committed, command, actorUid)) {
      return { status: 409, body: { code: "grade_notification_commit_failed" } };
    }
  }
  const delivery = await deliver4(intent, input.repository, occurredAt);
  const finalIntent = delivery === "done" ? { ...intent, state: "done", dueAt: DONE_DUE_AT9 } : { ...intent, state: "retry_due", dueAt: occurredAt + RETRY_DELAY_MS12 };
  await storage.updateIntent(finalIntent);
  return { status: 200, body: {
    status: "committed",
    eventId: command.eventId,
    notificationStatus: delivery === "done" ? "delivered" : "retry_due"
  } };
}, "performManualGradeAction");
var retryDueGradeNotifications = /* @__PURE__ */ __name2(async (input) => {
  const now = input.now ?? Date.now;
  for (const due of await input.storage.dueIntents(now(), 2)) {
    if (!(due.attempts === 0 && ["pending", "sending"].includes(due.state) || due.attempts === 1 && due.state === "retry_due" || due.attempts === 2 && due.state === "retrying")) continue;
    const claimed = await input.storage.claimRetry(due.eventId, now());
    if (!claimed) continue;
    const delivery = await deliver4(claimed, input.repository, now());
    if (delivery === "done") {
      await input.storage.updateIntent({ ...claimed, state: "done", dueAt: DONE_DUE_AT9 });
    } else {
      const failed2 = { ...claimed, state: "failed", dueAt: DONE_DUE_AT9 };
      await input.storage.reportFailure(failed2, now());
      await input.storage.updateIntent(failed2);
    }
  }
}, "retryDueGradeNotifications");
var OAUTH_URL = "https://oauth2.googleapis.com/token";
var required23 = /* @__PURE__ */ __name2((env, name) => {
  const value = env[name];
  if (typeof value !== "string" || !value.trim()) throw new Error(`missing_${name.toLowerCase()}`);
  return value.trim();
}, "required");
var FirebaseGradeNotificationStorage = class {
  static {
    __name(this, "FirebaseGradeNotificationStorage");
  }
  constructor(env, fetchImpl = globalThis.fetch) {
    this.env = env;
    this.fetchImpl = fetchImpl;
    this.databaseUrl = required23(env, "FIREBASE_DB_URL").replace(/\/$/u, "");
    this.admin = new FirebaseRtdbRestClient({ env: {
      FIREBASE_DB_URL: this.databaseUrl,
      FIREBASE_PROJECT_ID: required23(env, "FIREBASE_PROJECT_ID"),
      GOOGLE_SA_KEY: required23(env, "NOTIFICATION_COMMAND_GOOGLE_SA_KEY")
    }, fetchImpl });
  }
  env;
  fetchImpl;
  static {
    __name2(this, "FirebaseGradeNotificationStorage");
  }
  admin;
  databaseUrl;
  readSession(sessionCode) {
    return this.admin.readValue(`game_sessions/${sessionCode}`);
  }
  readTest(testId) {
    return this.admin.readValue(`tests/${testId}`);
  }
  readUser(userId) {
    return this.admin.readValue(`users/${userId}`);
  }
  readIntent(eventId) {
    return this.admin.readValue(`grade_notification_intents/${eventId}`);
  }
  async adminToken() {
    const key = JSON.parse(required23(this.env, "NOTIFICATION_COMMAND_GOOGLE_SA_KEY"));
    const identity = required23(this.env, "NOTIFICATION_COMMAND_SERVICE_IDENTITY");
    if (key.client_email !== identity || !key.private_key) throw new Error("grade_notification_service_identity_invalid");
    const privateKey = await importPKCS82(key.private_key, "RS256");
    const issuedAt = Math.floor(Date.now() / 1e3);
    const assertion = await new SignJWT2({
      iss: identity,
      sub: identity,
      aud: OAUTH_URL,
      iat: issuedAt,
      exp: issuedAt + 3600,
      scope: [
        "https://www.googleapis.com/auth/firebase.database",
        "https://www.googleapis.com/auth/userinfo.email"
      ].join(" ")
    }).setProtectedHeader({ alg: "RS256" }).sign(privateKey);
    const response10 = await this.fetchImpl(OAUTH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${assertion}`
    });
    if (!response10.ok) throw new Error(`grade_notification_token_failed:${response10.status}`);
    const body = await response10.json();
    if (typeof body.access_token !== "string" || !body.access_token) throw new Error("grade_notification_token_invalid");
    return body.access_token;
  }
  async commitManualGrade(input) {
    const { command, intent, questionResult } = input;
    const gradePath = `game_sessions/${command.sessionCode}/results/${command.studentId}/questionResults/${command.questionNumber}`;
    const payload = {
      [gradePath]: questionResult,
      [`grade_notification_intents/${command.eventId}`]: intent
    };
    const response10 = await this.fetchImpl(`${this.databaseUrl}/.json`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${await this.adminToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response10.ok) throw new Error(`grade_notification_commit_failed:${response10.status}`);
  }
  async updateIntent(intent) {
    const path = `grade_notification_intents/${intent.eventId}`;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const current = await this.admin.readWithEtag(path);
      const old = current.data;
      if (!old || old.eventId !== intent.eventId || old.kind !== intent.kind || old.sessionCode !== intent.sessionCode || old.studentId !== intent.studentId || old.actorUid !== intent.actorUid || old.questionNumber !== intent.questionNumber || old.pointsEarned !== intent.pointsEarned || old.testTitle !== intent.testTitle || old.occurredAt !== intent.occurredAt) throw new Error("grade_notification_intent_identity_changed");
      if (old.state === "done" || old.state === "failed") return;
      if (await this.admin.writeIfMatch(path, intent, current.etag)) return;
    }
    throw new Error("grade_notification_intent_cas_failed");
  }
  async dueIntents(now, limit) {
    const values = await this.admin.readValue("grade_notification_intents", {
      orderBy: "dueAt",
      startAt: 0,
      limitToFirst: Math.min(2, Math.max(1, limit))
    });
    if (!values || typeof values !== "object" || Array.isArray(values)) return [];
    return Object.values(values).filter((intent) => intent?.kind === "individual-question-graded" && Number.isSafeInteger(intent.dueAt) && intent.dueAt <= now && (intent.attempts === 0 && ["pending", "sending"].includes(intent.state) || intent.attempts === 1 && ["retry_due"].includes(intent.state) || intent.attempts === 2 && ["retrying"].includes(intent.state)));
  }
  async claimRetry(eventId, now) {
    const path = `grade_notification_intents/${eventId}`;
    const current = await this.admin.readWithEtag(path);
    const intent = current.data;
    if (!intent || intent.eventId !== eventId || intent.kind !== "individual-question-graded" || intent.dueAt > now) return null;
    if (intent.attempts === 0 && ["pending", "sending"].includes(intent.state)) {
      const claimed2 = { ...intent, state: "sending", dueAt: now + 6e4 };
      return await this.admin.writeIfMatch(path, claimed2, current.etag) ? claimed2 : null;
    }
    if (intent.attempts === 2 && intent.state === "retrying") {
      const claimed2 = { ...intent, dueAt: now + 6e4 };
      return await this.admin.writeIfMatch(path, claimed2, current.etag) ? claimed2 : null;
    }
    if (intent.attempts !== 1 || intent.state !== "retry_due") return null;
    const claimed = { ...intent, attempts: 2, state: "retrying", dueAt: now + 6e4 };
    return await this.admin.writeIfMatch(path, claimed, current.etag) ? claimed : null;
  }
  async reportFailure(intent, now) {
    const id = `grade-notification-${intent.eventId}`;
    const path = `reports/errors/${new Date(now).toISOString().slice(0, 10)}/${id}`;
    const current = await this.admin.readWithEtag(path);
    if (current.data !== null) return;
    await this.admin.writeIfMatch(path, {
      id,
      timestamp: now,
      feature: "thcs-grading",
      severity: "error",
      message: "Individual THCS question grade notification failed after its retry.",
      userId: intent.actorUid,
      userName: "Notification Worker",
      userRole: "service",
      duplicateCount: 1,
      contextData: {
        eventId: intent.eventId,
        sessionCode: intent.sessionCode,
        studentId: intent.studentId,
        questionNumber: intent.questionNumber
      }
    }, current.etag);
  }
};
var ACTION_PATH9 = "/grading-notifications/manual";
var ALLOWED_ORIGINS10 = /* @__PURE__ */ new Set(["https://kahut1.web.app", "http://localhost:5173", "http://localhost:5174"]);
var required24 = /* @__PURE__ */ __name2((env, key) => {
  const value = env[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`missing_${key.toLowerCase()}`);
  return value.trim();
}, "required");
var response9 = /* @__PURE__ */ __name2((request, body, status) => {
  const headers2 = new Headers({
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    Vary: "Origin, Access-Control-Request-Method, Access-Control-Request-Headers"
  });
  const origin = request.headers.get("Origin");
  if (origin && ALLOWED_ORIGINS10.has(origin)) {
    headers2.set("Access-Control-Allow-Origin", origin);
    headers2.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    headers2.set("Access-Control-Allow-Headers", "Authorization, Content-Type, Idempotency-Key");
  }
  return new Response(JSON.stringify(body), { status, headers: headers2 });
}, "response");
var repositoryForEnv4 = /* @__PURE__ */ __name2((env) => new FirebaseRestNotificationCommandRepository({
  env: {
    FIREBASE_DB_URL: required24(env, "FIREBASE_DB_URL"),
    FIREBASE_PROJECT_ID: required24(env, "FIREBASE_PROJECT_ID"),
    NOTIFICATION_COMMAND_SERVICE_IDENTITY: required24(env, "NOTIFICATION_COMMAND_SERVICE_IDENTITY"),
    NOTIFICATION_COMMAND_GOOGLE_SA_KEY: required24(env, "NOTIFICATION_COMMAND_GOOGLE_SA_KEY")
  }
}), "repositoryForEnv");
var createGradeNotificationWorker = /* @__PURE__ */ __name2((options = {}) => {
  const verifier = options.firebaseVerifier ?? createFirebaseVerifier2();
  const repositoryFactory = options.repositoryFactory ?? repositoryForEnv4;
  const storageFactory = options.storageFactory ?? ((env) => new FirebaseGradeNotificationStorage(env));
  const now = options.now ?? Date.now;
  return {
    async fetch(request, env) {
      const url = new URL(request.url);
      if (url.pathname !== ACTION_PATH9 || url.search || url.hash) return response9(request, { code: "grade_notification_not_found" }, 404);
      const origin = request.headers.get("Origin");
      if (origin && !ALLOWED_ORIGINS10.has(origin)) return response9(request, { code: "cors_origin_denied" }, 403);
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: response9(request, {}, 200).headers });
      if (request.method !== "POST") return response9(request, { code: "method_not_allowed" }, 405);
      const auth = await verifier.verifyAuthorizationHeader(request.headers.get("Authorization"), env);
      if (!auth.valid || typeof auth.uid !== "string" || !auth.uid) return response9(request, { code: "grade_notification_unauthenticated" }, 401);
      const limiter = env.NOTIFICATION_RATE_LIMITER;
      if (!limiter || typeof limiter.limit !== "function") return response9(request, { code: "notification_command_unavailable" }, 503);
      if (!(await limiter.limit({ key: `manual-grade:${auth.uid}` })).success) return response9(request, { code: "rate_limited" }, 429);
      try {
        const command = await parseManualGradeCommand(request);
        const result = await performManualGradeAction({
          command,
          actorUid: auth.uid,
          storage: storageFactory(env),
          repository: repositoryFactory(env),
          now
        });
        return response9(request, result.body, result.status);
      } catch (error) {
        if (error instanceof Error && error.message.startsWith("grade_notification_")) {
          return response9(request, { code: error.message }, 400);
        }
        return response9(request, { code: "grade_notification_failed" }, 500);
      }
    }
  };
}, "createGradeNotificationWorker");
var retryDueGradeNotificationsForEnv = /* @__PURE__ */ __name2((env, now = Date.now) => retryDueGradeNotifications({
  storage: new FirebaseGradeNotificationStorage(env),
  repository: repositoryForEnv4(env),
  now
}), "retryDueGradeNotificationsForEnv");
var worker = createHomeworkSubmissionNotificationWorker();
var resultReviewWorker = createResultReviewNotificationWorker();
var feedbackWorker = createFeedbackNotificationWorker();
var courseAnnouncementWorker = createCourseAnnouncementNotificationWorker();
var homeworkResetWorker = createHomeworkResetNotificationWorker();
var thcsWorker = createThcsNotificationWorker();
var sessionWorker = createSessionNotificationActionWorker();
var writingWorker = createWritingNotificationWorker();
var testCompleteWorker = createTestCompleteNotificationWorker();
var gradeWorker = createGradeNotificationWorker();
var retryRepository = /* @__PURE__ */ __name2((env) => new FirebaseRestNotificationCommandRepository({ env }), "retryRepository");
var bulkRetryFamilies = [
  retryDueCourseAnnouncementNotifications,
  retryDueThcsNotificationsForEnv,
  retryDueSessionNotifications
];
var smallRetryFamilies = [
  retryDueClassNotifications,
  retryDueHomeworkNotifications,
  retryDueResultReviewNotifications,
  retryDueCourseTypeDecisionNotifications,
  retryDueClassNotifications,
  retryDueHomeworkNotifications,
  retryDueFeedbackNotifications,
  retryDueDeadlineNotifications,
  (env) => retryDueCourseRequestNotifications(
    new FirebaseCourseRequestNotificationStorage(env),
    retryRepository(env)
  ),
  (env) => retryDueAssignmentNotifications(
    new FirebaseAssignmentNotificationStorage(env),
    retryRepository(env)
  ),
  retryDueHomeworkResetNotifications,
  retryDueWritingNotificationsForEnv,
  retryDueTestCompleteNotificationsForEnv,
  retryDueGradeNotificationsForEnv
];
var firstBatchRetryFamilies = [
  retryDueClassNotifications,
  retryDueHomeworkNotifications,
  retryDueDeadlineNotifications,
  retryDueHomeworkResetNotifications
];
var notificationActionPaths = /* @__PURE__ */ new Set([
  "/book-notifications/commands",
  "/class-notifications/actions",
  "/notifications/course-type-decisions/dispatch",
  "/deadline-notifications/actions",
  "/enrollment-notifications/actions",
  "/assignment-notifications/actions",
  "/result-notifications/reviewed",
  "/feedback-notifications/actions",
  "/course-announcements/actions",
  "/homework-reset-notifications/actions",
  "/thcs-notifications/actions",
  "/session-notifications/action",
  "/writing-notifications/actions",
  "/test-complete-notifications/actions",
  "/grading-notifications/manual"
]);
var firstBatchActionPaths = /* @__PURE__ */ new Set([
  "/book-notifications/commands",
  "/class-notifications/actions",
  "/deadline-notifications/actions",
  "/homework-reset-notifications/actions"
]);
var allowedOrigins = /* @__PURE__ */ new Set([
  "https://kahut1.web.app",
  "https://hocthem.net",
  "http://localhost:5173",
  "http://localhost:5174"
]);
var gatedActionResponse = /* @__PURE__ */ __name2((request) => {
  const headers2 = new Headers({
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    Vary: "Origin, Access-Control-Request-Method, Access-Control-Request-Headers"
  });
  const origin = request.headers.get("Origin");
  if (origin && allowedOrigins.has(origin)) {
    headers2.set("Access-Control-Allow-Origin", origin);
    headers2.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    headers2.set("Access-Control-Allow-Headers", "Authorization, Content-Type, Idempotency-Key");
  }
  return new Response(JSON.stringify({ code: "notification_action_batch_inactive" }), { status: 503, headers: headers2 });
}, "gatedActionResponse");
var notification_command_worker_default = {
  fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (!["/book-notifications/commands", "/session-notifications/action", "/writing-notifications/actions", "/grading-notifications/manual"].includes(path)) {
      return new Response(null, { status: 404 });
    }
    if (request.method !== "OPTIONS" && notificationActionPaths.has(path)) {
      const batch = env.NOTIFICATION_RETRY_BATCH;
      if (batch !== "all" && !(batch === "class-homework" && firstBatchActionPaths.has(path))) {
        return gatedActionResponse(request);
      }
    }
    if (path === "/result-notifications/reviewed") {
      return resultReviewWorker.fetch(request, env);
    }
    if (path === "/feedback-notifications/actions") {
      return feedbackWorker.fetch(request, env);
    }
    if (path === "/course-announcements/actions") {
      return courseAnnouncementWorker.fetch(request, env);
    }
    if (path === "/homework-reset-notifications/actions") {
      return homeworkResetWorker.fetch(request, env);
    }
    if (path === "/thcs-notifications/actions") {
      return thcsWorker.fetch(request, env);
    }
    if (path === "/session-notifications/action") {
      return sessionWorker.fetch(request, env);
    }
    if (path === "/writing-notifications/actions") {
      return writingWorker.fetch(request, env);
    }
    if (path === "/test-complete-notifications/actions") {
      return testCompleteWorker.fetch(request, env);
    }
    if (path === "/grading-notifications/manual") {
      return gradeWorker.fetch(request, env);
    }
    return worker.fetch(request, env);
  },
  scheduled(event, env, context) {
    const bulk = event.cron === "* * * * *";
    const batch = env.NOTIFICATION_RETRY_BATCH;
    if (batch !== "class-homework" && batch !== "all") return;
    if (batch === "class-homework" && bulk) return;
    const activeSmallFamilies = batch === "class-homework" ? firstBatchRetryFamilies : smallRetryFamilies;
    const families = bulk ? bulkRetryFamilies : activeSmallFamilies;
    const minute22 = Math.floor(event.scheduledTime / 6e4);
    const slot = Math.floor(minute22 / (bulk ? 1 : 2)) % families.length;
    context.waitUntil(families[slot](env));
  }
};
var notificationBridge = createNotificationFirestoreBridge();
var NotificationBridgeObject = class {
  static {
    __name(this, "NotificationBridgeObject");
  }
  static {
    __name2(this, "NotificationBridgeObject");
  }
  constructor(_state, env) {
    this.env = env;
  }
  fetch(request) {
    return notificationBridge.fetch(request, this.env);
  }
};
export {
  NotificationBridgeObject,
  notification_command_worker_default as default
};
//# sourceMappingURL=notification-command-qualified.js.map
