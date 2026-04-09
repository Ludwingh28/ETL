# stream/views.py
from django.http import JsonResponse
from django.db import connections
from django.db.utils import ConnectionDoesNotExist
from django.views.decorators.csrf import csrf_exempt
from .models import Venta  # Modelo con managed=False
from datetime import date, datetime
import decimal
from rest_framework.decorators import api_view, permission_classes, authentication_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.authentication import TokenAuthentication
from rest_framework.authtoken.models import Token
from django.contrib.auth import authenticate
from rest_framework import status

def home(request):
    return JsonResponse({
        'message': 'API de Dashboard DW',
        'endpoints': {
            'login': '/api/login/',
            'consulta': '/api/consulta/',
            'verificar': '/api/verificar-auth/',
            'logout': '/api/logout/',
        },
        'documentacion': 'Usa /api/ para los endpoints'
    })

# ---------- ENDPOINT DE LOGIN (PÚBLICO) ----------
@api_view(['POST'])
@permission_classes([AllowAny])  # Este endpoint es público
def api_login(request):
    """
    Endpoint para autenticación.
    Recibe: {"username": "usuario", "password": "contraseña"}
    Devuelve: token de autenticación
    """
    username = request.data.get('username')
    password = request.data.get('password')
    
    if not username or not password:
        return JsonResponse({
            'success': False,
            'error': 'Debes proporcionar usuario y contraseña'
        }, status=status.HTTP_400_BAD_REQUEST)
    
    # Autenticar usuario
    user = authenticate(username=username, password=password)
    
    if user:
        # Obtener o crear token
        token, _ = Token.objects.get_or_create(user=user)
        
        return JsonResponse({
            'success': True,
            'token': token.key,
            'username': user.username,
            'message': 'Autenticación exitosa'
        })
    else:
        return JsonResponse({
            'success': False,
            'error': 'Credenciales inválidas'
        }, status=status.HTTP_401_UNAUTHORIZED)


