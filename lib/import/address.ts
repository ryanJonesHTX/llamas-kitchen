// Which addresses the recipe importer may connect to (lib/import/fetchPage.ts).
// Server-only: node:net keeps it out of client bundles.
import { BlockList, isIP } from 'node:net'

type Subnet = [network: string, prefix: number]

function subnets(family: 'ipv4' | 'ipv6', entries: Subnet[]): BlockList {
  const list = new BlockList()
  for (const [network, prefix] of entries) list.addSubnet(network, prefix, family)
  return list
}

const REFUSED_IPV4 = subnets('ipv4', [
  ['0.0.0.0', 8], // unspecified
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // CGNAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local, incl. the 169.254.169.254 cloud metadata address
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // documentation
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // documentation
  ['203.0.113.0', 24], // documentation
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved, incl. broadcast
])

// Only global unicast 2000::/3 is public. Everything outside it is refused:
// unspecified, loopback, IPv4-compatible ::/96, discard 100::/64, ULA,
// link-local, site-local and multicast.
const GLOBAL_UNICAST_IPV6 = subnets('ipv6', [['2000::', 3]])

const REFUSED_IPV6 = subnets('ipv6', [
  ['2001::', 32], // Teredo: tunnels to an address we can't see
  ['2001:db8::', 32], // documentation
  ['3fff::', 20], // documentation (RFC 9637)
])

// These carry an IPv4 address in their last 32 bits and reach it.
const EMBEDS_IPV4_AT_END = subnets('ipv6', [
  ['::ffff:0:0', 96], // IPv4-mapped
  ['64:ff9b::', 96], // NAT64
])

// 6to4 carries its IPv4 address in bits 16-47.
const SIX_TO_FOUR = subnets('ipv6', [['2002::', 16]])

// True only for a globally routable unicast address. Throws for anything that
// isn't a bare IP address: callers only pass resolved addresses.
export function isPublicAddress(ip: string): boolean {
  const family = isIP(ip)
  // isIP accepts zone-scoped IPv6 (fe80::1%eth0), which BlockList doesn't.
  if (family === 0 || ip.includes('%')) throw new Error(`Not a bare IP address: ${JSON.stringify(ip)}`)
  if (family === 4) return !REFUSED_IPV4.check(ip, 'ipv4')

  // A form that reaches an embedded IPv4 address is only as public as it.
  if (EMBEDS_IPV4_AT_END.check(ip, 'ipv6')) return isPublicAddress(ipv4From(ipv6Groups(ip), 6))
  if (SIX_TO_FOUR.check(ip, 'ipv6')) return isPublicAddress(ipv4From(ipv6Groups(ip), 1))
  return GLOBAL_UNICAST_IPV6.check(ip, 'ipv6') && !REFUSED_IPV6.check(ip, 'ipv6')
}

// The eight 16-bit groups of a valid IPv6 address, in any textual form.
function ipv6Groups(ip: string): number[] {
  const parse = (part: string) =>
    part === ''
      ? []
      : part.split(':').flatMap((piece) => (piece.includes('.') ? dottedGroups(piece) : [parseInt(piece, 16)]))
  const [head, tail] = ip.split('::')
  const left = parse(head)
  if (tail === undefined) return left
  const right = parse(tail)
  return [...left, ...new Array<number>(8 - left.length - right.length).fill(0), ...right]
}

// An embedded dotted quad (::ffff:1.2.3.4) as two 16-bit groups.
function dottedGroups(dotted: string): number[] {
  const [a, b, c, d] = dotted.split('.').map(Number)
  return [(a << 8) | b, (c << 8) | d]
}

// The IPv4 address held in groups[at] and groups[at + 1].
function ipv4From(groups: number[], at: number): string {
  const [high, low] = [groups[at], groups[at + 1]]
  return [high >> 8, high & 0xff, low >> 8, low & 0xff].join('.')
}
