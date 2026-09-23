import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Loader2, CheckCircle2, AlertTriangle, ChevronDown } from 'lucide-react';
import ConsentCheckbox from '../Consent/ConsentCheckbox';
import CountryField from '../FormBuilder/fields/CountryField';
import {
  isAnswered,
  isFieldVisible,
  type CompletenessField,
} from '../../supabase/functions/_shared/registrationCompleteness';
import {
  CompletionError,
  resolveCompletion,
  submitCompletion,
  type ResolvedCompletion,
} from '../../services/registrationCompletion';
import { CURRENT_SITE } from '../../config/sites';

// "Complete your registration" — /#/complete?token=…
//
// The person is ALREADY registered and ticketed. They came in through a door
// that asked fewer questions than our form (the TSCS India page, an admin comp),
// so this page asks only what is still missing — nothing they have answered,
// never their email, never anything that set the price. Same trust model as
// /tickets and /pay: the signed token is the credential.
//
// What is shown and what is required come from the SAME rules the server
// enforces (_shared/registrationCompleteness.ts). A required question the page
// cannot see is how the 2026-07-29 BOGO claim link stranded guests; sharing the
// rule is what stops that happening here.

type State =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; data: ResolvedCompletion }
  | { kind: 'done'; data: ResolvedCompletion };