# ---------- ENDPOINT PROTEGIDO (REQUIERE TOKEN) ----------
@api_view(['GET'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def api_consulta_dw(request):
    """
    Endpoint protegido para consultar el Data Warehouse.
    Requiere token en header: Authorization: Token <tu-token>
    """
    try:
        # Obtener consulta de los parámetros
        consulta = request.GET.get('sql', '')
        
        if not consulta:
            return JsonResponse({
                'success': False,
                'error': 'Debes proporcionar una consulta SQL con ?sql='
            })
        
        # Limitar consultas por seguridad (opcional)
        if 'DROP' in consulta.upper() or 'DELETE' in consulta.upper() or 'ALTER' in consulta.upper():
            return JsonResponse({
                'success': False,
                'error': 'Operación no permitida'
            }, status=403)
        
        # Ejecutar consulta
        with connections['ventas_db'].cursor() as cursor:
            cursor.execute(consulta)
            
            # Obtener nombres de columnas
            columns = [col[0] for col in cursor.description]
            
            # Convertir resultados
            results = []
            for row in cursor.fetchall():
                row_dict = {}
                for i, col in enumerate(columns):
                    valor = row[i]
                    if valor is None:
                        valor = None
                    elif isinstance(valor, (date, datetime)):
                        valor = valor.isoformat()
                    elif isinstance(valor, decimal.Decimal):
                        valor = float(valor)
                    elif isinstance(valor, bytes):
                        valor = valor.decode('utf-8')
                    row_dict[col] = valor
                results.append(row_dict)
            
            # Registrar la consulta (auditoría)
            print(f"Usuario {request.user.username} consultó: {consulta}")
            
            return JsonResponse({
                'success': True,
                'data': results,
                'total': len(results),
                'columns': columns,
                'usuario': request.user.username
            })
            
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)


# ---------- ENDPOINT PARA VERIFICAR AUTENTICACIÓN ----------
@api_view(['GET'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def api_verificar_auth(request):
    """
    Endpoint para verificar que la autenticación funciona.
    Útil para probar desde Streamlit.
    """
    return JsonResponse({
        'success': True,
        'message': f'Autenticado como {request.user.username}',
        'user_id': request.user.id
    })


# ---------- ENDPOINT PARA CERRAR SESIÓN ----------
@api_view(['POST'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def api_logout(request):
    """
    Elimina el token actual (cierra sesión)
    """
    try:
        # Eliminar el token del usuario
        request.user.auth_token.delete()
        return JsonResponse({
            'success': True,
            'message': 'Sesión cerrada exitosamente'
        })
    except:
        return JsonResponse({
            'success': False,
            'error': 'Error al cerrar sesión'
        }, status=500)
        
def api_ventas_mes(request):
    """
    Esta vista automáticamente usa 'ventas_db' gracias al router.
    No necesitas especificar la BD en cada consulta.
    """
    hoy = datetime.now()
    
    # El ORM usará automáticamente ventas_db (configurado en el router)
    ventas = Venta.objects.filter(
        fecha__month=hoy.month,
        fecha__year=hoy.year
    )
    
    from django.db.models import Sum
    total = ventas.aggregate(total=Sum('monto'))['total'] or 0
    
    return JsonResponse({
        'success': True,
        'data': {
            'total_mes': float(total),
            'cantidad': ventas.count(),
            'bd_utilizada': 'PostgreSQL (ventas_db)'  # Solo para verificar
        }
    })

@csrf_exempt
def api_sql_con_dict(request):
    """
    Ejecuta SQL y devuelve resultados como diccionarios
    """
    try:
        with connections['ventas_db'].cursor() as cursor:
            # Puedes parametrizar la consulta vía GET
            consulta = request.GET.get('consulta', "SELECT * FROM dw.dim_vendedor LIMIT 10")
            limite = request.GET.get('limite', 10)
            
            # Reemplazar LIMIT si viene en la consulta
            if 'LIMIT' not in consulta.upper():
                consulta += f" LIMIT {limite}"
            
            cursor.execute(consulta)
            
            # Obtener nombres de columnas
            columns = [col[0] for col in cursor.description]
            
            # Convertir resultados a lista de diccionarios (manejando tipos)
            results = []
            for row in cursor.fetchall():
                row_dict = {}
                for i, col in enumerate(columns):
                    valor = row[i]
                    # Convertir tipos especiales para JSON
                    if isinstance(valor, (date, datetime)):
                        valor = valor.isoformat()
                    elif isinstance(valor, decimal.Decimal):
                        valor = float(valor)
                    elif isinstance(valor, bytes):
                        valor = valor.decode('utf-8')
                    row_dict[col] = valor
                results.append(row_dict)
            
            return JsonResponse({
                'success': True,
                'data': results,
                'total': len(results),
                'columns': columns,
                'consulta': consulta
            })
            
    except ConnectionDoesNotExist:
        return JsonResponse({
            'success': False,
            'error': 'No se pudo conectar a PostgreSQL'
        }, status=500)
    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)

def api_verificar_conexiones(request):
    """
    Vista de diagnóstico para verificar las conexiones.
    """
    from django.db import connections
    
    info = {}
    
    # Verificar conexión a PostgreSQL (ventas_db)
    try:
        with connections['ventas_db'].cursor() as cursor:
            cursor.execute("SELECT version();")
            pg_version = cursor.fetchone()[0]
            info['postgresql'] = {
                'conectado': True,
                'version': pg_version[:50]  # Primeros 50 caracteres
            }
    except Exception as e:
        info['postgresql'] = {'conectado': False, 'error': str(e)}
    
    # Verificar conexión a SQLite (default)
    try:
        with connections['default'].cursor() as cursor:
            cursor.execute("SELECT sqlite_version();")
            sqlite_version = cursor.fetchone()[0]
            info['sqlite'] = {
                'conectado': True,
                'version': sqlite_version
            }
    except Exception as e:
        info['sqlite'] = {'conectado': False, 'error': str(e)}
    
    return JsonResponse(info)