import { describe, it, expect } from 'vitest';
import type { LlmRequest } from '@franken/types';
import { PiiMaskingMiddleware } from '../../../src/middleware/pii-masking.js';
import type { LlmResponse } from '../../../src/middleware/llm-middleware.js';

function makeRequest(content: string): LlmRequest {
  return { systemPrompt: '', messages: [{ role: 'user', content }] };
}

function makeResponse(content: string): LlmResponse {
  return { content, usage: { inputTokens: 10, outputTokens: 5 } };
}

const mw = new PiiMaskingMiddleware();

describe('PiiMaskingMiddleware', () => {
  it('masks email addresses', () => {
    const result = mw.beforeRequest(makeRequest('Contact me at john@example.com'));
    expect((result.messages[0]!.content as string)).toContain('[EMAIL]');
    expect((result.messages[0]!.content as string)).not.toContain('john@example.com');
  });

  it('masks US phone numbers', () => {
    const result = mw.beforeRequest(makeRequest('Call me at 555-123-4567'));
    expect((result.messages[0]!.content as string)).toContain('[PHONE]');
    expect((result.messages[0]!.content as string)).not.toContain('555-123-4567');
  });

  it('masks SSN', () => {
    const result = mw.beforeRequest(makeRequest('My SSN is 123-45-6789'));
    expect((result.messages[0]!.content as string)).toContain('[SSN]');
    expect((result.messages[0]!.content as string)).not.toContain('123-45-6789');
  });

  it('masks credit card numbers', () => {
    const result = mw.beforeRequest(makeRequest('Card: 4111111111111111'));
    expect((result.messages[0]!.content as string)).toContain('[CC]');
    expect((result.messages[0]!.content as string)).not.toContain('4111111111111111');
  });

  it('masks IP addresses', () => {
    const result = mw.beforeRequest(makeRequest('Server at 192.168.1.100'));
    expect((result.messages[0]!.content as string)).toContain('[IP]');
  });

  it('masks common API keys and bearer tokens', () => {
    const openAiKey = `sk-${'1234567890abcdef'.repeat(2)}`;
    const githubToken = `ghp_${'1234567890abcdef'.repeat(2)}123456`;
    const githubFineGrainedToken = ['github', 'pat', '11AAAAAAA'].join('_')
      + `_${'b'.repeat(22)}_${'c'.repeat(59)}`;
    const githubAppToken = `ghs_${'1234567890abcdef'.repeat(2)}123456`;
    const githubAppJwtToken = `ghs_${['appHeader', 'appPayload'.repeat(3), 'appSignature'].join('.')}`;
    const githubAppJwtTokenWithHyphens = `ghs_${['app-header', 'app-payload'.repeat(3), 'app-signature'].join('.')}`;
    const slackToken = ['xoxb', '123456789012', '123456789012', 'abcdefghijklmnopqrstuvwxyz'].join('-');
    const bearerToken = `Bearer ${['eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9', 'payload', 'signature'].join('.')}`;
    const lowercaseBearerToken = `bearer ${'base64token'.repeat(3)}==`;

    const result = mw.beforeRequest(
      makeRequest(
        `openai=${openAiKey} github=${githubToken} github_pat=${githubFineGrainedToken} github_app=${githubAppToken} github_app_jwt=${githubAppJwtToken} github_app_jwt_hyphen=${githubAppJwtTokenWithHyphens} slack=${slackToken} bearer=${bearerToken} auth=${lowercaseBearerToken}`,
      ),
    );
    const content = result.messages[0]!.content as string;
    expect(content).toContain('openai=[API_KEY]');
    expect(content).toContain('github=[API_KEY]');
    expect(content).toContain('github_pat=[API_KEY]');
    expect(content).toContain('github_app=[API_KEY]');
    expect(content).toContain('github_app_jwt=[API_KEY]');
    expect(content).toContain('github_app_jwt_hyphen=[API_KEY]');
    expect(content).toContain('slack=[API_KEY]');
    expect(content).toContain('bearer=[API_KEY]');
    expect(content).toContain('auth=[API_KEY]');
    expect(content).not.toContain(openAiKey);
    expect(content).not.toContain(githubToken);
    expect(content).not.toContain(githubFineGrainedToken);
    expect(content).not.toContain(githubAppToken);
    expect(content).not.toContain(githubAppJwtToken);
    expect(content).not.toContain(githubAppJwtTokenWithHyphens);
    expect(content).not.toContain(slackToken);
    expect(content).not.toContain(bearerToken.replace('Bearer ', ''));
    expect(content).not.toContain(lowercaseBearerToken.replace('bearer ', ''));
    expect(content).not.toContain('==');
  });

  it('masks database connection strings', () => {
    const result = mw.beforeRequest(
      makeRequest(
        'primary=postgres://user:secret@db.example.com:5432/app replica=mongodb+srv://admin:p4ss@cluster.example.com/db cache=redis://:cachepass@localhost:6379/0',
      ),
    );
    const content = result.messages[0]!.content as string;
    expect(content).toContain('primary=[CONNECTION_STRING]');
    expect(content).toContain('replica=[CONNECTION_STRING]');
    expect(content).toContain('cache=[CONNECTION_STRING]');
    expect(content).not.toContain('postgres://user:secret@db.example.com:5432/app');
    expect(content).not.toContain('mongodb+srv://admin:p4ss@cluster.example.com/db');
    expect(content).not.toContain('redis://:cachepass@localhost:6379/0');
  });

  it('preserves delimiters around masked secrets', () => {
    const openAiKey = `sk-${'abcdef1234567890'.repeat(2)}`;
    const githubToken = `ghp_${'abcdef1234567890'.repeat(2)}123456`;
    const bearerToken = `Bearer ${['eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9', 'payload', 'signature'].join('.')}`;
    const plusBearerToken = `Bearer ${'opaqueToken'.repeat(3)}+`;
    const tildeBearerToken = `Bearer ${'opaqueToken'.repeat(3)}~`;
    const ipv6Connection = 'postgres://user:***@[2001:db8::1]:5432/app?sslmode=require';
    const multiHostConnection = 'postgresql://user:***@host1:5432,host2:5432/app?sslmode=require';
    const multiHostIpv6Connection = 'postgresql://user:***@[2001:db8::1]:5432,[2001:db8::2]:5432/app?sslmode=require';
    const result = mw.beforeRequest(
      makeRequest(
        `tokens: ${openAiKey}. ${githubToken}. Authorization: ${bearerToken}. plus=${plusBearerToken} tilde=${tildeBearerToken} dbs=(postgres://user:***@db.example.com:5432/app),redis://:cachepass@localhost:6379/0,done ipv6=${ipv6Connection}. cluster=${multiHostConnection}. cluster6=${multiHostIpv6Connection}.`,
      ),
    );
    const content = result.messages[0]!.content as string;
    expect(content).toContain('tokens: [API_KEY]. [API_KEY]. Authorization: [API_KEY].');
    expect(content).toContain('plus=[API_KEY]');
    expect(content).toContain('tilde=[API_KEY]');
    expect(content).not.toContain('plus=[API_KEY]+');
    expect(content).not.toContain('tilde=[API_KEY]~');
    expect(content).toContain('dbs=([CONNECTION_STRING]),[CONNECTION_STRING],done');
    expect(content).toContain('ipv6=[CONNECTION_STRING].');
    expect(content).toContain('cluster=[CONNECTION_STRING].');
    expect(content).toContain('cluster6=[CONNECTION_STRING].');
    expect(content).not.toContain(openAiKey);
    expect(content).not.toContain(githubToken);
    expect(content).not.toContain(bearerToken.replace('Bearer ', ''));
    expect(content).not.toContain(plusBearerToken.replace('Bearer ', ''));
    expect(content).not.toContain(tildeBearerToken.replace('Bearer ', ''));
    expect(content).not.toContain('postgres://user:***@db.example.com:5432/app');
    expect(content).not.toContain('redis://:cachepass@localhost:6379/0');
    expect(content).not.toContain(ipv6Connection);
    expect(content).not.toContain(multiHostConnection);
    expect(content).not.toContain(multiHostIpv6Connection);
  });

  it('masks PII in response (afterResponse)', () => {
    const result = mw.afterResponse(makeResponse('Email: user@test.com'));
    expect(result.content).toContain('[EMAIL]');
    expect(result.content).not.toContain('user@test.com');
  });

  it('handles multiple PII types in same text', () => {
    const result = mw.beforeRequest(
      makeRequest('Email john@test.com, SSN 123-45-6789, phone 555-123-4567'),
    );
    const content = result.messages[0]!.content as string;
    expect(content).toContain('[EMAIL]');
    expect(content).toContain('[SSN]');
    expect(content).toContain('[PHONE]');
  });

  it('preserves non-PII text', () => {
    const result = mw.beforeRequest(makeRequest('Hello world, no PII here'));
    expect((result.messages[0]!.content as string)).toBe('Hello world, no PII here');
  });

  it('handles content block arrays', () => {
    const req: LlmRequest = {
      systemPrompt: '',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: 'Email: user@test.com' },
        ],
      }],
    };
    const result = mw.beforeRequest(req);
    const blocks = result.messages[0]!.content as Array<{ type: string; text: string }>;
    expect(blocks[0]!.text).toContain('[EMAIL]');
  });
});
