from django.http import JsonResponse
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


def _is_admin(user):
    """True si el usuario tiene permisos de administración."""
    if user.is_staff or user.is_superuser:
        return True
    try:
        cargo = user.profile.cargo
        return cargo in ('Administrador de Sistema', 'Subadministrador de Sistemas')
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
            JOIN dw.dim_presupuesto_version dpv ON fp.version_sk  = dpv.version_sk
            JOIN dw.dim_vendedor dv              ON fp.vendedor_sk = dv.vendedor_sk
            WHERE fp.anho = %s AND fp.mes = %s
              AND dpv.activa = TRUE
        """
        presupuestos = {'total': 0, 'santa_cruz': 0, 'cochabamba': 0, 'la_paz': 0}
        try:
            _, ppto_rows = _run_dw_query(sql_ppto, [anho, mes])
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
                   JOIN dw.dim_presupuesto_version dpv ON fp.version_sk = dpv.version_sk
                   WHERE fp.anho = %s AND fp.mes = %s AND dpv.activa = TRUE""",
                [anho, mes]
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
                JOIN dw.dim_presupuesto_version dpv ON fp.version_sk  = dpv.version_sk
                JOIN dw.dim_vendedor dv              ON fp.vendedor_sk = dv.vendedor_sk
                WHERE fp.anho = %s AND fp.mes = %s AND dpv.activa = TRUE
                GROUP BY regional
            """
            _, ppto_rows = _run_dw_query(sql_ppto, [anho, mes])
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
                JOIN dw.dim_presupuesto_version dpv ON fp.version_sk  = dpv.version_sk
                JOIN dw.dim_vendedor dv              ON fp.vendedor_sk = dv.vendedor_sk
                WHERE fp.anho = %s AND fp.mes = %s
                  AND dpv.activa = TRUE
                GROUP BY CASE
                        WHEN dv.canal_rrhh IN ('DTS', 'DTS-LP', 'DTS-EA') THEN 'DTS'
                        WHEN dv.canal_rrhh IN ('WHS', 'WHS-LP', 'WHS-EA') THEN 'WHS'
                        ELSE dv.canal_rrhh
                    END
            """
            _, ppto_rows = _run_dw_query(sql_ppto, [anho, mes])
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
        dashboard_permissions = dashboard_permissions if isinstance(dashboard_permissions, list) else [],
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
                CASE
                    WHEN dp.grupo_descripcion = 'ALIMENTOS' THEN 'Alimentos'
                    WHEN dp.grupo_descripcion = 'NO PERECIBLES' THEN 'Alimentos'
                    WHEN dp.grupo_descripcion = 'BEBIDAS REFRESCANTES' THEN 'Alimentos'
                    WHEN dp.grupo_descripcion = 'BEBIDAS ALCOHOLICAS' THEN 'Licores'
                    WHEN dp.grupo_descripcion = 'CUIDADO PERSONAL' THEN 'Home & Personal Care'
                    WHEN dp.grupo_descripcion = 'LIMPIEZA' THEN 'Home & Personal Care'
                    WHEN dp.grupo_descripcion = 'MEZCLADOR' THEN 'Apego'
                    WHEN dp.grupo_descripcion = 'CATEGORÍA PENDIENTE' THEN 'Apego'
                    ELSE 'Otros'
                END AS categoria,
                COALESCE(SUM(fv.venta_neta), 0)                  AS venta_neta,
                COALESCE(SUM(fv.cantidad), 0)                    AS cantidad,
                COUNT(DISTINCT fv.producto_sk)                   AS productos
            FROM dw.fact_ventas fv
            JOIN dw.dim_fecha df                         ON fv.fecha_sk    = df.fecha_sk
            JOIN dw.dim_producto dp                      ON fv.producto_sk = dp.producto_sk
            WHERE df.anho = %s AND df.mes_numero = %s
              AND dp.grupo_descripcion != 'EXHIBIDORES'
              AND dp.grupo_descripcion IS NOT NULL
            GROUP BY CASE
                    WHEN dp.grupo_descripcion = 'ALIMENTOS' THEN 'Alimentos'
                    WHEN dp.grupo_descripcion = 'NO PERECIBLES' THEN 'Alimentos'
                    WHEN dp.grupo_descripcion = 'BEBIDAS REFRESCANTES' THEN 'Alimentos'
                    WHEN dp.grupo_descripcion = 'BEBIDAS ALCOHOLICAS' THEN 'Licores'
                    WHEN dp.grupo_descripcion = 'CUIDADO PERSONAL' THEN 'Home & Personal Care'
                    WHEN dp.grupo_descripcion = 'LIMPIEZA' THEN 'Home & Personal Care'
                    WHEN dp.grupo_descripcion = 'MEZCLADOR' THEN 'Apego'
                    WHEN dp.grupo_descripcion = 'CATEGORÍA PENDIENTE' THEN 'Apego'
                    ELSE 'Otros'
                END
            ORDER BY venta_neta DESC
        """
        _, rows = _run_dw_query(sql, [anho, mes])

        # Presupuesto por categoria consolidado desde fact_presupuesto
        ppto_map = {}
        try:
            sql_ppto = """
                SELECT
                    CASE
                        WHEN dp.grupo_descripcion = 'ALIMENTOS' THEN 'Alimentos'
                        WHEN dp.grupo_descripcion = 'NO PERECIBLES' THEN 'Alimentos'
                        WHEN dp.grupo_descripcion = 'BEBIDAS REFRESCANTES' THEN 'Alimentos'
                        WHEN dp.grupo_descripcion = 'BEBIDAS ALCOHOLICAS' THEN 'Licores'
                        WHEN dp.grupo_descripcion = 'CUIDADO PERSONAL' THEN 'Home & Personal Care'
                        WHEN dp.grupo_descripcion = 'LIMPIEZA' THEN 'Home & Personal Care'
                        WHEN dp.grupo_descripcion = 'MEZCLADOR' THEN 'Apego'
                        WHEN dp.grupo_descripcion = 'CATEGORÍA PENDIENTE' THEN 'Apego'
                        ELSE 'Otros'
                    END AS categoria,
                    COALESCE(SUM(fp.venta_neta_presupuestada), 0) AS presupuesto
                FROM dw.fact_presupuesto fp
                JOIN dw.dim_presupuesto_version dpv ON fp.version_sk  = dpv.version_sk
                JOIN dw.dim_producto dp              ON fp.producto_sk = dp.producto_sk
                WHERE fp.anho = %s AND fp.mes = %s
                  AND dpv.activa = TRUE
                  AND dp.grupo_descripcion != 'EXHIBIDORES'
                  AND dp.grupo_descripcion IS NOT NULL
                GROUP BY CASE
                        WHEN dp.grupo_descripcion = 'ALIMENTOS' THEN 'Alimentos'
                        WHEN dp.grupo_descripcion = 'NO PERECIBLES' THEN 'Alimentos'
                        WHEN dp.grupo_descripcion = 'BEBIDAS REFRESCANTES' THEN 'Alimentos'
                        WHEN dp.grupo_descripcion = 'BEBIDAS ALCOHOLICAS' THEN 'Licores'
                        WHEN dp.grupo_descripcion = 'CUIDADO PERSONAL' THEN 'Home & Personal Care'
                        WHEN dp.grupo_descripcion = 'LIMPIEZA' THEN 'Home & Personal Care'
                        WHEN dp.grupo_descripcion = 'MEZCLADOR' THEN 'Apego'
                        WHEN dp.grupo_descripcion = 'CATEGORÍA PENDIENTE' THEN 'Apego'
                        ELSE 'Otros'
                    END
            """
            _, ppto_rows = _run_dw_query(sql_ppto, [anho, mes])
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
        JOIN dw.dim_presupuesto_version dpv ON fp.version_sk  = dpv.version_sk
        JOIN dw.dim_vendedor dv             ON fp.vendedor_sk = dv.vendedor_sk
        WHERE fp.anho = %s AND fp.mes = %s AND dpv.activa = TRUE
          AND ({ciudad_cond})
          AND dv.canal_rrhh IS NOT NULL
          {canal_filter}
        GROUP BY dv.canal_rrhh
    """
    base = [anho, mes] + (params_extra or [])
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
            JOIN dw.dim_presupuesto_version dpv ON fp.version_sk  = dpv.version_sk
            JOIN dw.dim_vendedor dv             ON fp.vendedor_sk = dv.vendedor_sk
            WHERE fp.anho = %s AND fp.mes = %s AND dpv.activa = TRUE
              AND ({ciudad_cond})
        """
        presupuesto_mes = 0.0
        try:
            _, p = _run_dw_query(sql_ppto, [anho, mes])
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
    CASE
        WHEN dp.grupo_descripcion IN ('ALIMENTOS', 'NO PERECIBLES', 'BEBIDAS REFRESCANTES') THEN 'Alimentos'
        WHEN dp.grupo_descripcion = 'BEBIDAS ALCOHOLICAS'                                   THEN 'Licores'
        WHEN dp.grupo_descripcion IN ('CUIDADO PERSONAL', 'LIMPIEZA')                       THEN 'Home & Personal Care'
        WHEN dp.grupo_descripcion IN ('MEZCLADOR', 'CATEGORÍA PENDIENTE')                   THEN 'Apego'
        ELSE 'Otros'
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
              AND dp.grupo_descripcion != 'EXHIBIDORES'
              AND dp.grupo_descripcion IS NOT NULL
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
                JOIN dw.dim_presupuesto_version dpv ON fp.version_sk  = dpv.version_sk
                JOIN dw.dim_vendedor dv              ON fp.vendedor_sk = dv.vendedor_sk
                JOIN dw.dim_producto dp              ON fp.producto_sk = dp.producto_sk
                WHERE fp.anho = %s AND fp.mes = %s AND dpv.activa = TRUE
                  AND ({ciudad_cond})
                  AND dp.grupo_descripcion != 'EXHIBIDORES'
                  AND dp.grupo_descripcion IS NOT NULL
                GROUP BY {_CATEGORIA_CASE}
            """
            _, ppto_rows = _run_dw_query(sql_ppto, [anho, mes])
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
              AND dp.grupo_descripcion != 'EXHIBIDORES'
              AND dp.grupo_descripcion IS NOT NULL
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
                JOIN dw.dim_presupuesto_version dpv ON fp.version_sk  = dpv.version_sk
                JOIN dw.dim_vendedor dv              ON fp.vendedor_sk = dv.vendedor_sk
                JOIN dw.dim_producto dp              ON fp.producto_sk = dp.producto_sk
                WHERE fp.anho = %s AND fp.mes = %s AND dpv.activa = TRUE
                  AND ({ciudad_cond}) {canal_cond}
                  AND dp.grupo_descripcion != 'EXHIBIDORES'
                  AND dp.grupo_descripcion IS NOT NULL
                GROUP BY {_CATEGORIA_CASE}
            """
            _, ppto_rows = _run_dw_query(sql_ppto, params)
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

        _CAT_GRUPOS = {
            'Alimentos':            ('ALIMENTOS', 'NO PERECIBLES', 'BEBIDAS REFRESCANTES'),
            'Licores':              ('BEBIDAS ALCOHOLICAS',),
            'Home & Personal Care': ('CUIDADO PERSONAL', 'LIMPIEZA'),
            'Apego':                ('MEZCLADOR', 'CATEGORÍA PENDIENTE'),
        }

        ciudad_cond = _regional_filter(regional)
        canal_cond  = "AND dv.canal_rrhh = %s" if canal else ""

        params = [anho, mes]
        if canal:
            params.append(canal)

        if categoria and categoria in _CAT_GRUPOS:
            grupos = _CAT_GRUPOS[categoria]
            placeholders = ', '.join(['%s'] * len(grupos))
            cat_cond = f"AND dp.grupo_descripcion IN ({placeholders})"
            params.extend(grupos)
        else:
            cat_cond = ""

        params_ventas = list(params) + [limit]

        sql = f"""
            SELECT
                dp.producto_codigo_erp                           AS codigo,
                dp.producto_nombre                               AS producto,
                COALESCE(dp.grupo_descripcion, 'Sin Categoría') AS categoria,
                COALESCE(dp.subgrupo_descripcion, '')           AS subgrupo,
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
                     dp.grupo_descripcion, dp.subgrupo_descripcion
            ORDER BY venta_neta DESC
            LIMIT %s
        """
        _, rows = _run_dw_query(sql, params_ventas)

        # Presupuesto por producto
        ppto_map = {}
        try:
            sql_ppto = f"""
                SELECT dp.producto_codigo_erp AS codigo,
                       COALESCE(SUM(fp.venta_neta_presupuestada), 0) AS presupuesto
                FROM dw.fact_presupuesto fp
                JOIN dw.dim_presupuesto_version dpv ON fp.version_sk  = dpv.version_sk
                JOIN dw.dim_vendedor dv              ON fp.vendedor_sk = dv.vendedor_sk
                JOIN dw.dim_producto dp              ON fp.producto_sk = dp.producto_sk
                WHERE fp.anho = %s AND fp.mes = %s AND dpv.activa = TRUE
                  AND ({ciudad_cond}) {canal_cond} {cat_cond}
                GROUP BY dp.producto_codigo_erp
            """
            _, ppto_rows = _run_dw_query(sql_ppto, params)
            ppto_map = {r['codigo']: float(r['presupuesto'] or 0) for r in ppto_rows}
        except Exception:
            pass

        result = []
        for row in rows:
            vn   = float(row['venta_neta'] or 0)
            ppto = ppto_map.get(row['codigo'], 0)
            result.append({
                **row,
                'venta_neta':  vn,
                'presupuesto': ppto,
                'porcentaje':  round(vn / ppto * 100, 1) if ppto > 0 else None,
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

_ALIMENTOS_IN = "('ALIMENTOS', 'NO PERECIBLES', 'BEBIDAS REFRESCANTES')"
_APEGO_IN     = "('MEZCLADOR', 'CATEGORÍA PENDIENTE')"
_LICORES_IN   = "('BEBIDAS ALCOHOLICAS')"
_HPC_IN       = "('CUIDADO PERSONAL', 'LIMPIEZA')"


@api_view(['GET'])
@authentication_classes([ExpiringTokenAuthentication])
@permission_classes([IsAuthenticated])
@_require_perm('supervisores')
def dashboard_supervisores_vendedores(request):
    """
    Avance por vendedor desglosado por categoría.
    - Admins: filtran por regional/canal via query params (canal vacío = sin filtro).
    - Supervisores: ven solo su regional+canal del perfil.
    """
    try:
        is_admin = _is_admin(request.user)
        profile  = _get_or_create_profile(request.user)

        if is_admin:
            regional_key = request.GET.get('regional', 'santa_cruz').lower().replace(' ', '_')
            canal        = _safe_str(request.GET.get('canal', ''))
        else:
            if 'supervisor' not in profile.cargo.lower():
                return JsonResponse({'success': False, 'error': 'Acceso denegado'}, status=403)
            regional_key = _REGIONAL_NAME_TO_KEY.get(profile.regional, 'santa_cruz')
            canal        = profile.canal.strip()

        anho = _safe_int(request.GET.get('anho'), datetime.now().year)
        mes  = _safe_int(request.GET.get('mes'),  datetime.now().month)

        if regional_key not in REGIONALES_VALID:
            return JsonResponse({'success': False, 'error': 'Regional inválida'}, status=400)

        ciudad_cond = _regional_filter(regional_key)
        canal_cond  = "AND dv.canal_rrhh = %s" if canal else ""
        params_base = [anho, mes] + ([canal] if canal else [])

        # ── Ventas por vendedor y categoría (CASE WHEN pivot) ──────────────────
        sql_ventas = f"""
            SELECT
                dv.vendedor_sk,
                dv.vendedor_nombre                                                          AS vendedor,
                COALESCE(SUM(CASE WHEN dp.grupo_descripcion IN {_ALIMENTOS_IN}
                    THEN fv.venta_neta ELSE 0 END), 0)                                      AS alimentos,
                COALESCE(SUM(CASE WHEN dp.grupo_descripcion IN {_APEGO_IN}
                    THEN fv.venta_neta ELSE 0 END), 0)                                      AS apego,
                COALESCE(SUM(CASE WHEN dp.grupo_descripcion IN {_LICORES_IN}
                    THEN fv.venta_neta ELSE 0 END), 0)                                      AS licores,
                COALESCE(SUM(CASE WHEN dp.grupo_descripcion IN {_HPC_IN}
                    THEN fv.venta_neta ELSE 0 END), 0)                                      AS hpc,
                COALESCE(SUM(fv.venta_neta), 0)                                             AS total,
                COALESCE(SUM(CASE WHEN dp.grupo_descripcion IN {_ALIMENTOS_IN}
                    THEN fv.cantidad ELSE 0 END), 0)                                        AS alimentos_cant,
                COALESCE(SUM(CASE WHEN dp.grupo_descripcion IN {_APEGO_IN}
                    THEN fv.cantidad ELSE 0 END), 0)                                        AS apego_cant,
                COALESCE(SUM(CASE WHEN dp.grupo_descripcion IN {_LICORES_IN}
                    THEN fv.cantidad ELSE 0 END), 0)                                        AS licores_cant,
                COALESCE(SUM(CASE WHEN dp.grupo_descripcion IN {_HPC_IN}
                    THEN fv.cantidad ELSE 0 END), 0)                                        AS hpc_cant,
                COALESCE(SUM(fv.cantidad), 0)                                               AS total_cant
            FROM dw.fact_ventas fv
            JOIN dw.dim_fecha    df ON fv.fecha_sk    = df.fecha_sk
            JOIN dw.dim_vendedor dv ON fv.vendedor_sk = dv.vendedor_sk
            JOIN dw.dim_producto dp ON fv.producto_sk = dp.producto_sk
            WHERE df.anho = %s AND df.mes_numero = %s
              AND ({ciudad_cond}) {canal_cond}
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
                    COALESCE(SUM(CASE WHEN dp.grupo_descripcion IN {_ALIMENTOS_IN}
                        THEN fp.venta_neta_presupuestada ELSE 0 END), 0)                        AS alimentos_ppto,
                    COALESCE(SUM(CASE WHEN dp.grupo_descripcion IN {_APEGO_IN}
                        THEN fp.venta_neta_presupuestada ELSE 0 END), 0)                        AS apego_ppto,
                    COALESCE(SUM(CASE WHEN dp.grupo_descripcion IN {_LICORES_IN}
                        THEN fp.venta_neta_presupuestada ELSE 0 END), 0)                        AS licores_ppto,
                    COALESCE(SUM(CASE WHEN dp.grupo_descripcion IN {_HPC_IN}
                        THEN fp.venta_neta_presupuestada ELSE 0 END), 0)                        AS hpc_ppto,
                    COALESCE(SUM(fp.venta_neta_presupuestada), 0)                               AS total_ppto
                FROM dw.fact_presupuesto fp
                JOIN dw.dim_presupuesto_version dpv ON fp.version_sk  = dpv.version_sk
                JOIN dw.dim_vendedor             dv  ON fp.vendedor_sk = dv.vendedor_sk
                JOIN dw.dim_producto             dp  ON fp.producto_sk = dp.producto_sk
                WHERE fp.anho = %s AND fp.mes = %s AND dpv.activa = TRUE
                  AND ({ciudad_cond}) {canal_cond}
                GROUP BY dv.vendedor_sk
            """
            _, ppto_rows = _run_dw_query(sql_ppto, params_base)
            ppto_map = {r['vendedor_sk']: r for r in ppto_rows}
        except Exception:
            pass

        def _pct(avance, ppto):
            a, p = float(avance or 0), float(ppto or 0)
            return round(a / p * 100, 1) if p > 0 else None

        result = []
        for row in ventas_rows:
            sk  = row['vendedor_sk']
            p   = ppto_map.get(sk, {})
            a_a = float(row['alimentos'] or 0)
            a_e = float(row['apego']     or 0)
            a_l = float(row['licores']   or 0)
            a_h = float(row['hpc']       or 0)
            a_t = float(row['total']     or 0)
            p_a = float(p.get('alimentos_ppto') or 0)
            p_e = float(p.get('apego_ppto')     or 0)
            p_l = float(p.get('licores_ppto')   or 0)
            p_h = float(p.get('hpc_ppto')       or 0)
            p_t = float(p.get('total_ppto')     or 0)
            result.append({
                'vendedor_sk':     sk,
                'vendedor':        row['vendedor'],
                'alimentos':       a_a, 'alimentos_ppto': p_a, 'alimentos_pct': _pct(a_a, p_a), 'alimentos_cant': int(row['alimentos_cant'] or 0),
                'apego':           a_e, 'apego_ppto':     p_e, 'apego_pct':     _pct(a_e, p_e), 'apego_cant':     int(row['apego_cant']     or 0),
                'licores':         a_l, 'licores_ppto':   p_l, 'licores_pct':   _pct(a_l, p_l), 'licores_cant':   int(row['licores_cant']   or 0),
                'hpc':             a_h, 'hpc_ppto':       p_h, 'hpc_pct':       _pct(a_h, p_h), 'hpc_cant':       int(row['hpc_cant']       or 0),
                'total':           a_t, 'total_ppto':     p_t, 'total_pct':     _pct(a_t, p_t), 'total_cant':     int(row['total_cant']     or 0),
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
              AND ({ciudad_cond}) {canal_cond}
        """
        _, fc_rows  = _run_dw_query(sql_fc, params_base)
        fecha_corte = str(fc_rows[0]['fc']) if fc_rows and fc_rows[0]['fc'] else None

        return JsonResponse({
            'success':      True,
            'regional':     regional_key,
            'canal':        canal,
            'total_avance': total_avance,
            'total_ppto':   total_ppto,
            'total_pct':    round(total_avance / total_ppto * 100, 1) if total_ppto > 0 else None,
            'fecha_corte':  fecha_corte,
            'vendedores':   result,
        })
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


