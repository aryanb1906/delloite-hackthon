"""
Database connection and session management
"""

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import StaticPool
from contextlib import contextmanager
from typing import Generator
import os
from models import Base

# Database configuration
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./arth_mitra.db")

# Create engine
# For SQLite, use StaticPool to avoid threading issues
if DATABASE_URL.startswith("sqlite"):
    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        echo=False  # Set to True for SQL query debugging
    )
else:
    # For PostgreSQL/MySQL
    engine = create_engine(
        DATABASE_URL,
        pool_pre_ping=True,
        pool_size=10,
        max_overflow=20
    )

# Create session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def init_db():
    """Initialize database - create all tables"""
    print("🔧 Initializing database...")
    Base.metadata.create_all(bind=engine)
    print("✅ Database tables created successfully")


def get_db() -> Generator[Session, None, None]:
    """
    Dependency to get database session
    Use in FastAPI endpoints with Depends(get_db)
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@contextmanager
def get_db_context():
    """
    Context manager for database session
    Use in non-FastAPI code:
    
    with get_db_context() as db:
        user = db.query(User).first()
    """
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def drop_all_tables():
    """Drop all tables - USE WITH CAUTION (for development only)"""
    print("⚠️  Dropping all database tables...")
    Base.metadata.drop_all(bind=engine)
    print("✅ All tables dropped")


def reset_db():
    """Reset database - drop and recreate all tables"""
    drop_all_tables()
    init_db()
    print("✅ Database reset complete")
