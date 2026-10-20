// Data store. Sensitive fields are sealed before they reach this layer.
// Local development keeps a JSON file. On Vercel (BLOB_READ_WRITE_TOKEN set) the same document
// lives in a private Vercel Blob, so every serverless instance shares one copy and nothing is
// lost on cold starts or redeploys.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BLOB = Boolean(process.env.BLOB_READ_WRITE_TOKEN);
const BLOB_PATH = process.env.BLOB_DB_PATH || 'healthguard/db.json';
const dir = process.env.DATA_DIR || (process.env.VERCEL ? '/tmp/healthguard' : null) || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const file = path.join(dir, 'healthguard.json');

const empty = () => ({
  meta: { kekVersion: 1, createdAt: new Date().toISOString() },
  users: [],
  records: [],
  consents: [],
  breakGlass: [],
  networks: [],
  audit: [],
  alerts: [],
  revokedTokens: [],
});

let db = empty();
let timer = null;
let dirty = false;
let loadedAt = 0;
let blobEtag = null;

export const usesSharedStore = () => BLOB;

export function load() {
  if (BLOB) return db;
  try {
    if (fs.existsSync(file)) db = { ...empty(), ...JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch (err) {
    console.error('[store] Could not read data file, starting empty:', err.message);
    db = empty();
  }
  return db;
}

/** Shared store: fetch the latest document, unless this instance has unsaved changes. */
export async function refresh({ maxAgeMs = 1500 } = {}) {
  if (!BLOB || dirty || Date.now() - loadedAt < maxAgeMs) return db;
  const { get } = await import('@vercel/blob');
  const res = await get(BLOB_PATH, { access: 'private', useCache: false });
  if (res && res.statusCode === 200) {
    const text = await new Response(res.stream).text();
    db = { ...empty(), ...JSON.parse(text) };
    blobEtag = res.blob.etag;
  }
  loadedAt = Date.now();
  return db;
}

export function save() {
  dirty = true;
  if (BLOB) return;
  clearTimeout(timer);
  timer = setTimeout(() => {
    fs.mkdirSync(dir, { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(db));
    fs.renameSync(tmp, file);
    dirty = false;
  }, 50);
}

/** Persist pending changes. On Vercel this must finish before the response is sent. */
export async function flush() {
  if (!BLOB || !dirty) return;
  const { put } = await import('@vercel/blob');
  const out = await put(BLOB_PATH, JSON.stringify(db), {
    access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json', cacheControlMaxAge: 60,
  });
  dirty = false;
  loadedAt = Date.now();
  blobEtag = out?.etag ?? blobEtag;
}

export const data = () => db;
export const isEmpty = () => db.users.length === 0;
