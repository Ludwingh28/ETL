from django.http import JsonResponse, StreamingHttpResponse
from django.db import connections
from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from django.core.cache import cache
from django.conf import settings as django_settings
from rest_framework.decorators import api_view, permission_classes, authentication_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.authentication import TokenAuthentication  # noqa: F401 (kept for compatibility)
from rest_framework.authtoken.models import Token
from .authentication import ExpiringTokenAuthentication
from rest_framework import status
from datetime import date, datetime
import decimal
import re as _re
import io
import openpyxl
from openpyxl.styles import Font
from functools import wraps

from .models import UserProfile




# ─────────────────────────────────────────
#  HELPERS – VALIDACION INPUT / SEGURIDAD
# ─────────────────────────────────────────

def _safe_int(val, default):
    """Convierte val a int de forma segura; retorna default si no es parseable."""
    try:
        return int(val)
    except (TypeError, ValueError):
        return int(default)


_SAFE_STR_RE = _re.compile(r"[^\w\s\-\.&]", flags=_re.UNICODE)

def _safe_str(val, max_len=100):
    """Limpia y trunca un string de entrada; elimina caracteres no esperados."""
    if val is None:
        return ''
    return _SAFE_STR_RE.sub('', str(val).strip())[:max_len]


# ─────────────────────────────────────────
#  HELPERS – BRUTE FORCE LOGIN
# ─────────────────────────────────────────

_MAX_ATTEMPTS    = getattr(django_settings, 'LOGIN_MAX_ATTEMPTS',    5)
_LOCKOUT_SECONDS = getattr(django_settings, 'LOGIN_LOCKOUT_SECONDS', 900)


def _login_key(username, ip):
    return 'login_fail:' + str(username)[:50] + ':' + str(ip)[:45]


def _is_locked_out(username, ip):
    return cache.get(_login_key(username, ip), 0) >= _MAX_ATTEMPTS


def _record_failed_login(username, ip):
    key = _login_key(username, ip)
    attempts = cache.get(key, 0) + 1
    cache.set(key, attempts, _LOCKOUT_SECONDS)


def _clear_failed_logins(username, ip):
    cache.delete(_login_key(username, ip))


# ─────────────────────────────────────────
#  HELPER – PERMISOS DE DASHBOARD
# ─────────────────────────────────────────

_ADMIN_CARGOS = frozenset(['Administrador de Sistema', 'Subadministrador de Sistemas'])

# Permisos de dashboard por defecto según cargo (espejo del frontend adminConstants)
_PERMISOS_POR_CARGO: dict[str, list[str]] = {
    'Gerente General':    ['nacional', 'regionales', 'canales', 'supervisores', 'preventas-realizadas',
                           'avances-ventas', 'unidades-vendidas', 'unidades-supervisores',
                           'informacion-rutas', 'tendencia-estacional', 'ticket-promedio',
                           'margen-bruto', 'matriz', 'descargas',
                           'pepsico', 'softys', 'dmujer', 'apego', 'colher'],
    'Gerente de Ventas':  ['nacional', 'regionales', 'canales', 'supervisores', 'unidades-vendidas',
                           'unidades-supervisores', 'informacion-rutas', 'tendencia-estacional',
                           'ticket-promedio', 'margen-bruto'],
    'Gerente Regional':   ['regionales', 'canales', 'supervisores', 'preventas-realizadas',
                           'avances-ventas', 'unidades-vendidas', 'unidades-supervisores',
                           'informacion-rutas', 'tendencia-estacional'],
    'Supervisor':         ['canales', 'supervisores', 'preventas-realizadas', 'avances-ventas',
                           'unidades-supervisores', 'informacion-rutas'],
    'Vendedor':           ['preventas-realizadas', 'avances-ventas'],
    'Proveedor':          ['lista-precios', 'pepsico', 'softys', 'dmujer', 'apego', 'colher'],
    'Analista de Datos':  ['nacional', 'regionales', 'canales', 'supervisores', 'preventas-realizadas',
                           'avances-ventas', 'unidades-vendidas', 'unidades-supervisores',
                           'informacion-rutas', 'tendencia-estacional', 'ticket-promedio',
                           'margen-bruto', 'matriz', 'descargas'],
}


def _has_dashboard_perm(user, perm_id):
    """True si el usuario tiene acceso al dashboard perm_id."""
    if user.is_staff or user.is_superuser:
        return True
    try:
        if user.profile.cargo in _ADMIN_CARGOS:
            return True
        return perm_id in (user.profile.dashboard_permissions or [])
    except Exception:
        return False


def _require_perm(perm_id):
    """Decorator que verifica permiso de dashboard antes de ejecutar la vista."""
    def decorator(func):
        @wraps(func)
        def wrapper(request, *args, **kwargs):
            if not _has_dashboard_perm(request.user, perm_id):
                return JsonResponse(
                    {'success': False, 'error': 'Sin acceso a este dashboard'},
                    status=403
                )
            return func(request, *args, **kwargs)
        return wrapper
    return decorator


def _require_any_perm(*perm_ids):
    """Decorator que acepta cualquiera de los permisos listados."""
    def decorator(func):
        @wraps(func)
        def wrapper(request, *args, **kwargs):
            if not any(_has_dashboard_perm(request.user, p) for p in perm_ids):
                return JsonResponse(
                    {'success': False, 'error': 'Sin acceso a este dashboard'},
                    status=403
                )
            return func(request, *args, **kwargs)
        return wrapper
    return decorator


# ─────────────────────────────────────────
#  AUTH
# ─────────────────────────────────────────

@api_view(['POST'])
@permission_classes([AllowAny])
def login(request):
    username = request.data.get('username', '').strip()[:150]
    password = request.data.get('password', '')
    ip = (
        request.META.get('HTTP_X_FORWARDED_FOR', '').split(',')[0].strip()
        or request.META.get('REMOTE_ADDR', 'unknown')
    )

    if not username or not password:
        return JsonResponse(
            {'success': False, 'error': 'Usuario y contraseña requeridos'},
            status=status.HTTP_400_BAD_REQUEST
        )

    if _is_locked_out(username, ip):
        return JsonResponse(
            {'success': False, 'error': 'Cuenta bloqueada temporalmente. Intentá en 15 minutos.'},
            status=status.HTTP_429_TOO_MANY_REQUESTS
        )

    user = authenticate(username=username, password=password)
    if not user:
        _record_failed_login(username, ip)
        return JsonResponse(
            {'success': False, 'error': 'Credenciales inválidas'},
            status=status.HTTP_401_UNAUTHORIZED
        )

    _clear_failed_logins(username, ip)
    Token.objects.filter(user=user).delete()
    token = Token.objects.create(user=user)
    groups = list(user.groups.values_list('name', flat=True))

    return JsonResponse({
        'success': True,
        'token': token.key,
        'user': {
            'id': user.id,
            'username': user.username,
            'full_name': user.get_full_name(),
            'email': user.email,
            'groups': groups,
            'is_staff': user.is_staff,
        }
    })


@api_view(['POST'])
@authentication_classes([ExpiringTokenAuthentication])
@permission_classes([IsAuthenticated])
def logout(request):
    try:
        request.user.auth_token.delete()
        return JsonResponse({'success': True, 'message': 'Sesión cerrada'})
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


@api_view(['GET'])
@authentication_classes([ExpiringTokenAuthentication])
@permission_classes([IsAuthenticated])
def me(request):
    user = request.user
    return JsonResponse({'success': True, 'user': _serialize_user(user)})


@api_view(['POST'])
@authentication_classes([ExpiringTokenAuthentication])
@permission_classes([IsAuthenticated])
def token_refresh(request):
    """Renueva el token del usuario autenticado (resetea el contador de expiración)."""
    user = request.user
    Token.objects.filter(user=user).delete()
    new_token = Token.objects.create(user=user)
    return JsonResponse({'success': True, 'token': new_token.key})


# ─────────────────────────────────────────
#  HELPERS – USUARIOS
# ─────────────────────────────────────────

def _get_or_create_profile(user):
    """Devuelve el perfil del usuario, creándolo si no existe."""
    profile, _ = UserProfile.objects.get_or_create(user=user)
    return profile


def _serialize_user(user):
    """Serializa un User + su UserProfile a dict."""
    profile = _get_or_create_profile(user)
    return {
        'id':                    user.id,
        'username':              user.username,
        'first_name':            user.first_name,
        'last_name':             user.last_name,
        'full_name':             user.get_full_name(),
        'email':                 user.email,
        'cargo':                 profile.cargo,
        'regional':              profile.regional,
        'canal':                 profile.canal,
        'is_active':             user.is_active,
        'is_staff':              user.is_staff,
        'dashboard_permissions': profile.dashboard_permissions,
        'groups':                list(user.groups.values_list('name', flat=True)),
        'date_joined':           user.date_joined.isoformat() if user.date_joined else None,
    }


_ADMIN_CARGOS_FULL = frozenset([
    'Administrador de Sistema',
    'Subadministrador de Sistemas',
    'Gerente General',
    'Gerente de Ventas',
    'Analista de Datos',
])

def _is_admin(user):
    """True si el usuario tiene permisos de administración (puede ver todos los filtros)."""
    if user.is_staff or user.is_superuser:
        return True
    try:
        return user.profile.cargo in _ADMIN_CARGOS_FULL
    except UserProfile.DoesNotExist:
        return False


# ─────────────────────────────────────────
#  HELPER: ejecutar SQL en el DW
# ─────────────────────────────────────────

def _run_dw_query(sql, params=None):
    """Ejecuta una consulta en la BD del DW y retorna columnas + filas como lista de dicts."""
    with connections['dw'].cursor() as cursor:
        cursor.execute(sql, params or [])
        columns = [col[0] for col in cursor.description]
        rows = []
        for row in cursor.fetchall():
            row_dict = {}
            for i, col in enumerate(columns):
                val = row[i]
                if val is None:
                    row_dict[col] = None
                elif isinstance(val, (date, datetime)):
                    row_dict[col] = val.isoformat()
                elif isinstance(val, decimal.Decimal):
                    row_dict[col] = float(val)
                elif isinstance(val, bytes):
                    row_dict[col] = val.decode('utf-8')
                else:
                    row_dict[col] = val
            rows.append(row_dict)
    return columns, rows


# ─────────────────────────────────────────
#  DASHBOARD – VENTAS
# ─────────────────────────────────────────

@api_view(['GET'])
@authentication_classes([ExpiringTokenAuthentication])
@permission_classes([IsAuthenticated])
def dashboard_ventas_kpis(request):
    """KPIs principales: total ventas, cantidad pedidos, ticket promedio del mes actual."""
    try:
        sql = """
            SELECT
                COUNT(DISTINCT fv.numero_venta)          AS total_pedidos,
                COALESCE(SUM(fv.venta_neta), 0)          AS total_venta_neta,
                COALESCE(AVG(fv.venta_neta), 0)          AS ticket_promedio,
                COUNT(DISTINCT fv.cliente_sk)            AS clientes_activos
            FROM dw.fact_ventas fv
            JOIN dw.dim_fecha df ON fv.fecha_sk = df.fecha_sk
            WHERE df.mes_actual = TRUE
        """
        _, rows = _run_dw_query(sql)
        return JsonResponse({'success': True, 'data': rows[0] if rows else {}})
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


@api_view(['GET'])
@authentication_classes([ExpiringTokenAuthentication])
@permission_classes([IsAuthenticated])
def dashboard_ventas_por_mes(request):
    """Ventas netas agrupadas por mes (últimos 12 meses)."""
    try:
        sql = """
            SELECT
                df.anho_mes                              AS periodo,
                df.mes_nombre                            AS mes,
                df.anho                                  AS anho,
                COALESCE(SUM(fv.venta_neta), 0)          AS total_venta_neta,
                COUNT(DISTINCT fv.numero_venta)          AS total_pedidos
            FROM dw.fact_ventas fv
            JOIN dw.dim_fecha df ON fv.fecha_sk = df.fecha_sk
            WHERE df.fecha_completa >= CURRENT_DATE - INTERVAL '12 months'
            GROUP BY df.anho_mes, df.mes_nombre, df.anho
            ORDER BY df.anho_mes
        """
        _, rows = _run_dw_query(sql)
        return JsonResponse({'success': True, 'data': rows})
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


@api_view(['GET'])
@authentication_classes([ExpiringTokenAuthentication])
@permission_classes([IsAuthenticated])
def dashboard_ventas_por_canal(request):
    """Ventas netas por canal de vendedor (mes actual)."""
    try:
        sql = """
            SELECT
                dv.canal                                 AS canal,
                COALESCE(SUM(fv.venta_neta), 0)          AS total_venta_neta,
                COUNT(DISTINCT fv.numero_venta)          AS total_pedidos,
                COUNT(DISTINCT fv.vendedor_sk)           AS vendedores
            FROM dw.fact_ventas fv
            JOIN dw.dim_vendedor dv ON fv.vendedor_sk = dv.vendedor_sk
            JOIN dw.dim_fecha df ON fv.fecha_sk = df.fecha_sk
            WHERE df.mes_actual = TRUE
              AND dv.es_vendedor_actual = TRUE
            GROUP BY dv.canal
            ORDER BY total_venta_neta DESC
        """
        _, rows = _run_dw_query(sql)
        return JsonResponse({'success': True, 'data': rows})
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


# ─────────────────────────────────────────
#  DASHBOARD – VENDEDORES
# ─────────────────────────────────────────

@api_view(['GET'])
@authentication_classes([ExpiringTokenAuthentication])
@permission_classes([IsAuthenticated])
def dashboard_vendedores_ranking(request):
    """Ranking de vendedores por venta neta del mes actual."""
    try:
        limit = min(_safe_int(request.GET.get('limit'), 20), 100)
        sql = """
            SELECT
                dv.vendedor_nombre                       AS vendedor,
                dv.canal                                 AS canal,
                dv.ciudad                                AS ciudad,
                COALESCE(SUM(fv.venta_neta), 0)          AS total_venta_neta,
                COUNT(DISTINCT fv.numero_venta)          AS total_pedidos,
                COUNT(DISTINCT fv.cliente_sk)            AS clientes_atendidos
            FROM dw.fact_ventas fv
            JOIN dw.dim_vendedor dv ON fv.vendedor_sk = dv.vendedor_sk
            JOIN dw.dim_fecha df ON fv.fecha_sk = df.fecha_sk
            WHERE df.mes_actual = TRUE
              AND dv.es_vendedor_actual = TRUE
            GROUP BY dv.vendedor_nombre, dv.canal, dv.ciudad
            ORDER BY total_venta_neta DESC
            LIMIT %s
        """
        _, rows = _run_dw_query(sql, [limit])
        return JsonResponse({'success': True, 'data': rows})
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


# ─────────────────────────────────────────
#  DASHBOARD – PRODUCTOS
# ─────────────────────────────────────────

@api_view(['GET'])
@authentication_classes([ExpiringTokenAuthentication])
@permission_classes([IsAuthenticated])
def dashboard_productos_top(request):
    """Top productos por venta neta del mes actual."""
    try:
        limit = min(_safe_int(request.GET.get('limit'), 20), 100)
        sql = """
            SELECT
                dp.producto_nombre                       AS producto,
                dp.grupo_descripcion                    AS grupo,
                dp.subgrupo_descripcion                 AS subgrupo,
                COALESCE(SUM(fv.cantidad), 0)            AS total_cantidad,
                COALESCE(SUM(fv.venta_neta), 0)          AS total_venta_neta
            FROM dw.fact_ventas fv
            JOIN dw.dim_producto dp ON fv.producto_sk = dp.producto_sk
            JOIN dw.dim_fecha df ON fv.fecha_sk = df.fecha_sk
            WHERE df.mes_actual = TRUE
              AND dp.es_producto_actual = TRUE
            GROUP BY dp.producto_nombre, dp.grupo_descripcion, dp.subgrupo_descripcion
            ORDER BY total_venta_neta DESC
            LIMIT %s
        """
        _, rows = _run_dw_query(sql, [limit])
        return JsonResponse({'success': True, 'data': rows})
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


@api_view(['GET'])
@authentication_classes([ExpiringTokenAuthentication])
@permission_classes([IsAuthenticated])
def dashboard_productos_por_grupo(request):
    """Ventas por grupo de producto del mes actual."""
    try:
        sql = """
            SELECT
                dp.grupo_descripcion                    AS grupo,
                COUNT(DISTINCT dp.producto_sk)           AS productos,
                COALESCE(SUM(fv.cantidad), 0)            AS total_cantidad,
                COALESCE(SUM(fv.venta_neta), 0)          AS total_venta_neta
            FROM dw.fact_ventas fv
            JOIN dw.dim_producto dp ON fv.producto_sk = dp.producto_sk
            JOIN dw.dim_fecha df ON fv.fecha_sk = df.fecha_sk
            WHERE df.mes_actual = TRUE
              AND dp.es_producto_actual = TRUE
            GROUP BY dp.grupo_descripcion
            ORDER BY total_venta_neta DESC
        """
        _, rows = _run_dw_query(sql)
        return JsonResponse({'success': True, 'data': rows})
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


# ─────────────────────────────────────────
#  DASHBOARD NACIONAL
# ─────────────────────────────────────────

CIUDADES = {
    'santa_cruz': ['SCZ'],
    'cochabamba': ['CBA'],
    'la_paz':     ['LPZ', 'EAL'],   # La Paz + El Alto
}

CIUDAD_LABELS = {
    'santa_cruz': 'Santa Cruz',
    'cochabamba': 'Cochabamba',
    'la_paz':     'La Paz',
}


def _ciudad_case(campo: str, ciudad_key: str) -> str:
    """Condición SQL para filtrar por ciudad usando códigos exactos."""
    vals = CIUDADES[ciudad_key]
    if len(vals) == 1:
        return f"{campo} = '{vals[0]}'"
    quoted = ', '.join(f"'{v}'" for v in vals)
    return f"{campo} IN ({quoted})"


@api_view(['GET'])
@authentication_classes([ExpiringTokenAuthentication])
@permission_classes([IsAuthenticated])
def dashboard_nacional_periodos(request):
    """Annos y meses disponibles en fact_ventas para los selectores."""
    cached = cache.get('periodos_disponibles')
    if cached is not None:
        return JsonResponse({'success': True, 'data': cached})
    try:
        sql = """
            SELECT DISTINCT df.anho, df.mes_numero, df.mes_nombre
            FROM dw.fact_ventas fv
            JOIN dw.dim_fecha df ON fv.fecha_sk = df.fecha_sk
            ORDER BY df.anho DESC, df.mes_numero DESC
            LIMIT 36
        """
        _, rows = _run_dw_query(sql)
        cache.set('periodos_disponibles', rows, 600)  # cache 10 min
        return JsonResponse({'success': True, 'data': rows})
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


@api_view(['GET'])
@authentication_classes([ExpiringTokenAuthentication])
@permission_classes([IsAuthenticated])
@_require_perm('nacional')
def dashboard_nacional_kpis(request):
    """KPIs: total nacional + Santa Cruz + Cochabamba + La Paz. Params: anho, mes."""
    try:
        anho = _safe_int(request.GET.get('anho'), datetime.now().year)
        mes  = _safe_int(request.GET.get('mes'),  datetime.now().month)

        scz  = _ciudad_case('dv.ciudad', 'santa_cruz')
        cbba = _ciudad_case('dv.ciudad', 'cochabamba')
        lpz  = _ciudad_case('dv.ciudad', 'la_paz')

        # Ventas reales por regional (usando ciudad del vendedor)
        sql_ventas = f"""
            SELECT
                COALESCE(SUM(fv.venta_neta), 0)                            AS total_nacional,
                COALESCE(SUM(CASE WHEN {scz}  THEN fv.venta_neta END), 0)  AS santa_cruz,
                COALESCE(SUM(CASE WHEN {cbba} THEN fv.venta_neta END), 0)  AS cochabamba,
                COALESCE(SUM(CASE WHEN {lpz}  THEN fv.venta_neta END), 0)  AS la_paz,
                MAX(df.fecha_completa)                                      AS fecha_corte
            FROM dw.fact_ventas fv
            JOIN dw.dim_fecha    df ON fv.fecha_sk    = df.fecha_sk
            JOIN dw.dim_vendedor dv ON fv.vendedor_sk = dv.vendedor_sk
            WHERE df.anho = %s AND df.mes_numero = %s
        """
        _, rows = _run_dw_query(sql_ventas, [anho, mes])
        data = rows[0] if rows else {}

        # Presupuesto desde fact_presupuesto (versión activa)
        sql_ppto = f"""
            SELECT
                COALESCE(SUM(fp.venta_neta_presupuestada), 0)                            AS total,
                COALESCE(SUM(CASE WHEN {scz}  THEN fp.venta_neta_presupuestada END), 0)  AS santa_cruz,
                COALESCE(SUM(CASE WHEN {cbba} THEN fp.venta_neta_presupuestada END), 0)  AS cochabamba,
                COALESCE(SUM(CASE WHEN {lpz}  THEN fp.venta_neta_presupuestada END), 0)  AS la_paz
            FROM dw.fact_presupuesto fp
            JOIN dw.dim_vendedor dv              ON fp.vendedor_sk = dv.vendedor_sk
            WHERE fp.anho = %s AND fp.mes = %s
              AND fp.version_sk = (SELECT MAX(version_sk) FROM dw.dim_presupuesto_version WHERE anho = %s AND mes = %s)
        """
        presupuestos = {'total': 0, 'santa_cruz': 0, 'cochabamba': 0, 'la_paz': 0}
        try:
            _, ppto_rows = _run_dw_query(sql_ppto, [anho, mes, anho, mes])
            if ppto_rows:
                presupuestos = {k: v or 0 for k, v in ppto_rows[0].items()}
        except Exception:
            pass

        data['presupuesto'] = presupuestos
        return JsonResponse({'success': True, 'data': data})
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


