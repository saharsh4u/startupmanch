from urllib.parse import quote_plus

from ..base import BaseAdapter
from ..keywords import COMPLAINT_KEYWORDS
from ..models import Company, RawEvent


class ConsumerComplaintsAdapter(BaseAdapter):
    source_name = "consumer_complaints"

    def build_seed_urls(self, company: Company, since_ts):
        query = quote_plus(company.name)
        return [f"https://www.consumercomplaints.in/?search={query}"]

    def parse_events(self, html: str, company: Company, url: str) -> list[RawEvent]:
        snippets = self.extract_snippets(html, COMPLAINT_KEYWORDS)
        return self.build_events_from_snippets(company, url, snippets)
