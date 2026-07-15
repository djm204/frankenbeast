import { lookup as dnsLookup } from 'node:dns/promises'
import { request as httpsRequest } from 'node:https'
import { isIP } from 'node:net'

import { seededRandom } from '@franken/types'

import type { FetchFn } from '../adapters/langfuse/LangfuseAdapter.js'

export interface WebhookRetryOptions {
  /** Maximum number of retry attempts after the initial try. Default: 0 (no retry). */
  maxRetries: number
  /** Base delay in milliseconds before the first retry. Default: 200. */
  baseDelayMs?: number
  /** Maximum delay cap in milliseconds. Default: 30000. */
  maxDelayMs?: number
  /**
   * Add a random jitter of up to `baseDelayMs` to each delay to avoid
   * thundering-herd on shared endpoints. Default: true.
   */
  jitter?: boolean
}

export interface WebhookAllowedTarget {
  /** Trusted webhook origin, for example `https://discord.com`. */
  origin: string
  /** Optional URL path prefix that the configured webhook URL must start with. */
  pathnamePrefix?: string
}

type WebhookDnsLookup = (hostname: string) => Promise<readonly string[]>
type WebhookFetchInit = NonNullable<Parameters<FetchFn>[1]>
type WebhookFetchResponse = Awaited<ReturnType<FetchFn>> & {
  body?: ({ getReader?: () => ReadableStreamDefaultReader<Uint8Array> } & Partial<AsyncIterable<Uint8Array | Buffer | string>>) | null
}

export interface WebhookNotifierOptions {
  /** URL to POST the JSON payload to. */
  url: string
  /**
   * Explicit allowlist of webhook target origins. Defaults to deny-by-default:
   * callers must either include the configured URL's origin here or set
   * `allowUnlistedTarget: true` for a deliberate legacy/unsafe opt-out.
   */
  allowedTargetOrigins?: readonly string[]
  /**
   * Explicit allowlist of webhook targets. String entries may include an
   * optional pathname prefix; object entries separate the origin and prefix.
   * Prefer this over `allowedTargetOrigins` when only a specific provider path
   * such as `/api/webhooks/` should receive payloads.
   */
  allowedTargets?: readonly (string | WebhookAllowedTarget)[]
  /**
   * Explicit unsafe opt-out for legacy deployments that cannot provide an
   * allowlist yet. Prefer `allowedTargetOrigins` for normal operation.
   */
  allowUnlistedTarget?: boolean
  /**
   * Additional HTTP headers merged on every request.
   * Content-Type is set to application/json by default and can be
   * overridden here.
   */
  headers?: Record<string, string>
  /** Injectable for testing. Defaults to globalThis.fetch. */
  fetch?: FetchFn
  /**
   * Optional DNS resolver used to verify public hostnames before delivery.
   * Defaults to Node's DNS lookup when using the default fetch; injected fetches
   * must opt in explicitly so unit tests and custom transports stay deterministic.
   */
  dnsLookup?: WebhookDnsLookup
  /** Retry configuration. Omit to send exactly once (backwards-compatible). */
  retry?: WebhookRetryOptions
  /**
   * Injectable sleep function for testing retry delays without real timers.
   * Defaults to a Promise-based `setTimeout` wrapper.
   */
  sleep?: (ms: number) => Promise<void>
}

/**
 * Delivers HITL signals (CircuitBreaker, LoopDetector) to external systems
 * over HTTP. Any JSON-serialisable payload can be sent.
 *
 * send() throws on non-2xx responses and network errors. For fire-and-forget
 * use inside event handlers, suppress the rejection with `void`:
 *
 * ```ts
 * circuitBreaker.on('limit-reached', result => {
 *   void notifier.send({ type: 'circuit-breaker', ...result })
 *     .catch(err => console.error('webhook failed', err))
 * })
 * ```
 *
 * Configure retry with exponential backoff:
 *
 * ```ts
 * const notifier = new WebhookNotifier({
 *   url: 'https://hooks.example.com/signal',
 *   allowedTargetOrigins: ['https://hooks.example.com'],
 *   retry: { maxRetries: 3, baseDelayMs: 200, maxDelayMs: 5000 },
 * })
 * ```
 */
function isTransientStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599)
}

function validateNonNegativeInteger(value: number, fieldName: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${fieldName} must be a non-negative integer`)
  }
  return value
}

function validateFiniteNonNegativeNumber(value: number, fieldName: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${fieldName} must be a finite non-negative number`)
  }
  return value
}

interface NormalizedWebhookTarget {
  origin: string
  pathnamePrefix?: string
}

function parseAbsoluteUrl(value: string, fieldName: string): URL {
  try {
    return new URL(value)
  } catch {
    throw new TypeError(`${fieldName} must be an absolute URL`)
  }
}

function validateHttpsUrl(url: URL, fieldName: string): void {
  if (url.protocol !== 'https:') {
    throw new TypeError(`${fieldName} must use https:`)
  }
}

function validateUrlHasNoCredentials(url: URL, fieldName: string): void {
  if (url.username || url.password) {
    throw new TypeError(`${fieldName} must not include credentials`)
  }
}

function validateUrlHasNoQueryOrFragment(url: URL, fieldName: string): void {
  if (url.search || url.hash) {
    throw new TypeError(`${fieldName} must not include a query or fragment`)
  }
}

function extractShortcutIpv4Octets(host: string): [number, number, number, number] | undefined {
  const suffixes = ['.nip.io', '.sslip.io', '.xip.io']
  const suffix = suffixes.find(candidate => host.endsWith(candidate))
  if (!suffix) {
    return undefined
  }
  const labels = host.slice(0, -suffix.length).split(/[.-]/u).filter(Boolean)
  const octets = labels.slice(-4).map(Number)
  if (octets.length !== 4 || octets.some(octet => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return undefined
  }
  return octets as [number, number, number, number]
}

function ipv4FromMappedIpv6(ip: string): string | undefined {
  const normalizedIp = ip.toLowerCase()
  const dotted = /^(?:::ffff:|0:0:0:0:0:ffff:)(\d{1,3}(?:\.\d{1,3}){3})$/u.exec(normalizedIp)
  if (dotted) {
    return dotted[1]
  }

  const hexMapped = /^(?:::ffff:|0:0:0:0:0:ffff:)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/u.exec(normalizedIp)
  if (!hexMapped) {
    return undefined
  }
  const high = Number.parseInt(hexMapped[1], 16)
  const low = Number.parseInt(hexMapped[2], 16)
  if (!Number.isInteger(high) || !Number.isInteger(low) || high < 0 || high > 0xffff || low < 0 || low > 0xffff) {
    return undefined
  }
  return `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`
}

function isPrivateIpv4(ip: string): boolean {
  const octets = ip.split('.').map(Number)
  if (octets.length !== 4 || octets.some(octet => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return false
  }
  const [firstOctet, secondOctet] = octets as [number, number, number, number]
  return firstOctet === 0 ||
    firstOctet === 10 ||
    firstOctet === 127 ||
    (firstOctet === 169 && secondOctet === 254) ||
    (firstOctet === 172 && secondOctet >= 16 && secondOctet <= 31) ||
    (firstOctet === 192 && secondOctet === 168) ||
    (firstOctet === 100 && secondOctet >= 64 && secondOctet <= 127) ||
    firstOctet >= 224
}

function isPrivateIpv6(ip: string): boolean {
  const mappedIpv4 = ipv4FromMappedIpv6(ip)
  if (mappedIpv4) {
    return isPrivateIpv4(mappedIpv4)
  }
  const firstHextet = Number.parseInt(ip.split(':', 1)[0] || '0', 16)
  return ip === '::' ||
    ip === '::1' ||
    (Number.isInteger(firstHextet) && firstHextet >= 0xfe80 && firstHextet <= 0xfeff) ||
    ip.startsWith('fc') ||
    ip.startsWith('fd') ||
    ip.startsWith('ff')
}

function validatePublicWebhookHost(url: URL, fieldName: string): void {
  const hostname = normalizeHostnameForValidation(url.hostname)
  const shortcutIpv4 = extractShortcutIpv4Octets(hostname)
  if (hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === 'lvh.me' ||
    hostname.endsWith('.lvh.me') ||
    hostname === 'metadata' ||
    hostname === 'instance-data' ||
    hostname === 'metadata.google.internal' ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.svc') ||
    hostname.endsWith('.cluster.local') ||
    (shortcutIpv4 && isPrivateIpv4(shortcutIpv4.join('.')))) {
    throw new TypeError(`${fieldName} host ${hostname} is not allowed`)
  }

  const ipVersion = isIP(hostname)
  if (ipVersion === 4) {
    if (isPrivateIpv4(hostname)) {
      throw new TypeError(`${fieldName} host ${hostname} is not allowed`)
    }
  }

  if (ipVersion === 6) {
    if (isPrivateIpv6(hostname)) {
      throw new TypeError(`${fieldName} host ${hostname} is not allowed`)
    }
  }
}

function normalizeHostnameForValidation(hostname: string): string {
  return hostname.replace(/^\[|\]$/g, '').replace(/\.+$/g, '').toLowerCase()
}

function isTransientDnsError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false
  }
  const code = (error as { code?: unknown }).code
  return code === 'EAI_AGAIN' || code === 'ETIMEOUT' || code === 'ETIMEDOUT' || code === 'ECONNRESET'
}