@api_view(['GET'])
@authentication_classes([ExpiringTokenAuthentication])
@permission_classes([IsAuthenticated])
@_require_perm('nacional')
def dashboard_nacional_tendencia(request):
    """Avance diario acumulado + presupuesto acumulado + proyeccion lineal. Params: anho, mes."""
    try:
        import calendar
        anho = _safe_int(request.GET.get('anho'), datetime.now().year)
        mes  = _safe_int(request.GET.get('mes'),  datetime.now().month)
        hoy  = datetime.now().date()

        sql_avance = """
            WITH dias AS (
                SELECT df.dia_numero,
                       COALESCE(SUM(fv.venta_neta), 0) AS venta_dia
                FROM dw.dim_fecha df
                LEFT JOIN dw.fact_ventas fv ON fv.fecha_sk = df.fecha_sk
                WHERE df.anho = %s AND df.mes_numero = %s
                  AND df.fecha_completa <= CURRENT_DATE
                GROUP BY df.dia_numero
            )
            SELECT dia_numero AS dia,
                   venta_dia,
                   SUM(venta_dia) OVER (ORDER BY dia_numero) AS avance_acumulado
            FROM dias ORDER BY dia_numero
        """
        _, avance_rows = _run_dw_query(sql_avance, [anho, mes])

        presupuesto_mes = 0.0
        try:
            _, p = _run_dw_query(
                """SELECT COALESCE(SUM(fp.venta_neta_presupuestada), 0) AS total
                   FROM dw.fact_presupuesto fp
                   WHERE fp.anho = %s AND fp.mes = %s
                     AND fp.version_sk = (SELECT MAX(version_sk) FROM dw.dim_presupuesto_version WHERE anho = %s AND mes = %s)""",
                [anho, mes, anho, mes]
            )
            presupuesto_mes = float(p[0]['total']) if p else 0.0
        except Exception:
            pass

        dias_en_mes        = calendar.monthrange(anho, mes)[1]
        ppto_diario        = presupuesto_mes / dias_en_mes if dias_en_mes > 0 else 0
        es_periodo_actual  = (anho == hoy.year and mes == hoy.month)
        dias_transcurridos = hoy.day if es_periodo_actual else dias_en_mes

        avance_por_dia = {int(r['dia']): r['avance_acumulado'] for r in avance_rows}
        avance_total   = float(avance_rows[-1]['avance_acumulado']) if avance_rows else 0.0
        tasa_diaria    = avance_total / dias_transcurridos if dias_transcurridos > 0 else 0

        result = []
        for dia in range(1, dias_en_mes + 1):
            proyeccion = None
            if es_periodo_actual and dia > dias_transcurridos:
                proyeccion = round(avance_total + tasa_diaria * (dia - dias_transcurridos), 2)
            result.append({
                'dia':                   dia,
                'avance_acumulado':      avance_por_dia.get(dia),
                'presupuesto_acumulado': round(ppto_diario * dia, 2) if presupuesto_mes > 0 else None,
                'proyeccion_acumulada':  proyeccion,
            })

        return JsonResponse({
            'success': True, 'data': result,
            'es_periodo_actual': es_periodo_actual,
            'presupuesto_mes': presupuesto_mes,
        })
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


@api_view(['GET'])
@authentication_classes([ExpiringTokenAuthentication])
@permission_classes([IsAuthenticated])
@_require_perm('nacional')
def dashboard_nacional_por_regional(request):
    """Presupuesto vs avance por regional. Params: anho, mes."""
    try:
        anho = _safe_int(request.GET.get('anho'), datetime.now().year)
        mes  = _safe_int(request.GET.get('mes'),  datetime.now().month)

        scz  = _ciudad_case('dv.ciudad', 'santa_cruz')
        cbba = _ciudad_case('dv.ciudad', 'cochabamba')
        lpz  = _ciudad_case('dv.ciudad', 'la_paz')

        sql = f"""
            SELECT
                CASE
                    WHEN {scz}  THEN 'Santa Cruz'
                    WHEN {cbba} THEN 'Cochabamba'
                    WHEN {lpz}  THEN 'La Paz'
                    ELSE 'Otras'
                END                             AS regional,
                COALESCE(SUM(fv.venta_neta), 0) AS avance
            FROM dw.fact_ventas fv
            JOIN dw.dim_fecha    df ON fv.fecha_sk    = df.fecha_sk
            JOIN dw.dim_vendedor dv ON fv.vendedor_sk = dv.vendedor_sk
            WHERE df.anho = %s AND df.mes_numero = %s
            GROUP BY regional ORDER BY avance DESC
        """
        _, rows = _run_dw_query(sql, [anho, mes])

        ppto_map: dict = {}
        try:
            sql_ppto = f"""
                SELECT
                    CASE
                        WHEN {_ciudad_case('dv.ciudad', 'santa_cruz')} THEN 'Santa Cruz'
                        WHEN {_ciudad_case('dv.ciudad', 'cochabamba')} THEN 'Cochabamba'
                        WHEN {_ciudad_case('dv.ciudad', 'la_paz')}     THEN 'La Paz'
                        ELSE 'Otras'
                    END                                                   AS regional,
                    COALESCE(SUM(fp.venta_neta_presupuestada), 0)         AS presupuesto
                FROM dw.fact_presupuesto fp
                JOIN dw.dim_vendedor dv              ON fp.vendedor_sk = dv.vendedor_sk
                WHERE fp.anho = %s AND fp.mes = %s
                  AND fp.version_sk = (SELECT MAX(version_sk) FROM dw.dim_presupuesto_version WHERE anho = %s AND mes = %s)
                GROUP BY regional
            """
            _, ppto_rows = _run_dw_query(sql_ppto, [anho, mes, anho, mes])
            ppto_map = {r['regional']: r['presupuesto'] for r in ppto_rows}
        except Exception:
            pass

        for row in rows:
            ppto = ppto_map.get(row['regional'], 0)
            row['presupuesto'] = ppto
            row['porcentaje']  = round(row['avance'] / ppto * 100, 1) if ppto > 0 else None

        principales = [r for r in rows if r['regional'] in ('Santa Cruz', 'Cochabamba', 'La Paz')]
        return JsonResponse({'success': True, 'data': principales})
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


@api_view(["GET"])
@authentication_classes([ExpiringTokenAuthentication])
@permission_classes([IsAuthenticated])
@_require_perm('nacional')
def dashboard_nacional_por_canal(request):
    """Presupuesto vs avance por canal de venta (DTS, WHS, INST, LICORES, SPM, PROV). Params: anho, mes."""
    try:
        anho = _safe_int(request.GET.get("anho"), datetime.now().year)
        mes  = _safe_int(request.GET.get("mes"),  datetime.now().month)

        sql = """
            SELECT
                dv.canal_rrhh                        AS canal,
                COALESCE(SUM(fv.venta_neta), 0)      AS avance
            FROM dw.fact_ventas fv
            JOIN dw.dim_fecha    df ON fv.fecha_sk    = df.fecha_sk
            JOIN dw.dim_vendedor dv ON fv.vendedor_sk = dv.vendedor_sk
            WHERE df.anho = %s AND df.mes_numero = %s
              AND dv.canal_rrhh IS NOT NULL
              AND dv.es_vendedor_actual = TRUE
            GROUP BY dv.canal_rrhh
            ORDER BY avance DESC
        """
        _, rows = _run_dw_query(sql, [anho, mes])

        # Presupuesto por canal consolidado desde fact_presupuesto
        ppto_map = {}
        try:
            sql_ppto = """
                SELECT
                    CASE
                        WHEN dv.canal_rrhh IN ('DTS', 'DTS-LP', 'DTS-EA') THEN 'DTS'
                        WHEN dv.canal_rrhh IN ('WHS', 'WHS-LP', 'WHS-EA') THEN 'WHS'
                        ELSE dv.canal_rrhh
                    END                                               AS canal,
                    COALESCE(SUM(fp.venta_neta_presupuestada), 0)     AS presupuesto
                FROM dw.fact_presupuesto fp
                JOIN dw.dim_vendedor dv              ON fp.vendedor_sk = dv.vendedor_sk
                WHERE fp.anho = %s AND fp.mes = %s
                  AND fp.version_sk = (SELECT MAX(version_sk) FROM dw.dim_presupuesto_version WHERE anho = %s AND mes = %s)
                GROUP BY CASE
                        WHEN dv.canal_rrhh IN ('DTS', 'DTS-LP', 'DTS-EA') THEN 'DTS'
                        WHEN dv.canal_rrhh IN ('WHS', 'WHS-LP', 'WHS-EA') THEN 'WHS'
                        ELSE dv.canal_rrhh
                    END
            """
            _, ppto_rows = _run_dw_query(sql_ppto, [anho, mes, anho, mes])
            ppto_map = {r["canal"]: r["presupuesto"] for r in ppto_rows}
        except Exception:
            pass

        # Consolidar canales DTS y WHS en ventas también
        canal_consolidado: dict = {}
        for row in rows:
            canal_orig = row["canal"]
            canal_key = (
                'DTS' if canal_orig in ('DTS', 'DTS-LP', 'DTS-EA') else
                'WHS' if canal_orig in ('WHS', 'WHS-LP', 'WHS-EA') else
                canal_orig
            )
            if canal_key not in canal_consolidado:
                canal_consolidado[canal_key] = {'canal': canal_key, 'avance': 0.0}
            canal_consolidado[canal_key]['avance'] += float(row['avance'] or 0)

        result = []
        for canal_key, row in canal_consolidado.items():
            ppto = ppto_map.get(canal_key, 0)
            result.append({
                'canal':       canal_key,
                'avance':      row['avance'],
                'presupuesto': ppto,
                'porcentaje':  round(row['avance'] / ppto * 100, 1) if ppto > 0 else None,
            })
        result.sort(key=lambda r: r['avance'], reverse=True)

        return JsonResponse({"success": True, "data": result})
    except Exception as e:
        return JsonResponse({"success": False, "error": str(e)}, status=500)


# ─────────────────────────────────────────
#  AUTH – CAMBIAR CONTRASEÑA PROPIA
# ─────────────────────────────────────────

@api_view(['POST'])
@authentication_classes([ExpiringTokenAuthentication])
@permission_classes([IsAuthenticated])
def auth_change_password(request):
    user             = request.user
    current_password = request.data.get('current_password', '')
    new_password     = request.data.get('new_password', '')

    if not current_password or not new_password:
        return JsonResponse(
            {'success': False, 'error': 'Campos requeridos'},
            status=status.HTTP_400_BAD_REQUEST
        )
    if not user.check_password(current_password):
        return JsonResponse(
            {'success': False, 'error': 'La contraseña actual es incorrecta'},
            status=status.HTTP_400_BAD_REQUEST
        )
    if len(new_password) < 6:
        return JsonResponse(
            {'success': False, 'error': 'La nueva contraseña debe tener al menos 6 caracteres'},
            status=status.HTTP_400_BAD_REQUEST
        )

    user.set_password(new_password)
    user.save()
    # Invalida token actual y genera uno nuevo
    user.auth_token.delete()
    new_token, _ = Token.objects.get_or_create(user=user)
    return JsonResponse({'success': True, 'token': new_token.key})


# ─────────────────────────────────────────
#  ADMIN – GESTIÓN DE USUARIOS
# ─────────────────────────────────────────

ADMIN_CARGOS = {'Administrador de Sistema', 'Subadministrador de Sistemas'}


@api_view(['GET'])
@authentication_classes([ExpiringTokenAuthentication])
@permission_classes([IsAuthenticated])
def admin_list_users(request):
    """Lista todos los usuarios del sistema (excluye superusuarios)."""
    if not _is_admin(request.user):
        return JsonResponse({'success': False, 'error': 'Sin permisos'}, status=403)

    users = (
        User.objects
        .filter(is_superuser=False)
        .order_by('first_name', 'last_name', 'username')
    )
    return JsonResponse([_serialize_user(u) for u in users], safe=False)


@api_view(['POST'])
@authentication_classes([ExpiringTokenAuthentication])
@permission_classes([IsAuthenticated])
def admin_create_user(request):
    """Crea un nuevo usuario con su perfil."""
    if not _is_admin(request.user):
        return JsonResponse({'success': False, 'error': 'Sin permisos'}, status=403)

    data                  = request.data
    username              = data.get('username', '').strip()
    first_name            = data.get('first_name', '').strip()
    last_name             = data.get('last_name', '').strip()
    email                 = data.get('email', '').strip()
    cargo                 = data.get('cargo', '')
    regional              = data.get('regional', '')
    canal                 = data.get('canal', '')
    password              = data.get('password', '')
    dashboard_permissions = data.get('dashboard_permissions', [])
    if not isinstance(dashboard_permissions, list) or len(dashboard_permissions) == 0:
        dashboard_permissions = _PERMISOS_POR_CARGO.get(cargo, [])

    if not username:
        return JsonResponse({'success': False, 'error': 'El nombre de usuario es requerido'}, status=400)
    if not password or len(password) < 6:
        return JsonResponse({'success': False, 'error': 'La contraseña debe tener al menos 6 caracteres'}, status=400)
    if User.objects.filter(username=username).exists():
        return JsonResponse(
            {'success': False, 'error': f'El usuario "{username}" ya existe'},
            status=400
        )

    new_user = User.objects.create_user(
        username   = username,
        first_name = first_name,
        last_name  = last_name,
        email      = email,
        password   = password,
        is_staff   = (cargo in ADMIN_CARGOS),
    )
    UserProfile.objects.create(
        user                  = new_user,
        cargo                 = cargo,
        regional              = regional,
        canal                 = canal,
        dashboard_permissions = dashboard_permissions,
    )
    return JsonResponse({'success': True, 'user': _serialize_user(new_user)}, status=201)


@api_view(['PATCH'])
@authentication_classes([ExpiringTokenAuthentication])
@permission_classes([IsAuthenticated])
def admin_update_user(request, user_id):
    """Actualiza datos básicos + cargo/regional de un usuario."""
    if not _is_admin(request.user):
        return JsonResponse({'success': False, 'error': 'Sin permisos'}, status=403)

    try:
        target = User.objects.get(pk=user_id, is_superuser=False)
    except User.DoesNotExist:
        return JsonResponse({'success': False, 'error': 'Usuario no encontrado'}, status=404)

    data = request.data

    # Username: verificar unicidad si cambió
    new_username = data.get('username', '').strip()
    if new_username and new_username != target.username:
        if User.objects.filter(username=new_username).exclude(pk=target.pk).exists():
            return JsonResponse(
                {'success': False, 'error': f'El usuario "{new_username}" ya está en uso'},
                status=400
            )
        target.username = new_username

    if 'first_name' in data:
        target.first_name = data['first_name'].strip()
    if 'last_name' in data:
        target.last_name = data['last_name'].strip()
    if 'email' in data:
        target.email = data['email'].strip()
    if 'is_active' in data:
        target.is_active = bool(data['is_active'])

    cargo = data.get('cargo')
    if cargo is not None:
        target.is_staff = cargo in ADMIN_CARGOS

    target.save()

    profile = _get_or_create_profile(target)
    if cargo is not None:
        profile.cargo = cargo
    if 'regional' in data:
        profile.regional = data['regional']
    if 'canal' in data:
        profile.canal = data['canal']
    profile.save()

    return JsonResponse({'success': True, 'user': _serialize_user(target)})


@api_view(['PATCH'])
@authentication_classes([ExpiringTokenAuthentication])
@permission_classes([IsAuthenticated])
def admin_update_permissions(request, user_id):
    """Actualiza los permisos de dashboards de un usuario."""
    if not _is_admin(request.user):
        return JsonResponse({'success': False, 'error': 'Sin permisos'}, status=403)

    try:
        target = User.objects.get(pk=user_id, is_superuser=False)
    except User.DoesNotExist:
        return JsonResponse({'success': False, 'error': 'Usuario no encontrado'}, status=404)

    perms = request.data.get('dashboard_permissions', [])
    if not isinstance(perms, list):
        return JsonResponse({'success': False, 'error': 'dashboard_permissions debe ser una lista'}, status=400)

    profile = _get_or_create_profile(target)
    profile.dashboard_permissions = perms
    profile.save()

    return JsonResponse({'success': True, 'user': _serialize_user(target)})


@api_view(['POST'])
@authentication_classes([ExpiringTokenAuthentication])
@permission_classes([IsAuthenticated])
def admin_set_password(request, user_id):
    """Establece nueva contraseña para cualquier usuario (sin requerir la actual)."""
    if not _is_admin(request.user):
        return JsonResponse({'success': False, 'error': 'Sin permisos'}, status=403)

    try:
        target = User.objects.get(pk=user_id, is_superuser=False)
    except User.DoesNotExist:
        return JsonResponse({'success': False, 'error': 'Usuario no encontrado'}, status=404)

    new_password = request.data.get('new_password', '')
    if not new_password or len(new_password) < 6:
        return JsonResponse(
            {'success': False, 'error': 'La contraseña debe tener al menos 6 caracteres'},
            status=400
        )

    target.set_password(new_password)
    target.save()
    # Invalida sesiones activas del usuario afectado
    Token.objects.filter(user=target).delete()

    return JsonResponse({'success': True, 'message': 'Contraseña actualizada correctamente'})


# ─────────────────────────────────────────
#  DASHBOARD NACIONAL – POR CATEGORÍA
# ─────────────────────────────────────────

@api_view(['GET'])
@authentication_classes([ExpiringTokenAuthentication])
@permission_classes([IsAuthenticated])
@_require_perm('nacional')
def dashboard_nacional_por_categoria(request):
    """Ventas vs presupuesto por grupo de categoría a nivel nacional (4 categorías principales, excluyendo Exhibidores). Params: anho, mes."""
    try:
        anho = _safe_int(request.GET.get('anho'), datetime.now().year)
        mes  = _safe_int(request.GET.get('mes'),  datetime.now().month)

        sql = """
            SELECT
                CASE dp.linea
                    WHEN 'ALIMENTOS'            THEN 'Alimentos'
                    WHEN 'APEGO'                THEN 'Apego'
                    WHEN 'BEBIDAS ALC'          THEN 'Licores'
                    WHEN 'HOME Y PERSONAL CARE' THEN 'Home & Personal Care'
                    ELSE 'Sin clasificar'
                END AS categoria,
                COALESCE(SUM(fv.venta_neta), 0) AS venta_neta,
                COALESCE(SUM(fv.cantidad), 0)   AS cantidad,
                COUNT(DISTINCT fv.producto_sk)  AS productos
            FROM dw.fact_ventas fv
            JOIN dw.dim_fecha    df ON fv.fecha_sk    = df.fecha_sk
            JOIN dw.dim_producto dp ON fv.producto_sk = dp.producto_sk
            WHERE df.anho = %s AND df.mes_numero = %s
              AND dp.linea IS NOT NULL
            GROUP BY dp.linea
            ORDER BY venta_neta DESC
        """
        _, rows = _run_dw_query(sql, [anho, mes])

        # Presupuesto por categoria consolidado desde fact_presupuesto
        ppto_map = {}
        try:
            sql_ppto = """
                SELECT
                    CASE dp.linea
                        WHEN 'ALIMENTOS'            THEN 'Alimentos'
                        WHEN 'APEGO'                THEN 'Apego'
                        WHEN 'BEBIDAS ALC'          THEN 'Licores'
                        WHEN 'HOME Y PERSONAL CARE' THEN 'Home & Personal Care'
                        ELSE 'Sin clasificar'
                    END AS categoria,
                    COALESCE(SUM(fp.venta_neta_presupuestada), 0) AS presupuesto
                FROM dw.fact_presupuesto fp
                JOIN dw.dim_producto             dp  ON fp.producto_sk = dp.producto_sk
                WHERE fp.anho = %s AND fp.mes = %s
                  AND fp.version_sk = (SELECT MAX(version_sk) FROM dw.dim_presupuesto_version WHERE anho = %s AND mes = %s)
                  AND dp.linea IS NOT NULL
                GROUP BY dp.linea
            """
            _, ppto_rows = _run_dw_query(sql_ppto, [anho, mes, anho, mes])
            ppto_map = {r["categoria"]: r["presupuesto"] for r in ppto_rows}
        except Exception:
            pass

        # Consolidar resultados con presupuesto
        result = []
        for row in rows:
            categoria = row["categoria"]
            venta_neta = float(row['venta_neta'] or 0)
            ppto = ppto_map.get(categoria, 0)
            result.append({
                'categoria': categoria,
                'venta_neta': venta_neta,
                'cantidad': int(row['cantidad'] or 0),
                'productos': int(row['productos'] or 0),
                'presupuesto': ppto,
                'porcentaje': round(venta_neta / ppto * 100, 1) if ppto > 0 else None,
            })
        result.sort(key=lambda r: r['venta_neta'], reverse=True)

        return JsonResponse({'success': True, 'data': result})
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


# ─────────────────────────────────────────
#  HELPERS REGIONALES
# ─────────────────────────────────────────

REGIONALES_VALID = {'santa_cruz', 'cochabamba', 'la_paz', 'nacional'}


