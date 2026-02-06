from __future__ import annotations

import argparse
from datetime import datetime, timedelta

from .config import get_settings
from .models import Task
from .queue import LocalQueue, SqsQueue
from .sources import ADAPTERS


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--local", action="store_true", help="Use local in-memory queue")
    parser.add_argument(
        "--since-minutes",
        type=int,
        default=5,
        help="Fetch data since N minutes ago",
    )
    args = parser.parse_args()

    settings = get_settings()
    queue = LocalQueue() if args.local or not settings.sqs_queue_url else SqsQueue()

    since_ts = datetime.utcnow() - timedelta(minutes=args.since_minutes)

    allowlist = settings.source_allowlist or list(ADAPTERS.keys())
    tasks = [Task(source=source, since_ts=since_ts) for source in allowlist]

    queue.enqueue_many(tasks)


if __name__ == "__main__":
    main()
