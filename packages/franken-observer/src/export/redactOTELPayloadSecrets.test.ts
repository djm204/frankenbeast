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
    const pluralKeySecret = ['plural', 'key', 'credential'].join('-')
    const databaseSecret = ['database', 'credential', 'value'].join('-')
    const redisSecret = ['redis', 'tls', 'credential'].join('-')
    const genericUrlSecret = ['generic', 'url', 'credential'].join('-')
    const flagSecret = ['command', 'flag', 'credential'].join('-')
    const geminiSecret = `AIza${'e'.repeat(35)}`
    const slackSecret = ['slack', 'webhook', 'credential'].join('-')
    const jwtSecret = `eyJ${'a'.repeat(16)}.${'b'.repeat(16)}.${'c'.repeat(16)}`
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
      `debug ${JSON.stringify({ secrets: aggregateSecrets })}`,
      `postgres://user:${databaseSecret}@db.example.test/app`,
      `rediss://:${redisSecret}@cache.example.test:6380/0`,
      `https://user:${genericUrlSecret}@example.test/path`,
      `--api-key ${flagSecret}`,
      geminiSecret,
      `https://hooks.slack.com/services/T000/B000/${slackSecret}`,
      jwtSecret,
      `https://discord.com/api/webhooks/123/${webhookSecret}`,
      ...tokenSecrets,
      'safe diagnostic value',
    )
    input.resourceSpans[0]!.resource.attributes.push({
      key: `api_key=${keySecret}`,
      value: { boolValue: true },
    }, {
      key: 'credentials',
      value: { stringValue: pluralKeySecret },
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
      pluralKeySecret,
      databaseSecret,
      redisSecret,
      genericUrlSecret,
      flagSecret,
      geminiSecret,
      slackSecret,
      jwtSecret,
      webhookSecret,
      ...tokenSecrets,
    ]) {
      expect(output).not.toContain(secret)
    }
    expect(output).toContain('[REDACTED]')
    expect(output).toContain('safe diagnostic value')
  })
})