function parseUrlOrigin(value: string, fieldName: string): string {
  const url = parseAbsoluteUrl(value, fieldName)
  validateHttpsUrl(url, fieldName)
  validatePublicWebhookHost(url, fieldName)
  return url.origin
}

function normalizeAllowedTargetOrigins(origins: readonly string[] | undefined): ReadonlySet<string> | null {
  if (!origins || origins.length === 0) {
    return null
  }

  return new Set(origins.map(origin => parseUrlOrigin(origin, 'allowedTargetOrigins entry')))
}

function validateWebhookPathname(pathname: string, fieldName: string): void {
  if (/%(?:2e|2f|5c)/iu.test(pathname)) {
    throw new TypeError(`${fieldName} must not include encoded dot segments or separators`)
  }
  const segments = pathname.split('/')
  if (segments.includes('.') || segments.includes('..')) {
    throw new TypeError(`${fieldName} must not include dot segments`)
  }
}

function normalizePathnamePrefix(pathnamePrefix: string | undefined, fieldName: string): string | undefined {
  if (pathnamePrefix === undefined || pathnamePrefix === '' || pathnamePrefix === '/') {
    return undefined
  }
  validateWebhookPathname(pathnamePrefix, fieldName)
  if (!pathnamePrefix.startsWith('/')) {
    throw new TypeError(`${fieldName} must start with /`)
  }
  return pathnamePrefix
}

function assertOriginOnly(url: URL, fieldName: string): void {
  if (url.pathname !== '/' || url.search !== '' || url.hash !== '') {
    throw new TypeError(`${fieldName} must not include a path, query, or fragment; use pathnamePrefix for path scoping`)
  }
}

function pathMatchesPrefix(pathname: string, pathnamePrefix: string | undefined): boolean {
  if (!pathnamePrefix) {
    return true
  }
  if (pathname === pathnamePrefix) {
    return true
  }
  const boundaryPrefix = pathnamePrefix.endsWith('/') ? pathnamePrefix : `${pathnamePrefix}/`
  return pathname.startsWith(boundaryPrefix)
}

