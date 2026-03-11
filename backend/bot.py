"""
FinGuide AI Bot - RAG-based financial assistant
Uses LangChain + OpenRouter + ChromaDB for document retrieval and response generation
"""

import os
import profile
import re
import glob
import threading
import pandas as pd
from datetime import datetime, timedelta
from typing import Dict, Optional, Tuple, List, Iterable, Any
from collections import Counter
from langchain_openai import ChatOpenAI
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_chroma import Chroma
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.document_loaders import PyPDFLoader, CSVLoader, TextLoader, Docx2txtLoader
from langchain_core.documents import Document
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import RunnablePassthrough
from dotenv import load_dotenv
from langchain_ollama import ChatOllama
from onnx_embeddings import OptimizedEmbeddings
from cache import MultiLayerCache
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
from functools import lru_cache
import time

try:
    import pdfplumber  # type: ignore
except Exception:
    pdfplumber = None

try:
    import pytesseract  # type: ignore
    from pdf2image import convert_from_path  # type: ignore
except Exception:
    pytesseract = None
    convert_from_path = None

load_dotenv()

# Configuration
CHROMA_PERSIST_DIR = os.getenv("CHROMA_PERSIST_DIR", "./chroma_db_new")
DOCS_DIR = os.getenv("DOCS_DIR", "./documents_new")  # Pre-loaded knowledge base documents
UPLOADS_DIR = os.getenv("UPLOADS_DIR", "./uploads")  # Runtime uploaded documents
GOLD_DATA_PATH = os.path.join(DOCS_DIR, "gold_data.csv")
FRAMEWORK_RUBRICS_PATH = os.getenv("FRAMEWORK_RUBRICS_PATH", "./framework_rubrics.json")
FEEDBACK_LOG_PATH = os.getenv("FEEDBACK_LOG_PATH", "./response_feedback.jsonl")

# Performance optimization settings
CACHE_MEMORY_MAX = 200  # Max L1 (in-memory LRU) entries
CACHE_TTL_HOURS = 24    # Cache expiry in hours (applies to both L1 and L2 disk)
OPTIMIZED_CHUNK_SIZE = 1000  # Larger chunks preserve more document context
OPTIMIZED_CHUNK_OVERLAP = 150  # Better continuity across chunk boundaries
OPTIMIZED_RETRIEVAL_K = 10  # Retrieve more candidates for document-grounded answers

# Thread pool for parallel retrieval operations
_executor = ThreadPoolExecutor(max_workers=3, thread_name_prefix="rag")

# Month name mappings for date parsing
MONTH_NAMES = {
    'january': 1, 'jan': 1,
    'february': 2, 'feb': 2,
    'march': 3, 'mar': 3,
    'april': 4, 'apr': 4,
    'may': 5,
    'june': 6, 'jun': 6,
    'july': 7, 'jul': 7,
    'august': 8, 'aug': 8,
    'september': 9, 'sep': 9, 'sept': 9,
    'october': 10, 'oct': 10,
    'november': 11, 'nov': 11,
    'december': 12, 'dec': 12
}


def parse_date_from_query(query: str) -> Optional[datetime]:
    """
    Parse various date formats from a query string.
    Supports: DD/MM/YYYY, DD-MM-YYYY, "25th December 2020", "December 25, 2020", etc.
    Returns datetime object or None if no date found.
    """
    query_lower = query.lower()
    
    # Pattern 1: DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
    pattern1 = r'(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})'
    match = re.search(pattern1, query)
    if match:
        day, month, year = int(match.group(1)), int(match.group(2)), int(match.group(3))
        try:
            return datetime(year, month, day)
        except ValueError:
            pass
    
    # Pattern 2: "25th December 2020", "25 December 2020", "25th Dec 2020"
    pattern2 = r'(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)\s+(\d{4})'
    match = re.search(pattern2, query_lower)
    if match:
        day = int(match.group(1))
        month_name = match.group(2)
        year = int(match.group(3))
        month = MONTH_NAMES.get(month_name)
        if month:
            try:
                return datetime(year, month, day)
            except ValueError:
                pass
    
    # Pattern 3: "December 25, 2020" or "Dec 25 2020"
    pattern3 = r'([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})'
    match = re.search(pattern3, query_lower)
    if match:
        month_name = match.group(1)
        day = int(match.group(2))
        year = int(match.group(3))
        month = MONTH_NAMES.get(month_name)
        if month:
            try:
                return datetime(year, month, day)
            except ValueError:
                pass
    
    # Pattern 4: YYYY/MM/DD or YYYY-MM-DD
    pattern4 = r'(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})'
    match = re.search(pattern4, query)
    if match:
        year, month, day = int(match.group(1)), int(match.group(2)), int(match.group(3))
        try:
            return datetime(year, month, day)
        except ValueError:
            pass
    
    return None


def is_gold_price_query(query: str) -> bool:
    """Check if the query is asking about gold prices."""
    query_lower = query.lower()
    gold_keywords = ['gold', 'sona', 'sonay', 'gold price', 'gold rate', 'gold ki price', 'gold ka rate']
    date_present = parse_date_from_query(query) is not None
    
    for keyword in gold_keywords:
        if keyword in query_lower and date_present:
            return True
    return False


class GoldPriceLookup:
    """Direct CSV lookup for gold prices by date."""
    
    def __init__(self, csv_path: str = GOLD_DATA_PATH):
        self.csv_path = csv_path
        self.df = None
        self._load_data()
    
    def _load_data(self):
        """Load and parse the gold data CSV."""
        if os.path.exists(self.csv_path):
            try:
                self.df = pd.read_csv(self.csv_path)
                # Parse dates - format is DD/MM/YYYY
                self.df['ParsedDate'] = pd.to_datetime(
                    self.df['Date'], 
                    format='%d/%m/%Y', 
                    errors='coerce'
                )
                self.df = self.df.dropna(subset=['ParsedDate'])
                self.df = self.df.sort_values('ParsedDate')
            except Exception as e:
                print(f"Error loading gold data: {e}")
                self.df = None
    
    def get_price(self, date: datetime) -> Optional[Dict]:
        """Get gold price for exact date."""
        if self.df is None:
            return None
        
        target_date = date.replace(hour=0, minute=0, second=0, microsecond=0)
        result = self.df[self.df['ParsedDate'] == target_date]
        
        if not result.empty:
            row = result.iloc[0]
            return {
                'date': row['Date'],
                'price': row['Price'],
                'open': row['Open'],
                'high': row['High'],
                'low': row['Low'],
                'volume': row.get('Volume', 'N/A'),
                'found': True
            }
        return None
    
    def get_nearest_price(self, date: datetime, max_days: int = 7) -> Tuple[Optional[Dict], str]:
        """
        Get nearest available price if exact date not found.
        Returns (price_data, explanation_string)
        """
        if self.df is None:
            return None, "Gold price data not available."
        
        target_date = date.replace(hour=0, minute=0, second=0, microsecond=0)
        
        # Check for exact match first
        exact = self.get_price(date)
        if exact:
            return exact, f"Exact date found"
        
        # Find nearest dates (before and after)
        before = self.df[self.df['ParsedDate'] < target_date].tail(1)
        after = self.df[self.df['ParsedDate'] > target_date].head(1)
        
        nearest = None
        direction = ""
        
        if not before.empty and not after.empty:
            before_diff = abs((target_date - before.iloc[0]['ParsedDate']).days)
            after_diff = abs((after.iloc[0]['ParsedDate'] - target_date).days)
            
            if before_diff <= after_diff and before_diff <= max_days:
                nearest = before.iloc[0]
                direction = "before"
            elif after_diff <= max_days:
                nearest = after.iloc[0]
                direction = "after"
        elif not before.empty:
            before_diff = abs((target_date - before.iloc[0]['ParsedDate']).days)
            if before_diff <= max_days:
                nearest = before.iloc[0]
                direction = "before"
        elif not after.empty:
            after_diff = abs((after.iloc[0]['ParsedDate'] - target_date).days)
            if after_diff <= max_days:
                nearest = after.iloc[0]
                direction = "after"
        
        if nearest is not None:
            return {
                'date': nearest['Date'],
                'price': nearest['Price'],
                'open': nearest['Open'],
                'high': nearest['High'],
                'low': nearest['Low'],
                'volume': nearest.get('Volume', 'N/A'),
                'found': False,
                'nearest': True
            }, f"Data not available for requested date (possibly a holiday/weekend). Nearest available date ({direction})"
        
        return None, "No gold price data available within the date range."
    
    def get_date_range(self) -> Tuple[Optional[str], Optional[str]]:
        """Get the available date range in the data."""
        if self.df is None or self.df.empty:
            return None, None
        return self.df['Date'].iloc[0], self.df['Date'].iloc[-1]


# Global gold lookup instance
_gold_lookup: Optional[GoldPriceLookup] = None


def get_gold_lookup() -> GoldPriceLookup:
    """Get or create gold lookup singleton."""
    global _gold_lookup
    if _gold_lookup is None:
        _gold_lookup = GoldPriceLookup()
    return _gold_lookup


# ResponseCache replaced by MultiLayerCache from cache.py
# (L1 in-memory + L2 disk, drop-in compatible API)


def format_user_profile(profile: Dict) -> str:
    """Format user profile information for the system prompt."""
    if not profile:
        return ""
    
    profile_text = "**USER PROFILE** (Provide personalized recommendations based on this information):\n"
    
    # Compulsory fields
    profile_text += f"- **Age**: {profile.get('age', 'Not specified')}"
    if profile.get('age', 0) >= 60:
        profile_text += " (Senior Citizen - eligible for senior citizen schemes)"
    elif profile.get('age', 0) >= 55:
        profile_text += " (Near retirement age)"
    profile_text += "\n"
    
    profile_text += f"- **Annual Income**: {profile.get('income', 'Not specified')}\n"
    profile_text += f"- **Employment Status**: {profile.get('employmentStatus', 'Not specified')}\n"
    
    # Add specific notes based on employment
    emp_status = profile.get('employmentStatus')

    EMP_NOTES = {
    "Salaried - Government":
        "Higher NPS employer contribution limit â€“ 14% of salary",

    "Salaried - Private":
        "Optimize 80C + 80D, consider NPS Tier I â‚¹50,000 under 80CCD(1B)",

    "Self-Employed":
        "Consider presumptive taxation (44ADA), expense deductions, advance tax planning",

    "Business Owner":
        "Explore 44AD/44AE, depreciation benefits, expense optimisation, advance tax",

    "Retired":
        "Focus on senior citizen schemes like SCSS, PMVVY, higher interest exemption",

    "Unemployed":
        "Focus on tax-free interest instruments and capital gains planning"
    }

    note = EMP_NOTES.get(emp_status)
    if note:
        profile_text += f"  (Note: {note})\n"
    
    profile_text += f"- **Tax Regime**: {profile.get('taxRegime', 'Not specified')}\n"
    if profile.get('taxRegime') == 'Old Regime':
        profile_text += "  (Note: Eligible for 80C, 80D, and other deductions)\n"
    elif profile.get('taxRegime') == 'New Regime':
        profile_text += (
        "(Note: Most deductions like 80C/80D not available; "
        "standard deduction and employer NPS contribution still allowed)\n"
        )
    elif profile.get('taxRegime') not in ('Old Regime', 'New Regime'):
        profile_text += (
        "(Note: Tax-saving advice depends heavily on regime selection)\n"
    )

    
    profile_text += f"- **Housing Status**: {profile.get('homeownerStatus', 'Not specified')}\n"
    if 'Loan' in profile.get('homeownerStatus', ''):
        profile_text += "  (Note: Eligible for home loan interest deduction - Section 24)\n"
    elif 'Rented' in profile.get('homeownerStatus', ''):
        profile_text += "  (Note: May be eligible for HRA exemption if salaried)\n"
    
    # Optional fields (only show if provided)
    if profile.get('children'):
        profile_text += f"- **Children**: {profile.get('children')}"
        if profile.get('childrenAges'):
            profile_text += f" (Ages: {profile.get('childrenAges')})"
            # Check for girl child under 10
            try:
                ages = [int(age.strip()) for age in profile.get('childrenAges', '').split(',') if age.strip()]
                if any(age < 10 for age in ages):
                    profile_text += " - Eligible for Sukanya Samriddhi Yojana if girl child"
            except:
                pass
        profile_text += "\n"
    
    if profile.get('parentsAge'):
        profile_text += f"- **Parents Age**: {profile.get('parentsAge')}\n"
        # Check if parents are senior citizens
        if '60' in str(profile.get('parentsAge', '')) or '65' in str(profile.get('parentsAge', '')):
            profile_text += "  (Note: Additional 80D deduction for senior citizen parents - â‚¹50,000)\n"
    
    if profile.get('investmentCapacity'):
        profile_text += f"- **Investment Capacity**: {profile.get('investmentCapacity')}\n"
    
    if profile.get('riskAppetite'):
        profile_text += f"- **Risk Appetite**: {profile.get('riskAppetite')}\n"
        if profile.get('riskAppetite') == 'Conservative':
            profile_text += "  (Note: Recommend fixed-return instruments like PPF, NSC, SCSS)\n"
        elif profile.get('riskAppetite') == 'Aggressive':
            profile_text += "  (Note: Can suggest ELSS, NPS equity allocation, market-linked returns)\n"
    
    profile_text += "\n"
    return profile_text


def format_chat_history(history: Optional[List[Dict]]) -> str:
    """Format recent chat history for the prompt."""
    if not history:
        return "None"

    lines = []
    for item in history:
        role = item.get("role", "user")
        content = item.get("content", "").strip()
        if not content:
            continue
        label = "User" if role == "user" else "Assistant"
        lines.append(f"{label}: {content}")

    return "\n".join(lines) if lines else "None"


