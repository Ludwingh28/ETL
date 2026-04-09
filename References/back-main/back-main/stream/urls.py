from django.contrib import admin
from django.urls import path, include
# from .views import api_ventas_mes, api_verificar_conexiones, api_sql_con_dict
from .views import api_login, api_consulta_dw, api_verificar_auth, api_logout, home

urlpatterns = [
    #path('api/ventas/mes/', api_ventas_mes, name='api-ventas-mes'),
    #path('api/verificar/', api_verificar_conexiones, name='api-verificar'),
    #path('api/sql/', api_sql_con_dict, name='api-sql-con-dict'),
    path('', home, name='home'),  # ← Agrega esta línea
    path('api/login/', api_login, name='api-login'),
    
    # Endpoints protegidos
    path('api/consulta/', api_consulta_dw, name='api-consulta-dw'),
    path('api/verificar-auth/', api_verificar_auth, name='api-verificar-auth'),
    path('api/logout/', api_logout, name='api-logout'),
]
