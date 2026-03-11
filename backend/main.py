from fastapi import FastAPI, UploadFile, File, HTTPException, Depends, Form
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Any, List, Optional
import os
import sys
import shutil
from contextlib import asynccontextmanager
import json
import time

from bot import initialize_bot, get_bot
from database import get_db, init_db
from sqlalchemy.orm import Session
import crud

# Pydantic models for request/response
class UserProfile(BaseModel):
    age: Optional[int] = None
    gender: Optional[str] = None
    income: str
    employmentStatus: str
    taxRegime: str
    homeownerStatus: str
    children: Optional[str] = None
    childrenAges: Optional[str] = None
    parentsAge: Optional[str] = None
    investmentCapacity: Optional[str] = None
    riskAppetite: Optional[str] = None
    financialGoals: Optional[List[str]] = None
    existingInvestments: Optional[List[str]] = None

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    message: str
    profile: Optional[UserProfile] = None
    history: Optional[List[ChatMessage]] = None
    userId: Optional[str] = None  # For database logging
    sessionId: Optional[str] = None  # For database logging
    sourceFilter: Optional[str] = None  # Restrict retrieval to a selected document


class SourceHighlight(BaseModel):
    source: str
    snippet: str


class CompareScheme(BaseModel):
    name: str
    score: int
    pros: List[str]
    cons: List[str]
    fit: str


class ComparisonMode(BaseModel):
    schemeA: CompareScheme
    schemeB: CompareScheme
    recommendedFit: str


class DocumentInsight(BaseModel):
    field: str
    value: str
    source: str


class RagMetrics(BaseModel):
    totalChunks: int = 0
    totalSources: int = 0
    companyChunks: int = 0
    companySources: int = 0
    baselineChunks: int = 0
    baselineSources: int = 0
    otherChunks: int = 0
    otherSources: int = 0
    companyToBaselineChunkRatio: Optional[float] = None
    insufficientEvidenceClauses: int = 0


class ClauseValidation(BaseModel):
    isValid: bool = True
    unsupportedClauses: List[str] = []
    message: str = ""


class UploadQuality(BaseModel):
    qualityScore: int = 0
    qualityLabel: str = "unknown"
    clauseCoverage: float = 0.0
    warning: str = ""


class EvidenceTraceItem(BaseModel):
    framework: str
    clause: str
    sourceType: str
    source: str
    evidenceStrength: str
    snippet: str


class ClauseHeatmapRow(BaseModel):
    framework: str
    coveragePct: float
    missingEvidenceCount: int
    strongEvidenceCount: int
    mediumEvidenceCount: int
    weakEvidenceCount: int
    coveredClauses: List[str] = []


class ContradictionItem(BaseModel):
    clause: str
    issue: str
    companySnippet: str
    baselineSnippet: str


class FreshnessItem(BaseModel):
    source: str
    sourceType: str
    effectiveDate: str
    stale: bool
    warning: str


class ActionItem(BaseModel):
    action: str
    owner: str
    impact: str


class ActionPlan306090(BaseModel):
    d30: List[ActionItem] = []
    d60: List[ActionItem] = []
    d90: List[ActionItem] = []


class DrilldownSnippet(BaseModel):
    source: str
    snippet: str
    evidenceStrength: Optional[str] = None


class ClauseDrilldownRow(BaseModel):
    clause: str
    company: List[DrilldownSnippet] = []
    baseline: List[DrilldownSnippet] = []
    other: List[DrilldownSnippet] = []


class AuditReadyReport(BaseModel):
    scores: List[ClauseHeatmapRow] = []
    gaps: List[dict] = []
    citations: List[dict] = []
    actions: ActionPlan306090 = ActionPlan306090()
    stats: Optional[RagMetrics] = None

class ChatResponse(BaseModel):
    response: str
    sources: List[str]
    confidence: Optional[float] = None
    confidenceLabel: Optional[str] = None
    whyThisAnswer: Optional[str] = None
    highlights: List[SourceHighlight] = []
    comparison: Optional[ComparisonMode] = None
    documentInsights: List[DocumentInsight] = []
    ragMetrics: Optional[RagMetrics] = None
    clauseHeatmap: List[ClauseHeatmapRow] = []
    askBackQuestions: List[str] = []
    contradictions: List[ContradictionItem] = []
    freshnessTracker: List[FreshnessItem] = []
    actionPlan306090: ActionPlan306090 = ActionPlan306090()
    clauseDrilldown: List[ClauseDrilldownRow] = []
    followupPrompts: List[str] = []
    auditReadyReport: Optional[AuditReadyReport] = None
    sectionConfidence: dict = {}
    rubricScores: dict = {}
    evidenceTrace: List[EvidenceTraceItem] = []
    clauseValidation: ClauseValidation = ClauseValidation()
    strictNoEvidenceMode: bool = False
    missingDetails: List[str] = []
    improvementSuggestions: List[str] = []
    cached: bool = False

class UploadResponse(BaseModel):
    status: str
    message: str
    document_id: Optional[str] = None
    framework: Optional[str] = None
    filename: Optional[str] = None
    quality: Optional[UploadQuality] = None


class ResponseFeedbackRequest(BaseModel):
    userId: Optional[str] = None
    sessionId: Optional[str] = None
    messageId: str
    score: int
    sentiment: str
    reason: Optional[str] = None
    query: Optional[str] = None

class StatusResponse(BaseModel):
    initialized: bool
    documents_indexed: int
    model: Optional[str]

# New models for database endpoints
class UserRegister(BaseModel):
    email: str
    username: str
    password: str

class UserLogin(BaseModel):
    email: str
    password: str

class UserResponse(BaseModel):
    id: str
    email: str
    username: str
    age: Optional[int]
    income: Optional[str]
    employmentStatus: Optional[str]
    taxRegime: Optional[str]

class ChangePassword(BaseModel):
    currentPassword: str
    newPassword: str

class ChatSessionCreate(BaseModel):
    title: Optional[str] = "New Chat"

class ChatSessionUpdate(BaseModel):
    title: str

class ChatSessionResponse(BaseModel):
    id: str
    title: str
    createdAt: str
    messageCount: int

class SavedMessageCreate(BaseModel):
    messageId: str
    content: str
    note: Optional[str] = None
    tags: Optional[List[str]] = None

