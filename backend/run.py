#!/usr/bin/env python
"""
Arth-Mitra Backend Startup Script
"""
import sys
import os

# Force unbuffered output so we can see logs immediately
sys.stdout = open(sys.stdout.fileno(), mode='w', buffering=1)
sys.stderr = open(sys.stderr.fileno(), mode='w', buffering=1)

print("🚀 Starting Arth-Mitra Backend...")
print(f"📍 Working directory: {os.getcwd()}")
print(f"🐍 Python version: {sys.version}")

try:
    from dotenv import load_dotenv
    load_dotenv()
    print("✅ Loaded .env file")
except Exception as e:
    print(f"⚠️ Error loading .env: {e}")

try:
    import uvicorn
    print("✅ Imported uvicorn")
    
    print("\n⚡ Starting FastAPI server on http://0.0.0.0:8000")
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=False,
        log_level="info"
    )
except Exception as e:
    print(f"❌ Error starting server: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
