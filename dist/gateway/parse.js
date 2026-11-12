const DAY_MS = 24 * 60 * 60 * 1000;
function record(value) {
    return value && typeof value === 'object' ? value : {};
}
function items(value) {
    const list = record(value).items;
    return Array.isArray(list) ? list : [];
}
function str(value, fallback = '') {
    return typeof value === 'string' ? value : fallback;
}
function nullableStr(value) {
    return typeof value === 'string' && value !== '' ? value : null;
}
function num(value, fallback = 0) {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
function nullableNum(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
function strings(value) {
    return Array.isArray(value) ? value.filter((entry) => typeof entry === 'string') : [];
}
function parseSubscription(value) {
    if (!value || typeof value !== 'object')
        return null;
    const raw = record(value);
    const error = record(raw.last_error);
    return {
        provider: str(raw.provider),
        status: str(raw.status, 'unknown'),
        tokenExpiresAt: nullableStr(raw.token_expires_at),
        lastRefreshAt: nullableStr(raw.last_refresh_at),
        errorCode: nullableStr(error.code),
        errorMessage: nullableStr(error.message)
    };
}
/** Provider list. `account_hint` is intentionally dropped. */
export function parseGatewayServices(value) {
    return items(value).map((entry) => {
        const raw = record(entry);
        return {
            id: str(raw.id),
            name: str(raw.name, str(raw.id)),
            kind: str(raw.kind),
            enabled: raw.enabled === true,
            models: strings(raw.models),
            capabilities: (Array.isArray(raw.capabilities) ? raw.capabilities : []).map((capability) => {
                const row = record(capability);
                return {
                    protocol: str(row.protocol),
                    mode: str(row.mode),
                    streaming: row.streaming === true,
                    convertTo: nullableStr(row.convert_to)
                };
            }),
            baseOrigin: nullableStr(raw.base_origin),
            subscription: parseSubscription(raw.subscription)
        };
    });
}
export function parseGatewayRouting(value) {
    const raw = record(value);
    const stickiness = record(raw.channel_stickiness);
    const failure = record(raw.default_failure_policy);
    const tools = record(raw.builtin_tools);
    const identity = ['codex', 'claude', 'grok'].filter((provider) => raw[`${provider}_identity_enforcement`] === true);
    return {
        strategy: str(raw.strategy, 'unknown'),
        maxAttempts: num(raw.max_attempts),
        maxRetries: num(failure.max_retries),
        redirects: (Array.isArray(raw.model_redirects) ? raw.model_redirects : []).map((entry) => {
            const row = record(entry);
            return { from: str(row.from), to: str(row.to), enabled: row.enabled === true };
        }),
        identityEnforcement: [...identity],
        subscriptionRiskProtection: raw.subscription_risk_protection === true,
        sessionIsolation: raw.subscription_session_isolation === true,
        officialClientPassthrough: raw.official_client_passthrough === true,
        channelStickinessSeconds: stickiness.enabled === true ? num(stickiness.ttl_seconds) : null,
        reasoningMode: str(raw.reasoning_mode, 'unknown'),
        reasoningLevel: str(raw.reasoning_level, 'unknown'),
        builtinTools: Object.entries(tools).map(([name, entry]) => {
            const row = record(entry);
            return {
                name,
                enabled: row.enabled === true,
                serviceId: nullableStr(row.service_id),
                model: nullableStr(row.model)
            };
        })
    };
}
export function parseGatewayAudit(value) {
    const raw = record(value);
    return {
        requestBodyEnabled: raw.request_body_enabled === true,
        responseContentEnabled: raw.response_content_enabled === true,
        httpMetaEnabled: raw.http_meta_enabled === true,
        requestBodyMaxBytes: num(raw.request_body_max_bytes),
        responseContentMaxBytes: num(raw.response_content_max_bytes),
        metadataRetentionDays: num(raw.metadata_retention_days),
        contentRetentionDays: num(raw.content_retention_days),
        agentRawAccessEnabled: raw.agent_raw_access_enabled === true
    };
}
export function parseGatewayPrivacy(value) {
    return items(value).map((entry) => {
        const raw = record(entry);
        return {
            id: str(raw.id),
            enabled: raw.enabled === true,
            detector: str(raw.detector, 'unknown'),
            enabledKinds: strings(raw.enabled_kinds),
            customRuleCount: num(record(raw.custom_regex_rules).count),
            allowlistCount: num(record(raw.allowlist).count),
            requestAction: str(raw.request_action, 'unknown'),
            responseAction: str(raw.response_action, 'unknown'),
            responseRestore: raw.response_restore === true
        };
    });
}
function parseUsage(value) {
    if (!value || typeof value !== 'object')
        return null;
    const raw = record(value);
    return {
        inputTokens: num(raw.input_tokens),
        outputTokens: num(raw.output_tokens),
        totalTokens: num(raw.total_tokens),
        cacheReadTokens: num(raw.cache_read_tokens),
        cacheWriteTokens: num(raw.cache_write_tokens)
    };
}
/**
 * Request records, metadata only. The CLI also returns `input_preview`,
 * `events` and `cursors`; none of them are copied here.
 */
export function parseGatewayRequests(value) {
    return items(value).map((entry) => {
        const raw = record(entry);
        const error = record(raw.error);
        const audit = record(raw.audit);
        return {
            id: str(raw.id),
            sessionId: nullableStr(raw.session_id),
            startedAt: str(raw.started_at),
            completedAt: nullableStr(raw.completed_at),
            status: str(raw.status, 'unknown'),
            clientType: str(raw.client_type, 'unknown'),
            inputProtocol: str(raw.input_protocol),
            requestedModel: str(raw.requested_model),
            upstreamModel: nullableStr(record(raw.recovery).upstream_model),
            serviceId: nullableStr(raw.service_id),
            httpStatus: nullableNum(raw.http_status),
            latencyMs: nullableNum(raw.latency_ms),
            firstTokenMs: nullableNum(raw.first_token_ms),
            streaming: raw.streaming === true,
            childCount: num(raw.child_count),
            usage: parseUsage(raw.usage),
            privacyDecision: nullableStr(raw.privacy_decision),
            bodiesCaptured: audit.request_body_captured === true || audit.response_content_captured === true,
            errorCode: nullableStr(error.code),
            errorMessage: nullableStr(error.message)
        };
    });
}
export function summarizeGatewayRequests(requests) {
    const latencies = requests.map((entry) => entry.latencyMs).filter((value) => value !== null);
    return {
        count: requests.length,
        failed: requests.filter((entry) => entry.status === 'failed' || entry.status === 'blocked').length,
        totalTokens: requests.reduce((sum, entry) => sum + (entry.usage?.totalTokens ?? 0), 0),
        avgLatencyMs: latencies.length
            ? Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length)
            : null
    };
}
function subscriptionAlerts(service, now) {
    const subscription = service.subscription;
    if (!subscription)
        return [];
    if (subscription.status !== 'connected') {
        const detail = subscription.errorCode ? ` (${subscription.errorCode})` : '';
        return [
            {
                level: 'error',
                code: 'subscription-disconnected',
                serviceId: service.id,
                message: `${service.name}: subscription ${subscription.status}${detail}. Reconnect it in the AstrLink desktop.`
            }
        ];
    }
    if (!subscription.tokenExpiresAt)
        return [];
    const expiresAt = Date.parse(subscription.tokenExpiresAt);
    if (!Number.isFinite(expiresAt))
        return [];
    const left = expiresAt - now;
    if (left <= 0) {
        return [
            {
                level: 'warn',
                code: 'subscription-token-expired',
                serviceId: service.id,
                message: `${service.name}: token expired at ${subscription.tokenExpiresAt}. The gateway refreshes it automatically — check the desktop if calls fail.`
            }
        ];
    }
    if (left < DAY_MS) {
        return [
            {
                level: 'warn',
                code: 'subscription-expiring',
                serviceId: service.id,
                message: `${service.name}: token expires in ${Math.max(1, Math.round(left / (60 * 60 * 1000)))}h.`
            }
        ];
    }
    return [];
}
/**
 * What deserves the operator's attention: broken subscriptions, expiring
 * tokens, and a capture/privacy posture that sends more upstream than the
 * defaults suggest.
 */
export function gatewayAlerts(input, now = Date.now()) {
    const alerts = [];
    for (const service of input.services) {
        alerts.push(...subscriptionAlerts(service, now));
    }
    if (input.services.length > 0 && !input.services.some((service) => service.enabled)) {
        alerts.push({
            level: 'error',
            code: 'no-enabled-services',
            message: 'Every upstream service is disabled — the gateway cannot route any request.'
        });
    }
    if (input.audit?.requestBodyEnabled || input.audit?.responseContentEnabled) {
        alerts.push({
            level: 'warn',
            code: 'body-capture-on',
            message: `Request/response bodies are being captured (content kept ${input.audit?.contentRetentionDays ?? 0} days).`
        });
    }
    if (input.audit?.agentRawAccessEnabled) {
        alerts.push({
            level: 'info',
            code: 'raw-access-on',
            message: 'Agents may ask to read raw bodies; each read still needs your approval in the AstrLink desktop.'
        });
    }
    const active = input.privacy.filter((policy) => policy.enabled);
    if (input.privacy.length > 0 && active.length === 0) {
        alerts.push({ level: 'warn', code: 'privacy-off', message: 'No privacy policy is enabled.' });
    }
    for (const policy of active) {
        if (policy.requestAction !== 'block' && policy.requestAction !== 'redact') {
            alerts.push({
                level: 'warn',
                code: 'privacy-warn-only',
                message: `Privacy policy "${policy.id}" only ${policy.requestAction}s matches (${policy.enabledKinds.join(', ') || 'no kinds'}) — they still go upstream.`
            });
        }
    }
    if (input.routing && input.routing.identityEnforcement.length > 0) {
        alerts.push({
            level: 'info',
            code: 'identity-enforced',
            message: `Subscription identity enforced for ${input.routing.identityEnforcement.join(', ')} — route Toolbox calls through API-key or local providers instead.`
        });
    }
    return alerts;
}
//# sourceMappingURL=parse.js.map