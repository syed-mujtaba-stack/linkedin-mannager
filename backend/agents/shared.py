from __future__ import annotations

import ast
import json
import math
import operator
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from backend.agents.base import AgentTool


class SafeCalculator(ast.NodeVisitor):
    """Evaluate a deliberately small arithmetic grammar; never use eval()."""

    _binary_ops = {
        ast.Add: operator.add,
        ast.Sub: operator.sub,
        ast.Mult: operator.mul,
        ast.Div: operator.truediv,
        ast.FloorDiv: operator.floordiv,
        ast.Mod: operator.mod,
        ast.Pow: operator.pow,
    }
    _unary_ops = {ast.UAdd: operator.pos, ast.USub: operator.neg}

    def visit_Expression(self, node: ast.Expression) -> float | int:
        return self.visit(node.body)

    def visit_Constant(self, node: ast.Constant) -> float | int:
        if isinstance(node.value, bool) or not isinstance(node.value, (int, float)):
            raise ValueError("Only numbers are allowed.")
        if abs(node.value) > 1e15:
            raise ValueError("That number is too large.")
        return node.value

    def visit_BinOp(self, node: ast.BinOp) -> float | int:
        operation = self._binary_ops.get(type(node.op))
        if operation is None:
            raise ValueError("That operator is not supported.")
        left = self.visit(node.left)
        right = self.visit(node.right)
        if isinstance(node.op, ast.Pow) and abs(right) > 10:
            raise ValueError("Powers must be between -10 and 10.")
        result = operation(left, right)
        if not math.isfinite(float(result)) or abs(result) > 1e100:
            raise ValueError("The result is outside the supported range.")
        return result

    def visit_UnaryOp(self, node: ast.UnaryOp) -> float | int:
        operation = self._unary_ops.get(type(node.op))
        if operation is None:
            raise ValueError("That unary operator is not supported.")
        return operation(self.visit(node.operand))

    def generic_visit(self, node: ast.AST) -> Any:
        raise ValueError("Use numbers, parentheses, and basic arithmetic operators only.")


def calculate(args: dict[str, Any]) -> dict[str, Any]:
    expression = str(args.get("expression", "")).strip()
    if not expression or len(expression) > 240:
        raise ValueError("Provide an arithmetic expression under 240 characters.")
    try:
        tree = ast.parse(expression, mode="eval")
        result = SafeCalculator().visit(tree)
    except (SyntaxError, ZeroDivisionError, OverflowError) as exc:
        raise ValueError(f"Could not calculate that expression: {exc}") from exc
    return {"expression": expression, "result": result}


def current_time(_: dict[str, Any]) -> dict[str, str]:
    now = datetime.now(timezone.utc)
    return {
        "utc_iso": now.isoformat(timespec="seconds"),
        "utc_readable": now.strftime("%A, %B %-d, %Y at %H:%M UTC"),
    }


def format_json(args: dict[str, Any]) -> dict[str, Any]:
    source = str(args.get("json_text", ""))
    if len(source) > 20000:
        raise ValueError("JSON input must be under 20,000 characters.")
    parsed = json.loads(source)
    return {"valid": True, "formatted": json.dumps(parsed, ensure_ascii=False, indent=2)}


def count_words(args: dict[str, Any]) -> dict[str, int]:
    text = str(args.get("text", ""))
    if len(text) > 50000:
        raise ValueError("Text must be under 50,000 characters.")
    words = re.findall(r"\b[\w’'-]+\b", text, flags=re.UNICODE)
    return {"words": len(words), "characters": len(text), "characters_without_spaces": len(re.sub(r"\s", "", text))}


def search_local_knowledge(args: dict[str, Any]) -> dict[str, Any]:
    """Search only the app's bundled knowledge folder, never arbitrary paths."""
    query = str(args.get("query", "")).strip()
    if not query:
        raise ValueError("Provide a search query.")
    if len(query) > 300:
        raise ValueError("Search query must be under 300 characters.")

    knowledge_dir = Path(__file__).resolve().parents[1] / "knowledge"
    terms = {term.casefold() for term in re.findall(r"[\w'-]+", query) if len(term) > 2}
    matches: list[dict[str, Any]] = []
    for path in sorted(knowledge_dir.glob("*.md")):
        try:
            content = path.read_text(encoding="utf-8")
        except OSError:
            continue
        lowered = content.casefold()
        score = sum(lowered.count(term) for term in terms)
        if score:
            matches.append({"file": path.name, "score": score, "excerpt": content[:1800]})
    matches.sort(key=lambda result: result["score"], reverse=True)
    return {
        "source": "bundled local knowledge files only",
        "matches": matches[:4],
        "note": "No documents are configured yet. Add trusted Markdown files under backend/knowledge/ to enable local search." if not matches else None,
    }


CALCULATOR = AgentTool(
    name="calculator",
    label="Calculating",
    description="Safely evaluate a basic arithmetic expression. Use for exact arithmetic rather than mental math.",
    parameters={
        "type": "object",
        "properties": {"expression": {"type": "string", "description": "Arithmetic only, e.g. (1200 * 0.15) + 80"}},
        "required": ["expression"],
        "additionalProperties": False,
    },
    handler=calculate,
)

CURRENT_TIME = AgentTool(
    name="current_time",
    label="Checking the time",
    description="Get the current date and time in UTC. Use when the user asks for today's date or current time.",
    parameters={"type": "object", "properties": {}, "additionalProperties": False},
    handler=current_time,
)

LOCAL_KNOWLEDGE_SEARCH = AgentTool(
    name="search_local_knowledge",
    label="Searching local knowledge",
    description="Search the app's local Markdown knowledge folder. This is not web search and returns no results unless documents have been added.",
    parameters={
        "type": "object",
        "properties": {"query": {"type": "string", "description": "A focused search phrase"}},
        "required": ["query"],
        "additionalProperties": False,
    },
    handler=search_local_knowledge,
)

JSON_FORMATTER = AgentTool(
    name="format_json",
    label="Validating JSON",
    description="Parse and pretty-print a JSON document. Returns a validation error if it is not valid JSON.",
    parameters={
        "type": "object",
        "properties": {"json_text": {"type": "string", "description": "The complete JSON text to validate"}},
        "required": ["json_text"],
        "additionalProperties": False,
    },
    handler=format_json,
)

WORD_COUNTER = AgentTool(
    name="count_words",
    label="Counting words",
    description="Count words and characters in a draft or text supplied by the user.",
    parameters={
        "type": "object",
        "properties": {"text": {"type": "string", "description": "Text to count"}},
        "required": ["text"],
        "additionalProperties": False,
    },
    handler=count_words,
)
