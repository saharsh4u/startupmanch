from __future__ import annotations

from langdetect import detect, LangDetectException


def detect_language(text: str) -> str | None:
    if not text:
        return None
    try:
        return detect(text)
    except LangDetectException:
        return None
