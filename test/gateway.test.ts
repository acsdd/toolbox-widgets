import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  defaultGatewayCliPath,
  fetchGatewayRequests,
  fetchGatewayStatus,
  gatewayAlerts,
  parseGatewayAudit,
  parseGatewayPrivacy,
  parseGatewayRequests,
  parseGatewayRouting,
  parseGatewayServices,
  summarizeGatewayRequests,
  type ExecFileLike,
  type GatewayRequest
} from '../dist/index.js'

/** Trimmed copies of real `astrlink` CLI output. */
const SERVICES = {
  items: [
    {
      id: 'service_lan',
      name: 'http://100.94.16.81:1234/api/v1/',
      kind: 'newapi',
      enabled: false,
      models: ['LiquidAI/LFM2_5-2_6B-Q4_K_M'],
      capabilities: [{ protocol: 'openai.chat', mode: 'native', streaming: true, convert_to: 'anthropic.messages' }],
      base_origin: 'http://100.94.16.81:1234'
    },
    {
      id: 'service_claude',
      name: 'Claude Code',
      kind: 'claude_subscription',
      enabled: true,
      models: [],
      capabilities: [{ protocol: 'anthropic.messages', mode: 'native', streaming: true }],
      subscription: {
        provider: 'claude_code',
        status: 'disconnected',
        last_error: { code: 'claude_login_failed', message: 'Invalid code. Please make sure the full code was copied.' }
      }
    },
    {
      id: 'service_grok',
      name: 'Grok subscription',
      kind: 'grok_subscription',
      enabled: true,
      models: ['grok-4.7'],
      capabilities: [],
      subscription: {
        provider: 'xai_grok',
        status: 'connected',
        account_hint: '9ced***dd',
        token_expires_at: '2026-11-12T17:39:31Z',
        last_refresh_at: '2026-11-12T11:39:31Z'
      }
    }
  ]
}

const ROUTING = {
  strategy: 'failover_only',
  max_attempts: 6,
  codex_identity_enforcement: true,
  claude_identity_enforcement: true,
  grok_identity_enforcement: false,
  subscription_risk_protection: true,
  subscription_session_isolation: true,
  official_client_passthrough: true,
  reasoning_mode: 'passthrough',
  reasoning_level: 'medium',
  model_redirects: [{ from: 'codex-auto-review', to: 'claude-*', enabled: true }],
  channel_stickiness: { enabled: true, ttl_seconds: 3600 },
  default_failure_policy: { max_retries: 1 },
  builtin_tools: {
    web_search: { enabled: true, backend: 'upstream', service_id: 'service_codex', model: 'gpt-6-luna' }
  }
}

const AUDIT = {
  request_body_enabled: true,
  response_content_enabled: true,
  http_meta_enabled: true,
  request_body_max_bytes: 33554432,
  response_content_max_bytes: 4194304,
  metadata_retention_days: 30,
  content_retention_days: 7,
  agent_raw_access_enabled: true
}

const PRIVACY = {
  items: [
    {
      id: 'policy_privacy_default',
      name: 'privacy',
      enabled: true,
      detector: 'regex',
      custom_regex_rules: { count: 13, kinds: ['account', 'common_secret'] },
      enabled_kinds: ['common_secret'],
      allowlist: { count: 15, by_type: { cidr: 6, domain_suffix: 9 } },
      request_action: 'warn',
      response_action: 'allow',
      response_restore: true
    }
  ]
}