function normalizeAllowedTargets(
  targets: readonly (string | WebhookAllowedTarget)[] | undefined,
): readonly NormalizedWebhookTarget[] {
  if (!targets || targets.length === 0) {
    return []
  }

  return targets.map((target, index) => {
    if (typeof target === 'string') {
      const url = parseAbsoluteUrl(target, `allowedTargets[${index}]`)
      validateHttpsUrl(url, `allowedTargets[${index}]`)
      validateUrlHasNoCredentials(url, `allowedTargets[${index}]`)
      validateUrlHasNoQueryOrFragment(url, `allowedTargets[${index}]`)
      validatePublicWebhookHost(url, `allowedTargets[${index}]`)
      validateWebhookPathname(url.pathname, `allowedTargets[${index}].pathname`)
      return {
        origin: url.origin,
        pathnamePrefix: normalizePathnamePrefix(url.pathname, `allowedTargets[${index}].pathnamePrefix`),
      }
    }

    const url = parseAbsoluteUrl(target.origin, `allowedTargets[${index}].origin`)
    validateHttpsUrl(url, `allowedTargets[${index}].origin`)
    validateUrlHasNoCredentials(url, `allowedTargets[${index}].origin`)
    validatePublicWebhookHost(url, `allowedTargets[${index}].origin`)
    assertOriginOnly(url, `allowedTargets[${index}].origin`)
    return {
      origin: url.origin,
      pathnamePrefix: normalizePathnamePrefix(target.pathnamePrefix, `allowedTargets[${index}].pathnamePrefix`),
    }
  })
}

const MAX_ERROR_BODY_CHARS = 2048
const ERROR_BODY_READ_TIMEOUT_MS = 250

