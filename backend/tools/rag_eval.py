import argparse
import json
import os
import statistics
import sys
import time
from typing import Dict, List, Tuple, Any

sys.path.append(os.path.dirname(os.path.dirname(__file__)))

from bot import ArthMitraBot


def load_queries(path: str) -> List[Any]:
    if not path:
        return [
            "Summarize key points from the Finance Bill 2025-26",
            "What are the benefits and eligibility of PPF?",
            "How does SCSS work and what is the interest rate?",
            "Explain Sukanya Samriddhi Account Scheme rules",
            "What is the latest income tax slab for FY 2025-26?",
            "Compare PPF vs NSC for a salaried person",
            "What schemes are available for senior citizens?",
            "What are the major changes in tax reform?",
        ]

    with open(path, "r", encoding="utf-8") as handle:
        if path.endswith(".json"):
            payload = json.load(handle)
            if isinstance(payload, list):
                return payload
            if isinstance(payload, dict) and "queries" in payload:
                return payload["queries"]
            raise ValueError("Unsupported JSON format. Use a list or { 'queries': [...] }.")

        return [line.strip() for line in handle if line.strip()]


def parse_case(item: Any) -> Dict[str, Any]:
    if isinstance(item, str):
        return {
            "query": item,
            "expectedClauses": [],
            "expectedSources": [],
            "requiresGap": False,
        }
    if isinstance(item, dict):
        return {
            "query": str(item.get("query", "")).strip(),
            "expectedClauses": [str(x).lower() for x in item.get("expectedClauses", [])],
            "expectedSources": [str(x).lower() for x in item.get("expectedSources", [])],
            "requiresGap": bool(item.get("requiresGap", False)),
        }
    return {
        "query": str(item),
        "expectedClauses": [],
        "expectedSources": [],
        "requiresGap": False,
    }


def is_default_sources(sources: List[str]) -> bool:
    if not sources:
        return True
    return sources == ["General Knowledge - No documents indexed yet"] or sources == ["Knowledge Base"]


def measure_query(bot: ArthMitraBot, case: Dict[str, Any], profile: Dict) -> Tuple[Dict, List[str]]:
    query = case["query"]
    retrieval_ms = None
    docs = []
    if bot._retriever is not None:
        start = time.perf_counter()
        docs = bot._retriever.invoke(query)
        retrieval_ms = (time.perf_counter() - start) * 1000

    start = time.perf_counter()
    result = bot.get_response(query, profile=profile)
    total_ms = (time.perf_counter() - start) * 1000

    sources = result.get("sources", [])
    response_text = result.get("response", "")
    doc_sources = []
    for doc in docs:
        source = doc.metadata.get("source", "Unknown")
        doc_sources.append(os.path.basename(source))

    retrieved_clauses = sorted({
        str(doc.metadata.get("clause", "")).lower()
        for doc in docs
        if doc.metadata.get("clause")
    })

    expected_clauses = case.get("expectedClauses", [])
    expected_sources = case.get("expectedSources", [])
    requires_gap = case.get("requiresGap", False)

    clause_hits = 0
    if expected_clauses:
        clause_hits = sum(1 for clause in expected_clauses if clause in retrieved_clauses)
    clause_precision = round(clause_hits / max(len(retrieved_clauses), 1), 3) if expected_clauses else None
    clause_recall = round(clause_hits / max(len(expected_clauses), 1), 3) if expected_clauses else None

    lower_sources = [s.lower() for s in sources]
    source_hits = 0
    if expected_sources:
        source_hits = sum(1 for src in expected_sources if any(src in found for found in lower_sources))
    citation_accuracy = round(source_hits / max(len(expected_sources), 1), 3) if expected_sources else None

    response_l = response_text.lower()
    gap_detected = any(k in response_l for k in ["gap", "missing", "not enough evidence", "recommendation"])
    gap_accuracy = 1.0 if requires_gap == gap_detected else 0.0

    return {
        "query": query,
        "retrieval_ms": retrieval_ms,
        "total_ms": total_ms,
        "source_count": len(sources),
        "sources": sources,
        "retrieved_docs": len(docs),
        "retrieved_doc_sources": sorted(set(doc_sources)),
        "retrieved_clauses": retrieved_clauses,
        "expected_clauses": expected_clauses,
        "expected_sources": expected_sources,
        "requires_gap": requires_gap,
        "clause_precision": clause_precision,
        "clause_recall": clause_recall,
        "citation_accuracy": citation_accuracy,
        "gap_detection_accuracy": gap_accuracy,
        "response_chars": len(response_text),
        "used_default_sources": is_default_sources(sources),
    }, sources


