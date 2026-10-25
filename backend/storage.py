from __future__ import annotations

import json
import logging
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, AsyncIterator

import aiosqlite
import httpx

from backend.config import Settings

logger = logging.getLogger(__name__)


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds")


class StorageError(RuntimeError):
    pass


class SQLiteStore:
    """Small local fallback for development; Supabase is used when configured."""

    mode = "sqlite"

    def __init__(self, path: Path):
        self.path = path

    async def initialize(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        async with aiosqlite.connect(self.path) as db:
            await db.execute("PRAGMA foreign_keys = ON")
            await db.executescript(
                """
                CREATE TABLE IF NOT EXISTS conversations (
                    id TEXT PRIMARY KEY,
                    agent_id TEXT NOT NULL,
                    title TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS messages (
                    id TEXT PRIMARY KEY,
                    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
                    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'tool')),
                    content TEXT NOT NULL DEFAULT '',
                    tool_calls TEXT,
                    tool_call_id TEXT,
                    name TEXT,
                    created_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
                    ON messages(conversation_id, created_at);
                CREATE INDEX IF NOT EXISTS idx_conversations_updated
                    ON conversations(updated_at DESC);
                """
            )
            await db.commit()

    async def close(self) -> None:
        return None

    @asynccontextmanager
    async def _connect(self) -> AsyncIterator[aiosqlite.Connection]:
        db = await aiosqlite.connect(self.path)
        db.row_factory = aiosqlite.Row
        await db.execute("PRAGMA foreign_keys = ON")
        try:
            yield db
        finally:
            await db.close()

    @staticmethod
    def _message_from_row(row: aiosqlite.Row) -> dict[str, Any]:
        tool_calls = row["tool_calls"]
        return {
            "id": row["id"],
            "conversation_id": row["conversation_id"],
            "role": row["role"],
            "content": row["content"],
            "tool_calls": json.loads(tool_calls) if tool_calls else None,
            "tool_call_id": row["tool_call_id"],
            "name": row["name"],
            "created_at": row["created_at"],
        }

    async def list_conversations(self, limit: int = 80) -> list[dict[str, Any]]:
        async with self._connect() as db:
            cursor = await db.execute(
                "SELECT id, agent_id, title, created_at, updated_at FROM conversations "
                "ORDER BY updated_at DESC LIMIT ?",
                (limit,),
            )
            rows = await cursor.fetchall()
            return [dict(row) for row in rows]

    async def get_conversation(self, conversation_id: str) -> dict[str, Any] | None:
        async with self._connect() as db:
            cursor = await db.execute(
                "SELECT id, agent_id, title, created_at, updated_at FROM conversations WHERE id = ?",
                (conversation_id,),
            )
            conversation = await cursor.fetchone()
            if conversation is None:
                return None
            cursor = await db.execute(
                "SELECT id, conversation_id, role, content, tool_calls, tool_call_id, name, created_at "
                "FROM messages WHERE conversation_id = ? ORDER BY created_at ASC, rowid ASC",
                (conversation_id,),
            )
            messages = [self._message_from_row(row) for row in await cursor.fetchall()]
            return {**dict(conversation), "messages": messages}

    async def create_conversation(self, agent_id: str, title: str) -> dict[str, Any]:
        now = utc_now()
        conversation = {
            "id": str(uuid.uuid4()),
            "agent_id": agent_id,
            "title": title,
            "created_at": now,
            "updated_at": now,
        }
        async with self._connect() as db:
            await db.execute(
                "INSERT INTO conversations (id, agent_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
                (conversation["id"], agent_id, title, now, now),
            )
            await db.commit()
        return {**conversation, "messages": []}

    async def update_conversation(
        self, conversation_id: str, *, agent_id: str | None = None, title: str | None = None
    ) -> None:
        assignments = ["updated_at = ?"]
        values: list[Any] = [utc_now()]
        if agent_id is not None:
            assignments.append("agent_id = ?")
            values.append(agent_id)
        if title is not None:
            assignments.append("title = ?")
            values.append(title)
        values.append(conversation_id)
        async with self._connect() as db:
            await db.execute(
                f"UPDATE conversations SET {', '.join(assignments)} WHERE id = ?", values
            )
            await db.commit()

    async def add_message(
        self,
        conversation_id: str,
        role: str,
        content: str,
        *,
        tool_calls: list[dict[str, Any]] | None = None,
        tool_call_id: str | None = None,
        name: str | None = None,
    ) -> dict[str, Any]:
        message = {
            "id": str(uuid.uuid4()),
            "conversation_id": conversation_id,
            "role": role,
            "content": content,
            "tool_calls": tool_calls,
            "tool_call_id": tool_call_id,
            "name": name,
            "created_at": utc_now(),
        }
        async with self._connect() as db:
            await db.execute(
                "INSERT INTO messages (id, conversation_id, role, content, tool_calls, tool_call_id, name, created_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    message["id"],
                    conversation_id,
                    role,
                    content,
                    json.dumps(tool_calls, ensure_ascii=False) if tool_calls else None,
                    tool_call_id,
                    name,
                    message["created_at"],
                ),
            )
            await db.execute(
                "UPDATE conversations SET updated_at = ? WHERE id = ?",
                (message["created_at"], conversation_id),
            )
            await db.commit()
        return message

    async def delete_conversation(self, conversation_id: str) -> bool:
        async with self._connect() as db:
            cursor = await db.execute("DELETE FROM conversations WHERE id = ?", (conversation_id,))
            await db.commit()
            return cursor.rowcount > 0


