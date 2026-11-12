/**
 * Pure normalizers for the AstrLink CLI's JSON, plus the posture alerts the
 * Toolbox surfaces. No I/O here: everything is testable against canned CLI
 * output, and nothing copies prompt content, cursors or account hints.
 */
import type { GatewayAlert, GatewayAudit, GatewayPrivacyPolicy, GatewayRequest, GatewayRequestSummary, GatewayRouting, GatewayService } from './types.js';
/** Provider list. `account_hint` is intentionally dropped. */
export declare function parseGatewayServices(value: unknown): GatewayService[];
export declare function parseGatewayRouting(value: unknown): GatewayRouting;
export declare function parseGatewayAudit(value: unknown): GatewayAudit;
export declare function parseGatewayPrivacy(value: unknown): GatewayPrivacyPolicy[];
/**
 * Request records, metadata only. The CLI also returns `input_preview`,
 * `events` and `cursors`; none of them are copied here.
 */
export declare function parseGatewayRequests(value: unknown): GatewayRequest[];
export declare function summarizeGatewayRequests(requests: GatewayRequest[]): GatewayRequestSummary;
export interface GatewayAlertInput {
    services: GatewayService[];
    routing: GatewayRouting | null;
    audit: GatewayAudit | null;
    privacy: GatewayPrivacyPolicy[];
}
/**
 * What deserves the operator's attention: broken subscriptions, expiring
 * tokens, and a capture/privacy posture that sends more upstream than the
 * defaults suggest.
 */
export declare function gatewayAlerts(input: GatewayAlertInput, now?: number): GatewayAlert[];
