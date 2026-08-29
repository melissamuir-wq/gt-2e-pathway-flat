'use client';

// =============================================================
// GT Anywhere · 2e Pathway
// Everything lives in this one file on purpose: the sign-in, the
// caseboard, the intake form, the case file, and the rules engine.
// One folder, no nesting. Edit the ENGINE section to change routing.
// =============================================================

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';

// These two are inlined at BUILD time, not read at runtime. If you add
// them to Vercel after a deploy has already gone out, you must redeploy.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    'Missing NEXT_PUBLIC_SUPABASE_URL and/or NEXT_PUBLIC_SUPABASE_ANON_KEY. ' +
    'Locally: copy .env.local.example to .env.local and fill it in. ' +
    'On Vercel: Settings -> Environment Variables, then redeploy. See DEPLOY.md.'
  );
}

// The dashboard shows the RESTful endpoint (".../rest/v1/") right next to the
// Project URL, and pasting that one instead is easy. supabase-js then builds
// ".../rest/v1/auth/v1/otp" and the gateway answers "Invalid path specified in
// request URL" at sign-in -- an error that points at everything except the
// actual cause. Take the origin and drop whatever path came with it.
function projectOrigin(raw: string) {
  try {
    return new URL(raw.trim()).origin;
  } catch {
    throw new Error(
      `NEXT_PUBLIC_SUPABASE_URL is not a valid URL: "${raw}". ` +
      'It should look like https://YOUR-PROJECT-REF.supabase.co and nothing more.'
    );
  }
}

const supabase = createClient(projectOrigin(SUPABASE_URL), SUPABASE_ANON_KEY);

const ALLOWED_DOMAINS = ['gt.school', 'alpha.school'];

// ================= ENGINE =================

const STAGES = [
  { k: 'signal', n: '01', t: 'Signal Logged' },
  { k: 'documented', n: '02', t: 'Documented Concern' },
  { k: 'family', n: '03', t: 'Family Conversation' },
  { k: 'plan', n: '04', t: 'Support Plan Active' },
  { k: 'review', n: '05', t: 'Review Point' },
  { k: 'fit', n: '06', t: 'Fit Review' },
];

const DOMAIN_LABEL: Record<string, string> = {
  literacy: 'Reading / written output',
  numeracy: 'Math / number sense',
  attention: 'Attention & executive function',
  gap: 'Foundational gap vs. age-grade',
  access: 'Access / tooling barrier',
  social: 'Social, emotional, regulation',
  flag: 'Integrity / engagement flag',
  speech: 'Speech, language, motor',
};

const DOC_LABEL: Record<string, string> = {
  iep: 'IEP on file',
  '504': '504 on file',
  eval_shared: 'Evaluation shared',
  exists_not_shared: 'Exists, not shared',
  parent_reported: 'Parent-reported only',
  in_progress: 'Evaluation in progress',
  staff_suspected: 'Staff-observed only',
  declined: 'Family declined evaluation',
};

const DOCS_KNOWN = ['iep', '504', 'eval_shared'];

type Step = { title: string; rationale: string; owner_label: string; due_on: string; severity: 'gate' | 'urgent' | 'normal' };

