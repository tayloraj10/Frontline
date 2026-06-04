from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from sqlalchemy.ext.asyncio import AsyncSession


@dataclass
class SeedResult:
    inserted: int = 0
    skipped: int = 0
    errors: list[str] = field(default_factory=list)


class Seeder(ABC):
    default_params: dict = {}

    @abstractmethod
    async def run(self, db: AsyncSession, params: dict) -> SeedResult: ...
