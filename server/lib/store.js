// File-backed data store. Sensitive fields are sealed before they reach this layer.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = process.env.DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
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

export function load() {
  try {
    if (fs.existsSync(file)) db = { ...empty(), ...JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch (err) {
    console.error('[store] Could not read data file, starting empty:', err.message);
    db = empty();
  }
  return db;
}

export function save() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    fs.mkdirSync(dir, { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(db));
    fs.renameSync(tmp, file);
  }, 50);
}

export const data = () => db;
export const isEmpty = () => db.users.length === 0;