def _regional_filter(regional_key, campo='dv.ciudad'):
    if regional_key == 'nacional':
        return '1=1'
    return _ciudad_case(campo, regional_key)


def _ppto_by_regional(anho, mes, ciudad_cond, canal_filter='', params_extra=None):
    """Retorna dict canal_rrhh->presupuesto para la regional dada."""
    sql = f"""
        SELECT dv.canal_rrhh AS canal, COALESCE(SUM(fp.venta_neta_presupuestada), 0) AS presupuesto
        FROM dw.fact_presupuesto fp
        JOIN dw.dim_vendedor dv             ON fp.vendedor_sk = dv.vendedor_sk
        WHERE fp.anho = %s AND fp.mes = %s
          AND ({ciudad_cond})
          AND dv.canal_rrhh IS NOT NULL
          {canal_filter}
          AND fp.version_sk = (SELECT MAX(version_sk) FROM dw.dim_presupuesto_version WHERE anho = %s AND mes = %s)
        GROUP BY dv.canal_rrhh
    """
    base = [anho, mes] + (params_extra or []) + [anho, mes]
    try:
        _, rows = _run_dw_query(sql, base)
        return {r['canal']: float(r['presupuesto'] or 0) for r in rows}
    except Exception:
        return {}


# ─────────────────────────────────────────
#  DASHBOARD REGIONALES
# ─────────────────────────────────────────

@api_view(['GET'])
@authentication_classes([ExpiringTokenAuthentication])
@permission_classes([IsAuthenticated])
@_require_perm('regionales')
def dashboard_regionales_kpis(request):
    """KPIs: total regional + canales desglosados. Params: regional, anho, mes."""
    try:
        regional = request.GET.get('regional', 'santa_cruz').lower().replace(' ', '_')
        anho     = _safe_int(request.GET.get('anho'), datetime.now().year)
        mes      = _safe_int(request.GET.get('mes'),  datetime.now().month)
        if regional not in REGIONALES_VALID:
            return JsonResponse({'success': False, 'error': 'Regional inválida'}, status=400)

        ciudad_cond = _regional_filter(regional)

        sql = f"""
            SELECT
                dv.canal_rrhh                               AS canal,
                COALESCE(SUM(fv.venta_neta), 0)             AS avance,
                MAX(df.fecha_completa)                      AS fecha_corte
            FROM dw.fact_ventas fv
            JOIN dw.dim_fecha    df ON fv.fecha_sk    = df.fecha_sk
            JOIN dw.dim_vendedor dv ON fv.vendedor_sk = dv.vendedor_sk
            WHERE df.anho = %s AND df.mes_numero = %s
              AND dv.canal_rrhh IS NOT NULL
              AND ({ciudad_cond})
            GROUP BY dv.canal_rrhh
            ORDER BY avance DESC
        """
        _, ventas_rows = _run_dw_query(sql, [anho, mes])
        ppto_map = _ppto_by_regional(anho, mes, ciudad_cond)
        ppto_trim = ppto_map  # _ppto_by_regional ya devuelve canal_rrhh

        total_avance  = sum(float(r['avance'] or 0) for r in ventas_rows)
        total_ppto    = sum(ppto_trim.values())
        fecha_corte   = max((r['fecha_corte'] for r in ventas_rows if r.get('fecha_corte')), default=None)

        canales = []
        for row in ventas_rows:
            canal = row['canal']
            ppto  = ppto_trim.get(canal, 0)
            canales.append({'nombre': canal, 'avance': float(row['avance'] or 0), 'objetivo': ppto})

        return JsonResponse({'success': True, 'data': {
            'total':          total_avance,
            'objetivo_total': total_ppto,
            'canales':        canales,
            'fecha_corte':    fecha_corte,
        }})
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


@api_view(['GET'])
@authentication_classes([ExpiringTokenAuthentication])
@permission_classes([IsAuthenticated])
@_require_perm('regionales')
def dashboard_regionales_tendencia(request):
    """Avance diario acumulado para una regional. Params: regional, anho, mes."""
    try:
        import calendar
        regional = request.GET.get('regional', 'santa_cruz').lower().replace(' ', '_')
        anho     = _safe_int(request.GET.get('anho'), datetime.now().year)
        mes      = _safe_int(request.GET.get('mes'),  datetime.now().month)
        hoy      = datetime.now().date()
        if regional not in REGIONALES_VALID:
            return JsonResponse({'success': False, 'error': 'Regional inválida'}, status=400)

        ciudad_cond  = _regional_filter(regional)
        ciudad_cond2 = _regional_filter(regional, campo='dv2.ciudad')

        sql_avance = f"""
            WITH dias AS (
                SELECT df.dia_numero,
                       COALESCE(SUM(fv.venta_neta), 0) AS venta_dia
                FROM dw.dim_fecha df
                LEFT JOIN dw.fact_ventas fv ON fv.fecha_sk = df.fecha_sk
                    AND EXISTS (
                        SELECT 1 FROM dw.dim_vendedor dv2
                        WHERE dv2.vendedor_sk = fv.vendedor_sk AND ({ciudad_cond2})
                    )
                WHERE df.anho = %s AND df.mes_numero = %s
                  AND df.fecha_completa <= CURRENT_DATE
                GROUP BY df.dia_numero
            )
            SELECT dia_numero AS dia, venta_dia,
                   SUM(venta_dia) OVER (ORDER BY dia_numero) AS avance_acumulado
            FROM dias ORDER BY dia_numero
        """
        _, avance_rows = _run_dw_query(sql_avance, [anho, mes])

        sql_ppto = f"""
            SELECT COALESCE(SUM(fp.venta_neta_presupuestada), 0) AS total
            FROM dw.fact_presupuesto fp
            JOIN dw.dim_vendedor dv             ON fp.vendedor_sk = dv.vendedor_sk
            WHERE fp.anho = %s AND fp.mes = %s
              AND ({ciudad_cond})
              AND fp.version_sk = (SELECT MAX(version_sk) FROM dw.dim_presupuesto_version WHERE anho = %s AND mes = %s)
        """
        presupuesto_mes = 0.0
        try:
            _, p = _run_dw_query(sql_ppto, [anho, mes, anho, mes])
            presupuesto_mes = float(p[0]['total']) if p else 0.0
        except Exception:
            pass

        dias_en_mes        = calendar.monthrange(anho, mes)[1]
        ppto_diario        = presupuesto_mes / dias_en_mes if dias_en_mes > 0 else 0
        es_periodo_actual  = (anho == hoy.year and mes == hoy.month)
        dias_transcurridos = hoy.day if es_periodo_actual else dias_en_mes
        avance_por_dia     = {int(r['dia']): r['avance_acumulado'] for r in avance_rows}
        avance_total       = float(avance_rows[-1]['avance_acumulado']) if avance_rows else 0.0
        tasa_diaria        = avance_total / dias_transcurridos if dias_transcurridos > 0 else 0

        result = []
        for dia in range(1, dias_en_mes + 1):
            proyeccion = None
            if es_periodo_actual and dia > dias_transcurridos:
                proyeccion = round(avance_total + tasa_diaria * (dia - dias_transcurridos), 2)
            result.append({
                'dia':                   dia,
                'avance_acumulado':      avance_por_dia.get(dia),
                'presupuesto_acumulado': round(ppto_diario * dia, 2) if presupuesto_mes > 0 else None,
                'proyeccion_acumulada':  proyeccion,
            })
        return JsonResponse({'success': True, 'data': result,
                             'presupuesto_mes': presupuesto_mes,
                             'es_periodo_actual': es_periodo_actual})
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


@api_view(['GET'])
@authentication_classes([ExpiringTokenAuthentication])
@permission_classes([IsAuthenticated])
@_require_perm('regionales')
def dashboard_regionales_por_canal(request):
    """Avance vs presupuesto por canal de una regional. Params: regional, anho, mes."""
    try:
        regional = request.GET.get('regional', 'santa_cruz').lower().replace(' ', '_')
        anho     = _safe_int(request.GET.get('anho'), datetime.now().year)
        mes      = _safe_int(request.GET.get('mes'),  datetime.now().month)
        if regional not in REGIONALES_VALID:
            return JsonResponse({'success': False, 'error': 'Regional inválida'}, status=400)

        ciudad_cond = _regional_filter(regional)
        sql = f"""
            SELECT dv.canal_rrhh AS canal, COALESCE(SUM(fv.venta_neta), 0) AS avance
            FROM dw.fact_ventas fv
            JOIN dw.dim_fecha    df ON fv.fecha_sk    = df.fecha_sk
            JOIN dw.dim_vendedor dv ON fv.vendedor_sk = dv.vendedor_sk
            WHERE df.anho = %s AND df.mes_numero = %s
              AND dv.canal_rrhh IS NOT NULL AND ({ciudad_cond})
            GROUP BY dv.canal_rrhh ORDER BY avance DESC
        """
        _, rows = _run_dw_query(sql, [anho, mes])
        ppto_map = _ppto_by_regional(anho, mes, ciudad_cond)
        for row in rows:
            ppto = ppto_map.get(row['canal'], 0)
            row['presupuesto'] = ppto
            row['porcentaje']  = round(row['avance'] / ppto * 100, 1) if ppto > 0 else None
        return JsonResponse({'success': True, 'data': rows})
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


_CATEGORIA_CASE = """
    CASE dp.linea
        WHEN 'ALIMENTOS'            THEN 'Alimentos'
        WHEN 'APEGO'                THEN 'Apego'
        WHEN 'BEBIDAS ALC'          THEN 'Licores'
        WHEN 'HOME Y PERSONAL CARE' THEN 'Home & Personal Care'
        ELSE 'Sin clasificar'
    END
"""


@api_view(['GET'])
@authentication_classes([ExpiringTokenAuthentication])
@permission_classes([IsAuthenticated])
@_require_perm('regionales')
def dashboard_regionales_por_categoria(request):
    """Ventas vs presupuesto por categoría consolidada de una regional. Params: regional, anho, mes."""
    try:
        regional = request.GET.get('regional', 'santa_cruz').lower().replace(' ', '_')
        anho     = _safe_int(request.GET.get('anho'), datetime.now().year)
        mes      = _safe_int(request.GET.get('mes'),  datetime.now().month)
        if regional not in REGIONALES_VALID:
            return JsonResponse({'success': False, 'error': 'Regional inválida'}, status=400)

        ciudad_cond = _regional_filter(regional)

        sql = f"""
            SELECT
                {_CATEGORIA_CASE}                                AS categoria,
                COALESCE(SUM(fv.venta_neta), 0)                  AS avance
            FROM dw.fact_ventas fv
            JOIN dw.dim_fecha    df   ON fv.fecha_sk    = df.fecha_sk
            JOIN dw.dim_vendedor dv   ON fv.vendedor_sk = dv.vendedor_sk
            JOIN dw.dim_producto dp   ON fv.producto_sk = dp.producto_sk
            WHERE df.anho = %s AND df.mes_numero = %s AND ({ciudad_cond})
              AND dp.linea IS NOT NULL AND dp.linea != 'SIN LINEA'
            GROUP BY {_CATEGORIA_CASE}
            ORDER BY avance DESC
        """
        _, rows = _run_dw_query(sql, [anho, mes])

        # Presupuesto por categoría consolidado con filtro regional
        ppto_map = {}
        try:
            sql_ppto = f"""
                SELECT
                    {_CATEGORIA_CASE}                                        AS categoria,
                    COALESCE(SUM(fp.venta_neta_presupuestada), 0)             AS presupuesto
                FROM dw.fact_presupuesto fp
                JOIN dw.dim_vendedor dv              ON fp.vendedor_sk = dv.vendedor_sk
                JOIN dw.dim_producto dp              ON fp.producto_sk = dp.producto_sk
                WHERE fp.anho = %s AND fp.mes = %s
                  AND ({ciudad_cond})
                  AND dp.grupo_descripcion != 'EXHIBIDORES'
                  AND dp.grupo_descripcion IS NOT NULL
                  AND fp.version_sk = (SELECT MAX(version_sk) FROM dw.dim_presupuesto_version WHERE anho = %s AND mes = %s)
                GROUP BY {_CATEGORIA_CASE}
            """
            _, ppto_rows = _run_dw_query(sql_ppto, [anho, mes, anho, mes])
            ppto_map = {r['categoria']: float(r['presupuesto'] or 0) for r in ppto_rows}
        except Exception:
            pass

        result = []
        for row in rows:
            cat   = row['categoria']
            av    = float(row['avance'] or 0)
            ppto  = ppto_map.get(cat, 0)
            result.append({
                'categoria':   cat,
                'avance':      av,
                'presupuesto': ppto,
                'porcentaje':  round(av / ppto * 100, 1) if ppto > 0 else None,
            })

        return JsonResponse({'success': True, 'data': result})
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


# ─────────────────────────────────────────
#  DASHBOARD CANALES / REGIONAL
# ─────────────────────────────────────────

@api_view(['GET'])
@authentication_classes([ExpiringTokenAuthentication])
@permission_classes([IsAuthenticated])
@_require_perm('canales')
def dashboard_canales_kpis(request):
    """KPI cards por canal con filtro opcional. Params: regional, canal, anho, mes."""
    try:
        regional = request.GET.get('regional', 'santa_cruz').lower().replace(' ', '_')
        canal    = _safe_str(request.GET.get('canal', ''))
        anho     = _safe_int(request.GET.get('anho'), datetime.now().year)
        mes      = _safe_int(request.GET.get('mes'),  datetime.now().month)
        if regional not in REGIONALES_VALID:
            return JsonResponse({'success': False, 'error': 'Regional inválida'}, status=400)

        ciudad_cond  = _regional_filter(regional)
        canal_cond   = "AND dv.canal_rrhh = %s" if canal else ""
        params       = [anho, mes] + ([canal] if canal else [])

        sql = f"""
            SELECT
                dv.canal_rrhh                            AS canal,
                COALESCE(SUM(fv.venta_neta), 0)          AS avance,
                COUNT(DISTINCT fv.numero_venta)           AS pedidos,
                COUNT(DISTINCT fv.cliente_sk)             AS clientes
            FROM dw.fact_ventas fv
            JOIN dw.dim_fecha    df ON fv.fecha_sk    = df.fecha_sk
            JOIN dw.dim_vendedor dv ON fv.vendedor_sk = dv.vendedor_sk
            WHERE df.anho = %s AND df.mes_numero = %s
              AND dv.canal_rrhh IS NOT NULL AND ({ciudad_cond})
              {canal_cond}
            GROUP BY dv.canal_rrhh ORDER BY avance DESC
        """
        _, ventas_rows = _run_dw_query(sql, params)
        canal_filter_ppto = "AND dv.canal_rrhh = %s" if canal else ""
        ppto_map = _ppto_by_regional(anho, mes, ciudad_cond, canal_filter_ppto, [canal] if canal else None)

        result = []
        for row in ventas_rows:
            ppto = ppto_map.get(row['canal'], 0)
            result.append({**row, 'presupuesto': ppto,
                           'porcentaje': round(row['avance'] / ppto * 100, 1) if ppto > 0 else None})
        return JsonResponse({'success': True, 'data': result})
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


@api_view(['GET'])
@authentication_classes([ExpiringTokenAuthentication])
@permission_classes([IsAuthenticated])
@_require_perm('canales')
def dashboard_canales_tendencia(request):
    """Tendencia diaria para canal+regional. Params: regional, canal, anho, mes."""
    try:
        import calendar
        regional = request.GET.get('regional', 'santa_cruz').lower().replace(' ', '_')
        canal    = _safe_str(request.GET.get('canal', ''))
        anho     = _safe_int(request.GET.get('anho'), datetime.now().year)
        mes      = _safe_int(request.GET.get('mes'),  datetime.now().month)
        hoy      = datetime.now().date()
        if regional not in REGIONALES_VALID:
            return JsonResponse({'success': False, 'error': 'Regional inválida'}, status=400)

        ciudad_cond2 = _regional_filter(regional, campo='dv2.ciudad')
        canal_cond2  = "AND dv2.canal_rrhh = %s" if canal else ""
        params_avance = ([canal] if canal else []) + [anho, mes]

        sql_avance = f"""
            WITH dias AS (
                SELECT df.dia_numero,
                       COALESCE(SUM(fv.venta_neta), 0) AS venta_dia
                FROM dw.dim_fecha df
                LEFT JOIN dw.fact_ventas fv ON fv.fecha_sk = df.fecha_sk
                    AND EXISTS (
                        SELECT 1 FROM dw.dim_vendedor dv2
                        WHERE dv2.vendedor_sk = fv.vendedor_sk
                          AND ({ciudad_cond2})
                          {canal_cond2}
                    )
                WHERE df.anho = %s AND df.mes_numero = %s
                  AND df.fecha_completa <= CURRENT_DATE
                GROUP BY df.dia_numero
            )
            SELECT dia_numero AS dia, venta_dia,
                   SUM(venta_dia) OVER (ORDER BY dia_numero) AS avance_acumulado
            FROM dias ORDER BY dia_numero
        """
        _, avance_rows = _run_dw_query(sql_avance, params_avance)

        ciudad_cond = _regional_filter(regional)
        canal_cond  = "AND dv.canal_rrhh = %s" if canal else ""
        ppto_map = _ppto_by_regional(anho, mes, ciudad_cond, canal_cond, [canal] if canal else None)
        presupuesto_mes = sum(ppto_map.values())

        dias_en_mes        = calendar.monthrange(anho, mes)[1]
        ppto_diario        = presupuesto_mes / dias_en_mes if dias_en_mes > 0 else 0
        es_periodo_actual  = (anho == hoy.year and mes == hoy.month)
        dias_transcurridos = hoy.day if es_periodo_actual else dias_en_mes
        avance_por_dia     = {int(r['dia']): r['avance_acumulado'] for r in avance_rows}
        avance_total       = float(avance_rows[-1]['avance_acumulado']) if avance_rows else 0.0
        tasa_diaria        = avance_total / dias_transcurridos if dias_transcurridos > 0 else 0

        result = []
        for dia in range(1, dias_en_mes + 1):
            proyeccion = None
            if es_periodo_actual and dia > dias_transcurridos:
                proyeccion = round(avance_total + tasa_diaria * (dia - dias_transcurridos), 2)
            result.append({
                'dia':                   dia,
                'avance_acumulado':      avance_por_dia.get(dia),
                'presupuesto_acumulado': round(ppto_diario * dia, 2) if presupuesto_mes > 0 else None,
                'proyeccion_acumulada':  proyeccion,
            })
        return JsonResponse({'success': True, 'data': result,
                             'presupuesto_mes': presupuesto_mes,
                             'es_periodo_actual': es_periodo_actual})
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


@api_view(['GET'])
@authentication_classes([ExpiringTokenAuthentication])
@permission_classes([IsAuthenticated])
@_require_perm('canales')
def dashboard_canales_por_categoria(request):
    """Ventas vs presupuesto por categoría consolidada para canal+regional. Params: regional, canal, anho, mes."""
    try:
        regional = request.GET.get('regional', 'santa_cruz').lower().replace(' ', '_')
        canal    = _safe_str(request.GET.get('canal', ''))
        anho     = _safe_int(request.GET.get('anho'), datetime.now().year)
        mes      = _safe_int(request.GET.get('mes'),  datetime.now().month)
        if regional not in REGIONALES_VALID:
            return JsonResponse({'success': False, 'error': 'Regional inválida'}, status=400)

        ciudad_cond = _regional_filter(regional)
        canal_cond  = "AND dv.canal_rrhh = %s" if canal else ""
        params      = [anho, mes] + ([canal] if canal else [])

        sql = f"""
            SELECT
                {_CATEGORIA_CASE}                                AS categoria,
                COALESCE(SUM(fv.venta_neta), 0)                  AS avance,
                COALESCE(SUM(fv.cantidad), 0)                    AS cantidad,
                COUNT(DISTINCT fv.producto_sk)                   AS productos
            FROM dw.fact_ventas fv
            JOIN dw.dim_fecha    df   ON fv.fecha_sk    = df.fecha_sk
            JOIN dw.dim_vendedor dv   ON fv.vendedor_sk = dv.vendedor_sk
            JOIN dw.dim_producto dp   ON fv.producto_sk = dp.producto_sk
            WHERE df.anho = %s AND df.mes_numero = %s
              AND ({ciudad_cond}) {canal_cond}
              AND dp.linea IS NOT NULL AND dp.linea != 'SIN LINEA'
            GROUP BY {_CATEGORIA_CASE}
            ORDER BY avance DESC
        """
        _, rows = _run_dw_query(sql, params)

        ppto_map = {}
        try:
            sql_ppto = f"""
                SELECT
                    {_CATEGORIA_CASE}                                        AS categoria,
                    COALESCE(SUM(fp.venta_neta_presupuestada), 0)             AS presupuesto
                FROM dw.fact_presupuesto fp
                JOIN dw.dim_vendedor dv              ON fp.vendedor_sk = dv.vendedor_sk
                JOIN dw.dim_producto dp              ON fp.producto_sk = dp.producto_sk
                WHERE fp.anho = %s AND fp.mes = %s
                  AND ({ciudad_cond}) {canal_cond}
                  AND dp.grupo_descripcion != 'EXHIBIDORES'
                  AND dp.grupo_descripcion IS NOT NULL
                  AND fp.version_sk = (SELECT MAX(version_sk) FROM dw.dim_presupuesto_version WHERE anho = %s AND mes = %s)
                GROUP BY {_CATEGORIA_CASE}
            """
            _, ppto_rows = _run_dw_query(sql_ppto, params + [anho, mes])
            ppto_map = {r['categoria']: float(r['presupuesto'] or 0) for r in ppto_rows}
        except Exception:
            pass

        result = []
        for row in rows:
            cat  = row['categoria']
            av   = float(row['avance'] or 0)
            ppto = ppto_map.get(cat, 0)
            result.append({
                'categoria':  cat,
                'avance':     av,
                'cantidad':   int(row['cantidad'] or 0),
                'productos':  int(row['productos'] or 0),
                'presupuesto': ppto,
                'porcentaje': round(av / ppto * 100, 1) if ppto > 0 else None,
            })
        return JsonResponse({'success': True, 'data': result})
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


