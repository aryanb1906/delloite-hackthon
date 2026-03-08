"""
ONNX-accelerated embeddings with built-in LRU caching.

Falls back to standard HuggingFace if ONNX runtime is not available.
Uses the same model (all-MiniLM-L6-v2) so existing ChromaDB vectors remain compatible.
"""

import threading
from collections import OrderedDict
from typing import List

from langchain_core.embeddings import Embeddings


class OptimizedEmbeddings(Embeddings):
    """
    LangChain-compatible embeddings with:
    1. ONNX acceleration (2-3x faster inference on CPU)
    2. Built-in LRU cache for repeated queries
    3. Graceful fallback to standard HuggingFace
    """

    def __init__(
        self,
        model_name: str = "sentence-transformers/all-MiniLM-L6-v2",
        cache_size: int = 1000,
    ):
        self._use_onnx = False
        self._hf_model = None
        self._st_model = None
        self._cache: OrderedDict = OrderedDict()
        self._cache_size = cache_size
        self._lock = threading.Lock()

        # Try ONNX-accelerated loading via sentence-transformers >= 3.0
        try:
            import onnxruntime  # noqa: F401 — ensure onnxruntime is installed

            from sentence_transformers import SentenceTransformer

            self._st_model = SentenceTransformer(
                model_name,
                backend="onnx",
                model_kwargs={
                    "file_name": "onnx/model_O2.onnx",  # O2 optimized: best speed/quality
                    "provider": "CPUExecutionProvider",   # CPU-only, avoids TensorRT/CUDA warnings
                },
            )
            self._use_onnx = True
            print("⚡ Using ONNX-accelerated embeddings (2-3x faster on CPU)")
        except Exception as e:
            print(
                f"ℹ️  ONNX not available ({type(e).__name__}: {e}), "
                "using standard HuggingFace embeddings"
            )
            from langchain_huggingface import HuggingFaceEmbeddings

            self._hf_model = HuggingFaceEmbeddings(
                model_name=model_name,
                model_kwargs={"device": "cpu"},
                encode_kwargs={"normalize_embeddings": True, "batch_size": 32},
            )

    # ── Cache helpers ─────────────────────────────────────────────

    def _cache_get(self, key: str):
        with self._lock:
            if key in self._cache:
                self._cache.move_to_end(key)
                return self._cache[key]
        return None

    def _cache_set(self, key: str, value):
        with self._lock:
            self._cache[key] = value
            self._cache.move_to_end(key)
            while len(self._cache) > self._cache_size:
                self._cache.popitem(last=False)

    # ── LangChain Embeddings interface ────────────────────────────

    def embed_query(self, text: str) -> List[float]:
        """Embed a single query with LRU caching."""
        cache_key = text.strip().lower()
        cached = self._cache_get(cache_key)
        if cached is not None:
            return cached

        if self._use_onnx:
            result = (
                self._st_model.encode(
                    [text], normalize_embeddings=True, batch_size=1
                )[0]
                .tolist()
            )
        else:
            result = self._hf_model.embed_query(text)

        self._cache_set(cache_key, result)
        return result

    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        """Embed multiple documents with batch processing."""
        if self._use_onnx:
            return (
                self._st_model.encode(
                    texts,
                    normalize_embeddings=True,
                    batch_size=32,
                    show_progress_bar=False,
                )
                .tolist()
            )
        return self._hf_model.embed_documents(texts)

    # ── Utilities ─────────────────────────────────────────────────

    def clear_cache(self):
        """Clear the embedding LRU cache."""
        with self._lock:
            self._cache.clear()

    def cache_stats(self) -> dict:
        """Return cache statistics."""
        return {
            "cached_embeddings": len(self._cache),
            "max_size": self._cache_size,
            "using_onnx": self._use_onnx,
        }
