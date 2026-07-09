import type { Evaluator, EvaluationInput, EvaluationResult, EvaluationFinding } from './evaluator.js';

const HARDCODED_URL_PATTERN = /["'](https?:\/\/(?:localhost|127\.0\.0\.1)[^"']*)["']/g;
const HARDCODED_IP_PATTERN = /["'](\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})["']/g;
const NON_PORT_IDENTIFIER_EXCLUSIONS = String.raw`(?:[Dd]efault)?[Vv]iew_?[Pp]orts?\w*|(?:DEFAULT_)?VIEW_PORTS?\w*|\w*(?:ViewPorts?|VIEW_PORTS?|view_ports?|view_?ports?|View_?Ports?|[Ss]upport_[Pp]ortal|[Tt]ransports?\b|[Ss]upports?\b|[Pp]ortal(?:s|Id)?\b|[Pp]ortfolios?\b|[Rr]eports?(?![Pp]ort)\w*|[Ii]mports?(?![Pp]ort)\w*|[Ee]xports?(?![Pp]ort)\w*|[Ii]mportant(?![Pp]ort)\w*|REPORT(?!_?PORT)\w*|IMPORT(?!_?PORT)\w*|EXPORT(?!_?PORT)\w*|IMPORTANT(?!_?PORT)\w*)|[Aa]irports?\w*|[Pp]assports?\w*|[Ss]ports?\w*`;
const PORT_IDENTIFIER_PATTERN = String.raw`(?<![\w$])(?!(?:${NON_PORT_IDENTIFIER_EXCLUSIONS})(?![\w$]))\w*[Pp][Oo][Rr][Tt][Ss]?(?=$|[^a-z0-9_$]|[A-Z0-9_])\w*(?![\w$])`;
const PORT_CONFIG_KEY_PATTERN = PORT_IDENTIFIER_PATTERN;
const QUOTED_PORT_KEY_PATTERN = String.raw`["'](?!(?:[Vv][Ii][Ee][Ww][-.][Pp][Oo][Rr][Tt][Ss]?|[^"']*[-._][Vv][Ii][Ee][Ww][-.][Pp][Oo][Rr][Tt][Ss]?)[^"']*["'])(?:[A-Za-z0-9_]+[-.])*[Pp][Oo][Rr][Tt][Ss]?(?:[-.][A-Za-z0-9_]+)*["']`;
const PORT_NUMBER_PATTERN = String.raw`(\d[\d_]{1,6})`;
const PORT_PROPERTY_GAP_PATTERN = String.raw`(?:\s|/\*[\s\S]*?\*/|//[^\n]*(?:\n|$))*`;
const PORT_TYPE_ANNOTATION_PATTERN = String.raw`(?:\s*:\s*(?:[^=;,\n<>]+|[^=;\n<>]*<[^=;]*>[^=;\n]*))?`;
const DECLARATION_PORT_SUGGESTION = 'Use process.env.PORT or a config object instead';
const CONFIG_PORT_SUGGESTION = 'Move port to environment variable or external configuration';
const HARDCODED_PORT_PATTERNS = [
  {
    pattern: new RegExp(
      String.raw`(?:export\s+)?(?:const|let|var)\s+${PORT_IDENTIFIER_PATTERN}${PORT_TYPE_ANNOTATION_PATTERN}\s*=\s*${PORT_NUMBER_PATTERN}\b`,
      'g',
    ),
    suggestion: DECLARATION_PORT_SUGGESTION,
  },
  {
    pattern: new RegExp(
      String.raw`(?:^|[,{])${PORT_PROPERTY_GAP_PATTERN}(?:["']?${PORT_CONFIG_KEY_PATTERN}["']?|${QUOTED_PORT_KEY_PATTERN}|\[\s*(?:["']${PORT_CONFIG_KEY_PATTERN}["']|${QUOTED_PORT_KEY_PATTERN})\s*\])${PORT_PROPERTY_GAP_PATTERN}:${PORT_PROPERTY_GAP_PATTERN}${PORT_NUMBER_PATTERN}\b`,
      'g',
    ),
    suggestion: CONFIG_PORT_SUGGESTION,
    skipTypeOnly: true,
  },
  {
    pattern: new RegExp(String.raw`\.\s*#?${PORT_CONFIG_KEY_PATTERN}\s*(?:=|\?\?=|\|\|=|&&=)\s*${PORT_NUMBER_PATTERN}\b`, 'g'),
    suggestion: CONFIG_PORT_SUGGESTION,
  },
  {
    pattern: new RegExp(String.raw`\[\s*(?:["']${PORT_CONFIG_KEY_PATTERN}["']|${QUOTED_PORT_KEY_PATTERN})\s*\]\s*(?:=|\?\?=|\|\|=|&&=)\s*${PORT_NUMBER_PATTERN}\b`, 'g'),
    suggestion: CONFIG_PORT_SUGGESTION,
  },
  {
    pattern: new RegExp(
      String.raw`(?:^|[;{\n])${PORT_PROPERTY_GAP_PATTERN}(?:(?:public|private|protected|readonly|override|declare|accessor|static)\s+)*#?${PORT_IDENTIFIER_PATTERN}${PORT_TYPE_ANNOTATION_PATTERN}\s*=\s*${PORT_NUMBER_PATTERN}\b`,
      'g',
    ),
    suggestion: CONFIG_PORT_SUGGESTION,
  },
];

export class ScalabilityEvaluator implements Evaluator {
  readonly name = 'scalability';
  readonly category = 'heuristic' as const;

  async evaluate(input: EvaluationInput): Promise<EvaluationResult> {
    if (!input.content.trim()) {
      return { evaluatorName: this.name, verdict: 'pass', score: 1, findings: [] };
    }

    const findings: EvaluationFinding[] = [];

    this.checkHardcodedUrls(input.content, findings);
    this.checkHardcodedIPs(input.content, findings);
    this.checkHardcodedPorts(input.content, findings);

    const score = Math.max(0, 1 - findings.length * 0.25);

    return {
      evaluatorName: this.name,
      verdict: findings.length === 0 ? 'pass' : 'fail',
      score,
      findings,
    };
  }

  private checkHardcodedUrls(content: string, findings: EvaluationFinding[]): void {
    for (const match of content.matchAll(HARDCODED_URL_PATTERN)) {
      findings.push({
        message: `Found hardcoded URL: "${match[1]}". Use environment variables or config.`,
        severity: 'warning',
        suggestion: 'Move URL to environment variable or configuration file',
      });
    }
  }

  private checkHardcodedIPs(content: string, findings: EvaluationFinding[]): void {
    for (const match of content.matchAll(HARDCODED_IP_PATTERN)) {
      findings.push({
        message: `Found hardcoded IP address: "${match[1]}". Use environment variables or config.`,
        severity: 'warning',
        suggestion: 'Move IP address to environment variable or DNS hostname',
      });
    }
  }

  private checkHardcodedPorts(content: string, findings: EvaluationFinding[]): void {
    const scanContent = this.maskCommentsAndStrings(content);
    const typeOnlyRanges = this.findTypeOnlyBraceRanges(scanContent);
    const ignoredRanges = this.findCommentAndStringRanges(content);
    const seenPortNumberIndexes = new Set<number>();

    for (const { pattern, suggestion, skipTypeOnly } of HARDCODED_PORT_PATTERNS) {
      for (const match of content.matchAll(pattern)) {
        const portNumberIndex = this.findPortNumberIndex(match);
        const matchIndex = match.index ?? 0;
        const startsInIgnoredRange = this.isInTypeOnlyRange(ignoredRanges, matchIndex);
        if ((startsInIgnoredRange && !/^\s*["']/.test(match[0])) || this.isInTypeOnlyRange(ignoredRanges, portNumberIndex)) {
          continue;
        }

        if (skipTypeOnly && (this.isInTypeOnlyRange(typeOnlyRanges, match.index) || this.isInTypeOnlySignature(scanContent, match.index))) {
          continue;
        }

        if (skipTypeOnly && this.isParameterLiteralType(content, match.index, portNumberIndex)) {
          continue;
        }

        if (skipTypeOnly && this.isClassFieldTypeAnnotation(scanContent, portNumberIndex)) {
          continue;
        }

        if (skipTypeOnly && this.isTupleElementLiteralType(content, match.index, portNumberIndex)) {
          continue;
        }

        if (seenPortNumberIndexes.has(portNumberIndex)) {
          continue;
        }
        seenPortNumberIndexes.add(portNumberIndex);

        findings.push({
          message: `Found hardcoded port number: ${match[1]}. Use environment variables or config.`,
          severity: 'warning',
          suggestion,
        });
      }
    }

    this.checkPluralPortContainers(content, scanContent, findings, ignoredRanges, typeOnlyRanges, seenPortNumberIndexes);
  }

  private checkPluralPortContainers(
    content: string,
    scanContent: string,
    findings: EvaluationFinding[],
    ignoredRanges: Array<[number, number]>,
    typeOnlyRanges: Array<[number, number]>,
    seenPortNumberIndexes: Set<number>,
  ): void {
    const containerPattern = new RegExp(
      String.raw`(?:^|[,{])${PORT_PROPERTY_GAP_PATTERN}((?:["']?${PORT_CONFIG_KEY_PATTERN}["']?|${QUOTED_PORT_KEY_PATTERN}|\[\s*(?:["']${PORT_CONFIG_KEY_PATTERN}["']|${QUOTED_PORT_KEY_PATTERN})\s*\]))${PORT_PROPERTY_GAP_PATTERN}:${PORT_PROPERTY_GAP_PATTERN}([\[{])`,
      'g',
    );

    for (const match of content.matchAll(containerPattern)) {
      const matchIndex = match.index ?? 0;
      const containerKey = match[1] ?? '';
      const containerStart = matchIndex + match[0].lastIndexOf(match[2] ?? '');
      const normalizedContainerKey = this.normalizePortKey(containerKey);
      if (this.isInTypeOnlyRange(ignoredRanges, containerStart)) {
        continue;
      }
      if (/^(?:[Aa]irports?|[Cc]arports?|[Pp]assports?|[Ss]ports?)(?![-._]?[Pp][Oo][Rr][Tt][Ss])(?:$|[^a-z0-9]|[A-Z_])/.test(normalizedContainerKey)) {
        continue;
      }
      if (/^(?:[Tt]ransports|[Ss]upports)(?![-._]?[Pp][Oo][Rr][Tt][Ss])(?:$|[^a-z0-9]|[A-Z])/.test(normalizedContainerKey)) {
        continue;
      }
      if (!/[Pp][Oo][Rr][Tt][Ss](?:$|[^a-z0-9]|[A-Z])/.test(normalizedContainerKey)) {
        continue;
      }
      if (this.isInTypeOnlyRange(typeOnlyRanges, matchIndex) ||
        this.isInTypeOnlySignature(scanContent, matchIndex) ||
        this.isParameterContainerLiteralType(scanContent, matchIndex, containerStart)) {
        continue;
      }

      const containerEnd = this.findBalancedContainerEnd(content, containerStart, ignoredRanges);
      if (containerEnd <= containerStart) {
        continue;
      }

      const body = content.slice(containerStart + 1, containerEnd);
      for (const numberMatch of body.matchAll(new RegExp(String.raw`(?<![\w$])${PORT_NUMBER_PATTERN}\b`, 'g'))) {
        const portNumber = numberMatch[1];
        const portNumberIndex = containerStart + 1 + (numberMatch.index ?? 0);
        if (this.isInTypeOnlyRange(ignoredRanges, portNumberIndex) ||
          seenPortNumberIndexes.has(portNumberIndex) ||
          this.isNonPortObjectValueInContainer(content, containerStart, portNumberIndex)) {
          continue;
        }
        seenPortNumberIndexes.add(portNumberIndex);
        findings.push({
          message: `Found hardcoded port number: ${portNumber}. Use environment variables or config.`,
          severity: 'warning',
          suggestion: CONFIG_PORT_SUGGESTION,
        });
      }
    }
  }

  private findBalancedContainerEnd(content: string, containerStart: number, ignoredRanges: Array<[number, number]>): number {
    const open = content[containerStart];
    const close = open === '[' ? ']' : '}';
    let depth = 0;

    for (let index = containerStart; index < content.length; index += 1) {
      if (this.isInTypeOnlyRange(ignoredRanges, index)) {
        continue;
      }
      if (content[index] === open) {
        depth += 1;
      } else if (content[index] === close) {
        depth -= 1;
        if (depth === 0) {
          return index;
        }
      }
    }

    return -1;
  }

  private isNonPortArrayValueInContainer(prefix: string, arrayStart: number): boolean {
    const beforeArray = prefix.slice(0, arrayStart);
    const keyStart = Math.max(beforeArray.lastIndexOf(','), beforeArray.lastIndexOf('{'), beforeArray.lastIndexOf('[')) + 1;
    const keyPrefix = beforeArray.slice(keyStart);
    if (!/:\s*$/.test(keyPrefix)) {
      return false;
    }
    const key = keyPrefix.replace(/:\s*$/, '').trim();
    return !new RegExp(String.raw`^(?:["']?${PORT_CONFIG_KEY_PATTERN}["']?|${QUOTED_PORT_KEY_PATTERN}|\[\s*(?:["']${PORT_CONFIG_KEY_PATTERN}["']|${QUOTED_PORT_KEY_PATTERN})\s*\])$`).test(key);
  }

  private isNonPortObjectValueInContainer(content: string, containerStart: number, portNumberIndex: number): boolean {
    const prefix = content.slice(containerStart + 1, portNumberIndex);
    const lastComma = prefix.lastIndexOf(',');
    const lastBrace = prefix.lastIndexOf('{');
    const lastBracket = prefix.lastIndexOf('[');
    const valueStart = Math.max(lastComma, lastBrace, lastBracket) + 1;
    if (lastBracket > prefix.lastIndexOf(']') && this.isNonPortArrayValueInContainer(prefix, lastBracket)) {
      return true;
    }
    const valuePrefix = prefix.slice(valueStart);
    if (!/:\s*$/.test(valuePrefix)) {
      return false;
    }
    const keyPrefix = valuePrefix.replace(/:\s*$/, '').trim();
    const nestedContainerPrefix = prefix.slice(0, valueStart);
    const normalizedParentKey = this.normalizePortKey(content.slice(Math.max(0, containerStart - 120), containerStart));
    const isPortKey = new RegExp(String.raw`^(?:["']?${PORT_CONFIG_KEY_PATTERN}["']?|${QUOTED_PORT_KEY_PATTERN}|\[\s*(?:["']${PORT_CONFIG_KEY_PATTERN}["']|${QUOTED_PORT_KEY_PATTERN})\s*\])$`).test(keyPrefix);
    if (/Options\s*:?\s*$/i.test(normalizedParentKey)) {
      return !isPortKey;
    }
    if (!/[\[{]/.test(nestedContainerPrefix)) {
      return false;
    }
    return !isPortKey;
  }

  private normalizePortKey(key: string): string {
    return key.replace(/[\"'\[\]]/g, '').trim();
  }

  private isInTypeOnlyRange(ranges: Array<[number, number]>, matchIndex: number): boolean {
    return ranges.some(([start, end]) => matchIndex >= start && matchIndex <= end);
  }

  private findPortNumberIndex(match: RegExpMatchArray): number {
    const matchIndex = match.index ?? 0;
    return matchIndex + match[0].lastIndexOf(match[1] ?? '');
  }

  private isParameterLiteralType(content: string, matchIndex: number, portNumberIndex: number): boolean {
    if (content[matchIndex] !== ',') {
      return false;
    }

    const suffix = content.slice(portNumberIndex).match(/^\d[\d_]*\s*[,)]/);
    if (!suffix) {
      return false;
    }

    const openParen = this.findUnclosedOpenBefore(content, matchIndex, '(', ')');
    if (openParen === -1) {
      return false;
    }

    const beforeParen = content.slice(Math.max(0, openParen - 2000), openParen);
    const beforeMatchInParams = content.slice(openParen + 1, matchIndex);
    if (/[{[]/.test(beforeMatchInParams)) {
      return false;
    }
    return /(?:\bfunction\b|=>\s*$|=\s*$|\btype\s+\w+(?:<[^>{}]*>)?\s*=\s*$|\b\w+\s*$)/s.test(beforeParen) && /\b\w+\??\s*:\s*[^,]+$/s.test(beforeMatchInParams);
  }

  private isParameterContainerLiteralType(content: string, matchIndex: number, containerStart: number): boolean {
    if (content[matchIndex] !== ',') {
      return false;
    }

    const openParen = this.findUnclosedOpenBefore(content, matchIndex, '(', ')');
    if (openParen === -1) {
      return false;
    }

    const beforeParen = content.slice(Math.max(0, openParen - 2000), openParen);
    const beforeMatchInParams = content.slice(openParen + 1, matchIndex);
    const annotationPrefix = content.slice(matchIndex, containerStart);
    return /(?:\bfunction\b|=>\s*$|=\s*$|\btype\s+\w+(?:<[^>{}]*>)?\s*=\s*$|\b\w+\s*$)/s.test(beforeParen) &&
      !/[{[]/.test(beforeMatchInParams) &&
      /^,\s*\w+\??\s*:\s*$/.test(annotationPrefix);
  }

  private findUnclosedOpenBefore(content: string, beforeIndex: number, open: string, close: string): number {
    let depth = 0;
    for (let index = beforeIndex - 1; index >= 0; index -= 1) {
      const current = content[index];
      if (current === close) {
        depth += 1;
      } else if (current === open) {
        if (depth === 0) {
          return index;
        }
        depth -= 1;
      }
    }
    return -1;
  }

  private isTupleElementLiteralType(content: string, matchIndex: number, portNumberIndex: number): boolean {
    if (content[matchIndex] !== ',') {
      return false;
    }

    const suffix = content.slice(portNumberIndex).match(/^\d[\d_]*\s*(?:,|\])/);
    if (!suffix) {
      return false;
    }

    const prefix = content.slice(Math.max(0, matchIndex - 300), matchIndex);
    const openBracket = prefix.lastIndexOf('[');
    if (openBracket === -1) {
      return false;
    }

    const beforeBracket = prefix.slice(0, openBracket);
    const tuplePrefix = prefix.slice(openBracket + 1);
    return /(?:\btype\s+\w+(?:<[^>{}]*>)?\s*=\s*$|:\s*$|\bas\s*$|\bsatisfies\s*$|[\w$.]+\s*<\s*$)/s.test(beforeBracket) && /\b\w+\s*:\s*[^,\]]+$/s.test(tuplePrefix);
  }

  private isClassFieldTypeAnnotation(content: string, portNumberIndex: number): boolean {
    const suffix = content.slice(portNumberIndex).match(/^\d[\d_]*\s*(?:;|(?=[}\n]))/);
    if (!suffix) {
      return false;
    }

    const prefix = content.slice(Math.max(0, portNumberIndex - 2000), portNumberIndex);
    const openBrace = prefix.lastIndexOf('{');
    if (openBrace === -1) {
      return false;
    }

    const beforeBrace = prefix.slice(0, openBrace);
    const afterBrace = prefix.slice(openBrace + 1);
    const classFieldPattern = new RegExp(String.raw`(?:^|[;\n])\s*${PORT_IDENTIFIER_PATTERN}\s*:\s*$`, 's');
    return /\bclass(?:\s+\w+(?:<[^>{}]*>)?)?(?:\s+extends\s+[^{}]+?)?(?:\s+implements\s+[^{}]+?)?\s*$/.test(beforeBrace) && classFieldPattern.test(afterBrace);
  }

  private findTypeOnlyBraceRanges(content: string): Array<[number, number]> {
    const stack: Array<{ index: number; typeOnly: boolean }> = [];
    const ranges: Array<[number, number]> = [];

    for (let index = 0; index < content.length; index += 1) {
      if (content[index] === '{') {
        stack.push({ index, typeOnly: this.startsTypeOnlyBrace(content, index) || stack.some((entry) => entry.typeOnly) });
      } else if (content[index] === '}') {
        const entry = stack.pop();
        if (entry?.typeOnly) {
          ranges.push([entry.index, index]);
        }
      }
    }

    return ranges;
  }

  private startsTypeOnlyBrace(content: string, openBraceIndex: number): boolean {
    const prefix = content.slice(0, openBraceIndex);
    const semicolonStart = prefix.lastIndexOf(';') + 1;
    const newlineStart = prefix.lastIndexOf('\n') + 1;
    let statementStart = Math.max(semicolonStart, newlineStart);
    let statementPrefix = prefix.slice(statementStart);
    const linePrefix = prefix.slice(Math.max(prefix.lastIndexOf('\n') + 1, prefix.lastIndexOf(';') + 1));
    if (/<[A-Z][\w.:-]*(?:\s+[\w:-]+(?:\s*=\s*(?:[^\s{}]+|\{[^{}]*\}))?)*\s+[\w:-]+\s*=\s*$/s.test(linePrefix)) {
      return false;
    }
    if (/\?[^;{}]*:\s*$/s.test(prefix) && !/[\w$]\?\s*:\s*$/s.test(prefix)) {
      return false;
    }
    const boundaryStart = Math.max(prefix.lastIndexOf(';'), prefix.lastIndexOf('}')) + 1;
    const previousStatementPrefix = prefix.slice(boundaryStart);
    if (!/\n\s*(?:const|let|var|function|class)\b/s.test(previousStatementPrefix) &&
      (/^\s*$/.test(statementPrefix) || !/(?:^|[;\n])\s*(?:export\s+|declare\s+)*(?:type\s+\w+|interface\s+\w+)/s.test(statementPrefix)) &&
      /(?:^|[;\n])\s*(?:export\s+|declare\s+)*(?:type\s+\w+[\s\S]*=|interface\s+\w+[\s\S]*)\s*$/s.test(previousStatementPrefix)) {
      statementStart = boundaryStart;
      statementPrefix = prefix.slice(statementStart);
    }
    if (!/\n\s*(?:const|let|var|function|class)\b/s.test(previousStatementPrefix) &&
      (/^\s*(?:export\s+|declare\s+)*interface\s+\w+[\s\S]*$/s.test(previousStatementPrefix) ||
        /^\s*(?:export\s+|declare\s+)*type\s+\w+[\s\S]*=\s*$/s.test(previousStatementPrefix))) {
      return true;
    }
    const typeAliasContext = /^\s*(?:export\s+|declare\s+)*type\s+\w+[\s\S]*=[^;]*$/s.test(statementPrefix);
    return /^\s*(?:(?:export\s+|declare\s+)*type\s+\w+[\s\S]*=\s*|(?:export\s+|declare\s+)*interface\s+\w+[^{}]*)$/s.test(statementPrefix) ||
      /(?:^|[;\n{])\s*(?:export\s+|declare\s+)*interface\s+\w+(?:<[^>{}]*>)?(?:\s+extends\s+[^{}]+)?\s*$/s.test(statementPrefix) ||
      /\b(?:as\s*|satisfies\s*)$/s.test(prefix) ||
      /(?:^|[\n;])\s*(?:export\s+|declare\s+)*(?:const|let|var)\s+\w+\s*:\s*$/s.test(prefix) ||
      /\(\s*\w+\??\s*:\s*(?:[\w$.]+\s*<\s*)?$/s.test(prefix) ||
      /\([^({}]*?(?:\(|,)\s*\w+\??\s*:\s*(?:[\w$.]+\s*<\s*)?$/s.test(prefix) ||
      /\)\s*:\s*(?:[\w$.]+\s*<\s*)?$/s.test(prefix) ||
      /\bas\s+[\w$.]+\s*<\s*$/s.test(prefix) ||
      /(?:<|\bextends)\s*$/s.test(prefix) ||
      /<[^<>{}();]*(?:=|,)\s*$/s.test(prefix) ||
      /<[^=;{}]*,\s*$/s.test(prefix) ||
      (/(?:^|[^&])&\s*$/s.test(prefix) || /(?:^|[^|])\|\s*$/s.test(prefix)) ||
      (typeAliasContext && /(?:=|&|\||<|,|\(|:|\?)\s*$/s.test(prefix));
  }

  private isInTypeOnlySignature(content: string, matchIndex: number): boolean {
    const prefix = content.slice(Math.max(0, matchIndex - 200), matchIndex);
    return /\btype\s+\w+(?:<[^>{}]*>)?\s*=[^;\n{}]*$/s.test(prefix);
  }

  private maskCommentsAndStrings(content: string): string {
    const ignoredRanges = this.findCommentAndStringRanges(content);
    let masked = '';
    let previous = 0;

    for (const [start, end] of ignoredRanges) {
      masked += content.slice(previous, start);
      masked += content.slice(start, end + 1).replace(/[^\n]/g, ' ');
      previous = end + 1;
    }

    return masked + content.slice(previous);
  }

  private findCommentAndStringRanges(content: string): Array<[number, number]> {
    const ranges: Array<[number, number]> = [];
    let index = 0;

    while (index < content.length) {
      const current = content[index];
      const next = content[index + 1];

      if (current === '/' && next === '/') {
        const end = content.indexOf('\n', index + 2);
        const stop = end === -1 ? content.length : end;
        ranges.push([index, stop - 1]);
        index = stop;
        continue;
      }

      if (current === '/' && next === '*') {
        const end = content.indexOf('*/', index + 2);
        const stop = end === -1 ? content.length : end + 2;
        ranges.push([index, stop - 1]);
        index = stop;
        continue;
      }

      if (current === '/' && this.startsRegexLiteral(content, index)) {
        const stop = this.findRegexLiteralEnd(content, index);
        ranges.push([index, stop - 1]);
        index = stop;
        continue;
      }

      if (current === '`' && content[index + 1] === '`' && content[index + 2] === '`') {
        let stop = index + 3;
        while (content[stop] === '`') {
          stop += 1;
        }
        index = stop;
        continue;
      }

      if (current === '`') {
        index = this.collectTemplateLiteralRanges(content, index, ranges);
        continue;
      }

      if (current === '"' || current === "'") {
        const quote = current;
        let stop = index + 1;
        while (stop < content.length) {
          if (content[stop] === '\\') {
            stop += 2;
            continue;
          }
          if (content[stop] === quote) {
            stop += 1;
            break;
          }
          stop += 1;
        }
        ranges.push([index, stop - 1]);
        index = stop;
        continue;
      }

      index += 1;
    }

    return ranges;
  }

  private collectTemplateLiteralRanges(content: string, templateStart: number, ranges: Array<[number, number]>): number {
    let index = templateStart + 1;
    let segmentStart = templateStart;

    while (index < content.length) {
      if (content[index] === '\\') {
        index += 2;
        continue;
      }

      if (content[index] === '$' && content[index + 1] === '{') {
        ranges.push([segmentStart, index]);
        const expressionStart = index + 2;
        const expressionEnd = this.findTemplateInterpolationEnd(content, expressionStart);
        for (const [start, end] of this.findCommentAndStringRanges(content.slice(expressionStart, expressionEnd))) {
          ranges.push([expressionStart + start, expressionStart + end]);
        }
        index = expressionEnd + 1;
        segmentStart = index;
        continue;
      }

      if (content[index] === '`') {
        ranges.push([segmentStart, index]);
        return index + 1;
      }

      index += 1;
    }

    ranges.push([segmentStart, content.length - 1]);
    return content.length;
  }

  private findTemplateInterpolationEnd(content: string, expressionStart: number): number {
    let index = expressionStart;
    let depth = 1;

    while (index < content.length) {
      const current = content[index];
      if (current === '\\') {
        index += 2;
        continue;
      }

      if (current === '/' && content[index + 1] === '/') {
        const lineEnd = content.indexOf('\n', index + 2);
        index = lineEnd === -1 ? content.length : lineEnd + 1;
        continue;
      }

      if (current === '/' && content[index + 1] === '*') {
        const commentEnd = content.indexOf('*/', index + 2);
        index = commentEnd === -1 ? content.length : commentEnd + 2;
        continue;
      }

      if (current === '"' || current === "'" || current === '`') {
        index = this.findQuotedRangeEnd(content, index);
        continue;
      }

      if (current === '/' && this.startsRegexLiteral(content, index)) {
        index = this.findRegexLiteralEnd(content, index);
        continue;
      }

      if (current === '{') {
        depth += 1;
      } else if (current === '}') {
        depth -= 1;
        if (depth === 0) {
          return index;
        }
      }

      index += 1;
    }

    return content.length - 1;
  }

  private findQuotedRangeEnd(content: string, quoteStart: number): number {
    const quote = content[quoteStart];
    let index = quoteStart + 1;

    while (index < content.length) {
      if (content[index] === '\\') {
        index += 2;
        continue;
      }
      if (content[index] === quote) {
        return index + 1;
      }
      index += 1;
    }

    return content.length;
  }

  private startsRegexLiteral(content: string, slashIndex: number): boolean {
    let previous = slashIndex - 1;
    while (previous >= 0 && /\s/.test(content.charAt(previous))) {
      previous -= 1;
    }

    const prefix = content.slice(Math.max(0, slashIndex - 40), slashIndex);
    return previous < 0 || /[=(:,\[{};!&|?]/.test(content.charAt(previous)) || /(?:^|[\s;{}])(?:await|case|return|throw|yield|delete|typeof|void|else|do|of|in)\s*$|=>\s*$/.test(prefix) || /\b(?:if|while|for|with)\s*\([^)]*\)\s*$/.test(prefix);
  }

  private findRegexLiteralEnd(content: string, slashIndex: number): number {
    let index = slashIndex + 1;
    let inCharacterClass = false;

    while (index < content.length) {
      const current = content[index];
      if (current === '\\') {
        index += 2;
        continue;
      }
      if (current === '[') {
        inCharacterClass = true;
      } else if (current === ']') {
        inCharacterClass = false;
      } else if (current === '/' && !inCharacterClass) {
        index += 1;
        while (index < content.length && /[a-z]/i.test(content.charAt(index))) {
          index += 1;
        }
        return index;
      }
      index += 1;
    }

    return slashIndex + 1;
  }
}
