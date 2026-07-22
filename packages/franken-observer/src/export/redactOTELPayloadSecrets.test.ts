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
    const proxyAuthSecret = ['proxy', 'auth', 'credential'].join('-')
    const basicAuthSecret = ['basic', 'auth', 'credential'].join('-')
    const tupleAuthSecret = ['tuple', 'auth', 'credential'].join('-')
    const tupleApiKeySecret = ['tuple', 'api', 'credential'].join('-')
    const truncatedAuthSecret = ['truncated', 'auth', 'credential'].join('-')
    const escapedJsonSecret = ['escaped', 'json', 'credential'].join('-')
    const digestSecret = ['digest', 'auth', 'credential'].join('-')
    const headerObjectSecret = ['header', 'object', 'credential'].join('-')
    const passphraseSecret = ['vault', 'passphrase', 'credential'].join('-')
    const multiwordSecret = ['correct', 'horse', 'battery', 'staple'].join(' ')
    const multiValueHeaderSecret = ['multi', 'value', 'header', 'credential'].join('-')
    const unmatchedTupleSecret = ['unmatched', 'tuple', 'credential'].join('-')
    const unmatchedArraySecrets = ['alpha one', 'beta two']
    const escapedArraySecrets = ['escaped alpha', 'escaped beta']
    const truncatedArraySecrets = ['truncated alpha', 'truncated beta']
    const dottedSecret = ['dotted', 'api', 'credential'].join('-')
    const claudeSessionSecret = ['claude', 'session', 'credential'].join('-')
    const stringMetricTokenSecret = ['input', 'token', 'credential'].join('-')
    const capitalizedHeaderSecret = ['capitalized', 'header', 'credential'].join('-')
    const acronymApiKeySecret = ['acronym', 'api', 'credential'].join('-')
    const sigV4Secret = ['sigv4', 'signature', 'credential'].join('-')
    const truncatedHeaderSecret = ['truncated', 'header', 'credential'].join('-')
    const singleTupleSecret = ['single', 'tuple', 'credential'].join('-')
    const singleFieldSecret = ['single', 'field', 'credential'].join('-')
    const queryApiKeySecret = ['query', 'api', 'credential'].join('-')
    const queryTokenSecret = ['query', 'token', 'credential'].join('-')
    const pgPasswordSecret = ['pg', 'password', 'credential'].join('-')
    const clientSecret = ['client', 'secret', 'credential'].join('-')
    const aliasSecrets = ['sshKey', 'signing_key', 'gpg_key', 'PAT', 'webhookUrl']
      .map(key => [key, `${key}-credential`] as const)
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
      `proxyAuthorization=Bearer ${proxyAuthSecret}`,
      `--auth Basic ${basicAuthSecret}`,
      JSON.stringify([['Authorization', `Basic ${tupleAuthSecret}`], ['x-api-key', tupleApiKeySecret]]),
      `{"Authorization":"Token ${truncatedAuthSecret}`,
      `body={\\"password\\":\\"${escapedJsonSecret}\\"}`,
      `--auth Digest ${digestSecret}`,
      JSON.stringify([{ key: 'x-api-key', value: headerObjectSecret }]),
      `FRANKENBEAST_PASSPHRASE=${passphraseSecret}`,
      `password: ${multiwordSecret}`,
      `passphrase=${multiwordSecret}`,
      JSON.stringify({ name: 'x-api-key', values: [multiValueHeaderSecret] }),
      `prefix { ... ${JSON.stringify([['x-api-key', unmatchedTupleSecret]])}`,
      `prefix { ... ${JSON.stringify({ safe: 'x', password: unmatchedArraySecrets })}`,
      `body={\\"password\\":[\\"${escapedArraySecrets[0]}\\",\\"${escapedArraySecrets[1]}\\"]}`,
      `user: alice password: ${multiwordSecret}`,
      `{"password":["${truncatedArraySecrets[0]}","${truncatedArraySecrets[1]}"`,
      `openai.api.key=${dottedSecret}`,
      JSON.stringify({ CLAUDE_SESSION: claudeSessionSecret }),
      ...aliasSecrets.map(([key, secret]) => JSON.stringify({ [key]: secret })),
      geminiSecret,
      `https://hooks.slack.com/services/T000/B000/${slackSecret}`,
      jwtSecret,
      `https://discord.com/api/webhooks/123/${webhookSecret}`,
      ...tokenSecrets,
      JSON.stringify({ Name: 'Authorization', Value: `Basic ${capitalizedHeaderSecret}` }),
      `--auth AWS4-HMAC-SHA256 Credential=scope, SignedHeaders=host, Signature=${sigV4Secret}`,
      `{"name":"x-api-key","value":"${truncatedHeaderSecret}"`,
      `[['x-api-key','${singleTupleSecret}']]`,
      `{'password': '${singleFieldSecret}'}`,
      'tool:execute tokens=504',
      'usage={"input_tokens":30,"output_tokens":8}',
      `url=https://example.test/cb?api_key=${queryApiKeySecret}&safe=value`,
      `https://example.test/cb?safe=value&token=${queryTokenSecret}`,
      `PGPASSWORD=${pgPasswordSecret}`,
      `clientsecret=${clientSecret}`,
      'safe diagnostic value',
    )
    input.resourceSpans[0]!.resource.attributes.push({
      key: `api_key=${keySecret}`,
      value: { boolValue: true },
    }, {
      key: 'credentials',
      value: { stringValue: pluralKeySecret },
    }, {
      key: 'OpenAIAPIKey',
      value: { stringValue: acronymApiKeySecret },
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
      proxyAuthSecret,
      basicAuthSecret,
      tupleAuthSecret,
      tupleApiKeySecret,
      truncatedAuthSecret,
      escapedJsonSecret,
      digestSecret,
      headerObjectSecret,
      passphraseSecret,
      multiwordSecret,
      multiValueHeaderSecret,
      unmatchedTupleSecret,
      ...unmatchedArraySecrets,
      ...escapedArraySecrets,
      ...truncatedArraySecrets,
      dottedSecret,
      claudeSessionSecret,
      ...aliasSecrets.map(([, secret]) => secret),
      geminiSecret,
      slackSecret,
      jwtSecret,
      webhookSecret,
      ...tokenSecrets,
      capitalizedHeaderSecret,
      acronymApiKeySecret,
      sigV4Secret,
      truncatedHeaderSecret,
      singleTupleSecret,
      singleFieldSecret,
      queryApiKeySecret,
      queryTokenSecret,
      pgPasswordSecret,
      clientSecret,
    ]) {
      expect(output).not.toContain(secret)
    }
    expect(output).toContain('[REDACTED]')
    expect(output).toContain('safe diagnostic value')
    expect(output).toContain('tool:execute tokens=504')
    expect(output).toContain('\\"input_tokens\\":30')
    expect(output).toContain('\\"output_tokens\\":8')

    for (const key of ['promptTokens', 'inputTokens', 'outputTokens', 'cached_tokens']) {
      input.resourceSpans[0]!.resource.attributes.push({ key, value: { intValue: 42 } })
    }
    input.resourceSpans[0]!.resource.attributes.push({
      key: 'inputToken',
      value: { stringValue: stringMetricTokenSecret },
    })
    const withMetrics = redactOTELPayloadSecrets(input)
    expect(withMetrics.resourceSpans[0]!.resource.attributes.slice(-5, -1)).toEqual(
      ['promptTokens', 'inputTokens', 'outputTokens', 'cached_tokens']
        .map(key => ({ key, value: { intValue: 42 } })),
    )
    expect(JSON.stringify(withMetrics)).not.toContain(stringMetricTokenSecret)
  })

  it('handles unmatched JSON openers without repeatedly rescanning the suffix', () => {
    const secret = ['unmatched', 'brace', 'credential'].join('-')
    const input = payloadWith(`${'{'.repeat(20_000)} password=${secret}`)

    const output = JSON.stringify(redactOTELPayloadSecrets(input))

    expect(output).not.toContain(secret)
    expect(output).toContain('[REDACTED]')
  })
})
