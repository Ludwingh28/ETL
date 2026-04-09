#!/usr/bin/env python
"""
Direct test of dashboard views without HTTP layer
"""
import django
import os
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'cruzimex.settings')
django.setup()

from django.contrib.auth.models import User
from rest_framework.authtoken.models import Token
from django.test import RequestFactory
from django.http import JsonResponse
import json
from datetime import datetime
from api import views

# Get or create test user
user, _ = User.objects.get_or_create(username='apitest', defaults={'is_staff': True})
token, _ = Token.objects.get_or_create(user=user)

# Create request factory
factory = RequestFactory()

print("=" * 60)
print("DIRECT VIEW FUNCTION TESTS")
print("=" * 60)
print()

# Test each endpoint function directly, calling _run_dw_query
# to see if the problem is in the view or the query layer

test_cases = [
    ('periodos', 'GET /api/dashboard/nacional/periodos/'),
    ('kpis', 'GET /api/dashboard/nacional/kpis/?anho=2026&mes=3'),
    ('tendencia', 'GET /api/dashboard/nacional/tendencia/?anho=2026&mes=3'),
    ('por_regional', 'GET /api/dashboard/nacional/por-regional/?anho=2026&mes=3'),
    ('por_canal', 'GET /api/dashboard/nacional/por-canal/?anho=2026&mes=3'),
    ('por_categoria', 'GET /api/dashboard/nacional/por-categoria/?anho=2026&mes=3'),
]

for endpoint_name, url_desc in test_cases:
    print(f"Testing: {url_desc}")
    try:
        # Get the view function
        if endpoint_name == 'periodos':
            view_func = views.dashboard_nacional_periodos
            req = factory.get('/api/dashboard/nacional/periodos/')
        elif endpoint_name == 'kpis':
            view_func = views.dashboard_nacional_kpis
            req = factory.get('/api/dashboard/nacional/kpis/?anho=2026&mes=3')
        elif endpoint_name == 'tendencia':
            view_func = views.dashboard_nacional_tendencia
            req = factory.get('/api/dashboard/nacional/tendencia/?anho=2026&mes=3')
        elif endpoint_name == 'por_regional':
            view_func = views.dashboard_nacional_por_regional
            req = factory.get('/api/dashboard/nacional/por-regional/?anho=2026&mes=3')
        elif endpoint_name == 'por_canal':
            view_func = views.dashboard_nacional_por_canal
            req = factory.get('/api/dashboard/nacional/por-canal/?anho=2026&mes=3')
        else:  # por_categoria
            view_func = views.dashboard_nacional_por_categoria
            req = factory.get('/api/dashboard/nacional/por-categoria/?anho=2026&mes=3')
        
        # Set up request
        req.user = user
        req.auth = token
        
        # Call the view directly by invoking the underlying function
        # Try calling the decorated function
        result = view_func(req)
        
        # Parse response
        if isinstance(result, JsonResponse):
            data = json.loads(result.content.decode())
            if data.get('success'):
                if isinstance(data.get('data'), list):
                    print(f"  SUCCESS - {len(data['data'])} items returned")
                else:
                    print(f"  SUCCESS - Data returned (type: {type(data['data']).__name__})")
            else:
                print(f"  ERROR - {data.get('error')}")
        else:
            # DRF Response object
            print(f"  RESPONSE TYPE: {type(result).__name__}")
            print(f"  Status: {result.status_code if hasattr(result, 'status_code') else 'N/A'}")
            
    except Exception as e:
        import traceback
        print(f"  EXCEPTION: {type(e).__name__}: {e}")
        # Print first few lines of traceback
        tb_lines = traceback.format_exc().split('\n')[:-1][:5]
        for line in tb_lines:
            if line.strip():
                print(f"    {line[:80]}")
    
    print()

print("=" * 60)
print("Note: These are direct function calls, not HTTP requests")
print("=" * 60)
