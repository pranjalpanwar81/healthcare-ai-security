// Sign the trained model files after running ml/scripts/train.py:
//   node server/scripts/sign-models.mjs
// The private key is read from MODEL_SIGNING_KEY (a path), or created on first use at the default
// path below. Keep it out of the repository; only the public key is committed.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'models');
const keyPath = process.env.MODEL_SIGNING_KEY || path.resolve(dir, '..', '..', '..', '.tools', 'healthguard-model-signing.pem');

let privateKey;
if (fs.existsSync(keyPath)) {
  privateKey = crypto.createPrivateKey(fs.readFileSync(keyPath));
} else {
  const pair = crypto.generateKeyPairSync('ed25519');
  privateKey = pair.privateKey;
  fs.mkdirSync(path.dirname(keyPath), { recursive: true });
  fs.writeFileSync(keyPath, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  console.log(`Created a new signing key at ${keyPath}`);
}
const publicKey = crypto.createPublicKey(privateKey);
fs.writeFileSync(path.join(dir, 'signing-public.pem'), publicKey.export({ type: 'spki', format: 'pem' }));

const files = {};
for (const name of fs.readdirSync(dir).filter((n) => n.endsWith('.json') && n !== 'manifest.json').sort()) {
  files[name] = crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, name))).digest('hex');
}
const manifest = Buffer.from(JSON.stringify({ signedAt: new Date().toISOString(), algorithm: 'Ed25519 over SHA-256 file hashes', files }, null, 2));
fs.writeFileSync(path.join(dir, 'manifest.json'), manifest);
fs.writeFileSync(path.join(dir, 'manifest.sig'), crypto.sign(null, manifest, privateKey).toString('base64'));
console.log(`Signed ${Object.keys(files).length} model files: ${Object.keys(files).join(', ')}`);