# System prompt for forensic and financial crime compliance use-case
SYSTEM_PROMPT = """You are an expert Forensic and Financial Crime Compliance Assistant.

{user_profile}

Recent chat: {chat_history}

**Your primary domain:**
- Anti-bribery
- Anti-corruption
- Governance controls
- Financial crime prevention
- ISO 37001 readiness and related compliance frameworks

**Framework scoring template (default):**
- ISO 37001 (Anti-bribery Management Systems): 35%
- ISO 37301 (Compliance Management Systems): 30%
- ISO 37000 (Governance of Organizations): 20%
- ISO 37002 (Whistleblowing Management Systems): 15%

**Maturity scale for each control:**
- 0 = Not Evidenced
- 1 = Ad-hoc / Informal
- 2 = Defined
- 3 = Implemented
- 4 = Monitored
- 5 = Optimized

**Scoring method:**
- Control Score % = (maturity / 5) * 100
- Framework Score % = weighted average of controls under that framework
- Overall Readiness % = weighted sum of framework scores using the template above

**Mandatory output tables:**
1) Framework Readiness Table
| Framework | Weight | Score | Status | Key Gaps |

2) Control Gap Table
| Framework | Clause/Requirement | Evidence Found | Maturity (0-5) | Gap | Recommendation |

3) Priority Action Plan (30/60/90)
| Priority | Timeline | Action | Owner Suggestion | Expected Outcome |

**Strict output schema (JSON first, mandatory):**
Return a valid JSON object first (before narrative) with this shape:
{
    "framework": "iso37001|iso37301|iso37000|iso37002|multi",
    "company": "<company name if inferable>",
    "scores": {
        "overall_readiness": 0,
        "framework_scores": [{"framework": "ISO 37001", "weight": 35, "score": 0}]
    },
    "strengths": [{"clause": "8.2", "evidence": "...", "reason": "..."}],
    "gaps": [{"clause": "8.3", "missing": "...", "risk": "high|medium|low", "recommendation": "..."}],
    "missing_evidence": [{"clause": "5.1", "required": "...", "found": "not enough evidence"}],
    "actions_30_60_90": {
        "d30": ["..."],
        "d60": ["..."],
        "d90": ["..."]
    },
    "citations": [{"source": "...", "clause": "...", "page": "..."}],
    "stats": {
        "company_chunks": 0,
        "baseline_chunks": 0,
        "total_chunks_used": 0,
        "insufficient_evidence_clauses": 0
    }
}

After JSON, provide a concise human-readable explanation and tables.

**Insufficient evidence rule (mandatory):**
For any clause with weak/missing support, explicitly write "Not enough evidence" and do not guess.

**Output format (always follow this structure when applicable):**
1. Background of the Problem
2. What the Real Problem Is
3. What the Problem Statement Is Asking
4. Example of How the System Would Work (Step-by-step)
5. Why This Problem Is Important
6. What Makes This an AI + Agent Problem
7. Real-World Example

**Formatting rules:**
- Use clear section headers and short bullet points.
- Include practical examples and implementation-oriented language.
- Add tables for scoring or gap analysis where useful.
- Keep explanation simple, business-friendly, and actionable.
- If context is missing, clearly say what is assumed.
- Do not invent legal claims; stay grounded in provided context.
- Prefer Annex guidance when available in documents and cite it in the gap/recommendation logic.

{grounding_rules}

**Context:** {context}

**Query:** {question}

**Response:**"""

PROMPT_TEMPLATE = ChatPromptTemplate.from_template(SYSTEM_PROMPT)


