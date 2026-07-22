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
    const tokenAuthSecret = ['token', 'authorization', 'credential'].join('-')
    const aggregateSecrets = [
      ['aggregate', 'credential', 'one'].join('-'),
      ['aggregate', 'credential', 'two'].join('-'),
    ]
    const keySecret = ['dynamic', 'key', 'credential'].join('-')
    const databaseSecret = ['database', 'credential', 'value'].join('-')
    const redisSecret = ['redis', 'tls', 'credential'].join('-')
    const webhookSecret = ['discord', 'webhook', 'credential'].join('-')
    const tokenSecrets = [
      ['github', 'pat', 'a'.repeat(24)].join('_'),
      `ghs_${'b'.repeat(24)}`,
      `ghr_${'c'.repeat(24)}`,
      `npm_${'d'.repeat(24)}`,
    ]

    const input = payloadWith(
      `Cookie: session=${cookieSecret}; csrf=${csrfSecret}`,
      `authorization=Basic ${basicSecret}`,
      `Authorization: Token ${tokenAuthSecret}`,
      JSON.stringify({ password: aggregateSecrets }),
      `postgres://user:${databaseSecret}@db.example.test/app`,
      `rediss://:${redisSecret}@cache.example.test:6380/0`,
      `https://discord.com/api/webhooks/123/${webhookSecret}`,
      ...tokenSecrets,
      'safe diagnostic value',
    )
    input.resourceSpans[0]!.resource.attributes.push({
      key: `api_key=${keySecret}`,
      value: { boolValue: true },
    })

    const redacted = redactOTELPayloadSecrets(input)
    const output = JSON.stringify(redacted)

    for (const secret of [
      cookieSecret,
      csrfSecret,
      basicSecret,
      tokenAuthSecret,
      ...aggregateSecrets,
      keySecret,
      databaseSecret,
      redisSecret,
      webhookSecret,
      ...tokenSecrets,
    ]) {
      expect(output).not.toContain(secret)
    }
    expect(output).toContain('[REDACTED]')
    expect(output).toContain('safe diagnostic value')
  })
})
