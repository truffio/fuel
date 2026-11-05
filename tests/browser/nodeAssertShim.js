// Minimal browser stand-in for `node:assert/strict`, mapped by tests/index.html.
// Implements only the methods the test files use, with strict semantics.

export class AssertionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AssertionError';
  }
}

function show(value) {
  try {
    return typeof value === 'string' ? JSON.stringify(value) : JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

function fail(message, fallback) {
  throw new AssertionError(message ?? fallback);
}

function isDeepStrictEqual(a, b) {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false;
  if (Array.isArray(a) && a.length !== b.length) return false;

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  return keysA.every((key) => Object.hasOwn(b, key) && isDeepStrictEqual(a[key], b[key]));
}

function ok(value, message) {
  if (!value) fail(message, `Expected a truthy value, got ${show(value)}`);
}

function equal(actual, expected, message) {
  if (!Object.is(actual, expected)) fail(message, `Expected ${show(expected)}, got ${show(actual)}`);
}

function notEqual(actual, expected, message) {
  if (Object.is(actual, expected)) fail(message, `Expected a value different from ${show(expected)}`);
}

function deepEqual(actual, expected, message) {
  if (!isDeepStrictEqual(actual, expected)) {
    fail(message, `Values are not deeply equal:\n  actual:   ${show(actual)}\n  expected: ${show(expected)}`);
  }
}

function match(actual, regexp, message) {
  if (typeof actual !== 'string' || !regexp.test(actual)) {
    fail(message, `Expected ${show(actual)} to match ${regexp}`);
  }
}

function throws(fn, message) {
  try {
    fn();
  } catch {
    return;
  }
  fail(typeof message === 'string' ? message : undefined, 'Expected the function to throw');
}

const assert = Object.assign(ok, { ok, equal, notEqual, deepEqual, match, throws, AssertionError });
export default assert;
