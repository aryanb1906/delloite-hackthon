"""
CRUD operations for database models
"""

from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from typing import List, Optional, Dict
from datetime import datetime, timedelta
import bcrypt

from models import User, ChatSession, ChatMessage, Document, SavedMessage, Analytics


# ============= USER OPERATIONS =============

def create_user(db: Session, email: str, username: str, password: str) -> User:
    """Create a new user with hashed password"""
    password_hash = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    
    user = User(
        email=email,
        username=username,
        password_hash=password_hash
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def get_user_by_email(db: Session, email: str) -> Optional[User]:
    """Get user by email"""
    return db.query(User).filter(User.email == email).first()


def get_user_by_username(db: Session, username: str) -> Optional[User]:
    """Get user by username"""
    return db.query(User).filter(User.username == username).first()


def get_user_by_id(db: Session, user_id: str) -> Optional[User]:
    """Get user by ID"""
    return db.query(User).filter(User.id == user_id).first()


def verify_password(user: User, password: str) -> bool:
    """Verify user password"""
    return bcrypt.checkpw(password.encode('utf-8'), user.password_hash.encode('utf-8'))


def update_user_profile(db: Session, user_id: str, profile_data: Dict) -> Optional[User]:
    """Update user profile information"""
    user = get_user_by_id(db, user_id)
    if not user:
        return None
    
    # Update fields
    if 'age' in profile_data:
        user.age = profile_data['age']
    if 'gender' in profile_data:
        user.gender = profile_data['gender']
    if 'income' in profile_data:
        user.income = profile_data['income']
    if 'employmentStatus' in profile_data:
        user.employment_status = profile_data['employmentStatus']
    if 'taxRegime' in profile_data:
        user.tax_regime = profile_data['taxRegime']
    if 'homeownerStatus' in profile_data:
        user.homeowner_status = profile_data['homeownerStatus']
    if 'children' in profile_data:
        user.children = profile_data['children']
    if 'childrenAges' in profile_data:
        user.children_ages = profile_data['childrenAges']
    if 'parentsAge' in profile_data:
        user.parents_age = profile_data['parentsAge']
    if 'investmentCapacity' in profile_data:
        user.investment_capacity = profile_data['investmentCapacity']
    if 'riskAppetite' in profile_data:
        user.risk_appetite = profile_data['riskAppetite']
    if 'financialGoals' in profile_data:
        user.financial_goals = profile_data['financialGoals']
    if 'existingInvestments' in profile_data:
        user.existing_investments = profile_data['existingInvestments']
    
    user.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(user)
    return user


def update_last_login(db: Session, user_id: str):
    """Update user's last login time"""
    user = get_user_by_id(db, user_id)
    if user:
        user.last_login = datetime.utcnow()
        db.commit()


def change_password(db: Session, user_id: str, new_password: str) -> Optional[User]:
    """Change user password"""
    user = get_user_by_id(db, user_id)
    if not user:
        return None
    
    password_hash = bcrypt.hashpw(new_password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    user.password_hash = password_hash
    user.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(user)
    return user


def delete_user(db: Session, user_id: str) -> bool:
    """Delete user and all associated data"""
    user = get_user_by_id(db, user_id)
    if not user:
        return False
    
    try:
        # Delete all user's chat sessions and messages
        sessions = db.query(ChatSession).filter(ChatSession.user_id == user_id).all()
        for session in sessions:
            db.query(ChatMessage).filter(ChatMessage.session_id == session.id).delete()
            db.delete(session)
        
        # Delete user's documents
        db.query(Document).filter(Document.user_id == user_id).delete()
        
        # Delete user's saved messages
        db.query(SavedMessage).filter(SavedMessage.user_id == user_id).delete()
        
        # Delete user's analytics
        db.query(Analytics).filter(Analytics.user_id == user_id).delete()
        
        # Delete user
        db.delete(user)
        db.commit()
        return True
    except Exception as e:
        db.rollback()
        print(f"Error deleting user: {e}")
        return False


# ============= CHAT OPERATIONS =============

def create_chat_session(db: Session, user_id: str, title: str = "New Chat") -> ChatSession:
    """Create a new chat session"""
    session = ChatSession(
        user_id=user_id,
        title=title
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


def get_user_chat_sessions(db: Session, user_id: str, limit: int = 50) -> List[ChatSession]:
    """Get user's chat sessions"""
    return db.query(ChatSession)\
        .filter(ChatSession.user_id == user_id)\
        .order_by(desc(ChatSession.updated_at))\
        .limit(limit)\
        .all()


def get_chat_session(db: Session, session_id: str) -> Optional[ChatSession]:
    """Get a specific chat session"""
    return db.query(ChatSession).filter(ChatSession.id == session_id).first()


def create_chat_message(
    db: Session,
    session_id: str,
    role: str,
    content: str,
    sources: Optional[List[str]] = None,
    response_time: Optional[float] = None,
    cached: bool = False
) -> ChatMessage:
    """Create a new chat message"""
    message = ChatMessage(
        session_id=session_id,
        role=role,
        content=content,
        sources=sources,
        response_time=response_time,
        cached=cached
    )
    db.add(message)
    
    # Update session timestamp
    session = get_chat_session(db, session_id)
    if session:
        session.updated_at = datetime.utcnow()
        # Auto-generate title from first user message
        if not session.title or session.title == "New Chat":
            if role == "user" and content:
                session.title = content[:50] + "..." if len(content) > 50 else content
    
    db.commit()
    db.refresh(message)
    return message


def get_session_messages(db: Session, session_id: str) -> List[ChatMessage]:
    """Get all messages in a session"""
    return db.query(ChatMessage)\
        .filter(ChatMessage.session_id == session_id)\
        .order_by(ChatMessage.created_at)\
        .all()


def delete_chat_session(db: Session, session_id: str) -> bool:
    """Delete a chat session and all its messages"""
    session = get_chat_session(db, session_id)
    if session:
        db.delete(session)
        db.commit()
        return True
    return False


def update_chat_session_title(db: Session, session_id: str, title: str) -> Optional[ChatSession]:
    """Update the title of a chat session"""
    session = get_chat_session(db, session_id)
    if session:
        session.title = title
        session.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(session)
        return session
    return None


# ============= DOCUMENT OPERATIONS =============

def create_document(
    db: Session,
    user_id: str,
    filename: str,
    file_path: str,
    file_type: str,
    file_size: int,
    chunks_indexed: int = 0
) -> Document:
    """Create a new document record"""
    document = Document(
        user_id=user_id,
        filename=filename,
        file_path=file_path,
        file_type=file_type,
        file_size=file_size,
        chunks_indexed=chunks_indexed,
        is_indexed=chunks_indexed > 0
    )
    db.add(document)
    db.commit()
    db.refresh(document)
    return document


def get_user_documents(db: Session, user_id: str) -> List[Document]:
    """Get all documents for a user"""
    return db.query(Document)\
        .filter(Document.user_id == user_id)\
        .order_by(desc(Document.uploaded_at))\
        .all()


def get_document(db: Session, document_id: str) -> Optional[Document]:
    """Get a specific document"""
    return db.query(Document).filter(Document.id == document_id).first()


def delete_document(db: Session, document_id: str) -> Optional[Document]:
    """Delete a document record and return it (or None if not found)"""
    doc = db.query(Document).filter(Document.id == document_id).first()
    if doc:
        db.delete(doc)
        db.commit()
    return doc


# ============= SAVED MESSAGES =============

def save_message(
    db: Session,
    user_id: str,
    message_id: str,
    content: str,
    note: Optional[str] = None,
    tags: Optional[List[str]] = None
) -> SavedMessage:
    """Save a message for later reference"""
    saved = SavedMessage(
        user_id=user_id,
        message_id=message_id,
        content=content,
        note=note,
        tags=tags
    )
    db.add(saved)
    db.commit()
    db.refresh(saved)
    return saved


def get_user_saved_messages(db: Session, user_id: str) -> List[SavedMessage]:
    """Get all saved messages for a user"""
    return db.query(SavedMessage)\
        .filter(SavedMessage.user_id == user_id)\
        .order_by(desc(SavedMessage.saved_at))\
        .all()


def delete_saved_message(db: Session, saved_id: str) -> bool:
    """Delete a saved message"""
    saved = db.query(SavedMessage).filter(SavedMessage.id == saved_id).first()
    if saved:
        db.delete(saved)
        db.commit()
        return True
    return False


# ============= ANALYTICS =============

def log_event(db: Session, user_id: Optional[str], event_type: str, event_data: Optional[Dict] = None):
    """Log an analytics event"""
    event = Analytics(
        user_id=user_id,
        event_type=event_type,
        event_data=event_data
    )
    db.add(event)
    db.commit()


def get_user_analytics(db: Session, user_id: str, days: int = 30) -> List[Analytics]:
    """Get analytics for a specific user"""
    since = datetime.utcnow() - timedelta(days=days)
    return db.query(Analytics)\
        .filter(Analytics.user_id == user_id, Analytics.timestamp >= since)\
        .order_by(desc(Analytics.timestamp))\
        .all()


def get_analytics_summary(db: Session, days: int = 7) -> Dict:
    """Get overall analytics summary"""
    since = datetime.utcnow() - timedelta(days=days)
    
    # Total queries
    total_queries = db.query(Analytics)\
        .filter(Analytics.event_type == 'query', Analytics.timestamp >= since)\
        .count()
    
    # Total uploads
    total_uploads = db.query(Analytics)\
        .filter(Analytics.event_type == 'upload', Analytics.timestamp >= since)\
        .count()
    
    # Active users
    active_users = db.query(Analytics.user_id)\
        .filter(Analytics.timestamp >= since)\
        .distinct()\
        .count()
    
    # Top queries (most common)
    top_events = db.query(
        Analytics.event_type,
        func.count(Analytics.id).label('count')
    ).filter(Analytics.timestamp >= since)\
        .group_by(Analytics.event_type)\
        .order_by(desc('count'))\
        .limit(10)\
        .all()
    
    # Average response time
    avg_response_time = db.query(func.avg(ChatMessage.response_time))\
        .filter(ChatMessage.created_at >= since, ChatMessage.response_time.isnot(None))\
        .scalar()
    
    # Cache hit rate
    total_responses = db.query(ChatMessage)\
        .filter(ChatMessage.created_at >= since, ChatMessage.role == 'assistant')\
        .count()
    cached_responses = db.query(ChatMessage)\
        .filter(ChatMessage.created_at >= since, ChatMessage.role == 'assistant', ChatMessage.cached == True)\
        .count()
    
    cache_hit_rate = (cached_responses / total_responses * 100) if total_responses > 0 else 0
    
    # Estimated tax saved (₹ per user per query)
    # Average assumption: ₹20,000 tax savings per user query
    estimated_tax_per_query = 20000
    total_tax_saved = total_queries * estimated_tax_per_query
    
    return {
        "totalQueries": total_queries,
        "totalUploads": total_uploads,
        "activeUsers": active_users,
        "totalTaxSaved": total_tax_saved,
        "topEvents": [{"type": event[0], "count": event[1]} for event in top_events],
        "avgResponseTime": round(avg_response_time, 2) if avg_response_time else 0,
        "cacheHitRate": round(cache_hit_rate, 2),
        "period": f"Last {days} days"
    }


def get_query_distribution(db: Session, days: int = 7) -> Dict:
    """Get query distribution by date"""
    since = datetime.utcnow() - timedelta(days=days)
    
    queries_by_date = db.query(
        func.date(ChatMessage.created_at).label('date'),
        func.count(ChatMessage.id).label('count')
    ).filter(
        ChatMessage.created_at >= since,
        ChatMessage.role == 'user'
    ).group_by(func.date(ChatMessage.created_at))\
        .order_by('date')\
        .all()
    
    return {
        "dates": [str(q[0]) for q in queries_by_date],
        "counts": [q[1] for q in queries_by_date]
    }
