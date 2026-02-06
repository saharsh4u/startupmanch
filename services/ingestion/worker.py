from __future__ import annotations

import argparse
import json
import logging
from datetime import datetime

from .companies import fetch_companies
from .config import get_settings
from .db import get_connection, insert_events_with_sentiment
from .errors import SkipSource
from .language import detect_language
from .health import update_source_health
from .models import Task
from .queue import LocalQueue, SqsQueue, parse_task
from .robots import RobotsChecker
from .sentiment import score_sentiment
from .sources import ADAPTERS


def build_logger(level: str) -> logging.Logger:
    logging.basicConfig(level=level)
    return logging.getLogger("yenduku.worker")


def handle_task(task: Task, logger: logging.Logger) -> None:
    settings = get_settings()
    adapter_cls = ADAPTERS.get(task.source)
    if not adapter_cls:
        logger.warning("Unknown source %s", task.source)
        return

    robots = RobotsChecker(settings.user_agent)
    adapter = adapter_cls(settings, robots)

    conn = get_connection()
    companies = fetch_companies(conn)
    try:
        adapter.ensure_enabled()
    except SkipSource as exc:
        logger.info("Source %s skipped: %s", task.source, exc)
        update_source_health(conn, task.source, had_error=False)
        return

    total_inserted = 0
    had_error = False
    for company in companies:
        try:
            events = adapter.fetch_events(company, task.since_ts)
        except Exception as exc:
            logger.warning(
                "Source %s company %s failed: %s",
                task.source,
                company.name,
                exc,
            )
            had_error = True
            continue
        enriched = []
        for event in events:
            event.language = detect_language(event.text)
            sentiment_score, is_negative = score_sentiment(event.text)
            enriched.append((event, sentiment_score, is_negative))
        inserted = insert_events_with_sentiment(conn, enriched)
        total_inserted += inserted
        logger.info(
            "Source %s company %s inserted %s events",
            task.source,
            company.name,
            inserted,
        )

    logger.info("Source %s total inserted %s", task.source, total_inserted)
    consecutive = update_source_health(conn, task.source, had_error)
    if consecutive >= 2:
        logger.warning(\"ALERT: Source %s failed %s consecutive runs\", task.source, consecutive)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--once", action="store_true", help="Process a single batch")
    parser.add_argument("--local", action="store_true", help="Use local in-memory queue")
    args = parser.parse_args()

    settings = get_settings()
    logger = build_logger(settings.log_level)

    queue = LocalQueue() if args.local or not settings.sqs_queue_url else SqsQueue()

    while True:
        messages = queue.poll(max_messages=5)
        if not messages:
            if args.once:
                break
            continue
        for message in messages:
            task = parse_task(message)
            logger.info("Processing task %s", task)
            handle_task(task, logger)
            queue.delete(message.get("ReceiptHandle", ""))
        if args.once:
            break


if __name__ == "__main__":
    main()
