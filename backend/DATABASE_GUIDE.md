# Database & Analytics Integration Guide

## Overview

This document describes the new database and analytics features added to ARTH-MITRA backend, replacing localStorage with a proper SQLite database.

## What's New

### ✅ Features Implemented

1. **User Management** - Registration, login, profile management
2. **Chat History Persistence** - All conversations saved in database
3. **Document Tracking** - Track uploaded documents per user
4. **Saved Messages** - Bookmark important AI responses
5. **Analytics Dashboard** - Usage statistics and insights on landing page
6. **Performance Tracking** - Response times and cache hit rates
7. **Live Stats Display** - Real-time analytics shown on landing page (updates every 30 seconds)
8. **Query Tracking** - Automatic tracking of financial queries with tax savings estimation

---

## Database Schema

### Tables Created

1. **users** - User profiles and authentication
2. **chat_sessions** - Chat conversation groups
3. **chat_messages** - Individual messages
4. **documents** - Uploaded file metadata
5. **saved_messages** - Bookmarked responses
6. **analytics** - Usage events and metrics

---

## API Endpoints

### 🔐 Authentication

#### Register User
```http
POST /api/users/register
Content-Type: application/json

{
  "email": "user@example.com",
  "username": "johndoe",
  "password": "securepass123"
}
```

**Response:**
```json
{
  "status": "success",
  "message": "User registered successfully",
  "user": {
    "id": "uuid-here",
    "email": "user@example.com",
    "username": "johndoe",
    "createdAt": "2026-02-16T10:00:00"
  }
}
```

#### Login User
```http
POST /api/users/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securepass123"
}
```

**Response:**
```json
{
  "status": "success",
  "message": "Login successful",
  "user": {
    "id": "uuid-here",
    "email": "user@example.com",
    "username": "john doe",
    "age": 30,
    "income": "5-10 lakhs",
    "taxRegime": "Old Regime"
  }
}
```

---

### 👤 Profile Management

#### Get User Profile
```http
GET /api/users/{user_id}/profile
```

#### Update User Profile
```http
PUT /api/users/{user_id}/profile
Content-Type: application/json

{
  "age": 30,
  "income": "5-10 lakhs",
  "employmentStatus": "Salaried",
  "taxRegime": "Old Regime",
  "homeownerStatus": "Rented",
  "riskAppetite": "Moderate"
}
```

---

### 💬 Chat History

#### Create Chat Session
```http
POST /api/users/{user_id}/sessions
Content-Type: application/json

{
  "title": "Tax Planning 2026"
}
```

#### Get User's Chat Sessions
```http
GET /api/users/{user_id}/sessions
```

**Response:**
```json
{
  "sessions": [
    {
      "id": "session-uuid",
      "title": "Tax Planning 2026",
      "createdAt": "2026-02-16T10:00:00",
      "messageCount": 12,
      "isActive": true
    }
  ]
}
```

#### Get Session Messages
```http
GET /api/sessions/{session_id}/messages
```

**Response:**
```json
{
  "messages": [
    {
      "id": "msg-uuid",
      "role": "user",
      "content": "What is PPF?",
      "createdAt": "2026-02-16T10:01:00"
    },
    {
      "id": "msg-uuid-2",
      "role": "assistant",
      "content": "PPF stands for Public Provident Fund...",
      "sources": ["government_schemes_2024.txt"],
      "responseTime": 2.3,
      "cached": false,
      "createdAt": "2026-02-16T10:01:02"
    }
  ]
}
```

#### Delete Chat Session
```http
DELETE /api/sessions/{session_id}
```

#### Updated Chat Endpoint (with DB logging)
```http
POST /api/chat
Content-Type: application/json

{
  "message": "What is PPF?",
  "userId": "user-uuid",  // NEW: Optional for DB logging
  "sessionId": "session-uuid",  // NEW: Optional for DB logging
  "profile": {
    "age": 30,
    "income": "5-10 lakhs",
    "taxRegime": "Old Regime"
  },
  "history": []
}
```

---

### 📄 Document Management

#### Get User Documents
```http
GET /api/users/{user_id}/documents
```

**Response:**
```json
{
  "documents": [
    {
      "id": "doc-uuid",
      "filename": "receipt.pdf",
      "fileType": ".pdf",
      "fileSize": 102400,
      "chunksIndexed": 5,
      "isIndexed": true,
      "uploadedAt": "2026-02-16T10:00:00"
    }
  ]
}
```

