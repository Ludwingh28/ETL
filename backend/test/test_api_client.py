#!/usr/bin/env python
import django
import os
import json

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'cruzimex.settings')
django.setup()

from django.contrib.auth.models import User
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

# Create a test user if needed
user, _ = User.objects.get_or_create(username='testuser', defaults={'is_staff': True})
token, _ = Token.objects.get_or_create(user=user)

# Create an API client and set the authorization
client = APIClient()
client.credentials(HTTP_AUTHORIZATION='Token ' + token.key)

print("=== Testing API Endpoints ===\n")

endpoints = [
    ('/api/dashboard/nacional/periodos/', 'periodos'),
    ('/api/dashboard/nacional/kpis/?anho=2026&mes=3', 'kpis'),
    ('/api/dashboard/nacional/tendencia/?anho=2026&mes=3', 'tendencia'),
    ('/api/dashboard/nacional/por-regional/?anho=2026&mes=3', 'por_regional'),
    ('/api/dashboard/nacional/por-canal/?anho=2026&mes=3', 'por_canal'),
    ('/api/dashboard/nacional/por-categoria/?anho=2026&mes=3', 'por_categoria'),
]

for endpoint, name in endpoints:
    print(f"Testing {name}...")
    try:
        response = client.get(endpoint)
        
        if response.status_code == 200:
            data = response.json()
            if data.get('success'):
                print(f"  ✓ Success")
                if isinstance(data.get('data'), list):
                    print(f"    Found {len(data['data'])} items")
                else:
                    print(f"    Response type: {type(data.get('data')).__name__}")
            else:
                print(f"  ✗ Error: {data.get('error')}")
        else:
            print(f"  ✗ Status {response.status_code}: {response.json()}")
    except Exception as e:
        import traceback
        print(f"  ✗ Exception: {type(e).__name__}: {e}")
        traceback.print_exc()
    print()
