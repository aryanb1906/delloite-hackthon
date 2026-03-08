"""
Database models for ARTH-MITRA
Using SQLAlchemy ORM with SQLite for development
"""

from sqlalchemy import Column, Integer, String, Text, DateTime, Float, Boolean, ForeignKey, JSON
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid

Base = declarative_base()


class User(Base):
    """User profile and authentication"""
    __tablename__ = "users"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String, unique=True, nullable=False, index=True)
    username = Column(String, unique=True, nullable=False)
    password_hash = Column(String, nullable=False)
    
    # Profile fields (compulsory)
    age = Column(Integer)
    gender = Column(String)
    income = Column(String)
    employment_status = Column(String)
    tax_regime = Column(String)
    homeowner_status = Column(String)
    
    # Profile fields (optional)
    children = Column(String)
    children_ages = Column(String)
    parents_age = Column(String)
    investment_capacity = Column(String)
    risk_appetite = Column(String)
    financial_goals = Column(JSON)
    existing_investments = Column(JSON)
    
    # Metadata
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_login = Column(DateTime)
    is_active = Column(Boolean, default=True)
    
    # Relationships
    chat_sessions = relationship("ChatSession", back_populates="user", cascade="all, delete-orphan")
    documents = relationship("Document", back_populates="user", cascade="all, delete-orphan")
    saved_messages = relationship("SavedMessage", back_populates="user", cascade="all, delete-orphan")
    
    def to_dict(self):
        return {
            "id": self.id,
            "email": self.email,
            "username": self.username,
            "age": self.age,
            "gender": self.gender,
            "income": self.income,
            "employmentStatus": self.employment_status,
            "taxRegime": self.tax_regime,
            "homeownerStatus": self.homeowner_status,
            "children": self.children,
            "childrenAges": self.children_ages,
            "parentsAge": self.parents_age,
            "investmentCapacity": self.investment_capacity,
            "riskAppetite": self.risk_appetite,
            "financialGoals": self.financial_goals,
            "existingInvestments": self.existing_investments,
            "createdAt": self.created_at.isoformat() if self.created_at else None,
            "lastLogin": self.last_login.isoformat() if self.last_login else None
        }


class ChatSession(Base):
    """Chat session for grouping messages"""
    __tablename__ = "chat_sessions"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    title = Column(String, default="New Chat")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    is_active = Column(Boolean, default=True)
    
    # Relationships
    user = relationship("User", back_populates="chat_sessions")
    messages = relationship("ChatMessage", back_populates="session", cascade="all, delete-orphan")
    
    def to_dict(self):
        return {
            "id": self.id,
            "userId": self.user_id,
            "title": self.title,
            "createdAt": self.created_at.isoformat(),
            "updatedAt": self.updated_at.isoformat(),
            "isActive": self.is_active,
            "messageCount": len(self.messages) if self.messages else 0
        }


class ChatMessage(Base):
    """Individual chat messages"""
    __tablename__ = "chat_messages"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id = Column(String, ForeignKey("chat_sessions.id"), nullable=False, index=True)
    role = Column(String, nullable=False)  # 'user' or 'assistant'
    content = Column(Text, nullable=False)
    sources = Column(JSON)  # List of source documents
    
    # Performance metrics
    response_time = Column(Float)  # in seconds
    tokens_used = Column(Integer)
    cached = Column(Boolean, default=False)
    
    # Metadata
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    session = relationship("ChatSession", back_populates="messages")
    
    def to_dict(self):
        return {
            "id": self.id,
            "sessionId": self.session_id,
            "role": self.role,
            "content": self.content,
            "sources": self.sources,
            "responseTime": self.response_time,
            "tokensUsed": self.tokens_used,
            "cached": self.cached,
            "createdAt": self.created_at.isoformat()
        }


class Document(Base):
    """Uploaded documents"""
    __tablename__ = "documents"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    filename = Column(String, nullable=False)
    file_path = Column(String, nullable=False)
    file_type = Column(String, nullable=False)
    file_size = Column(Integer)  # in bytes
    chunks_indexed = Column(Integer, default=0)
    
    # Metadata
    uploaded_at = Column(DateTime, default=datetime.utcnow)
    is_indexed = Column(Boolean, default=False)
    
    # Relationships
    user = relationship("User", back_populates="documents")
    
    def to_dict(self):
        return {
            "id": self.id,
            "userId": self.user_id,
            "filename": self.filename,
            "fileType": self.file_type,
            "fileSize": self.file_size,
            "chunksIndexed": self.chunks_indexed,
            "isIndexed": self.is_indexed,
            "uploadedAt": self.uploaded_at.isoformat()
        }


class SavedMessage(Base):
    """User-saved important messages"""
    __tablename__ = "saved_messages"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    message_id = Column(String, ForeignKey("chat_messages.id"))
    content = Column(Text, nullable=False)
    note = Column(Text)
    tags = Column(JSON)
    
    # Metadata
    saved_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    user = relationship("User", back_populates="saved_messages")
    
    def to_dict(self):
        return {
            "id": self.id,
            "userId": self.user_id,
            "messageId": self.message_id,
            "content": self.content,
            "note": self.note,
            "tags": self.tags,
            "savedAt": self.saved_at.isoformat()
        }


class Analytics(Base):
    """Analytics and usage statistics"""
    __tablename__ = "analytics"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String, ForeignKey("users.id"), index=True)
    event_type = Column(String, nullable=False, index=True)  # 'query', 'upload', 'login', etc.
    event_data = Column(JSON)
    
    # Metadata
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)
    
    def to_dict(self):
        return {
            "id": self.id,
            "userId": self.user_id,
            "eventType": self.event_type,
            "eventData": self.event_data,
            "timestamp": self.timestamp.isoformat()
        }
