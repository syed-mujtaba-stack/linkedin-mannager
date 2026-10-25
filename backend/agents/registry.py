from backend.agents.coding.agent import AGENT as CODING_AGENT
from backend.agents.general.agent import AGENT as GENERAL_AGENT
from backend.agents.planning.agent import AGENT as PLANNING_AGENT
from backend.agents.research.agent import AGENT as RESEARCH_AGENT
from backend.agents.writing.agent import AGENT as WRITING_AGENT

AGENTS = (
    GENERAL_AGENT,
    RESEARCH_AGENT,
    CODING_AGENT,
    WRITING_AGENT,
    PLANNING_AGENT,
)
AGENT_REGISTRY = {agent.id: agent for agent in AGENTS}


def get_agent(agent_id: str):
    return AGENT_REGISTRY.get(agent_id)
