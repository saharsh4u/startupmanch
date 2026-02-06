from datetime import datetime
from urllib.parse import quote_plus

import feedparser

from ..base import BaseAdapter
from ..dedupe import make_hash
from ..models import Company, RawEvent


class NewsRssAdapter(BaseAdapter):
    source_name = "news_rss"

    def fetch_events(self, company: Company, since_ts):
        query = quote_plus(company.name)
        feed_url = (
            "https://news.google.com/rss/search?q="
            f"{query}%20India&hl=en-IN&gl=IN&ceid=IN:en"
        )
        feed = feedparser.parse(feed_url)
        events: list[RawEvent] = []
        for entry in feed.entries[:10]:
            published = entry.get("published_parsed")
            created = datetime.utcnow()
            if published:
                created = datetime(*published[:6])
            if since_ts and created < since_ts:
                continue
            title = entry.get("title", "").strip()
            summary = entry.get("summary", "").strip()
            text = " - ".join(filter(None, [title, summary]))
            if not text:
                continue
            url = entry.get("link", feed_url)
            events.append(
                RawEvent(
                    source=self.source_name,
                    company_id=company.id,
                    url=url,
                    text=text,
                    rating=None,
                    language=None,
                    created_at=created,
                    hash=make_hash(self.source_name, url, text),
                )
            )
        return events