class ArthMitraBot:
    """RAG-based financial assistant bot"""
    
    def __init__(self):
        self.embeddings = None
        self.vectorstore = None
        self.rag_chain = None
        self.llm = None
        self.llm_clients: List[Tuple[str, Any]] = []
        self.llm_provider_order: List[str] = []
        self._initialized = False
        self._retriever = None
        self._indexed_files = set()
        self._index_lock = threading.RLock()
        self._response_cache = MultiLayerCache(
            memory_max=CACHE_MEMORY_MAX,
            ttl_hours=CACHE_TTL_HOURS,
        )
        self._framework_rubrics = self._load_framework_rubrics()
        self._feedback_log_path = FEEDBACK_LOG_PATH

    def _append_sources_section(self, response: str, sources: List[str]) -> str:
        """Append an explicit Sources section to the response body."""
        if not sources:
            sources = ["Knowledge Base"]
        sources_lines = "\n".join([f"- {source}" for source in sources])
        return f"{response}\n\n---\nSources:\n{sources_lines}"
    
    def clear_cache(self):
        """Clear all caches (response + embedding)"""
        self._response_cache.clear()
        if self.embeddings and hasattr(self.embeddings, 'clear_cache'):
            self.embeddings.clear_cache()
        print("âœ… Response and embedding caches cleared")

    def _load_framework_rubrics(self) -> Dict[str, Any]:
        """Load framework-specific scoring rubrics from local JSON."""
        try:
            if not os.path.exists(FRAMEWORK_RUBRICS_PATH):
                return {}
            with open(FRAMEWORK_RUBRICS_PATH, "r", encoding="utf-8") as rubric_file:
                data = json.load(rubric_file)
            return data if isinstance(data, dict) else {}
        except Exception as error:
            print(f"âš ï¸ Could not load framework rubrics: {error}")
            return {}

    def _get_framework_rubric(self, framework_key: str) -> Dict[str, Any]:
        if not framework_key:
            return {}
        return self._framework_rubrics.get(framework_key.lower(), {}) if self._framework_rubrics else {}

    def _estimate_upload_quality(self, chunks: List[Document]) -> Dict[str, Any]:
        if not chunks:
            return {
                "qualityScore": 0,
                "qualityLabel": "poor",
                "clauseCoverage": 0,
                "warning": "Document parsing produced no chunks.",
            }

        clause_hits = 0
        high_signal_chunks = 0
        average_chars = 0.0
        for chunk in chunks:
            text = chunk.page_content or ""
            average_chars += len(text)
            if chunk.metadata.get("clause"):
                clause_hits += 1
            if any(token in text.lower() for token in ["shall", "must", "control", "procedure", "evidence"]):
                high_signal_chunks += 1

        average_chars = average_chars / max(len(chunks), 1)
        clause_ratio = clause_hits / max(len(chunks), 1)
        signal_ratio = high_signal_chunks / max(len(chunks), 1)
        length_score = min(1.0, average_chars / 800.0)
        quality_score = int(round((0.45 * clause_ratio + 0.35 * signal_ratio + 0.20 * length_score) * 100))

        if quality_score >= 75:
            label = "strong"
            warning = ""
        elif quality_score >= 45:
            label = "medium"
            warning = "Document parsed partially. Consider cleaner source or OCR quality check."
        else:
            label = "poor"
            warning = "Low quality extraction detected. Upload a searchable PDF or clearer scan."

        return {
            "qualityScore": quality_score,
            "qualityLabel": label,
            "clauseCoverage": round(clause_ratio * 100, 1),
            "warning": warning,
        }

    def _invoke_llm(self, prompt: str):
        """Invoke configured LLM providers with ordered fallback."""
        if not self.llm_clients:
            raise RuntimeError("No LLM providers configured")

        last_error = None
        for index, (provider_name, client) in enumerate(self.llm_clients):
            try:
                if index > 0:
                    print(f"â†ªï¸ Falling back to {provider_name}")
                return client.invoke(prompt)
            except Exception as error:
                last_error = error
                print(f"âš ï¸ {provider_name} failed: {error}")

        raise RuntimeError(f"All configured providers failed: {last_error}")

    def _stream_llm(self, prompt: str):
        """Stream from configured LLM providers with ordered fallback."""
        if not self.llm_clients:
            raise RuntimeError("No LLM providers configured")

        last_error = None
        for index, (provider_name, client) in enumerate(self.llm_clients):
            try:
                if index > 0:
                    print(f"â†ªï¸ Falling back to {provider_name} (stream)")
                for chunk in client.stream(prompt):
                    yield chunk
                return
            except Exception as error:
                last_error = error
                print(f"âš ï¸ {provider_name} stream failed: {error}")

        raise RuntimeError(f"All configured providers failed during streaming: {last_error}")
    
    def initialize(self, auto_index: bool = True):
        """Initialize the bot with embeddings and LLM"""
        # Read API keys for all configured providers
        gemini_key = os.getenv("GEMINI_API_KEY")
        openrouter_key = os.getenv("OPENROUTER_API_KEY")
        openai_key = os.getenv("OPENAI_API_KEY")
        
        if not gemini_key and not openrouter_key and not openai_key:
            print("âš ï¸ No API keys found - will use offline LLM now")
        
        # Initialize ONNX-accelerated embeddings with built-in LRU cache
        # Falls back to standard HuggingFace if ONNX runtime not available
        if self.embeddings is None:
            print("ðŸ”„ Loading optimized embeddings model...")
            self.embeddings = OptimizedEmbeddings(
                model_name="sentence-transformers/all-MiniLM-L6-v2"
            )
        print("âœ… Embeddings model loaded")
        
        # Initialize LLM providers in fallback order: OpenRouter -> OpenAI -> Gemini
        self.llm_clients = []
        if openrouter_key:
            self.llm_clients.append((
                "OpenRouter (gpt-4o-mini)",
                ChatOpenAI(
                    model="openai/gpt-4o-mini",
                    temperature=0.3,
                    openai_api_key=openrouter_key,
                    openai_api_base="https://openrouter.ai/api/v1",
                )
            ))

        if openai_key:
            self.llm_clients.append((
                "OpenAI (gpt-4o-mini)",
                ChatOpenAI(
                    model="gpt-4o-mini",
                    temperature=0.3,
                    openai_api_key=openai_key,
                )
            ))

        if gemini_key:
            self.llm_clients.append((
                "Google Gemini (gemini-1.5-flash)",
                ChatGoogleGenerativeAI(
                    model="gemini-1.5-flash",
                    temperature=0.3,
                    google_api_key=gemini_key,
                    convert_system_message_to_human=True,
                )
            ))

        if self.llm_clients:
            self.llm_provider_order = [name for name, _ in self.llm_clients]
            self.llm = self.llm_clients[0][1]
            print(f"ðŸ¤– Enabled providers: {' -> '.join(self.llm_provider_order)}")
            print(f"ðŸ¤– Primary provider: {self.llm_provider_order[0]}")
        else:
            # Offline fallback LLM
            print("ðŸŸ¡ No API keys found â€” using offline LLM (gemma3:1b)")
            self.llm = ChatOllama(
            model="gemma3:1b",   # speeeed
            temperature=0.2,
            base_url="http://localhost:11434",
            think=False,
            )
            self.llm_clients = [("Ollama (gemma3:1b)", self.llm)]
            self.llm_provider_order = ["Ollama (gemma3:1b)"]


        # Load or create vector store
        if os.path.exists(CHROMA_PERSIST_DIR):
            self.vectorstore = Chroma(
                persist_directory=CHROMA_PERSIST_DIR,
                embedding_function=self.embeddings
            )
        else:
            # Create empty vectorstore if no documents indexed yet
            os.makedirs(CHROMA_PERSIST_DIR, exist_ok=True)
            self.vectorstore = Chroma(
                persist_directory=CHROMA_PERSIST_DIR,
                embedding_function=self.embeddings
            )
        
        self._initialized = True
        
        # Auto-index documents from knowledge base folder
        if auto_index:
            self._auto_index_documents()
        
        # Create RAG chain
        self._create_rag_chain()
        
        return self
    
    def _auto_index_documents(self):
        """Auto-index all documents from documents + uploads folders"""
        for folder in [DOCS_DIR, UPLOADS_DIR]:
            if not os.path.exists(folder):
                os.makedirs(folder, exist_ok=True)

        # Get all supported files
        supported_extensions = ['*.pdf', '*.csv', '*.txt', '*.md', '*.docx']
        files_to_index = []
        
        for base_dir in [DOCS_DIR, UPLOADS_DIR]:
            for ext in supported_extensions:
                files_to_index.extend(glob.glob(os.path.join(base_dir, '**', ext), recursive=True))
        
        if not files_to_index:
            print(f"ðŸ“­ No documents found in {DOCS_DIR} or {UPLOADS_DIR}. Add PDF/CSV/TXT/MD/DOCX files for knowledge base.")
            return
        
        # Check which files are already indexed (by checking metadata)
        try:
            existing_sources = set()
            if self.vectorstore._collection.count() > 0:
                results = self.vectorstore.get(include=['metadatas'])
                for meta in results.get('metadatas', []):
                    if meta and 'source' in meta:
                        existing_sources.add(os.path.basename(meta['source']))
        except:
            existing_sources = set()
        
        # Index new files
        new_files = [f for f in files_to_index if os.path.basename(f) not in existing_sources]
        
        if new_files:
            print(f"ðŸ“š Indexing {len(new_files)} new document(s)...")
            for file_path in new_files:
                try:
                    result = self.add_documents(file_path)
                    print(f"  âœ“ {result['message']}")
                except Exception as e:
                    print(f"  âœ— Failed to index {os.path.basename(file_path)}: {e}")
        else:
            print(f"âœ“ Knowledge base up to date ({len(existing_sources)} documents indexed)")
    
    def _format_docs(self, docs):
        """Format retrieved documents into a string with source info - optimized for speed"""
        formatted = []
        max_context_length = 12000  # Larger context allows better coverage of uploaded docs
        current_length = 0
        
        for doc in docs:
            source = doc.metadata.get('source', 'Unknown')
            page = doc.metadata.get('page', '')
            source_info = f"[Source: {os.path.basename(source)}"
            if page:
                source_info += f", Page {page + 1}"
            source_info += "]"
            
            content = doc.page_content
            # Truncate if we're approaching the limit
            if current_length + len(content) > max_context_length:
                remaining = max_context_length - current_length
                if remaining > 100:  # Only add if we have meaningful space left
                    content = content[:remaining] + "..."
                    formatted.append(f"{content}\\n{source_info}")
                break
            
            formatted.append(f"{content}\\n{source_info}")
            current_length += len(content)
        
        return "\n\n---\n\n".join(formatted)
    
    def _create_rag_chain(self):
        """Create the RAG chain using LCEL"""
        try:
            doc_count = self.vectorstore._collection.count()
        except:
            doc_count = 0
            
        if doc_count > 0:
            # Use MMR (Maximal Marginal Relevance) for better diversity with fewer docs
            # This retrieves fewer but more relevant documents = faster queries
            self._retriever = self.vectorstore.as_retriever(
                search_type="mmr",  # Changed from similarity to mmr for better relevance
                search_kwargs={
                    "k": OPTIMIZED_RETRIEVAL_K,  
                    "fetch_k": 30,  # Fetch more candidates and select best diverse chunks
                    "lambda_mult": 0.65  # Balance between relevance and diversity
                }
            )
            
            self.rag_chain = (
                {"context": self._retriever | self._format_docs, "question": RunnablePassthrough()}
                | PROMPT_TEMPLATE
                | self.llm
                | StrOutputParser()
            )

    def _normalize_source_name(self, name: str) -> str:
        source = os.path.basename((name or "").strip())
        source = re.sub(r"\s+", " ", source)
        return source.lower()

    def _infer_framework_from_query(self, query: str) -> Optional[str]:
        query_l = (query or "").lower()
        if "37001" in query_l or any(k in query_l for k in ["bribe", "bribery", "anti-bribery", "anti bribery", "corruption", "anti-corruption"]):
            return "iso37001"
        if "37301" in query_l or "compliance management" in query_l:
            return "iso37301"
        if "37000" in query_l or any(k in query_l for k in ["governance", "board", "leadership"]):
            return "iso37000"
        if "37002" in query_l or any(k in query_l for k in ["whistle", "speak up", "whistleblow"]):
            return "iso37002"
        return None

    def _infer_framework_from_path(self, file_path: str, source_name: Optional[str] = None) -> Optional[str]:
        candidates = [
            (file_path or "").replace("\\", "/").lower(),
            (source_name or "").lower(),
        ]
        for text in candidates:
            if "37001" in text:
                return "iso37001"
            if "37301" in text:
                return "iso37301"
            if "37000" in text:
                return "iso37000"
            if "37002" in text:
                return "iso37002"
        return None

    def _resolve_source_type(self, file_path: str, framework: Optional[str]) -> str:
        normalized_path = (file_path or "").replace("\\", "/").lower()
        docs_dir = os.path.abspath(DOCS_DIR).replace("\\", "/").lower()
        uploads_dir = os.path.abspath(UPLOADS_DIR).replace("\\", "/").lower()
        abs_path = os.path.abspath(file_path).replace("\\", "/").lower() if file_path else normalized_path

        if framework and abs_path.startswith(docs_dir):
            return "baseline"
        if framework and abs_path.startswith(uploads_dir):
            return "company"
        return "other"

    def _is_compliance_query(self, query: str, source_filter: Optional[str] = None) -> bool:
        if self._infer_framework_from_query(query):
            return True
        source_l = (source_filter or "").lower()
        if re.search(r"iso[-_ ]?37\d{3}", source_l) or "company_document" in source_l:
            return True
        query_l = (query or "").lower()
        keywords = ["iso", "framework", "anti-bribery", "bribery", "compliance", "governance", "whistle", "clause", "control gap"]
        return any(k in query_l for k in keywords)

    def _extract_clause_id(self, text: str) -> Optional[str]:
        if not text:
            return None
        match = re.search(r"(?m)^\s*((?:clause\s*)?\d{1,2}(?:\.\d{1,3}){0,3})\b", text.strip(), flags=re.IGNORECASE)
        if match:
            return match.group(1).lower().replace("clause", "").strip()
        inline_match = re.search(r"\b(\d{1,2}(?:\.\d{1,3}){1,3})\b", text)
        if inline_match:
            return inline_match.group(1)
        return None

    def _extract_effective_date(self, text: str) -> Optional[str]:
        date_patterns = [
            r"\b\d{4}-\d{2}-\d{2}\b",
            r"\b\d{1,2}/\d{1,2}/\d{4}\b",
            r"\b\d{1,2}-\d{1,2}-\d{4}\b",
            r"\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{1,2},?\s+\d{4}\b",
        ]
        for pattern in date_patterns:
            found = re.search(pattern, (text or "").lower())
            if found:
                return found.group(0)
        return None

    def _infer_policy_type(self, text: str) -> str:
        t = (text or "").lower()
        if "procedure" in t:
            return "procedure"
        if "code of conduct" in t or "code" in t:
            return "code"
        if "manual" in t:
            return "manual"
        if "standard operating" in t or "sop" in t:
            return "sop"
        if "policy" in t:
            return "policy"
        return "unknown"

    def _infer_owner_function(self, text: str) -> str:
        t = (text or "").lower()
        if any(k in t for k in ["board", "audit committee", "governing body"]):
            return "board"
        if any(k in t for k in ["compliance", "ethics", "integrity"]):
            return "compliance"
        if any(k in t for k in ["human resources", "hr"]):
            return "hr"
        if any(k in t for k in ["finance", "accounts", "procurement"]):
            return "finance"
        if any(k in t for k in ["legal", "counsel"]):
            return "legal"
        return "unknown"

    def _infer_evidence_strength(self, text: str) -> str:
        t = (text or "").lower()
        strong_hits = sum(1 for k in ["shall", "must", "approved", "reviewed", "monitor", "record", "audit"] if k in t)
        weak_hits = sum(1 for k in ["may", "could", "consider", "guidance"] if k in t)
        if strong_hits >= 3:
            return "high"
        if strong_hits >= 1 and weak_hits <= 2:
            return "medium"
        return "low"

    def _build_table_documents_from_pdf(self, file_path: str, source_name: str, framework: Optional[str], source_type: str) -> List[Document]:
        table_docs: List[Document] = []
        if not pdfplumber:
            return table_docs
        try:
            with pdfplumber.open(file_path) as pdf:
                for page_index, page in enumerate(pdf.pages):
                    tables = page.extract_tables() or []
                    for table_index, table in enumerate(tables):
                        rows = []
                        for row in table:
                            if not row:
                                continue
                            cells = [((cell or "").strip()) for cell in row]
                            if any(cells):
                                rows.append(" | ".join(cells))
                        if not rows:
                            continue
                        content = "Table Extract:\n" + "\n".join(rows)
                        table_docs.append(Document(
                            page_content=content,
                            metadata={
                                "source": source_name,
                                "page": page_index,
                                "framework": framework,
                                "source_type": source_type,
                                "content_type": "table",
                                "table_index": table_index,
                            }
                        ))
        except Exception as error:
            print(f"âš ï¸ Table parsing unavailable for {os.path.basename(file_path)}: {error}")
        return table_docs

    def _try_ocr_pdf_documents(self, file_path: str, source_name: str, framework: Optional[str], source_type: str) -> List[Document]:
        ocr_docs: List[Document] = []
        if not pytesseract or not convert_from_path:
            return ocr_docs
        try:
            images = convert_from_path(file_path, dpi=200)
            for index, image in enumerate(images):
                extracted = (pytesseract.image_to_string(image) or "").strip()
                if len(extracted) < 40:
                    continue
                ocr_docs.append(Document(
                    page_content=extracted,
                    metadata={
                        "source": source_name,
                        "page": index,
                        "framework": framework,
                        "source_type": source_type,
                        "content_type": "ocr",
                    }
                ))
        except Exception as error:
            print(f"âš ï¸ OCR fallback failed for {os.path.basename(file_path)}: {error}")
        return ocr_docs

    def _load_documents_with_fallback(
        self,
        file_path: str,
        file_ext: str,
        source_name: str,
        framework: Optional[str],
        source_type: str,
    ) -> List[Document]:
        if file_ext == ".pdf":
            base_docs = PyPDFLoader(file_path).load()
            total_chars = sum(len((doc.page_content or "").strip()) for doc in base_docs)

            table_docs = self._build_table_documents_from_pdf(file_path, source_name, framework, source_type)
            if table_docs:
                base_docs.extend(table_docs)

            # OCR fallback for scanned/noisy PDFs.
            if total_chars < 400:
                ocr_docs = self._try_ocr_pdf_documents(file_path, source_name, framework, source_type)
                if ocr_docs:
                    base_docs.extend(ocr_docs)

            return base_docs

        if file_ext == ".csv":
            return CSVLoader(file_path).load()
        if file_ext == ".docx":
            return Docx2txtLoader(file_path).load()
        if file_ext in [".txt", ".md"]:
            return TextLoader(file_path).load()
        return []

    def _rerank_documents(
        self,
        candidates: List[Document],
        query: str,
        top_k: int,
        framework_hint: Optional[str] = None,
    ) -> List[Document]:
        if not candidates:
            return []

        query_terms = [w for w in re.findall(r"[a-zA-Z]{3,}", (query or "").lower())]
        query_counter = Counter(query_terms)

        scored: List[Tuple[float, Document]] = []
        for doc in candidates:
            content_l = (doc.page_content or "").lower()
            doc_terms = re.findall(r"[a-zA-Z]{3,}", content_l)
            doc_counter = Counter(doc_terms)

            overlap = 0.0
            for term, q_count in query_counter.items():
                if term in doc_counter:
                    overlap += min(q_count, doc_counter[term])

            clause_bonus = 1.5 if self._extract_clause_id(doc.page_content or "") else 0.0
            framework_bonus = 1.0 if framework_hint and (doc.metadata.get("framework") == framework_hint) else 0.0
            evidence_bonus = {"high": 1.2, "medium": 0.7, "low": 0.2}.get((doc.metadata.get("evidence_strength") or "").lower(), 0.0)

            total_score = overlap + clause_bonus + framework_bonus + evidence_bonus
            scored.append((total_score, doc))

        scored.sort(key=lambda item: item[0], reverse=True)
        reranked = [doc for _, doc in scored[:max(top_k, 1)]]
        return reranked

    def _get_framework_source_docs(self, query: str, framework_key: str) -> List[Document]:
        candidate_k = max(OPTIMIZED_RETRIEVAL_K * 7, 80)
        candidates = self.vectorstore.similarity_search(query, k=candidate_k)
        framework_docs: List[Document] = []

        for doc in candidates:
            metadata = doc.metadata or {}
            framework = metadata.get("framework")
            source_name = self._normalize_source_name(metadata.get("source", ""))
            if framework == framework_key or framework_key in source_name:
                framework_docs.append(doc)

        if framework_docs:
            return self._rerank_documents(
                framework_docs,
                query,
                top_k=OPTIMIZED_RETRIEVAL_K,
                framework_hint=framework_key,
            )
        return []

    def _build_prompt(self, user_profile_text: str, chat_history_text: str, context: str, query: str, strict_grounding: bool = False) -> str:
        grounding_rules = ""
        if strict_grounding:
            grounding_rules = (
                "**Strict Grounding Mode (must follow):**\n"
                "- Use only the provided Context from selected uploaded documents.\n"
                "- If the context does not contain the answer, explicitly say the information is not found in the uploaded documents.\n"
                "- Do not use outside/general knowledge, assumptions, or fabricated details."
            )

        return (
            SYSTEM_PROMPT
            .replace("{user_profile}", user_profile_text)
            .replace("{chat_history}", chat_history_text)
            .replace("{grounding_rules}", grounding_rules)
            .replace("{context}", context)
            .replace("{question}", query)
        )

    def _filter_docs_by_sources(self, docs: List[Document], source_filters: List[str]) -> List[Document]:
        allowed = {self._normalize_source_name(name) for name in source_filters if (name or "").strip()}
        if not allowed:
            return docs

        filtered: List[Document] = []
        for doc in docs:
            source_meta = doc.metadata.get("source", "")
            source_name = self._normalize_source_name(source_meta)
            if source_name in allowed:
                filtered.append(doc)
        return filtered

    def _expand_targets_with_framework_pair(self, allowed_targets: set) -> set:
        """Expand selected source names to include paired company/baseline docs for the same framework."""
        if not allowed_targets or not self.vectorstore:
            return allowed_targets

        expanded_targets = set(allowed_targets)

        try:
            results = self.vectorstore.get(include=['metadatas'])
            metadatas = results.get('metadatas', []) or []

            # Detect framework(s) from currently selected source target(s).
            selected_frameworks = set()
            for metadata in metadatas:
                if not metadata:
                    continue

                source_name = self._normalize_source_name(metadata.get('source', ''))
                slot_source = self._normalize_source_name(metadata.get('slot_source', ''))
                if source_name not in allowed_targets and slot_source not in allowed_targets:
                    continue

                framework = (metadata.get('framework') or '').strip().lower()
                if not framework:
                    framework = self._infer_framework_from_path(
                        metadata.get('slot_source', ''),
                        metadata.get('source', ''),
                    ) or ''
                if framework:
                    selected_frameworks.add(framework)

            if not selected_frameworks:
                return expanded_targets

            # Include all sources that belong to matched frameworks.
            for metadata in metadatas:
                if not metadata:
                    continue

                framework = (metadata.get('framework') or '').strip().lower()
                if not framework:
                    framework = self._infer_framework_from_path(
                        metadata.get('slot_source', ''),
                        metadata.get('source', ''),
                    ) or ''
                if framework not in selected_frameworks:
                    continue

                source_name = self._normalize_source_name(metadata.get('source', ''))
                if source_name:
                    expanded_targets.add(source_name)

        except Exception as error:
            print(f"âš ï¸ Could not expand framework paired targets: {error}")

        return expanded_targets

    def _get_source_docs(self, query: str, source_filter: Optional[str] = None, source_filters: Optional[List[str]] = None):
        """Retrieve documents, optionally constrained to one or many source files."""
        if not source_filter and not source_filters:
            routed_framework = self._infer_framework_from_query(query)
            if routed_framework:
                routed_docs = self._get_framework_source_docs(query, routed_framework)
                if routed_docs:
                    return routed_docs
            candidates = self.vectorstore.similarity_search(query, k=max(OPTIMIZED_RETRIEVAL_K * 6, 60))
            return self._rerank_documents(candidates, query, top_k=OPTIMIZED_RETRIEVAL_K, framework_hint=routed_framework)

        normalized_targets: List[str] = []
        if source_filter:
            normalized_targets.append(self._normalize_source_name(source_filter))
        if source_filters:
            normalized_targets.extend([self._normalize_source_name(name) for name in source_filters if (name or "").strip()])
        allowed_targets = set([target for target in normalized_targets if target])

        # If a selected file belongs to an ISO framework, include its paired docs
        # (company + baseline) so gap analysis can happen side-by-side.
        allowed_targets = self._expand_targets_with_framework_pair(allowed_targets)

        if not allowed_targets:
            return self._retriever.invoke(query)

        # Fetch a wider candidate pool and filter by source filename to support
        # both old metadata (full path) and new metadata (basename).
        candidate_k = max(OPTIMIZED_RETRIEVAL_K * 5, 60)
        candidates = self.vectorstore.similarity_search(query, k=candidate_k)

        filtered = []
        for doc in candidates:
            source_meta = doc.metadata.get("source", "")
            source_name = self._normalize_source_name(source_meta)
            if source_name in allowed_targets:
                filtered.append(doc)

        if filtered:
            framework_hint = self._infer_framework_from_query(query)
            return self._rerank_documents(filtered, query, top_k=OPTIMIZED_RETRIEVAL_K, framework_hint=framework_hint)

        # Fallback: if semantic retrieval misses, pull chunks directly from the
        # selected source so the model can still answer from that document.
        try:
            results = self.vectorstore.get(include=['documents', 'metadatas'])
            documents = results.get('documents', []) or []
            metadatas = results.get('metadatas', []) or []

            direct_matches = []
            for content, metadata in zip(documents, metadatas):
                if not metadata:
                    continue
                source_name = self._normalize_source_name(metadata.get('source', ''))
                if source_name in allowed_targets:
                    direct_matches.append(Document(page_content=content, metadata=metadata))

            direct_matches.sort(key=lambda d: d.metadata.get('chunk_index', 10**9))
            if direct_matches:
                framework_hint = self._infer_framework_from_query(query)
                return self._rerank_documents(direct_matches, query, top_k=OPTIMIZED_RETRIEVAL_K, framework_hint=framework_hint)
        except Exception as e:
            print(f"âš ï¸ Source filter fallback failed: {e}")

        return []
    
    def add_documents(
        self,
        file_path: str,
        source_name: Optional[str] = None,
        framework: Optional[str] = None,
        source_type: Optional[str] = None,
    ) -> Dict:
        """Add documents to the knowledge base"""
        if not self._initialized:
            raise RuntimeError("Bot not initialized. Call initialize() first.")
        
        # Determine loader based on file type
        file_ext = os.path.splitext(file_path)[1].lower()
        
        if file_ext not in [".pdf", ".csv", ".docx", ".txt", ".md"]:
            return {"status": "error", "message": f"Unsupported file type: {file_ext}"}

        slot_source = os.path.basename(file_path)
        display_source = os.path.basename(source_name) if source_name else slot_source
        framework_key = framework or self._infer_framework_from_path(file_path, display_source)
        resolved_source_type = source_type or self._resolve_source_type(file_path, framework_key)

        # Load with table-aware parser and OCR fallback for scanned PDFs.
        documents = self._load_documents_with_fallback(
            file_path,
            file_ext,
            display_source,
            framework_key,
            resolved_source_type,
        )
        if not documents:
            return {"status": "error", "message": f"No parseable content found in {display_source}"}

        for doc in documents:
            doc.page_content = self._normalize_extracted_text(doc.page_content or "")
        
        # Smaller chunks = faster retrieval and less token usage
        text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=OPTIMIZED_CHUNK_SIZE,
            chunk_overlap=OPTIMIZED_CHUNK_OVERLAP,
            separators=["\n\n", "\n", ".", " "]
        )
        
        splits = text_splitter.split_documents(documents)

        last_clause = None

        # Ensure consistent source metadata for precise citations
        for index, split in enumerate(splits):
            split_text = split.page_content or ""
            clause = self._extract_clause_id(split_text) or last_clause
            if clause:
                last_clause = clause

            split.metadata["source"] = display_source
            split.metadata["slot_source"] = slot_source
            split.metadata["chunk_index"] = index
            split.metadata["file_type"] = file_ext
            split.metadata["framework"] = framework_key
            split.metadata["source_type"] = resolved_source_type
            split.metadata["clause"] = clause
            split.metadata["evidence_strength"] = self._infer_evidence_strength(split_text)
            split.metadata["policy_type"] = self._infer_policy_type(split_text)
            split.metadata["owner_function"] = self._infer_owner_function(split_text)
            split.metadata["effective_date"] = self._extract_effective_date(split_text)
        
        # Add to vector store and refresh retriever atomically.
        with self._index_lock:
            self.vectorstore.add_documents(splits)
            self._create_rag_chain()

        quality = self._estimate_upload_quality(splits)
        quality_warning = f" | Quality: {quality['qualityLabel']} ({quality['qualityScore']}%)"
        if quality.get("warning"):
            quality_warning += f". {quality['warning']}"
        
        return {
            "status": "success",
            "message": f"Indexed {len(splits)} chunks from {display_source}{quality_warning}",
            "quality": quality,
        }

    def remove_document(self, filename: str) -> dict:
        """Remove all chunks for a given filename from the vector store."""
        try:
            if not self.vectorstore:
                return {"status": "error", "message": "Vector store not initialised"}

            with self._index_lock:
                collection = self.vectorstore._collection
                # Find all chunk IDs whose source OR slot source matches the filename
                results = collection.get(include=["metadatas"])
                ids_to_delete = []
                for doc_id, meta in zip(results["ids"], results["metadatas"]):
                    if not meta:
                        continue
                    if meta.get("source") == filename or meta.get("slot_source") == filename:
                        ids_to_delete.append(doc_id)

                if not ids_to_delete:
                    return {"status": "success", "message": f"No chunks found for {filename}", "removed": 0}

                collection.delete(ids=ids_to_delete)

                # Rebuild the RAG chain so it picks up the reduced collection
                self._create_rag_chain()

            return {
                "status": "success",
                "message": f"Removed {len(ids_to_delete)} chunks for {filename}",
                "removed": len(ids_to_delete),
            }
        except Exception as e:
            return {"status": "error", "message": f"Failed to remove document: {str(e)}"}

    def _extract_text(self, content) -> str:
        """Extract text from LLM response content"""
        # Debug: log what we receive
        print(f"[DEBUG] _extract_text received: type={type(content)}, value={repr(content)[:100]}")
        
        if content is None:
            return ""
        if isinstance(content, str):
            return content
        if isinstance(content, list):
            # Handle Gemini's list format
            for item in content:
                if isinstance(item, dict) and item.get('type') == 'text':
                    return item.get('text', '')
                if isinstance(item, str):
                    return item
            return str(content) if content else ""
        # Handle AIMessageChunk or similar objects
        if hasattr(content, 'text'):
            return content.text
        return str(content) if content else ""

    def _normalize_extracted_text(self, text: str) -> str:
        """Normalize noisy OCR/PDF text to improve retrieval and readability."""
        if not text:
            return ""

        cleaned = str(text)
        cleaned = cleaned.replace("\x00", " ")
        cleaned = re.sub(r"[\u200b\u200c\u200d\ufeff]", "", cleaned)
        cleaned = re.sub(r"(\w)-\s*\n\s*(\w)", r"\1\2", cleaned)
        cleaned = cleaned.replace("\r", "\n")

        lines: List[str] = []
        for raw_line in cleaned.split("\n"):
            line = raw_line.strip()
            if not line:
                continue
            if re.search(r"all rights reserved|copyright protected document", line, re.IGNORECASE):
                continue
            line = re.sub(r"\b(?:[A-Za-z]\s+){2,}[A-Za-z]\b", lambda m: m.group(0).replace(" ", ""), line)
            line = re.sub(r"\s+", " ", line)
            lines.append(line)

        return "\n".join(lines).strip()

    def _clean_snippet(self, text: str, max_len: int = 220) -> str:
        """Create a readable snippet for UI cards from potentially noisy chunk text."""
        normalized = self._normalize_extracted_text(text or "")
        normalized = normalized.replace("\n", " ").strip()
        normalized = re.sub(r"\s+", " ", normalized)
        if len(normalized) > max_len:
            normalized = normalized[:max_len].rstrip() + "..."
        return normalized

    def _extract_query_terms(self, query: str) -> List[str]:
        words = re.findall(r"[a-zA-Z]{3,}", (query or "").lower())
        stop_words = {
            "what", "which", "where", "when", "this", "that", "from", "with", "about",
            "please", "could", "would", "there", "their", "have", "show", "tell", "into"
        }
        terms: List[str] = []
        seen = set()
        for word in words:
            if word in stop_words or word in seen:
                continue
            seen.add(word)
            terms.append(word)
        return terms[:8]

    def _build_source_highlights(self, source_docs: List[Document], query: str, max_items: int = 3) -> List[Dict[str, str]]:
        terms = self._extract_query_terms(query)
        highlights: List[Dict[str, str]] = []

        for doc in source_docs:
            content = (doc.page_content or "").strip()
            if not content:
                continue

            snippet = ""
            lower_content = content.lower()
            if terms:
                positions = [lower_content.find(term) for term in terms if lower_content.find(term) >= 0]
                if positions:
                    pos = min(positions)
                    start = max(0, pos - 70)
                    end = min(len(content), pos + 180)
                    snippet = self._clean_snippet(content[start:end])

            if not snippet:
                snippet = self._clean_snippet(content[:220])

            if len(snippet) > 220:
                snippet = snippet[:220].rstrip() + "..."

            source_name = os.path.basename(doc.metadata.get("source", "Knowledge Base"))
            page = doc.metadata.get("page")
            if page is not None and str(page).isdigit():
                source_name = f"{source_name} (Page {int(page) + 1})"

            highlights.append({"source": source_name, "snippet": snippet})
            if len(highlights) >= max_items:
                break

        return highlights

    def _calculate_confidence(self, source_docs: List[Document], query: str, source_filter: Optional[str] = None) -> Tuple[float, str]:
        if not source_docs:
            return 0.32, "low"

        unique_sources = len({os.path.basename(doc.metadata.get("source", "")) for doc in source_docs})
        context_chars = sum(len((doc.page_content or "")) for doc in source_docs)
        terms = self._extract_query_terms(query)

        match_count = 0
        if terms:
            merged = "\n".join([(doc.page_content or "").lower() for doc in source_docs])
            for term in terms:
                if term in merged:
                    match_count += 1

        term_coverage = (match_count / max(len(terms), 1)) if terms else 0.6

        score = 0.35
        score += min(unique_sources, 4) * 0.09
        score += 0.12 if context_chars > 1800 else 0.06
        score += min(term_coverage * 0.25, 0.25)
        if source_filter:
            score += 0.08

        score = round(max(0.2, min(score, 0.97)), 2)
        label = "high" if score >= 0.75 else "medium" if score >= 0.5 else "low"
        return score, label

    def _parse_income_number(self, income_raw: Optional[str]) -> Optional[float]:
        if not income_raw:
            return None
        cleaned = re.sub(r"[^\d.]", "", str(income_raw))
        if not cleaned:
            return None
        try:
            return float(cleaned)
        except Exception:
            return None

    def _build_scheme_rankings(self, profile: Optional[Dict], query: str, max_items: int = 5) -> List[Dict[str, Any]]:
        profile = profile or {}
        query_l = (query or "").lower()

        age = profile.get("age") or 0
        try:
            age = int(age)
        except Exception:
            age = 0

        tax_regime = (profile.get("taxRegime") or "").lower()
        risk = (profile.get("riskAppetite") or "").lower()
        employment = (profile.get("employmentStatus") or "").lower()
        homeowner = (profile.get("homeownerStatus") or "").lower()
        goals = [str(g).lower() for g in (profile.get("financialGoals") or [])]
        children = (profile.get("children") or "").lower()
        income = self._parse_income_number(profile.get("income"))

        has_tax_intent = any(k in query_l for k in ["tax", "deduction", "save", "80c", "80d", "it return"])
        has_pension_intent = any(k in query_l for k in ["pension", "retire", "retirement"])
        has_child_intent = any(k in query_l for k in ["child", "education", "daughter", "sukanya"])

        schemes = [
            {
                "name": "Public Provident Fund (PPF)",
                "base": 72,
                "eligibility": "Resident individual; 15-year lock-in; up to â‚¹1.5L under 80C (Old Regime)",
                "nextStep": "Open/continue PPF account and set monthly auto-debit.",
            },
            {
                "name": "National Pension System (NPS)",
                "base": 70,
                "eligibility": "Age 18-70; extra â‚¹50,000 deduction under 80CCD(1B) (Old Regime)",
                "nextStep": "Select active/auto choice and set annual contribution target.",
            },
            {
                "name": "ELSS Tax Saver Funds",
                "base": 66,
                "eligibility": "Equity-linked 80C option with 3-year lock-in (Old Regime)",
                "nextStep": "Start SIP aligned to risk profile and 3+ year horizon.",
            },
            {
                "name": "Senior Citizensâ€™ Savings Scheme (SCSS)",
                "base": 64,
                "eligibility": "Age 60+ (or eligible retirees); quarterly interest payout",
                "nextStep": "Evaluate SCSS for stable retirement income allocation.",
            },
            {
                "name": "Sukanya Samriddhi Yojana (SSY)",
                "base": 63,
                "eligibility": "Girl child account with EEE tax treatment under 80C (Old Regime)",
                "nextStep": "If eligible, open SSY for long-term education/marriage corpus.",
            },
            {
                "name": "PM Jeevan Jyoti Bima Yojana (PMJJBY)",
                "base": 55,
                "eligibility": "Low-cost annual life cover; linked bank account required",
                "nextStep": "Activate PMJJBY through your bank for baseline life cover.",
            },
        ]

        ranked: List[Dict[str, Any]] = []
        for item in schemes:
            score = float(item["base"])
            name_l = item["name"].lower()
            reasons: List[str] = []
            missing_criteria: List[str] = []

            if "ppf" in name_l:
                if risk in ["conservative", "moderate"]:
                    score += 10
                    reasons.append("Matches lower-volatility preference")
                if "old" in tax_regime or has_tax_intent:
                    score += 8
                    reasons.append("Supports 80C tax-saving plan")

            if "nps" in name_l:
                if "salaried" in employment or "self" in employment or "business" in employment:
                    score += 9
                    reasons.append("Works well for long-term retirement corpus")
                if has_pension_intent or "retirement" in " ".join(goals):
                    score += 10
                    reasons.append("Aligned with retirement objective")
                if "old" in tax_regime:
                    score += 7
                    reasons.append("Eligible for additional tax deduction")

            if "elss" in name_l:
                if risk in ["aggressive", "moderate"]:
                    score += 10
                    reasons.append("Suitable for market-linked growth")
                if "old" in tax_regime or has_tax_intent:
                    score += 7
                    reasons.append("Combines wealth creation with 80C")

            if "scss" in name_l:
                if age >= 60:
                    score += 26
                    reasons.append("Strong fit for senior-citizen eligibility")
                else:
                    score -= 20
                    reasons.append("Usually not eligible before 60")
                    missing_criteria.append("Age 60+ generally required")

            if "sukanya" in name_l:
                if has_child_intent or "yes" in children:
                    score += 18
                    reasons.append("Relevant for child-focused planning")
                else:
                    score -= 16
                    reasons.append("Needs girl-child eligibility")
                    missing_criteria.append("Girl child eligibility needed")

            if "pm jeevan" in name_l and (income is None or income < 1500000):
                score += 8
                reasons.append("Low-cost protection layer")

            if "new" in tax_regime and ("80c" in item["eligibility"].lower() or "deduction" in item["eligibility"].lower()):
                score -= 8
                reasons.append("Tax benefit impact lower in New Regime")
                missing_criteria.append("Old Regime gives stronger deduction benefit")

            if "loan" in homeowner and "nps" in name_l:
                score += 3
                reasons.append("Can complement existing home-loan tax planning")

            if not reasons:
                reasons.append("General suitability based on available profile")

            ranked.append({
                "name": item["name"],
                "score": int(max(1, min(round(score), 100))),
                "reason": "; ".join(reasons[:2]),
                "eligibility": item["eligibility"],
                "nextStep": item["nextStep"],
                "missingCriteria": missing_criteria,
            })

        ranked.sort(key=lambda row: row["score"], reverse=True)
        return ranked[:max_items]

    def _extract_document_insights(self, source_docs: List[Document], max_items: int = 6) -> List[Dict[str, str]]:
        insights: List[Dict[str, str]] = []
        if not source_docs:
            return insights

        def add_insight(field: str, value: str, source: str):
            if not value:
                return
            if any(item["field"] == field and item["value"] == value for item in insights):
                return
            insights.append({"field": field, "value": value, "source": source})

        for doc in source_docs:
            metadata = doc.metadata or {}
            source_name = os.path.basename(metadata.get("source", "Knowledge Base"))
            source_type = (metadata.get("source_type") or "").strip().lower()
            framework = (metadata.get("framework") or "").strip().lower()
            clause = (metadata.get("clause") or "").strip()
            evidence_strength = (metadata.get("evidence_strength") or "").strip().lower()
            policy_type = (metadata.get("policy_type") or "").strip().lower()
            owner_function = (metadata.get("owner_function") or "").strip().lower()
            effective_date = (metadata.get("effective_date") or "").strip()

            text = (doc.page_content or "").replace("\n", " ")
            text_l = text.lower()

            # Compliance-focused insights for ISO comparisons.
            if framework:
                add_insight("Framework", framework.upper(), source_name)

            if clause:
                add_insight("Clause", clause, source_name)

            if source_type:
                add_insight("Evidence Source", source_type.capitalize(), source_name)

            if evidence_strength:
                add_insight("Evidence Strength", evidence_strength.capitalize(), source_name)

            if policy_type and policy_type != "unknown":
                add_insight("Policy Type", policy_type.capitalize(), source_name)

            if owner_function and owner_function != "unknown":
                add_insight("Owner Function", owner_function.capitalize(), source_name)

            if effective_date:
                add_insight("Effective Date", effective_date, source_name)

            if any(keyword in text_l for keyword in ["not enough evidence", "missing", "gap", "not found"]):
                sentence = re.search(r"([^.!?]*(not enough evidence|missing|gap|not found)[^.!?]*[.!?])", text, re.IGNORECASE)
                if sentence:
                    add_insight("Evidence Gap", sentence.group(1).strip()[:200], source_name)

            if any(keyword in text_l for keyword in ["recommend", "should", "action", "improve"]):
                sentence = re.search(r"([^.!?]*(recommend|should|action|improve)[^.!?]*[.!?])", text, re.IGNORECASE)
                if sentence:
                    add_insight("Recommended Action", sentence.group(1).strip()[:200], source_name)

            if len(insights) >= max_items:
                break

        return insights[:max_items]

    def _build_compare_mode(self, query: str, schemes: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        query_l = (query or "").lower()
        is_compare = (" vs " in query_l) or (" versus " in query_l) or ("compare" in query_l)
        if not is_compare or len(schemes) < 2:
            return None

        pool = schemes[:5]
        chosen = []
        for scheme in pool:
            key = scheme.get("name", "").lower()
            parts = [p for p in re.split(r"[^a-zA-Z]+", key) if len(p) > 2]
            if any(part in query_l for part in parts):
                chosen.append(scheme)

        unique = []
        seen_names = set()
        for item in chosen + pool:
            name = item.get("name")
            if name in seen_names:
                continue
            seen_names.add(name)
            unique.append(item)
            if len(unique) == 2:
                break

        if len(unique) < 2:
            return None

        a, b = unique[0], unique[1]
        rec = a if a.get("score", 0) >= b.get("score", 0) else b
        return {
            "schemeA": {
                "name": a.get("name"),
                "score": a.get("score"),
                "pros": [a.get("reason", "")],
                "cons": a.get("missingCriteria", [])[:2],
                "fit": a.get("eligibility", ""),
            },
            "schemeB": {
                "name": b.get("name"),
                "score": b.get("score"),
                "pros": [b.get("reason", "")],
                "cons": b.get("missingCriteria", [])[:2],
                "fit": b.get("eligibility", ""),
            },
            "recommendedFit": f"{rec.get('name')} is currently the better fit for this profile/query.",
        }

    def _build_why_this_answer(self, query: str, source_docs: List[Document], confidence: float, source_filter: Optional[str]) -> str:
        source_count = len({os.path.basename(doc.metadata.get("source", "")) for doc in source_docs})
        chunk_count = len(source_docs)
        terms = self._extract_query_terms(query)[:4]
        terms_text = ", ".join(terms) if terms else "core query intent"

        company_chunks = 0
        baseline_chunks = 0
        for doc in source_docs:
            source_type = (doc.metadata.get("source_type") or "").strip().lower()
            if source_type == "company":
                company_chunks += 1
            elif source_type == "baseline":
                baseline_chunks += 1

        if source_filter:
            side_by_side_note = ""
            if company_chunks > 0 and baseline_chunks > 0:
                side_by_side_note = (
                    " Side-by-side evaluation used both your company document and its matched ISO baseline document."
                )
            return (
                f"Response grounded on {chunk_count} chunks from {source_count} source(s) within selected file '{source_filter}', "
                f"matching terms like {terms_text}. Confidence is {int(confidence * 100)}%."
                f"{side_by_side_note}"
            )

        if confidence <= 0.45:
            return (
                f"Response grounded on {chunk_count} retrieved chunks from {source_count} source(s), "
                f"matching terms like {terms_text}. Confidence is {int(confidence * 100)}%. "
                "Not enough evidence was found for some requested clauses."
            )

        return (
            f"Response grounded on {chunk_count} retrieved chunks from {source_count} source(s), "
            f"matching terms like {terms_text}. Confidence is {int(confidence * 100)}%."
        )

    def _build_tax_action_plan(self, profile: Optional[Dict], query: str) -> Optional[Dict[str, Any]]:
        profile = profile or {}
        query_l = (query or "").lower()
        tax_regime = (profile.get("taxRegime") or "").strip() or "Not selected"
        employment = (profile.get("employmentStatus") or "").lower()

        is_tax_intent = any(k in query_l for k in [
            "tax", "itr", "deduction", "80c", "80d", "advance tax", "refund", "regime"
        ])
        if not is_tax_intent and not profile:
            return None

        today = datetime.now()
        current_year = today.year
        itr_due = datetime(current_year, 7, 31)
        if today > itr_due:
            itr_due = datetime(current_year + 1, 7, 31)

        reminders = [
            {
                "title": "Review Form 26AS and AIS",
                "dueDate": (today + timedelta(days=7)).date().isoformat(),
                "frequency": "once",
                "category": "compliance",
            },
            {
                "title": "ITR filing deadline",
                "dueDate": itr_due.date().isoformat(),
                "frequency": "yearly",
                "category": "filing",
            },
        ]

        if "self" in employment or "business" in employment:
            reminders.extend([
                {"title": "Advance tax installment (Q1)", "dueDate": f"{today.year}-06-15", "frequency": "yearly", "category": "advance-tax"},
                {"title": "Advance tax installment (Q2)", "dueDate": f"{today.year}-09-15", "frequency": "yearly", "category": "advance-tax"},
                {"title": "Advance tax installment (Q3)", "dueDate": f"{today.year}-12-15", "frequency": "yearly", "category": "advance-tax"},
                {"title": "Advance tax installment (Q4)", "dueDate": f"{today.year + 1}-03-15", "frequency": "yearly", "category": "advance-tax"},
            ])

        steps = [
            "Validate income, TDS, and interest entries from Form 26AS/AIS.",
            f"Confirm regime choice ({tax_regime}) and simulate tax outgo before final filing.",
            "Prioritize eligible deductions/exemptions and keep proof documents organized.",
            "Review filing status 2 weeks before deadline and clear any pending tax.",
        ]

        return {
            "title": "Personalized Tax Action Plan",
            "steps": steps,
            "reminders": reminders,
        }

    def _classify_rag_source(self, source_name: str) -> str:
        """Classify source into company uploads, baseline ISO docs, or other docs."""
        name = (source_name or "").strip().lower()
        if not name:
            return "other"

        if "_company_document" in name:
            return "company"

        if name.endswith(".pdf") and re.search(r"iso[-_ ]?37\d{3}", name):
            return "baseline"

        return "other"

    def _build_rag_metrics(self, source_docs: List[Document]) -> Dict[str, Any]:
        """Build retrieval metrics to explain company-vs-baseline evidence usage."""
        category_source_sets: Dict[str, set] = {
            "company": set(),
            "baseline": set(),
            "other": set(),
        }
        category_chunk_counts: Dict[str, int] = {
            "company": 0,
            "baseline": 0,
            "other": 0,
        }

        for doc in source_docs:
            source_name = os.path.basename(doc.metadata.get("source", "") or "")
            source_type = (doc.metadata.get("source_type") or "").strip().lower()
            if source_type in {"company", "baseline", "other"}:
                category = source_type
            else:
                category = self._classify_rag_source(source_name)
            category_chunk_counts[category] += 1
            if source_name:
                category_source_sets[category].add(source_name)

        insufficient_evidence_clauses = len({
            (doc.metadata.get("clause") or "unknown")
            for doc in source_docs
            if (doc.metadata.get("evidence_strength") or "").lower() == "low"
        })

        baseline_chunks = category_chunk_counts["baseline"]
        company_chunks = category_chunk_counts["company"]
        total_sources = sum(len(items) for items in category_source_sets.values())

        return {
            "totalChunks": len(source_docs),
            "totalSources": total_sources,
            "companyChunks": company_chunks,
            "companySources": len(category_source_sets["company"]),
            "baselineChunks": baseline_chunks,
            "baselineSources": len(category_source_sets["baseline"]),
            "otherChunks": category_chunk_counts["other"],
            "otherSources": len(category_source_sets["other"]),
            "companyToBaselineChunkRatio": round(company_chunks / baseline_chunks, 2) if baseline_chunks > 0 else None,
            "insufficientEvidenceClauses": insufficient_evidence_clauses,
        }

    def _expected_clause_map(self) -> Dict[str, List[str]]:
        return {
            "iso37001": ["4.1", "4.5", "5.1", "5.2", "6.1", "7.2", "7.3", "8.2", "8.3", "8.7", "9.1", "9.2", "10.1", "10.2"],
            "iso37301": ["4.1", "5.1", "6.1", "6.2", "7.5", "8.1", "9.1", "9.2", "10.2"],
            "iso37000": ["5.1", "5.3", "6.1", "6.2", "7.1", "8.1"],
            "iso37002": ["7.1", "8.2", "8.3", "8.4", "9.1", "10.1"],
        }

    def _build_clause_heatmap(self, source_docs: List[Document]) -> List[Dict[str, Any]]:
        framework_buckets: Dict[str, Dict[str, Any]] = {}
        expected = self._expected_clause_map()

        for doc in source_docs:
            metadata = doc.metadata or {}
            framework = (metadata.get("framework") or "other").lower()
            clause = str(metadata.get("clause") or "unknown")
            strength = (metadata.get("evidence_strength") or "low").lower()

            if framework not in framework_buckets:
                framework_buckets[framework] = {
                    "framework": framework,
                    "clauses": {},
                    "strong": 0,
                    "medium": 0,
                    "weak": 0,
                }

            clause_entry = framework_buckets[framework]["clauses"].setdefault(clause, {"count": 0, "strength": strength})
            clause_entry["count"] += 1
            clause_entry["strength"] = strength

            if strength == "high":
                framework_buckets[framework]["strong"] += 1
            elif strength == "medium":
                framework_buckets[framework]["medium"] += 1
            else:
                framework_buckets[framework]["weak"] += 1

        rows: List[Dict[str, Any]] = []
        for framework, bucket in framework_buckets.items():
            expected_clauses = expected.get(framework, [])
            covered_set = {clause for clause in bucket["clauses"].keys() if clause != "unknown"}
            if expected_clauses:
                missing_count = len([c for c in expected_clauses if c not in covered_set])
                coverage_pct = round((len(covered_set) / len(expected_clauses)) * 100, 1)
            else:
                missing_count = 0
                coverage_pct = 0.0

            rows.append({
                "framework": framework,
                "coveragePct": coverage_pct,
                "missingEvidenceCount": missing_count + bucket["weak"],
                "strongEvidenceCount": bucket["strong"],
                "mediumEvidenceCount": bucket["medium"],
                "weakEvidenceCount": bucket["weak"],
                "coveredClauses": sorted(list(covered_set))[:25],
            })

        rows.sort(key=lambda item: item.get("framework", ""))
        return rows

    def _build_ask_back_questions(self, source_docs: List[Document], query: str) -> List[str]:
        metrics = self._build_rag_metrics(source_docs)
        if metrics.get("insufficientEvidenceClauses", 0) == 0 and len(source_docs) >= 6:
            return []

        framework = self._infer_framework_from_query(query) or "selected framework"
        return [
            f"For {framework.upper()}, which legal entity and country scope should I assess?",
            "Do you want strict clause-by-clause scoring (0-5) or an executive summary first?",
            "Should I prioritize high-risk gaps only or include medium/low gaps with quick wins?",
        ]

    def _detect_contradictions(self, source_docs: List[Document], max_items: int = 6) -> List[Dict[str, str]]:
        by_clause: Dict[str, Dict[str, List[str]]] = {}
        for doc in source_docs:
            metadata = doc.metadata or {}
            clause = str(metadata.get("clause") or "unknown")
            source_type = (metadata.get("source_type") or "other").lower()
            text = (doc.page_content or "")[:600]
            by_clause.setdefault(clause, {}).setdefault(source_type, []).append(text)

        contradictions: List[Dict[str, str]] = []
        for clause, bucket in by_clause.items():
            company_text = " ".join(bucket.get("company", []))
            baseline_text = " ".join(bucket.get("baseline", []))
            if not company_text or not baseline_text:
                continue

            baseline_strict = any(k in baseline_text.lower() for k in [" shall ", " must ", " required "])
            company_loose = any(k in company_text.lower() for k in [" may ", " optional ", " not required", " where applicable"])
            semantic_conflict = self._semantic_conflict_signal(baseline_text, company_text)
            if (baseline_strict and company_loose) or semantic_conflict:
                contradictions.append({
                    "clause": clause,
                    "issue": "Company language appears weaker or contradictory to ISO baseline requirement.",
                    "companySnippet": self._clean_snippet(company_text, max_len=180),
                    "baselineSnippet": self._clean_snippet(baseline_text, max_len=180),
                })
            if len(contradictions) >= max_items:
                break
        return contradictions

    def _build_freshness_tracker(self, source_docs: List[Document]) -> List[Dict[str, Any]]:
        rows: Dict[str, Dict[str, Any]] = {}
        now = datetime.now().date()

        for doc in source_docs:
            metadata = doc.metadata or {}
            source = os.path.basename(metadata.get("source", "Unknown"))
            source_type = (metadata.get("source_type") or "other").lower()
            effective_date = (metadata.get("effective_date") or "").strip()

            if source not in rows:
                rows[source] = {
                    "source": source,
                    "sourceType": source_type,
                    "effectiveDate": effective_date or "unknown",
                    "stale": False,
                    "warning": "",
                }

            if effective_date and rows[source]["effectiveDate"] == "unknown":
                rows[source]["effectiveDate"] = effective_date

        for source, row in rows.items():
            date_text = row.get("effectiveDate", "unknown")
            stale = False
            warning = ""
            parsed_date = parse_date_from_query(date_text) if isinstance(date_text, str) else None
            if parsed_date:
                days_old = (now - parsed_date.date()).days
                stale = days_old > 365
                if stale:
                    warning = f"Evidence may be stale ({days_old} days old)."
            row["stale"] = stale
            row["warning"] = warning

        return list(rows.values())

    def _build_compliance_action_plan(self, source_docs: List[Document], max_items: int = 6) -> Dict[str, List[Dict[str, str]]]:
        weak_docs = [doc for doc in source_docs if (doc.metadata.get("evidence_strength") or "").lower() == "low"]
        if not weak_docs:
            return {"d30": [], "d60": [], "d90": []}

        def owner_for(doc: Document) -> str:
            owner = (doc.metadata.get("owner_function") or "compliance").strip().lower()
            return owner.capitalize() if owner else "Compliance"

        actions_30 = []
        actions_60 = []
        actions_90 = []

        for doc in weak_docs[:max_items]:
            clause = str(doc.metadata.get("clause") or "unknown")
            framework = str(doc.metadata.get("framework") or "framework").upper()
            owner = owner_for(doc)

            actions_30.append({
                "action": f"Collect missing evidence pack for {framework} clause {clause}.",
                "owner": owner,
                "impact": "Improves audit evidence completeness quickly.",
            })
            actions_60.append({
                "action": f"Implement control standardization and approval workflow for clause {clause}.",
                "owner": owner,
                "impact": "Reduces inconsistency across business units.",
            })
            actions_90.append({
                "action": f"Run control effectiveness review and remediation closure for clause {clause}.",
                "owner": owner,
                "impact": "Raises maturity and readiness score before audit.",
            })

        return {
            "d30": actions_30,
            "d60": actions_60,
            "d90": actions_90,
        }

    def _build_clause_drilldown(self, source_docs: List[Document], max_clauses: int = 8) -> List[Dict[str, Any]]:
        grouped: Dict[str, Dict[str, List[Dict[str, str]]]] = {}
        for doc in source_docs:
            metadata = doc.metadata or {}
            clause = str(metadata.get("clause") or "unknown")
            source_type = (metadata.get("source_type") or "other").lower()
            source_name = os.path.basename(metadata.get("source", "Unknown"))
            evidence_strength = (metadata.get("evidence_strength") or "unknown").lower()
            snippet = self._clean_snippet(doc.page_content or "")
            grouped.setdefault(clause, {}).setdefault(source_type, []).append({
                "source": source_name,
                "snippet": snippet,
                "evidenceStrength": evidence_strength,
            })

        rows: List[Dict[str, Any]] = []
        for clause, bucket in grouped.items():
            rows.append({
                "clause": clause,
                "company": bucket.get("company", [])[:2],
                "baseline": bucket.get("baseline", [])[:2],
                "other": bucket.get("other", [])[:1],
            })
        rows.sort(key=lambda item: item.get("clause", ""))
        return rows[:max_clauses]

    def _build_followup_prompts(self, source_docs: List[Document]) -> List[str]:
        frameworks = sorted({(doc.metadata.get("framework") or "").lower() for doc in source_docs if doc.metadata.get("framework")})
        fw_text = frameworks[0].upper() if frameworks else "selected framework"
        return [
            "Show top 5 critical gaps",
            f"Explain clause 8.2 with citations for {fw_text}",
            "Give quick wins for next 30 days",
        ]

    def _build_audit_ready_report(self, source_docs: List[Document], rag_metrics: Dict[str, Any]) -> Dict[str, Any]:
        heatmap = self._build_clause_heatmap(source_docs)
        contradictions = self._detect_contradictions(source_docs)
        action_plan = self._build_compliance_action_plan(source_docs)
        citations = []
        for doc in source_docs[:20]:
            metadata = doc.metadata or {}
            citations.append({
                "source": os.path.basename(metadata.get("source", "Unknown")),
                "clause": str(metadata.get("clause") or "unknown"),
                "framework": str(metadata.get("framework") or "unknown"),
                "page": str(metadata.get("page") or ""),
            })
        return {
            "scores": heatmap,
            "gaps": [{"clause": c.get("clause"), "issue": c.get("issue")} for c in contradictions],
            "citations": citations,
            "actions": action_plan,
            "stats": rag_metrics,
        }

    def _build_section_confidence(self, source_docs: List[Document], rag_metrics: Dict[str, Any]) -> Dict[str, float]:
        total = max(len(source_docs), 1)
        strong = sum(1 for doc in source_docs if (doc.metadata.get("evidence_strength") or "").lower() == "high")
        medium = sum(1 for doc in source_docs if (doc.metadata.get("evidence_strength") or "").lower() == "medium")
        weak = sum(1 for doc in source_docs if (doc.metadata.get("evidence_strength") or "").lower() == "low")

        evidence_conf = min(1.0, (strong + 0.6 * medium + 0.25 * weak) / total)
        gap_pressure = min(1.0, rag_metrics.get("insufficientEvidenceClauses", 0) / 8.0)
        comparison_conf = max(0.0, evidence_conf - (0.35 * gap_pressure))
        recommendation_conf = max(0.0, evidence_conf - (0.20 * gap_pressure))

        return {
            "evidence": round(evidence_conf, 3),
            "comparison": round(comparison_conf, 3),
            "recommendation": round(recommendation_conf, 3),
        }

    def _build_rubric_scores(self, source_docs: List[Document]) -> Dict[str, Any]:
        frameworks = sorted({(doc.metadata.get("framework") or "").lower() for doc in source_docs if doc.metadata.get("framework")})
        if not frameworks:
            return {}

        output: Dict[str, Any] = {}
        for framework in frameworks:
            rubric = self._get_framework_rubric(framework)
            clause_weights = rubric.get("weightedClauses", {}) if isinstance(rubric, dict) else {}
            if not clause_weights:
                continue

            covered_weight = 0.0
            total_weight = 0.0
            covered_clause_ids: set = set()
            for clause_key, weight in clause_weights.items():
                try:
                    numeric_weight = float(weight)
                except Exception:
                    numeric_weight = 0.0
                total_weight += numeric_weight

                for doc in source_docs:
                    if (doc.metadata.get("framework") or "").lower() != framework:
                        continue
                    clause_text = str(doc.metadata.get("clause") or "").lower()
                    if clause_key.lower() in clause_text:
                        covered_clause_ids.add(clause_key)
                        break

            for clause_key in covered_clause_ids:
                try:
                    covered_weight += float(clause_weights.get(clause_key, 0))
                except Exception:
                    pass

            coverage = round((covered_weight / total_weight) * 100, 1) if total_weight > 0 else 0.0
            output[framework] = {
                "title": rubric.get("title", framework.upper()),
                "coverageWeightedPct": coverage,
                "coveredClauses": sorted(list(covered_clause_ids)),
                "totalRubricWeight": total_weight,
            }

        return output

    def _build_evidence_trace(self, source_docs: List[Document], limit: int = 15) -> List[Dict[str, Any]]:
        trace: List[Dict[str, Any]] = []
        for doc in source_docs[:limit]:
            meta = doc.metadata or {}
            trace.append({
                "framework": str(meta.get("framework") or "unknown").upper(),
                "clause": str(meta.get("clause") or "unknown"),
                "sourceType": str(meta.get("source_type") or "other"),
                "source": os.path.basename(meta.get("source", "Unknown")),
                "evidenceStrength": str(meta.get("evidence_strength") or "unknown"),
                "snippet": self._clean_snippet(doc.page_content or ""),
            })
        return trace

    def _doc_source_category(self, doc: Document) -> str:
        meta = doc.metadata or {}
        source_type = (meta.get("source_type") or "").strip().lower()
        if source_type in {"company", "baseline", "other"}:
            return source_type
        source_name = os.path.basename(meta.get("source", "") or "")
        return self._classify_rag_source(source_name)

    def _ensure_compliance_evidence_balance(
        self,
        source_docs: List[Document],
        query: str,
        framework_hint: Optional[str] = None,
        minimum_company: int = 2,
        minimum_baseline: int = 2,
    ) -> List[Document]:
        """Augment retrieval so compliance analysis has both company and baseline evidence."""
        if not source_docs or not self.vectorstore:
            return source_docs

        company_count = sum(1 for doc in source_docs if self._doc_source_category(doc) == "company")
        baseline_count = sum(1 for doc in source_docs if self._doc_source_category(doc) == "baseline")
        if company_count >= minimum_company and baseline_count >= minimum_baseline:
            return source_docs

        def doc_key(doc: Document) -> str:
            meta = doc.metadata or {}
            return "|".join([
                str(meta.get("source", "")),
                str(meta.get("chunk_index", "")),
                str(meta.get("page", "")),
            ])

        existing_keys = {doc_key(doc) for doc in source_docs}
        augmented: List[Document] = list(source_docs)

        def framework_matches(doc: Document) -> bool:
            if not framework_hint:
                return True
            meta = doc.metadata or {}
            framework = (meta.get("framework") or "").strip().lower()
            source = (meta.get("source") or "").strip().lower()
            return framework == framework_hint or framework_hint in source

        candidate_k = max(OPTIMIZED_RETRIEVAL_K * 8, 120)
        try:
            candidates = self.vectorstore.similarity_search(query, k=candidate_k)
        except Exception:
            candidates = []

        for required_type, current_count, target_count in [
            ("company", company_count, minimum_company),
            ("baseline", baseline_count, minimum_baseline),
        ]:
            needed = max(0, target_count - current_count)
            if needed <= 0:
                continue

            for candidate in candidates:
                if needed <= 0:
                    break
                if not framework_matches(candidate):
                    continue
                if self._doc_source_category(candidate) != required_type:
                    continue
                key = doc_key(candidate)
                if key in existing_keys:
                    continue
                augmented.append(candidate)
                existing_keys.add(key)
                needed -= 1

        # Last-resort backfill directly from store if semantic retrieval misses one side.
        remaining_company = max(0, minimum_company - sum(1 for doc in augmented if self._doc_source_category(doc) == "company"))
        remaining_baseline = max(0, minimum_baseline - sum(1 for doc in augmented if self._doc_source_category(doc) == "baseline"))

        if remaining_company > 0 or remaining_baseline > 0:
            try:
                raw = self.vectorstore.get(include=["documents", "metadatas"])
                docs = raw.get("documents", []) or []
                metas = raw.get("metadatas", []) or []
                for content, meta in zip(docs, metas):
                    if not meta:
                        continue
                    d = Document(page_content=content, metadata=meta)
                    if not framework_matches(d):
                        continue
                    category = self._doc_source_category(d)
                    if category == "company" and remaining_company > 0:
                        key = doc_key(d)
                        if key not in existing_keys:
                            augmented.append(d)
                            existing_keys.add(key)
                            remaining_company -= 1
                    elif category == "baseline" and remaining_baseline > 0:
                        key = doc_key(d)
                        if key not in existing_keys:
                            augmented.append(d)
                            existing_keys.add(key)
                            remaining_baseline -= 1
                    if remaining_company <= 0 and remaining_baseline <= 0:
                        break
            except Exception as error:
                print(f"âš ï¸ Could not backfill balanced evidence: {error}")

        # Keep mandatory evidence and then fill with best-ranked docs.
        reranked = self._rerank_documents(augmented, query, top_k=max(OPTIMIZED_RETRIEVAL_K * 2, 16), framework_hint=framework_hint)

        mandatory_company = [doc for doc in augmented if self._doc_source_category(doc) == "company"][:minimum_company]
        mandatory_baseline = [doc for doc in augmented if self._doc_source_category(doc) == "baseline"][:minimum_baseline]
        final_docs: List[Document] = []
        final_keys = set()
        for doc in mandatory_company + mandatory_baseline + reranked:
            key = doc_key(doc)
            if key in final_keys:
                continue
            final_docs.append(doc)
            final_keys.add(key)
            if len(final_docs) >= max(OPTIMIZED_RETRIEVAL_K, 12):
                break

        return final_docs

    def _semantic_conflict_signal(self, text_a: str, text_b: str) -> bool:
        if not self.embeddings:
            return False
        try:
            vectors = self.embeddings.embed_documents([text_a[:500], text_b[:500]])
            if len(vectors) != 2:
                return False
            v1, v2 = vectors
            dot = sum(a * b for a, b in zip(v1, v2))
            norm1 = sum(a * a for a in v1) ** 0.5
            norm2 = sum(b * b for b in v2) ** 0.5
            if norm1 == 0 or norm2 == 0:
                return False
            cosine = dot / (norm1 * norm2)

            strict_terms = ["shall", "must", "required", "mandatory"]
            permissive_terms = ["may", "optional", "where applicable", "not required"]
            a_strict = any(term in text_a.lower() for term in strict_terms)
            b_perm = any(term in text_b.lower() for term in permissive_terms)
            b_strict = any(term in text_b.lower() for term in strict_terms)
            a_perm = any(term in text_a.lower() for term in permissive_terms)

            polarity_conflict = (a_strict and b_perm) or (b_strict and a_perm)
            return cosine > 0.72 and polarity_conflict
        except Exception:
            return False

    def _validate_clause_grounding(self, response_text: str, source_docs: List[Document]) -> Dict[str, Any]:
        clause_mentions = re.findall(r"clause\s+(\d+(?:\.\d+)*)", response_text or "", flags=re.IGNORECASE)
        normalized_mentions = sorted(set(clause_mentions))
        if not normalized_mentions:
            return {"isValid": True, "unsupportedClauses": [], "message": "No explicit clause references in narrative."}

        supported = set(str(doc.metadata.get("clause") or "") for doc in source_docs)
        unsupported = [clause for clause in normalized_mentions if clause not in supported]
        return {
            "isValid": len(unsupported) == 0,
            "unsupportedClauses": unsupported,
            "message": "Some clause claims are not directly grounded in retrieved evidence." if unsupported else "All referenced clauses are grounded in retrieved chunks.",
        }

    def _has_minimum_evidence(self, source_docs: List[Document], minimum_company: int = 2, minimum_baseline: int = 2) -> bool:
        company = sum(1 for doc in source_docs if (doc.metadata.get("source_type") or "").lower() == "company")
        baseline = sum(1 for doc in source_docs if (doc.metadata.get("source_type") or "").lower() == "baseline")
        return company >= minimum_company and baseline >= minimum_baseline

    def _build_multi_pass_prompt(self, query: str, context: str, strict_scope: bool) -> str:
        strict_rules = (
            "Use only provided context. If insufficient evidence, state exactly 'Not enough evidence in uploaded documents.'"
            if strict_scope else
            "Prefer context-first reasoning with explicit source-backed claims."
        )
        return (
            "You are an ISO compliance analyst. Perform two-stage reasoning.\n"
            "Stage 1: extract key clause evidence from context in concise bullets.\n"
            "Stage 2: produce final answer with clause-backed findings, gaps, and actions.\n"
            f"Rules: {strict_rules}\n\n"
            f"Context:\n{context}\n\n"
            f"Question:\n{query}\n"
        )

    def _multi_pass_response(self, query: str, context: str, strict_scope: bool) -> str:
        first_pass_prompt = self._build_multi_pass_prompt(query, context, strict_scope)
        first_pass = self._extract_text(self._invoke_llm(first_pass_prompt).content)
        second_pass_prompt = (
            "Refine the analysis below into a concise final response with prioritized gaps and actions. "
            "Do not add claims without evidence from the analysis.\n\n"
            f"Analysis:\n{first_pass}\n"
        )
        second_pass = self._extract_text(self._invoke_llm(second_pass_prompt).content)
        return second_pass or first_pass

    def log_response_feedback(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        try:
            os.makedirs(os.path.dirname(self._feedback_log_path) or ".", exist_ok=True)
            record = {
                "timestamp": datetime.utcnow().isoformat() + "Z",
                **payload,
            }
            with open(self._feedback_log_path, "a", encoding="utf-8") as log_file:
                log_file.write(json.dumps(record, ensure_ascii=True) + "\n")
            return {"status": "success", "message": "Feedback recorded"}
        except Exception as error:
            return {"status": "error", "message": f"Failed to record feedback: {error}"}

    def _is_compliance_source_context(self, source_docs: List[Document]) -> bool:
        """Detect if retrieved evidence is primarily ISO compliance docs."""
        if not source_docs:
            return False

        compliance_hits = 0
        for doc in source_docs:
            metadata = doc.metadata or {}
            source_name = os.path.basename(metadata.get("source", "") or "").lower()
            framework = (metadata.get("framework") or "").strip().lower()
            source_type = (metadata.get("source_type") or "").strip().lower()
            if framework in {"iso37001", "iso37301", "iso37000", "iso37002"} or source_type in {"company", "baseline"} or re.search(r"iso[-_ ]?37\d{3}", source_name):
                compliance_hits += 1

        return compliance_hits > 0

    def _has_finance_intent(self, query: str) -> bool:
        """Return True only when user is explicitly asking finance/tax planning."""
        query_l = (query or "").lower()
        finance_keywords = [
            "tax", "itr", "deduction", "80c", "80d", "refund", "regime",
            "pension", "retire", "retirement", "investment", "ppf", "nps",
            "elss", "income tax", "financial plan", "wealth", "sip",
        ]
        return any(keyword in query_l for keyword in finance_keywords)

    def _build_response_metadata(
        self,
        query: str,
        profile: Optional[Dict],
        source_docs: List[Document],
        source_filter: Optional[str] = None,
    ) -> Dict[str, Any]:
        confidence, confidence_label = self._calculate_confidence(source_docs, query, source_filter)
        rag_metrics = self._build_rag_metrics(source_docs)
        compliance_mode = self._is_compliance_query(query, source_filter) or self._is_compliance_source_context(source_docs)

        ask_back_questions = self._build_ask_back_questions(source_docs, query) if compliance_mode else []
        clause_heatmap = self._build_clause_heatmap(source_docs) if compliance_mode else []
        contradictions = self._detect_contradictions(source_docs) if compliance_mode else []
        freshness_tracker = self._build_freshness_tracker(source_docs) if compliance_mode else []
        action_plan_30_60_90 = self._build_compliance_action_plan(source_docs) if compliance_mode else {"d30": [], "d60": [], "d90": []}
        clause_drilldown = self._build_clause_drilldown(source_docs) if compliance_mode else []
        followup_prompts = self._build_followup_prompts(source_docs) if compliance_mode else []
        audit_ready_report = self._build_audit_ready_report(source_docs, rag_metrics) if compliance_mode else {}
        section_confidence = self._build_section_confidence(source_docs, rag_metrics) if compliance_mode else {}
        rubric_scores = self._build_rubric_scores(source_docs) if compliance_mode else {}
        evidence_trace = self._build_evidence_trace(source_docs) if compliance_mode else []
        clause_validation = {"isValid": True, "unsupportedClauses": [], "message": "Validation pending."}
        missing_details, improvement_suggestions = self._build_missing_improvement_details(
            source_docs=source_docs,
            rag_metrics=rag_metrics,
            clause_heatmap=clause_heatmap,
            contradictions=contradictions,
            action_plan=action_plan_30_60_90,
            ask_back_questions=ask_back_questions,
            query=query,
            compliance_mode=compliance_mode,
        )

        return {
            "confidence": confidence,
            "confidenceLabel": confidence_label,
            "highlights": self._build_source_highlights(source_docs, query),
            "whyThisAnswer": self._build_why_this_answer(query, source_docs, confidence, source_filter),
            "comparison": None,
            "documentInsights": self._extract_document_insights(source_docs),
            "ragMetrics": rag_metrics,
            "clauseHeatmap": clause_heatmap,
            "askBackQuestions": ask_back_questions,
            "contradictions": contradictions,
            "freshnessTracker": freshness_tracker,
            "actionPlan306090": action_plan_30_60_90,
            "clauseDrilldown": clause_drilldown,
            "followupPrompts": followup_prompts,
            "auditReadyReport": audit_ready_report,
            "sectionConfidence": section_confidence,
            "rubricScores": rubric_scores,
            "evidenceTrace": evidence_trace,
            "clauseValidation": clause_validation,
            "strictNoEvidenceMode": compliance_mode,
            "missingDetails": missing_details,
            "improvementSuggestions": improvement_suggestions,
        }

    def _build_missing_improvement_details(
        self,
        source_docs: List[Document],
        rag_metrics: Dict[str, Any],
        clause_heatmap: List[Dict[str, Any]],
        contradictions: List[Dict[str, str]],
        action_plan: Dict[str, List[Dict[str, str]]],
        ask_back_questions: List[str],
        query: str,
        compliance_mode: bool,
    ) -> Tuple[List[str], List[str]]:
        missing_details: List[str] = []
        improvement_suggestions: List[str] = []

        if not source_docs:
            missing_details.append("No relevant document chunks were retrieved for this query.")
            improvement_suggestions.append("Upload or select the exact policy/SOP file for this question.")
            return missing_details, improvement_suggestions

        insufficient_count = int(rag_metrics.get("insufficientEvidenceClauses", 0) or 0)
        if insufficient_count > 0:
            missing_details.append(
                f"Insufficient evidence for {insufficient_count} clause(s) in retrieved content."
            )

        if compliance_mode and clause_heatmap:
            weak_rows = sorted(
                [row for row in clause_heatmap if row.get("missingEvidenceCount", 0) > 0],
                key=lambda row: row.get("missingEvidenceCount", 0),
                reverse=True,
            )
            for row in weak_rows[:3]:
                framework = str(row.get("framework", "framework")).upper()
                missing_count = int(row.get("missingEvidenceCount", 0) or 0)
                coverage = row.get("coveragePct", 0)
                missing_details.append(
                    f"{framework}: {missing_count} missing/weak evidence signals (coverage {coverage}%)."
                )

        if contradictions:
            contradiction_clauses = sorted({str(item.get("clause", "unknown")) for item in contradictions if item.get("clause")})
            if contradiction_clauses:
                clause_list = ", ".join(contradiction_clauses[:4])
                missing_details.append(f"Potential contradiction between company and baseline evidence at clause(s): {clause_list}.")

        d30_actions = (action_plan or {}).get("d30", []) if isinstance(action_plan, dict) else []
        for item in d30_actions[:3]:
            action = (item or {}).get("action")
            if action:
                improvement_suggestions.append(str(action))

        if compliance_mode and not d30_actions:
            framework = (self._infer_framework_from_query(query) or "selected framework").upper()
            improvement_suggestions.append(
                f"Provide mapped evidence for high-priority clauses in {framework} before requesting final scoring."
            )

        for question in (ask_back_questions or [])[:2]:
            if question:
                improvement_suggestions.append(f"Clarify scope: {question}")

        if not improvement_suggestions:
            improvement_suggestions.append("Ask a narrower clause-level question and include target framework and entity scope.")

        # Deduplicate while preserving order.
        missing_details = list(dict.fromkeys(missing_details))[:6]
        improvement_suggestions = list(dict.fromkeys(improvement_suggestions))[:6]
        return missing_details, improvement_suggestions

    def _append_quality_guidance(
        self,
        response_text: str,
        missing_details: List[str],
        improvement_suggestions: List[str],
    ) -> str:
        text = (response_text or "").strip()
        if not text:
            return text

        lower_text = text.lower()
        if "what is missing" in lower_text and "how to improve" in lower_text:
            return text

        if not missing_details and not improvement_suggestions:
            return text

        lines = [text, "", "### What Is Missing"]
        if missing_details:
            lines.extend([f"- {item}" for item in missing_details[:4]])
        else:
            lines.append("- No major evidence gaps detected in current retrieval.")

        lines.append("")
        lines.append("### How To Improve")
        if improvement_suggestions:
            lines.extend([f"- {item}" for item in improvement_suggestions[:4]])
        else:
            lines.append("- Provide more specific evidence or narrower scope for higher confidence.")

        return "\n".join(lines)
    
    def _handle_gold_price_query(self, query: str) -> Optional[Dict]:
        """
        Handle gold price queries with direct CSV lookup.
        Returns formatted response if this is a gold query, None otherwise.
        """
        # Parse date from the query
        parsed_date = parse_date_from_query(query)
        if not parsed_date:
            return None
        
        # Check if query mentions gold
        query_lower = query.lower()
        gold_keywords = ['gold', 'sona', 'sonay', 'gold price', 'gold rate', 'gold ki', 'gold ka']
        is_gold_query = any(kw in query_lower for kw in gold_keywords)
        
        if not is_gold_query:
            return None
        
        # Get gold price lookup
        gold_lookup = get_gold_lookup()
        
        # Format the requested date for display
        requested_date_str = parsed_date.strftime("%d/%m/%Y")
        requested_date_readable = parsed_date.strftime("%d %B %Y")
        
        # Try to get exact price
        price_data = gold_lookup.get_price(parsed_date)
        
        if price_data:
            response = f"""Namaste! I am FinGuide, your AI financial advisor.

Here is the gold price data for **{requested_date_readable}**:

| Metric | Value |
|--------|-------|
| **Date** | {price_data['date']} |
| **Price** | ${price_data['price']:.2f} |
| **Open** | ${price_data['open']:.2f} |
| **High** | ${price_data['high']:.2f} |
| **Low** | ${price_data['low']:.2f} |
| **Volume** | {price_data['volume']} |

*Note: Prices are in USD per troy ounce.*

If you have any questions about investing in gold (like Sovereign Gold Bonds, Gold ETFs, or physical gold) or their tax implications, feel free to ask!"""
            return {
                "response": response,
                "sources": ["gold_data.csv"],
                "confidence": 0.95,
                "confidenceLabel": "high",
                "highlights": [{"source": "gold_data.csv", "snippet": f"Gold price for {requested_date_str} is {price_data['price']} (USD/oz)."}],
                "cached": False,
            }

        # Try to get nearest price if exact not found
        nearest_data, explanation = gold_lookup.get_nearest_price(parsed_date)
        
        if nearest_data:
            response = f"""Namaste! I am FinGuide, your AI financial advisor.

I don't have gold price data for **{requested_date_readable}** (this may be a holiday or weekend when markets were closed).

{explanation}: **{nearest_data['date']}**

| Metric | Value |
|--------|-------|
| **Date** | {nearest_data['date']} |
| **Price** | ${nearest_data['price']:.2f} |
| **Open** | ${nearest_data['open']:.2f} |
| **High** | ${nearest_data['high']:.2f} |
| **Low** | ${nearest_data['low']:.2f} |
| **Volume** | {nearest_data['volume']} |

*Note: Prices are in USD per troy ounce.*

If you need information about gold investment options available in India, such as Sovereign Gold Bonds (SGB), Gold ETFs, or Digital Gold, I'd be happy to help!"""
            return {
                "response": response,
                "sources": ["gold_data.csv"],
                "confidence": 0.82,
                "confidenceLabel": "high",
                "highlights": [{"source": "gold_data.csv", "snippet": f"Nearest available gold price date is {nearest_data['date']} with price {nearest_data['price']} (USD/oz)."}],
                "cached": False,
            }

        # No data available at all
        date_range = gold_lookup.get_date_range()
        range_info = ""
        if date_range[0] and date_range[1]:
            range_info = f" The available data ranges from {date_range[0]} to {date_range[1]}."
        
        response = f"""Namaste! I am FinGuide, your AI financial advisor.

I don't have gold price data for **{requested_date_readable}**.{range_info}

If you have questions about current gold investment options in India or tax implications of gold investments, I would be happy to assist!"""
        return {
            "response": response,
            "sources": ["gold_data.csv"],
            "confidence": 0.45,
            "confidenceLabel": "low",
            "highlights": [{"source": "gold_data.csv", "snippet": "Requested date not available in the current dataset."}],
            "cached": False,
        }
        
    def get_response(
        self,
        query: str,
        profile: Optional[Dict] = None,
        history: Optional[List[Dict]] = None,
        source_filter: Optional[str] = None,
        source_filters: Optional[List[str]] = None,
    ) -> Dict:
        """Get AI response for a user query with caching"""
        if not self._initialized:
            raise RuntimeError("Bot not initialized. Call initialize() first.")
        
        compliance_query = self._infer_framework_from_query(query) is not None

        # Check cache first (skip for gold or compliance queries requiring fresh evidence)
        if not source_filter and not is_gold_price_query(query) and not compliance_query:
            cached_response = self._response_cache.get(query, profile)
            if cached_response:
                print("âš¡ Cache hit - returning cached response")
                cached_response["cached"] = True
                return cached_response
        
        # Check if this is a gold price query with a specific date
        gold_response = self._handle_gold_price_query(query)
        if gold_response:
            gold_response["response"] = self._append_sources_section(
                gold_response["response"], gold_response.get("sources", [])
            )
            return gold_response
        
        # Format user profile for context
        user_profile_text = format_user_profile(profile) if profile else ""
        chat_history_text = format_chat_history(history)
        
        # Check document count
        try:
            doc_count = self.vectorstore._collection.count()
        except:
            doc_count = 0
        
        strict_scope = bool(source_filter or (source_filters and len(source_filters) > 0))

        # If no documents indexed, use direct LLM response unless strict doc scope is requested
        if self.rag_chain is None or doc_count == 0:
            if strict_scope:
                no_doc_message = "I could not answer from the selected uploaded documents because no indexed document content is currently available in that scope."
                metadata = self._build_response_metadata(query, profile, [], source_filter)
                return {
                    "response": no_doc_message,
                    "sources": source_filters or ([source_filter] if source_filter else ["Selected Uploaded Documents"]),
                    **metadata,
                    "cached": False,
                }

            prompt = self._build_prompt(user_profile_text, chat_history_text, "No specific documents available.", query, strict_grounding=False)
            response = self._invoke_llm(prompt)
            sources = ["General Knowledge - No documents indexed yet"]
            metadata = self._build_response_metadata(query, profile, [], source_filter)
            response_text = self._append_sources_section(
                self._extract_text(response.content),
                sources
            )
            return {
                "response": response_text,
                "sources": sources,
                **metadata,
                "cached": False,
            }
        
        inferred_framework = self._infer_framework_from_query(query)

        # Get source documents for citation
        if not strict_scope:
            source_docs = self._get_framework_source_docs(query, inferred_framework) if inferred_framework else []
            if not source_docs:
                source_docs = self._get_source_docs(query, source_filter=source_filter, source_filters=source_filters)
        else:
            source_docs = self._get_source_docs(query, source_filter=source_filter, source_filters=source_filters)

        if not strict_scope and self._is_compliance_query(query, source_filter):
            source_docs = self._ensure_compliance_evidence_balance(source_docs, query, inferred_framework)

        if strict_scope and not source_docs:
            scope_label = source_filter or "selected uploaded documents"
            response_text = (
                f"I could not find relevant content in **{scope_label}** for this question. "
                "Please try a more specific query or upload additional evidence in the same scope."
            )
            metadata = self._build_response_metadata(query, profile, [], source_filter)
            return {
                "response": response_text,
                "sources": source_filters or ([source_filter] if source_filter else ["Selected Uploaded Documents"]),
                **metadata,
                "cached": False,
            }

        compliance_context = self._is_compliance_query(query, source_filter) or self._is_compliance_source_context(source_docs)
        if compliance_context and not self._has_minimum_evidence(source_docs):
            metadata = self._build_response_metadata(query, profile, source_docs, source_filter)
            metadata["clauseValidation"] = {
                "isValid": False,
                "unsupportedClauses": [],
                "message": "Not enough balanced company/baseline evidence to produce a reliable compliance answer.",
            }
            return {
                "response": "Not enough evidence in uploaded documents. Please upload both company and baseline ISO material for the same framework before requesting clause-level conclusions.",
                "sources": [os.path.basename((doc.metadata or {}).get("source", "Unknown")) for doc in source_docs[:6]],
                **metadata,
                "cached": False,
            }
        
        # Create a custom prompt with profile
        context = "\n\n".join([doc.page_content for doc in source_docs])
        prompt = self._build_prompt(user_profile_text, chat_history_text, context, query, strict_grounding=strict_scope)
        
        # PARALLEL: Submit single-pass LLM invocation only for non-compliance queries.
        # Compliance queries run a dedicated multi-pass flow.
        future_llm = None
        if not compliance_context:
            future_llm = _executor.submit(self._invoke_llm, prompt)
        
        # Extract sources while LLM is running
        sources = []
        for doc in source_docs:
            source = doc.metadata.get("source", "Unknown")
            page = doc.metadata.get("page", "")
            source_str = f"{os.path.basename(source)}"
            if page:
                source_str += f" (Page {page + 1})"
            if source_str not in sources:
                sources.append(source_str)
        
        final_sources = sources if sources else ["Knowledge Base"]
        # Build metadata in parallel with LLM
        metadata = self._build_response_metadata(query, profile, source_docs, source_filter)
        
        # Wait for LLM result
        try:
            if compliance_context:
                result = self._multi_pass_response(query, context, strict_scope)
            else:
                response = future_llm.result() if future_llm else self._invoke_llm(prompt)
                result = self._extract_text(response.content)
        except Exception as e:
            print(f"âš ï¸ LLM invocation failed, returning grounded fallback: {e}")
            result = "I am facing a temporary model issue. I am sharing grounded details from the retrieved documents instead."

        clause_validation = self._validate_clause_grounding(result, source_docs) if compliance_context else {"isValid": True, "unsupportedClauses": [], "message": "Not a compliance query."}
        metadata["clauseValidation"] = clause_validation
        result = self._append_quality_guidance(
            result,
            metadata.get("missingDetails", []),
            metadata.get("improvementSuggestions", []),
        )
        
        response_data = {
            "response": self._append_sources_section(result, final_sources),
            "sources": final_sources,
            **metadata,
            "cached": False,
        }
        
        # Cache final narrative only for non-compliance/general queries.
        if not source_filter and not compliance_context:
            self._response_cache.set(query, response_data, profile)
        
        return response_data

    def stream_response(
        self,
        query: str,
        profile: Optional[Dict] = None,
        history: Optional[List[Dict]] = None,
        source_filter: Optional[str] = None,
        source_filters: Optional[List[str]] = None,
    ) -> Tuple[Iterable[str], List[str], Dict[str, Any]]:
        """Stream AI response tokens for a user query."""
        if not self._initialized:
            raise RuntimeError("Bot not initialized. Call initialize() first.")

        gold_response = self._handle_gold_price_query(query)
        if gold_response:
            def gold_stream():
                yield gold_response["response"]
            return gold_stream(), gold_response.get("sources", [""]), {
                "confidence": gold_response.get("confidence", 0.7),
                "confidenceLabel": gold_response.get("confidenceLabel", "medium"),
                "whyThisAnswer": "Response is based on direct lookup from gold_data.csv date-indexed records.",
                "highlights": gold_response.get("highlights", []),
                "comparison": None,
                "documentInsights": [],
                "ragMetrics": self._build_rag_metrics([]),
                "cached": False,
            }

        user_profile_text = format_user_profile(profile) if profile else ""
        chat_history_text = format_chat_history(history)

        try:
            doc_count = self.vectorstore._collection.count()
        except:
            doc_count = 0

        strict_scope = bool(source_filter or (source_filters and len(source_filters) > 0))

        if self.rag_chain is None or doc_count == 0:
            if strict_scope:
                metadata = self._build_response_metadata(query, profile, [], source_filter)
                metadata["cached"] = False

                def no_doc_stream_strict():
                    yield "I could not answer from the selected uploaded documents because no indexed document content is currently available in that scope."

                return no_doc_stream_strict(), source_filters or ([source_filter] if source_filter else ["Selected Uploaded Documents"]), metadata

            prompt = self._build_prompt(user_profile_text, chat_history_text, "No specific documents available.", query, strict_grounding=False)
            sources = ["General Knowledge - No documents indexed yet"]
            metadata = self._build_response_metadata(query, profile, [], source_filter)
            metadata["cached"] = False

            def no_doc_stream():
                for chunk in self._stream_llm(prompt):
                    text = self._extract_text(chunk.content)
                    if text:
                        yield text

            return no_doc_stream(), sources, metadata

        inferred_framework = self._infer_framework_from_query(query)

        if not strict_scope:
            source_docs = self._get_framework_source_docs(query, inferred_framework) if inferred_framework else []
            if not source_docs:
                source_docs = self._get_source_docs(query, source_filter=source_filter, source_filters=source_filters)
        else:
            source_docs = self._get_source_docs(query, source_filter=source_filter, source_filters=source_filters)

        if not strict_scope and self._is_compliance_query(query, source_filter):
            source_docs = self._ensure_compliance_evidence_balance(source_docs, query, inferred_framework)

        if strict_scope and not source_docs:
            metadata = self._build_response_metadata(query, profile, [], source_filter)
            metadata["cached"] = False

            def no_match_stream():
                scope_label = source_filter or "selected uploaded documents"
                yield (
                    f"I could not find relevant content in **{scope_label}** for this question. "
                    "Please try a more specific query or upload additional evidence in the same scope."
                )

            return no_match_stream(), source_filters or ([source_filter] if source_filter else ["Selected Uploaded Documents"]), metadata

        compliance_context = self._is_compliance_query(query, source_filter) or self._is_compliance_source_context(source_docs)
        if compliance_context and not self._has_minimum_evidence(source_docs):
            metadata = self._build_response_metadata(query, profile, source_docs, source_filter)
            metadata["clauseValidation"] = {
                "isValid": False,
                "unsupportedClauses": [],
                "message": "Not enough balanced company/baseline evidence to produce a reliable compliance answer.",
            }
            metadata["cached"] = False

            def threshold_stream():
                yield "Not enough evidence in uploaded documents. Please upload both company and baseline ISO material for the same framework before requesting clause-level conclusions."

            threshold_sources = [os.path.basename((doc.metadata or {}).get("source", "Unknown")) for doc in source_docs[:6]]
            return threshold_stream(), threshold_sources, metadata

        # PARALLEL: Submit metadata computation to thread pool while building prompt
        future_meta = _executor.submit(
            self._build_response_metadata, query, profile, source_docs, source_filter
        )

        context = "\n\n".join([doc.page_content for doc in source_docs])
        prompt = self._build_prompt(user_profile_text, chat_history_text, context, query, strict_grounding=strict_scope)

        sources = []
        for doc in source_docs:
            source = doc.metadata.get("source", "Unknown")
            page = doc.metadata.get("page", "")
            source_str = f"{os.path.basename(source)}"
            if page:
                source_str += f" (Page {page + 1})"
            if source_str not in sources:
                sources.append(source_str)

        final_sources = sources if sources else ["Knowledge Base"]
        metadata = future_meta.result()
        metadata["cached"] = False

        def doc_stream():
            if compliance_context:
                response_text = self._multi_pass_response(query, context, strict_scope)
                metadata["clauseValidation"] = self._validate_clause_grounding(response_text, source_docs)
                response_text = self._append_quality_guidance(
                    response_text,
                    metadata.get("missingDetails", []),
                    metadata.get("improvementSuggestions", []),
                )
                yield response_text
                return

            for chunk in self._stream_llm(prompt):
                text = self._extract_text(chunk.content)
                if text:
                    yield text

        return doc_stream(), final_sources, metadata
    
    def get_status(self) -> Dict:
        """Get bot status and statistics"""
        doc_count = 0
        if self.vectorstore:
            try:
                doc_count = self.vectorstore._collection.count()
            except:
                doc_count = 0
        
        # Determine which AI model is being used
        model_name = None
        if self.llm_provider_order:
            model_name = self.llm_provider_order[0]
        elif self.llm:
            if isinstance(self.llm, ChatOpenAI):
                model_name = "OpenRouter (gpt-4o-mini)"
            elif isinstance(self.llm, ChatGoogleGenerativeAI):
                model_name = "Google Gemini (gemini-1.5-flash)"
            elif isinstance(self.llm, ChatOllama):
                 model_name = "Ollama (gemma3:1b)"
        
        return {
            "initialized": self._initialized,
            "documents_indexed": doc_count,
            "model": model_name,
            "providers": self.llm_provider_order
        }


# Singleton instance
_bot_instance: Optional[ArthMitraBot] = None


def get_bot() -> ArthMitraBot:
    """Get or create bot singleton"""
    global _bot_instance
    if _bot_instance is None:
        _bot_instance = ArthMitraBot()
    return _bot_instance


def initialize_bot(api_key: Optional[str] = None) -> ArthMitraBot:
    """Initialize and return the bot"""
    bot = get_bot()
    if not bot._initialized:
        bot.initialize()
    return bot

