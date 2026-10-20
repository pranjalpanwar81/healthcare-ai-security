// Hospital network gate for clinical staff.
// Browsers cannot reveal the Wi-Fi name, and any header the client sends can be forged.
// What the server can trust is the public IP the request arrives from: hospital Wi-Fi
// leaves the building through a known egress address, so we allow-list those addresses.
import net from 'node:net';
import { data, save } from './store.js';

const LOCAL_CIDRS = ['127.0.0.0/8', '::1/128', '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16'];

export function normalizeIp(raw) {
  if (!raw) return '';
  let ip = String(raw).split(',')[0].trim();
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  return ip;
}

function ipv4ToInt(ip) {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0;
}

function ipv6ToBigInt(ip) {
  const [head, tail = ''] = ip.split('::');
  const h = head ? head.split(':') : [];
  const t = tail ? tail.split(':') : [];
  const parts = ip.includes('::') ? [...h, ...Array(8 - h.length - t.length).fill('0'), ...t] : h;
  return parts.reduce((acc, p) => (acc << 16n) + BigInt(parseInt(p || '0', 16)), 0n);
}

export function inCidr(ip, cidr) {
  const [range, bitsRaw] = cidr.split('/');
  const family = net.isIP(ip);
  if (!family || family !== net.isIP(range)) return false;
  if (family === 4) {
    const bits = Number(bitsRaw ?? 32);
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (ipv4ToInt(ip) & mask) === (ipv4ToInt(range) & mask);
  }
  const bits = BigInt(bitsRaw ?? 128);
  const mask = bits === 0n ? 0n : ((1n << 128n) - 1n) ^ ((1n << (128n - bits)) - 1n);
  return (ipv6ToBigInt(ip) & mask) === (ipv6ToBigInt(range) & mask);
}

function envNetworks() {
  return (process.env.HOSPITAL_NETWORKS || '')
    .split(',').map((s) => s.trim()).filter(Boolean)
    .map((cidr) => ({ cidr, label: 'Configured by hospital IT', source: 'env' }));
}

export function trustedNetworks() {
  const list = [...envNetworks(), ...data().networks.map((n) => ({ ...n, source: 'enrolled' }))];
  if (!(process.env.NODE_ENV?.trim() === 'production' || process.env.VERCEL)) {
    list.push(...LOCAL_CIDRS.map((cidr) => ({ cidr, label: 'Local network (development)', source: 'dev' })));
  }
  return list;
}

export function checkNetwork(rawIp) {
  const ip = normalizeIp(rawIp);
  const match = trustedNetworks().find((n) => inCidr(ip, n.cidr));
  return { ip, trusted: Boolean(match), network: match ? match.label : null };
}

export function enrollNetwork(rawIp, label, user) {
  const ip = normalizeIp(rawIp);
  const cidr = net.isIP(ip) === 6 ? `${ip}/128` : `${ip}/32`;
  if (!data().networks.some((n) => n.cidr === cidr)) {
    data().networks.push({ cidr, label: label || 'Hospital Wi-Fi', addedBy: user?.id ?? null, addedAt: new Date().toISOString() });
    save();
  }
  return cidr;
}

export function removeNetwork(cidr) {
  const list = data().networks;
  const idx = list.findIndex((n) => n.cidr === cidr);
  if (idx >= 0) { list.splice(idx, 1); save(); return true; }
  return false;
}
