import { useState } from 'react';
import { api } from '../api.js';
import { Field, Notice } from '../ui.jsx';

/** Hospital IT registers the current Wi-Fi's public address as trusted, using a one-time enrolment code. */
export default function NetworkEnroll({ onEnrolled }) {
  const [code, setCode] = useState('');
  const [label, setLabel] = useState('');
  const [state, setState] = useState({ busy: false, error: null, done: null });

  async function submit(e) {
    e.preventDefault();
    setState({ busy: true, error: null, done: null });
    try {
      const r = await api('/network/enroll', { method: 'POST', body: { code, label: label || 'Hospital Wi-Fi' } });
      setState({ busy: false, error: null, done: r.cidr });
      onEnrolled?.();
    } catch (err) {
      setState({ busy: false, error: err.message, done: null });
    }
  }

  return (
    <form className="stack" onSubmit={submit}>
      <p className="small" style={{ margin: 0 }}>
        Hospital IT can register this Wi-Fi network once. After that, any clinician connected to it can sign in.
        This is recorded and the security team is notified.
      </p>
      <Field label="Network name" hint="For example: Ward 3 Wi-Fi">
        {(p) => <input {...p} className="input" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} />}
      </Field>
      <Field label="Enrolment code from hospital IT">
        {(p) => <input {...p} className="input" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" required />}
      </Field>
      {state.error && <Notice tone="error">{state.error}</Notice>}
      {state.done && <Notice tone="ok" title="Network registered">This network ({state.done}) is now trusted. You can sign in.</Notice>}
      <button className="btn" disabled={state.busy || !code}>{state.busy ? 'Registering…' : 'Register this network'}</button>
    </form>
  );
}