class SupabaseStore:
    """Minimal async PostgREST adapter; the service-role key stays server-side."""

    mode = "supabase"

    def __init__(self, url: str, service_role_key: str):
        self.client = httpx.AsyncClient(
            base_url=f"{url.rstrip('/')}/rest/v1/",
            headers={
                "apikey": service_role_key,
                "Authorization": f"Bearer {service_role_key}",
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
            timeout=httpx.Timeout(20.0, connect=8.0),
        )

    async def initialize(self) -> None:
        try:
            response = await self.client.get(
                "conversations", params={"select": "id", "limit": "1"}
            )
        except httpx.HTTPError as exc:
            raise StorageError(f"Could not reach Supabase: {exc}") from exc
        if response.is_error:
            raise StorageError(
                "Supabase is configured but the conversations table is unavailable. "
                "Apply backend/migrations/001_init.sql in the Supabase SQL editor. "
                f"Details: {response.text[:500]}"
            )

    async def close(self) -> None:
        await self.client.aclose()

    async def _request(self, method: str, table: str, **kwargs: Any) -> Any:
        try:
            response = await self.client.request(method, table, **kwargs)
        except httpx.HTTPError as exc:
            raise StorageError(f"Supabase request failed: {exc}") from exc
        if response.is_error:
            raise StorageError(f"Supabase returned {response.status_code}: {response.text[:500]}")
        if not response.content:
            return None
        try:
            return response.json()
        except ValueError:
            return None

    async def list_conversations(self, limit: int = 80) -> list[dict[str, Any]]:
        rows = await self._request(
            "GET",
            "conversations",
            params={
                "select": "id,agent_id,title,created_at,updated_at",
                "order": "updated_at.desc",
                "limit": str(limit),
            },
        )
        return rows or []

    async def get_conversation(self, conversation_id: str) -> dict[str, Any] | None:
        rows = await self._request(
            "GET",
            "conversations",
            params={
                "select": "id,agent_id,title,created_at,updated_at",
                "id": f"eq.{conversation_id}",
                "limit": "1",
            },
        )
        if not rows:
            return None
        conversation = rows[0]
        messages = await self._request(
            "GET",
            "messages",
            params={
                "select": "id,conversation_id,role,content,tool_calls,tool_call_id,name,created_at",
                "conversation_id": f"eq.{conversation_id}",
                "order": "created_at.asc",
            },
        )
        return {**conversation, "messages": messages or []}

    async def create_conversation(self, agent_id: str, title: str) -> dict[str, Any]:
        now = utc_now()
        row = {
            "id": str(uuid.uuid4()),
            "agent_id": agent_id,
            "title": title,
            "created_at": now,
            "updated_at": now,
        }
        rows = await self._request(
            "POST", "conversations", json=row, headers={"Prefer": "return=representation"}
        )
        return {**(rows[0] if rows else row), "messages": []}

    async def update_conversation(
        self, conversation_id: str, *, agent_id: str | None = None, title: str | None = None
    ) -> None:
        row: dict[str, Any] = {"updated_at": utc_now()}
        if agent_id is not None:
            row["agent_id"] = agent_id
        if title is not None:
            row["title"] = title
        await self._request(
            "PATCH",
            "conversations",
            params={"id": f"eq.{conversation_id}"},
            json=row,
        )

    async def add_message(
        self,
        conversation_id: str,
        role: str,
        content: str,
        *,
        tool_calls: list[dict[str, Any]] | None = None,
        tool_call_id: str | None = None,
        name: str | None = None,
    ) -> dict[str, Any]:
        message = {
            "id": str(uuid.uuid4()),
            "conversation_id": conversation_id,
            "role": role,
            "content": content,
            "tool_calls": tool_calls,
            "tool_call_id": tool_call_id,
            "name": name,
            "created_at": utc_now(),
        }
        rows = await self._request(
            "POST", "messages", json=message, headers={"Prefer": "return=representation"}
        )
        await self.update_conversation(conversation_id)
        return rows[0] if rows else message

    async def delete_conversation(self, conversation_id: str) -> bool:
        rows = await self._request(
            "DELETE",
            "conversations",
            params={"id": f"eq.{conversation_id}", "select": "id"},
            headers={"Prefer": "return=representation"},
        )
        return bool(rows)


def create_store(settings: Settings) -> SQLiteStore | SupabaseStore:
    if settings.uses_supabase:
        logger.info("Using Supabase Postgres for chat history")
        return SupabaseStore(settings.supabase_url, settings.supabase_service_role_key)
    logger.info("Supabase is not configured; using local SQLite development storage")
    return SQLiteStore(settings.sqlite_path)