@api_view(['GET'])
@authentication_classes([ExpiringTokenAuthentication])
@permission_classes([IsAuthenticated])
@_require_perm('canales')
def dashboard_canales_por_sku(request):
    """
    Top SKUs para canal+categoría+regional.
    Params: regional, canal, categoria, anho, mes, limit
    """
    try:
        regional  = request.GET.get('regional', 'santa_cruz').lower().replace(' ', '_')
        canal     = _safe_str(request.GET.get('canal', ''))
        categoria = _safe_str(request.GET.get('categoria', ''))
        anho      = _safe_int(request.GET.get('anho'), datetime.now().year)
        mes       = _safe_int(request.GET.get('mes'),  datetime.now().month)
        limit     = min(_safe_int(request.GET.get('limit'), 500), 1000)
        if regional not in REGIONALES_VALID:
            return JsonResponse({'success': False, 'error': 'Regional inválida'}, status=400)

        ciudad_cond = _regional_filter(regional)
        canal_cond  = "AND dv.canal_rrhh = %s" if canal else ""

        params = [anho, mes]
        if canal:
            params.append(canal)

        cat_cond = ""
        if categoria and categoria in _UNIDADES_CAT_LINEA:
            cat_cond = "AND dp.linea = %s"
            params.append(_UNIDADES_CAT_LINEA[categoria])

        params_ventas = list(params) + [limit]

        sql = f"""
            SELECT
                dp.producto_codigo_erp                           AS codigo,
                dp.producto_nombre                               AS producto,
                COALESCE(dp.linea, 'Sin Línea')                  AS categoria,
                COALESCE(dp.subgrupo_descripcion, '')            AS subgrupo,
                COALESCE(SUM(fv.cantidad), 0)                    AS cantidad,
                COALESCE(SUM(fv.venta_neta), 0)                  AS venta_neta,
                COUNT(DISTINCT fv.cliente_sk)                    AS clientes
            FROM dw.fact_ventas fv
            JOIN dw.dim_fecha    df   ON fv.fecha_sk    = df.fecha_sk
            JOIN dw.dim_vendedor dv   ON fv.vendedor_sk = dv.vendedor_sk
            JOIN dw.dim_producto dp   ON fv.producto_sk = dp.producto_sk
            WHERE df.anho = %s AND df.mes_numero = %s
              AND ({ciudad_cond}) {canal_cond} {cat_cond}
            GROUP BY dp.producto_codigo_erp, dp.producto_nombre,
                     dp.linea, dp.subgrupo_descripcion
            ORDER BY venta_neta DESC
            LIMIT %s
        """
        _, rows = _run_dw_query(sql, params_ventas)

        # Presupuesto por producto (Bs + Uds)
        ppto_map = {}
        try:
            sql_ppto = f"""
                SELECT dp.producto_codigo_erp                              AS codigo,
                       COALESCE(SUM(fp.venta_neta_presupuestada), 0)       AS presupuesto,
                       COALESCE(SUM(fp.cantidad_presupuestada), 0)         AS presupuesto_uds
                FROM dw.fact_presupuesto fp
                JOIN dw.dim_vendedor dv              ON fp.vendedor_sk = dv.vendedor_sk
                JOIN dw.dim_producto dp              ON fp.producto_sk = dp.producto_sk
                WHERE fp.anho = %s AND fp.mes = %s
                  AND ({ciudad_cond}) {canal_cond} {cat_cond}
                  AND fp.version_sk = (SELECT MAX(version_sk) FROM dw.dim_presupuesto_version WHERE anho = %s AND mes = %s)
                GROUP BY dp.producto_codigo_erp
            """
            _, ppto_rows = _run_dw_query(sql_ppto, params + [anho, mes])
            ppto_map = {r['codigo']: r for r in ppto_rows}
        except Exception:
            pass

        result = []
        for row in rows:
            vn       = float(row['venta_neta'] or 0)
            cant     = int(row['cantidad'] or 0)
            p        = ppto_map.get(row['codigo'], {})
            ppto_bs  = float(p.get('presupuesto',     0) or 0)
            ppto_uds = float(p.get('presupuesto_uds', 0) or 0)
            result.append({
                **row,
                'venta_neta':    vn,
                'presupuesto':   ppto_bs,
                'presupuesto_uds': int(ppto_uds),
                'porcentaje':    round(vn   / ppto_bs  * 100, 1) if ppto_bs  > 0 else None,
                'porcentaje_uds': round(cant / ppto_uds * 100, 1) if ppto_uds > 0 else None,
            })
        return JsonResponse({'success': True, 'data': result})
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


# ─────────────────────────────────────────
#  DASHBOARD SUPERVISORES
# ─────────────────────────────────────────

_REGIONAL_NAME_TO_KEY = {
    'Santa Cruz': 'santa_cruz',
    'Cochabamba': 'cochabamba',
    'La Paz':     'la_paz',
    'Nacional':   'nacional',
}

# Mapeo categoría → valor de dp.linea en el DW
_LINEA_ALIMENTOS = 'ALIMENTOS'
_LINEA_APEGO     = 'APEGO'
_LINEA_LICORES   = 'BEBIDAS ALC'
_LINEA_HPC       = 'HOME Y PERSONAL CARE'


@api_view(['GET'])
@authentication_classes([ExpiringTokenAuthentication])
@permission_classes([IsAuthenticated])
@_require_any_perm('supervisores', 'unidades-supervisores')
def dashboard_supervisores_vendedores(request):
    """
    Avance por vendedor desglosado por categoría.
    - Admins: filtran por regional/canal/supervisor via query params.
    - Gerente Regional: regional+canal del perfil, supervisor libre via query param.
    - Supervisores: regional+canal del perfil, supervisor = su propio nombre.
    """
    try:
        is_admin = _is_admin(request.user)
        profile  = _get_or_create_profile(request.user)
        cargo    = (profile.cargo or '').strip()

        if is_admin:
            regional_key      = request.GET.get('regional', 'santa_cruz').lower().replace(' ', '_')
            canal             = _safe_str(request.GET.get('canal', ''))
            supervisor_filter = _safe_str(request.GET.get('supervisor', ''))
        elif cargo == 'Gerente Regional':
            regional_key      = _REGIONAL_NAME_TO_KEY.get(profile.regional, 'santa_cruz')
            canal             = _safe_str(request.GET.get('canal', ''), 30)
            supervisor_filter = _safe_str(request.GET.get('supervisor', ''))
        elif 'supervisor' in cargo.lower():
            regional_key      = _REGIONAL_NAME_TO_KEY.get(profile.regional, 'santa_cruz')
            canal             = (profile.canal or '').strip()
            full_name         = f"{profile.user.first_name} {profile.user.last_name}".strip()
            supervisor_filter = full_name
        else:
            return JsonResponse({'success': False, 'error': 'Acceso denegado'}, status=403)

        anho = _safe_int(request.GET.get('anho'), datetime.now().year)
        mes  = _safe_int(request.GET.get('mes'),  datetime.now().month)

        if regional_key not in REGIONALES_VALID:
            return JsonResponse({'success': False, 'error': 'Regional inválida'}, status=400)

        ciudad_cond     = _regional_filter(regional_key)
        canal_cond      = "AND dv.canal_rrhh = %s" if canal else ""
        supervisor_cond = "AND UPPER(dv.supervisor) = UPPER(%s)" if supervisor_filter else ""
        params_base     = [anho, mes] + ([canal] if canal else []) + ([supervisor_filter] if supervisor_filter else [])

        # ── Ventas por vendedor y categoría (CASE WHEN pivot) ──────────────────
        sql_ventas = f"""
            SELECT
                dv.vendedor_sk,
                dv.vendedor_nombre                                                          AS vendedor,
                COALESCE(SUM(CASE WHEN dp.linea = 'ALIMENTOS'            THEN fv.venta_neta ELSE 0 END), 0) AS alimentos,
                COALESCE(SUM(CASE WHEN dp.linea = 'APEGO'                THEN fv.venta_neta ELSE 0 END), 0) AS apego,
                COALESCE(SUM(CASE WHEN dp.linea = 'BEBIDAS ALC'          THEN fv.venta_neta ELSE 0 END), 0) AS licores,
                COALESCE(SUM(CASE WHEN dp.linea = 'HOME Y PERSONAL CARE' THEN fv.venta_neta ELSE 0 END), 0) AS hpc,
                COALESCE(SUM(CASE WHEN dp.linea = 'SIN LINEA' OR dp.linea IS NULL THEN fv.venta_neta ELSE 0 END), 0) AS sin_clasificar,
                COALESCE(SUM(fv.venta_neta), 0)                                                              AS total,
                COALESCE(SUM(CASE WHEN dp.linea = 'ALIMENTOS'            THEN fv.cantidad ELSE 0 END), 0)   AS alimentos_cant,
                COALESCE(SUM(CASE WHEN dp.linea = 'APEGO'                THEN fv.cantidad ELSE 0 END), 0)   AS apego_cant,
                COALESCE(SUM(CASE WHEN dp.linea = 'BEBIDAS ALC'          THEN fv.cantidad ELSE 0 END), 0)   AS licores_cant,
                COALESCE(SUM(CASE WHEN dp.linea = 'HOME Y PERSONAL CARE' THEN fv.cantidad ELSE 0 END), 0)   AS hpc_cant,
                COALESCE(SUM(CASE WHEN dp.linea = 'SIN LINEA' OR dp.linea IS NULL THEN fv.cantidad ELSE 0 END), 0) AS sin_clasificar_cant,
                COALESCE(SUM(fv.cantidad), 0)                                                                AS total_cant
            FROM dw.fact_ventas fv
            JOIN dw.dim_fecha    df ON fv.fecha_sk    = df.fecha_sk
            JOIN dw.dim_vendedor dv ON fv.vendedor_sk = dv.vendedor_sk
            JOIN dw.dim_producto dp ON fv.producto_sk = dp.producto_sk
            WHERE df.anho = %s AND df.mes_numero = %s
              AND ({ciudad_cond}) {canal_cond} {supervisor_cond}
            GROUP BY dv.vendedor_sk, dv.vendedor_nombre
            ORDER BY total DESC
        """
        _, ventas_rows = _run_dw_query(sql_ventas, params_base)

        # ── Presupuesto por vendedor y categoría ───────────────────────────────
        ppto_map = {}
        ppto_rows = []
        try:
            sql_ppto = f"""
                SELECT
                    dv.vendedor_sk,
                    COALESCE(SUM(CASE WHEN dp.linea = 'ALIMENTOS'            THEN fp.venta_neta_presupuestada ELSE 0 END), 0) AS alimentos_ppto,
                    COALESCE(SUM(CASE WHEN dp.linea = 'APEGO'                THEN fp.venta_neta_presupuestada ELSE 0 END), 0) AS apego_ppto,
                    COALESCE(SUM(CASE WHEN dp.linea = 'BEBIDAS ALC'          THEN fp.venta_neta_presupuestada ELSE 0 END), 0) AS licores_ppto,
                    COALESCE(SUM(CASE WHEN dp.linea = 'HOME Y PERSONAL CARE' THEN fp.venta_neta_presupuestada ELSE 0 END), 0) AS hpc_ppto,
                    COALESCE(SUM(CASE WHEN dp.linea = 'SIN LINEA' OR dp.linea IS NULL THEN fp.venta_neta_presupuestada ELSE 0 END), 0) AS sin_clasificar_ppto,
                    COALESCE(SUM(fp.venta_neta_presupuestada), 0)                                                              AS total_ppto,
                    COALESCE(SUM(CASE WHEN dp.linea = 'ALIMENTOS'            THEN fp.cantidad_presupuestada ELSE 0 END), 0)   AS alimentos_ppto_uds,
                    COALESCE(SUM(CASE WHEN dp.linea = 'APEGO'                THEN fp.cantidad_presupuestada ELSE 0 END), 0)   AS apego_ppto_uds,
                    COALESCE(SUM(CASE WHEN dp.linea = 'BEBIDAS ALC'          THEN fp.cantidad_presupuestada ELSE 0 END), 0)   AS licores_ppto_uds,
                    COALESCE(SUM(CASE WHEN dp.linea = 'HOME Y PERSONAL CARE' THEN fp.cantidad_presupuestada ELSE 0 END), 0)   AS hpc_ppto_uds,
                    COALESCE(SUM(CASE WHEN dp.linea = 'SIN LINEA' OR dp.linea IS NULL THEN fp.cantidad_presupuestada ELSE 0 END), 0) AS sin_clasificar_ppto_uds,
                    COALESCE(SUM(fp.cantidad_presupuestada), 0)                                                                AS total_ppto_uds
                FROM dw.fact_presupuesto fp
                JOIN dw.dim_vendedor             dv  ON fp.vendedor_sk = dv.vendedor_sk
                JOIN dw.dim_producto             dp  ON fp.producto_sk = dp.producto_sk
                WHERE fp.anho = %s AND fp.mes = %s
                  AND ({ciudad_cond}) {canal_cond} {supervisor_cond}
                  AND fp.version_sk = (SELECT MAX(version_sk) FROM dw.dim_presupuesto_version WHERE anho = %s AND mes = %s)
                GROUP BY dv.vendedor_sk
            """
            _, ppto_rows = _run_dw_query(sql_ppto, params_base + [anho, mes])
            ppto_map = {r['vendedor_sk']: r for r in ppto_rows}
        except Exception:
            pass

        def _pct(avance, ppto):
            a, p = float(avance or 0), float(ppto or 0)
            return round(a / p * 100, 1) if p > 0 else None

        def _pct_uds(cant, ppto_uds):
            c, pu = int(cant or 0), float(ppto_uds or 0)
            return round(c / pu * 100, 1) if pu > 0 else None

        result = []
        for row in ventas_rows:
            sk   = row['vendedor_sk']
            p    = ppto_map.get(sk, {})
            a_a  = float(row['alimentos']       or 0);  ca_a = int(row['alimentos_cant']       or 0)
            a_e  = float(row['apego']           or 0);  ca_e = int(row['apego_cant']           or 0)
            a_l  = float(row['licores']         or 0);  ca_l = int(row['licores_cant']         or 0)
            a_h  = float(row['hpc']             or 0);  ca_h = int(row['hpc_cant']             or 0)
            a_sc = float(row['sin_clasificar']  or 0);  ca_sc= int(row['sin_clasificar_cant']  or 0)
            a_t  = float(row['total']           or 0);  ca_t = int(row['total_cant']           or 0)
            p_a  = float(p.get('alimentos_ppto')        or 0);  pu_a  = float(p.get('alimentos_ppto_uds')        or 0)
            p_e  = float(p.get('apego_ppto')            or 0);  pu_e  = float(p.get('apego_ppto_uds')            or 0)
            p_l  = float(p.get('licores_ppto')          or 0);  pu_l  = float(p.get('licores_ppto_uds')          or 0)
            p_h  = float(p.get('hpc_ppto')              or 0);  pu_h  = float(p.get('hpc_ppto_uds')              or 0)
            p_sc = float(p.get('sin_clasificar_ppto')   or 0);  pu_sc = float(p.get('sin_clasificar_ppto_uds')   or 0)
            p_t  = float(p.get('total_ppto')            or 0);  pu_t  = float(p.get('total_ppto_uds')            or 0)
            result.append({
                'vendedor_sk':    sk,
                'vendedor':       row['vendedor'],
                'alimentos':      a_a,  'alimentos_ppto':      p_a,  'alimentos_pct':      _pct(a_a,  p_a),  'alimentos_cant':      ca_a,  'alimentos_ppto_uds':      int(pu_a),  'alimentos_pct_uds':      _pct_uds(ca_a,  pu_a),
                'apego':          a_e,  'apego_ppto':          p_e,  'apego_pct':          _pct(a_e,  p_e),  'apego_cant':          ca_e,  'apego_ppto_uds':          int(pu_e),  'apego_pct_uds':          _pct_uds(ca_e,  pu_e),
                'licores':        a_l,  'licores_ppto':        p_l,  'licores_pct':        _pct(a_l,  p_l),  'licores_cant':        ca_l,  'licores_ppto_uds':        int(pu_l),  'licores_pct_uds':        _pct_uds(ca_l,  pu_l),
                'hpc':            a_h,  'hpc_ppto':            p_h,  'hpc_pct':            _pct(a_h,  p_h),  'hpc_cant':            ca_h,  'hpc_ppto_uds':            int(pu_h),  'hpc_pct_uds':            _pct_uds(ca_h,  pu_h),
                'sin_clasificar': a_sc, 'sin_clasificar_ppto': p_sc, 'sin_clasificar_pct': _pct(a_sc, p_sc), 'sin_clasificar_cant': ca_sc, 'sin_clasificar_ppto_uds': int(pu_sc), 'sin_clasificar_pct_uds': _pct_uds(ca_sc, pu_sc),
                'total':          a_t,  'total_ppto':          p_t,  'total_pct':          _pct(a_t,  p_t),  'total_cant':          ca_t,  'total_ppto_uds':          int(pu_t),  'total_pct_uds':          _pct_uds(ca_t,  pu_t),
            })

        total_avance = sum(r['total'] for r in result)
        # Sumar presupuesto de TODOS los vendedores con presupuesto (no solo los que vendieron)
        total_ppto   = sum(float(r.get('total_ppto') or 0) for r in ppto_rows)

        sql_fc = f"""
            SELECT MAX(df.fecha_completa) AS fc
            FROM dw.fact_ventas fv
            JOIN dw.dim_fecha    df ON fv.fecha_sk    = df.fecha_sk
            JOIN dw.dim_vendedor dv ON fv.vendedor_sk = dv.vendedor_sk
            WHERE df.anho = %s AND df.mes_numero = %s
              AND ({ciudad_cond}) {canal_cond} {supervisor_cond}
        """
        _, fc_rows  = _run_dw_query(sql_fc, params_base)
        fecha_corte = str(fc_rows[0]['fc']) if fc_rows and fc_rows[0]['fc'] else None

        return JsonResponse({
            'success':      True,
            'regional':     regional_key,
            'canal':        canal,
            'supervisor':   supervisor_filter,
            'total_avance': total_avance,
            'total_ppto':   total_ppto,
            'total_pct':    round(total_avance / total_ppto * 100, 1) if total_ppto > 0 else None,
            'fecha_corte':  fecha_corte,
            'vendedores':   result,
        })
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


@api_view(['GET'])
@authentication_classes([ExpiringTokenAuthentication])
@permission_classes([IsAuthenticated])
@_require_any_perm('supervisores', 'unidades-supervisores')
def dashboard_supervisores_liquidaciones(request):
    """
    Venta neta diaria por vendedor, excluyendo domingos.
    Retorna { fechas: [str], rows: [{ vendedor_sk, vendedor, ventas: {fecha: monto} }] }
    """
    try:
        is_admin = _is_admin(request.user)
        profile  = _get_or_create_profile(request.user)
        cargo    = (profile.cargo or '').strip()

        if is_admin:
            regional_key      = request.GET.get('regional', 'santa_cruz').lower().replace(' ', '_')
            canal             = _safe_str(request.GET.get('canal', ''))
            supervisor_filter = _safe_str(request.GET.get('supervisor', ''))
        elif cargo == 'Gerente Regional':
            regional_key      = _REGIONAL_NAME_TO_KEY.get(profile.regional, 'santa_cruz')
            canal             = _safe_str(request.GET.get('canal', ''), 30)
            supervisor_filter = _safe_str(request.GET.get('supervisor', ''))
        elif 'supervisor' in cargo.lower():
            regional_key      = _REGIONAL_NAME_TO_KEY.get(profile.regional, 'santa_cruz')
            canal             = (profile.canal or '').strip()
            full_name         = f"{profile.user.first_name} {profile.user.last_name}".strip()
            supervisor_filter = full_name
        else:
            return JsonResponse({'success': False, 'error': 'Acceso denegado'}, status=403)

        anho = _safe_int(request.GET.get('anho'), datetime.now().year)
        mes  = _safe_int(request.GET.get('mes'),  datetime.now().month)

        if regional_key not in REGIONALES_VALID:
            return JsonResponse({'success': False, 'error': 'Regional inválida'}, status=400)

        ciudad_cond     = _regional_filter(regional_key)
        canal_cond      = "AND dv.canal_rrhh = %s" if canal else ""
        supervisor_cond = "AND UPPER(dv.supervisor) = UPPER(%s)" if supervisor_filter else ""
        params          = [anho, mes] + ([canal] if canal else []) + ([supervisor_filter] if supervisor_filter else [])

        sql = f"""
            SELECT
                dv.vendedor_sk,
                dv.vendedor_nombre                               AS vendedor,
                df.fecha_completa::date                          AS fecha,
                COALESCE(SUM(fv.venta_neta), 0)                 AS venta_neta
            FROM dw.fact_ventas fv
            JOIN dw.dim_fecha    df ON fv.fecha_sk    = df.fecha_sk
            JOIN dw.dim_vendedor dv ON fv.vendedor_sk = dv.vendedor_sk
            WHERE df.anho = %s AND df.mes_numero = %s
              AND EXTRACT(DOW FROM df.fecha_completa) != 0
              AND ({ciudad_cond}) {canal_cond} {supervisor_cond}
            GROUP BY dv.vendedor_sk, dv.vendedor_nombre, df.fecha_completa::date
            ORDER BY dv.vendedor_nombre, df.fecha_completa::date
        """
        _, rows = _run_dw_query(sql, params)

        vendedores: dict = {}
        fechas_set: set  = set()
        for r in rows:
            sk    = r['vendedor_sk']
            fecha = str(r['fecha'])
            venta = float(r['venta_neta'] or 0)
            fechas_set.add(fecha)
            if sk not in vendedores:
                vendedores[sk] = {'vendedor_sk': sk, 'vendedor': r['vendedor'], 'ventas': {}}
            vendedores[sk]['ventas'][fecha] = venta

        fechas = sorted(fechas_set)
        return JsonResponse({'success': True, 'fechas': fechas, 'rows': list(vendedores.values())})
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


