import {
  Bot,
  ChevronDown,
  CircleHelp,
  Clock3,
  MessageSquareText,
  Plus,
  Settings2,
  Trash2,
  X,
} from 'lucide-react';
import AgentIcon from './AgentIcon.jsx';

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const withinWeek = now - date < 7 * 24 * 60 * 60 * 1000;
  return withinWeek ? date.toLocaleDateString([], { weekday: 'short' }) : date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export default function Sidebar({
  agents,
  conversations,
  activeConversationId,
  selectedAgentId,
  health,
  mobileOpen,
  onClose,
  onNewChat,
  onChooseAgent,
  onChooseConversation,
  onDeleteConversation,
  onSettings,
}) {
  const statusLabel = health?.openrouter_configured ? 'AI ready' : health ? 'Add API key' : 'Connecting';
  return (
    <>
      {mobileOpen && <button aria-label="Close menu" onClick={onClose} className="fixed inset-0 z-30 bg-slate-950/25 backdrop-blur-[2px] lg:hidden" />}
      <aside className={`sidebar fixed inset-y-0 left-0 z-40 flex w-[282px] flex-col border-r border-slate-200/80 bg-white/95 transition-transform duration-300 lg:static lg:z-auto lg:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex h-[72px] items-center justify-between border-b border-slate-100 px-5">
          <button onClick={onNewChat} className="flex items-center gap-3 rounded-xl text-left" aria-label="Go to Nexus home">
            <span className="brand-mark flex h-9 w-9 items-center justify-center rounded-[13px] text-white shadow-[0_7px_16px_rgba(108,92,231,.25)]">
              <Bot className="h-[19px] w-[19px]" strokeWidth={1.9} />
            </span>
            <span>
              <span className="block text-[15px] font-bold tracking-[-.045em] text-slate-800">nexus<span className="text-violet-600">.</span></span>
              <span className="mt-0.5 block text-[8px] font-semibold tracking-[.18em] text-slate-400">AGENT STUDIO</span>
            </span>
          </button>
          <button onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 lg:hidden" aria-label="Close sidebar"><X className="h-4 w-4" /></button>
        </div>

        <div className="px-4 pt-5">
          <button
            onClick={onNewChat}
            className="flex h-11 w-full items-center justify-between rounded-[14px] bg-slate-900 px-3.5 text-left text-[12px] font-semibold text-white shadow-[0_5px_14px_rgba(20,24,44,.12)] transition hover:bg-slate-800"
          >
            <span className="flex items-center gap-2.5"><Plus className="h-4 w-4" strokeWidth={2.2} /> New conversation</span>
            <span className="rounded-md border border-white/15 px-1.5 py-0.5 text-[9px] font-medium text-white/60">⌘ K</span>
          </button>
        </div>

        <div className="px-4 pt-7">
          <div className="mb-2 flex items-center justify-between px-2">
            <p className="section-eyebrow">Your agents</p>
            <ChevronDown className="h-3.5 w-3.5 text-slate-300" />
          </div>
          <div className="space-y-1">
            {agents.map((agent) => (
              <button
                key={agent.id}
                onClick={() => onChooseAgent(agent.id)}
                className={`flex w-full items-center gap-2.5 rounded-[13px] px-2.5 py-2 text-left transition ${selectedAgentId === agent.id ? 'bg-[#f2f0ff] text-violet-800' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                <AgentIcon agent={agent} size="sm" className="h-8 w-8 rounded-[11px]" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11.5px] font-semibold">{agent.name}</span>
                  <span className="mt-0.5 block truncate text-[9.5px] text-slate-400">{agent.tagline}</span>
                </span>
                {selectedAgentId === agent.id && <span className="h-1.5 w-1.5 rounded-full bg-violet-500" />}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-7 flex min-h-0 flex-1 flex-col px-4">
          <div className="mb-2 flex items-center justify-between px-2">
            <p className="section-eyebrow">Recent conversations</p>
            <span className="text-[9px] font-medium text-slate-300">{conversations.length || ''}</span>
          </div>
          <div className="sidebar-scroll min-h-0 flex-1 space-y-1 overflow-y-auto pb-4">
            {conversations.length ? conversations.map((conversation) => {
              const conversationAgent = agents.find((item) => item.id === conversation.agent_id);
              const active = activeConversationId === conversation.id;
              return (
                <div key={conversation.id} className={`group flex items-center rounded-[12px] transition ${active ? 'bg-slate-100/90' : 'hover:bg-slate-50'}`}>
                  <button
                    onClick={() => onChooseConversation(conversation.id)}
                    className="flex min-w-0 flex-1 items-center gap-2.5 px-2.5 py-2.5 text-left"
                  >
                    <MessageSquareText className={`h-3.5 w-3.5 shrink-0 ${active ? 'text-violet-500' : 'text-slate-300'}`} />
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-[11px] ${active ? 'font-semibold text-slate-700' : 'font-medium text-slate-500'}`}>{conversation.title || 'New chat'}</span>
                      <span className="mt-1 flex items-center gap-1 text-[9px] text-slate-400">
                        <span className="truncate">{conversationAgent?.name || 'Agent'}</span>
                        <span>·</span>
                        <span className="shrink-0">{formatDate(conversation.updated_at)}</span>
                      </span>
                    </span>
                  </button>
                  <button
                    onClick={(event) => { event.stopPropagation(); onDeleteConversation(conversation.id); }}
                    className="mr-1 rounded-lg p-1.5 text-slate-300 opacity-0 transition hover:bg-white hover:text-rose-500 group-hover:opacity-100 focus:opacity-100"
                    title="Delete conversation"
                    aria-label={`Delete ${conversation.title || 'conversation'}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            }) : (
              <div className="mx-2 rounded-xl border border-dashed border-slate-200 px-3 py-4 text-center">
                <Clock3 className="mx-auto h-4 w-4 text-slate-300" />
                <p className="mt-2 text-[10px] font-medium text-slate-400">Your chats will appear here</p>
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-slate-100 p-3.5">
          <div className={`mb-2 flex items-center gap-2 rounded-xl px-2.5 py-2 ${health?.openrouter_configured ? 'bg-emerald-50/70' : 'bg-amber-50/70'}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${health?.openrouter_configured ? 'bg-emerald-500' : health ? 'bg-amber-500' : 'bg-slate-300 animate-pulse'}`} />
            <span className={`text-[10px] font-semibold ${health?.openrouter_configured ? 'text-emerald-700' : 'text-amber-700'}`}>{statusLabel}</span>
            <span className="ml-auto truncate text-[9px] text-slate-400">{health?.database ? health.database.toUpperCase() : 'API'}</span>
          </div>
          <div className="flex items-center justify-between px-1">
            <button onClick={onSettings} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[10px] font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-700">
              <Settings2 className="h-3.5 w-3.5" /> Settings
            </button>
            <button onClick={onSettings} className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-medium text-slate-400 transition hover:bg-slate-100 hover:text-slate-600" title="Setup help">
              <CircleHelp className="h-3.5 w-3.5" /> Help
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