const REQUESTS = {
  items: [
    {
      id: 'request_1',
      session_id: 'session_1',
      started_at: '2026-11-10T12:59:27Z',
      completed_at: '2026-11-10T12:59:35Z',
      status: 'succeeded',
      client_type: 'codex',
      input_protocol: 'openai.responses',
      requested_model: 'gpt-6-luna',
      recovery: { upstream_model: 'gpt-6-luna' },
      service_id: 'service_codex',
      http_status: 200,
      latency_ms: 8282,
      first_token_ms: 7439,
      streaming: true,
      child_count: 0,
      usage: { input_tokens: 8761, output_tokens: 63, total_tokens: 8824, cache_read_tokens: 4224, cache_write_tokens: 0 },
      error: null,
      privacy_decision: 'allow',
      audit: { request_body_captured: true, response_content_captured: true },
      input_preview: '{"action":"search","query":"a private prompt"}',
      cursors: [{ kind: 'echo_id', direction: 'out', value: 'msg_1' }],
      events: [{ kind: 'accepted', summary: 'gpt-6-luna' }]
    },
    {
      id: 'request_2',
      session_id: null,
      started_at: '2026-11-10T13:00:00Z',
      completed_at: null,
      status: 'failed',
      client_type: 'unknown',
      input_protocol: 'openai.chat',
      requested_model: 'claude-opus-4-6',
      recovery: null,
      service_id: 'service_claude',
      http_status: 401,
      latency_ms: 120,
      first_token_ms: null,
      streaming: false,
      child_count: 2,
      usage: null,
      error: { code: 'upstream_http', message: 'HTTP 401 from upstream' },
      privacy_decision: 'allow',
      audit: { request_body_captured: false, response_content_captured: false }
    }
  ],
  next_cursor: 'abc'
}

const NOW = Date.parse('2026-11-12T12:00:00Z')

/** Canned CLI: routes keyed by the first argument, failures keyed the same way. */
function cliExec(
  routes: Record<string, unknown>,
  failures: Record<string, string> = {},
  calls: Array<{ file: string; args: string[] }> = []
): ExecFileLike {
  return (file, args, _options, cb) => {
    calls.push({ file, args })
    const key = args[0]
    if (failures[key]) {
      cb(new Error(failures[key]), '')
      return
    }
    cb(null, JSON.stringify(routes[key] ?? {}))
  }
}

describe('gateway cli path', () => {
  it('points at the read-only astrlink CLI in the user profile', () => {
    const path = defaultGatewayCliPath()
    assert.ok(path.includes('.astrlink'), path)
    assert.ok(path.includes('bin'), path)
    assert.ok(path.endsWith(process.platform === 'win32' ? 'astrlink.exe' : 'astrlink'), path)
  })
})

describe('gateway parsers', () => {
  it('normalizes services and never keeps the account hint', () => {
    const services = parseGatewayServices(SERVICES)
    assert.equal(services.length, 3)
    assert.equal(services[0].enabled, false)
    assert.equal(services[0].baseOrigin, 'http://100.94.16.81:1234')
    assert.equal(services[0].capabilities[0].convertTo, 'anthropic.messages')
    assert.equal(services[1].subscription?.status, 'disconnected')
    assert.equal(services[1].subscription?.errorCode, 'claude_login_failed')
    assert.equal(services[2].subscription?.tokenExpiresAt, '2026-11-12T17:39:31Z')
    assert.ok(!JSON.stringify(services).includes('9ced'), 'account hints are not copied')
    assert.ok(!JSON.stringify(services).includes('accountHint'))
  })

  it('normalizes routing posture', () => {
    const routing = parseGatewayRouting(ROUTING)
    assert.equal(routing.strategy, 'failover_only')
    assert.equal(routing.maxAttempts, 6)
    assert.equal(routing.maxRetries, 1)
    assert.deepEqual(routing.identityEnforcement, ['codex', 'claude'])
    assert.equal(routing.subscriptionRiskProtection, true)
    assert.equal(routing.channelStickinessSeconds, 3600)
    assert.deepEqual(routing.redirects, [{ from: 'codex-auto-review', to: 'claude-*', enabled: true }])
    assert.equal(routing.builtinTools[0].name, 'web_search')
  })

  it('normalizes audit settings', () => {
    const audit = parseGatewayAudit(AUDIT)
    assert.equal(audit.requestBodyEnabled, true)
    assert.equal(audit.contentRetentionDays, 7)
    assert.equal(audit.metadataRetentionDays, 30)
    assert.equal(audit.agentRawAccessEnabled, true)
  })

  it('keeps privacy policies as counts and kinds, never values', () => {
    const policies = parseGatewayPrivacy(PRIVACY)
    assert.equal(policies.length, 1)
    assert.deepEqual(policies[0].enabledKinds, ['common_secret'])
    assert.equal(policies[0].customRuleCount, 13)
    assert.equal(policies[0].allowlistCount, 15)
    assert.equal(policies[0].requestAction, 'warn')
  })

  it('keeps request metadata only — no previews, events or cursors', () => {
    const requests = parseGatewayRequests(REQUESTS)
    assert.equal(requests.length, 2)
    assert.equal(requests[0].upstreamModel, 'gpt-6-luna')
    assert.equal(requests[0].usage?.totalTokens, 8824)
    assert.equal(requests[0].bodiesCaptured, true)
    assert.equal(requests[1].errorMessage, 'HTTP 401 from upstream')
    assert.equal(requests[1].childCount, 2)
    const serialized = JSON.stringify(requests)
    assert.ok(!serialized.includes('a private prompt'), 'input previews are not copied')
    assert.ok(!serialized.includes('msg_1'), 'cursors are not copied')
    assert.ok(!serialized.includes('accepted'), 'trajectory events are not copied')
  })

  it('survives junk payloads', () => {
    assert.deepEqual(parseGatewayServices(null), [])
    assert.deepEqual(parseGatewayPrivacy({}), [])
    assert.deepEqual(parseGatewayRequests({ items: 'nope' }), [])
    assert.equal(parseGatewayRouting({}).strategy, 'unknown')
    assert.equal(parseGatewayAudit({}).requestBodyEnabled, false)
  })
})