@api_view(['GET'])
@authentication_classes([ExpiringTokenAuthentication])
@permission_classes([IsAuthenticated])
@_require_any_perm('supervisores', 'tendencia-estacional', 'preventas-realizadas',
                   'unidades-supervisores', 'informacion-rutas', 'canales', 'regionales')
def dashboard_supervisores_supervisor_lista(request):
    """Retorna lista de supervisores distintos para el regional/canal/año/mes dado."""
    try:
        is_admin = _is_admin(request.user)
        profile  = _get_or_create_profile(request.user)
        cargo    = (profile.cargo or '').strip()

        if is_admin:
            regional_key = request.GET.get('regional', 'santa_cruz').lower().replace(' ', '_')
            canal        = _safe_str(request.GET.get('canal', ''))
        elif cargo == 'Gerente Regional':
            regional_key = _REGIONAL_NAME_TO_KEY.get(profile.regional, 'santa_cruz')
            canal        = _safe_str(request.GET.get('canal', ''), 30)
        else:
            return JsonResponse({'success': True, 'data': []})

        anho = _safe_int(request.GET.get('anho'), datetime.now().year)
        mes  = _safe_int(request.GET.get('mes'),  datetime.now().month)

        if regional_key not in REGIONALES_VALID:
            return JsonResponse({'success': False, 'error': 'Regional inválida'}, status=400)

        ciudad_cond = _regional_filter(regional_key)
        canal_cond  = "AND dv.canal_rrhh = %s" if canal else ""
        params      = [anho, mes] + ([canal] if canal else [])

        sql = f"""
            SELECT DISTINCT INITCAP(dv.supervisor) AS supervisor
            FROM dw.fact_ventas fv
            JOIN dw.dim_fecha    df ON fv.fecha_sk    = df.fecha_sk
            JOIN dw.dim_vendedor dv ON fv.vendedor_sk = dv.vendedor_sk
            WHERE df.anho = %s AND df.mes_numero = %s
              AND ({ciudad_cond}) {canal_cond}
              AND dv.supervisor IS NOT NULL AND dv.supervisor != ''
            ORDER BY supervisor
        """
        _, rows = _run_dw_query(sql, params)
        return JsonResponse({'success': True, 'data': [r['supervisor'] for r in rows]})
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


# ─────────────────────────────────────────
#  DASHBOARD PREVENTAS REALIZADAS
# ─────────────────────────────────────────

import calendar as _cal_mod

def _preventas_fecha_rango(request):
    """Returns (fecha_desde, fecha_hasta) strings 'YYYY-MM-DD' for SQL filter.
    Accepts fecha_desde/fecha_hasta params; falls back to anho+mes."""
    fd = request.GET.get('fecha_desde', '').strip()
    fh = request.GET.get('fecha_hasta', '').strip()
    if fd and fh:
        try:
            date.fromisoformat(fd)
            date.fromisoformat(fh)
            return fd, fh
        except ValueError:
            pass
    now  = datetime.now()
    anho = _safe_int(request.GET.get('anho'), now.year)
    mes  = _safe_int(request.GET.get('mes'),  now.month)
    last = _cal_mod.monthrange(anho, mes)[1]
    return f"{anho}-{mes:02d}-01", f"{anho}-{mes:02d}-{last:02d}"

@api_view(['GET'])
@authentication_classes([ExpiringTokenAuthentication])
@permission_classes([IsAuthenticated])
@_require_perm('preventas-realizadas')
def dashboard_preventas_kpis(request):
    try:
        is_admin = _is_admin(request.user)
        profile  = _get_or_create_profile(request.user)
        cargo    = (profile.cargo or '').strip()
        if is_admin:
            regional_key = request.GET.get('regional', 'santa_cruz').lower().replace(' ', '_')
            canal        = _safe_str(request.GET.get('canal', ''))
            supervisor   = _safe_str(request.GET.get('supervisor', ''))
        elif cargo == 'Gerente Regional':
            regional_key = _REGIONAL_NAME_TO_KEY.get(profile.regional, 'santa_cruz')
            canal        = _safe_str(request.GET.get('canal', ''), 30)
            supervisor   = _safe_str(request.GET.get('supervisor', ''))
        elif 'supervisor' in cargo.lower():
            regional_key = _REGIONAL_NAME_TO_KEY.get(profile.regional, 'santa_cruz')
            canal        = (profile.canal or '').strip()
            supervisor   = f"{profile.user.first_name} {profile.user.last_name}".strip()
        else:
            regional_key = _REGIONAL_NAME_TO_KEY.get(profile.regional, 'santa_cruz')
            canal        = (profile.canal or '').strip()
            supervisor   = _safe_str(request.GET.get('supervisor', ''))
        fecha_desde, fecha_hasta = _preventas_fecha_rango(request)
        if regional_key not in REGIONALES_VALID:
            return JsonResponse({'success': False, 'error': 'Regional inválida'}, status=400)
        ciudad_cond     = _regional_filter(regional_key, campo='dv.ciudad')
        canal_cond      = "AND dv.canal_rrhh = %s" if canal else ""
        supervisor_cond = "AND UPPER(dv.supervisor) = UPPER(%s)" if supervisor else ""
        params = [fecha_desde, fecha_hasta] + ([canal] if canal else []) + ([supervisor] if supervisor else [])
        sql = f"""
            SELECT
                COUNT(DISTINCT dp.nro_transaccion)                             AS total_pedidos,
                ROUND(COALESCE(SUM(dp.importe_total), 0)::NUMERIC, 2)          AS total_importe
            FROM dual.dim_preventa dp
            LEFT JOIN dw.dim_vendedor dv ON dv.vendedor_codigo_erp = dp.codigo_usuario
                AND dv.es_vendedor_actual = TRUE
            WHERE dp.fecha_transaccion::date BETWEEN %s AND %s
              AND ({ciudad_cond}) {canal_cond} {supervisor_cond}
        """
        _, rows = _run_dw_query(sql, params)
        row = rows[0] if rows else {}
        return JsonResponse({
            'success':        True,
            'total_pedidos':  row.get('total_pedidos', 0),
            'total_importe':  float(row.get('total_importe', 0) or 0),
        })
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


@api_view(['GET'])
@authentication_classes([ExpiringTokenAuthentication])
@permission_classes([IsAuthenticated])
@_require_perm('preventas-realizadas')
def dashboard_preventas_por_canal(request):
    try:
        is_admin = _is_admin(request.user)
        profile  = _get_or_create_profile(request.user)
        cargo    = (profile.cargo or '').strip()
        if is_admin:
            regional_key = request.GET.get('regional', 'santa_cruz').lower().replace(' ', '_')
            canal        = _safe_str(request.GET.get('canal', ''))
            supervisor   = _safe_str(request.GET.get('supervisor', ''))
        elif cargo == 'Gerente Regional':
            regional_key = _REGIONAL_NAME_TO_KEY.get(profile.regional, 'santa_cruz')
            canal        = _safe_str(request.GET.get('canal', ''), 30)
            supervisor   = _safe_str(request.GET.get('supervisor', ''))
        elif 'supervisor' in cargo.lower():
            regional_key = _REGIONAL_NAME_TO_KEY.get(profile.regional, 'santa_cruz')
            canal        = (profile.canal or '').strip()
            supervisor   = f"{profile.user.first_name} {profile.user.last_name}".strip()
        else:
            regional_key = _REGIONAL_NAME_TO_KEY.get(profile.regional, 'santa_cruz')
            canal        = (profile.canal or '').strip()
            supervisor   = _safe_str(request.GET.get('supervisor', ''))
        fecha_desde, fecha_hasta = _preventas_fecha_rango(request)
        if regional_key not in REGIONALES_VALID:
            return JsonResponse({'success': False, 'error': 'Regional inválida'}, status=400)
        ciudad_cond     = _regional_filter(regional_key, campo='dv.ciudad')
        canal_cond      = "AND dv.canal_rrhh = %s" if canal else ""
        supervisor_cond = "AND UPPER(dv.supervisor) = UPPER(%s)" if supervisor else ""
        # supervisor activo → agrupa por vendedor; canal activo → por supervisor; sin filtros → por canal
        if supervisor:
            grupo_col        = "dp.nombre_usuario"
            agrupado_por_val = "vendedor"
        elif canal:
            grupo_col        = "dv.supervisor"
            agrupado_por_val = "supervisor"
        else:
            grupo_col        = "dv.canal_rrhh"
            agrupado_por_val = "canal"
        params = [fecha_desde, fecha_hasta] + ([canal] if canal else []) + ([supervisor] if supervisor else [])
        sql = f"""
            SELECT
                COALESCE({grupo_col}, 'Sin Asignar')                           AS grupo,
                COUNT(DISTINCT dp.nro_transaccion)                             AS pedidos,
                ROUND(COALESCE(SUM(dp.importe_total), 0)::NUMERIC, 2)          AS monto
            FROM dual.dim_preventa dp
            LEFT JOIN dw.dim_vendedor dv ON dv.vendedor_codigo_erp = dp.codigo_usuario
                AND dv.es_vendedor_actual = TRUE
            WHERE dp.fecha_transaccion::date BETWEEN %s AND %s
              AND ({ciudad_cond}) {canal_cond} {supervisor_cond}
            GROUP BY {grupo_col}
            ORDER BY monto DESC
            LIMIT 20
        """
        _, rows = _run_dw_query(sql, params)
        data = [
            {
                'grupo':   r['grupo'],
                'pedidos': r['pedidos'],
                'monto':   float(r['monto'] or 0),
            }
            for r in rows
        ]
        return JsonResponse({'success': True, 'data': data, 'agrupado_por': agrupado_por_val})
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


@api_view(['GET'])
@authentication_classes([ExpiringTokenAuthentication])
@permission_classes([IsAuthenticated])
@_require_perm('preventas-realizadas')
def dashboard_preventas_por_vendedor(request):
    try:
        is_admin = _is_admin(request.user)
        profile  = _get_or_create_profile(request.user)
        cargo    = (profile.cargo or '').strip()
        if is_admin:
            regional_key = request.GET.get('regional', 'santa_cruz').lower().replace(' ', '_')
            canal        = _safe_str(request.GET.get('canal', ''))
            supervisor   = _safe_str(request.GET.get('supervisor', ''))
        elif cargo == 'Gerente Regional':
            regional_key = _REGIONAL_NAME_TO_KEY.get(profile.regional, 'santa_cruz')
            canal        = _safe_str(request.GET.get('canal', ''), 30)
            supervisor   = _safe_str(request.GET.get('supervisor', ''))
        elif 'supervisor' in cargo.lower():
            regional_key = _REGIONAL_NAME_TO_KEY.get(profile.regional, 'santa_cruz')
            canal        = (profile.canal or '').strip()
            supervisor   = f"{profile.user.first_name} {profile.user.last_name}".strip()
        else:
            regional_key = _REGIONAL_NAME_TO_KEY.get(profile.regional, 'santa_cruz')
            canal        = (profile.canal or '').strip()
            supervisor   = _safe_str(request.GET.get('supervisor', ''))
        fecha_desde, fecha_hasta = _preventas_fecha_rango(request)
        if regional_key not in REGIONALES_VALID:
            return JsonResponse({'success': False, 'error': 'Regional inválida'}, status=400)
        ciudad_cond     = _regional_filter(regional_key, campo='dv.ciudad')
        canal_cond      = "AND dv.canal_rrhh = %s" if canal else ""
        supervisor_cond = "AND UPPER(dv.supervisor) = UPPER(%s)" if supervisor else ""
        # params: [fd,fh] for rutas CTE, [fd,fh] for clientes CTE inner, [fd,fh] for main WHERE + filters
        params = (
            [fecha_desde, fecha_hasta]
            + [fecha_desde, fecha_hasta]
            + [fecha_desde, fecha_hasta]
            + ([canal] if canal else [])
            + ([supervisor] if supervisor else [])
        )
        sql = f"""
            WITH ruta_clientes AS (
                SELECT ruta, COUNT(*) AS total_clientes
                FROM dual.dim_cliente_dual
                WHERE es_actual = true
                GROUP BY ruta
            ),
            vendedor_rutas AS (
                SELECT
                    nombre_usuario,
                    STRING_AGG(DISTINCT ruta, ' / ' ORDER BY ruta) AS rutas_concat
                FROM dual.dim_preventa
                WHERE fecha_transaccion::date BETWEEN %s AND %s
                GROUP BY nombre_usuario
            ),
            vendedor_clientes_total AS (
                SELECT
                    sub.nombre_usuario,
                    COALESCE(SUM(rc.total_clientes), 0) AS total_clientes
                FROM (
                    SELECT DISTINCT nombre_usuario, ruta
                    FROM dual.dim_preventa
                    WHERE fecha_transaccion::date BETWEEN %s AND %s
                ) sub
                LEFT JOIN ruta_clientes rc ON rc.ruta = sub.ruta
                GROUP BY sub.nombre_usuario
            )
            SELECT
                dp.nombre_usuario                                                       AS vendedor,
                vr.rutas_concat                                                         AS ruta,
                MAX(dv.supervisor)                                                      AS supervisor,
                COALESCE(vtc.total_clientes, 0)                                         AS total_clientes,
                COUNT(DISTINCT dp.cod_cliente)                                          AS pedidos,
                ROUND(
                    COUNT(DISTINCT dp.cod_cliente)::NUMERIC
                    / NULLIF(COALESCE(vtc.total_clientes, 0), 0) * 100
                , 1)                                                                    AS pct_efectividad,
                ROUND(COALESCE(SUM(dp.importe_total), 0)::NUMERIC, 2)                  AS monto_total,
                TO_CHAR(MIN(dp.fecha_transaccion), 'HH24:MI')                          AS hora_inicio,
                TO_CHAR(MAX(dp.fecha_transaccion), 'HH24:MI')                          AS hora_ultimo,
                ROUND(EXTRACT(EPOCH FROM (MAX(dp.fecha_transaccion)
                    - MIN(dp.fecha_transaccion))) / 60)                                AS minutos_trabajados
            FROM dual.dim_preventa dp
            LEFT JOIN dw.dim_vendedor dv ON dv.vendedor_codigo_erp = dp.codigo_usuario
                AND dv.es_vendedor_actual = TRUE
            LEFT JOIN vendedor_rutas vr ON vr.nombre_usuario = dp.nombre_usuario
            LEFT JOIN vendedor_clientes_total vtc ON vtc.nombre_usuario = dp.nombre_usuario
            WHERE dp.fecha_transaccion::date BETWEEN %s AND %s
              AND ({ciudad_cond}) {canal_cond} {supervisor_cond}
            GROUP BY dp.nombre_usuario, vr.rutas_concat, vtc.total_clientes
            ORDER BY monto_total DESC
        """
        _, rows = _run_dw_query(sql, params)
        data = [
            {
                'vendedor':           r['vendedor'],
                'ruta':               r['ruta'],
                'supervisor':         r['supervisor'],
                'total_clientes':     r['total_clientes'] or 0,
                'pedidos':            r['pedidos'],
                'pct_efectividad':    float(r['pct_efectividad']) if r.get('pct_efectividad') is not None else None,
                'monto_total':        float(r['monto_total'] or 0),
                'hora_inicio':        r.get('hora_inicio'),
                'hora_ultimo':        r.get('hora_ultimo'),
                'minutos_trabajados': int(r['minutos_trabajados']) if r.get('minutos_trabajados') is not None else None,
            }
            for r in rows
        ]
        return JsonResponse({'success': True, 'data': data})
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


@api_view(['GET'])
@authentication_classes([ExpiringTokenAuthentication])
@permission_classes([IsAuthenticated])
@_require_perm('preventas-realizadas')
def dashboard_preventas_top_faltantes(request):
    try:
        is_admin = _is_admin(request.user)
        profile  = _get_or_create_profile(request.user)
        if is_admin:
            regional_key = request.GET.get('regional', 'santa_cruz').lower().replace(' ', '_')
            canal        = _safe_str(request.GET.get('canal', ''))
        else:
            regional_key = _REGIONAL_NAME_TO_KEY.get(profile.regional, 'santa_cruz')
            canal        = profile.canal.strip()
        fecha_desde, fecha_hasta = _preventas_fecha_rango(request)
        supervisor = _safe_str(request.GET.get('supervisor', ''))
        if regional_key not in REGIONALES_VALID:
            return JsonResponse({'success': False, 'error': 'Regional inválida'}, status=400)
        ciudad_cond     = _regional_filter(regional_key, campo='dv.ciudad')
        canal_cond      = "AND dv.canal_rrhh = %s" if canal else ""
        supervisor_cond = "AND UPPER(dv.supervisor) = UPPER(%s)" if supervisor else ""
        params = [fecha_desde, fecha_hasta] + ([canal] if canal else []) + ([supervisor] if supervisor else [])
        sql = f"""
            SELECT
                dp.cod_producto                                                    AS codigo,
                dp.nombre_producto                                                 AS producto,
                COALESCE(SUM(dp.cantidad), 0)                                      AS cant_pedida,
                COALESCE(SUM(CASE WHEN dp.estado = true  THEN dp.cantidad ELSE 0 END), 0) AS cant_atendida,
                COALESCE(SUM(CASE WHEN dp.estado = false THEN dp.cantidad ELSE 0 END), 0) AS cant_faltante,
                ROUND(
                    SUM(CASE WHEN dp.estado = true THEN dp.cantidad ELSE 0 END)
                    / NULLIF(SUM(dp.cantidad), 0) * 100
                , 1) AS ns_pct
            FROM dual.dim_preventa dp
            LEFT JOIN dw.dim_vendedor dv ON dv.vendedor_codigo_erp = dp.codigo_usuario
                AND dv.es_vendedor_actual = TRUE
            WHERE dp.fecha_transaccion::date BETWEEN %s AND %s
              AND ({ciudad_cond}) {canal_cond} {supervisor_cond}
            GROUP BY dp.cod_producto, dp.nombre_producto
            HAVING SUM(CASE WHEN dp.estado = false THEN dp.cantidad ELSE 0 END) > 0
            ORDER BY cant_faltante DESC
            LIMIT 20
        """
        _, rows = _run_dw_query(sql, params)
        data = [
            {
                'codigo':       r['codigo'],
                'producto':     r['producto'],
                'linea':        '',
                'cant_pedida':  float(r['cant_pedida'] or 0),
                'cant_atendida':float(r['cant_atendida'] or 0),
                'cant_faltante':float(r['cant_faltante'] or 0),
                'ns_pct':       float(r['ns_pct']) if r.get('ns_pct') is not None else None,
            }
            for r in rows
        ]
        return JsonResponse({'success': True, 'data': data})
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


@api_view(['GET'])
@authentication_classes([ExpiringTokenAuthentication])
@permission_classes([IsAuthenticated])
@_require_perm('preventas-realizadas')
def dashboard_preventas_supervisores_lista(request):
    try:
        is_admin = _is_admin(request.user)
        profile  = _get_or_create_profile(request.user)
        if is_admin:
            regional_key = request.GET.get('regional', 'santa_cruz').lower().replace(' ', '_')
            canal        = _safe_str(request.GET.get('canal', ''))
        else:
            regional_key = _REGIONAL_NAME_TO_KEY.get(profile.regional, 'santa_cruz')
            canal        = profile.canal.strip()
        fecha_desde, fecha_hasta = _preventas_fecha_rango(request)
        if regional_key not in REGIONALES_VALID:
            return JsonResponse({'success': False, 'error': 'Regional inválida'}, status=400)
        ciudad_cond = _regional_filter(regional_key, campo='dv.ciudad')
        canal_cond  = "AND dv.canal_rrhh = %s" if canal else ""
        params      = [fecha_desde, fecha_hasta] + ([canal] if canal else [])
        sql = f"""
            SELECT DISTINCT dv.supervisor
            FROM dual.dim_preventa dp
            LEFT JOIN dw.dim_vendedor dv ON dv.vendedor_codigo_erp = dp.codigo_usuario
                AND dv.es_vendedor_actual = TRUE
            WHERE dp.fecha_transaccion::date BETWEEN %s AND %s
              AND ({ciudad_cond}) {canal_cond}
              AND dv.supervisor IS NOT NULL AND dv.supervisor != ''
            ORDER BY dv.supervisor
        """
        _, rows = _run_dw_query(sql, params)
        return JsonResponse({'success': True, 'data': [r['supervisor'] for r in rows]})
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


