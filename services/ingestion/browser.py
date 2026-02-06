from __future__ import annotations

import time
from playwright.sync_api import sync_playwright

from .config import Settings


class BrowserSession:
    def __init__(self, settings: Settings):
        self.settings = settings
        self._playwright = None
        self._browser = None

    def __enter__(self):
        self._playwright = sync_playwright().start()
        self._browser = self._playwright.chromium.launch(headless=True)
        return self

    def __exit__(self, exc_type, exc, tb):
        if self._browser:
            self._browser.close()
        if self._playwright:
            self._playwright.stop()

    def fetch_html(self, url: str) -> str | None:
        if not self._browser:
            raise RuntimeError("Browser not started")
        page = self._browser.new_page(user_agent=self.settings.user_agent)
        try:
            page.goto(url, timeout=self.settings.request_timeout * 1000)
            page.wait_for_timeout(self.settings.rate_limit_seconds * 1000)
            return page.content()
        finally:
            page.close()
