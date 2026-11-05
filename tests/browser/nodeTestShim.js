// Minimal browser stand-in for `node:test`, mapped by tests/index.html.
// `test()` only registers; tests/index.html runs them once every file is imported.

export const registeredTests = [];

let currentFile = '';

export function setCurrentFile(name) {
  currentFile = name;
}

export function test(name, fn) {
  registeredTests.push({ file: currentFile, name, fn });
}
