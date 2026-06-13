import re
from dataclasses import dataclass


@dataclass
class TextChunk:
    index: int
    content: str
    token_count: int
    metadata: dict


HEADING_PATTERN = re.compile(
    r"(?im)^(abstract|introduction|problem|objectives|methodology|methods|results|conclusion|references|"
    r"ملخص|مقدمة|مشكلة|الأهداف|اهداف|أهداف|منهجية|المنهجية|نتائج|خاتمة|المراجع)\s*$"
)


def normalize_for_chunking(text: str) -> str:
    cleaned = re.sub(r"\r\n?", "\n", text or "")
    cleaned = re.sub(r"[ \t]+", " ", cleaned)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    return cleaned.strip()


def simple_token_count(text: str) -> int:
    return len(re.findall(r"\w+", text or ""))


def detect_section_name(block: str, fallback: str = "general") -> str:
    first_line = (block.strip().splitlines() or [""])[0].strip()
    return first_line[:80] if HEADING_PATTERN.match(first_line) else fallback


def split_large_block(block: str, max_tokens: int, overlap_tokens: int) -> list[str]:
    words = re.findall(r"\S+", block)
    if len(words) <= max_tokens:
        return [block.strip()] if block.strip() else []

    chunks = []
    start = 0
    step = max(1, max_tokens - overlap_tokens)
    while start < len(words):
        window = words[start:start + max_tokens]
        chunks.append(" ".join(window).strip())
        if start + max_tokens >= len(words):
            break
        start += step
    return chunks


def semantic_chunks(text: str, max_tokens: int = 750, overlap_tokens: int = 120) -> list[TextChunk]:
    """Create stable academic chunks while preserving coarse section metadata."""
    normalized = normalize_for_chunking(text)
    if not normalized:
        return []

    blocks = [item.strip() for item in re.split(r"\n\s*\n", normalized) if item.strip()]
    merged_blocks: list[tuple[str, str]] = []
    current = ""
    current_section = "general"

    for block in blocks:
        section = detect_section_name(block, current_section)
        if section != current_section and HEADING_PATTERN.match(block.strip().splitlines()[0].strip()):
            if current.strip():
                merged_blocks.append((current_section, current.strip()))
            current = block
            current_section = section
            continue

        proposed = f"{current}\n\n{block}".strip() if current else block
        if simple_token_count(proposed) > max_tokens:
            if current.strip():
                merged_blocks.append((current_section, current.strip()))
            current = block
            current_section = section
        else:
            current = proposed
            current_section = section

    if current.strip():
        merged_blocks.append((current_section, current.strip()))

    chunks: list[TextChunk] = []
    for section, block in merged_blocks:
        for part in split_large_block(block, max_tokens, overlap_tokens):
            chunks.append(TextChunk(
                index=len(chunks),
                content=part,
                token_count=simple_token_count(part),
                metadata={"section": section}
            ))

    return chunks
