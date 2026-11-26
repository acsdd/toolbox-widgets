import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
/**
 * Endpoint guard for remote-server marketplace modules. Remote endpoints
 * receive tool arguments from this machine, so they must be public HTTPS
 * hosts — never loopback, link-local, private ranges or bare intranet names.
 */
const BLOCKED_HOST_SUFFIXES = ['.local', '.internal', '.localhost', '.lan', '.home', '.corp'];
function isPrivateIp(host) {
    // IPv4 literals
    const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
    if (v4) {
        const [a, b] = [Number(v4[1]), Number(v4[2])];
        if (a === 0 || a === 10 || a === 127)
            return true;
        if (a === 169 && b === 254)
            return true;
        if (a === 172 && b >= 16 && b <= 31)
            return true;
        if (a === 192 && b === 168)
            return true;
        if (a === 100 && b >= 64 && b <= 127)
            return true; // CGNAT
        if (a >= 224)
            return true; // multicast + reserved
        return false;
    }
    // IPv6 literals (URL hostname strips brackets)
    if (host.includes(':')) {
        const lower = host.toLowerCase();
        if (lower === '::1' || lower === '::')
            return true;
        if (lower.startsWith('fe80') || lower.startsWith('fc') || lower.startsWith('fd'))
            return true;
        if (lower.startsWith('::ffff:'))
            return isPrivateIp(lower.slice(7));
        return false;
    }
    return false;
}
/** Syntactic preflight only; call assertRemoteEndpointAllowed before connecting. */
export function parseRemoteEndpoint(value) {
    if (typeof value !== 'string' || value.trim() === '') {
        throw new Error('A remote-server module needs an endpoint URL.');
    }
    let url;
    try {
        url = new URL(value.trim());
    }
    catch {
        throw new Error(`The endpoint "${value}" is not a valid URL.`);
    }
    if (url.protocol !== 'https:') {
        throw new Error('Remote endpoints must use HTTPS.');
    }
    const host = url.hostname.toLowerCase();
    if (host === 'localhost' || !host.includes('.')) {
        throw new Error('Remote endpoints must be public hosts, not local names.');
    }
    if (BLOCKED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
        throw new Error('Remote endpoints must be public hosts, not intranet names.');
    }
    if (isPrivateIp(host)) {
        throw new Error('Remote endpoints must not point at private or loopback addresses.');
    }
    if (url.username || url.password) {
        throw new Error('Remote endpoints must not embed credentials.');
    }
    return url.toString();
}
const blockedV4 = new BlockList();
for (const [network, prefix] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4]])
    blockedV4.addSubnet(network, prefix, 'ipv4');
const blockedV6 = new BlockList();
for (const [network, prefix] of [['::', 128], ['::1', 128], ['64:ff9b::', 96], ['::ffff:0:0', 96], ['100::', 64], ['2001:db8::', 32], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8]])
    blockedV6.addSubnet(network, prefix, 'ipv6');
export function isPublicEndpointAddress(address) { const family = isIP(address); return family === 4 ? !blockedV4.check(address, 'ipv4') : family === 6 ? !blockedV6.check(address, 'ipv6') : false; }
/** Resolve and reject private or reserved answers. Repeat validation at socket connection time. */
export async function assertRemoteEndpointAllowed(value, resolver = host => lookup(host, { all: true, verbatim: true })) {
    const url = parseRemoteEndpoint(value);
    const host = new URL(url).hostname.replace(/^\[|\]$/g, '');
    const family = isIP(host);
    const addresses = family ? [{ address: host, family }] : await resolver(host);
    if (!addresses.length || addresses.some(item => !isPublicEndpointAddress(item.address)))
        throw new Error('Remote endpoint resolves to a private or reserved address.');
    return url;
}
/** Validate syntax and DNS answers; callers must also enforce policy at connection time. */
export const validateRemoteEndpoint = assertRemoteEndpointAllowed;
//# sourceMappingURL=remote.js.map