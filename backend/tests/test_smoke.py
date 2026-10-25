from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from backend.agents.shared import (
    calculate,
    count_words,
    current_time,
    format_json,
    search_local_knowledge,
)
from backend.storage import SQLiteStore


class AgentToolTests(unittest.TestCase):
    def test_calculator_handles_arithmetic(self) -> None:
        result = calculate({"expression": "(2 + 3) * 4"})
        self.assertEqual(result["result"], 20)

    def test_calculator_rejects_non_arithmetic(self) -> None:
        with self.assertRaises(ValueError):
            calculate({"expression": '__import__("os").system("echo unsafe")'})

    def test_calculator_rejects_division_by_zero(self) -> None:
        with self.assertRaises(ValueError):
            calculate({"expression": "1 / 0"})

    def test_json_formatter(self) -> None:
        result = format_json({"json_text": '{"b":2,"a":1}'})
        self.assertTrue(result["valid"])
        self.assertEqual(json.loads(result["formatted"]), {"b": 2, "a": 1})

    def test_word_counter(self) -> None:
        self.assertEqual(count_words({"text": "One, two!\nThree"})["words"], 3)

    def test_current_time_is_utc(self) -> None:
        self.assertTrue(current_time({})["utc_iso"].endswith("+00:00"))

    def test_local_search_is_scoped(self) -> None:
        result = search_local_knowledge({"query": "local knowledge"})
        self.assertEqual(result["source"], "bundled local knowledge files only")
        self.assertIsInstance(result["matches"], list)


class StorageTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.store = SQLiteStore(Path(self.temp_dir.name) / "test.sqlite3")
        await self.store.initialize()

    async def asyncTearDown(self) -> None:
        await self.store.close()
        self.temp_dir.cleanup()

    async def test_conversation_round_trip_with_tool_messages(self) -> None:
        conversation = await self.store.create_conversation("general", "Test chat")
        conversation_id = conversation["id"]
        await self.store.add_message(conversation_id, "user", "What is 2+2?")
        await self.store.add_message(
            conversation_id,
            "assistant",
            "Let me calculate.",
            tool_calls=[
                {
                    "id": "call_1",
                    "type": "function",
                    "function": {
                        "name": "calculator",
                        "arguments": '{"expression":"2+2"}',
                    },
                }
            ],
        )
        await self.store.add_message(
            conversation_id,
            "tool",
            json.dumps({"expression": "2+2", "result": 4}),
            tool_call_id="call_1",
            name="calculator",
        )
        await self.store.add_message(conversation_id, "assistant", "The answer is 4.")

        fetched = await self.store.get_conversation(conversation_id)
        self.assertIsNotNone(fetched)
        assert fetched is not None
        self.assertEqual(fetched["title"], "Test chat")
        self.assertEqual([message["role"] for message in fetched["messages"]], [
            "user", "assistant", "tool", "assistant",
        ])
        self.assertEqual(
            fetched["messages"][1]["tool_calls"][0]["function"]["name"],
            "calculator",
        )
        self.assertEqual(fetched["messages"][2]["tool_call_id"], "call_1")

        conversations = await self.store.list_conversations()
        self.assertEqual(len(conversations), 1)
        self.assertEqual(conversations[0]["id"], conversation_id)

        self.assertTrue(await self.store.delete_conversation(conversation_id))
        self.assertIsNone(await self.store.get_conversation(conversation_id))


if __name__ == "__main__":
    unittest.main()
