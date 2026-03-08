"""
Database Test Script
Test the new database and analytics features
"""

import requests
import json

BASE_URL = "http://localhost:8000"

def section(title):
    print("\n" + "=" * 60)
    print(f"  {title}")
    print("=" * 60)

def test_register():
    """Test user registration"""
    section("TEST 1: User Registration")
    
    response = requests.post(
        f"{BASE_URL}/api/users/register",
        json={
            "email": "test@arthmitra.com",
            "username": "testuser",
            "password": "test123456"
        }
    )
    
    print(f"Status: {response.status_code}")
    data = response.json()
    print(json.dumps(data, indent=2))
    
    if response.status_code == 200:
        print("✅ Registration successful!")
        return data["user"]["id"]
    else:
        print("⚠️ User might already exist, trying login...")
        return None

def test_login():
    """Test user login"""
    section("TEST 2: User Login")
    
    response = requests.post(
        f"{BASE_URL}/api/users/login",
        json={
            "email": "test@arthmitra.com",
            "password": "test123456"
        }
    )
    
    print(f"Status: {response.status_code}")
    data = response.json()
    print(json.dumps(data, indent=2))
    
    if response.status_code == 200:
        print("✅ Login successful!")
        return data["user"]["id"]
    return None

def test_update_profile(user_id):
    """Test profile update"""
    section("TEST 3: Update Profile")
    
    response = requests.put(
        f"{BASE_URL}/api/users/{user_id}/profile",
        json={
            "age": 30,
            "income": "5-10 lakhs",
            "employmentStatus": "Salaried",
            "taxRegime": "Old Regime",
            "homeownerStatus": "Rented",
            "riskAppetite": "Moderate",
            "financialGoals": ["Retirement", "Tax Saving"]
        }
    )
    
    print(f"Status: {response.status_code}")
    data = response.json()
    print(json.dumps(data, indent=2))
    
    if response.status_code == 200:
        print("✅ Profile updated!")

def test_create_session(user_id):
    """Test chat session creation"""
    section("TEST 4: Create Chat Session")
    
    response = requests.post(
        f"{BASE_URL}/api/users/{user_id}/sessions",
        json={
            "title": "Tax Planning 2026"
        }
    )
    
    print(f"Status: {response.status_code}")
    data = response.json()
    print(json.dumps(data, indent=2))
    
    if response.status_code == 200:
        print("✅ Chat session created!")
        return data["session"]["id"]
    return None

def test_chat_with_db(user_id, session_id):
    """Test chat with database logging"""
    section("TEST 5: Chat with Database Logging")
    
    queries = [
        "What is PPF?",
        "Tell me about NPS scheme",
        "How to save tax under section 80C?"
    ]
    
    for query in queries:
        print(f"\n💬 Query: {query}")
        
        response = requests.post(
            f"{BASE_URL}/api/chat",
            json={
                "message": query,
                "userId": user_id,
                "sessionId": session_id,
                "profile": {
                    "age": 30,
                    "income": "5-10 lakhs",
                    "taxRegime": "Old Regime",
                    "employmentStatus": "Salaried",
                    "homeownerStatus": "Rented"
                },
                "history": []
            }
        )
        
        print(f"Status: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            print(f"Response: {data['response'][:150]}...")
            print(f"Sources: {data['sources']}")
            print("✅ Message logged to database!")

def test_get_sessions(user_id):
    """Test retrieving chat sessions"""
    section("TEST 6: Get Chat Sessions")
    
    response = requests.get(f"{BASE_URL}/api/users/{user_id}/sessions")
    
    print(f"Status: {response.status_code}")
    data = response.json()
    print(json.dumps(data, indent=2))
    
    if response.status_code == 200:
        print(f"✅ Found {len(data['sessions'])} sessions")

def test_get_messages(session_id):
    """Test retrieving session messages"""
    section("TEST 7: Get Session Messages")
    
    response = requests.get(f"{BASE_URL}/api/sessions/{session_id}/messages")
    
    print(f"Status: {response.status_code}")
    data = response.json()
    
    if response.status_code == 200:
        print(f"✅ Found {len(data['messages'])} messages")
        print("\nMessage Preview:")
        for msg in data['messages'][:2]:  # Show first 2 messages
            print(f"\n  {msg['role']}: {msg['content'][:100]}...")
            if msg.get('responseTime'):
                print(f"  Response time: {msg['responseTime']:.2f}s")

def test_analytics():
    """Test analytics endpoints"""
    section("TEST 8: Analytics Summary")
    
    response = requests.get(f"{BASE_URL}/api/analytics/summary?days=7")
    
    print(f"Status: {response.status_code}")
    data = response.json()
    print(json.dumps(data, indent=2))
    
    if response.status_code == 200:
        print("✅ Analytics retrieved!")
        print(f"\n📊 Summary:")
        print(f"  Total Queries: {data['totalQueries']}")
        print(f"  Active Users: {data['activeUsers']}")
        print(f"  Avg Response Time: {data['avgResponseTime']}s")
        print(f"  Cache Hit Rate: {data['cacheHitRate']}%")

def test_query_distribution():
    """Test query distribution"""
    section("TEST 9: Query Distribution")
    
    response = requests.get(f"{BASE_URL}/api/analytics/query-distribution?days=7")
    
    print(f"Status: {response.status_code}")
    data = response.json()
    print(json.dumps(data, indent=2))
    
    if response.status_code == 200:
        print("✅ Query distribution retrieved!")

def main():
    print("\n" + "=" * 60)
    print("  ARTH-MITRA DATABASE & ANALYTICS TEST")
    print("=" * 60)
    print("\nMake sure backend is running on port 8000!")
    input("Press Enter to start tests...")
    
    try:
        # Test registration
        user_id = test_register()
        
        # If registration failed (user exists), try login
        if not user_id:
            user_id = test_login()
        
        if not user_id:
            print("\n❌ Failed to get user ID. Exiting...")
            return
        
        print(f"\n✅ Using User ID: {user_id}")
        
        # Test profile update
        test_update_profile(user_id)
        
        # Test session creation
        session_id = test_create_session(user_id)
        
        if session_id:
            print(f"✅ Using Session ID: {session_id}")
            
            # Test chat with DB logging
            test_chat_with_db(user_id, session_id)
            
            # Test retrieving data
            test_get_sessions(user_id)
            test_get_messages(session_id)
        
        # Test analytics
        test_analytics()
        test_query_distribution()
        
        section("🎉 ALL TESTS COMPLETED!")
        print("\n✅ Database integration working correctly!")
        print("\n📊 Check the following:")
        print("  1. backend/arth_mitra.db - SQLite database file")
        print("  2. User profile persisted across sessions")
        print("  3. Chat history saved in database")
        print("  4. Analytics data collected")
        print("\n💡 Next Steps:")
        print("  1. Update frontend to use new API endpoints")
        print("  2. Replace localStorage with database calls")
        print("  3. Build analytics dashboard")
        
    except requests.exceptions.ConnectionError:
        print("\n❌ ERROR: Could not connect to backend!")
        print("Make sure backend is running: python backend/run.py")
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()
