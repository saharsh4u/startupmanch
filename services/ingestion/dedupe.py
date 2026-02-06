import hashlib


def make_hash(source: str, url: str, text: str) -> str:
    payload = f"{source}|{url}|{text}".encode("utf-8")
    return hashlib.sha256(payload).hexdigest()
