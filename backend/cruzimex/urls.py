from django.contrib import admin
from django.urls import path, include
import os

# URL del admin configurable por variable de entorno — no exponer en /admin/ predecible
_ADMIN_PATH = os.getenv('DJANGO_ADMIN_PATH', 'cruzimex-admin-cx7k/')

urlpatterns = [
    path(_ADMIN_PATH, admin.site.urls),
    path('api/', include('api.urls')),
]
