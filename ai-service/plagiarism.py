import hashlib
import re
from typing import Any


def normalize_sentence(text: str) -> str:
    text = (text or "").lower()
    text = re.sub(r"[أإآ]", "ا", text)
    text = re.sub(r"ة", "ه", text)
    text = re.sub(r"ى", "ي", text)
    text = re.sub(r"[^a-z0-9\u0621-\u064a\s]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def words(text: str) -> list[str]:
    return re.findall(r"[a-z0-9\u0621-\u064a]{2,}", normalize_sentence(text))


def shingles(text: str, size: int = 5) -> set[str]:
    tokens = words(text)
    if len(tokens) < size:
        return {" ".join(tokens)} if tokens else set()
    return {" ".join(tokens[index:index + size]) for index in range(len(tokens) - size + 1)}


def stable_hash(value: str, seed: int = 0) -> int:
    digest = hashlib.blake2b(f"{seed}:{value}".encode("utf-8"), digest_size=8).digest()
    return int.from_bytes(digest, "big")


def minhash_signature(items: set[str], permutations: int = 64) -> list[int]:
    if not items:
        return [0] * permutations
    return [min(stable_hash(item, seed) for item in items) for seed in range(permutations)]


def minhash_similarity(left: list[int], right: list[int]) -> float:
    if not left or not right or len(left) != len(right):
        return 0.0
    return sum(1 for a, b in zip(left, right) if a == b) / len(left)


def jaccard(left: set[str], right: set[str]) -> float:
    if not left or not right:
        return 0.0
    return len(left & right) / len(left | right)


def compare_against_chunks(text: str, candidates: list[dict[str, Any]], threshold: float = 0.12) -> dict[str, Any]:
    source_shingles = shingles(text)
    source_signature = minhash_signature(source_shingles)
    matches = []

    for candidate in candidates:
        candidate_shingles = shingles(candidate.get("content", ""))
        exact = jaccard(source_shingles, candidate_shingles)
        estimate = minhash_similarity(source_signature, minhash_signature(candidate_shingles))
        score = max(exact, estimate)
        if score >= threshold:
            matches.append({
                "chunk_id": candidate.get("chunk_id"),
                "document_id": candidate.get("document_id"),
                "source_type": candidate.get("source_type"),
                "source_id": candidate.get("source_id"),
                "title": candidate.get("title"),
                "chunk_index": candidate.get("chunk_index"),
                "jaccard_similarity": round(exact * 100, 2),
                "minhash_estimate": round(estimate * 100, 2),
                "risk_score": round(score * 100, 2),
                "snippet": " ".join((candidate.get("content") or "").split())[:420],
            })

    matches = sorted(matches, key=lambda item: item["risk_score"], reverse=True)[:10]
    max_score = matches[0]["risk_score"] if matches else 0
    if max_score >= 55:
        level = "high"
    elif max_score >= 25:
        level = "medium"
    elif max_score > 0:
        level = "low"
    else:
        level = "none"

    return {
        "checked_shingles": len(source_shingles),
        "candidate_chunks": len(candidates),
        "similarity_level": level,
        "max_similarity": max_score,
        "matches": matches,
        "method": "Sentence-normalized word shingles with Jaccard similarity and deterministic MinHash estimate",
    }
