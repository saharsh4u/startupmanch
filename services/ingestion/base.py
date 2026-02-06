from __future__ import annotations

from datetime import datetime
from typing import List

from bs4 import BeautifulSoup

from .browser import BrowserSession
from .config import Settings
from .dedupe import make_hash
from .models import Company, RawEvent
from .robots import RobotsChecker


class BaseAdapter:
    source_name: str = ""

    def __init__(self, settings: Settings, robots: RobotsChecker):
        self.settings = settings
        self.robots = robots

    def build_seed_urls(self, company: Company, since_ts: datetime | None) -> list[str]:
        return []

    def ensure_enabled(self) -> None:
        return None

    def parse_events(self, html: str, company: Company, url: str) -> List[RawEvent]:
        return []

    def fetch_events(self, company: Company, since_ts: datetime | None) -> List[RawEvent]:
        urls = self.build_seed_urls(company, since_ts)
        events: List[RawEvent] = []

        with BrowserSession(self.settings) as browser:
            for url in urls[: self.settings.max_pages]:
                if not self.robots.allowed(url):
                    continue
                html = browser.fetch_html(url)
                if not html:
                    continue
                events.extend(self.parse_events(html, company, url))

        return events

    def soup(self, html: str) -> BeautifulSoup:
        return BeautifulSoup(html, "html.parser")

    def extract_snippets(self, html: str, keywords: list[str], limit: int = 5) -> list[str]:
        soup = self.soup(html)
        texts = []
        for tag in soup.find_all(["p", "span", "div", "li"]):
            text = " ".join(tag.get_text(strip=True).split())
            if len(text) < 40:
                continue
            if any(keyword.lower() in text.lower() for keyword in keywords):
                texts.append(text)
            if len(texts) >= limit:
                break
        return texts

    def build_events_from_snippets(self, company: Company, url: str, snippets: list[str]) -> list[RawEvent]:
        events = []
        for snippet in snippets:
            events.append(
                RawEvent(
                    source=self.source_name,
                    company_id=company.id,
                    url=url,
                    text=snippet,
                    rating=None,
                    language=None,
                    hash=make_hash(self.source_name, url, snippet),
                )
            )
        return events
