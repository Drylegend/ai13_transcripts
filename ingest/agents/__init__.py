"""Multi-agent ingestion system for AI-13 Course Portal."""

from ingest.agents.agent1_normalize import Agent1Normalize
from ingest.agents.agent2_placement import Agent2Placement
from ingest.agents.agent3_numbering import Agent3Numbering
from ingest.agents.agent4_validation import Agent4Validation
from ingest.agents.agent5_publisher import Agent5Publisher

__all__ = [
    "Agent1Normalize",
    "Agent2Placement",
    "Agent3Numbering",
    "Agent4Validation",
    "Agent5Publisher",
]

