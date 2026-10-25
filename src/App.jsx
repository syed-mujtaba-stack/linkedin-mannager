import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronDown,
  CircleDot,
  Command,
  Menu,
  MessageCircleMore,
  Plus,
  Sparkles,
  WandSparkles,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AgentIcon from './components/AgentIcon.jsx';
import Composer from './components/Composer.jsx';
import Message from './components/Message.jsx';
import SettingsModal from './components/SettingsModal.jsx';
import Sidebar from './components/Sidebar.jsx';
import { api, streamChat } from './lib/api.js';

const FALLBACK_AGENTS = [
  { id: 'general', name: 'General Assistant', description: 'A thoughtful all-round assistant for questions, explanations, brainstorming, and everyday problem solving.', tagline: 'A clear answer for whatever is on your mind.', icon: 'sparkles', color: 'violet', tools: ['calculator', 'current_time'] },
  { id: 'research', name: 'Research Analyst', description: 'A careful research partner for synthesizing information, comparing options, and structuring evidence-based answers.', tagline: 'Make sense of complex topics with care.', icon: 'compass', color: 'teal', tools: ['search_local_knowledge', 'calculator', 'current_time'] },
  { id: 'coding', name: 'Code Engineer', description: 'A pragmatic coding partner for implementation, debugging, architecture, and code review.', tagline: 'Ship thoughtful, maintainable code.', icon: 'code', color: 'blue', tools: ['format_json', 'calculator'] },
  { id: 'writing', name: 'Writing Partner', description: 'A versatile editor and co-writer for clear, natural, audience-aware communication.', tagline: 'Find the right words and make them land.', icon: 'pen', color: 'amber', tools: ['count_words', 'current_time'] },
  { id: 'planning', name: 'Project Planner', description: 'A practical planner for turning goals into sequenced tasks, timelines, and realistic next steps.', tagline: 'Turn big goals into doable next steps.', icon: 'list-checks', color: 'rose', tools: ['calculator', 'current_time'] },
];

const SUGGESTIONS = [
  { agent: 'planning', eyebrow: 'PLAN', prompt: 'Help me turn a big goal into a realistic plan for this week.', icon: 'list-checks' },
  { agent: 'research', eyebrow: 'EXPLORE', prompt: 'Help me compare two options and surface the trade-offs.', icon: 'compass' },
  { agent: 'coding', eyebrow: 'BUILD', prompt: 'Help me debug a problem. I will share the code and what I expected.', icon: 'code' },
];

