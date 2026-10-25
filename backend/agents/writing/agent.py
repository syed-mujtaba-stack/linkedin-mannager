from pathlib import Path

from backend.agents.base import AgentProfile
from backend.agents.shared import CURRENT_TIME, WORD_COUNTER

AGENT = AgentProfile(
    id="writing",
    name="Writing Partner",
    description="A versatile editor and co-writer for clear, natural, audience-aware communication.",
    tagline="Find the right words and make them land.",
    icon="pen",
    color="amber",
    skills_path=Path(__file__).with_name("skills.md"),
    tools=(WORD_COUNTER, CURRENT_TIME),
)
