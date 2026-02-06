from __future__ import annotations

from typing import Iterable, Tuple

import psycopg2
from psycopg2.extras import execute_values

from .config import get_settings
from .models import RawEvent


EventWithSentiment = Tuple[RawEvent, float, bool]


def get_connection():
    settings = get_settings()
    if not settings.database_url:
        raise RuntimeError("DATABASE_URL is required")
    sslmode = "require" if settings.database_ssl else "prefer"
    conn = psycopg2.connect(settings.database_url, sslmode=sslmode)
    conn.autocommit = True
    return conn


def insert_events_with_sentiment(conn, events: Iterable[EventWithSentiment]) -> int:
    payload = list(events)
    if not payload:
        return 0

    raw_rows = [
        (
            item[0].source,
            item[0].company_id,
            item[0].url,
            item[0].text,
            item[0].rating,
            item[0].language,
            item[0].created_at,
            item[0].hash,
        )
        for item in payload
    ]

    with conn.cursor() as cur:
        execute_values(
            cur,
            """
            INSERT INTO raw_events
              (source, company_id, url, text, rating, language, created_at, hash)
            VALUES %s
            ON CONFLICT (hash) DO NOTHING
            RETURNING id, hash
            """,
            raw_rows,
        )
        inserted = cur.fetchall()

    if not inserted:
        return 0

    id_by_hash = {row[1]: row[0] for row in inserted}
    sentiment_rows = []
    for event, sentiment_score, is_negative in payload:
        event_id = id_by_hash.get(event.hash)
        if event_id is None:
            continue
        sentiment_rows.append((event_id, sentiment_score, is_negative))

    if sentiment_rows:
        with conn.cursor() as cur:
            execute_values(
                cur,
                """
                INSERT INTO sentiment_events
                  (raw_event_id, sentiment_score, is_negative)
                VALUES %s
                ON CONFLICT (raw_event_id) DO NOTHING
                """,
                sentiment_rows,
            )

    return len(inserted)
