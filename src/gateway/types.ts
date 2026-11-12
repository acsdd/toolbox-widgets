/**
 * Types for the AstrLink gateway observer.
 *
 * Everything here is metadata the read-only `astrlink` CLI already exposes:
 * provider health, routing posture, audit/privacy settings and request
 * records. Request bodies, input previews, trajectory events, cursors and
 * account hints are deliberately not modelled — the Toolbox never copies
 * prompt content out of the gateway.
 */

/** Why the gateway could or could not be read. */
export type GatewayAvailability = 'ready' | 'not-installed' | 'not-running' | 'blocked' | 'error'

export interface GatewayCapability {
  protocol: string
  mode: string
  streaming: boolean
  /** Protocol the gateway converts to, when this one is not native upstream. */
  convertTo: string | null
}

export interface GatewaySubscription {
  provider: string
  status: string
  tokenExpiresAt: string | null
  lastRefreshAt: string | null
  errorCode: string | null
  errorMessage: string | null
}

export interface GatewayService {
  id: string
  name: string
  kind: string
  enabled: boolean
  models: string[]
  capabilities: GatewayCapability[]
  /** Scheme/host/port only — the CLI never returns paths or credentials. */
  baseOrigin: string | null
  subscription: GatewaySubscription | null
}

export interface GatewayRedirect {
  from: string
  to: string
  enabled: boolean
}

export interface GatewayBuiltinTool {
  name: string
  enabled: boolean
  serviceId: string | null
  model: string | null
}

export interface GatewayRouting {
  strategy: string
  maxAttempts: number
  maxRetries: number
  redirects: GatewayRedirect[]
  /** Providers whose official client identity the gateway enforces. */
  identityEnforcement: string[]
  subscriptionRiskProtection: boolean
  sessionIsolation: boolean
  officialClientPassthrough: boolean
  channelStickinessSeconds: number | null
  reasoningMode: string
  reasoningLevel: string
  builtinTools: GatewayBuiltinTool[]
}

export interface GatewayAudit {
  requestBodyEnabled: boolean
  responseContentEnabled: boolean
  httpMetaEnabled: boolean
  requestBodyMaxBytes: number
  responseContentMaxBytes: number
  metadataRetentionDays: number
  contentRetentionDays: number
  agentRawAccessEnabled: boolean
}

export interface GatewayPrivacyPolicy {
  id: string
  enabled: boolean
  detector: string
  enabledKinds: string[]
  /** Counts and kinds only — patterns and allowlist values stay in the gateway. */
  customRuleCount: number
  allowlistCount: number
  requestAction: string
  responseAction: string
  responseRestore: boolean
}

export interface GatewayUsage {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}

export interface GatewayRequest {
  id: string
  sessionId: string | null
  startedAt: string
  completedAt: string | null
  status: string
  clientType: string
  inputProtocol: string
  requestedModel: string
  /** The model finally sent upstream, after redirects and failover. */
  upstreamModel: string | null
  serviceId: string | null
  httpStatus: number | null
  latencyMs: number | null
  firstTokenMs: number | null
  streaming: boolean
  childCount: number
  usage: GatewayUsage | null
  privacyDecision: string | null
  bodiesCaptured: boolean
  errorCode: string | null
  errorMessage: string | null
}

export interface GatewayRequestSummary {
  count: number
  failed: number
  totalTokens: number
  avgLatencyMs: number | null
}

export type GatewayAlertLevel = 'error' | 'warn' | 'info'

export interface GatewayAlert {
  level: GatewayAlertLevel
  code: string
  message: string
  serviceId?: string
}

export interface GatewayStatus {
  availability: GatewayAvailability
  cliPath: string
  checkedAt: number
  services: GatewayService[]
  routing: GatewayRouting | null
  audit: GatewayAudit | null
  privacy: GatewayPrivacyPolicy[]
  alerts: GatewayAlert[]
  /** Sections that could not be read while the rest of the report succeeded. */
  warnings: string[]
  error: string | null
}

export interface GatewayRequestsResult {
  availability: GatewayAvailability
  cliPath: string
  checkedAt: number
  requests: GatewayRequest[]
  summary: GatewayRequestSummary
  error: string | null
}