# ─────────────────────────────────────────
#  DASHBOARD UNIDADES VENDIDAS
# ─────────────────────────────────────────

_UNIDADES_CAT_LINEA = {
    'Alimentos':            'ALIMENTOS',
    'Apego':                'APEGO',
    'Licores':              'BEBIDAS ALC',
    'Home & Personal Care': 'HOME Y PERSONAL CARE',
    'Sin Clasificar':       None,   # linea IS NULL OR linea = 'SIN LINEA'
}

_SIN_CLASIFICAR_COND = "(dp.linea = 'SIN LINEA' OR dp.linea IS NULL)"


def _unidades_cat_params(categoria, base_params):
    """Returns (cat_cond_sql, params_extended)."""
    if categoria and categoria in _UNIDADES_CAT_LINEA:
        if categoria == 'Sin Clasificar':
            return f"AND {_SIN_CLASIFICAR_COND}", list(base_params)
        return "AND dp.linea = %s", list(base_params) + [_UNIDADES_CAT_LINEA[categoria]]
    return "", list(base_params)


@api_view(['GET'])
@authentication_classes([ExpiringTokenAuthentication])
@permission_classes([IsAuthenticated])
@_require_perm('unidades-vendidas')
def dashboard_unidades_kpis(request):
    """KPI totales: cantidad, venta_neta, presupuesto. Params: regional, canal, categoria, anho, mes."""
    try:
        regional  = request.GET.get('regional', 'santa_cruz').lower().replace(' ', '_')
        canal     = _safe_str(request.GET.get('canal', ''))
        categoria = _safe_str(request.GET.get('categoria', ''))
        anho      = _safe_int(request.GET.get('anho'), datetime.now().year)
        mes       = _safe_int(request.GET.get('mes'),  datetime.now().month)
        if regional not in REGIONALES_VALID:
            return JsonResponse({'success': False, 'error': 'Regional inválida'}, status=400)

        ciudad_cond = _regional_filter(regional)
        canal_cond  = "AND dv.canal_rrhh = %s" if canal else ""
        base_params = [anho, mes] + ([canal] if canal else [])
        cat_cond, params_v = _unidades_cat_params(categoria, base_params)

        sql_v = f"""
            SELECT
                COALESCE(SUM(fv.cantidad), 0)   AS total_cantidad,
                COALESCE(SUM(fv.venta_neta), 0) AS total_venta_neta
            FROM dw.fact_ventas fv
            JOIN dw.dim_fecha    df ON fv.fecha_sk    = df.fecha_sk
            JOIN dw.dim_vendedor dv ON fv.vendedor_sk = dv.vendedor_sk
            JOIN dw.dim_producto dp ON fv.producto_sk = dp.producto_sk
            WHERE df.anho = %s AND df.mes_numero = %s
              AND ({ciudad_cond}) {canal_cond} {cat_cond}
        """
        _, v_rows = _run_dw_query(sql_v, params_v)

        ppto_cat_cond, params_p = _unidades_cat_params(categoria, base_params)
        sql_p = f"""
            SELECT COALESCE(SUM(fp.venta_neta_presupuestada), 0) AS total_ppto
            FROM dw.fact_presupuesto fp
            JOIN dw.dim_vendedor             dv  ON fp.vendedor_sk = dv.vendedor_sk
            JOIN dw.dim_producto             dp  ON fp.producto_sk = dp.producto_sk
            WHERE fp.anho = %s AND fp.mes = %s
              AND ({ciudad_cond}) {canal_cond} {ppto_cat_cond}
              AND fp.version_sk = (SELECT MAX(version_sk) FROM dw.dim_presupuesto_version WHERE anho = %s AND mes = %s)
        """
        p_rows = []
        try:
            _, p_rows = _run_dw_query(sql_p, params_p + [anho, mes])
        except Exception:
            pass

        sql_fc = f"""
            SELECT MAX(df.fecha_completa) AS fc
            FROM dw.fact_ventas fv
            JOIN dw.dim_fecha    df ON fv.fecha_sk    = df.fecha_sk
            JOIN dw.dim_vendedor dv ON fv.vendedor_sk = dv.vendedor_sk
            WHERE df.anho = %s AND df.mes_numero = %s
              AND ({ciudad_cond}) {canal_cond}
        """
        _, fc_rows = _run_dw_query(sql_fc, [anho, mes] + ([canal] if canal else []))

        total_cant  = int(v_rows[0]['total_cantidad'] or 0)    if v_rows else 0
        total_vn    = float(v_rows[0]['total_venta_neta'] or 0) if v_rows else 0
        total_ppto  = float(p_rows[0]['total_ppto'] or 0)      if p_rows else 0
        fecha_corte = str(fc_rows[0]['fc']) if fc_rows and fc_rows[0]['fc'] else None

        return JsonResponse({
            'success':          True,
            'total_cantidad':   total_cant,
            'total_venta_neta': total_vn,
            'total_ppto':       total_ppto,
            'total_pct':        round(total_vn / total_ppto * 100, 1) if total_ppto > 0 else None,
            'fecha_corte':      fecha_corte,
        })
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


@api_view(['GET'])
@authentication_classes([ExpiringTokenAuthentication])
@permission_classes([IsAuthenticated])
@_require_any_perm('unidades-vendidas', 'unidades-supervisores')
def dashboard_unidades_por_subgrupo(request):
    """
    Ventas+presupuesto agrupados por subgrupo dentro de la categoría seleccionada.
    Params: regional, canal, categoria (requerido), anho, mes
    """
    try:
        regional  = request.GET.get('regional', 'santa_cruz').lower().replace(' ', '_')
        canal     = _safe_str(request.GET.get('canal', ''))
        categoria = _safe_str(request.GET.get('categoria', ''))
        anho      = _safe_int(request.GET.get('anho'), datetime.now().year)
        mes       = _safe_int(request.GET.get('mes'),  datetime.now().month)
        if regional not in REGIONALES_VALID:
            return JsonResponse({'success': False, 'error': 'Regional inválida'}, status=400)
        if not categoria or categoria not in _UNIDADES_CAT_LINEA:
            return JsonResponse({'success': False, 'error': 'Categoría inválida'}, status=400)

        ciudad_cond  = _regional_filter(regional)
        canal_cond   = "AND dv.canal_rrhh = %s" if canal else ""
        base_params  = [anho, mes] + ([canal] if canal else [])
        cat_cond, params = _unidades_cat_params(categoria, base_params)

        sql_v = f"""
            SELECT
                COALESCE(dp.subgrupo_descripcion, 'Sin Subgrupo') AS subgrupo,
                COALESCE(SUM(fv.cantidad), 0)                      AS cantidad,
                COALESCE(SUM(fv.venta_neta), 0)                    AS venta_neta
            FROM dw.fact_ventas fv
            JOIN dw.dim_fecha    df   ON fv.fecha_sk    = df.fecha_sk
            JOIN dw.dim_vendedor dv   ON fv.vendedor_sk = dv.vendedor_sk
            JOIN dw.dim_producto dp   ON fv.producto_sk = dp.producto_sk
            WHERE df.anho = %s AND df.mes_numero = %s
              AND ({ciudad_cond}) {canal_cond} {cat_cond}
            GROUP BY dp.subgrupo_descripcion
            ORDER BY venta_neta DESC
        """
        _, v_rows = _run_dw_query(sql_v, params)

        ppto_map = {}
        try:
            ppto_cat_cond, params_p = _unidades_cat_params(categoria, base_params)
            sql_p = f"""
                SELECT
                    COALESCE(dp.subgrupo_descripcion, 'Sin Subgrupo') AS subgrupo,
                    COALESCE(SUM(fp.venta_neta_presupuestada), 0)     AS presupuesto,
                    COALESCE(SUM(fp.cantidad_presupuestada), 0)        AS presupuesto_uds
                FROM dw.fact_presupuesto fp
                JOIN dw.dim_vendedor             dv  ON fp.vendedor_sk = dv.vendedor_sk
                JOIN dw.dim_producto             dp  ON fp.producto_sk = dp.producto_sk
                WHERE fp.anho = %s AND fp.mes = %s
                  AND ({ciudad_cond}) {canal_cond} {ppto_cat_cond}
                  AND fp.version_sk = (SELECT MAX(version_sk) FROM dw.dim_presupuesto_version WHERE anho = %s AND mes = %s)
                GROUP BY dp.subgrupo_descripcion
            """
            _, p_rows = _run_dw_query(sql_p, params_p + [anho, mes])
            ppto_map = {
                r['subgrupo']: (float(r['presupuesto'] or 0), float(r['presupuesto_uds'] or 0))
                for r in p_rows
            }
        except Exception:
            pass

        result = []
        for row in v_rows:
            sg        = row['subgrupo']
            vn        = float(row['venta_neta'] or 0)
            cant      = int(row['cantidad'] or 0)
            ppto, ppto_uds = ppto_map.get(sg, (0, 0))
            result.append({
                'subgrupo':       sg,
                'cantidad':       cant,
                'venta_neta':     vn,
                'presupuesto':    ppto,
                'presupuesto_uds': int(ppto_uds),
                'porcentaje':     round(vn   / ppto     * 100, 1) if ppto     > 0 else None,
                'porcentaje_uds': round(cant / ppto_uds * 100, 1) if ppto_uds > 0 else None,
            })
        return JsonResponse({'success': True, 'data': result})
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


@api_view(['GET'])
@authentication_classes([ExpiringTokenAuthentication])
@permission_classes([IsAuthenticated])
@_require_perm('unidades-vendidas')
def dashboard_unidades_por_sku(request):
    """
    SKU-level data filtrado por categoría + subgrupo.
    Params: regional, canal, categoria, subgrupo, anho, mes, limit
    """
    try:
        regional  = request.GET.get('regional', 'santa_cruz').lower().replace(' ', '_')
        canal     = _safe_str(request.GET.get('canal', ''))
        categoria = _safe_str(request.GET.get('categoria', ''))
        subgrupo  = _safe_str(request.GET.get('subgrupo', ''))
        anho      = _safe_int(request.GET.get('anho'), datetime.now().year)
        mes       = _safe_int(request.GET.get('mes'),  datetime.now().month)
        limit     = min(_safe_int(request.GET.get('limit'), 500), 1000)
        if regional not in REGIONALES_VALID:
            return JsonResponse({'success': False, 'error': 'Regional inválida'}, status=400)

        ciudad_cond  = _regional_filter(regional)
        canal_cond   = "AND dv.canal_rrhh = %s" if canal else ""
        base_params  = [anho, mes] + ([canal] if canal else [])
        cat_cond, cat_params = _unidades_cat_params(categoria, base_params)
        sub_cond   = "AND dp.subgrupo_descripcion = %s" if subgrupo else ""
        sub_extra  = [subgrupo] if subgrupo else []

        params_v    = cat_params + sub_extra + [limit]
        params_ppto = cat_params + sub_extra

        sql_v = f"""
            SELECT
                dp.producto_codigo_erp          AS codigo,
                dp.producto_nombre              AS producto,
                COALESCE(SUM(fv.cantidad), 0)   AS cantidad,
                COALESCE(SUM(fv.venta_neta), 0) AS venta_neta
            FROM dw.fact_ventas fv
            JOIN dw.dim_fecha    df   ON fv.fecha_sk    = df.fecha_sk
            JOIN dw.dim_vendedor dv   ON fv.vendedor_sk = dv.vendedor_sk
            JOIN dw.dim_producto dp   ON fv.producto_sk = dp.producto_sk
            WHERE df.anho = %s AND df.mes_numero = %s
              AND ({ciudad_cond}) {canal_cond} {cat_cond} {sub_cond}
            GROUP BY dp.producto_codigo_erp, dp.producto_nombre
            ORDER BY venta_neta DESC
            LIMIT %s
        """
        _, v_rows = _run_dw_query(sql_v, params_v)

        ppto_map = {}
        try:
            sql_p = f"""
                SELECT
                    dp.producto_codigo_erp                        AS codigo,
                    COALESCE(SUM(fp.venta_neta_presupuestada), 0) AS presupuesto,
                    COALESCE(SUM(fp.cantidad_presupuestada), 0)   AS presupuesto_uds
                FROM dw.fact_presupuesto fp
                JOIN dw.dim_vendedor             dv  ON fp.vendedor_sk = dv.vendedor_sk
                JOIN dw.dim_producto             dp  ON fp.producto_sk = dp.producto_sk
                WHERE fp.anho = %s AND fp.mes = %s
                  AND ({ciudad_cond}) {canal_cond} {cat_cond} {sub_cond}
                  AND fp.version_sk = (SELECT MAX(version_sk) FROM dw.dim_presupuesto_version WHERE anho = %s AND mes = %s)
                GROUP BY dp.producto_codigo_erp
            """
            _, p_rows = _run_dw_query(sql_p, params_ppto + [anho, mes])
            ppto_map = {r['codigo']: r for r in p_rows}
        except Exception:
            pass

        result = []
        for row in v_rows:
            vn       = float(row['venta_neta'] or 0)
            cant     = int(row['cantidad'] or 0)
            p        = ppto_map.get(row['codigo'], {})
            ppto_bs  = float(p.get('presupuesto',     0) or 0)
            ppto_uds = float(p.get('presupuesto_uds', 0) or 0)
            result.append({
                'codigo':          row['codigo'],
                'producto':        row['producto'],
                'cantidad':        cant,
                'venta_neta':      vn,
                'presupuesto':     ppto_bs,
                'presupuesto_uds': int(ppto_uds),
                'porcentaje':      round(vn   / ppto_bs  * 100, 1) if ppto_bs  > 0 else None,
                'porcentaje_uds':  round(cant / ppto_uds * 100, 1) if ppto_uds > 0 else None,
            })
        return JsonResponse({'success': True, 'data': result})
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


@api_view(['GET'])
@authentication_classes([ExpiringTokenAuthentication])
@permission_classes([IsAuthenticated])
@_require_any_perm('unidades-vendidas', 'unidades-supervisores')
def dashboard_unidades_vendedor_sku(request):
    """
    SKUs vendidos por un vendedor específico, filtrado por categoría y opcionalmente subgrupo.
    Params: regional, canal, vendedor_sk (int), categoria, subgrupo, anho, mes, limit
    """
    try:
        regional    = request.GET.get('regional', 'santa_cruz').lower().replace(' ', '_')
        canal       = _safe_str(request.GET.get('canal', ''))
        vendedor_sk = _safe_str(request.GET.get('vendedor_sk', ''))
        categoria   = _safe_str(request.GET.get('categoria', ''))
        subgrupo    = _safe_str(request.GET.get('subgrupo', ''))
        anho        = _safe_int(request.GET.get('anho'), datetime.now().year)
        mes         = _safe_int(request.GET.get('mes'),  datetime.now().month)
        limit       = min(_safe_int(request.GET.get('limit'), 300), 500)

        if regional not in REGIONALES_VALID:
            return JsonResponse({'success': False, 'error': 'Regional inválida'}, status=400)
        if not vendedor_sk:
            return JsonResponse({'success': False, 'error': 'vendedor_sk requerido'}, status=400)

        ciudad_cond = _regional_filter(regional)
        canal_cond  = "AND dv.canal_rrhh = %s" if canal else ""
        base_params = [anho, mes] + ([canal] if canal else [])
        cat_cond, params_v = _unidades_cat_params(categoria, base_params)
        sub_cond = ""
        if subgrupo:
            sub_cond = "AND dp.subgrupo_descripcion = %s"
            params_v = params_v + [subgrupo]
        params_v = params_v + [int(vendedor_sk), limit]

        sql_v = f"""
            SELECT
                dp.producto_codigo_erp          AS codigo,
                dp.producto_nombre              AS producto,
                COALESCE(SUM(fv.cantidad), 0)   AS cantidad,
                COALESCE(SUM(fv.venta_neta), 0) AS venta_neta
            FROM dw.fact_ventas fv
            JOIN dw.dim_fecha    df   ON fv.fecha_sk    = df.fecha_sk
            JOIN dw.dim_vendedor dv   ON fv.vendedor_sk = dv.vendedor_sk
            JOIN dw.dim_producto dp   ON fv.producto_sk = dp.producto_sk
            WHERE df.anho = %s AND df.mes_numero = %s
              AND ({ciudad_cond}) {canal_cond} {cat_cond} {sub_cond}
              AND dv.vendedor_sk = %s
            GROUP BY dp.producto_codigo_erp, dp.producto_nombre
            ORDER BY cantidad DESC
            LIMIT %s
        """
        _, v_rows = _run_dw_query(sql_v, params_v)

        # Presupuesto por SKU para este vendedor
        ppto_map = {}
        try:
            sql_p = f"""
                SELECT
                    dp.producto_codigo_erp                            AS codigo,
                    COALESCE(SUM(fp.venta_neta_presupuestada), 0)     AS presupuesto,
                    COALESCE(SUM(fp.cantidad_presupuestada), 0)        AS presupuesto_uds
                FROM dw.fact_presupuesto fp
                JOIN dw.dim_producto             dp  ON fp.producto_sk = dp.producto_sk
                WHERE fp.anho = %s AND fp.mes = %s
                  AND fp.vendedor_sk = %s
                  AND fp.version_sk = (SELECT MAX(version_sk) FROM dw.dim_presupuesto_version WHERE anho = %s AND mes = %s)
                GROUP BY dp.producto_codigo_erp
            """
            _, p_rows = _run_dw_query(sql_p, [anho, mes, int(vendedor_sk), anho, mes])
            ppto_map = {
                r['codigo']: (float(r['presupuesto'] or 0), float(r['presupuesto_uds'] or 0))
                for r in p_rows
            }
        except Exception:
            pass

        result = []
        for row in v_rows:
            cod  = row['codigo']
            cant = int(row['cantidad'] or 0)
            vn   = float(row['venta_neta'] or 0)
            ppto, ppto_uds = ppto_map.get(cod, (0, 0))
            result.append({
                'codigo':          cod,
                'producto':        row['producto'],
                'cantidad':        cant,
                'venta_neta':      vn,
                'presupuesto':     ppto,
                'presupuesto_uds': int(ppto_uds),
                'porcentaje':      round(vn   / ppto     * 100, 1) if ppto     > 0 else None,
                'porcentaje_uds':  round(cant / ppto_uds * 100, 1) if ppto_uds > 0 else None,
            })
        return JsonResponse({'success': True, 'data': result})
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


@api_view(['GET'])
@authentication_classes([ExpiringTokenAuthentication])
@permission_classes([IsAuthenticated])
@_require_perm('unidades-vendidas')
def dashboard_unidades_por_vendedor(request):
    """
    Vendedores que vendieron en una sub-categoría (o categoría) dada.
    Params: regional, canal, categoria, subgrupo, anho, mes
    """
    try:
        regional  = request.GET.get('regional', 'santa_cruz').lower().replace(' ', '_')
        canal     = _safe_str(request.GET.get('canal', ''))
        categoria = _safe_str(request.GET.get('categoria', ''))
        subgrupo  = _safe_str(request.GET.get('subgrupo', ''))
        anho      = _safe_int(request.GET.get('anho'), datetime.now().year)
        mes       = _safe_int(request.GET.get('mes'),  datetime.now().month)
        if regional not in REGIONALES_VALID:
            return JsonResponse({'success': False, 'error': 'Regional inválida'}, status=400)

        ciudad_cond = _regional_filter(regional)
        canal_cond  = "AND dv.canal_rrhh = %s" if canal else ""
        base_params = [anho, mes] + ([canal] if canal else [])
        cat_cond, params = _unidades_cat_params(categoria, base_params)
        sub_cond = ""
        if subgrupo:
            sub_cond = "AND dp.subgrupo_descripcion = %s"
            params = params + [subgrupo]

        sql = f"""
            SELECT
                dv.vendedor_sk,
                dv.vendedor_nombre                 AS vendedor,
                COALESCE(SUM(fv.cantidad), 0)      AS cantidad,
                COALESCE(SUM(fv.venta_neta), 0)    AS venta_neta
            FROM dw.fact_ventas fv
            JOIN dw.dim_fecha    df   ON fv.fecha_sk    = df.fecha_sk
            JOIN dw.dim_vendedor dv   ON fv.vendedor_sk = dv.vendedor_sk
            JOIN dw.dim_producto dp   ON fv.producto_sk = dp.producto_sk
            WHERE df.anho = %s AND df.mes_numero = %s
              AND ({ciudad_cond}) {canal_cond} {cat_cond} {sub_cond}
            GROUP BY dv.vendedor_sk, dv.vendedor_nombre
            ORDER BY cantidad DESC
        """
        _, rows = _run_dw_query(sql, params)
        result = [
            {
                'vendedor_sk': r['vendedor_sk'],
                'vendedor':    r['vendedor'],
                'cantidad':    int(r['cantidad'] or 0),
                'venta_neta':  float(r['venta_neta'] or 0),
            }
            for r in rows
        ]
        return JsonResponse({'success': True, 'data': result})
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


# ─────────────────────────────────────────
#  DASHBOARD – PROVEEDORES
# ─────────────────────────────────────────

_PROV_PERM_MAP = {
    'PEPSICO': 'pepsico',
    'SOFTYS':  'softys',
    'DMUJER':  'dmujer',
    'APEGO':   'apego',
    'COLHER':  'colher',
}


