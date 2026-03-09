# Arth-Mitra

Arth-Mitra is an AI-powered ISO compliance copilot that compares company policy documents against original ISO standards and produces clause-level findings, evidence traceability, and remediation actions.

## Problem This Solves

Compliance teams spend significant time manually mapping company documents to ISO requirements. This project reduces that effort by providing:
- side-by-side company vs ISO comparison,
- gap-focused findings with citations,
- structured action plans for remediation.

## Use Case Description

### Background
Forensic and Financial Crime teams often run compliance assessments manually using scattered policies, spreadsheets, and document checklists. This makes ISO readiness reviews slow and difficult to scale.

### Core Problem
Organizations need quick, reliable answers to questions like:
- "How compliant are we with ISO 37001 anti-bribery requirements?"
- "Which clauses are weak or missing evidence?"
- "What should be fixed first?"

Today, this is usually done with manual clause mapping and subjective scoring, which leads to delays and inconsistent outcomes.

### What This System Does
Arth-Mitra converts ISO standards into an interactive AI workflow that can:
- ingest company policy/framework documents,
- compare them against ISO baseline text,
- generate clause-level readiness scoring,
- identify gaps with evidence-backed citations,
- propose prioritized remediation actions.

### Business Outcome
This turns manual checklist reviews into a scalable, self-service compliance assessment flow. Teams get faster decision support, better traceability, and clearer remediation planning.

## Scope

Current frameworks supported:
- ISO 37001 (Anti-bribery Management)
- ISO 37301 (Compliance Management)
- ISO 37000 (Governance of Organizations)
- ISO 37002 (Whistleblowing Management)

## Architecture Diagram

```mermaid
flowchart LR
	U[User in Chat UI] --> F[Next.js Frontend]
	F -->|POST /api/upload/framework| B[FastAPI Backend]
	F -->|POST /api/chat or /api/chat/stream| B
	B --> P[Parsing and Normalization]
	P --> V[(Chroma Vector Store)]
	B --> R[Retrieval and Reranking]
	R --> V
	R --> LLM[LLM Provider Fallback\nOpenRouter -> OpenAI -> Gemini]
	LLM --> M[Compliance Metadata Builders]
	M --> F

	D[(backend/documents_new)] -->|Baseline ISO docs| P
	C[(backend/uploads_new)] -->|Company framework uploads| P
```

## Processing Workflow

```mermaid
sequenceDiagram
	participant User
	participant UI as Frontend UI
	participant API as FastAPI
	participant RAG as Retrieval Layer
	participant DB as ChromaDB
	participant LLM

	User->>UI: Ask compliance question
	UI->>API: /api/chat/stream
	API->>RAG: Detect framework and query intent
	RAG->>DB: Retrieve company and baseline chunks
	DB-->>RAG: Candidate evidence
	RAG-->>API: Balanced, reranked evidence
	API->>LLM: Build grounded prompt with context
	LLM-->>API: Answer + reasoning text
	API-->>UI: Tokens + sources + metadata blocks
	UI-->>User: Final answer, gaps, drilldown, metrics
```

## Key Features

- 4 framework upload slots (one company file per framework)
- Baseline ISO documents preloaded from backend knowledge base
- Clause-level gap analysis with grounded sources
- Evidence trace panel with strength labels
- Clause drill-down (company snippet vs baseline snippet)
- Contradiction detection and freshness tracking
- 30/60/90 remediation plan
- Strict insufficient-evidence behavior (no hallucinated claims)
- Streaming responses and metadata-rich frontend rendering

## Evaluation Metrics (Latest Run)

Snapshot date: `2026-03-09`

Run command:

```bash
cd backend
python tools/rag_eval.py --queries tools/golden_compliance_eval_set.json --out tools/rag_eval_report_latest.json
```

Metrics summary (golden set):

