import { describe, expect, it } from 'vitest'
import type { OTELPayload } from './OTELSerializer.js'
import { redactOTELPayloadSecrets } from './redactOTELPayloadSecrets.js'

function payloadWith(...values: string[]): OTELPayload {
  return {
    resourceSpans: [{
      resource: {
        attributes: values.map((value, index) => ({
          key: `diagnostic.${index}`,
          value: { stringValue: value },
        })),
      },
      scopeSpans: [{ scope: { name: '@franken/observer' }, spans: [] }],
    }],
  }
}

describe('redactOTELPayloadSecrets', () => {
  it('redacts shared credential families from OTEL text attributes', () => {
    const cookieSecret = ['cookie', 'session', 'credential'].join('-')
    const csrfSecret = ['cookie', 'csrf', 'credential'].join('-')
    const basicSecret = ['dXNl', 'cjpw', 'YXNz'].join('')
    const databaseSecret = ['database', 'credential', 'value'].join('-')
    const webhookSecret = ['discord', 'webhook', 'credential'].join('-')
    const tokenSecrets = [
      ['github', 'pat', 'a'.repeat(24)].join('_'),
      `ghs_${'b'.repeat(24)}`,
      `ghr_${'c'.repeat(24)}`,
      `npm_${'d'.repeat(24)}`,
    ]

    const redacted = redactOTELPayloadSecrets(payloadWith(
      `Cookie: session=${cookieSecret}; csrf=${csrfSecret}`,
      `authorization=Basic ${basicSecret}`,
      `postgres://user:${databaseSecret}@db.example.test/app`,
      `https://discord.com/api/webhooks/123/${webhookSecret}`,
      ...tokenSecrets,
      'safe diagnostic value',
    ))
    const output = JSON.stringify(redacted)

    for (const secret of [
      cookieSecret,
      csrfSecret,
      basicSecret,
      databaseSecret,
      webhookSecret,
      ...tokenSecrets,
    ]) {
      expect(output).not.toContain(secret)
    }
    expect(output).toContain('[REDACTED]')
    expect(output).toContain('safe diagnostic value')
  })
})
