from pathlib import Path
from dotenv import load_dotenv
import os

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = os.getenv('SECRET_KEY')
if not SECRET_KEY:
    if os.getenv('DEBUG', 'True') == 'True':
        SECRET_KEY = 'django-insecure-dev-only-key-never-use-in-production'
    else:
        raise RuntimeError('SECRET_KEY no está configurado en variables de entorno.')

DEBUG = os.getenv('DEBUG', 'True') == 'True'

ALLOWED_HOSTS = os.getenv('ALLOWED_HOSTS', 'localhost,127.0.0.1,testserver').split(',')

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',
    'rest_framework.authtoken',
    'corsheaders',
    'api',
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.middleware.gzip.GZipMiddleware',          # compresión de respuestas
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
    'api.middleware.SecurityHeadersMiddleware',        # headers de seguridad
]

ROOT_URLCONF = 'cruzimex.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'cruzimex.wsgi.application'

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': BASE_DIR / 'django_system.db',
        'CONN_MAX_AGE': 60,
    },
    'dw': {
        'ENGINE':       'django.db.backends.postgresql',
        'NAME':         os.getenv('DB_NAME', 'dw_cruzimex'),
        'USER':         os.getenv('DB_USER', 'postgres'),
        'PASSWORD':     os.getenv('DB_PASSWORD', ''),
        'HOST':         os.getenv('DB_HOST', 'localhost'),
        'PORT':         os.getenv('DB_PORT', '5432'),
        'CONN_MAX_AGE': 120,   # reutilizar conexiones hasta 2 min
        'OPTIONS': {
            'client_encoding': 'UTF8',
            'options': '-c search_path=dw,public,staging',
        },
    }
}

DATABASE_ROUTERS = ['cruzimex.db_routers.DWRouter']

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
     'OPTIONS': {'min_length': 8}},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

LANGUAGE_CODE = 'es'
TIME_ZONE = 'America/La_Paz'
USE_I18N = True
USE_TZ = True

STATIC_URL = 'static/'
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# ─── Autenticación / tokens ───────────────────────────────────────────────────
TOKEN_EXPIRY_HOURS = 4
LOGIN_MAX_ATTEMPTS = 5        # intentos antes de bloqueo
LOGIN_LOCKOUT_SECONDS = 900   # 15 minutos de bloqueo

# ─── Cache (memoria local — sin Redis en dev) ─────────────────────────────────
CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
        'LOCATION': 'cruzimex-cache',
        'TIMEOUT': 300,   # 5 minutos por defecto
    }
}

# ─── DRF ──────────────────────────────────────────────────────────────────────
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'api.authentication.ExpiringTokenAuthentication',
        'rest_framework.authentication.SessionAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
    'DEFAULT_THROTTLE_CLASSES': [
        'rest_framework.throttling.AnonRateThrottle',
        'rest_framework.throttling.UserRateThrottle',
    ],
    'DEFAULT_THROTTLE_RATES': {
        'anon': '20/hour',
        'user': '2000/day',
    },
    'DEFAULT_RENDERER_CLASSES': [
        'rest_framework.renderers.JSONRenderer',   # solo JSON, sin BrowsableAPI en prod
    ],
}

# ─── CORS ─────────────────────────────────────────────────────────────────────
_extra_origins = [o.strip() for o in os.getenv('CORS_EXTRA_ORIGINS', '').split(',') if o.strip()]
CORS_ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
] + _extra_origins
CORS_ALLOW_CREDENTIALS = True
CORS_ALLOW_HEADERS = [
    'accept', 'accept-encoding', 'authorization',
    'content-type', 'dnt', 'origin', 'user-agent',
    'x-csrftoken', 'x-requested-with',
]

# ─── Seguridad HTTP ───────────────────────────────────────────────────────────
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_BROWSER_XSS_FILTER   = True
X_FRAME_OPTIONS              = 'DENY'
