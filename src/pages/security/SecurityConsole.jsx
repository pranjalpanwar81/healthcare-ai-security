import { useState } from 'react';
import { CheckCircle2, FlaskConical, KeyRound, RefreshCw, ScrollText, ShieldAlert, ShieldCheck, Trash2, Wifi } from 'lucide-react';
import { api } from '../../api.js';
import { Badge, Empty, Loading, Notice, TopBar, fmtDateTime, useAsync, usePageTitle, useToast } from '../../ui.jsx';
import { IntegritySeal } from '../../components/AccessLedger.jsx';
import { NetworkLock, isNetworkError } from '../clinic/ClinicApp.jsx';

const SEV = { high: 'alert', medium: 'warn', low: 'info' };

export default function SecurityConsole() {
  usePageTitle('Security console');
  const [toast, toastNode] = useToast();
  const ov = useAsync(() => Promise.all([api('/admin/overview'), api('/admin/audit?limit=60')]), []);
  const [tamper, setTamper] = useState(null);
  const [busy, setBusy] = useState(null);

  if (ov.loading) return <><TopBar /><main id="main" className="container"><Loading /></main></>;
  if (ov.error) return <><TopBar /><main id="main" className="container">{isNetworkError(ov.error) ? <NetworkLock error={ov.error} /> : <Notice tone="error">{ov.error.message}</Notice>}</main></>;
  const [o, log] = ov.data;

  const act = async (name, fn) => {
    setBusy(name);
    try { await fn(); } catch (e) { toast(e.message); } finally { setBusy(null); }
  };
  const verify = () => act('verify', async () => { const r = await api('/admin/audit/verify', { method: 'POST' }); toast(r.valid ? `Verified ${r.checked} entries. Ledger intact.` : `Ledger broken at entry ${r.brokenAt}`); ov.reload(); });
  const simulate = () => act('tamper', async () => setTamper(await api('/admin/audit/simulate-tamper', { method: 'POST' })));
  const rotate = () => act('rotate', async () => { const r = await api('/admin/keys/rotate', { method: 'POST' }); toast(`Master key rotated to version ${r.version}. ${r.rewrapped} data keys re-wrapped.`); ov.reload(); });
  const resolve = (id) => act(id, async () => { await api(`/admin/alerts/${id}/resolve`, { method: 'POST' }); ov.reload(); });
  const removeNet = (cidr) => act(cidr, async () => { await api('/admin/networks', { method: 'DELETE', body: { cidr } }); ov.reload(); });

  const open = o.alerts.filter((a) => a.status === 'open');

  return (
    <>
      <TopBar />
      <main id="main" className="container stack" style={{ '--stack': '24px' }}>
        {toastNode}
        <div className="page-head"><h1>Security console</h1><p>Integrity, encryption, network trust and unusual activity across the hospital record system.</p></div>

        <dl className="grid-3" style={{ margin: 0 }}>
          {[['Patients', o.counts.patients], ['Clinicians', o.counts.doctors], ['Encrypted records', o.counts.records], ['Ledger entries', o.counts.ledger], ['Open alerts', o.counts.openAlerts], ['Active emergency access', o.counts.activeEmergencies]].map(([k, v]) => (
            <div key={k} className="card soft"><dt className="small muted">{k}</dt><dd style={{ margin: 0, fontSize: 'var(--step-2)', fontWeight: 700 }}>{v}</dd></div>
          ))}
        </dl>

        <div className="grid-2">
          <section className="card stack" aria-labelledby="sc-int">
            <div className="card-head"><div><h2 id="sc-int"><ScrollText size={20} aria-hidden="true" /> Audit ledger integrity</h2><p>Each entry is signed with HMAC-SHA256 and linked to the one before it.</p></div></div>
            <IntegritySeal integrity={o.integrity} />
            {o.integrity.head && <p className="small muted" style={{ margin: 0 }}>Chain head: <span className="mono">{o.integrity.head.slice(0, 32)}…</span></p>}
            <div className="row">
              <button className="btn" onClick={verify} disabled={busy === 'verify'}><RefreshCw size={16} aria-hidden="true" />Verify now</button>
              <button className="btn" onClick={simulate} disabled={busy === 'tamper'}><FlaskConical size={16} aria-hidden="true" />Simulate tampering</button>
            </div>
            {tamper?.result && (
              <Notice tone="alert" title={`Tampering detected at entry ${tamper.result.brokenAt}`}>
                On a copy of the ledger, entry {tamper.tamperedIndex} was changed from “{tamper.originalAction}”. Verification failed: {tamper.result.reason}. The real ledger was not modified.
              </Notice>
            )}
          </section>

          <section className="card stack" aria-labelledby="sc-enc">
            <div className="card-head"><div><h2 id="sc-enc"><KeyRound size={20} aria-hidden="true" /> Encryption</h2><p>{o.encryption.algorithm}</p></div></div>
            <dl className="kv">
              <dt>Active master key</dt><dd>Version {o.encryption.activeKeyVersion}</dd>
              <dt>Sealed records</dt><dd>{o.encryption.sealedRecords}</dd>
              <dt>Sealed profiles</dt><dd>{o.encryption.sealedProfiles}</dd>
              <dt>Email lookup</dt><dd>HMAC blind index</dd>
            </dl>
            <p className="small muted" style={{ margin: 0 }}>Rotation re-wraps every per-record data key under a new master key. Record contents are never decrypted during rotation.</p>
            <button className="btn" onClick={rotate} disabled={busy === 'rotate'} style={{ alignSelf: 'flex-start' }}><KeyRound size={16} aria-hidden="true" />Rotate master key</button>
          </section>
        </div>

        <section className="card" aria-labelledby="sc-al">
          <div className="card-head"><div><h2 id="sc-al"><ShieldAlert size={20} aria-hidden="true" /> Alerts</h2><p>{open.length} open · detected automatically from access patterns</p></div></div>
          {o.alerts.length === 0 ? <Empty icon={ShieldCheck} title="No alerts" /> : (
            <ul className="list">{o.alerts.map((a) => (
              <li key={a.id} className="spread" style={{ alignItems: 'flex-start' }}>
                <span style={{ flex: '1 1 320px' }}>
                  <span className="row" style={{ gap: 8 }}><Badge tone={SEV[a.severity]}>{a.severity === 'high' ? 'High' : a.severity === 'medium' ? 'Medium' : 'Low'}</Badge><strong>{a.title}</strong></span>
                  <span className="small muted">{a.detail} · {a.actorName || 'Unknown'} · {fmtDateTime(a.ts)}{a.count > 1 ? ` · seen ${a.count} times` : ''}</span>
                </span>
                {a.status === 'open'
                  ? <button className="btn btn-sm" onClick={() => resolve(a.id)} disabled={busy === a.id}><CheckCircle2 size={16} aria-hidden="true" />Mark reviewed</button>
                  : <Badge tone="ok">Reviewed by {a.resolvedBy}</Badge>}
              </li>))}
            </ul>
          )}
        </section>

        <section className="card" aria-labelledby="sc-net">
          <div className="card-head"><div><h2 id="sc-net"><Wifi size={20} aria-hidden="true" /> Trusted hospital networks</h2><p>Clinicians can only sign in and work from these addresses. You are on: <span className="mono">{o.you?.ip}</span></p></div></div>
          <div className="table-wrap">
            <table>
              <thead><tr><th scope="col">Address range</th><th scope="col">Name</th><th scope="col">Source</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>{o.networks.map((n) => (
                <tr key={n.cidr + n.source}><td className="mono">{n.cidr}</td><td>{n.label}</td><td>{({ env: 'Server configuration', enrolled: 'Enrolled by IT', dev: 'Development' })[n.source]}</td>
                  <td>{n.source === 'enrolled' && <button className="btn btn-sm" onClick={() => removeNet(n.cidr)} aria-label={`Remove ${n.cidr}`}><Trash2 size={16} aria-hidden="true" />Remove</button>}</td></tr>))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card" aria-labelledby="sc-log">
          <div className="card-head"><div><h2 id="sc-log">Recent ledger entries</h2><p>Newest first</p></div></div>
          <div className="table-wrap">
            <table>
              <thead><tr><th scope="col">#</th><th scope="col">Time</th><th scope="col">Who</th><th scope="col">Action</th><th scope="col">Result</th><th scope="col">Address</th><th scope="col">Hash</th></tr></thead>
              <tbody>{log.entries.map((e) => (
                <tr key={e.seq}><td>{e.seq}</td><td style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(e.ts)}</td><td>{e.actorName || '—'}<br /><span className="muted">{e.actorRole}</span></td><td className="mono">{e.action}</td>
                  <td><Badge tone={e.outcome === 'success' ? 'ok' : e.outcome === 'denied' || e.outcome === 'failed' ? 'alert' : 'neutral'}>{e.outcome}</Badge></td><td className="mono">{e.ip || '—'}</td><td className="mono">{e.hash.slice(0, 12)}…</td></tr>))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </>
  );
}
