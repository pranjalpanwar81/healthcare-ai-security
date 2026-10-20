// Tamper-evident audit ledger: each entry is chained to the previous one with an HMAC-SHA256.
// Editing, deleting or reordering any past entry breaks every hash after it.
import crypto from 'node:crypto';
import { auditKey } from './crypto.js';
import { data, save } from './store.js';

const GENESIS = '0'.repeat(64);

const canonical = (entry) =>
  JSON.stringify([entry.seq, entry.ts, entry.actorId, entry.actorRole, entry.actorName, entry.action, entry.patientId,
    entry.target, entry.outcome, entry.ip, entry.detail, entry.prevHash]);

const sign = (entry) => crypto.createHmac('sha256', auditKey).update(canonical(entry)).digest('hex');

const listeners = [];
export const onAudit = (fn) => listeners.push(fn);

export function record({ actor, action, patientId = null, target = null, outcome = 'success', ip = null, detail = null }) {
  const chain = data().audit;
  const prev = chain[chain.length - 1];
  const entry = {
    seq: chain.length,
    ts: new Date().toISOString(),
    actorId: actor?.id ?? null,
    actorRole: actor?.role ?? 'anonymous',
    actorName: actor?.name ?? null,
    action,
    patientId,
    target,
    outcome,
    ip,
    detail,
    prevHash: prev ? prev.hash : GENESIS,
  };
  entry.hash = sign(entry);
  chain.push(entry);
  save();
  for (const fn of listeners) {
    try { fn(entry); } catch (err) { console.error('[audit] listener failed', err); }
  }
  return entry;
}

/** Walk the chain and report the first entry whose link or signature no longer matches. */
export function verify(chain = data().audit) {
  let prevHash = GENESIS;
  for (let i = 0; i < chain.length; i += 1) {
    const entry = chain[i];
    if (entry.seq !== i) return { valid: false, brokenAt: i, reason: 'Sequence gap or reordering', checked: i };
    if (entry.prevHash !== prevHash) return { valid: false, brokenAt: i, reason: 'Link to previous entry is broken', checked: i };
    if (sign(entry) !== entry.hash) return { valid: false, brokenAt: i, reason: 'Entry contents were altered', checked: i };
    prevHash = entry.hash;
  }
  return { valid: true, brokenAt: null, checked: chain.length, head: prevHash };
}

/** Demonstrate detection on a copy of the ledger; the real ledger is never modified. */
export function simulateTamper() {
  const copy = data().audit.map((e) => ({ ...e }));
  if (copy.length < 3) return { error: 'Not enough entries yet' };
  const index = Math.floor(copy.length / 2);
  const original = copy[index].action;
  copy[index].action = 'record.view (edited by attacker)';
  return { tamperedIndex: index, originalAction: original, result: verify(copy) };
}
