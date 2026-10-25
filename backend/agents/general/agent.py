from pathlib import Path

from backend.agents.base import AgentProfile
from backend.agents.shared import CALCULATOR, CURRENT_TIME

AGENT = AgentProfile(
    id="general",
    name="General Assistant",
    description="A thoughtful all-round assistant for questions, explanations, brainstorming, and everyday problem solving.",
    tagline="A clear answer for whatever is on your mind.",
    icon="sparkles",
    color="violet",
    skills_path=Path(__file__).with_name("skills.md"),
    tools=(CALCULATOR, CURRENT_TIME),
)
