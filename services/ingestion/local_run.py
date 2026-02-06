from __future__ import annotations

from datetime import datetime, timedelta

from .config import get_settings
from .models import Task
from .sources import ADAPTERS
from .worker import handle_task, build_logger


def main():
    settings = get_settings()
    logger = build_logger(settings.log_level)
    since_ts = datetime.utcnow() - timedelta(minutes=15)
    for source in settings.source_allowlist or list(ADAPTERS.keys()):
        handle_task(Task(source=source, since_ts=since_ts), logger)


if __name__ == "__main__":
    main()
