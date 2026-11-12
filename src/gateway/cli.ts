/**
 * Read-only access to the local AstrLink gateway through its own CLI.
 *
 * The CLI is the only supported interface: it holds observer access, so no
 * setting can be changed from here. This module never opens the gateway
 * database, its control-session file or its local socket, and it never asks
 * for request bodies — `audit` and `raw-audit` are deliberately not wrapped.
 */
import { execFile } from 'node:child_process'
import os from 'node:os'
import { join } from 'node:path'
import type { ExecFileLike } from '../llamafarm/detect.js'
import {
  gatewayAlerts,
  parseGatewayAudit,
  parseGatewayPrivacy,
  parseGatewayRequests,
  parseGatewayRouting,
  parseGatewayServices,
  summarizeGatewayRequests
} from './parse.js'
import type {
  GatewayAudit,
  GatewayAvailability,
  GatewayPrivacyPolicy,
  GatewayRequestsResult,
  GatewayRouting,
  GatewayStatus
} from './types.js'

/** The CLI AstrLink installs for agents; override with `cliPath` when needed. */
export function defaultGatewayCliPath(): string {
  return join(os.homedir(), '.astrlink', 'bin', process.platform === 'win32' ? 'astrlink.exe' : 'astrlink')
}

export interface GatewayOptions {
  cliPath?: string
  execFileImpl?: ExecFileLike
  timeoutMs?: number
  /** Clock for expiry alerts (injectable for tests). */
  now?: number
}

export interface GatewayRequestOptions extends GatewayOptions {
  /** 1-200, the CLI's own page bounds. Defaults to 25. */
  limit?: number
  status?: string
  serviceId?: string
}

/** A CLI failure, classified so callers can show a useful empty state. */
export class GatewayCliError extends Error {
  readonly availability: GatewayAvailability

  constructor(message: string, availability: GatewayAvailability) {
    super(message)
    this.name = 'GatewayCliError'
    this.availability = availability
  }
}

const MAX_BUFFER = 8 * 1024 * 1024
const DEFAULT_TIMEOUT_MS = 15000
const DEFAULT_LIMIT = 25
const MAX_LIMIT = 200

function classify(message: string): GatewayAvailability {
  if (/ENOENT|not found|not recognized|no such file/i.test(message)) return 'not-installed'
  if (/control session unavailable/i.test(message)) return 'not-running'
  if (/operation not permitted|permission denied/i.test(message)) return 'blocked'
  return 'error'
}

interface ResolvedOptions {
  cliPath: string
  execFileImpl: ExecFileLike
  timeoutMs: number
  now: number
}

function resolveOptions(options: GatewayOptions): ResolvedOptions {
  return {
    cliPath: options.cliPath ?? defaultGatewayCliPath(),
    execFileImpl: options.execFileImpl ?? (execFile as unknown as ExecFileLike),
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    now: options.now ?? Date.now()
  }
}

/** One CLI invocation: fixed argv, JSON out, no shell involved. */
async function runCli(command: string, args: string[], options: ResolvedOptions): Promise<unknown> {
  const stdout = await new Promise<string>((resolve, reject) => {
    try {
      options.execFileImpl(
        options.cliPath,
        [command, ...args],
        { timeout: options.timeoutMs, windowsHide: true, maxBuffer: MAX_BUFFER },
        (error, out) => {
          // execFile folds stderr into the error message, which is what the
          // CLI uses for its diagnostics.
          if (error) reject(new GatewayCliError(error.message || String(error), classify(error.message || '')))
          else resolve(out)
        }
      )
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause)
      reject(new GatewayCliError(message, classify(message)))
    }
  })
  try {
    return JSON.parse(stdout) as unknown
  } catch {
    throw new GatewayCliError(`The astrlink CLI returned unreadable output for "${command}".`, 'error')
  }
}

function asCliError(cause: unknown): GatewayCliError {
  if (cause instanceof GatewayCliError) return cause
  const message = cause instanceof Error ? cause.message : String(cause)
  return new GatewayCliError(message, classify(message))
}

/** Read one optional section; a failure becomes a warning, not a dead report. */
async function readSection<T>(
  command: string,
  parse: (value: unknown) => T,
  options: ResolvedOptions,
  warnings: string[]
): Promise<T | null> {
  try {
    return parse(await runCli(command, [], options))
  } catch (cause) {
    warnings.push(`${command}: ${asCliError(cause).message}`)
    return null
  }
}

/**
 * The gateway report: providers and subscription health, routing posture,
 * capture/privacy settings and the alerts that follow from them.
 */
export async function fetchGatewayStatus(options: GatewayOptions = {}): Promise<GatewayStatus> {
  const resolved = resolveOptions(options)
  const base: GatewayStatus = {
    availability: 'ready',
    cliPath: resolved.cliPath,
    checkedAt: resolved.now,
    services: [],
    routing: null,
    audit: null,
    privacy: [],
    alerts: [],
    warnings: [],
    error: null
  }
  let payload: unknown
  try {
    payload = await runCli('services', [], resolved)
  } catch (cause) {
    const error = asCliError(cause)
    return { ...base, availability: error.availability, error: error.message }
  }
  const services = parseGatewayServices(payload)
  const warnings: string[] = []
  const [routing, audit, privacy] = await Promise.all([
    readSection<GatewayRouting>('routing', parseGatewayRouting, resolved, warnings),
    readSection<GatewayAudit>('audit-settings', parseGatewayAudit, resolved, warnings),
    readSection<GatewayPrivacyPolicy[]>('privacy', parseGatewayPrivacy, resolved, warnings)
  ])
  return {
    ...base,
    services,
    routing,
    audit,
    privacy: privacy ?? [],
    alerts: gatewayAlerts({ services, routing, audit, privacy: privacy ?? [] }, resolved.now),
    warnings
  }
}

/** Recent request records (metadata only) plus a small spend/latency summary. */
export async function fetchGatewayRequests(options: GatewayRequestOptions = {}): Promise<GatewayRequestsResult> {
  const resolved = resolveOptions(options)
  const limit = Math.min(MAX_LIMIT, Math.max(1, Math.trunc(options.limit ?? DEFAULT_LIMIT)))
  const args = ['--limit', String(limit)]
  if (options.status) args.push('--status', options.status)
  if (options.serviceId) args.push('--service-id', options.serviceId)
  const base: GatewayRequestsResult = {
    availability: 'ready',
    cliPath: resolved.cliPath,
    checkedAt: resolved.now,
    requests: [],
    summary: summarizeGatewayRequests([]),
    error: null
  }
  try {
    const requests = parseGatewayRequests(await runCli('requests', args, resolved))
    return { ...base, requests, summary: summarizeGatewayRequests(requests) }
  } catch (cause) {
    const error = asCliError(cause)
    return { ...base, availability: error.availability, error: error.message }
  }
}