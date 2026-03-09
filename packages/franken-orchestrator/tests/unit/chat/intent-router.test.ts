import { describe, it, expect } from 'vitest';
import { IntentRouter } from '../../../src/chat/intent-router.js';
import { IntentClass } from '../../../src/chat/types.js';

describe('IntentRouter', () => {
  const router = new IntentRouter();

  describe('chat_simple', () => {
    it.each([
      'hello', 'Hi there!', 'thanks', 'thank you!',
      'how are you?', 'good morning', 'bye',
    ])('routes "%s" to chat_simple', (input) => {
      expect(router.classify(input)).toBe(IntentClass.ChatSimple);
    });
  });

  describe('code_request — coding verbs from design doc', () => {
    it.each([
      'implement a login form',
      'Fix the bug in auth.ts',
      'refactor the database layer',
      'write tests for the API',
      'edit src/main.ts to add logging',
      'debug the memory leak',
      'add test for the parser',
    ])('routes "%s" to code_request', (input) => {
      expect(router.classify(input)).toBe(IntentClass.CodeRequest);
    });

    it('routes stack traces to code_request', () => {
      const stackTrace = `Error: Connection refused\n    at Client.connect (src/db.ts:42)\n    at main (src/index.ts:10)`;
      expect(router.classify(stackTrace)).toBe(IntentClass.CodeRequest);
    });

    it('routes test failures to code_request', () => {
      expect(router.classify('FAIL tests/auth.test.ts > should login')).toBe(IntentClass.CodeRequest);
    });

    it('routes compiler errors to code_request', () => {
      expect(router.classify('src/index.ts:5:3 - error TS2304: Cannot find name')).toBe(IntentClass.CodeRequest);
    });
  });

  describe('repo_action — execution verbs from design doc', () => {
    it.each([
      'run the tests', 'execute the build', 'commit these changes',
      'push to main', 'open a PR', 'apply the patch',
      'deploy to staging', 'merge the branch',
    ])('routes "%s" to repo_action', (input) => {
      expect(router.classify(input)).toBe(IntentClass.RepoAction);
    });
  });

  describe('chat_technical — planning/architecture signals', () => {
    it.each([
      'explain the architecture of the auth system',
      'what design pattern should I use here?',
      'how would you build a rate limiter?',
      'compare REST vs GraphQL for this use case',
      'what are the tradeoffs of using SQLite here?',
    ])('routes "%s" to chat_technical', (input) => {
      expect(router.classify(input)).toBe(IntentClass.ChatTechnical);
    });
  });

  describe('ambiguous — safety-sensitive verbs', () => {
    it.each([
      'delete all the old files',
      'reset the database',
      'drop the users table',
    ])('routes "%s" to ambiguous', (input) => {
      expect(router.classify(input)).toBe(IntentClass.Ambiguous);
    });

    it('returns chat_simple for unclear single-word input (fallback)', () => {
      expect(router.classify('hmm')).toBe(IntentClass.ChatSimple);
    });
  });

  describe('slash commands — override content', () => {
    it('overrides to code_request on /plan', () => {
      expect(router.classify('/plan add authentication')).toBe(IntentClass.CodeRequest);
    });

    it('overrides to repo_action on /run', () => {
      expect(router.classify('/run npx vitest')).toBe(IntentClass.RepoAction);
    });
  });

  describe('case insensitivity', () => {
    it('is case-insensitive', () => {
      expect(router.classify('IMPLEMENT a feature')).toBe(IntentClass.CodeRequest);
      expect(router.classify('RUN the tests')).toBe(IntentClass.RepoAction);
    });
  });
});
