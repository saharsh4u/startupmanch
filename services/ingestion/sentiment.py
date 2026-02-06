from __future__ import annotations

from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer


_analyzer = SentimentIntensityAnalyzer()


def score_sentiment(text: str) -> tuple[float, bool]:
    result = _analyzer.polarity_scores(text or "")
    compound = result.get("compound", 0.0)
    return compound, compound <= -0.05