function addDays(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function buildPlan(c: any) {
  const steps: Step[] = [];
  const gaps: string[] = [];
  const flags: string[] = [];
  const has = (k: string) => (c.domains || []).includes(k);
  const tried = (k: string) => (c.tried || []).includes(k);
  const ruled = (k: string) => (c.ruleouts || []).includes(k);
  const docsKnown = DOCS_KNOWN.includes(c.doc_status);
  const aa = c.assigned_aa || c.raised_by;
  const P = (title: string, owner_label: string, due_on: string, rationale: string, severity: Step['severity'] = 'normal') =>
    steps.push({ title, owner_label, due_on, rationale, severity });

  if (!ruled('env') || !ruled('pattern')) {
    P('Rule out circumstance before this goes further. Confirm nothing major changed at home, and confirm you have seen this pattern more than once.',
      c.raised_by, addDays(14),
      'A student who kept navigating away from placement tests turned out to be mid-move across the country: two days of driving, a hotel, a move-in. The pattern was real. The cause was not academic.', 'gate');
    flags.push('Ordinary explanations not yet ruled out');
  }
  if (!ruled('tech') && (has('flag') || has('attention') || has('access'))) {
    P('Confirm the device and setup: PC or Mac desktop app, not an iPad, and platform access working.',
      c.raised_by, addDays(3),
      'Device and platform problems present as attention or engagement problems. Cheap to check and frequently the whole answer.', 'gate');
    flags.push('Device / setup unconfirmed');
  }
  if (has('access') || (has('literacy') && !docsKnown)) {
    P('Put a working accommodation in the very next session: scribe, dictation, read-aloud, or paper-and-pencil. Do not wait for documentation.',
      c.raised_by, addDays(2),
      'A workshop lead typed while a student dictated, and the student answered accurately and stayed engaged the whole session. Access is not a diagnosis question.', 'urgent');
    P('Loop the workshop lead and platform partner so the accommodation is built in to the activity, not improvised each week.',
      'Workshop lead + platform partner', addDays(7),
      'What one advisor improvises live should become a standing support the next person inherits.');
  }
  if (tried('platform') || (has('literacy') && has('access'))) {
    P('Log the platform-level accommodation ask with TimeBack. Name the exact tool and the exact blocker.',
      'TimeBack / product', addDays(10),
      'Some accommodations are product asks, not advisor asks. Logged asks become a visible pattern; unlogged ones stay one advisor problem.');
  }
  if (['exists_not_shared', 'parent_reported', 'in_progress'].includes(c.doc_status)) {
    P('Records request: ask the family to share the plan, evaluation, or report. Route it through records, not the advisor.',
      'Records', addDays(7),
      'Keeping the documentation ask with records keeps the advisor relationship warm and the request neutral.');
    gaps.push('Documentation referenced but not on file');
  }
  if (c.doc_status === 'staff_suspected') {
    P('Parent history conversation, 15 minutes. Ask what they see at home, what has worked in other settings and what has not, and whether there is any history they want us to hold.',
      '2e Lead', addDays(5),
      'Open with the strengths and say plainly that nothing here is alarming. The goal of the first call is history, not diagnosis. Do not name a condition.', 'urgent');
    gaps.push('No documentation, everything on file is staff observation');
  }
  if (c.doc_status === 'declined') {
    P('Build the support plan on observed functional need only. Never require a label to deliver an accommodation.',
      aa, addDays(7),
      'A family may decline a label for reasons that are entirely theirs. Function, not diagnosis, is what a support plan actually needs.');
  }
  if (docsKnown) {
    P('Translate the plan in to TimeBack reality: list each accommodation and mark which we can deliver today, which need a workaround, and which the platform cannot support.',
      aa, addDays(7),
      'An accommodation that exists on paper and not in the tool is the gap families discover the hard way.');
    if (!c.known_accommodations) gaps.push('Plan on file but no accommodations recorded here');
  }
  if (has('attention')) {
    P('Deploy the executive-function toolbox: printable and laminated checklist, visible timer, fidget options, paper-and-pencil alternative, offline weekly schedule showing workshop times.',
      aa, addDays(10),
      'Build for independence. If the support only works when a parent or older sibling is sitting there, it is not yet a support.');
    if (!tried('ef')) gaps.push('EF toolbox not tried yet, do this before any 2e framing');
  }
  if (has('social')) {
    P('Name the regulation pattern in writing and pair it with the setting that produces this child at their best.',
      aa, addDays(10),
      'A child who dims around same-age peers and comes alive with a like-minded tribe is describing a placement need, not a deficit.');
  }
  if (has('gap')) {
    P('Formal placement review: current instructional level vs. age-grade, by subject, with dates and instruments named.',
      '2e Lead + assigned Lead', addDays(7),
      'A parent asking whether we can place their child substantially below age-grade deserves a specific answer, not reassurance.', 'urgent');
    P('Prepare the honest-fit brief before the family asks: what acceleration looks like alongside a foundational gap, what one-to-one time actually exists, and what we cannot provide.',
      '2e Lead + AA', addDays(10),
      'Families are usually already exploring alternatives when they ask. Being ready is the difference between a partnership and a scramble.');
    flags.push('Foundational gap flagged, placement review required');
  }
  if (has('flag')) {
    P('Re-read the engagement flag against this concern. Reinforce genuine progress first, then set the expectation about where the work is done.',
      aa, addDays(5),
      'Integrity flags and access problems look identical on a dashboard. Assume the access explanation until you have ruled it out, and watch for parent sensitivity to feedback.');
  }
  if (has('numeracy') || has('speech')) {
    P('Document the specific profile and identify the strength-side placement that runs alongside it.',
      aa, addDays(10),
      'A student with dyscalculia who writes exceptionally belongs in a writing workshop, not in remediation alone. Build on the spike.');
  }
  P('Write the strength-first family summary and send it. Lead with what this child is good at, then what we are putting in place, then one thing we are asking of them.',
    aa, addDays(7), 'This is the artifact that keeps a family a partner instead of an audience.');
  P('Set the review date now and put it on a calendar. On that date: working, adjust, or escalate.',
    aa, addDays(30), 'A support plan without a review date cannot support a later fit conversation, because there is no before and after.');

  let fit: null | { ready: boolean; why: string; block: string | null } = null;
  if (c.advisor_read === 'fit' || c.advisor_read === 'parent_fit' || has('gap')) {
    const ready = ['live', 'ef', 'placement', 'family'].some(tried) && !tried('nothing');
    fit = {
      ready,
      why: c.advisor_read === 'parent_fit'
        ? 'The family has asked the fit question directly. Respond within 48 hours with a named time, both the AA and the 2e Lead on the call.'
        : has('gap')
        ? 'A multi-year foundational gap inside an accelerated model is a real fit question. It is answered with a placement review and an honest conversation, not avoided.'
        : 'The advisor closest to this child has flagged a fit concern. That judgment gets a structured review, not a silent override.',
      block: ready ? null : 'Fit Review cannot open yet. No support has been tried and documented, so there is nothing to review. Run stages 03 to 05 first.',
    };
  }
  if (!c.strength || c.strength.trim().length < 12) gaps.push('Strength not documented in enough detail, a 2e file needs both sides');
  if (!c.objective_data) gaps.push('No objective data attached (TimeBack, MAP, placement)');
  if (tried('nothing')) gaps.push('No support tried yet, a fit conversation is not available until something has been');

  let stage = 'signal';
  if (ruled('env') && ruled('pattern')) stage = 'documented';
  if (tried('family') || c.doc_status === 'parent_reported') stage = 'family';
  if (tried('live') || tried('ef') || tried('placement')) stage = 'plan';
  if (c.advisor_read === 'parent_fit') stage = 'family';

  return { steps, gaps, flags, fit, stage };
}

// ================= FORM OPTIONS =================

const DOMAINS = [
  ['literacy', 'Reading / decoding / written output', 'Slow or effortful reading, spelling far off, avoids writing, dyslexia suspected or diagnosed'],
  ['numeracy', 'Math / number sense', 'Fact fluency stalls, dyscalculia suspected or diagnosed'],
  ['attention', 'Attention, task initiation, executive function', 'Cannot start, loses the thread, needs an adult to stay on task'],
  ['gap', 'Foundational gap vs. age / grade', 'Working meaningfully below age-grade in a core subject'],
  ['access', 'Access or tooling barrier', 'Cannot type, no speech-to-text experience, wrong device, platform blocks participation'],
  ['social', 'Social, emotional, regulation', 'Shuts down, dims around peers, intensity, anxiety around assessment'],
  ['flag', 'Integrity or engagement flag', 'Screen switching, unauthorized help, wasted time, dashboard alert'],
  ['speech', 'Speech, language, or motor', 'Articulation, expressive language, handwriting, fine motor'],
];
const RULEOUTS = [
  ['env', 'Home / life circumstance checked', 'No move, illness, travel, new sibling, or major disruption in the window'],
  ['tech', 'Device and setup confirmed', 'On the desktop app, not an iPad; audio, login, and access all working'],
  ['onboard', 'Past the onboarding curve', 'Not simply new to TimeBack, XP, or the platform'],
  ['pattern', 'Seen more than once', 'Repeated across sessions or subjects, not a single bad day'],
];
const TRIED = [
  ['nothing', 'Nothing formal yet', 'This is the first flag'],
  ['live', 'Live in-session workaround', 'Scribed for them, read aloud, adjusted the task on the spot'],
  ['ef', 'Executive-function toolbox', 'Timers, fidgets, printed checklist, paper-and-pencil option'],
  ['placement', 'Placement or pacing adjusted', 'Course level, XP goals, or minute goals changed'],
  ['family', 'Family conversation held', 'Advisor has already talked with a parent about this'],
  ['platform', 'Platform accommodation requested', 'Escalated to TimeBack for a tool the platform does not support'],
];
const DOC_OPTIONS = [
  ['iep', 'IEP on file with GT'],
  ['504', '504 plan on file with GT'],
  ['eval_shared', 'Private evaluation shared with GT'],
  ['exists_not_shared', 'Plan or evaluation exists, family has not shared it'],
  ['parent_reported', 'Parent-reported diagnosis, no documentation'],
  ['in_progress', 'Evaluation in progress or scheduled'],
  ['staff_suspected', 'No diagnosis, staff-observed only'],
  ['declined', 'Family declined evaluation or does not want a label'],
];

const BLANK = {
  student_name: '', grade_band: '', observed_on: new Date().toISOString().slice(0, 10),
  raised_by: '', raised_by_role: 'Academic Advisor', assigned_aa: '',
  observation: '', objective_data: '', strength: '', home_context: '',
  doc_status: '', known_accommodations: '', prior_setting: '', tried_note: '', advisor_read: '',
};

// ================= APP =================

export default function App() {
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [view, setView] = useState<{ name: 'board' | 'new' | 'case'; id?: string }>({ name: 'board' });
  const [cases, setCases] = useState<any[]>([]);
  const [err, setErr] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setEmail(data.session?.user.email ?? null);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setEmail(s?.user.email ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('cases').select('*').order('created_at');
    if (error) setErr(error.message);
    else { setErr(''); setCases(data ?? []); }
  }, []);

  useEffect(() => { if (email) load(); }, [email, load]);

  if (!ready) return <main><div className="card"><div className="empty">Loading…</div></div></main>;
  if (!email) return <SignIn />;

  return (
    <>
      <header className="top">
        <div>
          <div className="sub">GT Anywhere · Academics</div>
          <h1>2e Pathway</h1>
        </div>
        <nav>
          <button onClick={() => { setView({ name: 'board' }); load(); }}>Caseboard</button>
          <button className="cta" onClick={() => setView({ name: 'new' })}
            style={{ background: 'var(--gold)', borderColor: 'var(--gold)', color: '#001117', fontWeight: 600 }}>
            New Concern
          </button>
          <span className="mono" style={{ fontSize: 12, color: '#EBBA9B' }}>{email}</span>
          <button onClick={async () => { await supabase.auth.signOut(); setCases([]); }}>Sign out</button>
        </nav>
      </header>
      <main>
        {err && (
          <div className="note stop">
            <b>Could not load cases.</b><br />{err}<br /><br />
            If this says permission denied, re-run <span className="mono">02-security.sql</span> in Supabase.
          </div>
        )}
        {view.name === 'board' && <Board cases={cases} open={(id) => setView({ name: 'case', id })} />}
        {view.name === 'new' && <NewCase onDone={async () => { await load(); setView({ name: 'board' }); }} />}
        {view.name === 'case' && (
          <CaseFile c={cases.find((x) => x.id === view.id)} reload={load} back={() => setView({ name: 'board' })} />
        )}
      </main>
    </>
  );
}

