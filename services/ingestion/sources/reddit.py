from datetime import datetime
from urllib.parse import quote_plus

import requests

from ..base import BaseAdapter
from ..errors import SkipSource
from ..models import Company, RawEvent
from ..dedupe import make_hash


class RedditAdapter(BaseAdapter):
    source_name = "reddit"

    def ensure_enabled(self) -> None:
        if not (self.settings.reddit_client_id and self.settings.reddit_client_secret):
            raise SkipSource("Missing Reddit API credentials")
        if not self.settings.reddit_user_agent:
            raise SkipSource("Missing Reddit user agent")

    def _get_token(self) -> str:
        auth = (self.settings.reddit_client_id, self.settings.reddit_client_secret)
        data = {"grant_type": "client_credentials"}
        headers = {"User-Agent": self.settings.reddit_user_agent}
        response = requests.post(
            "https://www.reddit.com/api/v1/access_token",
            auth=auth,
            data=data,
            headers=headers,
            timeout=self.settings.request_timeout,
        )
        response.raise_for_status()
        return response.json().get("access_token", "")

    def fetch_events(self, company: Company, since_ts):
        token = self._get_token()
        if not token:
            raise SkipSource("Unable to obtain Reddit token")
        query_terms = [company.name] + company.aliases
        query = quote_plus(" OR ".join(query_terms))
        headers = {
            "Authorization": f"bearer {token}",
            "User-Agent": self.settings.reddit_user_agent,
        }
        params = {"q": query, "sort": "new", "limit": 10}
        response = requests.get(
            "https://oauth.reddit.com/search",
            headers=headers,
            params=params,
            timeout=self.settings.request_timeout,
        )
        response.raise_for_status()
        data = response.json()
        events: list[RawEvent] = []
        for child in data.get("data", {}).get("children", []):
            post = child.get("data", {})
            created = datetime.utcfromtimestamp(post.get("created_utc", 0))
            if since_ts and created < since_ts:
                continue
            title = post.get("title", "").strip()
            body = post.get("selftext", "").strip()
            text = " - ".join(filter(None, [title, body]))
            if not text:
                continue
            url = f"https://www.reddit.com{post.get('permalink', '')}"
            events.append(
                RawEvent(
                    source=self.source_name,
                    company_id=company.id,
                    url=url,
                    text=text,
                    rating=None,
                    language=post.get("lang"),
                    created_at=created,
                    hash=make_hash(self.source_name, url, text),
                )
            )
        return events
