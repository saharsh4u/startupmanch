from urllib.parse import quote_plus

from ..base import BaseAdapter
from ..keywords import COMPLAINT_KEYWORDS
from ..models import Company, RawEvent


class GoogleMapsAdapter(BaseAdapter):
    source_name = "google_maps"

    def build_seed_urls(self, company: Company, since_ts):
        query = quote_plus(f"{company.name} complaints")
        return [f"https://www.google.com/maps/search/{query}?hl=en&gl=in"]

    def parse_events(self, html: str, company: Company, url: str) -> list[RawEvent]:
        snippets = self.extract_snippets(html, COMPLAINT_KEYWORDS)
        return self.build_events_from_snippets(company, url, snippets)
