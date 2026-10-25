# Nexus Agent Studio

A full-stack, multi-agent AI chat workspace built with **React + Tailwind**, **FastAPI**, **OpenRouter streaming**, and **Supabase Postgres**. It includes a local SQLite fallback so the interface can be developed before Supabase is configured.

## Features

- Five focused agents: General Assistant, Research Analyst, Code Engineer, Writing Partner, and Project Planner.
- Every agent has its own module and `skills.md`; agent-specific tools are registered centrally by `backend/main.py` through `backend/agents/registry.py`.
- OpenAI-compatible tool calling through OpenRouter, with safe tools for arithmetic, current time, JSON validation, word counts, and local Markdown knowledge search.
- Token-by-token Server-Sent Events (SSE) streaming, with visible tool activity.
- Persisted conversations and messages. Supabase is used when configured; otherwise data is stored in `backend/data/nexus.sqlite3`.
- Responsive React UI with Tailwind, conversation history, agent selection, markdown rendering, and setup status.

## Run locally

Use Python 3.10+ and Node.js 18+.

1. Install the backend dependencies and configure the environment:

   ```bash
   python -m venv .venv
   source .venv/bin/activate       # Windows: .venv\Scripts\activate
   pip install -r backend/requirements.txt
   cp .env.example .env
   ```

2. Add an OpenRouter API key to `.env`:

   ```env
   OPENROUTER_API_KEY=your_openrouter_key
   OPENROUTER_MODEL=openrouter/free
   ```

   `openrouter/free` routes requests to an available free model. Set `OPENROUTER_MODEL` to another OpenRouter model ID if you prefer.

3. Start the API in one terminal:

   ```bash
   uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
   ```

4. Start the React app in another terminal:

   ```bash
   npm install
   npm run dev
   ```

   Open the Vite URL (normally `http://localhost:5173`). Vite proxies `/api` to FastAPI, so the browser uses same-origin relative URLs.

## Run the backend smoke tests

```bash
python -m unittest discover -s backend/tests -v
```

The tests cover the safe tool helpers and the local conversation store. The streaming path is an integration boundary; point `OPENROUTER_API_KEY` at a real key (or `OPENROUTER_BASE_URL` at a compatible mock) to exercise it end to end.

## Configure Supabase

The app does not select or modify an existing Supabase project automatically. Point it at the project you intend to use:

1. Apply `backend/migrations/001_init.sql` in that project's Supabase SQL Editor.
2. Set the project URL and **server-side** service-role key in the root `.env`:

   ```env
   SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   ```

3. Restart FastAPI. The Settings panel and `/api/health` show whether Supabase or the local SQLite fallback is active.

Never put the Supabase service-role key or OpenRouter key in frontend code, commit `.env`, or expose either key in a public client bundle. RLS is enabled on the tables; the backend's server-side service-role key is required for access.

## Add an agent

Create a package under `backend/agents/<agent_id>/` with an `agent.py` profile and a `skills.md` file. Add the profile to `backend/agents/registry.py`. Tools should be explicit, small, and safe; the app never runs arbitrary model-generated code. Restart FastAPI to load the new agent.

Research's `search_local_knowledge` tool searches only Markdown files under `backend/knowledge/`. It does **not** browse the web; add trusted documents there if local retrieval is useful.

## API overview

- `GET /api/health` — model, storage, and agent status
- `GET /api/agents` — available agents and their tool names
- `GET /api/conversations` — conversation history
- `GET /api/conversations/{id}` — messages for one conversation
- `DELETE /api/conversations/{id}` — delete one conversation
- `POST /api/chat/stream` — SSE chat stream (`meta`, `token`, tool events, `done` / `error`)

The first version is a single-workspace starter and does not include user authentication. Add Supabase Auth and enforce per-user ownership before exposing it as a multi-user public service.
