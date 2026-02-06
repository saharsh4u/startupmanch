from __future__ import annotations

from typing import List

from .models import Company


def fetch_companies(conn) -> List[Company]:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, name, sector, revenue, aliases, featured_free
            FROM companies
            WHERE active = true
            ORDER BY id ASC
            """
        )
        rows = cur.fetchall()
    return [
        Company(
            id=row[0],
            name=row[1],
            sector=row[2],
            revenue=row[3],
            aliases=row[4] or [],
            featured_free=row[5] if len(row) > 5 else False,
        )
        for row in rows
    ]
