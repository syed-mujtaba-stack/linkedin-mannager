from __future__ import annotations

import json
import logging
from contextlib import asynccontextmanager
from typing import Any
from uuid import UUID

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from backend.agents.registry import AGENT_REGISTRY, AGENTS
from backend.config import settings
from backend.openrouter import OpenRouterClient, OpenRouterError
from backend.storage import StorageError, create_store

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("nexus.api")

# This is the central wiring point: every agent package is imported into the
# registry and made available to the API from the backend's main entrypoint.
store = create_store(settings)
model_client = OpenRouterClient(settings)


@asynccontextmanager
async def lifespan(_: FastAPI):
    await store.initialize()
    logger.info("Nexus Agent Studio ready (storage=%s, agents=%s)", store.mode, len(AGENTS))
    try:
        yield
    finally:
        await store.close()
        await model_client.close()


app = FastAPI(
    title=settings.app_name,
    description="A streaming multi-agent AI workspace powered by OpenRouter and Supabase.",
    version="1.0.0",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_origins),
    allow_origin_regex=r"https?://.*\.e2b\.app",
    allow_credentials=False,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)


class ChatRequest(BaseModel):
    conversation_id: UUID | None = None
    agent_id: str = Field(min_length=1, max_length=50)
    message: str = Field(min_length=1, max_length=settings.max_message_chars)


class ConversationCreate(BaseModel):
    agent_id: str = Field(min_length=1, max_length=50)


def _conversation_title(message: str) -> str:
    title = " ".join(message.split())
    if len(title) > 58:
        title = title[:57].rstrip() + "…"
    return title or "New chat"


def _sse(event: str, data: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False, separators=(',', ':'))}\n\n"


def _model_history(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    history: list[dict[str, Any]] = []
    for message in messages[-settings.max_context_messages :]:
        role = message.get("role")
        if role in {"user", "assistant"}:
            payload: dict[str, Any] = {"role": role, "content": message.get("content") or None}
            if message.get("tool_calls"):
                payload["tool_calls"] = message["tool_calls"]
            history.append(payload)
        elif role == "tool" and message.get("tool_call_id"):
            history.append(
                {
                    "role": "tool",
                    "tool_call_id": message["tool_call_id"],
                    "name": message.get("name") or "tool",
                    "content": message.get("content") or "",
                }
            )
    return history


def _public_conversation(conversation: dict[str, Any]) -> dict[str, Any]:
    visible_messages = []
    for message in conversation.get("messages", []):
        if message.get("role") not in {"user", "assistant"}:
            continue
        content = message.get("content") or ""
        # An empty assistant tool-call record is useful to the model, not the transcript.
        if not content.strip():
            continue
        visible_messages.append(
            {
                "id": message["id"],
                "role": message["role"],
                "content": content,
                "created_at": message.get("created_at"),
            }
        )
    return {
        "id": conversation["id"],
        "agent_id": conversation["agent_id"],
        "title": conversation["title"],
        "created_at": conversation.get("created_at"),
        "updated_at": conversation.get("updated_at"),
        "messages": visible_messages,
    }


@app.get("/")
async def root() -> dict[str, str]:
    return {"name": settings.app_name, "api": "/api", "docs": "/docs"}


@app.get("/api/health")
async def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "app": settings.app_name,
        "openrouter_configured": bool(settings.openrouter_api_key),
        "model": settings.openrouter_model,
        "database": store.mode,
        "agents": len(AGENTS),
    }


@app.get("/api/agents")
async def list_agents() -> list[dict[str, Any]]:
    return [agent.public_dict() for agent in AGENTS]


@app.get("/api/agents/{agent_id}")
async def get_agent(agent_id: str) -> dict[str, Any]:
    agent = AGENT_REGISTRY.get(agent_id)
    if agent is None:
        raise HTTPException(status_code=404, detail="Agent not found")
    return agent.public_dict()


@app.get("/api/conversations")
async def list_conversations() -> list[dict[str, Any]]:
    try:
        return await store.list_conversations()
    except StorageError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.post("/api/conversations", status_code=201)
