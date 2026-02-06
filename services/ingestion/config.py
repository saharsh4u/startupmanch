from __future__ import annotations

import os
from dataclasses import dataclass


def _split_csv(value: str | None) -> list[str]:
    if not value:
        return []
    return [item.strip() for item in value.split(",") if item.strip()]


@dataclass(frozen=True)
class Settings:
    database_url: str
    database_ssl: bool
    aws_region: str
    sqs_queue_url: str
    source_allowlist: list[str]
    user_agent: str
    request_timeout: int
    max_pages: int
    rate_limit_seconds: float
    log_level: str
    reddit_client_id: str
    reddit_client_secret: str
    reddit_user_agent: str
    x_bearer_token: str
    quora_api_key: str


def get_settings() -> Settings:
    return Settings(
        database_url=os.environ.get("DATABASE_URL", ""),
        database_ssl=os.environ.get("DATABASE_SSL", "false").lower() == "true",
        aws_region=os.environ.get("AWS_REGION", "ap-south-1"),
        sqs_queue_url=os.environ.get("SQS_QUEUE_URL", ""),
        source_allowlist=_split_csv(os.environ.get("SOURCE_ALLOWLIST")),
        user_agent=os.environ.get("USER_AGENT", "YendukuBot/1.0"),
        request_timeout=int(os.environ.get("REQUEST_TIMEOUT", "20")),
        max_pages=int(os.environ.get("MAX_PAGES", "2")),
        rate_limit_seconds=float(os.environ.get("RATE_LIMIT_SECONDS", "2")),
        log_level=os.environ.get("LOG_LEVEL", "INFO"),
        reddit_client_id=os.environ.get("REDDIT_CLIENT_ID", ""),
        reddit_client_secret=os.environ.get("REDDIT_CLIENT_SECRET", ""),
        reddit_user_agent=os.environ.get("REDDIT_USER_AGENT", ""),
        x_bearer_token=os.environ.get("X_BEARER_TOKEN", ""),
        quora_api_key=os.environ.get("QUORA_API_KEY", ""),
    )
