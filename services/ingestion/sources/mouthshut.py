from urllib.parse import quote_plus

from ..base import BaseAdapter
from ..keywords import COMPLAINT_KEYWORDS
from ..models import Company, RawEvent


class MouthShutAdapter(BaseAdapter):
    source_name = "mouthshut"

    def build_seed_urls(self, company: Company, since_ts):
        query = quote_plus(company.name)
        return [f"https://www.mouthshut.com/search?q={query}"]

    def parse_events(self, html: str, company: Company, url: str) -> list[RawEvent]:
        snippets = self.extract_snippets(html, COMPLAINT_KEYWORDS)
        return self.build_events_from_snippets(company, url, snippets)