function SignIn() {
  const [addr, setAddr] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [e, setE] = useState('');
  const [linkErr, setLinkErr] = useState('');

  // A magic link that fails does not throw. Supabase sends the reason back in
  // the URL fragment -- #error=access_denied&error_code=otp_expired&... -- and
  // if nobody reads it the page simply renders this form again. That silence
  // looks exactly like a redirect loop, which is the wrong thing to go and
  // debug. Read it, say it plainly, then clear it from the address bar.
  useEffect(() => {
    const h = window.location.hash.slice(1);
    if (!h) return;
    const p = new URLSearchParams(h);
    const desc = p.get('error_description');
    if (!desc) return;
    const code = p.get('error_code');
    setLinkErr(
      code === 'otp_expired'
        ? 'That sign-in link has already been used or has expired. Links work once and last an hour. Request a new one below, and open it in this same browser.'
        : desc
    );
    history.replaceState(null, '', window.location.pathname);
  }, []);

  async function go(ev: React.FormEvent) {
    ev.preventDefault();
    setE('');
    const a = addr.trim().toLowerCase();
    if (!ALLOWED_DOMAINS.includes(a.split('@')[1] ?? '')) {
      setE('Use your GT address. Only gt.school and alpha.school accounts can open this tool.');
      return;
    }
    setBusy(true);
    // Trailing slash matters. Supabase matches this against the Redirect URLs
    // allowlist as a glob, and a bare origin with no path does not match the
    // usual "https://host/**" entry -- it comes back as "Invalid path
    // specified in request URL" before any email is sent.
    const { error } = await supabase.auth.signInWithOtp({
      email: a, options: { emailRedirectTo: window.location.origin + '/' },
    });
    setBusy(false);
    if (error) setE(error.message); else setSent(true);
  }

  return (
    <>
      <header className="top">
        <div><div className="sub">GT Anywhere · Academics</div><h1>2e Pathway</h1></div>
      </header>
      <main>
        <div className="signin card">
          {linkErr && <div className="note stop" style={{ marginBottom: 16 }}><b>Sign-in link did not work</b><br />{linkErr}</div>}
          {sent ? (
            <>
              <h2>Check your email</h2>
              <p className="hint">A sign-in link is on its way to <b>{addr.trim().toLowerCase()}</b>. It works once and expires in an hour. Check spam if it is slow.</p>
              <button className="btn ghost" onClick={() => setSent(false)}>Use a different address</button>
            </>
          ) : (
            <>
              <h2>Sign in</h2>
              <p className="hint">This tool holds student records. Enter your GT address and we will email you a sign-in link.</p>
              <form onSubmit={go}>
                <input type="text" inputMode="email" placeholder="you@gt.school" value={addr} onChange={(x) => setAddr(x.target.value)} required />
                <div style={{ marginTop: 14 }}>
                  <button className="btn gold" type="submit" disabled={busy || !addr.trim()}>
                    {busy ? 'Sending…' : 'Email me a sign-in link'}
                  </button>
                </div>
              </form>
              {e && <div className="err">{e}</div>}
            </>
          )}
        </div>
      </main>
    </>
  );
}

