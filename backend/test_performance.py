"""
Performance Testing Script for Optimized RAG Backend
Tests response time improvements with and without caching
"""

import requests
import time
import json

BASE_URL = "http://localhost:8000"

def clear_cache():
    """Clear the response cache"""
    try:
        response = requests.post(f"{BASE_URL}/api/cache/clear")
        print(f"✅ Cache cleared: {response.json()}")
    except Exception as e:
        print(f"❌ Failed to clear cache: {e}")

def test_query(query, profile=None, test_name="Query"):
    """Test a single query and measure response time"""
    start_time = time.time()
    
    payload = {
        "message": query,
        "profile": profile,
        "history": []
    }
    
    try:
        response = requests.post(
            f"{BASE_URL}/api/chat",
            json=payload,
            headers={"Content-Type": "application/json"}
        )
        
        end_time = time.time()
        elapsed = end_time - start_time
        
        if response.status_code == 200:
            data = response.json()
            print(f"✅ {test_name}: {elapsed:.2f}s")
            print(f"   Response: {data['response'][:100]}...")
            print(f"   Sources: {data['sources']}")
            return elapsed
        else:
            print(f"❌ {test_name} failed: {response.status_code}")
            return None
    except Exception as e:
        print(f"❌ {test_name} error: {e}")
        return None

def get_status():
    """Get bot status"""
    try:
        response = requests.get(f"{BASE_URL}/api/status")
        print(f"📊 Bot Status: {response.json()}")
    except Exception as e:
        print(f"❌ Failed to get status: {e}")

def main():
    print("=" * 60)
    print("RAG PERFORMANCE TEST")
    print("=" * 60)
    
    # Check status
    print("\n📊 Checking bot status...")
    get_status()
    
    # Test queries
    test_queries = [
        "What is PPF?",
        "Tell me about NPS scheme",
        "What are the tax benefits of ELSS?",
        "How does 80C deduction work?"
    ]
    
    print("\n" + "=" * 60)
    print("TEST 1: First-time queries (no cache)")
    print("=" * 60)
    
    clear_cache()
    time.sleep(0.5)
    
    first_times = []
    for i, query in enumerate(test_queries, 1):
        print(f"\n[{i}/{len(test_queries)}] Testing: {query}")
        elapsed = test_query(query, test_name=f"First run")
        if elapsed:
            first_times.append(elapsed)
        time.sleep(1)  # Small delay between queries
    
    print("\n" + "=" * 60)
    print("TEST 2: Cached queries (should be much faster)")
    print("=" * 60)
    
    cached_times = []
    for i, query in enumerate(test_queries, 1):
        print(f"\n[{i}/{len(test_queries)}] Testing: {query}")
        elapsed = test_query(query, test_name=f"Cached run")
        if elapsed:
            cached_times.append(elapsed)
        time.sleep(0.5)
    
    # Calculate statistics
    print("\n" + "=" * 60)
    print("PERFORMANCE SUMMARY")
    print("=" * 60)
    
    if first_times and cached_times:
        avg_first = sum(first_times) / len(first_times)
        avg_cached = sum(cached_times) / len(cached_times)
        improvement = ((avg_first - avg_cached) / avg_first) * 100
        
        print(f"\n📈 Average Response Times:")
        print(f"   First-time queries:  {avg_first:.2f}s")
        print(f"   Cached queries:      {avg_cached:.2f}s")
        print(f"   Speed improvement:   {improvement:.1f}%")
        print(f"   Speedup factor:      {avg_first/avg_cached:.1f}x")
        
        print(f"\n📊 Individual Query Times:")
        print(f"   {'Query':<40} {'First':<10} {'Cached':<10} {'Speedup':<10}")
        print(f"   {'-'*40} {'-'*10} {'-'*10} {'-'*10}")
        for i, query in enumerate(test_queries):
            if i < len(first_times) and i < len(cached_times):
                speedup = first_times[i] / cached_times[i]
                print(f"   {query[:40]:<40} {first_times[i]:.2f}s     {cached_times[i]:.2f}s     {speedup:.1f}x")
    
    print("\n" + "=" * 60)
    print("TEST 3: Profile-specific query")
    print("=" * 60)
    
    profile = {
        "age": 30,
        "income": "5-10 lakhs",
        "employmentStatus": "Salaried",
        "taxRegime": "Old Regime",
        "homeownerStatus": "Rented"
    }
    
    clear_cache()
    time.sleep(0.5)
    
    print("\nFirst run with profile:")
    t1 = test_query("What tax deductions am I eligible for?", profile, "Profile query (first)")
    
    print("\nCached run with same profile:")
    time.sleep(0.5)
    t2 = test_query("What tax deductions am I eligible for?", profile, "Profile query (cached)")
    
    if t1 and t2:
        print(f"\n   Profile query speedup: {t1/t2:.1f}x")
    
    print("\n" + "=" * 60)
    print("✅ TESTING COMPLETE")
    print("=" * 60)
    print("\nExpected Results:")
    print("   ✅ First-time queries: 2-3 seconds")
    print("   ✅ Cached queries: 0.1-0.5 seconds")
    print("   ✅ Speed improvement: 80-90%")
    print("   ✅ Speedup factor: 5-10x")

if __name__ == "__main__":
    main()