describe('gateway request summary', () => {
  it('totals tokens, failures and average latency', () => {
    const summary = summarizeGatewayRequests(parseGatewayRequests(REQUESTS))
    assert.equal(summary.count, 2)
    assert.equal(summary.failed, 1)
    assert.equal(summary.totalTokens, 8824)
    assert.equal(summary.avgLatencyMs, 4201)
  })

  it('is empty-safe', () => {
    assert.deepEqual(summarizeGatewayRequests([]), { count: 0, failed: 0, totalTokens: 0, avgLatencyMs: null })
  })
})

describe('gateway alerts', () => {
  const input = {
    services: parseGatewayServices(SERVICES),
    routing: parseGatewayRouting(ROUTING),
    audit: parseGatewayAudit(AUDIT),
    privacy: parseGatewayPrivacy(PRIVACY)
  }

  it('flags a disconnected subscription as an error', () => {
    const alert = gatewayAlerts(input, NOW).find((a) => a.code === 'subscription-disconnected')
    assert.ok(alert, 'disconnected subscription raises an alert')
    assert.equal(alert.level, 'error')
    assert.equal(alert.serviceId, 'service_claude')
    assert.ok(alert.message.includes('claude_login_failed'))
  })

  it('warns when a token expires within a day', () => {
    const alert = gatewayAlerts(input, NOW).find((a) => a.code === 'subscription-expiring')
    assert.ok(alert, 'expiring token raises an alert')
    assert.equal(alert.level, 'warn')
    assert.equal(alert.serviceId, 'service_grok')
  })

  it('warns about body capture and warn-only privacy', () => {
    const codes = gatewayAlerts(input, NOW).map((a) => a.code)
    assert.ok(codes.includes('body-capture-on'))
    assert.ok(codes.includes('privacy-warn-only'))
    assert.ok(codes.includes('identity-enforced'))
  })

  it('errors when nothing is enabled', () => {
    const alerts = gatewayAlerts({ ...input, services: input.services.filter((s) => !s.enabled) }, NOW)
    assert.ok(alerts.some((a) => a.code === 'no-enabled-services' && a.level === 'error'))
  })

  it('stays quiet when capture is off and privacy redacts', () => {
    const alerts = gatewayAlerts(
      {
        services: input.services,
        routing: { ...input.routing, identityEnforcement: [] },
        audit: { ...input.audit, requestBodyEnabled: false, responseContentEnabled: false, agentRawAccessEnabled: false },
        privacy: [{ ...input.privacy[0], requestAction: 'redact' }]
      },
      NOW
    )
    assert.deepEqual(alerts.filter((a) => a.level !== 'info').map((a) => a.code), ['subscription-disconnected', 'subscription-expiring'])
  })
})