async def create_conversation(payload: ConversationCreate) -> dict[str, Any]:
    if payload.agent_id not in AGENT_REGISTRY:
        raise HTTPException(status_code=404, detail="Agent not found")
    try:
        conversation = await store.create_conversation(payload.agent_id, "New chat")
        return _public_conversation(conversation)
    except StorageError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.get("/api/conversations/{conversation_id}")
async def get_conversation(conversation_id: UUID) -> dict[str, Any]:
    try:
        conversation = await store.get_conversation(str(conversation_id))
    except StorageError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    if conversation is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return _public_conversation(conversation)


@app.delete("/api/conversations/{conversation_id}")
async def delete_conversation(conversation_id: UUID) -> dict[str, bool]:
    try:
        deleted = await store.delete_conversation(str(conversation_id))
    except StorageError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    if not deleted:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return {"deleted": True}


@app.post("/api/chat/stream")
async def stream_chat(payload: ChatRequest) -> StreamingResponse:
    agent = AGENT_REGISTRY.get(payload.agent_id)
    if agent is None:
        raise HTTPException(status_code=404, detail="Agent not found")
    if not settings.openrouter_api_key:
        raise HTTPException(
            status_code=503,
            detail="OpenRouter is not configured. Add OPENROUTER_API_KEY to .env and restart the backend.",
        )
    user_message = payload.message.strip()
    if not user_message:
        raise HTTPException(status_code=422, detail="Message cannot be blank")

    try:
        if payload.conversation_id is None:
            conversation = await store.create_conversation(agent.id, _conversation_title(user_message))
        else:
            conversation = await store.get_conversation(str(payload.conversation_id))
            if conversation is None:
                raise HTTPException(status_code=404, detail="Conversation not found")
            await store.update_conversation(str(payload.conversation_id), agent_id=agent.id)
            conversation["agent_id"] = agent.id

        conversation_id = str(conversation["id"])
        await store.add_message(conversation_id, "user", user_message)
        full_conversation = await store.get_conversation(conversation_id)
        if full_conversation is None:
            raise StorageError("Conversation disappeared while preparing the response")
        history = _model_history(full_conversation.get("messages", []))
    except HTTPException:
        raise
    except StorageError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    async def event_stream():
        yield _sse(
            "meta",
            {
                "conversation_id": conversation_id,
                "agent_id": agent.id,
                "agent_name": agent.name,
                "title": conversation.get("title", "New chat"),
                "model": settings.openrouter_model,
            },
        )
        try:
            async for event in model_client.stream_chat(agent, history):
                event_type = event["type"]
                if event_type == "assistant_tool_calls":
                    await store.add_message(
                        conversation_id,
                        "assistant",
                        event.get("content", ""),
                        tool_calls=event.get("tool_calls"),
                    )
                elif event_type == "tool_result":
                    await store.add_message(
                        conversation_id,
                        "tool",
                        event.get("content", ""),
                        tool_call_id=event.get("tool_call_id"),
                        name=event.get("tool_name"),
                    )
                    yield _sse(
                        "tool_result",
                        {
                            "tool_name": event.get("tool_name"),
                            "tool_label": event.get("tool_label"),
                            "summary": event.get("summary", "Done"),
                        },
                    )
                elif event_type == "assistant_final":
                    message = await store.add_message(
                        conversation_id, "assistant", event.get("content", "")
                    )
                    yield _sse(
                        "done",
                        {
                            "conversation_id": conversation_id,
                            "message_id": message["id"],
                            "title": conversation.get("title", "New chat"),
                        },
                    )
                elif event_type == "token":
                    yield _sse("token", {"content": event.get("content", "")})
                elif event_type == "tool_start":
                    yield _sse(
                        "tool_start",
                        {
                            "tool_name": event.get("tool_name"),
                            "tool_label": event.get("tool_label"),
                        },
                    )
        except OpenRouterError as exc:
            logger.info("Model request failed: %s", exc)
            yield _sse("error", {"message": str(exc)})
        except StorageError as exc:
            logger.exception("Chat persistence failed")
            yield _sse("error", {"message": f"Chat history could not be saved: {exc}"})
        except Exception:
            logger.exception("Unexpected streaming error")
            yield _sse(
                "error",
                {"message": "Something went wrong while generating the answer. Please try again."},
            )

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
