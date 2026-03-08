"""
Multi-layer cache for RAG responses.

L1: In-memory OrderedDict with LRU eviction (fast, volatile)
L2: JSON files on disk (persistent across restarts)
"""

import hashlib
import json
import os
import threading
import time
from collections import OrderedDict
from typing import Any, Dict, Optional


class MultiLayerCache:
    """
    Two-layer response cache with identical API to the old ResponseCache:
      - L1 (memory): OrderedDict with LRU, ~microsecond access
      - L2 (disk):   JSON files, ~millisecond access, survives restarts
    """

    def __init__(
        self,
        memory_max: int = 200,
        disk_dir: str = "response_cache",
        ttl_hours: int = 24,
    ):
        self._memory: OrderedDict = OrderedDict()
        self._memory_max = memory_max
        self._disk_dir = disk_dir
        self._ttl = ttl_hours * 3600
        self._lock = threading.Lock()
        self._stats = {"l1_hits": 0, "l2_hits": 0, "misses": 0}

        os.makedirs(disk_dir, exist_ok=True)

    # ── Key generation (same logic as old ResponseCache) ──────────

    @staticmethod
    def _make_key(query: str, profile: Optional[Dict] = None) -> str:
        cache_data: Dict[str, Any] = {"query": query.lower().strip()}
        if profile:
            cache_data["profile"] = {
                "age": profile.get("age"),
                "income": profile.get("income"),
                "taxRegime": profile.get("taxRegime"),
            }
        return hashlib.md5(
            json.dumps(cache_data, sort_keys=True).encode()
        ).hexdigest()

    # ── L1: In-memory ─────────────────────────────────────────────

    def _mem_get(self, key: str) -> Optional[Any]:
        with self._lock:
            if key in self._memory:
                data, ts = self._memory[key]
                if time.time() - ts < self._ttl:
                    self._memory.move_to_end(key)
                    return data
                del self._memory[key]
        return None

    def _mem_set(self, key: str, data: Any):
        with self._lock:
            self._memory[key] = (data, time.time())
            self._memory.move_to_end(key)
            while len(self._memory) > self._memory_max:
                self._memory.popitem(last=False)

    # ── L2: Disk ──────────────────────────────────────────────────

    def _disk_path(self, key: str) -> str:
        return os.path.join(self._disk_dir, f"{key}.json")

    def _disk_get(self, key: str) -> Optional[Any]:
        path = self._disk_path(key)
        if not os.path.exists(path):
            return None
        try:
            with open(path, "r", encoding="utf-8") as fh:
                entry = json.load(fh)
            if time.time() - entry.get("ts", 0) < self._ttl:
                return entry["data"]
            # Expired – clean up
            try:
                os.remove(path)
            except OSError:
                pass
        except (json.JSONDecodeError, OSError, KeyError):
            pass
        return None

    def _disk_set(self, key: str, data: Any):
        path = self._disk_path(key)
        try:
            with open(path, "w", encoding="utf-8") as fh:
                json.dump(
                    {"data": data, "ts": time.time()}, fh, ensure_ascii=False
                )
        except (OSError, TypeError):
            pass  # Skip disk caching for non-serialisable data

    # ── Public API (drop-in compatible with old ResponseCache) ────

    def get(self, query: str, profile: Optional[Dict] = None) -> Optional[Dict]:
        """Retrieve a cached response (L1 → L2 → miss)."""
        key = self._make_key(query, profile)

        # L1 check
        result = self._mem_get(key)
        if result is not None:
            self._stats["l1_hits"] += 1
            return result

        # L2 check
        result = self._disk_get(key)
        if result is not None:
            self._stats["l2_hits"] += 1
            self._mem_set(key, result)  # Promote to L1
            return result

        self._stats["misses"] += 1
        return None

    def set(self, query: str, response: Dict, profile: Optional[Dict] = None):
        """Store a response in both L1 and L2."""
        key = self._make_key(query, profile)
        self._mem_set(key, response)
        self._disk_set(key, response)

    def clear(self):
        """Flush both cache layers."""
        with self._lock:
            self._memory.clear()
        # Remove disk cache files
        try:
            for fname in os.listdir(self._disk_dir):
                if fname.endswith(".json"):
                    try:
                        os.remove(os.path.join(self._disk_dir, fname))
                    except OSError:
                        pass
        except OSError:
            pass
        self._stats = {"l1_hits": 0, "l2_hits": 0, "misses": 0}

    def stats(self) -> dict:
        """Return cache performance statistics."""
        total = sum(self._stats.values())
        hit_count = self._stats["l1_hits"] + self._stats["l2_hits"]
        return {
            **self._stats,
            "total_requests": total,
            "hit_rate": f"{(hit_count / max(total, 1)) * 100:.1f}%",
            "memory_entries": len(self._memory),
        }
