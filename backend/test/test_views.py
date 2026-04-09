#!/usr/bin/env python
import django
import os
import sys
import json
from datetime import datetime

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'cruzimex.settings')
django.setup()

# Manually test the view functions
from api.views import (
    dashboard_nacional_periodos, 
    dashboard_nacional_kpis,
    dashboard_nacional_tendencia,
    dashboard_nacional_por_regional,
    dashboard_nacional_por_canal,
    dashboard_nacional_por_categoria,
)
from django.contrib.auth.models import User
from rest_framework.authtoken.models import Token
from django.test import RequestFactory
from unittest.mock import Mock

# Create a test user if needed
user, _ = User.objects.get_or_create(username='testuser', defaults={'is_staff': True})
token, _ = Token.objects.get_or_create(user=user)

# Create a mock request
factory = RequestFactory()
request = factory.get('/api/dashboard/nacional/periodos/')
request.user = user
request.auth = token
# Add the token to the request headers properly
request.META['HTTP_AUTHORIZATION'] = f'Token {token.key}'

print("=== Testing Views Directly ===\n")

views_to_test = [
    ('periodos', dashboard_nacional_periodos),
    ('kpis', dashboard_nacional_kpis),
    ('tendencia', dashboard_nacional_tendencia),
    ('por_regional', dashboard_nacional_por_regional),
    ('por_canal', dashboard_nacional_por_canal),
    ('por_categoria', dashboard_nacional_por_categoria),
]

for name, view_func in views_to_test:
    print(f"Testing {name}...")
    try:
        response = view_func(request)
        response.render()  # Render the response
        data = json.loads(response.content.decode())
        print(f"  Response: {json.dumps(data, indent=2, default=str)[:500]}")
        
        if isinstance(data, dict) and data.get('success'):
            print(f"  ✓ Success")
            if isinstance(data.get('data'), list):
                print(f"    Found {len(data['data'])} items")
        else:
            print(f"  ✗ Failed: {data}")
    except Exception as e:
        import traceback
        print(f"  ✗ Exception: {type(e).__name__}: {e}")
        traceback.print_exc()
    print()