function Board({ cases, open }: { cases: any[]; open: (id: string) => void }) {
  return (
    <>
      <div className="rail">
        {STAGES.map((s) => (
          <div key={s.k} className={'st' + (s.k === 'fit' ? ' fit' : '')}>
            <div className="n">{s.n}</div>
            <div className="t">{s.t}</div>
            <div className="c">{cases.filter((c) => c.stage === s.k).length}</div>
          </div>
        ))}
      </div>
      {cases.length === 0 ? (
        <div className="card"><div className="empty">No cases yet. Use <b>New Concern</b> to file the first one.</div></div>
      ) : (
        <table className="cases">
          <thead>
            <tr><th>Student</th><th>Domains</th><th>Documentation</th><th>Stage</th><th>Owner</th><th /></tr>
          </thead>
          <tbody>
            {cases.map((c) => {
              const st = STAGES.find((s) => s.k === c.stage) ?? STAGES[0];
              const known = DOCS_KNOWN.includes(c.doc_status);
              return (
                <tr key={c.id}>
                  <td className="namecell"><b>{c.student_name}</b><small className="mono">{c.ref} · {c.grade_band}</small></td>
                  <td style={{ fontSize: 12.5 }}>{(c.domains || []).map((d: string) => <div key={d}>{DOMAIN_LABEL[d] ?? d}</div>)}</td>
                  <td><span className={'pill ' + (known ? 'ok' : c.doc_status === 'staff_suspected' ? 'warn' : 'grey')}>{DOC_LABEL[c.doc_status] ?? c.doc_status}</span></td>
                  <td><span className={'pill ' + (c.stage === 'fit' ? 'stop' : 'navy')}>{st.n} {st.t}</span></td>
                  <td style={{ fontSize: 12.5 }}>{c.assigned_aa || c.raised_by}</td>
                  <td><button className="btn ghost sm" onClick={() => open(c.id)}>Open</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}

function Checks({ items, sel, toggle }: { items: string[][]; sel: string[]; toggle: (v: string) => void }) {
  return (
    <div className="checks">
      {items.map(([v, t, s]) => (
        <label className="chk" key={v}>
          <input type="checkbox" checked={sel.includes(v)} onChange={() => toggle(v)} />
          <span><b>{t}</b><i>{s}</i></span>
        </label>
      ))}
    </div>
  );
}

function NewCase({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState<any>({ ...BLANK });
  const [domains, setDomains] = useState<string[]>([]);
  const [ruleouts, setRuleouts] = useState<string[]>([]);
  const [tried, setTried] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [e, setE] = useState('');
  const set = (k: string, v: string) => setF((p: any) => ({ ...p, [k]: v }));
  const mk = (arr: string[], setArr: (a: string[]) => void) => (v: string) =>
    setArr(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setE('');
    if (!domains.length) { setE('Pick at least one domain in Step 02 so the pathway knows what it is routing.'); return; }
    if (f.strength.trim().length < 12) { setE('The strength field needs more detail. A 2e file needs both sides.'); return; }
    setBusy(true);
    const plan = buildPlan({ ...f, domains, ruleouts, tried });
    const { data, error } = await supabase.from('cases')
      .insert({ ...f, domains, ruleouts, tried, stage: plan.stage }).select('id').single();
    if (error || !data) { setE(error?.message ?? 'Could not save.'); setBusy(false); return; }
    await supabase.from('case_steps').insert(plan.steps.map((s) => ({
      case_id: data.id, title: s.title, rationale: s.rationale,
      owner_label: s.owner_label, due_on: s.due_on, severity: s.severity,
    })));
    await supabase.from('case_notes').insert({
      case_id: data.id, author_name: f.raised_by, body: 'Concern logged. ' + domains.join('; ') + '.',
    });
    onDone();
  }

  return (
    <form onSubmit={submit}>
      <div className="card" style={{ background: 'var(--navy-deep)', color: '#fff', borderColor: 'var(--navy-deep)' }}>
        <h2 style={{ color: '#fff' }}>Log a concern in about four minutes.</h2>
        <p style={{ fontSize: 13.5, color: 'var(--gold60)', margin: '8px 0 0', maxWidth: 760 }}>
          You do not need a diagnosis to file. Describe what you saw, when, and what you already tried. The pathway does the routing.
        </p>
      </div>

      <div className="card">
        <span className="step-no">Step 01</span><h2>Student &amp; who is raising this</h2>
        <div className="grid3">
          <div><label className="f">Student name <span className="req">*</span></label>
            <input type="text" required value={f.student_name} onChange={(e2) => set('student_name', e2.target.value)} /></div>
          <div><label className="f">Age / grade band <span className="req">*</span></label>
            <select required value={f.grade_band} onChange={(e2) => set('grade_band', e2.target.value)}>
              <option value="">Select…</option><option>K-2</option><option>3-5</option><option>6-8</option><option>9+</option>
            </select></div>
          <div><label className="f">Date observed <span className="req">*</span></label>
            <input type="date" required value={f.observed_on} onChange={(e2) => set('observed_on', e2.target.value)} /></div>
        </div>
        <div className="grid3">
          <div><label className="f">Raised by <span className="req">*</span></label>
            <input type="text" required value={f.raised_by} onChange={(e2) => set('raised_by', e2.target.value)} /></div>
          <div><label className="f">Their role</label>
            <select value={f.raised_by_role} onChange={(e2) => set('raised_by_role', e2.target.value)}>
              <option>Academic Advisor</option><option>Workshop Lead or Guide</option><option>Lead or Admin</option>
              <option>Parent-initiated</option><option>Enrollment or BDR</option><option>Other</option>
            </select></div>
          <div><label className="f">Assigned AA</label>
            <input type="text" value={f.assigned_aa} onChange={(e2) => set('assigned_aa', e2.target.value)} placeholder="If different from above" /></div>
        </div>
      </div>

      <div className="card">
        <span className="step-no">Step 02</span><h2>What are you actually seeing?</h2>
        <p className="hint">These categories come from live GT Anywhere cases, not a textbook.</p>
        <Checks items={DOMAINS} sel={domains} toggle={mk(domains, setDomains)} />
        <label className="f">Describe it in specifics <span className="req">*</span></label>
        <textarea required value={f.observation} onChange={(e2) => set('observation', e2.target.value)}
          placeholder='Behaviour, not conclusion. "She could not type her answer and had never used speech-to-text, so I typed while she dictated." Not: "she is dyslexic."' />
        <label className="f">Data you can point to (TimeBack, MAP, placement)</label>
        <textarea value={f.objective_data} onChange={(e2) => set('objective_data', e2.target.value)} />
        <label className="f">Strengths, what is this child unusually good at? <span className="req">*</span></label>
        <textarea required value={f.strength} onChange={(e2) => set('strength', e2.target.value)}
          placeholder="Required. A case without a documented strength is an intervention file, not a 2e file." />
      </div>

      <div className="card">
        <span className="step-no">Step 03</span><h2>Rule out the ordinary explanation first</h2>
        <p className="hint">A cross-country move once looked exactly like an attention problem. Check only what you have confirmed.</p>
        <Checks items={RULEOUTS} sel={ruleouts} toggle={mk(ruleouts, setRuleouts)} />
        <label className="f">Anything relevant in the home or life context?</label>
        <textarea value={f.home_context} onChange={(e2) => set('home_context', e2.target.value)} />
      </div>

      <div className="card">
        <span className="step-no">Step 04</span><h2>Documentation status</h2>
        <p className="hint">This single field changes what GT may say, what we may act on, and who touches the case next.</p>
        <label className="f">Where does this student stand? <span className="req">*</span></label>
        <select required value={f.doc_status} onChange={(e2) => set('doc_status', e2.target.value)}>
          <option value="">Select…</option>
          {DOC_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <div className="grid2">
          <div><label className="f">Named accommodations already known</label>
            <input type="text" value={f.known_accommodations} onChange={(e2) => set('known_accommodations', e2.target.value)} /></div>
          <div><label className="f">Prior schooling / setting</label>
            <input type="text" value={f.prior_setting} onChange={(e2) => set('prior_setting', e2.target.value)} /></div>
        </div>
      </div>

      <div className="card">
        <span className="step-no">Step 05</span><h2>What has already been tried</h2>
        <p className="hint">Support tried and documented is what makes a later fit conversation defensible instead of abrupt.</p>
        <Checks items={TRIED} sel={tried} toggle={mk(tried, setTried)} />
        <label className="f">What happened when you tried it?</label>
        <textarea value={f.tried_note} onChange={(e2) => set('tried_note', e2.target.value)} />
        <label className="f">Your gut read, support need or fit question? <span className="req">*</span></label>
        <select required value={f.advisor_read} onChange={(e2) => set('advisor_read', e2.target.value)}>
          <option value="">Select…</option>
          <option value="support">Support need. With the right accommodation this child thrives here.</option>
          <option value="unsure">Not sure yet. I need more information.</option>
          <option value="fit">Real fit question. I am not confident we can serve this child well.</option>
          <option value="parent_fit">The family is asking the fit question themselves.</option>
        </select>
      </div>

      {e && <div className="note stop">{e}</div>}
      <div className="row" style={{ marginBottom: 30 }}>
        <button className="btn gold" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Generate pathway & next steps'}</button>
      </div>
    </form>
  );
}

function CaseFile({ c, reload, back }: { c: any; reload: () => void; back: () => void }) {
  const [steps, setSteps] = useState<any[]>([]);
  const [notes, setNotes] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const pull = useCallback(async () => {
    if (!c) return;
    const s = await supabase.from('case_steps').select('*').eq('case_id', c.id).order('created_at');
    const n = await supabase.from('case_notes').select('*').eq('case_id', c.id).order('created_at', { ascending: false });
    setSteps(s.data ?? []); setNotes(n.data ?? []);
  }, [c]);

  useEffect(() => { pull(); }, [pull]);

  if (!c) return <div className="card"><div className="empty">Case not found.</div></div>;

  const plan = buildPlan(c);
  const st = STAGES.find((s) => s.k === c.stage) ?? STAGES[0];
  const actor = c.assigned_aa || c.raised_by;
  const fitBlocked = !['live', 'ef', 'placement', 'family'].some((t) => (c.tried || []).includes(t));

  async function move(to: string) {
    setBusy(true);
    const target = STAGES.find((s) => s.k === to)!;
    await supabase.from('cases').update({ stage: to }).eq('id', c.id);
    await supabase.from('stage_transitions').insert({ case_id: c.id, from_stage: c.stage, to_stage: to, actor_name: actor });
    await supabase.from('case_notes').insert({ case_id: c.id, author_name: actor, body: `Stage moved to ${target.n} ${target.t}.` });
    setBusy(false); await reload(); await pull();
  }
  async function addNote() {
    if (!text.trim()) return;
    setBusy(true);
    await supabase.from('case_notes').insert({ case_id: c.id, author_name: actor, body: text.trim() });
    setText(''); setBusy(false); await pull();
  }

  return (
    <>
      <div className="card">
        <span className="step-no">Case file</span>
        <h2>{c.student_name} <span className="mono" style={{ fontSize: 13, color: '#5b6a72' }}>{c.ref}</span></h2>
        <div className="row" style={{ marginTop: 8 }}>
          <span className={'pill ' + (c.stage === 'fit' ? 'stop' : 'navy')}>{st.n} {st.t}</span>
          <span className={'pill ' + (DOCS_KNOWN.includes(c.doc_status) ? 'ok' : 'warn')}>{DOC_LABEL[c.doc_status]}</span>
          <span className="pill grey">{c.grade_band}</span>
        </div>

        <h3 className="sec">Where this sits</h3>
        <dl className="kv">
          <dt>Raised by</dt><dd>{c.raised_by}{c.raised_by_role ? ` — ${c.raised_by_role}` : ''}</dd>
          <dt>Observed</dt><dd>{c.observed_on}</dd>
          <dt>Domains</dt><dd>{(c.domains || []).map((d: string) => DOMAIN_LABEL[d] ?? d).join(' · ')}</dd>
          <dt>Strength on record</dt><dd>{c.strength}</dd>
          <dt>Observation</dt><dd>{c.observation}</dd>
          {c.objective_data && <><dt>Data</dt><dd>{c.objective_data}</dd></>}
          {c.home_context && <><dt>Home context</dt><dd>{c.home_context}</dd></>}
          {c.tried_note && <><dt>Tried so far</dt><dd>{c.tried_note}</dd></>}
        </dl>

        {plan.flags.length > 0 && (
          <div className="note stop"><b>Blocking flags</b>
            <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{plan.flags.map((x) => <li key={x}>{x}</li>)}</ul>
          </div>
        )}

        <h3 className="sec">Next steps</h3>
        <ol className="steps">
          {steps.map((s) => (
            <li key={s.id} className={s.severity === 'normal' ? '' : s.severity}>
              <b>{s.title}</b>
              <div className="meta">
                <span className={'pill ' + (s.severity === 'urgent' ? 'stop' : s.severity === 'gate' ? 'warn' : 'gold')}>{s.owner_label}</span>
                <span className="mono" style={{ fontSize: 12, color: '#5b6a72' }}>due {s.due_on}</span>
                {s.severity === 'gate' && <span className="pill warn">Gate, do this before escalating</span>}
              </div>
              {s.rationale && <div className="why">{s.rationale}</div>}
            </li>
          ))}
        </ol>

        {plan.gaps.length > 0 && (
          <><h3 className="sec">Evidence gaps to close</h3>
            <ul style={{ fontSize: 13.5, color: '#3c4a52', margin: 0, paddingLeft: 20 }}>{plan.gaps.map((g) => <li key={g}>{g}</li>)}</ul></>
        )}

        {plan.fit && (
          <><h3 className="sec" style={{ color: 'var(--stop)' }}>Fit Review track</h3>
            <div className={'note ' + (plan.fit.block ? 'stop' : '')}>
              <b>{plan.fit.block ? 'Not eligible to open' : 'Eligible to open'}</b><br />{plan.fit.why}
              {plan.fit.block && <><br /><br /><b>{plan.fit.block}</b></>}
            </div></>
        )}
      </div>

      <div className="card">
        <h2>Move this case</h2>
        <p className="hint">Advancing a stage writes a dated entry that cannot be edited or deleted. Fit Review opens only when supports have been tried.</p>
        <div className="row">
          {STAGES.map((s) => (
            <button key={s.k} className={'btn sm ' + (s.k === c.stage ? '' : 'ghost')}
              disabled={busy || (s.k === 'fit' && fitBlocked)}
              title={s.k === 'fit' && fitBlocked ? 'No documented support tried yet' : ''}
              onClick={() => move(s.k)}>{s.n} {s.t}</button>
          ))}
        </div>
        <label className="f">Add a dated note</label>
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="What happened, what you tried, what the family said." />
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn sm" onClick={addNote} disabled={busy || !text.trim()}>Add note</button>
          <button className="btn ghost sm" onClick={back}>Back to caseboard</button>
        </div>
        {notes.length > 0 && (
          <><h3 className="sec">History</h3>
            <div className="log">
              {notes.map((n) => (
                <div className="e" key={n.id}>
                  <div className="d">{String(n.created_at).slice(0, 10)} · {n.author_name}</div>{n.body}
                </div>
              ))}
            </div></>
        )}
      </div>
    </>
  );
}
