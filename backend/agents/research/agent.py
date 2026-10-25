from pathlib import Path

from backend.agents.base import AgentProfile
from backend.agents.shared import CALCULATOR, CURRENT_TIME, LOCAL_KNOWLEDGE_SEARCH

AGENT = AgentProfile(
    id="research",
    name="Research Analyst",
    description="A careful research partner for synthesizing information, comparing options, and structuring evidence-based answers.",
    tagline="Make sense of complex topics with care.",
    icon="compass",
    color="teal",
    skills_path=Path(__file__).with_name("skills.md"),
    tools=(LOCAL_KNOWLEDGE_SEARCH, CALCULATOR, CURRENT_TIME),
)
