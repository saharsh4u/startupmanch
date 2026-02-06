from datetime import datetime

import requests

from ..base import BaseAdapter
from ..dedupe import make_hash
from ..errors import SkipSource
from ..models import Company, RawEvent


class XAdapter(BaseAdapter):
    source_name = "x"

    def ensure_enabled(self) -> None:
        if not self.settings.x_bearer_token:
            raise SkipSource("Missing X API bearer token")

    def fetch_events(self, company: Company, since_ts):
        query_terms = [company.name] + company.aliases
        query = " OR ".join([f'\"{term}\"' for term in query_terms if term])
        if not query:
            return []
        query = f"{query} -is:retweet lang:en"
        params = {
            "query": query,
            "max_results": 10,
            "tweet.fields": "created_at,lang",
        }
        if since_ts:
            params["start_time"] = since_ts.replace(microsecond=0).isoformat() + "Z"
        response = requests.get(
            "https://api.x.com/2/tweets/search/recent",
            headers={"Authorization": f"Bearer {self.settings.x_bearer_token}"},
            params=params,
            timeout=self.settings.request_timeout,
        )
        response.raise_for_status()
        payload = response.json()
        events: list[RawEvent] = []
        for tweet in payload.get("data", []):
            text = tweet.get("text", "").strip()
            if not text:
                continue
            created_at = tweet.get("created_at")
            created = (
                datetime.fromisoformat(created_at.replace("Z", "+00:00"))
                if created_at
                else datetime.utcnow()
            )
            url = f"https://x.com/i/web/status/{tweet.get('id')}"
            events.append(
                RawEvent(
                    source=self.source_name,
                    company_id=company.id,
                    url=url,
                    text=text,
                    rating=None,
                    language=tweet.get("lang"),
                    created_at=created,
                    hash=make_hash(self.source_name, url, text),
                )
            )
        return events
