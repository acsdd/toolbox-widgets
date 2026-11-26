/** Syntactic preflight only; call assertRemoteEndpointAllowed before connecting. */
export declare function parseRemoteEndpoint(value: unknown): string;
export declare function isPublicEndpointAddress(address: string): boolean;
export type EndpointResolver = (host: string) => Promise<Array<{
    address: string;
    family: number;
}>>;
/** Resolve and reject private or reserved answers. Repeat validation at socket connection time. */
export declare function assertRemoteEndpointAllowed(value: unknown, resolver?: EndpointResolver): Promise<string>;
/** Validate syntax and DNS answers; callers must also enforce policy at connection time. */
export declare const validateRemoteEndpoint: typeof assertRemoteEndpointAllowed;
