enum ScannerState {
  Code = 'code',
  SingleLineComment = 'singleLineComment',
  MultiLineComment = 'multiLineComment',
  SingleQuote = 'singleQuote',
  DoubleQuote = 'doubleQuote',
  TemplateString = 'templateString',
}

export function stripCommentsAndStringLiterals(content: string): string {
  let result = '';
  let state: ScannerState = ScannerState.Code;

  for (let i = 0; i < content.length; i++) {
    const ch = content[i]!;
    const next = content[i + 1];

    if (state === ScannerState.Code) {
      if (ch === '/' && next === '/') {
        state = ScannerState.SingleLineComment;
        result += '  ';
        i += 1;
        continue;
      }

      if (ch === '/' && next === '*') {
        state = ScannerState.MultiLineComment;
        result += '  ';
        i += 1;
        continue;
      }

      if (ch === "'") {
        state = ScannerState.SingleQuote;
        result += ' ';
        continue;
      }

      if (ch === '"') {
        state = ScannerState.DoubleQuote;
        result += ' ';
        continue;
      }

      if (ch === '`') {
        state = ScannerState.TemplateString;
        result += ' ';
        continue;
      }

      result += ch;
      continue;
    }

    if (state === ScannerState.SingleLineComment) {
      if (ch === '\n') {
        state = ScannerState.Code;
        result += '\n';
      } else {
        result += ' ';
      }
      continue;
    }

    if (state === ScannerState.MultiLineComment) {
      if (ch === '*' && next === '/') {
        state = ScannerState.Code;
        result += '  ';
        i += 1;
        continue;
      }

      result += ch === '\n' ? '\n' : ' ';
      continue;
    }

    if (state === ScannerState.SingleQuote) {
      if (ch === '\\') {
        result += ' ';
        if (i + 1 < content.length) {
          result += ' ';
          i += 1;
        }
        continue;
      }

      if (ch === "'") {
        state = ScannerState.Code;
        result += ' ';
        continue;
      }

      result += ch === '\n' ? '\n' : ' ';
      continue;
    }

    if (state === ScannerState.DoubleQuote) {
      if (ch === '\\') {
        result += ' ';
        if (i + 1 < content.length) {
          result += ' ';
          i += 1;
        }
        continue;
      }

      if (ch === '"') {
        state = ScannerState.Code;
        result += ' ';
        continue;
      }

      result += ch === '\n' ? '\n' : ' ';
      continue;
    }

    if (state === ScannerState.TemplateString) {
      if (ch === '\\') {
        result += ' ';
        if (i + 1 < content.length) {
          result += content[i + 1] === '\n' ? '\n' : ' ';
          i += 1;
        }
        continue;
      }

      if (ch === '`') {
        state = ScannerState.Code;
        result += ' ';
        continue;
      }

      result += ch === '\n' ? '\n' : ' ';
    }
  }

  return result;
}
