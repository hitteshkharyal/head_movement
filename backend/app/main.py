from contextlib import asynccontextmanager
import time
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.api.v1.router import api_router
from app.core.config import settings
from app.core.exceptions import AppError
from app.core.logging import setup_logging, get_logger
from app.db.init_db import init_db

logger = get_logger(__name__)
_start_time = time.time()


@asynccontextmanager
async def lifespan(app: FastAPI):
    setup_logging()
    logger.info("Starting AI Humanoid Presentation Robot API", version=settings.app_version)

    await init_db()
    logger.info("Database initialized")

    for directory in [
        settings.data_directory,
        settings.model_directory,
        settings.dataset_directory,
        settings.recordings_directory,
    ]:
        directory.mkdir(parents=True, exist_ok=True)

    logger.info(
        "Application ready",
        env=settings.app_env,
        hardware=settings.esp32_connection_type,
        debug=settings.app_debug,
    )
    yield
    logger.info("Shutting down AI Humanoid Presentation Robot API")


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="AI-powered humanoid presentation robot backend API",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.backend_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(AppError)
async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content={"error": exc.code, "message": exc.message},
    )


app.include_router(api_router, prefix="/api/v1")