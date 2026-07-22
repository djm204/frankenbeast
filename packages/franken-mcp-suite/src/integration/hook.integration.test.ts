import { afterEach, describe, expect, it, vi } from 'vitest';
import { runHook } from '../cli/hook.js';

describe('fbeast-hook runtime', () => {
  afterEach(() => {
    process.exitCode = undefined;
    vi.restoreAllMocks();
  });

  it('pre-tool hook blocks denied actions', async () => {
    const result = await runHookForTest(['pre-tool', 'rm -rf /tmp/nope'], {
      governorDecision: { decision: 'denied', reason: 'destructive' },
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('destructive');
  });

  it('forwards stdin context to the governor without parsing it as a flag', async () => {
    // A payload that begins with --db= must not be consumed by the arg parser;
    // it arrives via readContext (stdin) and reaches the governor verbatim.
    const result = await runHookForTest(['pre-tool', '--', 'shell'], {
      context: '--db=/tmp/x; rm -rf /tmp/y',
    });

    expect(result.exitCode).toBe(0);
    expect(result.checkCalls[0]!.action).toBe('shell');
    expect(result.checkCalls[0]!.context).toBe('--db=/tmp/x; rm -rf /tmp/y');
  });

  it('treats tokens after -- as positionals, not options', async () => {
    const result = await runHookForTest(['pre-tool', '--db', '/real/db', '--', 'Bash'], {
      context: 'rm -rf /',
    });

    expect(result.exitCode).toBe(0);
    expect(result.checkCalls[0]!.action).toBe('Bash');
    expect(result.checkCalls[0]!.context).toBe('rm -rf /');
  });

  it('falls back to the positional payload when the context env var is unset (legacy callers)', async () => {
    // Direct/legacy callers use `fbeast-hook pre-tool <tool> <payload>` and set no
    // FBEAST_TOOL_CONTEXT. readContext() returns '' here; the governor must still
    // see the positional payload so those callers keep coverage.
    const result = await runHookForTest(['pre-tool', 'Bash', 'rm -rf /legacy']);

    expect(result.exitCode).toBe(0);
    expect(result.checkCalls[0]!.action).toBe('Bash');
    expect(result.checkCalls[0]!.context).toBe('rm -rf /legacy');
  });

  it('redacts inline credentials from the governor context before it is checked/logged', async () => {
    const bearerValue = ['bearer', 'fixture', 'value'].join('-');
    const passwordValue = ['hun', 'ter2'].join('');
    const result = await runHookForTest(['pre-tool', '--', 'Bash'], {
      context: `curl -H 'Authorization: Bearer ${bearerValue}' https://api.example.com --password ${passwordValue}`,
    });

    expect(result.exitCode).toBe(0);
    const seen = result.checkCalls[0]!.context;
    expect(seen).not.toContain(bearerValue);
    expect(seen).not.toContain(passwordValue);
    expect(seen).toContain('[REDACTED]');
  });

  it('preserves shell commands after redacted authorization headers for governance', async () => {
    const credential = ['Token', 'opaque', 'fixture'].join(' ');
    const result = await runHookForTest(['pre-tool', '--', 'Bash'], {
      context: `curl -H 'Authorization: ${credential}' https://api.example.com && rm -rf /tmp/nope`,
    });

    const seen = result.checkCalls[0]!.context;
    expect(seen).not.toContain(credential);
    expect(seen).toContain('rm -rf /tmp/nope');
  });

  it('preserves shell substitutions after redacted authorization headers for governance', async () => {
    const substitution = '$' + '(rm -rf /tmp/nope)';
    const context = ['curl -H', "'Authorization:", 'Token', 'fixture', substitution + "'", 'https://api.example.com'].join(' ');
    const result = await runHookForTest(['pre-tool', '--', 'Bash'], { context });

    const seen = result.checkCalls[0]!.context;
    expect(seen).not.toContain('Token fixture');
    expect(seen).toContain(substitution);
  });

  it('preserves shell commands after authorization environment assignments for governance', async () => {
    const result = await runHookForTest(['pre-tool', '--', 'Bash'], {
      context: 'authorization=Token rm -rf /tmp/nope',
    });

    const seen = result.checkCalls[0]!.context;
    expect(seen).toContain('authorization=[REDACTED]');
    expect(seen).toContain('rm -rf /tmp/nope');
  });

  it('redacts prefixed env-style credential assignments before governor persistence', async () => {
    const values = [
      ['openai', 'fixture', 'value'].join('-'),
      ['azure', 'fixture', 'value'].join('-'),
      ['auth', 'fixture', 'value'].join('-'),
      ['aws', 'fixture', 'access-id'].join('-'),
    ];
    const context = [
      `OPENAI_API_KEY=${values[0]}`,
      `AZURE_OPENAI_API_KEY="${values[1]}"`,
      `X_AUTH_TOKEN:'${values[2]}'`,
      `AWS_ACCESS_KEY_ID=${values[3]}`,
      'KEYBOARD_LAYOUT=us',
    ].join(' ');

    const result = await runHookForTest(['pre-tool', '--', 'Bash'], { context });

    expect(result.exitCode).toBe(0);
    const seen = result.checkCalls[0]!.context;
    for (const value of values) expect(seen).not.toContain(value);
    expect(seen.match(/\[REDACTED\]/g)).toHaveLength(values.length);
    expect(seen).toContain('KEYBOARD_LAYOUT=us');
  });

  it('preserves shell commands after redacted prefixed env assignments for governance', async () => {
    const value = ['openai', 'fixture', 'value'].join('-');
    const result = await runHookForTest(['pre-tool', '--', 'Bash'], {
      context: `OPENAI_API_KEY=${value};rm -rf /tmp/nope`,
    });

    expect(result.exitCode).toBe(0);
    const seen = result.checkCalls[0]!.context;
    expect(seen).toBe('OPENAI_API_KEY=[REDACTED];rm -rf /tmp/nope');
    expect(seen).not.toContain(value);
  });

  it('redacts dollar characters in unquoted credential values without hiding command substitutions', async () => {
    const value = ['openai', 'fixture$value'].join('-');
    const result = await runHookForTest(['pre-tool', '--', 'Bash'], {
      context: `OPENAI_API_KEY=${value} OTHER_TOKEN=$(rm -rf /tmp/nope)`,
    });

    expect(result.exitCode).toBe(0);
    const seen = result.checkCalls[0]!.context;
    expect(seen).toBe('OPENAI_API_KEY=[REDACTED] OTHER_TOKEN=$(rm -rf /tmp/nope)');
    expect(seen).not.toContain(value);
  });

  it('preserves quoted command substitutions while redacting escaped credential values', async () => {
    const result = await runHookForTest(['pre-tool', '--', 'Bash'], {
      context: 'OPENAI_API_KEY="$(rm -rf /tmp/nope)" X_AUTH_TOKEN="abc\\"def" OTHER_TOKEN=abc\\ def',
    });

    expect(result.exitCode).toBe(0);
    expect(result.checkCalls[0]!.context).toBe(
      'OPENAI_API_KEY=[REDACTED]$(rm -rf /tmp/nope)" X_AUTH_TOKEN=[REDACTED] OTHER_TOKEN=[REDACTED]',
    );
  });

  it('does not let redaction cross JSON fields and hide governed commands', async () => {
    const secret = ['openai', 'fixture', 'value'].join('-');
    const result = await runHookForTest(['pre-tool', '--', 'Bash'], {
      context: JSON.stringify({ command: `OPENAI_API_KEY="${secret}"`, cmd: 'rm -rf /tmp/nope' }),
    });

    expect(result.exitCode).toBe(0);
    const seen = JSON.parse(result.checkCalls[0]!.context) as Record<string, unknown>;
    expect(seen.command).toBe('OPENAI_API_KEY=[REDACTED]');
    expect(seen.cmd).toBe('rm -rf /tmp/nope');
    expect(result.checkCalls[0]!.context).not.toContain(secret);
  });

  it('redacts balanced parentheses in unquoted credential values', async () => {
    const secret = ['abc', '(def)', 'ghi'].join('');
    const result = await runHookForTest(['pre-tool', '--', 'Bash'], {
      context: `OPENAI_API_KEY=${secret} rm -rf /tmp/nope`,
    });

    expect(result.exitCode).toBe(0);
    expect(result.checkCalls[0]!.context).toBe('OPENAI_API_KEY=[REDACTED] rm -rf /tmp/nope');
    expect(result.checkCalls[0]!.context).not.toContain(secret);
  });

  it('does not let JSON context suppress the trusted hook provenance marker', async () => {
    const result = await runHookForTest(['pre-tool', '--', 'Bash'], {
      context: JSON.stringify({ __fbeastHookSource: 'caller-forged', command: 'read_file README.md' }),
    });

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.checkCalls[0]!.context)).toEqual({
      __fbeastHookSource: 'fbeast-hook',
      command: 'read_file README.md',
    });
  });

  it('post-tool hook records observer events', async () => {
    const result = await runHookForTest(['post-tool', 'write_file', '{"ok":true}']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('"logged":true');
  });

  it('redacts credentials from general post-tool payloads before observer logging', async () => {
    const secret = ['observer', 'fixture', 'secret'].join('-');
    const basicCredential = ['Basic', Buffer.from(`fixture:${secret}`).toString('base64')].join(' ');
    const payload = JSON.stringify({
      ok: true,
      output: {
        status: 'created',
        apiKey: secret,
        clientSecret: secret,
        accessToken: secret,
        privateKey: secret,
        databasePassword: secret,
        signingSecret: secret,
        headers: { Authorization: basicCredential },
        diagnostic: `Authorization: Bearer ${secret}`,
      },
    });

    const result = await runHookForTest(['post-tool', 'write_file', payload]);

    expect(result.exitCode).toBe(0);
    expect(result.observerLogs).toHaveLength(1);
    const metadata = JSON.parse(result.observerLogs[0]!.metadata) as {
      payload: string;
    };
    expect(JSON.parse(metadata.payload)).toEqual({
      ok: true,
      output: {
        status: 'created',
        apiKey: '[REDACTED]',
        clientSecret: '[REDACTED]',
        accessToken: '[REDACTED]',
        privateKey: '[REDACTED]',
        databasePassword: '[REDACTED]',
        signingSecret: '[REDACTED]',
        headers: { Authorization: '[REDACTED]' },
        diagnostic: 'Authorization: [REDACTED]',
      },
    });
    expect(result.observerLogs[0]!.metadata).not.toContain(secret);
    expect(result.observerLogs[0]!.metadata).not.toContain(basicCredential);
  });

  it('redacts every authorization header scheme from embedded post-tool output', async () => {
    const tokenCredential = ['Token', 'opaque', 'credential'].join(' ');
    const sigCredential = ['AWS4-HMAC-SHA256', 'Credential=fixture/signed'].join(' ');
    const payload = JSON.stringify({
      output: `Authorization: ${tokenCredential}\nAuthorization: ${sigCredential}`,
    });

    const result = await runHookForTest(['post-tool', 'http_trace', payload]);

    expect(result.observerLogs[0]!.metadata).not.toContain(tokenCredential);
    expect(result.observerLogs[0]!.metadata).not.toContain(sigCredential);
    expect(result.observerLogs[0]!.metadata.match(/Authorization: \[REDACTED\]/g)).toHaveLength(2);
  });

  it('redacts acronym-prefixed and cookie credential keys from JSON post-tool payloads', async () => {
    const secret = ['credential', 'fixture', 'value'].join('-');
    const payload = JSON.stringify({
      DBPassword: secret,
      JWTToken: secret,
      sessionCookie: secret,
      setCookie: secret,
      cookie: secret,
      credential: secret,
      credentials: secret,
      passphrase: secret,
      proxyAuthorization: secret,
    });

    const result = await runHookForTest(['post-tool', 'custom_tool', payload]);
    const metadata = JSON.parse(result.observerLogs[0]!.metadata) as { payload: string };
    const loggedPayload = JSON.parse(metadata.payload) as Record<string, string>;

    expect(Object.values(loggedPayload)).toEqual(Array(9).fill('[REDACTED]'));
    expect(result.observerLogs[0]!.metadata).not.toContain(secret);
  });

  it('preserves benign JSON post-tool payload bytes exactly', async () => {
    const payload = '{\n  "status": "ok",\n  "duplicate": 1,\n  "duplicate": 2,\n  "ratio": 1.00\n}';

    const result = await runHookForTest(['post-tool', 'custom_tool', payload]);
    const metadata = JSON.parse(result.observerLogs[0]!.metadata) as { payload: string };

    expect(metadata.payload).toBe(payload);
  });

  it('redacts authorization and generic key assignments from raw post-tool payloads before observer logging', async () => {
    const authorizationSecret = ['raw', 'authorization', 'fixture'].join('-');
    const privateKeySecret = ['raw', 'private', 'key', 'fixture'].join('-');
    const payload = `status=ok authorization=${authorizationSecret} private_key=${privateKeySecret}`;

    const result = await runHookForTest(['post-tool', 'custom_tool', payload]);

    expect(result.exitCode).toBe(0);
    expect(result.observerLogs).toHaveLength(1);
    expect(result.observerLogs[0]!.metadata).not.toContain(authorizationSecret);
    expect(result.observerLogs[0]!.metadata).not.toContain(privateKeySecret);
    expect(result.observerLogs[0]!.metadata).toContain('authorization=[REDACTED]');
    expect(result.observerLogs[0]!.metadata).toContain('private_key=[REDACTED]');

    const keyOnlyResult = await runHookForTest([
      'post-tool',
      'custom_tool',
      `status=ok private_key=${privateKeySecret}`,
    ]);
    expect(keyOnlyResult.observerLogs[0]!.metadata).not.toContain(privateKeySecret);
    expect(keyOnlyResult.observerLogs[0]!.metadata).toContain('private_key=[REDACTED]');
  });

  it('redacts raw cookie, credentials, passphrase, and multiword authorization assignments', async () => {
    const secret = ['raw', 'credential', 'fixture'].join('-');
    const payload = [
      `Set-Cookie: session=${secret}`,
      `sessionCookie=${secret}`,
      `credentials=${secret}`,
      `passphrase=${secret}`,
      `--cookie ${secret}`,
      `authorization=Basic ${secret}`,
      `authorization=Token ${secret}`,
      `authorization="Basic ${secret}=="`,
      `authorization=Basic ${secret}==`,
    ].join('\n');

    const result = await runHookForTest(['post-tool', 'custom_tool', payload]);

    expect(result.observerLogs[0]!.metadata).not.toContain(secret);
    expect(result.observerLogs[0]!.metadata.match(/\[REDACTED\]/g)).toHaveLength(9);
  });

  it('redacts complete SigV4 Authorization and multi-cookie header lines', async () => {
    const secret = ['header', 'line', 'fixture'].join('-');
    const payload = [
      `Authorization: AWS4-HMAC-SHA256 Credential=${secret}/scope SignedHeaders=host;x-amz-date Signature=${secret}`,
      `Cookie: sid=${secret}; refresh=${secret}`,
    ].join('\n');

    const result = await runHookForTest(['post-tool', 'custom_tool', payload]);
    const metadata = JSON.parse(result.observerLogs[0]!.metadata) as { payload: string };

    expect(metadata.payload).toBe('Authorization: [REDACTED]\nCookie: [REDACTED]');
    expect(result.observerLogs[0]!.metadata).not.toContain(secret);
  });

  it('redacts complete multi-token authorization assignments from raw post-tool payloads', async () => {
    const credential = ['fixture', 'signed', 'credential'].join('-');
    const signature = ['fixture', 'signature'].join('-');
    const token = ['opaque', 'credential', 'value'].join(' ');
    const payload = [
      `authorization=AWS4-HMAC-SHA256 Credential=${credential} SignedHeaders=host;x-date Signature=${signature}`,
      `authorization=Token ${token}`,
    ].join('\n');

    const result = await runHookForTest(['post-tool', 'custom_tool', payload]);

    expect(result.observerLogs[0]!.metadata).not.toContain(credential);
    expect(result.observerLogs[0]!.metadata).not.toContain(signature);
    expect(result.observerLogs[0]!.metadata).not.toContain(token);
    expect(result.observerLogs[0]!.metadata.match(/authorization=\[REDACTED\]/g)).toHaveLength(2);
  });

  it('redacts quoted authorization header values from raw post-tool payloads', async () => {
    const secret = ['quoted', 'authorization', 'fixture'].join('-');
    const payload = [`Authorization: "Basic ${secret}"`, `Authorization: 'Token ${secret}'`].join('\n');

    const result = await runHookForTest(['post-tool', 'custom_tool', payload]);

    expect(result.observerLogs[0]!.metadata).not.toContain(secret);
    expect(result.observerLogs[0]!.metadata.match(/Authorization: \[REDACTED\]/g)).toHaveLength(2);
  });

  it('redacts credential values from serialized header entry arrays', async () => {
    const secret = ['header', 'tuple', 'fixture'].join('-');
    const proxySecret = ['proxy', 'tuple', 'fixture'].join('-');
    const payload = JSON.stringify({
      headers: [
        ['Authorization', `Basic ${secret}`],
        ['Proxy-Authorization', `Basic ${proxySecret}`],
        ['Content-Type', 'application/json'],
      ],
    });

    const result = await runHookForTest(['post-tool', 'custom_tool', payload]);
    const metadata = JSON.parse(result.observerLogs[0]!.metadata) as { payload: string };
    const loggedPayload = JSON.parse(metadata.payload) as { headers: string[][] };

    expect(loggedPayload.headers).toEqual([
      ['Authorization', '[REDACTED]'],
      ['Proxy-Authorization', '[REDACTED]'],
      ['Content-Type', 'application/json'],
    ]);
    expect(result.observerLogs[0]!.metadata).not.toContain(secret);
    expect(result.observerLogs[0]!.metadata).not.toContain(proxySecret);
  });

  it('redacts secrets from name/value and key/value pair objects', async () => {
    const secrets = ['env', 'database', 'header'].map((part) => `${part}-pair-fixture`);
    const payload = JSON.stringify({
      env: [{ name: 'OPENAI_API_KEY', value: secrets[0] }],
      settings: [{ key: 'databasePassword', value: secrets[1] }],
      headers: [{ name: 'Authorization', value: `Basic ${secrets[2]}` }],
    });

    const result = await runHookForTest(['post-tool', 'custom_tool', payload]);
    const metadata = JSON.parse(result.observerLogs[0]!.metadata) as { payload: string };

    for (const secret of secrets) expect(metadata.payload).not.toContain(secret);
    expect(metadata.payload.match(/\[REDACTED\]/g)).toHaveLength(3);
  });

  it('recurses into top-level JSON string payloads before observer logging', async () => {
    const secret = ['top', 'level', 'string', 'fixture'].join('-');
    const payload = JSON.stringify(JSON.stringify({ apiKey: secret, status: 'ok' }));

    const result = await runHookForTest(['post-tool', 'custom_tool', payload]);
    const metadata = JSON.parse(result.observerLogs[0]!.metadata) as { payload: string };
    const nested = JSON.parse(JSON.parse(metadata.payload) as string) as Record<string, string>;

    expect(result.observerLogs[0]!.metadata).not.toContain(secret);
    expect(nested).toEqual({ apiKey: '[REDACTED]', status: 'ok' });
  });

  it('redacts acronym-prefixed credentials from raw post-tool payloads', async () => {
    const secret = ['acronym', 'raw', 'fixture'].join('-');
    const payload = `DBPassword=${secret} JWTToken=${secret}`;

    const result = await runHookForTest(['post-tool', 'custom_tool', payload]);

    expect(result.observerLogs[0]!.metadata).not.toContain(secret);
    expect(result.observerLogs[0]!.metadata).toContain('DBPassword=[REDACTED]');
    expect(result.observerLogs[0]!.metadata).toContain('JWTToken=[REDACTED]');
  });

  it('redacts camel-case authorization assignments from raw post-tool payloads', async () => {
    const secret = ['proxy', 'authorization', 'raw'].join('-');
    const payload = `proxyAuthorization=Basic ${secret}`;

    const result = await runHookForTest(['post-tool', 'custom_tool', payload]);

    expect(result.observerLogs[0]!.metadata).not.toContain(secret);
    expect(result.observerLogs[0]!.metadata).toContain('proxyAuthorization=[REDACTED]');
  });

  it('redacts prefixed option-style credential flags', async () => {
    const authSecret = ['proxy', 'flag', 'fixture'].join('-');
    const keySecret = ['openai', 'flag', 'fixture'].join('-');
    const sigSecret = ['sigv4', 'flag', 'fixture'].join('-');
    const payload = `--proxy-authorization Basic ${authSecret} --openai-api-key ${keySecret} --aws-authorization AWS4-HMAC-SHA256 Credential=scope SignedHeaders=host Signature=${sigSecret} --format json`;

    const result = await runHookForTest(['post-tool', 'custom_tool', payload]);
    const metadata = result.observerLogs[0]!.metadata;

    expect(metadata).not.toContain(authSecret);
    expect(metadata).not.toContain(keySecret);
    expect(metadata).not.toContain(sigSecret);
    expect(metadata).toContain('--proxy-authorization [REDACTED]');
    expect(metadata).toContain('--openai-api-key [REDACTED]');
    expect(metadata).toContain('--aws-authorization [REDACTED]');
    expect(metadata).toContain('--format json');
  });

  it('redacts secrets from JSON embedded in text fields', async () => {
    const secret = ['embedded', 'json', 'fixture'].join('-');
    const payload = JSON.stringify({
      content: [{ type: 'text', text: JSON.stringify({ apiKey: secret, clientSecret: secret }) }],
    });

    const result = await runHookForTest(['post-tool', 'custom_tool', payload]);

    expect(result.observerLogs[0]!.metadata).not.toContain(secret);
    expect(result.observerLogs[0]!.metadata).toContain('[REDACTED]');
  });

  it('redacts shadowed secrets while preserving duplicate-key JSON bytes', async () => {
    const secret = ['duplicate', 'key', 'fixture'].join('-');
    const payload = `{"output":"Authorization: Bearer ${secret}","output":"ok"}`;

    const result = await runHookForTest(['post-tool', 'custom_tool', payload]);
    const metadata = JSON.parse(result.observerLogs[0]!.metadata) as { payload: string };

    expect(metadata.payload).toContain('"output":"ok"');
    expect(metadata.payload).not.toContain(secret);
    expect(metadata.payload).toContain('[REDACTED]');
  });

  it('redacts escaped authorization values in shadowed duplicate-key JSON', async () => {
    const secret = ['shadowed', 'escaped', 'fixture'].join('-');
    const payload = `{"output":"Authorization: \\\"Basic ${secret}\\\"","output":"ok"}`;

    const result = await runHookForTest(['post-tool', 'custom_tool', payload]);
    const metadata = JSON.parse(result.observerLogs[0]!.metadata) as { payload: string };

    expect(metadata.payload).toContain('Authorization: [REDACTED]');
    expect(result.observerLogs[0]!.metadata).not.toContain(secret);
  });

  it('whole-redacts structured secrets hidden by duplicate JSON keys', async () => {
    const tupleSecret = ['shadowed', 'tuple', 'fixture'].join('-');
    const pairSecret = ['shadowed', 'pair', 'fixture'].join('-');
    const payloads = [
      `{"output":[["Authorization","Basic ${tupleSecret}"]],"output":"ok"}`,
      `{"output":{"value":"${pairSecret}","name":"OPENAI_API_KEY"},"output":"ok"}`,
    ];

    for (const payload of payloads) {
      const result = await runHookForTest(['post-tool', 'custom_tool', payload]);
      const metadata = JSON.parse(result.observerLogs[0]!.metadata) as { payload: string };

      expect(metadata.payload).toBe('[REDACTED]');
      expect(result.observerLogs[0]!.metadata).not.toContain(tupleSecret);
      expect(result.observerLogs[0]!.metadata).not.toContain(pairSecret);
    }
  });

  it('redacts long URL userinfo credentials from raw post-tool payloads', async () => {
    const username = 'u'.repeat(300);
    const password = 'p'.repeat(300);
    const payload = `result=https://${username}:${password}@example.com/private`;

    const result = await runHookForTest(['post-tool', 'custom_tool', payload]);

    expect(result.exitCode).toBe(0);
    expect(result.observerLogs[0]!.metadata).not.toContain(password);
    expect(result.observerLogs[0]!.metadata).toContain('[REDACTED]@example.com/private');
  });

  it('preserves oversized post-tool payloads that contain only benign URLs', async () => {
    const payload = JSON.stringify({
      output: `${'x'.repeat(70_000)} https://example.com/docs`,
    });

    const result = await runHookForTest(['post-tool', 'read_file', payload]);

    expect(result.exitCode).toBe(0);
    const metadata = JSON.parse(result.observerLogs[0]!.metadata) as {
      payload: string;
    };
    expect(metadata.payload).toBe(payload);
  });

  it('redacts oversized post-tool payloads with credential indicators without scanning them', async () => {
    const secret = ['oversized', 'fixture', 'secret'].join('-');
    const payload = JSON.stringify({
      output: 'x'.repeat(70_000),
      apiKey: secret,
    });

    const result = await runHookForTest(['post-tool', 'write_file', payload]);

    expect(result.exitCode).toBe(0);
    expect(result.observerLogs).toHaveLength(1);
    const metadata = JSON.parse(result.observerLogs[0]!.metadata) as {
      payload: string;
    };
    expect(metadata.payload).toBe('[post-tool-payload-redacted]');
    expect(result.observerLogs[0]!.metadata).not.toContain(secret);
  });

  it('redacts oversized payloads containing escaped credential assignments', async () => {
    const secret = ['escaped', 'oversized', 'fixture'].join('-');
    const payload = JSON.stringify({
      output: `${'x'.repeat(70_000)} ${JSON.stringify({ apiKey: secret })}`,
    });

    const result = await runHookForTest(['post-tool', 'read_file', payload]);
    const metadata = JSON.parse(result.observerLogs[0]!.metadata) as { payload: string };

    expect(metadata.payload).toBe('[post-tool-payload-redacted]');
    expect(result.observerLogs[0]!.metadata).not.toContain(secret);
  });

  it('redacts oversized payloads containing authorization header tuples', async () => {
    const secret = ['oversized', 'header', 'tuple'].join('-');
    const payload = JSON.stringify({
      output: 'x'.repeat(70_000),
      headers: [['Authorization', `Basic ${secret}`]],
    });

    const result = await runHookForTest(['post-tool', 'read_file', payload]);
    const metadata = JSON.parse(result.observerLogs[0]!.metadata) as { payload: string };

    expect(metadata.payload).toBe('[post-tool-payload-redacted]');
    expect(result.observerLogs[0]!.metadata).not.toContain(secret);
  });

  it('redacts oversized payloads containing cookie header tuples', async () => {
    const secret = ['oversized', 'cookie', 'tuple'].join('-');
    const payload = JSON.stringify({
      output: 'x'.repeat(70_000),
      headers: [['Set-Cookie', `sid=${secret}; Path=/; HttpOnly`]],
    });

    const result = await runHookForTest(['post-tool', 'read_file', payload]);
    const metadata = JSON.parse(result.observerLogs[0]!.metadata) as { payload: string };

    expect(metadata.payload).toBe('[post-tool-payload-redacted]');
    expect(result.observerLogs[0]!.metadata).not.toContain(secret);
  });

  it('redacts oversized reversed value/name credential pairs', async () => {
    const secret = ['oversized', 'reversed', 'pair'].join('-');
    const payload = JSON.stringify({
      output: 'x'.repeat(70_000),
      env: [{ value: secret, name: 'OPENAI_API_KEY' }],
    });

    const result = await runHookForTest(['post-tool', 'read_file', payload]);
    const metadata = JSON.parse(result.observerLogs[0]!.metadata) as { payload: string };

    expect(metadata.payload).toBe('[post-tool-payload-redacted]');
    expect(result.observerLogs[0]!.metadata).not.toContain(secret);
  });

  it('redacts oversized payloads containing prefixed credential flags', async () => {
    const secret = ['oversized', 'prefixed', 'flag'].join('-');
    const payload = `${'x'.repeat(70_000)} --openai-api-key ${secret}`;

    const result = await runHookForTest(['post-tool', 'read_file', payload]);
    const metadata = JSON.parse(result.observerLogs[0]!.metadata) as { payload: string };

    expect(metadata.payload).toBe('[post-tool-payload-redacted]');
    expect(result.observerLogs[0]!.metadata).not.toContain(secret);
  });

  it('preserves oversized benign payloads with key-like terms', async () => {
    const payload = `${'x'.repeat(70_000)} public_key documentation sort_key foreign-key token guide cookie policy password advice`;

    const result = await runHookForTest(['post-tool', 'read_file', payload]);
    const metadata = JSON.parse(result.observerLogs[0]!.metadata) as { payload: string };

    expect(metadata.payload).toBe(payload);
  });

  it('whole-redacts oversized payloads with generic credential assignments', async () => {
    const secret = ['oversized', 'generic', 'key', 'fixture'].join('-');
    const payload = `${'x'.repeat(70_000)} OPENAI_KEY=${secret}`;

    const result = await runHookForTest(['post-tool', 'write_file', payload]);
    const metadata = JSON.parse(result.observerLogs[0]!.metadata) as { payload: string };

    expect(metadata.payload).toBe('[post-tool-payload-redacted]');
    expect(result.observerLogs[0]!.metadata).not.toContain(secret);
  });

  it('short-circuits oversized assignment scans without materializing every match', async () => {
    const secret = ['late', 'oversized', 'fixture'].join('-');
    const benignAssignments = Array.from({ length: 5_000 }, (_, index) => `field_${index}: value`).join(' ');
    const payload = `${benignAssignments} OPENAI_KEY=${secret}`;

    const result = await runHookForTest(['post-tool', 'write_file', payload]);
    const metadata = JSON.parse(result.observerLogs[0]!.metadata) as { payload: string };

    expect(metadata.payload).toBe('[post-tool-payload-redacted]');
    expect(result.observerLogs[0]!.metadata).not.toContain(secret);
  });

  it('preserves raw non-JSON pre-tool whitespace for governor policy matching', async () => {
    const result = await runHookForTest(['pre-tool', '--', 'Bash'], {
      context: 'rm\t-rf /tmp/nope',
    });

    expect(result.exitCode).toBe(0);
    expect(result.checkCalls[0]!.context).toBe('rm\t-rf /tmp/nope');
  });

  it('reads post-tool payloads from the stream when argv payload is omitted and stdin opt-in is set', async () => {
    const streamedPayload = JSON.stringify({ ok: true, output: 'x'.repeat(300_000) });
    const result = await runHookForTest(['post-tool', '--stdin-payload', '--', 'read_file'], {
      streamedPayload,
    });

    expect(result.exitCode).toBe(0);
    expect(result.observerLogs).toHaveLength(1);
    expect(JSON.parse(result.observerLogs[0]!.metadata)).toEqual({
      __fbeastAuditTrailSource: 'fbeast-hook',
      __fbeastHookSource: 'fbeast-hook',
      toolName: 'read_file',
      ok: true,
      payload: streamedPayload,
      phase: 'post-tool',
    });
  });

  it('redacts memory review result payloads before post-tool audit logging', async () => {
    const streamedPayload = JSON.stringify({ id: 'memcand_1', key: 'secret', value: 'token abc123' });
    const result = await runHookForTest(['post-tool', '--stdin-payload', '--', 'fbeast_memory_review_propose'], {
      streamedPayload,
    });

    expect(result.exitCode).toBe(0);
    expect(result.observerLogs).toHaveLength(1);
    expect(JSON.parse(result.observerLogs[0]!.metadata)).toEqual({
      __fbeastAuditTrailSource: 'fbeast-hook',
      __fbeastHookSource: 'fbeast-hook',
      toolName: 'fbeast_memory_review_propose',
      ok: true,
      payload: '[memory-review-result-redacted]',
      phase: 'post-tool',
    });
    expect(result.observerLogs[0]!.metadata).not.toContain('token abc123');
  });

  it('redacts memory export payloads before post-tool audit logging', async () => {
    const streamedPayload = JSON.stringify({ content: [{ type: 'text', text: '{"working":[{"value":"raw secret"}]}' }] });
    const result = await runHookForTest(['post-tool', '--stdin-payload', '--', 'fbeast_memory_export'], {
      streamedPayload,
    });

    expect(result.exitCode).toBe(0);
    expect(result.observerLogs).toHaveLength(1);
    expect(JSON.parse(result.observerLogs[0]!.metadata)).toEqual({
      __fbeastAuditTrailSource: 'fbeast-hook',
      __fbeastHookSource: 'fbeast-hook',
      toolName: 'fbeast_memory_export',
      ok: true,
      payload: '[memory-review-result-redacted]',
      phase: 'post-tool',
    });
    expect(result.observerLogs[0]!.metadata).not.toContain('raw secret');
  });

  it('redacts memory access audit report payloads before post-tool audit logging', async () => {
    const streamedPayload = JSON.stringify({ events: [{ agentId: 'agent-a', profile: 'default', repo: 'secret/repo' }] });
    const result = await runHookForTest(['post-tool', '--stdin-payload', '--', 'fbeast_memory_access_audit_report'], {
      streamedPayload,
    });

    expect(result.exitCode).toBe(0);
    expect(result.observerLogs).toHaveLength(1);
    expect(JSON.parse(result.observerLogs[0]!.metadata)).toEqual({
      __fbeastAuditTrailSource: 'fbeast-hook',
      __fbeastHookSource: 'fbeast-hook',
      toolName: 'fbeast_memory_access_audit_report',
      ok: true,
      payload: '[memory-review-result-redacted]',
      phase: 'post-tool',
    });
    expect(result.observerLogs[0]!.metadata).not.toContain('agent-a');
  });

  it('redacts proxied execute_tool result payloads before post-tool audit logging', async () => {
    const streamedPayload = JSON.stringify({ content: [{ type: 'text', text: '{"value":"token abc123"}' }] });
    const result = await runHookForTest(['post-tool', '--stdin-payload', '--', 'execute_tool'], {
      streamedPayload,
    });

    expect(result.exitCode).toBe(0);
    expect(result.observerLogs).toHaveLength(1);
    expect(JSON.parse(result.observerLogs[0]!.metadata)).toEqual({
      __fbeastAuditTrailSource: 'fbeast-hook',
      __fbeastHookSource: 'fbeast-hook',
      toolName: 'execute_tool',
      payload: '[memory-review-result-redacted]',
      phase: 'post-tool',
    });
    expect(result.observerLogs[0]!.metadata).not.toContain('token abc123');
  });

  it('redacts MCP-qualified memory review result payloads before post-tool audit logging', async () => {
    const streamedPayload = JSON.stringify({ content: [{ type: 'text', text: '{"value":"token abc123"}' }] });
    const result = await runHookForTest(['post-tool', '--stdin-payload', '--', 'mcp__fbeast-memory__fbeast_memory_review_list'], {
      streamedPayload,
    });

    expect(result.exitCode).toBe(0);
    expect(result.observerLogs).toHaveLength(1);
    expect(JSON.parse(result.observerLogs[0]!.metadata)).toEqual({
      __fbeastAuditTrailSource: 'fbeast-hook',
      __fbeastHookSource: 'fbeast-hook',
      toolName: 'mcp__fbeast-memory__fbeast_memory_review_list',
      payload: '[memory-review-result-redacted]',
      phase: 'post-tool',
      ok: true,
    });
    expect(result.observerLogs[0]!.metadata).not.toContain('token abc123');
  });

  it('preserves empty payload behavior for legacy post-tool callers that omit stdin opt-in', async () => {
    const result = await runHookForTest(['post-tool', '--', 'read_file'], {
      streamedPayload: JSON.stringify({ shouldNotBeRead: true }),
    });

    expect(result.exitCode).toBe(0);
    expect(result.observerLogs).toHaveLength(1);
    expect(JSON.parse(result.observerLogs[0]!.metadata)).toEqual({
      __fbeastAuditTrailSource: 'fbeast-hook',
      __fbeastHookSource: 'fbeast-hook',
      toolName: 'read_file',
      payload: '',
      phase: 'post-tool',
    });
  });
});

async function runHookForTest(
  argv: string[],
  options: {
    governorDecision?: { decision: string; reason: string };
    context?: string;
    streamedPayload?: string;
  } = {},
): Promise<{
  exitCode: number;
  stdout: string;
  stderr: string;
  checkCalls: Array<{ action: string; context: string }>;
  observerLogs: Array<{ event: string; metadata: string; sessionId: string }>;
}> {
  let stdout = '';
  let stderr = '';
  const checkCalls: Array<{ action: string; context: string }> = [];
  const observerLogs: Array<{ event: string; metadata: string; sessionId: string }> = [];

  vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: string | Uint8Array) => {
    stdout += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
    return true;
  }) as typeof process.stdout.write);

  vi.spyOn(process.stderr, 'write').mockImplementation(((chunk: string | Uint8Array) => {
    stderr += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
    return true;
  }) as typeof process.stderr.write);

  process.exitCode = 0;

  await (runHook as unknown as (
    args: string[],
    deps: {
      governor: {
        check(input: { action: string; context: string }): Promise<{ decision: string; reason: string }>;
      };
      observer: {
        log(input: { event: string; metadata: string; sessionId: string }): Promise<unknown>;
      };
      sessionId(): string;
      readContext(): string;
      readPostToolPayload?(): Promise<string>;
    },
  ) => Promise<void>)(argv, {
    governor: {
      check: vi.fn().mockImplementation(async (input: { action: string; context: string }) => {
        checkCalls.push({ action: input.action, context: input.context });
        return options.governorDecision ?? { decision: 'approved', reason: 'safe' };
      }),
    },
    observer: {
      log: vi.fn().mockImplementation(async (input: { event: string; metadata: string; sessionId: string }) => {
        observerLogs.push(input);
        return { id: 1, hash: 'abc123' };
      }),
    },
    sessionId: () => 'sess-test',
    readContext: () => options.context ?? '',
    readPostToolPayload: async () => options.streamedPayload ?? '',
  });

  return { exitCode: process.exitCode ?? 0, stdout, stderr, checkCalls, observerLogs };
}