| Metric | Value |
|---|---:|
| Queries | 25 |
| Documents indexed | 940 |
| Avg total latency | 20,482.28 ms |
| Median total latency | 19,975.75 ms |
| P95 total latency | 31,134.21 ms |
| Avg retrieval latency | 74.12 ms |
| P95 retrieval latency | 242.73 ms |
| Avg retrieved docs/query | 10.00 |
| Avg cited sources/answer | 8.56 |
| Coverage rate (real doc-backed answers) | 100.0% |
| Default source rate | 0.0% |
| Unique sources cited | 104 |
| Precision@k | 0.052 |
| Clause recall | 0.320 |
| Citation accuracy | 0.780 |
| Gap detection accuracy | 1.000 |

### Easy Stats (For Non-Technical Users)

This is the same data in plain words:

| Easy Metric | Current Value | What It Means |
|---|---:|---|
| Average answer time | 20.48 seconds | A normal response takes about 20 to 21 seconds end-to-end. |
| Typical answer time | 19.98 seconds | Most responses are around 20 seconds. |
| Slow-case answer time (P95) | 31.13 seconds | 95% of answers finish within about 31 seconds. |
| Retrieval speed (average) | 0.07 seconds | Finding relevant chunks in the vector DB is very fast. |
| Retrieval speed (P95) | 0.24 seconds | Even in slow retrieval cases, evidence lookup stays below 1 second. |
| Real document grounding | 100% | Every evaluated answer used real indexed documents. |
| Default/no-document answers | 0% | The system did not fall back to generic no-doc responses in this run. |
| Evidence breadth | 8.56 sources/answer | Each answer uses around 8 to 9 cited sources. |
| Citation quality | 78% | Most citations matched expected benchmark sources. |
| Gap finding reliability | 100% | When a test expected a gap signal, the model detected it. |
| Clause coverage quality | 32% recall | Clause-level coverage is improving but still a key optimization area. |

Quick read:
- Strong: grounding, retrieval speed, gap detection.
- Improving: clause recall and citation precision.

### Quick Visual Summary

```mermaid
flowchart LR
	A[25 Golden Queries] --> B[Retriever]
	B --> C[Avg 74.12 ms]
	B --> D[P95 242.73 ms]
	C --> E[LLM + Reasoning]
	D --> E
	E --> F[End-to-end Avg 20,482.28 ms]
	E --> G[End-to-end P95 31,134.21 ms]
	F --> H[Coverage 100%]
	G --> I[Citation Accuracy 78%]
	H --> J[Gap Detection 100%]
	I --> J
```

```mermaid
pie showData
	title Source Grounding Quality
	"Real document-backed responses" : 100
	"Default/no-doc responses" : 0
```

Detailed report JSON: `backend/tools/rag_eval_report_latest.json`

## How Data Is Organized

- `backend/documents_new/`: baseline ISO documents (knowledge base)
- `backend/uploads_new/<framework>/`: uploaded company docs per framework slot
- `backend/chroma_db_new/`: local vector index generated at runtime

Important UI note:
- The `ISO Framework Uploads` panel lists company uploads only.
- Baseline ISO files are loaded from knowledge base and are not listed in that upload panel.

## Repository Structure

- `frontend/`: Next.js app and chat UX
- `backend/main.py`: API endpoints and response schemas
- `backend/bot.py`: RAG retrieval, balancing, metadata generation, compliance logic
- `backend/tools/`: evaluation scripts and reports

## Local Setup

### Backend

```bash
cd backend
pip install -r requirements.txt
python run.py
```

Backend URL: `http://127.0.0.1:8000`

### Frontend

```bash
cd frontend
pnpm install
pnpm run mvp
```

Frontend URL: `http://localhost:3100`

### Frontend Environment

Create `frontend/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## API Endpoints

- `POST /api/upload/framework`: upload company document into one framework slot
- `POST /api/chat/stream`: streaming response with token/source/meta events
- `POST /api/chat`: non-stream response
- `GET /api/status`: backend health and index status
- `DELETE /api/documents/{id}`: remove uploaded document

## Behavior Guarantees

- Compliance answers are context-grounded.
- Retrieval enforces balanced company + baseline evidence for broad ISO queries.
- If evidence is insufficient, the system explicitly says so instead of guessing.

## Contributors Notes

- Keep product name exactly `Arth-Mitra`.
- Do not commit runtime indexes/uploads or proprietary documents.
- Prioritize explainability: citations, clause grounding, and actionable remediation.

## License

MIT (or repository license file).