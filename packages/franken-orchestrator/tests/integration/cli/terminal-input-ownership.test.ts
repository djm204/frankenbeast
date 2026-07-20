import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

const tempDirs: string[] = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('terminal input ownership PTY', () => {
  it.skipIf(process.platform === 'win32')('routes chat and approval replies through one readline owner', () => {
    const dir = mkdtempSync(resolve(tmpdir(), 'franken-terminal-owner-'));
    tempDirs.push(dir);
    const harness = resolve(dir, 'harness.mts');
    const here = dirname(fileURLToPath(import.meta.url));
    const chatRepl = resolve(here, '../../../src/cli/chat-repl.ts');
    writeFileSync(harness, `
      import { createReadlineIO } from ${JSON.stringify(pathToFileURL(chatRepl).href)};
      void (async () => {
        const io = createReadlineIO();
        try {
          const chat = await io.prompt();
          const approval = await io.ask?.('Approve? ');
          console.log('__PTY_RESULT__' + JSON.stringify({ chat, approval }));
        } finally {
          io.close();
        }
      })();
    `);

    const workspaceRoot = resolve(here, '../../../../..');
    const tsx = resolve(workspaceRoot, 'node_modules/.bin/tsx');
    const controller = String.raw`
import os, pty, select, sys, time
pid, fd = pty.fork()
if pid == 0:
    os.execv(sys.argv[1], [sys.argv[1], sys.argv[2]])
output = bytearray()
def wait_for(token):
    deadline = time.time() + 10
    while token not in output:
        if time.time() >= deadline:
            raise TimeoutError('timed out waiting for ' + repr(token) + ': ' + output.decode(errors='replace'))
        ready, _, _ = select.select([fd], [], [], 0.1)
        if ready:
            try:
                output.extend(os.read(fd, 4096))
            except OSError:
                break
wait_for('❯'.encode())
os.write(fd, b'unique-chat-input\n')
wait_for(b'Approve?')
os.write(fd, b'APPROVE\n')
deadline = time.time() + 10
while time.time() < deadline:
    done, status = os.waitpid(pid, os.WNOHANG)
    try:
        ready, _, _ = select.select([fd], [], [], 0.05)
        if ready:
            output.extend(os.read(fd, 4096))
    except OSError:
        pass
    if done:
        exit_code = os.waitstatus_to_exitcode(status)
        break
else:
    os.kill(pid, 9)
    raise TimeoutError('PTY child did not exit')
print(output.decode(errors='replace'))
raise SystemExit(exit_code)
`;

    const result = spawnSync('python3', ['-c', controller, tsx, harness], {
      encoding: 'utf8',
      timeout: 15_000,
    });

    expect(result.error).toBeUndefined();
    expect(result.status, JSON.stringify({ stdout: result.stdout, stderr: result.stderr, error: result.error })).toBe(0);
    expect(result.stdout).toContain(
      '__PTY_RESULT__{"chat":"unique-chat-input","approval":"APPROVE"}',
    );
  });
});
