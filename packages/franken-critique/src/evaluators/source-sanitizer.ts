enum ScannerState {
  Code = 'code',
  SingleLineComment = 'singleLineComment',
  MultiLineComment = 'multiLineComment',
  SingleQuote = 'singleQuote',
  DoubleQuote = 'doubleQuote',
  TemplateString = 'templateString',
}

interface TemplateExpressionRead {
  value: string;
  endIndex: number;
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

      if (ch === '$' && next === '{') {
        const expression = readTemplateExpression(content, i + 1);
        result += `  ${stripCommentsAndStringLiterals(expression.value)} `;
        i = expression.endIndex;
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

function readTemplateExpression(
  content: string,
  openBraceIndex: number,
): TemplateExpressionRead {
  let depth = 1;
  let value = '';

  for (let i = openBraceIndex + 1; i < content.length; i++) {
    const ch = content[i]!;
    const next = content[i + 1];

    if (ch === '/' && next === '/') {
      const endIndex = skipSingleLineComment(content, i + 2);
      value += content.slice(i, Math.min(endIndex + 1, content.length));
      i = endIndex;
      continue;
    }

    if (ch === '/' && next === '*') {
      const endIndex = skipMultiLineComment(content, i + 2);
      value += content.slice(i, Math.min(endIndex + 1, content.length));
      i = endIndex;
      continue;
    }

    if (ch === "'" || ch === '"' || ch === '`') {
      const endIndex = skipStringLiteral(content, i);
      value += content.slice(i, Math.min(endIndex + 1, content.length));
      i = endIndex;
      continue;
    }

    if (ch === '{') {
      depth += 1;
      value += ch;
      continue;
    }

    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return { value, endIndex: i };
      value += ch;
      continue;
    }

    value += ch;
  }

  return { value, endIndex: content.length };
}

function skipSingleLineComment(content: string, index: number): number {
  const newlineIndex = content.indexOf('\n', index);
  return newlineIndex === -1 ? content.length : newlineIndex;
}

function skipMultiLineComment(content: string, index: number): number {
  const endIndex = content.indexOf('*/', index);
  return endIndex === -1 ? content.length : endIndex + 1;
}

function skipStringLiteral(content: string, startIndex: number): number {
  const quote = content[startIndex]!;

  for (let i = startIndex + 1; i < content.length; i++) {
    const ch = content[i]!;

    if (ch === '\\') {
      i += 1;
      continue;
    }

    if (ch === quote) return i;
  }

  return content.length;
}
