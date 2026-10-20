import { Eye, FilePlus2, KeyRound, ShieldAlert, ShieldCheck, ShieldX, Siren, UserCheck, UserX, Search, Sparkles } from 'lucide-react';
import { fmtDateTime } from '../ui.jsx';

const ACTIONS = {
  'record.read': { icon: Eye, text: 'opened your records', tone: 'neutral' },
  'record.write': { icon: FilePlus2, text: 'added a note to your records', tone: 'ok' },
  'breakglass.start': { icon: Siren, text: 'used emergency access to your records', tone: 'alert' },
  'consent.grant': { icon: UserCheck, text: 'was given access', tone: 'ok' },
  'consent.revoke': { icon: UserX, text: 'access was removed', tone: 'warn' },
  'xai.explain': { icon: Sparkles, text: 'ran a risk check on your readings', tone: 'neutral' },
  'patient.search': { icon: Search, text: 'looked up your account', tone: 'neutral' },
};

export function describe(e) {
  const a = ACTIONS[e.action] || { icon: KeyRound, text: e.action, tone: 'neutral' };
  if (e.outcome === 'denied') return { icon: ShieldX, text: 'tried to open your records but was blocked', tone: 'alert' };
  return a;
}

export function IntegritySeal({ integrity }) {
  if (!integrity) return null;
  return integrity.valid ? (
    <div className="seal tone-ok" role="status">
      <ShieldCheck size={28} aria-hidden="true" />
      <div>
        <strong>History verified: nothing has been altered</strong>
        <div className="small">All {integrity.checked} entries in the hospital ledger are cryptographically linked and intact.</div>
      </div>
    </div>
  ) : (
    <div className="seal tone-alert" role="alert">
      <ShieldAlert size={28} aria-hidden="true" />
      <div>
        <strong>Warning: the history has been changed</strong>
        <div className="small">Entry {integrity.brokenAt} failed verification ({integrity.reason}). The security team has been told.</div>
      </div>
    </div>
  );
}

export default function AccessLedger({ entries, showHash = true }) {
  return (
    <ol className="ledger">
      {entries.map((e) => {
        const d = describe(e);
        const Icon = d.icon;
        const subject = e.action === 'consent.grant' || e.action === 'consent.revoke' ? (e.detail?.doctor || 'A doctor') : e.who;
        return (
          <li key={e.seq}>
            <span className={`ledger-dot tone-${d.tone}`} aria-hidden="true"><Icon size={14} /></span>
            <div><strong>{subject}</strong> {d.text}{e.detail?.basis === 'emergency' && e.action === 'record.read' ? ' (emergency access)' : ''}</div>
            <div className="ledger-meta">{fmtDateTime(e.ts)}{e.detail?.reason ? ` · Reason: “${e.detail.reason}”` : ''}</div>
            {showHash && <div className="ledger-hash mono" title="Entry fingerprint">#{e.seq} · {e.hash.slice(0, 16)}…</div>}
          </li>
        );
      })}
    </ol>
  );
}