def _check_proveedor_perm(request, proveedor):
    """Verifica que el usuario tenga permiso para el dashboard del proveedor."""
    perm_id = _PROV_PERM_MAP.get(proveedor.upper())
    if not perm_id:
        return False
    return _has_dashboard_perm(request.user, perm_id)


@api_view(['GET'])
@authentication_classes([ExpiringTokenAuthentication])
@permission_classes([IsAuthenticated])
def dashboard_proveedor_kpis(request):
    """Total ventas + desglose por regional para un proveedor. Params: proveedor, anho, mes."""
    try:
        proveedor = _safe_str(request.GET.get('proveedor', ''), 50).upper()
        anho      = _safe_int(request.GET.get('anho'), datetime.now().year)
        mes       = _safe_int(request.GET.get('mes'),  datetime.now().month)

        if not proveedor:
            return JsonResponse({'success': False, 'error': 'Parámetro proveedor requerido'}, status=400)
        if not _check_proveedor_perm(request, proveedor):
            return JsonResponse({'success': False, 'error': 'Sin acceso a este dashboard'}, status=403)

        sql_total = """
            SELECT COALESCE(SUM(fv.total), 0)              AS total,
                   COUNT(DISTINCT fv.numero_venta)         AS pedidos,
                   COUNT(DISTINCT fv.cliente_sk)           AS clientes
            FROM dw.fact_ventas fv
            JOIN dw.dim_producto dp ON dp.producto_sk = fv.producto_sk
            JOIN dw.dim_fecha    df ON df.fecha_sk    = fv.fecha_sk
            WHERE df.anho = %s AND df.mes_numero = %s AND dp.proveedor = %s
        """
        _, rows_total = _run_dw_query(sql_total, [anho, mes, proveedor])

        scz  = _ciudad_case('dv.ciudad', 'santa_cruz')
        cbba = _ciudad_case('dv.ciudad', 'cochabamba')
        lpz  = _ciudad_case('dv.ciudad', 'la_paz')
        sql_reg = f"""
            SELECT
                CASE
                    WHEN {scz}  THEN 'Santa Cruz'
                    WHEN {cbba} THEN 'Cochabamba'
                    WHEN {lpz}  THEN 'La Paz'
                    ELSE 'Otras'
                END                              AS regional,
                COALESCE(SUM(fv.total), 0)       AS total
            FROM dw.fact_ventas fv
            JOIN dw.dim_producto dp ON dp.producto_sk = fv.producto_sk
            JOIN dw.dim_fecha    df ON df.fecha_sk    = fv.fecha_sk
            JOIN dw.dim_vendedor dv ON dv.vendedor_sk = fv.vendedor_sk
            WHERE df.anho = %s AND df.mes_numero = %s AND dp.proveedor = %s
            GROUP BY regional ORDER BY total DESC
        """
        _, rows_reg = _run_dw_query(sql_reg, [anho, mes, proveedor])

        kpis = rows_total[0] if rows_total else {'total': 0, 'pedidos': 0, 'clientes': 0}
        return JsonResponse({'success': True, 'data': {
            'total':      float(kpis.get('total', 0) or 0),
            'pedidos':    int(kpis.get('pedidos', 0) or 0),
            'clientes':   int(kpis.get('clientes', 0) or 0),
            'regionales': rows_reg,
        }})
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


@api_view(['GET'])
@authentication_classes([ExpiringTokenAuthentication])
@permission_classes([IsAuthenticated])
def dashboard_proveedor_por_marca(request):
    """Ventas por articulo (producto_nombre). Params: proveedor, anho, mes."""
    try:
        proveedor = _safe_str(request.GET.get('proveedor', ''), 50).upper()
        anho      = _safe_int(request.GET.get('anho'), datetime.now().year)
        mes       = _safe_int(request.GET.get('mes'),  datetime.now().month)

        if not proveedor:
            return JsonResponse({'success': False, 'error': 'Parámetro proveedor requerido'}, status=400)
        if not _check_proveedor_perm(request, proveedor):
            return JsonResponse({'success': False, 'error': 'Sin acceso a este dashboard'}, status=403)

        sql = """
            SELECT dv.canal                            AS marca,
                   COALESCE(SUM(fv.total), 0)          AS total,
                   COALESCE(SUM(fv.cantidad), 0)       AS cantidad
            FROM dw.fact_ventas fv
            JOIN dw.dim_producto dp ON dp.producto_sk = fv.producto_sk
            JOIN dw.dim_vendedor dv ON dv.vendedor_sk = fv.vendedor_sk
            JOIN dw.dim_fecha    df ON df.fecha_sk    = fv.fecha_sk
            WHERE df.anho = %s AND df.mes_numero = %s AND dp.proveedor = %s
            GROUP BY dv.canal
            ORDER BY total DESC
        """
        _, rows = _run_dw_query(sql, [anho, mes, proveedor])
        return JsonResponse({'success': True, 'data': rows})
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


@api_view(['GET'])
@authentication_classes([ExpiringTokenAuthentication])
@permission_classes([IsAuthenticated])
def dashboard_proveedor_tabla(request):
    """Detalle completo de ventas por proveedor. Params: proveedor, anho, mes."""
    try:
        proveedor = _safe_str(request.GET.get('proveedor', ''), 50).upper()
        anho      = _safe_int(request.GET.get('anho'), datetime.now().year)
        mes       = _safe_int(request.GET.get('mes'),  datetime.now().month)

        if not proveedor:
            return JsonResponse({'success': False, 'error': 'Parámetro proveedor requerido'}, status=400)
        if not _check_proveedor_perm(request, proveedor):
            return JsonResponse({'success': False, 'error': 'Sin acceso a este dashboard'}, status=403)

        sql = """
            SELECT
                dv.canal_rrhh AS canal,
                da.ciudad,
                df.mes_nombre,
                dp.proveedor,
                dp.cat_comercial    AS marca,
                fv.numero_venta,
                df.fecha_completa,
                dc.cliente_codigo_erp,
                dp.grupo_descripcion,
                dp.clase_descripcion,
                dp.producto_nombre,
                dp.unidad_medida,
                fv.cantidad,
                fv.total,
                dv.vendedor_nombre
            FROM dw.fact_ventas fv
            JOIN dw.dim_vendedor dv ON dv.vendedor_sk = fv.vendedor_sk
            JOIN dw.dim_producto dp ON dp.producto_sk = fv.producto_sk
            JOIN dw.dim_almacen  da ON da.almacen_sk  = fv.almacen_sk
            JOIN dw.dim_cliente  dc ON dc.cliente_sk  = fv.cliente_sk
            JOIN dw.dim_fecha    df ON df.fecha_sk    = fv.fecha_sk
            WHERE df.anho = %s AND df.mes_numero = %s AND dp.proveedor = %s
            ORDER BY fv.numero_venta, dp.producto_nombre
        """
        _, rows = _run_dw_query(sql, [anho, mes, proveedor])
        return JsonResponse({'success': True, 'data': rows})
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


# ─────────────────────────────────────────
#  EXPORTACIONES XLSX
# ─────────────────────────────────────────

_XLSX_HEADERS = [
    "No.Venta", "Fecha", "Cliente", "Nombre Cliente",
    "Grupo", "Descripcion Grupo",
    "SubGrupo", "Descripcion SubGrupo",
    "Clase", "Descripcion Clase",
    "SubClase", "Descripcion SubClase",
    "Articulo", "Descripcion Articulo",
    "U/M", "Cantidad", "Precio", "SubTotal", "Descuento", "Total",
    "Local", "Descripcion Local",
    "Almacen", "Descripcion Almacen",
    "Ruta", "Descripcion Ruta",
    "Vendedor", "Descripcion Vendedor",
    "Distribuidor", "Descripcion Distribuidor",
    "Zona", "Descripcion Zona",
    "Componente", "ICE", "Venta Neta", "Pago",
    "Exhibidor", "Clase", "Ruta", "Punto Frio",
]


