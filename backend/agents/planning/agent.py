from pathlib import Path

from backend.agents.base import AgentProfile
from backend.agents.shared import CALCULATOR, CURRENT_TIME

AGENT = AgentProfile(
    id="planning",
    name="Project Planner",
    description="A practical planner for turning goals into sequenced tasks, timelines, and realistic next steps.",
    tagline="Turn big goals into doable next steps.",
    icon="list-checks",
    color="rose",
    skills_path=Path(__file__).with_name("skills.md"),
    tools=(CALCULATOR, CURRENT_TIME),
)
