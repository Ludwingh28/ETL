#!/usr/bin/env python
import django
import os
import json
from datetime import datetime

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'cruzimex.settings')
django.setup()

from django.test import Client

# Create a test client
client = Client()

# First, try to get a token by logging in
print("=== Testing API Endpoints ===\n")

# Test login first
print("1. Testing login endpoint...")
response = client.post('/api/auth/login/', 
    data=json.dumps({'username': 'admin', 'password': 'admin'}),
    content_type='application/json'
)
print(f"   Status: {response.status_code}")
print(f"   Response: {response.json()}")

if response.status_code == 200:
    token = response.json().get('token')
    print(f"\n2. Testing dashboard endpoints with token...")
    headers = {'HTTP_AUTHORIZATION': f'Token {token}'}
    
    endpoints = [
        '/api/dashboard/nacional/periodos/',
        '/api/dashboard/nacional/kpis/',
        '/api/dashboard/nacional/tendencia/',
        '/api/dashboard/nacional/por-regional/',
        '/api/dashboard/nacional/por-canal/',
        '/api/dashboard/nacional/por-categoria/',
    ]
    
    for endpoint in endpoints:
        print(f"\n   Testing {endpoint}")
        response = client.get(endpoint + '?anho=2026&mes=3', **headers)
        print(f"   Status: {response.status_code}")
        if response.status_code != 200:
            print(f"   Error: {response.json()}")
        else:
            data = response.json()
            if isinstance(data, dict) and 'data' in data:
                print(f"   ✓ Success - {len(data['data'])} items")
            else:
                print(f"   ✓ Success")
