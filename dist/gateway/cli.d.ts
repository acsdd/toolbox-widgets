import type { ExecFileLike } from '../llamafarm/detect.js';
import type { GatewayAvailability, GatewayRequestsResult, GatewayStatus } from './types.js';
/** The CLI AstrLink installs for agents; override with `cliPath` when needed. */
export declare function defaultGatewayCliPath(): string;
export interface GatewayOptions {
    cliPath?: string;
    execFileImpl?: ExecFileLike;
    timeoutMs?: number;
    /** Clock for expiry alerts (injectable for tests). */
    now?: number;
}
export interface GatewayRequestOptions extends GatewayOptions {
    /** 1-200, the CLI's own page bounds. Defaults to 25. */
    limit?: number;
    status?: string;
    serviceId?: string;
}
/** A CLI failure, classified so callers can show a useful empty state. */
export declare class GatewayCliError extends Error {
    readonly availability: GatewayAvailability;
    constructor(message: string, availability: GatewayAvailability);
}
/**
 * The gateway report: providers and subscription health, routing posture,
 * capture/privacy settings and the alerts that follow from them.
 */
export declare function fetchGatewayStatus(options?: GatewayOptions): Promise<GatewayStatus>;
/** Recent request records (metadata only) plus a small spend/latency summary. */
export declare function fetchGatewayRequests(options?: GatewayRequestOptions): Promise<GatewayRequestsResult>;
