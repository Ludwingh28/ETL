#!/usr/bin/env python
import psycopg2
import os
from dotenv import load_dotenv

load_dotenv('.env')

DB_HOST = os.getenv('DB_HOST', 'localhost')
DB_PORT = os.getenv('DB_PORT', '5432')
DB_NAME = os.getenv('DB_NAME', 'dw_cruzimex')
DB_USER = os.getenv('DB_USER', 'postgres')  
DB_PASSWORD = os.getenv('DB_PASSWORD', '')

print("=== Database Connection Test ===")
print(f"Host: {DB_HOST}")
print(f"Port: {DB_PORT}")
print(f"Database: {DB_NAME}")
print(f"User: {DB_USER}")
print()

try:
    conn = psycopg2.connect(
        host=DB_HOST,
        port=DB_PORT,
        database=DB_NAME,
        user=DB_USER,
        password=DB_PASSWORD,
        connect_timeout=5
    )
    print("✓ Connection successful!")
    
    cur = conn.cursor()
    cur.execute("SELECT version();")
    version = cur.fetchone()
    print(f"✓ PostgreSQL: {version[0][:50]}...")
    
    cur.execute("""
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema = 'dw' LIMIT 5
    """)
    tables = cur.fetchall()
    print(f"✓ Found {len(tables)} tables in dw schema")
    
    cur.close()
    conn.close()
except Exception as e:
    print(f"✗ Connection failed: {type(e).__name__}: {e}")
    print("\nPossible causes:")
    print("  - Remote server is not reachable or down")
    print("  - Database credentials are incorrect")
    print("  - Network/firewall is blocking the connection")
    print("  - PostgreSQL is not running on the remote server")
