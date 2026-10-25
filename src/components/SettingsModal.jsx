import { Check, Copy, ExternalLink, KeyRound, X } from 'lucide-react';
import { useState } from 'react';

export default function SettingsModal({ health, onClose }) {
  const [copied, setCopied] = useState(false);
  const command = 'OPENROUTER_API_KEY=your_key_here';

  async function copySetup() {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/30 p-4 backdrop-blur-[3px]" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="w-full max-w-[480px] rounded-[24px] border border-white/80 bg-white p-6 shadow-[0_24px_80px_rgba(22,23,49,.22)] sm:p-7" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-violet-50 text-violet-700"><KeyRound className="h-5 w-5" /></span>
            <div>
              <h2 id="settings-title" className="text-[16px] font-bold tracking-[-.03em] text-slate-800">Workspace settings</h2>
              <p className="mt-1 text-[11px] text-slate-400">Connection status and setup</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100" aria-label="Close settings"><X className="h-4 w-4" /></button>
        </div>

        <div className="mt-6 space-y-3">
          <div className="flex items-center justify-between rounded-[14px] border border-slate-100 bg-slate-50/70 px-4 py-3">
            <div><p className="text-[11px] font-semibold text-slate-700">OpenRouter</p><p className="mt-1 text-[10px] text-slate-400">{health?.model || 'Model status unavailable'}</p></div>
            <span className={`rounded-full px-2.5 py-1 text-[9px] font-bold ${health?.openrouter_configured ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{health?.openrouter_configured ? 'CONNECTED' : 'NEEDS KEY'}</span>
          </div>
          <div className="flex items-center justify-between rounded-[14px] border border-slate-100 bg-slate-50/70 px-4 py-3">
            <div><p className="text-[11px] font-semibold text-slate-700">Chat history</p><p className="mt-1 text-[10px] text-slate-400">{health?.database === 'supabase' ? 'Supabase Postgres' : 'Local SQLite fallback'}</p></div>
            <span className="rounded-full bg-slate-200/70 px-2.5 py-1 text-[9px] font-bold text-slate-600">{health?.database?.toUpperCase() || 'OFFLINE'}</span>
          </div>
        </div>

        {!health?.openrouter_configured && (
          <div className="mt-5 rounded-[16px] border border-amber-200/80 bg-amber-50/70 p-4">
            <p className="text-[11px] font-bold text-amber-900">Connect a free OpenRouter model</p>
            <ol className="mt-2.5 list-decimal space-y-1.5 pl-4 text-[10.5px] leading-5 text-amber-900/80">
              <li>Create an API key at <a className="inline-flex items-center gap-1 font-semibold underline underline-offset-2" href="https://openrouter.ai/keys" target="_blank" rel="noreferrer">openrouter.ai/keys <ExternalLink className="h-2.5 w-2.5" /></a>.</li>
              <li>Add it to the root <code className="rounded bg-white/80 px-1 py-0.5">.env</code> file and restart FastAPI.</li>
            </ol>
            <button onClick={copySetup} className="mt-3 flex w-full items-center justify-between rounded-lg border border-amber-200 bg-white px-3 py-2 text-left font-mono text-[10px] text-slate-600">
              <span>{command}</span>{copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5 text-slate-400" />}
            </button>
          </div>
        )}

        {health?.database !== 'supabase' && (
          <div className="mt-4 rounded-[14px] border border-slate-100 p-4">
            <p className="text-[11px] font-bold text-slate-700">Use Supabase for persistent chat history</p>
            <p className="mt-1.5 text-[10px] leading-5 text-slate-500">Set <code className="rounded bg-slate-100 px-1 py-0.5">SUPABASE_URL</code> and <code className="rounded bg-slate-100 px-1 py-0.5">SUPABASE_SERVICE_ROLE_KEY</code> in <code className="rounded bg-slate-100 px-1 py-0.5">.env</code>, then apply <code className="rounded bg-slate-100 px-1 py-0.5">backend/migrations/001_init.sql</code>. Keep the service key on the server only.</p>
          </div>
        )}

        <button onClick={onClose} className="mt-5 w-full rounded-[13px] bg-slate-900 px-4 py-3 text-[11px] font-semibold text-white transition hover:bg-slate-800">Done</button>
      </section>
    </div>
  );
}
