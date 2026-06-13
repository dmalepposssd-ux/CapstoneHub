import json
import os
import urllib.request
from typing import Any


LLM_PROVIDER = os.getenv("LLM_PROVIDER", "disabled").lower()
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")


def llm_enabled() -> bool:
    return LLM_PROVIDER == "openai" and bool(OPENAI_API_KEY)


def build_prompt(query: str, evidence: list[dict[str, Any]], task: str) -> str:
    evidence_text = "\n\n".join(
        f"[{index + 1}] {item.get('title')} ({item.get('source_type')} #{item.get('source_id')})\n"
        f"Similarity: {item.get('similarity')}\n"
        f"Snippet: {item.get('snippet') or item.get('content', '')[:700]}"
        for index, item in enumerate(evidence)
    )
    return f"""
You are an Arabic academic graduation-project assistant.
Answer in Arabic.
Use only the evidence below for factual claims.
If evidence is insufficient, clearly say what is missing.

Task: {task}
Student query:
{query}

Evidence:
{evidence_text}

Return a concise structured answer with:
1. Direct answer
2. Evidence-based analysis
3. Practical recommendations
4. Missing information or risks
""".strip()


def openai_chat(prompt: str) -> str:
    payload = {
        "model": OPENAI_MODEL,
        "messages": [
            {"role": "system", "content": "You are a careful Arabic academic assistant. Ground every answer in provided evidence."},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.2,
    }
    request = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {OPENAI_API_KEY}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=45) as response:
        data = json.loads(response.read().decode("utf-8"))
    return data["choices"][0]["message"]["content"].strip()


def synthesize_with_llm(query: str, grounded_response: dict[str, Any], task: str) -> dict[str, Any]:
    if not llm_enabled():
        return {
            **grounded_response,
            "llm_provider": "disabled",
            "llm_used": False,
        }

    prompt = build_prompt(query, grounded_response.get("evidence", []), task)
    try:
        answer = openai_chat(prompt)
        return {
            **grounded_response,
            "answer": answer,
            "llm_provider": LLM_PROVIDER,
            "llm_model": OPENAI_MODEL,
            "llm_used": True,
        }
    except Exception as exc:
        return {
            **grounded_response,
            "llm_provider": LLM_PROVIDER,
            "llm_model": OPENAI_MODEL,
            "llm_used": False,
            "llm_error": str(exc),
        }
