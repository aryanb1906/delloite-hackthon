#!/usr/bin/env python
"""
FinGuide Backend Startup Script
"""
import sys
import os
import socket

# Force unbuffered output so we can see logs immediately
sys.stdout = open(sys.stdout.fileno(), mode='w', buffering=1)
sys.stderr = open(sys.stderr.fileno(), mode='w', buffering=1)

print("ðŸš€ Starting FinGuide Backend...")
print(f"ðŸ“ Working directory: {os.getcwd()}")
print(f"ðŸ Python version: {sys.version}")


def _is_port_in_use(host: str, port: int) -> bool:
    """Check whether a TCP port is already bound on the host."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.5)
        return sock.connect_ex((host, port)) == 0

try:
    from dotenv import load_dotenv
    load_dotenv()
    print("âœ… Loaded .env file")
except Exception as e:
    print(f"âš ï¸ Error loading .env: {e}")

try:
    import uvicorn
    print("âœ… Imported uvicorn")

    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8000"))

    if _is_port_in_use("127.0.0.1", port):
        print(f"âš ï¸ Port {port} is already in use. Another backend instance is likely running.")
        print(f"âž¡ï¸ Reuse existing server at http://127.0.0.1:{port} (docs: /docs)")
        sys.exit(0)
    
    print(f"\nâš¡ Starting FastAPI server on http://{host}:{port}")
    uvicorn.run(
        "main:app",
        host=host,
        port=port,
        reload=False,
        log_level="info"
    )
except Exception as e:
    print(f"âŒ Error starting server: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