describe('fetchGatewayStatus', () => {
  it('reads the four read-only commands and reports ready', async () => {
    const calls: Array<{ file: string; args: string[] }> = []
    const status = await fetchGatewayStatus({
      cliPath: 'C:/fake/astrlink.exe',
      now: NOW,
      execFileImpl: cliExec({ services: SERVICES, routing: ROUTING, 'audit-settings': AUDIT, privacy: PRIVACY }, {}, calls)
    })
    assert.equal(status.availability, 'ready')
    assert.equal(status.error, null)
    assert.equal(status.services.length, 3)
    assert.equal(status.routing?.strategy, 'failover_only')
    assert.equal(status.audit?.contentRetentionDays, 7)
    assert.equal(status.privacy.length, 1)
    assert.ok(status.alerts.length > 0)
    assert.deepEqual(calls.map((c) => c.args[0]).sort(), ['audit-settings', 'privacy', 'routing', 'services'])
    assert.ok(calls.every((c) => c.file === 'C:/fake/astrlink.exe'))
    assert.ok(calls.every((c) => c.args.every((a) => typeof a === 'string')))
  })

  it('degrades to not-installed when the CLI is missing', async () => {
    const status = await fetchGatewayStatus({
      execFileImpl: cliExec({}, { services: 'spawn astrlink ENOENT' })
    })
    assert.equal(status.availability, 'not-installed')
    assert.deepEqual(status.services, [])
    assert.equal(status.routing, null)
    assert.ok(status.error)
  })

  it('degrades to not-running when the desktop gateway is down', async () => {
    const status = await fetchGatewayStatus({
      execFileImpl: cliExec({}, { services: 'AstrLink control session unavailable' })
    })
    assert.equal(status.availability, 'not-running')
    assert.ok(status.error?.includes('control session'))
  })

  it('degrades to blocked when the host sandbox refuses the socket', async () => {
    const status = await fetchGatewayStatus({
      execFileImpl: cliExec({}, { services: 'connect: operation not permitted' })
    })
    assert.equal(status.availability, 'blocked')
  })

  it('keeps the sections that worked when one command fails', async () => {
    const status = await fetchGatewayStatus({
      now: NOW,
      execFileImpl: cliExec(
        { services: SERVICES, routing: ROUTING, 'audit-settings': AUDIT },
        { privacy: 'unknown command "privacy"' }
      )
    })
    assert.equal(status.availability, 'ready')
    assert.equal(status.services.length, 3)
    assert.deepEqual(status.privacy, [])
    assert.equal(status.warnings.length, 1)
    assert.ok(status.warnings[0].includes('privacy'))
  })
})

describe('fetchGatewayRequests', () => {
  it('passes a bounded limit and the status filter as plain argv', async () => {
    const calls: Array<{ file: string; args: string[] }> = []
    const result = await fetchGatewayRequests({
      limit: 500,
      status: 'failed',
      execFileImpl: cliExec({ requests: REQUESTS }, {}, calls)
    })
    assert.deepEqual(calls[0].args, ['requests', '--limit', '200', '--status', 'failed'])
    assert.equal(result.availability, 'ready')
    assert.equal(result.requests.length, 2)
    assert.equal(result.summary.failed, 1)
  })

  it('defaults to a small page and clamps the low end', async () => {
    const calls: Array<{ file: string; args: string[] }> = []
    await fetchGatewayRequests({ execFileImpl: cliExec({ requests: REQUESTS }, {}, calls) })
    assert.deepEqual(calls[0].args, ['requests', '--limit', '25'])
    calls.length = 0
    await fetchGatewayRequests({ limit: 0, execFileImpl: cliExec({ requests: REQUESTS }, {}, calls) })
    assert.deepEqual(calls[0].args, ['requests', '--limit', '1'])
  })

  it('reports a down gateway without throwing', async () => {
    const result = await fetchGatewayRequests({
      execFileImpl: cliExec({}, { requests: 'AstrLink control session unavailable' })
    })
    assert.equal(result.availability, 'not-running')
    assert.deepEqual(result.requests, [])
    assert.equal(result.summary.count, 0)
  })

  it('never returns request bodies', async () => {
    const result = await fetchGatewayRequests({ execFileImpl: cliExec({ requests: REQUESTS }) })
    const serialized = JSON.stringify(result)
    assert.ok(!serialized.includes('a private prompt'))
    const first: GatewayRequest = result.requests[0]
    assert.equal(first.id, 'request_1')
  })
})