export const CompleteRegistrationPage: React.FC = () => {
  const location = useLocation();
  // HashRouter: the query lives in the router's location, never window.location.
  const token = useMemo(() => new URLSearchParams(location.search).get('token') ?? '', [location.search]);

  const [state, setState] = useState<State>({ kind: 'loading' });
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<{ message: string; fieldId?: string } | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  const fieldRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token) {
        setState({ kind: 'error', message: 'This link is incomplete. Please use the link from your email.' });
        return;
      }
      try {
        const data = await resolveCompletion(token);
        if (!cancelled) setState(data.complete ? { kind: 'done', data } : { kind: 'ready', data });
      } catch (e) {
        if (!cancelled) setState({ kind: 'error', message: (e as Error).message });
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const data = state.kind === 'ready' || state.kind === 'done' ? state.data : null;
  const merged = useMemo(() => ({ ...(data?.answers ?? {}), ...draft }), [data, draft]);

  // Which questions to show. The server's outstanding list is the base; a
  // conditional question that was hidden when the page loaded and is revealed
  // by an answer given here appears in place, exactly as on the full form.
  // Optional questions answered-blank on a previous visit are not re-asked.
  const shown = useMemo(() => {
    if (!data) return [] as CompletenessField[];
    const outstanding = new Set(data.outstandingIds);
    return data.fields.filter(f => {
      if (!isFieldVisible(f, merged)) return false;
      if (outstanding.has(f.id)) return true;
      const revealedHere = !isFieldVisible(f, data.answers) && !isAnswered(f, data.answers[f.id]);
      return revealedHere;
    });
  }, [data, merged]);

  const questions = shown.filter(f => f.type !== 'boolean');
  const consents = shown.filter(f => f.type === 'boolean');

  const setValue = (id: string, value: unknown) => {
    setDraft(d => ({ ...d, [id]: value }));
    if (formError?.fieldId === id) setFormError(null);
  };

  const focusField = (id?: string) => {
    if (!id) return;
    fieldRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!data) return;
    // Mirror the server's rule so the common mistake is caught without a round
    // trip; the server re-checks everything regardless.
    const missing = shown.find(f => f.required && !isAnswered(f, merged[f.id]));
    if (missing) {
      const message = missing.type === 'boolean'
        ? 'Please confirm each agreement below before saving.'
        : `Please answer "${missing.label}".`;
      setFormError({ message, fieldId: missing.id });
      focusField(missing.id);
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      // Only the questions this page asked — the server ignores anything else.
      const answers = Object.fromEntries(shown.map(f => [f.id, merged[f.id] ?? (f.type === 'checkbox' ? [] : f.type === 'boolean' ? false : '')]));
      await submitCompletion(token, answers);
      setState({ kind: 'done', data });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      const e2 = err as CompletionError;
      setFormError({ message: e2.message, fieldId: e2.fieldId });
      focusField(e2.fieldId);
    } finally {
      setSubmitting(false);
    }
  };

  const label = (f: CompletenessField) => (
    <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
      {f.label} {f.required && <span className="text-red-600">*</span>}
    </label>
  );

  const renderInput = (f: CompletenessField) => {
    const value = merged[f.id];
    const invalid = formError?.fieldId === f.id;
    const ring = invalid ? 'border-red-400 ring-2 ring-red-200' : 'border-gray-300 focus:ring-2 focus:ring-gansid-primary/30';
    switch (f.type) {
      case 'textarea':
        return (<>{label(f)}<textarea rows={3} value={(value as string) ?? ''} placeholder={f.placeholder}
          onChange={e => setValue(f.id, e.target.value)} className={`w-full px-3 py-2 rounded-lg border text-sm outline-none ${ring}`} /></>);
      case 'select':
        return (<>{label(f)}<select value={(value as string) ?? ''} onChange={e => setValue(f.id, e.target.value)}
          className={`w-full px-3 py-2 rounded-lg border text-sm bg-white outline-none ${ring}`}>
          <option value="">Select an option</option>
          {f.options?.map(o => <option key={o} value={o}>{o}</option>)}
        </select></>);
      case 'radio':
        return (<>{label(f)}
          {f.placeholder && <p className="text-sm text-gray-500 mb-2">{f.placeholder}</p>}
          <div role="radiogroup" aria-label={f.label} className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {f.options?.map(o => (
              <label key={o} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer ${value === o ? 'border-gansid-primary bg-gansid-primary/5 font-medium' : 'border-gray-300 hover:border-gray-400'}`}>
                <input type="radio" name={f.id} checked={value === o} onChange={() => setValue(f.id, o)} />
                {o}
              </label>
            ))}
          </div></>);
      case 'checkbox': {
        const selected = Array.isArray(value) ? (value as string[]) : [];
        return (<>{label(f)}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {f.options?.map(o => (
              <label key={o} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer ${selected.includes(o) ? 'border-gansid-primary bg-gansid-primary/5 font-medium' : 'border-gray-300 hover:border-gray-400'}`}>
                <input type="checkbox" checked={selected.includes(o)}
                  onChange={e => setValue(f.id, e.target.checked ? [...selected, o] : selected.filter(v => v !== o))} />
                {o}
              </label>
            ))}
          </div></>);
      }
      case 'country':
        return <CountryField label={f.label} required={f.required} value={(value as string) ?? ''} onChange={code => setValue(f.id, code)} />;
      default:
        return (<>{label(f)}<input type={f.type === 'phone' ? 'tel' : f.type === 'number' ? 'number' : 'text'}
          value={(value as string) ?? ''} placeholder={f.placeholder} onChange={e => setValue(f.id, e.target.value)}
          className={`w-full px-3 py-2 rounded-lg border text-sm outline-none ${ring}`} /></>);
    }
  };

  const renderConsent = (f: CompletenessField) => {
    const checked = merged[f.id] === true;
    if (f.consentModal && f.linkText) {
      return (
        <ConsentCheckbox id={`consent-${f.id}`} label={f.label.replace(f.linkText, '').trim()} linkText={f.linkText}
          modalTitle={f.consentModal.title} modalUrl={f.consentModal.url} checked={checked}
          onChange={v => setValue(f.id, v)} required={f.required} />
      );
    }
    return (
      <label className="flex items-start gap-2 text-sm text-slate-700 cursor-pointer">
        <input type="checkbox" className="mt-0.5" checked={checked} onChange={e => setValue(f.id, e.target.checked)} />
        <span>{f.label}{f.required && <span className="text-red-600"> *</span>}</span>
      </label>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-start sm:items-center justify-center p-4 py-8">
      <div className="w-full max-w-xl bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
        <div className="bg-gansid-primary-gradient px-6 py-5">
          <h1 className="text-white font-semibold text-lg">{data?.eventName ?? 'Complete your registration'}</h1>
          <p className="text-white/85 text-sm mt-0.5">
            {state.kind === 'done' ? 'Registration complete' : 'Complete your registration'}
          </p>
        </div>

        <div className="p-6">
          {state.kind === 'loading' && (
            <div className="py-10 text-center text-gray-500" role="status" aria-live="polite">
              <Loader2 className="h-6 w-6 animate-spin inline" />
              <span className="sr-only">Loading your registration…</span>
            </div>
          )}

          {state.kind === 'error' && (
            <div className="py-6 text-center">
              <AlertTriangle className="h-8 w-8 text-amber-500 mx-auto mb-3" />
              <p className="text-sm text-gray-700">{state.message}</p>
            </div>
          )}

          {state.kind === 'done' && (
            <div className="py-6 text-center" role="status" aria-live="polite">
              <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto mb-3" />
              <p className="text-base font-semibold text-gray-800">Thank you, {state.data.attendee.firstName} — you're all set.</p>
              <p className="text-sm text-gray-600 mt-2">
                Your registration for {state.data.eventName} is complete. Nothing else is needed from you, and your
                ticket is unchanged.
              </p>
              {CURRENT_SITE.portalEnabled && (
                <a href="#/portal/tickets" className="inline-block mt-5 px-5 py-2.5 rounded-full bg-gansid-primary text-white text-sm font-semibold hover:opacity-90">
                  View my ticket
                </a>
              )}
            </div>
          )}

          {state.kind === 'ready' && (
            <form onSubmit={onSubmit} noValidate>
              <p className="text-sm text-gray-700">
                Hello {state.data.attendee.firstName}, you're registered for <strong>{state.data.eventName}</strong>.
                There {shown.length === 1 ? 'is one thing' : 'are a few things'} we still need from you — it takes about two minutes.
              </p>
              <p className="text-xs text-gray-500 mt-1">Registered as {state.data.attendee.email}. Fields marked * are required.</p>

              {/* One column on purpose: this is a handful of questions, not a
                  full form, and half-width inputs with nothing beside them
                  read as unfinished. */}
              {questions.length > 0 && (
                <div className="mt-6 space-y-4">
                  {questions.map(f => (
                    <div key={f.id} ref={el => { fieldRefs.current[f.id] = el; }}>
                      {renderInput(f)}
                    </div>
                  ))}
                </div>
              )}

              {consents.length > 0 && (
                <fieldset className="mt-6 rounded-xl border border-gray-200 bg-gray-50/60 p-4 space-y-3">
                  <legend className="px-1 text-sm font-semibold text-gray-800">Your agreement</legend>
                  <p className="text-xs text-gray-500 -mt-1">
                    Everyone attending gives us these. Where there is a document, please open it before accepting.
                  </p>
                  {consents.map(f => (
                    <div key={f.id} ref={el => { fieldRefs.current[f.id] = el; }}
                      className={formError?.fieldId === f.id ? 'rounded-lg ring-2 ring-red-200 p-1 -m-1' : ''}>
                      {renderConsent(f)}
                    </div>
                  ))}
                </fieldset>
              )}

              {formError && (
                <p className="mt-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2" role="alert">
                  {formError.message}
                </p>
              )}

              <button type="submit" disabled={submitting}
                className="mt-6 w-full py-3 rounded-full bg-gansid-primary text-white font-semibold hover:opacity-90 disabled:opacity-60 inline-flex items-center justify-center gap-2">
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {submitting ? 'Saving…' : 'Save my details'}
              </button>

              {state.data.summary.length > 0 && (
                <div className="mt-6 border-t border-gray-100 pt-4">
                  <button type="button" onClick={() => setShowSummary(v => !v)} aria-expanded={showSummary}
                    className="w-full flex items-center justify-between text-sm font-medium text-gray-700">
                    What we already have
                    <ChevronDown className={`h-4 w-4 transition-transform ${showSummary ? 'rotate-180' : ''}`} />
                  </button>
                  {showSummary && (
                    <>
                      <dl className="mt-3 grid grid-cols-1 sm:grid-cols-[auto,1fr] gap-x-4 gap-y-1.5 text-sm">
                        {state.data.summary.map(s => (
                          <React.Fragment key={s.label}>
                            <dt className="text-gray-500">{s.label}</dt>
                            <dd className="text-gray-800 break-words">{s.value}</dd>
                          </React.Fragment>
                        ))}
                      </dl>
                      <p className="mt-3 text-xs text-gray-500">
                        Something wrong here? Reply to the email you received and we will correct it.
                      </p>
                    </>
                  )}
                </div>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default CompleteRegistrationPage;