# Startup/shutdown lifecycle
@asynccontextmanager
async def lifespan(app: FastAPI):
    print("âš¡ FinGuide API starting up...")
    
    # Initialize database
    print("ðŸ”§ Initializing database...")
    init_db()
    print("âœ… Database ready")
    
    print(f"ðŸ” Checking API keys...")
    
    from dotenv import load_dotenv
    load_dotenv()
    
    gemini_key = os.getenv("GEMINI_API_KEY")
    openrouter_key = os.getenv("OPENROUTER_API_KEY")
    openai_key = os.getenv("OPENAI_API_KEY")
    
    providers = []
    if openrouter_key:
        providers.append("OpenRouter")
    if openai_key:
        providers.append("OpenAI")
    if gemini_key:
        providers.append("Gemini")

    if providers:
        print(f"âœ… API keys found for: {', '.join(providers)}")
        print("ðŸ” Multi-provider fallback enabled: OpenRouter -> OpenAI -> Gemini")
    else:
        print("âš ï¸ WARNING: No API key configured in .env")
        print("Backend will now run on local llm (Ollama) without external API access")
    
    # Eagerly initialize bot and warm up for fast first request
    print("ðŸ”„ Initializing bot and warming up...")
    try:
        bot = get_bot()
        bot.initialize(auto_index=True)
        print("âœ… Bot initialized successfully")
        
        from warmup import full_warmup
        full_warmup(bot)
    except Exception as e:
        print(f"âš ï¸ Startup warmup failed: {e}")
        print("  Bot will initialize on first request instead")
    
    yield
    # Shutdown: cleanup if needed
    print("Shutting down...")