def exportar_ventas_combo_armado(request):
    """
    Exporta ventas a XLSX. Acepta token via header Authorization o query param _t.
    Params: fecha_desde (YYYY-MM-DD), fecha_hasta (YYYY-MM-DD)
    """
    token_str = ""
    auth_header = request.META.get("HTTP_AUTHORIZATION", "")
    if auth_header.startswith("Token "):
        token_str = auth_header[6:]
    else:
        token_str = request.GET.get("_t", "")

    if not token_str:
        return JsonResponse({"error": "No autorizado"}, status=401)

    try:
        from rest_framework.authtoken.models import Token as DRFToken
        token_obj = DRFToken.objects.select_related("user").get(key=token_str)
        if not token_obj.user.is_active:
            return JsonResponse({"error": "Usuario inactivo"}, status=401)
    except Exception:
        return JsonResponse({"error": "Token inválido"}, status=401)

    fecha_desde = request.GET.get("fecha_desde", "")
    fecha_hasta = request.GET.get("fecha_hasta", "")

    if not fecha_desde or not fecha_hasta:
        return JsonResponse({"success": False, "error": "Parámetros fecha_desde y fecha_hasta requeridos"}, status=400)

    try:
        datetime.strptime(fecha_desde, "%Y-%m-%d")
        datetime.strptime(fecha_hasta, "%Y-%m-%d")
    except ValueError:
        return JsonResponse({"success": False, "error": "Formato de fecha inválido. Use YYYY-MM-DD"}, status=400)

    sql = """
        SELECT
            fv.numero_venta,
            fv.fecha_venta,
            dc.cliente_codigo_erp,
            COALESCE(dc.cliente_nombre, ''),
            COALESCE(dp.grupo_codigo::INTEGER, NULL),
            COALESCE(dp.grupo_descripcion, ''),
            COALESCE(dp.subgrupo_codigo::INTEGER, NULL),
            COALESCE(dp.subgrupo_descripcion, ''),
            COALESCE(dp.clase_codigo::INTEGER, NULL),
            COALESCE(dp.clase_descripcion, ''),
            COALESCE(dp.subclase_codigo::INTEGER, NULL),
            COALESCE(dp.subclase_descripcion, ''),
            dp.producto_codigo_erp,
            COALESCE(dp.producto_nombre, ''),
            COALESCE(dp.unidad_medida, ''),
            fv.cantidad,
            fv.precio_unitario,
            fv.subtotal,
            fv.descuento,
            fv.total,
            COALESCE(dl.local_codigo_erp::INTEGER, NULL),
            COALESCE(dl.local_nombre, ''),
            COALESCE(da.almacen_codigo_erp::INTEGER, NULL),
            COALESCE(da.almacen_nombre, ''),
            COALESCE(fv.ruta_codigo::INTEGER, NULL),
            COALESCE(fv.ruta_descripcion, ''),
            COALESCE(dv.vendedor_codigo_erp::INTEGER, NULL),
            COALESCE(dv.vendedor_nombre, ''),
            COALESCE(ddi.distribuidor_codigo_erp::INTEGER, NULL),
            COALESCE(ddi.distribuidor_nombre, ''),
            COALESCE(dz.zona_codigo_erp::INTEGER, NULL),
            COALESCE(dz.zona_descripcion, ''),
            COALESCE(dp.componente, ''),
            fv.ice,
            fv.venta_neta,
            fv.pago
        FROM dw.fact_ventas                  fv
        JOIN      dw.dim_producto        dp  ON fv.producto_sk     = dp.producto_sk
        JOIN      dw.dim_cliente         dc  ON fv.cliente_sk      = dc.cliente_sk
        LEFT JOIN dw.dim_vendedor        dv  ON fv.vendedor_sk     = dv.vendedor_sk
        LEFT JOIN dw.dim_local           dl  ON fv.local_sk        = dl.local_sk
        LEFT JOIN dw.dim_almacen         da  ON fv.almacen_sk      = da.almacen_sk
        LEFT JOIN dw.dim_distribuidor   ddi  ON fv.distribuidor_sk = ddi.distribuidor_sk
        LEFT JOIN dw.dim_zona            dz  ON fv.zona_sk         = dz.zona_sk
        WHERE SUBSTR(fv.fecha_venta, 7, 4) || '-' || SUBSTR(fv.fecha_venta, 4, 2) || '-' || SUBSTR(fv.fecha_venta, 1, 2)
              BETWEEN %s AND %s
        ORDER BY SUBSTR(fv.fecha_venta, 7, 4) || '-' || SUBSTR(fv.fecha_venta, 4, 2) || '-' || SUBSTR(fv.fecha_venta, 1, 2),
                 fv.numero_venta
    """

    wb = openpyxl.Workbook(write_only=True)
    ws = wb.create_sheet(title="Ventas Combo Armado")

    bold = Font(bold=True)
    header_row = []
    for h in _XLSX_HEADERS:
        c = openpyxl.cell.WriteOnlyCell(ws, value=h)
        c.font = bold
        header_row.append(c)
    ws.append(header_row)

    try:
        with connections['dw'].cursor() as cursor:
            cursor.execute(sql, [fecha_desde, fecha_hasta])
            while True:
                batch = cursor.fetchmany(2000)
                if not batch:
                    break
                for row in batch:
                    ws.append(list(row) + ["", "", "", ""])
    except Exception as e:
        return JsonResponse({"success": False, "error": str(e)}, status=500)

    buffer = io.BytesIO()
    wb.save(buffer)
    file_size = buffer.tell()
    buffer.seek(0)

    def _chunks(buf, size=65536):
        chunk = buf.read(size)
        while chunk:
            yield chunk
            chunk = buf.read(size)

    filename = f"ventas_combo_armado_{fecha_desde}_{fecha_hasta}.xlsx"
    response = StreamingHttpResponse(
        _chunks(buffer),
        content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    response["Content-Encoding"] = "identity"
    response["X-File-Size"] = str(file_size)
    return response


# ─────────────────────────────────────────────────────────────────────────────
#  CANALES DISPONIBLES (lista para selectores)
# ─────────────────────────────────────────────────────────────────────────────

@api_view(['GET'])
@authentication_classes([ExpiringTokenAuthentication])
@permission_classes([IsAuthenticated])
def dashboard_canales_lista(request):
    """Devuelve la lista de canal_rrhh distintos presentes en dim_vendedor."""
    cached = cache.get('canales_lista')
    if cached is not None:
        return JsonResponse({'success': True, 'data': cached})
    try:
        _, rows = _run_dw_query(
            "SELECT DISTINCT canal_rrhh FROM dw.dim_vendedor "
            "WHERE canal_rrhh IS NOT NULL ORDER BY canal_rrhh"
        )
        canales = [r['canal_rrhh'] for r in rows]
        cache.set('canales_lista', canales, 3600)
        return JsonResponse({'success': True, 'data': canales})
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


# ─────────────────────────────────────────────────────────────────────────────
#  DASHBOARD INFORMACIÓN RUTAS
# ─────────────────────────────────────────────────────────────────────────────

@api_view(['GET'])
@authentication_classes([ExpiringTokenAuthentication])
@permission_classes([IsAuthenticated])
@_require_perm('informacion-rutas')
def dashboard_marcas_lista(_request):
    """Lista de marcas activas en el DW, para filtro de cobertura."""
    try:
        sql = """
            SELECT DISTINCT dp.marca
            FROM dw.dim_producto dp
            WHERE dp.marca IS NOT NULL
              AND dp.marca != ''
            ORDER BY dp.marca
        """
        _, rows = _run_dw_query(sql, [])
        return JsonResponse({'success': True, 'data': [r['marca'] for r in rows]})
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


@api_view(['GET'])
@authentication_classes([ExpiringTokenAuthentication])
@permission_classes([IsAuthenticated])
@_require_perm('informacion-rutas')
def dashboard_informacion_rutas(request):
    """
    Tabla de rutas con cobertura del mes.
    Params: regional, canal, supervisor, dia, marca, anho, mes
    """
    is_admin = _is_admin(request.user)
    profile  = _get_or_create_profile(request.user)
    cargo    = (profile.cargo or '').strip()

    dia   = _safe_str(request.GET.get('dia',   'Todos'), 10)
    marca = _safe_str(request.GET.get('marca', ''),       80)
    anho  = _safe_int(request.GET.get('anho'), datetime.now().year)
    mes   = _safe_int(request.GET.get('mes'),  datetime.now().month)

    if is_admin:
        regional_raw = request.GET.get('regional', 'nacional').lower().replace(' ', '_')
        regional     = regional_raw if regional_raw in REGIONALES_VALID else 'nacional'
        canal        = _safe_str(request.GET.get('canal',      'Todos'), 30)
        supervisor   = _safe_str(request.GET.get('supervisor', 'Todos'), 100)
    elif cargo == 'Gerente Regional':
        regional     = _REGIONAL_NAME_TO_KEY.get(profile.regional, 'nacional')
        canal        = _safe_str(request.GET.get('canal', 'Todos'), 30)
        supervisor   = _safe_str(request.GET.get('supervisor', 'Todos'), 100)
    elif 'supervisor' in cargo.lower():
        regional     = _REGIONAL_NAME_TO_KEY.get(profile.regional, 'nacional')
        canal        = (profile.canal or '').strip()
        supervisor   = f"{profile.user.first_name} {profile.user.last_name}".strip()
    else:
        regional_raw = request.GET.get('regional', 'nacional').lower().replace(' ', '_')
        regional     = regional_raw if regional_raw in REGIONALES_VALID else 'nacional'
        canal        = _safe_str(request.GET.get('canal',      'Todos'), 30)
        supervisor   = _safe_str(request.GET.get('supervisor', 'Todos'), 100)

    ciudad_cond   = _regional_filter(regional)
    regional_cond = "" if regional == 'nacional' else f"AND ({ciudad_cond})"
    canal_cond    = "AND dv.canal_rrhh = %s"               if canal and canal != 'Todos' else ""
    dia_cond      = "AND dp.dia = %s"                      if dia != 'Todos'             else ""
    sup_cond      = "AND UPPER(dv.supervisor) = UPPER(%s)" if supervisor and supervisor != 'Todos' else ""
    marca_cond    = "AND dprod.marca = %s" if marca else ""

    params_main = [anho, mes]
    if marca:                          params_main.append(marca)
    if canal and canal != 'Todos':     params_main.append(canal)
    if dia != 'Todos':                 params_main.append(dia)
    if supervisor and supervisor != 'Todos': params_main.append(supervisor)

    try:
        sql = f"""
            WITH ventas_mes AS (
                SELECT DISTINCT fv.cliente_sk, dv2.canal_rrhh
                FROM dw.fact_ventas    fv
                JOIN dw.dim_fecha      df    ON df.fecha_sk     = fv.fecha_sk
                JOIN dw.dim_vendedor   dv2   ON dv2.vendedor_sk = fv.vendedor_sk
                JOIN dw.dim_producto   dprod ON dprod.producto_sk = fv.producto_sk
                WHERE df.anho = %s AND df.mes_numero = %s
                  {marca_cond}
            )
            SELECT
                dc.ruta,
                dp.vendedor,
                dv.supervisor,
                dp.dia,
                COUNT(DISTINCT dc.id_cliente)                                          AS total_clientes,
                COUNT(DISTINCT CASE WHEN vm.canal_rrhh = dv.canal_rrhh
                                    THEN dck.cliente_sk END)                           AS clientes_con_compra,
                ROUND(
                    COUNT(DISTINCT CASE WHEN vm.canal_rrhh = dv.canal_rrhh
                                        THEN dck.cliente_sk END)::NUMERIC
                    / NULLIF(COUNT(DISTINCT dc.id_cliente), 0) * 100
                , 1)                                                                   AS pct_cobertura
            FROM dual.dim_cliente_dual dc
            LEFT JOIN dual.dim_planificacion dp
                   ON dp.ruta = dc.ruta AND dp.es_actual = true
            LEFT JOIN dw.dim_vendedor dv
                   ON dv.vendedor_codigo_erp = SPLIT_PART(dp.codigo_erp, '.', 1)
                  AND dv.es_vendedor_actual = true
            LEFT JOIN dw.dim_cliente dck
                   ON dck.cliente_codigo_erp = dc.codigo_cliente
                  AND dck.es_cliente_actual = true
            LEFT JOIN ventas_mes vm ON vm.cliente_sk = dck.cliente_sk
            WHERE dc.es_actual = true
              {regional_cond}
              {canal_cond}
              {dia_cond}
              {sup_cond}
            GROUP BY dc.ruta, dp.vendedor, dv.supervisor, dp.dia
            ORDER BY pct_cobertura DESC NULLS LAST, dc.ruta
        """
        _, rows = _run_dw_query(sql, params_main)

        # Lista de supervisores para el filtro (no afectada por filtro de supervisor)
        params_sup = []
        if canal and canal != 'Todos': params_sup.append(canal)
        sql_sup = f"""
            SELECT DISTINCT dv.supervisor
            FROM dual.dim_planificacion dp
            JOIN dw.dim_vendedor dv
                   ON dv.vendedor_codigo_erp = SPLIT_PART(dp.codigo_erp, '.', 1)
                  AND dv.es_vendedor_actual = true
            WHERE dp.es_actual = true
              AND dv.supervisor IS NOT NULL
              {regional_cond}
              {canal_cond}
            ORDER BY dv.supervisor
        """
        _, sup_rows = _run_dw_query(sql_sup, params_sup)
        supervisores = [r['supervisor'] for r in sup_rows if r.get('supervisor')]

        return JsonResponse({'success': True, 'data': rows, 'supervisores': supervisores})
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


@api_view(['GET'])
@authentication_classes([ExpiringTokenAuthentication])
@permission_classes([IsAuthenticated])
@_require_perm('informacion-rutas')
def dashboard_informacion_rutas_detalle(request):
    """
    Ventas y pedidos semanales de una ruta específica.
    Params: ruta, canal, marca, anho, mes
    """
    ruta  = _safe_str(request.GET.get('ruta',  ''), 100)
    canal = _safe_str(request.GET.get('canal', ''), 30)
    marca = _safe_str(request.GET.get('marca', ''), 80)
    anho  = _safe_int(request.GET.get('anho'), datetime.now().year)
    mes   = _safe_int(request.GET.get('mes'),  datetime.now().month)

    if not ruta:
        return JsonResponse({'success': False, 'error': 'Parámetro ruta requerido'}, status=400)

    try:
        canal_cond = "AND dv.canal_rrhh = %s" if canal else ""
        marca_cond = "AND dp.marca = %s"       if marca else ""
        params_det = [anho, mes, ruta] + ([canal] if canal else []) + ([marca] if marca else [])
        sql = f"""
            SELECT
                CEIL(df.dia_numero / 7.0)::INT                      AS semana,
                COUNT(DISTINCT fv.numero_venta)                      AS pedidos,
                ROUND(COALESCE(SUM(fv.venta_neta), 0)::NUMERIC, 2)  AS venta_neta
            FROM dw.fact_ventas       fv
            JOIN dw.dim_fecha         df  ON df.fecha_sk    = fv.fecha_sk
            JOIN dw.dim_vendedor      dv  ON dv.vendedor_sk = fv.vendedor_sk
            JOIN dw.dim_producto      dp  ON dp.producto_sk = fv.producto_sk
            JOIN dw.dim_cliente       dck ON dck.cliente_sk = fv.cliente_sk
            JOIN dual.dim_cliente_dual dcd
                   ON dcd.codigo_cliente = dck.cliente_codigo_erp
                  AND dcd.es_actual = true
            WHERE df.anho = %s AND df.mes_numero = %s
              AND dcd.ruta = %s
              {canal_cond}
              {marca_cond}
            GROUP BY semana
            ORDER BY semana
        """
        _, rows = _run_dw_query(sql, params_det)
        return JsonResponse({'success': True, 'data': rows})
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


@api_view(['GET'])
@authentication_classes([ExpiringTokenAuthentication])
@permission_classes([IsAuthenticated])
@_require_perm('informacion-rutas')
def dashboard_informacion_rutas_categorias(request):
    """
    Ventas por categoría para una ruta, con % del total.
    Params: ruta, canal, marca, anho, mes
    """
    ruta  = _safe_str(request.GET.get('ruta',  ''), 100)
    canal = _safe_str(request.GET.get('canal', ''), 30)
    marca = _safe_str(request.GET.get('marca', ''), 80)
    anho  = _safe_int(request.GET.get('anho'), datetime.now().year)
    mes   = _safe_int(request.GET.get('mes'),  datetime.now().month)

    if not ruta:
        return JsonResponse({'success': False, 'error': 'Parámetro ruta requerido'}, status=400)

    try:
        canal_cond = "AND dv.canal_rrhh = %s" if canal else ""
        marca_cond = "AND dp.marca = %s"       if marca else ""
        params = [anho, mes, ruta] + ([canal] if canal else []) + ([marca] if marca else [])
        sql = f"""
            SELECT
                {_CATEGORIA_CASE}                                         AS categoria,
                COUNT(DISTINCT fv.numero_venta)                           AS pedidos,
                ROUND(COALESCE(SUM(fv.venta_neta), 0)::NUMERIC, 2)       AS venta_neta
            FROM dw.fact_ventas       fv
            JOIN dw.dim_fecha         df  ON df.fecha_sk    = fv.fecha_sk
            JOIN dw.dim_vendedor      dv  ON dv.vendedor_sk = fv.vendedor_sk
            JOIN dw.dim_producto      dp  ON dp.producto_sk = fv.producto_sk
            JOIN dw.dim_cliente       dck ON dck.cliente_sk = fv.cliente_sk
            JOIN dual.dim_cliente_dual dcd
                   ON dcd.codigo_cliente = dck.cliente_codigo_erp
                  AND dcd.es_actual = true
            WHERE df.anho = %s AND df.mes_numero = %s
              AND dcd.ruta = %s
              {canal_cond}
              {marca_cond}
            GROUP BY {_CATEGORIA_CASE}
            ORDER BY venta_neta DESC
        """
        _, rows = _run_dw_query(sql, params)
        total_bs = sum(float(r['venta_neta']) for r in rows)
        for r in rows:
            r['pct'] = round(float(r['venta_neta']) / total_bs * 100, 1) if total_bs > 0 else 0
        return JsonResponse({'success': True, 'data': rows})
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


@api_view(['GET'])
@authentication_classes([ExpiringTokenAuthentication])
@permission_classes([IsAuthenticated])
@_require_perm('informacion-rutas')
def dashboard_informacion_rutas_skus(request):
    """
    Top SKUs de una categoría para una ruta, con % cobertura de clientes.
    Params: ruta, canal, categoria, marca, anho, mes
    """
    ruta      = _safe_str(request.GET.get('ruta',      ''), 100)
    canal     = _safe_str(request.GET.get('canal',     ''), 30)
    categoria = _safe_str(request.GET.get('categoria', ''), 50)
    marca     = _safe_str(request.GET.get('marca',     ''), 80)
    anho      = _safe_int(request.GET.get('anho'), datetime.now().year)
    mes       = _safe_int(request.GET.get('mes'),  datetime.now().month)

    if not ruta:
        return JsonResponse({'success': False, 'error': 'Parámetro ruta requerido'}, status=400)

    canal_cond = "AND dv.canal_rrhh = %s" if canal else ""
    marca_cond = "AND dp.marca = %s"       if marca else ""

    if categoria and categoria in _UNIDADES_CAT_LINEA:
        if categoria == 'Sin Clasificar':
            cat_cond   = f"AND {_SIN_CLASIFICAR_COND}"
            cat_params = []
        else:
            cat_cond   = "AND dp.linea = %s"
            cat_params = [_UNIDADES_CAT_LINEA[categoria]]
    else:
        cat_cond   = ""
        cat_params = []

    try:
        params = [ruta, anho, mes, ruta] + ([canal] if canal else []) + ([marca] if marca else []) + cat_params
        sql = f"""
            WITH total_ruta AS (
                SELECT COUNT(DISTINCT codigo_cliente) AS n
                FROM dual.dim_cliente_dual
                WHERE es_actual = true AND ruta = %s
            )
            SELECT
                dp.producto_codigo_erp                                     AS codigo,
                dp.producto_nombre                                         AS producto,
                COUNT(DISTINCT fv.numero_venta)                            AS pedidos,
                ROUND(COALESCE(SUM(fv.venta_neta), 0)::NUMERIC, 2)        AS venta_neta,
                COUNT(DISTINCT dck.cliente_sk)                             AS clientes_con_sku,
                (SELECT n FROM total_ruta)                                 AS total_clientes,
                ROUND(
                    COUNT(DISTINCT dck.cliente_sk)::NUMERIC
                    / NULLIF((SELECT n FROM total_ruta), 0) * 100
                , 1)                                                       AS pct_cobertura
            FROM dw.fact_ventas       fv
            JOIN dw.dim_fecha         df  ON df.fecha_sk    = fv.fecha_sk
            JOIN dw.dim_vendedor      dv  ON dv.vendedor_sk = fv.vendedor_sk
            JOIN dw.dim_producto      dp  ON dp.producto_sk = fv.producto_sk
            JOIN dw.dim_cliente       dck ON dck.cliente_sk = fv.cliente_sk
            JOIN dual.dim_cliente_dual dcd
                   ON dcd.codigo_cliente = dck.cliente_codigo_erp
                  AND dcd.es_actual = true
            WHERE df.anho = %s AND df.mes_numero = %s
              AND dcd.ruta = %s
              {canal_cond}
              {marca_cond}
              {cat_cond}
            GROUP BY dp.producto_codigo_erp, dp.producto_nombre
            ORDER BY venta_neta DESC
            LIMIT 30
        """
        _, rows = _run_dw_query(sql, params)
        return JsonResponse({'success': True, 'data': rows})
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


def exportar_clientes_sin_compra(request):
    """
    Exporta a XLSX los clientes de las rutas que no compraron en el mes indicado.
    Auth: header Authorization: Token xxx
    Params: regional, canal, dia, supervisor, anho, mes
    """
    token_str = ""
    auth_header = request.META.get("HTTP_AUTHORIZATION", "")
    if auth_header.startswith("Token "):
        token_str = auth_header[6:]
    else:
        token_str = request.GET.get("_t", "")
    if not token_str:
        return JsonResponse({"error": "No autorizado"}, status=401)
    try:
        from rest_framework.authtoken.models import Token as DRFToken
        token_obj = DRFToken.objects.select_related("user").get(key=token_str)
        if not token_obj.user.is_active:
            return JsonResponse({"error": "Usuario inactivo"}, status=401)
    except Exception:
        return JsonResponse({"error": "Token inválido"}, status=401)

    regional_raw = request.GET.get('regional', 'nacional').lower().replace(' ', '_')
    regional     = regional_raw if regional_raw in REGIONALES_VALID else 'nacional'
    canal        = _safe_str(request.GET.get('canal',      'Todos'), 30)
    dia          = _safe_str(request.GET.get('dia',        'Todos'), 10)
    supervisor   = _safe_str(request.GET.get('supervisor', 'Todos'), 100)
    marca        = _safe_str(request.GET.get('marca',      ''),      80)
    anho         = _safe_int(request.GET.get('anho'), datetime.now().year)
    mes          = _safe_int(request.GET.get('mes'),  datetime.now().month)

    ciudad_cond    = _regional_filter(regional)
    regional_cond  = "" if regional == 'nacional' else f"AND ({ciudad_cond})"
    canal_cond     = "AND dv.canal_rrhh = %s" if canal      != 'Todos' else ""
    dia_cond       = "AND dp.dia = %s"        if dia        != 'Todos' else ""
    sup_cond       = "AND dv.supervisor = %s" if supervisor != 'Todos' else ""
    canal_cte_cond = "AND dv2.canal_rrhh = %s" if canal != 'Todos' else ""
    marca_cte_cond = "AND dprod.marca = %s"     if marca else ""

    params = [anho, mes]
    if canal != 'Todos': params.append(canal)   # CTE ventas_mes canal
    if marca:            params.append(marca)   # CTE ventas_mes marca
    if canal != 'Todos': params.append(canal)   # WHERE canal_cond
    if dia   != 'Todos': params.append(dia)
    if supervisor != 'Todos': params.append(supervisor)

    sql = f"""
        WITH ventas_mes AS (
            SELECT DISTINCT fv.cliente_sk
            FROM dw.fact_ventas    fv
            JOIN dw.dim_fecha      df    ON df.fecha_sk     = fv.fecha_sk
            JOIN dw.dim_vendedor   dv2   ON dv2.vendedor_sk = fv.vendedor_sk
            JOIN dw.dim_producto   dprod ON dprod.producto_sk = fv.producto_sk
            WHERE df.anho = %s AND df.mes_numero = %s
              {canal_cte_cond}
              {marca_cte_cond}
        ),
        ultima_compra AS (
            SELECT fv.cliente_sk, MAX(df.fecha_completa) AS ultima_fecha
            FROM dw.fact_ventas fv
            JOIN dw.dim_fecha   df ON df.fecha_sk = fv.fecha_sk
            GROUP BY fv.cliente_sk
        )
        SELECT
            dc.ruta,
            COALESCE(dp.vendedor,   'Sin asignar') AS vendedor,
            COALESCE(dv.supervisor, '—')           AS supervisor,
            COALESCE(dp.dia,        '—')           AS dia,
            dc.codigo_cliente,
            dc.nombre_compania,
            COALESCE(dv.canal_rrhh, dc.canal)      AS canal,
            TO_CHAR(uc.ultima_fecha, 'DD/MM/YYYY') AS ultima_compra
        FROM dual.dim_cliente_dual dc
        LEFT JOIN dual.dim_planificacion dp
               ON dp.ruta = dc.ruta AND dp.es_actual = true
        LEFT JOIN dw.dim_vendedor dv
               ON dv.vendedor_codigo_erp = SPLIT_PART(dp.codigo_erp, '.', 1)
              AND dv.es_vendedor_actual = true
        LEFT JOIN dw.dim_cliente dck
               ON dck.cliente_codigo_erp = dc.codigo_cliente
              AND dck.es_cliente_actual = true
        LEFT JOIN ventas_mes  vm ON vm.cliente_sk  = dck.cliente_sk
        LEFT JOIN ultima_compra uc ON uc.cliente_sk = dck.cliente_sk
        WHERE dc.es_actual = true
          AND vm.cliente_sk IS NULL
          {regional_cond}
          {canal_cond}
          {dia_cond}
          {sup_cond}
        ORDER BY dc.ruta, dc.nombre_compania
    """

    headers = ["Ruta", "Vendedor", "Supervisor", "Día", "Cód. Cliente", "Nombre", "Canal", "Última Compra"]

    wb = openpyxl.Workbook(write_only=True)
    ws = wb.create_sheet(title="Clientes Sin Compra")
    bold = Font(bold=True)
    header_row = []
    for h in headers:
        c = openpyxl.cell.WriteOnlyCell(ws, value=h)
        c.font = bold
        header_row.append(c)
    ws.append(header_row)

    try:
        with connections['dw'].cursor() as cursor:
            cursor.execute(sql, params)
            while True:
                batch = cursor.fetchmany(2000)
                if not batch: break
                for row in batch:
                    ws.append(list(row))
    except Exception as e:
        return JsonResponse({"success": False, "error": str(e)}, status=500)

    buffer = io.BytesIO()
    wb.save(buffer)
    file_size = buffer.tell()
    buffer.seek(0)

    def _chunks(buf, size=65536):
        chunk = buf.read(size)
        while chunk:
            yield chunk
            chunk = buf.read(size)

    mes_str   = str(mes).zfill(2)
    sup_slug  = supervisor.replace(' ', '_') if supervisor != 'Todos' else 'todos'
    marca_slug = marca.replace(' ', '_') if marca else 'todas'
    filename  = f"clientes_sin_compra_{sup_slug}_{marca_slug}_{anho}_{mes_str}.xlsx"
    response = StreamingHttpResponse(
        _chunks(buffer),
        content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    response["Content-Encoding"]    = "identity"
    response["X-File-Size"]         = str(file_size)
    return response


# ─────────────────────────────────────────────────────────────────────────────
#  DASHBOARD TENDENCIA ESTACIONAL
# ─────────────────────────────────────────────────────────────────────────────

@api_view(['GET'])
@authentication_classes([ExpiringTokenAuthentication])
@permission_classes([IsAuthenticated])
@_require_perm('tendencia-estacional')
def dashboard_tendencia_estacional(request):
    """
    Comparación estacional (mismo mes entre gestiones) o últimos 6 meses.
    Params:
      regional  : Nacional | Santa Cruz | Cochabamba | La Paz
      canal     : Todos | WHS | DTS | PROV | SPM
      anho      : int
      mes       : int  (1-12)
      modo      : estacional | ultimos6
      dia_corte : 0 = mes completo, N = primeros N días del mes
    """
    is_admin = _is_admin(request.user)
    profile  = _get_or_create_profile(request.user)
    cargo    = (profile.cargo or '').strip()

    anho      = _safe_int(request.GET.get('anho'),  datetime.now().year)
    mes       = _safe_int(request.GET.get('mes'),   datetime.now().month)
    modo      = request.GET.get('modo', 'estacional')
    dia_corte = _safe_int(request.GET.get('dia_corte'), 0)

    if is_admin:
        regional_raw = request.GET.get('regional', 'nacional').lower().replace(' ', '_')
        regional     = regional_raw if regional_raw in REGIONALES_VALID else 'nacional'
        canal        = _safe_str(request.GET.get('canal',      'Todos'), 20)
        supervisor   = _safe_str(request.GET.get('supervisor', ''),      100)
    elif cargo == 'Gerente Regional':
        regional     = _REGIONAL_NAME_TO_KEY.get(profile.regional, 'nacional')
        canal        = _safe_str(request.GET.get('canal', 'Todos'), 20)
        supervisor   = _safe_str(request.GET.get('supervisor', ''), 100)
    elif 'supervisor' in cargo.lower():
        regional     = _REGIONAL_NAME_TO_KEY.get(profile.regional, 'nacional')
        canal        = (profile.canal or '').strip()
        supervisor   = f"{profile.user.first_name} {profile.user.last_name}".strip()
    else:
        regional_raw = request.GET.get('regional', 'nacional').lower().replace(' ', '_')
        regional     = regional_raw if regional_raw in REGIONALES_VALID else 'nacional'
        canal        = _safe_str(request.GET.get('canal',      'Todos'), 20)
        supervisor   = _safe_str(request.GET.get('supervisor', ''),      100)

    joins = """
        FROM dw.fact_ventas fv
        JOIN dw.dim_fecha        df ON df.fecha_sk    = fv.fecha_sk
        JOIN dw.dim_vendedor     dv ON dv.vendedor_sk = fv.vendedor_sk
        LEFT JOIN dw.dim_producto dp ON dp.producto_sk = fv.producto_sk
    """

    ciudad_cond = _regional_filter(regional)
    extra_conds  = [f"({ciudad_cond})"]
    extra_params = []
    if canal and canal != 'Todos':
        extra_conds.append("dv.canal_rrhh = %s")
        extra_params.append(canal)
    if supervisor:
        extra_conds.append("UPPER(dv.supervisor) = UPPER(%s)")
        extra_params.append(supervisor)
    extra_where = " AND " + " AND ".join(extra_conds)

    # Helper: ejecuta queries de desglose por categoría y canal para un WHERE+params dado
    def _desgloses(where_conds, params_base):
        # Categorías
        sql_cat = f"""
            SELECT {_CATEGORIA_CASE} AS categoria,
                   df.anho, df.mes_numero,
                   ROUND(COALESCE(SUM(fv.venta_neta), 0)::NUMERIC, 2) AS total,
                   COALESCE(SUM(fv.cantidad), 0)                       AS cantidad
            {joins}
            WHERE {where_conds}
            GROUP BY categoria, df.anho, df.mes_numero
            ORDER BY df.anho, df.mes_numero, categoria
        """
        _, cat_rows = _run_dw_query(sql_cat, params_base)

        # Canales (solo cuando no hay filtro de canal)
        canal_rows = []
        if canal == 'Todos':
            sql_canal = f"""
                SELECT dv.canal_rrhh AS canal,
                       df.anho, df.mes_numero,
                       ROUND(COALESCE(SUM(fv.venta_neta), 0)::NUMERIC, 2) AS total,
                       COALESCE(SUM(fv.cantidad), 0)                       AS cantidad
                {joins}
                WHERE {where_conds} AND dv.canal_rrhh IS NOT NULL
                GROUP BY dv.canal_rrhh, df.anho, df.mes_numero
                ORDER BY df.anho, df.mes_numero, dv.canal_rrhh
            """
            _, canal_rows = _run_dw_query(sql_canal, params_base)

        return cat_rows, canal_rows

    try:
        if modo == 'estacional':
            conds = ["df.mes_numero = %s", "df.anho BETWEEN %s AND %s"]
            params = [mes, anho - 2, anho]
            if dia_corte > 0:
                conds.append("df.dia_numero <= %s")
                params.append(dia_corte)
            params.extend(extra_params)
            where_str = " AND ".join(conds) + extra_where

            sql = f"""
                SELECT df.anho,
                       ROUND(COALESCE(SUM(fv.venta_neta), 0)::NUMERIC, 2) AS total,
                       COALESCE(SUM(fv.cantidad), 0)                       AS cantidad
                {joins}
                WHERE {where_str}
                GROUP BY df.anho
                ORDER BY df.anho
            """
            _, rows = _run_dw_query(sql, params)
            cat_rows, canal_rows = _desgloses(where_str, params)

            return JsonResponse({
                'success':        True,
                'modo':           'estacional',
                'mes_numero':     mes,
                'anho_ref':       anho,
                'dia_corte':      dia_corte,
                'data':           rows,
                'data_categoria': cat_rows,
                'data_canal':     canal_rows,
            })

        else:  # ultimos6
            start_m, start_y = mes - 5, anho
            while start_m <= 0:
                start_m += 12
                start_y -= 1

            u6_conds = ["df.anho * 100 + df.mes_numero BETWEEN %s AND %s"]
            u6_params = [start_y * 100 + start_m, anho * 100 + mes]
            if dia_corte > 0:
                u6_conds.append("df.dia_numero <= %s")
                u6_params.append(dia_corte)
            u6_params.extend(extra_params)
            where_str = " AND ".join(u6_conds) + extra_where

            sql = f"""
                SELECT df.anho, df.mes_numero,
                       ROUND(COALESCE(SUM(fv.venta_neta), 0)::NUMERIC, 2) AS total,
                       COALESCE(SUM(fv.cantidad), 0)                       AS cantidad
                {joins}
                WHERE {where_str}
                GROUP BY df.anho, df.mes_numero
                ORDER BY df.anho, df.mes_numero
            """
            _, rows = _run_dw_query(sql, u6_params)
            cat_rows, canal_rows = _desgloses(where_str, u6_params)

            return JsonResponse({
                'success':        True,
                'modo':           'ultimos6',
                'data':           rows,
                'data_categoria': cat_rows,
                'data_canal':     canal_rows,
            })

    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)
