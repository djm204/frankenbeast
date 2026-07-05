function printLine(...args) {
  console.info(...args);
}

export function summarize() {
  return 'tiny-node fixture';
}

printLine(summarize());
