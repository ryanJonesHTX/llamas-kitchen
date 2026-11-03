import { describe, expect, it } from 'vitest'
import { isPublicAddress } from '../../lib/import/address'

// Each refused range is pinned at both ends; the public neighbours just
// outside a range pin that it isn't wider than it should be.
const refusedIPv4: [range: string, address: string][] = [
  ['unspecified 0.0.0.0/8', '0.0.0.0'],
  ['unspecified 0.0.0.0/8', '0.255.255.255'],
  ['private 10/8', '10.0.0.0'],
  ['private 10/8', '10.255.255.255'],
  ['CGNAT 100.64/10', '100.64.0.0'],
  ['CGNAT 100.64/10', '100.127.255.255'],
  ['loopback 127/8', '127.0.0.0'],
  ['loopback 127/8', '127.0.0.1'],
  ['loopback 127/8', '127.255.255.255'],
  ['link-local 169.254/16', '169.254.0.0'],
  ['link-local 169.254/16 (cloud metadata)', '169.254.169.254'],
  ['link-local 169.254/16', '169.254.255.255'],
  ['private 172.16/12', '172.16.0.0'],
  ['private 172.16/12', '172.31.255.255'],
  ['IETF protocol assignments 192.0.0/24', '192.0.0.0'],
  ['IETF protocol assignments 192.0.0/24', '192.0.0.255'],
  ['documentation 192.0.2/24', '192.0.2.0'],
  ['documentation 192.0.2/24', '192.0.2.255'],
  ['private 192.168/16', '192.168.0.0'],
  ['private 192.168/16', '192.168.255.255'],
  ['benchmarking 198.18/15', '198.18.0.0'],
  ['benchmarking 198.18/15', '198.19.255.255'],
  ['documentation 198.51.100/24', '198.51.100.0'],
  ['documentation 198.51.100/24', '198.51.100.255'],
  ['documentation 203.0.113/24', '203.0.113.0'],
  ['documentation 203.0.113/24', '203.0.113.255'],
  ['multicast 224/4', '224.0.0.0'],
  ['multicast 224/4', '239.255.255.255'],
  ['reserved 240/4', '240.0.0.0'],
  ['reserved 240/4 (broadcast)', '255.255.255.255'],
]

const publicIPv4: [why: string, address: string][] = [
  ['Google DNS', '8.8.8.8'],
  ['Cloudflare DNS', '1.1.1.1'],
  ['just below 10/8', '9.255.255.255'],
  ['just above 10/8', '11.0.0.0'],
  ['just below 100.64/10', '100.63.255.255'],
  ['just above 100.64/10', '100.128.0.0'],
  ['just below 127/8', '126.255.255.255'],
  ['just above 127/8', '128.0.0.0'],
  ['just below 169.254/16', '169.253.255.255'],
  ['just above 169.254/16', '169.255.0.0'],
  ['just below 172.16/12', '172.15.255.255'],
  ['just above 172.16/12', '172.32.0.0'],
  ['just below 192.0.0/24', '191.255.255.255'],
  ['between 192.0.0/24 and 192.0.2/24', '192.0.1.0'],
  ['just above 192.0.2/24', '192.0.3.0'],
  ['just below 192.168/16', '192.167.255.255'],
  ['just above 192.168/16', '192.169.0.0'],
  ['just below 198.18/15', '198.17.255.255'],
  ['just above 198.18/15', '198.20.0.0'],
  ['just below 198.51.100/24', '198.51.99.255'],
  ['just above 198.51.100/24', '198.51.101.0'],
  ['just below 203.0.113/24', '203.0.112.255'],
  ['just above 203.0.113/24', '203.0.114.0'],
  ['just below 224/4', '223.255.255.255'],
]

const refusedIPv6: [range: string, address: string][] = [
  ['unspecified', '::'],
  ['unspecified, written out', '0:0:0:0:0:0:0:0'],
  ['loopback', '::1'],
  ['loopback, written out with leading zeros', '0000:0000:0000:0000:0000:0000:0000:0001'],
  // IPv4-compatible ::/96 is deprecated and refused whole, whatever it embeds.
  ['IPv4-compatible ::/96', '::2'],
  ['IPv4-compatible ::/96, loopback', '::127.0.0.1'],
  ['IPv4-compatible ::/96, public IPv4', '::8.8.8.8'],
  ['IPv4-compatible ::/96, public IPv4 in hex', '::808:808'],
  ['IPv4-compatible ::/96, end of range', '::ffff:ffff'],
  ['discard 100::/64', '100::'],
  ['discard 100::/64', '100::ffff:ffff:ffff:ffff'],
  ['Teredo 2001::/32', '2001::'],
  ['Teredo 2001::/32', '2001:0:ffff:ffff:ffff:ffff:ffff:ffff'],
  ['documentation 2001:db8::/32', '2001:db8::'],
  ['documentation 2001:db8::/32', '2001:db8:ffff:ffff:ffff:ffff:ffff:ffff'],
  ['documentation 3fff::/20', '3fff::'],
  ['documentation 3fff::/20', '3fff:fff:ffff:ffff:ffff:ffff:ffff:ffff'],
  ['ULA fc00::/7', 'fc00::'],
  ['ULA fc00::/7', 'fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff'],
  ['link-local fe80::/10', 'fe80::'],
  ['link-local fe80::/10', 'febf:ffff:ffff:ffff:ffff:ffff:ffff:ffff'],
  ['link-local fe80::/10, uppercase', 'FE80::1'],
  ['site-local fec0::/10', 'fec0::'],
  ['site-local fec0::/10', 'feff:ffff:ffff:ffff:ffff:ffff:ffff:ffff'],
  ['multicast ff00::/8', 'ff00::'],
  ['multicast ff00::/8, uppercase', 'FF02::1'],
  ['multicast ff00::/8', 'ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff'],
]

