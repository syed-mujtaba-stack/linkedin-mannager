-- Nexus Agent Studio conversation store.
-- Apply this migration once in your Supabase project's SQL Editor.
-- The FastAPI server uses a service-role key; keep it server-side only.

create extension if not exists pgcrypto;

create table if not exists public.conversations (
    id uuid primary key default gen_random_uuid(),
    agent_id text not null,
    title text not null default 'New chat',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.messages (
    id uuid primary key default gen_random_uuid(),
    conversation_id uuid not null references public.conversations(id) on delete cascade,
    role text not null check (role in ('user', 'assistant', 'tool')),
    content text not null default '',
    tool_calls jsonb,
    tool_call_id text,
    name text,
    created_at timestamptz not null default now()
);

create index if not exists idx_conversations_updated_at
    on public.conversations (updated_at desc);
create index if not exists idx_messages_conversation_created_at
    on public.messages (conversation_id, created_at asc);

-- Keep the tables private to server-side service-role access.
-- Row Level Security is enabled so a browser anon key cannot read chat history.
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
