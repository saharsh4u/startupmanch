from ..base import BaseAdapter
from ..errors import SkipSource


class QuoraAdapter(BaseAdapter):
    source_name = "quora"

    def ensure_enabled(self) -> None:
        if not self.settings.quora_api_key:
            raise SkipSource("Quora API access not configured")

    def fetch_events(self, company: Company, since_ts):
        raise SkipSource("Quora API integration pending explicit permission")