app = FastAPI(
    title="FinGuide API",
    description="AI-powered financial assistant for Indian users",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Upload directory
UPLOAD_DIR = os.getenv("UPLOADS_DIR", "./uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

FRAMEWORK_LABELS = {
    "iso37001": "ISO 37001",
    "iso37301": "ISO 37301",
    "iso37000": "ISO 37000",
    "iso37002": "ISO 37002",
}


@app.get("/ping")
def health():
    return {"status": "ok"}



@app.get("/api/hello")
def hello():
    return {"message": "Backend connected successfully"}


@app.post("/api/chat", response_model=ChatResponse)
def chat(request: ChatRequest, db: Session = Depends(get_db)):
    """Chat with FinGuide AI assistant"""
    start_time = time.time()
    
    try:
        bot = get_bot()
        if not bot._initialized:
            # Initialize bot on first request
            print("ðŸ”„ Initializing bot for first time...")
            bot.initialize(auto_index=True)
            print("âœ… Bot initialized successfully")
        
        # Convert profile to dict if provided
        profile_dict = request.profile.dict() if request.profile else None
        history = [msg.dict() for msg in request.history] if request.history else None
        
        # Get bot response
        result = bot.get_response(
            request.message,
            profile=profile_dict,
            history=history,
            source_filter=request.sourceFilter
        )
        
        # Calculate response time
        response_time = time.time() - start_time
        
        # Log to database if user_id and session_id provided
        if request.userId and request.sessionId:
            try:
                # Save user message
                crud.create_chat_message(
                    db, request.sessionId, "user", request.message
                )
                
                # Save assistant response
                crud.create_chat_message(
                    db, request.sessionId, "assistant", result["response"],
                    sources=result["sources"],
                    response_time=response_time,
                    cached=result.get("cached", False)
                )
                
                # Log analytics event
                crud.log_event(db, request.userId, "query", {
                    "message": request.message[:100],
                    "response_time": response_time
                })
            except Exception as e:
                print(f"âš ï¸ Failed to log to database: {e}")
        
        return ChatResponse(
            response=result["response"],
            sources=result["sources"],
            confidence=result.get("confidence"),
            confidenceLabel=result.get("confidenceLabel"),
            whyThisAnswer=result.get("whyThisAnswer"),
            highlights=result.get("highlights", []),
            comparison=result.get("comparison"),
            documentInsights=result.get("documentInsights", []),
            ragMetrics=result.get("ragMetrics"),
            clauseHeatmap=result.get("clauseHeatmap", []),
            askBackQuestions=result.get("askBackQuestions", []),
            contradictions=result.get("contradictions", []),
            freshnessTracker=result.get("freshnessTracker", []),
            actionPlan306090=result.get("actionPlan306090", {"d30": [], "d60": [], "d90": []}),
            clauseDrilldown=result.get("clauseDrilldown", []),
            followupPrompts=result.get("followupPrompts", []),
            auditReadyReport=result.get("auditReadyReport"),
            sectionConfidence=result.get("sectionConfidence", {}),
            rubricScores=result.get("rubricScores", {}),
            evidenceTrace=result.get("evidenceTrace", []),
            clauseValidation=result.get("clauseValidation", {"isValid": True, "unsupportedClauses": [], "message": ""}),
            strictNoEvidenceMode=result.get("strictNoEvidenceMode", False),
            missingDetails=result.get("missingDetails", []),
            improvementSuggestions=result.get("improvementSuggestions", []),
            cached=result.get("cached", False),
        )
    except RuntimeError as e:
        print(f"âŒ Runtime Error: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        print(f"âŒ Error: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")


@app.post("/api/feedback")
def submit_response_feedback(request: ResponseFeedbackRequest):
    """Store lightweight response quality feedback for future tuning."""
    try:
        bot = get_bot()
        if not bot._initialized:
            bot.initialize(auto_index=False)

        payload = {
            "userId": request.userId,
            "sessionId": request.sessionId,
            "messageId": request.messageId,
            "score": request.score,
            "sentiment": request.sentiment,
            "reason": request.reason,
            "query": request.query,
        }
        result = bot.log_response_feedback(payload)
        if result.get("status") == "error":
            raise HTTPException(status_code=500, detail=result.get("message", "Failed to store feedback"))
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Feedback submission failed: {str(e)}")


@app.post("/api/chat/stream")
def chat_stream(request: ChatRequest):
    """Stream chat response tokens via SSE"""
    try:
        bot = get_bot()
        if not bot._initialized:
            print("ðŸ”„ Initializing bot for first time...")
            bot.initialize(auto_index=True)
            print("âœ… Bot initialized successfully")

        profile_dict = request.profile.dict() if request.profile else None
        history = [msg.dict() for msg in request.history] if request.history else None

        token_iter, sources, metadata = bot.stream_response(
            request.message,
            profile=profile_dict,
            history=history,
            source_filter=request.sourceFilter
        )

        def event_stream():
            token_count = 0
            try:
                for token in token_iter:
                    if token:
                        token_count += 1
                        yield f"event: token\ndata: {json.dumps(token)}\n\n"
                print(f"ðŸ“¤ Streamed {token_count} tokens")
                yield f"event: sources\ndata: {json.dumps(sources)}\n\n"
                yield f"event: meta\ndata: {json.dumps(metadata)}\n\n"
                yield "event: done\ndata: [DONE]\n\n"
            except Exception as e:
                print(f"âŒ Stream error: {e}")
                yield f"event: error\ndata: {json.dumps(str(e))}\n\n"
                yield "event: done\ndata: [DONE]\n\n"

        return StreamingResponse(event_stream(), media_type="text/event-stream")
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")


@app.post("/api/upload", response_model=UploadResponse)
async def upload_document(file: UploadFile = File(...), user_id: Optional[str] = Form(None), db: Session = Depends(get_db)):
    """Upload and index a document (PDF, CSV, TXT, MD, DOCX)"""
    try:
        bot = get_bot()
        if not bot._initialized:
            # Initialize bot quickly on first upload (skip full auto-index scan)
            bot.initialize(auto_index=False)
        
        # Validate file type
        allowed_extensions = [".pdf", ".csv", ".txt", ".md", ".docx"]
        file_ext = os.path.splitext(file.filename)[1].lower()
        
        if file_ext not in allowed_extensions:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported file type. Allowed: {allowed_extensions}"
            )
        
        # Save file
        file_path = os.path.join(UPLOAD_DIR, file.filename)
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        # Get file size
        file_size = os.path.getsize(file_path)
        
        # Index document
        result = bot.add_documents(file_path)
        
        # Extract chunks indexed from message
        chunks_indexed = 0
        if "Indexed" in result["message"]:
            import re
            match = re.search(r'Indexed (\d+) chunks', result["message"])
            if match:
                chunks_indexed = int(match.group(1))
        
        # Log to database if user_id provided
        doc_record = None
        if user_id:
            try:
                doc_record = crud.create_document(
                    db, user_id, file.filename, file_path, 
                    file_ext, file_size, chunks_indexed
                )
                crud.log_event(db, user_id, "upload", {
                    "filename": file.filename,
                    "file_type": file_ext,
                    "chunks": chunks_indexed
                })
            except Exception as e:
                print(f"âš ï¸ Failed to log document to database: {e}")
        
        return UploadResponse(
            status=result["status"],
            message=result["message"],
            document_id=doc_record.id if doc_record else None,
            filename=file.filename,
            quality=result.get("quality"),
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


@app.post("/api/upload/framework", response_model=UploadResponse)
async def upload_framework_document(
    file: UploadFile = File(...),
    framework: str = Form(...),
    user_id: Optional[str] = Form(None),
    db: Session = Depends(get_db),
):
    """Upload and index a framework-specific company document (one file per framework)."""
    try:
        framework_key = framework.strip().lower()
        if framework_key not in FRAMEWORK_LABELS:
            raise HTTPException(status_code=400, detail="Invalid framework. Use: iso37001, iso37301, iso37000, iso37002")

        bot = get_bot()
        if not bot._initialized:
            bot.initialize(auto_index=False)

        allowed_extensions = [".pdf", ".csv", ".txt", ".md", ".docx"]
        file_ext = os.path.splitext(file.filename)[1].lower()

        if file_ext not in allowed_extensions:
            raise HTTPException(status_code=400, detail=f"Unsupported file type. Allowed: {allowed_extensions}")

        framework_dir = os.path.join(UPLOAD_DIR, framework_key)
        os.makedirs(framework_dir, exist_ok=True)

        # Keep exactly one document per framework slot by removing previously indexed files in this slot.
        for existing_name in os.listdir(framework_dir):
            existing_path = os.path.join(framework_dir, existing_name)
            if os.path.isfile(existing_path):
                try:
                    bot.remove_document(existing_name)
                except Exception:
                    pass
                try:
                    os.remove(existing_path)
                except Exception:
                    pass

        original_filename = os.path.basename(file.filename)
        slot_filename = f"{framework_key}_company_document{file_ext}"
        file_path = os.path.join(framework_dir, slot_filename)
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        file_size = os.path.getsize(file_path)
        result = bot.add_documents(
            file_path,
            source_name=original_filename,
            framework=framework_key,
            source_type="company",
        )
        bot.clear_cache()

        chunks_indexed = 0
        if "Indexed" in result["message"]:
            import re
            match = re.search(r'Indexed (\d+) chunks', result["message"])
            if match:
                chunks_indexed = int(match.group(1))

        doc_record = None
        if user_id:
            try:
                # Remove old DB records for the same framework slot to keep one active row.
                existing_docs = crud.get_user_documents(db, user_id)
                for existing_doc in existing_docs:
                    existing_path = (existing_doc.file_path or "").replace("\\", "/").lower()
                    if f"/{framework_key}/" in existing_path:
                        crud.delete_document(db, existing_doc.id)

                doc_record = crud.create_document(
                    db, user_id, original_filename, file_path,
                    file_ext, file_size, chunks_indexed
                )
                crud.log_event(db, user_id, "upload", {
                    "filename": original_filename,
                    "file_type": file_ext,
                    "chunks": chunks_indexed,
                    "framework": framework_key,
                })
            except Exception as e:
                print(f"âš ï¸ Failed to log framework document to database: {e}")

        return UploadResponse(
            status=result["status"],
            message=f"{FRAMEWORK_LABELS[framework_key]} upload complete. {result['message']}",
            document_id=doc_record.id if doc_record else None,
            framework=framework_key,
            filename=original_filename,
            quality=result.get("quality"),
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Framework upload failed: {str(e)}")


@app.get("/api/status", response_model=StatusResponse)
def get_status():
    """Get bot status and statistics"""
    try:
        bot = get_bot()
        status = bot.get_status()
        return StatusResponse(**status)
    except Exception as e:
        return StatusResponse(
            initialized=False,
            documents_indexed=0,
            model=None
        )


@app.post("/api/cache/clear")
def clear_cache():
    """Clear the response cache for fresh responses"""
    try:
        bot = get_bot()
        if bot._initialized:
            bot.clear_cache()
            return {"status": "success", "message": "Cache cleared successfully"}
        return {"status": "info", "message": "Bot not initialized yet"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to clear cache: {str(e)}")


# ==================== NEW DATABASE ENDPOINTS ====================

@app.post("/api/users/register")
def register_user(user: UserRegister, db: Session = Depends(get_db)):
    """Register a new user"""
    try:
        # Check if user already exists
        existing_user = crud.get_user_by_email(db, user.email)
        if existing_user:
            raise HTTPException(status_code=400, detail="Email already registered")
        
        existing_username = crud.get_user_by_username(db, user.username)
        if existing_username:
            raise HTTPException(status_code=400, detail="Username already taken")
        
        # Create user
        new_user = crud.create_user(db, user.email, user.username, user.password)
        
        # Log event
        crud.log_event(db, new_user.id, "register", {"email": user.email})
        
        return {
            "status": "success",
            "message": "User registered successfully",
            "user": new_user.to_dict()
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Registration failed: {str(e)}")


@app.post("/api/users/login")
def login_user(credentials: UserLogin, db: Session = Depends(get_db)):
    """Login user"""
    try:
        user = crud.get_user_by_email(db, credentials.email)
        if not user:
            raise HTTPException(status_code=401, detail="Invalid email or password")
        
        if not crud.verify_password(user, credentials.password):
            raise HTTPException(status_code=401, detail="Invalid email or password")
        
        # Update last login
        crud.update_last_login(db, user.id)
        
        # Log event
        crud.log_event(db, user.id, "login", {"email": credentials.email})
        
        return {
            "status": "success",
            "message": "Login successful",
            "user": user.to_dict()
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Login failed: {str(e)}")


@app.get("/api/users/{user_id}/profile")
def get_user_profile(user_id: str, db: Session = Depends(get_db)):
    """Get user profile"""
    user = crud.get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user.to_dict()


@app.put("/api/users/{user_id}/profile")
def update_profile(user_id: str, profile: UserProfile, db: Session = Depends(get_db)):
    """Update user profile"""
    try:
        updated_user = crud.update_user_profile(db, user_id, profile.dict())
        if not updated_user:
            raise HTTPException(status_code=404, detail="User not found")
        
        # Log event
        crud.log_event(db, user_id, "profile_update", {"updated_fields": list(profile.dict().keys())})
        
        return {
            "status": "success",
            "message": "Profile updated successfully",
            "user": updated_user.to_dict()
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Profile update failed: {str(e)}")


@app.post("/api/users/{user_id}/change-password")
def change_password(user_id: str, pwd_change: ChangePassword, db: Session = Depends(get_db)):
    """Change user password"""
    try:
        user = crud.get_user_by_id(db, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        # Verify current password
        if not crud.verify_password(user, pwd_change.currentPassword):
            raise HTTPException(status_code=401, detail="Current password is incorrect")
        
        # Update password
        user = crud.change_password(db, user_id, pwd_change.newPassword)
        
        # Log event
        crud.log_event(db, user_id, "password_change", {})
        
        return {
            "status": "success",
            "message": "Password changed successfully"
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Password change failed: {str(e)}")


@app.delete("/api/users/{user_id}")
def delete_account(user_id: str, db: Session = Depends(get_db)):
    """Delete user account"""
    try:
        user = crud.get_user_by_id(db, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        # Log event before deletion
        crud.log_event(db, user_id, "account_deleted", {})
        
        # Delete user and all related data
        crud.delete_user(db, user_id)
        
        return {
            "status": "success",
            "message": "Account deleted successfully"
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Account deletion failed: {str(e)}")


@app.post("/api/users/{user_id}/sessions")
def create_session(user_id: str, session_data: ChatSessionCreate, db: Session = Depends(get_db)):
    """Create a new chat session"""
    try:
        session = crud.create_chat_session(db, user_id, session_data.title)
        return {
            "status": "success",
            "session": session.to_dict()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create session: {str(e)}")


@app.get("/api/users/{user_id}/sessions")
def get_user_sessions(user_id: str, db: Session = Depends(get_db)):
    """Get all chat sessions for a user"""
    try:
        sessions = crud.get_user_chat_sessions(db, user_id)
        return {
            "sessions": [session.to_dict() for session in sessions]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve sessions: {str(e)}")


@app.get("/api/sessions/{session_id}/messages")
def get_session_messages(session_id: str, db: Session = Depends(get_db)):
    """Get all messages in a session"""
    try:
        messages = crud.get_session_messages(db, session_id)
        return {
            "messages": [msg.to_dict() for msg in messages]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve messages: {str(e)}")


class CreateMessageRequest(BaseModel):
    role: str  # "user" | "assistant"
    content: str
    sources: Optional[List[str]] = None
    response_time: Optional[float] = None
    cached: bool = False

class CreateMessagePairRequest(BaseModel):
    userMessage: str
    assistantMessage: str
    sources: Optional[List[str]] = None
    response_time: Optional[float] = None

@app.post("/api/sessions/{session_id}/messages")
def add_session_messages(session_id: str, request: CreateMessagePairRequest, db: Session = Depends(get_db)):
    """Persist a user+assistant message pair to an existing session (used by voice assistant)."""
    try:
        session = crud.get_chat_session(db, session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        user_msg = crud.create_chat_message(db, session_id, "user", request.userMessage)
        assistant_msg = crud.create_chat_message(
            db, session_id, "assistant", request.assistantMessage,
            sources=request.sources,
            response_time=request.response_time,
        )
        return {
            "status": "success",
            "userMessage": user_msg.to_dict(),
            "assistantMessage": assistant_msg.to_dict(),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save messages: {str(e)}")


@app.delete("/api/sessions/{session_id}")
def delete_session(session_id: str, db: Session = Depends(get_db)):
    """Delete a chat session"""
    try:
        deleted = crud.delete_chat_session(db, session_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="Session not found")
        return {"status": "success", "message": "Session deleted"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete session: {str(e)}")


@app.put("/api/sessions/{session_id}/title")
def update_session_title(session_id: str, session_data: ChatSessionUpdate, db: Session = Depends(get_db)):
    """Update the title of a chat session"""
    try:
        session = crud.update_chat_session_title(db, session_id, session_data.title)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        return {"status": "success", "session": session.to_dict()}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update session title: {str(e)}")


@app.get("/api/users/{user_id}/documents")
def get_user_documents(user_id: str, db: Session = Depends(get_db)):
    """Get all documents for a user"""
    try:
        documents = crud.get_user_documents(db, user_id)
        return {
            "documents": [doc.to_dict() for doc in documents]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve documents: {str(e)}")


@app.delete("/api/documents/{document_id}")
def delete_document(document_id: str, db: Session = Depends(get_db)):
    """Delete a user-uploaded document (DB record, file on disk, and vector store chunks)"""
    try:
        doc = crud.get_document(db, document_id)
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found")

        filename = doc.filename
        file_path = doc.file_path

        # 1. Remove chunks from the vector store
        try:
            bot = get_bot()
            if bot._initialized:
                bot.remove_document(filename)
                if file_path:
                    bot.remove_document(os.path.basename(file_path))
        except Exception as e:
            print(f"\u26a0\ufe0f Failed to remove chunks from vector store: {e}")

        # 2. Delete the physical file (only from uploads/)
        if file_path and os.path.exists(file_path) and UPLOAD_DIR in os.path.abspath(file_path):
            os.remove(file_path)

        # 3. Delete the DB record
        crud.delete_document(db, document_id)

        return {"status": "success", "message": f"Document '{filename}' deleted"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete document: {str(e)}")


@app.post("/api/users/{user_id}/saved-messages")
def save_message(user_id: str, message_data: SavedMessageCreate, db: Session = Depends(get_db)):
    """Save a message for later reference"""
    try:
        saved = crud.save_message(
            db, user_id, message_data.messageId, message_data.content,
            message_data.note, message_data.tags
        )
        return {
            "status": "success",
            "saved": saved.to_dict()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save message: {str(e)}")


@app.get("/api/users/{user_id}/saved-messages")
def get_saved_messages(user_id: str, db: Session = Depends(get_db)):
    """Get all saved messages for a user"""
    try:
        messages = crud.get_user_saved_messages(db, user_id)
        return {
            "messages": [msg.to_dict() for msg in messages]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve saved messages: {str(e)}")


@app.delete("/api/saved-messages/{saved_id}")
def delete_saved_message(saved_id: str, db: Session = Depends(get_db)):
    """Delete a saved message"""
    try:
        deleted = crud.delete_saved_message(db, saved_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="Saved message not found")
        return {"status": "success", "message": "Saved message deleted"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete saved message: {str(e)}")


@app.get("/api/analytics/summary")
def get_analytics_summary(days: int = 7, db: Session = Depends(get_db)):
    """Get overall analytics summary"""
    try:
        summary = crud.get_analytics_summary(db, days)
        return summary
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get analytics: {str(e)}")


@app.get("/api/analytics/query-distribution")
def get_query_distribution(days: int = 7, db: Session = Depends(get_db)):
    """Get query distribution over time"""
    try:
        distribution = crud.get_query_distribution(db, days)
        return distribution
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get distribution: {str(e)}")


@app.get("/api/users/{user_id}/analytics")
def get_user_analytics(user_id: str, days: int = 30, db: Session = Depends(get_db)):
    """Get analytics for a specific user"""
    try:
        analytics = crud.get_user_analytics(db, user_id, days)
        return {
            "analytics": [event.to_dict() for event in analytics]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get user analytics: {str(e)}")


# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
# Voice Assistant Endpoint  (FinGuide Copilot â€“ Phase 2)
# â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

ASSISTANT_FEATURE_FLAG = os.getenv("ENABLE_VOICE_ASSISTANT", "true").lower() == "true"

class AssistantVisual(BaseModel):
    id: str
    type: str  # bar | line | pie | area | stat | table
    title: str
    data: Optional[Any] = None
    unit: Optional[str] = None
    description: Optional[str] = None

class AssistantSummary(BaseModel):
    id: str
    label: str
    value: Any = None
    subtitle: Optional[str] = None

class AssistantChatHistoryEntry(BaseModel):
    id: str
    title: Optional[str] = None

class AssistantSavedResponse(BaseModel):
    id: str
    title: Optional[str] = None
    summary: Optional[str] = None

class AssistantPageContext(BaseModel):
    currentPage: Optional[str] = None
    activeChatId: Optional[str] = None
    chatHistory: Optional[List[AssistantChatHistoryEntry]] = None
    savedResponses: Optional[List[AssistantSavedResponse]] = None
    visuals: Optional[List[AssistantVisual]] = None
    summaries: Optional[List[AssistantSummary]] = None
    metadata: Optional[dict] = None

class AssistantContext(BaseModel):
    currentRoute: Optional[str] = None
    activeModule: Optional[str] = None
    selectedFinancialYear: Optional[str] = None
    visibleComponentIds: Optional[List[str]] = None
    assistantContext: Optional[AssistantPageContext] = None

class AssistantRequest(BaseModel):
    userText: str
    context: Optional[AssistantContext] = None
    userId: Optional[str] = None
    language: Optional[str] = "en"  # "en" or "hi"

class AssistantAction(BaseModel):
    type: str  # navigate | open_report | highlight_section | run_calculator | guide_and_highlight | explain_graph
    target: Optional[str] = None
    params: Optional[dict] = None

class AssistantResponse(BaseModel):
    reply: str
    action: Optional[AssistantAction] = None
    language: Optional[str] = "en"
    audioBase64: Optional[str] = None
    isFinanceRelated: Optional[bool] = False
    followUps: Optional[list[str]] = None  # 2-3 suggested follow-up questions

ASSISTANT_SYSTEM_PROMPT = """You are FinGuide Voice Copilot, a helpful Indian financial assistant embedded inside the FinGuide web application.

IMPORTANT â€“ SAFETY POLICY:
You are NOT allowed to perform or suggest any destructive or data-modifying operations.
This includes but is not limited to: deleting chats, deleting documents, clearing saved responses, resetting data, submitting filings, or modifying financial records.
If the user requests any deletion, reset, or data-modification action, respond politely that such operations must be performed manually through the application UI. Do NOT return an action object for these requests.

ROLE:
- Guide the user around the application UI.
- Answer financial questions about Indian taxation, deductions, government schemes, and tax-saving investments.
- You may give slight investment suggestions ONLY within tax optimisation context.

STRICTLY NOT ALLOWED:
- Any destructive or data-modifying actions (delete, clear, reset, submit filings, modify data).
- Cryptocurrency or stock-picking advice.
- Non-Indian tax guidance.
- Legal representation claims.

CONTEXT:
The user is currently on route: {route}
Active module: {module}
Financial year: {fy}
Visible UI components: {components}
Language preference: {language}

PAGE DATA (structured context from the current page â€“ use this to answer questions about displayed data):
{page_data}

DATA-GROUNDING RULES (MANDATORY):
- When the user says "explain this", "explain the graph", "what does this show", "why is this high/low", or any query about on-screen content, answer STRICTLY from the PAGE DATA above.
- Reference specific labels, values, and trends present in the data. Cite numbers exactly as provided.
- If the PAGE DATA section is empty or does not contain enough information to answer, say so honestly. NEVER invent, estimate, or hallucinate values that are not in the data.
- When comparing data points, use only the values listed. Do not interpolate or assume missing entries.
- Keep the tone professional and concise.

RESPONSE FORMAT â€“ you MUST reply with valid JSON only, no markdown fences:

For INFORMATIONAL responses (tax explanations, scheme comparisons, financial advice, data analysis):
{{
  "reply": "<your spoken response text>",
  "language": "{language}",
  "isFinanceRelated": true,
  "followUps": ["<follow-up question 1>", "<follow-up question 2>", "<follow-up question 3>"]
}}

For GENERAL / NON-FINANCE responses (greetings, jokes, weather, general knowledge, app help):
{{
  "reply": "<your spoken response text>",
  "language": "{language}",
  "isFinanceRelated": false,
  "followUps": ["<follow-up question 1>", "<follow-up question 2>"]
}}

FOLLOW-UP SUGGESTIONS RULES:
- ALWAYS include 2-3 relevant follow-up questions in the "followUps" array.
- Follow-ups should be natural next questions the user might want to ask.
- Keep each follow-up SHORT (under 10 words) â€” they will be shown as tappable pills.
- For finance topics, suggest deeper dives, comparisons, or action items.
- For Hindi responses, write follow-ups in Hindi too.
- Examples: "Compare old vs new regime", "What deductions can I claim?", "Show me PPF rates"

IMPORTANT: The "isFinanceRelated" field is REQUIRED in EVERY response. Set it to true when the query is about finance, taxes, investments, savings, government schemes, loans, insurance, budgets, income, deductions, or any monetary/economic topic. Set it to false for all other queries (general greetings, app navigation help, weather, jokes, etc.).

Do NOT include the "action" field for informational responses.

For SYSTEM ACTIONS (navigation, UI interactions):
{{
  "reply": "<your spoken response text>",
  "action": {{
    "type": "<one of: navigate | open_report | highlight_section | run_calculator | guide_and_highlight | explain_graph>",
    "target": "<route path, component data-assistant-id, or null>",
    "params": {{}}
  }},
  "language": "{language}",
  "isFinanceRelated": false
}}
Only include "action" when the user explicitly requests a navigation or UI operation.
NEVER return action.type "none" â€” simply omit the action field instead.

ACTION RULES:
- "navigate": set target to the route path, e.g. "/tax-calculator"
- "highlight_section": set target to a data-assistant-id value
- "guide_and_highlight": same as highlight but the bubble will animate to the element
- "run_calculator": triggers the tax calculator; target="/tax-calculator"
- "open_report": target = report identifier
- "explain_graph": highlight a chart/visual and explain its data; target = data-assistant-id of the chart

If the user is asking a question, requesting an explanation, or having a conversation, respond with ONLY "reply" and "language" â€” no "action".

DESTRUCTIVE ACTION POLICY:
You must NEVER return an action with any of these types: delete_chat, delete_document, clear_saved_responses, reset_data, submit_filing, modify_financial_data.
If the user requests deletion, clearing, resetting, filing submission, or data modification, respond with a polite message explaining that these operations must be performed manually through the application UI. Do not include an action object.

Available routes: / (home), /chat, /tax-calculator, /settings, /analytics, /profile-setup
Available data-assistant-ids: sidebar, chat-input, file-upload, tax-form, profile-section, settings-section, analytics-charts, scheme-results, comparison-section

Keep replies concise (under 120 words) and conversational. If the user speaks Hindi, reply in Hindi.
"""

# â”€â”€ Voice assistant rate limiter â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
from collections import defaultdict as _defaultdict

_voice_rate_buckets: dict[str, list[float]] = _defaultdict(list)
_VOICE_MAX_REQUESTS = 10   # per window
_VOICE_WINDOW_SECS  = 60   # 1 minute

def _voice_rate_check(user_id: str) -> None:
    """Raise 429 if user exceeds voice assistant rate limit."""
    now = time.time()
    bucket = _voice_rate_buckets[user_id]
    # Prune expired entries
    _voice_rate_buckets[user_id] = [t for t in bucket if now - t < _VOICE_WINDOW_SECS]
    if len(_voice_rate_buckets[user_id]) >= _VOICE_MAX_REQUESTS:
        raise HTTPException(status_code=429, detail="Too many voice requests. Please wait a moment.")
    _voice_rate_buckets[user_id].append(now)


# â”€â”€ Prompt injection sanitization â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
import re as _re

_INJECTION_PATTERNS = [
    _re.compile(r"(?:ignore|disregard|forget|override)\s+(?:all\s+)?(?:previous|above|prior|earlier|system)\s+(?:instructions?|prompts?|rules?|directives?)", _re.IGNORECASE),
    _re.compile(r"(?:you\s+are\s+now|act\s+as|pretend\s+(?:to\s+be|you(?:'re|\s+are)))\s+", _re.IGNORECASE),
    _re.compile(r"(?:system\s*:|assistant\s*:|<\|?(?:im_start|system|endoftext)\|?>)", _re.IGNORECASE),
    _re.compile(r"(?:reveal|show|print|output|repeat)\s+(?:your\s+)?(?:system\s+)?(?:prompt|instructions?|rules?)", _re.IGNORECASE),
    _re.compile(r"\[INST\]|\[/INST\]|<<SYS>>|<</SYS>>", _re.IGNORECASE),
]

def _sanitize_user_input(text: str) -> str:
    """
    Sanitize user input to mitigate prompt injection attempts.
    Strips dangerous patterns and excessive special characters while
    preserving legitimate financial queries (including Hindi/Devanagari).
    """
    if not text or not text.strip():
        return text

    sanitized = text.strip()

    # Remove triple-backtick fenced blocks that could embed injections
    sanitized = _re.sub(r"```[\s\S]*?```", "", sanitized)

    # Strip known injection patterns
    for pattern in _INJECTION_PATTERNS:
        sanitized = pattern.sub("", sanitized)

    # Remove excessive consecutive special characters (>3 of the same)
    sanitized = _re.sub(r"([^\w\s\u0900-\u097Fâ‚¹])\1{3,}", r"\1\1", sanitized)

    # Cap input length (prevent token-stuffing attacks)
    sanitized = sanitized[:1000].strip()

    return sanitized if sanitized else "Hello"


@app.post("/api/assistant", response_model=AssistantResponse)
def voice_assistant(request: AssistantRequest, db: Session = Depends(get_db)):
    """Voice assistant endpoint â€“ thin orchestration layer over existing LLM"""
    if not ASSISTANT_FEATURE_FLAG:
        raise HTTPException(status_code=403, detail="Voice assistant is disabled")

    # â”€â”€ Auth check â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if not request.userId:
        raise HTTPException(status_code=401, detail="Authentication required")
    user = crud.get_user_by_id(db, request.userId)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid user")

    # â”€â”€ Rate limiting (10 requests/minute per user) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    _voice_rate_check(request.userId)

    # â”€â”€ Sanitize user input (prompt injection mitigation) â”€â”€â”€â”€â”€â”€â”€
    request.userText = _sanitize_user_input(request.userText)

    start_time = time.time()

    try:
        bot = get_bot()
        if not bot._initialized:
            bot.initialize(auto_index=True)

        ctx = request.context or AssistantContext()

        # Build page-data block from rich context if available
        page_data_lines: list[str] = []
        ac = ctx.assistantContext
        if ac:
            # â”€â”€ Page identity â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
            if ac.currentPage:
                page_data_lines.append(f"Current page: {ac.currentPage}")

            # â”€â”€ Active chat â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
            if ac.activeChatId:
                page_data_lines.append(f"Active chat ID: {ac.activeChatId}")

            # â”€â”€ Chat history â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
            if ac.chatHistory:
                page_data_lines.append("")
                page_data_lines.append(f"Available chats ({len(ac.chatHistory)}):")
                for ch in ac.chatHistory[:30]:  # cap to avoid prompt bloat
                    page_data_lines.append(f"  - [{ch.id}] {ch.title or 'Untitled'}")
                if len(ac.chatHistory) > 30:
                    page_data_lines.append(f"  â€¦ and {len(ac.chatHistory) - 30} more")

            # â”€â”€ Saved responses â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
            if ac.savedResponses:
                page_data_lines.append("")
                page_data_lines.append(f"Saved responses ({len(ac.savedResponses)}):")
                for sr in ac.savedResponses[:20]:
                    line = f"  - [{sr.id}] {sr.title or 'Untitled'}"
                    if sr.summary:
                        line += f": {sr.summary[:120]}"
                    page_data_lines.append(line)
                if len(ac.savedResponses) > 20:
                    page_data_lines.append(f"  â€¦ and {len(ac.savedResponses) - 20} more")

            # â”€â”€ Summary KPIs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
            if ac.summaries:
                page_data_lines.append("")
                page_data_lines.append("Summaries (key figures currently displayed):")
                for s in ac.summaries:
                    line = f"  - {s.label}: {s.value}"
                    if s.subtitle:
                        line += f" ({s.subtitle})"
                    page_data_lines.append(line)

            # â”€â”€ Visuals / charts â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
            if ac.visuals:
                page_data_lines.append("")
                page_data_lines.append("Visuals/Charts currently displayed:")
                for v in ac.visuals:
                    header = f"  [{v.type.upper()} CHART] {v.title}"
                    if v.unit:
                        header += f" (unit: {v.unit})"
                    if v.description:
                        header += f" â€” {v.description}"
                    page_data_lines.append(header)
                    # Serialize actual data points so the LLM can reason over them
                    if v.data:
                        try:
                            data_str = json.dumps(v.data, default=str, ensure_ascii=False)
                            # Truncate very large payloads to keep prompt manageable
                            if len(data_str) > 2000:
                                data_str = data_str[:2000] + "â€¦ (truncated)"
                            page_data_lines.append(f"    Data: {data_str}")
                        except Exception:
                            page_data_lines.append("    Data: (serialisation error)")

            # â”€â”€ Page metadata â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
            if ac.metadata:
                page_data_lines.append("")
                page_data_lines.append(f"Page metadata: {json.dumps(ac.metadata, default=str, ensure_ascii=False)}")

        system_prompt = ASSISTANT_SYSTEM_PROMPT.format(
            route=ctx.currentRoute or "/chat",
            module=ctx.activeModule or "none",
            fy=ctx.selectedFinancialYear or "2024-25",
            components=", ".join(ctx.visibleComponentIds or []),
            language=request.language or "en",
            page_data="\n".join(page_data_lines) if page_data_lines else "No additional page data is currently registered. Answer based on your financial knowledge.",
        )

        # â”€â”€ Hindi language extension â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        if (request.language or "en") == "hi":
            system_prompt += (
                "\n\nLANGUAGE DIRECTIVE â€“ HINDI:"
                "\nYou must respond in Hindi (Devanagari script)."
                "\nUse professional financial Hindi suitable for the Indian context."
                "\nKeep explanations clear and formal."
                "\nAvoid mixing excessive English unless necessary for technical terms."
                "\n"
                "\nUse standard Hindi financial terminology. Preferred terms include:"
                "\n  - Tax â†’ à¤•à¤°"
                "\n  - Income Tax â†’ à¤†à¤¯à¤•à¤°"
                "\n  - Savings â†’ à¤¬à¤šà¤¤"
                "\n  - Investment â†’ à¤¨à¤¿à¤µà¥‡à¤¶"
                "\n  - Expenditure â†’ à¤µà¥à¤¯à¤¯"
                "\n  - Financial Analysis â†’ à¤µà¤¿à¤¤à¥à¤¤à¥€à¤¯ à¤µà¤¿à¤¶à¥à¤²à¥‡à¤·à¤£"
                "\n  - Deduction â†’ à¤•à¤Ÿà¥Œà¤¤à¥€"
                "\n  - Rebate â†’ à¤›à¥‚à¤Ÿ"
                "\n  - Taxable Income â†’ à¤•à¤° à¤¯à¥‹à¤—à¥à¤¯ à¤†à¤¯"
                "\n  - Tax Return â†’ à¤•à¤° à¤µà¤¿à¤µà¤°à¤£à¥€"
                "\n  - Assessment Year â†’ à¤¨à¤¿à¤°à¥à¤§à¤¾à¤°à¤£ à¤µà¤°à¥à¤·"
                "\n  - Financial Year â†’ à¤µà¤¿à¤¤à¥à¤¤à¥€à¤¯ à¤µà¤°à¥à¤·"
                "\n  - Gross Income â†’ à¤¸à¤•à¤² à¤†à¤¯"
                "\n  - Net Income â†’ à¤¶à¥à¤¦à¥à¤§ à¤†à¤¯"
                "\n  - Tax Slab â†’ à¤•à¤° à¤¸à¥à¤²à¥ˆà¤¬"
                "\n  - Government Scheme â†’ à¤¸à¤°à¤•à¤¾à¤°à¥€ à¤¯à¥‹à¤œà¤¨à¤¾"
                "\nAlways prefer these Devanagari terms over their English equivalents in your reply."
            )
        elif (request.language or "en") == "en-IN":
            system_prompt += (
                "\n\nLANGUAGE DIRECTIVE â€“ HINGLISH (en-IN):"
                "\nThe user speaks Hinglish â€” a natural mix of Hindi and English commonly used in India."
                "\nRespond in a friendly Hinglish style: primarily English but freely mix Hindi words and phrases as an Indian person naturally would."
                "\nExamples of Hinglish style:"
                "\n  - 'Aapka income 15 lakh hai toh new regime mein tax lagbhag 1.87 lakh hoga.'"
                "\n  - 'PPF mein invest karna chahte ho? 80C ke under 1.5 lakh tak deduction milta hai.'"
                "\n  - 'Yeh scheme bahut acchi hai retirement ke liye.'"
                "\nKeep the tone conversational and natural. Use Romanized Hindi (Latin script), NOT Devanagari."
                "\nDo NOT force pure Hindi or pure English â€” blend naturally."
                "\nAll financial terms can stay in English (tax, deduction, SIP, PPF, etc.)."
                "\nFollow-up suggestions should also be in Hinglish style."
            )

        # Build a single-turn prompt for the LLM (no RAG retrieval needed for UI guidance)
        combined_prompt = f"{system_prompt}\n\nUser says: {request.userText}"

        # Use the bot's LLM directly for a lightweight call
        from langchain_core.messages import HumanMessage, SystemMessage
        llm = bot.llm
        messages = [SystemMessage(content=system_prompt), HumanMessage(content=request.userText)]
        raw = llm.invoke(messages)
        raw_text = raw.content if hasattr(raw, "content") else str(raw)

        # Strip markdown fences if present
        cleaned = raw_text.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[-1]
        if cleaned.endswith("```"):
            cleaned = cleaned.rsplit("```", 1)[0]
        cleaned = cleaned.strip()

        # Parse JSON
        try:
            parsed = json.loads(cleaned)
        except json.JSONDecodeError:
            # Fallback: treat entire text as a plain reply
            parsed = {"reply": raw_text, "language": request.language or "en"}

        # Validate action type â€” only allow non-destructive actions
        valid_actions = {
            "navigate", "open_report", "highlight_section", "run_calculator",
            "guide_and_highlight", "explain_graph",
        }
        _BLOCKED_ACTIONS = {
            "delete_chat", "delete_document", "clear_saved_responses",
            "reset_data", "submit_filing", "modify_financial_data",
        }
        action_data = parsed.get("action", None)
        # Strip invalid, blocked destructive, or "none" actions
        if isinstance(action_data, dict):
            _action_type = action_data.get("type")
            if _action_type in _BLOCKED_ACTIONS:
                # LLM returned a destructive action despite instructions â€” strip it
                action_data = None
            elif _action_type not in valid_actions:
                action_data = None
        else:
            action_data = None

        response_time = time.time() - start_time

        reply_text = parsed.get("reply", "I'm sorry, I couldn't process that.")
        is_finance_related = bool(parsed.get("isFinanceRelated", False))
        follow_ups = parsed.get("followUps", None)

        # Log interaction with enhanced analytics
        if request.userId:
            try:
                action_type = action_data.get("type", "none") if isinstance(action_data, dict) else "none"
                follow_up_count = len(follow_ups) if isinstance(follow_ups, list) else 0
                crud.log_analytics(db, request.userId, "voice_assistant", {
                    "userText": request.userText[:200],
                    "route": ctx.currentRoute,
                    "action": action_type,
                    "responseTime": round(response_time, 3),
                    "language": request.language or "en",
                    "isFinanceRelated": is_finance_related,
                    "replyLength": len(reply_text),
                    "followUpCount": follow_up_count,
                    "hadAction": action_type != "none",
                    "inputLength": len(request.userText),
                })
            except Exception:
                pass  # non-critical
        # Validate follow_ups is a list of strings
        if isinstance(follow_ups, list):
            follow_ups = [str(f) for f in follow_ups if isinstance(f, str) and f.strip()][:3]
        else:
            follow_ups = None

        # Build optional action object â€” only when a real system action is present
        response_action = None
        if action_data is not None:
            action_type = action_data.get("type", "none")
            response_action = AssistantAction(
                type=action_type,
                target=action_data.get("target"),
                params=action_data.get("params"),
            )

        return AssistantResponse(
            reply=reply_text,
            action=response_action,
            language=parsed.get("language", request.language or "en"),
            audioBase64=None,
            isFinanceRelated=is_finance_related,
            followUps=follow_ups,
        )

    except Exception as e:
        print(f"âŒ Assistant error: {e}")
        return AssistantResponse(
            reply="I'm having trouble right now. Please try again in a moment.",
            action=None,
            language=request.language or "en",
            audioBase64=None,
        )


# â”€â”€ OpenAI Text-to-Speech endpoint â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
class TTSRequest(BaseModel):
    text: str

@app.post("/api/tts")
def text_to_speech(request: TTSRequest):
    """Convert text to speech using OpenAI TTS. Returns streaming audio/mpeg."""
    from openai import OpenAI

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY is not configured")

    if not request.text or not request.text.strip():
        raise HTTPException(status_code=400, detail="Text must not be empty")

    try:
        client = OpenAI(api_key=api_key)
        response = client.audio.speech.create(
            model="gpt-4o-mini-tts",
            voice="alloy",
            input=request.text,
            response_format="mp3",
        )

        audio_bytes = response.content

        return StreamingResponse(
            iter([audio_bytes]),
            media_type="audio/mpeg",
            headers={"Content-Disposition": "inline; filename=speech.mp3"},
        )

    except Exception as e:
        print(f"âŒ TTS error: {e}")
        raise HTTPException(status_code=500, detail=f"TTS generation failed: {str(e)}")

