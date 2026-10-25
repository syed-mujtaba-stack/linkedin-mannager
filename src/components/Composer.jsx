import { ArrowUp, LoaderCircle, Sparkles, Square } from 'lucide-react';
import { useEffect, useRef } from 'react';
import AgentIcon from './AgentIcon.jsx';

export default function Composer({
  value,
  onChange,
  onSubmit,
  onStop,
  agent,
  streaming,
  disabled,
  onAgentClick,
  placeholder,
  textareaRef: externalTextareaRef,
}) {
  const localTextareaRef = useRef(null);
  const textareaRef = externalTextareaRef || localTextareaRef;

  useEffect(() => {
    const field = textareaRef.current;
    if (!field) return;
    field.style.height = 'auto';
    field.style.height = `${Math.min(field.scrollHeight, 180)}px`;
  }, [value]);

  function handleKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (!streaming && !disabled) onSubmit();
    }
  }

  return (
    <form
      onSubmit={(event) => { event.preventDefault(); if (!streaming && !disabled) onSubmit(); }}
      className="composer-shell mx-auto w-full max-w-[860px]"
    >
      <div className="rounded-[24px] border border-slate-200/80 bg-white p-2 shadow-[0_12px_42px_rgba(42,40,87,.09)] transition focus-within:border-violet-300 focus-within:shadow-[0_16px_48px_rgba(94,81,200,.13)]">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          maxLength={12000}
          placeholder={placeholder || `Message ${agent?.name || 'your agent'}…`}
          className="block max-h-[180px] min-h-[48px] w-full resize-none bg-transparent px-3.5 py-3 text-[14px] leading-6 text-slate-700 outline-none placeholder:text-slate-400 sm:px-4"
          aria-label="Write a message"
        />
        <div className="flex items-center justify-between gap-2 px-1.5 pb-1">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={onAgentClick}
              className="inline-flex max-w-[210px] items-center gap-2 rounded-xl px-2 py-1.5 text-left transition hover:bg-slate-50"
              title="Choose an agent"
            >
              <AgentIcon agent={agent} size="sm" className="h-7 w-7 rounded-[10px] [&_svg]:h-3.5 [&_svg]:w-3.5" />
              <span className="truncate text-[11px] font-semibold text-slate-600">{agent?.name || 'Choose an agent'}</span>
              <Sparkles className="h-3 w-3 shrink-0 text-slate-400" />
            </button>
            <span className="hidden h-4 w-px bg-slate-200 sm:block" />
            <span className="hidden items-center gap-1.5 text-[10px] text-slate-400 sm:inline-flex">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Streaming ready
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden text-[10px] text-slate-300 sm:inline">Shift + Enter for a new line</span>
            <button
              type={streaming ? 'button' : 'submit'}
              onClick={streaming ? onStop : undefined}
              disabled={!streaming && (disabled || !value.trim())}
              className={`inline-flex h-10 w-10 items-center justify-center rounded-[14px] transition ${streaming ? 'bg-slate-900 text-white hover:bg-slate-700' : 'bg-[#6c5ce7] text-white shadow-[0_5px_14px_rgba(108,92,231,.3)] hover:-translate-y-0.5 hover:bg-[#5948d5] disabled:translate-y-0 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none'}`}
              aria-label={streaming ? 'Stop generating' : 'Send message'}
              title={streaming ? 'Stop generation' : 'Send message'}
            >
              {streaming ? <Square className="h-3.5 w-3.5 fill-current" /> : disabled ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-[18px] w-[18px]" strokeWidth={2.4} />}
            </button>
          </div>
        </div>
      </div>
      <p className="mt-2.5 text-center text-[10px] tracking-[.01em] text-slate-400">
        AI can make mistakes. Check important information before you act.
      </p>
    </form>
  );
}
