import os

import numpy as np
from sklearn.feature_extraction.text import HashingVectorizer
from sklearn.preprocessing import normalize


EMBEDDING_DIMENSION = 768
MODEL_NAME = os.getenv("EMBEDDING_MODEL", "hashing-vectorizer-768")
_sentence_model = None
_sentence_model_failed = False


_vectorizer = HashingVectorizer(
    analyzer="char_wb",
    ngram_range=(3, 5),
    n_features=EMBEDDING_DIMENSION,
    alternate_sign=False,
    norm=None,
    lowercase=True,
)


def embedding_model_name() -> str:
    return MODEL_NAME


def _fit_dimension(vector: list[float]) -> list[float]:
    if len(vector) == EMBEDDING_DIMENSION:
        return vector
    if len(vector) > EMBEDDING_DIMENSION:
        return vector[:EMBEDDING_DIMENSION]
    return vector + [0.0] * (EMBEDDING_DIMENSION - len(vector))


def _load_sentence_model():
    global _sentence_model, _sentence_model_failed
    if _sentence_model or _sentence_model_failed:
        return _sentence_model
    if MODEL_NAME == "hashing-vectorizer-768":
        return None
    try:
        from sentence_transformers import SentenceTransformer

        _sentence_model = SentenceTransformer(MODEL_NAME)
    except Exception:
        _sentence_model_failed = True
        _sentence_model = None
    return _sentence_model


def embed_texts(texts: list[str]) -> list[list[float]]:
    """Embedding adapter with graceful fallback.

    If EMBEDDING_MODEL points to a sentence-transformers model, it is used.
    Otherwise the local HashingVectorizer fallback gives pgvector a stable
    768-dimensional vector without requiring a model download.
    """
    if not texts:
        return []

    model = _load_sentence_model()
    if model:
        vectors = model.encode(texts, normalize_embeddings=True, show_progress_bar=False)
        return [_fit_dimension([float(value) for value in vector]) for vector in vectors]

    matrix = _vectorizer.transform(texts)
    matrix = normalize(matrix, norm="l2", axis=1)
    return matrix.astype(np.float32).toarray().tolist()


def embed_query(text: str) -> list[float]:
    return embed_texts([text])[0]
