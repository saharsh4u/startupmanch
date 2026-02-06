from .consumer_complaints import ConsumerComplaintsAdapter
from .google_maps import GoogleMapsAdapter
from .google_play import GooglePlayAdapter
from .mouthshut import MouthShutAdapter
from .news_comments import NewsCommentsAdapter
from .news_rss import NewsRssAdapter
from .quora import QuoraAdapter
from .reddit import RedditAdapter
from .x import XAdapter

ADAPTERS = {
    "google_maps": GoogleMapsAdapter,
    "google_play": GooglePlayAdapter,
    "x": XAdapter,
    "mouthshut": MouthShutAdapter,
    "consumer_complaints": ConsumerComplaintsAdapter,
    "reddit": RedditAdapter,
    "quora": QuoraAdapter,
    "news_comments": NewsCommentsAdapter,
    "news_rss": NewsRssAdapter,
}