function uid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `nexus-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function App() {
  const [agents, setAgents] = useState(FALLBACK_AGENTS);
  const [health, setHealth] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const [selectedAgentId, setSelectedAgentId] = useState('general');
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [conversationLoading, setConversationLoading] = useState(false);
  const [connectionError, setConnectionError] = useState('');
  const abortRef = useRef(null);
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);
  const agentSelectRef = useRef(null);

  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === selectedAgentId) || agents[0] || FALLBACK_AGENTS[0],
    [agents, selectedAgentId],
  );

  const refreshConversations = useCallback(async () => {
    try {
      const result = await api.conversations();
      setConversations(result);
    } catch (error) {
      setConnectionError(error.message || 'Could not load conversation history.');
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    Promise.allSettled([api.health(), api.agents(), api.conversations()]).then((results) => {
      if (!mounted) return;
      const [healthResult, agentsResult, conversationsResult] = results;
      if (healthResult.status === 'fulfilled') {
        setHealth(healthResult.value);
        setConnectionError('');
      } else {
        setConnectionError('The API is not reachable. Start the FastAPI backend to use chat history and streaming.');
      }
      if (agentsResult.status === 'fulfilled' && agentsResult.value.length) setAgents(agentsResult.value);
      if (conversationsResult.status === 'fulfilled') setConversations(conversationsResult.value);
    });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (messages.length) bottomRef.current?.scrollIntoView({ behavior: streaming ? 'smooth' : 'auto', block: 'end' });
  }, [messages, streaming]);

  useEffect(() => {
    function handleShortcut(event) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        startNewChat();
        textareaRef.current?.focus();
      }
      if (event.key === 'Escape' && mobileSidebarOpen) setMobileSidebarOpen(false);
    }
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  });

  function stopStream() {
    abortRef.current?.abort();
    abortRef.current = null;
    setStreaming(false);
  }

  function startNewChat(agentId = 'general') {
    stopStream();
    setActiveConversation(null);
    setMessages([]);
    setDraft('');
    setSelectedAgentId(agentId);
    setMobileSidebarOpen(false);
    setConnectionError((current) => current.startsWith('The API') ? current : '');
  }

  async function chooseConversation(id) {
    if (streaming) stopStream();
    setMobileSidebarOpen(false);
    setConversationLoading(true);
    try {
      const conversation = await api.conversation(id);
      setActiveConversation(conversation);
      setSelectedAgentId(conversation.agent_id);
      setMessages((conversation.messages || []).map((message) => ({ ...message, toolEvents: [] })));
      setConnectionError('');
    } catch (error) {
      setConnectionError(error.message || 'Could not open this conversation.');
    } finally {
      setConversationLoading(false);
    }
  }

  async function deleteConversation(id) {
    if (!window.confirm('Delete this conversation? This cannot be undone.')) return;
    try {
      await api.deleteConversation(id);
      if (activeConversation?.id === id) startNewChat();
      await refreshConversations();
    } catch (error) {
      setConnectionError(error.message || 'Could not delete this conversation.');
    }
  }

  function chooseAgent(agentId) {
    setSelectedAgentId(agentId);
    setMobileSidebarOpen(false);
    if (activeConversation) {
      const nextAgent = agents.find((agent) => agent.id === agentId);
      setActiveConversation((current) => current ? { ...current, agent_id: agentId } : current);
      if (nextAgent) setConnectionError('');
    }
  }

  async function sendMessage(overrideText, overrideAgentId) {
    const text = (overrideText ?? draft).trim();
    const agentId = overrideAgentId || selectedAgentId;
    if (!text || streaming || !agentId) return;

    const activeAgent = agents.find((agent) => agent.id === agentId) || FALLBACK_AGENTS[0];
    const assistantId = `stream-${uid()}`;
    const controller = new AbortController();
    abortRef.current = controller;
    let gotDone = false;
    let gotError = false;

    setConnectionError('');
    setDraft('');
    setSelectedAgentId(agentId);
    setStreaming(true);
    setMessages((current) => [
      ...current,
      { id: `user-${uid()}`, role: 'user', content: text, created_at: new Date().toISOString() },
      { id: assistantId, role: 'assistant', content: '', toolEvents: [], created_at: new Date().toISOString() },
    ]);

    try {
      await streamChat(
        {
          conversation_id: activeConversation?.id || null,
          agent_id: agentId,
          message: text,
        },
        {
          signal: controller.signal,
          onEvent: (event, data) => {
            if (event === 'meta') {
              setActiveConversation((current) => ({
                ...(current || {}),
                id: data.conversation_id,
                agent_id: data.agent_id,
                title: data.title,
                updated_at: new Date().toISOString(),
              }));
              setConnectionError('');
            } else if (event === 'token') {
              setMessages((current) => current.map((message) => (
                message.id === assistantId ? { ...message, content: message.content + (data.content || '') } : message
              )));
            } else if (event === 'tool_start') {
              setMessages((current) => current.map((message) => message.id === assistantId ? {
                ...message,
                toolEvents: [...(message.toolEvents || []), {
                  tool_name: data.tool_name,
                  tool_label: data.tool_label || data.tool_name,
                  status: 'running',
                }],
              } : message));
            } else if (event === 'tool_result') {
              setMessages((current) => current.map((message) => {
                if (message.id !== assistantId) return message;
                const events = [...(message.toolEvents || [])];
                const pending = [...events].reverse().find((item) => item.tool_name === data.tool_name && item.status === 'running');
                if (pending) {
                  const index = events.lastIndexOf(pending);
                  events[index] = { ...pending, status: 'complete', summary: data.summary };
                } else {
                  events.push({ tool_name: data.tool_name, tool_label: data.tool_label || data.tool_name, status: 'complete', summary: data.summary });
                }
                return { ...message, toolEvents: events };
              }));
            } else if (event === 'done') {
              gotDone = true;
              setActiveConversation((current) => current ? { ...current, id: data.conversation_id, title: data.title, updated_at: new Date().toISOString() } : current);
              setMessages((current) => current.map((message) => message.id === assistantId ? { ...message, id: data.message_id || message.id } : message));
            } else if (event === 'error') {
              gotError = true;
              setMessages((current) => current.map((message) => message.id === assistantId ? {
                ...message,
                content: message.content ? `${message.content}\n\n> **Connection issue:** ${data.message}` : `**I couldn't finish that response.**\n\n${data.message}`,
                isError: true,
              } : message));
            }
          },
        },
      );
      if (!gotDone && !gotError && !controller.signal.aborted) {
        setMessages((current) => current.map((message) => message.id === assistantId ? {
          ...message,
          content: message.content || 'The connection closed before the answer was complete. Please try again.',
          isError: true,
        } : message));
      }
    } catch (error) {
      if (controller.signal.aborted) {
        setMessages((current) => current.map((message) => message.id === assistantId && !message.content ? { ...message, content: 'Generation stopped.', isError: true } : message));
      } else {
        const explanation = error.message || 'Could not connect to the assistant.';
        setMessages((current) => current.map((message) => message.id === assistantId ? {
          ...message,
          content: `**Setup needed**\n\n${explanation}`,
          isError: true,
        } : message));
        setConnectionError(explanation);
      }
    } finally {
      abortRef.current = null;
      setStreaming(false);
      refreshConversations();
    }
  }

  const hasMessages = messages.length > 0;
  const statusConnected = health?.openrouter_configured;

  return (
    <div className="app-shell flex h-[100dvh] overflow-hidden bg-[#f8f8fb] text-slate-800">
      <Sidebar
        agents={agents}
        conversations={conversations}
        activeConversationId={activeConversation?.id}
        selectedAgentId={selectedAgentId}
        health={health}
        mobileOpen={mobileSidebarOpen}
        onClose={() => setMobileSidebarOpen(false)}
        onNewChat={() => startNewChat()}
        onChooseAgent={chooseAgent}
        onChooseConversation={chooseConversation}
        onDeleteConversation={deleteConversation}
        onSettings={() => setSettingsOpen(true)}
      />

      <main className="main-panel relative flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="topbar z-10 flex h-[66px] shrink-0 items-center justify-between border-b border-slate-200/60 bg-white/70 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button onClick={() => setMobileSidebarOpen(true)} className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 shadow-sm lg:hidden" aria-label="Open sidebar"><Menu className="h-4 w-4" /></button>
            <div className="hidden min-w-0 items-center gap-2 text-[11px] sm:flex">
              <span className="text-slate-400">Workspace</span>
              <span className="text-slate-300">/</span>
              <span className="max-w-[270px] truncate font-semibold text-slate-600">{activeConversation?.title || 'New conversation'}</span>
            </div>
            <div className="flex items-center gap-2 sm:hidden">
              <span className="text-[11px] font-semibold text-slate-600">{selectedAgent?.name}</span>
              <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <div className="hidden items-center gap-1.5 rounded-full border border-slate-200/70 bg-white/80 px-2.5 py-1.5 md:flex">
              <span className={`h-1.5 w-1.5 rounded-full ${statusConnected ? 'bg-emerald-400' : health ? 'bg-amber-400' : 'bg-slate-300 animate-pulse'}`} />
              <span className="text-[9px] font-semibold tracking-[.04em] text-slate-500">{statusConnected ? 'MODEL ONLINE' : health ? 'SETUP NEEDED' : 'CONNECTING'}</span>
            </div>
            <div className="relative flex items-center gap-1.5 rounded-[12px] border border-slate-200/70 bg-white px-2.5 py-1.5 shadow-sm">
              <AgentIcon agent={selectedAgent} size="sm" className="h-6 w-6 rounded-lg ring-0 [&_svg]:h-3.5 [&_svg]:w-3.5" />
              <select
                ref={agentSelectRef}
                value={selectedAgentId}
                onChange={(event) => chooseAgent(event.target.value)}
                className="max-w-[130px] cursor-pointer appearance-none bg-transparent pr-4 text-[10px] font-semibold text-slate-600 outline-none sm:max-w-[170px] sm:text-[11px]"
                aria-label="Select agent"
              >
                {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 h-3 w-3 text-slate-400" />
            </div>
            <button onClick={() => startNewChat()} className="hidden h-8 items-center gap-1.5 rounded-[11px] border border-slate-200 bg-white px-2.5 text-[10px] font-semibold text-slate-500 shadow-sm transition hover:border-violet-200 hover:text-violet-700 sm:flex">
              <Plus className="h-3.5 w-3.5" /> New
            </button>
          </div>
        </header>

        {connectionError && !hasMessages && (
          <div className="mx-auto mt-4 flex max-w-[780px] items-center gap-2 rounded-xl border border-amber-200/70 bg-amber-50/80 px-3.5 py-2.5 text-[10px] text-amber-800 sm:text-[11px]">
            <CircleDot className="h-3.5 w-3.5 shrink-0" />
            <span className="flex-1">{connectionError}</span>
            <button onClick={() => setSettingsOpen(true)} className="shrink-0 font-bold underline underline-offset-2">Setup</button>
          </div>
        )}

        {!hasMessages ? (
          <section className="welcome-scroll min-h-0 flex-1 overflow-y-auto">
            <div className="welcome-content mx-auto max-w-[1050px] px-5 pb-8 pt-8 sm:px-8 sm:pt-12 lg:px-12 lg:pt-14">
              <div className="welcome-heading max-w-[780px]">
                <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-violet-100 bg-white/75 px-3 py-1.5 shadow-[0_3px_12px_rgba(70,60,150,.04)]">
                  <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-400 opacity-40" /><span className="relative inline-flex h-2 w-2 rounded-full bg-violet-500" /></span>
                  <span className="text-[9px] font-bold uppercase tracking-[.13em] text-violet-700">Your multi-agent workspace</span>
                  <Sparkles className="ml-0.5 h-3 w-3 text-violet-400" />
                </div>
                <h1 className="max-w-[710px] text-[35px] font-semibold leading-[1.1] tracking-[-.065em] text-slate-800 sm:text-[46px] lg:text-[54px]">
                  What are we <span className="heading-gradient">working on?</span>
                </h1>
                <p className="mt-4 max-w-[560px] text-[13px] leading-6 text-slate-500 sm:text-[14px]">
                  Meet the right specialist for every task. Think clearly, move faster, and turn your next idea into a plan.
                </p>
              </div>

              <div className="mt-9 flex flex-wrap items-end justify-between gap-3 sm:mt-11">
                <div>
                  <p className="text-[12px] font-bold text-slate-700">Choose your agent</p>
                  <p className="mt-1 text-[10px] text-slate-400">Each specialist has its own skills and tools.</p>
                </div>
                <div className="hidden items-center gap-1.5 rounded-full bg-white/70 px-2.5 py-1.5 text-[9px] font-medium text-slate-400 ring-1 ring-slate-200/60 sm:flex">
                  <WandSparkles className="h-3 w-3 text-violet-400" /> 5 focused agents
                </div>
              </div>

              <div className="agent-grid mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {agents.map((agent, index) => {
                  const active = agent.id === selectedAgentId;
                  return (
                    <button
                      key={agent.id}
                      onClick={() => chooseAgent(agent.id)}
                      className={`agent-card group relative flex min-h-[142px] flex-col rounded-[19px] border p-4 text-left transition duration-200 hover:-translate-y-0.5 sm:p-[18px] ${active ? 'border-violet-300 bg-white shadow-[0_11px_30px_rgba(92,79,187,.11)] ring-2 ring-violet-100/80' : 'border-slate-200/75 bg-white/85 shadow-[0_4px_15px_rgba(40,42,82,.035)] hover:border-violet-200 hover:bg-white hover:shadow-[0_11px_30px_rgba(92,79,187,.085)]'}`}
                    >
                      <div className="flex items-start justify-between">
                        <AgentIcon agent={agent} size="md" />
                        <span className="font-mono text-[8px] font-medium tracking-[.11em] text-slate-300">0{index + 1}</span>
                      </div>
                      <span className="mt-4 flex items-center gap-2 text-[12px] font-bold text-slate-700">
                        {agent.name}
                        <ArrowUpRight className={`h-3 w-3 transition ${active ? 'text-violet-500' : 'text-slate-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-violet-500'}`} />
                      </span>
                      <span className="mt-1.5 line-clamp-2 text-[10px] leading-[1.55] text-slate-400">{agent.tagline || agent.description}</span>
                      {active && <span className="absolute right-4 top-[57px] h-1.5 w-1.5 rounded-full bg-violet-500 ring-4 ring-violet-50" />}
                    </button>
                  );
                })}
              </div>

              <div className="mt-7 border-t border-slate-200/70 pt-5 sm:mt-8">
                <div className="mb-3 flex items-center gap-2">
                  <MessageCircleMore className="h-3.5 w-3.5 text-slate-400" />
                  <p className="text-[10px] font-bold text-slate-600">Need a starting point?</p>
                  <span className="text-[9px] text-slate-400">Try a prompt</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTIONS.map((item) => {
                    const agent = agents.find((candidate) => candidate.id === item.agent) || FALLBACK_AGENTS[0];
                    return (
                      <button
                        key={item.eyebrow}
                        onClick={() => sendMessage(item.prompt, item.agent)}
                        className="group flex max-w-full items-center gap-2 rounded-xl border border-slate-200/80 bg-white/75 px-3 py-2.5 text-left transition hover:border-violet-200 hover:bg-white hover:shadow-sm"
                      >
                        <AgentIcon agent={agent} size="sm" className="h-7 w-7 rounded-[9px] [&_svg]:h-3.5 [&_svg]:w-3.5" />
                        <span className="max-w-[220px] truncate text-[10px] font-medium text-slate-600 group-hover:text-slate-800">{item.prompt}</span>
                        <ArrowDownRight className="h-3 w-3 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:translate-y-0.5 group-hover:text-violet-500" />
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </section>
        ) : (
          <section className="chat-scroll min-h-0 flex-1 overflow-y-auto px-4 py-7 sm:px-7 sm:py-9">
            <div className="mx-auto flex max-w-[860px] flex-col gap-7 sm:gap-8">
              {conversationLoading && <div className="rounded-xl bg-white px-4 py-3 text-[11px] text-slate-400 shadow-sm">Loading conversation…</div>}
              <div className="flex items-center gap-3 border-b border-slate-200/60 pb-5">
                <AgentIcon agent={selectedAgent} size="lg" />
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-bold text-slate-700">{selectedAgent?.name}</p>
                  <p className="mt-1 truncate text-[10px] text-slate-400">{activeConversation?.title || 'A new conversation'} <span className="mx-1">·</span> {health?.model || 'OpenRouter free model'}</p>
                </div>
                <div className="hidden items-center gap-1.5 rounded-full bg-white px-2.5 py-1.5 text-[9px] font-medium text-slate-400 ring-1 ring-slate-200/70 sm:flex">
                  <Command className="h-3 w-3" /> Context aware
                </div>
              </div>
              {messages.map((message) => (
                <Message key={message.id} message={message} agent={selectedAgent} streaming={streaming && message.id.startsWith('stream-')} />
              ))}
              <div ref={bottomRef} className="h-1" />
            </div>
          </section>
        )}

        <div className={`composer-dock z-10 shrink-0 px-4 sm:px-7 ${hasMessages ? 'border-t border-slate-200/50 bg-[#f8f8fb]/90 pb-3 pt-4 sm:pb-5' : 'bg-gradient-to-t from-[#f8f8fb] via-[#f8f8fb]/95 to-transparent pb-4 pt-3 sm:pb-6'}`}>
          {connectionError && hasMessages && (
            <div className="mx-auto mb-2 flex max-w-[860px] items-center justify-between gap-3 rounded-xl border border-amber-200/70 bg-amber-50 px-3 py-2 text-[10px] text-amber-800">
              <span className="truncate">{connectionError}</span>
              <button onClick={() => setSettingsOpen(true)} className="shrink-0 font-semibold underline">Setup</button>
            </div>
          )}
          <Composer
            textareaRef={textareaRef}
            value={draft}
            onChange={setDraft}
            onSubmit={() => sendMessage()}
            onStop={stopStream}
            agent={selectedAgent}
            streaming={streaming}
            disabled={conversationLoading}
            onAgentClick={() => {
              if (window.innerWidth < 1024) setMobileSidebarOpen(true);
              else agentSelectRef.current?.focus();
            }}
            placeholder={hasMessages ? `Message ${selectedAgent?.name || 'your agent'}…` : 'Ask anything, or tell your agent what you want to do…'}
          />
        </div>
      </main>

      {settingsOpen && <SettingsModal health={health} onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
