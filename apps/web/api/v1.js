var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// node_modules/ethers/lib.esm/_version.js
var version;
var init_version = __esm({
  "node_modules/ethers/lib.esm/_version.js"() {
    version = "6.17.0";
  }
});

// node_modules/ethers/lib.esm/utils/properties.js
function checkType(value, type, name) {
  const types = type.split("|").map((t) => t.trim());
  for (let i = 0; i < types.length; i++) {
    switch (type) {
      case "any":
        return;
      case "bigint":
      case "boolean":
      case "number":
      case "string":
        if (typeof value === type) {
          return;
        }
    }
  }
  const error = new Error(`invalid value for type ${type}`);
  error.code = "INVALID_ARGUMENT";
  error.argument = `value.${name}`;
  error.value = value;
  throw error;
}
function defineProperties(target, values, types) {
  for (let key in values) {
    let value = values[key];
    const type = types ? types[key] : null;
    if (type) {
      checkType(value, type, key);
    }
    Object.defineProperty(target, key, { enumerable: true, value, writable: false });
  }
}
var init_properties = __esm({
  "node_modules/ethers/lib.esm/utils/properties.js"() {
  }
});

// node_modules/ethers/lib.esm/utils/errors.js
function stringify(value, seen) {
  if (value == null) {
    return "null";
  }
  if (seen == null) {
    seen = /* @__PURE__ */ new Set();
  }
  if (typeof value === "object") {
    if (seen.has(value)) {
      return "[Circular]";
    }
    seen.add(value);
  }
  if (Array.isArray(value)) {
    return "[ " + value.map((v) => stringify(v, seen)).join(", ") + " ]";
  }
  if (value instanceof Uint8Array) {
    const HEX = "0123456789abcdef";
    let result = "0x";
    for (let i = 0; i < value.length; i++) {
      result += HEX[value[i] >> 4];
      result += HEX[value[i] & 15];
    }
    return result;
  }
  if (typeof value === "object" && typeof value.toJSON === "function") {
    return stringify(value.toJSON(), seen);
  }
  switch (typeof value) {
    case "boolean":
    case "number":
    case "symbol":
      return value.toString();
    case "bigint":
      return BigInt(value).toString();
    case "string":
      return JSON.stringify(value);
    case "object": {
      const keys = Object.keys(value);
      keys.sort();
      return "{ " + keys.map((k) => `${stringify(k, seen)}: ${stringify(value[k], seen)}`).join(", ") + " }";
    }
  }
  return `[ COULD NOT SERIALIZE ]`;
}
function isError(error, code) {
  return error && error.code === code;
}
function makeError(message, code, info) {
  let shortMessage = message;
  {
    const details = [];
    if (info) {
      if ("message" in info || "code" in info || "name" in info) {
        throw new Error(`value will overwrite populated values: ${stringify(info)}`);
      }
      for (const key in info) {
        if (key === "shortMessage") {
          continue;
        }
        const value = info[key];
        details.push(key + "=" + stringify(value));
      }
    }
    details.push(`code=${code}`);
    details.push(`version=${version}`);
    if (details.length) {
      message += " (" + details.join(", ") + ")";
    }
  }
  let error;
  switch (code) {
    case "INVALID_ARGUMENT":
      error = new TypeError(message);
      break;
    case "NUMERIC_FAULT":
    case "BUFFER_OVERRUN":
      error = new RangeError(message);
      break;
    default:
      error = new Error(message);
  }
  defineProperties(error, { code });
  if (info) {
    Object.assign(error, info);
  }
  if (error.shortMessage == null) {
    defineProperties(error, { shortMessage });
  }
  return error;
}
function assert(check, message, code, info) {
  if (!check) {
    throw makeError(message, code, info);
  }
}
function assertArgument(check, message, name, value) {
  assert(check, message, "INVALID_ARGUMENT", { argument: name, value });
}
function assertArgumentCount(count, expectedCount, message) {
  if (message == null) {
    message = "";
  }
  if (message) {
    message = ": " + message;
  }
  assert(count >= expectedCount, "missing argument" + message, "MISSING_ARGUMENT", {
    count,
    expectedCount
  });
  assert(count <= expectedCount, "too many arguments" + message, "UNEXPECTED_ARGUMENT", {
    count,
    expectedCount
  });
}
function assertNormalize(form) {
  assert(_normalizeForms.indexOf(form) >= 0, "platform missing String.prototype.normalize", "UNSUPPORTED_OPERATION", {
    operation: "String.prototype.normalize",
    info: { form }
  });
}
function assertPrivate(givenGuard, guard, className) {
  if (className == null) {
    className = "";
  }
  if (givenGuard !== guard) {
    let method = className, operation = "new";
    if (className) {
      method += ".";
      operation += " " + className;
    }
    assert(false, `private constructor; use ${method}from* methods`, "UNSUPPORTED_OPERATION", {
      operation
    });
  }
}
var _normalizeForms;
var init_errors = __esm({
  "node_modules/ethers/lib.esm/utils/errors.js"() {
    init_version();
    init_properties();
    _normalizeForms = ["NFD", "NFC", "NFKD", "NFKC"].reduce((accum, form) => {
      try {
        if ("test".normalize(form) !== "test") {
          throw new Error("bad");
        }
        ;
        if (form === "NFD") {
          const check = String.fromCharCode(233).normalize("NFD");
          const expected = String.fromCharCode(101, 769);
          if (check !== expected) {
            throw new Error("broken");
          }
        }
        accum.push(form);
      } catch (error) {
      }
      return accum;
    }, []);
  }
});

// node_modules/ethers/lib.esm/utils/data.js
function _getBytes(value, name, copy) {
  if (value instanceof Uint8Array) {
    if (copy) {
      return new Uint8Array(value);
    }
    return value;
  }
  if (typeof value === "string" && value.length % 2 === 0 && value.match(/^0x[0-9a-f]*$/i)) {
    const result = new Uint8Array((value.length - 2) / 2);
    let offset = 2;
    for (let i = 0; i < result.length; i++) {
      result[i] = parseInt(value.substring(offset, offset + 2), 16);
      offset += 2;
    }
    return result;
  }
  assertArgument(false, "invalid BytesLike value", name || "value", value);
}
function getBytes(value, name) {
  return _getBytes(value, name, false);
}
function getBytesCopy(value, name) {
  return _getBytes(value, name, true);
}
function isHexString(value, length) {
  if (typeof value !== "string" || !value.match(/^0x[0-9A-Fa-f]*$/)) {
    return false;
  }
  if (typeof length === "number" && value.length !== 2 + 2 * length) {
    return false;
  }
  if (length === true && value.length % 2 !== 0) {
    return false;
  }
  return true;
}
function isBytesLike(value) {
  return isHexString(value, true) || value instanceof Uint8Array;
}
function hexlify(data) {
  const bytes2 = getBytes(data);
  let result = "0x";
  for (let i = 0; i < bytes2.length; i++) {
    const v = bytes2[i];
    result += HexCharacters[(v & 240) >> 4] + HexCharacters[v & 15];
  }
  return result;
}
function concat(datas) {
  return "0x" + datas.map((d) => hexlify(d).substring(2)).join("");
}
function dataLength(data) {
  if (isHexString(data, true)) {
    return (data.length - 2) / 2;
  }
  return getBytes(data).length;
}
function dataSlice(data, start, end) {
  const bytes2 = getBytes(data);
  if (end != null && end > bytes2.length) {
    assert(false, "cannot slice beyond data bounds", "BUFFER_OVERRUN", {
      buffer: bytes2,
      length: bytes2.length,
      offset: end
    });
  }
  return hexlify(bytes2.slice(start == null ? 0 : start, end == null ? bytes2.length : end));
}
function zeroPad(data, length, left) {
  const bytes2 = getBytes(data);
  assert(length >= bytes2.length, "padding exceeds data length", "BUFFER_OVERRUN", {
    buffer: new Uint8Array(bytes2),
    length,
    offset: length + 1
  });
  const result = new Uint8Array(length);
  result.fill(0);
  if (left) {
    result.set(bytes2, length - bytes2.length);
  } else {
    result.set(bytes2, 0);
  }
  return hexlify(result);
}
function zeroPadValue(data, length) {
  return zeroPad(data, length, true);
}
function zeroPadBytes(data, length) {
  return zeroPad(data, length, false);
}
var HexCharacters;
var init_data = __esm({
  "node_modules/ethers/lib.esm/utils/data.js"() {
    init_errors();
    HexCharacters = "0123456789abcdef";
  }
});

// node_modules/ethers/lib.esm/utils/maths.js
function fromTwos(_value, _width) {
  const value = getUint(_value, "value");
  const width = BigInt(getNumber(_width, "width"));
  assert(value >> width === BN_0, "overflow", "NUMERIC_FAULT", {
    operation: "fromTwos",
    fault: "overflow",
    value: _value
  });
  if (value >> width - BN_1) {
    const mask2 = (BN_1 << width) - BN_1;
    return -((~value & mask2) + BN_1);
  }
  return value;
}
function toTwos(_value, _width) {
  let value = getBigInt(_value, "value");
  const width = BigInt(getNumber(_width, "width"));
  const limit = BN_1 << width - BN_1;
  if (value < BN_0) {
    value = -value;
    assert(value <= limit, "too low", "NUMERIC_FAULT", {
      operation: "toTwos",
      fault: "overflow",
      value: _value
    });
    const mask2 = (BN_1 << width) - BN_1;
    return (~value & mask2) + BN_1;
  } else {
    assert(value < limit, "too high", "NUMERIC_FAULT", {
      operation: "toTwos",
      fault: "overflow",
      value: _value
    });
  }
  return value;
}
function mask(_value, _bits) {
  const value = getUint(_value, "value");
  const bits = BigInt(getNumber(_bits, "bits"));
  return value & (BN_1 << bits) - BN_1;
}
function getBigInt(value, name) {
  switch (typeof value) {
    case "bigint":
      return value;
    case "number":
      assertArgument(Number.isInteger(value), "underflow", name || "value", value);
      assertArgument(value >= -maxValue && value <= maxValue, "overflow", name || "value", value);
      return BigInt(value);
    case "string":
      try {
        if (value === "") {
          throw new Error("empty string");
        }
        if (value[0] === "-" && value[1] !== "-") {
          return -BigInt(value.substring(1));
        }
        return BigInt(value);
      } catch (e) {
        assertArgument(false, `invalid BigNumberish string: ${e.message}`, name || "value", value);
      }
  }
  assertArgument(false, "invalid BigNumberish value", name || "value", value);
}
function getUint(value, name) {
  const result = getBigInt(value, name);
  assert(result >= BN_0, "unsigned value cannot be negative", "NUMERIC_FAULT", {
    fault: "overflow",
    operation: "getUint",
    value
  });
  return result;
}
function toBigInt(value) {
  if (value instanceof Uint8Array) {
    let result = "0x0";
    for (const v of value) {
      result += Nibbles[v >> 4];
      result += Nibbles[v & 15];
    }
    return BigInt(result);
  }
  return getBigInt(value);
}
function getNumber(value, name) {
  switch (typeof value) {
    case "bigint":
      assertArgument(value >= -maxValue && value <= maxValue, "overflow", name || "value", value);
      return Number(value);
    case "number":
      assertArgument(Number.isInteger(value), "underflow", name || "value", value);
      assertArgument(value >= -maxValue && value <= maxValue, "overflow", name || "value", value);
      return value;
    case "string":
      try {
        if (value === "") {
          throw new Error("empty string");
        }
        return getNumber(BigInt(value), name);
      } catch (e) {
        assertArgument(false, `invalid numeric string: ${e.message}`, name || "value", value);
      }
  }
  assertArgument(false, "invalid numeric value", name || "value", value);
}
function toNumber(value) {
  return getNumber(toBigInt(value));
}
function toBeHex(_value, _width) {
  const value = getUint(_value, "value");
  let result = value.toString(16);
  if (_width == null) {
    if (result.length % 2) {
      result = "0" + result;
    }
  } else {
    const width = getNumber(_width, "width");
    if (width === 0 && value === BN_0) {
      return "0x";
    }
    assert(width * 2 >= result.length, `value exceeds width (${width} bytes)`, "NUMERIC_FAULT", {
      operation: "toBeHex",
      fault: "overflow",
      value: _value
    });
    while (result.length < width * 2) {
      result = "0" + result;
    }
  }
  return "0x" + result;
}
function toBeArray(_value, _width) {
  const value = getUint(_value, "value");
  if (value === BN_0) {
    const width = _width != null ? getNumber(_width, "width") : 0;
    return new Uint8Array(width);
  }
  let hex = value.toString(16);
  if (hex.length % 2) {
    hex = "0" + hex;
  }
  if (_width != null) {
    const width = getNumber(_width, "width");
    while (hex.length < width * 2) {
      hex = "00" + hex;
    }
    assert(width * 2 === hex.length, `value exceeds width (${width} bytes)`, "NUMERIC_FAULT", {
      operation: "toBeArray",
      fault: "overflow",
      value: _value
    });
  }
  const result = new Uint8Array(hex.length / 2);
  for (let i = 0; i < result.length; i++) {
    const offset = i * 2;
    result[i] = parseInt(hex.substring(offset, offset + 2), 16);
  }
  return result;
}
function toQuantity(value) {
  let result = hexlify(isBytesLike(value) ? value : toBeArray(value)).substring(2);
  while (result.startsWith("0")) {
    result = result.substring(1);
  }
  if (result === "") {
    result = "0";
  }
  return "0x" + result;
}
var BN_0, BN_1, maxValue, Nibbles;
var init_maths = __esm({
  "node_modules/ethers/lib.esm/utils/maths.js"() {
    init_data();
    init_errors();
    BN_0 = BigInt(0);
    BN_1 = BigInt(1);
    maxValue = 9007199254740991;
    Nibbles = "0123456789abcdef";
  }
});

// node_modules/ethers/lib.esm/utils/utf8.js
function errorFunc(reason, offset, bytes2, output2, badCodepoint) {
  assertArgument(false, `invalid codepoint at offset ${offset}; ${reason}`, "bytes", bytes2);
}
function ignoreFunc(reason, offset, bytes2, output2, badCodepoint) {
  if (reason === "BAD_PREFIX" || reason === "UNEXPECTED_CONTINUE") {
    let i = 0;
    for (let o = offset + 1; o < bytes2.length; o++) {
      if (bytes2[o] >> 6 !== 2) {
        break;
      }
      i++;
    }
    return i;
  }
  if (reason === "OVERRUN") {
    return bytes2.length - offset - 1;
  }
  return 0;
}
function replaceFunc(reason, offset, bytes2, output2, badCodepoint) {
  if (reason === "OVERLONG") {
    assertArgument(typeof badCodepoint === "number", "invalid bad code point for replacement", "badCodepoint", badCodepoint);
    output2.push(badCodepoint);
    return 0;
  }
  output2.push(65533);
  return ignoreFunc(reason, offset, bytes2, output2, badCodepoint);
}
function getUtf8CodePoints(_bytes, onError) {
  if (onError == null) {
    onError = Utf8ErrorFuncs.error;
  }
  const bytes2 = getBytes(_bytes, "bytes");
  const result = [];
  let i = 0;
  while (i < bytes2.length) {
    const c = bytes2[i++];
    if (c >> 7 === 0) {
      result.push(c);
      continue;
    }
    let extraLength = null;
    let overlongMask = null;
    if ((c & 224) === 192) {
      extraLength = 1;
      overlongMask = 127;
    } else if ((c & 240) === 224) {
      extraLength = 2;
      overlongMask = 2047;
    } else if ((c & 248) === 240) {
      extraLength = 3;
      overlongMask = 65535;
    } else {
      if ((c & 192) === 128) {
        i += onError("UNEXPECTED_CONTINUE", i - 1, bytes2, result);
      } else {
        i += onError("BAD_PREFIX", i - 1, bytes2, result);
      }
      continue;
    }
    if (i - 1 + extraLength >= bytes2.length) {
      i += onError("OVERRUN", i - 1, bytes2, result);
      continue;
    }
    let res = c & (1 << 8 - extraLength - 1) - 1;
    for (let j = 0; j < extraLength; j++) {
      let nextChar = bytes2[i];
      if ((nextChar & 192) != 128) {
        i += onError("MISSING_CONTINUE", i, bytes2, result);
        res = null;
        break;
      }
      ;
      res = res << 6 | nextChar & 63;
      i++;
    }
    if (res === null) {
      continue;
    }
    if (res > 1114111) {
      i += onError("OUT_OF_RANGE", i - 1 - extraLength, bytes2, result, res);
      continue;
    }
    if (res >= 55296 && res <= 57343) {
      i += onError("UTF16_SURROGATE", i - 1 - extraLength, bytes2, result, res);
      continue;
    }
    if (res <= overlongMask) {
      i += onError("OVERLONG", i - 1 - extraLength, bytes2, result, res);
      continue;
    }
    result.push(res);
  }
  return result;
}
function toUtf8Bytes(str, form) {
  assertArgument(typeof str === "string", "invalid string value", "str", str);
  if (form != null) {
    assertNormalize(form);
    str = str.normalize(form);
  }
  let result = [];
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    if (c < 128) {
      result.push(c);
    } else if (c < 2048) {
      result.push(c >> 6 | 192);
      result.push(c & 63 | 128);
    } else if ((c & 64512) == 55296) {
      i++;
      const c2 = str.charCodeAt(i);
      assertArgument(i < str.length && (c2 & 64512) === 56320, "invalid surrogate pair", "str", str);
      const pair = 65536 + ((c & 1023) << 10) + (c2 & 1023);
      result.push(pair >> 18 | 240);
      result.push(pair >> 12 & 63 | 128);
      result.push(pair >> 6 & 63 | 128);
      result.push(pair & 63 | 128);
    } else {
      result.push(c >> 12 | 224);
      result.push(c >> 6 & 63 | 128);
      result.push(c & 63 | 128);
    }
  }
  return new Uint8Array(result);
}
function _toUtf8String(codePoints) {
  return codePoints.map((codePoint) => {
    if (codePoint <= 65535) {
      return String.fromCharCode(codePoint);
    }
    codePoint -= 65536;
    return String.fromCharCode((codePoint >> 10 & 1023) + 55296, (codePoint & 1023) + 56320);
  }).join("");
}
function toUtf8String(bytes2, onError) {
  return _toUtf8String(getUtf8CodePoints(bytes2, onError));
}
var Utf8ErrorFuncs;
var init_utf8 = __esm({
  "node_modules/ethers/lib.esm/utils/utf8.js"() {
    init_data();
    init_errors();
    Utf8ErrorFuncs = Object.freeze({
      error: errorFunc,
      ignore: ignoreFunc,
      replace: replaceFunc
    });
  }
});

// node_modules/ethers/lib.esm/utils/index.js
var init_utils = __esm({
  "node_modules/ethers/lib.esm/utils/index.js"() {
    init_data();
    init_errors();
    init_maths();
    init_properties();
    init_utf8();
  }
});

// node_modules/ethers/lib.esm/abi/coders/abstract-coder.js
function getNames(result) {
  return resultNames.get(result);
}
function setNames(result, names) {
  resultNames.set(result, names);
}
function throwError(name, error) {
  const wrapped = new Error(`deferred error during ABI decoding triggered accessing ${name}`);
  wrapped.error = error;
  throw wrapped;
}
function toObject(names, items, deep) {
  if (names.indexOf(null) >= 0) {
    return items.map((item, index) => {
      if (item instanceof Result) {
        return toObject(getNames(item), item, deep);
      }
      return item;
    });
  }
  return names.reduce((accum, name, index) => {
    let item = items.getValue(name);
    if (!(name in accum)) {
      if (deep && item instanceof Result) {
        item = toObject(getNames(item), item, deep);
      }
      accum[name] = item;
    }
    return accum;
  }, {});
}
function getValue(value) {
  let bytes2 = toBeArray(value);
  assert(bytes2.length <= WordSize, "value out-of-bounds", "BUFFER_OVERRUN", { buffer: bytes2, length: WordSize, offset: bytes2.length });
  if (bytes2.length !== WordSize) {
    bytes2 = getBytesCopy(concat([Padding.slice(bytes2.length % WordSize), bytes2]));
  }
  return bytes2;
}
var WordSize, Padding, passProperties, _guard, resultNames, Result, Coder, Writer, Reader;
var init_abstract_coder = __esm({
  "node_modules/ethers/lib.esm/abi/coders/abstract-coder.js"() {
    init_utils();
    WordSize = 32;
    Padding = new Uint8Array(WordSize);
    passProperties = ["then"];
    _guard = {};
    resultNames = /* @__PURE__ */ new WeakMap();
    Result = class _Result extends Array {
      // No longer used; but cannot be removed as it will remove the
      // #private field from the .d.ts which may break backwards
      // compatibility
      #names;
      /**
       *  @private
       */
      constructor(...args) {
        const guard = args[0];
        let items = args[1];
        let names = (args[2] || []).slice();
        let wrap = true;
        if (guard !== _guard) {
          items = args;
          names = [];
          wrap = false;
        }
        super(items.length);
        items.forEach((item, index) => {
          this[index] = item;
        });
        const nameCounts = names.reduce((accum, name) => {
          if (typeof name === "string") {
            accum.set(name, (accum.get(name) || 0) + 1);
          }
          return accum;
        }, /* @__PURE__ */ new Map());
        setNames(this, Object.freeze(items.map((item, index) => {
          const name = names[index];
          if (name != null && nameCounts.get(name) === 1) {
            return name;
          }
          return null;
        })));
        this.#names = [];
        if (this.#names == null) {
          void this.#names;
        }
        if (!wrap) {
          return;
        }
        Object.freeze(this);
        const proxy = new Proxy(this, {
          get: (target, prop, receiver) => {
            if (typeof prop === "string") {
              if (prop.match(/^[0-9]+$/)) {
                const index = getNumber(prop, "%index");
                if (index < 0 || index >= this.length) {
                  throw new RangeError("out of result range");
                }
                const item = target[index];
                if (item instanceof Error) {
                  throwError(`index ${index}`, item);
                }
                return item;
              }
              if (passProperties.indexOf(prop) >= 0) {
                return Reflect.get(target, prop, receiver);
              }
              const value = target[prop];
              if (value instanceof Function) {
                return function(...args2) {
                  return value.apply(this === receiver ? target : this, args2);
                };
              } else if (!(prop in target)) {
                return target.getValue.apply(this === receiver ? target : this, [prop]);
              }
            }
            return Reflect.get(target, prop, receiver);
          }
        });
        setNames(proxy, getNames(this));
        return proxy;
      }
      /**
       *  Returns the Result as a normal Array. If %%deep%%, any children
       *  which are Result objects are also converted to a normal Array.
       *
       *  This will throw if there are any outstanding deferred
       *  errors.
       */
      toArray(deep) {
        const result = [];
        this.forEach((item, index) => {
          if (item instanceof Error) {
            throwError(`index ${index}`, item);
          }
          if (deep && item instanceof _Result) {
            item = item.toArray(deep);
          }
          result.push(item);
        });
        return result;
      }
      /**
       *  Returns the Result as an Object with each name-value pair. If
       *  %%deep%%, any children which are Result objects are also
       *  converted to an Object.
       *
       *  This will throw if any value is unnamed, or if there are
       *  any outstanding deferred errors.
       */
      toObject(deep) {
        const names = getNames(this);
        return names.reduce((accum, name, index) => {
          assert(name != null, `value at index ${index} unnamed`, "UNSUPPORTED_OPERATION", {
            operation: "toObject()"
          });
          return toObject(names, this, deep);
        }, {});
      }
      /**
       *  @_ignore
       */
      slice(start, end) {
        if (start == null) {
          start = 0;
        }
        if (start < 0) {
          start += this.length;
          if (start < 0) {
            start = 0;
          }
        }
        if (end == null) {
          end = this.length;
        }
        if (end < 0) {
          end += this.length;
          if (end < 0) {
            end = 0;
          }
        }
        if (end > this.length) {
          end = this.length;
        }
        const _names = getNames(this);
        const result = [], names = [];
        for (let i = start; i < end; i++) {
          result.push(this[i]);
          names.push(_names[i]);
        }
        return new _Result(_guard, result, names);
      }
      /**
       *  @_ignore
       */
      filter(callback, thisArg) {
        const _names = getNames(this);
        const result = [], names = [];
        for (let i = 0; i < this.length; i++) {
          const item = this[i];
          if (item instanceof Error) {
            throwError(`index ${i}`, item);
          }
          if (callback.call(thisArg, item, i, this)) {
            result.push(item);
            names.push(_names[i]);
          }
        }
        return new _Result(_guard, result, names);
      }
      /**
       *  @_ignore
       */
      map(callback, thisArg) {
        const result = [];
        for (let i = 0; i < this.length; i++) {
          const item = this[i];
          if (item instanceof Error) {
            throwError(`index ${i}`, item);
          }
          result.push(callback.call(thisArg, item, i, this));
        }
        return result;
      }
      /**
       *  Returns the value for %%name%%.
       *
       *  Since it is possible to have a key whose name conflicts with
       *  a method on a [[Result]] or its superclass Array, or any
       *  JavaScript keyword, this ensures all named values are still
       *  accessible by name.
       */
      getValue(name) {
        const index = getNames(this).indexOf(name);
        if (index === -1) {
          return void 0;
        }
        const value = this[index];
        if (value instanceof Error) {
          throwError(`property ${JSON.stringify(name)}`, value.error);
        }
        return value;
      }
      /**
       *  Creates a new [[Result]] for %%items%% with each entry
       *  also accessible by its corresponding name in %%keys%%.
       */
      static fromItems(items, keys) {
        return new _Result(_guard, items, keys);
      }
    };
    Coder = class {
      // The coder name:
      //   - address, uint256, tuple, array, etc.
      name;
      // The fully expanded type, including composite types:
      //   - address, uint256, tuple(address,bytes), uint256[3][4][],  etc.
      type;
      // The localName bound in the signature, in this example it is "baz":
      //   - tuple(address foo, uint bar) baz
      localName;
      // Whether this type is dynamic:
      //  - Dynamic: bytes, string, address[], tuple(boolean[]), etc.
      //  - Not Dynamic: address, uint256, boolean[3], tuple(address, uint8)
      dynamic;
      constructor(name, type, localName, dynamic) {
        defineProperties(this, { name, type, localName, dynamic }, {
          name: "string",
          type: "string",
          localName: "string",
          dynamic: "boolean"
        });
      }
      _throwError(message, value) {
        assertArgument(false, message, this.localName, value);
      }
    };
    Writer = class {
      // An array of WordSize lengthed objects to concatenation
      #data;
      #dataLength;
      constructor() {
        this.#data = [];
        this.#dataLength = 0;
      }
      get data() {
        return concat(this.#data);
      }
      get length() {
        return this.#dataLength;
      }
      #writeData(data) {
        this.#data.push(data);
        this.#dataLength += data.length;
        return data.length;
      }
      appendWriter(writer) {
        return this.#writeData(getBytesCopy(writer.data));
      }
      // Arrayish item; pad on the right to *nearest* WordSize
      writeBytes(value) {
        let bytes2 = getBytesCopy(value);
        const paddingOffset = bytes2.length % WordSize;
        if (paddingOffset) {
          bytes2 = getBytesCopy(concat([bytes2, Padding.slice(paddingOffset)]));
        }
        return this.#writeData(bytes2);
      }
      // Numeric item; pad on the left *to* WordSize
      writeValue(value) {
        return this.#writeData(getValue(value));
      }
      // Inserts a numeric place-holder, returning a callback that can
      // be used to asjust the value later
      writeUpdatableValue() {
        const offset = this.#data.length;
        this.#data.push(Padding);
        this.#dataLength += WordSize;
        return (value) => {
          this.#data[offset] = getValue(value);
        };
      }
    };
    Reader = class _Reader {
      // Allows incomplete unpadded data to be read; otherwise an error
      // is raised if attempting to overrun the buffer. This is required
      // to deal with an old Solidity bug, in which event data for
      // external (not public thoguh) was tightly packed.
      allowLoose;
      #data;
      #offset;
      #bytesRead;
      #parent;
      #maxInflation;
      constructor(data, allowLoose, maxInflation) {
        defineProperties(this, { allowLoose: !!allowLoose });
        this.#data = getBytesCopy(data);
        this.#bytesRead = 0;
        this.#parent = null;
        this.#maxInflation = maxInflation != null ? maxInflation : 1024;
        this.#offset = 0;
      }
      get data() {
        return hexlify(this.#data);
      }
      get dataLength() {
        return this.#data.length;
      }
      get consumed() {
        return this.#offset;
      }
      get bytes() {
        return new Uint8Array(this.#data);
      }
      #incrementBytesRead(count) {
        if (this.#parent) {
          return this.#parent.#incrementBytesRead(count);
        }
        this.#bytesRead += count;
        assert(this.#maxInflation < 1 || this.#bytesRead <= this.#maxInflation * this.dataLength, `compressed ABI data exceeds inflation ratio of ${this.#maxInflation} ( see: https://github.com/ethers-io/ethers.js/issues/4537 )`, "BUFFER_OVERRUN", {
          buffer: getBytesCopy(this.#data),
          offset: this.#offset,
          length: count,
          info: {
            bytesRead: this.#bytesRead,
            dataLength: this.dataLength
          }
        });
      }
      #peekBytes(offset, length, loose) {
        let alignedLength = Math.ceil(length / WordSize) * WordSize;
        if (this.#offset + alignedLength > this.#data.length) {
          if (this.allowLoose && loose && this.#offset + length <= this.#data.length) {
            alignedLength = length;
          } else {
            assert(false, "data out-of-bounds", "BUFFER_OVERRUN", {
              buffer: getBytesCopy(this.#data),
              length: this.#data.length,
              offset: this.#offset + alignedLength
            });
          }
        }
        return this.#data.slice(this.#offset, this.#offset + alignedLength);
      }
      // Create a sub-reader with the same underlying data, but offset
      subReader(offset) {
        const reader = new _Reader(this.#data.slice(this.#offset + offset), this.allowLoose, this.#maxInflation);
        reader.#parent = this;
        return reader;
      }
      // Read bytes
      readBytes(length, loose) {
        let bytes2 = this.#peekBytes(0, length, !!loose);
        this.#incrementBytesRead(length);
        this.#offset += bytes2.length;
        return bytes2.slice(0, length);
      }
      // Read a numeric values
      readValue() {
        return toBigInt(this.readBytes(WordSize));
      }
      readIndex() {
        return toNumber(this.readBytes(WordSize));
      }
    };
  }
});

// node_modules/@noble/hashes/esm/_assert.js
function number(n2) {
  if (!Number.isSafeInteger(n2) || n2 < 0)
    throw new Error(`Wrong positive integer: ${n2}`);
}
function bytes(b2, ...lengths) {
  if (!(b2 instanceof Uint8Array))
    throw new Error("Expected Uint8Array");
  if (lengths.length > 0 && !lengths.includes(b2.length))
    throw new Error(`Expected Uint8Array of length ${lengths}, not of length=${b2.length}`);
}
function hash(hash4) {
  if (typeof hash4 !== "function" || typeof hash4.create !== "function")
    throw new Error("Hash should be wrapped by utils.wrapConstructor");
  number(hash4.outputLen);
  number(hash4.blockLen);
}
function exists(instance, checkFinished = true) {
  if (instance.destroyed)
    throw new Error("Hash instance has been destroyed");
  if (checkFinished && instance.finished)
    throw new Error("Hash#digest() has already been called");
}
function output(out, instance) {
  bytes(out);
  const min = instance.outputLen;
  if (out.length < min) {
    throw new Error(`digestInto() expects output buffer of length at least ${min}`);
  }
}
var init_assert = __esm({
  "node_modules/@noble/hashes/esm/_assert.js"() {
  }
});

// node_modules/@noble/hashes/esm/_u64.js
function fromBig(n2, le = false) {
  if (le)
    return { h: Number(n2 & U32_MASK64), l: Number(n2 >> _32n & U32_MASK64) };
  return { h: Number(n2 >> _32n & U32_MASK64) | 0, l: Number(n2 & U32_MASK64) | 0 };
}
function split(lst, le = false) {
  let Ah = new Uint32Array(lst.length);
  let Al = new Uint32Array(lst.length);
  for (let i = 0; i < lst.length; i++) {
    const { h, l } = fromBig(lst[i], le);
    [Ah[i], Al[i]] = [h, l];
  }
  return [Ah, Al];
}
var U32_MASK64, _32n, rotlSH, rotlSL, rotlBH, rotlBL;
var init_u64 = __esm({
  "node_modules/@noble/hashes/esm/_u64.js"() {
    U32_MASK64 = /* @__PURE__ */ BigInt(2 ** 32 - 1);
    _32n = /* @__PURE__ */ BigInt(32);
    rotlSH = (h, l, s) => h << s | l >>> 32 - s;
    rotlSL = (h, l, s) => l << s | h >>> 32 - s;
    rotlBH = (h, l, s) => l << s - 32 | h >>> 64 - s;
    rotlBL = (h, l, s) => h << s - 32 | l >>> 64 - s;
  }
});

// node_modules/@noble/hashes/esm/cryptoNode.js
import * as nc from "node:crypto";
var crypto;
var init_cryptoNode = __esm({
  "node_modules/@noble/hashes/esm/cryptoNode.js"() {
    crypto = nc && typeof nc === "object" && "webcrypto" in nc ? nc.webcrypto : void 0;
  }
});

// node_modules/@noble/hashes/esm/utils.js
function utf8ToBytes(str) {
  if (typeof str !== "string")
    throw new Error(`utf8ToBytes expected string, got ${typeof str}`);
  return new Uint8Array(new TextEncoder().encode(str));
}
function toBytes(data) {
  if (typeof data === "string")
    data = utf8ToBytes(data);
  if (!u8a(data))
    throw new Error(`expected Uint8Array, got ${typeof data}`);
  return data;
}
function concatBytes(...arrays) {
  const r = new Uint8Array(arrays.reduce((sum, a) => sum + a.length, 0));
  let pad = 0;
  arrays.forEach((a) => {
    if (!u8a(a))
      throw new Error("Uint8Array expected");
    r.set(a, pad);
    pad += a.length;
  });
  return r;
}
function wrapConstructor(hashCons) {
  const hashC = (msg) => hashCons().update(toBytes(msg)).digest();
  const tmp = hashCons();
  hashC.outputLen = tmp.outputLen;
  hashC.blockLen = tmp.blockLen;
  hashC.create = () => hashCons();
  return hashC;
}
function wrapXOFConstructorWithOpts(hashCons) {
  const hashC = (msg, opts) => hashCons(opts).update(toBytes(msg)).digest();
  const tmp = hashCons({});
  hashC.outputLen = tmp.outputLen;
  hashC.blockLen = tmp.blockLen;
  hashC.create = (opts) => hashCons(opts);
  return hashC;
}
function randomBytes(bytesLength = 32) {
  if (crypto && typeof crypto.getRandomValues === "function") {
    return crypto.getRandomValues(new Uint8Array(bytesLength));
  }
  throw new Error("crypto.getRandomValues must be defined");
}
var u8a, u32, createView, rotr, isLE, Hash, toStr;
var init_utils2 = __esm({
  "node_modules/@noble/hashes/esm/utils.js"() {
    init_cryptoNode();
    u8a = (a) => a instanceof Uint8Array;
    u32 = (arr) => new Uint32Array(arr.buffer, arr.byteOffset, Math.floor(arr.byteLength / 4));
    createView = (arr) => new DataView(arr.buffer, arr.byteOffset, arr.byteLength);
    rotr = (word, shift) => word << 32 - shift | word >>> shift;
    isLE = new Uint8Array(new Uint32Array([287454020]).buffer)[0] === 68;
    if (!isLE)
      throw new Error("Non little-endian hardware is not supported");
    Hash = class {
      // Safe version that clones internal state
      clone() {
        return this._cloneInto();
      }
    };
    toStr = {}.toString;
  }
});

// node_modules/@noble/hashes/esm/sha3.js
function keccakP(s, rounds = 24) {
  const B = new Uint32Array(5 * 2);
  for (let round = 24 - rounds; round < 24; round++) {
    for (let x = 0; x < 10; x++)
      B[x] = s[x] ^ s[x + 10] ^ s[x + 20] ^ s[x + 30] ^ s[x + 40];
    for (let x = 0; x < 10; x += 2) {
      const idx1 = (x + 8) % 10;
      const idx0 = (x + 2) % 10;
      const B0 = B[idx0];
      const B1 = B[idx0 + 1];
      const Th = rotlH(B0, B1, 1) ^ B[idx1];
      const Tl = rotlL(B0, B1, 1) ^ B[idx1 + 1];
      for (let y = 0; y < 50; y += 10) {
        s[x + y] ^= Th;
        s[x + y + 1] ^= Tl;
      }
    }
    let curH = s[2];
    let curL = s[3];
    for (let t = 0; t < 24; t++) {
      const shift = SHA3_ROTL[t];
      const Th = rotlH(curH, curL, shift);
      const Tl = rotlL(curH, curL, shift);
      const PI = SHA3_PI[t];
      curH = s[PI];
      curL = s[PI + 1];
      s[PI] = Th;
      s[PI + 1] = Tl;
    }
    for (let y = 0; y < 50; y += 10) {
      for (let x = 0; x < 10; x++)
        B[x] = s[y + x];
      for (let x = 0; x < 10; x++)
        s[y + x] ^= ~B[(x + 2) % 10] & B[(x + 4) % 10];
    }
    s[0] ^= SHA3_IOTA_H[round];
    s[1] ^= SHA3_IOTA_L[round];
  }
  B.fill(0);
}
var SHA3_PI, SHA3_ROTL, _SHA3_IOTA, _0n, _1n, _2n, _7n, _256n, _0x71n, SHA3_IOTA_H, SHA3_IOTA_L, rotlH, rotlL, Keccak, gen, sha3_224, sha3_256, sha3_384, sha3_512, keccak_224, keccak_256, keccak_384, keccak_512, genShake, shake128, shake256;
var init_sha3 = __esm({
  "node_modules/@noble/hashes/esm/sha3.js"() {
    init_assert();
    init_u64();
    init_utils2();
    [SHA3_PI, SHA3_ROTL, _SHA3_IOTA] = [[], [], []];
    _0n = /* @__PURE__ */ BigInt(0);
    _1n = /* @__PURE__ */ BigInt(1);
    _2n = /* @__PURE__ */ BigInt(2);
    _7n = /* @__PURE__ */ BigInt(7);
    _256n = /* @__PURE__ */ BigInt(256);
    _0x71n = /* @__PURE__ */ BigInt(113);
    for (let round = 0, R = _1n, x = 1, y = 0; round < 24; round++) {
      [x, y] = [y, (2 * x + 3 * y) % 5];
      SHA3_PI.push(2 * (5 * y + x));
      SHA3_ROTL.push((round + 1) * (round + 2) / 2 % 64);
      let t = _0n;
      for (let j = 0; j < 7; j++) {
        R = (R << _1n ^ (R >> _7n) * _0x71n) % _256n;
        if (R & _2n)
          t ^= _1n << (_1n << /* @__PURE__ */ BigInt(j)) - _1n;
      }
      _SHA3_IOTA.push(t);
    }
    [SHA3_IOTA_H, SHA3_IOTA_L] = /* @__PURE__ */ split(_SHA3_IOTA, true);
    rotlH = (h, l, s) => s > 32 ? rotlBH(h, l, s) : rotlSH(h, l, s);
    rotlL = (h, l, s) => s > 32 ? rotlBL(h, l, s) : rotlSL(h, l, s);
    Keccak = class _Keccak extends Hash {
      // NOTE: we accept arguments in bytes instead of bits here.
      constructor(blockLen, suffix, outputLen, enableXOF = false, rounds = 24) {
        super();
        this.blockLen = blockLen;
        this.suffix = suffix;
        this.outputLen = outputLen;
        this.enableXOF = enableXOF;
        this.rounds = rounds;
        this.pos = 0;
        this.posOut = 0;
        this.finished = false;
        this.destroyed = false;
        number(outputLen);
        if (0 >= this.blockLen || this.blockLen >= 200)
          throw new Error("Sha3 supports only keccak-f1600 function");
        this.state = new Uint8Array(200);
        this.state32 = u32(this.state);
      }
      keccak() {
        keccakP(this.state32, this.rounds);
        this.posOut = 0;
        this.pos = 0;
      }
      update(data) {
        exists(this);
        const { blockLen, state } = this;
        data = toBytes(data);
        const len = data.length;
        for (let pos = 0; pos < len; ) {
          const take = Math.min(blockLen - this.pos, len - pos);
          for (let i = 0; i < take; i++)
            state[this.pos++] ^= data[pos++];
          if (this.pos === blockLen)
            this.keccak();
        }
        return this;
      }
      finish() {
        if (this.finished)
          return;
        this.finished = true;
        const { state, suffix, pos, blockLen } = this;
        state[pos] ^= suffix;
        if ((suffix & 128) !== 0 && pos === blockLen - 1)
          this.keccak();
        state[blockLen - 1] ^= 128;
        this.keccak();
      }
      writeInto(out) {
        exists(this, false);
        bytes(out);
        this.finish();
        const bufferOut = this.state;
        const { blockLen } = this;
        for (let pos = 0, len = out.length; pos < len; ) {
          if (this.posOut >= blockLen)
            this.keccak();
          const take = Math.min(blockLen - this.posOut, len - pos);
          out.set(bufferOut.subarray(this.posOut, this.posOut + take), pos);
          this.posOut += take;
          pos += take;
        }
        return out;
      }
      xofInto(out) {
        if (!this.enableXOF)
          throw new Error("XOF is not possible for this instance");
        return this.writeInto(out);
      }
      xof(bytes2) {
        number(bytes2);
        return this.xofInto(new Uint8Array(bytes2));
      }
      digestInto(out) {
        output(out, this);
        if (this.finished)
          throw new Error("digest() was already called");
        this.writeInto(out);
        this.destroy();
        return out;
      }
      digest() {
        return this.digestInto(new Uint8Array(this.outputLen));
      }
      destroy() {
        this.destroyed = true;
        this.state.fill(0);
      }
      _cloneInto(to) {
        const { blockLen, suffix, outputLen, rounds, enableXOF } = this;
        to || (to = new _Keccak(blockLen, suffix, outputLen, enableXOF, rounds));
        to.state32.set(this.state32);
        to.pos = this.pos;
        to.posOut = this.posOut;
        to.finished = this.finished;
        to.rounds = rounds;
        to.suffix = suffix;
        to.outputLen = outputLen;
        to.enableXOF = enableXOF;
        to.destroyed = this.destroyed;
        return to;
      }
    };
    gen = (suffix, blockLen, outputLen) => wrapConstructor(() => new Keccak(blockLen, suffix, outputLen));
    sha3_224 = /* @__PURE__ */ gen(6, 144, 224 / 8);
    sha3_256 = /* @__PURE__ */ gen(6, 136, 256 / 8);
    sha3_384 = /* @__PURE__ */ gen(6, 104, 384 / 8);
    sha3_512 = /* @__PURE__ */ gen(6, 72, 512 / 8);
    keccak_224 = /* @__PURE__ */ gen(1, 144, 224 / 8);
    keccak_256 = /* @__PURE__ */ gen(1, 136, 256 / 8);
    keccak_384 = /* @__PURE__ */ gen(1, 104, 384 / 8);
    keccak_512 = /* @__PURE__ */ gen(1, 72, 512 / 8);
    genShake = (suffix, blockLen, outputLen) => wrapXOFConstructorWithOpts((opts = {}) => new Keccak(blockLen, suffix, opts.dkLen === void 0 ? outputLen : opts.dkLen, true));
    shake128 = /* @__PURE__ */ genShake(31, 168, 128 / 8);
    shake256 = /* @__PURE__ */ genShake(31, 136, 256 / 8);
  }
});

// node_modules/ethers/lib.esm/crypto/keccak.js
function keccak256(_data) {
  const data = getBytes(_data, "data");
  return hexlify(__keccak256(data));
}
var locked, _keccak256, __keccak256;
var init_keccak = __esm({
  "node_modules/ethers/lib.esm/crypto/keccak.js"() {
    init_sha3();
    init_utils();
    locked = false;
    _keccak256 = function(data) {
      return keccak_256(data);
    };
    __keccak256 = _keccak256;
    keccak256._ = _keccak256;
    keccak256.lock = function() {
      locked = true;
    };
    keccak256.register = function(func) {
      if (locked) {
        throw new TypeError("keccak256 is locked");
      }
      __keccak256 = func;
    };
    Object.freeze(keccak256);
  }
});

// node_modules/@noble/hashes/esm/_sha2.js
function setBigUint64(view, byteOffset, value, isLE2) {
  if (typeof view.setBigUint64 === "function")
    return view.setBigUint64(byteOffset, value, isLE2);
  const _32n2 = BigInt(32);
  const _u32_max = BigInt(4294967295);
  const wh = Number(value >> _32n2 & _u32_max);
  const wl = Number(value & _u32_max);
  const h = isLE2 ? 4 : 0;
  const l = isLE2 ? 0 : 4;
  view.setUint32(byteOffset + h, wh, isLE2);
  view.setUint32(byteOffset + l, wl, isLE2);
}
var SHA2;
var init_sha2 = __esm({
  "node_modules/@noble/hashes/esm/_sha2.js"() {
    init_assert();
    init_utils2();
    SHA2 = class extends Hash {
      constructor(blockLen, outputLen, padOffset, isLE2) {
        super();
        this.blockLen = blockLen;
        this.outputLen = outputLen;
        this.padOffset = padOffset;
        this.isLE = isLE2;
        this.finished = false;
        this.length = 0;
        this.pos = 0;
        this.destroyed = false;
        this.buffer = new Uint8Array(blockLen);
        this.view = createView(this.buffer);
      }
      update(data) {
        exists(this);
        const { view, buffer, blockLen } = this;
        data = toBytes(data);
        const len = data.length;
        for (let pos = 0; pos < len; ) {
          const take = Math.min(blockLen - this.pos, len - pos);
          if (take === blockLen) {
            const dataView = createView(data);
            for (; blockLen <= len - pos; pos += blockLen)
              this.process(dataView, pos);
            continue;
          }
          buffer.set(data.subarray(pos, pos + take), this.pos);
          this.pos += take;
          pos += take;
          if (this.pos === blockLen) {
            this.process(view, 0);
            this.pos = 0;
          }
        }
        this.length += data.length;
        this.roundClean();
        return this;
      }
      digestInto(out) {
        exists(this);
        output(out, this);
        this.finished = true;
        const { buffer, view, blockLen, isLE: isLE2 } = this;
        let { pos } = this;
        buffer[pos++] = 128;
        this.buffer.subarray(pos).fill(0);
        if (this.padOffset > blockLen - pos) {
          this.process(view, 0);
          pos = 0;
        }
        for (let i = pos; i < blockLen; i++)
          buffer[i] = 0;
        setBigUint64(view, blockLen - 8, BigInt(this.length * 8), isLE2);
        this.process(view, 0);
        const oview = createView(out);
        const len = this.outputLen;
        if (len % 4)
          throw new Error("_sha2: outputLen should be aligned to 32bit");
        const outLen = len / 4;
        const state = this.get();
        if (outLen > state.length)
          throw new Error("_sha2: outputLen bigger than state");
        for (let i = 0; i < outLen; i++)
          oview.setUint32(4 * i, state[i], isLE2);
      }
      digest() {
        const { buffer, outputLen } = this;
        this.digestInto(buffer);
        const res = buffer.slice(0, outputLen);
        this.destroy();
        return res;
      }
      _cloneInto(to) {
        to || (to = new this.constructor());
        to.set(...this.get());
        const { blockLen, buffer, length, finished, destroyed, pos } = this;
        to.length = length;
        to.pos = pos;
        to.finished = finished;
        to.destroyed = destroyed;
        if (length % blockLen)
          to.buffer.set(buffer);
        return to;
      }
    };
  }
});

// node_modules/@noble/hashes/esm/sha256.js
var Chi, Maj, SHA256_K, IV, SHA256_W, SHA256, sha256;
var init_sha256 = __esm({
  "node_modules/@noble/hashes/esm/sha256.js"() {
    init_sha2();
    init_utils2();
    Chi = (a, b2, c) => a & b2 ^ ~a & c;
    Maj = (a, b2, c) => a & b2 ^ a & c ^ b2 & c;
    SHA256_K = /* @__PURE__ */ new Uint32Array([
      1116352408,
      1899447441,
      3049323471,
      3921009573,
      961987163,
      1508970993,
      2453635748,
      2870763221,
      3624381080,
      310598401,
      607225278,
      1426881987,
      1925078388,
      2162078206,
      2614888103,
      3248222580,
      3835390401,
      4022224774,
      264347078,
      604807628,
      770255983,
      1249150122,
      1555081692,
      1996064986,
      2554220882,
      2821834349,
      2952996808,
      3210313671,
      3336571891,
      3584528711,
      113926993,
      338241895,
      666307205,
      773529912,
      1294757372,
      1396182291,
      1695183700,
      1986661051,
      2177026350,
      2456956037,
      2730485921,
      2820302411,
      3259730800,
      3345764771,
      3516065817,
      3600352804,
      4094571909,
      275423344,
      430227734,
      506948616,
      659060556,
      883997877,
      958139571,
      1322822218,
      1537002063,
      1747873779,
      1955562222,
      2024104815,
      2227730452,
      2361852424,
      2428436474,
      2756734187,
      3204031479,
      3329325298
    ]);
    IV = /* @__PURE__ */ new Uint32Array([
      1779033703,
      3144134277,
      1013904242,
      2773480762,
      1359893119,
      2600822924,
      528734635,
      1541459225
    ]);
    SHA256_W = /* @__PURE__ */ new Uint32Array(64);
    SHA256 = class extends SHA2 {
      constructor() {
        super(64, 32, 8, false);
        this.A = IV[0] | 0;
        this.B = IV[1] | 0;
        this.C = IV[2] | 0;
        this.D = IV[3] | 0;
        this.E = IV[4] | 0;
        this.F = IV[5] | 0;
        this.G = IV[6] | 0;
        this.H = IV[7] | 0;
      }
      get() {
        const { A, B, C, D, E, F, G, H } = this;
        return [A, B, C, D, E, F, G, H];
      }
      // prettier-ignore
      set(A, B, C, D, E, F, G, H) {
        this.A = A | 0;
        this.B = B | 0;
        this.C = C | 0;
        this.D = D | 0;
        this.E = E | 0;
        this.F = F | 0;
        this.G = G | 0;
        this.H = H | 0;
      }
      process(view, offset) {
        for (let i = 0; i < 16; i++, offset += 4)
          SHA256_W[i] = view.getUint32(offset, false);
        for (let i = 16; i < 64; i++) {
          const W15 = SHA256_W[i - 15];
          const W2 = SHA256_W[i - 2];
          const s0 = rotr(W15, 7) ^ rotr(W15, 18) ^ W15 >>> 3;
          const s1 = rotr(W2, 17) ^ rotr(W2, 19) ^ W2 >>> 10;
          SHA256_W[i] = s1 + SHA256_W[i - 7] + s0 + SHA256_W[i - 16] | 0;
        }
        let { A, B, C, D, E, F, G, H } = this;
        for (let i = 0; i < 64; i++) {
          const sigma1 = rotr(E, 6) ^ rotr(E, 11) ^ rotr(E, 25);
          const T1 = H + sigma1 + Chi(E, F, G) + SHA256_K[i] + SHA256_W[i] | 0;
          const sigma0 = rotr(A, 2) ^ rotr(A, 13) ^ rotr(A, 22);
          const T2 = sigma0 + Maj(A, B, C) | 0;
          H = G;
          G = F;
          F = E;
          E = D + T1 | 0;
          D = C;
          C = B;
          B = A;
          A = T1 + T2 | 0;
        }
        A = A + this.A | 0;
        B = B + this.B | 0;
        C = C + this.C | 0;
        D = D + this.D | 0;
        E = E + this.E | 0;
        F = F + this.F | 0;
        G = G + this.G | 0;
        H = H + this.H | 0;
        this.set(A, B, C, D, E, F, G, H);
      }
      roundClean() {
        SHA256_W.fill(0);
      }
      destroy() {
        this.set(0, 0, 0, 0, 0, 0, 0, 0);
        this.buffer.fill(0);
      }
    };
    sha256 = /* @__PURE__ */ wrapConstructor(() => new SHA256());
  }
});

// node_modules/@noble/hashes/esm/hmac.js
var HMAC, hmac;
var init_hmac = __esm({
  "node_modules/@noble/hashes/esm/hmac.js"() {
    init_assert();
    init_utils2();
    HMAC = class extends Hash {
      constructor(hash4, _key) {
        super();
        this.finished = false;
        this.destroyed = false;
        hash(hash4);
        const key = toBytes(_key);
        this.iHash = hash4.create();
        if (typeof this.iHash.update !== "function")
          throw new Error("Expected instance of class which extends utils.Hash");
        this.blockLen = this.iHash.blockLen;
        this.outputLen = this.iHash.outputLen;
        const blockLen = this.blockLen;
        const pad = new Uint8Array(blockLen);
        pad.set(key.length > blockLen ? hash4.create().update(key).digest() : key);
        for (let i = 0; i < pad.length; i++)
          pad[i] ^= 54;
        this.iHash.update(pad);
        this.oHash = hash4.create();
        for (let i = 0; i < pad.length; i++)
          pad[i] ^= 54 ^ 92;
        this.oHash.update(pad);
        pad.fill(0);
      }
      update(buf) {
        exists(this);
        this.iHash.update(buf);
        return this;
      }
      digestInto(out) {
        exists(this);
        bytes(out, this.outputLen);
        this.finished = true;
        this.iHash.digestInto(out);
        this.oHash.update(out);
        this.oHash.digestInto(out);
        this.destroy();
      }
      digest() {
        const out = new Uint8Array(this.oHash.outputLen);
        this.digestInto(out);
        return out;
      }
      _cloneInto(to) {
        to || (to = Object.create(Object.getPrototypeOf(this), {}));
        const { oHash, iHash, finished, destroyed, blockLen, outputLen } = this;
        to = to;
        to.finished = finished;
        to.destroyed = destroyed;
        to.blockLen = blockLen;
        to.outputLen = outputLen;
        to.oHash = oHash._cloneInto(to.oHash);
        to.iHash = iHash._cloneInto(to.iHash);
        return to;
      }
      destroy() {
        this.destroyed = true;
        this.oHash.destroy();
        this.iHash.destroy();
      }
    };
    hmac = (hash4, key, message) => new HMAC(hash4, key).update(message).digest();
    hmac.create = (hash4, key) => new HMAC(hash4, key);
  }
});

// node_modules/@noble/curves/esm/abstract/utils.js
var utils_exports = {};
__export(utils_exports, {
  bitGet: () => bitGet,
  bitLen: () => bitLen,
  bitMask: () => bitMask,
  bitSet: () => bitSet,
  bytesToHex: () => bytesToHex,
  bytesToNumberBE: () => bytesToNumberBE,
  bytesToNumberLE: () => bytesToNumberLE,
  concatBytes: () => concatBytes2,
  createHmacDrbg: () => createHmacDrbg,
  ensureBytes: () => ensureBytes,
  equalBytes: () => equalBytes,
  hexToBytes: () => hexToBytes,
  hexToNumber: () => hexToNumber,
  numberToBytesBE: () => numberToBytesBE,
  numberToBytesLE: () => numberToBytesLE,
  numberToHexUnpadded: () => numberToHexUnpadded,
  numberToVarBytesBE: () => numberToVarBytesBE,
  utf8ToBytes: () => utf8ToBytes2,
  validateObject: () => validateObject
});
function bytesToHex(bytes2) {
  if (!u8a2(bytes2))
    throw new Error("Uint8Array expected");
  let hex = "";
  for (let i = 0; i < bytes2.length; i++) {
    hex += hexes[bytes2[i]];
  }
  return hex;
}
function numberToHexUnpadded(num) {
  const hex = num.toString(16);
  return hex.length & 1 ? `0${hex}` : hex;
}
function hexToNumber(hex) {
  if (typeof hex !== "string")
    throw new Error("hex string expected, got " + typeof hex);
  return BigInt(hex === "" ? "0" : `0x${hex}`);
}
function hexToBytes(hex) {
  if (typeof hex !== "string")
    throw new Error("hex string expected, got " + typeof hex);
  const len = hex.length;
  if (len % 2)
    throw new Error("padded hex string expected, got unpadded hex of length " + len);
  const array = new Uint8Array(len / 2);
  for (let i = 0; i < array.length; i++) {
    const j = i * 2;
    const hexByte = hex.slice(j, j + 2);
    const byte = Number.parseInt(hexByte, 16);
    if (Number.isNaN(byte) || byte < 0)
      throw new Error("Invalid byte sequence");
    array[i] = byte;
  }
  return array;
}
function bytesToNumberBE(bytes2) {
  return hexToNumber(bytesToHex(bytes2));
}
function bytesToNumberLE(bytes2) {
  if (!u8a2(bytes2))
    throw new Error("Uint8Array expected");
  return hexToNumber(bytesToHex(Uint8Array.from(bytes2).reverse()));
}
function numberToBytesBE(n2, len) {
  return hexToBytes(n2.toString(16).padStart(len * 2, "0"));
}
function numberToBytesLE(n2, len) {
  return numberToBytesBE(n2, len).reverse();
}
function numberToVarBytesBE(n2) {
  return hexToBytes(numberToHexUnpadded(n2));
}
function ensureBytes(title, hex, expectedLength) {
  let res;
  if (typeof hex === "string") {
    try {
      res = hexToBytes(hex);
    } catch (e) {
      throw new Error(`${title} must be valid hex string, got "${hex}". Cause: ${e}`);
    }
  } else if (u8a2(hex)) {
    res = Uint8Array.from(hex);
  } else {
    throw new Error(`${title} must be hex string or Uint8Array`);
  }
  const len = res.length;
  if (typeof expectedLength === "number" && len !== expectedLength)
    throw new Error(`${title} expected ${expectedLength} bytes, got ${len}`);
  return res;
}
function concatBytes2(...arrays) {
  const r = new Uint8Array(arrays.reduce((sum, a) => sum + a.length, 0));
  let pad = 0;
  arrays.forEach((a) => {
    if (!u8a2(a))
      throw new Error("Uint8Array expected");
    r.set(a, pad);
    pad += a.length;
  });
  return r;
}
function equalBytes(b1, b2) {
  if (b1.length !== b2.length)
    return false;
  for (let i = 0; i < b1.length; i++)
    if (b1[i] !== b2[i])
      return false;
  return true;
}
function utf8ToBytes2(str) {
  if (typeof str !== "string")
    throw new Error(`utf8ToBytes expected string, got ${typeof str}`);
  return new Uint8Array(new TextEncoder().encode(str));
}
function bitLen(n2) {
  let len;
  for (len = 0; n2 > _0n2; n2 >>= _1n2, len += 1)
    ;
  return len;
}
function bitGet(n2, pos) {
  return n2 >> BigInt(pos) & _1n2;
}
function createHmacDrbg(hashLen, qByteLen, hmacFn) {
  if (typeof hashLen !== "number" || hashLen < 2)
    throw new Error("hashLen must be a number");
  if (typeof qByteLen !== "number" || qByteLen < 2)
    throw new Error("qByteLen must be a number");
  if (typeof hmacFn !== "function")
    throw new Error("hmacFn must be a function");
  let v = u8n(hashLen);
  let k = u8n(hashLen);
  let i = 0;
  const reset = () => {
    v.fill(1);
    k.fill(0);
    i = 0;
  };
  const h = (...b2) => hmacFn(k, v, ...b2);
  const reseed = (seed = u8n()) => {
    k = h(u8fr([0]), seed);
    v = h();
    if (seed.length === 0)
      return;
    k = h(u8fr([1]), seed);
    v = h();
  };
  const gen2 = () => {
    if (i++ >= 1e3)
      throw new Error("drbg: tried 1000 values");
    let len = 0;
    const out = [];
    while (len < qByteLen) {
      v = h();
      const sl = v.slice();
      out.push(sl);
      len += v.length;
    }
    return concatBytes2(...out);
  };
  const genUntil = (seed, pred) => {
    reset();
    reseed(seed);
    let res = void 0;
    while (!(res = pred(gen2())))
      reseed();
    reset();
    return res;
  };
  return genUntil;
}
function validateObject(object, validators, optValidators = {}) {
  const checkField = (fieldName, type, isOptional) => {
    const checkVal = validatorFns[type];
    if (typeof checkVal !== "function")
      throw new Error(`Invalid validator "${type}", expected function`);
    const val = object[fieldName];
    if (isOptional && val === void 0)
      return;
    if (!checkVal(val, object)) {
      throw new Error(`Invalid param ${String(fieldName)}=${val} (${typeof val}), expected ${type}`);
    }
  };
  for (const [fieldName, type] of Object.entries(validators))
    checkField(fieldName, type, false);
  for (const [fieldName, type] of Object.entries(optValidators))
    checkField(fieldName, type, true);
  return object;
}
var _0n2, _1n2, _2n2, u8a2, hexes, bitSet, bitMask, u8n, u8fr, validatorFns;
var init_utils3 = __esm({
  "node_modules/@noble/curves/esm/abstract/utils.js"() {
    _0n2 = BigInt(0);
    _1n2 = BigInt(1);
    _2n2 = BigInt(2);
    u8a2 = (a) => a instanceof Uint8Array;
    hexes = /* @__PURE__ */ Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, "0"));
    bitSet = (n2, pos, value) => {
      return n2 | (value ? _1n2 : _0n2) << BigInt(pos);
    };
    bitMask = (n2) => (_2n2 << BigInt(n2 - 1)) - _1n2;
    u8n = (data) => new Uint8Array(data);
    u8fr = (arr) => Uint8Array.from(arr);
    validatorFns = {
      bigint: (val) => typeof val === "bigint",
      function: (val) => typeof val === "function",
      boolean: (val) => typeof val === "boolean",
      string: (val) => typeof val === "string",
      stringOrUint8Array: (val) => typeof val === "string" || val instanceof Uint8Array,
      isSafeInteger: (val) => Number.isSafeInteger(val),
      array: (val) => Array.isArray(val),
      field: (val, object) => object.Fp.isValid(val),
      hash: (val) => typeof val === "function" && Number.isSafeInteger(val.outputLen)
    };
  }
});

// node_modules/@noble/curves/esm/abstract/modular.js
function mod(a, b2) {
  const result = a % b2;
  return result >= _0n3 ? result : b2 + result;
}
function pow(num, power, modulo) {
  if (modulo <= _0n3 || power < _0n3)
    throw new Error("Expected power/modulo > 0");
  if (modulo === _1n3)
    return _0n3;
  let res = _1n3;
  while (power > _0n3) {
    if (power & _1n3)
      res = res * num % modulo;
    num = num * num % modulo;
    power >>= _1n3;
  }
  return res;
}
function pow2(x, power, modulo) {
  let res = x;
  while (power-- > _0n3) {
    res *= res;
    res %= modulo;
  }
  return res;
}
function invert(number2, modulo) {
  if (number2 === _0n3 || modulo <= _0n3) {
    throw new Error(`invert: expected positive integers, got n=${number2} mod=${modulo}`);
  }
  let a = mod(number2, modulo);
  let b2 = modulo;
  let x = _0n3, y = _1n3, u = _1n3, v = _0n3;
  while (a !== _0n3) {
    const q = b2 / a;
    const r = b2 % a;
    const m = x - u * q;
    const n2 = y - v * q;
    b2 = a, a = r, x = u, y = v, u = m, v = n2;
  }
  const gcd = b2;
  if (gcd !== _1n3)
    throw new Error("invert: does not exist");
  return mod(x, modulo);
}
function tonelliShanks(P) {
  const legendreC = (P - _1n3) / _2n3;
  let Q, S, Z;
  for (Q = P - _1n3, S = 0; Q % _2n3 === _0n3; Q /= _2n3, S++)
    ;
  for (Z = _2n3; Z < P && pow(Z, legendreC, P) !== P - _1n3; Z++)
    ;
  if (S === 1) {
    const p1div4 = (P + _1n3) / _4n;
    return function tonelliFast(Fp2, n2) {
      const root = Fp2.pow(n2, p1div4);
      if (!Fp2.eql(Fp2.sqr(root), n2))
        throw new Error("Cannot find square root");
      return root;
    };
  }
  const Q1div2 = (Q + _1n3) / _2n3;
  return function tonelliSlow(Fp2, n2) {
    if (Fp2.pow(n2, legendreC) === Fp2.neg(Fp2.ONE))
      throw new Error("Cannot find square root");
    let r = S;
    let g = Fp2.pow(Fp2.mul(Fp2.ONE, Z), Q);
    let x = Fp2.pow(n2, Q1div2);
    let b2 = Fp2.pow(n2, Q);
    while (!Fp2.eql(b2, Fp2.ONE)) {
      if (Fp2.eql(b2, Fp2.ZERO))
        return Fp2.ZERO;
      let m = 1;
      for (let t2 = Fp2.sqr(b2); m < r; m++) {
        if (Fp2.eql(t2, Fp2.ONE))
          break;
        t2 = Fp2.sqr(t2);
      }
      const ge = Fp2.pow(g, _1n3 << BigInt(r - m - 1));
      g = Fp2.sqr(ge);
      x = Fp2.mul(x, ge);
      b2 = Fp2.mul(b2, g);
      r = m;
    }
    return x;
  };
}
function FpSqrt(P) {
  if (P % _4n === _3n) {
    const p1div4 = (P + _1n3) / _4n;
    return function sqrt3mod4(Fp2, n2) {
      const root = Fp2.pow(n2, p1div4);
      if (!Fp2.eql(Fp2.sqr(root), n2))
        throw new Error("Cannot find square root");
      return root;
    };
  }
  if (P % _8n === _5n) {
    const c1 = (P - _5n) / _8n;
    return function sqrt5mod8(Fp2, n2) {
      const n22 = Fp2.mul(n2, _2n3);
      const v = Fp2.pow(n22, c1);
      const nv = Fp2.mul(n2, v);
      const i = Fp2.mul(Fp2.mul(nv, _2n3), v);
      const root = Fp2.mul(nv, Fp2.sub(i, Fp2.ONE));
      if (!Fp2.eql(Fp2.sqr(root), n2))
        throw new Error("Cannot find square root");
      return root;
    };
  }
  if (P % _16n === _9n) {
  }
  return tonelliShanks(P);
}
function validateField(field) {
  const initial = {
    ORDER: "bigint",
    MASK: "bigint",
    BYTES: "isSafeInteger",
    BITS: "isSafeInteger"
  };
  const opts = FIELD_FIELDS.reduce((map, val) => {
    map[val] = "function";
    return map;
  }, initial);
  return validateObject(field, opts);
}
function FpPow(f, num, power) {
  if (power < _0n3)
    throw new Error("Expected power > 0");
  if (power === _0n3)
    return f.ONE;
  if (power === _1n3)
    return num;
  let p = f.ONE;
  let d = num;
  while (power > _0n3) {
    if (power & _1n3)
      p = f.mul(p, d);
    d = f.sqr(d);
    power >>= _1n3;
  }
  return p;
}
function FpInvertBatch(f, nums) {
  const tmp = new Array(nums.length);
  const lastMultiplied = nums.reduce((acc, num, i) => {
    if (f.is0(num))
      return acc;
    tmp[i] = acc;
    return f.mul(acc, num);
  }, f.ONE);
  const inverted = f.inv(lastMultiplied);
  nums.reduceRight((acc, num, i) => {
    if (f.is0(num))
      return acc;
    tmp[i] = f.mul(acc, tmp[i]);
    return f.mul(acc, num);
  }, inverted);
  return tmp;
}
function nLength(n2, nBitLength) {
  const _nBitLength = nBitLength !== void 0 ? nBitLength : n2.toString(2).length;
  const nByteLength = Math.ceil(_nBitLength / 8);
  return { nBitLength: _nBitLength, nByteLength };
}
function Field(ORDER, bitLen2, isLE2 = false, redef = {}) {
  if (ORDER <= _0n3)
    throw new Error(`Expected Field ORDER > 0, got ${ORDER}`);
  const { nBitLength: BITS, nByteLength: BYTES } = nLength(ORDER, bitLen2);
  if (BYTES > 2048)
    throw new Error("Field lengths over 2048 bytes are not supported");
  const sqrtP = FpSqrt(ORDER);
  const f = Object.freeze({
    ORDER,
    BITS,
    BYTES,
    MASK: bitMask(BITS),
    ZERO: _0n3,
    ONE: _1n3,
    create: (num) => mod(num, ORDER),
    isValid: (num) => {
      if (typeof num !== "bigint")
        throw new Error(`Invalid field element: expected bigint, got ${typeof num}`);
      return _0n3 <= num && num < ORDER;
    },
    is0: (num) => num === _0n3,
    isOdd: (num) => (num & _1n3) === _1n3,
    neg: (num) => mod(-num, ORDER),
    eql: (lhs, rhs) => lhs === rhs,
    sqr: (num) => mod(num * num, ORDER),
    add: (lhs, rhs) => mod(lhs + rhs, ORDER),
    sub: (lhs, rhs) => mod(lhs - rhs, ORDER),
    mul: (lhs, rhs) => mod(lhs * rhs, ORDER),
    pow: (num, power) => FpPow(f, num, power),
    div: (lhs, rhs) => mod(lhs * invert(rhs, ORDER), ORDER),
    // Same as above, but doesn't normalize
    sqrN: (num) => num * num,
    addN: (lhs, rhs) => lhs + rhs,
    subN: (lhs, rhs) => lhs - rhs,
    mulN: (lhs, rhs) => lhs * rhs,
    inv: (num) => invert(num, ORDER),
    sqrt: redef.sqrt || ((n2) => sqrtP(f, n2)),
    invertBatch: (lst) => FpInvertBatch(f, lst),
    // TODO: do we really need constant cmov?
    // We don't have const-time bigints anyway, so probably will be not very useful
    cmov: (a, b2, c) => c ? b2 : a,
    toBytes: (num) => isLE2 ? numberToBytesLE(num, BYTES) : numberToBytesBE(num, BYTES),
    fromBytes: (bytes2) => {
      if (bytes2.length !== BYTES)
        throw new Error(`Fp.fromBytes: expected ${BYTES}, got ${bytes2.length}`);
      return isLE2 ? bytesToNumberLE(bytes2) : bytesToNumberBE(bytes2);
    }
  });
  return Object.freeze(f);
}
function getFieldBytesLength(fieldOrder) {
  if (typeof fieldOrder !== "bigint")
    throw new Error("field order must be bigint");
  const bitLength = fieldOrder.toString(2).length;
  return Math.ceil(bitLength / 8);
}
function getMinHashLength(fieldOrder) {
  const length = getFieldBytesLength(fieldOrder);
  return length + Math.ceil(length / 2);
}
function mapHashToField(key, fieldOrder, isLE2 = false) {
  const len = key.length;
  const fieldLen = getFieldBytesLength(fieldOrder);
  const minLen = getMinHashLength(fieldOrder);
  if (len < 16 || len < minLen || len > 1024)
    throw new Error(`expected ${minLen}-1024 bytes of input, got ${len}`);
  const num = isLE2 ? bytesToNumberBE(key) : bytesToNumberLE(key);
  const reduced = mod(num, fieldOrder - _1n3) + _1n3;
  return isLE2 ? numberToBytesLE(reduced, fieldLen) : numberToBytesBE(reduced, fieldLen);
}
var _0n3, _1n3, _2n3, _3n, _4n, _5n, _8n, _9n, _16n, FIELD_FIELDS;
var init_modular = __esm({
  "node_modules/@noble/curves/esm/abstract/modular.js"() {
    init_utils3();
    _0n3 = BigInt(0);
    _1n3 = BigInt(1);
    _2n3 = BigInt(2);
    _3n = BigInt(3);
    _4n = BigInt(4);
    _5n = BigInt(5);
    _8n = BigInt(8);
    _9n = BigInt(9);
    _16n = BigInt(16);
    FIELD_FIELDS = [
      "create",
      "isValid",
      "is0",
      "neg",
      "inv",
      "sqrt",
      "sqr",
      "eql",
      "add",
      "sub",
      "mul",
      "pow",
      "div",
      "addN",
      "subN",
      "mulN",
      "sqrN"
    ];
  }
});

// node_modules/@noble/curves/esm/abstract/curve.js
function wNAF(c, bits) {
  const constTimeNegate = (condition, item) => {
    const neg = item.negate();
    return condition ? neg : item;
  };
  const opts = (W) => {
    const windows = Math.ceil(bits / W) + 1;
    const windowSize = 2 ** (W - 1);
    return { windows, windowSize };
  };
  return {
    constTimeNegate,
    // non-const time multiplication ladder
    unsafeLadder(elm, n2) {
      let p = c.ZERO;
      let d = elm;
      while (n2 > _0n4) {
        if (n2 & _1n4)
          p = p.add(d);
        d = d.double();
        n2 >>= _1n4;
      }
      return p;
    },
    /**
     * Creates a wNAF precomputation window. Used for caching.
     * Default window size is set by `utils.precompute()` and is equal to 8.
     * Number of precomputed points depends on the curve size:
     * 2^(𝑊−1) * (Math.ceil(𝑛 / 𝑊) + 1), where:
     * - 𝑊 is the window size
     * - 𝑛 is the bitlength of the curve order.
     * For a 256-bit curve and window size 8, the number of precomputed points is 128 * 33 = 4224.
     * @returns precomputed point tables flattened to a single array
     */
    precomputeWindow(elm, W) {
      const { windows, windowSize } = opts(W);
      const points = [];
      let p = elm;
      let base = p;
      for (let window = 0; window < windows; window++) {
        base = p;
        points.push(base);
        for (let i = 1; i < windowSize; i++) {
          base = base.add(p);
          points.push(base);
        }
        p = base.double();
      }
      return points;
    },
    /**
     * Implements ec multiplication using precomputed tables and w-ary non-adjacent form.
     * @param W window size
     * @param precomputes precomputed tables
     * @param n scalar (we don't check here, but should be less than curve order)
     * @returns real and fake (for const-time) points
     */
    wNAF(W, precomputes, n2) {
      const { windows, windowSize } = opts(W);
      let p = c.ZERO;
      let f = c.BASE;
      const mask2 = BigInt(2 ** W - 1);
      const maxNumber = 2 ** W;
      const shiftBy = BigInt(W);
      for (let window = 0; window < windows; window++) {
        const offset = window * windowSize;
        let wbits = Number(n2 & mask2);
        n2 >>= shiftBy;
        if (wbits > windowSize) {
          wbits -= maxNumber;
          n2 += _1n4;
        }
        const offset1 = offset;
        const offset2 = offset + Math.abs(wbits) - 1;
        const cond1 = window % 2 !== 0;
        const cond2 = wbits < 0;
        if (wbits === 0) {
          f = f.add(constTimeNegate(cond1, precomputes[offset1]));
        } else {
          p = p.add(constTimeNegate(cond2, precomputes[offset2]));
        }
      }
      return { p, f };
    },
    wNAFCached(P, precomputesMap, n2, transform) {
      const W = P._WINDOW_SIZE || 1;
      let comp = precomputesMap.get(P);
      if (!comp) {
        comp = this.precomputeWindow(P, W);
        if (W !== 1) {
          precomputesMap.set(P, transform(comp));
        }
      }
      return this.wNAF(W, comp, n2);
    }
  };
}
function validateBasic(curve) {
  validateField(curve.Fp);
  validateObject(curve, {
    n: "bigint",
    h: "bigint",
    Gx: "field",
    Gy: "field"
  }, {
    nBitLength: "isSafeInteger",
    nByteLength: "isSafeInteger"
  });
  return Object.freeze({
    ...nLength(curve.n, curve.nBitLength),
    ...curve,
    ...{ p: curve.Fp.ORDER }
  });
}
var _0n4, _1n4;
var init_curve = __esm({
  "node_modules/@noble/curves/esm/abstract/curve.js"() {
    init_modular();
    init_utils3();
    _0n4 = BigInt(0);
    _1n4 = BigInt(1);
  }
});

// node_modules/@noble/curves/esm/abstract/weierstrass.js
function validatePointOpts(curve) {
  const opts = validateBasic(curve);
  validateObject(opts, {
    a: "field",
    b: "field"
  }, {
    allowedPrivateKeyLengths: "array",
    wrapPrivateKey: "boolean",
    isTorsionFree: "function",
    clearCofactor: "function",
    allowInfinityPoint: "boolean",
    fromBytes: "function",
    toBytes: "function"
  });
  const { endo, Fp: Fp2, a } = opts;
  if (endo) {
    if (!Fp2.eql(a, Fp2.ZERO)) {
      throw new Error("Endomorphism can only be defined for Koblitz curves that have a=0");
    }
    if (typeof endo !== "object" || typeof endo.beta !== "bigint" || typeof endo.splitScalar !== "function") {
      throw new Error("Expected endomorphism with beta: bigint and splitScalar: function");
    }
  }
  return Object.freeze({ ...opts });
}
function weierstrassPoints(opts) {
  const CURVE = validatePointOpts(opts);
  const { Fp: Fp2 } = CURVE;
  const toBytes2 = CURVE.toBytes || ((_c, point, _isCompressed) => {
    const a = point.toAffine();
    return concatBytes2(Uint8Array.from([4]), Fp2.toBytes(a.x), Fp2.toBytes(a.y));
  });
  const fromBytes = CURVE.fromBytes || ((bytes2) => {
    const tail = bytes2.subarray(1);
    const x = Fp2.fromBytes(tail.subarray(0, Fp2.BYTES));
    const y = Fp2.fromBytes(tail.subarray(Fp2.BYTES, 2 * Fp2.BYTES));
    return { x, y };
  });
  function weierstrassEquation(x) {
    const { a, b: b2 } = CURVE;
    const x2 = Fp2.sqr(x);
    const x3 = Fp2.mul(x2, x);
    return Fp2.add(Fp2.add(x3, Fp2.mul(x, a)), b2);
  }
  if (!Fp2.eql(Fp2.sqr(CURVE.Gy), weierstrassEquation(CURVE.Gx)))
    throw new Error("bad generator point: equation left != right");
  function isWithinCurveOrder(num) {
    return typeof num === "bigint" && _0n5 < num && num < CURVE.n;
  }
  function assertGE(num) {
    if (!isWithinCurveOrder(num))
      throw new Error("Expected valid bigint: 0 < bigint < curve.n");
  }
  function normPrivateKeyToScalar(key) {
    const { allowedPrivateKeyLengths: lengths, nByteLength, wrapPrivateKey, n: n2 } = CURVE;
    if (lengths && typeof key !== "bigint") {
      if (key instanceof Uint8Array)
        key = bytesToHex(key);
      if (typeof key !== "string" || !lengths.includes(key.length))
        throw new Error("Invalid key");
      key = key.padStart(nByteLength * 2, "0");
    }
    let num;
    try {
      num = typeof key === "bigint" ? key : bytesToNumberBE(ensureBytes("private key", key, nByteLength));
    } catch (error) {
      throw new Error(`private key must be ${nByteLength} bytes, hex or bigint, not ${typeof key}`);
    }
    if (wrapPrivateKey)
      num = mod(num, n2);
    assertGE(num);
    return num;
  }
  const pointPrecomputes = /* @__PURE__ */ new Map();
  function assertPrjPoint(other) {
    if (!(other instanceof Point2))
      throw new Error("ProjectivePoint expected");
  }
  class Point2 {
    constructor(px, py, pz) {
      this.px = px;
      this.py = py;
      this.pz = pz;
      if (px == null || !Fp2.isValid(px))
        throw new Error("x required");
      if (py == null || !Fp2.isValid(py))
        throw new Error("y required");
      if (pz == null || !Fp2.isValid(pz))
        throw new Error("z required");
    }
    // Does not validate if the point is on-curve.
    // Use fromHex instead, or call assertValidity() later.
    static fromAffine(p) {
      const { x, y } = p || {};
      if (!p || !Fp2.isValid(x) || !Fp2.isValid(y))
        throw new Error("invalid affine point");
      if (p instanceof Point2)
        throw new Error("projective point not allowed");
      const is0 = (i) => Fp2.eql(i, Fp2.ZERO);
      if (is0(x) && is0(y))
        return Point2.ZERO;
      return new Point2(x, y, Fp2.ONE);
    }
    get x() {
      return this.toAffine().x;
    }
    get y() {
      return this.toAffine().y;
    }
    /**
     * Takes a bunch of Projective Points but executes only one
     * inversion on all of them. Inversion is very slow operation,
     * so this improves performance massively.
     * Optimization: converts a list of projective points to a list of identical points with Z=1.
     */
    static normalizeZ(points) {
      const toInv = Fp2.invertBatch(points.map((p) => p.pz));
      return points.map((p, i) => p.toAffine(toInv[i])).map(Point2.fromAffine);
    }
    /**
     * Converts hash string or Uint8Array to Point.
     * @param hex short/long ECDSA hex
     */
    static fromHex(hex) {
      const P = Point2.fromAffine(fromBytes(ensureBytes("pointHex", hex)));
      P.assertValidity();
      return P;
    }
    // Multiplies generator point by privateKey.
    static fromPrivateKey(privateKey) {
      return Point2.BASE.multiply(normPrivateKeyToScalar(privateKey));
    }
    // "Private method", don't use it directly
    _setWindowSize(windowSize) {
      this._WINDOW_SIZE = windowSize;
      pointPrecomputes.delete(this);
    }
    // A point on curve is valid if it conforms to equation.
    assertValidity() {
      if (this.is0()) {
        if (CURVE.allowInfinityPoint && !Fp2.is0(this.py))
          return;
        throw new Error("bad point: ZERO");
      }
      const { x, y } = this.toAffine();
      if (!Fp2.isValid(x) || !Fp2.isValid(y))
        throw new Error("bad point: x or y not FE");
      const left = Fp2.sqr(y);
      const right = weierstrassEquation(x);
      if (!Fp2.eql(left, right))
        throw new Error("bad point: equation left != right");
      if (!this.isTorsionFree())
        throw new Error("bad point: not in prime-order subgroup");
    }
    hasEvenY() {
      const { y } = this.toAffine();
      if (Fp2.isOdd)
        return !Fp2.isOdd(y);
      throw new Error("Field doesn't support isOdd");
    }
    /**
     * Compare one point to another.
     */
    equals(other) {
      assertPrjPoint(other);
      const { px: X1, py: Y1, pz: Z1 } = this;
      const { px: X2, py: Y2, pz: Z2 } = other;
      const U1 = Fp2.eql(Fp2.mul(X1, Z2), Fp2.mul(X2, Z1));
      const U2 = Fp2.eql(Fp2.mul(Y1, Z2), Fp2.mul(Y2, Z1));
      return U1 && U2;
    }
    /**
     * Flips point to one corresponding to (x, -y) in Affine coordinates.
     */
    negate() {
      return new Point2(this.px, Fp2.neg(this.py), this.pz);
    }
    // Renes-Costello-Batina exception-free doubling formula.
    // There is 30% faster Jacobian formula, but it is not complete.
    // https://eprint.iacr.org/2015/1060, algorithm 3
    // Cost: 8M + 3S + 3*a + 2*b3 + 15add.
    double() {
      const { a, b: b2 } = CURVE;
      const b3 = Fp2.mul(b2, _3n2);
      const { px: X1, py: Y1, pz: Z1 } = this;
      let X3 = Fp2.ZERO, Y3 = Fp2.ZERO, Z3 = Fp2.ZERO;
      let t0 = Fp2.mul(X1, X1);
      let t1 = Fp2.mul(Y1, Y1);
      let t2 = Fp2.mul(Z1, Z1);
      let t3 = Fp2.mul(X1, Y1);
      t3 = Fp2.add(t3, t3);
      Z3 = Fp2.mul(X1, Z1);
      Z3 = Fp2.add(Z3, Z3);
      X3 = Fp2.mul(a, Z3);
      Y3 = Fp2.mul(b3, t2);
      Y3 = Fp2.add(X3, Y3);
      X3 = Fp2.sub(t1, Y3);
      Y3 = Fp2.add(t1, Y3);
      Y3 = Fp2.mul(X3, Y3);
      X3 = Fp2.mul(t3, X3);
      Z3 = Fp2.mul(b3, Z3);
      t2 = Fp2.mul(a, t2);
      t3 = Fp2.sub(t0, t2);
      t3 = Fp2.mul(a, t3);
      t3 = Fp2.add(t3, Z3);
      Z3 = Fp2.add(t0, t0);
      t0 = Fp2.add(Z3, t0);
      t0 = Fp2.add(t0, t2);
      t0 = Fp2.mul(t0, t3);
      Y3 = Fp2.add(Y3, t0);
      t2 = Fp2.mul(Y1, Z1);
      t2 = Fp2.add(t2, t2);
      t0 = Fp2.mul(t2, t3);
      X3 = Fp2.sub(X3, t0);
      Z3 = Fp2.mul(t2, t1);
      Z3 = Fp2.add(Z3, Z3);
      Z3 = Fp2.add(Z3, Z3);
      return new Point2(X3, Y3, Z3);
    }
    // Renes-Costello-Batina exception-free addition formula.
    // There is 30% faster Jacobian formula, but it is not complete.
    // https://eprint.iacr.org/2015/1060, algorithm 1
    // Cost: 12M + 0S + 3*a + 3*b3 + 23add.
    add(other) {
      assertPrjPoint(other);
      const { px: X1, py: Y1, pz: Z1 } = this;
      const { px: X2, py: Y2, pz: Z2 } = other;
      let X3 = Fp2.ZERO, Y3 = Fp2.ZERO, Z3 = Fp2.ZERO;
      const a = CURVE.a;
      const b3 = Fp2.mul(CURVE.b, _3n2);
      let t0 = Fp2.mul(X1, X2);
      let t1 = Fp2.mul(Y1, Y2);
      let t2 = Fp2.mul(Z1, Z2);
      let t3 = Fp2.add(X1, Y1);
      let t4 = Fp2.add(X2, Y2);
      t3 = Fp2.mul(t3, t4);
      t4 = Fp2.add(t0, t1);
      t3 = Fp2.sub(t3, t4);
      t4 = Fp2.add(X1, Z1);
      let t5 = Fp2.add(X2, Z2);
      t4 = Fp2.mul(t4, t5);
      t5 = Fp2.add(t0, t2);
      t4 = Fp2.sub(t4, t5);
      t5 = Fp2.add(Y1, Z1);
      X3 = Fp2.add(Y2, Z2);
      t5 = Fp2.mul(t5, X3);
      X3 = Fp2.add(t1, t2);
      t5 = Fp2.sub(t5, X3);
      Z3 = Fp2.mul(a, t4);
      X3 = Fp2.mul(b3, t2);
      Z3 = Fp2.add(X3, Z3);
      X3 = Fp2.sub(t1, Z3);
      Z3 = Fp2.add(t1, Z3);
      Y3 = Fp2.mul(X3, Z3);
      t1 = Fp2.add(t0, t0);
      t1 = Fp2.add(t1, t0);
      t2 = Fp2.mul(a, t2);
      t4 = Fp2.mul(b3, t4);
      t1 = Fp2.add(t1, t2);
      t2 = Fp2.sub(t0, t2);
      t2 = Fp2.mul(a, t2);
      t4 = Fp2.add(t4, t2);
      t0 = Fp2.mul(t1, t4);
      Y3 = Fp2.add(Y3, t0);
      t0 = Fp2.mul(t5, t4);
      X3 = Fp2.mul(t3, X3);
      X3 = Fp2.sub(X3, t0);
      t0 = Fp2.mul(t3, t1);
      Z3 = Fp2.mul(t5, Z3);
      Z3 = Fp2.add(Z3, t0);
      return new Point2(X3, Y3, Z3);
    }
    subtract(other) {
      return this.add(other.negate());
    }
    is0() {
      return this.equals(Point2.ZERO);
    }
    wNAF(n2) {
      return wnaf.wNAFCached(this, pointPrecomputes, n2, (comp) => {
        const toInv = Fp2.invertBatch(comp.map((p) => p.pz));
        return comp.map((p, i) => p.toAffine(toInv[i])).map(Point2.fromAffine);
      });
    }
    /**
     * Non-constant-time multiplication. Uses double-and-add algorithm.
     * It's faster, but should only be used when you don't care about
     * an exposed private key e.g. sig verification, which works over *public* keys.
     */
    multiplyUnsafe(n2) {
      const I = Point2.ZERO;
      if (n2 === _0n5)
        return I;
      assertGE(n2);
      if (n2 === _1n5)
        return this;
      const { endo } = CURVE;
      if (!endo)
        return wnaf.unsafeLadder(this, n2);
      let { k1neg, k1, k2neg, k2 } = endo.splitScalar(n2);
      let k1p = I;
      let k2p = I;
      let d = this;
      while (k1 > _0n5 || k2 > _0n5) {
        if (k1 & _1n5)
          k1p = k1p.add(d);
        if (k2 & _1n5)
          k2p = k2p.add(d);
        d = d.double();
        k1 >>= _1n5;
        k2 >>= _1n5;
      }
      if (k1neg)
        k1p = k1p.negate();
      if (k2neg)
        k2p = k2p.negate();
      k2p = new Point2(Fp2.mul(k2p.px, endo.beta), k2p.py, k2p.pz);
      return k1p.add(k2p);
    }
    /**
     * Constant time multiplication.
     * Uses wNAF method. Windowed method may be 10% faster,
     * but takes 2x longer to generate and consumes 2x memory.
     * Uses precomputes when available.
     * Uses endomorphism for Koblitz curves.
     * @param scalar by which the point would be multiplied
     * @returns New point
     */
    multiply(scalar) {
      assertGE(scalar);
      let n2 = scalar;
      let point, fake;
      const { endo } = CURVE;
      if (endo) {
        const { k1neg, k1, k2neg, k2 } = endo.splitScalar(n2);
        let { p: k1p, f: f1p } = this.wNAF(k1);
        let { p: k2p, f: f2p } = this.wNAF(k2);
        k1p = wnaf.constTimeNegate(k1neg, k1p);
        k2p = wnaf.constTimeNegate(k2neg, k2p);
        k2p = new Point2(Fp2.mul(k2p.px, endo.beta), k2p.py, k2p.pz);
        point = k1p.add(k2p);
        fake = f1p.add(f2p);
      } else {
        const { p, f } = this.wNAF(n2);
        point = p;
        fake = f;
      }
      return Point2.normalizeZ([point, fake])[0];
    }
    /**
     * Efficiently calculate `aP + bQ`. Unsafe, can expose private key, if used incorrectly.
     * Not using Strauss-Shamir trick: precomputation tables are faster.
     * The trick could be useful if both P and Q are not G (not in our case).
     * @returns non-zero affine point
     */
    multiplyAndAddUnsafe(Q, a, b2) {
      const G = Point2.BASE;
      const mul = (P, a2) => a2 === _0n5 || a2 === _1n5 || !P.equals(G) ? P.multiplyUnsafe(a2) : P.multiply(a2);
      const sum = mul(this, a).add(mul(Q, b2));
      return sum.is0() ? void 0 : sum;
    }
    // Converts Projective point to affine (x, y) coordinates.
    // Can accept precomputed Z^-1 - for example, from invertBatch.
    // (x, y, z) ∋ (x=x/z, y=y/z)
    toAffine(iz) {
      const { px: x, py: y, pz: z } = this;
      const is0 = this.is0();
      if (iz == null)
        iz = is0 ? Fp2.ONE : Fp2.inv(z);
      const ax = Fp2.mul(x, iz);
      const ay = Fp2.mul(y, iz);
      const zz = Fp2.mul(z, iz);
      if (is0)
        return { x: Fp2.ZERO, y: Fp2.ZERO };
      if (!Fp2.eql(zz, Fp2.ONE))
        throw new Error("invZ was invalid");
      return { x: ax, y: ay };
    }
    isTorsionFree() {
      const { h: cofactor, isTorsionFree } = CURVE;
      if (cofactor === _1n5)
        return true;
      if (isTorsionFree)
        return isTorsionFree(Point2, this);
      throw new Error("isTorsionFree() has not been declared for the elliptic curve");
    }
    clearCofactor() {
      const { h: cofactor, clearCofactor } = CURVE;
      if (cofactor === _1n5)
        return this;
      if (clearCofactor)
        return clearCofactor(Point2, this);
      return this.multiplyUnsafe(CURVE.h);
    }
    toRawBytes(isCompressed = true) {
      this.assertValidity();
      return toBytes2(Point2, this, isCompressed);
    }
    toHex(isCompressed = true) {
      return bytesToHex(this.toRawBytes(isCompressed));
    }
  }
  Point2.BASE = new Point2(CURVE.Gx, CURVE.Gy, Fp2.ONE);
  Point2.ZERO = new Point2(Fp2.ZERO, Fp2.ONE, Fp2.ZERO);
  const _bits = CURVE.nBitLength;
  const wnaf = wNAF(Point2, CURVE.endo ? Math.ceil(_bits / 2) : _bits);
  return {
    CURVE,
    ProjectivePoint: Point2,
    normPrivateKeyToScalar,
    weierstrassEquation,
    isWithinCurveOrder
  };
}
function validateOpts(curve) {
  const opts = validateBasic(curve);
  validateObject(opts, {
    hash: "hash",
    hmac: "function",
    randomBytes: "function"
  }, {
    bits2int: "function",
    bits2int_modN: "function",
    lowS: "boolean"
  });
  return Object.freeze({ lowS: true, ...opts });
}
function weierstrass(curveDef) {
  const CURVE = validateOpts(curveDef);
  const { Fp: Fp2, n: CURVE_ORDER } = CURVE;
  const compressedLen = Fp2.BYTES + 1;
  const uncompressedLen = 2 * Fp2.BYTES + 1;
  function isValidFieldElement(num) {
    return _0n5 < num && num < Fp2.ORDER;
  }
  function modN(a) {
    return mod(a, CURVE_ORDER);
  }
  function invN(a) {
    return invert(a, CURVE_ORDER);
  }
  const { ProjectivePoint: Point2, normPrivateKeyToScalar, weierstrassEquation, isWithinCurveOrder } = weierstrassPoints({
    ...CURVE,
    toBytes(_c, point, isCompressed) {
      const a = point.toAffine();
      const x = Fp2.toBytes(a.x);
      const cat = concatBytes2;
      if (isCompressed) {
        return cat(Uint8Array.from([point.hasEvenY() ? 2 : 3]), x);
      } else {
        return cat(Uint8Array.from([4]), x, Fp2.toBytes(a.y));
      }
    },
    fromBytes(bytes2) {
      const len = bytes2.length;
      const head = bytes2[0];
      const tail = bytes2.subarray(1);
      if (len === compressedLen && (head === 2 || head === 3)) {
        const x = bytesToNumberBE(tail);
        if (!isValidFieldElement(x))
          throw new Error("Point is not on curve");
        const y2 = weierstrassEquation(x);
        let y = Fp2.sqrt(y2);
        const isYOdd = (y & _1n5) === _1n5;
        const isHeadOdd = (head & 1) === 1;
        if (isHeadOdd !== isYOdd)
          y = Fp2.neg(y);
        return { x, y };
      } else if (len === uncompressedLen && head === 4) {
        const x = Fp2.fromBytes(tail.subarray(0, Fp2.BYTES));
        const y = Fp2.fromBytes(tail.subarray(Fp2.BYTES, 2 * Fp2.BYTES));
        return { x, y };
      } else {
        throw new Error(`Point of length ${len} was invalid. Expected ${compressedLen} compressed bytes or ${uncompressedLen} uncompressed bytes`);
      }
    }
  });
  const numToNByteStr = (num) => bytesToHex(numberToBytesBE(num, CURVE.nByteLength));
  function isBiggerThanHalfOrder(number2) {
    const HALF = CURVE_ORDER >> _1n5;
    return number2 > HALF;
  }
  function normalizeS(s) {
    return isBiggerThanHalfOrder(s) ? modN(-s) : s;
  }
  const slcNum = (b2, from, to) => bytesToNumberBE(b2.slice(from, to));
  class Signature2 {
    constructor(r, s, recovery) {
      this.r = r;
      this.s = s;
      this.recovery = recovery;
      this.assertValidity();
    }
    // pair (bytes of r, bytes of s)
    static fromCompact(hex) {
      const l = CURVE.nByteLength;
      hex = ensureBytes("compactSignature", hex, l * 2);
      return new Signature2(slcNum(hex, 0, l), slcNum(hex, l, 2 * l));
    }
    // DER encoded ECDSA signature
    // https://bitcoin.stackexchange.com/questions/57644/what-are-the-parts-of-a-bitcoin-transaction-input-script
    static fromDER(hex) {
      const { r, s } = DER.toSig(ensureBytes("DER", hex));
      return new Signature2(r, s);
    }
    assertValidity() {
      if (!isWithinCurveOrder(this.r))
        throw new Error("r must be 0 < r < CURVE.n");
      if (!isWithinCurveOrder(this.s))
        throw new Error("s must be 0 < s < CURVE.n");
    }
    addRecoveryBit(recovery) {
      return new Signature2(this.r, this.s, recovery);
    }
    recoverPublicKey(msgHash) {
      const { r, s, recovery: rec } = this;
      const h = bits2int_modN(ensureBytes("msgHash", msgHash));
      if (rec == null || ![0, 1, 2, 3].includes(rec))
        throw new Error("recovery id invalid");
      const radj = rec === 2 || rec === 3 ? r + CURVE.n : r;
      if (radj >= Fp2.ORDER)
        throw new Error("recovery id 2 or 3 invalid");
      const prefix = (rec & 1) === 0 ? "02" : "03";
      const R = Point2.fromHex(prefix + numToNByteStr(radj));
      const ir = invN(radj);
      const u1 = modN(-h * ir);
      const u2 = modN(s * ir);
      const Q = Point2.BASE.multiplyAndAddUnsafe(R, u1, u2);
      if (!Q)
        throw new Error("point at infinify");
      Q.assertValidity();
      return Q;
    }
    // Signatures should be low-s, to prevent malleability.
    hasHighS() {
      return isBiggerThanHalfOrder(this.s);
    }
    normalizeS() {
      return this.hasHighS() ? new Signature2(this.r, modN(-this.s), this.recovery) : this;
    }
    // DER-encoded
    toDERRawBytes() {
      return hexToBytes(this.toDERHex());
    }
    toDERHex() {
      return DER.hexFromSig({ r: this.r, s: this.s });
    }
    // padded bytes of r, then padded bytes of s
    toCompactRawBytes() {
      return hexToBytes(this.toCompactHex());
    }
    toCompactHex() {
      return numToNByteStr(this.r) + numToNByteStr(this.s);
    }
  }
  const utils = {
    isValidPrivateKey(privateKey) {
      try {
        normPrivateKeyToScalar(privateKey);
        return true;
      } catch (error) {
        return false;
      }
    },
    normPrivateKeyToScalar,
    /**
     * Produces cryptographically secure private key from random of size
     * (groupLen + ceil(groupLen / 2)) with modulo bias being negligible.
     */
    randomPrivateKey: () => {
      const length = getMinHashLength(CURVE.n);
      return mapHashToField(CURVE.randomBytes(length), CURVE.n);
    },
    /**
     * Creates precompute table for an arbitrary EC point. Makes point "cached".
     * Allows to massively speed-up `point.multiply(scalar)`.
     * @returns cached point
     * @example
     * const fast = utils.precompute(8, ProjectivePoint.fromHex(someonesPubKey));
     * fast.multiply(privKey); // much faster ECDH now
     */
    precompute(windowSize = 8, point = Point2.BASE) {
      point._setWindowSize(windowSize);
      point.multiply(BigInt(3));
      return point;
    }
  };
  function getPublicKey(privateKey, isCompressed = true) {
    return Point2.fromPrivateKey(privateKey).toRawBytes(isCompressed);
  }
  function isProbPub(item) {
    const arr = item instanceof Uint8Array;
    const str = typeof item === "string";
    const len = (arr || str) && item.length;
    if (arr)
      return len === compressedLen || len === uncompressedLen;
    if (str)
      return len === 2 * compressedLen || len === 2 * uncompressedLen;
    if (item instanceof Point2)
      return true;
    return false;
  }
  function getSharedSecret(privateA, publicB, isCompressed = true) {
    if (isProbPub(privateA))
      throw new Error("first arg must be private key");
    if (!isProbPub(publicB))
      throw new Error("second arg must be public key");
    const b2 = Point2.fromHex(publicB);
    return b2.multiply(normPrivateKeyToScalar(privateA)).toRawBytes(isCompressed);
  }
  const bits2int = CURVE.bits2int || function(bytes2) {
    const num = bytesToNumberBE(bytes2);
    const delta = bytes2.length * 8 - CURVE.nBitLength;
    return delta > 0 ? num >> BigInt(delta) : num;
  };
  const bits2int_modN = CURVE.bits2int_modN || function(bytes2) {
    return modN(bits2int(bytes2));
  };
  const ORDER_MASK = bitMask(CURVE.nBitLength);
  function int2octets(num) {
    if (typeof num !== "bigint")
      throw new Error("bigint expected");
    if (!(_0n5 <= num && num < ORDER_MASK))
      throw new Error(`bigint expected < 2^${CURVE.nBitLength}`);
    return numberToBytesBE(num, CURVE.nByteLength);
  }
  function prepSig(msgHash, privateKey, opts = defaultSigOpts) {
    if (["recovered", "canonical"].some((k) => k in opts))
      throw new Error("sign() legacy options not supported");
    const { hash: hash4, randomBytes: randomBytes6 } = CURVE;
    let { lowS, prehash, extraEntropy: ent } = opts;
    if (lowS == null)
      lowS = true;
    msgHash = ensureBytes("msgHash", msgHash);
    if (prehash)
      msgHash = ensureBytes("prehashed msgHash", hash4(msgHash));
    const h1int = bits2int_modN(msgHash);
    const d = normPrivateKeyToScalar(privateKey);
    const seedArgs = [int2octets(d), int2octets(h1int)];
    if (ent != null) {
      const e = ent === true ? randomBytes6(Fp2.BYTES) : ent;
      seedArgs.push(ensureBytes("extraEntropy", e));
    }
    const seed = concatBytes2(...seedArgs);
    const m = h1int;
    function k2sig(kBytes) {
      const k = bits2int(kBytes);
      if (!isWithinCurveOrder(k))
        return;
      const ik = invN(k);
      const q = Point2.BASE.multiply(k).toAffine();
      const r = modN(q.x);
      if (r === _0n5)
        return;
      const s = modN(ik * modN(m + r * d));
      if (s === _0n5)
        return;
      let recovery = (q.x === r ? 0 : 2) | Number(q.y & _1n5);
      let normS = s;
      if (lowS && isBiggerThanHalfOrder(s)) {
        normS = normalizeS(s);
        recovery ^= 1;
      }
      return new Signature2(r, normS, recovery);
    }
    return { seed, k2sig };
  }
  const defaultSigOpts = { lowS: CURVE.lowS, prehash: false };
  const defaultVerOpts = { lowS: CURVE.lowS, prehash: false };
  function sign(msgHash, privKey, opts = defaultSigOpts) {
    const { seed, k2sig } = prepSig(msgHash, privKey, opts);
    const C = CURVE;
    const drbg = createHmacDrbg(C.hash.outputLen, C.nByteLength, C.hmac);
    return drbg(seed, k2sig);
  }
  Point2.BASE._setWindowSize(8);
  function verify(signature, msgHash, publicKey, opts = defaultVerOpts) {
    const sg = signature;
    msgHash = ensureBytes("msgHash", msgHash);
    publicKey = ensureBytes("publicKey", publicKey);
    if ("strict" in opts)
      throw new Error("options.strict was renamed to lowS");
    const { lowS, prehash } = opts;
    let _sig = void 0;
    let P;
    try {
      if (typeof sg === "string" || sg instanceof Uint8Array) {
        try {
          _sig = Signature2.fromDER(sg);
        } catch (derError) {
          if (!(derError instanceof DER.Err))
            throw derError;
          _sig = Signature2.fromCompact(sg);
        }
      } else if (typeof sg === "object" && typeof sg.r === "bigint" && typeof sg.s === "bigint") {
        const { r: r2, s: s2 } = sg;
        _sig = new Signature2(r2, s2);
      } else {
        throw new Error("PARSE");
      }
      P = Point2.fromHex(publicKey);
    } catch (error) {
      if (error.message === "PARSE")
        throw new Error(`signature must be Signature instance, Uint8Array or hex string`);
      return false;
    }
    if (lowS && _sig.hasHighS())
      return false;
    if (prehash)
      msgHash = CURVE.hash(msgHash);
    const { r, s } = _sig;
    const h = bits2int_modN(msgHash);
    const is = invN(s);
    const u1 = modN(h * is);
    const u2 = modN(r * is);
    const R = Point2.BASE.multiplyAndAddUnsafe(P, u1, u2)?.toAffine();
    if (!R)
      return false;
    const v = modN(R.x);
    return v === r;
  }
  return {
    CURVE,
    getPublicKey,
    getSharedSecret,
    sign,
    verify,
    ProjectivePoint: Point2,
    Signature: Signature2,
    utils
  };
}
var b2n, h2b, DER, _0n5, _1n5, _2n4, _3n2, _4n2;
var init_weierstrass = __esm({
  "node_modules/@noble/curves/esm/abstract/weierstrass.js"() {
    init_modular();
    init_utils3();
    init_utils3();
    init_curve();
    ({ bytesToNumberBE: b2n, hexToBytes: h2b } = utils_exports);
    DER = {
      // asn.1 DER encoding utils
      Err: class DERErr extends Error {
        constructor(m = "") {
          super(m);
        }
      },
      _parseInt(data) {
        const { Err: E } = DER;
        if (data.length < 2 || data[0] !== 2)
          throw new E("Invalid signature integer tag");
        const len = data[1];
        const res = data.subarray(2, len + 2);
        if (!len || res.length !== len)
          throw new E("Invalid signature integer: wrong length");
        if (res[0] & 128)
          throw new E("Invalid signature integer: negative");
        if (res[0] === 0 && !(res[1] & 128))
          throw new E("Invalid signature integer: unnecessary leading zero");
        return { d: b2n(res), l: data.subarray(len + 2) };
      },
      toSig(hex) {
        const { Err: E } = DER;
        const data = typeof hex === "string" ? h2b(hex) : hex;
        if (!(data instanceof Uint8Array))
          throw new Error("ui8a expected");
        let l = data.length;
        if (l < 2 || data[0] != 48)
          throw new E("Invalid signature tag");
        if (data[1] !== l - 2)
          throw new E("Invalid signature: incorrect length");
        const { d: r, l: sBytes } = DER._parseInt(data.subarray(2));
        const { d: s, l: rBytesLeft } = DER._parseInt(sBytes);
        if (rBytesLeft.length)
          throw new E("Invalid signature: left bytes after parsing");
        return { r, s };
      },
      hexFromSig(sig) {
        const slice = (s2) => Number.parseInt(s2[0], 16) & 8 ? "00" + s2 : s2;
        const h = (num) => {
          const hex = num.toString(16);
          return hex.length & 1 ? `0${hex}` : hex;
        };
        const s = slice(h(sig.s));
        const r = slice(h(sig.r));
        const shl = s.length / 2;
        const rhl = r.length / 2;
        const sl = h(shl);
        const rl = h(rhl);
        return `30${h(rhl + shl + 4)}02${rl}${r}02${sl}${s}`;
      }
    };
    _0n5 = BigInt(0);
    _1n5 = BigInt(1);
    _2n4 = BigInt(2);
    _3n2 = BigInt(3);
    _4n2 = BigInt(4);
  }
});

// node_modules/@noble/curves/esm/_shortw_utils.js
function getHash(hash4) {
  return {
    hash: hash4,
    hmac: (key, ...msgs) => hmac(hash4, key, concatBytes(...msgs)),
    randomBytes
  };
}
function createCurve(curveDef, defHash) {
  const create = (hash4) => weierstrass({ ...curveDef, ...getHash(hash4) });
  return Object.freeze({ ...create(defHash), create });
}
var init_shortw_utils = __esm({
  "node_modules/@noble/curves/esm/_shortw_utils.js"() {
    init_hmac();
    init_utils2();
    init_weierstrass();
  }
});

// node_modules/@noble/curves/esm/secp256k1.js
function sqrtMod(y) {
  const P = secp256k1P;
  const _3n3 = BigInt(3), _6n = BigInt(6), _11n = BigInt(11), _22n = BigInt(22);
  const _23n = BigInt(23), _44n = BigInt(44), _88n = BigInt(88);
  const b2 = y * y * y % P;
  const b3 = b2 * b2 * y % P;
  const b6 = pow2(b3, _3n3, P) * b3 % P;
  const b9 = pow2(b6, _3n3, P) * b3 % P;
  const b11 = pow2(b9, _2n5, P) * b2 % P;
  const b22 = pow2(b11, _11n, P) * b11 % P;
  const b44 = pow2(b22, _22n, P) * b22 % P;
  const b88 = pow2(b44, _44n, P) * b44 % P;
  const b176 = pow2(b88, _88n, P) * b88 % P;
  const b220 = pow2(b176, _44n, P) * b44 % P;
  const b223 = pow2(b220, _3n3, P) * b3 % P;
  const t1 = pow2(b223, _23n, P) * b22 % P;
  const t2 = pow2(t1, _6n, P) * b2 % P;
  const root = pow2(t2, _2n5, P);
  if (!Fp.eql(Fp.sqr(root), y))
    throw new Error("Cannot find square root");
  return root;
}
var secp256k1P, secp256k1N, _1n6, _2n5, divNearest, Fp, secp256k1, _0n6, Point;
var init_secp256k1 = __esm({
  "node_modules/@noble/curves/esm/secp256k1.js"() {
    init_sha256();
    init_modular();
    init_shortw_utils();
    secp256k1P = BigInt("0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2f");
    secp256k1N = BigInt("0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141");
    _1n6 = BigInt(1);
    _2n5 = BigInt(2);
    divNearest = (a, b2) => (a + b2 / _2n5) / b2;
    Fp = Field(secp256k1P, void 0, void 0, { sqrt: sqrtMod });
    secp256k1 = createCurve({
      a: BigInt(0),
      b: BigInt(7),
      Fp,
      n: secp256k1N,
      // Base point (x, y) aka generator point
      Gx: BigInt("55066263022277343669578718895168534326250603453777594175500187360389116729240"),
      Gy: BigInt("32670510020758816978083085130507043184471273380659243275938904335757337482424"),
      h: BigInt(1),
      lowS: true,
      /**
       * secp256k1 belongs to Koblitz curves: it has efficiently computable endomorphism.
       * Endomorphism uses 2x less RAM, speeds up precomputation by 2x and ECDH / key recovery by 20%.
       * For precomputed wNAF it trades off 1/2 init time & 1/3 ram for 20% perf hit.
       * Explanation: https://gist.github.com/paulmillr/eb670806793e84df628a7c434a873066
       */
      endo: {
        beta: BigInt("0x7ae96a2b657c07106e64479eac3434e99cf0497512f58995c1396c28719501ee"),
        splitScalar: (k) => {
          const n2 = secp256k1N;
          const a1 = BigInt("0x3086d221a7d46bcde86c90e49284eb15");
          const b1 = -_1n6 * BigInt("0xe4437ed6010e88286f547fa90abfe4c3");
          const a2 = BigInt("0x114ca50f7a8e2f3f657c1108d9d44cfd8");
          const b2 = a1;
          const POW_2_128 = BigInt("0x100000000000000000000000000000000");
          const c1 = divNearest(b2 * k, n2);
          const c2 = divNearest(-b1 * k, n2);
          let k1 = mod(k - c1 * a1 - c2 * a2, n2);
          let k2 = mod(-c1 * b1 - c2 * b2, n2);
          const k1neg = k1 > POW_2_128;
          const k2neg = k2 > POW_2_128;
          if (k1neg)
            k1 = n2 - k1;
          if (k2neg)
            k2 = n2 - k2;
          if (k1 > POW_2_128 || k2 > POW_2_128) {
            throw new Error("splitScalar: Endomorphism failed, k=" + k);
          }
          return { k1neg, k1, k2neg, k2 };
        }
      }
    }, sha256);
    _0n6 = BigInt(0);
    Point = secp256k1.ProjectivePoint;
  }
});

// node_modules/ethers/lib.esm/constants/addresses.js
var ZeroAddress;
var init_addresses = __esm({
  "node_modules/ethers/lib.esm/constants/addresses.js"() {
    ZeroAddress = "0x0000000000000000000000000000000000000000";
  }
});

// node_modules/ethers/lib.esm/constants/hashes.js
var ZeroHash;
var init_hashes = __esm({
  "node_modules/ethers/lib.esm/constants/hashes.js"() {
    ZeroHash = "0x0000000000000000000000000000000000000000000000000000000000000000";
  }
});

// node_modules/ethers/lib.esm/constants/strings.js
var MessagePrefix;
var init_strings = __esm({
  "node_modules/ethers/lib.esm/constants/strings.js"() {
    MessagePrefix = "Ethereum Signed Message:\n";
  }
});

// node_modules/ethers/lib.esm/constants/index.js
var init_constants = __esm({
  "node_modules/ethers/lib.esm/constants/index.js"() {
    init_addresses();
    init_hashes();
    init_strings();
  }
});

// node_modules/ethers/lib.esm/crypto/signature.js
function toUint256(value) {
  return zeroPadValue(toBeArray(value), 32);
}
var BN_02, BN_12, BN_2, BN_27, BN_28, BN_35, BN_N, BN_N_2, inspect, _guard2, Signature;
var init_signature = __esm({
  "node_modules/ethers/lib.esm/crypto/signature.js"() {
    init_constants();
    init_utils();
    BN_02 = BigInt(0);
    BN_12 = BigInt(1);
    BN_2 = BigInt(2);
    BN_27 = BigInt(27);
    BN_28 = BigInt(28);
    BN_35 = BigInt(35);
    BN_N = BigInt("0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141");
    BN_N_2 = BN_N / BN_2;
    inspect = Symbol.for("nodejs.util.inspect.custom");
    _guard2 = {};
    Signature = class _Signature {
      #r;
      #s;
      #v;
      #networkV;
      /**
       *  The ``r`` value for a signature.
       *
       *  This represents the ``x`` coordinate of a "reference" or
       *  challenge point, from which the ``y`` can be computed.
       */
      get r() {
        return this.#r;
      }
      set r(value) {
        assertArgument(dataLength(value) === 32, "invalid r", "value", value);
        this.#r = hexlify(value);
      }
      /**
       *  The ``s`` value for a signature.
       */
      get s() {
        assertArgument(parseInt(this.#s.substring(0, 3)) < 8, "non-canonical s; use ._s", "s", this.#s);
        return this.#s;
      }
      set s(_value) {
        assertArgument(dataLength(_value) === 32, "invalid s", "value", _value);
        this.#s = hexlify(_value);
      }
      /**
       *  Return the s value, unchecked for EIP-2 compliance.
       *
       *  This should generally not be used and is for situations where
       *  a non-canonical S value might be relevant, such as Frontier blocks
       *  that were mined prior to EIP-2 or invalid Authorization List
       *  signatures.
       */
      get _s() {
        return this.#s;
      }
      /**
       *  Returns true if the Signature is valid for [[link-eip-2]] signatures.
       */
      isValid() {
        const s = BigInt(this.#s);
        return s <= BN_N_2;
      }
      /**
       *  The ``v`` value for a signature.
       *
       *  Since a given ``x`` value for ``r`` has two possible values for
       *  its correspondin ``y``, the ``v`` indicates which of the two ``y``
       *  values to use.
       *
       *  It is normalized to the values ``27`` or ``28`` for legacy
       *  purposes.
       */
      get v() {
        return this.#v;
      }
      set v(value) {
        const v = getNumber(value, "value");
        assertArgument(v === 27 || v === 28, "invalid v", "v", value);
        this.#v = v;
      }
      /**
       *  The EIP-155 ``v`` for legacy transactions. For non-legacy
       *  transactions, this value is ``null``.
       */
      get networkV() {
        return this.#networkV;
      }
      /**
       *  The chain ID for EIP-155 legacy transactions. For non-legacy
       *  transactions, this value is ``null``.
       */
      get legacyChainId() {
        const v = this.networkV;
        if (v == null) {
          return null;
        }
        return _Signature.getChainId(v);
      }
      /**
       *  The ``yParity`` for the signature.
       *
       *  See ``v`` for more details on how this value is used.
       */
      get yParity() {
        return this.v === 27 ? 0 : 1;
      }
      /**
       *  The [[link-eip-2098]] compact representation of the ``yParity``
       *  and ``s`` compacted into a single ``bytes32``.
       */
      get yParityAndS() {
        const yParityAndS = getBytes(this.s);
        if (this.yParity) {
          yParityAndS[0] |= 128;
        }
        return hexlify(yParityAndS);
      }
      /**
       *  The [[link-eip-2098]] compact representation.
       */
      get compactSerialized() {
        return concat([this.r, this.yParityAndS]);
      }
      /**
       *  The serialized representation.
       */
      get serialized() {
        return concat([this.r, this.s, this.yParity ? "0x1c" : "0x1b"]);
      }
      /**
       *  @private
       */
      constructor(guard, r, s, v) {
        assertPrivate(guard, _guard2, "Signature");
        this.#r = r;
        this.#s = s;
        this.#v = v;
        this.#networkV = null;
      }
      /**
       *  Returns the canonical signature.
       *
       *  This is only necessary when dealing with legacy transaction which
       *  did not enforce canonical S values (i.e. [[link-eip-2]]. Most
       *  developers should never require this.
       */
      getCanonical() {
        if (this.isValid()) {
          return this;
        }
        const s = BN_N - BigInt(this._s);
        const v = 55 - this.v;
        const result = new _Signature(_guard2, this.r, toUint256(s), v);
        if (this.networkV) {
          result.#networkV = this.networkV;
        }
        return result;
      }
      /**
       *  Returns a new identical [[Signature]].
       */
      clone() {
        const clone = new _Signature(_guard2, this.r, this._s, this.v);
        if (this.networkV) {
          clone.#networkV = this.networkV;
        }
        return clone;
      }
      /**
       *  Returns a representation that is compatible with ``JSON.stringify``.
       */
      toJSON() {
        const networkV = this.networkV;
        return {
          _type: "signature",
          networkV: networkV != null ? networkV.toString() : null,
          r: this.r,
          s: this._s,
          v: this.v
        };
      }
      [inspect]() {
        return this.toString();
      }
      toString() {
        if (this.isValid()) {
          return `Signature { r: ${this.r}, s: ${this._s}, v: ${this.v} }`;
        }
        return `Signature { r: ${this.r}, s: ${this._s}, v: ${this.v}, valid: false }`;
      }
      /**
       *  Compute the chain ID from the ``v`` in a legacy EIP-155 transactions.
       *
       *  @example:
       *    Signature.getChainId(45)
       *    //_result:
       *
       *    Signature.getChainId(46)
       *    //_result:
       */
      static getChainId(v) {
        const bv = getBigInt(v, "v");
        if (bv == BN_27 || bv == BN_28) {
          return BN_02;
        }
        assertArgument(bv >= BN_35, "invalid EIP-155 v", "v", v);
        return (bv - BN_35) / BN_2;
      }
      /**
       *  Compute the ``v`` for a chain ID for a legacy EIP-155 transactions.
       *
       *  Legacy transactions which use [[link-eip-155]] hijack the ``v``
       *  property to include the chain ID.
       *
       *  @example:
       *    Signature.getChainIdV(5, 27)
       *    //_result:
       *
       *    Signature.getChainIdV(5, 28)
       *    //_result:
       *
       */
      static getChainIdV(chainId, v) {
        return getBigInt(chainId) * BN_2 + BigInt(35 + v - 27);
      }
      /**
       *  Compute the normalized legacy transaction ``v`` from a ``yParirty``,
       *  a legacy transaction ``v`` or a legacy [[link-eip-155]] transaction.
       *
       *  @example:
       *    // The values 0 and 1 imply v is actually yParity
       *    Signature.getNormalizedV(0)
       *    //_result:
       *
       *    // Legacy non-EIP-1559 transaction (i.e. 27 or 28)
       *    Signature.getNormalizedV(27)
       *    //_result:
       *
       *    // Legacy EIP-155 transaction (i.e. >= 35)
       *    Signature.getNormalizedV(46)
       *    //_result:
       *
       *    // Invalid values throw
       *    Signature.getNormalizedV(5)
       *    //_error:
       */
      static getNormalizedV(v) {
        const bv = getBigInt(v);
        if (bv === BN_02 || bv === BN_27) {
          return 27;
        }
        if (bv === BN_12 || bv === BN_28) {
          return 28;
        }
        assertArgument(bv >= BN_35, "invalid v", "v", v);
        return bv & BN_12 ? 27 : 28;
      }
      /**
       *  Creates a new [[Signature]].
       *
       *  If no %%sig%% is provided, a new [[Signature]] is created
       *  with default values.
       *
       *  If %%sig%% is a string, it is parsed.
       */
      static from(sig) {
        function assertError(check, message) {
          assertArgument(check, message, "signature", sig);
        }
        ;
        if (sig == null) {
          return new _Signature(_guard2, ZeroHash, ZeroHash, 27);
        }
        if (typeof sig === "string") {
          const bytes2 = getBytes(sig, "signature");
          if (bytes2.length === 64) {
            const r2 = hexlify(bytes2.slice(0, 32));
            const s2 = bytes2.slice(32, 64);
            const v2 = s2[0] & 128 ? 28 : 27;
            s2[0] &= 127;
            return new _Signature(_guard2, r2, hexlify(s2), v2);
          }
          if (bytes2.length === 65) {
            const r2 = hexlify(bytes2.slice(0, 32));
            const s2 = hexlify(bytes2.slice(32, 64));
            const v2 = _Signature.getNormalizedV(bytes2[64]);
            return new _Signature(_guard2, r2, s2, v2);
          }
          assertError(false, "invalid raw signature length");
        }
        if (sig instanceof _Signature) {
          return sig.clone();
        }
        const _r = sig.r;
        assertError(_r != null, "missing r");
        const r = toUint256(_r);
        const s = function(s2, yParityAndS) {
          if (s2 != null) {
            return toUint256(s2);
          }
          if (yParityAndS != null) {
            assertError(isHexString(yParityAndS, 32), "invalid yParityAndS");
            const bytes2 = getBytes(yParityAndS);
            bytes2[0] &= 127;
            return hexlify(bytes2);
          }
          assertError(false, "missing s");
        }(sig.s, sig.yParityAndS);
        const { networkV, v } = function(_v, yParityAndS, yParity) {
          if (_v != null) {
            const v2 = getBigInt(_v);
            return {
              networkV: v2 >= BN_35 ? v2 : void 0,
              v: _Signature.getNormalizedV(v2)
            };
          }
          if (yParityAndS != null) {
            assertError(isHexString(yParityAndS, 32), "invalid yParityAndS");
            return { v: getBytes(yParityAndS)[0] & 128 ? 28 : 27 };
          }
          if (yParity != null) {
            switch (getNumber(yParity, "sig.yParity")) {
              case 0:
                return { v: 27 };
              case 1:
                return { v: 28 };
            }
            assertError(false, "invalid yParity");
          }
          assertError(false, "missing v");
        }(sig.v, sig.yParityAndS, sig.yParity);
        const result = new _Signature(_guard2, r, s, v);
        if (networkV) {
          result.#networkV = networkV;
        }
        assertError(sig.yParity == null || getNumber(sig.yParity, "sig.yParity") === result.yParity, "yParity mismatch");
        assertError(sig.yParityAndS == null || sig.yParityAndS === result.yParityAndS, "yParityAndS mismatch");
        return result;
      }
    };
  }
});

// node_modules/ethers/lib.esm/crypto/signing-key.js
var SigningKey;
var init_signing_key = __esm({
  "node_modules/ethers/lib.esm/crypto/signing-key.js"() {
    init_secp256k1();
    init_utils();
    init_signature();
    SigningKey = class _SigningKey {
      #privateKey;
      /**
       *  Creates a new **SigningKey** for %%privateKey%%.
       */
      constructor(privateKey) {
        assertArgument(dataLength(privateKey) === 32, "invalid private key", "privateKey", "[REDACTED]");
        this.#privateKey = hexlify(privateKey);
      }
      /**
       *  The private key.
       */
      get privateKey() {
        return this.#privateKey;
      }
      /**
       *  The uncompressed public key.
       *
       * This will always begin with the prefix ``0x04`` and be 132
       * characters long (the ``0x`` prefix and 130 hexadecimal nibbles).
       */
      get publicKey() {
        return _SigningKey.computePublicKey(this.#privateKey);
      }
      /**
       *  The compressed public key.
       *
       *  This will always begin with either the prefix ``0x02`` or ``0x03``
       *  and be 68 characters long (the ``0x`` prefix and 33 hexadecimal
       *  nibbles)
       */
      get compressedPublicKey() {
        return _SigningKey.computePublicKey(this.#privateKey, true);
      }
      /**
       *  Return the signature of the signed %%digest%%.
       */
      sign(digest) {
        assertArgument(dataLength(digest) === 32, "invalid digest length", "digest", digest);
        const sig = secp256k1.sign(getBytesCopy(digest), getBytesCopy(this.#privateKey), {
          lowS: true
        });
        return Signature.from({
          r: toBeHex(sig.r, 32),
          s: toBeHex(sig.s, 32),
          v: sig.recovery ? 28 : 27
        });
      }
      /**
       *  Returns the [[link-wiki-ecdh]] shared secret between this
       *  private key and the %%other%% key.
       *
       *  The %%other%% key may be any type of key, a raw public key,
       *  a compressed/uncompressed pubic key or aprivate key.
       *
       *  Best practice is usually to use a cryptographic hash on the
       *  returned value before using it as a symetric secret.
       *
       *  @example:
       *    sign1 = new SigningKey(id("some-secret-1"))
       *    sign2 = new SigningKey(id("some-secret-2"))
       *
       *    // Notice that privA.computeSharedSecret(pubB)...
       *    sign1.computeSharedSecret(sign2.publicKey)
       *    //_result:
       *
       *    // ...is equal to privB.computeSharedSecret(pubA).
       *    sign2.computeSharedSecret(sign1.publicKey)
       *    //_result:
       */
      computeSharedSecret(other) {
        const pubKey = _SigningKey.computePublicKey(other);
        return hexlify(secp256k1.getSharedSecret(getBytesCopy(this.#privateKey), getBytes(pubKey), false));
      }
      /**
       *  Compute the public key for %%key%%, optionally %%compressed%%.
       *
       *  The %%key%% may be any type of key, a raw public key, a
       *  compressed/uncompressed public key or private key.
       *
       *  @example:
       *    sign = new SigningKey(id("some-secret"));
       *
       *    // Compute the uncompressed public key for a private key
       *    SigningKey.computePublicKey(sign.privateKey)
       *    //_result:
       *
       *    // Compute the compressed public key for a private key
       *    SigningKey.computePublicKey(sign.privateKey, true)
       *    //_result:
       *
       *    // Compute the uncompressed public key
       *    SigningKey.computePublicKey(sign.publicKey, false);
       *    //_result:
       *
       *    // Compute the Compressed a public key
       *    SigningKey.computePublicKey(sign.publicKey, true);
       *    //_result:
       */
      static computePublicKey(key, compressed) {
        let bytes2 = getBytes(key, "key");
        if (bytes2.length === 32) {
          const pubKey = secp256k1.getPublicKey(bytes2, !!compressed);
          return hexlify(pubKey);
        }
        if (bytes2.length === 64) {
          const pub = new Uint8Array(65);
          pub[0] = 4;
          pub.set(bytes2, 1);
          bytes2 = pub;
        }
        const point = secp256k1.ProjectivePoint.fromHex(bytes2);
        return hexlify(point.toRawBytes(compressed));
      }
      /**
       *  Returns the public key for the private key which produced the
       *  %%signature%% for the given %%digest%%.
       *
       *  @example:
       *    key = new SigningKey(id("some-secret"))
       *    digest = id("hello world")
       *    sig = key.sign(digest)
       *
       *    // Notice the signer public key...
       *    key.publicKey
       *    //_result:
       *
       *    // ...is equal to the recovered public key
       *    SigningKey.recoverPublicKey(digest, sig)
       *    //_result:
       *
       */
      static recoverPublicKey(digest, signature) {
        assertArgument(dataLength(digest) === 32, "invalid digest length", "digest", digest);
        const sig = Signature.from(signature);
        let secpSig = secp256k1.Signature.fromCompact(getBytesCopy(concat([sig.r, sig.s])));
        secpSig = secpSig.addRecoveryBit(sig.yParity);
        const pubKey = secpSig.recoverPublicKey(getBytesCopy(digest));
        assertArgument(pubKey != null, "invalid signature for digest", "signature", signature);
        return "0x" + pubKey.toHex(false);
      }
      /**
       *  Returns the point resulting from adding the ellipic curve points
       *  %%p0%% and %%p1%%.
       *
       *  This is not a common function most developers should require, but
       *  can be useful for certain privacy-specific techniques.
       *
       *  For example, it is used by [[HDNodeWallet]] to compute child
       *  addresses from parent public keys and chain codes.
       */
      static addPoints(p0, p1, compressed) {
        const pub0 = secp256k1.ProjectivePoint.fromHex(_SigningKey.computePublicKey(p0).substring(2));
        const pub1 = secp256k1.ProjectivePoint.fromHex(_SigningKey.computePublicKey(p1).substring(2));
        return "0x" + pub0.add(pub1).toHex(!!compressed);
      }
    };
  }
});

// node_modules/ethers/lib.esm/crypto/index.js
var init_crypto = __esm({
  "node_modules/ethers/lib.esm/crypto/index.js"() {
    init_keccak();
    init_signing_key();
  }
});

// node_modules/ethers/lib.esm/address/address.js
function getChecksumAddress(address2) {
  address2 = address2.toLowerCase();
  const chars = address2.substring(2).split("");
  const expanded = new Uint8Array(40);
  for (let i = 0; i < 40; i++) {
    expanded[i] = chars[i].charCodeAt(0);
  }
  const hashed = getBytes(keccak256(expanded));
  for (let i = 0; i < 40; i += 2) {
    if (hashed[i >> 1] >> 4 >= 8) {
      chars[i] = chars[i].toUpperCase();
    }
    if ((hashed[i >> 1] & 15) >= 8) {
      chars[i + 1] = chars[i + 1].toUpperCase();
    }
  }
  return "0x" + chars.join("");
}
function ibanChecksum(address2) {
  address2 = address2.toUpperCase();
  address2 = address2.substring(4) + address2.substring(0, 2) + "00";
  let expanded = address2.split("").map((c) => {
    return ibanLookup[c];
  }).join("");
  while (expanded.length >= safeDigits) {
    let block = expanded.substring(0, safeDigits);
    expanded = parseInt(block, 10) % 97 + expanded.substring(block.length);
  }
  let checksum = String(98 - parseInt(expanded, 10) % 97);
  while (checksum.length < 2) {
    checksum = "0" + checksum;
  }
  return checksum;
}
function fromBase36(value) {
  value = value.toLowerCase();
  let result = BN_03;
  for (let i = 0; i < value.length; i++) {
    result = result * BN_36 + Base36[value[i]];
  }
  return result;
}
function getAddress(address2) {
  assertArgument(typeof address2 === "string", "invalid address", "address", address2);
  if (address2.match(/^(0x)?[0-9a-fA-F]{40}$/)) {
    if (!address2.startsWith("0x")) {
      address2 = "0x" + address2;
    }
    const result = getChecksumAddress(address2);
    assertArgument(!address2.match(/([A-F].*[a-f])|([a-f].*[A-F])/) || result === address2, "bad address checksum", "address", address2);
    return result;
  }
  if (address2.match(/^XE[0-9]{2}[0-9A-Za-z]{30,31}$/)) {
    assertArgument(address2.substring(2, 4) === ibanChecksum(address2), "bad icap checksum", "address", address2);
    let result = fromBase36(address2.substring(4)).toString(16);
    while (result.length < 40) {
      result = "0" + result;
    }
    return getChecksumAddress("0x" + result);
  }
  assertArgument(false, "invalid address", "address", address2);
}
var BN_03, BN_36, ibanLookup, safeDigits, Base36;
var init_address = __esm({
  "node_modules/ethers/lib.esm/address/address.js"() {
    init_crypto();
    init_utils();
    BN_03 = BigInt(0);
    BN_36 = BigInt(36);
    ibanLookup = {};
    for (let i = 0; i < 10; i++) {
      ibanLookup[String(i)] = String(i);
    }
    for (let i = 0; i < 26; i++) {
      ibanLookup[String.fromCharCode(65 + i)] = String(10 + i);
    }
    safeDigits = 15;
    Base36 = function() {
      ;
      const result = {};
      for (let i = 0; i < 36; i++) {
        const key = "0123456789abcdefghijklmnopqrstuvwxyz"[i];
        result[key] = BigInt(i);
      }
      return result;
    }();
  }
});

// node_modules/ethers/lib.esm/address/checks.js
function isAddress(value) {
  try {
    getAddress(value);
    return true;
  } catch (error) {
  }
  return false;
}
var init_checks = __esm({
  "node_modules/ethers/lib.esm/address/checks.js"() {
    init_address();
  }
});

// node_modules/ethers/lib.esm/address/index.js
var init_address2 = __esm({
  "node_modules/ethers/lib.esm/address/index.js"() {
    init_address();
    init_checks();
  }
});

// node_modules/ethers/lib.esm/abi/typed.js
function n(value, width) {
  let signed = false;
  if (width < 0) {
    signed = true;
    width *= -1;
  }
  return new Typed(_gaurd, `${signed ? "" : "u"}int${width}`, value, { signed, width });
}
function b(value, size) {
  return new Typed(_gaurd, `bytes${size ? size : ""}`, value, { size });
}
var _gaurd, _typedSymbol, Typed;
var init_typed = __esm({
  "node_modules/ethers/lib.esm/abi/typed.js"() {
    init_utils();
    _gaurd = {};
    _typedSymbol = Symbol.for("_ethers_typed");
    Typed = class _Typed {
      /**
       *  The type, as a Solidity-compatible type.
       */
      type;
      /**
       *  The actual value.
       */
      value;
      #options;
      /**
       *  @_ignore:
       */
      _typedSymbol;
      /**
       *  @_ignore:
       */
      constructor(gaurd, type, value, options) {
        if (options == null) {
          options = null;
        }
        assertPrivate(_gaurd, gaurd, "Typed");
        defineProperties(this, { _typedSymbol, type, value });
        this.#options = options;
        this.format();
      }
      /**
       *  Format the type as a Human-Readable type.
       */
      format() {
        if (this.type === "array") {
          throw new Error("");
        } else if (this.type === "dynamicArray") {
          throw new Error("");
        } else if (this.type === "tuple") {
          return `tuple(${this.value.map((v) => v.format()).join(",")})`;
        }
        return this.type;
      }
      /**
       *  The default value returned by this type.
       */
      defaultValue() {
        return 0;
      }
      /**
       *  The minimum value for numeric types.
       */
      minValue() {
        return 0;
      }
      /**
       *  The maximum value for numeric types.
       */
      maxValue() {
        return 0;
      }
      /**
       *  Returns ``true`` and provides a type guard is this is a [[TypedBigInt]].
       */
      isBigInt() {
        return !!this.type.match(/^u?int[0-9]+$/);
      }
      /**
       *  Returns ``true`` and provides a type guard is this is a [[TypedData]].
       */
      isData() {
        return this.type.startsWith("bytes");
      }
      /**
       *  Returns ``true`` and provides a type guard is this is a [[TypedString]].
       */
      isString() {
        return this.type === "string";
      }
      /**
       *  Returns the tuple name, if this is a tuple. Throws otherwise.
       */
      get tupleName() {
        if (this.type !== "tuple") {
          throw TypeError("not a tuple");
        }
        return this.#options;
      }
      // Returns the length of this type as an array
      // - `null` indicates the length is unforced, it could be dynamic
      // - `-1` indicates the length is dynamic
      // - any other value indicates it is a static array and is its length
      /**
       *  Returns the length of the array type or ``-1`` if it is dynamic.
       *
       *  Throws if the type is not an array.
       */
      get arrayLength() {
        if (this.type !== "array") {
          throw TypeError("not an array");
        }
        if (this.#options === true) {
          return -1;
        }
        if (this.#options === false) {
          return this.value.length;
        }
        return null;
      }
      /**
       *  Returns a new **Typed** of %%type%% with the %%value%%.
       */
      static from(type, value) {
        return new _Typed(_gaurd, type, value);
      }
      /**
       *  Return a new ``uint8`` type for %%v%%.
       */
      static uint8(v) {
        return n(v, 8);
      }
      /**
       *  Return a new ``uint16`` type for %%v%%.
       */
      static uint16(v) {
        return n(v, 16);
      }
      /**
       *  Return a new ``uint24`` type for %%v%%.
       */
      static uint24(v) {
        return n(v, 24);
      }
      /**
       *  Return a new ``uint32`` type for %%v%%.
       */
      static uint32(v) {
        return n(v, 32);
      }
      /**
       *  Return a new ``uint40`` type for %%v%%.
       */
      static uint40(v) {
        return n(v, 40);
      }
      /**
       *  Return a new ``uint48`` type for %%v%%.
       */
      static uint48(v) {
        return n(v, 48);
      }
      /**
       *  Return a new ``uint56`` type for %%v%%.
       */
      static uint56(v) {
        return n(v, 56);
      }
      /**
       *  Return a new ``uint64`` type for %%v%%.
       */
      static uint64(v) {
        return n(v, 64);
      }
      /**
       *  Return a new ``uint72`` type for %%v%%.
       */
      static uint72(v) {
        return n(v, 72);
      }
      /**
       *  Return a new ``uint80`` type for %%v%%.
       */
      static uint80(v) {
        return n(v, 80);
      }
      /**
       *  Return a new ``uint88`` type for %%v%%.
       */
      static uint88(v) {
        return n(v, 88);
      }
      /**
       *  Return a new ``uint96`` type for %%v%%.
       */
      static uint96(v) {
        return n(v, 96);
      }
      /**
       *  Return a new ``uint104`` type for %%v%%.
       */
      static uint104(v) {
        return n(v, 104);
      }
      /**
       *  Return a new ``uint112`` type for %%v%%.
       */
      static uint112(v) {
        return n(v, 112);
      }
      /**
       *  Return a new ``uint120`` type for %%v%%.
       */
      static uint120(v) {
        return n(v, 120);
      }
      /**
       *  Return a new ``uint128`` type for %%v%%.
       */
      static uint128(v) {
        return n(v, 128);
      }
      /**
       *  Return a new ``uint136`` type for %%v%%.
       */
      static uint136(v) {
        return n(v, 136);
      }
      /**
       *  Return a new ``uint144`` type for %%v%%.
       */
      static uint144(v) {
        return n(v, 144);
      }
      /**
       *  Return a new ``uint152`` type for %%v%%.
       */
      static uint152(v) {
        return n(v, 152);
      }
      /**
       *  Return a new ``uint160`` type for %%v%%.
       */
      static uint160(v) {
        return n(v, 160);
      }
      /**
       *  Return a new ``uint168`` type for %%v%%.
       */
      static uint168(v) {
        return n(v, 168);
      }
      /**
       *  Return a new ``uint176`` type for %%v%%.
       */
      static uint176(v) {
        return n(v, 176);
      }
      /**
       *  Return a new ``uint184`` type for %%v%%.
       */
      static uint184(v) {
        return n(v, 184);
      }
      /**
       *  Return a new ``uint192`` type for %%v%%.
       */
      static uint192(v) {
        return n(v, 192);
      }
      /**
       *  Return a new ``uint200`` type for %%v%%.
       */
      static uint200(v) {
        return n(v, 200);
      }
      /**
       *  Return a new ``uint208`` type for %%v%%.
       */
      static uint208(v) {
        return n(v, 208);
      }
      /**
       *  Return a new ``uint216`` type for %%v%%.
       */
      static uint216(v) {
        return n(v, 216);
      }
      /**
       *  Return a new ``uint224`` type for %%v%%.
       */
      static uint224(v) {
        return n(v, 224);
      }
      /**
       *  Return a new ``uint232`` type for %%v%%.
       */
      static uint232(v) {
        return n(v, 232);
      }
      /**
       *  Return a new ``uint240`` type for %%v%%.
       */
      static uint240(v) {
        return n(v, 240);
      }
      /**
       *  Return a new ``uint248`` type for %%v%%.
       */
      static uint248(v) {
        return n(v, 248);
      }
      /**
       *  Return a new ``uint256`` type for %%v%%.
       */
      static uint256(v) {
        return n(v, 256);
      }
      /**
       *  Return a new ``uint256`` type for %%v%%.
       */
      static uint(v) {
        return n(v, 256);
      }
      /**
       *  Return a new ``int8`` type for %%v%%.
       */
      static int8(v) {
        return n(v, -8);
      }
      /**
       *  Return a new ``int16`` type for %%v%%.
       */
      static int16(v) {
        return n(v, -16);
      }
      /**
       *  Return a new ``int24`` type for %%v%%.
       */
      static int24(v) {
        return n(v, -24);
      }
      /**
       *  Return a new ``int32`` type for %%v%%.
       */
      static int32(v) {
        return n(v, -32);
      }
      /**
       *  Return a new ``int40`` type for %%v%%.
       */
      static int40(v) {
        return n(v, -40);
      }
      /**
       *  Return a new ``int48`` type for %%v%%.
       */
      static int48(v) {
        return n(v, -48);
      }
      /**
       *  Return a new ``int56`` type for %%v%%.
       */
      static int56(v) {
        return n(v, -56);
      }
      /**
       *  Return a new ``int64`` type for %%v%%.
       */
      static int64(v) {
        return n(v, -64);
      }
      /**
       *  Return a new ``int72`` type for %%v%%.
       */
      static int72(v) {
        return n(v, -72);
      }
      /**
       *  Return a new ``int80`` type for %%v%%.
       */
      static int80(v) {
        return n(v, -80);
      }
      /**
       *  Return a new ``int88`` type for %%v%%.
       */
      static int88(v) {
        return n(v, -88);
      }
      /**
       *  Return a new ``int96`` type for %%v%%.
       */
      static int96(v) {
        return n(v, -96);
      }
      /**
       *  Return a new ``int104`` type for %%v%%.
       */
      static int104(v) {
        return n(v, -104);
      }
      /**
       *  Return a new ``int112`` type for %%v%%.
       */
      static int112(v) {
        return n(v, -112);
      }
      /**
       *  Return a new ``int120`` type for %%v%%.
       */
      static int120(v) {
        return n(v, -120);
      }
      /**
       *  Return a new ``int128`` type for %%v%%.
       */
      static int128(v) {
        return n(v, -128);
      }
      /**
       *  Return a new ``int136`` type for %%v%%.
       */
      static int136(v) {
        return n(v, -136);
      }
      /**
       *  Return a new ``int144`` type for %%v%%.
       */
      static int144(v) {
        return n(v, -144);
      }
      /**
       *  Return a new ``int52`` type for %%v%%.
       */
      static int152(v) {
        return n(v, -152);
      }
      /**
       *  Return a new ``int160`` type for %%v%%.
       */
      static int160(v) {
        return n(v, -160);
      }
      /**
       *  Return a new ``int168`` type for %%v%%.
       */
      static int168(v) {
        return n(v, -168);
      }
      /**
       *  Return a new ``int176`` type for %%v%%.
       */
      static int176(v) {
        return n(v, -176);
      }
      /**
       *  Return a new ``int184`` type for %%v%%.
       */
      static int184(v) {
        return n(v, -184);
      }
      /**
       *  Return a new ``int92`` type for %%v%%.
       */
      static int192(v) {
        return n(v, -192);
      }
      /**
       *  Return a new ``int200`` type for %%v%%.
       */
      static int200(v) {
        return n(v, -200);
      }
      /**
       *  Return a new ``int208`` type for %%v%%.
       */
      static int208(v) {
        return n(v, -208);
      }
      /**
       *  Return a new ``int216`` type for %%v%%.
       */
      static int216(v) {
        return n(v, -216);
      }
      /**
       *  Return a new ``int224`` type for %%v%%.
       */
      static int224(v) {
        return n(v, -224);
      }
      /**
       *  Return a new ``int232`` type for %%v%%.
       */
      static int232(v) {
        return n(v, -232);
      }
      /**
       *  Return a new ``int240`` type for %%v%%.
       */
      static int240(v) {
        return n(v, -240);
      }
      /**
       *  Return a new ``int248`` type for %%v%%.
       */
      static int248(v) {
        return n(v, -248);
      }
      /**
       *  Return a new ``int256`` type for %%v%%.
       */
      static int256(v) {
        return n(v, -256);
      }
      /**
       *  Return a new ``int256`` type for %%v%%.
       */
      static int(v) {
        return n(v, -256);
      }
      /**
       *  Return a new ``bytes1`` type for %%v%%.
       */
      static bytes1(v) {
        return b(v, 1);
      }
      /**
       *  Return a new ``bytes2`` type for %%v%%.
       */
      static bytes2(v) {
        return b(v, 2);
      }
      /**
       *  Return a new ``bytes3`` type for %%v%%.
       */
      static bytes3(v) {
        return b(v, 3);
      }
      /**
       *  Return a new ``bytes4`` type for %%v%%.
       */
      static bytes4(v) {
        return b(v, 4);
      }
      /**
       *  Return a new ``bytes5`` type for %%v%%.
       */
      static bytes5(v) {
        return b(v, 5);
      }
      /**
       *  Return a new ``bytes6`` type for %%v%%.
       */
      static bytes6(v) {
        return b(v, 6);
      }
      /**
       *  Return a new ``bytes7`` type for %%v%%.
       */
      static bytes7(v) {
        return b(v, 7);
      }
      /**
       *  Return a new ``bytes8`` type for %%v%%.
       */
      static bytes8(v) {
        return b(v, 8);
      }
      /**
       *  Return a new ``bytes9`` type for %%v%%.
       */
      static bytes9(v) {
        return b(v, 9);
      }
      /**
       *  Return a new ``bytes10`` type for %%v%%.
       */
      static bytes10(v) {
        return b(v, 10);
      }
      /**
       *  Return a new ``bytes11`` type for %%v%%.
       */
      static bytes11(v) {
        return b(v, 11);
      }
      /**
       *  Return a new ``bytes12`` type for %%v%%.
       */
      static bytes12(v) {
        return b(v, 12);
      }
      /**
       *  Return a new ``bytes13`` type for %%v%%.
       */
      static bytes13(v) {
        return b(v, 13);
      }
      /**
       *  Return a new ``bytes14`` type for %%v%%.
       */
      static bytes14(v) {
        return b(v, 14);
      }
      /**
       *  Return a new ``bytes15`` type for %%v%%.
       */
      static bytes15(v) {
        return b(v, 15);
      }
      /**
       *  Return a new ``bytes16`` type for %%v%%.
       */
      static bytes16(v) {
        return b(v, 16);
      }
      /**
       *  Return a new ``bytes17`` type for %%v%%.
       */
      static bytes17(v) {
        return b(v, 17);
      }
      /**
       *  Return a new ``bytes18`` type for %%v%%.
       */
      static bytes18(v) {
        return b(v, 18);
      }
      /**
       *  Return a new ``bytes19`` type for %%v%%.
       */
      static bytes19(v) {
        return b(v, 19);
      }
      /**
       *  Return a new ``bytes20`` type for %%v%%.
       */
      static bytes20(v) {
        return b(v, 20);
      }
      /**
       *  Return a new ``bytes21`` type for %%v%%.
       */
      static bytes21(v) {
        return b(v, 21);
      }
      /**
       *  Return a new ``bytes22`` type for %%v%%.
       */
      static bytes22(v) {
        return b(v, 22);
      }
      /**
       *  Return a new ``bytes23`` type for %%v%%.
       */
      static bytes23(v) {
        return b(v, 23);
      }
      /**
       *  Return a new ``bytes24`` type for %%v%%.
       */
      static bytes24(v) {
        return b(v, 24);
      }
      /**
       *  Return a new ``bytes25`` type for %%v%%.
       */
      static bytes25(v) {
        return b(v, 25);
      }
      /**
       *  Return a new ``bytes26`` type for %%v%%.
       */
      static bytes26(v) {
        return b(v, 26);
      }
      /**
       *  Return a new ``bytes27`` type for %%v%%.
       */
      static bytes27(v) {
        return b(v, 27);
      }
      /**
       *  Return a new ``bytes28`` type for %%v%%.
       */
      static bytes28(v) {
        return b(v, 28);
      }
      /**
       *  Return a new ``bytes29`` type for %%v%%.
       */
      static bytes29(v) {
        return b(v, 29);
      }
      /**
       *  Return a new ``bytes30`` type for %%v%%.
       */
      static bytes30(v) {
        return b(v, 30);
      }
      /**
       *  Return a new ``bytes31`` type for %%v%%.
       */
      static bytes31(v) {
        return b(v, 31);
      }
      /**
       *  Return a new ``bytes32`` type for %%v%%.
       */
      static bytes32(v) {
        return b(v, 32);
      }
      /**
       *  Return a new ``address`` type for %%v%%.
       */
      static address(v) {
        return new _Typed(_gaurd, "address", v);
      }
      /**
       *  Return a new ``bool`` type for %%v%%.
       */
      static bool(v) {
        return new _Typed(_gaurd, "bool", !!v);
      }
      /**
       *  Return a new ``bytes`` type for %%v%%.
       */
      static bytes(v) {
        return new _Typed(_gaurd, "bytes", v);
      }
      /**
       *  Return a new ``string`` type for %%v%%.
       */
      static string(v) {
        return new _Typed(_gaurd, "string", v);
      }
      /**
       *  Return a new ``array`` type for %%v%%, allowing %%dynamic%% length.
       */
      static array(v, dynamic) {
        throw new Error("not implemented yet");
        return new _Typed(_gaurd, "array", v, dynamic);
      }
      /**
       *  Return a new ``tuple`` type for %%v%%, with the optional %%name%%.
       */
      static tuple(v, name) {
        throw new Error("not implemented yet");
        return new _Typed(_gaurd, "tuple", v, name);
      }
      /**
       *  Return a new ``uint8`` type for %%v%%.
       */
      static overrides(v) {
        return new _Typed(_gaurd, "overrides", Object.assign({}, v));
      }
      /**
       *  Returns true only if %%value%% is a [[Typed]] instance.
       */
      static isTyped(value) {
        return value && typeof value === "object" && "_typedSymbol" in value && value._typedSymbol === _typedSymbol;
      }
      /**
       *  If the value is a [[Typed]] instance, validates the underlying value
       *  and returns it, otherwise returns value directly.
       *
       *  This is useful for functions that with to accept either a [[Typed]]
       *  object or values.
       */
      static dereference(value, type) {
        if (_Typed.isTyped(value)) {
          if (value.type !== type) {
            throw new Error(`invalid type: expecetd ${type}, got ${value.type}`);
          }
          return value.value;
        }
        return value;
      }
    };
  }
});

// node_modules/ethers/lib.esm/abi/coders/address.js
var AddressCoder;
var init_address3 = __esm({
  "node_modules/ethers/lib.esm/abi/coders/address.js"() {
    init_address2();
    init_maths();
    init_typed();
    init_abstract_coder();
    AddressCoder = class extends Coder {
      constructor(localName) {
        super("address", "address", localName, false);
      }
      defaultValue() {
        return "0x0000000000000000000000000000000000000000";
      }
      encode(writer, _value) {
        let value = Typed.dereference(_value, "string");
        try {
          value = getAddress(value);
        } catch (error) {
          return this._throwError(error.message, _value);
        }
        return writer.writeValue(value);
      }
      decode(reader) {
        return getAddress(toBeHex(reader.readValue(), 20));
      }
    };
  }
});

// node_modules/ethers/lib.esm/abi/coders/anonymous.js
var AnonymousCoder;
var init_anonymous = __esm({
  "node_modules/ethers/lib.esm/abi/coders/anonymous.js"() {
    init_abstract_coder();
    AnonymousCoder = class extends Coder {
      coder;
      constructor(coder3) {
        super(coder3.name, coder3.type, "_", coder3.dynamic);
        this.coder = coder3;
      }
      defaultValue() {
        return this.coder.defaultValue();
      }
      encode(writer, value) {
        return this.coder.encode(writer, value);
      }
      decode(reader) {
        return this.coder.decode(reader);
      }
    };
  }
});

// node_modules/ethers/lib.esm/abi/coders/array.js
function pack(writer, coders, values) {
  let arrayValues = [];
  if (Array.isArray(values)) {
    arrayValues = values;
  } else if (values && typeof values === "object") {
    let unique = {};
    arrayValues = coders.map((coder3) => {
      const name = coder3.localName;
      assert(name, "cannot encode object for signature with missing names", "INVALID_ARGUMENT", { argument: "values", info: { coder: coder3 }, value: values });
      assert(!unique[name], "cannot encode object for signature with duplicate names", "INVALID_ARGUMENT", { argument: "values", info: { coder: coder3 }, value: values });
      unique[name] = true;
      return values[name];
    });
  } else {
    assertArgument(false, "invalid tuple value", "tuple", values);
  }
  assertArgument(coders.length === arrayValues.length, "types/value length mismatch", "tuple", values);
  let staticWriter = new Writer();
  let dynamicWriter = new Writer();
  let updateFuncs = [];
  coders.forEach((coder3, index) => {
    let value = arrayValues[index];
    if (coder3.dynamic) {
      let dynamicOffset = dynamicWriter.length;
      coder3.encode(dynamicWriter, value);
      let updateFunc = staticWriter.writeUpdatableValue();
      updateFuncs.push((baseOffset) => {
        updateFunc(baseOffset + dynamicOffset);
      });
    } else {
      coder3.encode(staticWriter, value);
    }
  });
  updateFuncs.forEach((func) => {
    func(staticWriter.length);
  });
  let length = writer.appendWriter(staticWriter);
  length += writer.appendWriter(dynamicWriter);
  return length;
}
function unpack(reader, coders) {
  let values = [];
  let keys = [];
  let baseReader = reader.subReader(0);
  coders.forEach((coder3) => {
    let value = null;
    if (coder3.dynamic) {
      let offset = reader.readIndex();
      let offsetReader = baseReader.subReader(offset);
      try {
        value = coder3.decode(offsetReader);
      } catch (error) {
        if (isError(error, "BUFFER_OVERRUN")) {
          throw error;
        }
        value = error;
        value.baseType = coder3.name;
        value.name = coder3.localName;
        value.type = coder3.type;
      }
    } else {
      try {
        value = coder3.decode(reader);
      } catch (error) {
        if (isError(error, "BUFFER_OVERRUN")) {
          throw error;
        }
        value = error;
        value.baseType = coder3.name;
        value.name = coder3.localName;
        value.type = coder3.type;
      }
    }
    if (value == void 0) {
      throw new Error("investigate");
    }
    values.push(value);
    keys.push(coder3.localName || null);
  });
  return Result.fromItems(values, keys);
}
var ArrayCoder;
var init_array = __esm({
  "node_modules/ethers/lib.esm/abi/coders/array.js"() {
    init_utils();
    init_typed();
    init_abstract_coder();
    init_anonymous();
    ArrayCoder = class extends Coder {
      coder;
      length;
      constructor(coder3, length, localName) {
        const type = coder3.type + "[" + (length >= 0 ? length : "") + "]";
        const dynamic = length === -1 || coder3.dynamic;
        super("array", type, localName, dynamic);
        defineProperties(this, { coder: coder3, length });
      }
      defaultValue() {
        const defaultChild = this.coder.defaultValue();
        const result = [];
        for (let i = 0; i < this.length; i++) {
          result.push(defaultChild);
        }
        return result;
      }
      encode(writer, _value) {
        const value = Typed.dereference(_value, "array");
        if (!Array.isArray(value)) {
          this._throwError("expected array value", value);
        }
        let count = this.length;
        if (count === -1) {
          count = value.length;
          writer.writeValue(value.length);
        }
        assertArgumentCount(value.length, count, "coder array" + (this.localName ? " " + this.localName : ""));
        let coders = [];
        for (let i = 0; i < value.length; i++) {
          coders.push(this.coder);
        }
        return pack(writer, coders, value);
      }
      decode(reader) {
        let count = this.length;
        if (count === -1) {
          count = reader.readIndex();
          assert(count * WordSize <= reader.dataLength, "insufficient data length", "BUFFER_OVERRUN", { buffer: reader.bytes, offset: count * WordSize, length: reader.dataLength });
        }
        let coders = [];
        for (let i = 0; i < count; i++) {
          coders.push(new AnonymousCoder(this.coder));
        }
        return unpack(reader, coders);
      }
    };
  }
});

// node_modules/ethers/lib.esm/abi/coders/boolean.js
var BooleanCoder;
var init_boolean = __esm({
  "node_modules/ethers/lib.esm/abi/coders/boolean.js"() {
    init_typed();
    init_abstract_coder();
    BooleanCoder = class extends Coder {
      constructor(localName) {
        super("bool", "bool", localName, false);
      }
      defaultValue() {
        return false;
      }
      encode(writer, _value) {
        const value = Typed.dereference(_value, "bool");
        return writer.writeValue(value ? 1 : 0);
      }
      decode(reader) {
        return !!reader.readValue();
      }
    };
  }
});

// node_modules/ethers/lib.esm/abi/coders/bytes.js
var DynamicBytesCoder, BytesCoder;
var init_bytes = __esm({
  "node_modules/ethers/lib.esm/abi/coders/bytes.js"() {
    init_utils();
    init_abstract_coder();
    DynamicBytesCoder = class extends Coder {
      constructor(type, localName) {
        super(type, type, localName, true);
      }
      defaultValue() {
        return "0x";
      }
      encode(writer, value) {
        value = getBytesCopy(value);
        let length = writer.writeValue(value.length);
        length += writer.writeBytes(value);
        return length;
      }
      decode(reader) {
        return reader.readBytes(reader.readIndex(), true);
      }
    };
    BytesCoder = class extends DynamicBytesCoder {
      constructor(localName) {
        super("bytes", localName);
      }
      decode(reader) {
        return hexlify(super.decode(reader));
      }
    };
  }
});

// node_modules/ethers/lib.esm/abi/coders/fixed-bytes.js
var FixedBytesCoder;
var init_fixed_bytes = __esm({
  "node_modules/ethers/lib.esm/abi/coders/fixed-bytes.js"() {
    init_utils();
    init_typed();
    init_abstract_coder();
    FixedBytesCoder = class extends Coder {
      size;
      constructor(size, localName) {
        let name = "bytes" + String(size);
        super(name, name, localName, false);
        defineProperties(this, { size }, { size: "number" });
      }
      defaultValue() {
        return "0x0000000000000000000000000000000000000000000000000000000000000000".substring(0, 2 + this.size * 2);
      }
      encode(writer, _value) {
        let data = getBytesCopy(Typed.dereference(_value, this.type));
        if (data.length !== this.size) {
          this._throwError("incorrect data length", _value);
        }
        return writer.writeBytes(data);
      }
      decode(reader) {
        return hexlify(reader.readBytes(this.size));
      }
    };
  }
});

// node_modules/ethers/lib.esm/abi/coders/null.js
var Empty, NullCoder;
var init_null = __esm({
  "node_modules/ethers/lib.esm/abi/coders/null.js"() {
    init_abstract_coder();
    Empty = new Uint8Array([]);
    NullCoder = class extends Coder {
      constructor(localName) {
        super("null", "", localName, false);
      }
      defaultValue() {
        return null;
      }
      encode(writer, value) {
        if (value != null) {
          this._throwError("not null", value);
        }
        return writer.writeBytes(Empty);
      }
      decode(reader) {
        reader.readBytes(0);
        return null;
      }
    };
  }
});

// node_modules/ethers/lib.esm/abi/coders/number.js
var BN_04, BN_13, BN_MAX_UINT256, NumberCoder;
var init_number = __esm({
  "node_modules/ethers/lib.esm/abi/coders/number.js"() {
    init_utils();
    init_typed();
    init_abstract_coder();
    BN_04 = BigInt(0);
    BN_13 = BigInt(1);
    BN_MAX_UINT256 = BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
    NumberCoder = class extends Coder {
      size;
      signed;
      constructor(size, signed, localName) {
        const name = (signed ? "int" : "uint") + size * 8;
        super(name, name, localName, false);
        defineProperties(this, { size, signed }, { size: "number", signed: "boolean" });
      }
      defaultValue() {
        return 0;
      }
      encode(writer, _value) {
        let value = getBigInt(Typed.dereference(_value, this.type));
        let maxUintValue = mask(BN_MAX_UINT256, WordSize * 8);
        if (this.signed) {
          let bounds = mask(maxUintValue, this.size * 8 - 1);
          if (value > bounds || value < -(bounds + BN_13)) {
            this._throwError("value out-of-bounds", _value);
          }
          value = toTwos(value, 8 * WordSize);
        } else if (value < BN_04 || value > mask(maxUintValue, this.size * 8)) {
          this._throwError("value out-of-bounds", _value);
        }
        return writer.writeValue(value);
      }
      decode(reader) {
        let value = mask(reader.readValue(), this.size * 8);
        if (this.signed) {
          value = fromTwos(value, this.size * 8);
        }
        return value;
      }
    };
  }
});

// node_modules/ethers/lib.esm/abi/coders/string.js
var StringCoder;
var init_string = __esm({
  "node_modules/ethers/lib.esm/abi/coders/string.js"() {
    init_utf8();
    init_typed();
    init_bytes();
    StringCoder = class extends DynamicBytesCoder {
      constructor(localName) {
        super("string", localName);
      }
      defaultValue() {
        return "";
      }
      encode(writer, _value) {
        return super.encode(writer, toUtf8Bytes(Typed.dereference(_value, "string")));
      }
      decode(reader) {
        return toUtf8String(super.decode(reader));
      }
    };
  }
});

// node_modules/ethers/lib.esm/abi/coders/tuple.js
var TupleCoder;
var init_tuple = __esm({
  "node_modules/ethers/lib.esm/abi/coders/tuple.js"() {
    init_properties();
    init_typed();
    init_abstract_coder();
    init_array();
    TupleCoder = class extends Coder {
      coders;
      constructor(coders, localName) {
        let dynamic = false;
        const types = [];
        coders.forEach((coder3) => {
          if (coder3.dynamic) {
            dynamic = true;
          }
          types.push(coder3.type);
        });
        const type = "tuple(" + types.join(",") + ")";
        super("tuple", type, localName, dynamic);
        defineProperties(this, { coders: Object.freeze(coders.slice()) });
      }
      defaultValue() {
        const values = [];
        this.coders.forEach((coder3) => {
          values.push(coder3.defaultValue());
        });
        const uniqueNames = this.coders.reduce((accum, coder3) => {
          const name = coder3.localName;
          if (name) {
            if (!accum[name]) {
              accum[name] = 0;
            }
            accum[name]++;
          }
          return accum;
        }, {});
        this.coders.forEach((coder3, index) => {
          let name = coder3.localName;
          if (!name || uniqueNames[name] !== 1) {
            return;
          }
          if (name === "length") {
            name = "_length";
          }
          if (values[name] != null) {
            return;
          }
          values[name] = values[index];
        });
        return Object.freeze(values);
      }
      encode(writer, _value) {
        const value = Typed.dereference(_value, "tuple");
        return pack(writer, this.coders, value);
      }
      decode(reader) {
        return unpack(reader, this.coders);
      }
    };
  }
});

// node_modules/ethers/lib.esm/transaction/address.js
function computeAddress(key) {
  let pubkey;
  if (typeof key === "string") {
    pubkey = SigningKey.computePublicKey(key, false);
  } else {
    pubkey = key.publicKey;
  }
  return getAddress(keccak256("0x" + pubkey.substring(4)).substring(26));
}
function recoverAddress(digest, signature) {
  return computeAddress(SigningKey.recoverPublicKey(digest, signature));
}
var init_address4 = __esm({
  "node_modules/ethers/lib.esm/transaction/address.js"() {
    init_address2();
    init_crypto();
  }
});

// node_modules/ethers/lib.esm/transaction/index.js
var init_transaction = __esm({
  "node_modules/ethers/lib.esm/transaction/index.js"() {
    init_address4();
  }
});

// node_modules/ethers/lib.esm/hash/id.js
function id(value) {
  return keccak256(toUtf8Bytes(value));
}
var init_id = __esm({
  "node_modules/ethers/lib.esm/hash/id.js"() {
    init_crypto();
    init_utils();
  }
});

// node_modules/ethers/lib.esm/hash/message.js
function hashMessage(message) {
  if (typeof message === "string") {
    message = toUtf8Bytes(message);
  }
  return keccak256(concat([
    toUtf8Bytes(MessagePrefix),
    toUtf8Bytes(String(message.length)),
    message
  ]));
}
function verifyMessage(message, sig) {
  const digest = hashMessage(message);
  return recoverAddress(digest, sig);
}
var init_message = __esm({
  "node_modules/ethers/lib.esm/hash/message.js"() {
    init_crypto();
    init_constants();
    init_transaction();
    init_utils();
  }
});

// node_modules/ethers/lib.esm/hash/typed-data.js
function hexPadRight(value) {
  const bytes2 = getBytes(value);
  const padOffset = bytes2.length % 32;
  if (padOffset) {
    return concat([bytes2, padding.slice(padOffset)]);
  }
  return hexlify(bytes2);
}
function checkString(key) {
  return function(value) {
    assertArgument(typeof value === "string", `invalid domain value for ${JSON.stringify(key)}`, `domain.${key}`, value);
    return value;
  };
}
function getBaseEncoder(type) {
  {
    const match = type.match(/^(u?)int(\d+)$/);
    if (match) {
      const signed = match[1] === "";
      const width = parseInt(match[2]);
      assertArgument(width % 8 === 0 && width !== 0 && width <= 256 && match[2] === String(width), "invalid numeric width", "type", type);
      const boundsUpper = mask(BN_MAX_UINT2562, signed ? width - 1 : width);
      const boundsLower = signed ? (boundsUpper + BN_14) * BN__1 : BN_05;
      return function(_value) {
        const value = getBigInt(_value, "value");
        assertArgument(value >= boundsLower && value <= boundsUpper, `value out-of-bounds for ${type}`, "value", value);
        return toBeHex(signed ? toTwos(value, 256) : value, 32);
      };
    }
  }
  {
    const match = type.match(/^bytes(\d+)$/);
    if (match) {
      const width = parseInt(match[1]);
      assertArgument(width !== 0 && width <= 32 && match[1] === String(width), "invalid bytes width", "type", type);
      return function(value) {
        const bytes2 = getBytes(value);
        assertArgument(bytes2.length === width, `invalid length for ${type}`, "value", value);
        return hexPadRight(value);
      };
    }
  }
  switch (type) {
    case "address":
      return function(value) {
        return zeroPadValue(getAddress(value), 32);
      };
    case "bool":
      return function(value) {
        return !value ? hexFalse : hexTrue;
      };
    case "bytes":
      return function(value) {
        return keccak256(value);
      };
    case "string":
      return function(value) {
        return id(value);
      };
  }
  return null;
}
function encodeType(name, fields) {
  return `${name}(${fields.map(({ name: name2, type }) => type + " " + name2).join(",")})`;
}
function splitArray(type) {
  const match = type.match(/^([^\x5b]*)((\x5b\d*\x5d)*)(\x5b(\d*)\x5d)$/);
  if (match) {
    return {
      base: match[1],
      index: match[2] + match[4],
      array: {
        base: match[1],
        prefix: match[1] + match[2],
        count: match[5] ? parseInt(match[5]) : -1
      }
    };
  }
  return { base: type };
}
function verifyTypedData(domain, types, value, signature) {
  return recoverAddress(TypedDataEncoder.hash(domain, types, value), signature);
}
var padding, BN__1, BN_05, BN_14, BN_MAX_UINT2562, hexTrue, hexFalse, domainFieldTypes, domainFieldNames, domainChecks, TypedDataEncoder;
var init_typed_data = __esm({
  "node_modules/ethers/lib.esm/hash/typed-data.js"() {
    init_address2();
    init_crypto();
    init_transaction();
    init_utils();
    init_id();
    padding = new Uint8Array(32);
    padding.fill(0);
    BN__1 = BigInt(-1);
    BN_05 = BigInt(0);
    BN_14 = BigInt(1);
    BN_MAX_UINT2562 = BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
    hexTrue = toBeHex(BN_14, 32);
    hexFalse = toBeHex(BN_05, 32);
    domainFieldTypes = {
      name: "string",
      version: "string",
      chainId: "uint256",
      verifyingContract: "address",
      salt: "bytes32"
    };
    domainFieldNames = [
      "name",
      "version",
      "chainId",
      "verifyingContract",
      "salt"
    ];
    domainChecks = {
      name: checkString("name"),
      version: checkString("version"),
      chainId: function(_value) {
        const value = getBigInt(_value, "domain.chainId");
        assertArgument(value >= 0, "invalid chain ID", "domain.chainId", _value);
        if (Number.isSafeInteger(value)) {
          return Number(value);
        }
        return toQuantity(value);
      },
      verifyingContract: function(value) {
        try {
          return getAddress(value).toLowerCase();
        } catch (error) {
        }
        assertArgument(false, `invalid domain value "verifyingContract"`, "domain.verifyingContract", value);
      },
      salt: function(value) {
        const bytes2 = getBytes(value, "domain.salt");
        assertArgument(bytes2.length === 32, `invalid domain value "salt"`, "domain.salt", value);
        return hexlify(bytes2);
      }
    };
    TypedDataEncoder = class _TypedDataEncoder {
      /**
       *  The primary type for the structured [[types]].
       *
       *  This is derived automatically from the [[types]], since no
       *  recursion is possible, once the DAG for the types is consturcted
       *  internally, the primary type must be the only remaining type with
       *  no parent nodes.
       */
      primaryType;
      #types;
      /**
       *  The types.
       */
      get types() {
        return JSON.parse(this.#types);
      }
      #fullTypes;
      #encoderCache;
      /**
       *  Create a new **TypedDataEncoder** for %%types%%.
       *
       *  This performs all necessary checking that types are valid and
       *  do not violate the [[link-eip-712]] structural constraints as
       *  well as computes the [[primaryType]].
       */
      constructor(_types) {
        this.#fullTypes = /* @__PURE__ */ new Map();
        this.#encoderCache = /* @__PURE__ */ new Map();
        const links = /* @__PURE__ */ new Map();
        const parents = /* @__PURE__ */ new Map();
        const subtypes = /* @__PURE__ */ new Map();
        const types = {};
        Object.keys(_types).forEach((type) => {
          types[type] = _types[type].map(({ name, type: type2 }) => {
            let { base, index } = splitArray(type2);
            if (base === "int" && !_types["int"]) {
              base = "int256";
            }
            if (base === "uint" && !_types["uint"]) {
              base = "uint256";
            }
            return { name, type: base + (index || "") };
          });
          links.set(type, /* @__PURE__ */ new Set());
          parents.set(type, []);
          subtypes.set(type, /* @__PURE__ */ new Set());
        });
        this.#types = JSON.stringify(types);
        for (const name in types) {
          const uniqueNames = /* @__PURE__ */ new Set();
          for (const field of types[name]) {
            assertArgument(!uniqueNames.has(field.name), `duplicate variable name ${JSON.stringify(field.name)} in ${JSON.stringify(name)}`, "types", _types);
            uniqueNames.add(field.name);
            const baseType = splitArray(field.type).base;
            assertArgument(baseType !== name, `circular type reference to ${JSON.stringify(baseType)}`, "types", _types);
            const encoder = getBaseEncoder(baseType);
            if (encoder) {
              continue;
            }
            assertArgument(parents.has(baseType), `unknown type ${JSON.stringify(baseType)}`, "types", _types);
            parents.get(baseType).push(name);
            links.get(name).add(baseType);
          }
        }
        const primaryTypes = Array.from(parents.keys()).filter((n2) => parents.get(n2).length === 0);
        assertArgument(primaryTypes.length !== 0, "missing primary type", "types", _types);
        assertArgument(primaryTypes.length === 1, `ambiguous primary types or unused types: ${primaryTypes.map((t) => JSON.stringify(t)).join(", ")}`, "types", _types);
        defineProperties(this, { primaryType: primaryTypes[0] });
        function checkCircular(type, found) {
          assertArgument(!found.has(type), `circular type reference to ${JSON.stringify(type)}`, "types", _types);
          found.add(type);
          for (const child of links.get(type)) {
            if (!parents.has(child)) {
              continue;
            }
            checkCircular(child, found);
            for (const subtype of found) {
              subtypes.get(subtype).add(child);
            }
          }
          found.delete(type);
        }
        checkCircular(this.primaryType, /* @__PURE__ */ new Set());
        for (const [name, set] of subtypes) {
          const st = Array.from(set);
          st.sort();
          this.#fullTypes.set(name, encodeType(name, types[name]) + st.map((t) => encodeType(t, types[t])).join(""));
        }
      }
      /**
       *  Returnthe encoder for the specific %%type%%.
       */
      getEncoder(type) {
        let encoder = this.#encoderCache.get(type);
        if (!encoder) {
          encoder = this.#getEncoder(type);
          this.#encoderCache.set(type, encoder);
        }
        return encoder;
      }
      #getEncoder(type) {
        {
          const encoder = getBaseEncoder(type);
          if (encoder) {
            return encoder;
          }
        }
        const array = splitArray(type).array;
        if (array) {
          const subtype = array.prefix;
          const subEncoder = this.getEncoder(subtype);
          return (value) => {
            assertArgument(array.count === -1 || array.count === value.length, `array length mismatch; expected length ${array.count}`, "value", value);
            let result = value.map(subEncoder);
            if (this.#fullTypes.has(subtype)) {
              result = result.map(keccak256);
            }
            return keccak256(concat(result));
          };
        }
        const fields = this.types[type];
        if (fields) {
          const encodedType = id(this.#fullTypes.get(type));
          return (value) => {
            const values = fields.map(({ name, type: type2 }) => {
              const result = this.getEncoder(type2)(value[name]);
              if (this.#fullTypes.has(type2)) {
                return keccak256(result);
              }
              return result;
            });
            values.unshift(encodedType);
            return concat(values);
          };
        }
        assertArgument(false, `unknown type: ${type}`, "type", type);
      }
      /**
       *  Return the full type for %%name%%.
       */
      encodeType(name) {
        const result = this.#fullTypes.get(name);
        assertArgument(result, `unknown type: ${JSON.stringify(name)}`, "name", name);
        return result;
      }
      /**
       *  Return the encoded %%value%% for the %%type%%.
       */
      encodeData(type, value) {
        return this.getEncoder(type)(value);
      }
      /**
       *  Returns the hash of %%value%% for the type of %%name%%.
       */
      hashStruct(name, value) {
        return keccak256(this.encodeData(name, value));
      }
      /**
       *  Return the fulled encoded %%value%% for the [[types]].
       */
      encode(value) {
        return this.encodeData(this.primaryType, value);
      }
      /**
       *  Return the hash of the fully encoded %%value%% for the [[types]].
       */
      hash(value) {
        return this.hashStruct(this.primaryType, value);
      }
      /**
       *  @_ignore:
       */
      _visit(type, value, callback) {
        {
          const encoder = getBaseEncoder(type);
          if (encoder) {
            return callback(type, value);
          }
        }
        const array = splitArray(type).array;
        if (array) {
          assertArgument(array.count === -1 || array.count === value.length, `array length mismatch; expected length ${array.count}`, "value", value);
          return value.map((v) => this._visit(array.prefix, v, callback));
        }
        const fields = this.types[type];
        if (fields) {
          return fields.reduce((accum, { name, type: type2 }) => {
            accum[name] = this._visit(type2, value[name], callback);
            return accum;
          }, {});
        }
        assertArgument(false, `unknown type: ${type}`, "type", type);
      }
      /**
       *  Call %%calback%% for each value in %%value%%, passing the type and
       *  component within %%value%%.
       *
       *  This is useful for replacing addresses or other transformation that
       *  may be desired on each component, based on its type.
       */
      visit(value, callback) {
        return this._visit(this.primaryType, value, callback);
      }
      /**
       *  Create a new **TypedDataEncoder** for %%types%%.
       */
      static from(types) {
        return new _TypedDataEncoder(types);
      }
      /**
       *  Return the primary type for %%types%%.
       */
      static getPrimaryType(types) {
        return _TypedDataEncoder.from(types).primaryType;
      }
      /**
       *  Return the hashed struct for %%value%% using %%types%% and %%name%%.
       */
      static hashStruct(name, types, value) {
        return _TypedDataEncoder.from(types).hashStruct(name, value);
      }
      /**
       *  Return the domain hash for %%domain%%.
       */
      static hashDomain(domain) {
        const domainFields = [];
        for (const name in domain) {
          if (domain[name] == null) {
            continue;
          }
          const type = domainFieldTypes[name];
          assertArgument(type, `invalid typed-data domain key: ${JSON.stringify(name)}`, "domain", domain);
          domainFields.push({ name, type });
        }
        domainFields.sort((a, b2) => {
          return domainFieldNames.indexOf(a.name) - domainFieldNames.indexOf(b2.name);
        });
        return _TypedDataEncoder.hashStruct("EIP712Domain", { EIP712Domain: domainFields }, domain);
      }
      /**
       *  Return the fully encoded [[link-eip-712]] %%value%% for %%types%% with %%domain%%.
       */
      static encode(domain, types, value) {
        return concat([
          "0x1901",
          _TypedDataEncoder.hashDomain(domain),
          _TypedDataEncoder.from(types).hash(value)
        ]);
      }
      /**
       *  Return the hash of the fully encoded [[link-eip-712]] %%value%% for %%types%% with %%domain%%.
       */
      static hash(domain, types, value) {
        return keccak256(_TypedDataEncoder.encode(domain, types, value));
      }
      // Replaces all address types with ENS names with their looked up address
      /**
       * Resolves to the value from resolving all addresses in %%value%% for
       * %%types%% and the %%domain%%.
       */
      static async resolveNames(domain, types, value, resolveName) {
        domain = Object.assign({}, domain);
        for (const key in domain) {
          if (domain[key] == null) {
            delete domain[key];
          }
        }
        const ensCache = {};
        if (domain.verifyingContract && !isHexString(domain.verifyingContract, 20)) {
          ensCache[domain.verifyingContract] = "0x";
        }
        const encoder = _TypedDataEncoder.from(types);
        encoder.visit(value, (type, value2) => {
          if (type === "address" && !isHexString(value2, 20)) {
            ensCache[value2] = "0x";
          }
          return value2;
        });
        for (const name in ensCache) {
          ensCache[name] = await resolveName(name);
        }
        if (domain.verifyingContract && ensCache[domain.verifyingContract]) {
          domain.verifyingContract = ensCache[domain.verifyingContract];
        }
        value = encoder.visit(value, (type, value2) => {
          if (type === "address" && ensCache[value2]) {
            return ensCache[value2];
          }
          return value2;
        });
        return { domain, value };
      }
      /**
       *  Returns the JSON-encoded payload expected by nodes which implement
       *  the JSON-RPC [[link-eip-712]] method.
       */
      static getPayload(domain, types, value) {
        _TypedDataEncoder.hashDomain(domain);
        const domainValues = {};
        const domainTypes = [];
        domainFieldNames.forEach((name) => {
          const value2 = domain[name];
          if (value2 == null) {
            return;
          }
          domainValues[name] = domainChecks[name](value2);
          domainTypes.push({ name, type: domainFieldTypes[name] });
        });
        const encoder = _TypedDataEncoder.from(types);
        types = encoder.types;
        const typesWithDomain = Object.assign({}, types);
        assertArgument(typesWithDomain.EIP712Domain == null, "types must not contain EIP712Domain type", "types.EIP712Domain", types);
        typesWithDomain.EIP712Domain = domainTypes;
        encoder.encode(value);
        return {
          types: typesWithDomain,
          domain: domainValues,
          primaryType: encoder.primaryType,
          message: encoder.visit(value, (type, value2) => {
            if (type.match(/^bytes(\d*)/)) {
              return hexlify(getBytes(value2));
            }
            if (type.match(/^u?int/)) {
              return getBigInt(value2).toString();
            }
            switch (type) {
              case "address":
                return value2.toLowerCase();
              case "bool":
                return !!value2;
              case "string":
                assertArgument(typeof value2 === "string", "invalid string", "value", value2);
                return value2;
            }
            assertArgument(false, "unsupported type", "type", type);
          })
        };
      }
    };
  }
});

// node_modules/ethers/lib.esm/hash/index.js
var init_hash = __esm({
  "node_modules/ethers/lib.esm/hash/index.js"() {
    init_id();
    init_message();
    init_typed_data();
  }
});

// node_modules/ethers/lib.esm/abi/fragments.js
function setify(items) {
  const result = /* @__PURE__ */ new Set();
  items.forEach((k) => result.add(k));
  return Object.freeze(result);
}
function lex(text) {
  const tokens = [];
  const throwError2 = (message) => {
    const token = offset < text.length ? JSON.stringify(text[offset]) : "$EOI";
    throw new Error(`invalid token ${token} at ${offset}: ${message}`);
  };
  let brackets = [];
  let commas = [];
  let offset = 0;
  while (offset < text.length) {
    let cur = text.substring(offset);
    let match = cur.match(regexWhitespacePrefix);
    if (match) {
      offset += match[1].length;
      cur = text.substring(offset);
    }
    const token = { depth: brackets.length, linkBack: -1, linkNext: -1, match: -1, type: "", text: "", offset, value: -1 };
    tokens.push(token);
    let type = SimpleTokens[cur[0]] || "";
    if (type) {
      token.type = type;
      token.text = cur[0];
      offset++;
      if (type === "OPEN_PAREN") {
        brackets.push(tokens.length - 1);
        commas.push(tokens.length - 1);
      } else if (type == "CLOSE_PAREN") {
        if (brackets.length === 0) {
          throwError2("no matching open bracket");
        }
        token.match = brackets.pop();
        tokens[token.match].match = tokens.length - 1;
        token.depth--;
        token.linkBack = commas.pop();
        tokens[token.linkBack].linkNext = tokens.length - 1;
      } else if (type === "COMMA") {
        token.linkBack = commas.pop();
        tokens[token.linkBack].linkNext = tokens.length - 1;
        commas.push(tokens.length - 1);
      } else if (type === "OPEN_BRACKET") {
        token.type = "BRACKET";
      } else if (type === "CLOSE_BRACKET") {
        let suffix = tokens.pop().text;
        if (tokens.length > 0 && tokens[tokens.length - 1].type === "NUMBER") {
          const value = tokens.pop().text;
          suffix = value + suffix;
          tokens[tokens.length - 1].value = getNumber(value);
        }
        if (tokens.length === 0 || tokens[tokens.length - 1].type !== "BRACKET") {
          throw new Error("missing opening bracket");
        }
        tokens[tokens.length - 1].text += suffix;
      }
      continue;
    }
    match = cur.match(regexIdPrefix);
    if (match) {
      token.text = match[1];
      offset += token.text.length;
      if (Keywords.has(token.text)) {
        token.type = "KEYWORD";
        continue;
      }
      if (token.text.match(regexType)) {
        token.type = "TYPE";
        continue;
      }
      token.type = "ID";
      continue;
    }
    match = cur.match(regexNumberPrefix);
    if (match) {
      token.text = match[1];
      token.type = "NUMBER";
      offset += token.text.length;
      continue;
    }
    throw new Error(`unexpected token ${JSON.stringify(cur[0])} at position ${offset}`);
  }
  return new TokenString(tokens.map((t) => Object.freeze(t)));
}
function allowSingle(set, allowed) {
  let included = [];
  for (const key in allowed.keys()) {
    if (set.has(key)) {
      included.push(key);
    }
  }
  if (included.length > 1) {
    throw new Error(`conflicting types: ${included.join(", ")}`);
  }
}
function consumeName(type, tokens) {
  if (tokens.peekKeyword(KwTypes)) {
    const keyword = tokens.pop().text;
    if (keyword !== type) {
      throw new Error(`expected ${type}, got ${keyword}`);
    }
  }
  return tokens.popType("ID");
}
function consumeKeywords(tokens, allowed) {
  const keywords = /* @__PURE__ */ new Set();
  while (true) {
    const keyword = tokens.peekType("KEYWORD");
    if (keyword == null || allowed && !allowed.has(keyword)) {
      break;
    }
    tokens.pop();
    if (keywords.has(keyword)) {
      throw new Error(`duplicate keywords: ${JSON.stringify(keyword)}`);
    }
    keywords.add(keyword);
  }
  return Object.freeze(keywords);
}
function consumeMutability(tokens) {
  let modifiers = consumeKeywords(tokens, KwVisib);
  allowSingle(modifiers, setify("constant payable nonpayable".split(" ")));
  allowSingle(modifiers, setify("pure view payable nonpayable".split(" ")));
  if (modifiers.has("view")) {
    return "view";
  }
  if (modifiers.has("pure")) {
    return "pure";
  }
  if (modifiers.has("payable")) {
    return "payable";
  }
  if (modifiers.has("nonpayable")) {
    return "nonpayable";
  }
  if (modifiers.has("constant")) {
    return "view";
  }
  return "nonpayable";
}
function consumeParams(tokens, allowIndexed) {
  return tokens.popParams().map((t) => ParamType.from(t, allowIndexed));
}
function consumeGas(tokens) {
  if (tokens.peekType("AT")) {
    tokens.pop();
    if (tokens.peekType("NUMBER")) {
      return getBigInt(tokens.pop().text);
    }
    throw new Error("invalid gas");
  }
  return null;
}
function consumeEoi(tokens) {
  if (tokens.length) {
    throw new Error(`unexpected tokens at offset ${tokens.offset}: ${tokens.toString()}`);
  }
}
function verifyBasicType(type) {
  const match = type.match(regexType);
  assertArgument(match, "invalid type", "type", type);
  if (type === "uint") {
    return "uint256";
  }
  if (type === "int") {
    return "int256";
  }
  if (match[2]) {
    const length = parseInt(match[2]);
    assertArgument(length !== 0 && length <= 32, "invalid bytes length", "type", type);
  } else if (match[3]) {
    const size = parseInt(match[3]);
    assertArgument(size !== 0 && size <= 256 && size % 8 === 0, "invalid numeric width", "type", type);
  }
  return type;
}
function joinParams(format, params) {
  return "(" + params.map((p) => p.format(format)).join(format === "full" ? ", " : ",") + ")";
}
var _kwVisibDeploy, KwVisibDeploy, _kwVisib, KwVisib, _kwTypes, KwTypes, _kwModifiers, KwModifiers, _kwOther, _keywords, Keywords, SimpleTokens, regexWhitespacePrefix, regexNumberPrefix, regexIdPrefix, regexId, regexType, TokenString, regexArrayType, _guard3, internal, ParamTypeInternal, ErrorFragmentInternal, EventFragmentInternal, ConstructorFragmentInternal, FallbackFragmentInternal, FunctionFragmentInternal, StructFragmentInternal, ParamType, Fragment, NamedFragment, ErrorFragment, EventFragment, ConstructorFragment, FallbackFragment, FunctionFragment, StructFragment;
var init_fragments = __esm({
  "node_modules/ethers/lib.esm/abi/fragments.js"() {
    init_utils();
    init_hash();
    _kwVisibDeploy = "external public payable override";
    KwVisibDeploy = setify(_kwVisibDeploy.split(" "));
    _kwVisib = "constant external internal payable private public pure view override";
    KwVisib = setify(_kwVisib.split(" "));
    _kwTypes = "constructor error event fallback function receive struct";
    KwTypes = setify(_kwTypes.split(" "));
    _kwModifiers = "calldata memory storage payable indexed";
    KwModifiers = setify(_kwModifiers.split(" "));
    _kwOther = "tuple returns";
    _keywords = [_kwTypes, _kwModifiers, _kwOther, _kwVisib].join(" ");
    Keywords = setify(_keywords.split(" "));
    SimpleTokens = {
      "(": "OPEN_PAREN",
      ")": "CLOSE_PAREN",
      "[": "OPEN_BRACKET",
      "]": "CLOSE_BRACKET",
      ",": "COMMA",
      "@": "AT"
    };
    regexWhitespacePrefix = new RegExp("^(\\s*)");
    regexNumberPrefix = new RegExp("^([0-9]+)");
    regexIdPrefix = new RegExp("^([a-zA-Z$_][a-zA-Z0-9$_]*)");
    regexId = new RegExp("^([a-zA-Z$_][a-zA-Z0-9$_]*)$");
    regexType = new RegExp("^(address|bool|bytes([0-9]*)|string|u?int([0-9]*))$");
    TokenString = class _TokenString {
      #offset;
      #tokens;
      get offset() {
        return this.#offset;
      }
      get length() {
        return this.#tokens.length - this.#offset;
      }
      constructor(tokens) {
        this.#offset = 0;
        this.#tokens = tokens.slice();
      }
      clone() {
        return new _TokenString(this.#tokens);
      }
      reset() {
        this.#offset = 0;
      }
      #subTokenString(from = 0, to = 0) {
        return new _TokenString(this.#tokens.slice(from, to).map((t) => {
          return Object.freeze(Object.assign({}, t, {
            match: t.match - from,
            linkBack: t.linkBack - from,
            linkNext: t.linkNext - from
          }));
        }));
      }
      // Pops and returns the value of the next token, if it is a keyword in allowed; throws if out of tokens
      popKeyword(allowed) {
        const top = this.peek();
        if (top.type !== "KEYWORD" || !allowed.has(top.text)) {
          throw new Error(`expected keyword ${top.text}`);
        }
        return this.pop().text;
      }
      // Pops and returns the value of the next token if it is `type`; throws if out of tokens
      popType(type) {
        if (this.peek().type !== type) {
          const top = this.peek();
          throw new Error(`expected ${type}; got ${top.type} ${JSON.stringify(top.text)}`);
        }
        return this.pop().text;
      }
      // Pops and returns a "(" TOKENS ")"
      popParen() {
        const top = this.peek();
        if (top.type !== "OPEN_PAREN") {
          throw new Error("bad start");
        }
        const result = this.#subTokenString(this.#offset + 1, top.match + 1);
        this.#offset = top.match + 1;
        return result;
      }
      // Pops and returns the items within "(" ITEM1 "," ITEM2 "," ... ")"
      popParams() {
        const top = this.peek();
        if (top.type !== "OPEN_PAREN") {
          throw new Error("bad start");
        }
        const result = [];
        while (this.#offset < top.match - 1) {
          const link = this.peek().linkNext;
          result.push(this.#subTokenString(this.#offset + 1, link));
          this.#offset = link;
        }
        this.#offset = top.match + 1;
        return result;
      }
      // Returns the top Token, throwing if out of tokens
      peek() {
        if (this.#offset >= this.#tokens.length) {
          throw new Error("out-of-bounds");
        }
        return this.#tokens[this.#offset];
      }
      // Returns the next value, if it is a keyword in `allowed`
      peekKeyword(allowed) {
        const top = this.peekType("KEYWORD");
        return top != null && allowed.has(top) ? top : null;
      }
      // Returns the value of the next token if it is `type`
      peekType(type) {
        if (this.length === 0) {
          return null;
        }
        const top = this.peek();
        return top.type === type ? top.text : null;
      }
      // Returns the next token; throws if out of tokens
      pop() {
        const result = this.peek();
        this.#offset++;
        return result;
      }
      toString() {
        const tokens = [];
        for (let i = this.#offset; i < this.#tokens.length; i++) {
          const token = this.#tokens[i];
          tokens.push(`${token.type}:${token.text}`);
        }
        return `<TokenString ${tokens.join(" ")}>`;
      }
    };
    regexArrayType = new RegExp(/^(.*)\[([0-9]*)\]$/);
    _guard3 = {};
    internal = Symbol.for("_ethers_internal");
    ParamTypeInternal = "_ParamTypeInternal";
    ErrorFragmentInternal = "_ErrorInternal";
    EventFragmentInternal = "_EventInternal";
    ConstructorFragmentInternal = "_ConstructorInternal";
    FallbackFragmentInternal = "_FallbackInternal";
    FunctionFragmentInternal = "_FunctionInternal";
    StructFragmentInternal = "_StructInternal";
    ParamType = class _ParamType {
      /**
       *  The local name of the parameter (or ``""`` if unbound)
       */
      name;
      /**
       *  The fully qualified type (e.g. ``"address"``, ``"tuple(address)"``,
       *  ``"uint256[3][]"``)
       */
      type;
      /**
       *  The base type (e.g. ``"address"``, ``"tuple"``, ``"array"``)
       */
      baseType;
      /**
       *  True if the parameters is indexed.
       *
       *  For non-indexable types this is ``null``.
       */
      indexed;
      /**
       *  The components for the tuple.
       *
       *  For non-tuple types this is ``null``.
       */
      components;
      /**
       *  The array length, or ``-1`` for dynamic-lengthed arrays.
       *
       *  For non-array types this is ``null``.
       */
      arrayLength;
      /**
       *  The type of each child in the array.
       *
       *  For non-array types this is ``null``.
       */
      arrayChildren;
      /**
       *  @private
       */
      constructor(guard, name, type, baseType, indexed, components, arrayLength, arrayChildren) {
        assertPrivate(guard, _guard3, "ParamType");
        Object.defineProperty(this, internal, { value: ParamTypeInternal });
        if (components) {
          components = Object.freeze(components.slice());
        }
        if (baseType === "array") {
          if (arrayLength == null || arrayChildren == null) {
            throw new Error("");
          }
        } else if (arrayLength != null || arrayChildren != null) {
          throw new Error("");
        }
        if (baseType === "tuple") {
          if (components == null) {
            throw new Error("");
          }
        } else if (components != null) {
          throw new Error("");
        }
        defineProperties(this, {
          name,
          type,
          baseType,
          indexed,
          components,
          arrayLength,
          arrayChildren
        });
      }
      /**
       *  Return a string representation of this type.
       *
       *  For example,
       *
       *  ``sighash" => "(uint256,address)"``
       *
       *  ``"minimal" => "tuple(uint256,address) indexed"``
       *
       *  ``"full" => "tuple(uint256 foo, address bar) indexed baz"``
       */
      format(format) {
        if (format == null) {
          format = "sighash";
        }
        if (format === "json") {
          const name = this.name || "";
          if (this.isArray()) {
            const result3 = JSON.parse(this.arrayChildren.format("json"));
            result3.name = name;
            result3.type += `[${this.arrayLength < 0 ? "" : String(this.arrayLength)}]`;
            return JSON.stringify(result3);
          }
          const result2 = {
            type: this.baseType === "tuple" ? "tuple" : this.type,
            name
          };
          if (typeof this.indexed === "boolean") {
            result2.indexed = this.indexed;
          }
          if (this.isTuple()) {
            result2.components = this.components.map((c) => JSON.parse(c.format(format)));
          }
          return JSON.stringify(result2);
        }
        let result = "";
        if (this.isArray()) {
          result += this.arrayChildren.format(format);
          result += `[${this.arrayLength < 0 ? "" : String(this.arrayLength)}]`;
        } else {
          if (this.isTuple()) {
            result += "(" + this.components.map((comp) => comp.format(format)).join(format === "full" ? ", " : ",") + ")";
          } else {
            result += this.type;
          }
        }
        if (format !== "sighash") {
          if (this.indexed === true) {
            result += " indexed";
          }
          if (format === "full" && this.name) {
            result += " " + this.name;
          }
        }
        return result;
      }
      /**
       *  Returns true if %%this%% is an Array type.
       *
       *  This provides a type gaurd ensuring that [[arrayChildren]]
       *  and [[arrayLength]] are non-null.
       */
      isArray() {
        return this.baseType === "array";
      }
      /**
       *  Returns true if %%this%% is a Tuple type.
       *
       *  This provides a type gaurd ensuring that [[components]]
       *  is non-null.
       */
      isTuple() {
        return this.baseType === "tuple";
      }
      /**
       *  Returns true if %%this%% is an Indexable type.
       *
       *  This provides a type gaurd ensuring that [[indexed]]
       *  is non-null.
       */
      isIndexable() {
        return this.indexed != null;
      }
      /**
       *  Walks the **ParamType** with %%value%%, calling %%process%%
       *  on each type, destructing the %%value%% recursively.
       */
      walk(value, process2) {
        if (this.isArray()) {
          if (!Array.isArray(value)) {
            throw new Error("invalid array value");
          }
          if (this.arrayLength !== -1 && value.length !== this.arrayLength) {
            throw new Error("array is wrong length");
          }
          const _this = this;
          return value.map((v) => _this.arrayChildren.walk(v, process2));
        }
        if (this.isTuple()) {
          if (!Array.isArray(value)) {
            throw new Error("invalid tuple value");
          }
          if (value.length !== this.components.length) {
            throw new Error("array is wrong length");
          }
          const _this = this;
          return value.map((v, i) => _this.components[i].walk(v, process2));
        }
        return process2(this.type, value);
      }
      #walkAsync(promises, value, process2, setValue) {
        if (this.isArray()) {
          if (!Array.isArray(value)) {
            throw new Error("invalid array value");
          }
          if (this.arrayLength !== -1 && value.length !== this.arrayLength) {
            throw new Error("array is wrong length");
          }
          const childType = this.arrayChildren;
          const result2 = value.slice();
          result2.forEach((value2, index) => {
            childType.#walkAsync(promises, value2, process2, (value3) => {
              result2[index] = value3;
            });
          });
          setValue(result2);
          return;
        }
        if (this.isTuple()) {
          const components = this.components;
          let result2;
          if (Array.isArray(value)) {
            result2 = value.slice();
          } else {
            if (value == null || typeof value !== "object") {
              throw new Error("invalid tuple value");
            }
            result2 = components.map((param) => {
              if (!param.name) {
                throw new Error("cannot use object value with unnamed components");
              }
              if (!(param.name in value)) {
                throw new Error(`missing value for component ${param.name}`);
              }
              return value[param.name];
            });
          }
          if (result2.length !== this.components.length) {
            throw new Error("array is wrong length");
          }
          result2.forEach((value2, index) => {
            components[index].#walkAsync(promises, value2, process2, (value3) => {
              result2[index] = value3;
            });
          });
          setValue(result2);
          return;
        }
        const result = process2(this.type, value);
        if (result.then) {
          promises.push(async function() {
            setValue(await result);
          }());
        } else {
          setValue(result);
        }
      }
      /**
       *  Walks the **ParamType** with %%value%%, asynchronously calling
       *  %%process%% on each type, destructing the %%value%% recursively.
       *
       *  This can be used to resolve ENS names by walking and resolving each
       *  ``"address"`` type.
       */
      async walkAsync(value, process2) {
        const promises = [];
        const result = [value];
        this.#walkAsync(promises, value, process2, (value2) => {
          result[0] = value2;
        });
        if (promises.length) {
          await Promise.all(promises);
        }
        return result[0];
      }
      /**
       *  Creates a new **ParamType** for %%obj%%.
       *
       *  If %%allowIndexed%% then the ``indexed`` keyword is permitted,
       *  otherwise the ``indexed`` keyword will throw an error.
       */
      static from(obj, allowIndexed) {
        if (_ParamType.isParamType(obj)) {
          return obj;
        }
        if (typeof obj === "string") {
          try {
            return _ParamType.from(lex(obj), allowIndexed);
          } catch (error) {
            assertArgument(false, "invalid param type", "obj", obj);
          }
        } else if (obj instanceof TokenString) {
          let type2 = "", baseType = "";
          let comps = null;
          if (consumeKeywords(obj, setify(["tuple"])).has("tuple") || obj.peekType("OPEN_PAREN")) {
            baseType = "tuple";
            comps = obj.popParams().map((t) => _ParamType.from(t));
            type2 = `tuple(${comps.map((c) => c.format()).join(",")})`;
          } else {
            type2 = verifyBasicType(obj.popType("TYPE"));
            baseType = type2;
          }
          let arrayChildren = null;
          let arrayLength = null;
          while (obj.length && obj.peekType("BRACKET")) {
            const bracket = obj.pop();
            arrayChildren = new _ParamType(_guard3, "", type2, baseType, null, comps, arrayLength, arrayChildren);
            arrayLength = bracket.value;
            type2 += bracket.text;
            baseType = "array";
            comps = null;
          }
          let indexed2 = null;
          const keywords = consumeKeywords(obj, KwModifiers);
          if (keywords.has("indexed")) {
            if (!allowIndexed) {
              throw new Error("");
            }
            indexed2 = true;
          }
          const name2 = obj.peekType("ID") ? obj.pop().text : "";
          if (obj.length) {
            throw new Error("leftover tokens");
          }
          return new _ParamType(_guard3, name2, type2, baseType, indexed2, comps, arrayLength, arrayChildren);
        }
        const name = obj.name;
        assertArgument(!name || typeof name === "string" && name.match(regexId), "invalid name", "obj.name", name);
        let indexed = obj.indexed;
        if (indexed != null) {
          assertArgument(allowIndexed, "parameter cannot be indexed", "obj.indexed", obj.indexed);
          indexed = !!indexed;
        }
        let type = obj.type;
        let arrayMatch = type.match(regexArrayType);
        if (arrayMatch) {
          const arrayLength = parseInt(arrayMatch[2] || "-1");
          const arrayChildren = _ParamType.from({
            type: arrayMatch[1],
            components: obj.components
          });
          return new _ParamType(_guard3, name || "", type, "array", indexed, null, arrayLength, arrayChildren);
        }
        if (type === "tuple" || type.startsWith(
          "tuple("
          /* fix: ) */
        ) || type.startsWith(
          "("
          /* fix: ) */
        )) {
          const comps = obj.components != null ? obj.components.map((c) => _ParamType.from(c)) : null;
          const tuple = new _ParamType(_guard3, name || "", type, "tuple", indexed, comps, null, null);
          return tuple;
        }
        type = verifyBasicType(obj.type);
        return new _ParamType(_guard3, name || "", type, type, indexed, null, null, null);
      }
      /**
       *  Returns true if %%value%% is a **ParamType**.
       */
      static isParamType(value) {
        return value && value[internal] === ParamTypeInternal;
      }
    };
    Fragment = class _Fragment {
      /**
       *  The type of the fragment.
       */
      type;
      /**
       *  The inputs for the fragment.
       */
      inputs;
      /**
       *  @private
       */
      constructor(guard, type, inputs) {
        assertPrivate(guard, _guard3, "Fragment");
        inputs = Object.freeze(inputs.slice());
        defineProperties(this, { type, inputs });
      }
      /**
       *  Creates a new **Fragment** for %%obj%%, wich can be any supported
       *  ABI frgament type.
       */
      static from(obj) {
        if (typeof obj === "string") {
          try {
            _Fragment.from(JSON.parse(obj));
          } catch (e) {
          }
          return _Fragment.from(lex(obj));
        }
        if (obj instanceof TokenString) {
          const type = obj.peekKeyword(KwTypes);
          switch (type) {
            case "constructor":
              return ConstructorFragment.from(obj);
            case "error":
              return ErrorFragment.from(obj);
            case "event":
              return EventFragment.from(obj);
            case "fallback":
            case "receive":
              return FallbackFragment.from(obj);
            case "function":
              return FunctionFragment.from(obj);
            case "struct":
              return StructFragment.from(obj);
          }
        } else if (typeof obj === "object") {
          switch (obj.type) {
            case "constructor":
              return ConstructorFragment.from(obj);
            case "error":
              return ErrorFragment.from(obj);
            case "event":
              return EventFragment.from(obj);
            case "fallback":
            case "receive":
              return FallbackFragment.from(obj);
            case "function":
              return FunctionFragment.from(obj);
            case "struct":
              return StructFragment.from(obj);
          }
          assert(false, `unsupported type: ${obj.type}`, "UNSUPPORTED_OPERATION", {
            operation: "Fragment.from"
          });
        }
        assertArgument(false, "unsupported frgament object", "obj", obj);
      }
      /**
       *  Returns true if %%value%% is a [[ConstructorFragment]].
       */
      static isConstructor(value) {
        return ConstructorFragment.isFragment(value);
      }
      /**
       *  Returns true if %%value%% is an [[ErrorFragment]].
       */
      static isError(value) {
        return ErrorFragment.isFragment(value);
      }
      /**
       *  Returns true if %%value%% is an [[EventFragment]].
       */
      static isEvent(value) {
        return EventFragment.isFragment(value);
      }
      /**
       *  Returns true if %%value%% is a [[FunctionFragment]].
       */
      static isFunction(value) {
        return FunctionFragment.isFragment(value);
      }
      /**
       *  Returns true if %%value%% is a [[StructFragment]].
       */
      static isStruct(value) {
        return StructFragment.isFragment(value);
      }
    };
    NamedFragment = class extends Fragment {
      /**
       *  The name of the fragment.
       */
      name;
      /**
       *  @private
       */
      constructor(guard, type, name, inputs) {
        super(guard, type, inputs);
        assertArgument(typeof name === "string" && name.match(regexId), "invalid identifier", "name", name);
        inputs = Object.freeze(inputs.slice());
        defineProperties(this, { name });
      }
    };
    ErrorFragment = class _ErrorFragment extends NamedFragment {
      /**
       *  @private
       */
      constructor(guard, name, inputs) {
        super(guard, "error", name, inputs);
        Object.defineProperty(this, internal, { value: ErrorFragmentInternal });
      }
      /**
       *  The Custom Error selector.
       */
      get selector() {
        return id(this.format("sighash")).substring(0, 10);
      }
      /**
       *  Returns a string representation of this fragment as %%format%%.
       */
      format(format) {
        if (format == null) {
          format = "sighash";
        }
        if (format === "json") {
          return JSON.stringify({
            type: "error",
            name: this.name,
            inputs: this.inputs.map((input) => JSON.parse(input.format(format)))
          });
        }
        const result = [];
        if (format !== "sighash") {
          result.push("error");
        }
        result.push(this.name + joinParams(format, this.inputs));
        return result.join(" ");
      }
      /**
       *  Returns a new **ErrorFragment** for %%obj%%.
       */
      static from(obj) {
        if (_ErrorFragment.isFragment(obj)) {
          return obj;
        }
        if (typeof obj === "string") {
          return _ErrorFragment.from(lex(obj));
        } else if (obj instanceof TokenString) {
          const name = consumeName("error", obj);
          const inputs = consumeParams(obj);
          consumeEoi(obj);
          return new _ErrorFragment(_guard3, name, inputs);
        }
        return new _ErrorFragment(_guard3, obj.name, obj.inputs ? obj.inputs.map(ParamType.from) : []);
      }
      /**
       *  Returns ``true`` and provides a type guard if %%value%% is an
       *  **ErrorFragment**.
       */
      static isFragment(value) {
        return value && value[internal] === ErrorFragmentInternal;
      }
    };
    EventFragment = class _EventFragment extends NamedFragment {
      /**
       *  Whether this event is anonymous.
       */
      anonymous;
      /**
       *  @private
       */
      constructor(guard, name, inputs, anonymous) {
        super(guard, "event", name, inputs);
        Object.defineProperty(this, internal, { value: EventFragmentInternal });
        defineProperties(this, { anonymous });
      }
      /**
       *  The Event topic hash.
       */
      get topicHash() {
        return id(this.format("sighash"));
      }
      /**
       *  Returns a string representation of this event as %%format%%.
       */
      format(format) {
        if (format == null) {
          format = "sighash";
        }
        if (format === "json") {
          return JSON.stringify({
            type: "event",
            anonymous: this.anonymous,
            name: this.name,
            inputs: this.inputs.map((i) => JSON.parse(i.format(format)))
          });
        }
        const result = [];
        if (format !== "sighash") {
          result.push("event");
        }
        result.push(this.name + joinParams(format, this.inputs));
        if (format !== "sighash" && this.anonymous) {
          result.push("anonymous");
        }
        return result.join(" ");
      }
      /**
       *  Return the topic hash for an event with %%name%% and %%params%%.
       */
      static getTopicHash(name, params) {
        params = (params || []).map((p) => ParamType.from(p));
        const fragment = new _EventFragment(_guard3, name, params, false);
        return fragment.topicHash;
      }
      /**
       *  Returns a new **EventFragment** for %%obj%%.
       */
      static from(obj) {
        if (_EventFragment.isFragment(obj)) {
          return obj;
        }
        if (typeof obj === "string") {
          try {
            return _EventFragment.from(lex(obj));
          } catch (error) {
            assertArgument(false, "invalid event fragment", "obj", obj);
          }
        } else if (obj instanceof TokenString) {
          const name = consumeName("event", obj);
          const inputs = consumeParams(obj, true);
          const anonymous = !!consumeKeywords(obj, setify(["anonymous"])).has("anonymous");
          consumeEoi(obj);
          return new _EventFragment(_guard3, name, inputs, anonymous);
        }
        return new _EventFragment(_guard3, obj.name, obj.inputs ? obj.inputs.map((p) => ParamType.from(p, true)) : [], !!obj.anonymous);
      }
      /**
       *  Returns ``true`` and provides a type guard if %%value%% is an
       *  **EventFragment**.
       */
      static isFragment(value) {
        return value && value[internal] === EventFragmentInternal;
      }
    };
    ConstructorFragment = class _ConstructorFragment extends Fragment {
      /**
       *  Whether the constructor can receive an endowment.
       */
      payable;
      /**
       *  The recommended gas limit for deployment or ``null``.
       */
      gas;
      /**
       *  @private
       */
      constructor(guard, type, inputs, payable, gas) {
        super(guard, type, inputs);
        Object.defineProperty(this, internal, { value: ConstructorFragmentInternal });
        defineProperties(this, { payable, gas });
      }
      /**
       *  Returns a string representation of this constructor as %%format%%.
       */
      format(format) {
        assert(format != null && format !== "sighash", "cannot format a constructor for sighash", "UNSUPPORTED_OPERATION", { operation: "format(sighash)" });
        if (format === "json") {
          return JSON.stringify({
            type: "constructor",
            stateMutability: this.payable ? "payable" : "undefined",
            payable: this.payable,
            gas: this.gas != null ? this.gas : void 0,
            inputs: this.inputs.map((i) => JSON.parse(i.format(format)))
          });
        }
        const result = [`constructor${joinParams(format, this.inputs)}`];
        if (this.payable) {
          result.push("payable");
        }
        if (this.gas != null) {
          result.push(`@${this.gas.toString()}`);
        }
        return result.join(" ");
      }
      /**
       *  Returns a new **ConstructorFragment** for %%obj%%.
       */
      static from(obj) {
        if (_ConstructorFragment.isFragment(obj)) {
          return obj;
        }
        if (typeof obj === "string") {
          try {
            return _ConstructorFragment.from(lex(obj));
          } catch (error) {
            assertArgument(false, "invalid constuctor fragment", "obj", obj);
          }
        } else if (obj instanceof TokenString) {
          consumeKeywords(obj, setify(["constructor"]));
          const inputs = consumeParams(obj);
          const payable = !!consumeKeywords(obj, KwVisibDeploy).has("payable");
          const gas = consumeGas(obj);
          consumeEoi(obj);
          return new _ConstructorFragment(_guard3, "constructor", inputs, payable, gas);
        }
        return new _ConstructorFragment(_guard3, "constructor", obj.inputs ? obj.inputs.map(ParamType.from) : [], !!obj.payable, obj.gas != null ? obj.gas : null);
      }
      /**
       *  Returns ``true`` and provides a type guard if %%value%% is a
       *  **ConstructorFragment**.
       */
      static isFragment(value) {
        return value && value[internal] === ConstructorFragmentInternal;
      }
    };
    FallbackFragment = class _FallbackFragment extends Fragment {
      /**
       *  If the function can be sent value during invocation.
       */
      payable;
      constructor(guard, inputs, payable) {
        super(guard, "fallback", inputs);
        Object.defineProperty(this, internal, { value: FallbackFragmentInternal });
        defineProperties(this, { payable });
      }
      /**
       *  Returns a string representation of this fallback as %%format%%.
       */
      format(format) {
        const type = this.inputs.length === 0 ? "receive" : "fallback";
        if (format === "json") {
          const stateMutability = this.payable ? "payable" : "nonpayable";
          return JSON.stringify({ type, stateMutability });
        }
        return `${type}()${this.payable ? " payable" : ""}`;
      }
      /**
       *  Returns a new **FallbackFragment** for %%obj%%.
       */
      static from(obj) {
        if (_FallbackFragment.isFragment(obj)) {
          return obj;
        }
        if (typeof obj === "string") {
          try {
            return _FallbackFragment.from(lex(obj));
          } catch (error) {
            assertArgument(false, "invalid fallback fragment", "obj", obj);
          }
        } else if (obj instanceof TokenString) {
          const errorObj = obj.toString();
          const topIsValid = obj.peekKeyword(setify(["fallback", "receive"]));
          assertArgument(topIsValid, "type must be fallback or receive", "obj", errorObj);
          const type = obj.popKeyword(setify(["fallback", "receive"]));
          if (type === "receive") {
            const inputs2 = consumeParams(obj);
            assertArgument(inputs2.length === 0, `receive cannot have arguments`, "obj.inputs", inputs2);
            consumeKeywords(obj, setify(["payable"]));
            consumeEoi(obj);
            return new _FallbackFragment(_guard3, [], true);
          }
          let inputs = consumeParams(obj);
          if (inputs.length) {
            assertArgument(inputs.length === 1 && inputs[0].type === "bytes", "invalid fallback inputs", "obj.inputs", inputs.map((i) => i.format("minimal")).join(", "));
          } else {
            inputs = [ParamType.from("bytes")];
          }
          const mutability = consumeMutability(obj);
          assertArgument(mutability === "nonpayable" || mutability === "payable", "fallback cannot be constants", "obj.stateMutability", mutability);
          if (consumeKeywords(obj, setify(["returns"])).has("returns")) {
            const outputs = consumeParams(obj);
            assertArgument(outputs.length === 1 && outputs[0].type === "bytes", "invalid fallback outputs", "obj.outputs", outputs.map((i) => i.format("minimal")).join(", "));
          }
          consumeEoi(obj);
          return new _FallbackFragment(_guard3, inputs, mutability === "payable");
        }
        if (obj.type === "receive") {
          return new _FallbackFragment(_guard3, [], true);
        }
        if (obj.type === "fallback") {
          const inputs = [ParamType.from("bytes")];
          const payable = obj.stateMutability === "payable";
          return new _FallbackFragment(_guard3, inputs, payable);
        }
        assertArgument(false, "invalid fallback description", "obj", obj);
      }
      /**
       *  Returns ``true`` and provides a type guard if %%value%% is a
       *  **FallbackFragment**.
       */
      static isFragment(value) {
        return value && value[internal] === FallbackFragmentInternal;
      }
    };
    FunctionFragment = class _FunctionFragment extends NamedFragment {
      /**
       *  If the function is constant (e.g. ``pure`` or ``view`` functions).
       */
      constant;
      /**
       *  The returned types for the result of calling this function.
       */
      outputs;
      /**
       *  The state mutability (e.g. ``payable``, ``nonpayable``, ``view``
       *  or ``pure``)
       */
      stateMutability;
      /**
       *  If the function can be sent value during invocation.
       */
      payable;
      /**
       *  The recommended gas limit to send when calling this function.
       */
      gas;
      /**
       *  @private
       */
      constructor(guard, name, stateMutability, inputs, outputs, gas) {
        super(guard, "function", name, inputs);
        Object.defineProperty(this, internal, { value: FunctionFragmentInternal });
        outputs = Object.freeze(outputs.slice());
        const constant = stateMutability === "view" || stateMutability === "pure";
        const payable = stateMutability === "payable";
        defineProperties(this, { constant, gas, outputs, payable, stateMutability });
      }
      /**
       *  The Function selector.
       */
      get selector() {
        return id(this.format("sighash")).substring(0, 10);
      }
      /**
       *  Returns a string representation of this function as %%format%%.
       */
      format(format) {
        if (format == null) {
          format = "sighash";
        }
        if (format === "json") {
          return JSON.stringify({
            type: "function",
            name: this.name,
            constant: this.constant,
            stateMutability: this.stateMutability !== "nonpayable" ? this.stateMutability : void 0,
            payable: this.payable,
            gas: this.gas != null ? this.gas : void 0,
            inputs: this.inputs.map((i) => JSON.parse(i.format(format))),
            outputs: this.outputs.map((o) => JSON.parse(o.format(format)))
          });
        }
        const result = [];
        if (format !== "sighash") {
          result.push("function");
        }
        result.push(this.name + joinParams(format, this.inputs));
        if (format !== "sighash") {
          if (this.stateMutability !== "nonpayable") {
            result.push(this.stateMutability);
          }
          if (this.outputs && this.outputs.length) {
            result.push("returns");
            result.push(joinParams(format, this.outputs));
          }
          if (this.gas != null) {
            result.push(`@${this.gas.toString()}`);
          }
        }
        return result.join(" ");
      }
      /**
       *  Return the selector for a function with %%name%% and %%params%%.
       */
      static getSelector(name, params) {
        params = (params || []).map((p) => ParamType.from(p));
        const fragment = new _FunctionFragment(_guard3, name, "view", params, [], null);
        return fragment.selector;
      }
      /**
       *  Returns a new **FunctionFragment** for %%obj%%.
       */
      static from(obj) {
        if (_FunctionFragment.isFragment(obj)) {
          return obj;
        }
        if (typeof obj === "string") {
          try {
            return _FunctionFragment.from(lex(obj));
          } catch (error) {
            assertArgument(false, "invalid function fragment", "obj", obj);
          }
        } else if (obj instanceof TokenString) {
          const name = consumeName("function", obj);
          const inputs = consumeParams(obj);
          const mutability = consumeMutability(obj);
          let outputs = [];
          if (consumeKeywords(obj, setify(["returns"])).has("returns")) {
            outputs = consumeParams(obj);
          }
          const gas = consumeGas(obj);
          consumeEoi(obj);
          return new _FunctionFragment(_guard3, name, mutability, inputs, outputs, gas);
        }
        let stateMutability = obj.stateMutability;
        if (stateMutability == null) {
          stateMutability = "payable";
          if (typeof obj.constant === "boolean") {
            stateMutability = "view";
            if (!obj.constant) {
              stateMutability = "payable";
              if (typeof obj.payable === "boolean" && !obj.payable) {
                stateMutability = "nonpayable";
              }
            }
          } else if (typeof obj.payable === "boolean" && !obj.payable) {
            stateMutability = "nonpayable";
          }
        }
        return new _FunctionFragment(_guard3, obj.name, stateMutability, obj.inputs ? obj.inputs.map(ParamType.from) : [], obj.outputs ? obj.outputs.map(ParamType.from) : [], obj.gas != null ? obj.gas : null);
      }
      /**
       *  Returns ``true`` and provides a type guard if %%value%% is a
       *  **FunctionFragment**.
       */
      static isFragment(value) {
        return value && value[internal] === FunctionFragmentInternal;
      }
    };
    StructFragment = class _StructFragment extends NamedFragment {
      /**
       *  @private
       */
      constructor(guard, name, inputs) {
        super(guard, "struct", name, inputs);
        Object.defineProperty(this, internal, { value: StructFragmentInternal });
      }
      /**
       *  Returns a string representation of this struct as %%format%%.
       */
      format() {
        throw new Error("@TODO");
      }
      /**
       *  Returns a new **StructFragment** for %%obj%%.
       */
      static from(obj) {
        if (typeof obj === "string") {
          try {
            return _StructFragment.from(lex(obj));
          } catch (error) {
            assertArgument(false, "invalid struct fragment", "obj", obj);
          }
        } else if (obj instanceof TokenString) {
          const name = consumeName("struct", obj);
          const inputs = consumeParams(obj);
          consumeEoi(obj);
          return new _StructFragment(_guard3, name, inputs);
        }
        return new _StructFragment(_guard3, obj.name, obj.inputs ? obj.inputs.map(ParamType.from) : []);
      }
      // @TODO: fix this return type
      /**
       *  Returns ``true`` and provides a type guard if %%value%% is a
       *  **StructFragment**.
       */
      static isFragment(value) {
        return value && value[internal] === StructFragmentInternal;
      }
    };
  }
});

// node_modules/ethers/lib.esm/abi/abi-coder.js
function getBuiltinCallException(action, tx, data, abiCoder) {
  let message = "missing revert data";
  let reason = null;
  const invocation = null;
  let revert = null;
  if (data) {
    message = "execution reverted";
    const bytes2 = getBytes(data);
    data = hexlify(data);
    if (bytes2.length === 0) {
      message += " (no data present; likely require(false) occurred";
      reason = "require(false)";
    } else if (bytes2.length % 32 !== 4) {
      message += " (could not decode reason; invalid data length)";
    } else if (hexlify(bytes2.slice(0, 4)) === "0x08c379a0") {
      try {
        reason = abiCoder.decode(["string"], bytes2.slice(4))[0];
        revert = {
          signature: "Error(string)",
          name: "Error",
          args: [reason]
        };
        message += `: ${JSON.stringify(reason)}`;
      } catch (error) {
        message += " (could not decode reason; invalid string data)";
      }
    } else if (hexlify(bytes2.slice(0, 4)) === "0x4e487b71") {
      try {
        const code = Number(abiCoder.decode(["uint256"], bytes2.slice(4))[0]);
        revert = {
          signature: "Panic(uint256)",
          name: "Panic",
          args: [code]
        };
        reason = `Panic due to ${PanicReasons.get(code) || "UNKNOWN"}(${code})`;
        message += `: ${reason}`;
      } catch (error) {
        message += " (could not decode panic code)";
      }
    } else {
      message += " (unknown custom error)";
    }
  }
  const transaction = {
    to: tx.to ? getAddress(tx.to) : null,
    data: tx.data || "0x"
  };
  if (tx.from) {
    transaction.from = getAddress(tx.from);
  }
  return makeError(message, "CALL_EXCEPTION", {
    action,
    data,
    reason,
    transaction,
    invocation,
    revert
  });
}
var PanicReasons, paramTypeBytes, paramTypeNumber, defaultCoder, defaultMaxInflation, AbiCoder;
var init_abi_coder = __esm({
  "node_modules/ethers/lib.esm/abi/abi-coder.js"() {
    init_utils();
    init_abstract_coder();
    init_address3();
    init_array();
    init_boolean();
    init_bytes();
    init_fixed_bytes();
    init_null();
    init_number();
    init_string();
    init_tuple();
    init_fragments();
    init_address2();
    init_utils();
    PanicReasons = /* @__PURE__ */ new Map();
    PanicReasons.set(0, "GENERIC_PANIC");
    PanicReasons.set(1, "ASSERT_FALSE");
    PanicReasons.set(17, "OVERFLOW");
    PanicReasons.set(18, "DIVIDE_BY_ZERO");
    PanicReasons.set(33, "ENUM_RANGE_ERROR");
    PanicReasons.set(34, "BAD_STORAGE_DATA");
    PanicReasons.set(49, "STACK_UNDERFLOW");
    PanicReasons.set(50, "ARRAY_RANGE_ERROR");
    PanicReasons.set(65, "OUT_OF_MEMORY");
    PanicReasons.set(81, "UNINITIALIZED_FUNCTION_CALL");
    paramTypeBytes = new RegExp(/^bytes([0-9]*)$/);
    paramTypeNumber = new RegExp(/^(u?int)([0-9]*)$/);
    defaultCoder = null;
    defaultMaxInflation = 1024;
    AbiCoder = class _AbiCoder {
      #getCoder(param) {
        if (param.isArray()) {
          return new ArrayCoder(this.#getCoder(param.arrayChildren), param.arrayLength, param.name);
        }
        if (param.isTuple()) {
          return new TupleCoder(param.components.map((c) => this.#getCoder(c)), param.name);
        }
        switch (param.baseType) {
          case "address":
            return new AddressCoder(param.name);
          case "bool":
            return new BooleanCoder(param.name);
          case "string":
            return new StringCoder(param.name);
          case "bytes":
            return new BytesCoder(param.name);
          case "":
            return new NullCoder(param.name);
        }
        let match = param.type.match(paramTypeNumber);
        if (match) {
          let size = parseInt(match[2] || "256");
          assertArgument(size !== 0 && size <= 256 && size % 8 === 0, "invalid " + match[1] + " bit length", "param", param);
          return new NumberCoder(size / 8, match[1] === "int", param.name);
        }
        match = param.type.match(paramTypeBytes);
        if (match) {
          let size = parseInt(match[1]);
          assertArgument(size !== 0 && size <= 32, "invalid bytes length", "param", param);
          return new FixedBytesCoder(size, param.name);
        }
        assertArgument(false, "invalid type", "type", param.type);
      }
      /**
       *  Get the default values for the given %%types%%.
       *
       *  For example, a ``uint`` is by default ``0`` and ``bool``
       *  is by default ``false``.
       */
      getDefaultValue(types) {
        const coders = types.map((type) => this.#getCoder(ParamType.from(type)));
        const coder3 = new TupleCoder(coders, "_");
        return coder3.defaultValue();
      }
      /**
       *  Encode the %%values%% as the %%types%% into ABI data.
       *
       *  @returns DataHexstring
       */
      encode(types, values) {
        assertArgumentCount(values.length, types.length, "types/values length mismatch");
        const coders = types.map((type) => this.#getCoder(ParamType.from(type)));
        const coder3 = new TupleCoder(coders, "_");
        const writer = new Writer();
        coder3.encode(writer, values);
        return writer.data;
      }
      /**
       *  Decode the ABI %%data%% as the %%types%% into values.
       *
       *  If %%loose%% decoding is enabled, then strict padding is
       *  not enforced. Some older versions of Solidity incorrectly
       *  padded event data emitted from ``external`` functions.
       */
      decode(types, data, loose) {
        const coders = types.map((type) => this.#getCoder(ParamType.from(type)));
        const coder3 = new TupleCoder(coders, "_");
        return coder3.decode(new Reader(data, loose, defaultMaxInflation));
      }
      static _setDefaultMaxInflation(value) {
        assertArgument(typeof value === "number" && Number.isInteger(value), "invalid defaultMaxInflation factor", "value", value);
        defaultMaxInflation = value;
      }
      /**
       *  Returns the shared singleton instance of a default [[AbiCoder]].
       *
       *  On the first call, the instance is created internally.
       */
      static defaultAbiCoder() {
        if (defaultCoder == null) {
          defaultCoder = new _AbiCoder();
        }
        return defaultCoder;
      }
      /**
       *  Returns an ethers-compatible [[CallExceptionError]] Error for the given
       *  result %%data%% for the [[CallExceptionAction]] %%action%% against
       *  the Transaction %%tx%%.
       */
      static getBuiltinCallException(action, tx, data) {
        return getBuiltinCallException(action, tx, data, _AbiCoder.defaultAbiCoder());
      }
    };
  }
});

// node_modules/ethers/lib.esm/abi/interface.js
var LogDescription, TransactionDescription, ErrorDescription, Indexed, PanicReasons2, BuiltinErrors, Interface;
var init_interface = __esm({
  "node_modules/ethers/lib.esm/abi/interface.js"() {
    init_crypto();
    init_hash();
    init_utils();
    init_abi_coder();
    init_abstract_coder();
    init_fragments();
    init_typed();
    LogDescription = class {
      /**
       *  The matching fragment for the ``topic0``.
       */
      fragment;
      /**
       *  The name of the Event.
       */
      name;
      /**
       *  The full Event signature.
       */
      signature;
      /**
       *  The topic hash for the Event.
       */
      topic;
      /**
       *  The arguments passed into the Event with ``emit``.
       */
      args;
      /**
       *  @_ignore:
       */
      constructor(fragment, topic, args) {
        const name = fragment.name, signature = fragment.format();
        defineProperties(this, {
          fragment,
          name,
          signature,
          topic,
          args
        });
      }
    };
    TransactionDescription = class {
      /**
       *  The matching fragment from the transaction ``data``.
       */
      fragment;
      /**
       *  The name of the Function from the transaction ``data``.
       */
      name;
      /**
       *  The arguments passed to the Function from the transaction ``data``.
       */
      args;
      /**
       *  The full Function signature from the transaction ``data``.
       */
      signature;
      /**
       *  The selector for the Function from the transaction ``data``.
       */
      selector;
      /**
       *  The ``value`` (in wei) from the transaction.
       */
      value;
      /**
       *  @_ignore:
       */
      constructor(fragment, selector, args, value) {
        const name = fragment.name, signature = fragment.format();
        defineProperties(this, {
          fragment,
          name,
          args,
          signature,
          selector,
          value
        });
      }
    };
    ErrorDescription = class {
      /**
       *  The matching fragment.
       */
      fragment;
      /**
       *  The name of the Error.
       */
      name;
      /**
       *  The arguments passed to the Error with ``revert``.
       */
      args;
      /**
       *  The full Error signature.
       */
      signature;
      /**
       *  The selector for the Error.
       */
      selector;
      /**
       *  @_ignore:
       */
      constructor(fragment, selector, args) {
        const name = fragment.name, signature = fragment.format();
        defineProperties(this, {
          fragment,
          name,
          args,
          signature,
          selector
        });
      }
    };
    Indexed = class {
      /**
       *  The ``keccak256`` of the value logged.
       */
      hash;
      /**
       *  @_ignore:
       */
      _isIndexed;
      /**
       *  Returns ``true`` if %%value%% is an **Indexed**.
       *
       *  This provides a Type Guard for property access.
       */
      static isIndexed(value) {
        return !!(value && value._isIndexed);
      }
      /**
       *  @_ignore:
       */
      constructor(hash4) {
        defineProperties(this, { hash: hash4, _isIndexed: true });
      }
    };
    PanicReasons2 = {
      "0": "generic panic",
      "1": "assert(false)",
      "17": "arithmetic overflow",
      "18": "division or modulo by zero",
      "33": "enum overflow",
      "34": "invalid encoded storage byte array accessed",
      "49": "out-of-bounds array access; popping on an empty array",
      "50": "out-of-bounds access of an array or bytesN",
      "65": "out of memory",
      "81": "uninitialized function"
    };
    BuiltinErrors = {
      "0x08c379a0": {
        signature: "Error(string)",
        name: "Error",
        inputs: ["string"],
        reason: (message) => {
          return `reverted with reason string ${JSON.stringify(message)}`;
        }
      },
      "0x4e487b71": {
        signature: "Panic(uint256)",
        name: "Panic",
        inputs: ["uint256"],
        reason: (code) => {
          let reason = "unknown panic code";
          if (code >= 0 && code <= 255 && PanicReasons2[code.toString()]) {
            reason = PanicReasons2[code.toString()];
          }
          return `reverted with panic code 0x${code.toString(16)} (${reason})`;
        }
      }
    };
    Interface = class _Interface {
      /**
       *  All the Contract ABI members (i.e. methods, events, errors, etc).
       */
      fragments;
      /**
       *  The Contract constructor.
       */
      deploy;
      /**
       *  The Fallback method, if any.
       */
      fallback;
      /**
       *  If receiving ether is supported.
       */
      receive;
      #errors;
      #events;
      #functions;
      //    #structs: Map<string, StructFragment>;
      #abiCoder;
      /**
       *  Create a new Interface for the %%fragments%%.
       */
      constructor(fragments) {
        let abi = [];
        if (typeof fragments === "string") {
          abi = JSON.parse(fragments);
        } else {
          abi = fragments;
        }
        this.#functions = /* @__PURE__ */ new Map();
        this.#errors = /* @__PURE__ */ new Map();
        this.#events = /* @__PURE__ */ new Map();
        const frags = [];
        for (const a of abi) {
          try {
            frags.push(Fragment.from(a));
          } catch (error) {
            console.log(`[Warning] Invalid Fragment ${JSON.stringify(a)}:`, error.message);
          }
        }
        defineProperties(this, {
          fragments: Object.freeze(frags)
        });
        let fallback = null;
        let receive = false;
        this.#abiCoder = this.getAbiCoder();
        this.fragments.forEach((fragment, index) => {
          let bucket;
          switch (fragment.type) {
            case "constructor":
              if (this.deploy) {
                console.log("duplicate definition - constructor");
                return;
              }
              defineProperties(this, { deploy: fragment });
              return;
            case "fallback":
              if (fragment.inputs.length === 0) {
                receive = true;
              } else {
                assertArgument(!fallback || fragment.payable !== fallback.payable, "conflicting fallback fragments", `fragments[${index}]`, fragment);
                fallback = fragment;
                receive = fallback.payable;
              }
              return;
            case "function":
              bucket = this.#functions;
              break;
            case "event":
              bucket = this.#events;
              break;
            case "error":
              bucket = this.#errors;
              break;
            default:
              return;
          }
          const signature = fragment.format();
          if (bucket.has(signature)) {
            return;
          }
          bucket.set(signature, fragment);
        });
        if (!this.deploy) {
          defineProperties(this, {
            deploy: ConstructorFragment.from("constructor()")
          });
        }
        defineProperties(this, { fallback, receive });
      }
      /**
       *  Returns the entire Human-Readable ABI, as an array of
       *  signatures, optionally as %%minimal%% strings, which
       *  removes parameter names and unneceesary spaces.
       */
      format(minimal) {
        const format = minimal ? "minimal" : "full";
        const abi = this.fragments.map((f) => f.format(format));
        return abi;
      }
      /**
       *  Return the JSON-encoded ABI. This is the format Solidiy
       *  returns.
       */
      formatJson() {
        const abi = this.fragments.map((f) => f.format("json"));
        return JSON.stringify(abi.map((j) => JSON.parse(j)));
      }
      /**
       *  The ABI coder that will be used to encode and decode binary
       *  data.
       */
      getAbiCoder() {
        return AbiCoder.defaultAbiCoder();
      }
      // Find a function definition by any means necessary (unless it is ambiguous)
      #getFunction(key, values, forceUnique) {
        if (isHexString(key)) {
          const selector = key.toLowerCase();
          for (const fragment of this.#functions.values()) {
            if (selector === fragment.selector) {
              return fragment;
            }
          }
          return null;
        }
        if (key.indexOf("(") === -1) {
          const matching = [];
          for (const [name, fragment] of this.#functions) {
            if (name.split(
              "("
              /* fix:) */
            )[0] === key) {
              matching.push(fragment);
            }
          }
          if (values) {
            const lastValue = values.length > 0 ? values[values.length - 1] : null;
            let valueLength = values.length;
            let allowOptions = true;
            if (Typed.isTyped(lastValue) && lastValue.type === "overrides") {
              allowOptions = false;
              valueLength--;
            }
            for (let i = matching.length - 1; i >= 0; i--) {
              const inputs = matching[i].inputs.length;
              if (inputs !== valueLength && (!allowOptions || inputs !== valueLength - 1)) {
                matching.splice(i, 1);
              }
            }
            for (let i = matching.length - 1; i >= 0; i--) {
              const inputs = matching[i].inputs;
              for (let j = 0; j < values.length; j++) {
                if (!Typed.isTyped(values[j])) {
                  continue;
                }
                if (j >= inputs.length) {
                  if (values[j].type === "overrides") {
                    continue;
                  }
                  matching.splice(i, 1);
                  break;
                }
                if (values[j].type !== inputs[j].baseType) {
                  matching.splice(i, 1);
                  break;
                }
              }
            }
          }
          if (matching.length === 1 && values && values.length !== matching[0].inputs.length) {
            const lastArg = values[values.length - 1];
            if (lastArg == null || Array.isArray(lastArg) || typeof lastArg !== "object") {
              matching.splice(0, 1);
            }
          }
          if (matching.length === 0) {
            return null;
          }
          if (matching.length > 1 && forceUnique) {
            const matchStr = matching.map((m) => JSON.stringify(m.format())).join(", ");
            assertArgument(false, `ambiguous function description (i.e. matches ${matchStr})`, "key", key);
          }
          return matching[0];
        }
        const result = this.#functions.get(FunctionFragment.from(key).format());
        if (result) {
          return result;
        }
        return null;
      }
      /**
       *  Get the function name for %%key%%, which may be a function selector,
       *  function name or function signature that belongs to the ABI.
       */
      getFunctionName(key) {
        const fragment = this.#getFunction(key, null, false);
        assertArgument(fragment, "no matching function", "key", key);
        return fragment.name;
      }
      /**
       *  Returns true if %%key%% (a function selector, function name or
       *  function signature) is present in the ABI.
       *
       *  In the case of a function name, the name may be ambiguous, so
       *  accessing the [[FunctionFragment]] may require refinement.
       */
      hasFunction(key) {
        return !!this.#getFunction(key, null, false);
      }
      /**
       *  Get the [[FunctionFragment]] for %%key%%, which may be a function
       *  selector, function name or function signature that belongs to the ABI.
       *
       *  If %%values%% is provided, it will use the Typed API to handle
       *  ambiguous cases where multiple functions match by name.
       *
       *  If the %%key%% and %%values%% do not refine to a single function in
       *  the ABI, this will throw.
       */
      getFunction(key, values) {
        return this.#getFunction(key, values || null, true);
      }
      /**
       *  Iterate over all functions, calling %%callback%%, sorted by their name.
       */
      forEachFunction(callback) {
        const names = Array.from(this.#functions.keys());
        names.sort((a, b2) => a.localeCompare(b2));
        for (let i = 0; i < names.length; i++) {
          const name = names[i];
          callback(this.#functions.get(name), i);
        }
      }
      // Find an event definition by any means necessary (unless it is ambiguous)
      #getEvent(key, values, forceUnique) {
        if (isHexString(key)) {
          const eventTopic = key.toLowerCase();
          for (const fragment of this.#events.values()) {
            if (eventTopic === fragment.topicHash) {
              return fragment;
            }
          }
          return null;
        }
        if (key.indexOf("(") === -1) {
          const matching = [];
          for (const [name, fragment] of this.#events) {
            if (name.split(
              "("
              /* fix:) */
            )[0] === key) {
              matching.push(fragment);
            }
          }
          if (values) {
            for (let i = matching.length - 1; i >= 0; i--) {
              if (matching[i].inputs.length < values.length) {
                matching.splice(i, 1);
              }
            }
            for (let i = matching.length - 1; i >= 0; i--) {
              const inputs = matching[i].inputs;
              for (let j = 0; j < values.length; j++) {
                if (!Typed.isTyped(values[j])) {
                  continue;
                }
                if (values[j].type !== inputs[j].baseType) {
                  matching.splice(i, 1);
                  break;
                }
              }
            }
          }
          if (matching.length === 0) {
            return null;
          }
          if (matching.length > 1 && forceUnique) {
            const matchStr = matching.map((m) => JSON.stringify(m.format())).join(", ");
            assertArgument(false, `ambiguous event description (i.e. matches ${matchStr})`, "key", key);
          }
          return matching[0];
        }
        const result = this.#events.get(EventFragment.from(key).format());
        if (result) {
          return result;
        }
        return null;
      }
      /**
       *  Get the event name for %%key%%, which may be a topic hash,
       *  event name or event signature that belongs to the ABI.
       */
      getEventName(key) {
        const fragment = this.#getEvent(key, null, false);
        assertArgument(fragment, "no matching event", "key", key);
        return fragment.name;
      }
      /**
       *  Returns true if %%key%% (an event topic hash, event name or
       *  event signature) is present in the ABI.
       *
       *  In the case of an event name, the name may be ambiguous, so
       *  accessing the [[EventFragment]] may require refinement.
       */
      hasEvent(key) {
        return !!this.#getEvent(key, null, false);
      }
      /**
       *  Get the [[EventFragment]] for %%key%%, which may be a topic hash,
       *  event name or event signature that belongs to the ABI.
       *
       *  If %%values%% is provided, it will use the Typed API to handle
       *  ambiguous cases where multiple events match by name.
       *
       *  If the %%key%% and %%values%% do not refine to a single event in
       *  the ABI, this will throw.
       */
      getEvent(key, values) {
        return this.#getEvent(key, values || null, true);
      }
      /**
       *  Iterate over all events, calling %%callback%%, sorted by their name.
       */
      forEachEvent(callback) {
        const names = Array.from(this.#events.keys());
        names.sort((a, b2) => a.localeCompare(b2));
        for (let i = 0; i < names.length; i++) {
          const name = names[i];
          callback(this.#events.get(name), i);
        }
      }
      /**
       *  Get the [[ErrorFragment]] for %%key%%, which may be an error
       *  selector, error name or error signature that belongs to the ABI.
       *
       *  If %%values%% is provided, it will use the Typed API to handle
       *  ambiguous cases where multiple errors match by name.
       *
       *  If the %%key%% and %%values%% do not refine to a single error in
       *  the ABI, this will throw.
       */
      getError(key, values) {
        if (isHexString(key)) {
          const selector = key.toLowerCase();
          if (BuiltinErrors[selector]) {
            return ErrorFragment.from(BuiltinErrors[selector].signature);
          }
          for (const fragment of this.#errors.values()) {
            if (selector === fragment.selector) {
              return fragment;
            }
          }
          return null;
        }
        if (key.indexOf("(") === -1) {
          const matching = [];
          for (const [name, fragment] of this.#errors) {
            if (name.split(
              "("
              /* fix:) */
            )[0] === key) {
              matching.push(fragment);
            }
          }
          if (matching.length === 0) {
            if (key === "Error") {
              return ErrorFragment.from("error Error(string)");
            }
            if (key === "Panic") {
              return ErrorFragment.from("error Panic(uint256)");
            }
            return null;
          } else if (matching.length > 1) {
            const matchStr = matching.map((m) => JSON.stringify(m.format())).join(", ");
            assertArgument(false, `ambiguous error description (i.e. ${matchStr})`, "name", key);
          }
          return matching[0];
        }
        key = ErrorFragment.from(key).format();
        if (key === "Error(string)") {
          return ErrorFragment.from("error Error(string)");
        }
        if (key === "Panic(uint256)") {
          return ErrorFragment.from("error Panic(uint256)");
        }
        const result = this.#errors.get(key);
        if (result) {
          return result;
        }
        return null;
      }
      /**
       *  Iterate over all errors, calling %%callback%%, sorted by their name.
       */
      forEachError(callback) {
        const names = Array.from(this.#errors.keys());
        names.sort((a, b2) => a.localeCompare(b2));
        for (let i = 0; i < names.length; i++) {
          const name = names[i];
          callback(this.#errors.get(name), i);
        }
      }
      // Get the 4-byte selector used by Solidity to identify a function
      /*
      getSelector(fragment: ErrorFragment | FunctionFragment): string {
          if (typeof(fragment) === "string") {
              const matches: Array<Fragment> = [ ];
      
              try { matches.push(this.getFunction(fragment)); } catch (error) { }
              try { matches.push(this.getError(<string>fragment)); } catch (_) { }
      
              if (matches.length === 0) {
                  logger.throwArgumentError("unknown fragment", "key", fragment);
              } else if (matches.length > 1) {
                  logger.throwArgumentError("ambiguous fragment matches function and error", "key", fragment);
              }
      
              fragment = matches[0];
          }
      
          return dataSlice(id(fragment.format()), 0, 4);
      }
          */
      // Get the 32-byte topic hash used by Solidity to identify an event
      /*
      getEventTopic(fragment: EventFragment): string {
          //if (typeof(fragment) === "string") { fragment = this.getEvent(eventFragment); }
          return id(fragment.format());
      }
      */
      _decodeParams(params, data) {
        return this.#abiCoder.decode(params, data);
      }
      _encodeParams(params, values) {
        return this.#abiCoder.encode(params, values);
      }
      /**
       *  Encodes a ``tx.data`` object for deploying the Contract with
       *  the %%values%% as the constructor arguments.
       */
      encodeDeploy(values) {
        return this._encodeParams(this.deploy.inputs, values || []);
      }
      /**
       *  Decodes the result %%data%% (e.g. from an ``eth_call``) for the
       *  specified error (see [[getError]] for valid values for
       *  %%key%%).
       *
       *  Most developers should prefer the [[parseCallResult]] method instead,
       *  which will automatically detect a ``CALL_EXCEPTION`` and throw the
       *  corresponding error.
       */
      decodeErrorResult(fragment, data) {
        if (typeof fragment === "string") {
          const f = this.getError(fragment);
          assertArgument(f, "unknown error", "fragment", fragment);
          fragment = f;
        }
        assertArgument(dataSlice(data, 0, 4) === fragment.selector, `data signature does not match error ${fragment.name}.`, "data", data);
        return this._decodeParams(fragment.inputs, dataSlice(data, 4));
      }
      /**
       *  Encodes the transaction revert data for a call result that
       *  reverted from the the Contract with the sepcified %%error%%
       *  (see [[getError]] for valid values for %%fragment%%) with the %%values%%.
       *
       *  This is generally not used by most developers, unless trying to mock
       *  a result from a Contract.
       */
      encodeErrorResult(fragment, values) {
        if (typeof fragment === "string") {
          const f = this.getError(fragment);
          assertArgument(f, "unknown error", "fragment", fragment);
          fragment = f;
        }
        return concat([
          fragment.selector,
          this._encodeParams(fragment.inputs, values || [])
        ]);
      }
      /**
       *  Decodes the %%data%% from a transaction ``tx.data`` for
       *  the function specified (see [[getFunction]] for valid values
       *  for %%fragment%%).
       *
       *  Most developers should prefer the [[parseTransaction]] method
       *  instead, which will automatically detect the fragment.
       */
      decodeFunctionData(fragment, data) {
        if (typeof fragment === "string") {
          const f = this.getFunction(fragment);
          assertArgument(f, "unknown function", "fragment", fragment);
          fragment = f;
        }
        assertArgument(dataSlice(data, 0, 4) === fragment.selector, `data signature does not match function ${fragment.name}.`, "data", data);
        return this._decodeParams(fragment.inputs, dataSlice(data, 4));
      }
      /**
       *  Encodes the ``tx.data`` for a transaction that calls the function
       *  specified (see [[getFunction]] for valid values for %%fragment%%) with
       *  the %%values%%.
       */
      encodeFunctionData(fragment, values) {
        if (typeof fragment === "string") {
          const f = this.getFunction(fragment);
          assertArgument(f, "unknown function", "fragment", fragment);
          fragment = f;
        }
        return concat([
          fragment.selector,
          this._encodeParams(fragment.inputs, values || [])
        ]);
      }
      /**
       *  Decodes the result %%data%% (e.g. from an ``eth_call``) for the
       *  specified function (see [[getFunction]] for valid values for
       *  %%key%%).
       *
       *  Most developers should prefer the [[parseCallResult]] method instead,
       *  which will automatically detect a ``CALL_EXCEPTION`` and throw the
       *  corresponding error.
       */
      decodeFunctionResult(fragment, data) {
        if (typeof fragment === "string") {
          const f = this.getFunction(fragment);
          assertArgument(f, "unknown function", "fragment", fragment);
          fragment = f;
        }
        let message = "invalid length for result data";
        const bytes2 = getBytesCopy(data);
        if (bytes2.length % 32 === 0) {
          try {
            return this.#abiCoder.decode(fragment.outputs, bytes2);
          } catch (error) {
            message = "could not decode result data";
          }
        }
        assert(false, message, "BAD_DATA", {
          value: hexlify(bytes2),
          info: { method: fragment.name, signature: fragment.format() }
        });
      }
      makeError(_data, tx) {
        const data = getBytes(_data, "data");
        const error = AbiCoder.getBuiltinCallException("call", tx, data);
        const customPrefix = "execution reverted (unknown custom error)";
        if (error.message.startsWith(customPrefix)) {
          const selector = hexlify(data.slice(0, 4));
          const ef = this.getError(selector);
          if (ef) {
            try {
              const args = this.#abiCoder.decode(ef.inputs, data.slice(4));
              error.revert = {
                name: ef.name,
                signature: ef.format(),
                args
              };
              error.reason = error.revert.signature;
              error.message = `execution reverted: ${error.reason}`;
            } catch (e) {
              error.message = `execution reverted (coult not decode custom error)`;
            }
          }
        }
        const parsed = this.parseTransaction(tx);
        if (parsed) {
          error.invocation = {
            method: parsed.name,
            signature: parsed.signature,
            args: parsed.args
          };
        }
        return error;
      }
      /**
       *  Encodes the result data (e.g. from an ``eth_call``) for the
       *  specified function (see [[getFunction]] for valid values
       *  for %%fragment%%) with %%values%%.
       *
       *  This is generally not used by most developers, unless trying to mock
       *  a result from a Contract.
       */
      encodeFunctionResult(fragment, values) {
        if (typeof fragment === "string") {
          const f = this.getFunction(fragment);
          assertArgument(f, "unknown function", "fragment", fragment);
          fragment = f;
        }
        return hexlify(this.#abiCoder.encode(fragment.outputs, values || []));
      }
      /*
          spelunk(inputs: Array<ParamType>, values: ReadonlyArray<any>, processfunc: (type: string, value: any) => Promise<any>): Promise<Array<any>> {
              const promises: Array<Promise<>> = [ ];
              const process = function(type: ParamType, value: any): any {
                  if (type.baseType === "array") {
                      return descend(type.child
                  }
                  if (type. === "address") {
                  }
              };
      
              const descend = function (inputs: Array<ParamType>, values: ReadonlyArray<any>) {
                  if (inputs.length !== values.length) { throw new Error("length mismatch"); }
                  
              };
      
              const result: Array<any> = [ ];
              values.forEach((value, index) => {
                  if (value == null) {
                      topics.push(null);
                  } else if (param.baseType === "array" || param.baseType === "tuple") {
                      logger.throwArgumentError("filtering with tuples or arrays not supported", ("contract." + param.name), value);
                  } else if (Array.isArray(value)) {
                      topics.push(value.map((value) => encodeTopic(param, value)));
                  } else {
                      topics.push(encodeTopic(param, value));
                  }
              });
          }
      */
      // Create the filter for the event with search criteria (e.g. for eth_filterLog)
      encodeFilterTopics(fragment, values) {
        if (typeof fragment === "string") {
          const f = this.getEvent(fragment);
          assertArgument(f, "unknown event", "eventFragment", fragment);
          fragment = f;
        }
        assert(values.length <= fragment.inputs.length, `too many arguments for ${fragment.format()}`, "UNEXPECTED_ARGUMENT", { count: values.length, expectedCount: fragment.inputs.length });
        const topics = [];
        if (!fragment.anonymous) {
          topics.push(fragment.topicHash);
        }
        const encodeTopic = (param, value) => {
          if (param.type === "string") {
            return id(value);
          } else if (param.type === "bytes") {
            return keccak256(hexlify(value));
          }
          if (param.type === "bool" && typeof value === "boolean") {
            value = value ? "0x01" : "0x00";
          } else if (param.type.match(/^u?int/)) {
            value = toBeHex(value);
          } else if (param.type.match(/^bytes/)) {
            value = zeroPadBytes(value, 32);
          } else if (param.type === "address") {
            this.#abiCoder.encode(["address"], [value]);
          }
          return zeroPadValue(hexlify(value), 32);
        };
        values.forEach((value, index) => {
          const param = fragment.inputs[index];
          if (!param.indexed) {
            assertArgument(value == null, "cannot filter non-indexed parameters; must be null", "contract." + param.name, value);
            return;
          }
          if (value == null) {
            topics.push(null);
          } else if (param.baseType === "array" || param.baseType === "tuple") {
            assertArgument(false, "filtering with tuples or arrays not supported", "contract." + param.name, value);
          } else if (Array.isArray(value)) {
            topics.push(value.map((value2) => encodeTopic(param, value2)));
          } else {
            topics.push(encodeTopic(param, value));
          }
        });
        while (topics.length && topics[topics.length - 1] === null) {
          topics.pop();
        }
        return topics;
      }
      encodeEventLog(fragment, values) {
        if (typeof fragment === "string") {
          const f = this.getEvent(fragment);
          assertArgument(f, "unknown event", "eventFragment", fragment);
          fragment = f;
        }
        const topics = [];
        const dataTypes = [];
        const dataValues = [];
        if (!fragment.anonymous) {
          topics.push(fragment.topicHash);
        }
        assertArgument(values.length === fragment.inputs.length, "event arguments/values mismatch", "values", values);
        fragment.inputs.forEach((param, index) => {
          const value = values[index];
          if (param.indexed) {
            if (param.type === "string") {
              topics.push(id(value));
            } else if (param.type === "bytes") {
              topics.push(keccak256(value));
            } else if (param.baseType === "tuple" || param.baseType === "array") {
              throw new Error("not implemented");
            } else {
              topics.push(this.#abiCoder.encode([param.type], [value]));
            }
          } else {
            dataTypes.push(param);
            dataValues.push(value);
          }
        });
        return {
          data: this.#abiCoder.encode(dataTypes, dataValues),
          topics
        };
      }
      // Decode a filter for the event and the search criteria
      decodeEventLog(fragment, data, topics) {
        if (typeof fragment === "string") {
          const f = this.getEvent(fragment);
          assertArgument(f, "unknown event", "eventFragment", fragment);
          fragment = f;
        }
        if (topics != null && !fragment.anonymous) {
          const eventTopic = fragment.topicHash;
          assertArgument(isHexString(topics[0], 32) && topics[0].toLowerCase() === eventTopic, "fragment/topic mismatch", "topics[0]", topics[0]);
          topics = topics.slice(1);
        }
        const indexed = [];
        const nonIndexed = [];
        const dynamic = [];
        fragment.inputs.forEach((param, index) => {
          if (param.indexed) {
            if (param.type === "string" || param.type === "bytes" || param.baseType === "tuple" || param.baseType === "array") {
              indexed.push(ParamType.from({ type: "bytes32", name: param.name }));
              dynamic.push(true);
            } else {
              indexed.push(param);
              dynamic.push(false);
            }
          } else {
            nonIndexed.push(param);
            dynamic.push(false);
          }
        });
        const resultIndexed = topics != null ? this.#abiCoder.decode(indexed, concat(topics)) : null;
        const resultNonIndexed = this.#abiCoder.decode(nonIndexed, data, true);
        const values = [];
        const keys = [];
        let nonIndexedIndex = 0, indexedIndex = 0;
        fragment.inputs.forEach((param, index) => {
          let value = null;
          if (param.indexed) {
            if (resultIndexed == null) {
              value = new Indexed(null);
            } else if (dynamic[index]) {
              value = new Indexed(resultIndexed[indexedIndex++]);
            } else {
              try {
                value = resultIndexed[indexedIndex++];
              } catch (error) {
                value = error;
              }
            }
          } else {
            try {
              value = resultNonIndexed[nonIndexedIndex++];
            } catch (error) {
              value = error;
            }
          }
          values.push(value);
          keys.push(param.name || null);
        });
        return Result.fromItems(values, keys);
      }
      /**
       *  Parses a transaction, finding the matching function and extracts
       *  the parameter values along with other useful function details.
       *
       *  If the matching function cannot be found, return null.
       */
      parseTransaction(tx) {
        const data = getBytes(tx.data, "tx.data");
        const value = getBigInt(tx.value != null ? tx.value : 0, "tx.value");
        const fragment = this.getFunction(hexlify(data.slice(0, 4)));
        if (!fragment) {
          return null;
        }
        const args = this.#abiCoder.decode(fragment.inputs, data.slice(4));
        return new TransactionDescription(fragment, fragment.selector, args, value);
      }
      parseCallResult(data) {
        throw new Error("@TODO");
      }
      /**
       *  Parses a receipt log, finding the matching event and extracts
       *  the parameter values along with other useful event details.
       *
       *  If the matching event cannot be found, returns null.
       */
      parseLog(log) {
        const fragment = this.getEvent(log.topics[0]);
        if (!fragment || fragment.anonymous) {
          return null;
        }
        return new LogDescription(fragment, fragment.topicHash, this.decodeEventLog(fragment, log.data, log.topics));
      }
      /**
       *  Parses a revert data, finding the matching error and extracts
       *  the parameter values along with other useful error details.
       *
       *  If the matching error cannot be found, returns null.
       */
      parseError(data) {
        const hexData = hexlify(data);
        const fragment = this.getError(dataSlice(hexData, 0, 4));
        if (!fragment) {
          return null;
        }
        const args = this.#abiCoder.decode(fragment.inputs, dataSlice(hexData, 4));
        return new ErrorDescription(fragment, fragment.selector, args);
      }
      /**
       *  Creates a new [[Interface]] from the ABI %%value%%.
       *
       *  The %%value%% may be provided as an existing [[Interface]] object,
       *  a JSON-encoded ABI or any Human-Readable ABI format.
       */
      static from(value) {
        if (value instanceof _Interface) {
          return value;
        }
        if (typeof value === "string") {
          return new _Interface(JSON.parse(value));
        }
        if (typeof value.formatJson === "function") {
          return new _Interface(value.formatJson());
        }
        if (typeof value.format === "function") {
          return new _Interface(value.format("json"));
        }
        return new _Interface(value);
      }
    };
  }
});

// node_modules/ethers/lib.esm/abi/index.js
var init_abi = __esm({
  "node_modules/ethers/lib.esm/abi/index.js"() {
    init_abi_coder();
    init_interface();
  }
});

// node_modules/ethers/lib.esm/ethers.js
var init_ethers = __esm({
  "node_modules/ethers/lib.esm/ethers.js"() {
    init_abi();
    init_address2();
    init_constants();
    init_crypto();
    init_hash();
    init_transaction();
    init_utils();
  }
});

// node_modules/ethers/lib.esm/index.js
var init_lib = __esm({
  "node_modules/ethers/lib.esm/index.js"() {
    init_ethers();
  }
});

// packages/domain/src/ids.mjs
import { randomUUID } from "node:crypto";
function newDomainId(prefix) {
  if (!PREFIX.test(prefix)) throw new Error(`Invalid domain id prefix: ${prefix}`);
  return `${prefix}_${randomUUID().replaceAll("-", "")}`;
}
var PREFIX, ids;
var init_ids = __esm({
  "packages/domain/src/ids.mjs"() {
    PREFIX = /^[a-z][a-z0-9_]{1,23}$/;
    ids = Object.freeze({
      account: () => newDomainId("acct"),
      project: () => newDomainId("proj"),
      launch: () => newDomainId("launch"),
      terms: () => newDomainId("terms"),
      mintIntent: () => newDomainId("mint"),
      redemption: () => newDomainId("redeem"),
      chainTx: () => newDomainId("tx"),
      incident: () => newDomainId("incident")
    });
  }
});

// packages/domain/src/transaction-state.mjs
function transitionTransaction(from, to) {
  if (!NEXT[from]?.has(to)) throw new Error(`Invalid transaction transition ${from} -> ${to}`);
  return to;
}
var TX_STATE, NEXT;
var init_transaction_state = __esm({
  "packages/domain/src/transaction-state.mjs"() {
    TX_STATE = Object.freeze({
      PREPARED: "PREPARED",
      WALLET_PENDING: "WALLET_PENDING",
      SUBMITTED: "SUBMITTED",
      CONFIRMED: "CONFIRMED",
      FINALIZED: "FINALIZED",
      CANCELLED: "CANCELLED",
      REVERTED: "REVERTED",
      REORGED: "REORGED"
    });
    NEXT = Object.freeze({
      PREPARED: /* @__PURE__ */ new Set(["WALLET_PENDING", "CANCELLED"]),
      WALLET_PENDING: /* @__PURE__ */ new Set(["SUBMITTED", "CANCELLED"]),
      SUBMITTED: /* @__PURE__ */ new Set(["CONFIRMED", "REVERTED", "REORGED"]),
      CONFIRMED: /* @__PURE__ */ new Set(["FINALIZED", "REORGED"]),
      REORGED: /* @__PURE__ */ new Set(["SUBMITTED", "REVERTED", "CANCELLED"]),
      FINALIZED: /* @__PURE__ */ new Set(),
      CANCELLED: /* @__PURE__ */ new Set(),
      REVERTED: /* @__PURE__ */ new Set()
    });
  }
});

// packages/domain/src/authority.mjs
var CANONICAL_AUTHORITY;
var init_authority = __esm({
  "packages/domain/src/authority.mjs"() {
    CANONICAL_AUTHORITY = Object.freeze({
      passOwner: "ERC721",
      serial: "ERC721_TOKEN_ID",
      mintedSupply: "CHAIN",
      mintIntent: "NEX_MINT_CONTROLLER",
      primaryPayment: "CHAIN_USDG",
      termsVersion: "NEX_LAUNCH_REGISTRY",
      previewOpen: "NEX_LAUNCH_REGISTRY",
      projectContent: "POSTGRES",
      projectMedia: "OBJECT_STORAGE",
      artworkMapping: "EDITION_CONTENT_COMMITMENT",
      advantageRemaining: "NEX_ADVANTAGE_REGISTRY",
      seaportOrderStatus: "SEAPORT",
      listingPolicy: "NEX_LISTING_REGISTRY",
      secondaryTransfer: "ERC721_VIA_SEAPORT",
      royaltyLock: "NEX_ROYALTY_VAULT",
      referralAttribution: "POSTGRES_REFERRAL_LEDGER",
      tokenBoundAccount: "CANONICAL_ERC6551_REGISTRY_PLUS_ERC721_OWNER",
      indexer: "GOLDSKY_SUBGRAPH_READ_MODEL_MIRROR_ONLY",
      ui: "VIEW_ONLY"
    });
  }
});

// packages/domain/src/seaport-order.mjs
function address(value, label) {
  if (!isAddress(value)) throw new Error(`${label} must be an EVM address`);
  return getAddress(value);
}
function uint(value, label) {
  try {
    const parsed = BigInt(value);
    if (parsed < 0n) throw new Error();
    return parsed;
  } catch {
    throw new Error(`${label} must be an unsigned integer`);
  }
}
function secondaryAmounts(price, royaltyBps) {
  const P = uint(price, "price");
  const R = uint(royaltyBps, "royaltyBps");
  if (P === 0n) throw new Error("price must be positive");
  if (R > 500n) throw new Error("royaltyBps exceeds 5%");
  const protocolFee = P * SECONDARY_PROTOCOL_FEE_BPS / BPS_DENOMINATOR;
  if (protocolFee === 0n) throw new Error("price is too small for exact 1% fee");
  const royalty = P * R / BPS_DENOMINATOR;
  return { price: P, protocolFee, royalty, sellerProceeds: P - protocolFee - royalty };
}
function listingZoneHash(input) {
  return keccak256(coder.encode(
    ["bytes32", "address", "uint256", "address", "bytes32", "uint256", "address", "uint96", "uint64", "uint64"],
    [
      LISTING_ZONE_DOMAIN,
      address(input.edition, "edition"),
      uint(input.tokenId, "tokenId"),
      address(input.seller, "seller"),
      input.termsVersionHash,
      uint(input.price, "price"),
      address(input.royaltyReceiver, "royaltyReceiver"),
      uint(input.royaltyBps, "royaltyBps"),
      uint(input.startTime, "startTime"),
      uint(input.endTime, "endTime")
    ]
  ));
}
function itemHash(item, consideration) {
  const types = consideration ? ["bytes32", "uint8", "address", "uint256", "uint256", "uint256", "address"] : ["bytes32", "uint8", "address", "uint256", "uint256", "uint256"];
  const values = consideration ? [CONSIDERATION_ITEM_TYPEHASH, item.itemType, item.token, item.identifierOrCriteria, item.startAmount, item.endAmount, item.recipient] : [OFFER_ITEM_TYPEHASH, item.itemType, item.token, item.identifierOrCriteria, item.startAmount, item.endAmount];
  return keccak256(coder.encode(types, values));
}
function seaportOrderHash(order, counter) {
  const offerHash = keccak256(concat(order.offer.map((item) => itemHash(item, false))));
  const considerationHash = keccak256(concat(order.consideration.map((item) => itemHash(item, true))));
  return keccak256(coder.encode(
    ["bytes32", "address", "address", "bytes32", "bytes32", "uint8", "uint256", "uint256", "bytes32", "uint256", "bytes32", "uint256"],
    [
      ORDER_COMPONENTS_TYPEHASH,
      order.offerer,
      order.zone,
      offerHash,
      considerationHash,
      order.orderType,
      order.startTime,
      order.endTime,
      order.zoneHash,
      order.salt,
      order.conduitKey,
      uint(counter, "counter")
    ]
  ));
}
function seaportTypedData(order, counter, { chainId, seaport }) {
  return {
    domain: { name: "Seaport", version: "1.6", chainId: Number(chainId), verifyingContract: address(seaport, "seaport") },
    types: SEAPORT_TYPES,
    value: { ...order, counter: uint(counter, "counter") }
  };
}
function verifySeaportOrderSignature({ order, counter, signature, chainId, seaport }) {
  const typed = seaportTypedData(order, counter, { chainId, seaport });
  const signer = verifyTypedData(typed.domain, typed.types, typed.value, signature);
  if (getAddress(signer) !== getAddress(order.offerer)) throw new Error("Seaport signature does not match seller");
  return signer;
}
function buildSeaportFulfillment({ order, signature, seaport, fulfillerConduitKey = `0x${"00".repeat(32)}` }) {
  if (!/^0x[0-9a-fA-F]+$/.test(signature ?? "")) throw new Error("Seaport signature required");
  return {
    to: address(seaport, "seaport"),
    data: seaportInterface.encodeFunctionData("fulfillOrder", [[order, signature], fulfillerConduitKey]),
    value: "0x0"
  };
}
function buildNexMarketsOrder(input) {
  const seller = address(input.seller, "seller");
  const edition = address(input.edition, "edition");
  const usdg = address(input.usdg, "usdg");
  const protocolFeeRecipient = address(input.protocolFeeRecipient, "protocolFeeRecipient");
  const royaltyVault = address(input.royaltyVault, "royaltyVault");
  const zone = address(input.zone, "zone");
  const tokenId = uint(input.tokenId, "tokenId");
  if (tokenId === 0n) throw new Error("tokenId must be positive");
  const startTime = uint(input.startTime, "startTime");
  const endTime = uint(input.endTime, "endTime");
  if (endTime <= startTime) throw new Error("listing window is invalid");
  const computedZoneHash = input.termsVersionHash && input.royaltyReceiver ? listingZoneHash(input) : null;
  const zoneHash = input.zoneHash ?? computedZoneHash;
  if (!/^0x[0-9a-fA-F]{64}$/.test(zoneHash ?? "")) throw new Error("zoneHash or complete listing Terms are required");
  if (computedZoneHash && computedZoneHash.toLowerCase() !== zoneHash.toLowerCase()) throw new Error("zoneHash does not match exact listing");
  const amounts = secondaryAmounts(input.price, input.royaltyBps);
  const consideration = [
    {
      itemType: SEAPORT_ITEM.ERC20,
      token: usdg,
      identifierOrCriteria: 0n,
      startAmount: amounts.protocolFee,
      endAmount: amounts.protocolFee,
      recipient: protocolFeeRecipient
    }
  ];
  if (amounts.royalty !== 0n) {
    consideration.push({
      itemType: SEAPORT_ITEM.ERC20,
      token: usdg,
      identifierOrCriteria: 0n,
      startAmount: amounts.royalty,
      endAmount: amounts.royalty,
      recipient: royaltyVault
    });
  }
  consideration.push({
    itemType: SEAPORT_ITEM.ERC20,
    token: usdg,
    identifierOrCriteria: 0n,
    startAmount: amounts.sellerProceeds,
    endAmount: amounts.sellerProceeds,
    recipient: seller
  });
  const order = {
    offerer: seller,
    zone,
    offer: [{
      itemType: SEAPORT_ITEM.ERC721,
      token: edition,
      identifierOrCriteria: tokenId,
      startAmount: 1n,
      endAmount: 1n
    }],
    consideration,
    orderType: 2,
    startTime,
    endTime,
    zoneHash: zoneHash.toLowerCase(),
    salt: uint(input.salt ?? keccak256(toUtf8Bytes(`${edition}:${tokenId}:${seller}:${startTime}`)), "salt"),
    conduitKey: input.conduitKey ?? `0x${"00".repeat(32)}`,
    totalOriginalConsiderationItems: BigInt(consideration.length)
  };
  validateNexMarketsOrder(order, { ...input, zoneHash, seller, edition, usdg, protocolFeeRecipient, royaltyVault, zone });
  const result = { order, amounts };
  if (input.counter !== void 0) result.orderHash = seaportOrderHash(order, input.counter);
  if (result.orderHash && input.listingRegistry && input.termsVersionHash) {
    result.registryTransaction = {
      to: address(input.listingRegistry, "listingRegistry"),
      data: listingInterface.encodeFunctionData("createListing", [[result.orderHash, edition, tokenId, input.termsVersionHash, amounts.price, startTime, endTime]])
    };
  }
  return result;
}
function validateNexMarketsOrder(order, policy) {
  const expected = secondaryAmounts(policy.price, policy.royaltyBps);
  const expectedLength = expected.royalty === 0n ? 2 : 3;
  if (order.offerer !== address(policy.seller, "seller") || order.zone !== address(policy.zone, "zone")) throw new Error("seller/zone mismatch");
  if (order.orderType !== 2 || order.zoneHash.toLowerCase() !== policy.zoneHash.toLowerCase()) throw new Error("restricted order/zoneHash mismatch");
  if (order.offer.length !== 1) throw new Error("order must offer exactly one item");
  const offered = order.offer[0];
  if (offered.itemType !== SEAPORT_ITEM.ERC721 || offered.token !== address(policy.edition, "edition") || offered.identifierOrCriteria !== BigInt(policy.tokenId) || offered.startAmount !== 1n || offered.endAmount !== 1n) throw new Error("exact Pass offer mismatch");
  if (order.consideration.length !== expectedLength) throw new Error("extra or missing consideration");
  const legs = expected.royalty === 0n ? [[address(policy.protocolFeeRecipient, "protocolFeeRecipient"), expected.protocolFee], [address(policy.seller, "seller"), expected.sellerProceeds]] : [[address(policy.protocolFeeRecipient, "protocolFeeRecipient"), expected.protocolFee], [address(policy.royaltyVault, "royaltyVault"), expected.royalty], [address(policy.seller, "seller"), expected.sellerProceeds]];
  let total = 0n;
  for (let i = 0; i < legs.length; i += 1) {
    const item = order.consideration[i];
    const [recipient, amount] = legs[i];
    if (item.itemType !== SEAPORT_ITEM.ERC20 || item.token !== address(policy.usdg, "usdg") || item.identifierOrCriteria !== 0n || item.startAmount !== amount || item.endAmount !== amount || item.recipient !== recipient) throw new Error(`consideration ${i} mismatch`);
    total += item.startAmount;
  }
  if (total !== expected.price) throw new Error("buyer surcharge or underpayment");
  if (order.endTime <= order.startTime) throw new Error("invalid listing window");
  if (policy.now !== void 0 && order.endTime <= BigInt(policy.now)) throw new Error("listing already expired");
  if (policy.currentOwner !== void 0 && address(policy.currentOwner, "currentOwner") !== address(policy.seller, "seller")) throw new Error("seller no longer owns Pass");
  return true;
}
function validateProjectedNexMarketsOrder(order, listing, policy) {
  if (getAddress(order.offerer) !== getAddress(listing.seller_address ?? listing.sellerAddress)) throw new Error("projected seller mismatch");
  if (getAddress(order.zone) !== getAddress(policy.zone) || order.orderType !== 2) throw new Error("projected zone mismatch");
  if (order.zoneHash.toLowerCase() !== String(listing.zone_hash ?? listing.zoneHash).toLowerCase()) throw new Error("projected zoneHash mismatch");
  if (order.offer.length !== 1) throw new Error("projected exact Pass offer mismatch");
  const offered = order.offer[0];
  if (Number(offered.itemType) !== SEAPORT_ITEM.ERC721 || getAddress(offered.token) !== getAddress(listing.edition_address ?? listing.editionAddress) || BigInt(offered.identifierOrCriteria) !== BigInt(listing.token_id ?? listing.tokenId) || BigInt(offered.startAmount) !== 1n || BigInt(offered.endAmount) !== 1n) throw new Error("projected exact Pass offer mismatch");
  const expectedRoyalty = BigInt(listing.royalty_usdg ?? listing.royaltyUsdg);
  const expectedLength = expectedRoyalty === 0n ? 2 : 3;
  if (order.consideration.length !== expectedLength) throw new Error("projected extra or missing consideration");
  const legs = expectedRoyalty === 0n ? [[policy.protocolFeeRecipient, listing.protocol_fee_usdg ?? listing.protocolFeeUsdg], [listing.seller_address ?? listing.sellerAddress, listing.seller_proceeds_usdg ?? listing.sellerProceedsUsdg]] : [[policy.protocolFeeRecipient, listing.protocol_fee_usdg ?? listing.protocolFeeUsdg], [policy.royaltyVault, expectedRoyalty], [listing.seller_address ?? listing.sellerAddress, listing.seller_proceeds_usdg ?? listing.sellerProceedsUsdg]];
  let total = 0n;
  for (let index = 0; index < legs.length; index += 1) {
    const item = order.consideration[index];
    const [recipient, expectedAmount] = legs[index];
    const amount = BigInt(expectedAmount);
    if (Number(item.itemType) !== SEAPORT_ITEM.ERC20 || getAddress(item.token) !== getAddress(policy.usdg) || getAddress(item.recipient) !== getAddress(recipient) || BigInt(item.identifierOrCriteria) !== 0n || BigInt(item.startAmount) !== amount || BigInt(item.endAmount) !== amount) throw new Error(`projected consideration ${index} mismatch`);
    total += amount;
  }
  if (total !== BigInt(listing.price_usdg ?? listing.priceUsdg)) throw new Error("projected buyer surcharge or underpayment");
  if (BigInt(order.startTime) !== BigInt(Math.floor(new Date(listing.starts_at ?? listing.startsAt).getTime() / 1e3)) || BigInt(order.endTime) !== BigInt(Math.floor(new Date(listing.expires_at ?? listing.expiresAt).getTime() / 1e3))) throw new Error("projected listing window mismatch");
  return true;
}
var SEAPORT_ITEM, SECONDARY_PROTOCOL_FEE_BPS, BPS_DENOMINATOR, LISTING_ZONE_DOMAIN, coder, OFFER_ITEM_TYPEHASH, CONSIDERATION_ITEM_TYPEHASH, ORDER_COMPONENTS_TYPEHASH, listingInterface, seaportInterface, SEAPORT_TYPES;
var init_seaport_order = __esm({
  "packages/domain/src/seaport-order.mjs"() {
    init_lib();
    SEAPORT_ITEM = Object.freeze({ ERC20: 1, ERC721: 2 });
    SECONDARY_PROTOCOL_FEE_BPS = 100n;
    BPS_DENOMINATOR = 10000n;
    LISTING_ZONE_DOMAIN = keccak256(toUtf8Bytes("NEXMARKETS_LISTING_ZONE_V1"));
    coder = AbiCoder.defaultAbiCoder();
    OFFER_ITEM_TYPEHASH = keccak256(toUtf8Bytes("OfferItem(uint8 itemType,address token,uint256 identifierOrCriteria,uint256 startAmount,uint256 endAmount)"));
    CONSIDERATION_ITEM_TYPEHASH = keccak256(toUtf8Bytes("ConsiderationItem(uint8 itemType,address token,uint256 identifierOrCriteria,uint256 startAmount,uint256 endAmount,address recipient)"));
    ORDER_COMPONENTS_TYPEHASH = keccak256(toUtf8Bytes("OrderComponents(address offerer,address zone,OfferItem[] offer,ConsiderationItem[] consideration,uint8 orderType,uint256 startTime,uint256 endTime,bytes32 zoneHash,uint256 salt,bytes32 conduitKey,uint256 counter)ConsiderationItem(uint8 itemType,address token,uint256 identifierOrCriteria,uint256 startAmount,uint256 endAmount,address recipient)OfferItem(uint8 itemType,address token,uint256 identifierOrCriteria,uint256 startAmount,uint256 endAmount)"));
    listingInterface = new Interface(["function createListing((bytes32 orderHash,address edition,uint256 tokenId,bytes32 termsVersionHash,uint256 usdGPrice,uint64 startTime,uint64 expiry) request) returns (bytes32 zoneHash)"]);
    seaportInterface = new Interface(["function fulfillOrder(((address offerer,address zone,(uint8 itemType,address token,uint256 identifierOrCriteria,uint256 startAmount,uint256 endAmount)[] offer,(uint8 itemType,address token,uint256 identifierOrCriteria,uint256 startAmount,uint256 endAmount,address recipient)[] consideration,uint8 orderType,uint256 startTime,uint256 endTime,bytes32 zoneHash,uint256 salt,bytes32 conduitKey,uint256 totalOriginalConsiderationItems) parameters,bytes signature) order,bytes32 fulfillerConduitKey) returns (bool fulfilled)"]);
    SEAPORT_TYPES = Object.freeze({
      OfferItem: [
        { name: "itemType", type: "uint8" },
        { name: "token", type: "address" },
        { name: "identifierOrCriteria", type: "uint256" },
        { name: "startAmount", type: "uint256" },
        { name: "endAmount", type: "uint256" }
      ],
      ConsiderationItem: [
        { name: "itemType", type: "uint8" },
        { name: "token", type: "address" },
        { name: "identifierOrCriteria", type: "uint256" },
        { name: "startAmount", type: "uint256" },
        { name: "endAmount", type: "uint256" },
        { name: "recipient", type: "address" }
      ],
      OrderComponents: [
        { name: "offerer", type: "address" },
        { name: "zone", type: "address" },
        { name: "offer", type: "OfferItem[]" },
        { name: "consideration", type: "ConsiderationItem[]" },
        { name: "orderType", type: "uint8" },
        { name: "startTime", type: "uint256" },
        { name: "endTime", type: "uint256" },
        { name: "zoneHash", type: "bytes32" },
        { name: "salt", type: "uint256" },
        { name: "conduitKey", type: "bytes32" },
        { name: "counter", type: "uint256" }
      ]
    });
  }
});

// packages/domain/src/referral-ledger.mjs
var REFERRAL_TIERS;
var init_referral_ledger = __esm({
  "packages/domain/src/referral-ledger.mjs"() {
    REFERRAL_TIERS = Object.freeze([5, 10, 15, 20]);
  }
});

// packages/domain/src/media-provenance.mjs
import { createHash as createHash2 } from "node:crypto";
function ascii(bytes2, offset, length) {
  return String.fromCharCode(...bytes2.subarray(offset, offset + length));
}
function uint24le(bytes2, offset) {
  return bytes2[offset] | bytes2[offset + 1] << 8 | bytes2[offset + 2] << 16;
}
function inspectPng(bytes2) {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes2.length < 24 || !signature.every((value, index) => bytes2[index] === value) || ascii(bytes2, 12, 4) !== "IHDR") return null;
  const view = new DataView(bytes2.buffer, bytes2.byteOffset, bytes2.byteLength);
  return { mimeType: "image/png", width: view.getUint32(16), height: view.getUint32(20) };
}
function inspectJpeg(bytes2) {
  if (bytes2.length < 4 || bytes2[0] !== 255 || bytes2[1] !== 216) return null;
  const view = new DataView(bytes2.buffer, bytes2.byteOffset, bytes2.byteLength);
  const dimensions = /* @__PURE__ */ new Set([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207]);
  let offset = 2;
  while (offset + 8 < bytes2.length) {
    while (offset < bytes2.length && bytes2[offset] !== 255) offset += 1;
    while (offset < bytes2.length && bytes2[offset] === 255) offset += 1;
    if (offset >= bytes2.length) break;
    const marker = bytes2[offset++];
    if (marker === 216 || marker === 217 || marker >= 208 && marker <= 215) continue;
    if (offset + 2 > bytes2.length) break;
    const length = view.getUint16(offset);
    if (length < 2 || offset + length > bytes2.length) break;
    if (dimensions.has(marker) && length >= 7) return { mimeType: "image/jpeg", height: view.getUint16(offset + 3), width: view.getUint16(offset + 5) };
    offset += length;
  }
  return null;
}
function inspectWebp(bytes2) {
  if (bytes2.length < 30 || ascii(bytes2, 0, 4) !== "RIFF" || ascii(bytes2, 8, 4) !== "WEBP") return null;
  const type = ascii(bytes2, 12, 4);
  if (type === "VP8X") return { mimeType: "image/webp", width: uint24le(bytes2, 24) + 1, height: uint24le(bytes2, 27) + 1 };
  if (type === "VP8L" && bytes2[20] === 47) {
    return {
      mimeType: "image/webp",
      width: 1 + bytes2[21] + ((bytes2[22] & 63) << 8),
      height: 1 + ((bytes2[22] & 192) >> 6) + (bytes2[23] << 2) + ((bytes2[24] & 15) << 10)
    };
  }
  if (type === "VP8 " && bytes2[23] === 157 && bytes2[24] === 1 && bytes2[25] === 42) {
    const view = new DataView(bytes2.buffer, bytes2.byteOffset, bytes2.byteLength);
    return { mimeType: "image/webp", width: view.getUint16(26, true) & 16383, height: view.getUint16(28, true) & 16383 };
  }
  return null;
}
function inspectAvif(bytes2) {
  if (bytes2.length < 32 || ascii(bytes2, 4, 4) !== "ftyp") return null;
  const brands = ascii(bytes2, 8, Math.min(56, bytes2.length - 8));
  if (!/(?:avif|avis|mif1)/.test(brands)) return null;
  const view = new DataView(bytes2.buffer, bytes2.byteOffset, bytes2.byteLength);
  for (let offset = 4; offset + 12 <= bytes2.length; offset += 1) {
    if (ascii(bytes2, offset, 4) === "ispe") return { mimeType: "image/avif", width: view.getUint32(offset + 4), height: view.getUint32(offset + 8) };
  }
  return null;
}
function inspectImageBytes({ bytes: bytes2, mimeType }) {
  if (!(bytes2 instanceof Uint8Array) || bytes2.length === 0 || bytes2.length > MEDIA_POLICY.maxBytes) throw new Error("INVALID_MEDIA_SIZE");
  const image = inspectPng(bytes2) || inspectJpeg(bytes2) || inspectWebp(bytes2) || inspectAvif(bytes2);
  if (!image || image.mimeType !== mimeType) throw new Error("MIME_CONTENT_MISMATCH");
  if (!Number.isInteger(image.width) || !Number.isInteger(image.height) || image.width < MEDIA_POLICY.minDimension || image.height < MEDIA_POLICY.minDimension || image.width > MEDIA_POLICY.maxDimension || image.height > MEDIA_POLICY.maxDimension || image.width * image.height > MEDIA_POLICY.maxPixels) throw new Error("INVALID_IMAGE_DIMENSIONS");
  return {
    ...image,
    byteSize: bytes2.length,
    sha256: createHash2("sha256").update(bytes2).digest("hex")
  };
}
var MEDIA_POLICY;
var init_media_provenance = __esm({
  "packages/domain/src/media-provenance.mjs"() {
    MEDIA_POLICY = Object.freeze({
      maxBytes: 25 * 1024 * 1024,
      minDimension: 64,
      maxDimension: 16384,
      maxPixels: 1e8,
      allowed: Object.freeze({
        "image/jpeg": ["jpg", "jpeg"],
        "image/png": ["png"],
        "image/webp": ["webp"],
        "image/avif": ["avif"]
      })
    });
  }
});

// packages/domain/src/notification.mjs
var NOTIFICATION_TYPE;
var init_notification = __esm({
  "packages/domain/src/notification.mjs"() {
    NOTIFICATION_TYPE = Object.freeze({
      PREVIEW_STARTED: "PREVIEW_STARTED",
      MINT_OPENED: "MINT_OPENED",
      MINT_FINALIZED: "MINT_FINALIZED",
      PASS_SOLD: "PASS_SOLD",
      LISTING_CANCELLED: "LISTING_CANCELLED",
      LISTING_EXPIRED: "LISTING_EXPIRED",
      LISTING_STALE: "LISTING_STALE",
      ADVANTAGE_USED: "ADVANTAGE_USED",
      ROYALTY_WITHDRAWABLE: "ROYALTY_WITHDRAWABLE",
      ROYALTY_WITHDRAWN: "ROYALTY_WITHDRAWN",
      REFERRAL_QUALIFIED: "REFERRAL_QUALIFIED",
      REFERRAL_SETTLED: "REFERRAL_SETTLED"
    });
  }
});

// packages/domain/src/transaction-calldata.mjs
function buildProtocolCalldata(intentType, input, { walletAddress, idempotencyKey }) {
  const abi = interfaces[intentType];
  if (!abi) throw new Error("UNSUPPORTED_PROTOCOL_INTENT");
  if (intentType === "MINT") {
    const intentId = keccak256(toUtf8Bytes(`NEXMARKETS_MINT_INTENT:${walletAddress.toLowerCase()}:${idempotencyKey}`));
    const request = [input.edition, input.termsVersionHash, input.recipient ?? walletAddress, input.quantity, intentId, input.referralHint ?? ZeroAddress, input.advantageConfigs ?? []];
    return Array.isArray(input.allowlistProof) ? abi.encodeFunctionData("mintAllowlisted", [request, input.allowlistProof]) : abi.encodeFunctionData("mint", [request]);
  }
  if (intentType === "EDITION_CREATE") return abi.encodeFunctionData("createEdition", [[input.name, input.symbol, input.initialOwner, input.editionId, input.absoluteSupplyCap, input.artworkCommitment, input.baseTokenURI], input.salt]);
  if (intentType === "TERMS_PUBLISH") {
    const versionedAbi = input.protocolVersion === 1 || !Object.hasOwn(input.terms ?? {}, "allowlistRoot") ? interfaces.TERMS_PUBLISH_V1 : abi;
    return versionedAbi.encodeFunctionData("publishTerms", [input.edition, input.terms]);
  }
  if (intentType === "LISTING_CANCEL") return abi.encodeFunctionData("cancelListing", [input.orderHash]);
  if (intentType === "ROYALTY_WITHDRAW") return abi.encodeFunctionData("withdraw", [input.orderHash]);
  if (intentType === "ADVANTAGE_USE" && input.operation === "REDEEM") return abi.encodeFunctionData("redeem", [input.edition, input.tokenId, input.advantageId, input.useId]);
  if (intentType === "ADVANTAGE_USE" && input.operation === "REDEEM_AMOUNT") return abi.encodeFunctionData("redeemAmount", [input.edition, input.tokenId, input.advantageId, input.amount, input.useId]);
  if (intentType === "ADVANTAGE_USE" && input.operation === "CONSUME_QUANTITY") return abi.encodeFunctionData("consumeQuantity", [input.edition, input.tokenId, input.advantageId, input.amount, input.useId]);
  if (intentType === "ADVANTAGE_USE" && input.operation === "USE_AMOUNT") return abi.encodeFunctionData("useAmount", [input.edition, input.tokenId, input.advantageId, input.useId]);
  throw new Error("ADVANTAGE_OPERATION_REQUIRED");
}
var MINT_REQUEST, interfaces;
var init_transaction_calldata = __esm({
  "packages/domain/src/transaction-calldata.mjs"() {
    init_lib();
    MINT_REQUEST = "(address edition,bytes32 termsVersionHash,address recipient,uint256 quantity,bytes32 intentId,address referralHint,(bytes32 advantageId,uint8 kind,uint64 startsAt,uint64 endsAt,uint256 totalUnits,bytes32 definitionHash)[] advantageConfigs)";
    interfaces = {
      MINT: new Interface([`function mint(${MINT_REQUEST} request) returns (uint256)`, `function mintAllowlisted(${MINT_REQUEST} request,bytes32[] proof) returns (uint256)`]),
      EDITION_CREATE: new Interface(["function createEdition((string name,string symbol,address initialOwner,bytes32 editionId,uint32 absoluteSupplyCap,bytes32 artworkCommitment,string baseTokenURI) config,bytes32 salt) returns (address)"]),
      TERMS_PUBLISH_V1: new Interface(["function publishTerms(address edition,(uint256 activeSupply,uint256 pricePerPass,uint64 previewStartsAt,uint64 mintStartsAt,uint64 mintEndsAt,address primaryRecipient,address royaltyReceiver,uint96 royaltyBps,bytes32 advantagesHash,bytes32 referralTermsHash) terms) returns (bytes32)"]),
      TERMS_PUBLISH: new Interface(["function publishTerms(address edition,(uint256 activeSupply,uint256 pricePerPass,uint64 previewStartsAt,uint64 mintStartsAt,uint64 mintEndsAt,bytes32 allowlistRoot,uint64 allowlistEndsAt,uint256 allowlistSupply,address primaryRecipient,address royaltyReceiver,uint96 royaltyBps,bytes32 advantagesHash,bytes32 referralTermsHash) terms) returns (bytes32)"]),
      LISTING_CANCEL: new Interface(["function cancelListing(bytes32 orderHash)"]),
      ADVANTAGE_USE: new Interface(["function consumeQuantity(address edition,uint256 tokenId,bytes32 advantageId,uint256 amount,bytes32 useId)", "function redeem(address edition,uint256 tokenId,bytes32 advantageId,bytes32 redemptionId)", "function redeemAmount(address edition,uint256 tokenId,bytes32 advantageId,uint256 amount,bytes32 redemptionId)", "function useAmount(address edition,uint256 tokenId,bytes32 advantageId,bytes32 useId) returns (uint256)"]),
      ROYALTY_WITHDRAW: new Interface(["function withdraw(bytes32 orderHash)"])
    };
  }
});

// packages/domain/src/pass-design.mjs
function authorityRandomHash(value) {
  let hash4 = 2166136261;
  const input = String(value ?? "");
  for (let index = 0; index < input.length; index += 1) {
    hash4 ^= input.charCodeAt(index);
    hash4 = Math.imul(hash4, 16777619);
  }
  return hash4 >>> 0;
}
function authoritySeededPermutation(length, seed) {
  const values = Array.from({ length }, (_, index) => index);
  let hash4 = authorityRandomHash(seed) || 1;
  for (let index = values.length - 1; index > 0; index -= 1) {
    hash4 ^= hash4 << 13;
    hash4 ^= hash4 >>> 17;
    hash4 ^= hash4 << 5;
    const swapIndex = (hash4 >>> 0) % (index + 1);
    [values[index], values[swapIndex]] = [values[swapIndex], values[index]];
  }
  return values;
}
function resolvePassAssignment({ seed, serial, artworkId = null } = {}) {
  const serialNumber = Math.max(1, Math.floor(Number(serial) || 1));
  const stableSeed = String(seed || "nexmarkets-pass-seed");
  const slot = serialNumber - 1;
  const packOrder = authoritySeededPermutation(PASS_DESIGN_OPTIONS.length, `${stableSeed}|packs-v1`);
  const option = PASS_DESIGN_OPTIONS[packOrder[slot % PASS_DESIGN_OPTIONS.length]] || PASS_DESIGN_OPTIONS[0];
  const colourOrder = authoritySeededPermutation(PASS_COLORWAYS.length, `${stableSeed}|colours-v1|${option.id}`);
  const colourIndex = colourOrder[(slot + Math.floor(slot / PASS_DESIGN_OPTIONS.length)) % PASS_COLORWAYS.length];
  const selected = PASS_ASSIGNMENT_POOL.find((entry) => entry.optionId === option.id && entry.colorwayId === PASS_COLORWAYS[colourIndex].id);
  return {
    rendererVersion: PASS_RENDERER_VERSION,
    serial: serialNumber,
    optionId: selected.optionId,
    family: selected.family,
    material: selected.material,
    colorwayId: selected.colorwayId,
    colorwayName: selected.colorwayName,
    palette: { ...selected.palette },
    artworkId: artworkId ?? null,
    authorityAssignment: {
      poolVersion: "v1",
      serial: serialNumber,
      packId: selected.optionId,
      passDesign: selected.optionId.startsWith("classic-") ? "classic" : selected.optionId.startsWith("glass-") ? "glass" : selected.optionId,
      frame: selected.optionId.startsWith("classic-") || selected.optionId.startsWith("glass-") ? selected.material : "obsidian",
      label: selected.label,
      colourIndex,
      palette: [selected.palette.primary, selected.palette.secondary, selected.palette.accent],
      artKey: artworkId ?? ""
    },
    frozen: false
  };
}
function createPassRenderConfig({ editionId, passId = null, serial, supply, projectName, editionName, seriesName = "", assignment, artwork = {}, logo = {}, holderState = null } = {}) {
  const selected = assignment?.optionId ? assignment : resolvePassAssignment({ seed: editionId, serial, artworkId: artwork.assetId });
  if (!OPTION_MAP.has(selected.optionId)) throw new Error("INVALID_PASS_OPTION");
  return {
    rendererVersion: selected.rendererVersion || PASS_RENDERER_VERSION,
    editionId: String(editionId),
    passId: passId == null ? null : String(passId),
    serial: Math.max(1, Math.floor(Number(serial) || 1)),
    supply: Math.max(1, Math.floor(Number(supply) || 1)),
    optionId: selected.optionId,
    family: selected.family,
    material: selected.material,
    colorwayId: selected.colorwayId,
    colorwayName: selected.colorwayName || PASS_COLORWAYS.find((item) => item.id === selected.colorwayId)?.name || selected.colorwayId,
    palette: { ...selected.palette },
    visual: selected.visual ? structuredClone(selected.visual) : null,
    authorityAssignment: selected.authorityAssignment ? structuredClone(selected.authorityAssignment) : null,
    artwork: { assetId: artwork.assetId ?? artwork.assetKey ?? artwork.id ?? selected.artworkId ?? null, url: artwork.url ?? artwork.src ?? null, x: Number(artwork.x ?? 50), y: Number(artwork.y ?? 50), scale: Number(artwork.scale ?? 1) },
    logo: { assetId: logo.assetId ?? null, url: logo.url ?? null },
    projectName: String(projectName ?? ""),
    editionName: String(editionName ?? ""),
    seriesName: String(seriesName ?? ""),
    holderState: holderState ? { ...holderState } : null,
    frozen: Boolean(selected.frozen),
    frozenAt: selected.frozenAt ?? null,
    randomAssignment: { enabled: selected.randomAssignment?.enabled ?? true, seed: selected.seed ?? null, combinationIndex: PASS_ASSIGNMENT_POOL.findIndex((item) => item.optionId === selected.optionId && item.colorwayId === selected.colorwayId), frozen: Boolean(selected.frozen) }
  };
}
function isApprovedPassOption(value) {
  return OPTION_MAP.has(String(value));
}
var PASS_RENDERER_VERSION, PASS_DESIGN_OPTIONS, PASS_COLORWAYS, PALETTES, PASS_ASSIGNMENT_POOL, OPTION_MAP;
var init_pass_design = __esm({
  "packages/domain/src/pass-design.mjs"() {
    PASS_RENDERER_VERSION = "pass-renderer-v1";
    PASS_DESIGN_OPTIONS = Object.freeze([
      { id: "classic-obsidian", family: "classic", material: "obsidian", label: "Classic \xB7 Obsidian", name: "Classic", description: "Classic frame in Obsidian." },
      { id: "classic-carbon", family: "classic", material: "carbon", label: "Classic \xB7 Carbon", name: "Classic", description: "Classic frame in Carbon." },
      { id: "classic-gilt", family: "classic", material: "gilt", label: "Classic \xB7 Gilt", name: "Classic", description: "Classic frame in Gilt." },
      { id: "glass-obsidian", family: "glass", material: "obsidian", label: "Glass \xB7 Obsidian", name: "Glass", description: "Glass frame in Obsidian." },
      { id: "glass-carbon", family: "glass", material: "carbon", label: "Glass \xB7 Carbon", name: "Glass", description: "Glass frame in Carbon." },
      { id: "pack-slab", family: "graded-vault-slab", material: "transparent-graded-case", label: "Graded Vault Slab", name: "Graded Vault Slab", description: "Transparent graded case + archival insert." },
      { id: "pack-glass", family: "museum-glass-archive", material: "glass-vitrine", label: "Museum Glass Archive", name: "Museum Glass Archive", description: "Glass vitrine + brass plaque + dark archive mat." },
      { id: "pack-metal", family: "machined-metal-vault", material: "milled-alloy", label: "Machined Metal Vault", name: "Machined Metal Vault", description: "Milled alloy shell + bolts + recessed plates." },
      { id: "pack-ceramic", family: "ceramic-enamel-tile", material: "glazed-ceramic", label: "Ceramic Enamel Tile", name: "Ceramic Enamel Tile", description: "Glazed ceramic + enamel inset." },
      { id: "pack-blister", family: "collector-blister-pack", material: "thermoformed-chamber", label: "Collector Blister Pack", name: "Collector Blister Pack", description: "Die-cut backer + thermoformed chamber + foil seal." },
      { id: "pack-carbon", family: "forged-carbon-frame", material: "carbon-weave", label: "Forged Carbon Frame", name: "Forged Carbon Frame", description: "Carbon weave + anodised accent." },
      { id: "pack-paper", family: "antique-archive-certificate", material: "cotton-rag-deed-stock", label: "Antique Archive Certificate", name: "Antique Archive Certificate", description: "Cotton-rag deed stock + engraved ink + wax seal." },
      { id: "pack-resin", family: "cast-resin-display-block", material: "tinted-cast-resin", label: "Cast Resin Display Block", name: "Cast Resin Display Block", description: "Tinted cast resin + suspended insert + embedded metal tag." }
    ]);
    PASS_COLORWAYS = Object.freeze([
      { id: "colourway-01", name: "Crimson Archive" },
      { id: "colourway-02", name: "Cobalt Field" },
      { id: "colourway-03", name: "Forest Ledger" },
      { id: "colourway-04", name: "Ochre Study" },
      { id: "colourway-05", name: "Violet Register" }
    ]);
    PALETTES = Object.freeze({
      classic: [["#b31d2b", "#f2f0e9", "#17181b"], ["#244e9c", "#edf3ff", "#10141e"], ["#121417", "#e8d8b0", "#1a1410"], ["#2d5d49", "#f4ebd1", "#161916"], ["#5a5869", "#dbe0eb", "#17181c"]],
      glass: [["#6d1822", "#d7d0bb", "#20252b"], ["#355f8d", "#dfe8ef", "#1b2127"], ["#2d5647", "#e2ddc7", "#1e2220"], ["#73553c", "#e7dccc", "#241d18"], ["#554679", "#e4dcf0", "#221d2b"]],
      "pack-slab": [["#b31d2b", "#f2f0e9", "#17181b"], ["#244e9c", "#edf3ff", "#10141e"], ["#121417", "#e8d8b0", "#1a1410"], ["#2d5d49", "#f4ebd1", "#161916"], ["#5a5869", "#dbe0eb", "#17181c"]],
      "pack-glass": [["#6d1822", "#d7d0bb", "#20252b"], ["#355f8d", "#dfe8ef", "#1b2127"], ["#2d5647", "#e2ddc7", "#1e2220"], ["#73553c", "#e7dccc", "#241d18"], ["#554679", "#e4dcf0", "#221d2b"]],
      "pack-metal": [["#6b7077", "#d5d8dc", "#13161a"], ["#24292f", "#e2b860", "#0d0f12"], ["#5b2c2f", "#c98b73", "#191416"], ["#284d5b", "#8fc2ca", "#11191c"], ["#5a4c3f", "#d7c4a1", "#171410"]],
      "pack-ceramic": [["#1b5f75", "#f2e7d5", "#d4ad58"], ["#862e2e", "#f2d8c6", "#261714"], ["#2f6c54", "#e9e0c5", "#bb8d43"], ["#2f3f85", "#d9e0f1", "#ece7d3"], ["#6a3a73", "#e8d5e9", "#d3b16a"]],
      "pack-blister": [["#d34a35", "#fff0d8", "#1b1b1b"], ["#1763a8", "#f4e33e", "#f7f8fa"], ["#7a3aa4", "#ff9b42", "#f7efe7"], ["#238a64", "#f4cf4c", "#153028"], ["#23262b", "#ed5c3f", "#f0f2f5"]],
      "pack-carbon": [["#17191c", "#e45f35", "#d9dde1"], ["#13171a", "#3c82e6", "#d7e3f5"], ["#171714", "#d6ad45", "#ece3c4"], ["#15191a", "#3fbf8d", "#d5efe5"], ["#19151c", "#a06de6", "#e5dbf5"]],
      "pack-paper": [["#c8ad78", "#6b4020", "#7f261f"], ["#d7c59a", "#334c3d", "#8e3d2e"], ["#c8b79a", "#313a56", "#7d602d"], ["#b99970", "#4a2d25", "#245060"], ["#d5c18d", "#5c4d27", "#5f2e5f"]],
      "pack-resin": [["#2d6e88", "#dbeef3", "#77c5dc"], ["#4b3d68", "#eee4f5", "#b69ad1"], ["#365a4a", "#e2eee5", "#89baa0"], ["#6f5038", "#f0e5d4", "#cfaa80"], ["#313b49", "#e4e9ef", "#93a9c2"]]
    });
    PASS_ASSIGNMENT_POOL = Object.freeze(PASS_DESIGN_OPTIONS.flatMap((option) => PASS_COLORWAYS.map((colorway, index) => ({
      optionId: option.id,
      family: option.family,
      material: option.material,
      label: option.label,
      colorwayId: colorway.id,
      colorwayName: colorway.name,
      palette: Object.freeze({ primary: PALETTES[option.family === "classic" ? "classic" : option.family === "glass" ? "glass" : option.id][index][0], secondary: PALETTES[option.family === "classic" ? "classic" : option.family === "glass" ? "glass" : option.id][index][1], accent: PALETTES[option.family === "classic" ? "classic" : option.family === "glass" ? "glass" : option.id][index][2] })
    }))));
    OPTION_MAP = new Map(PASS_DESIGN_OPTIONS.map((option) => [option.id, option]));
  }
});

// packages/domain/src/allowlist.mjs
function allowlistLeaf(account) {
  const normalized = getAddress(account);
  return keccak256(concat([keccak256(coder2.encode(["address"], [normalized]))]));
}
function hashPair(left, right) {
  const [first, second] = left.toLowerCase() < right.toLowerCase() ? [left, right] : [right, left];
  return keccak256(concat([first, second]));
}
function buildAllowlist(addresses = []) {
  const accounts = [...new Set(addresses.map((account) => getAddress(String(account)).toLowerCase()))].sort().map(getAddress);
  if (accounts.length === 0) return Object.freeze({ root: ZeroHash, entries: Object.freeze([]) });
  const leaves = accounts.map(allowlistLeaf);
  const layers = [leaves];
  while (layers.at(-1).length > 1) {
    const current = layers.at(-1);
    const next = [];
    for (let index = 0; index < current.length; index += 2) {
      next.push(index + 1 < current.length ? hashPair(current[index], current[index + 1]) : current[index]);
    }
    layers.push(next);
  }
  const entries = accounts.map((account, leafIndex) => {
    const proof = [];
    let index = leafIndex;
    for (let layerIndex = 0; layerIndex < layers.length - 1; layerIndex += 1) {
      const layer = layers[layerIndex];
      const sibling = index % 2 === 0 ? index + 1 : index - 1;
      if (sibling < layer.length) proof.push(layer[sibling]);
      index = Math.floor(index / 2);
    }
    return Object.freeze({ account, leaf: leaves[leafIndex], proof: Object.freeze(proof) });
  });
  return Object.freeze({ root: layers.at(-1)[0], entries: Object.freeze(entries) });
}
var coder2;
var init_allowlist = __esm({
  "packages/domain/src/allowlist.mjs"() {
    init_lib();
    coder2 = AbiCoder.defaultAbiCoder();
  }
});

// packages/domain/src/launch-draft.mjs
function isValidUrl(value) {
  if (!value || typeof value !== "string") return false;
  try {
    const parsed = new URL(value);
    return ["http:", "https:"].includes(parsed.protocol);
  } catch {
    return false;
  }
}
function isValidVideoUrl(value) {
  if (!value || typeof value !== "string") return true;
  const trimmed = value.trim();
  if (!trimmed) return true;
  if (!isValidUrl(trimmed)) return false;
  return /(?:youtube\.com|youtu\.be|vimeo\.com|loom\.com)/i.test(trimmed) || /^https?:\/\//i.test(trimmed);
}
function sanitizeMediaUrl(src, maxChars = 2048) {
  if (!src || typeof src !== "string") return "";
  const trimmed = src.trim();
  if (trimmed.startsWith("blob:")) return "";
  if (trimmed.startsWith("data:")) {
    return trimmed.length > maxChars ? "" : trimmed;
  }
  return trimmed.slice(0, maxChars);
}
function validateAndNormalizeProjectPayload(input = {}, options = {}) {
  if (!input || typeof input !== "object") {
    throw Object.assign(new Error("INVALID_PROJECT"), { status: 400 });
  }
  const allowIncomplete = Boolean(options.allowIncomplete);
  const draftHint = input.launchDraft ?? {};
  const fallbackSlug = String(input.draftId ?? draftHint.draftId ?? draftHint.id?.replace(/^launch-/, "") ?? `draft-${Date.now()}`).trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  const rawSlug = String(input.slug || draftHint.id?.replace(/^launch-/, "") || (allowIncomplete ? fallbackSlug : "")).trim().toLowerCase();
  if (!SLUG_REGEX.test(rawSlug)) {
    throw Object.assign(new Error("INVALID_PROJECT_SLUG"), { status: 400 });
  }
  const rawName = String(input.name || draftHint.project?.name || (allowIncomplete ? "Untitled draft" : "")).trim();
  if (rawName.length < 2 || rawName.length > 120) {
    throw Object.assign(new Error("INVALID_PROJECT_NAME"), { status: 400 });
  }
  const summary = String(
    input.summary ?? input.launchDraft?.project?.desc ?? input.launchDraft?.project?.about ?? ""
  ).trim().slice(0, 500);
  const status = String(options.status ?? input.status ?? input.launchDraft?.status ?? "DRAFT").trim().toUpperCase();
  if (!ALLOWED_PROJECT_STATUSES.includes(status)) {
    throw Object.assign(new Error("INVALID_PROJECT_STATUS"), { status: 400 });
  }
  const launchDraft = normalizeLaunchDraft(input.launchDraft ?? {}, {
    slug: rawSlug,
    name: rawName,
    summary,
    topSupply: input.supply,
    topPrice: input.price,
    status,
    allowIncomplete,
    draftId: input.draftId ?? draftHint.draftId,
    freezeAssignments: Boolean(options.freezeAssignments)
  });
  return {
    slug: rawSlug,
    name: rawName,
    summary,
    status,
    launchDraft
  };
}
function normalizeLaunchDraft(draft = {}, defaults = {}) {
  const allowIncomplete = Boolean(defaults.allowIncomplete);
  const isFullDraft = !allowIncomplete && draft && (draft.project || draft.edition || draft.advantages || draft.design || draft.preview);
  const name = String(draft.project?.name || defaults.name || (allowIncomplete ? "Untitled draft" : "")).trim();
  if (name.length < 2 || name.length > 120) {
    throw Object.assign(new Error("INVALID_PROJECT_NAME"), { status: 400 });
  }
  const slug = String(defaults.slug ?? draft.id?.replace(/^launch-/, "") ?? "").trim().toLowerCase();
  if (!SLUG_REGEX.test(slug)) {
    throw Object.assign(new Error("INVALID_PROJECT_SLUG"), { status: 400 });
  }
  const draftId = String(draft.draftId ?? defaults.draftId ?? `draft-${Date.now()}`).slice(0, 120);
  const projectInput = draft.project ?? {};
  const builder = String(projectInput.builder || name).trim();
  if (builder.length < 2 || builder.length > 120) {
    throw Object.assign(new Error("INVALID_BUILDER_NAME"), { status: 400 });
  }
  const builderHandle = String(projectInput.builderHandle ?? `@${slug}`).trim().slice(0, 80);
  const desc = String(projectInput.desc ?? defaults.summary ?? "").trim().slice(0, 500);
  const about = String(projectInput.about ?? defaults.summary ?? "").trim().slice(0, 4e3);
  if (isFullDraft && desc.length < 10) {
    throw Object.assign(new Error("INVALID_PROJECT_DESCRIPTION"), { status: 400 });
  }
  if (isFullDraft && about.length < 20) {
    throw Object.assign(new Error("INVALID_PROJECT_ABOUT"), { status: 400 });
  }
  const videoUrl = String(projectInput.videoUrl ?? "").trim();
  if (videoUrl && !isValidVideoUrl(videoUrl)) {
    throw Object.assign(new Error("INVALID_VIDEO_URL"), { status: 400 });
  }
  const evidence = projectInput.evidence ?? {};
  const evidenceType = String(evidence.type ?? projectInput.evidenceType ?? "Product").trim();
  const rawEvidenceUrl = String(evidence.url ?? projectInput.evidenceUrl ?? "").trim();
  if (isFullDraft && (!rawEvidenceUrl || !isValidUrl(rawEvidenceUrl))) {
    throw Object.assign(new Error("INVALID_EVIDENCE_URL"), { status: 400 });
  }
  const supportUrl = String(projectInput.supportUrl ?? "").trim();
  if (supportUrl && !isValidUrl(supportUrl)) {
    throw Object.assign(new Error("INVALID_SUPPORT_URL"), { status: 400 });
  }
  const category = String(projectInput.category ?? "tools").toLowerCase();
  if (!ALLOWED_CATEGORIES.includes(category)) {
    throw Object.assign(new Error("INVALID_CATEGORY"), { status: 400 });
  }
  const productState = String(projectInput.productState ?? "Live");
  if (!ALLOWED_PRODUCT_STATES.includes(productState)) {
    throw Object.assign(new Error("INVALID_PRODUCT_STATE"), { status: 400 });
  }
  const network = String(draft.network ?? projectInput.network ?? draft.edition?.network ?? "robinhood").trim().toLowerCase();
  if (!ALLOWED_NETWORKS.includes(network)) {
    throw Object.assign(new Error("INVALID_NETWORK"), { status: 400 });
  }
  const bannerInput = projectInput.banner ?? {};
  const bannerPalette = Array.isArray(bannerInput.palette) && bannerInput.palette.length >= 3 ? bannerInput.palette.slice(0, 3).map((c) => HEX_COLOR_REGEX.test(c) ? c : "#5f6f50") : ["#5f6f50", "#30483d", "#111512"];
  const bannerLogoPosition = bannerInput.logoPosition === "tr" ? "tr" : "tl";
  const bannerSrc = sanitizeMediaUrl(bannerInput.src);
  const bannerAssetId = String(bannerInput.assetId ?? "").slice(0, 120);
  const editionInput = draft.edition ?? {};
  const editionName = String(editionInput.name ?? "FOUNDING EDITION").trim().slice(0, 120);
  const series = String(editionInput.series ?? "SERIES 01").trim().slice(0, 80);
  const rawSupply = editionInput.supply ?? defaults.topSupply ?? 1;
  const supply = Number(rawSupply);
  if (!Number.isInteger(supply) || supply < 1) {
    throw Object.assign(new Error("INVALID_SUPPLY"), { status: 400 });
  }
  const rawPrice = editionInput.price ?? defaults.topPrice ?? 0;
  const priceString = String(rawPrice);
  if (!USDG_PRICE_REGEX.test(priceString) || Number(rawPrice) < 0) {
    throw Object.assign(new Error("INVALID_USDG_PRICE"), { status: 400 });
  }
  const price = Number(rawPrice);
  const rawRoyalty = editionInput.royalty ?? 0;
  const royalty = Number(rawRoyalty);
  if (Number.isNaN(royalty) || royalty < 0 || royalty > 5) {
    throw Object.assign(new Error("INVALID_ROYALTY"), { status: 400 });
  }
  const rawAdvantages = Array.isArray(draft.advantages) ? draft.advantages : [];
  const advantages = rawAdvantages.map((item, index) => {
    const mechKey = ALLOWED_ADVANTAGE_MECHANISMS.find(
      (m) => m.toLowerCase() === String(item.mechanism ?? "").toLowerCase()
    );
    if (!mechKey) {
      throw Object.assign(new Error("INVALID_ADVANTAGE_MECHANISM"), { status: 400 });
    }
    const covered = String(item.covered ?? "").trim().slice(0, 120);
    const benefit = String(item.benefit ?? "").trim().slice(0, 120);
    const duration = String(item.duration ?? "").trim().slice(0, 120);
    if (isFullDraft && (!covered || !benefit || !duration)) {
      throw Object.assign(new Error("INVALID_ADVANTAGE_DEFINITION"), { status: 400 });
    }
    return {
      id: String(item.id ?? `adv-${index + 1}`).slice(0, 64),
      mechanism: mechKey,
      covered,
      benefit,
      duration,
      summary: String(item.summary ?? `${benefit} \xB7 ${covered}`).trim().slice(0, 240)
    };
  });
  if (isFullDraft && advantages.length === 0) {
    throw Object.assign(new Error("ADVANTAGES_REQUIRED"), { status: 400 });
  }
  const refInput = draft.referral ?? {};
  const refEnabled = Boolean(refInput.enabled);
  const rawRefRate = Number(refInput.rate ?? 10);
  if (refEnabled && !ALLOWED_REFERRAL_RATES.includes(rawRefRate)) {
    throw Object.assign(new Error("INVALID_REFERRAL_RATE"), { status: 400 });
  }
  const referral = refEnabled ? { enabled: true, rate: rawRefRate, settlement: "Builder Settled" } : { enabled: false, rate: 0, settlement: "Builder Settled" };
  const maxPrimary = Number((supply * price).toFixed(6));
  const nexMarketsFee = Number((maxPrimary * 0.05).toFixed(6));
  const afterPlatformFee = Number((maxPrimary - nexMarketsFee).toFixed(6));
  const economics = {
    maxPrimary,
    nexMarketsFeeRate: 0.05,
    nexMarketsFee,
    afterPlatformFee
  };
  const designInput = draft.design ?? {};
  const rawPassDesign = String(designInput.passDesign ?? "classic").toLowerCase();
  if (!ALLOWED_PASS_DESIGNS.includes(rawPassDesign) && !isApprovedPassOption(rawPassDesign)) {
    throw Object.assign(new Error("INVALID_PASS_DESIGN"), { status: 400 });
  }
  const passDesign = isApprovedPassOption(rawPassDesign) ? rawPassDesign.startsWith("classic-") ? "classic" : rawPassDesign.startsWith("glass-") ? "glass" : rawPassDesign : rawPassDesign;
  const themeMode = String(designInput.themeMode ?? "auto").toLowerCase();
  if (!ALLOWED_THEME_MODES.includes(themeMode)) {
    throw Object.assign(new Error("INVALID_THEME_MODE"), { status: 400 });
  }
  const color = HEX_COLOR_REGEX.test(designInput.color) ? designInput.color : "#5f6f50";
  const customColor = HEX_COLOR_REGEX.test(designInput.customColor) ? designInput.customColor : color;
  const colorStyle = ALLOWED_COLOR_STYLES.includes(designInput.colorStyle) ? designInput.colorStyle : "solid";
  const gradientA = HEX_COLOR_REGEX.test(designInput.gradientA) ? designInput.gradientA : color;
  const gradientB = HEX_COLOR_REGEX.test(designInput.gradientB) ? designInput.gradientB : "#17241f";
  const gradientDirection = ALLOWED_GRADIENT_DIRECTIONS.includes(designInput.gradientDirection) ? designInput.gradientDirection : "diagonal";
  const frame = ALLOWED_FRAMES.includes(designInput.frame) ? designInput.frame : "gilt";
  const frameColor = HEX_COLOR_REGEX.test(designInput.frameColor) ? designInput.frameColor : "#c8a84e";
  const texture = ALLOWED_TEXTURES.includes(designInput.texture) ? designInput.texture : "none";
  const textureTint = HEX_COLOR_REGEX.test(designInput.textureTint) ? designInput.textureTint : "#9b9b94";
  const artMode = ALLOWED_ART_MODES.includes(designInput.artMode) ? designInput.artMode : "single";
  const artX = Math.max(0, Math.min(100, Number(designInput.artX ?? 50)));
  const artY = Math.max(0, Math.min(100, Number(designInput.artY ?? 50)));
  const frameHueCustomized = Boolean(designInput.frameHueCustomized);
  const artEditionView = ["grid", "serials", "list"].includes(designInput.artEditionView) ? designInput.artEditionView : "grid";
  const rawSelectedSerialIndex = Number(designInput.selectedSerialIndex ?? 0);
  const selectedSerialIndex = Number.isFinite(rawSelectedSerialIndex) ? Math.max(0, Math.floor(rawSelectedSerialIndex)) : 0;
  const rawArtEdition = Array.isArray(designInput.artEdition) ? designInput.artEdition : [];
  const artEdition = rawArtEdition.map((entry, idx) => {
    const serial = entry.serial != null ? Number(entry.serial) : idx + 1;
    return {
      assetKey: String(entry.assetKey ?? entry.storageKey ?? "").slice(0, 160),
      filename: String(entry.filename ?? `artwork_${serial}`).slice(0, 160),
      title: String(entry.title ?? `Artwork ${serial}`).slice(0, 160),
      type: String(entry.type ?? entry.mimeType ?? "image/png").slice(0, 60),
      size: Number(entry.size ?? entry.byteSize ?? 0),
      sha256: typeof entry.sha256 === "string" && /^[0-9a-f]{64}$/i.test(entry.sha256) ? entry.sha256.toLowerCase() : null,
      serial,
      traits: entry.traits && typeof entry.traits === "object" ? { ...entry.traits } : {},
      url: sanitizeMediaUrl(entry.url ?? entry.src)
    };
  });
  if (artMode === "collection" && artEdition.length > 0 && artEdition.length !== supply) {
    throw Object.assign(new Error("COLLECTION_ARTWORK_SUPPLY_MISMATCH"), { status: 400 });
  }
  const requestedPackOption = String(designInput.packOption ?? designInput.packId ?? (isApprovedPassOption(rawPassDesign) ? rawPassDesign : "")).trim().toLowerCase();
  const familyMaterial = passDesign === "glass" ? ["obsidian", "carbon"].includes(String(designInput.frame).toLowerCase()) ? String(designInput.frame).toLowerCase() : "obsidian" : ["obsidian", "carbon", "gilt"].includes(String(designInput.frame).toLowerCase()) ? String(designInput.frame).toLowerCase() : "obsidian";
  const randomPassMode = Boolean(designInput.randomPassMode);
  const packOption = randomPassMode ? null : isApprovedPassOption(requestedPackOption) ? requestedPackOption : ["classic", "glass"].includes(passDesign) ? `${passDesign}-${familyMaterial}` : null;
  if (!randomPassMode && (!packOption || !isApprovedPassOption(packOption))) {
    throw Object.assign(new Error("INVALID_PASS_DESIGN"), { status: 400 });
  }
  const selectedPack = randomPassMode ? null : PASS_DESIGN_OPTIONS.find((option) => option.id === packOption);
  const colorwayId = randomPassMode ? null : MANUAL_PHASE4_COLORWAY_ID;
  const randomPassSeed = String(designInput.randomPassSeed ?? draftId).trim().slice(0, 160) || draftId;
  const editionId = String(draft.editionId ?? draft.id ?? `launch-${slug}`).slice(0, 160);
  const artworkBySerial = {};
  if (artMode === "collection") {
    for (const entry of artEdition) artworkBySerial[entry.serial] = { ...entry, x: artX, y: artY };
  } else if (designInput.artSrc) {
    for (let serial = 1; serial <= supply; serial += 1) artworkBySerial[serial] = { url: sanitizeMediaUrl(designInput.artSrc), x: artX, y: artY };
  }
  const manualVisual = randomPassMode ? null : {
    passDesign,
    packOption,
    packFamily: selectedPack.family,
    material: selectedPack.material,
    themeMode,
    color,
    customColor,
    colorStyle,
    gradientA,
    gradientB,
    gradientDirection,
    frame,
    frameColor,
    frameHueCustomized,
    texture,
    textureTint,
    randomPalette: null
  };
  const manualPalette = randomPassMode ? null : {
    primary: colorStyle === "gradient" ? gradientA : color,
    secondary: colorStyle === "gradient" ? gradientB : color,
    accent: frameColor
  };
  const submittedAssignments = Array.isArray(designInput.passAssignments) ? designInput.passAssignments : [];
  const submittedBySerial = new Map(submittedAssignments.map((assignment) => [Number(assignment?.serial), assignment]));
  const hasCompleteSubmittedAssignments = submittedAssignments.length === supply && submittedBySerial.size === supply && Array.from({ length: supply }, (_, index) => submittedBySerial.has(index + 1)).every(Boolean);
  if (randomPassMode && isFullDraft && !hasCompleteSubmittedAssignments) {
    throw Object.assign(new Error("RANDOM_PASS_ASSIGNMENTS_REQUIRED"), { status: 400 });
  }
  const assignmentRows = Array.from({ length: supply }, (_, index) => {
    const serial = index + 1;
    const submitted = submittedBySerial.get(serial);
    const artworkId = artworkBySerial[serial]?.assetId ?? artworkBySerial[serial]?.assetKey ?? artworkBySerial[serial]?.filename ?? null;
    const expected = randomPassMode ? resolvePassAssignment({ seed: randomPassSeed, serial, artworkId }) : {
      rendererVersion: PASS_RENDERER_VERSION,
      serial,
      optionId: packOption,
      family: selectedPack.family,
      material: selectedPack.material,
      colorwayId: MANUAL_PHASE4_COLORWAY_ID,
      colorwayName: "Manual Phase 4",
      palette: { ...manualPalette },
      artworkId,
      visual: { ...manualVisual },
      authorityAssignment: null,
      frozen: false
    };
    if (submitted) {
      if (String(submitted.optionId) !== expected.optionId || String(submitted.colorwayId) !== expected.colorwayId) {
        throw Object.assign(new Error(`PHASE4_ASSIGNMENT_MISMATCH:${serial}`), { status: 400 });
      }
      const submittedPalette = submitted.palette || {};
      if ([expected.palette.primary, expected.palette.secondary, expected.palette.accent].some((value, paletteIndex) => value !== [submittedPalette.primary, submittedPalette.secondary, submittedPalette.accent][paletteIndex])) {
        throw Object.assign(new Error(`PHASE4_PALETTE_MISMATCH:${serial}`), { status: 400 });
      }
      if (randomPassMode) {
        const authority = submitted.authorityAssignment;
        const expectedAuthority = expected.authorityAssignment;
        if (!authority || authority.poolVersion !== expectedAuthority.poolVersion || Number(authority.serial) !== expectedAuthority.serial || authority.packId !== expectedAuthority.packId || authority.passDesign !== expectedAuthority.passDesign || authority.frame !== expectedAuthority.frame || authority.label !== expectedAuthority.label || Number(authority.colourIndex) !== Number(expectedAuthority.colourIndex) || JSON.stringify(authority.palette) !== JSON.stringify(expectedAuthority.palette) || String(authority.artKey ?? "") !== String(expectedAuthority.artKey ?? "")) {
          throw Object.assign(new Error(`RANDOM_AUTHORITY_ASSIGNMENT_MISMATCH:${serial}`), { status: 400 });
        }
      }
    }
    const randomPalette = randomPassMode ? [expected.palette.primary, expected.palette.secondary, expected.palette.accent] : null;
    const expectedFrame = expected.optionId.startsWith("classic-") || expected.optionId.startsWith("glass-") ? expected.material : "obsidian";
    const visual = randomPassMode ? {
      passDesign: expected.optionId.startsWith("classic-") ? "classic" : expected.optionId.startsWith("glass-") ? "glass" : expected.optionId,
      packOption: expected.optionId,
      packFamily: expected.family,
      material: expected.material,
      themeMode: "random",
      color: randomPalette[0],
      customColor: randomPalette[0],
      colorStyle: "solid",
      gradientA: randomPalette[0],
      gradientB: randomPalette[1],
      gradientDirection: "diagonal",
      frame: expectedFrame,
      frameColor: expectedFrame === "gilt" ? "#c8a84e" : expectedFrame === "carbon" ? "#313337" : "#2a2725",
      frameHueCustomized: false,
      texture: "none",
      textureTint: "#9b9b94",
      randomPalette
    } : manualVisual;
    return { ...expected, visual, authorityAssignment: expected.authorityAssignment ?? null };
  });
  const draftAssignments = assignmentRows.map((assignment) => {
    const config = createPassRenderConfig({
      editionId,
      serial: assignment.serial,
      supply,
      projectName: name,
      editionName,
      seriesName: series,
      assignment,
      artwork: artworkBySerial[assignment.serial]
    });
    return { ...config, randomAssignment: { ...config.randomAssignment, enabled: randomPassMode } };
  });
  const frozenAt = (/* @__PURE__ */ new Date()).toISOString();
  const canonicalAssignments = defaults.freezeAssignments ? draftAssignments.map((assignment) => ({ ...assignment, randomAssignment: { ...assignment.randomAssignment, enabled: randomPassMode, frozen: true }, frozen: true, frozenAt })) : draftAssignments;
  const design = {
    passDesign,
    themeMode,
    color,
    customColor,
    colorStyle,
    gradientA,
    gradientB,
    gradientDirection,
    frame,
    frameHueCustomized,
    frameColor,
    texture,
    textureTint,
    logoSrc: sanitizeMediaUrl(designInput.logoSrc),
    logoAssetId: String(designInput.logoAssetId ?? "").slice(0, 120),
    artMode,
    artSrc: sanitizeMediaUrl(designInput.artSrc),
    artAssetId: String(designInput.artAssetId ?? "").slice(0, 120),
    artEdition,
    artEditionView,
    selectedSerialIndex,
    artX,
    artY,
    rendererVersion: PASS_RENDERER_VERSION,
    randomPassMode,
    randomPassSeed,
    randomPoolVersion: "v1",
    packOption,
    packFamily: randomPassMode ? "random" : selectedPack.family,
    material: randomPassMode ? "authority-assigned" : selectedPack.material,
    colorwayId,
    palette: manualPalette ? { ...manualPalette } : null,
    passAssignments: canonicalAssignments
  };
  const previewInput = draft.preview ?? {};
  const rawHours = Number(previewInput.hours ?? 24);
  if (!Number.isInteger(rawHours) || rawHours < 24) {
    throw Object.assign(new Error("INVALID_PREVIEW_HOURS"), { status: 400 });
  }
  const rawOpensAt = previewInput.opensAt ?? new Date(Date.now() + rawHours * 3600 * 1e3).toISOString();
  const openDate = new Date(rawOpensAt);
  if (Number.isNaN(openDate.getTime())) {
    throw Object.assign(new Error("INVALID_OPENING_TIME"), { status: 400 });
  }
  const timezone = String(previewInput.timezone ?? "UTC").trim().slice(0, 80);
  const termsVersion = String(previewInput.termsVersion ?? "v1.0").trim().slice(0, 32);
  const preview = {
    hours: rawHours,
    opensAt: openDate.toISOString(),
    startsAt: previewInput.startsAt ? new Date(previewInput.startsAt).toISOString() : null,
    debutAt: openDate.toISOString(),
    localOpensAt: String(previewInput.localOpensAt ?? rawOpensAt),
    timezone,
    termsVersion
  };
  const accessInput = draft.mintAccess ?? {};
  const allowlistEnabled = Boolean(accessInput.enabled);
  const rawAllowlistAddresses = Array.isArray(accessInput.addresses) ? accessInput.addresses : String(accessInput.addresses ?? "").split(/[\s,]+/).filter(Boolean);
  let allowlist;
  try {
    allowlist = buildAllowlist(allowlistEnabled ? rawAllowlistAddresses : []);
  } catch {
    throw Object.assign(new Error("INVALID_ALLOWLIST_ADDRESS"), { status: 400 });
  }
  if (allowlistEnabled && isFullDraft && allowlist.entries.length === 0) {
    throw Object.assign(new Error("ALLOWLIST_ADDRESSES_REQUIRED"), { status: 400 });
  }
  const allowlistHours = Number(accessInput.hours ?? 24);
  if (allowlistEnabled && (!Number.isInteger(allowlistHours) || allowlistHours < 1)) {
    throw Object.assign(new Error("INVALID_ALLOWLIST_HOURS"), { status: 400 });
  }
  const allowlistSupply = Number(accessInput.supply ?? 0);
  if (!Number.isInteger(allowlistSupply) || allowlistSupply < 0 || allowlistSupply > supply) {
    throw Object.assign(new Error("INVALID_ALLOWLIST_SUPPLY"), { status: 400 });
  }
  const mintAccess = {
    enabled: allowlistEnabled,
    addresses: allowlist.entries.map((entry) => entry.account),
    root: allowlist.root,
    hours: allowlistEnabled ? allowlistHours : 0,
    supply: allowlistEnabled ? allowlistSupply : 0
  };
  const reviewInput = draft.review ?? {};
  const review = {
    evidence: Boolean(reviewInput.evidence ?? draft.reviewEvidence),
    advantages: Boolean(reviewInput.advantages ?? draft.reviewAdvantages),
    preview: Boolean(reviewInput.preview ?? draft.reviewPreview)
  };
  const status = String(defaults.status ?? draft.status ?? "DRAFT").trim().toUpperCase();
  if (!ALLOWED_PROJECT_STATUSES.includes(status)) {
    throw Object.assign(new Error("INVALID_PROJECT_STATUS"), { status: 400 });
  }
  return {
    id: `launch-${slug}`,
    draftId,
    network,
    project: {
      name,
      builder,
      builderHandle,
      desc,
      about,
      videoUrl,
      category,
      productState,
      evidence: {
        type: evidenceType,
        url: rawEvidenceUrl,
        label: String(evidence.label ?? evidenceType)
      },
      supportUrl,
      banner: {
        src: bannerSrc,
        assetId: bannerAssetId,
        palette: bannerPalette,
        logoPosition: bannerLogoPosition
      },
      network
    },
    edition: {
      name: editionName,
      series,
      supply,
      price,
      royalty,
      network
    },
    advantages,
    referral,
    economics,
    design,
    preview,
    mintAccess,
    review,
    status
  };
}
var ALLOWED_CATEGORIES, ALLOWED_PRODUCT_STATES, ALLOWED_NETWORKS, ALLOWED_PROJECT_STATUSES, ALLOWED_ADVANTAGE_MECHANISMS, ALLOWED_REFERRAL_RATES, ALLOWED_PASS_DESIGNS, ALLOWED_PACK_OPTIONS, ALLOWED_THEME_MODES, ALLOWED_COLOR_STYLES, ALLOWED_GRADIENT_DIRECTIONS, ALLOWED_FRAMES, ALLOWED_TEXTURES, ALLOWED_ART_MODES, MANUAL_PHASE4_COLORWAY_ID, HEX_COLOR_REGEX, SLUG_REGEX, USDG_PRICE_REGEX;
var init_launch_draft = __esm({
  "packages/domain/src/launch-draft.mjs"() {
    init_pass_design();
    init_allowlist();
    ALLOWED_CATEGORIES = Object.freeze([
      "tools",
      "ai",
      "media",
      "finance",
      "community",
      "gaming",
      "physical",
      "infrastructure"
    ]);
    ALLOWED_PRODUCT_STATES = Object.freeze([
      "Live",
      "MVP",
      "Beta",
      "Development",
      "Concept",
      "Preview"
    ]);
    ALLOWED_NETWORKS = Object.freeze([
      "robinhood",
      "base"
    ]);
    ALLOWED_PROJECT_STATUSES = Object.freeze([
      "DRAFT",
      "PUBLISHED",
      "ARCHIVED"
    ]);
    ALLOWED_ADVANTAGE_MECHANISMS = Object.freeze([
      "TimeBased",
      "QuantityBased",
      "Connected",
      "Redemption"
    ]);
    ALLOWED_REFERRAL_RATES = Object.freeze([5, 10, 15, 20]);
    ALLOWED_PASS_DESIGNS = Object.freeze([
      "classic",
      "glass",
      ...PASS_DESIGN_OPTIONS.map((option) => option.id)
    ]);
    ALLOWED_PACK_OPTIONS = Object.freeze(PASS_DESIGN_OPTIONS.map((option) => option.id));
    ALLOWED_THEME_MODES = Object.freeze([
      "auto",
      "custom",
      "amber",
      "steel",
      "onyx"
    ]);
    ALLOWED_COLOR_STYLES = Object.freeze([
      "solid",
      "gradient"
    ]);
    ALLOWED_GRADIENT_DIRECTIONS = Object.freeze([
      "diagonal",
      "vertical",
      "horizontal",
      "radial",
      "reverse"
    ]);
    ALLOWED_FRAMES = Object.freeze([
      "obsidian",
      "gilt",
      "prism",
      "carbon",
      "ivory",
      "verdigris",
      "lacquer",
      "denim",
      "sakura",
      "titanium",
      "cobalt",
      "onyx",
      "forge",
      "aurora"
    ]);
    ALLOWED_TEXTURES = Object.freeze([
      "none",
      "linen",
      "grain",
      "leather",
      "brushed",
      "silk",
      "hammered",
      "concrete",
      "canvas",
      "emboss",
      "foil",
      "dots",
      "lines",
      "mesh",
      "grid",
      "carbon"
    ]);
    ALLOWED_ART_MODES = Object.freeze([
      "single",
      "collection",
      "random"
    ]);
    MANUAL_PHASE4_COLORWAY_ID = "phase4-manual";
    HEX_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;
    SLUG_REGEX = /^[a-z0-9-]{3,80}$/;
    USDG_PRICE_REGEX = /^\d+(\.\d{1,6})?$/;
  }
});

// packages/domain/src/primary-accounting.mjs
function integer(value, field) {
  try {
    const parsed = typeof value === "bigint" ? value : BigInt(String(value ?? ""));
    if (parsed < 0n) throw new Error(`${field}_MUST_BE_NON_NEGATIVE`);
    return parsed;
  } catch (error) {
    if (error.message?.endsWith("_MUST_BE_NON_NEGATIVE")) throw error;
    throw new Error(`${field}_MUST_BE_INTEGER`);
  }
}
function required(value, field) {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`${field}_REQUIRED`);
  return text;
}
function calculatePrimarySale({
  grossAmountUsdg,
  quantity: quantity2 = 1,
  feeBps = PRIMARY_FEE_BPS,
  referralObligationUsdg = 0,
  paymentToken,
  network,
  chainId,
  txHash,
  blockNumber,
  eventIndex,
  editionId = null,
  editionAddress = null,
  termsHash = null,
  builderId = null,
  builderAccountId = null,
  buyerAddress = null,
  recipientAddress = null,
  firstTokenId = null,
  status = "CONFIRMED",
  evidence = {}
} = {}) {
  const gross = integer(grossAmountUsdg, "GROSS_AMOUNT_USDG");
  const count = integer(quantity2, "QUANTITY");
  const feeRate = integer(feeBps, "FEE_BPS");
  const referral = integer(referralObligationUsdg, "REFERRAL_OBLIGATION_USDG");
  if (gross <= 0n) throw new Error("GROSS_AMOUNT_USDG_MUST_BE_POSITIVE");
  if (count <= 0n) throw new Error("QUANTITY_MUST_BE_POSITIVE");
  if (feeRate > BPS_DENOMINATOR2) throw new Error("FEE_BPS_OUT_OF_RANGE");
  const fee = gross * feeRate / BPS_DENOMINATOR2;
  const proceeds = gross - fee;
  const normalizedStatus = String(status).toUpperCase();
  if (!["CONFIRMED", "FAILED", "REORGED"].includes(normalizedStatus)) throw new Error("PRIMARY_SALE_STATUS_INVALID");
  const numericChainId = Number(chainId);
  if (!Number.isInteger(numericChainId) || numericChainId <= 0) throw new Error("CHAIN_ID_REQUIRED");
  if (eventIndex == null) throw new Error("EVENT_INDEX_REQUIRED");
  return {
    chainId: numericChainId,
    network: required(network, "NETWORK"),
    txHash: required(txHash, "TX_HASH").toLowerCase(),
    blockNumber: blockNumber == null ? null : Number(integer(blockNumber, "BLOCK_NUMBER")),
    eventIndex: eventIndex == null ? null : Number(integer(eventIndex, "EVENT_INDEX")),
    editionId,
    editionAddress: editionAddress ? String(editionAddress).toLowerCase() : null,
    termsHash,
    builderId,
    builderAccountId,
    buyerAddress: buyerAddress ? String(buyerAddress).toLowerCase() : null,
    recipientAddress: recipientAddress ? String(recipientAddress).toLowerCase() : null,
    firstTokenId: firstTokenId == null ? null : String(integer(firstTokenId, "FIRST_TOKEN_ID")),
    quantity: Number(count),
    grossAmountUsdg: gross.toString(),
    nexmarketsFeeUsdg: fee.toString(),
    builderProceedsUsdg: proceeds.toString(),
    referralObligationUsdg: referral.toString(),
    paymentToken: required(paymentToken, "PAYMENT_TOKEN").toLowerCase(),
    status: normalizedStatus,
    evidence: structuredClone(evidence ?? {})
  };
}
function primarySaleEventKey({ chainId, txHash, eventIndex }) {
  if (eventIndex == null) throw new Error("EVENT_INDEX_REQUIRED");
  return `${Number(chainId)}:${String(txHash).toLowerCase()}:${Number(eventIndex)}`;
}
function aggregatePrimarySales(rows = []) {
  return rows.reduce((total, row) => {
    if (String(row.status ?? "CONFIRMED").toUpperCase() !== "CONFIRMED") return total;
    return {
      grossAmountUsdg: (BigInt(total.grossAmountUsdg) + BigInt(row.grossAmountUsdg ?? row.gross_amount_usdg ?? 0)).toString(),
      nexmarketsFeeUsdg: (BigInt(total.nexmarketsFeeUsdg) + BigInt(row.nexmarketsFeeUsdg ?? row.nexmarkets_fee_usdg ?? 0)).toString(),
      builderProceedsUsdg: (BigInt(total.builderProceedsUsdg) + BigInt(row.builderProceedsUsdg ?? row.builder_proceeds_usdg ?? 0)).toString(),
      referralObligationUsdg: (BigInt(total.referralObligationUsdg) + BigInt(row.referralObligationUsdg ?? row.referral_obligation_usdg ?? 0)).toString(),
      salesCount: total.salesCount + 1,
      unitsSold: total.unitsSold + Number(row.quantity ?? 0)
    };
  }, { grossAmountUsdg: "0", nexmarketsFeeUsdg: "0", builderProceedsUsdg: "0", referralObligationUsdg: "0", salesCount: 0, unitsSold: 0 });
}
var BPS_DENOMINATOR2, PRIMARY_FEE_BPS;
var init_primary_accounting = __esm({
  "packages/domain/src/primary-accounting.mjs"() {
    BPS_DENOMINATOR2 = 10000n;
    PRIMARY_FEE_BPS = 500n;
  }
});

// packages/domain/src/pass-renderer.mjs
var CANONICAL_PASS_RENDERER_VERSION, HISTORICAL_PASS_RENDERER_VERSION, RENDERERS;
var init_pass_renderer = __esm({
  "packages/domain/src/pass-renderer.mjs"() {
    CANONICAL_PASS_RENDERER_VERSION = "pass-renderer-v1";
    HISTORICAL_PASS_RENDERER_VERSION = "legacy-inline-v0";
    RENDERERS = Object.freeze({
      [CANONICAL_PASS_RENDERER_VERSION]: Object.freeze({ role: "canonical-current", authoring: "create-authoring", presentation: "lightweight-presentation", export: "frozen-config-export" }),
      [HISTORICAL_PASS_RENDERER_VERSION]: Object.freeze({ role: "historical-compatibility", authoring: null, presentation: "historical-v0-presentation", export: "historical-v0-export" })
    });
  }
});

// packages/domain/src/index.mjs
var init_src = __esm({
  "packages/domain/src/index.mjs"() {
    init_ids();
    init_transaction_state();
    init_authority();
    init_seaport_order();
    init_referral_ledger();
    init_media_provenance();
    init_notification();
    init_transaction_calldata();
    init_launch_draft();
    init_pass_design();
    init_primary_accounting();
    init_allowlist();
    init_pass_renderer();
  }
});

// packages/data/src/postgres-store.mjs
var postgres_store_exports = {};
__export(postgres_store_exports, {
  PostgresStore: () => PostgresStore
});
import { createHash as createHash3, randomUUID as randomUUID2 } from "node:crypto";
async function getPg() {
  if (!pgModule) {
    try {
      pgModule = await import("pg");
    } catch {
      throw new Error("Postgres client (pg) is not available in this environment");
    }
  }
  return pgModule.default ?? pgModule;
}
function sha2563(value) {
  return createHash3("sha256").update(value).digest("hex");
}
function builderError(code, status = 403) {
  return Object.assign(new Error(code), { status });
}
function projectedAdvantageRemaining(row, now = Math.floor(Date.now() / 1e3)) {
  const kind = String(row.kind ?? "").toUpperCase();
  const starts = row.starts_at ? Math.floor(new Date(row.starts_at).getTime() / 1e3) : 0;
  const ends = row.ends_at ? Math.floor(new Date(row.ends_at).getTime() / 1e3) : 0;
  let effective = Math.max(0, now - Number(row.frozen_seconds ?? 0));
  if (kind === "TIME_BASED" && row.listed && row.listed_at) {
    const listedTimestamp = Math.floor(new Date(row.listed_at).getTime() / 1e3) - Number(row.frozen_seconds ?? 0);
    if (listedTimestamp < ends) effective = effective < Math.max(listedTimestamp, starts) ? effective : Math.max(listedTimestamp, starts);
  }
  if (effective < starts || effective >= ends) return "0";
  if (kind === "TIME_BASED") return String(ends - effective);
  if (kind === "CONNECTED") return "1";
  return String(row.remaining_units ?? 0);
}
var pgModule, PostgresStore;
var init_postgres_store = __esm({
  "packages/data/src/postgres-store.mjs"() {
    init_primary_accounting();
    pgModule = null;
    PostgresStore = class {
      constructor({ connectionString = process.env.DATABASE_URL, pool } = {}) {
        if (!pool && !connectionString) throw new Error("DATABASE_URL is required");
        this.connectionString = connectionString;
        this.pool = pool;
        this.ownsPool = !pool;
      }
      async _getPool() {
        if (!this.pool) {
          const pg = await getPg();
          const Pool = pg.Pool ?? pg;
          this.pool = new Pool({ connectionString: this.connectionString, max: 10, application_name: "nexmarkets-api" });
        }
        return this.pool;
      }
      async ready() {
        await (await this._getPool()).query("SELECT 1");
        return true;
      }
      async indexerHealth(chainId) {
        const { rows } = await (await this._getPool()).query("SELECT * FROM indexer_checkpoint WHERE chain_id=$1 ORDER BY updated_at DESC LIMIT 1", [chainId]);
        return rows[0] ?? null;
      }
      async chainHead(chain) {
        return chain?.getBlockNumber ? chain.getBlockNumber() : null;
      }
      async close() {
        if (this.ownsPool) {
          if (this.pool) await this.pool.end();
        }
      }
      async saveChallenge(challenge) {
        await (await this._getPool()).query(
          `INSERT INTO wallet_challenge(nonce,account_id,wallet_address,origin,domain,chain_id,message,issued_at,expires_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,to_timestamp($8/1000.0),to_timestamp($9/1000.0))`,
          [challenge.nonce, challenge.accountId, challenge.address, challenge.origin, challenge.domain, challenge.chainId, challenge.message, challenge.issuedAt, challenge.expiresAt]
        );
      }
      async challenge(nonce) {
        const { rows } = await (await this._getPool()).query("SELECT * FROM wallet_challenge WHERE nonce=$1", [nonce]);
        if (!rows[0]) return null;
        const row = rows[0];
        return { accountId: row.account_id, address: row.wallet_address, nonce: row.nonce, origin: row.origin, domain: row.domain, chainId: Number(row.chain_id), message: row.message, issuedAt: row.issued_at.getTime(), expiresAt: row.expires_at.getTime(), consumedAt: row.consumed_at?.getTime() ?? null };
      }
      async consumeChallengeAndCreateSession({ challenge, session, signature }) {
        const client = await (await this._getPool()).connect();
        try {
          await client.query("BEGIN");
          const consumed = await client.query(
            `UPDATE wallet_challenge SET consumed_at=now(),signature=$2 WHERE nonce=$1 AND consumed_at IS NULL AND expires_at>now() RETURNING nonce`,
            [challenge.nonce, signature]
          );
          if (!consumed.rowCount) throw new Error("CHALLENGE_ALREADY_USED_OR_EXPIRED");
          const accountId = `acct_${sha2563(challenge.address).slice(0, 24)}`;
          const walletId = `wal_${sha2563(`${challenge.chainId}:${challenge.address}`).slice(0, 24)}`;
          await client.query("INSERT INTO account(id) VALUES($1) ON CONFLICT(id) DO NOTHING", [accountId]);
          await client.query(
            `INSERT INTO wallet(id,account_id,chain_id,address,verified_at) VALUES($1,$2,$3,$4,now())
         ON CONFLICT(chain_id,address) DO UPDATE SET verified_at=excluded.verified_at,revoked_at=NULL`,
            [walletId, accountId, challenge.chainId, challenge.address]
          );
          await client.query(
            `INSERT INTO app_session(id,account_id,wallet_id,token_hash,csrf_hash,expires_at)
         VALUES($1,$2,$3,$4,$5,to_timestamp($6/1000.0))`,
            [session.id, accountId, walletId, session.tokenHash, session.csrfHash, session.expiresAt]
          );
          await client.query("COMMIT");
          return { accountId, walletId };
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        } finally {
          client.release();
        }
      }
      async sessionByToken(token) {
        const { rows } = await (await this._getPool()).query(
          `SELECT s.*,w.address wallet_address,w.chain_id FROM app_session s JOIN wallet w ON w.id=s.wallet_id
       WHERE s.token_hash=$1`,
          [sha2563(token)]
        );
        if (!rows[0]) return null;
        const row = rows[0];
        return { id: row.id, accountId: row.account_id, walletId: row.wallet_id, walletAddress: row.wallet_address, chainId: Number(row.chain_id), tokenHash: row.token_hash, csrfHash: row.csrf_hash, expiresAt: row.expires_at.getTime(), revokedAt: row.revoked_at?.getTime() ?? null };
      }
      async revokeSession(id2) {
        await (await this._getPool()).query("UPDATE app_session SET revoked_at=now() WHERE id=$1", [id2]);
      }
      async refreshSessionCsrf(id2, csrfHash) {
        await (await this._getPool()).query("UPDATE app_session SET csrf_hash=$2 WHERE id=$1", [id2, csrfHash]);
      }
      async recordAudit({ accountId = null, walletAddress = null, action, objectType, objectId, requestId, correlationId, metadata = {} }) {
        await (await this._getPool()).query(
          `INSERT INTO audit_log(id,actor_account_id,actor_wallet_address,action,object_type,object_id,request_id,correlation_id,metadata)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`,
          [`aud_${randomUUID2()}`, accountId, walletAddress?.toLowerCase() ?? null, action, objectType, objectId, requestId, correlationId, JSON.stringify(metadata)]
        );
      }
      async prepareTransaction({ accountId, walletAddress, chainId, intentType, intentId, idempotencyKey, correlationId, requestId, toAddress = null, calldata = null }) {
        if (![4663, 46630, 8453, 84532].includes(Number(chainId))) throw new Error("SUPPORTED_EVM_CHAIN_REQUIRED");
        const id2 = `txj_${randomUUID2()}`;
        const result = await (await this._getPool()).query(
          `INSERT INTO chain_transaction(id,chain_id,intent_type,intent_id,wallet_address,state,correlation_id,request_id,to_address,calldata)
       VALUES($1,$2,$3,$4,$5,'PREPARED',$6,$7,$8,$9)
       ON CONFLICT(chain_id,wallet_address,intent_type,intent_id) DO UPDATE SET updated_at=chain_transaction.updated_at
       RETURNING *`,
          [id2, chainId, intentType, idempotencyKey ?? intentId, walletAddress.toLowerCase(), correlationId, requestId, toAddress?.toLowerCase() ?? null, calldata]
        );
        const transaction = result.rows[0];
        await (await this._getPool()).query(
          `INSERT INTO transaction_job(id,transaction_id,job_type) VALUES($1,$2,'CHAIN_LIFECYCLE') ON CONFLICT(transaction_id,job_type) DO NOTHING`,
          [`job_${sha2563(transaction.id).slice(0, 24)}`, transaction.id]
        );
        return transaction;
      }
      async updateTransaction({ id: id2, accountId, eventId, fromState, toState, evidence = {} }) {
        const client = await (await this._getPool()).connect();
        try {
          await client.query("BEGIN");
          const existingEvent = await client.query("SELECT transaction_id FROM transaction_event WHERE event_id=$1", [eventId]);
          if (existingEvent.rowCount) {
            const existing = await client.query(
              `SELECT t.* FROM chain_transaction t JOIN wallet w ON w.address=t.wallet_address AND w.chain_id=t.chain_id
           WHERE t.id=$1 AND w.account_id=$2`,
              [existingEvent.rows[0].transaction_id, accountId]
            );
            await client.query("COMMIT");
            return existing.rows[0] ?? null;
          }
          if (fromState === toState) throw new Error("TRANSACTION_DUPLICATE_STATE");
          const updated = await client.query(
            `UPDATE chain_transaction t SET state=$3,tx_hash=COALESCE($4,tx_hash),block_number=COALESCE($5,block_number),
          block_hash=COALESCE($6,block_hash),confirmations=COALESCE($7,confirmations),
          submitted_at=CASE WHEN $3='SUBMITTED' THEN COALESCE(submitted_at,now()) ELSE submitted_at END,
          finalized_at=CASE WHEN $3='FINALIZED' THEN COALESCE($8,now()) ELSE finalized_at END,
          failure_code=COALESCE($9,failure_code),updated_at=now()
         FROM wallet w WHERE t.id=$1 AND w.address=t.wallet_address AND w.chain_id=t.chain_id
          AND w.account_id=$2 AND t.state=$10 RETURNING t.*`,
            [
              id2,
              accountId,
              toState,
              evidence.txHash ?? null,
              evidence.blockNumber ?? null,
              evidence.blockHash ?? null,
              evidence.confirmations ?? null,
              evidence.finalizedAt ?? null,
              evidence.failureCode ?? null,
              fromState
            ]
          );
          if (!updated.rowCount) throw new Error("TRANSACTION_STATE_CONFLICT");
          await client.query(
            `INSERT INTO transaction_event(event_id,transaction_id,from_state,to_state,evidence) VALUES($1,$2,$3,$4,$5::jsonb)`,
            [eventId, id2, fromState, toState, JSON.stringify(evidence)]
          );
          await client.query("COMMIT");
          return updated.rows[0];
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        } finally {
          client.release();
        }
      }
      async transaction(id2, accountId, chainId = null) {
        const { rows } = await (await this._getPool()).query(
          `SELECT t.* FROM chain_transaction t JOIN wallet w ON w.address=t.wallet_address AND w.chain_id=t.chain_id
       WHERE t.id=$1 AND w.account_id=$2 AND ($3::bigint IS NULL OR t.chain_id=$3)`,
          [id2, accountId, chainId]
        );
        return rows[0] ?? null;
      }
      async discover() {
        const { rows } = await (await this._getPool()).query(
          `SELECT p.slug,p.builder_account_id,p.content,p.status,p.published_at,COALESCE(p.name,e.edition_id_hash) AS name,COALESCE(p.summary,'Permissionless on-chain Edition') AS summary,e.edition_address,e.absolute_supply_cap,t.price_usdg,t.mint_starts_at,t.mint_ends_at
       FROM edition e LEFT JOIN project p ON e.project_id=p.id
       LEFT JOIN LATERAL (SELECT * FROM terms_version tv WHERE tv.edition_id=e.id AND tv.orphaned_at IS NULL ORDER BY version DESC LIMIT 1) t ON true
       WHERE (p.status='PUBLISHED' OR p.id IS NULL) AND e.orphaned_at IS NULL AND e.disabled IS NOT TRUE ORDER BY p.published_at DESC NULLS LAST,e.created_at DESC LIMIT 100`
        );
        return rows;
      }
      async ownedPasses(address2) {
        const { rows } = await (await this._getPool()).query(
          `SELECT pt.*,e.edition_address,COALESCE(p.name,e.edition_id_hash) project_name FROM pass_token_projection pt
       JOIN edition e ON e.id=pt.edition_id LEFT JOIN project p ON p.id=e.project_id
       WHERE pt.owner_address=$1 AND pt.orphaned_at IS NULL`,
          [address2.toLowerCase()]
        );
        return rows;
      }
      async projectBySlug(slug) {
        const { rows } = await (await this._getPool()).query("SELECT * FROM project WHERE slug=$1 AND status=$2", [slug, "PUBLISHED"]);
        if (!rows[0]) return null;
        const editions = await (await this._getPool()).query(
          `SELECT e.*,t.version active_terms_version,t.terms_hash active_terms_hash,t.price_usdg,t.preview_starts_at,t.mint_starts_at,t.mint_ends_at
       FROM edition e LEFT JOIN LATERAL (SELECT * FROM terms_version tv WHERE tv.edition_id=e.id AND tv.orphaned_at IS NULL ORDER BY version DESC LIMIT 1) t ON true
       WHERE e.project_id=$1 AND e.orphaned_at IS NULL ORDER BY e.created_at`,
          [rows[0].id]
        );
        return { ...rows[0], editions: editions.rows };
      }
      async projectByEditionAddress(address2) {
        const { rows } = await (await this._getPool()).query(
          `SELECT p.* FROM project p JOIN edition e ON e.project_id=p.id
       WHERE e.edition_address=$1 AND p.status='PUBLISHED' AND e.orphaned_at IS NULL
       ORDER BY p.updated_at DESC LIMIT 1`,
          [address2.toLowerCase()]
        );
        if (!rows[0]) return null;
        const editions = await (await this._getPool()).query(
          `SELECT e.*,t.version active_terms_version,t.terms_hash active_terms_hash,t.price_usdg,t.preview_starts_at,t.mint_starts_at,t.mint_ends_at
       FROM edition e LEFT JOIN LATERAL (SELECT * FROM terms_version tv WHERE tv.edition_id=e.id AND tv.orphaned_at IS NULL ORDER BY version DESC LIMIT 1) t ON true
       WHERE e.project_id=$1 AND e.orphaned_at IS NULL ORDER BY e.created_at`,
          [rows[0].id]
        );
        return { ...rows[0], editions: editions.rows };
      }
      async editionByAddress(address2) {
        const { rows } = await (await this._getPool()).query(
          `SELECT e.*,p.slug,COALESCE(p.name,e.edition_id_hash) AS name FROM edition e LEFT JOIN project p ON p.id=e.project_id
       WHERE e.edition_address=$1 AND e.orphaned_at IS NULL`,
          [address2.toLowerCase()]
        );
        if (!rows[0]) return null;
        const [terms, advantages] = await Promise.all([
          (await this._getPool()).query("SELECT * FROM terms_version WHERE edition_id=$1 AND orphaned_at IS NULL ORDER BY version DESC", [rows[0].id]),
          (await this._getPool()).query("SELECT * FROM advantage_definition WHERE edition_id=$1 ORDER BY starts_at,advantage_id_hash", [rows[0].id])
        ]);
        const kind = { TIME_BASED: 0, QUANTITY_BASED: 1, CONNECTED: 2, REDEMPTION: 3 };
        return { ...rows[0], termsHistory: terms.rows.map((term) => ({ ...term, advantageConfigs: advantages.rows.filter((advantage) => advantage.terms_hash === term.terms_hash).map((advantage) => ({ advantageId: advantage.advantage_id_hash, kind: kind[advantage.kind], startsAt: Math.floor(advantage.starts_at.getTime() / 1e3), endsAt: Math.floor(advantage.ends_at.getTime() / 1e3), totalUnits: advantage.total_units, definitionHash: advantage.definition_hash })) })) };
      }
      async pass(editionAddress, tokenId) {
        const { rows } = await (await this._getPool()).query(
          `SELECT pt.*,e.edition_address,p.slug,COALESCE(p.name,e.edition_id_hash) AS name,t.royalty_receiver,t.royalty_bps FROM pass_token_projection pt
       JOIN edition e ON e.id=pt.edition_id LEFT JOIN project p ON p.id=e.project_id
       LEFT JOIN terms_version t ON t.edition_id=pt.edition_id AND t.terms_hash=pt.terms_hash AND t.orphaned_at IS NULL
       WHERE e.edition_address=$1 AND pt.token_id=$2 AND pt.orphaned_at IS NULL`,
          [editionAddress.toLowerCase(), tokenId]
        );
        if (!rows[0]) return null;
        const [advantages, listing] = await Promise.all([
          (await this._getPool()).query(`SELECT a.*,d.kind,d.starts_at,d.ends_at,d.total_units,d.definition_hash,d.definition FROM advantage_state_projection a
       LEFT JOIN advantage_definition d ON d.edition_id=a.edition_id AND d.terms_hash=$3 AND d.advantage_id_hash=a.advantage_id_hash
       WHERE a.edition_id=$1 AND a.token_id=$2 AND a.orphaned_at IS NULL`, [rows[0].edition_id, tokenId, rows[0].terms_hash]),
          (await this._getPool()).query(`SELECT * FROM listing_projection WHERE edition_id=$1 AND token_id=$2 AND orphaned_at IS NULL ORDER BY updated_at DESC LIMIT 1`, [rows[0].edition_id, tokenId])
        ]);
        return { ...rows[0], advantages: advantages.rows.map((row) => {
          const remaining = projectedAdvantageRemaining(row);
          return { ...row, remaining, userFacingRemaining: remaining, consumesOnchain: ["QUANTITY_BASED", "REDEMPTION"].includes(String(row.kind).toUpperCase()) };
        }), listing: listing.rows[0] ?? null };
      }
      async listings() {
        const { rows } = await (await this._getPool()).query(
          `SELECT l.*,e.edition_address,p.name project_name,s.order_payload,s.counter,s.signature FROM listing_projection l
       JOIN edition e ON e.id=l.edition_id JOIN project p ON p.id=e.project_id
       LEFT JOIN signed_seaport_order s ON s.order_hash=l.order_hash AND s.chain_id=e.chain_id
       WHERE l.status='ACTIVE' AND l.orphaned_at IS NULL AND l.expires_at>now() ORDER BY l.updated_at DESC LIMIT 200`
        );
        return rows;
      }
      async storeSignedOrder({ accountId, chainId, orderHash, seller, order, counter, signature }) {
        const { rows } = await (await this._getPool()).query(
          `INSERT INTO signed_seaport_order(order_hash,chain_id,seller_address,order_payload,counter,signature,submitted_by_account_id)
       VALUES($1,$2,$3,$4::jsonb,$5,$6,$7)
       ON CONFLICT(order_hash) DO UPDATE SET order_payload=excluded.order_payload,counter=excluded.counter,signature=excluded.signature
       WHERE signed_seaport_order.seller_address=excluded.seller_address AND signed_seaport_order.chain_id=excluded.chain_id
       RETURNING *`,
          [orderHash.toLowerCase(), chainId, seller.toLowerCase(), JSON.stringify(order), String(counter), signature, accountId]
        );
        if (!rows[0]) throw new Error("SIGNED_ORDER_CONFLICT");
        return rows[0];
      }
      async signedOrder(orderHash) {
        const { rows } = await (await this._getPool()).query(
          `SELECT s.*,l.status,l.expires_at,e.edition_address FROM signed_seaport_order s
       JOIN listing_projection l ON l.order_hash=s.order_hash JOIN edition e ON e.id=l.edition_id
       WHERE s.order_hash=$1 AND l.orphaned_at IS NULL`,
          [orderHash.toLowerCase()]
        );
        return rows[0] ?? null;
      }
      async listing(orderHash) {
        const { rows } = await (await this._getPool()).query(
          `SELECT l.*,e.edition_address FROM listing_projection l JOIN edition e ON e.id=l.edition_id
       WHERE l.order_hash=$1 AND l.orphaned_at IS NULL`,
          [orderHash.toLowerCase()]
        );
        return rows[0] ?? null;
      }
      async _builderForAccount(accountId, requestedBuilderId = null, { create = false } = {}) {
        const pool = await this._getPool();
        const requested = requestedBuilderId == null ? null : String(requestedBuilderId);
        const { rows } = await pool.query(
          `SELECT b.id,b.owner_account_id,b.created_at,b.updated_at
       FROM builder b JOIN builder_membership bm ON bm.builder_id=b.id
       LEFT JOIN builder_profile bp ON bp.builder_id=b.id
       WHERE bm.account_id=$1 AND ($2::text IS NULL OR b.id=$2 OR bp.id=$2)
       ORDER BY b.created_at ASC LIMIT 1`,
          [accountId, requested]
        );
        if (rows[0]) return rows[0];
        if (requested || !create) {
          if (requested) throw builderError("BUILDER_NOT_AUTHORIZED");
          return null;
        }
        const id2 = `bld_${randomUUID2()}`;
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          const existing = await client.query(
            `SELECT b.id,b.owner_account_id,b.created_at,b.updated_at FROM builder b
         JOIN builder_membership bm ON bm.builder_id=b.id WHERE bm.account_id=$1
         ORDER BY b.created_at ASC LIMIT 1`,
            [accountId]
          );
          if (existing.rows[0]) {
            await client.query("COMMIT");
            return existing.rows[0];
          }
          const inserted = await client.query(
            `INSERT INTO builder(id,owner_account_id) VALUES($1,$2) RETURNING id,owner_account_id,created_at,updated_at`,
            [id2, accountId]
          );
          await client.query(`INSERT INTO builder_membership(builder_id,account_id,role) VALUES($1,$2,'OWNER')`, [id2, accountId]);
          await client.query("COMMIT");
          return inserted.rows[0];
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        } finally {
          client.release();
        }
      }
      async _builderForIdentifier(identifier) {
        const { rows } = await (await this._getPool()).query(
          `SELECT DISTINCT b.id,b.owner_account_id,b.created_at,b.updated_at
       FROM builder b
       LEFT JOIN builder_profile bp ON bp.builder_id=b.id
       LEFT JOIN wallet w ON w.account_id=b.owner_account_id
       WHERE b.id=$1 OR bp.id=$1 OR b.owner_account_id=$1 OR LOWER(w.address)=LOWER($1)
       ORDER BY b.created_at ASC LIMIT 1`,
          [String(identifier ?? "")]
        );
        return rows[0] ?? null;
      }
      async listBuildersForAccount(accountId) {
        const { rows } = await (await this._getPool()).query(
          `SELECT b.id,b.owner_account_id,b.created_at,b.updated_at,bm.role,
              bp.id AS profile_id,bp.display_name,bp.bio,bp.about,bp.avatar_url,bp.category,bp.links,bp.featured
       FROM builder_membership bm JOIN builder b ON b.id=bm.builder_id
       LEFT JOIN builder_profile bp ON bp.builder_id=b.id
       WHERE bm.account_id=$1 ORDER BY b.created_at ASC`,
          [accountId]
        );
        return rows.map((row) => ({
          id: row.id,
          builder_id: row.id,
          owner_account_id: row.owner_account_id,
          role: row.role,
          profile: row.profile_id ? { id: row.profile_id, builder_id: row.id, account_id: row.owner_account_id, display_name: row.display_name, bio: row.bio, about: row.about, avatar_url: row.avatar_url, category: row.category, links: row.links, featured: row.featured } : null
        }));
      }
      async createBuilderIdentity(accountId, data = {}) {
        const id2 = `bld_${randomUUID2()}`;
        const client = await (await this._getPool()).connect();
        try {
          await client.query("BEGIN");
          const { rows } = await client.query(`INSERT INTO builder(id,owner_account_id) VALUES($1,$2) RETURNING id,owner_account_id,created_at,updated_at`, [id2, accountId]);
          await client.query(`INSERT INTO builder_membership(builder_id,account_id,role) VALUES($1,$2,'OWNER')`, [id2, accountId]);
          await client.query("COMMIT");
          const builder = rows[0];
          if (data.displayName || data.display_name || data.bio || data.about || data.links) builder.profile = await this.upsertBuilderProfile(accountId, data, { builderId: id2 });
          else builder.profile = null;
          return builder;
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        } finally {
          client.release();
        }
      }
      async recordPrimarySale(input) {
        let sale = calculatePrimarySale(input);
        if (!sale.builderId && sale.builderAccountId) {
          const builder = await this._builderForIdentifier(sale.builderAccountId);
          if (builder) sale = { ...sale, builderId: builder.id };
        }
        const key = primarySaleEventKey(sale);
        const id2 = `psa_${sha2563(key).slice(0, 24)}`;
        const pool = await this._getPool();
        const { rows } = await pool.query(
          `INSERT INTO primary_sale_accounting(
         id,chain_id,network,tx_hash,block_number,event_index,edition_id,edition_address,terms_hash,
         builder_id,builder_account_id,buyer_address,recipient_address,first_token_id,quantity,
         gross_amount_usdg,nexmarkets_fee_usdg,builder_proceeds_usdg,referral_obligation_usdg,
         payment_token,status,evidence)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22::jsonb)
        ON CONFLICT(chain_id,tx_hash,event_index) DO NOTHING
       RETURNING *`,
          [
            id2,
            sale.chainId,
            sale.network,
            sale.txHash,
            sale.blockNumber,
            sale.eventIndex,
            sale.editionId,
            sale.editionAddress,
            sale.termsHash,
            sale.builderId,
            sale.builderAccountId,
            sale.buyerAddress,
            sale.recipientAddress,
            sale.firstTokenId,
            sale.quantity,
            sale.grossAmountUsdg,
            sale.nexmarketsFeeUsdg,
            sale.builderProceedsUsdg,
            sale.referralObligationUsdg,
            sale.paymentToken,
            sale.status,
            JSON.stringify(sale.evidence)
          ]
        );
        if (rows[0]) return rows[0];
        const existing = await pool.query("SELECT * FROM primary_sale_accounting WHERE chain_id=$1 AND tx_hash=$2 AND event_index=$3", [sale.chainId, sale.txHash, sale.eventIndex]);
        if (!existing.rows[0]) throw new Error("PRIMARY_SALE_INSERT_RACE");
        const row = existing.rows[0];
        if (String(row.gross_amount_usdg) !== sale.grossAmountUsdg || Number(row.quantity) !== sale.quantity || String(row.edition_id ?? "") !== String(sale.editionId ?? "")) throw new Error("PRIMARY_SALE_EVENT_CONFLICT");
        return row;
      }
      async primarySalesForBuilder(builderIdentifier) {
        const builder = await this._builderForIdentifier(builderIdentifier);
        if (!builder) return [];
        const { rows } = await (await this._getPool()).query(
          `SELECT * FROM primary_sale_accounting WHERE builder_id=$1 ORDER BY block_number,event_index`,
          [builder.id]
        );
        return rows;
      }
      async createProject({ accountId, builderId = null, body }) {
        const builder = await this._builderForAccount(accountId, builderId, { create: true });
        const canonicalBuilderId = builder.id;
        const draftId = body.launchDraft?.draftId ?? body.draftId ?? null;
        const status = body.status ?? body.launchDraft?.status ?? "DRAFT";
        if (draftId) {
          const existing = await (await this._getPool()).query(
            `SELECT * FROM project WHERE (builder_id=$1 OR (builder_id IS NULL AND builder_account_id=$2)) AND (content->>'draftId'=$3 OR slug=$4) LIMIT 1`,
            [canonicalBuilderId, accountId, draftId, body.slug]
          );
          if (existing.rows[0]) {
            const updated = await (await this._getPool()).query(
              `UPDATE project SET name=$2, summary=$3, content=$4::jsonb, status=$5,
             published_at=CASE WHEN $5='PUBLISHED' THEN COALESCE(project.published_at,now()) ELSE project.published_at END,
             builder_id=$6, updated_at=now() WHERE id=$1 AND (builder_id=$7 OR (builder_id IS NULL AND builder_account_id=$8)) RETURNING *`,
              [existing.rows[0].id, body.name, body.summary ?? "", JSON.stringify(body.launchDraft ?? {}), status, canonicalBuilderId, canonicalBuilderId, accountId]
            );
            return updated.rows[0];
          }
        }
        const slugCheck = await (await this._getPool()).query("SELECT id, builder_id, builder_account_id FROM project WHERE slug=$1", [body.slug]);
        if (slugCheck.rows[0]) {
          if (slugCheck.rows[0].builder_id === canonicalBuilderId || slugCheck.rows[0].builder_id == null && slugCheck.rows[0].builder_account_id === accountId) {
            const updated = await (await this._getPool()).query(
              `UPDATE project SET name=$2, summary=$3, content=$4::jsonb, status=$5,
             published_at=CASE WHEN $5='PUBLISHED' THEN COALESCE(project.published_at,now()) ELSE project.published_at END,
             builder_id=$6, updated_at=now() WHERE id=$1 AND (builder_id=$7 OR (builder_id IS NULL AND builder_account_id=$8)) RETURNING *`,
              [slugCheck.rows[0].id, body.name, body.summary ?? "", JSON.stringify(body.launchDraft ?? {}), status, canonicalBuilderId, canonicalBuilderId, accountId]
            );
            return updated.rows[0];
          }
          throw Object.assign(new Error("SLUG_ALREADY_TAKEN"), { status: 409 });
        }
        const id2 = `prj_${randomUUID2()}`;
        const { rows } = await (await this._getPool()).query(
          `INSERT INTO project(id,builder_id,builder_account_id,slug,name,summary,content,status,published_at)
       VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,CASE WHEN $8='PUBLISHED' THEN now() ELSE NULL END) RETURNING *`,
          [id2, canonicalBuilderId, accountId, body.slug, body.name, body.summary ?? "", JSON.stringify(body.launchDraft ?? {}), status]
        );
        return rows[0];
      }
      // Link a receipt-proven Edition to the Builder's published Product. The
      // caller must have already verified the Factory event through RPC; this
      // method enforces the off-chain ownership boundary and keeps the link
      // idempotent when the indexer lands the same Edition later.
      async linkEditionToProject({ accountId, builderId = null, projectId, edition }) {
        const builder = await this._builderForAccount(accountId, builderId, { create: false });
        if (!builder) throw builderError("BUILDER_NOT_AUTHORIZED");
        const projectKey = String(projectId ?? "").trim();
        if (!projectKey) throw Object.assign(new Error("PROJECT_ID_REQUIRED"), { status: 400 });
        const address2 = String(edition?.edition ?? edition?.editionAddress ?? "").toLowerCase();
        if (!/^0x[0-9a-f]{40}$/.test(address2)) throw Object.assign(new Error("EDITION_ADDRESS_REQUIRED"), { status: 400 });
        const pool = await this._getPool();
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          const project = await client.query(
            `SELECT id,builder_id,builder_account_id,status FROM project
         WHERE id=$1 AND (builder_id=$2 OR (builder_id IS NULL AND builder_account_id=$3)) FOR UPDATE`,
            [projectKey, builder.id, accountId]
          );
          if (!project.rows[0]) throw builderError("PROJECT_BUILDER_MISMATCH", 403);
          if (!["DRAFT", "PUBLISHED"].includes(String(project.rows[0].status).toUpperCase())) throw Object.assign(new Error("PROJECT_NOT_PUBLISHABLE"), { status: 409 });
          const existing = await client.query(
            "SELECT id,project_id FROM edition WHERE chain_id=$1 AND edition_address=$2 AND orphaned_at IS NULL FOR UPDATE",
            [Number(edition.chainId), address2]
          );
          if (existing.rows[0]?.project_id && existing.rows[0].project_id !== projectKey) throw Object.assign(new Error("EDITION_ALREADY_LINKED"), { status: 409 });
          const rowId = existing.rows[0]?.id ?? `ed_${sha2563(`${Number(edition.chainId)}:${address2}`).slice(0, 24)}`;
          const values = [
            rowId,
            projectKey,
            Number(edition.chainId),
            address2,
            String(edition.editionId).toLowerCase(),
            String(edition.factoryAddress).toLowerCase(),
            String(edition.publisherAddress ?? edition.publisher).toLowerCase(),
            Number(edition.absoluteSupplyCap),
            String(edition.artworkCommitment).toLowerCase(),
            Number(edition.blockNumber),
            String(edition.blockHash).toLowerCase(),
            String(edition.txHash).toLowerCase(),
            Number(edition.logIndex)
          ];
          const linked = await client.query(
            `INSERT INTO edition(id,project_id,chain_id,edition_address,edition_id_hash,factory_address,publisher_address,absolute_supply_cap,artwork_commitment,source_block_number,source_block_hash,source_tx_hash,source_log_index,finalized)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,false)
         ON CONFLICT(chain_id,edition_address) DO UPDATE SET project_id=COALESCE(edition.project_id,EXCLUDED.project_id),orphaned_at=NULL
         RETURNING *`,
            values
          );
          await client.query("COMMIT");
          return linked.rows[0];
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        } finally {
          client.release();
        }
      }
      async saveTermsCommitment({ builderAccountId, builderId = null, editionAddress, advantagesHash, termsPayload, configs }) {
        const builder = await this._builderForAccount(builderAccountId, builderId, { create: true });
        const { rows } = await (await this._getPool()).query(
          `INSERT INTO terms_advantage_commitment(advantages_hash,builder_account_id,builder_id,edition_address,terms_payload,configs)
       VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb)
       ON CONFLICT(advantages_hash) DO UPDATE SET builder_account_id=excluded.builder_account_id,builder_id=excluded.builder_id,terms_payload=excluded.terms_payload,configs=excluded.configs,status='PREPARED',updated_at=now()
       RETURNING *`,
          [advantagesHash.toLowerCase(), builderAccountId, builder.id, editionAddress.toLowerCase(), JSON.stringify(termsPayload), JSON.stringify(configs ?? [])]
        );
        return rows[0];
      }
      async termsCommitmentsForEdition(editionAddress) {
        const { rows } = await (await this._getPool()).query(
          `SELECT advantages_hash, terms_payload, configs, created_at, updated_at
       FROM terms_advantage_commitment WHERE LOWER(edition_address)=LOWER($1)
       ORDER BY created_at ASC`,
          [String(editionAddress ?? "")]
        );
        return rows.map((row) => ({
          advantagesHash: row.advantages_hash,
          advantages_hash: row.advantages_hash,
          termsPayload: row.terms_payload,
          configs: row.configs ?? [],
          createdAt: row.created_at,
          updatedAt: row.updated_at
        }));
      }
      async createMedia({ accountId, metadata }) {
        const id2 = `med_${randomUUID2()}`;
        const { rows } = await (await this._getPool()).query(
          `INSERT INTO media_asset(id,owner_account_id,storage_key,original_filename,mime_type,byte_size,sha256,safety_status)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT(owner_account_id,sha256) DO UPDATE SET
         original_filename=excluded.original_filename,
         mime_type=excluded.mime_type,
         byte_size=excluded.byte_size,
         deleted_at=NULL
       RETURNING *`,
          [id2, accountId, metadata.storageKey, metadata.filename, metadata.mimeType, metadata.byteSize, metadata.sha256, "PENDING"]
        );
        return rows[0];
      }
      async mediaById(id2) {
        const { rows } = await (await this._getPool()).query("SELECT * FROM media_asset WHERE id=$1 AND deleted_at IS NULL", [id2]);
        return rows[0] ?? null;
      }
      async mediaByIds(ids2) {
        if (!Array.isArray(ids2) || ids2.length === 0) return [];
        const { rows } = await (await this._getPool()).query("SELECT * FROM media_asset WHERE id=ANY($1::text[]) AND deleted_at IS NULL", [ids2]);
        return rows;
      }
      async approveMedia({ id: id2, accountId, publicUrl, width, height, mimeType, byteSize, sha256: sha2565 }) {
        const { rows } = await (await this._getPool()).query(
          `UPDATE media_asset SET safety_status='APPROVED',upload_status='UPLOADED',public_url=$3,width=$4,height=$5,mime_type=$6,byte_size=$7,sha256=$8,uploaded_at=now(),verified_at=now()
       WHERE id=$1 AND owner_account_id=$2 AND deleted_at IS NULL RETURNING *`,
          [id2, accountId, publicUrl, width, height, mimeType, byteSize, sha2565]
        );
        return rows[0] ?? null;
      }
      async advantagesForOwner(address2) {
        const { rows } = await (await this._getPool()).query(
          `SELECT a.*,d.kind,d.starts_at,d.ends_at,d.total_units,p.token_id,e.edition_address,p.terms_hash FROM advantage_state_projection a
       JOIN pass_token_projection p ON p.edition_id=a.edition_id AND p.token_id=a.token_id
       JOIN edition e ON e.id=a.edition_id
       LEFT JOIN advantage_definition d ON d.edition_id=a.edition_id AND d.advantage_id_hash=a.advantage_id_hash AND d.terms_hash=p.terms_hash
       WHERE p.owner_address=$1 AND p.orphaned_at IS NULL AND a.orphaned_at IS NULL`,
          [address2.toLowerCase()]
        );
        return rows.map((row) => {
          const remaining = projectedAdvantageRemaining(row);
          return { ...row, remaining, userFacingRemaining: remaining, consumesOnchain: ["QUANTITY_BASED", "REDEMPTION"].includes(String(row.kind).toUpperCase()) };
        });
      }
      async builderDashboard(accountId, { builderId = null } = {}) {
        const builder = await this._builderForAccount(accountId, builderId, { create: false });
        const canonicalBuilderId = builder?.id ?? null;
        if (!canonicalBuilderId) return { builder: null, projects: [], editions: [], royalties: [], referrals: [], primarySales: [], earnings: aggregatePrimarySales([]), activity: [] };
        const pool = await this._getPool();
        const builderFilter = `(p.builder_id=$1 OR (p.builder_id IS NULL AND p.builder_account_id=$2))`;
        const [projects, editions, royalties, referrals, sales, activity, profile] = await Promise.all([
          pool.query(`SELECT * FROM project p WHERE p.builder_id=$1 OR (p.builder_id IS NULL AND p.builder_account_id=$2) ORDER BY p.updated_at DESC`, [canonicalBuilderId, accountId]),
          pool.query(`SELECT DISTINCT e.* FROM edition e JOIN project p ON p.id=e.project_id WHERE ${builderFilter} AND e.orphaned_at IS NULL`, [canonicalBuilderId, accountId]),
          pool.query(`SELECT r.* FROM royalty_claim_projection r JOIN edition e ON e.id=r.edition_id JOIN project p ON p.id=e.project_id WHERE ${builderFilter} AND r.orphaned_at IS NULL`, [canonicalBuilderId, accountId]),
          pool.query(`SELECT s.* FROM referral_settlement s WHERE (s.builder_id=$1 OR (s.builder_id IS NULL AND s.builder_account_id=$2)) ORDER BY s.created_at DESC`, [canonicalBuilderId, accountId]),
          pool.query(`SELECT * FROM primary_sale_accounting WHERE builder_id=$1 ORDER BY block_number,event_index`, [canonicalBuilderId]),
          this.getActivityByBuilder(canonicalBuilderId, { limit: 50 }),
          pool.query(`SELECT * FROM builder_profile WHERE builder_id=$1 LIMIT 1`, [canonicalBuilderId])
        ]);
        const earnings = aggregatePrimarySales(sales.rows);
        return { builder: { ...builder, profile: profile.rows[0] ?? null }, projects: projects.rows, editions: editions.rows, royalties: royalties.rows, referrals: referrals.rows, primarySales: sales.rows, earnings, activity };
      }
      async claimOutbox(limit = 50) {
        const { rows } = await (await this._getPool()).query(
          `WITH claimed AS (
         SELECT id FROM outbox_event WHERE delivered_at IS NULL AND dead_at IS NULL
          AND available_at<=now() AND (locked_at IS NULL OR locked_at<now()-interval '5 minutes')
         ORDER BY available_at,id FOR UPDATE SKIP LOCKED LIMIT $1
       ) UPDATE outbox_event o SET locked_at=now() FROM claimed WHERE o.id=claimed.id RETURNING o.*`,
          [limit]
        );
        return rows.map((row) => ({ ...row, eventType: row.event_type, businessKey: row.business_key, deliveredAt: row.delivered_at }));
      }
      async enqueueNotification(event) {
        const client = await (await this._getPool()).connect();
        try {
          await client.query("BEGIN");
          const notificationId = `not_${sha2563(`${event.type}:${event.businessKey}:${event.accountId ?? ""}`).slice(0, 24)}`;
          await client.query(
            `INSERT INTO notification(id,account_id,type,business_key,payload) VALUES($1,$2,$3,$4,$5::jsonb)
         ON CONFLICT(type,business_key,account_id) DO NOTHING`,
            [notificationId, event.accountId, event.type, event.businessKey, JSON.stringify(event.payload)]
          );
          await client.query(
            `INSERT INTO outbox_event(id,aggregate_type,aggregate_id,event_type,business_key,payload)
         VALUES($1,$2,$3,$4,$5,$6::jsonb) ON CONFLICT(event_type,business_key) DO NOTHING`,
            [event.id, event.aggregateType, event.aggregateId, event.type, event.businessKey, JSON.stringify({ notificationId, ...event.payload })]
          );
          await client.query("COMMIT");
          return { notificationId, outboxId: event.id };
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        } finally {
          client.release();
        }
      }
      async markOutboxDelivered(id2) {
        await (await this._getPool()).query("UPDATE outbox_event SET delivered_at=now(),locked_at=NULL,last_error=NULL WHERE id=$1 AND delivered_at IS NULL", [id2]);
      }
      async markOutboxFailed(id2, { attempt, dead, delaySeconds, error }) {
        await (await this._getPool()).query(
          `UPDATE outbox_event SET attempt=$2,locked_at=NULL,last_error=$3,
       available_at=now()+($4::text||' seconds')::interval,dead_at=CASE WHEN $5 THEN now() ELSE dead_at END
       WHERE id=$1 AND delivered_at IS NULL`,
          [id2, attempt, String(error).slice(0, 1e3), delaySeconds, dead]
        );
      }
      async startRun(scope) {
        const id2 = `rec_${randomUUID2()}`;
        const { rows } = await (await this._getPool()).query(
          `INSERT INTO reconciliation_run(id,chain_id,scope,status) VALUES($1,$2,$3,'RUNNING') RETURNING *`,
          [id2, scope.chainId ?? 4663, JSON.stringify(scope)]
        );
        return rows[0];
      }
      async recordIncident(incident) {
        const id2 = `inc_${randomUUID2()}`;
        await (await this._getPool()).query(
          `INSERT INTO reconciliation_incident(id,run_id,authority,object_key,severity,expected,observed,status,repair_action)
       VALUES($1,$2,$3,$4,'HIGH',$5::jsonb,$6::jsonb,'OPEN',$7)`,
          [
            id2,
            incident.runId,
            incident.authority ?? "CHAIN",
            `${incident.objectKey}:${incident.check}`,
            JSON.stringify(incident.expected ?? null),
            JSON.stringify(incident.observed ?? { error: incident.error }),
            incident.repairAction
          ]
        );
      }
      async finishRun(id2, status, result) {
        await (await this._getPool()).query(
          `UPDATE reconciliation_run SET status=$2,checked_count=$3,discrepancy_count=$4,evidence=$5::jsonb,finished_at=now() WHERE id=$1`,
          [id2, status, result.checkedCount ?? 0, result.discrepancies.length, JSON.stringify(result)]
        );
      }
      // --- Social layer ---
      async getBuilderProfile(identifier) {
        const { rows } = await (await this._getPool()).query(
          `SELECT bp.*, b.owner_account_id, b.created_at AS builder_created_at, w.address AS wallet_address, a.created_at AS joined_at,
       (SELECT count(*)::int FROM builder_follow bf WHERE bf.builder_id=bp.builder_id OR (bf.builder_id IS NULL AND bf.builder_account_id=bp.account_id)) AS follower_count,
       (SELECT count(*)::int FROM edition e JOIN project p ON p.id=e.project_id WHERE (p.builder_id=bp.builder_id OR (p.builder_id IS NULL AND p.builder_account_id=bp.account_id)) AND e.orphaned_at IS NULL) AS editions_count,
       (SELECT count(*)::int FROM pass_token_projection pt JOIN edition e ON e.id=pt.edition_id JOIN project p ON p.id=e.project_id WHERE (p.builder_id=bp.builder_id OR (p.builder_id IS NULL AND p.builder_account_id=bp.account_id)) AND pt.orphaned_at IS NULL) AS passes_issued,
       (SELECT count(DISTINCT pt.owner_address)::int FROM pass_token_projection pt JOIN edition e ON e.id=pt.edition_id JOIN project p ON p.id=e.project_id WHERE (p.builder_id=bp.builder_id OR (p.builder_id IS NULL AND p.builder_account_id=bp.account_id)) AND pt.orphaned_at IS NULL) AS active_holders,
       (SELECT COALESCE(sum(ps.gross_amount_usdg),0)::text FROM primary_sale_accounting ps WHERE ps.builder_id=bp.builder_id AND ps.status='CONFIRMED') AS total_volume_usdg
       FROM builder_profile bp
       JOIN builder b ON b.id=bp.builder_id
       JOIN account a ON a.id=b.owner_account_id
       LEFT JOIN LATERAL (SELECT address FROM wallet WHERE account_id=b.owner_account_id ORDER BY created_at ASC LIMIT 1) w ON true
       WHERE bp.builder_id=$1 OR bp.id=$1 OR b.owner_account_id=$1 OR LOWER(w.address)=LOWER($1) OR LOWER(COALESCE(bp.links->>'handle',''))=LOWER($1)`,
          [String(identifier ?? "")]
        );
        if (!rows[0]) return null;
        const r = rows[0];
        return {
          ...r,
          stats: {
            editionsCount: r.editions_count,
            passesIssued: r.passes_issued,
            activeHolders: r.active_holders,
            totalVolumeUsdg: r.total_volume_usdg ?? "0"
          }
        };
      }
      async upsertBuilderProfile(accountId, data, { builderId = null } = {}) {
        const builder = await this._builderForAccount(accountId, builderId, { create: true });
        const id2 = `bprf_${randomUUID2()}`;
        const { rows } = await (await this._getPool()).query(
          `INSERT INTO builder_profile(id,builder_id,account_id,display_name,bio,about,avatar_url,category,links)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
       ON CONFLICT (builder_id) DO UPDATE SET
         display_name=COALESCE(NULLIF($4,''),builder_profile.display_name),
         bio=COALESCE(NULLIF($5,''),builder_profile.bio),
         about=COALESCE(NULLIF($6,''),builder_profile.about),
         avatar_url=COALESCE(NULLIF($7,''),builder_profile.avatar_url),
         category=COALESCE(NULLIF($8,''),builder_profile.category),
         links=CASE WHEN $9::jsonb='{}'::jsonb THEN builder_profile.links ELSE $9::jsonb END,
         account_id=EXCLUDED.account_id,
         updated_at=now()
       RETURNING *`,
          [id2, builder.id, accountId, data.displayName ?? "", data.bio ?? "", data.about ?? "", data.avatarUrl ?? "", data.category ?? "", JSON.stringify(data.links ?? {})]
        );
        return rows[0];
      }
      async followBuilder(followerAccountId, builderAccountId) {
        const builder = await this._builderForIdentifier(builderAccountId);
        if (!builder) throw Object.assign(new Error("BUILDER_NOT_FOUND"), { status: 404 });
        if (builder.owner_account_id === followerAccountId) throw Object.assign(new Error("SELF_FOLLOW_REJECTED"), { status: 400 });
        const id2 = `bfl_${randomUUID2()}`;
        await (await this._getPool()).query(
          `INSERT INTO builder_follow(id,follower_account_id,builder_account_id,builder_id) VALUES($1,$2,$3,$4) ON CONFLICT(follower_account_id,builder_id) DO NOTHING`,
          [id2, followerAccountId, builder.owner_account_id, builder.id]
        );
        const { rows } = await (await this._getPool()).query(
          `SELECT count(*)::int AS cnt FROM builder_follow WHERE builder_id=$1 OR (builder_id IS NULL AND builder_account_id=$2)`,
          [builder.id, builder.owner_account_id]
        );
        return { followed: true, followerCount: rows[0].cnt };
      }
      async unfollowBuilder(followerAccountId, builderAccountId) {
        const builder = await this._builderForIdentifier(builderAccountId);
        if (!builder) return { unfollowed: true, followerCount: 0 };
        await (await this._getPool()).query(
          `DELETE FROM builder_follow WHERE follower_account_id=$1 AND (builder_id=$2 OR (builder_id IS NULL AND builder_account_id=$3))`,
          [followerAccountId, builder.id, builder.owner_account_id]
        );
        const { rows } = await (await this._getPool()).query(
          `SELECT count(*)::int AS cnt FROM builder_follow WHERE builder_id=$1 OR (builder_id IS NULL AND builder_account_id=$2)`,
          [builder.id, builder.owner_account_id]
        );
        return { unfollowed: true, followerCount: rows[0].cnt };
      }
      async getFollowStatus(followerAccountId, builderAccountId) {
        const builder = await this._builderForIdentifier(builderAccountId);
        if (!builder) return { isFollowing: false, followerCount: 0, isHolder: false };
        const pool = await this._getPool();
        const [followRow, countRow, holderRow] = await Promise.all([
          pool.query(`SELECT 1 FROM builder_follow WHERE follower_account_id=$1 AND (builder_id=$2 OR (builder_id IS NULL AND builder_account_id=$3)) LIMIT 1`, [followerAccountId, builder.id, builder.owner_account_id]),
          pool.query(`SELECT count(*)::int AS cnt FROM builder_follow WHERE builder_id=$1 OR (builder_id IS NULL AND builder_account_id=$2)`, [builder.id, builder.owner_account_id]),
          pool.query(
            `SELECT 1 FROM pass_token_projection pt
         JOIN edition e ON e.id=pt.edition_id JOIN project p ON p.id=e.project_id
         WHERE pt.owner_address IN (SELECT w.address FROM wallet w WHERE w.account_id=$1)
         AND (p.builder_id=$2 OR (p.builder_id IS NULL AND p.builder_account_id=$3)) AND pt.orphaned_at IS NULL LIMIT 1`,
            [followerAccountId, builder.id, builder.owner_account_id]
          )
        ]);
        return { isFollowing: followRow.rows.length > 0, followerCount: countRow.rows[0].cnt, isHolder: holderRow.rows.length > 0 };
      }
      async getFollowedBuilders(accountId) {
        const { rows } = await (await this._getPool()).query(
          `SELECT bf.builder_id, bf.builder_account_id, bf.created_at AS followed_at, bp.id AS profile_id, bp.display_name, bp.bio, bp.avatar_url, bp.category
       FROM builder_follow bf LEFT JOIN builder_profile bp ON bp.builder_id=bf.builder_id
       WHERE bf.follower_account_id=$1 ORDER BY bf.created_at DESC`,
          [accountId]
        );
        return rows;
      }
      async watchProject(accountId, slug) {
        const project = await (await this._getPool()).query(`SELECT id FROM project WHERE slug=$1`, [slug]);
        if (!project.rows[0]) throw Object.assign(new Error("PROJECT_NOT_FOUND"), { status: 404 });
        const projectId = project.rows[0].id;
        const id2 = `pwl_${randomUUID2()}`;
        await (await this._getPool()).query(
          `INSERT INTO project_watchlist(id,account_id,project_id) VALUES($1,$2,$3) ON CONFLICT(account_id,project_id) DO NOTHING`,
          [id2, accountId, projectId]
        );
        const { rows } = await (await this._getPool()).query(`SELECT count(*)::int AS cnt FROM project_watchlist WHERE project_id=$1`, [projectId]);
        return { watching: true, watcherCount: rows[0].cnt };
      }
      async unwatchProject(accountId, slug) {
        const project = await (await this._getPool()).query(`SELECT id FROM project WHERE slug=$1`, [slug]);
        if (!project.rows[0]) throw Object.assign(new Error("PROJECT_NOT_FOUND"), { status: 404 });
        const projectId = project.rows[0].id;
        await (await this._getPool()).query(`DELETE FROM project_watchlist WHERE account_id=$1 AND project_id=$2`, [accountId, projectId]);
        const { rows } = await (await this._getPool()).query(`SELECT count(*)::int AS cnt FROM project_watchlist WHERE project_id=$1`, [projectId]);
        return { unwatched: true, watcherCount: rows[0].cnt };
      }
      async getWatchlist(accountId) {
        const { rows } = await (await this._getPool()).query(
          `SELECT pw.*, p.slug, p.name, p.summary,
       (SELECT count(*)::int FROM project_watchlist x WHERE x.project_id=pw.project_id) AS watcher_count
       FROM project_watchlist pw JOIN project p ON p.id=pw.project_id
       WHERE pw.account_id=$1 ORDER BY pw.created_at DESC`,
          [accountId]
        );
        return rows;
      }
      async createMilestone(builderAccountId, payload) {
        const builder = await this._builderForIdentifier(builderAccountId);
        if (!builder) throw Object.assign(new Error("BUILDER_NOT_FOUND"), { status: 404 });
        if (!payload.title?.trim()) throw Object.assign(new Error("MILESTONE_TITLE_REQUIRED"), { status: 400 });
        if (!payload.content?.trim()) throw Object.assign(new Error("MILESTONE_CONTENT_REQUIRED"), { status: 400 });
        const cadence = await (await this._getPool()).query(
          `SELECT 1 FROM builder_milestone WHERE (builder_id=$1 OR (builder_id IS NULL AND builder_account_id=$2))
       AND (project_id=$3 OR ($3::text IS NULL AND project_id IS NULL))
       AND created_at > now() - interval '7 days' LIMIT 1`,
          [builder.id, builder.owner_account_id, payload.projectId ?? null]
        );
        if (cadence.rows[0]) throw Object.assign(new Error("MILESTONE_CADENCE_EXCEEDED"), { status: 429 });
        const id2 = `bms_${randomUUID2()}`;
        const { rows } = await (await this._getPool()).query(
          `INSERT INTO builder_milestone(id,builder_account_id,builder_id,project_id,title,content,links) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb) RETURNING *`,
          [id2, builder.owner_account_id, builder.id, payload.projectId ?? null, payload.title.trim(), payload.content.trim(), JSON.stringify(payload.links ?? [])]
        );
        return rows[0];
      }
      async getMilestonesByBuilder(builderAccountId, { limit = 20 } = {}) {
        const builder = await this._builderForIdentifier(builderAccountId);
        if (!builder) return [];
        const { rows } = await (await this._getPool()).query(
          `SELECT * FROM builder_milestone WHERE builder_id=$1 OR (builder_id IS NULL AND builder_account_id=$2) ORDER BY created_at DESC LIMIT $3`,
          [builder.id, builder.owner_account_id, limit]
        );
        return rows;
      }
      async createQuestion(askerAccountId, builderAccountId, payload) {
        const builder = await this._builderForIdentifier(builderAccountId);
        if (!builder) throw Object.assign(new Error("BUILDER_NOT_FOUND"), { status: 404 });
        const question = String(payload.question ?? payload.content ?? "").trim().slice(0, 800);
        if (question.length < 3) throw Object.assign(new Error("QUESTION_REQUIRED"), { status: 400 });
        const id2 = `bq_${randomUUID2()}`;
        const { rows } = await (await this._getPool()).query(
          `INSERT INTO builder_question(id,builder_account_id,builder_id,asker_account_id,question) VALUES($1,$2,$3,$4,$5) RETURNING *`,
          [id2, builder.owner_account_id, builder.id, askerAccountId, question]
        );
        return rows[0];
      }
      async answerQuestion(builderAccountId, questionId, payload) {
        const answer = String(payload.answer ?? payload.content ?? "").trim().slice(0, 1200);
        if (!answer) throw Object.assign(new Error("ANSWER_REQUIRED"), { status: 400 });
        const owner = await (await this._getPool()).query(
          `SELECT b.owner_account_id FROM builder_question q LEFT JOIN builder b ON b.id=q.builder_id WHERE q.id=$1`,
          [questionId]
        );
        if (!owner.rows[0] || owner.rows[0].owner_account_id !== builderAccountId) throw Object.assign(new Error("QUESTION_NOT_FOUND"), { status: 404 });
        const { rows } = await (await this._getPool()).query(
          `UPDATE builder_question SET answer=$2,answered_at=now() WHERE id=$1 RETURNING *`,
          [questionId, answer]
        );
        if (!rows[0]) throw Object.assign(new Error("QUESTION_NOT_FOUND"), { status: 404 });
        return rows[0];
      }
      async getQuestionsByBuilder(builderAccountId, { limit = 50 } = {}) {
        const builder = await this._builderForIdentifier(builderAccountId);
        if (!builder) return [];
        const { rows } = await (await this._getPool()).query(
          `SELECT * FROM builder_question WHERE builder_id=$1 OR (builder_id IS NULL AND builder_account_id=$2) ORDER BY created_at DESC LIMIT $3`,
          [builder.id, builder.owner_account_id, limit]
        );
        return rows;
      }
      async getActivityByBuilder(builderAccountId, { limit = 20 } = {}) {
        const builder = await this._builderForIdentifier(builderAccountId);
        if (!builder) return [];
        const canonicalBuilderId = builder.id;
        const ownerAccountId = builder.owner_account_id;
        const pool = await this._getPool();
        const [milestones, debuts, sales, holders] = await Promise.all([
          pool.query(`SELECT id, 'MILESTONE' AS type, title, content, links, created_at FROM builder_milestone WHERE builder_id=$1 OR (builder_id IS NULL AND builder_account_id=$2) ORDER BY created_at DESC LIMIT $3`, [canonicalBuilderId, ownerAccountId, limit]),
          pool.query(`SELECT e.id, 'NEW_DEBUT' AS type, p.name AS title, p.summary AS content, '[]'::jsonb AS links, e.created_at FROM edition e JOIN project p ON p.id=e.project_id WHERE (p.builder_id=$1 OR (p.builder_id IS NULL AND p.builder_account_id=$2)) AND e.orphaned_at IS NULL ORDER BY e.created_at DESC LIMIT $3`, [canonicalBuilderId, ownerAccountId, limit]),
          pool.query(`SELECT l.order_hash AS id, 'SECONDARY_SALE' AS type, ('Pass #' || l.token_id || ' Sold') AS title, (l.price_usdg || ' USDG') AS content, '[]'::jsonb AS links, l.updated_at AS created_at FROM listing_projection l JOIN edition e ON e.id=l.edition_id JOIN project p ON p.id=e.project_id WHERE (p.builder_id=$1 OR (p.builder_id IS NULL AND p.builder_account_id=$2)) AND l.status='FILLED' AND l.orphaned_at IS NULL ORDER BY l.updated_at DESC LIMIT $3`, [canonicalBuilderId, ownerAccountId, limit]),
          pool.query(`SELECT (pt.edition_id || '_' || pt.token_id) AS id, 'NEW_HOLDER' AS type, ('New Holder for #' || pt.token_id) AS title, pt.owner_address AS content, '[]'::jsonb AS links, pt.updated_at AS created_at FROM pass_token_projection pt JOIN edition e ON e.id=pt.edition_id JOIN project p ON p.id=e.project_id WHERE (p.builder_id=$1 OR (p.builder_id IS NULL AND p.builder_account_id=$2)) AND pt.orphaned_at IS NULL ORDER BY pt.updated_at DESC LIMIT $3`, [canonicalBuilderId, ownerAccountId, limit])
        ]);
        const combined = [...milestones.rows, ...debuts.rows, ...sales.rows, ...holders.rows].sort((a, b2) => new Date(b2.created_at) - new Date(a.created_at)).slice(0, limit);
        return combined;
      }
      async getFeed(accountId, { limit = 50 } = {}) {
        const { rows } = await (await this._getPool()).query(
          `WITH followed AS (
         SELECT builder_account_id FROM builder_follow WHERE follower_account_id=$1
         UNION
         SELECT p.builder_account_id FROM pass_token_projection pt
         JOIN edition e ON e.id=pt.edition_id
         JOIN project p ON p.id=e.project_id
         WHERE pt.owner_address IN (SELECT address FROM wallet WHERE account_id=$1)
           AND pt.orphaned_at IS NULL
       )
       SELECT bm.*, 'MILESTONE' AS type, bp.display_name AS builder_display_name, bp.avatar_url AS builder_avatar_url
       FROM builder_milestone bm
       JOIN followed f ON f.builder_account_id=bm.builder_account_id
       LEFT JOIN builder_profile bp ON bp.account_id=bm.builder_account_id
       ORDER BY bm.created_at DESC LIMIT $2`,
          [accountId, limit]
        );
        return rows;
      }
      async getHolders(editionAddress, { limit = 100 } = {}) {
        const { rows } = await (await this._getPool()).query(
          `SELECT pt.owner_address, pt.token_id, pt.updated_at AS held_since, pt.minted_block_number
       FROM pass_token_projection pt JOIN edition e ON e.id=pt.edition_id
       WHERE e.edition_address=$1 AND pt.orphaned_at IS NULL
       ORDER BY pt.token_id ASC LIMIT $2`,
          [editionAddress.toLowerCase(), limit]
        );
        return rows;
      }
      async getPlatformStats() {
        const pool = await this._getPool();
        const [passes, holders, volume] = await Promise.all([
          pool.query(`SELECT count(*)::int AS cnt FROM pass_token_projection WHERE orphaned_at IS NULL`),
          pool.query(`SELECT count(DISTINCT owner_address)::int AS cnt FROM pass_token_projection WHERE orphaned_at IS NULL`),
          pool.query(`SELECT COALESCE(sum(price_usdg),0)::text AS vol FROM listing_projection WHERE status='FILLED' AND orphaned_at IS NULL`)
        ]);
        return { passesIssued: passes.rows[0].cnt, activeHolders: holders.rows[0].cnt, totalVolumeUsdg: volume.rows[0].vol };
      }
      async getWatchlistCount(projectIdOrSlug) {
        const { rows } = await (await this._getPool()).query(
          `SELECT count(*)::int AS cnt FROM project_watchlist pw
       JOIN project p ON p.id=pw.project_id
       WHERE p.id=$1 OR p.slug=$1`,
          [projectIdOrSlug]
        );
        return rows[0]?.cnt ?? 0;
      }
      async getFeaturedBuilders({ limit = 4 } = {}) {
        const { rows } = await (await this._getPool()).query(
          `SELECT bp.*,b.owner_account_id,
       (SELECT count(*)::int FROM edition e JOIN project p ON p.id=e.project_id WHERE (p.builder_id=bp.builder_id OR (p.builder_id IS NULL AND p.builder_account_id=bp.account_id)) AND e.orphaned_at IS NULL) AS editions_count,
       (SELECT count(*)::int FROM pass_token_projection pt JOIN edition e ON e.id=pt.edition_id JOIN project p ON p.id=e.project_id WHERE (p.builder_id=bp.builder_id OR (p.builder_id IS NULL AND p.builder_account_id=bp.account_id)) AND pt.orphaned_at IS NULL) AS passes_issued,
       (SELECT e.absolute_supply_cap FROM edition e JOIN project p ON p.id=e.project_id WHERE (p.builder_id=bp.builder_id OR (p.builder_id IS NULL AND p.builder_account_id=bp.account_id)) AND e.orphaned_at IS NULL ORDER BY e.created_at DESC LIMIT 1) AS supply_cap,
       (SELECT t.price_usdg::text FROM edition e JOIN project p ON p.id=e.project_id LEFT JOIN LATERAL (SELECT * FROM terms_version tv WHERE tv.edition_id=e.id AND tv.orphaned_at IS NULL ORDER BY version DESC LIMIT 1) t ON true WHERE (p.builder_id=bp.builder_id OR (p.builder_id IS NULL AND p.builder_account_id=bp.account_id)) AND e.orphaned_at IS NULL ORDER BY e.created_at DESC LIMIT 1) AS price_usdg,
       (SELECT p.slug FROM project p WHERE p.builder_id=bp.builder_id OR (p.builder_id IS NULL AND p.builder_account_id=bp.account_id) ORDER BY p.updated_at DESC LIMIT 1) AS project_slug,
       (SELECT COALESCE(sum(ps.gross_amount_usdg),0)::text FROM primary_sale_accounting ps WHERE ps.builder_id=bp.builder_id AND ps.status='CONFIRMED') AS total_volume_usdg
       FROM builder_profile bp JOIN builder b ON b.id=bp.builder_id WHERE bp.featured=true LIMIT $1`,
          [limit]
        );
        return rows;
      }
    };
  }
});

// apps/api/src/memory-store.mjs
import { createHash as createHash6, randomUUID as randomUUID4 } from "node:crypto";
function hash3(value) {
  return createHash6("sha256").update(value).digest("hex");
}
function builderError2(code, status = 403) {
  return Object.assign(new Error(code), { status });
}
var MemoryStore;
var init_memory_store = __esm({
  "apps/api/src/memory-store.mjs"() {
    init_src();
    MemoryStore = class {
      constructor() {
        this.challenges = /* @__PURE__ */ new Map();
        this.sessions = /* @__PURE__ */ new Map();
        this.transactions = /* @__PURE__ */ new Map();
        this.projects = [];
        this.editions = [];
        this.passes = [];
        this.listingRows = [];
        this.signedOrders = /* @__PURE__ */ new Map();
        this.termsCommitments = /* @__PURE__ */ new Map();
        this.media = [];
        this.builders = /* @__PURE__ */ new Map();
        this.builderMemberships = [];
        this.builderProfiles = /* @__PURE__ */ new Map();
        this.primarySales = /* @__PURE__ */ new Map();
        this.builderFollows = [];
        this.projectWatchlist = [];
        this.builderMilestones = [];
        this.builderQuestions = [];
      }
      async ready() {
        return true;
      }
      async indexerHealth() {
        return { latest_block_number: 1, latest_event_block_number: 1, landed_block_number: 1, finalized_block_number: 1, finalized_watermark_block_number: 1 };
      }
      async close() {
      }
      async saveChallenge(challenge) {
        this.challenges.set(challenge.nonce, structuredClone(challenge));
      }
      async challenge(nonce) {
        return structuredClone(this.challenges.get(nonce) ?? null);
      }
      async consumeChallengeAndCreateSession({ challenge, session, signature }) {
        const stored = this.challenges.get(challenge.nonce);
        if (!stored || stored.consumedAt) throw new Error("CHALLENGE_ALREADY_USED_OR_EXPIRED");
        stored.consumedAt = Date.now();
        stored.signature = signature;
        const accountId = `acct_${hash3(challenge.address).slice(0, 24)}`;
        const walletId = `wal_${hash3(`${challenge.chainId}:${challenge.address}`).slice(0, 24)}`;
        this.sessions.set(session.tokenHash, { ...session, accountId, walletId, walletAddress: challenge.address, chainId: challenge.chainId });
        return { accountId, walletId };
      }
      async sessionByToken(token) {
        return structuredClone(this.sessions.get(hash3(token)) ?? null);
      }
      async revokeSession(id2) {
        for (const session of this.sessions.values()) if (session.id === id2) session.revokedAt = Date.now();
      }
      async refreshSessionCsrf(id2, csrfHash) {
        for (const session of this.sessions.values()) if (session.id === id2) session.csrfHash = csrfHash;
      }
      async recordAudit() {
      }
      async prepareTransaction(input) {
        const existing = [...this.transactions.values()].find((tx2) => tx2.accountId === input.accountId && tx2.intentType === input.intentType && tx2.idempotencyKey === input.idempotencyKey);
        if (existing) return structuredClone(existing);
        const tx = { id: `txj_${randomUUID4()}`, state: "PREPARED", createdAt: (/* @__PURE__ */ new Date()).toISOString(), ...input };
        this.transactions.set(tx.id, tx);
        return structuredClone(tx);
      }
      async updateTransaction({ id: id2, accountId, eventId, fromState, toState, evidence = {} }) {
        const tx = this.transactions.get(id2);
        if (!tx || tx.accountId !== accountId || tx.state !== fromState) throw new Error("TRANSACTION_STATE_CONFLICT");
        tx.appliedEvents ??= /* @__PURE__ */ new Map();
        if (tx.appliedEvents.has(eventId)) return structuredClone(tx);
        if (fromState === toState) throw new Error("TRANSACTION_DUPLICATE_STATE");
        tx.state = toState;
        Object.assign(tx, evidence);
        tx.appliedEvents.set(eventId, true);
        const result = { ...tx };
        delete result.appliedEvents;
        return structuredClone(result);
      }
      async transaction(id2, accountId, chainId = null) {
        const tx = this.transactions.get(id2);
        return tx?.accountId === accountId && (chainId == null || Number(tx.chainId) === Number(chainId)) ? structuredClone(tx) : null;
      }
      async discover() {
        return structuredClone(this.projects.filter((project) => project.status === "PUBLISHED"));
      }
      async projectBySlug(slug) {
        return structuredClone(this.projects.find((project) => project.slug === slug) ?? null);
      }
      async projectByEditionAddress(address2) {
        const target = String(address2 || "").toLowerCase();
        const edition = this.editions.find((item) => String(item.editionAddress ?? item.edition_address ?? "").toLowerCase() === target);
        if (!edition) return null;
        const project = this.projects.find((item) => item.id === (edition.projectId ?? edition.project_id) && item.status === "PUBLISHED");
        if (!project) return null;
        return structuredClone({ ...project, editions: this.editions.filter((item) => (item.projectId ?? item.project_id) === project.id) });
      }
      async editionByAddress(address2) {
        return structuredClone(this.editions.find((edition) => edition.editionAddress === address2.toLowerCase()) ?? null);
      }
      async pass(edition, tokenId) {
        return structuredClone(this.passes.find((pass) => pass.editionAddress === edition.toLowerCase() && String(pass.tokenId) === String(tokenId)) ?? null);
      }
      async listings() {
        return structuredClone(this.listingRows.filter((listing) => listing.status === "ACTIVE"));
      }
      async storeSignedOrder(input) {
        this.signedOrders.set(input.orderHash.toLowerCase(), structuredClone(input));
        return structuredClone(input);
      }
      async signedOrder(orderHash) {
        const signed = this.signedOrders.get(orderHash.toLowerCase());
        if (!signed) return null;
        const listing = this.listingRows.find((item) => item.order_hash?.toLowerCase() === orderHash.toLowerCase() || item.orderHash?.toLowerCase() === orderHash.toLowerCase());
        return structuredClone({ ...signed, status: listing?.status ?? "ACTIVE", expires_at: listing?.expires_at ?? listing?.expiresAt });
      }
      async listing(orderHash) {
        return structuredClone(this.listingRows.find((item) => item.order_hash?.toLowerCase() === orderHash.toLowerCase() || item.orderHash?.toLowerCase() === orderHash.toLowerCase()) ?? null);
      }
      async ownedPasses(address2) {
        return structuredClone(this.passes.filter((pass) => pass.ownerAddress === address2.toLowerCase()));
      }
      async advantagesForOwner(address2) {
        return structuredClone(this.passes.filter((pass) => pass.ownerAddress === address2.toLowerCase()).flatMap((pass) => pass.advantages ?? []));
      }
      _uniqueProfiles() {
        return [...new Map([...this.builderProfiles.values()].filter(Boolean).map((profile) => [profile.id, profile])).values()];
      }
      _membership(accountId, builderId) {
        return this.builderMemberships.find((membership) => membership.account_id === accountId && membership.builder_id === builderId) ?? null;
      }
      _builderForIdentifier(identifier) {
        const key = String(identifier ?? "");
        if (this.builders.has(key)) return this.builders.get(key);
        const directProfile = this.builderProfiles.get(key);
        if (directProfile?.builder_id && this.builders.has(directProfile.builder_id)) return this.builders.get(directProfile.builder_id);
        const profile = this._uniqueProfiles().find((candidate) => candidate.builder_id === key || candidate.id === key || candidate.account_id === key || candidate.wallet_address?.toLowerCase() === key.toLowerCase());
        if (profile?.builder_id && this.builders.has(profile.builder_id)) return this.builders.get(profile.builder_id);
        return [...this.builders.values()].find((builder) => builder.owner_account_id === key) ?? null;
      }
      _ensureBuilder(accountId, requestedBuilderId = null, { create = true } = {}) {
        const requested = requestedBuilderId == null ? "" : String(requestedBuilderId);
        if (requested) {
          const builder2 = this._builderForIdentifier(requested);
          if (!builder2 || !this._membership(accountId, builder2.id)) throw builderError2("BUILDER_NOT_AUTHORIZED");
          return builder2;
        }
        const existingMembership = this.builderMemberships.find((membership) => membership.account_id === accountId);
        if (existingMembership && this.builders.has(existingMembership.builder_id)) return this.builders.get(existingMembership.builder_id);
        const legacyProfile = this.builderProfiles.get(accountId);
        if (!create && !legacyProfile) return null;
        const id2 = legacyProfile?.builder_id ?? `bld_${hash3(accountId).slice(0, 24)}`;
        let builder = this.builders.get(id2);
        if (!builder) {
          builder = { id: id2, owner_account_id: accountId, created_at: legacyProfile?.created_at ?? (/* @__PURE__ */ new Date()).toISOString(), updated_at: (/* @__PURE__ */ new Date()).toISOString() };
          this.builders.set(id2, builder);
        }
        if (!this._membership(accountId, id2)) this.builderMemberships.push({ builder_id: id2, account_id: accountId, role: "OWNER", created_at: (/* @__PURE__ */ new Date()).toISOString() });
        return builder;
      }
      async listBuildersForAccount(accountId) {
        const memberships = this.builderMemberships.filter((membership) => membership.account_id === accountId);
        return structuredClone(memberships.map((membership) => {
          const builder = this.builders.get(membership.builder_id);
          const profile = this.builderProfiles.get(membership.builder_id) ?? this.builderProfiles.get(accountId) ?? null;
          return { id: builder?.id ?? membership.builder_id, builder_id: builder?.id ?? membership.builder_id, owner_account_id: builder?.owner_account_id ?? accountId, role: membership.role, profile };
        }));
      }
      async createBuilderIdentity(accountId, data = {}) {
        const id2 = `bld_${randomUUID4()}`;
        const now = (/* @__PURE__ */ new Date()).toISOString();
        const builder = { id: id2, owner_account_id: accountId, created_at: now, updated_at: now };
        this.builders.set(id2, builder);
        this.builderMemberships.push({ builder_id: id2, account_id: accountId, role: "OWNER", created_at: now });
        if (data.displayName || data.display_name || data.bio || data.about || data.links) await this.upsertBuilderProfile(accountId, data, { builderId: id2 });
        return structuredClone({ ...builder, profile: this.builderProfiles.get(id2) ?? null });
      }
      async recordPrimarySale(input) {
        let sale = calculatePrimarySale(input);
        if (!sale.builderId && sale.builderAccountId) {
          const builder = this._builderForIdentifier(sale.builderAccountId);
          if (builder) sale = { ...sale, builderId: builder.id };
        }
        const key = primarySaleEventKey(sale);
        const existing = this.primarySales.get(key);
        if (existing) {
          if (existing.grossAmountUsdg !== sale.grossAmountUsdg || existing.quantity !== sale.quantity || String(existing.editionId ?? "") !== String(sale.editionId ?? "")) throw new Error("PRIMARY_SALE_EVENT_CONFLICT");
          return structuredClone(existing);
        }
        this.primarySales.set(key, { id: `psa_${hash3(key).slice(0, 24)}`, ...sale });
        return structuredClone(this.primarySales.get(key));
      }
      async primarySalesForBuilder(builderIdentifier) {
        const builder = this._builderForIdentifier(builderIdentifier);
        const builderId = builder?.id ?? String(builderIdentifier);
        return structuredClone([...this.primarySales.values()].filter((sale) => sale.builderId === builderId || sale.builder_id === builderId));
      }
      async builderDashboard(accountId, { builderId = null } = {}) {
        const builder = this._ensureBuilder(accountId, builderId, { create: false });
        const canonicalBuilderId = builder?.id ?? null;
        const matches = (project) => canonicalBuilderId ? (project.builderId ?? project.builder_id ?? project.builderAccountId ?? project.builder_account_id) === canonicalBuilderId || !(project.builderId ?? project.builder_id) && (project.builderAccountId ?? project.builder_account_id) === accountId : (project.builderAccountId ?? project.builder_account_id) === accountId;
        const sales = canonicalBuilderId ? await this.primarySalesForBuilder(canonicalBuilderId) : [];
        const earnings = aggregatePrimarySales(sales);
        return {
          builder: builder ? structuredClone({ ...builder, profile: this.builderProfiles.get(builder.id) ?? this.builderProfiles.get(accountId) ?? null }) : null,
          projects: structuredClone(this.projects.filter(matches)),
          editions: [],
          royalties: [],
          referrals: [],
          primarySales: sales,
          earnings,
          activity: await this.getActivityByBuilder(canonicalBuilderId ?? accountId, { limit: 50 })
        };
      }
      async createProject({ accountId, builderId = null, body }) {
        const builder = this._ensureBuilder(accountId, builderId);
        const canonicalBuilderId = builder.id;
        const draftId = body.launchDraft?.draftId ?? body.draftId ?? null;
        const status = body.status ?? body.launchDraft?.status ?? "DRAFT";
        const existing = this.projects.find(
          (project2) => (project2.builderId ?? project2.builder_id ?? project2.builderAccountId ?? project2.builder_account_id) === canonicalBuilderId && (draftId && (project2.content?.draftId === draftId || project2.launchDraft?.draftId === draftId) || project2.slug === body.slug)
        );
        if (existing) {
          existing.name = body.name;
          existing.summary = body.summary ?? "";
          existing.content = structuredClone(body.launchDraft ?? {});
          existing.launchDraft = structuredClone(body.launchDraft ?? {});
          existing.status = status;
          existing.builderId = canonicalBuilderId;
          existing.builder_id = canonicalBuilderId;
          existing.builderAccountId = accountId;
          existing.builder_account_id = accountId;
          if (status === "PUBLISHED") existing.publishedAt ??= (/* @__PURE__ */ new Date()).toISOString();
          existing.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
          return structuredClone(existing);
        }
        const slugConflict = this.projects.find((project2) => project2.slug === body.slug && (project2.builderId ?? project2.builder_id ?? project2.builderAccountId ?? project2.builder_account_id) !== canonicalBuilderId);
        if (slugConflict) {
          throw Object.assign(new Error("SLUG_ALREADY_TAKEN"), { status: 409 });
        }
        const id2 = `prj_${randomUUID4()}`;
        const project = {
          id: id2,
          builderId: canonicalBuilderId,
          builder_id: canonicalBuilderId,
          builderAccountId: accountId,
          builder_account_id: accountId,
          slug: body.slug,
          name: body.name,
          summary: body.summary ?? "",
          content: structuredClone(body.launchDraft ?? {}),
          launchDraft: structuredClone(body.launchDraft ?? {}),
          status,
          publishedAt: status === "PUBLISHED" ? (/* @__PURE__ */ new Date()).toISOString() : null,
          createdAt: (/* @__PURE__ */ new Date()).toISOString(),
          updatedAt: (/* @__PURE__ */ new Date()).toISOString()
        };
        this.projects.push(project);
        return structuredClone(project);
      }
      async linkEditionToProject({ accountId, builderId = null, projectId, edition }) {
        const builder = this._ensureBuilder(accountId, builderId, { create: false });
        if (!builder) throw builderError2("BUILDER_NOT_AUTHORIZED");
        const project = this.projects.find((row2) => row2.id === projectId && (row2.builderId ?? row2.builder_id ?? row2.builderAccountId ?? row2.builder_account_id) === builder.id);
        if (!project) throw builderError2("PROJECT_BUILDER_MISMATCH");
        if (!["DRAFT", "PUBLISHED"].includes(String(project.status).toUpperCase())) throw Object.assign(new Error("PROJECT_NOT_PUBLISHABLE"), { status: 409 });
        const address2 = String(edition?.edition ?? edition?.editionAddress ?? "").toLowerCase();
        const existing = this.editions.find((row2) => String(row2.editionAddress ?? row2.edition_address ?? "").toLowerCase() === address2);
        if (existing?.projectId && existing.projectId !== project.id) throw Object.assign(new Error("EDITION_ALREADY_LINKED"), { status: 409 });
        const row = existing ?? { id: `ed_${hash3(`${Number(edition.chainId)}:${address2}`).slice(0, 24)}` };
        Object.assign(row, { projectId: project.id, project_id: project.id, chainId: Number(edition.chainId), chain_id: Number(edition.chainId), editionAddress: address2, edition_address: address2, editionIdHash: String(edition.editionId).toLowerCase(), edition_id_hash: String(edition.editionId).toLowerCase(), factoryAddress: String(edition.factoryAddress).toLowerCase(), factory_address: String(edition.factoryAddress).toLowerCase(), publisherAddress: String(edition.publisher ?? edition.publisherAddress).toLowerCase(), publisher_address: String(edition.publisher ?? edition.publisherAddress).toLowerCase(), absoluteSupplyCap: Number(edition.absoluteSupplyCap), absolute_supply_cap: Number(edition.absoluteSupplyCap), artworkCommitment: String(edition.artworkCommitment).toLowerCase(), artwork_commitment: String(edition.artworkCommitment).toLowerCase(), sourceBlockNumber: Number(edition.blockNumber), source_block_number: Number(edition.blockNumber), sourceBlockHash: String(edition.blockHash).toLowerCase(), source_block_hash: String(edition.blockHash).toLowerCase(), sourceTxHash: String(edition.txHash).toLowerCase(), source_tx_hash: String(edition.txHash).toLowerCase(), sourceLogIndex: Number(edition.logIndex), source_log_index: Number(edition.logIndex), finalized: false });
        if (!existing) this.editions.push(row);
        return structuredClone(row);
      }
      async saveTermsCommitment(input) {
        const builder = this._ensureBuilder(input.builderAccountId, input.builderId ?? null);
        const value = { ...input, builderId: builder.id, builder_id: builder.id };
        this.termsCommitments.set(input.advantagesHash.toLowerCase(), structuredClone(value));
        return structuredClone(value);
      }
      async termsCommitmentsForEdition(editionAddress) {
        const wanted = String(editionAddress ?? "").toLowerCase();
        return structuredClone([...this.termsCommitments.values()].filter((row) => String(row.editionAddress ?? "").toLowerCase() === wanted));
      }
      async createMedia({ accountId, metadata }) {
        const existing = this.media.find((row2) => row2.ownerAccountId === accountId && row2.sha256 === metadata.sha256 && !row2.deletedAt);
        if (existing) return structuredClone(existing);
        const row = { id: `med_${randomUUID4()}`, ownerAccountId: accountId, ...metadata, uploadStatus: "PREPARED", uploadedAt: null, verifiedAt: null, width: null, height: null, publicUrl: null, createdAt: (/* @__PURE__ */ new Date()).toISOString(), deletedAt: null };
        this.media.push(row);
        return structuredClone(row);
      }
      async mediaById(id2) {
        return structuredClone(this.media.find((row) => row.id === id2 && !row.deletedAt) ?? null);
      }
      async mediaByIds(ids2) {
        const wanted = new Set(ids2);
        return structuredClone(this.media.filter((row) => wanted.has(row.id) && !row.deletedAt));
      }
      async approveMedia({ id: id2, accountId, publicUrl, width, height, mimeType, byteSize, sha256: sha2565 }) {
        const row = this.media.find((item) => item.id === id2 && item.ownerAccountId === accountId && !item.deletedAt);
        if (!row) return null;
        Object.assign(row, { publicUrl, width, height, mimeType, byteSize, sha256: sha2565, safetyStatus: "APPROVED", uploadStatus: "UPLOADED", uploadedAt: (/* @__PURE__ */ new Date()).toISOString(), verifiedAt: (/* @__PURE__ */ new Date()).toISOString() });
        return structuredClone(row);
      }
      // --- Social layer ---
      async getBuilderProfile(identifier) {
        let profile = this.builderProfiles.get(identifier) ?? null;
        const session = [...this.sessions.values()].find((s) => s.walletAddress?.toLowerCase() === String(identifier ?? "").toLowerCase());
        const builder = this._builderForIdentifier(identifier) ?? (session ? this._builderForIdentifier(session.accountId) : null);
        if (!profile && builder) profile = this.builderProfiles.get(builder.id) ?? this.builderProfiles.get(builder.owner_account_id) ?? null;
        if (!profile) profile = this._uniqueProfiles().find((p) => p.account_id === identifier || p.id === identifier || p.builder_id === identifier || p.wallet_address?.toLowerCase() === String(identifier ?? "").toLowerCase()) ?? null;
        if (!profile) return null;
        const ownerSession = [...this.sessions.values()].find((s) => s.accountId === profile.account_id);
        const wallet_address = ownerSession?.walletAddress ?? profile.wallet_address ?? "0x0000000000000000000000000000000000000000";
        const joined_at = profile.created_at;
        const canonicalBuilderId = profile.builder_id ?? builder?.id ?? profile.account_id;
        const projectIds = this.projects.filter((p) => (p.builderId ?? p.builder_id) === canonicalBuilderId || !(p.builderId ?? p.builder_id) && (p.builderAccountId ?? p.builder_account_id) === profile.account_id).map((p) => p.id);
        const editions = this.editions.filter((e) => projectIds.includes(e.projectId ?? e.project_id));
        const passes = this.passes.filter((p) => editions.some((e) => (e.editionAddress ?? e.edition_address)?.toLowerCase() === p.editionAddress?.toLowerCase()));
        const sales = [...this.primarySales.values()].filter((sale) => sale.builderId === canonicalBuilderId || sale.builder_id === canonicalBuilderId);
        const earnings = aggregatePrimarySales(sales);
        const activeHolders = new Set(passes.map((p) => p.ownerAddress?.toLowerCase())).size;
        const stats = {
          editionsCount: editions.length,
          passesIssued: passes.length,
          activeHolders,
          totalVolumeUsdg: earnings.grossAmountUsdg
        };
        const followerCount = this.builderFollows.filter((f) => f.builder_account_id === canonicalBuilderId || f.builder_id === canonicalBuilderId).length;
        return structuredClone({ ...profile, builder_id: canonicalBuilderId, wallet_address, joined_at, stats, followerCount, editions });
      }
      async upsertBuilderProfile(accountId, data, { builderId = null } = {}) {
        const builder = this._ensureBuilder(accountId, builderId);
        const existing = this.builderProfiles.get(builder.id) ?? (builderId ? null : this.builderProfiles.get(accountId));
        const profile = {
          id: existing?.id ?? `bprf_${randomUUID4()}`,
          account_id: accountId,
          builder_id: builder.id,
          display_name: data.displayName ?? existing?.display_name ?? "",
          bio: data.bio ?? existing?.bio ?? "",
          about: data.about ?? existing?.about ?? "",
          avatar_url: data.avatarUrl ?? existing?.avatar_url ?? "",
          category: data.category ?? existing?.category ?? "",
          links: data.links ?? existing?.links ?? {},
          featured: existing?.featured ?? false,
          created_at: existing?.created_at ?? (/* @__PURE__ */ new Date()).toISOString(),
          updated_at: (/* @__PURE__ */ new Date()).toISOString()
        };
        this.builderProfiles.set(builder.id, profile);
        if (!builderId && !this.builderProfiles.has(accountId)) this.builderProfiles.set(accountId, profile);
        return structuredClone(profile);
      }
      async followBuilder(followerAccountId, builderAccountId) {
        const builder = this._ensureBuilder(builderAccountId, null, { create: true });
        if (builder.owner_account_id === followerAccountId) throw Object.assign(new Error("SELF_FOLLOW_REJECTED"), { status: 400 });
        const canonicalBuilderId = builder.id;
        const exists2 = this.builderFollows.find((f) => f.follower_account_id === followerAccountId && f.builder_account_id === canonicalBuilderId);
        if (!exists2) this.builderFollows.push({ id: `bfl_${randomUUID4()}`, follower_account_id: followerAccountId, builder_account_id: builder.owner_account_id, builder_id: canonicalBuilderId, created_at: (/* @__PURE__ */ new Date()).toISOString() });
        const followerCount = this.builderFollows.filter((f) => f.builder_account_id === canonicalBuilderId || f.builder_id === canonicalBuilderId).length;
        return { followed: true, followerCount };
      }
      async unfollowBuilder(followerAccountId, builderAccountId) {
        const builder = this._builderForIdentifier(builderAccountId);
        const canonicalBuilderId = builder?.id ?? builderAccountId;
        this.builderFollows = this.builderFollows.filter((f) => !(f.follower_account_id === followerAccountId && (f.builder_account_id === canonicalBuilderId || f.builder_id === canonicalBuilderId)));
        const followerCount = this.builderFollows.filter((f) => f.builder_account_id === canonicalBuilderId || f.builder_id === canonicalBuilderId).length;
        return { unfollowed: true, followerCount };
      }
      async getFollowStatus(followerAccountId, builderAccountId) {
        const builder = this._builderForIdentifier(builderAccountId);
        const canonicalBuilderId = builder?.id ?? builderAccountId;
        const isFollowing = this.builderFollows.some((f) => f.follower_account_id === followerAccountId && (f.builder_account_id === canonicalBuilderId || f.builder_id === canonicalBuilderId));
        const followerCount = this.builderFollows.filter((f) => f.builder_account_id === canonicalBuilderId || f.builder_id === canonicalBuilderId).length;
        const builderProjectIds = this.projects.filter((p) => (p.builderId ?? p.builder_id) === canonicalBuilderId || !(p.builderId ?? p.builder_id) && (p.builderAccountId ?? p.builder_account_id) === builderAccountId).map((p) => p.id);
        const isHolder = this.passes.some((pass) => {
          const ownerSessions = [...this.sessions.values()].filter((s) => s.accountId === followerAccountId);
          const ownerAddresses = ownerSessions.map((s) => s.walletAddress?.toLowerCase());
          return ownerAddresses.includes(pass.ownerAddress?.toLowerCase()) && builderProjectIds.length > 0;
        });
        return { isFollowing, followerCount, isHolder };
      }
      async getFollowedBuilders(accountId) {
        const follows = this.builderFollows.filter((f) => f.follower_account_id === accountId);
        return structuredClone(follows.map((f) => ({ builderAccountId: f.builder_account_id, builderId: f.builder_id ?? f.builder_account_id, followedAt: f.created_at, profile: this.builderProfiles.get(f.builder_id ?? f.builder_account_id) ?? null })));
      }
      async watchProject(accountId, slug) {
        const project = this.projects.find((p) => p.slug === slug);
        if (!project) throw Object.assign(new Error("PROJECT_NOT_FOUND"), { status: 404 });
        const exists2 = this.projectWatchlist.find((w) => w.account_id === accountId && w.project_id === project.id);
        if (!exists2) this.projectWatchlist.push({ id: `pwl_${randomUUID4()}`, account_id: accountId, project_id: project.id, created_at: (/* @__PURE__ */ new Date()).toISOString() });
        const watcherCount = this.projectWatchlist.filter((w) => w.project_id === project.id).length;
        return { watching: true, watcherCount };
      }
      async unwatchProject(accountId, slug) {
        const project = this.projects.find((p) => p.slug === slug);
        if (!project) throw Object.assign(new Error("PROJECT_NOT_FOUND"), { status: 404 });
        this.projectWatchlist = this.projectWatchlist.filter((w) => !(w.account_id === accountId && w.project_id === project.id));
        const watcherCount = this.projectWatchlist.filter((w) => w.project_id === project.id).length;
        return { unwatched: true, watcherCount };
      }
      async getWatchlist(accountId) {
        const entries = this.projectWatchlist.filter((w) => w.account_id === accountId);
        return structuredClone(entries.map((w) => {
          const project = this.projects.find((p) => p.id === w.project_id);
          const watcherCount = this.projectWatchlist.filter((x) => x.project_id === w.project_id).length;
          return { ...w, slug: project?.slug, name: project?.name, summary: project?.summary, watcherCount };
        }));
      }
      async createMilestone(builderAccountId, payload) {
        const builder = this._ensureBuilder(builderAccountId);
        const canonicalBuilderId = builder.id;
        if (!payload.title?.trim()) throw Object.assign(new Error("MILESTONE_TITLE_REQUIRED"), { status: 400 });
        if (!payload.content?.trim()) throw Object.assign(new Error("MILESTONE_CONTENT_REQUIRED"), { status: 400 });
        const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1e3;
        const recent = this.builderMilestones.find((m) => (m.builder_id ?? m.builder_account_id) === canonicalBuilderId && (m.project_id ?? null) === (payload.projectId ?? null) && new Date(m.created_at).getTime() > weekAgo);
        if (recent) throw Object.assign(new Error("MILESTONE_CADENCE_EXCEEDED"), { status: 429 });
        const milestone = { id: `bms_${randomUUID4()}`, builder_account_id: builder.owner_account_id, builder_id: canonicalBuilderId, project_id: payload.projectId ?? null, title: payload.title.trim(), content: payload.content.trim(), links: payload.links ?? [], created_at: (/* @__PURE__ */ new Date()).toISOString() };
        this.builderMilestones.push(milestone);
        return structuredClone(milestone);
      }
      async getMilestonesByBuilder(builderAccountId, { limit = 20 } = {}) {
        const builder = this._builderForIdentifier(builderAccountId);
        const canonicalBuilderId = builder?.id ?? builderAccountId;
        return structuredClone(this.builderMilestones.filter((m) => (m.builder_id ?? m.builder_account_id) === canonicalBuilderId).sort((a, b2) => new Date(b2.created_at) - new Date(a.created_at)).slice(0, limit));
      }
      async createQuestion(askerAccountId, builderAccountId, payload) {
        const builder = this._builderForIdentifier(builderAccountId);
        const canonicalBuilderId = builder?.id ?? builderAccountId;
        const question = String(payload.question ?? payload.content ?? "").trim().slice(0, 800);
        if (question.length < 3) throw Object.assign(new Error("QUESTION_REQUIRED"), { status: 400 });
        const row = { id: `bq_${randomUUID4()}`, builder_account_id: builder?.owner_account_id ?? builderAccountId, builder_id: canonicalBuilderId, asker_account_id: askerAccountId, question, answer: "", answered_at: null, created_at: (/* @__PURE__ */ new Date()).toISOString() };
        this.builderQuestions.push(row);
        return structuredClone(row);
      }
      async answerQuestion(builderAccountId, questionId, payload) {
        const builder = this._builderForIdentifier(builderAccountId);
        const canonicalBuilderId = builder?.id ?? builderAccountId;
        if (!builder || builder.owner_account_id !== builderAccountId) throw Object.assign(new Error("QUESTION_NOT_FOUND"), { status: 404 });
        const row = this.builderQuestions.find((question) => question.id === questionId && (question.builder_id ?? question.builder_account_id) === canonicalBuilderId);
        if (!row) throw Object.assign(new Error("QUESTION_NOT_FOUND"), { status: 404 });
        const answer = String(payload.answer ?? payload.content ?? "").trim().slice(0, 1200);
        if (answer.length < 1) throw Object.assign(new Error("ANSWER_REQUIRED"), { status: 400 });
        row.answer = answer;
        row.answered_at = (/* @__PURE__ */ new Date()).toISOString();
        return structuredClone(row);
      }
      async getQuestionsByBuilder(builderAccountId, { limit = 50 } = {}) {
        const builder = this._builderForIdentifier(builderAccountId);
        const canonicalBuilderId = builder?.id ?? builderAccountId;
        return structuredClone(this.builderQuestions.filter((question) => (question.builder_id ?? question.builder_account_id) === canonicalBuilderId).sort((a, b2) => new Date(b2.created_at) - new Date(a.created_at)).slice(0, limit));
      }
      async getActivityByBuilder(builderAccountId, { limit = 20 } = {}) {
        const builder = this._builderForIdentifier(builderAccountId);
        const canonicalBuilderId = builder?.id ?? builderAccountId;
        const milestones = this.builderMilestones.filter((m) => (m.builder_id ?? m.builder_account_id) === canonicalBuilderId).map((m) => ({
          id: m.id,
          type: "MILESTONE",
          title: m.title,
          content: m.content,
          links: m.links,
          created_at: m.created_at
        }));
        const projectIds = this.projects.filter((p) => (p.builderId ?? p.builder_id) === canonicalBuilderId || !(p.builderId ?? p.builder_id) && (p.builderAccountId ?? p.builder_account_id) === (builder?.owner_account_id ?? builderAccountId)).map((p) => p.id);
        const editions = this.editions.filter((e) => projectIds.includes(e.projectId ?? e.project_id));
        const debuts = editions.map((e) => {
          const prj = this.projects.find((p) => p.id === (e.projectId ?? e.project_id));
          return {
            id: `act_${e.id}`,
            type: "NEW_DEBUT",
            title: `New Debut: ${prj?.name ?? "Edition"}`,
            content: `Launched edition with supply cap of ${e.absoluteSupplyCap ?? e.absolute_supply_cap ?? 555}.`,
            created_at: e.createdAt ?? e.created_at ?? (/* @__PURE__ */ new Date()).toISOString()
          };
        });
        const sales = this.listingRows.filter((l) => l.status === "FILLED" && editions.some((e) => (e.editionAddress ?? e.edition_address)?.toLowerCase() === (l.editionAddress ?? l.edition_address)?.toLowerCase())).map((l) => ({
          id: `sale_${l.orderHash ?? l.order_hash}`,
          type: "SECONDARY_SALE",
          title: `Pass #${l.tokenId ?? l.token_id} Sold`,
          content: `Sold for ${l.priceUsdg ?? l.price_usdg ?? 0} USDG on secondary market.`,
          created_at: l.updatedAt ?? l.updated_at ?? (/* @__PURE__ */ new Date()).toISOString()
        }));
        const holders = this.passes.filter((p) => editions.some((e) => (e.editionAddress ?? e.edition_address)?.toLowerCase() === p.editionAddress?.toLowerCase())).map((p) => ({
          id: `holder_${p.editionAddress}_${p.tokenId}`,
          type: "NEW_HOLDER",
          title: `New Holder for #${p.tokenId}`,
          content: `Pass acquired by ${p.ownerAddress?.slice(0, 6)}...${p.ownerAddress?.slice(-4)}`,
          created_at: p.updatedAt ?? p.mintedAt ?? (/* @__PURE__ */ new Date()).toISOString()
        }));
        const all = [...milestones, ...debuts, ...sales, ...holders].sort((a, b2) => new Date(b2.created_at) - new Date(a.created_at)).slice(0, limit);
        return structuredClone(all);
      }
      async getFeed(accountId, { limit = 50 } = {}) {
        const followedIds = this.builderFollows.filter((f) => f.follower_account_id === accountId).map((f) => f.builder_id ?? f.builder_account_id);
        const userSessions = [...this.sessions.values()].filter((s) => s.accountId === accountId);
        const userAddresses = userSessions.map((s) => s.walletAddress?.toLowerCase());
        const heldPasses = this.passes.filter((p) => userAddresses.includes(p.ownerAddress?.toLowerCase()));
        const heldEditionAddresses = heldPasses.map((p) => p.editionAddress?.toLowerCase());
        const heldProjects = this.projects.filter((prj) => {
          const prjEditions = this.editions.filter((e) => (e.projectId ?? e.project_id) === prj.id);
          return prjEditions.some((e) => heldEditionAddresses.includes((e.editionAddress ?? e.edition_address)?.toLowerCase()));
        });
        const heldBuilderIds = heldProjects.map((prj) => prj.builderId ?? prj.builder_id ?? prj.builderAccountId ?? prj.builder_account_id);
        const relevantBuilderIds = [.../* @__PURE__ */ new Set([...followedIds, ...heldBuilderIds])];
        const milestones = this.builderMilestones.filter((m) => relevantBuilderIds.includes(m.builder_id ?? m.builder_account_id)).map((m) => ({
          ...m,
          type: "MILESTONE",
          builderProfile: this.builderProfiles.get(m.builder_id ?? m.builder_account_id) ?? null
        }));
        const debuts = this.editions.filter((e) => {
          const prj = this.projects.find((p) => p.id === (e.projectId ?? e.project_id));
          return prj && relevantBuilderIds.includes(prj.builderId ?? prj.builder_id ?? prj.builderAccountId ?? prj.builder_account_id);
        }).map((e) => {
          const prj = this.projects.find((p) => p.id === (e.projectId ?? e.project_id));
          return {
            id: `debut_${e.id}`,
            type: "NEW_DEBUT",
            builder_account_id: prj?.builderAccountId ?? prj?.builder_account_id,
            builder_id: prj?.builderId ?? prj?.builder_id,
            title: `New Debut: ${prj?.name ?? "Edition"}`,
            content: prj?.summary ?? "New pass edition debuted.",
            created_at: e.createdAt ?? e.created_at ?? (/* @__PURE__ */ new Date()).toISOString(),
            builderProfile: this.builderProfiles.get(prj?.builderId ?? prj?.builder_id) ?? this.builderProfiles.get(prj?.builderAccountId ?? prj?.builder_account_id) ?? null
          };
        });
        const feed = [...milestones, ...debuts].sort((a, b2) => new Date(b2.created_at) - new Date(a.created_at)).slice(0, limit);
        return structuredClone(feed);
      }
      async getHolders(editionAddress, { limit = 100 } = {}) {
        const passes = this.passes.filter((p) => p.editionAddress?.toLowerCase() === editionAddress.toLowerCase());
        return structuredClone(passes.sort((a, b2) => Number(a.tokenId) - Number(b2.tokenId)).slice(0, limit).map((p) => ({
          owner_address: p.ownerAddress,
          token_id: p.tokenId,
          held_since: p.updatedAt ?? p.mintedAt ?? (/* @__PURE__ */ new Date()).toISOString(),
          minted_block_number: p.mintedBlockNumber ?? 0
        })));
      }
      async getPlatformStats() {
        const passesIssued = this.passes.length;
        const activeHolders = new Set(this.passes.map((p) => p.ownerAddress?.toLowerCase())).size;
        const filled = this.listingRows.filter((l) => l.status === "FILLED");
        const totalVolumeUsdg = filled.reduce((sum, l) => sum + Number(l.price_usdg ?? l.priceUsdg ?? 0), 0).toString();
        return { passesIssued, activeHolders, totalVolumeUsdg };
      }
      async getWatchlistCount(projectIdOrSlug) {
        const project = this.projects.find((p) => p.id === projectIdOrSlug || p.slug === projectIdOrSlug);
        const id2 = project ? project.id : projectIdOrSlug;
        return this.projectWatchlist.filter((w) => w.project_id === id2).length;
      }
      async getFeaturedBuilders({ limit = 4 } = {}) {
        const featured = this._uniqueProfiles().filter((p) => p.featured).slice(0, limit);
        return structuredClone(featured.map((profile) => {
          const builderId = profile.builder_id ?? profile.account_id;
          const project = this.projects.find((p) => (p.builderId ?? p.builder_id) === builderId || !(p.builderId ?? p.builder_id) && (p.builderAccountId ?? p.builder_account_id) === profile.account_id);
          const projectIds = this.projects.filter((p) => (p.builderId ?? p.builder_id) === builderId || !(p.builderId ?? p.builder_id) && (p.builderAccountId ?? p.builder_account_id) === profile.account_id).map((p) => p.id);
          const editions = this.editions.filter((e) => projectIds.includes(e.projectId ?? e.project_id));
          const latestEdition = editions[0];
          const editionAddresses = new Set(editions.map((e) => String(e.editionAddress ?? e.edition_address ?? "").toLowerCase()).filter(Boolean));
          const passesIssued = editionAddresses.size ? this.passes.filter((p) => editionAddresses.has(String(p.editionAddress ?? p.edition_address ?? "").toLowerCase())).length : projectIds.length ? this.passes.length : 0;
          const earnings = aggregatePrimarySales([...this.primarySales.values()].filter((sale) => sale.builderId === builderId));
          return {
            ...profile,
            builder_id: builderId,
            editionsCount: editions.length,
            passesIssued,
            supplyCap: latestEdition?.absoluteSupplyCap ?? latestEdition?.absolute_supply_cap ?? null,
            priceUsdg: latestEdition?.priceUsdg ?? latestEdition?.price_usdg ?? null,
            totalVolumeUsdg: earnings.grossAmountUsdg,
            advantageSummary: latestEdition?.advantageSummary ?? null,
            projectSlug: project?.slug ?? null
          };
        }));
      }
    };
  }
});

// apps/api/src/server.mjs
import http from "node:http";
import { createHash as createHash5, randomBytes as randomBytes5, randomUUID as randomUUID3 } from "node:crypto";
init_lib();
import { pathToFileURL } from "node:url";

// packages/auth/src/wallet-challenge.mjs
init_lib();
import { randomBytes as randomBytes3, timingSafeEqual } from "node:crypto";
function issueWalletChallenge({ accountId, address: address2, origin, chainId = 4663, ttlSeconds = 300, now = Date.now() }) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address2)) throw new Error("Invalid EVM address");
  if (!origin) throw new Error("origin required");
  if (![4663, 46630, 8453, 84532].includes(Number(chainId))) throw new Error("Supported EVM chain required");
  const url = new URL(origin);
  if (url.protocol !== "https:" && url.hostname !== "localhost") throw new Error("secure origin required");
  const nonce = randomBytes3(32).toString("hex");
  const expiresAt = now + ttlSeconds * 1e3;
  const message = [
    `${url.host} wants you to sign in with your Ethereum account:`,
    getAddress(address2),
    "",
    "Sign in to NexMarkets. This request does not submit a transaction.",
    "",
    `URI: ${url.origin}`,
    "Version: 1",
    `Chain ID: ${chainId}`,
    `Nonce: ${nonce}`,
    `Issued At: ${new Date(now).toISOString()}`,
    `Expiration Time: ${new Date(expiresAt).toISOString()}`,
    `Request ID: ${accountId}`
  ].join("\n");
  return { accountId, address: getAddress(address2).toLowerCase(), nonce, origin: url.origin, domain: url.host, chainId, message, issuedAt: now, expiresAt, consumedAt: null };
}
function assertChallengeUsable(challenge, { accountId, address: address2, origin, chainId = challenge.chainId, now = Date.now() }) {
  if (challenge.consumedAt) throw new Error("Wallet challenge already consumed");
  if (now > challenge.expiresAt) throw new Error("Wallet challenge expired");
  if (challenge.accountId !== accountId) throw new Error("Wallet challenge account mismatch");
  if (challenge.origin !== new URL(origin).origin) throw new Error("Wallet challenge origin mismatch");
  if (challenge.chainId !== chainId) throw new Error("Wallet challenge chain mismatch");
  const a = Buffer.from(challenge.address);
  const b2 = Buffer.from(address2.toLowerCase());
  if (a.length !== b2.length || !timingSafeEqual(a, b2)) throw new Error("Wallet challenge address mismatch");
  return true;
}
function verifyWalletChallengeSignature(challenge, signature) {
  if (typeof signature !== "string" || !signature.startsWith("0x")) throw new Error("signature required");
  const recovered = verifyMessage(challenge.message, signature).toLowerCase();
  if (recovered !== challenge.address) throw new Error("Wallet signature mismatch");
  return recovered;
}

// packages/auth/src/session.mjs
import { createHash, randomBytes as randomBytes4, timingSafeEqual as timingSafeEqual2 } from "node:crypto";
function hash2(value) {
  return createHash("sha256").update(value).digest("hex");
}
function issueSession({ accountId, walletId, ttlSeconds = 60 * 60 * 24 * 7, now = Date.now() }) {
  if (!accountId || !walletId) throw new Error("session identity required");
  const token = randomBytes4(32).toString("base64url");
  const csrfToken = randomBytes4(32).toString("base64url");
  return {
    record: {
      id: `ses_${randomBytes4(16).toString("hex")}`,
      accountId,
      walletId,
      tokenHash: hash2(token),
      csrfHash: hash2(csrfToken),
      expiresAt: now + ttlSeconds * 1e3,
      revokedAt: null
    },
    token,
    csrfToken
  };
}
function assertSession(session, token, { csrfToken, mutation = false, now = Date.now() } = {}) {
  if (!session || session.revokedAt || now >= session.expiresAt) throw new Error("SESSION_INVALID");
  const expected = Buffer.from(session.tokenHash, "hex");
  const actual = Buffer.from(hash2(token), "hex");
  if (expected.length !== actual.length || !timingSafeEqual2(expected, actual)) throw new Error("SESSION_INVALID");
  if (mutation) {
    const expectedCsrf = Buffer.from(session.csrfHash, "hex");
    const actualCsrf = Buffer.from(hash2(csrfToken ?? ""), "hex");
    if (expectedCsrf.length !== actualCsrf.length || !timingSafeEqual2(expectedCsrf, actualCsrf)) throw new Error("CSRF_INVALID");
  }
  return true;
}
function sessionCookie(token, { secure = true, maxAge = 604800 } = {}) {
  return `nexmarkets_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}

// apps/api/src/server.mjs
init_src();
init_postgres_store();

// packages/observability/src/metrics.mjs
var VALID = /^[a-zA-Z_:][a-zA-Z0-9_:]*$/;
var MetricsRegistry = class {
  constructor() {
    this.values = /* @__PURE__ */ new Map();
  }
  increment(name, amount = 1) {
    if (!VALID.test(name)) throw new Error("invalid metric");
    this.values.set(name, (this.values.get(name) ?? 0) + amount);
  }
  set(name, value) {
    if (!VALID.test(name) || !Number.isFinite(value)) throw new Error("invalid metric");
    this.values.set(name, value);
  }
  get(name) {
    return this.values.get(name) ?? 0;
  }
  render() {
    return `${[...this.values.entries()].sort(([a], [b2]) => a.localeCompare(b2)).map(([name, value]) => `${name} ${value}`).join("\n")}
`;
  }
};
var REQUIRED_METRICS = Object.freeze([
  "nexmarkets_api_requests_total",
  "nexmarkets_api_failures_total",
  "nexmarkets_transactions_failed_total",
  "nexmarkets_indexer_latest_block",
  "nexmarkets_indexer_lag_blocks",
  "nexmarkets_reconciliation_errors_total",
  "nexmarkets_reconciliation_lag_seconds",
  "nexmarkets_outbox_retries_total",
  "nexmarkets_db_ready"
]);

// packages/chain/src/keccak.mjs
var MASK = (1n << 64n) - 1n;

// packages/chain/src/rpc.mjs
var JsonRpcClient = class {
  constructor(url, { timeoutMs = 12e3 } = {}) {
    this.url = url;
    this.timeoutMs = timeoutMs;
    this.id = 0;
  }
  async call(method, params = []) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(this.url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: ++this.id, method, params }), signal: controller.signal });
      if (!response.ok) throw new Error(`RPC HTTP ${response.status}`);
      const body = await response.json();
      if (body.error) throw new Error(`RPC ${method}: ${body.error.message || JSON.stringify(body.error)}`);
      return body.result;
    } finally {
      clearTimeout(timer);
    }
  }
  chainId() {
    return this.call("eth_chainId").then((x) => Number(BigInt(x)));
  }
  getBlockNumber() {
    return this.call("eth_blockNumber").then((value) => Number(BigInt(value)));
  }
  getBlockByNumber(blockNumber) {
    return this.call("eth_getBlockByNumber", [`0x${BigInt(blockNumber).toString(16)}`, false]);
  }
  getTransactionReceipt(txHash) {
    return this.call("eth_getTransactionReceipt", [txHash]);
  }
  getTransactionByHash(txHash) {
    return this.call("eth_getTransactionByHash", [txHash]);
  }
  getCode(address2, block = "latest") {
    return this.call("eth_getCode", [address2, block]);
  }
  getStorageAt(address2, slot, block = "latest") {
    return this.call("eth_getStorageAt", [address2, slot, block]);
  }
  ethCall(to, data, block = "latest") {
    return this.call("eth_call", [{ to, data }, block]);
  }
};

// packages/subgraph-client/src/index.mjs
var DEFAULT_TIMEOUT_MS = 1e4;
function asNumber(value, fallback = null) {
  const number2 = Number(value);
  return Number.isFinite(number2) ? number2 : fallback;
}
function lower(value) {
  return typeof value === "string" ? value.toLowerCase() : value;
}
function unix(value) {
  return value == null ? null : Number(value);
}
function advantageRemaining(advantage, now = Math.floor(Date.now() / 1e3)) {
  if (!advantage) return "0";
  const kind = String(advantage.kind ?? "").toUpperCase();
  const starts = unix(advantage.startsAt) ?? 0;
  const ends = unix(advantage.endsAt) ?? 0;
  const frozen = asNumber(advantage.frozenSeconds, 0);
  let effective = Math.max(0, now - frozen);
  if (kind === "TIME_BASED" && advantage.listed && advantage.listedAt != null) {
    const listed = (unix(advantage.listedAt) ?? 0) - frozen;
    if (listed < ends) {
      const freezeAt = Math.max(listed, starts);
      effective = effective < freezeAt ? effective : freezeAt;
    }
  }
  if (effective < starts || effective >= ends) return "0";
  if (kind === "TIME_BASED") return String(Math.max(0, ends - effective));
  if (kind === "CONNECTED") return "1";
  return String(advantage.remainingUnits ?? advantage.totalUnits ?? 0);
}
var SubgraphClient = class {
  constructor({ endpoint, fetchImpl = globalThis.fetch, timeoutMs = DEFAULT_TIMEOUT_MS, logger = console, certificationEditionAddress = null, certificationEditionName = null, protocolVersion = 1 } = {}) {
    this.endpoint = endpoint?.trim() || null;
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
    this.logger = logger;
    this.certificationEditionAddress = lower(certificationEditionAddress);
    this.certificationEditionName = certificationEditionName;
    this.protocolVersion = Number(protocolVersion);
  }
  get enabled() {
    return Boolean(this.endpoint);
  }
  async query(query, variables = {}, { cacheBust = false } = {}) {
    if (!this.endpoint) throw new Error("SUBGRAPH_ENDPOINT_REQUIRED");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const endpoint = cacheBust ? `${this.endpoint}${this.endpoint.includes("?") ? "&" : "?"}_nexmarkets_meta=${Date.now()}` : this.endpoint;
      const response = await this.fetchImpl(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json", "cache-control": cacheBust ? "no-cache" : "no-cache" },
        body: JSON.stringify({ query, variables }),
        signal: controller.signal
      });
      const body = await response.json();
      if (!response.ok) throw new Error(`SUBGRAPH_HTTP_${response.status}`);
      if (body.errors?.length) throw new Error(`SUBGRAPH_QUERY_ERROR:${body.errors[0].message}`);
      return body.data ?? {};
    } finally {
      clearTimeout(timer);
    }
  }
  async indexingStatus() {
    const data = await this.query("{ _meta { block { number hash } deployment } }", {}, { cacheBust: true });
    const block = data._meta?.block ?? {};
    return { indexedBlock: asNumber(block.number, 0), blockHash: lower(block.hash ?? null), deployment: data._meta?.deployment ?? null };
  }
  async discover({ first = 100 } = {}) {
    const accessFields = this.protocolVersion >= 2 ? " allowlistRoot allowlistEndsAt allowlistSupply" : "";
    const data = await this.query(`query($first:Int!){ editions(first:$first,orderBy:createdBlock,orderDirection:desc){ id address editionId publisher absoluteSupplyCap totalMinted disabled currentTerms { hash pricePerPass previewStartsAt mintStartsAt mintEndsAt${accessFields} } createdBlock createdTimestamp createdTx } }`, { first });
    return (data.editions ?? []).map((edition) => {
      const address2 = lower(edition.address);
      const name = address2 === this.certificationEditionAddress && this.certificationEditionName ? this.certificationEditionName : `NexPass Edition ${address2?.slice(0, 10) ?? ""}`;
      const currentTerms = normalizeTerms(edition.currentTerms ?? {});
      return {
        slug: address2,
        name,
        summary: `${edition.totalMinted ?? "0"}/${edition.absoluteSupplyCap ?? "0"} serials minted \xB7 ${edition.disabled ? "disabled" : "onchain"}`,
        status: edition.disabled ? "Disabled" : "Edition",
        edition_address: address2,
        edition_id: lower(edition.editionId),
        publisher: lower(edition.publisher),
        absolute_supply_cap: edition.absoluteSupplyCap,
        total_minted: edition.totalMinted,
        disabled: edition.disabled,
        active_terms_hash: lower(edition.currentTerms?.hash ?? null),
        price_usdg: edition.currentTerms?.pricePerPass ?? null,
        preview_starts_at: iso(currentTerms.previewStartsAt),
        mint_starts_at: iso(currentTerms.mintStartsAt),
        mint_ends_at: iso(currentTerms.mintEndsAt),
        created_block: edition.createdBlock,
        created_tx: lower(edition.createdTx)
      };
    });
  }
  async editionByAddress(address2) {
    const accessFields = this.protocolVersion >= 2 ? " allowlistRoot allowlistEndsAt allowlistSupply" : "";
    const data = await this.query(`query($address:Bytes!,$editionId:ID!){ editions(where:{address:$address}){ id address editionId publisher mintController absoluteSupplyCap artworkCommitment totalMinted disabled currentTerms { id hash version activeSupply pricePerPass previewStartsAt mintStartsAt mintEndsAt${accessFields} primaryRecipient royaltyReceiver royaltyBps advantagesHash referralTermsHash blockNumber timestamp transactionHash } terms(orderBy:version,orderDirection:desc){ id hash version activeSupply pricePerPass previewStartsAt mintStartsAt mintEndsAt${accessFields} primaryRecipient royaltyReceiver royaltyBps advantagesHash referralTermsHash } } advantageDefinitions(where:{edition:$editionId}){ termsHash advantageId kind startsAt endsAt totalUnits definitionHash } }`, { address: lower(address2), editionId: lower(address2) });
    const edition = data.editions?.[0];
    if (!edition) return null;
    const normalizedAddress = lower(edition.address);
    const normalizedTerms = (edition.terms ?? []).map(normalizeTerms);
    const currentTerms = edition.currentTerms ? normalizeTerms(edition.currentTerms) : null;
    const definitions = (data.advantageDefinitions ?? []).map((definition) => ({
      advantageId: lower(definition.advantageId),
      kind: { TIME_BASED: 0, QUANTITY_BASED: 1, CONNECTED: 2, REDEMPTION: 3 }[String(definition.kind).toUpperCase()] ?? definition.kind,
      startsAt: definition.startsAt,
      endsAt: definition.endsAt,
      totalUnits: definition.totalUnits,
      definitionHash: lower(definition.definitionHash),
      termsHash: lower(definition.termsHash)
    }));
    const withAdvantages = (terms) => terms ? {
      ...terms,
      advantageConfigs: definitions.filter((definition) => definition.termsHash === lower(terms.hash)).map(({ termsHash, ...definition }) => definition)
    } : terms;
    return {
      ...edition,
      id: normalizedAddress,
      name: normalizedAddress === this.certificationEditionAddress && this.certificationEditionName ? this.certificationEditionName : `NexPass Edition ${normalizedAddress.slice(0, 10)}`,
      address: normalizedAddress,
      edition_address: normalizedAddress,
      editionId: lower(edition.editionId),
      edition_id: lower(edition.editionId),
      publisher: lower(edition.publisher),
      mintController: lower(edition.mintController),
      artworkCommitment: lower(edition.artworkCommitment),
      absolute_supply_cap: edition.absoluteSupplyCap,
      currentTerms: withAdvantages(currentTerms),
      termsHistory: normalizedTerms.map(withAdvantages)
    };
  }
  async pass(edition, tokenId) {
    const id2 = `${lower(edition)}-${tokenId}`;
    const data = await this.query(`query($tokenId:BigInt!){ passes(where:{tokenId:$tokenId}){ id tokenId owner termsHash mintBlock mintTimestamp mintTransactionHash royaltyReceiver royaltyBps listed edition { address editionId publisher } advantages { id advantageId kind startsAt endsAt totalUnits remainingUnits frozenSeconds listed listedAt definitionHash termsHash } tba { account implementation registry } } }`, { tokenId: String(tokenId) });
    const pass = data.passes?.find((candidate) => String(candidate.id).toLowerCase() === id2.toLowerCase()) ?? data.passes?.[0] ?? null;
    if (!pass) return null;
    const owner = lower(pass.owner);
    const normalizedEdition = { ...pass.edition, address: lower(pass.edition.address), editionId: lower(pass.edition.editionId), publisher: lower(pass.edition.publisher) };
    const advantages = (pass.advantages ?? []).map((advantage) => {
      const remaining = advantageRemaining(advantage);
      return { ...advantage, advantageId: lower(advantage.advantageId), advantage_id_hash: lower(advantage.advantageId), termsHash: lower(advantage.termsHash), terms_hash: lower(advantage.termsHash), definitionHash: lower(advantage.definitionHash), definition_hash: lower(advantage.definitionHash), remainingUnits: advantage.remainingUnits, remaining_units: advantage.remainingUnits, userFacingRemaining: remaining, remaining, consumesOnchain: ["QUANTITY_BASED", "REDEMPTION"].includes(String(advantage.kind).toUpperCase()) };
    });
    const tba = pass.tba ? { ...pass.tba, account: lower(pass.tba.account), implementation: lower(pass.tba.implementation), registry: lower(pass.tba.registry) } : null;
    return {
      ...pass,
      token_id: pass.tokenId,
      owner,
      owner_address: owner,
      termsHash: lower(pass.termsHash),
      terms_hash: lower(pass.termsHash),
      edition: normalizedEdition,
      edition_address: normalizedEdition.address,
      name: normalizedEdition.address === this.certificationEditionAddress && this.certificationEditionName ? this.certificationEditionName : `NexPass Edition ${normalizedEdition.address.slice(0, 10)}`,
      advantages,
      tba,
      token_bound_account: tba?.account ?? null
    };
  }
  async listings({ first = 100, status = "ACTIVE" } = {}) {
    const data = await this.query(`query($first:Int!,$status:String!){ listings(first:$first,where:{status:$status},orderBy:createdBlock,orderDirection:desc){ id orderHash tokenId seller termsHash price royaltyReceiver royaltyBps startTime expiry zoneHash status buyer salePrice protocolFee builderRoyalty sellerProceeds edition { address editionId } } }`, { first, status });
    return (data.listings ?? []).map(normalizeListing);
  }
  async listing(orderHash) {
    const data = await this.query(`query($id:ID!){ listing(id:$id){ id orderHash tokenId seller termsHash price royaltyReceiver royaltyBps startTime expiry zoneHash status buyer salePrice protocolFee builderRoyalty sellerProceeds edition { address editionId } } }`, { id: lower(orderHash) });
    const listing = data.listing;
    if (!listing) return null;
    return normalizeListing(listing);
  }
};
function normalizeTerms(terms) {
  const previewStartsAt = unix(terms.previewStartsAt);
  const mintStartsAt = unix(terms.mintStartsAt);
  const mintEndsAt = unix(terms.mintEndsAt);
  const allowlistEndsAt = unix(terms.allowlistEndsAt);
  return { ...terms, hash: lower(terms.hash), primaryRecipient: lower(terms.primaryRecipient), royaltyReceiver: lower(terms.royaltyReceiver), advantagesHash: lower(terms.advantagesHash), referralTermsHash: lower(terms.referralTermsHash), allowlistRoot: lower(terms.allowlistRoot), previewStartsAt, mintStartsAt, mintEndsAt, allowlistEndsAt, price_usdg: terms.pricePerPass, preview_starts_at: iso(previewStartsAt), mint_starts_at: iso(mintStartsAt), mint_ends_at: iso(mintEndsAt), allowlist_root: lower(terms.allowlistRoot), allowlist_ends_at: iso(allowlistEndsAt), allowlist_supply: terms.allowlistSupply, terms_hash: lower(terms.hash), primary_recipient: lower(terms.primaryRecipient), royalty_receiver: lower(terms.royaltyReceiver), royalty_bps: terms.royaltyBps, advantages_hash: lower(terms.advantagesHash), referral_terms_hash: lower(terms.referralTermsHash) };
}
function iso(value) {
  return value == null ? null : new Date(Number(value) * 1e3).toISOString();
}
function normalizeListing(listing) {
  return { ...listing, order_hash: lower(listing.orderHash), edition_address: lower(listing.edition.address), token_id: listing.tokenId, seller_address: lower(listing.seller), terms_hash: lower(listing.termsHash), price_usdg: listing.price, royalty_receiver: lower(listing.royaltyReceiver), royalty_bps: listing.royaltyBps, starts_at: unix(listing.startTime), expires_at: unix(listing.expiry), zone_hash: lower(listing.zoneHash), buyer: lower(listing.buyer) };
}

// packages/config/src/networks.mjs
var PRODUCT_AUTHORITY = Object.freeze({
  file: "NEXMARKETS_V2_BUILDER_PROFILE_ELITE.html",
  sha256: "4863df4a8829b6ced1672248e1fd0336e577d6c13c80f1dbd7fe99d73bc821d5"
});
var PRIMITIVES = Object.freeze({
  seaport16: "0x0000000000000068F116a894984e2DB1123eB395",
  conduitController: "0x00000000F9490004C11Cef243f5400493c00Ad63",
  erc6551Registry: "0x000000006551c19487814612e58FE06813775758",
  safe141Singleton: "0x41675C099F32341bf84BFc5382aF534df5C7461a",
  safe141SingletonCodeHash: "0x1fe2df852ba3299d6534ef416eefa406e56ced995bca886ab7a553e6d0c5e1c4"
});
var SUPPORTED_CHAIN_IDS = Object.freeze([4663, 46630, 8453, 84532]);
var NETWORK_FAMILIES = Object.freeze({
  robinhood: Object.freeze({ key: "robinhood", name: "Robinhood", networks: Object.freeze(["robinhood-mainnet", "robinhood-testnet"]) }),
  base: Object.freeze({ key: "base", name: "Base", networks: Object.freeze(["base-mainnet", "base-sepolia"]) })
});
var NETWORKS = Object.freeze({
  "robinhood-mainnet": Object.freeze({
    name: "Robinhood Chain",
    displayName: "Robinhood",
    family: "robinhood",
    chainId: 4663,
    rpcEnv: "RH_MAINNET_RPC_URL",
    defaultRpc: "https://rpc.mainnet.chain.robinhood.com",
    explorer: "https://robinhoodchain.blockscout.com",
    nativeGasToken: "ETH",
    settlement: Object.freeze({
      symbol: "USDG",
      address: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
      allowed: true
    }),
    wethSettlementAllowed: false,
    baseAllowed: false
  }),
  "robinhood-testnet": Object.freeze({
    name: "Robinhood Chain Testnet",
    displayName: "Robinhood",
    family: "robinhood",
    chainId: 46630,
    rpcEnv: "RH_TESTNET_RPC_URL",
    defaultRpc: "https://rpc.testnet.chain.robinhood.com",
    explorer: "https://explorer.testnet.chain.robinhood.com",
    nativeGasToken: "ETH",
    settlement: Object.freeze({
      symbol: "MockUSDG",
      address: "0x6A4F8832c23C51ba626Eba9d50c8F862647C1679",
      decimals: 6,
      mock: true,
      testnetOnly: true,
      allowed: true,
      productionForbidden: true,
      note: "Use a clearly-labelled local/testnet MockUSDG until an official Robinhood testnet USDG is primary-source verified."
    }),
    wethSettlementAllowed: false,
    baseAllowed: false
  }),
  "base-mainnet": Object.freeze({
    name: "Base",
    displayName: "Base",
    family: "base",
    chainId: 8453,
    rpcEnv: "BASE_MAINNET_RPC_URL",
    defaultRpc: "https://mainnet.base.org",
    explorer: "https://basescan.org",
    nativeGasToken: "ETH",
    settlement: Object.freeze({
      symbol: "USDC",
      address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      decimals: 6,
      allowed: true,
      canonical: true
    }),
    wethSettlementAllowed: false,
    baseAllowed: true
  }),
  "base-sepolia": Object.freeze({
    name: "Base Sepolia",
    displayName: "Base Sepolia",
    family: "base",
    chainId: 84532,
    rpcEnv: "BASE_SEPOLIA_RPC_URL",
    defaultRpc: "https://sepolia.base.org",
    explorer: "https://sepolia.basescan.org",
    nativeGasToken: "ETH",
    settlement: Object.freeze({
      symbol: "USDC",
      address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
      decimals: 6,
      allowed: true,
      canonical: true,
      testnetOnly: true
    }),
    wethSettlementAllowed: false,
    baseAllowed: true
  })
});
function networkByKey(key) {
  const network = NETWORKS[key];
  if (!network) throw new Error(`Unknown network: ${key}`);
  return network;
}

// packages/config/src/production-readiness.mjs
var PRODUCTION_READINESS_GATES = Object.freeze([
  "databaseMigrationVerified",
  "contractConfigVerified",
  "paymentTokenVerified",
  "testnetE2EPassed",
  "securityGatePassed",
  "criticalTestsPassed"
]);
function evaluateProductionReadiness(input = {}) {
  const gates = Object.fromEntries(PRODUCTION_READINESS_GATES.map((name) => [name, input[name] === true]));
  const blockers = PRODUCTION_READINESS_GATES.filter((name) => !gates[name]);
  return { gates, blockers, productionReady: blockers.length === 0 };
}
function productionReadinessFromEnv(env = process.env) {
  return evaluateProductionReadiness({
    databaseMigrationVerified: env.NEXMARKETS_DATABASE_MIGRATION_VERIFIED === "true",
    contractConfigVerified: env.NEXMARKETS_CONTRACT_CONFIG_VERIFIED === "true",
    paymentTokenVerified: env.NEXMARKETS_PAYMENT_TOKEN_VERIFIED === "true",
    testnetE2EPassed: env.NEXMARKETS_TESTNET_E2E_PASSED === "true",
    securityGatePassed: env.NEXMARKETS_SECURITY_GATE_PASSED === "true",
    criticalTestsPassed: env.NEXMARKETS_CRITICAL_TESTS_PASSED === "true"
  });
}

// apps/api/src/object-storage.mjs
import { createHash as createHash4, createHmac } from "node:crypto";
var SERVICE = "s3";
var ALGORITHM = "AWS4-HMAC-SHA256";
var UNSIGNED_PAYLOAD = "UNSIGNED-PAYLOAD";
function sha2564(value) {
  return createHash4("sha256").update(value).digest("hex");
}
function hmac2(key, value, encoding = void 0) {
  return createHmac("sha256", key).update(value).digest(encoding);
}
function encode(value) {
  return encodeURIComponent(String(value)).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}
function objectPath(endpoint, bucket, key) {
  const prefix = endpoint.pathname.split("/").filter(Boolean).map((part) => encode(decodeURIComponent(part)));
  return `/${[...prefix, encode(bucket), ...String(key).split("/").filter(Boolean).map(encode)].join("/")}`;
}
function timestamp(date) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}
function canonicalQuery(entries) {
  return entries.map(([key, value]) => [encode(key), encode(value)]).sort(([leftKey, leftValue], [rightKey, rightValue]) => leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue)).map(([key, value]) => `${key}=${value}`).join("&");
}
function signingKey(secret, shortDate, region) {
  const dateKey = hmac2(`AWS4${secret}`, shortDate);
  const regionKey = hmac2(dateKey, region);
  const serviceKey = hmac2(regionKey, SERVICE);
  return hmac2(serviceKey, "aws4_request");
}
var S3ObjectStorage = class {
  constructor({ endpoint, region, bucket, accessKeyId, secretAccessKey, sessionToken = "", expiresInSeconds = 900, now = () => /* @__PURE__ */ new Date() }) {
    if (!endpoint || !region || !bucket || !accessKeyId || !secretAccessKey) throw new Error("OBJECT_STORAGE_CONFIGURATION_INCOMPLETE");
    this.endpoint = new URL(endpoint);
    if (this.endpoint.protocol !== "https:" && this.endpoint.hostname !== "127.0.0.1" && this.endpoint.hostname !== "localhost") throw new Error("OBJECT_STORAGE_HTTPS_REQUIRED");
    this.region = region;
    this.bucket = bucket;
    this.accessKeyId = accessKeyId;
    this.secretAccessKey = secretAccessKey;
    this.sessionToken = sessionToken;
    this.expiresInSeconds = Math.max(1, Math.min(900, Number(expiresInSeconds) || 900));
    this.now = now;
  }
  presign({ method, key, headers = {}, expiresInSeconds = this.expiresInSeconds }) {
    if (!/^(GET|PUT|HEAD)$/.test(method)) throw new Error("OBJECT_STORAGE_METHOD_UNSUPPORTED");
    if (!key || String(key).includes("..")) throw new Error("OBJECT_STORAGE_KEY_INVALID");
    const date = this.now();
    const amzDate = timestamp(date);
    const shortDate = amzDate.slice(0, 8);
    const scope = `${shortDate}/${this.region}/${SERVICE}/aws4_request`;
    const normalizedHeaders = Object.fromEntries(Object.entries({ host: this.endpoint.host, ...headers }).map(([name, value]) => [name.toLowerCase(), String(value).trim().replace(/\s+/g, " ")]));
    const signedHeaders = Object.keys(normalizedHeaders).sort().join(";");
    const canonicalHeaders = Object.keys(normalizedHeaders).sort().map((name) => `${name}:${normalizedHeaders[name]}
`).join("");
    const query = [
      ["X-Amz-Algorithm", ALGORITHM],
      ["X-Amz-Content-Sha256", UNSIGNED_PAYLOAD],
      ["X-Amz-Credential", `${this.accessKeyId}/${scope}`],
      ["X-Amz-Date", amzDate],
      ["X-Amz-Expires", String(Math.max(1, Math.min(900, Number(expiresInSeconds) || this.expiresInSeconds)))],
      ["X-Amz-SignedHeaders", signedHeaders]
    ];
    if (this.sessionToken) query.push(["X-Amz-Security-Token", this.sessionToken]);
    const canonical = canonicalQuery(query);
    const path = objectPath(this.endpoint, this.bucket, key);
    const canonicalRequest = [method, path, canonical, canonicalHeaders, signedHeaders, UNSIGNED_PAYLOAD].join("\n");
    const stringToSign = [ALGORITHM, amzDate, scope, sha2564(canonicalRequest)].join("\n");
    const signature = hmac2(signingKey(this.secretAccessKey, shortDate, this.region), stringToSign, "hex");
    return `${this.endpoint.origin}${path}?${canonical}&X-Amz-Signature=${signature}`;
  }
  async prepareUpload({ key, mimeType, byteSize, sha256: checksum }) {
    if (!/^image\/(jpeg|png|webp|avif)$/.test(mimeType ?? "") || !Number.isInteger(byteSize) || byteSize <= 0 || !/^[0-9a-f]{64}$/.test(checksum ?? "")) throw new Error("INVALID_MEDIA");
    const headers = { "content-type": mimeType, "x-amz-meta-sha256": checksum };
    return {
      method: "PUT",
      key,
      url: this.presign({ method: "PUT", key, headers }),
      headers,
      expiresInSeconds: this.expiresInSeconds
    };
  }
  async prepareDownload({ key, expiresInSeconds = 300 }) {
    return { method: "GET", key, url: this.presign({ method: "GET", key, expiresInSeconds }), expiresInSeconds };
  }
  async readObject({ key, maxBytes }) {
    const download = await this.prepareDownload({ key, expiresInSeconds: 60 });
    const response = await fetch(download.url, { method: "GET", redirect: "error" });
    if (!response.ok) throw Object.assign(new Error("MEDIA_OBJECT_UNAVAILABLE"), { status: 502 });
    const declaredLength = Number(response.headers.get("content-length") || 0);
    if (declaredLength > maxBytes) throw Object.assign(new Error("MEDIA_TOO_LARGE"), { status: 400 });
    const bytes2 = new Uint8Array(await response.arrayBuffer());
    if (!bytes2.length || bytes2.length > maxBytes) throw Object.assign(new Error("MEDIA_TOO_LARGE"), { status: 400 });
    return { bytes: bytes2, contentType: response.headers.get("content-type") || "", metadataChecksum: response.headers.get("x-amz-meta-sha256") || "" };
  }
};
function createObjectStorageFromEnv(env = process.env) {
  const bucket = String(env.OBJECT_STORAGE_BUCKET || "").trim();
  const configuredEndpoint = String(env.OBJECT_STORAGE_ENDPOINT || "").trim();
  const region = String(env.OBJECT_STORAGE_REGION || (/r2\.cloudflarestorage\.com$/i.test(new URL(configuredEndpoint || "https://invalid").hostname) ? "auto" : "")).trim();
  const accessKeyId = String(env.OBJECT_STORAGE_ACCESS_KEY_ID || "").trim();
  const secretAccessKey = String(env.OBJECT_STORAGE_SECRET_ACCESS_KEY || "").trim();
  const configured = [bucket, region, accessKeyId, secretAccessKey].filter(Boolean).length;
  if (!configured) return null;
  if (configured !== 4) throw new Error("OBJECT_STORAGE_CONFIGURATION_INCOMPLETE");
  const endpoint = configuredEndpoint || `https://s3.${region}.amazonaws.com`;
  const configuredSessionToken = String(env.OBJECT_STORAGE_SESSION_TOKEN || "").trim();
  const sessionToken = /^cfat_/i.test(configuredSessionToken) ? "" : configuredSessionToken;
  return new S3ObjectStorage({
    endpoint,
    region,
    bucket,
    accessKeyId,
    secretAccessKey,
    sessionToken,
    expiresInSeconds: Number(env.OBJECT_STORAGE_UPLOAD_TTL_SECONDS || 900)
  });
}

// apps/api/src/server.mjs
var JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };
var INTENT_TYPE = Object.freeze({
  "/v1/mints/prepare": "MINT",
  "/v1/terms/prepare": "TERMS_PUBLISH",
  "/v1/listings/prepare": "LISTING_CREATE",
  "/v1/listings/cancel": "LISTING_CANCEL",
  "/v1/advantages/consume": "ADVANTAGE_USE",
  "/v1/royalties/withdraw": "ROYALTY_WITHDRAW"
});
var INTENT_SELECTORS = Object.freeze({
  MINT: [id("mint((address,bytes32,address,uint256,bytes32,address,(bytes32,uint8,uint64,uint64,uint256,bytes32)[]))").slice(0, 10), id("mintAllowlisted((address,bytes32,address,uint256,bytes32,address,(bytes32,uint8,uint64,uint64,uint256,bytes32)[]),bytes32[])").slice(0, 10)],
  TERMS_PUBLISH: [id("publishTerms(address,(uint256,uint256,uint64,uint64,uint64,address,address,uint96,bytes32,bytes32))").slice(0, 10), id("publishTerms(address,(uint256,uint256,uint64,uint64,uint64,bytes32,uint64,uint256,address,address,uint96,bytes32,bytes32))").slice(0, 10)],
  LISTING_CANCEL: [id("cancelListing(bytes32)").slice(0, 10)],
  ADVANTAGE_USE: [id("consumeQuantity(address,uint256,bytes32,uint256,bytes32)").slice(0, 10), id("redeem(address,uint256,bytes32,bytes32)").slice(0, 10), id("redeemAmount(address,uint256,bytes32,uint256,bytes32)").slice(0, 10), id("useAmount(address,uint256,bytes32,bytes32)").slice(0, 10)],
  ROYALTY_WITHDRAW: [id("withdraw(bytes32)").slice(0, 10)]
});
var MINT_OPEN_SELECTOR = id("isMintOpen(address,bytes32)").slice(0, 10);
var ADVANTAGES_DOMAIN = keccak256(toUtf8Bytes("NEXMARKETS_ADVANTAGES_V1"));
var ADVANTAGE_TUPLE = "tuple(bytes32 advantageId,uint8 kind,uint64 startsAt,uint64 endsAt,uint256 totalUnits,bytes32 definitionHash)[]";
var FACTORY_CONFIG_TUPLE = "tuple(string name,string symbol,address initialOwner,bytes32 editionId,uint32 absoluteSupplyCap,bytes32 artworkCommitment,string baseTokenURI)";
var FACTORY_LEGACY_INTERFACE = new Interface([`function createEdition(${FACTORY_CONFIG_TUPLE} config,address publisher,bytes32 salt) returns(address)`]);
var SAFE_EXEC_INTERFACE = new Interface(["function execTransaction(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address refundReceiver,bytes signatures) payable returns(bool)"]);
var SAFE_HASH_INTERFACE = new Interface(["function getTransactionHash(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address refundReceiver,uint256 nonce) view returns(bytes32)"]);
var SAFE_NONCE_SELECTOR = "0xaffed0e0";
var SAFE_EXECUTION_SUCCESS_TOPIC = id("ExecutionSuccess(bytes32,uint256)").toLowerCase();
var EDITION_CREATED_TOPIC = id("EditionCreated(address,bytes32,address,bytes32,address,address,uint32,bytes32)").toLowerCase();
function quantity(value, label) {
  try {
    return Number(BigInt(value));
  } catch {
    throw Object.assign(new Error(`${label}_REQUIRED`), { status: 400 });
  }
}
function parseFactoryEditionCreatedReceipt(receipt, { factoryAddress, publisherAddress = null, editionAddress = null } = {}) {
  const factory = getAddress(factoryAddress ?? "");
  const log = (receipt?.logs ?? []).find((entry) => entry?.address && getAddress(entry.address) === factory && String(entry.topics?.[0] ?? "").toLowerCase() === EDITION_CREATED_TOPIC);
  if (!log || !Array.isArray(log.topics) || log.topics.length < 4) throw Object.assign(new Error("EDITION_CREATED_EVENT_REQUIRED"), { status: 400 });
  const edition = getAddress(`0x${String(log.topics[1]).slice(-40)}`);
  const editionId = String(log.topics[2]);
  const publisher = getAddress(`0x${String(log.topics[3]).slice(-40)}`);
  if (publisherAddress && publisher.toLowerCase() !== getAddress(publisherAddress).toLowerCase()) throw Object.assign(new Error("EDITION_PUBLISHER_MISMATCH"), { status: 403 });
  if (editionAddress && edition.toLowerCase() !== getAddress(editionAddress).toLowerCase()) throw Object.assign(new Error("EDITION_ADDRESS_MISMATCH"), { status: 400 });
  let decoded;
  try {
    decoded = AbiCoder.defaultAbiCoder().decode(["bytes32", "address", "address", "uint32", "bytes32"], log.data ?? "0x");
  } catch {
    throw Object.assign(new Error("EDITION_CREATED_DATA_INVALID"), { status: 400 });
  }
  return {
    edition: edition.toLowerCase(),
    editionId: editionId.toLowerCase(),
    publisher: publisher.toLowerCase(),
    salt: String(decoded[0]).toLowerCase(),
    editionOwner: String(decoded[1]).toLowerCase(),
    mintController: String(decoded[2]).toLowerCase(),
    absoluteSupplyCap: quantity(decoded[3], "ABSOLUTE_SUPPLY_CAP"),
    artworkCommitment: String(decoded[4]).toLowerCase(),
    blockNumber: quantity(receipt?.blockNumber, "RECEIPT_BLOCK_NUMBER"),
    blockHash: String(receipt?.blockHash ?? "").toLowerCase(),
    txHash: String(receipt?.transactionHash ?? "").toLowerCase(),
    logIndex: quantity(log.logIndex, "EDITION_CREATED_LOG_INDEX")
  };
}
function canonicalAdvantagesHash(configs) {
  if (!Array.isArray(configs) || configs.length === 0) return "0x" + "00".repeat(32);
  try {
    const coder3 = AbiCoder.defaultAbiCoder();
    return keccak256(coder3.encode(["bytes32", ADVANTAGE_TUPLE], [ADVANTAGES_DOMAIN, configs.map((config) => [config.advantageId, config.kind, config.startsAt, config.endsAt, config.totalUnits, config.definitionHash])]));
  } catch {
    return null;
  }
}
function productionOrderPolicy(env = process.env) {
  return {
    usdg: env.USDG_ADDRESS ?? "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
    protocolFeeRecipient: env.SECONDARY_FEE_RECIPIENT,
    royaltyVault: env.NEX_ROYALTY_VAULT_ADDRESS,
    zone: env.NEX_MARKETS_ZONE_ADDRESS,
    listingRegistry: env.NEX_LISTING_REGISTRY_ADDRESS,
    seaport: env.SEAPORT_16_ADDRESS ?? "0x0000000000000068F116a894984e2DB1123eB395",
    protocolAdminSafe: env.PROTOCOL_ADMIN_SAFE_ADDRESS,
    transactionTargets: {
      MINT: env.NEX_MINT_CONTROLLER_ADDRESS,
      EDITION_CREATE: env.NEX_PASS_FACTORY_ADDRESS,
      TERMS_PUBLISH: env.NEX_LAUNCH_REGISTRY_ADDRESS,
      LISTING_CANCEL: env.NEX_LISTING_REGISTRY_ADDRESS,
      ADVANTAGE_USE: env.NEX_ADVANTAGE_REGISTRY_ADDRESS,
      ROYALTY_WITHDRAW: env.NEX_ROYALTY_VAULT_ADDRESS
    }
  };
}
function networkKeyForChainId(chainId) {
  return { 4663: "robinhood-mainnet", 46630: "robinhood-testnet", 8453: "base-mainnet", 84532: "base-sepolia" }[Number(chainId)] ?? null;
}
var VERIFIED_TESTNET_POLICIES = Object.freeze({
  "robinhood-testnet": Object.freeze({
    PROTOCOL_ADMIN_SAFE_ADDRESS: "0xCE54c8453fF48670781a6b908c1A3e9209FC95A0",
    SECONDARY_FEE_RECIPIENT: "0xCE54c8453fF48670781a6b908c1A3e9209FC95A0",
    NEX_ROYALTY_VAULT_ADDRESS: "0x9D69ab1897aFA9d6ffc97EEa6A936233a999DFa1",
    NEX_MARKETS_ZONE_ADDRESS: "0xF21dA23d8928b320124fBc17bd678c7C48c55af6",
    NEX_LISTING_REGISTRY_ADDRESS: "0xF8fD8D378F6a61Ecb207732F4f1d0c3E4Eb2c75c",
    NEX_MINT_CONTROLLER_ADDRESS: "0x0ea6F883808447f115C7b6C037902361C365555A",
    NEX_PASS_FACTORY_ADDRESS: "0x957DE0de07D33c9a89c791B876074657a7fFeEb6",
    NEX_LAUNCH_REGISTRY_ADDRESS: "0xeE3C8F330C0B2738201fDb2F1720D06c0D27620d",
    NEX_ADVANTAGE_REGISTRY_ADDRESS: "0x1e265Fee39d75b5211895820926B4ff77B4f1cDd"
  }),
  "base-sepolia": Object.freeze({
    PROTOCOL_ADMIN_SAFE_ADDRESS: "0xE6D0846e6C0b51C61FdDb593A1914b85181E5783",
    SECONDARY_FEE_RECIPIENT: "0xE6D0846e6C0b51C61FdDb593A1914b85181E5783",
    NEX_ROYALTY_VAULT_ADDRESS: "0x1C7fBa2bEfdCB18E316e1713fc22EaC78434DBF3",
    NEX_MARKETS_ZONE_ADDRESS: "0x1C7e6cE890d9c6DD9DF55f42449f9F2F34141B3e",
    NEX_LISTING_REGISTRY_ADDRESS: "0xdB57a21e01d85E67d75111534e3A99508e1e9187",
    NEX_MINT_CONTROLLER_ADDRESS: "0xe68Fc831a441eeA79865A890a279514C8C797677",
    NEX_PASS_FACTORY_ADDRESS: "0xc5Cdfcc91719379A778C16b2ab9190c004186E0C",
    NEX_LAUNCH_REGISTRY_ADDRESS: "0x707278D3a69e27bde2A14Ee70602d4A293C8C2aF",
    NEX_ADVANTAGE_REGISTRY_ADDRESS: "0xddf778F46b1A91f7B80B24fdB185372C633Acb15"
  })
});
function networkPolicyEnv(env, prefix, settlementAddress, seaportAddress, fallback = {}) {
  const policyEnv = { ...env };
  const mappings = {
    PROTOCOL_ADMIN_SAFE_ADDRESS: "PROTOCOL_ADMIN_SAFE_ADDRESS",
    SECONDARY_FEE_RECIPIENT: "SECONDARY_FEE_RECIPIENT",
    NEX_ROYALTY_VAULT_ADDRESS: "NEX_ROYALTY_VAULT_ADDRESS",
    NEX_MARKETS_ZONE_ADDRESS: "NEX_MARKETS_ZONE_ADDRESS",
    NEX_LISTING_REGISTRY_ADDRESS: "NEX_LISTING_REGISTRY_ADDRESS",
    NEX_MINT_CONTROLLER_ADDRESS: "NEX_MINT_CONTROLLER_ADDRESS",
    NEX_PASS_FACTORY_ADDRESS: "NEX_PASS_FACTORY_ADDRESS",
    NEX_LAUNCH_REGISTRY_ADDRESS: "NEX_LAUNCH_REGISTRY_ADDRESS",
    NEX_ADVANTAGE_REGISTRY_ADDRESS: "NEX_ADVANTAGE_REGISTRY_ADDRESS"
  };
  for (const [target, suffix] of Object.entries(mappings)) {
    policyEnv[target] = env[`${prefix}_${suffix}`] ?? (prefix === "ROBINHOOD_TESTNET" ? env[suffix] : void 0) ?? fallback[suffix];
  }
  policyEnv.USDG_ADDRESS = env[`${prefix}_USDC_ADDRESS`] ?? (prefix === "ROBINHOOD_TESTNET" ? env.USDG_ADDRESS : void 0) ?? settlementAddress;
  policyEnv.SEAPORT_16_ADDRESS = env[`${prefix}_SEAPORT_16_ADDRESS`] ?? seaportAddress;
  return policyEnv;
}
function networkSubgraph(env, prefix, fallbackEndpoint, fallbackEdition, fallbackName) {
  const endpoint = env[`${prefix}_SUBGRAPH_URL`] ?? fallbackEndpoint;
  return new SubgraphClient({
    endpoint,
    certificationEditionAddress: env[`${prefix}_CERTIFICATION_EDITION_ADDRESS`] ?? fallbackEdition,
    certificationEditionName: env[`${prefix}_CERTIFICATION_EDITION_NAME`] ?? fallbackName,
    protocolVersion: Number(env[`${prefix}_PROTOCOL_VERSION`] ?? 1)
  });
}
async function attachSignedListingData(listings, store) {
  if (!Array.isArray(listings) || !store?.signedOrder) return listings ?? [];
  return Promise.all(listings.map(async (listing) => {
    const orderHash = listing.order_hash ?? listing.orderHash;
    if (!orderHash) return listing;
    const signed = await store.signedOrder(orderHash);
    if (!signed) return listing;
    return {
      ...listing,
      signature: signed.signature,
      counter: signed.counter,
      order_payload: signed.order_payload ?? signed.order ?? null
    };
  }));
}
function createNetworkConfigs(env = process.env) {
  const baseSepoliaUsdc = env.BASE_SEPOLIA_USDC_ADDRESS ?? "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
  const baseMainnetUsdc = env.BASE_MAINNET_USDC_ADDRESS ?? "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
  const rhTestnetSubgraph = networkSubgraph(
    env,
    "ROBINHOOD_TESTNET",
    env.NEXMARKETS_SUBGRAPH_URL ?? "https://api.goldsky.com/api/public/project_cmt3es3z03t5101vr8ggx1j7e/subgraphs/nexmarkets-v1-robinhood-testnet/1.0.1/gn",
    env.CERTIFICATION_EDITION_ADDRESS ?? "0x4171D62F43B4168b07a01C04594455DBc3298437",
    env.CERTIFICATION_EDITION_NAME ?? "NexMarkets V1 Test Certification Edition"
  );
  const rhMainnetSubgraph = networkSubgraph(env, "ROBINHOOD_MAINNET", env.RH_MAINNET_SUBGRAPH_URL, env.RH_MAINNET_CERTIFICATION_EDITION_ADDRESS, env.RH_MAINNET_CERTIFICATION_EDITION_NAME);
  const baseSepoliaSubgraph = networkSubgraph(env, "BASE_SEPOLIA", env.BASE_SEPOLIA_SUBGRAPH_URL ?? env.BASE_SEPOLIA_NEXMARKETS_SUBGRAPH_URL ?? "https://api.goldsky.com/api/public/project_cmt3es3z03t5101vr8ggx1j7e/subgraphs/nexmarkets-v1-base-sepolia/1.0.1/gn", env.BASE_SEPOLIA_CERTIFICATION_EDITION_ADDRESS, env.BASE_SEPOLIA_CERTIFICATION_EDITION_NAME);
  const baseMainnetSubgraph = networkSubgraph(env, "BASE_MAINNET", env.BASE_MAINNET_SUBGRAPH_URL ?? env.BASE_MAINNET_NEXMARKETS_SUBGRAPH_URL, env.BASE_MAINNET_CERTIFICATION_EDITION_ADDRESS, env.BASE_MAINNET_CERTIFICATION_EDITION_NAME);
  const rhTestnetPolicy = networkPolicyEnv(env, "ROBINHOOD_TESTNET", env.USDG_ADDRESS ?? "0x6A4F8832c23C51ba626Eba9d50c8F862647C1679", "0x0000000000000068F116a894984e2DB1123eB395", VERIFIED_TESTNET_POLICIES["robinhood-testnet"]);
  const baseSepoliaPolicy = networkPolicyEnv(env, "BASE_SEPOLIA", baseSepoliaUsdc, "0x0000000000000068F116a894984e2DB1123eB395", VERIFIED_TESTNET_POLICIES["base-sepolia"]);
  const config = (key, chainId, rpcEnv, fallbackRpc, subgraph, policyEnv, readModelDisabled = false) => ({
    key,
    chainId,
    protocolVersion: subgraph.protocolVersion,
    chain: new JsonRpcClient(env[rpcEnv] ?? fallbackRpc),
    subgraph,
    orderPolicy: productionOrderPolicy(policyEnv),
    productionReadiness: productionReadinessFromEnv(env),
    settlement: {
      symbol: networkByKey(key).settlement.symbol,
      address: policyEnv.USDG_ADDRESS ?? networkByKey(key).settlement.address,
      decimals: networkByKey(key).settlement.decimals ?? 6,
      mock: Boolean(networkByKey(key).settlement.mock),
      testnetOnly: Boolean(networkByKey(key).settlement.testnetOnly)
    },
    readModelDisabled
  });
  return {
    "robinhood-mainnet": config("robinhood-mainnet", 4663, "RH_MAINNET_RPC_URL", "https://rpc.mainnet.chain.robinhood.com", rhMainnetSubgraph, env, !rhMainnetSubgraph.enabled),
    "robinhood-testnet": config("robinhood-testnet", 46630, "RH_TESTNET_RPC_URL", "https://rpc.testnet.chain.robinhood.com", rhTestnetSubgraph, rhTestnetPolicy),
    "base-mainnet": config("base-mainnet", 8453, "BASE_MAINNET_RPC_URL", "https://mainnet.base.org", baseMainnetSubgraph, networkPolicyEnv(env, "BASE_MAINNET", baseMainnetUsdc, "0x0000000000000068F116a894984e2DB1123eB395"), !baseMainnetSubgraph.enabled),
    "base-sepolia": config("base-sepolia", 84532, "BASE_SEPOLIA_RPC_URL", "https://sepolia.base.org", baseSepoliaSubgraph, baseSepoliaPolicy, !baseSepoliaSubgraph.enabled)
  };
}
function json(res, status, payload, headers = {}) {
  res.writeHead(status, { ...JSON_HEADERS, ...headers });
  res.end(JSON.stringify(payload, (_, value) => typeof value === "bigint" ? value.toString() : value));
}
async function readBody(req, maxBytes = 1048576) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw Object.assign(new Error("BODY_TOO_LARGE"), { status: 413 });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw Object.assign(new Error("INVALID_JSON"), { status: 400 });
  }
}
function cookies(req) {
  return Object.fromEntries(((req.headers ?? {}).cookie ?? "").split(";").filter(Boolean).map((part) => {
    const index = part.indexOf("=");
    return [decodeURIComponent(part.slice(0, index).trim()), decodeURIComponent(part.slice(index + 1))];
  }));
}
var RateLimiter = class {
  constructor({ limit = 120, windowMs = 6e4 } = {}) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.buckets = /* @__PURE__ */ new Map();
  }
  take(key, now = Date.now()) {
    const prior = this.buckets.get(key);
    const bucket = !prior || prior.resetAt <= now ? { count: 0, resetAt: now + this.windowMs } : prior;
    bucket.count += 1;
    this.buckets.set(key, bucket);
    if (bucket.count > this.limit) throw Object.assign(new Error("RATE_LIMITED"), { status: 429 });
  }
};
function securityHeaders(requestId) {
  return {
    "x-request-id": requestId,
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
    "permissions-policy": "camera=(), microphone=(), geolocation=()",
    "content-security-policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
    "strict-transport-security": "max-age=31536000; includeSubDomains"
  };
}
function formatHeldDuration(since) {
  if (!since) return "Recent";
  const ms = Date.now() - new Date(since).getTime();
  const days = Math.floor(ms / (24 * 60 * 60 * 1e3));
  if (days >= 365) {
    const yrs = Math.floor(days / 365);
    return `${yrs} yr${yrs > 1 ? "s" : ""}`;
  }
  if (days >= 30) {
    const mos = Math.floor(days / 30);
    return `${mos} mo${mos > 1 ? "s" : ""}`;
  }
  if (days >= 1) return `${days} day${days > 1 ? "s" : ""}`;
  const hrs = Math.floor(ms / (60 * 60 * 1e3));
  if (hrs >= 1) return `${hrs} hr${hrs > 1 ? "s" : ""}`;
  return "Just now";
}
function epochSeconds(value) {
  if (value == null || value === "") return null;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric > 1e10 ? Math.floor(numeric / 1e3) : Math.floor(numeric);
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? Math.floor(parsed / 1e3) : null;
}
function formatPassVault(pass) {
  if (!pass) return null;
  const tba = pass.token_bound_account ?? pass.tokenBoundAccount ?? pass.tba?.account ?? null;
  return {
    name: "Pass Vault",
    address: tba,
    compatible: true,
    standard: "ERC-6551",
    registry: "0x000000006551c19487814612e58FE06813775758",
    framing: "Every Pass is ERC-6551 compatible. As the ecosystem grows, Passes accumulate. What they accumulate is determined by each builder's Edition design.",
    description: "Every Pass has a Vault. What flows into it is decided by the builder who created the Edition. Platform activity, tokens, exclusive drops, future distributions \u2014 builders choose what their holders accumulate. We provide the infrastructure. They decide what it means.",
    regulatoryBoundary: "Builders decide what flows into the Pass wallet. Platform decides nothing on their behalf. Completely permissionless. Zero regulatory exposure."
  };
}
function mediaAssetView(row) {
  if (!row) return null;
  return {
    id: row.id,
    assetKey: row.id,
    filename: row.original_filename ?? row.filename,
    mimeType: row.mime_type ?? row.mimeType,
    byteSize: Number(row.byte_size ?? row.byteSize ?? 0),
    sha256: row.sha256,
    width: row.width == null ? null : Number(row.width),
    height: row.height == null ? null : Number(row.height),
    uploadStatus: row.upload_status ?? row.uploadStatus ?? "PREPARED",
    safetyStatus: row.safety_status ?? row.safetyStatus ?? "PENDING",
    url: row.public_url ?? row.publicUrl ?? null,
    createdAt: row.created_at ?? row.createdAt ?? null,
    uploadedAt: row.uploaded_at ?? row.uploadedAt ?? null,
    verifiedAt: row.verified_at ?? row.verifiedAt ?? null
  };
}
function mediaIdFromUrl(value) {
  const match = String(value || "").match(/(?:^|https?:\/\/[^/]+)\/v1\/media\/([^/?#]+)\/content(?:[?#].*)?$/i);
  return match ? decodeURIComponent(match[1]) : null;
}
function launchMediaReferences(launchDraft) {
  const project = launchDraft?.project || {};
  const design = launchDraft?.design || {};
  const references = [
    { role: "banner", id: project.banner?.assetId || mediaIdFromUrl(project.banner?.src), url: project.banner?.src },
    { role: "logo", id: design.logoAssetId || mediaIdFromUrl(design.logoSrc), url: design.logoSrc },
    { role: "artwork", id: design.artAssetId || mediaIdFromUrl(design.artSrc), url: design.artSrc }
  ];
  for (const [index, entry] of (design.artEdition || []).entries()) {
    references.push({ role: `artwork:${index + 1}`, id: entry.assetId || (/^med_/i.test(entry.assetKey || "") ? entry.assetKey : null) || mediaIdFromUrl(entry.url || entry.src), url: entry.url || entry.src });
  }
  return references.filter((reference) => reference.id);
}
async function assertApprovedMediaReferences(store, accountId, launchDraft) {
  const references = launchMediaReferences(launchDraft);
  if (!references.length) return;
  const ids2 = [...new Set(references.map((reference) => reference.id))];
  const rows = store.mediaByIds ? await store.mediaByIds(ids2) : await Promise.all(ids2.map((id2) => store.mediaById?.(id2)));
  const byId = new Map((rows || []).filter(Boolean).map((row) => [row.id, row]));
  for (const reference of references) {
    const row = byId.get(reference.id);
    if (!row) throw Object.assign(new Error("MEDIA_REFERENCE_NOT_FOUND"), { status: 400 });
    if ((row.owner_account_id ?? row.ownerAccountId) !== accountId) throw Object.assign(new Error("MEDIA_OWNER_MISMATCH"), { status: 403 });
    if ((row.safety_status ?? row.safetyStatus) !== "APPROVED") throw Object.assign(new Error("MEDIA_NOT_APPROVED"), { status: 400 });
    const approvedUrl = row.public_url ?? row.publicUrl;
    if (reference.url && approvedUrl && reference.url !== approvedUrl) throw Object.assign(new Error("MEDIA_REFERENCE_MISMATCH"), { status: 400 });
  }
}
function assertLaunchArtworkReady(launchDraft) {
  const design = launchDraft?.design || {};
  const isStableUrl = (value) => /^(?:https?:\/\/|\/v1\/media\/[^/]+\/content(?:[?#].*)?$)/i.test(String(value || "").trim());
  if (design.artMode === "collection") {
    const supply = Number(launchDraft?.edition?.supply || 0);
    if (!Array.isArray(design.artEdition) || design.artEdition.length !== supply || design.artEdition.some((entry) => !isStableUrl(entry.url || entry.src))) {
      throw Object.assign(new Error("COLLECTION_ARTWORK_NOT_READY"), { status: 400 });
    }
    return;
  }
  if (!isStableUrl(design.artSrc)) throw Object.assign(new Error("ARTWORK_NOT_READY"), { status: 400 });
}
function createApiServer({
  store,
  chainId = 4663,
  allowedOrigin = process.env.APP_ORIGIN ?? "https://nexmarkets.fun",
  secureCookies = process.env.NODE_ENV !== "test",
  rateLimiter = new RateLimiter(),
  logger = { info() {
  }, error() {
  } },
  orderPolicy = {},
  metrics = new MetricsRegistry(),
  requireIndexedReadiness = false,
  chain = null,
  subgraph = null,
  networkConfigs = null,
  maxIndexerLagBlocks = 120,
  maxFinalityLagBlocks = 120,
  storage = null,
  protocolVersion = 1,
  productionReadiness = null,
  requireProductionReadiness = false
} = {}) {
  if (!store) throw new Error("store required");
  const defaultChainId = chainId;
  const defaultChain = chain;
  const defaultSubgraph = subgraph;
  const defaultOrderPolicy = orderPolicy;
  return http.createServer(async (req, res) => {
    const headers = req.headers ?? {};
    const requestId = headers["x-request-id"]?.toString().slice(0, 128) || randomUUID3();
    const correlationId = headers["x-correlation-id"]?.toString().slice(0, 128) || requestId;
    const startedAt = Date.now();
    for (const [key, value] of Object.entries(securityHeaders(requestId))) res.setHeader?.(key, value);
    try {
      metrics.increment("nexmarkets_api_requests_total");
      rateLimiter.take(req.socket?.remoteAddress ?? headers["x-forwarded-for"] ?? "unknown");
      const url = new URL(req.url ?? "/", allowedOrigin);
      const requestedNetwork = headers["x-nex-network"]?.toString().trim() || null;
      const selectedNetwork = networkConfigs ? networkConfigs[requestedNetwork ?? networkKeyForChainId(defaultChainId)] : null;
      if (networkConfigs && !selectedNetwork) throw Object.assign(new Error("NETWORK_UNSUPPORTED"), { status: 400 });
      const fallbackChainId = defaultChainId;
      const fallbackChain = defaultChain;
      const fallbackSubgraph = defaultSubgraph;
      const fallbackOrderPolicy = defaultOrderPolicy;
      const chainId2 = selectedNetwork?.chainId ?? fallbackChainId;
      const chain2 = selectedNetwork?.chain ?? fallbackChain;
      const subgraph2 = selectedNetwork?.subgraph ?? fallbackSubgraph;
      const orderPolicy2 = selectedNetwork?.orderPolicy ?? fallbackOrderPolicy;
      const activeProtocolVersion = Number(selectedNetwork?.protocolVersion ?? protocolVersion);
      const readiness = selectedNetwork?.productionReadiness ?? productionReadiness;
      const readModelDisabled = Boolean(selectedNetwork?.readModelDisabled && !subgraph2?.enabled);
      const origin = headers.origin;
      if (origin && new URL(origin).origin !== new URL(allowedOrigin).origin) {
        const reqHost = headers["x-forwarded-host"] || headers.host;
        if (!reqHost || new URL(origin).host !== reqHost) throw Object.assign(new Error("ORIGIN_REJECTED"), { status: 403 });
      }
      if (req.method === "GET" && (url.pathname === "/" || url.pathname === "")) {
        res.writeHead(307, { location: "/index.html", "cache-control": "no-store" });
        return res.end();
      }
      if (req.method === "GET" && url.pathname === "/healthz") return json(res, 200, { status: "ok", service: "api", version: "v1", requestId });
      if (req.method === "GET" && url.pathname === "/readyz") {
        if (requireProductionReadiness && readiness && !readiness.productionReady) throw Object.assign(new Error(`PRODUCTION_READINESS_BLOCKED:${readiness.blockers.join(",")}`), { status: 503 });
        await store.ready();
        metrics.set("nexmarkets_db_ready", 1);
        const subgraphStatus = requireIndexedReadiness && subgraph2?.enabled ? await subgraph2.indexingStatus() : null;
        const indexer = requireIndexedReadiness && !subgraphStatus ? await store.indexerHealth(chainId2) : null;
        if (requireIndexedReadiness && !indexer && !subgraphStatus) throw Object.assign(new Error("INDEXER_NOT_READY"), { status: 503 });
        if (requireIndexedReadiness && !chain2?.getBlockNumber) throw Object.assign(new Error("CHAIN_HEAD_UNAVAILABLE"), { status: 503 });
        let chainHead = null;
        let indexedLag = null;
        let finalityLag = null;
        if ((indexer || subgraphStatus) && chain2?.getBlockNumber) {
          chainHead = await chain2.getBlockNumber();
          const landed = subgraphStatus ? Number(subgraphStatus.indexedBlock ?? 0) : Number(indexer.landed_block_number ?? indexer.latest_block_number ?? 0);
          const finalized = subgraphStatus ? landed : Number(indexer.finalized_watermark_block_number ?? indexer.finalized_block_number ?? 0);
          indexedLag = chainHead - landed;
          finalityLag = chainHead - finalized;
          if (indexedLag > maxIndexerLagBlocks || finalityLag > maxFinalityLagBlocks) {
            logger.info?.({ event: "indexer_stale", chainHead, landedBlock: landed, finalizedBlock: finalized, indexedLag, finalityLag, maxIndexerLagBlocks, maxFinalityLagBlocks });
            throw Object.assign(new Error("INDEXER_STALE"), { status: 503 });
          }
        }
        if (indexer || subgraphStatus) {
          const landed = subgraphStatus ? Number(subgraphStatus.indexedBlock ?? 0) : Number(indexer.landed_block_number ?? indexer.latest_block_number ?? 0);
          metrics.set("nexmarkets_indexer_latest_block", landed);
          metrics.set("nexmarkets_indexer_lag_blocks", indexedLag ?? 0);
        }
        return json(res, 200, { status: "ready", database: "ok", productionReadiness: readiness, indexer: indexer || subgraphStatus ? "fresh" : "not-required", indexerProvider: subgraphStatus ? "GOLDSKY_SUBGRAPH" : indexer ? "GOLDSKY_TURBO_DEPRECATED" : null, chainHead, landedBlock: subgraphStatus ? Number(subgraphStatus.indexedBlock ?? 0) : indexer ? Number(indexer.landed_block_number ?? indexer.latest_block_number ?? 0) : null, latestEventBlock: indexer ? Number(indexer.latest_event_block_number ?? indexer.latest_block_number ?? 0) : null, indexedLag, finalityLag, requestId });
      }
      if (req.method === "GET" && url.pathname === "/metrics") {
        res.writeHead(200, { "content-type": "text/plain; version=0.0.4" });
        return res.end(metrics.render());
      }
      if (req.method === "GET" && url.pathname === "/v1/stats") {
        const stats = readModelDisabled ? {} : await store.getPlatformStats();
        return json(res, 200, {
          data: {
            ...stats,
            heroCopy: "Get there early. Own your place in what's next.",
            tagline: "A Pass is your position in a builder's story.",
            howItWorks: [
              { step: 1, text: "Find it early on Discover." },
              { step: 2, text: "Mint your numbered Pass." },
              { step: 3, text: "Use your Advantage, keep it, or sell it when the Market opens." }
            ],
            royaltyFraming: "Builder royalties are earned, not assumed. Every 30-day cycle, fees queue for release. Holders can challenge. Clean builders get paid. The market polices itself.",
            passVaultFraming: "Every Pass has a Vault. What flows into it is decided by the builder who created the Edition. Platform activity, tokens, exclusive drops, future distributions \u2014 builders choose what their holders accumulate. We provide the infrastructure. They decide what it means."
          }
        });
      }
      if (req.method === "GET" && url.pathname === "/v1/builders/featured") return json(res, 200, { data: await store.getFeaturedBuilders() });
      if (req.method === "GET" && /^\/v1\/builders\/[^/]+\/milestones$/.test(url.pathname)) {
        const builderId = url.pathname.split("/")[3];
        return json(res, 200, { data: await store.getMilestonesByBuilder(builderId) });
      }
      if (req.method === "GET" && /^\/v1\/builders\/[^/]+\/questions$/.test(url.pathname)) {
        const builderId = url.pathname.split("/")[3];
        const profile = await store.getBuilderProfile(builderId);
        if (!profile) throw Object.assign(new Error("BUILDER_NOT_FOUND"), { status: 404 });
        const canonicalBuilderId = profile.builder_id ?? profile.builderId ?? profile.id ?? builderId;
        return json(res, 200, { data: store.getQuestionsByBuilder ? await store.getQuestionsByBuilder(canonicalBuilderId) : [] });
      }
      if (req.method === "GET" && /^\/v1\/builders\/[^/]+\/activity$/.test(url.pathname)) {
        const builderId = url.pathname.split("/")[3];
        const activity = store.getActivityByBuilder ? await store.getActivityByBuilder(builderId, { limit: 20 }) : await store.getMilestonesByBuilder(builderId, { limit: 20 });
        return json(res, 200, { data: activity });
      }
      if (req.method === "GET" && /^\/v1\/builders\/[^/]+$/.test(url.pathname) && !["featured"].includes(url.pathname.split("/")[3])) {
        const builderId = url.pathname.split("/")[3];
        const profile = await store.getBuilderProfile(builderId);
        if (!profile) throw Object.assign(new Error("BUILDER_NOT_FOUND"), { status: 404 });
        return json(res, 200, { data: profile });
      }
      if (req.method === "GET" && /^\/v1\/projects\/[^/]+\/holders$/.test(url.pathname)) {
        if (readModelDisabled) return json(res, 200, { data: [] });
        const slug = decodeURIComponent(url.pathname.split("/")[3]);
        const project = await store.projectBySlug(slug);
        if (!project) throw Object.assign(new Error("NOT_FOUND"), { status: 404 });
        const editionAddress = project.editionAddress ?? project.edition_address ?? project.editions?.[0]?.edition_address ?? project.editions?.[0]?.editionAddress;
        const holders = editionAddress ? await store.getHolders(editionAddress) : [];
        const formatted = holders.map((h) => ({
          ...h,
          serialNumber: `#${String(h.token_id ?? h.tokenId).padStart(3, "0")}`,
          heldDuration: formatHeldDuration(h.held_since ?? h.heldSince ?? h.updated_at ?? h.created_at)
        }));
        return json(res, 200, { data: formatted });
      }
      if (req.method === "GET" && /^\/v1\/editions\/[^/]+\/holders$/.test(url.pathname)) {
        if (readModelDisabled) return json(res, 200, { data: [] });
        const address2 = url.pathname.split("/")[3];
        const holders = await store.getHolders(address2);
        const formatted = holders.map((h) => ({
          ...h,
          serialNumber: `#${String(h.token_id ?? h.tokenId).padStart(3, "0")}`,
          heldDuration: formatHeldDuration(h.held_since ?? h.heldSince ?? h.updated_at ?? h.created_at)
        }));
        return json(res, 200, { data: formatted });
      }
      if (req.method === "GET" && url.pathname === "/v1/discover") {
        let raw = [];
        if (!readModelDisabled) {
          try {
            raw = subgraph2?.enabled ? await subgraph2.discover() : await store.discover();
          } catch (error) {
            logger.info?.({ event: "discover_subgraph_fallback", error: error.message });
            raw = await store.discover();
          }
        }
        const now = Date.now();
        const data = (await Promise.all((raw ?? []).map(async (project) => {
          let source = project;
          const editionAddress = project.edition_address ?? project.editionAddress ?? project.address;
          if (editionAddress && store.editionByAddress) {
            const edRow = await store.editionByAddress(editionAddress);
            if (edRow?.disabled) return null;
          }
          if (!project.content && editionAddress && store.projectByEditionAddress) {
            const linkedProject = await store.projectByEditionAddress(editionAddress);
            if (linkedProject) source = { ...project, slug: linkedProject.slug ?? project.slug, project_id: linkedProject.id, project_name: linkedProject.name, builder_account_id: linkedProject.builder_account_id ?? linkedProject.builderAccountId, content: linkedProject.content, project: linkedProject };
          }
          if (!(source.currentTerms ?? source.current_terms ?? source.active_terms_hash) && editionAddress && subgraph2?.editionByAddress) {
            try {
              const detail = await subgraph2.editionByAddress(editionAddress);
              if (detail) source = { ...source, ...detail, currentTerms: detail.currentTerms ?? detail.current_terms ?? source.currentTerms, current_terms: detail.current_terms ?? detail.currentTerms ?? source.current_terms };
            } catch (error) {
              logger.info?.({ event: "discover_edition_detail_fallback", error: error.message, editionAddress });
            }
          }
          const currentTerms = source.currentTerms ?? source.current_terms ?? null;
          const termsHash = currentTerms?.hash ?? currentTerms?.terms_hash ?? source.active_terms_hash ?? null;
          const starts = currentTerms?.mintStartsAt ?? currentTerms?.mint_starts_at ?? source.mint_starts_at ?? source.mintStartsAt;
          const ends = currentTerms?.mintEndsAt ?? currentTerms?.mint_ends_at ?? source.mint_ends_at ?? source.mintEndsAt;
          const startsEpoch = epochSeconds(starts);
          const endsEpoch = epochSeconds(ends);
          const cap = Number(source.absolute_supply_cap ?? source.absoluteSupplyCap ?? 0);
          const minted = Number(source.total_minted ?? source.totalMinted ?? 0);
          let statusTag = "DRAFT";
          if (termsHash && startsEpoch != null && endsEpoch == null) statusTag = "PREVIEW";
          else if (termsHash && (startsEpoch == null || endsEpoch == null)) statusTag = "DRAFT";
          else if (termsHash && startsEpoch * 1e3 > now) statusTag = "PREVIEW";
          else if (termsHash && (endsEpoch * 1e3 < now || cap > 0 && minted >= cap)) statusTag = "CLOSED";
          else if (termsHash) {
            let mintOpen = null;
            const launchRegistry = orderPolicy2.transactionTargets?.TERMS_PUBLISH;
            if (chain2?.ethCall && isAddress(launchRegistry ?? "") && isAddress(editionAddress ?? "") && /^0x[0-9a-f]{64}$/i.test(String(termsHash))) {
              try {
                const encoded = AbiCoder.defaultAbiCoder().encode(["address", "bytes32"], [editionAddress, termsHash]);
                const result = await chain2.ethCall(launchRegistry, `${MINT_OPEN_SELECTOR}${encoded.slice(2)}`);
                mintOpen = BigInt(result) !== 0n;
              } catch {
                mintOpen = null;
              }
            }
            statusTag = mintOpen === true || mintOpen === null && !chain2?.ethCall ? "DEBUT" : "PREVIEW";
          }
          const watcherCount = readModelDisabled ? 0 : await store.getWatchlistCount?.(source.project_id ?? source.id ?? source.slug) ?? 0;
          const links = source.content?.links ?? source.launchDraft?.links ?? source.links ?? {};
          return { ...source, statusTag, watcherCount, links };
        }))).filter((project) => project && project.statusTag !== "DRAFT");
        return json(res, 200, { data, authority: subgraph2?.enabled ? "GOLDSKY_SUBGRAPH_READ_MODEL" : "POSTGRES_READ_MODEL" });
      }
      if (req.method === "GET" && url.pathname === "/v1/market/listings") {
        const listings = readModelDisabled ? [] : subgraph2?.enabled ? await subgraph2.listings() : await store.listings();
        return json(res, 200, { data: await attachSignedListingData(listings, store), authority: subgraph2?.enabled ? "GOLDSKY_SUBGRAPH_READ_MODEL_PLUS_SIGNED_ORDER" : "NEX_LISTING_REGISTRY_PROJECTION" });
      }
      if (req.method === "GET" && url.pathname.startsWith("/v1/projects/")) {
        const identifier = decodeURIComponent(url.pathname.slice(13));
        let project = readModelDisabled ? null : await store.projectBySlug(identifier);
        if (!project && /^0x[0-9a-f]{40}$/i.test(identifier) && store.projectByEditionAddress) project = await store.projectByEditionAddress(identifier);
        return json(res, 200, { data: project });
      }
      if (req.method === "GET" && url.pathname.startsWith("/v1/editions/")) {
        const address2 = url.pathname.slice(13);
        const indexed = readModelDisabled ? null : subgraph2?.enabled ? await subgraph2.editionByAddress(address2) : await store.editionByAddress(address2);
        let linkedProject = null;
        if (indexed && store.projectByEditionAddress) linkedProject = await store.projectByEditionAddress(address2);
        const commitments = store.termsCommitmentsForEdition ? await store.termsCommitmentsForEdition(address2) : [];
        if (indexed && commitments.length) {
          const byHash = new Map(commitments.map((row) => [String(row.advantagesHash).toLowerCase(), row]));
          const enrich = (term) => {
            const hash4 = String(term?.advantagesHash ?? term?.advantages_hash ?? "").toLowerCase();
            const commitment = hash4 ? byHash.get(hash4) : null;
            return commitment ? { ...commitment.termsPayload ?? {}, ...term, advantageConfigs: commitment.configs } : term;
          };
          indexed.currentTerms = enrich(indexed.currentTerms ?? indexed.current_terms);
          indexed.current_terms = indexed.currentTerms;
          indexed.terms = Array.isArray(indexed.terms) ? indexed.terms.map(enrich) : indexed.terms;
        }
        const data = indexed && linkedProject ? { ...indexed, project_id: linkedProject.id, project_slug: linkedProject.slug, project_name: linkedProject.name, builder_account_id: linkedProject.builder_account_id ?? linkedProject.builderAccountId, content: linkedProject.content, project: linkedProject } : indexed;
        return json(res, 200, { data, authority: subgraph2?.enabled ? "GOLDSKY_SUBGRAPH_READ_MODEL_PLUS_PROJECT_CONTENT" : "CHAIN_PROJECTION" });
      }
      if (req.method === "GET" && url.pathname.startsWith("/v1/passes/")) {
        const [, , , edition, tokenId] = url.pathname.split("/");
        const rawPass = readModelDisabled ? null : subgraph2?.enabled ? await subgraph2.pass(edition, tokenId) : await store.pass(edition, tokenId);
        if (!rawPass) return json(res, 404, { error: { code: "NOT_FOUND", requestId } });
        return json(res, 200, { data: { ...rawPass, passVault: formatPassVault(rawPass) }, authority: subgraph2?.enabled ? "GOLDSKY_SUBGRAPH_READ_MODEL_PLUS_RPC_VERIFICATION" : "CHAIN_PROJECTION" });
      }
      if (req.method === "GET" && /^\/v1\/media\/[^/]+\/content$/.test(url.pathname)) {
        if (!storage?.prepareDownload || !store.mediaById) throw Object.assign(new Error("MEDIA_STORAGE_UNAVAILABLE"), { status: 503 });
        const mediaId = decodeURIComponent(url.pathname.split("/")[3]);
        const row = await store.mediaById(mediaId);
        const safetyStatus = row?.safety_status ?? row?.safetyStatus;
        if (!row || safetyStatus !== "APPROVED") throw Object.assign(new Error("MEDIA_NOT_FOUND"), { status: 404 });
        const key = row.storage_key ?? row.storageKey;
        const download = await storage.prepareDownload({ key, expiresInSeconds: 300 });
        res.writeHead(307, { location: download.url, "cache-control": "public, max-age=300", "x-content-type-options": "nosniff" });
        return res.end();
      }
      if (req.method === "POST" && url.pathname === "/v1/auth/challenge") {
        const input = await readBody(req);
        const challenge = issueWalletChallenge({ accountId: `pending:${input.address?.toLowerCase()}`, address: input.address, origin: allowedOrigin, chainId: chainId2 });
        await store.saveChallenge(challenge);
        return json(res, 201, { nonce: challenge.nonce, message: challenge.message, expiresAt: challenge.expiresAt, chainId: chainId2 });
      }
      if (req.method === "POST" && url.pathname === "/v1/auth/verify") {
        const input = await readBody(req);
        const challenge = await store.challenge(input.nonce);
        if (!challenge) throw Object.assign(new Error("CHALLENGE_NOT_FOUND"), { status: 404 });
        assertChallengeUsable(challenge, { accountId: challenge.accountId, address: challenge.address, origin: allowedOrigin, chainId: chainId2 });
        verifyWalletChallengeSignature(challenge, input.signature);
        const issued = issueSession({ accountId: "pending", walletId: "pending" });
        const identity = await store.consumeChallengeAndCreateSession({ challenge, session: issued.record, signature: input.signature });
        return json(res, 200, { accountId: identity.accountId, wallet: challenge.address, csrfToken: issued.csrfToken }, { "set-cookie": sessionCookie(issued.token, { secure: secureCookies }) });
      }
      const token = cookies(req).nexmarkets_session;
      const session = token ? await store.sessionByToken(token) : null;
      if (!session) throw Object.assign(new Error("AUTH_REQUIRED"), { status: 401 });
      assertSession(session, token, { csrfToken: req.headers["x-csrf-token"], mutation: req.method !== "GET" });
      if (Number(session.chainId) !== Number(chainId2)) throw Object.assign(new Error("SESSION_NETWORK_MISMATCH"), { status: 401 });
      if (req.method === "GET" && url.pathname === "/v1/me/session") {
        const newCsrfToken = randomBytes5(32).toString("base64url");
        const newCsrfHash = createHash5("sha256").update(newCsrfToken).digest("hex");
        await store.refreshSessionCsrf?.(session.id, newCsrfHash);
        session.csrfHash = newCsrfHash;
        return json(res, 200, { authenticated: true, accountId: session.accountId, wallet: session.walletAddress, chainId: session.chainId, csrfToken: newCsrfToken });
      }
      if (req.method === "POST" && url.pathname === "/v1/auth/logout") {
        await store.revokeSession(session.id);
        await store.recordAudit?.({ accountId: session.accountId, walletAddress: session.walletAddress, action: "SESSION_REVOKED", objectType: "SESSION", objectId: session.id, requestId, correlationId });
        return json(res, 200, { status: "revoked" }, { "set-cookie": "nexmarkets_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0" });
      }
      if (req.method === "GET" && url.pathname === "/v1/me/passes") {
        const rawPasses = readModelDisabled ? [] : await store.ownedPasses(session.walletAddress);
        const data = (rawPasses ?? []).map((pass) => ({ ...pass, passVault: formatPassVault(pass) }));
        return json(res, 200, { data, authority: "CHAIN_PROJECTION" });
      }
      if (req.method === "GET" && url.pathname === "/v1/me/builders") {
        const builders = store.listBuildersForAccount ? await store.listBuildersForAccount(session.accountId) : [];
        return json(res, 200, { data: builders, authority: "BUILDER_MEMBERSHIP" });
      }
      if (req.method === "POST" && url.pathname === "/v1/builder/identities") {
        const input = await readBody(req);
        const displayName = String(input.displayName ?? input.display_name ?? "").trim().slice(0, 80);
        if (!displayName) throw Object.assign(new Error("BUILDER_DISPLAY_NAME_REQUIRED"), { status: 400 });
        const builder = await store.createBuilderIdentity(session.accountId, { displayName, bio: String(input.bio ?? "").slice(0, 1200), links: input.links ?? {} });
        await store.recordAudit?.({ accountId: session.accountId, walletAddress: session.walletAddress, action: "BUILDER_IDENTITY_CREATED", objectType: "BUILDER", objectId: builder.id, requestId, correlationId });
        return json(res, 201, { data: builder, authority: "BUILDER_MEMBERSHIP" });
      }
      if (req.method === "PUT" && url.pathname === "/v1/builder/profile") {
        const input = await readBody(req);
        const avatarUrl = String(input.avatarUrl ?? input.avatar_url ?? "").trim();
        if (/^(?:data|blob):/i.test(avatarUrl)) throw Object.assign(new Error("INVALID_AVATAR_URL"), { status: 400 });
        const avatarMediaId = mediaIdFromUrl(avatarUrl);
        if (avatarMediaId) await assertApprovedMediaReferences(store, session.accountId, { design: { logoAssetId: avatarMediaId, logoSrc: avatarUrl } });
        const links = {
          ...input.links && typeof input.links === "object" ? input.links : {},
          ...input.handle != null ? { handle: String(input.handle).slice(0, 80) } : {},
          ...input.positioning != null || input.tagline != null ? { positioning: String(input.positioning ?? input.tagline).slice(0, 180) } : {},
          ...input.website != null ? { website: String(input.website).slice(0, 300) } : {},
          ...input.x != null ? { x: String(input.x).slice(0, 120) } : {}
        };
        const profile = await store.upsertBuilderProfile(session.accountId, { ...input, links }, { builderId: input.builderId ?? input.builder_id ?? url.searchParams.get("builderId") });
        await store.recordAudit?.({ accountId: session.accountId, walletAddress: session.walletAddress, action: "BUILDER_PROFILE_UPDATED", objectType: "BUILDER_PROFILE", objectId: profile.id, requestId, correlationId });
        return json(res, 200, { data: profile });
      }
      if (req.method === "POST" && url.pathname === "/v1/builder/editions/link") {
        const input = await readBody(req);
        const factoryAddress = orderPolicy2.transactionTargets?.EDITION_CREATE;
        if (!isAddress(factoryAddress ?? "")) throw Object.assign(new Error("PASS_FACTORY_CONFIGURATION_REQUIRED"), { status: 503 });
        if (!/^0x[0-9a-fA-F]{64}$/.test(String(input.txHash ?? ""))) throw Object.assign(new Error("TX_HASH_REQUIRED"), { status: 400 });
        if (!isAddress(input.editionAddress ?? input.edition ?? "")) throw Object.assign(new Error("EDITION_ADDRESS_REQUIRED"), { status: 400 });
        if (!chain2?.getTransactionReceipt || !chain2?.getTransactionByHash) throw Object.assign(new Error("RPC_RECEIPT_VERIFICATION_UNAVAILABLE"), { status: 503 });
        const txHash = String(input.txHash).toLowerCase();
        const [receipt, transaction] = await Promise.all([chain2.getTransactionReceipt(txHash), chain2.getTransactionByHash(txHash)]);
        if (!receipt || !transaction) throw Object.assign(new Error("FACTORY_RECEIPT_NOT_FOUND"), { status: 409 });
        if (!["0x1", "0x01", 1, true].includes(receipt.status)) throw Object.assign(new Error("FACTORY_RECEIPT_REVERTED"), { status: 409 });
        let receiptAuthority = "RPC_FACTORY_RECEIPT";
        if (!transaction.to) throw Object.assign(new Error("FACTORY_RECEIPT_TARGET_MISMATCH"), { status: 400 });
        const transactionInput = transaction.input ?? transaction.data ?? "0x";
        if (getAddress(transaction.to) !== getAddress(factoryAddress)) {
          const safeAddress = orderPolicy2.protocolAdminSafe;
          if (!isAddress(safeAddress) || getAddress(transaction.to) !== getAddress(safeAddress)) throw Object.assign(new Error("FACTORY_RECEIPT_TARGET_MISMATCH"), { status: 400 });
          let safeCall;
          try {
            safeCall = SAFE_EXEC_INTERFACE.parseTransaction({ data: transactionInput });
          } catch {
            safeCall = null;
          }
          if (!safeCall || safeCall.name !== "execTransaction") throw Object.assign(new Error("SAFE_FACTORY_EXECUTION_REQUIRED"), { status: 400 });
          const [target, value, innerData, operation, safeTxGas, baseGas, gasPrice, gasToken, refundReceiver, signatures] = safeCall.args;
          if (getAddress(target) !== getAddress(factoryAddress) || BigInt(value) !== 0n || Number(operation) !== 0 || BigInt(safeTxGas) !== 0n || BigInt(baseGas) !== 0n || BigInt(gasPrice) !== 0n || getAddress(gasToken) !== getAddress("0x0000000000000000000000000000000000000000") || getAddress(refundReceiver) !== getAddress("0x0000000000000000000000000000000000000000")) throw Object.assign(new Error("SAFE_FACTORY_CALL_MISMATCH"), { status: 400 });
          let legacyCall;
          try {
            legacyCall = FACTORY_LEGACY_INTERFACE.parseTransaction({ data: innerData });
          } catch {
            legacyCall = null;
          }
          if (!legacyCall || legacyCall.name !== "createEdition") throw Object.assign(new Error("LEGACY_FACTORY_CALL_REQUIRED"), { status: 400 });
          const config = legacyCall.args[0];
          if (getAddress(config.initialOwner) !== getAddress(safeAddress) || getAddress(legacyCall.args[1]) !== getAddress(session.walletAddress)) throw Object.assign(new Error("SAFE_FACTORY_PUBLISHER_MISMATCH"), { status: 403 });
          const executionLog = (receipt.logs ?? []).find((entry) => entry?.address && getAddress(entry.address) === getAddress(safeAddress) && String(entry.topics?.[0] ?? "").toLowerCase() === SAFE_EXECUTION_SUCCESS_TOPIC && entry.topics?.[1]);
          const safeHash = executionLog ? String(executionLog.topics[1]).toLowerCase() : null;
          if (!safeHash) {
            if (!chain2.ethCall) throw Object.assign(new Error("SAFE_RECEIPT_VERIFICATION_UNAVAILABLE"), { status: 503 });
            const blockTag = `0x${BigInt(receipt.blockNumber).toString(16)}`;
            const nonceRaw = await chain2.ethCall(safeAddress, SAFE_NONCE_SELECTOR, blockTag);
            const nonceAfter = BigInt(nonceRaw);
            if (nonceAfter === 0n) throw Object.assign(new Error("SAFE_NONCE_UNAVAILABLE"), { status: 409 });
            const safeHashData = SAFE_HASH_INTERFACE.encodeFunctionData("getTransactionHash", [target, value, innerData, operation, safeTxGas, baseGas, gasPrice, gasToken, refundReceiver, nonceAfter - 1n]);
            const reconstructed = await chain2.ethCall(safeAddress, safeHashData, blockTag);
            if (recoverAddress(reconstructed, signatures) !== getAddress(session.walletAddress)) throw Object.assign(new Error("SAFE_SIGNATURE_MISMATCH"), { status: 403 });
          } else if (recoverAddress(safeHash, signatures) !== getAddress(session.walletAddress)) {
            throw Object.assign(new Error("SAFE_SIGNATURE_MISMATCH"), { status: 403 });
          }
          receiptAuthority = "RPC_SAFE_EXECUTION_PLUS_FACTORY_RECEIPT";
        }
        const created = parseFactoryEditionCreatedReceipt(receipt, { factoryAddress, publisherAddress: session.walletAddress, editionAddress: input.editionAddress ?? input.edition });
        if (created.txHash && created.txHash !== txHash) throw Object.assign(new Error("FACTORY_RECEIPT_HASH_MISMATCH"), { status: 400 });
        const linked = await store.linkEditionToProject({
          accountId: session.accountId,
          builderId: input.builderId ?? input.builder_id ?? null,
          projectId: input.projectId ?? input.project_id,
          edition: {
            chainId: chainId2,
            edition: created.edition,
            editionId: created.editionId,
            factoryAddress: getAddress(factoryAddress),
            publisher: created.publisher,
            absoluteSupplyCap: created.absoluteSupplyCap,
            artworkCommitment: created.artworkCommitment,
            blockNumber: created.blockNumber,
            blockHash: created.blockHash || String(receipt.blockHash ?? "").toLowerCase(),
            txHash,
            logIndex: created.logIndex
          }
        });
        await store.recordAudit?.({ accountId: session.accountId, walletAddress: session.walletAddress, action: "EDITION_LINKED_TO_PROJECT", objectType: "EDITION", objectId: linked.id, requestId, correlationId, metadata: { txHash, projectId: linked.project_id, editionAddress: linked.edition_address } });
        return json(res, 200, { data: linked, authority: `${receiptAuthority}_PLUS_POSTGRES_PROJECT_LINK` });
      }
      if (req.method === "POST" && url.pathname === "/v1/builder/milestones") {
        const input = await readBody(req);
        const milestone = await store.createMilestone(input.builderId ?? input.builder_id ?? session.accountId, input);
        await store.recordAudit?.({ accountId: session.accountId, walletAddress: session.walletAddress, action: "BUILDER_MILESTONE_CREATED", objectType: "BUILDER_MILESTONE", objectId: milestone.id, requestId, correlationId });
        return json(res, 201, { data: milestone });
      }
      if (req.method === "POST" && /^\/v1\/builders\/[^/]+\/questions$/.test(url.pathname)) {
        const builderId = url.pathname.split("/")[3];
        const profile = await store.getBuilderProfile(builderId);
        if (!profile) throw Object.assign(new Error("BUILDER_NOT_FOUND"), { status: 404 });
        const input = await readBody(req);
        const question = await store.createQuestion(session.accountId, profile.builder_id ?? profile.builderId ?? profile.id ?? builderId, input);
        return json(res, 201, { data: question });
      }
      if (req.method === "POST" && /^\/v1\/builder\/questions\/[^/]+\/answer$/.test(url.pathname)) {
        const questionId = url.pathname.split("/")[4];
        const input = await readBody(req);
        const question = await store.answerQuestion(session.accountId, questionId, input);
        return json(res, 200, { data: question });
      }
      if (req.method === "POST" && /^\/v1\/builders\/[^/]+\/follow$/.test(url.pathname)) {
        const builderId = url.pathname.split("/")[3];
        const result = await store.followBuilder(session.accountId, builderId);
        return json(res, 200, { data: result });
      }
      if (req.method === "DELETE" && /^\/v1\/builders\/[^/]+\/follow$/.test(url.pathname)) {
        const builderId = url.pathname.split("/")[3];
        const result = await store.unfollowBuilder(session.accountId, builderId);
        return json(res, 200, { data: result });
      }
      if (req.method === "GET" && /^\/v1\/builders\/[^/]+\/follow-status$/.test(url.pathname)) {
        const builderId = url.pathname.split("/")[3];
        const status = await store.getFollowStatus(session.accountId, builderId);
        return json(res, 200, { data: status });
      }
      if (req.method === "GET" && url.pathname === "/v1/me/following") {
        const followed = await store.getFollowedBuilders(session.accountId);
        return json(res, 200, { data: followed });
      }
      if (req.method === "POST" && /^\/v1\/projects\/[^/]+\/watch$/.test(url.pathname)) {
        const slug = decodeURIComponent(url.pathname.split("/")[3]);
        const result = await store.watchProject(session.accountId, slug);
        return json(res, 200, { data: result });
      }
      if (req.method === "DELETE" && /^\/v1\/projects\/[^/]+\/watch$/.test(url.pathname)) {
        const slug = decodeURIComponent(url.pathname.split("/")[3]);
        const result = await store.unwatchProject(session.accountId, slug);
        return json(res, 200, { data: result });
      }
      if (req.method === "GET" && url.pathname === "/v1/me/watchlist") {
        const watchlist = await store.getWatchlist(session.accountId);
        return json(res, 200, { data: watchlist });
      }
      if (req.method === "GET" && url.pathname === "/v1/feed") {
        const feed = await store.getFeed(session.accountId);
        return json(res, 200, { data: feed });
      }
      if (req.method === "GET" && url.pathname === "/v1/me/advantages") return json(res, 200, { data: readModelDisabled ? [] : await store.advantagesForOwner(session.walletAddress), authority: "NEX_ADVANTAGE_REGISTRY_PROJECTION" });
      if (req.method === "GET" && url.pathname === "/v1/builder/drafts") {
        const dashboard = readModelDisabled ? { projects: [] } : await store.builderDashboard(session.accountId, { builderId: url.searchParams.get("builderId") });
        const drafts = (dashboard.projects ?? []).filter((project) => String(project.status ?? "").toUpperCase() === "DRAFT");
        return json(res, 200, { data: drafts });
      }
      if (req.method === "GET" && /^\/v1\/builder\/drafts\/[^/]+$/.test(url.pathname)) {
        const draftId = decodeURIComponent(url.pathname.split("/")[4]);
        const dashboard = readModelDisabled ? { projects: [] } : await store.builderDashboard(session.accountId, { builderId: url.searchParams.get("builderId") });
        const draft = (dashboard.projects ?? []).find((project) => project.content?.draftId === draftId || project.launchDraft?.draftId === draftId || project.id === draftId);
        if (!draft) throw Object.assign(new Error("DRAFT_NOT_FOUND"), { status: 404 });
        return json(res, 200, { data: draft });
      }
      if (req.method === "GET" && url.pathname === "/v1/builder/dashboard") return json(res, 200, { data: readModelDisabled ? { projects: [], editions: [], royalties: [], referrals: [], primarySales: [], earnings: { grossAmountUsdg: "0", nexmarketsFeeUsdg: "0", builderProceedsUsdg: "0", referralObligationUsdg: "0", salesCount: 0, unitsSold: 0 } } : await store.builderDashboard(session.accountId, { builderId: url.searchParams.get("builderId") }), authority: "POSTGRES_BUILDER_AND_PRIMARY_ACCOUNTING" });
      if (req.method === "GET" && url.pathname.startsWith("/v1/transactions/")) {
        const tx = await store.transaction(url.pathname.slice(17), session.accountId, chainId2);
        if (!tx) throw Object.assign(new Error("NOT_FOUND"), { status: 404 });
        return json(res, 200, { data: tx });
      }
      if (req.method === "POST" && /^\/v1\/transactions\/[^/]+\/events$/.test(url.pathname)) {
        const id2 = url.pathname.split("/")[3];
        const input = await readBody(req);
        const transaction = await store.transaction(id2, session.accountId, chainId2);
        if (!transaction) throw Object.assign(new Error("NOT_FOUND"), { status: 404 });
        if (!["WALLET_PENDING", "SUBMITTED", "CANCELLED"].includes(input.state)) throw Object.assign(new Error("USER_TRANSACTION_STATE_REJECTED"), { status: 400 });
        if (transaction.state !== input.state) transitionTransaction(transaction.state, input.state);
        if (input.state === "SUBMITTED" && !/^0x[0-9a-fA-F]{64}$/.test(input.txHash ?? "")) throw Object.assign(new Error("TX_HASH_REQUIRED"), { status: 400 });
        const eventId = String(input.eventId ?? "").slice(0, 160);
        if (!eventId) throw Object.assign(new Error("EVENT_ID_REQUIRED"), { status: 400 });
        const updated = await store.updateTransaction({ id: id2, accountId: session.accountId, eventId, fromState: transaction.state, toState: input.state, evidence: { txHash: input.txHash?.toLowerCase() } });
        return json(res, 200, { data: updated });
      }
      if (req.method === "POST" && url.pathname === "/v1/builder/projects") {
        const input = await readBody(req, 16777216);
        const draftIntent = String(input.status ?? input.intent ?? "").trim().toUpperCase() === "DRAFT" && String(input.status ?? "").trim().toUpperCase() !== "PUBLISHED";
        if (draftIntent) {
          const normalized2 = validateAndNormalizeProjectPayload(input, { status: "DRAFT", allowIncomplete: true, freezeAssignments: false });
          const project2 = await store.createProject({
            accountId: session.accountId,
            builderId: input.builderId ?? input.builder_id ?? url.searchParams.get("builderId"),
            body: {
              slug: normalized2.slug,
              name: normalized2.name,
              summary: normalized2.summary,
              status: "DRAFT",
              launchDraft: normalized2.launchDraft
            }
          });
          await store.recordAudit?.({ accountId: session.accountId, walletAddress: session.walletAddress, action: "PROJECT_DRAFT_SAVED", objectType: "PROJECT", objectId: project2.id, requestId, correlationId });
          return json(res, 201, { data: project2 });
        }
        const normalized = validateAndNormalizeProjectPayload(input, { status: "PUBLISHED", freezeAssignments: true });
        const debutAt = new Date(normalized.launchDraft.preview.opensAt);
        const hasExplicitTiming = Boolean(input.launchDraft?.preview?.opensAt || input.launchDraft?.preview?.startsAt);
        if (hasExplicitTiming && input.publicationMode !== "ONCHAIN" && (Number.isNaN(debutAt.getTime()) || debutAt.getTime() < Date.now() + 24 * 60 * 60 * 1e3)) {
          throw Object.assign(new Error("PREVIEW_WINDOW_REQUIRED"), { status: 400 });
        }
        normalized.launchDraft.preview.startsAt = normalized.launchDraft.preview.startsAt || (/* @__PURE__ */ new Date()).toISOString();
        normalized.launchDraft.preview.publishedAt = (/* @__PURE__ */ new Date()).toISOString();
        normalized.launchDraft.preview.termsVersion = normalized.launchDraft.preview.termsVersion || "v1.0";
        assertLaunchArtworkReady(normalized.launchDraft);
        await assertApprovedMediaReferences(store, session.accountId, normalized.launchDraft);
        const project = await store.createProject({
          accountId: session.accountId,
          builderId: input.builderId ?? input.builder_id ?? url.searchParams.get("builderId"),
          body: {
            slug: normalized.slug,
            name: normalized.name,
            summary: normalized.summary,
            status: normalized.status,
            launchDraft: normalized.launchDraft
          }
        });
        await store.recordAudit?.({ accountId: session.accountId, walletAddress: session.walletAddress, action: "PROJECT_CREATED", objectType: "PROJECT", objectId: project.id, requestId, correlationId });
        return json(res, 201, { data: project });
      }
      if (req.method === "POST" && url.pathname === "/v1/builder/drafts" || req.method === "PUT" && /^\/v1\/builder\/drafts\/[^/]+$/.test(url.pathname)) {
        const input = await readBody(req, 16777216);
        const routeDraftId = req.method === "PUT" ? decodeURIComponent(url.pathname.split("/")[4]) : null;
        const draftId = String(routeDraftId ?? input.draftId ?? input.launchDraft?.draftId ?? `draft-${randomUUID3()}`).slice(0, 120);
        const launchDraft = { ...input.launchDraft ?? {}, draftId, status: "DRAFT" };
        const normalized = validateAndNormalizeProjectPayload({ ...input, draftId, launchDraft, status: "DRAFT" }, { status: "DRAFT", allowIncomplete: true });
        const project = await store.createProject({
          accountId: session.accountId,
          builderId: input.builderId ?? input.builder_id ?? url.searchParams.get("builderId"),
          body: {
            slug: normalized.slug,
            name: normalized.name,
            summary: normalized.summary,
            status: "DRAFT",
            launchDraft: normalized.launchDraft
          }
        });
        await store.recordAudit?.({ accountId: session.accountId, walletAddress: session.walletAddress, action: "PROJECT_DRAFT_SAVED", objectType: "PROJECT", objectId: project.id, requestId, correlationId });
        return json(res, 200, { data: project });
      }
      if (req.method === "POST" && url.pathname === "/v1/media/uploads") {
        if (!storage?.prepareUpload) throw Object.assign(new Error("MEDIA_STORAGE_UNAVAILABLE"), { status: 503 });
        const input = await readBody(req);
        if (!Number.isInteger(input.byteSize) || input.byteSize <= 0 || input.byteSize > MEDIA_POLICY.maxBytes || !/^image\/(jpeg|png|webp|avif)$/.test(input.mimeType ?? "") || !/^[0-9a-f]{64}$/.test(input.sha256 ?? "")) throw Object.assign(new Error("INVALID_MEDIA"), { status: 400 });
        const extension = String(input.filename ?? "").split(".").pop()?.toLowerCase();
        const extensions = { "image/jpeg": ["jpg", "jpeg"], "image/png": ["png"], "image/webp": ["webp"], "image/avif": ["avif"] };
        if (!extensions[input.mimeType]?.includes(extension)) throw Object.assign(new Error("MIME_EXTENSION_MISMATCH"), { status: 400 });
        const key = `${session.accountId}/${randomUUID3()}/${String(input.filename).replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const row = await store.createMedia({ accountId: session.accountId, metadata: { storageKey: key, filename: input.filename, mimeType: input.mimeType, byteSize: input.byteSize, sha256: input.sha256, safetyStatus: "PENDING" } });
        await store.recordAudit?.({ accountId: session.accountId, walletAddress: session.walletAddress, action: "MEDIA_UPLOAD_PREPARED", objectType: "MEDIA", objectId: row.id, requestId, correlationId, metadata: { mimeType: input.mimeType, byteSize: input.byteSize } });
        const asset = mediaAssetView(row);
        if (asset.safetyStatus === "APPROVED" && asset.url) return json(res, 200, { data: { asset, upload: null, deduplicated: true } });
        const storageKey = row.storage_key ?? row.storageKey;
        return json(res, 201, { data: { asset, upload: await storage.prepareUpload({ key: storageKey, mimeType: input.mimeType, byteSize: input.byteSize, sha256: input.sha256 }), deduplicated: storageKey !== key } });
      }
      if (req.method === "POST" && /^\/v1\/media\/[^/]+\/complete$/.test(url.pathname)) {
        if (!storage?.readObject || !store.mediaById || !store.approveMedia) throw Object.assign(new Error("MEDIA_STORAGE_UNAVAILABLE"), { status: 503 });
        const mediaId = decodeURIComponent(url.pathname.split("/")[3]);
        const row = await store.mediaById(mediaId);
        const ownerAccountId = row?.owner_account_id ?? row?.ownerAccountId;
        if (!row) throw Object.assign(new Error("MEDIA_NOT_FOUND"), { status: 404 });
        if (ownerAccountId !== session.accountId) throw Object.assign(new Error("MEDIA_OWNER_MISMATCH"), { status: 403 });
        const existing = mediaAssetView(row);
        if (existing.safetyStatus === "APPROVED" && existing.url) return json(res, 200, { data: { asset: existing, deduplicated: true } });
        const storageKey = row.storage_key ?? row.storageKey;
        const expectedMime = row.mime_type ?? row.mimeType;
        const expectedSize = Number(row.byte_size ?? row.byteSize);
        const expectedHash = String(row.sha256 || "").toLowerCase();
        const object = await storage.readObject({ key: storageKey, maxBytes: MEDIA_POLICY.maxBytes });
        const inspected = inspectImageBytes({ bytes: object.bytes, mimeType: expectedMime });
        if (inspected.byteSize !== expectedSize) throw Object.assign(new Error("MEDIA_SIZE_MISMATCH"), { status: 400 });
        if (inspected.sha256 !== expectedHash || object.metadataChecksum && object.metadataChecksum.toLowerCase() !== expectedHash) throw Object.assign(new Error("MEDIA_CHECKSUM_MISMATCH"), { status: 400 });
        const publicUrl = `/v1/media/${encodeURIComponent(row.id)}/content`;
        const approved = await store.approveMedia({ id: row.id, accountId: session.accountId, publicUrl, width: inspected.width, height: inspected.height, mimeType: inspected.mimeType, byteSize: inspected.byteSize, sha256: inspected.sha256 });
        if (!approved) throw Object.assign(new Error("MEDIA_OWNER_MISMATCH"), { status: 403 });
        await store.recordAudit?.({ accountId: session.accountId, walletAddress: session.walletAddress, action: "MEDIA_UPLOAD_VERIFIED", objectType: "MEDIA", objectId: row.id, requestId, correlationId, metadata: { mimeType: inspected.mimeType, byteSize: inspected.byteSize, width: inspected.width, height: inspected.height, sha256: inspected.sha256 } });
        return json(res, 200, { data: { asset: mediaAssetView(approved), deduplicated: false } });
      }
      if (req.method === "POST" && url.pathname === "/v1/listings/signed-order") {
        const input = await readBody(req);
        const listing = await store.listing(input.orderHash ?? "");
        if (String(input.order?.offerer ?? "").toLowerCase() !== session.walletAddress.toLowerCase()) throw Object.assign(new Error("SELLER_SESSION_MISMATCH"), { status: 403 });
        const computedHash = seaportOrderHash(input.order, input.counter);
        if (computedHash.toLowerCase() !== String(input.orderHash).toLowerCase()) throw Object.assign(new Error("ORDER_HASH_MISMATCH"), { status: 400 });
        if (listing) validateProjectedNexMarketsOrder(input.order, listing, orderPolicy2);
        else if (String(input.order.zone).toLowerCase() !== String(orderPolicy2.zone).toLowerCase()) throw Object.assign(new Error("ZONE_MISMATCH"), { status: 400 });
        verifySeaportOrderSignature({ order: input.order, counter: input.counter, signature: input.signature, chainId: session.chainId, seaport: orderPolicy2.seaport });
        const stored = await store.storeSignedOrder({ accountId: session.accountId, chainId: session.chainId, orderHash: computedHash, seller: session.walletAddress, order: input.order, counter: input.counter, signature: input.signature });
        await store.recordAudit?.({ accountId: session.accountId, walletAddress: session.walletAddress, action: "SEAPORT_ORDER_STORED", objectType: "LISTING", objectId: computedHash, requestId, correlationId });
        return json(res, 201, { data: stored, authority: "SIGNED_ORDER_CAPABILITY_ONLY" });
      }
      if (req.method === "POST" && url.pathname === "/v1/listings/buy") {
        const input = await readBody(req);
        const idempotencyKey = req.headers["idempotency-key"]?.toString();
        if (!idempotencyKey || idempotencyKey.length > 128) throw Object.assign(new Error("IDEMPOTENCY_KEY_REQUIRED"), { status: 400 });
        const signed = await store.signedOrder(input.orderHash ?? "");
        if (!signed || signed.status !== "ACTIVE" || new Date(signed.expires_at ?? signed.expiresAt).getTime() <= Date.now()) throw Object.assign(new Error("ACTIVE_SIGNED_LISTING_REQUIRED"), { status: 409 });
        const order = signed.order_payload ?? signed.order;
        const listing = await store.listing(input.orderHash);
        validateProjectedNexMarketsOrder(order, listing, orderPolicy2);
        verifySeaportOrderSignature({ order, counter: signed.counter, signature: signed.signature, chainId: session.chainId, seaport: orderPolicy2.seaport });
        const prepared = buildSeaportFulfillment({ order, signature: signed.signature, seaport: orderPolicy2.seaport });
        const transaction = await store.prepareTransaction({ accountId: session.accountId, walletAddress: session.walletAddress, chainId: session.chainId, intentType: "LISTING_BUY", intentId: input.orderHash, idempotencyKey, correlationId, requestId, toAddress: prepared.to, calldata: prepared.data });
        await store.recordAudit?.({ accountId: session.accountId, walletAddress: session.walletAddress, action: "TRANSACTION_PREPARED", objectType: "CHAIN_TRANSACTION", objectId: transaction.id, requestId, correlationId, metadata: { intentType: "LISTING_BUY", orderHash: input.orderHash } });
        return json(res, 201, { transaction, prepared, totalBuyerPayment: String(listing.price_usdg ?? listing.priceUsdg), walletMustSign: true, serverCustodiesKey: false });
      }
      if (req.method === "POST" && url.pathname === "/v1/terms/hash") {
        const input = await readBody(req);
        const advantagesHash = canonicalAdvantagesHash(input.configs ?? input.advantageConfigs ?? []);
        if (!advantagesHash) throw Object.assign(new Error("ADVANTAGES_COMMITMENT_INVALID"), { status: 400 });
        return json(res, 200, { data: { advantagesHash } });
      }
      if (req.method === "POST" && url.pathname === "/v1/allowlists/merkle") {
        const input = await readBody(req);
        if (!Array.isArray(input.addresses) || input.addresses.length > 1e4) throw Object.assign(new Error("ALLOWLIST_ADDRESSES_REQUIRED"), { status: 400 });
        let data;
        try {
          data = buildAllowlist(input.addresses);
        } catch {
          throw Object.assign(new Error("ALLOWLIST_ADDRESS_INVALID"), { status: 400 });
        }
        return json(res, 200, { data, authority: "DETERMINISTIC_MERKLE_COMMITMENT" });
      }
      if (req.method === "POST" && INTENT_TYPE[url.pathname]) {
        const input = await readBody(req);
        const idempotencyKey = req.headers["idempotency-key"]?.toString();
        if (!idempotencyKey || idempotencyKey.length > 128) throw Object.assign(new Error("IDEMPOTENCY_KEY_REQUIRED"), { status: 400 });
        let prepared = { calldata: input.calldata ?? null, payload: input };
        if (url.pathname === "/v1/listings/prepare") {
          if (String(input.seller).toLowerCase() !== session.walletAddress.toLowerCase()) throw Object.assign(new Error("SELLER_SESSION_MISMATCH"), { status: 403 });
          prepared = buildNexMarketsOrder({ ...input, ...orderPolicy2 });
          if (prepared.orderHash) prepared.typedData = seaportTypedData(prepared.order, input.counter, { chainId: session.chainId, seaport: orderPolicy2.seaport });
        } else {
          const intentType = INTENT_TYPE[url.pathname];
          const target = orderPolicy2.transactionTargets?.[intentType];
          if (!isAddress(target ?? "")) throw Object.assign(new Error("CONTRACT_CONFIGURATION_REQUIRED"), { status: 503 });
          if (input.to !== void 0 && (!isAddress(input.to) || getAddress(input.to) !== getAddress(target))) throw Object.assign(new Error("TRANSACTION_TARGET_REJECTED"), { status: 400 });
          let calldata = input.calldata;
          let protocolInput = input;
          if (intentType === "TERMS_PUBLISH") {
            const requestsV2 = Number(input.protocolVersion ?? 1) >= 2 || Object.hasOwn(input.terms ?? {}, "allowlistRoot");
            if (requestsV2 && activeProtocolVersion < 2) throw Object.assign(new Error("PROTOCOL_V2_REQUIRED"), { status: 409 });
            if (!isAddress(input.edition ?? "") || !/^0x[0-9a-fA-F]{64}$/.test(input.terms?.advantagesHash ?? "")) throw Object.assign(new Error("TERMS_COMMITMENT_REQUIRED"), { status: 400 });
            const computedAdvantagesHash = canonicalAdvantagesHash(input.advantageConfigs ?? []);
            if (!computedAdvantagesHash || computedAdvantagesHash.toLowerCase() !== input.terms.advantagesHash.toLowerCase()) throw Object.assign(new Error("ADVANTAGES_COMMITMENT_MISMATCH"), { status: 400 });
            let allowlist = null;
            if (Array.isArray(input.allowlistAddresses)) {
              try {
                allowlist = buildAllowlist(input.allowlistAddresses);
              } catch {
                throw Object.assign(new Error("ALLOWLIST_ADDRESS_INVALID"), { status: 400 });
              }
              if (allowlist.root.toLowerCase() !== String(input.terms.allowlistRoot ?? "").toLowerCase()) throw Object.assign(new Error("ALLOWLIST_COMMITMENT_MISMATCH"), { status: 400 });
            }
            await store.saveTermsCommitment?.({ builderAccountId: session.accountId, builderId: input.builderId ?? input.builder_id ?? null, editionAddress: input.edition, advantagesHash: input.terms.advantagesHash, termsPayload: { ...input.terms, ...allowlist ? { allowlistAddresses: allowlist.entries.map((entry) => entry.account) } : {} }, configs: input.advantageConfigs ?? [] });
            calldata = void 0;
          }
          if (intentType === "MINT" && input.edition && input.termsVersionHash) {
            let indexedEdition = null;
            try {
              indexedEdition = subgraph2?.enabled ? await subgraph2.editionByAddress(input.edition) : await store.editionByAddress?.(input.edition);
            } catch {
            }
            const terms = indexedEdition?.currentTerms ?? indexedEdition?.current_terms ?? null;
            const activeHash = terms?.hash ?? terms?.terms_hash ?? terms?.termsHash ?? indexedEdition?.active_terms_hash ?? null;
            if (!terms || !activeHash) throw Object.assign(new Error("MINT_TERMS_REQUIRED"), { status: 409 });
            if (String(activeHash).toLowerCase() !== String(input.termsVersionHash).toLowerCase()) throw Object.assign(new Error("MINT_TERMS_STALE"), { status: 409 });
            const now = Math.floor(Date.now() / 1e3);
            const starts = epochSeconds(terms.mintStartsAt ?? terms.mint_starts_at ?? indexedEdition.mint_starts_at);
            const ends = epochSeconds(terms.mintEndsAt ?? terms.mint_ends_at ?? indexedEdition.mint_ends_at);
            if (starts == null || now < starts) throw Object.assign(new Error("MINT_NOT_OPEN_PREVIEW"), { status: 409 });
            if (ends != null && now >= ends) throw Object.assign(new Error("MINT_CLOSED"), { status: 409 });
            const cap = Number(indexedEdition.absolute_supply_cap ?? indexedEdition.absoluteSupplyCap ?? 0);
            const minted = Number(indexedEdition.total_minted ?? indexedEdition.totalMinted ?? 0);
            const quantity2 = Number(input.quantity ?? 1);
            if (cap > 0 && minted + quantity2 > cap) throw Object.assign(new Error("SUPPLY_EXHAUSTED"), { status: 409 });
            const allowlistRoot = terms.allowlistRoot ?? terms.allowlist_root;
            const allowlistEndsAt = epochSeconds(terms.allowlistEndsAt ?? terms.allowlist_ends_at);
            if (allowlistRoot && !/^0x0{64}$/i.test(String(allowlistRoot)) && allowlistEndsAt != null && now < allowlistEndsAt) {
              let proof = input.allowlistProof;
              if (!Array.isArray(proof)) {
                const commitments = await store.termsCommitmentsForEdition?.(input.edition) ?? [];
                const commitment = commitments.find((row) => String(row.termsPayload?.allowlistRoot ?? "").toLowerCase() === String(allowlistRoot).toLowerCase());
                const addresses = commitment?.termsPayload?.allowlistAddresses;
                if (!Array.isArray(addresses)) throw Object.assign(new Error("ALLOWLIST_PROOF_REQUIRED"), { status: 403 });
                const tree = buildAllowlist(addresses);
                const entry = tree.entries.find((item) => item.account.toLowerCase() === session.walletAddress.toLowerCase());
                if (!entry) throw Object.assign(new Error("WALLET_NOT_ALLOWLISTED"), { status: 403 });
                proof = entry.proof;
              }
              protocolInput = { ...input, allowlistProof: proof };
            } else if (Array.isArray(input.allowlistProof)) {
              const { allowlistProof: _expiredProof, ...publicMintInput } = input;
              protocolInput = publicMintInput;
            }
          }
          if (intentType === "ADVANTAGE_USE" && input.operation === "REDEEM_AMOUNT" && activeProtocolVersion < 2) {
            throw Object.assign(new Error("PROTOCOL_V2_REQUIRED"), { status: 409 });
          }
          if (intentType === "MINT" && Array.isArray(protocolInput.allowlistProof) && activeProtocolVersion < 2) {
            throw Object.assign(new Error("PROTOCOL_V2_REQUIRED"), { status: 409 });
          }
          if (calldata === void 0) calldata = buildProtocolCalldata(intentType, protocolInput, { walletAddress: session.walletAddress, idempotencyKey });
          if (!/^0x[0-9a-fA-F]+$/.test(calldata ?? "") || !INTENT_SELECTORS[intentType]?.includes(calldata.slice(0, 10).toLowerCase())) throw Object.assign(new Error("CALLDATA_SELECTOR_REJECTED"), { status: 400 });
          prepared = { to: getAddress(target), data: calldata, value: "0x0" };
        }
        const transaction = await store.prepareTransaction({ accountId: session.accountId, walletAddress: session.walletAddress, chainId: session.chainId, intentType: INTENT_TYPE[url.pathname], intentId: input.intentId ?? idempotencyKey, idempotencyKey, correlationId, requestId, toAddress: prepared.to ?? prepared.registryTransaction?.to ?? null, calldata: prepared.data ?? prepared.registryTransaction?.data ?? null });
        await store.recordAudit?.({ accountId: session.accountId, walletAddress: session.walletAddress, action: "TRANSACTION_PREPARED", objectType: "CHAIN_TRANSACTION", objectId: transaction.id, requestId, correlationId, metadata: { intentType: INTENT_TYPE[url.pathname] } });
        return json(res, 201, { transaction, prepared, walletMustSign: true, serverCustodiesKey: false });
      }
      return json(res, 404, { error: { code: "NOT_FOUND", requestId } });
    } catch (error) {
      metrics.increment("nexmarkets_api_failures_total");
      const clientFailure = /(?:INVALID|MISMATCH|REJECTED|REQUIRED|CONFLICT|expired|consumed|challenge|signature|wrong|extra|surcharge|price|tokenId|listing|seller|zoneHash|royaltyBps|CALLDATA|TARGET|PROJECT_BUILDER|PRODUCTION_READINESS)/i.test(error.message);
      const status = error.status ?? (/AUTH|SESSION/.test(error.message) ? 401 : /CSRF|ORIGIN/.test(error.message) ? 403 : clientFailure ? 400 : 500);
      const code = status >= 500 && !/PRODUCTION_READINESS/.test(error.message) ? "INTERNAL_ERROR" : error.message;
      logger.error?.({ event: "api_request_failed", requestId, correlationId, method: req.method, path: req.url?.split("?")[0], code, error: error.message, durationMs: Date.now() - startedAt });
      return json(res, status, { error: { code, requestId } });
    } finally {
      logger.info?.({ event: "api_request_complete", requestId, correlationId, method: req.method, path: req.url?.split("?")[0], durationMs: Date.now() - startedAt });
    }
  });
}
if (!process.env.VERCEL && !process.env.AWS_LAMBDA_FUNCTION_NAME && import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const store = new PostgresStore();
  const port = Number(process.env.PORT || 4010);
  const networkConfigs = createNetworkConfigs(process.env);
  const defaultKey = process.env.NEXMARKETS_DEFAULT_NETWORK ?? (process.env.ROBINHOOD_CHAIN_ID ? networkKeyForChainId(Number(process.env.ROBINHOOD_CHAIN_ID)) : "base-sepolia");
  const configured = networkConfigs[defaultKey ?? "base-sepolia"];
  const chainId = configured.chainId;
  const rpc = configured.chain;
  const subgraph = configured.subgraph;
  const secureCookies = process.env.SECURE_COOKIES === "true" ? true : process.env.SECURE_COOKIES === "false" ? false : process.env.NODE_ENV !== "test";
  const requireIndexedReadiness = process.env.REQUIRE_INDEXED_READINESS !== "false";
  const logger = process.env.LOG_API_ERRORS === "true" ? console : { info() {
  }, error() {
  } };
  const storage = createObjectStorageFromEnv(process.env);
  const server = createApiServer({ store, chainId, chain: rpc, subgraph, secureCookies, logger, storage, maxIndexerLagBlocks: Number(process.env.INDEXER_MAX_LAG_BLOCKS ?? 120), maxFinalityLagBlocks: Number(process.env.INDEXER_MAX_FINALITY_LAG_BLOCKS ?? 120), orderPolicy: configured.orderPolicy, networkConfigs, requireIndexedReadiness, productionReadiness: configured.productionReadiness, requireProductionReadiness: process.env.NODE_ENV === "production" });
  server.listen(port, () => console.log(JSON.stringify({ event: "api_started", port })));
  const shutdown = async () => {
    server.close();
    await store.close();
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

// api-src/_server.js
init_memory_store();
var requestListener = null;
async function getApiListener() {
  if (requestListener) return requestListener;
  const networkConfigs = createNetworkConfigs(process.env);
  const defaultKey = process.env.NEXMARKETS_DEFAULT_NETWORK || "base-sepolia";
  const defaultNetwork = networkConfigs[defaultKey] || networkConfigs.baseSepolia || networkConfigs["base-sepolia"];
  const chainId = Number(defaultNetwork.chainId);
  let store = null;
  if (process.env.DATABASE_URL) {
    try {
      const { PostgresStore: PostgresStore2 } = await Promise.resolve().then(() => (init_postgres_store(), postgres_store_exports));
      store = new PostgresStore2({ connectionString: process.env.DATABASE_URL });
    } catch {
      store = new MemoryStore();
    }
  } else {
    store = new MemoryStore();
  }
  const rateLimiter = new RateLimiter({ limit: 300, windowMs: 6e4 });
  const server = createApiServer({
    store,
    chainId: defaultNetwork.chainId,
    chain: defaultNetwork.chain,
    subgraph: defaultNetwork.subgraph,
    allowedOrigin: process.env.APP_ORIGIN ?? "https://www.nexmarkets.xyz",
    secureCookies: process.env.NODE_ENV === "production",
    orderPolicy: defaultNetwork.orderPolicy,
    networkConfigs,
    rateLimiter,
    requireIndexedReadiness: false
  });
  requestListener = server.listeners("request")[0];
  return requestListener;
}

// api-src/v1.js
function normalizeV1RequestUrl(req) {
  const incoming = new URL(req.url || "/api/v1", "http://nexmarkets.local");
  const queryPath = Array.isArray(req.query?.path) ? req.query.path.join("/") : req.query?.path;
  const capturedPath = String(queryPath || incoming.searchParams.get("path") || "discover").replace(/^\/+|\/+$/g, "");
  incoming.searchParams.delete("path");
  const search = incoming.searchParams.toString();
  return `/v1/${capturedPath}${search ? `?${search}` : ""}`;
}
async function handler(req, res) {
  try {
    req.url = normalizeV1RequestUrl(req);
    const listener = await getApiListener();
    return await listener(req, res);
  } catch (err) {
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "V1_ROUTING_ERROR", message: err.message, stack: err.stack }));
  }
}
export {
  handler as default,
  normalizeV1RequestUrl
};
/*! Bundled license information:

@noble/hashes/esm/utils.js:
  (*! noble-hashes - MIT License (c) 2022 Paul Miller (paulmillr.com) *)

@noble/curves/esm/abstract/utils.js:
  (*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) *)

@noble/curves/esm/abstract/modular.js:
  (*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) *)

@noble/curves/esm/abstract/curve.js:
  (*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) *)

@noble/curves/esm/abstract/weierstrass.js:
  (*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) *)

@noble/curves/esm/_shortw_utils.js:
  (*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) *)

@noble/curves/esm/secp256k1.js:
  (*! noble-curves - MIT License (c) 2022 Paul Miller (paulmillr.com) *)
*/