def summarize(results: List[Dict]) -> Dict:
    total_times = [item["total_ms"] for item in results]
    retrieval_times = [item["retrieval_ms"] for item in results if item["retrieval_ms"] is not None]
    source_counts = [item["source_count"] for item in results]
    retrieved_docs = [item["retrieved_docs"] for item in results]
    response_sizes = [item["response_chars"] for item in results]
    non_default = [item for item in results if not is_default_sources(item["sources"])]
    default_count = len(results) - len(non_default)
    all_sources = sorted({source for item in results for source in item["sources"]})
    clause_precisions = [item["clause_precision"] for item in results if item.get("clause_precision") is not None]
    clause_recalls = [item["clause_recall"] for item in results if item.get("clause_recall") is not None]
    citation_scores = [item["citation_accuracy"] for item in results if item.get("citation_accuracy") is not None]
    gap_scores = [item["gap_detection_accuracy"] for item in results]

    def quantile(values: List[float], n: int, index: int) -> float | None:
        if len(values) < 2:
            return None
        return round(statistics.quantiles(values, n=n)[index], 2)

    def safe_stdev(values: List[float]) -> float | None:
        if len(values) < 2:
            return None
        return round(statistics.stdev(values), 2)

    summary = {
        "queries": len(results),
        "avg_total_ms": round(statistics.mean(total_times), 2),
        "median_total_ms": round(statistics.median(total_times), 2),
        "min_total_ms": round(min(total_times), 2),
        "max_total_ms": round(max(total_times), 2),
        "std_total_ms": safe_stdev(total_times),
        "p90_total_ms": quantile(total_times, 10, -1),
        "p95_total_ms": quantile(total_times, 20, -1),
        "p99_total_ms": quantile(total_times, 100, -1),
        "avg_retrieval_ms": round(statistics.mean(retrieval_times), 2) if retrieval_times else None,
        "median_retrieval_ms": round(statistics.median(retrieval_times), 2) if retrieval_times else None,
        "p95_retrieval_ms": quantile(retrieval_times, 20, -1) if retrieval_times else None,
        "avg_retrieved_docs": round(statistics.mean(retrieved_docs), 2) if retrieved_docs else 0,
        "avg_sources": round(statistics.mean(source_counts), 2) if source_counts else 0,
        "coverage_rate": round((len(non_default) / len(results)) * 100, 2) if results else 0,
        "unique_sources": len(all_sources),
        "default_source_rate": round((default_count / len(results)) * 100, 2) if results else 0,
        "avg_response_chars": round(statistics.mean(response_sizes), 2) if response_sizes else 0,
        "precision_at_k": round(statistics.mean(clause_precisions), 3) if clause_precisions else None,
        "clause_recall": round(statistics.mean(clause_recalls), 3) if clause_recalls else None,
        "citation_accuracy": round(statistics.mean(citation_scores), 3) if citation_scores else None,
        "gap_detection_accuracy": round(statistics.mean(gap_scores), 3) if gap_scores else None,
    }
    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description="Quick RAG diagnostics for Arth-Mitra")
    parser.add_argument("--queries", help="Path to queries file (.txt or .json)", default="")
    parser.add_argument("--out", help="Optional JSON output path", default="")
    args = parser.parse_args()

    bot = ArthMitraBot().initialize(auto_index=True)
    try:
        doc_count = bot.vectorstore._collection.count()
    except Exception:
        doc_count = 0

    profile = {
        "age": 30,
        "income": "₹10 LPA",
        "employmentStatus": "Salaried",
        "taxRegime": "Old Regime",
        "homeownerStatus": "Rented",
    }

    queries = load_queries(args.queries)
    results = []

    for raw_case in queries:
        case = parse_case(raw_case)
        if not case["query"]:
            continue
        item, _ = measure_query(bot, case, profile)
        results.append(item)
        print(f"\nQuery: {case['query']}")
        print(f"  Retrieval ms: {item['retrieval_ms']}")
        print(f"  Total ms: {item['total_ms']}")
        print(f"  Sources ({item['source_count']}): {', '.join(item['sources'])}")
        if item.get("clause_precision") is not None:
            print(f"  Clause precision: {item['clause_precision']}")
        if item.get("citation_accuracy") is not None:
            print(f"  Citation accuracy: {item['citation_accuracy']}")
        print(f"  Gap detection accuracy: {item['gap_detection_accuracy']}")

    summary = summarize(results)
    print("\n=== RAG Summary ===")
    print(f"Documents indexed: {doc_count}")
    print(f"Queries: {summary['queries']}")
    print(f"Avg total ms: {summary['avg_total_ms']}")
    print(f"Median total ms: {summary['median_total_ms']}")
    print(f"Min total ms: {summary['min_total_ms']}")
    print(f"Max total ms: {summary['max_total_ms']}")
    print(f"Std total ms: {summary['std_total_ms']}")
    print(f"P90 total ms: {summary['p90_total_ms']}")
    print(f"P95 total ms: {summary['p95_total_ms']}")
    print(f"P99 total ms: {summary['p99_total_ms']}")
    print(f"Avg retrieval ms: {summary['avg_retrieval_ms']}")
    print(f"Median retrieval ms: {summary['median_retrieval_ms']}")
    print(f"P95 retrieval ms: {summary['p95_retrieval_ms']}")
    print(f"Avg retrieved docs: {summary['avg_retrieved_docs']}")
    print(f"Avg sources: {summary['avg_sources']}")
    print(f"Coverage rate: {summary['coverage_rate']}%")
    print(f"Unique sources: {summary['unique_sources']}")
    print(f"Default source rate: {summary['default_source_rate']}%")
    print(f"Avg response length (chars): {summary['avg_response_chars']}")
    print(f"Precision@k: {summary['precision_at_k']}")
    print(f"Clause recall: {summary['clause_recall']}")
    print(f"Citation accuracy: {summary['citation_accuracy']}")
    print(f"Gap detection accuracy: {summary['gap_detection_accuracy']}")

    print("\n=== Easy Words ===")
    print("Speed (average time): Avg total ms")
    print("Speed (typical time): Median total ms")
    print("Speed (worst cases): P90/P95/P99 total ms")
    print("Retrieval speed: Avg/Median/P95 retrieval ms")
    print("Docs used per answer: Avg retrieved docs")
    print("Sources shown per answer: Avg sources")
    print("Coverage: % answers with real document sources")
    print("Default source rate: % answers with no real docs")
    print("Unique sources: How many different docs were cited")
    print("Response length: Avg response length (chars)")

    if args.out:
        payload = {
            "summary": summary,
            "results": results,
        }
        with open(args.out, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, indent=2)
        print(f"\nSaved report to: {args.out}")


if __name__ == "__main__":
    main()
