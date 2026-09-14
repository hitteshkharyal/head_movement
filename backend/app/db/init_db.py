from app.db.base import Base
from app.db.session import engine
# Import all models to register with Base metadata
from app.models import (  # noqa: F401
    user,
    robot,
    servo_config,
    gesture,
    training_dataset,
    training_sample,
    model_version,
    prediction,
    presentation_session,
    audience_session,
    speech_event,
    robot_command,
    system_event,
)


async def init_db() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
