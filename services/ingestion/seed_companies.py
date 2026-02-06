from __future__ import annotations

import csv
import json
from pathlib import Path

from .db import get_connection


def main():
    seed_path = Path(__file__).parent / "companies_seed.csv"
    refs_path = Path(__file__).parent / "source_refs.json"
    source_refs = {}
    if refs_path.exists():
        source_refs = json.loads(refs_path.read_text())
    conn = get_connection()
    with seed_path.open() as file:
        reader = csv.DictReader(file)
        with conn.cursor() as cur:
            for row in reader:
                aliases = [alias.strip() for alias in (row.get("aliases") or "").split("|") if alias.strip()]
                refs = [ref.strip() for ref in (row.get("source_refs") or "").split("|") if ref.strip()]
                cur.execute(
                    """
                    INSERT INTO companies (name, sector, revenue, aliases, featured_free, active)
                    VALUES (%s, %s, %s, %s, TRUE, TRUE)
                    ON CONFLICT (name) DO UPDATE SET
                      sector = EXCLUDED.sector,
                      revenue = EXCLUDED.revenue,
                      aliases = EXCLUDED.aliases,
                      featured_free = TRUE,
                      active = TRUE
                    """,
                    (row.get("name"), row.get("sector"), row.get("revenue"), aliases),
                )
                if refs:
                    cur.execute("SELECT id FROM companies WHERE name = %s", (row.get("name"),))
                    company_id_row = cur.fetchone()
                    if company_id_row:
                        company_id = company_id_row[0]
                        for ref in refs:
                            ref_entry = source_refs.get(ref, {})
                            cur.execute(
                                """
                                INSERT INTO company_sources (company_id, source_label, source_url)
                                VALUES (%s, %s, %s)
                                ON CONFLICT (company_id, source_label) DO NOTHING
                                """,
                                (company_id, ref, ref_entry.get("url")),
                            )


if __name__ == "__main__":
    main()
