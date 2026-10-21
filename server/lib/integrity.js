// Model integrity. Trained model files are listed with their SHA-256 hashes in manifest.json,
// and the manifest is signed with an Ed25519 key that never leaves the training machine.
// The server holds only the public key: a swapped, edited or poisoned model file fails here
// and is never loaded.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export function verifyModels(dir, names) {
  const result = { ok: false, checkedAt: new Date().toISOString(), signedAt: null, keyFingerprint: null, files: {}, reason: null };
  try {
    const manifestBytes = fs.readFileSync(path.join(dir, 'manifest.json'));
    const signature = Buffer.from(fs.readFileSync(path.join(dir, 'manifest.sig'), 'utf8').trim(), 'base64');
    const publicKey = crypto.createPublicKey(fs.readFileSync(path.join(dir, 'signing-public.pem')));
    result.keyFingerprint = crypto.createHash('sha256').update(publicKey.export({ type: 'spki', format: 'der' })).digest('hex').slice(0, 16);
    if (!crypto.verify(null, manifestBytes, publicKey, signature)) {
      result.reason = 'The model manifest signature is invalid.';
      for (const n of names) result.files[n] = { ok: false, reason: result.reason };
      return result;
    }
    const manifest = JSON.parse(manifestBytes.toString('utf8'));
    result.signedAt = manifest.signedAt;
    for (const n of names) {
      const expected = manifest.files?.[n];
      const file = path.join(dir, n);
      if (!expected || !fs.existsSync(file)) { result.files[n] = { ok: false, reason: 'Not listed in the signed manifest.' }; continue; }
      const actual = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
      result.files[n] = actual === expected
        ? { ok: true, sha256: actual }
        : { ok: false, sha256: actual, reason: 'File contents do not match the signed hash.' };
    }
    result.ok = names.every((n) => result.files[n].ok);
  } catch (err) {
    result.reason = `Integrity check could not run: ${err.message}`;
    for (const n of names) result.files[n] ??= { ok: false, reason: result.reason };
  }
  return result;
}