# ─────────────────────────────────────────
#  DASHBOARD UNIDADES VENDIDAS
# ─────────────────────────────────────────

_UNIDADES_CAT_GRUPOS = {
    'Alimentos':            ('ALIMENTOS', 'NO PERECIBLES', 'BEBIDAS REFRESCANTES'),
    'Licores':              ('BEBIDAS ALCOHOLICAS',),
    'Home & Personal Care': ('CUIDADO PERSONAL', 'LIMPIEZA'),
    'Apego':                ('MEZCLADOR', 'CATEGORÍA PENDIENTE'),
}


def _unidades_cat_params(categoria, base_params):
    """Returns (cat_cond_sql, params_extended)."""
    if categoria and categoria in _UNIDADES_CAT_GRUPOS:
        grupos       = _UNIDADES_CAT_GRUPOS[categoria]
        placeholders = ', '.join(['%s'] * len(grupos))
        cat_cond     = f"AND dp.grupo_descripcion IN ({placeholders})"
        return cat_cond, list(base_params) + list(grupos)
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
            JOIN dw.dim_presupuesto_version dpv ON fp.version_sk  = dpv.version_sk
            JOIN dw.dim_vendedor             dv  ON fp.vendedor_sk = dv.vendedor_sk
            JOIN dw.dim_producto             dp  ON fp.producto_sk = dp.producto_sk
            WHERE fp.anho = %s AND fp.mes = %s AND dpv.activa = TRUE
              AND ({ciudad_cond}) {canal_cond} {ppto_cat_cond}
        """
        p_rows = []
        try:
            _, p_rows = _run_dw_query(sql_p, params_p)
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
@_require_perm('unidades-vendidas')
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
        if not categoria or categoria not in _UNIDADES_CAT_GRUPOS:
            return JsonResponse({'success': False, 'error': 'Categoría inválida'}, status=400)

        ciudad_cond  = _regional_filter(regional)
        canal_cond   = "AND dv.canal_rrhh = %s" if canal else ""
        base_params  = [anho, mes] + ([canal] if canal else [])
        grupos       = _UNIDADES_CAT_GRUPOS[categoria]
        placeholders = ', '.join(['%s'] * len(grupos))
        cat_cond     = f"AND dp.grupo_descripcion IN ({placeholders})"
        params       = list(base_params) + list(grupos)

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
            sql_p = f"""
                SELECT
                    COALESCE(dp.subgrupo_descripcion, 'Sin Subgrupo') AS subgrupo,
                    COALESCE(SUM(fp.venta_neta_presupuestada), 0)       AS presupuesto
                FROM dw.fact_presupuesto fp
                JOIN dw.dim_presupuesto_version dpv ON fp.version_sk  = dpv.version_sk
                JOIN dw.dim_vendedor             dv  ON fp.vendedor_sk = dv.vendedor_sk
                JOIN dw.dim_producto             dp  ON fp.producto_sk = dp.producto_sk
                WHERE fp.anho = %s AND fp.mes = %s AND dpv.activa = TRUE
                  AND ({ciudad_cond}) {canal_cond} {cat_cond}
                GROUP BY dp.subgrupo_descripcion
            """
            _, p_rows = _run_dw_query(sql_p, params)
            ppto_map = {r['subgrupo']: float(r['presupuesto'] or 0) for r in p_rows}
        except Exception:
            pass

        result = []
        for row in v_rows:
            sg   = row['subgrupo']
            vn   = float(row['venta_neta'] or 0)
            cant = int(row['cantidad'] or 0)
            ppto = ppto_map.get(sg, 0)
            result.append({
                'subgrupo':    sg,
                'cantidad':    cant,
                'venta_neta':  vn,
                'presupuesto': ppto,
                'porcentaje':  round(vn / ppto * 100, 1) if ppto > 0 else None,
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
        extra_params: list = []
        cat_cond     = ""
        sub_cond     = ""

        if categoria and categoria in _UNIDADES_CAT_GRUPOS:
            grupos       = _UNIDADES_CAT_GRUPOS[categoria]
            placeholders = ', '.join(['%s'] * len(grupos))
            cat_cond     = f"AND dp.grupo_descripcion IN ({placeholders})"
            extra_params.extend(grupos)
        if subgrupo:
            sub_cond = "AND dp.subgrupo_descripcion = %s"
            extra_params.append(subgrupo)

        params_v    = list(base_params) + extra_params + [limit]
        params_ppto = list(base_params) + extra_params

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
                    COALESCE(SUM(fp.venta_neta_presupuestada), 0) AS presupuesto
                FROM dw.fact_presupuesto fp
                JOIN dw.dim_presupuesto_version dpv ON fp.version_sk  = dpv.version_sk
                JOIN dw.dim_vendedor             dv  ON fp.vendedor_sk = dv.vendedor_sk
                JOIN dw.dim_producto             dp  ON fp.producto_sk = dp.producto_sk
                WHERE fp.anho = %s AND fp.mes = %s AND dpv.activa = TRUE
                  AND ({ciudad_cond}) {canal_cond} {cat_cond} {sub_cond}
                GROUP BY dp.producto_codigo_erp
            """
            _, p_rows = _run_dw_query(sql_p, params_ppto)
            ppto_map = {r['codigo']: float(r['presupuesto'] or 0) for r in p_rows}
        except Exception:
            pass

        result = []
        for row in v_rows:
            vn   = float(row['venta_neta'] or 0)
            ppto = ppto_map.get(row['codigo'], 0)
            result.append({
                'codigo':      row['codigo'],
                'producto':    row['producto'],
                'cantidad':    int(row['cantidad'] or 0),
                'venta_neta':  vn,
                'presupuesto': ppto,
                'porcentaje':  round(vn / ppto * 100, 1) if ppto > 0 else None,
            })
        return JsonResponse({'success': True, 'data': result})
    except Exception as e:
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


@api_view(['GET'])
@authentication_classes([ExpiringTokenAuthentication])
@permission_classes([IsAuthenticated])
@_require_perm('unidades-vendidas')
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

        result = []
        for row in v_rows:
            result.append({
                'codigo':     row['codigo'],
                'producto':   row['producto'],
                'cantidad':   int(row['cantidad'] or 0),
                'venta_neta': float(row['venta_neta'] or 0),
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