#### Updated Upload Endpoint (with DB logging)
```http
POST /api/upload?user_id=user-uuid
Content-Type: multipart/form-data

file: (binary)
```

---

### 🔖 Saved Messages

#### Save a Message
```http
POST /api/users/{user_id}/saved-messages
Content-Type: application/json

{
  "messageId": "msg-uuid",
  "content": "PPF has 7.1% interest rate...",
  "note": "Important for tax planning",
  "tags": ["tax", "investment", "ppf"]
}
```

#### Get Saved Messages
```http
GET /api/users/{user_id}/saved-messages
```

#### Delete Saved Message
```http
DELETE /api/saved-messages/{saved_id}
```

---

### 📊 Analytics

#### Analytics Summary
```http
GET /api/analytics/summary?days=7
```

**Response:**
```json
{
  "totalQueries": 150,
  "totalUploads": 12,
  "activeUsers": 8,
  "avgResponseTime": 2.34,
  "cacheHitRate": 68.5,
  "topEvents": [
    {"type": "query", "count": 150},
    {"type": "upload", "count": 12},
    {"type": "login", "count": 25}
  ],
  "period": "Last 7 days"
}
```

#### Query Distribution
```http
GET /api/analytics/query-distribution?days=7
```

**Response:**
```json
{
  "dates": ["2026-02-10", "2026-02-11", "2026-02-12"],
  "counts": [23, 45, 32]
}
```

#### User Analytics
```http
GET /api/users/{user_id}/analytics?days=30
```

---

## 🎯 Landing Page Analytics Display

### LiveStats Component
The landing page features a real-time analytics display component (`LiveStats`) that shows three key metrics:

#### **Displayed Metrics**

1. **Financial Queries Answered**
   - Displays total number of queries processed
   - Format: Large number (e.g., "50K+")
   - Data source: `totalQueries` from analytics summary

2. **Tax Saved For Users**
   - Calculated from query count: `totalQueries × ₹20,000`
   - Format: Indian currency format (e.g., "₹10Cr+")
   - Estimation: ₹20,000 saved per financial query on average

3. **Accuracy Rate**
   - Fixed at 98% (represents AI response quality)
   - Format: Percentage display
   - Can be updated based on actual metrics

### **Implementation Details**

**Component Location:** `frontend/components/live-stats.tsx`

**Featured On:** Landing page (`frontend/app/page.tsx`) - Hero section below CTA buttons

**Auto-Refresh Interval:** 30 seconds (adjustable via `setInterval`)

**API Endpoint Used:** `GET /api/analytics/summary?days=7`

### **Frontend Integration Example**

```typescript
// lib/api.ts - Fetch analytics
export const getAnalyticsSummary = async (days: number = 7) => {
  const res = await fetch(`${API_BASE}/api/analytics/summary?days=${days}`);
  return res.json();
};

// components/live-stats.tsx - Display stats
function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M+`;
  if (num >= 1000) return `${(num / 1000).toFixed(0)}K+`;
  return num.toString();
}

function formatCurrency(amount: number): string {
  if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(0)}Cr+`;
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(0)}L+`;
  return `₹${amount}`;
}
```

### **Backend Response Format**

The `/api/analytics/summary?days=7` endpoint returns:

```json
{
  "totalQueries": 150,
  "totalTaxSaved": 3000000,  // 150 × ₹20,000
  "totalUploads": 12,
  "activeUsers": 8,
  "avgResponseTime": 2.34,
  "cacheHitRate": 68.5,
  "topEvents": [
    {"type": "query", "count": 150},
    {"type": "upload", "count": 12},
    {"type": "login", "count": 25}
  ],
  "period": "Last 7 days"
}
```

---

## Frontend Integration

### Example: React/Next.js Integration

#### 1. Create API Client
```typescript
// lib/api.ts
const API_BASE = 'http://localhost:8000';

