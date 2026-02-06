from __future__ import annotations

import time
import urllib.robotparser
from dataclasses import dataclass
from typing import Dict
from urllib.parse import urlparse

import requests


@dataclass
class RobotsCacheEntry:
    parser: urllib.robotparser.RobotFileParser
    fetched_at: float


class RobotsChecker:
    def __init__(self, user_agent: str, ttl_seconds: int = 3600):
        self.user_agent = user_agent
        self.ttl_seconds = ttl_seconds
        self._cache: Dict[str, RobotsCacheEntry] = {}

    def _fetch_parser(self, base_url: str) -> urllib.robotparser.RobotFileParser:
        robots_url = f"{base_url}/robots.txt"
        parser = urllib.robotparser.RobotFileParser()
        try:
            response = requests.get(robots_url, timeout=10)
            if response.status_code >= 400:
                parser.parse("")
            else:
                parser.parse(response.text.splitlines())
        except requests.RequestException:
            parser.parse("")
        return parser

    def allowed(self, url: str) -> bool:
        parsed = urlparse(url)
        base_url = f"{parsed.scheme}://{parsed.netloc}"
        entry = self._cache.get(base_url)
        now = time.time()
        if not entry or now - entry.fetched_at > self.ttl_seconds:
            parser = self._fetch_parser(base_url)
            self._cache[base_url] = RobotsCacheEntry(parser=parser, fetched_at=now)
            entry = self._cache[base_url]
        return entry.parser.can_fetch(self.user_agent, url)
