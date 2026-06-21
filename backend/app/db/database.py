from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings

search_path = "public" if settings.is_production else "dev,public"
engine = create_async_engine(
    settings.database_url,
    echo=not settings.is_production,
    connect_args={"server_settings": {"search_path": search_path}},
)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        yield session