const publicIPv6: [why: string, address: string][] = [
  ['Cloudflare DNS', '2606:4700:4700::1111'],
  ['Cloudflare DNS, uppercase', '2606:4700:4700::1111'.toUpperCase()],
  ['Cloudflare DNS, written out', '2606:4700:4700:0000:0000:0000:0000:1111'],
  ['Google DNS', '2001:4860:4860::8888'],
  ['just above 2001:db8::/32', '2001:db9::'],
  ['below 3fff::/20', '3000::1'],
  ['just above 3fff::/20', '3fff:1000::'],
]

// Forms that carry an IPv4 address are judged by that address.
const embeddedIPv4: [form: string, address: string, expected: boolean][] = [
  ['IPv4-mapped loopback, dotted', '::ffff:127.0.0.1', false],
  ['IPv4-mapped loopback, hex', '::ffff:7f00:1', false],
  ['IPv4-mapped loopback, written out', '0:0:0:0:0:ffff:7f00:1', false],
  ['IPv4-mapped private', '::ffff:10.0.0.1', false],
  ['IPv4-mapped metadata address', '::ffff:169.254.169.254', false],
  ['IPv4-mapped unspecified (start of ::ffff:0:0/96)', '::ffff:0.0.0.0', false],
  ['IPv4-mapped broadcast (end of ::ffff:0:0/96)', '::ffff:255.255.255.255', false],
  ['IPv4-mapped public, dotted', '::ffff:8.8.8.8', true],
  ['IPv4-mapped public, hex', '::ffff:808:808', true],
  ['IPv4-mapped public, uppercase', '::FFFF:8.8.8.8', true],
  ['NAT64 start of 64:ff9b::/96', '64:ff9b::', false],
  ['NAT64 end of 64:ff9b::/96', '64:ff9b::ffff:ffff', false],
  ['NAT64 loopback', '64:ff9b::127.0.0.1', false],
  ['NAT64 private, hex', '64:ff9b::a00:1', false],
  ['NAT64 public', '64:ff9b::8.8.8.8', true],
  ['NAT64 public, uppercase', '64:FF9B::808:808', true],
  ['6to4 start of 2002::/16', '2002::', false],
  ['6to4 end of 2002::/16', '2002:ffff:ffff:ffff:ffff:ffff:ffff:ffff', false],
  ['6to4 loopback', '2002:7f00:1::', false],
  ['6to4 private', '2002:a00:1::1', false],
  ['6to4 documentation', '2002:c000:201::', false],
  ['6to4 public', '2002:808:808::1', true],
]

describe('isPublicAddress', () => {
  it.each(refusedIPv4)('refuses IPv4 %s: %s', (_range, address) => {
    expect(isPublicAddress(address)).toBe(false)
  })

  it.each(publicIPv4)('allows public IPv4 (%s): %s', (_why, address) => {
    expect(isPublicAddress(address)).toBe(true)
  })

  it.each(refusedIPv6)('refuses IPv6 %s: %s', (_range, address) => {
    expect(isPublicAddress(address)).toBe(false)
  })

  it.each(publicIPv6)('allows public IPv6 (%s): %s', (_why, address) => {
    expect(isPublicAddress(address)).toBe(true)
  })

  it.each(embeddedIPv4)('judges %s (%s) by its embedded IPv4', (_form, address, expected) => {
    expect(isPublicAddress(address)).toBe(expected)
  })

  it.each([
    '',
    'localhost',
    'example.com',
    '127.1',
    '1.2.3',
    '256.0.0.1',
    '::ffff:999.0.0.1',
    '[::1]',
    ' 8.8.8.8',
    'http://8.8.8.8/',
  ])('throws for non-IP input %j', (input) => {
    expect(() => isPublicAddress(input)).toThrow()
  })
})