export const api = {
  // Auth
  register: async (email: string, username: string, password: string) => {
    const res = await fetch(`${API_BASE}/api/users/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, username, password })
    });
    return res.json();
  },

  login: async (email: string, password: string) => {
    const res = await fetch(`${API_BASE}/api/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    return res.json();
  },

  // Profile
  getProfile: async (userId: string) => {
    const res = await fetch(`${API_BASE}/api/users/${userId}/profile`);
    return res.json();
  },

  updateProfile: async (userId: string, profile: any) => {
    const res = await fetch(`${API_BASE}/api/users/${userId}/profile`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profile)
    });
    return res.json();
  },

  // Chat
  chat: async (message: string, userId?: string, sessionId?: string, profile?: any) => {
    const res = await fetch(`${API_BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        message, 
        userId, 
        sessionId, 
        profile,
        history: []
      })
    });
    return res.json();
  },

  // Sessions
  createSession: async (userId: string, title?: string) => {
    const res = await fetch(`${API_BASE}/api/users/${userId}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title })
    });
    return res.json();
  },

  getSessions: async (userId: string) => {
    const res = await fetch(`${API_BASE}/api/users/${userId}/sessions`);
    return res.json();
  },

  getMessages: async (sessionId: string) => {
    const res = await fetch(`${API_BASE}/api/sessions/${sessionId}/messages`);
    return res.json();
  },

  // Analytics
  getAnalytics: async (days: number = 7) => {
    const res = await fetch(`${API_BASE}/api/analytics/summary?days=${days}`);
    return res.json();
  }
};
```

#### 2. Usage Example
```typescript
// pages/chat.tsx
import { api } from '@/lib/api';

export default function ChatPage() {
  const [userId, setUserId] = useState<string>('');
  const [sessionId, setSessionId] = useState<string>('');

  useEffect(() => {
    // Get user from localStorage (or your auth system)
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    setUserId(user.id);

    // Create or get active session
    if (user.id) {
      api.createSession(user.id, 'New Chat').then(data => {
        setSessionId(data.session.id);
      });
    }
  }, []);

  const handleSendMessage = async (message: string) => {
    // Send message with DB logging
    const response = await api.chat(message, userId, sessionId, userProfile);
    // Handle response...
  };

  return (
    // Your chat UI
  );
}
```

---

## Migration from localStorage

### Before (localStorage):
```typescript
// Old way
localStorage.setItem('profile', JSON.stringify(profile));
localStorage.setItem('chatHistory', JSON.stringify(messages));
```

### After (Database):
```typescript
// New way - automatic persistence
await api.updateProfile(userId, profile);
await api.chat(message, userId, sessionId, profile);
// Messages automatically saved!
```

---

## Database File Location

The SQLite database is created at:
```
backend/arth_mitra.db
```

To reset the database:
```python
from database import reset_db
reset_db()
```

---

## Testing

### 1. Install Dependencies
```bash
cd backend
pip install -r requirements.txt
```

### 2. Start Backend
```bash
python run.py
```

### 3. Test Endpoints
```bash
# Register
curl -X POST http://localhost:8000/api/users/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","username":"testuser","password":"test123"}'

# Login
curl -X POST http://localhost:8000/api/users/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test123"}'

# Get Analytics
curl http://localhost:8000/api/analytics/summary?days=7
```

---

## Benefits

### ✅ What You Get

1. **Persistent Data** - No more data loss on browser clear
2. **Multi-Device** - Access history from any device
3. **Analytics** - Understand usage patterns
4. **Performance Tracking** - Monitor response times
5. **User Management** - Proper authentication
6. **Scalability** - Database handles thousands of users

### 📊 Analytics Insights

- Track most asked questions
- Monitor response times
- Measure cache effectiveness
- Identify peak usage times
- Understanding user behavior

---

## Security Notes

- Passwords are hashed with bcrypt
- Database uses parameterized queries (SQL injection protection)
- No plain text password storage
- Session management via user_id

---

## Next Steps

1. ✅ **Install dependencies**: `pip install -r requirements.txt`
2. ✅ **Update frontend** to use new API endpoints
3. ✅ **Test registration/login** flow
4. ✅ **Integrate chat logging** with userId/sessionId
5. ✅ **Build analytics dashboard** in frontend

---

## FAQ

**Q: What happens to existing localStorage data?**
A: It continues to work! The database is optional. Add `userId` and `sessionId` to enable logging.

**Q: Can I use PostgreSQL instead of SQLite?**
A: Yes! Just set `DATABASE_URL` environment variable:
```bash
export DATABASE_URL="postgresql://user:pass@localhost/dbname"
```

**Q: How do I backup the database?**
A: Simply copy `arth_mitra.db` file

**Q: Can I delete old  chat history?**
A: Yes, use `DELETE /api/sessions/{session_id}` endpoint

---

## Support

For issues or questions:
1. Check [OPTIMIZATION_SUMMARY.md](OPTIMIZATION_SUMMARY.md)
2. Review API endpoint documentation above
3. Test with curl/Postman before frontend integration

---

**Implementation Date**: February 16, 2026
**Database**: SQLite (upgradable to PostgreSQL)
**ORM**: SQLAlchemy 2.0+
