from urllib.parse import quote_plus

from ..base import BaseAdapter
from ..keywords import COMPLAINT_KEYWORDS
from ..models import Company, RawEvent


class NewsCommentsAdapter(BaseAdapter):
    source_name = "news_comments"

    def build_seed_urls(self, company: Company, since_ts):
        query = quote_plus(f"{company.name} complaint site:news")
        return [f"https://news.google.com/search?q={query}&hl=en-IN&gl=IN&ceid=IN:en"]

    def parse_events(self, html: str, company: Company, url: str) -> list[RawEvent]:
        snippets = self.extract_snippets(html, COMPLAINT_KEYWORDS)
        return self.build_events_from_snippets(company, url, snippets)
