from __future__ import annotations

from datetime import datetime


def update_source_health(conn, source: str, had_error: bool) -> int:
    now = datetime.utcnow()
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO source_health (source, consecutive_failures, last_success, last_failure)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (source) DO UPDATE SET
              consecutive_failures = CASE WHEN %s THEN source_health.consecutive_failures + 1 ELSE 0 END,
              last_success = CASE WHEN %s THEN source_health.last_success ELSE EXCLUDED.last_success END,
              last_failure = CASE WHEN %s THEN EXCLUDED.last_failure ELSE source_health.last_failure END
            RETURNING consecutive_failures
            """,
            (
                source,
                1 if had_error else 0,
                None if had_error else now,
                now if had_error else None,
                had_error,
                had_error,
                had_error,
            ),
        )
        row = cur.fetchone()
    return row[0] if row else 0
