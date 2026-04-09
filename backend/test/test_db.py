#!/usr/bin/env python
import django
import os

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'cruzimex.settings')
django.setup()

from django.db import connections

try:
    with connections['dw'].cursor() as cursor:
        cursor.execute("""
            SELECT table_name FROM information_schema.tables 
            WHERE table_schema = 'dw' 
            ORDER BY table_name
        """)
        tables = cursor.fetchall()
        if tables:
            print(f'Found {len(tables)} tables in dw schema:')
            for t in tables:
                print(f'  - {t[0]}')
        else:
            print('No tables found in dw schema')
except Exception as e:
    print(f'Error: {type(e).__name__}: {e}')
