"""
Pre-warm utilities for Arth-Mitra backend.

Loads models into memory and pre-computes common query embeddings
so the first user request is fast instead of cold-starting.
"""

import time


# Common Indian finance queries — embeddings are cached at startup
WARMUP_QUERIES = [
    "section 80c deductions",
    "new tax regime slabs 2024-25",
    "PPF interest rate",
    "senior citizen savings scheme SCSS",
    "NPS tax benefits 80CCD",
    "HRA exemption calculation",
    "home loan tax benefit section 24",
    "ELSS mutual fund tax saving",
    "income tax filing deadline",
    "standard deduction salaried employees",
    "sukanya samriddhi yojana eligibility",
    "capital gains tax on property",
    "TDS on salary",
    "health insurance premium deduction 80D",
    "old regime vs new regime comparison",
]


def warmup_embeddings(embeddings):
    """Pre-compute embeddings for common queries to warm up the model and cache."""
    print("🔥 Warming up embedding model with common queries...")
    start = time.time()
    count = 0
    for query in WARMUP_QUERIES:
        try:
            embeddings.embed_query(query)
            count += 1
        except Exception as e:
            print(f"  ⚠️ Warmup query failed: {e}")
    elapsed = time.time() - start
    print(f"✅ Warmed up {count} query embeddings in {elapsed:.1f}s")


def warmup_vectorstore(vectorstore):
    """Run a dummy query to load ChromaDB index into memory."""
    print("🔥 Loading ChromaDB index into memory...")
    start = time.time()
    try:
        count = vectorstore._collection.count()
        if count > 0:
            vectorstore.similarity_search("tax", k=1)
        elapsed = time.time() - start
        print(f"✅ ChromaDB ready ({count} chunks indexed) in {elapsed:.1f}s")
    except Exception as e:
        print(f"⚠️ ChromaDB warmup skipped: {e}")


def full_warmup(bot):
    """
    Run complete warmup sequence after bot initialization.
    Call this during FastAPI lifespan startup.
    """
    if not bot._initialized:
        print("⚠️ Bot not initialized — skipping warmup")
        return

    total_start = time.time()

    if bot.embeddings:
        warmup_embeddings(bot.embeddings)

    if bot.vectorstore:
        warmup_vectorstore(bot.vectorstore)

    total_elapsed = time.time() - total_start
    print(f"🚀 All systems warmed up and ready ({total_elapsed:.1f}s total)")
