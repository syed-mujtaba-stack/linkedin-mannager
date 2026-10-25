from pathlib import Path

from backend.agents.base import AgentProfile
from backend.agents.shared import CALCULATOR, JSON_FORMATTER

AGENT = AgentProfile(
    id="coding",
    name="Code Engineer",
    description="A pragmatic coding partner for implementation, debugging, architecture, and code review.",
    tagline="Ship thoughtful, maintainable code.",
    icon="code",
    color="blue",
    skills_path=Path(__file__).with_name("skills.md"),
    tools=(JSON_FORMATTER, CALCULATOR),
)
