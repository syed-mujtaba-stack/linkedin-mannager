from __future__ import annotations

import json
import logging
import uuid
from typing import Any, AsyncIterator

import httpx

from backend.agents.base import AgentProfile
from backend.config import Settings

logger = logging.getLogger(__name__)


class OpenRouterError(RuntimeError):
    pass


def _tool_result_text(result: Any) -> str:
    text = json.dumps(result, ensure_ascii=False, default=str)
    if len(text) > 12000:
        text = text[:12000] + "… [result truncated]"
    return text


def _tool_summary(result: Any) -> str:
    if isinstance(result, dict):
        if "result" in result:
            return str(result["result"])
        if "matches" in result:
            count = len(result.get("matches") or [])
            return f"Found {count} local document match{'es' if count != 1 else ''}."
        if "words" in result:
            return f"{result['words']} words · {result.get('characters', 0)} characters"
        if result.get("formatted"):
            return "JSON is valid and formatted."
        if result.get("utc_readable"):
            return result["utc_readable"]
    return str(result)[:180]


class OpenRouterClient:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.client = httpx.AsyncClient(
            timeout=httpx.Timeout(
                settings.openrouter_timeout_seconds,
                connect=15.0,
                read=settings.openrouter_timeout_seconds,
                write=30.0,
                pool=10.0,
            ),
            headers={
                "Authorization": f"Bearer {settings.openrouter_api_key}",
                "HTTP-Referer": settings.openrouter_http_referer,
                "X-Title": settings.openrouter_app_title,
                "Content-Type": "application/json",
            },
        )

    async def close(self) -> None:
        await self.client.aclose()

    async def stream_chat(
        self, agent: AgentProfile, history: list[dict[str, Any]]
    ) -> AsyncIterator[dict[str, Any]]:
        if not self.settings.openrouter_api_key:
            raise OpenRouterError(
                "OpenRouter is not configured yet. Add OPENROUTER_API_KEY to the root .env file and restart the backend."
            )

        messages: list[dict[str, Any]] = [
            {"role": "system", "content": agent.system_prompt()},
            *history,
        ]
        max_rounds = max(0, self.settings.max_tool_rounds)

        for round_index in range(max_rounds + 1):
            allow_tools = bool(agent.tools) and round_index < max_rounds
            body: dict[str, Any] = {
                "model": self.settings.openrouter_model,
                "messages": messages,
                "stream": True,
                "temperature": 0.55,
                "max_tokens": 1800,
            }
            if allow_tools:
                body["tools"] = [tool.openai_schema() for tool in agent.tools]
                body["tool_choice"] = "auto"

            url = f"{self.settings.openrouter_base_url}/chat/completions"
            content_parts: list[str] = []
            tool_deltas: dict[int, dict[str, Any]] = {}
            try:
                async with self.client.stream("POST", url, json=body) as response:
                    if response.is_error:
                        error_body = (await response.aread()).decode("utf-8", errors="replace")
                        message = _extract_error_message(error_body)
                        raise OpenRouterError(
                            f"OpenRouter returned {response.status_code}: {message}"
                        )

                    async for line in response.aiter_lines():
                        if not line or not line.startswith("data:"):
                            continue
                        data = line[5:].strip()
                        if data == "[DONE]":
                            break
                        try:
                            chunk = json.loads(data)
                        except json.JSONDecodeError:
                            logger.debug("Skipping malformed OpenRouter stream chunk")
                            continue
                        choices = chunk.get("choices") or []
                        if not choices:
                            continue
                        delta = choices[0].get("delta") or {}
                        text = delta.get("content")
                        if isinstance(text, str) and text:
                            content_parts.append(text)
                            yield {"type": "token", "content": text}
                        for item in delta.get("tool_calls") or []:
                            index = int(item.get("index", 0))
                            current = tool_deltas.setdefault(
                                index,
                                {
                                    "id": "",
                                    "type": "function",
                                    "function": {"name": "", "arguments": ""},
                                },
                            )
                            if item.get("id"):
                                current["id"] = item["id"]
                            if item.get("type"):
                                current["type"] = item["type"]
                            function = item.get("function") or {}
                            if function.get("name"):
                                current["function"]["name"] += function["name"]
                            if function.get("arguments"):
                                current["function"]["arguments"] += function["arguments"]
            except httpx.TimeoutException as exc:
                raise OpenRouterError("The model took too long to respond. Please try again.") from exc
            except httpx.HTTPError as exc:
                raise OpenRouterError(f"Could not connect to OpenRouter: {exc}") from exc

            assistant_content = "".join(content_parts)
            calls = [tool_deltas[index] for index in sorted(tool_deltas)]
            if calls and allow_tools:
                normalized_calls: list[dict[str, Any]] = []
                for call in calls:
                    function = call.get("function") or {}
                    function_name = function.get("name", "").strip()
                    if not function_name:
                        continue
                    normalized_calls.append(
                        {
                            "id": call.get("id") or f"call_{uuid.uuid4().hex}",
                            "type": "function",
                            "function": {
                                "name": function_name,
                                "arguments": function.get("arguments", "{}"),
                            },
                        }
                    )
                if not normalized_calls:
                    messages.append({"role": "assistant", "content": assistant_content})
                    continue

                assistant_message = {
                    "role": "assistant",
                    "content": assistant_content or None,
                    "tool_calls": normalized_calls,
                }
                messages.append(assistant_message)
                yield {
                    "type": "assistant_tool_calls",
                    "content": assistant_content,
                    "tool_calls": normalized_calls,
                }

                for call in normalized_calls:
                    function = call["function"]
                    tool_name = function["name"]
                    tool = agent.tool_map.get(tool_name)
                    yield {
                        "type": "tool_start",
                        "tool_name": tool_name,
                        "tool_label": tool.label if tool else tool_name.replace("_", " ").title(),
                        "tool_call_id": call["id"],
                    }
                    try:
                        arguments = json.loads(function.get("arguments") or "{}")
                        if not isinstance(arguments, dict):
                            raise ValueError("Tool arguments must be a JSON object.")
                        if len(json.dumps(arguments)) > 12000:
                            raise ValueError("Tool arguments are too large.")
                        if tool is None:
                            raise ValueError(f"Tool '{tool_name}' is not available to this agent.")
                        result = await tool.invoke(arguments)
                    except Exception as exc:  # Tool errors are returned to the model, not leaked as server errors.
                        logger.info("Agent tool %s failed: %s", tool_name, exc)
                        result = {"error": str(exc)[:500]}
                    result_text = _tool_result_text(result)
                    messages.append(
                        {
                            "role": "tool",
                            "tool_call_id": call["id"],
                            "name": tool_name,
                            "content": result_text,
                        }
                    )
                    yield {
                        "type": "tool_result",
                        "tool_name": tool_name,
                        "tool_label": tool.label if tool else tool_name.replace("_", " ").title(),
                        "tool_call_id": call["id"],
                        "content": result_text,
                        "summary": _tool_summary(result),
                    }
                continue

            if calls and not allow_tools:
                logger.warning("Model returned tool calls after tool use was disabled; ignoring them")
            if not assistant_content:
                assistant_content = "I wasn't able to produce a response. Please try again or choose another model."
            messages.append({"role": "assistant", "content": assistant_content})
            yield {"type": "assistant_final", "content": assistant_content}
            return

        # The last tool round is followed by a no-tools completion; this is a defensive fallback.
        yield {
            "type": "assistant_final",
            "content": "I used the available tools, but couldn't complete the response. Please try again.",
        }


def _extract_error_message(body: str) -> str:
    try:
        parsed = json.loads(body)
        error = parsed.get("error", parsed)
        message = error.get("message") if isinstance(error, dict) else str(error)
        if message:
            return str(message)[:600]
    except (ValueError, AttributeError):
        pass
    return (body or "Unknown provider error")[:600]
