from urllib.parse import quote_plus

from ..base import BaseAdapter
from ..keywords import COMPLAINT_KEYWORDS
from ..models import Company, RawEvent


class GooglePlayAdapter(BaseAdapter):
    source_name = "google_play"

    def build_seed_urls(self, company: Company, since_ts):
        query = quote_plus(company.name)
        return [
            f"https://play.google.com/store/search?q={query}&c=apps&hl=en&gl=in"
        ]

    def parse_events(self, html: str, company: Company, url: str) -> list[RawEvent]:
        snippets = self.extract_snippets(html, COMPLAINT_KEYWORDS)
        return self.build_events_from_snippets(company, url, snippets)
