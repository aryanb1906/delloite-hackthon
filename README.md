# Arth-Mitra

Arth-Mitra is an AI-powered ISO compliance copilot for comparing company policy documents against original ISO standards and generating clause-level gap analysis, evidence traceability, and remediation actions.

## What This Project Is (Current Scope)

This repository is currently focused on compliance workflows, especially:
- ISO 37001 (Anti-bribery management)
- ISO 37301 (Compliance management)
- ISO 37000 (Governance)
- ISO 37002 (Whistleblowing)

The app supports side-by-side company vs baseline ISO analysis using RAG, with structured output for audit and remediation.

## Who It Is For

- Compliance and ethics teams
- Internal audit and risk teams
- Governance and policy owners
- Consultants conducting ISO readiness assessments

## Core Capabilities

- 4 framework upload slots (one company file per ISO framework)
- Baseline ISO documents indexed from backend knowledge base
- Document-grounded chat with source citations
- Clause-level evidence extraction and gap detection
- RAG retrieval metrics (company vs baseline chunk mix)
- Clause drill-down (company snippet vs baseline snippet)
- Evidence trace panel with strength labels
- Contradiction detection and freshness tracking
- 30/60/90 remediation action plan
- Strict "Not enough evidence" behavior when grounding is insufficient
- Session/chat persistence and profile-aware responses

## How It Works

1. Baseline ISO documents are loaded from `backend/documents_new/`.
2. Company files are uploaded per framework using the chat UI (stored under `backend/uploads_new/<framework>/`).
3. Backend parses, normalizes, chunks, and indexes docs in ChromaDB.
4. Query routing identifies framework context and retrieves balanced company + baseline evidence.
5. LLM generates compliance narrative + metadata blocks used by the frontend.
6. Frontend renders answer, metrics, traceability, and remediation views.

## Important UX Note

In the chat UI:
- `ISO Framework Uploads` panel shows company uploads only.
- Baseline ISO originals are preloaded from backend knowledge base and are not shown in those 4 upload slots.

## Tech Stack

Frontend:
- Next.js
- React
- TypeScript
- Tailwind CSS

Backend:
- FastAPI
- LangChain
- ChromaDB
- OpenRouter/OpenAI/Gemini provider fallback

## Project Structure

- `frontend/` - Next.js UI and chat experience
- `backend/main.py` - FastAPI endpoints
- `backend/bot.py` - RAG, retrieval, compliance metadata logic
- `backend/documents_new/` - baseline knowledge documents (local)
- `backend/uploads_new/` - uploaded company documents (local runtime)
- `backend/chroma_db_new/` - vector index (local runtime)

## Local Setup

### 1. Backend

```bash
cd backend
pip install -r requirements.txt
python run.py
```

Backend runs on `http://127.0.0.1:8000`.

### 2. Frontend

```bash
cd frontend
pnpm install
pnpm run mvp
```

Frontend runs on `http://localhost:3100`.

### 3. Environment

Frontend `.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

Backend `.env` should include your model provider keys (OpenRouter/OpenAI/Gemini as configured).

## API Highlights

- `POST /api/upload/framework` - upload one company document into framework slot
- `POST /api/chat/stream` - streaming chat response with metadata events
- `POST /api/chat` - non-stream response
- `GET /api/status` - backend status
- `DELETE /api/documents/{id}` - remove uploaded document

## Current Behavioral Guarantees

- Compliance queries prefer ISO-grounded evidence.
- Broad ISO queries enforce company+baseline balancing before conclusions.
- If evidence is insufficient, response explicitly says so instead of guessing.

## Notes for Contributors

- Keep product name as `Arth-Mitra`.
- Do not commit runtime indexes/uploads or proprietary documents.
- Prefer metadata-rich changes that preserve citation traceability.

## License

MIT (or project license in this repository).