# Guía de Despliegue — Sistema BI Cruzimex
## Windows Server 2025 + Nginx (junto a Sistema de Bajas existente)

**URL final:** `http://190.186.42.4/sistemabi/`
**Arquitectura:** React (Nginx) → Django (Waitress, 127.0.0.1:8000) → PostgreSQL (127.0.0.1:5432)

---

## Índice

1. [Estructura de carpetas](#1-estructura-de-carpetas)
2. [Instalar Python](#2-instalar-python)
3. [Configurar el backend Django](#3-configurar-el-backend-django)
4. [Instalar Waitress (servidor WSGI para Windows)](#4-instalar-waitress)
5. [Variables de entorno (.env)](#5-variables-de-entorno)
6. [Construir el frontend React](#6-construir-el-frontend-react)
7. [Actualizar Nginx](#7-actualizar-nginx)
8. [Crear servicio Windows con NSSM](#8-crear-servicio-windows-con-nssm)
9. [Verificación final](#9-verificación-final)
10. [Comandos de mantenimiento](#10-comandos-de-mantenimiento)

---

## 1. Estructura de carpetas

Crear esta estructura en el servidor (puedes cambiar la raíz, pero sé consistente):

```
C:\inetpub\cruzimex\
├── SistemaDeBajas\          ← sistema existente, NO tocar
│   ├── backend\
│   └── frontend\dist\
└── SistemaBI\               ← carpeta nueva para este sistema
    ├── backend\             ← código Django (este repo /backend)
    └── frontend\dist\       ← build de React (se genera en el paso 6)
```

Copiar el proyecto al servidor (por Git, ZIP, o SCP):

```cmd
cd C:\inetpub\cruzimex\SistemaBI
git clone <tu-repo> .
:: O copiar manualmente las carpetas backend/ y frontend/
```

---

## 2. Instalar Python

### 2.1 Descargar e instalar

1. Ir a https://www.python.org/downloads/windows/
2. Descargar **Python 3.12.x** (Windows installer 64-bit)
3. Ejecutar el instalador con estas opciones:
   - ✅ **Add Python to PATH** (importante)
   - ✅ **Install for all users**
   - Destino sugerido: `C:\Python312\`

### 2.2 Verificar instalación

Abrir **CMD como Administrador**:

```cmd
python --version
:: Debe mostrar: Python 3.12.x

pip --version
:: Debe mostrar: pip 24.x from C:\Python312\...
```

---

## 3. Configurar el backend Django

### 3.1 Crear entorno virtual

```cmd
cd C:\inetpub\cruzimex\SistemaBI\backend

python -m venv venv

:: Activar el entorno (necesario antes de cualquier comando python/pip)
venv\Scripts\activate.bat
```

El prompt cambia a `(venv) C:\...>`

### 3.2 Instalar dependencias

```cmd
pip install -r requirements.txt
pip install waitress        :: servidor WSGI para Windows
```

Si no existe `requirements.txt`, instalarlo manualmente:

```cmd
pip install django djangorestframework django-cors-headers psycopg2-binary python-dotenv djangorestframework-authtoken waitress
```

### 3.3 Verificar que Django funciona

```cmd
python manage.py check
:: Debe mostrar: System check identified no issues (0 silenced).
```

---

## 4. Instalar Waitress

Waitress es el servidor WSGI recomendado para Windows (Gunicorn no funciona en Windows).

```cmd
pip install waitress
```

**Prueba manual** (para verificar que funciona antes de crear el servicio):

```cmd
cd C:\inetpub\cruzimex\SistemaBI\backend
venv\Scripts\activate.bat
waitress-serve --port=8000 --threads=4 cruzimex.wsgi:application
```

Abrir en el navegador del servidor: `http://127.0.0.1:8000/api/auth/me/`
Debe responder JSON (aunque sea un 401, confirma que Django está corriendo).

`Ctrl+C` para detener.

---

## 5. Variables de entorno

Crear el archivo `C:\inetpub\cruzimex\SistemaBI\backend\.env`:

```ini
# ── Seguridad ────────────────────────────────────────────────────────────────
SECRET_KEY=cambia-esto-por-una-clave-larga-y-aleatoria-minimo-50-chars
DEBUG=False

# ── Hosts permitidos ─────────────────────────────────────────────────────────
ALLOWED_HOSTS=190.186.42.4,localhost,127.0.0.1

# ── Base de datos PostgreSQL ─────────────────────────────────────────────────
DB_NAME=dw_cruzimex
DB_USER=postgres
DB_PASSWORD=tu_password_de_postgres
DB_HOST=127.0.0.1
DB_PORT=5432

# ── CORS (frontend en producción) ────────────────────────────────────────────
CORS_EXTRA_ORIGINS=http://190.186.42.4

# ── Token expiry ─────────────────────────────────────────────────────────────
TOKEN_EXPIRY_HOURS=4
LOGIN_MAX_ATTEMPTS=5
LOGIN_LOCKOUT_SECONDS=900
```

### Generar SECRET_KEY segura

```cmd
python -c "import secrets; print(secrets.token_urlsafe(50))"
```

Copiar el resultado y pegarlo en el `.env` como valor de `SECRET_KEY`.

---

## 6. Construir el frontend React

Esto se hace en tu **máquina de desarrollo** (donde tienes Node.js instalado), no en el servidor.

### 6.1 Instalar dependencias (si no lo hiciste)

```cmd
cd frontend
npm install
```

### 6.2 Build de producción

```cmd
npm run build
```

Esto genera la carpeta `frontend/dist/` con el build optimizado.
El build ya incluye la ruta base `/sistemabi/` y apunta la API a `/sistemabi/api`.

### 6.3 Copiar dist al servidor

Copiar toda la carpeta `frontend/dist/` a:

```
C:\inetpub\cruzimex\SistemaBI\frontend\dist\
```

Verificar que exista el archivo:
```
C:\inetpub\cruzimex\SistemaBI\frontend\dist\index.html
```

---

## 7. Actualizar Nginx

Abrir `C:\nginx\conf\nginx.conf` y agregar dentro del bloque `server { ... }`, **junto a las ubicaciones existentes**:

```nginx
# ====================================================
# SISTEMA BI - Backend Django (puerto 8000, interno)
# ====================================================
location /sistemabi/api/ {
    proxy_pass         http://127.0.0.1:8000/api/;
    proxy_http_version 1.1;

    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    proxy_connect_timeout 60s;
    proxy_send_timeout    60s;
    proxy_read_timeout    120s;

    proxy_cache_bypass $http_upgrade;
}

# ====================================================
# SISTEMA BI - Frontend React (archivos estáticos)
# ====================================================
location /sistemabi/ {
    alias C:/inetpub/cruzimex/SistemaBI/frontend/dist/;
    index index.html;

    # React Router: todas las rutas van al index.html
    try_files $uri $uri/ /sistemabi/index.html;

    # Cache agresivo para assets compilados (tienen hash en el nombre)
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

> ⚠️ **IMPORTANTE:** Agregar el bloque `/sistemabi/api/` **ANTES** del bloque `/sistemabi/` en el archivo.
> Nginx evalúa las reglas en orden y el bloque más específico debe ir primero.

### Archivo nginx.conf completo con ambos sistemas

El `server { }` quedaría así (resumido):

```nginx
server {
    listen       80;
    server_name  190.186.42.4;

    access_log  logs/cruzimex-access.log;
    error_log   logs/cruzimex-error.log;

    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    client_max_body_size 200M;

    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript
               application/x-javascript application/xml+rss application/json;

    # ── Sistema de Bajas (Node.js, puerto 3001) ──────────────────────────
    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade       $http_upgrade;
        proxy_set_header Connection    'upgrade';
        proxy_set_header Host          $host;
        proxy_set_header X-Real-IP     $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 900s;
        proxy_send_timeout    900s;
        proxy_read_timeout    900s;
        proxy_cache_bypass $http_upgrade;
    }

    location /uploads/ {
        alias C:/inetpub/cruzimex/SistemaDeBajas/backend/uploads/;
        add_header X-Content-Type-Options "nosniff" always;
        autoindex off;
    }

    location /sistemadebajas/ {
        alias C:/inetpub/cruzimex/SistemaDeBajas/frontend/dist/;
        index index.html;
        try_files $uri $uri/ /sistemadebajas/index.html;
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }

    # ── Sistema BI (Django, puerto 8000) ─────────────────────────────────
    location /sistemabi/api/ {
        proxy_pass         http://127.0.0.1:8000/api/;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 60s;
        proxy_send_timeout    60s;
        proxy_read_timeout    120s;
        proxy_cache_bypass $http_upgrade;
    }

    location /sistemabi/ {
        alias C:/inetpub/cruzimex/SistemaBI/frontend/dist/;
        index index.html;
        try_files $uri $uri/ /sistemabi/index.html;
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }

    location / {
        root  C:/inetpub/www;
        index index.html index.htm;
    }
}
```

### Verificar y recargar Nginx

```cmd
:: Verificar sintaxis (no debe haber errores)
nginx -t

:: Si dice "test is successful", recargar
nginx -s reload
```

---

## 8. Registrar el proceso con PM2

Ya tenés PM2 corriendo para el Sistema de Bajas, así que solo hay que agregar el proceso de Django.

### 8.1 Crear el archivo de configuración PM2

Crear el archivo `C:\inetpub\cruzimex\SistemaBI\ecosystem.config.js`:

```js
module.exports = {
  apps: [
    {
      name: 'cruzimex-bi',
      script: 'C:/inetpub/cruzimex/SistemaBI/backend/venv/Scripts/waitress-serve.exe',
      args: '--port=8000 --threads=4 cruzimex.wsgi:application',
      cwd: 'C:/inetpub/cruzimex/SistemaBI/backend',
      interpreter: 'none',           // no es Node, ejecutar directo
      autorestart: true,
      watch: false,
      max_restarts: 10,
      env: {
        PYTHONPATH: 'C:/inetpub/cruzimex/SistemaBI/backend',
      },
    },
  ],
}
```

### 8.2 Iniciar con PM2

```cmd
cd C:\inetpub\cruzimex\SistemaBI
pm2 start ecosystem.config.js

:: Verificar que está corriendo
pm2 list
:: Debe aparecer "cruzimex-bi" con status "online"
```

### 8.3 Guardar para que arranque con Windows

```cmd
:: Guardar la lista actual de procesos (incluye los del Sistema de Bajas)
pm2 save
```

> Si ya tenías `pm2 save` configurado con el startup de Windows, este comando actualiza la lista y el proceso nuevo queda incluido automáticamente.

### 8.4 Verificar respuesta

```cmd
curl http://127.0.0.1:8000/api/auth/me/
:: Debe responder JSON con error 401 — confirma que Django está activo
```

---

## 9. Verificación final

### Checklist completo

```cmd
:: 1. Django responde internamente
curl http://127.0.0.1:8000/api/auth/me/

:: 2. Nginx proxy funciona
curl http://190.186.42.4/sistemabi/api/auth/me/

:: 3. Frontend accesible
:: Abrir en navegador: http://190.186.42.4/sistemabi/

:: 4. Sistema de Bajas sigue funcionando (NO debe haberse afectado)
:: Abrir: http://190.186.42.4/sistemadebajas/
:: Abrir: http://190.186.42.4/sistemadebajas/admin/

:: 5. Login del BI funciona
:: Ir a http://190.186.42.4/sistemabi/ e iniciar sesión
```

### Diagnóstico de errores comunes

| Síntoma | Causa probable | Solución |
|---------|----------------|----------|
| `502 Bad Gateway` en `/sistemabi/api/` | Django no está corriendo | `nssm start CruzimexBI` |
| Frontend carga pero API falla | `.env` con valores incorrectos | Revisar `DB_PASSWORD`, `DB_HOST` |
| Pantalla en blanco en `/sistemabi/` | `dist/` no copiado o ruta nginx incorrecta | Verificar que existe `dist/index.html` |
| `nginx: [emerg]` al hacer `nginx -t` | Error de sintaxis en nginx.conf | Revisar que los bloques `{}` estén cerrados |
| Sistema de Bajas dejó de funcionar | Conflicto en nginx.conf | Verificar que `/api/` apunta a puerto 3001 y `/sistemabi/api/` a 8000 |
| Login redirige a `/login` infinitamente | `basename` incorrecto | Verificar que el build fue con `npm run build` (no `npm run dev`) |

---

## 10. Comandos de mantenimiento

### Django

```cmd
:: Ver logs del servicio
nssm status CruzimexBI

:: Reiniciar Django (tras cambios en el backend)
nssm restart CruzimexBI

:: Detener / Iniciar
nssm stop CruzimexBI
nssm start CruzimexBI

:: Migraciones de base de datos (si hay cambios en models.py)
cd C:\inetpub\cruzimex\SistemaBI\backend
venv\Scripts\activate.bat
python manage.py migrate
```

### Frontend (actualizar build)

```cmd
:: En tu máquina de desarrollo:
cd frontend
npm run build

:: Copiar dist/ al servidor, reemplazando los archivos anteriores
:: NO es necesario reiniciar Nginx ni Django para actualizar el frontend
```

### Nginx

```cmd
:: Verificar configuración
nginx -t

:: Recargar sin cortar conexiones activas
nginx -s reload

:: Ver logs en tiempo real (PowerShell)
Get-Content C:\nginx\logs\cruzimex-error.log -Wait -Tail 50
```

### Crear usuario administrador inicial

```cmd
cd C:\inetpub\cruzimex\SistemaBI\backend
venv\Scripts\activate.bat
python manage.py createsuperuser
```

---

## Notas sobre seguridad en producción

1. **SECRET_KEY:** Debe ser única, larga (50+ chars) y nunca compartida. Generarla con `secrets.token_urlsafe(50)`.
2. **DEBUG=False:** Obligatorio. Con `True` Django expone código fuente en errores.
3. **PostgreSQL:** Asegurarse de que el puerto 5432 no esté expuesto a la red pública (solo `127.0.0.1`).
4. **Django Admin:** Accesible en `http://127.0.0.1:8000/admin/` pero NO expuesto por Nginx (solo acceso local al servidor).
5. **Logs de Nginx:** Revisar periódicamente `C:\nginx\logs\cruzimex-error.log` para detectar intentos de acceso no autorizado.