function redactWebhookSecrets(value: string): string {
  return value
    .replace(/("(?:authorization|x-api-key|api-key|x-auth-token)"\s*:\s*)\[[^\]]*\]/gi, '$1["[REDACTED]"]')
    .replace(/("(?:authorization|x-api-key|api-key|x-auth-token)"\s*:\s*)\[[^\]\r\n,;<>}]*$/gim, '$1["[REDACTED]"]')
    .replace(/("(?:authorization|x-api-key|api-key|x-auth-token)"\s*:\s*)"[^"]*"/gi, '$1"[REDACTED]"')
    .replace(/("(?:authorization|x-api-key|api-key|x-auth-token)"\s*:\s*)"[^"\r\n,;<>}]*$/gim, '$1"[REDACTED]"')
    .replace(/\bAuthorization:\s*Bearer \*\*\*(?:\s+X-Api-Key=[^\r\n,;<>}]+)?/gi, 'Authorization: ***')
    .replace(/(^|[\s;{])((?:authorization|x-api-key|api-key|x-auth-token)\s*[:=]\s*)(?!\s*\*\*\*)[^\r\n,;<>}]+/gi, '$1$2[REDACTED]')
    .replace(/https?:\\\/\\\/[^\s"'<>]+/g, match => sanitizeWebhookEndpoint(match.replace(/\\\//g, '/')))
    .replace(/https?:\/\/[^\s"'<>]+/g, match => sanitizeWebhookEndpoint(match))
}

function sanitizeWebhookEndpoint(value: string): string {
  try {
    const url = new URL(value)
    url.username = ''
    url.password = ''
    url.search = ''
    url.hash = ''

    if (url.hostname === 'hooks.slack.com') {
      url.pathname = '/services/[REDACTED]'
    } else {
      url.pathname = url.pathname
        .split('/')
        .map((segment, index) => (segment && !(index === 1 && segment === 'services') ? '[REDACTED]' : segment))
        .join('/')
    }

    return url.toString()
  } catch {
    return '[REDACTED]'
  }
}

export class WebhookNotifier {
  private readonly url: string
  private readonly parsedUrl: URL
  private readonly targetOrigin: string
  private readonly allowedTargetOrigins: ReadonlySet<string> | null
  private readonly allowedTargets: readonly NormalizedWebhookTarget[]
  private readonly allowUnlistedTarget: boolean
  private readonly extraHeaders: Record<string, string>
  private readonly fetchFn: FetchFn
  private readonly usePinnedDefaultFetch: boolean
  private readonly dnsLookupFn: WebhookDnsLookup | null
  private readonly retry: Required<WebhookRetryOptions> | null
  private readonly sleepFn: (ms: number) => Promise<void>

  constructor(options: WebhookNotifierOptions) {
    this.url = options.url
    this.parsedUrl = parseAbsoluteUrl(options.url, 'url')
    validateHttpsUrl(this.parsedUrl, 'url')
    validateUrlHasNoCredentials(this.parsedUrl, 'url')
    validatePublicWebhookHost(this.parsedUrl, 'url')
    validateWebhookPathname(this.parsedUrl.pathname, 'url pathname')
    this.targetOrigin = this.parsedUrl.origin
    this.allowedTargetOrigins = normalizeAllowedTargetOrigins(options.allowedTargetOrigins)
    this.allowedTargets = normalizeAllowedTargets(options.allowedTargets)
    this.allowUnlistedTarget = options.allowUnlistedTarget ?? false
    if (!this.allowUnlistedTarget && this.allowedTargetOrigins === null && this.allowedTargets.length === 0) {
      throw new Error(
        'Webhook target allowlist is required; set allowedTargets or allowedTargetOrigins, or explicitly opt out with allowUnlistedTarget: true',
      )
    }
    this.extraHeaders = options.headers ?? {}
    this.fetchFn = options.fetch ?? (globalThis.fetch as unknown as FetchFn)
    this.usePinnedDefaultFetch = !options.fetch
    this.dnsLookupFn = options.dnsLookup ?? (options.fetch
      ? null
      : async hostname => (await dnsLookup(hostname, { all: true })).map(result => result.address))
    this.sleepFn = options.sleep ?? ((ms: number) => new Promise(r => setTimeout(r, ms)))
    this.retry = options.retry
      ? {
          maxRetries: validateNonNegativeInteger(options.retry.maxRetries, 'retry.maxRetries'),
          baseDelayMs: validateFiniteNonNegativeNumber(options.retry.baseDelayMs ?? 200, 'retry.baseDelayMs'),
          maxDelayMs: validateFiniteNonNegativeNumber(options.retry.maxDelayMs ?? 30_000, 'retry.maxDelayMs'),
          jitter: options.retry.jitter ?? true,
        }
      : null
  }

  async send(payload: unknown): Promise<void> {
    this.assertTargetAllowed()

    const maxAttempts = this.retry ? 1 + this.retry.maxRetries : 1
    let lastError: unknown

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (attempt > 0 && this.retry) {
        const { baseDelayMs, maxDelayMs, jitter } = this.retry
        const base = Math.min(baseDelayMs * Math.pow(2, attempt - 1), maxDelayMs)
        const jittered = jitter ? base + seededRandom.random() * baseDelayMs : base
        // Clamp after adding jitter so maxDelayMs remains a true upper bound.
        const delay = Math.min(jittered, maxDelayMs)
        await this.sleepFn(delay)
      }

      let resolvedAddresses: readonly string[] = []
      try {
        resolvedAddresses = await this.resolveAllowedTargetAddresses()
      } catch (err) {
        lastError = err
        if (this.retry && isTransientDnsError(err) && attempt < maxAttempts - 1) {
          continue
        }
        throw err
      }

      let response: WebhookFetchResponse
      try {
        response = await this.fetchWebhook(resolvedAddresses, {
          method: 'POST',
          redirect: 'manual',
          headers: {
            'Content-Type': 'application/json',
            ...this.extraHeaders,
          },
          body: JSON.stringify(payload),
        })
      } catch (err) {
        lastError = err
        continue
      }

      if (!response.ok) {
        const shouldReadBody = !this.retry || !isTransientStatus(response.status) || attempt === maxAttempts - 1
        const responseBody = shouldReadBody ? await this.readResponseBody(response) : ''
        const bodySuffix = responseBody ? `: ${responseBody}` : ''
        lastError = new Error(
          `Webhook delivery failed: ${response.status}${response.statusText ? ` ${response.statusText}` : ''} for ${sanitizeWebhookEndpoint(this.url)}${bodySuffix}`,
        )
        if (!this.retry || !isTransientStatus(response.status) || attempt === maxAttempts - 1) {
          throw lastError
        }
        continue
      }
      return
    }

    throw lastError
  }

  private async readResponseBody(response: WebhookFetchResponse): Promise<string> {
    try {
      const readable = response as {
        body?: ({ getReader?: () => ReadableStreamDefaultReader<Uint8Array> } & Partial<AsyncIterable<Uint8Array | Buffer | string>>) | null
        text?: () => Promise<string>
      }
      const body = readable.body
        ? typeof readable.body.getReader === 'function'
          ? await this.readBoundedStream(readable.body as ReadableStream<Uint8Array>)
          : await this.readBoundedAsyncIterable(readable.body)
        : ''
      const redactedBody = redactWebhookSecrets(body)
      return redactedBody.length > MAX_ERROR_BODY_CHARS
        ? `${redactedBody.slice(0, MAX_ERROR_BODY_CHARS)}…`
        : redactedBody
    } catch {
      return ''
    }
  }

  private async readBoundedStream(stream: ReadableStream<Uint8Array>): Promise<string> {
    const reader = stream.getReader()
    const chunks: Uint8Array[] = []
    let totalBytes = 0
    let timedOut = false
    let truncated = false
    const deadlineMs = Date.now() + ERROR_BODY_READ_TIMEOUT_MS

    try {
      while (totalBytes < MAX_ERROR_BODY_CHARS) {
        const remainingMs = deadlineMs - Date.now()
        if (remainingMs <= 0) {
          timedOut = true
          break
        }
        let timeoutId: ReturnType<typeof setTimeout> | undefined
        const timeout = new Promise<{ done: true; value?: undefined; timedOut: true }>(resolve => {
          timeoutId = setTimeout(() => resolve({ done: true, timedOut: true }), remainingMs)
        })
        const result = await Promise.race([
          reader.read().then(read => ({ ...read, timedOut: false as const })),
          timeout,
        ]).finally(() => {
          if (timeoutId) {
            clearTimeout(timeoutId)
          }
        })
        if (result.timedOut) {
          timedOut = true
          break
        }
        const { value, done } = result
        if (done || !value) {
          break
        }
        const remainingBytes = MAX_ERROR_BODY_CHARS - totalBytes
        truncated = value.byteLength > remainingBytes
        const boundedChunk = truncated ? value.subarray(0, remainingBytes) : value
        chunks.push(boundedChunk)
        totalBytes += boundedChunk.byteLength
        if (totalBytes >= MAX_ERROR_BODY_CHARS) {
          truncated = true
          break
        }
      }
      if (truncated || timedOut) {
        await reader.cancel()
      }
    } finally {
      reader.releaseLock()
    }

    const decoded = new TextDecoder().decode(Buffer.concat(chunks).subarray(0, MAX_ERROR_BODY_CHARS)).trim()
    return truncated || timedOut ? `${decoded}…` : decoded
  }

  private async readBoundedAsyncIterable(body: unknown): Promise<string> {
    const iterator = body && typeof body === 'object'
      ? (body as Partial<AsyncIterable<Uint8Array | Buffer | string>>)[Symbol.asyncIterator]
      : undefined
    if (typeof iterator !== 'function') {
      return ''
    }

    const chunks: Uint8Array[] = []
    let totalBytes = 0
    let truncated = false
    const deadlineMs = Date.now() + ERROR_BODY_READ_TIMEOUT_MS

    for await (const chunk of body as AsyncIterable<Uint8Array | Buffer | string>) {
      if (Date.now() >= deadlineMs) {
        truncated = true
        break
      }
      const bytes = typeof chunk === 'string' ? Buffer.from(chunk) : Buffer.from(chunk)
      const remainingBytes = MAX_ERROR_BODY_CHARS - totalBytes
      if (bytes.byteLength > remainingBytes) {
        chunks.push(bytes.subarray(0, remainingBytes))
        totalBytes += remainingBytes
        truncated = true
        break
      }
      chunks.push(bytes)
      totalBytes += bytes.byteLength
      if (totalBytes >= MAX_ERROR_BODY_CHARS) {
        truncated = true
        break
      }
    }

    const decoded = new TextDecoder().decode(Buffer.concat(chunks).subarray(0, MAX_ERROR_BODY_CHARS)).trim()
    return truncated ? `${decoded}…` : decoded
  }

  private async resolveAllowedTargetAddresses(): Promise<readonly string[]> {
    const hostname = normalizeHostnameForValidation(this.parsedUrl.hostname)
    if (!this.dnsLookupFn || isIP(hostname) !== 0) {
      return []
    }
    const addresses = await this.dnsLookupFn(hostname)
    if (addresses.length === 0) {
      throw new Error(`Webhook DNS lookup returned no addresses for host ${hostname}`)
    }
    for (const address of addresses) {
      const parsedAddress = parseAbsoluteUrl(`https://${isIP(address) === 6 ? `[${address}]` : address}/`, 'resolved webhook address')
      validatePublicWebhookHost(parsedAddress, 'resolved webhook address')
    }
    return addresses
  }

  private async fetchWebhook(resolvedAddresses: readonly string[], init: WebhookFetchInit): Promise<WebhookFetchResponse> {
    if (resolvedAddresses.length === 0) {
      return this.fetchFn(this.url, init)
    }

    let lastError: unknown
    for (const address of resolvedAddresses) {
      try {
        return this.usePinnedDefaultFetch
          ? await this.fetchWithPinnedAddress(address, init)
          : await this.fetchWithPinnedCustomFetch(address, init)
      } catch (err) {
        lastError = err
      }
    }

    throw lastError
  }

  private async fetchWithPinnedCustomFetch(address: string, init: WebhookFetchInit): Promise<WebhookFetchResponse> {
    const pinnedUrl = new URL(this.url)
    pinnedUrl.hostname = isIP(address) === 6 ? `[${address}]` : address
    return this.fetchFn(pinnedUrl.toString(), {
      ...init,
      headers: {
        ...(init.headers as Record<string, string>),
        Host: this.parsedUrl.host,
      },
    })
  }

  private async fetchWithPinnedAddress(address: string, init: WebhookFetchInit): Promise<WebhookFetchResponse> {
    const originalHostname = normalizeHostnameForValidation(this.parsedUrl.hostname)
    return new Promise((resolve, reject) => {
      const request = httpsRequest({
        hostname: address,
        port: this.parsedUrl.port || 443,
        path: `${this.parsedUrl.pathname}${this.parsedUrl.search}`,
        method: init.method,
        servername: originalHostname,
        headers: {
          ...init.headers,
          Host: this.parsedUrl.host,
        },
      }, response => {
        resolve({
          ok: response.statusCode !== undefined && response.statusCode >= 200 && response.statusCode < 300,
          status: response.statusCode ?? 0,
          statusText: response.statusMessage,
          body: response as unknown as WebhookFetchResponse['body'],
        })
      })
      request.on('error', reject)
      if (init.body) {
        request.write(init.body)
      }
      request.end()
    })
  }

  private assertTargetAllowed(): void {
    if (this.allowUnlistedTarget) {
      return
    }
    const targetAllowedByOrigin = this.allowedTargetOrigins?.has(this.targetOrigin) ?? false
    const targetAllowedByPath = this.allowedTargets.some(target => {
      if (target.origin !== this.targetOrigin) {
        return false
      }
      return pathMatchesPrefix(this.parsedUrl.pathname, target.pathnamePrefix)
    })
    if (!targetAllowedByOrigin && !targetAllowedByPath) {
      throw new Error(`Webhook target origin ${this.targetOrigin} is not allowed`)
    }
  }
}
