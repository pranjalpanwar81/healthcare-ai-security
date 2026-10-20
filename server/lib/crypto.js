// Cryptography core: envelope encryption (AES-256-GCM), key derivation, blind indexes, password hashing.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MASTER_KEY_ENV = process.env.MASTER_KEY?.trim();

function loadMasterKey() {
  if (MASTER_KEY_ENV) {
    const buf = Buffer.from(MASTER_KEY_ENV, 'base64');
    if (buf.length !== 32) throw new Error('MASTER_KEY must be 32 bytes, base64 encoded');
    return buf;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('MASTER_KEY must be set in production (32 random bytes, base64).');
  }
  // Development only: keep a local key next to the data so records survive restarts.
  const dir = process.env.DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
  const file = path.join(dir, '.dev-master-key');
  if (fs.existsSync(file)) return Buffer.from(fs.readFileSync(file, 'utf8').trim(), 'base64');
  const key = crypto.randomBytes(32);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, key.toString('base64'), { mode: 0o600 });
  return key;
}

const masterKey = loadMasterKey();

// Independent sub-keys derived with HKDF so one leaked key does not expose the others.
const derive = (label) => Buffer.from(crypto.hkdfSync('sha256', masterKey, Buffer.alloc(0), label, 32));

const keyring = {
  // Key-encryption keys, versioned so they can be rotated without re-encrypting data.
  kek: { 1: derive('healthguard:kek:v1') },
  activeKekVersion: 1,
  audit: derive('healthguard:audit-chain'),
  index: derive('healthguard:blind-index'),
  jwt: process.env.JWT_SECRET ? Buffer.from(process.env.JWT_SECRET) : derive('healthguard:jwt'),
};

export const jwtSecret = keyring.jwt;
export const auditKey = keyring.audit;

function gcmEncrypt(key, plaintext, aad) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  if (aad) cipher.setAAD(Buffer.from(aad));
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return { iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ct: ct.toString('base64') };
}

function gcmDecrypt(key, box, aad) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(box.iv, 'base64'));
  if (aad) decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(Buffer.from(box.tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(box.ct, 'base64')), decipher.final()]);
}

/**
 * Envelope encryption: every value gets its own random data key (DEK).
 * The DEK is wrapped by the active key-encryption key (KEK). The owner id is bound
 * as additional authenticated data, so ciphertext cannot be moved to another patient.
 */
export function seal(value, ownerId) {
  const dek = crypto.randomBytes(32);
  const data = gcmEncrypt(dek, Buffer.from(JSON.stringify(value)), ownerId);
  const version = keyring.activeKekVersion;
  const wrapped = gcmEncrypt(keyring.kek[version], dek, `dek:${ownerId}`);
  return { v: 1, alg: 'AES-256-GCM', kek: version, dek: wrapped, data };
}

export function open(envelope, ownerId) {
  const kek = keyring.kek[envelope.kek];
  if (!kek) throw new Error('Unknown key version');
  const dek = gcmDecrypt(kek, envelope.dek, `dek:${ownerId}`);
  return JSON.parse(gcmDecrypt(dek, envelope.data, ownerId).toString('utf8'));
}

/** Re-wrap a data key under the newest KEK. The record body is never decrypted. */
export function rewrap(envelope, ownerId) {
  if (envelope.kek === keyring.activeKekVersion) return envelope;
  const dek = gcmDecrypt(keyring.kek[envelope.kek], envelope.dek, `dek:${ownerId}`);
  const version = keyring.activeKekVersion;
  return { ...envelope, kek: version, dek: gcmEncrypt(keyring.kek[version], dek, `dek:${ownerId}`) };
}

export function rotateKek() {
  const next = keyring.activeKekVersion + 1;
  keyring.kek[next] = derive(`healthguard:kek:v${next}`);
  keyring.activeKekVersion = next;
  return next;
}

export const activeKekVersion = () => keyring.activeKekVersion;

/** Restore the KEK version after a restart, so previously rotated envelopes still open. */
export function restoreKekVersion(version) {
  for (let v = 2; v <= version; v += 1) keyring.kek[v] = derive(`healthguard:kek:v${v}`);
  keyring.activeKekVersion = Math.max(1, version);
}

/** Blind index: lets us look up a user by email without storing the email in plain text. */
export const blindIndex = (value) =>
  crypto.createHmac('sha256', keyring.index).update(String(value).trim().toLowerCase()).digest('hex');

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyPassword(password, stored) {
  const [scheme, saltB64, hashB64] = String(stored).split('$');
  if (scheme !== 'scrypt') return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = crypto.scryptSync(password, Buffer.from(saltB64, 'base64'), expected.length, { N: 16384, r: 8, p: 1 });
  return crypto.timingSafeEqual(expected, actual);
}

export const randomId = (prefix) => `${prefix}_${crypto.randomBytes(9).toString('base64url')}`;
