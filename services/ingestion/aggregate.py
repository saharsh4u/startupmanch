from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Dict

from .config import get_settings
from .db import get_connection
from .sources import ADAPTERS


WINDOWS = {
    "1h": 1,
    "24h": 24,
    "7d": 24 * 7,
    "30d": 24 * 30,
}


@dataclass
class WindowMetrics:
    total: int
    one_star: int
    negative: int
    sources: int


def fetch_metrics(conn, start: datetime, end: datetime) -> Dict[int, WindowMetrics]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT
                re.company_id,
                COUNT(*) as total,
                SUM(CASE WHEN re.rating IS NOT NULL AND re.rating <= 1 THEN 1 ELSE 0 END) as one_star,
                SUM(CASE WHEN se.is_negative THEN 1 ELSE 0 END) as negative,
                COUNT(DISTINCT re.source) as sources
            FROM raw_events re
            LEFT JOIN sentiment_events se ON se.raw_event_id = re.id
            WHERE re.created_at >= %s AND re.created_at < %s
            GROUP BY re.company_id
            """,
            (start, end),
        )
        rows = cur.fetchall()

    return {
        row[0]: WindowMetrics(
            total=row[1] or 0,
            one_star=row[2] or 0,
            negative=row[3] or 0,
            sources=row[4] or 0,
        )
        for row in rows
    }


def fetch_company_ids(conn) -> list[int]:
    with conn.cursor() as cur:
        cur.execute(\"SELECT id FROM companies WHERE active = true\")
        rows = cur.fetchall()
    return [row[0] for row in rows]


def safe_pct_delta(current: int, previous: int) -> float:
    if previous <= 0:
        return float(current) * 100.0
    return ((current - previous) / previous) * 100.0


def compute_momentum_score(
    complaint_velocity: float,
    negative_momentum: float,
    source_diversity: float,
) -> float:
    return (
        complaint_velocity * 0.45
        + source_diversity * 0.35
        + negative_momentum * 0.20
    )


def upsert_aggregates(conn, window: str, metrics: dict[int, dict]) -> None:
    with conn.cursor() as cur:
        for company_id, values in metrics.items():
            cur.execute(
                """
                INSERT INTO agg_windows
                  (company_id, window, complaint_count, one_star_delta, complaint_velocity,
                   negative_momentum, source_diversity, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (company_id, window) DO UPDATE SET
                  complaint_count = EXCLUDED.complaint_count,
                  one_star_delta = EXCLUDED.one_star_delta,
                  complaint_velocity = EXCLUDED.complaint_velocity,
                  negative_momentum = EXCLUDED.negative_momentum,
                  source_diversity = EXCLUDED.source_diversity,
                  updated_at = EXCLUDED.updated_at
                """,
                (
                    company_id,
                    window,
                    values["complaint_count"],
                    values["one_star_delta"],
                    values["complaint_velocity"],
                    values["negative_momentum"],
                    values["source_diversity"],
                    values["updated_at"],
                ),
            )


def update_rankings(conn, window: str, metrics: dict[int, dict]) -> None:
    ranked = sorted(
        metrics.items(), key=lambda item: item[1]["cts_score"], reverse=True
    )
    with conn.cursor() as cur:
        for idx, (company_id, values) in enumerate(ranked, start=1):
            cur.execute(
                """
                INSERT INTO rankings (company_id, window, cts_score, delta, rank, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s)
                ON CONFLICT (company_id, window) DO UPDATE SET
                  delta = EXCLUDED.cts_score - rankings.cts_score,
                  cts_score = EXCLUDED.cts_score,
                  rank = EXCLUDED.rank,
                  updated_at = EXCLUDED.updated_at
                """,
                (
                    company_id,
                    window,
                    values["cts_score"],
                    values["cts_score"],
                    idx,
                    values["updated_at"],
                ),
            )


def cleanup_old_aggregates(conn) -> None:
    cutoff = datetime.utcnow() - timedelta(days=730)
    with conn.cursor() as cur:
        cur.execute(
            \"\"\"\n            DELETE FROM agg_windows WHERE updated_at < %s\n            \"\"\",\n            (cutoff,),
        )
        cur.execute(
            \"\"\"\n            DELETE FROM rankings WHERE updated_at < %s\n            \"\"\",\n            (cutoff,),
        )


def run():
    settings = get_settings()
    conn = get_connection()
    now = datetime.utcnow()
    source_count = len(settings.source_allowlist) or len(ADAPTERS) or 1

    for window, hours in WINDOWS.items():
        current_start = now - timedelta(hours=hours)
        previous_start = now - timedelta(hours=hours * 2)

        current = fetch_metrics(conn, current_start, now)
        previous = fetch_metrics(conn, previous_start, current_start)
        company_ids = fetch_company_ids(conn)

        metrics: dict[int, dict] = {}
        for company_id in company_ids:
            current_metrics = current.get(company_id, WindowMetrics(0, 0, 0, 0))
            prev_metrics = previous.get(company_id, WindowMetrics(0, 0, 0, 0))
            one_star_delta = safe_pct_delta(current_metrics.one_star, prev_metrics.one_star)
            complaint_velocity = safe_pct_delta(current_metrics.total, prev_metrics.total)
            negative_momentum = safe_pct_delta(current_metrics.negative, prev_metrics.negative)
            source_diversity = (current_metrics.sources / source_count) * 100.0

            momentum_score = compute_momentum_score(
                complaint_velocity,
                negative_momentum,
                source_diversity,
            )

            metrics[company_id] = {
                "complaint_count": current_metrics.total,
                "one_star_delta": one_star_delta,
                "complaint_velocity": complaint_velocity,
                "negative_momentum": negative_momentum,
                "source_diversity": source_diversity,
                "cts_score": momentum_score,
                "updated_at": now,
            }

        upsert_aggregates(conn, window, metrics)
        update_rankings(conn, window, metrics)

    cleanup_old_aggregates(conn)


if __name__ == "__main__":
    run()
