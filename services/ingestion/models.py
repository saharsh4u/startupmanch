from __future__ import annotations

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class RawEvent(BaseModel):
    source: str
    company_id: int
    url: str
    text: str
    rating: Optional[float] = None
    language: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    hash: str


class Company(BaseModel):
    id: int
    name: str
    sector: str | None = None
    revenue: str | None = None
    aliases: list[str] = []
    featured_free: bool = False


class Task(BaseModel):
    source: str
    since_ts: Optional[datetime] = None
