import { Check, Copy, Sparkles } from 'lucide-react';
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import AgentIcon from './AgentIcon.jsx';

export default function Message({ message, agent, streaming = false }) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';

  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(message.content || '');
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  }

  return (
    <article className={`group flex gap-3.5 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {!isUser && (
        <AgentIcon agent={agent} size="sm" className="mt-0.5 bg-white ring-slate-200/80 shadow-sm" />
      )}

      <div className={`min-w-0 ${isUser ? 'max-w-[82%] sm:max-w-[76%]' : 'max-w-[86%] flex-1 sm:max-w-[78%]'}`}>
        {!isUser && (
          <div className="mb-1.5 flex items-center gap-2 px-0.5">
            <span className="text-[12px] font-semibold text-slate-700">{agent?.name || 'Nexus agent'}</span>
            {streaming && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-violet-500" />}
          </div>
        )}
        <div
          className={[
            'message-content relative rounded-[20px] px-4 py-3.5 sm:px-[18px] sm:py-4',
            isUser
              ? 'rounded-tr-md bg-[#eeecff] text-[#25243d] shadow-[0_4px_18px_rgba(74,64,156,.055)]'
              : message.isError
                ? 'border border-rose-200 bg-rose-50/80 text-rose-800'
                : 'rounded-tl-md bg-white text-slate-700 shadow-[0_4px_20px_rgba(40,42,82,.045)] ring-1 ring-slate-200/60',
          ].join(' ')}
        >
          {message.content ? (
            <div className={`prose prose-sm max-w-none break-words leading-[1.75] ${isUser ? 'prose-p:text-[#25243d]' : 'prose-slate'}`}>
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  a: ({ href, children, ...props }) => (
                    <a href={href} target="_blank" rel="noreferrer" {...props}>{children}</a>
                  ),
                }}
              >
                {message.content}
              </ReactMarkdown>
            </div>
          ) : streaming ? (
            <div className="flex items-center gap-2 py-1 text-[13px] text-slate-400">
              <Sparkles className="h-4 w-4 animate-pulse text-violet-400" />
              Finding a good answer
            </div>
          ) : null}
          {streaming && message.content && <span className="stream-caret" aria-label="Generating" />}
        </div>

        {!!message.toolEvents?.length && (
          <div className="mt-2 flex flex-wrap gap-1.5 px-0.5">
            {message.toolEvents.map((item, index) => (
              <span
                key={`${item.tool_name}-${index}`}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium ${item.status === 'running' ? 'border-violet-200 bg-violet-50 text-violet-700' : 'border-slate-200 bg-white/80 text-slate-500'}`}
                title={item.summary || item.tool_label}
              >
                {item.status === 'running' ? (
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-violet-500" />
                ) : (
                  <Check className="h-3 w-3" />
                )}
                {item.tool_label}
                {item.status !== 'running' && item.summary && <span className="max-w-32 truncate opacity-70">· {item.summary}</span>}
              </span>
            ))}
          </div>
        )}

        {!isUser && message.content && !message.isError && !streaming && (
          <button
            type="button"
            onClick={copyMessage}
            className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] text-slate-400 opacity-0 transition hover:bg-white hover:text-slate-600 group-hover:opacity-100 focus:opacity-100"
            aria-label="Copy response"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        )}
      </div>
    </article>
  );
}
