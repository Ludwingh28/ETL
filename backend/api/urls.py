from django.urls import path
from . import views

urlpatterns = [
    # Auth
    path('auth/login/',           views.login,                name='login'),
    path('auth/logout/',          views.logout,               name='logout'),
    path('auth/me/',              views.me,                   name='me'),
    path('auth/refresh/',         views.token_refresh,        name='token-refresh'),
    path('auth/change-password/', views.auth_change_password, name='change-password'),

    # Admin – Usuarios
    path('admin/users/',                          views.admin_list_users,        name='admin-list-users'),
    path('admin/users/create/',                   views.admin_create_user,       name='admin-create-user'),
    path('admin/users/<int:user_id>/',            views.admin_update_user,       name='admin-update-user'),
    path('admin/users/<int:user_id>/permissions/', views.admin_update_permissions, name='admin-update-permissions'),
    path('admin/users/<int:user_id>/set-password/', views.admin_set_password,    name='admin-set-password'),

    # Dashboard Ventas
    path('dashboard/ventas/kpis/', views.dashboard_ventas_kpis, name='ventas-kpis'),
    path('dashboard/ventas/por-mes/', views.dashboard_ventas_por_mes, name='ventas-por-mes'),
    path('dashboard/ventas/por-canal/', views.dashboard_ventas_por_canal, name='ventas-por-canal'),

    # Dashboard Vendedores
    path('dashboard/vendedores/ranking/', views.dashboard_vendedores_ranking, name='vendedores-ranking'),

    # Dashboard Productos
    path('dashboard/productos/top/', views.dashboard_productos_top, name='productos-top'),
    path('dashboard/productos/por-grupo/', views.dashboard_productos_por_grupo, name='productos-por-grupo'),

    # Dashboard Nacional
    path('dashboard/nacional/periodos/',      views.dashboard_nacional_periodos,      name='nacional-periodos'),
    path('dashboard/nacional/kpis/',          views.dashboard_nacional_kpis,          name='nacional-kpis'),
    path('dashboard/nacional/tendencia/',     views.dashboard_nacional_tendencia,     name='nacional-tendencia'),
    path('dashboard/nacional/por-regional/',  views.dashboard_nacional_por_regional,  name='nacional-por-regional'),
    path('dashboard/nacional/por-canal/',     views.dashboard_nacional_por_canal,     name='nacional-por-canal'),
    path('dashboard/nacional/por-categoria/', views.dashboard_nacional_por_categoria, name='nacional-por-categoria'),

    # Dashboard Regionales  (param: regional=santa_cruz|cochabamba|la_paz)
    path('dashboard/regionales/kpis/',          views.dashboard_regionales_kpis,          name='regionales-kpis'),
    path('dashboard/regionales/tendencia/',     views.dashboard_regionales_tendencia,     name='regionales-tendencia'),
    path('dashboard/regionales/por-canal/',     views.dashboard_regionales_por_canal,     name='regionales-por-canal'),
    path('dashboard/regionales/por-categoria/', views.dashboard_regionales_por_categoria, name='regionales-por-categoria'),

    # Dashboard Canales / Regional  (params: regional, canal)
    path('dashboard/canales/kpis/',          views.dashboard_canales_kpis,          name='canales-kpis'),
    path('dashboard/canales/tendencia/',     views.dashboard_canales_tendencia,     name='canales-tendencia'),
    path('dashboard/canales/por-categoria/', views.dashboard_canales_por_categoria, name='canales-por-categoria'),
    path('dashboard/canales/por-sku/',       views.dashboard_canales_por_sku,       name='canales-por-sku'),

    # Dashboard Supervisores
    path('dashboard/supervisores/vendedores/', views.dashboard_supervisores_vendedores, name='supervisores-vendedores'),

    # Dashboard Unidades Vendidas
    path('dashboard/unidades/kpis/',          views.dashboard_unidades_kpis,          name='unidades-kpis'),
    path('dashboard/unidades/por-subgrupo/',  views.dashboard_unidades_por_subgrupo,  name='unidades-por-subgrupo'),
    path('dashboard/unidades/por-sku/',       views.dashboard_unidades_por_sku,       name='unidades-por-sku'),
    path('dashboard/unidades/vendedor-sku/',  views.dashboard_unidades_vendedor_sku,  name='unidades-vendedor-sku'),
    path('dashboard/unidades/por-vendedor/',  views.dashboard_unidades_por_vendedor,  name='unidades-por-vendedor'),

    # Dashboard Proveedores  (param: proveedor=PEPSICO|SOFTYS|DMUJER|APEGO|COLHER)
    path('dashboard/proveedor/kpis/',      views.dashboard_proveedor_kpis,      name='proveedor-kpis'),
    path('dashboard/proveedor/por-marca/', views.dashboard_proveedor_por_marca,  name='proveedor-por-marca'),
    path('dashboard/proveedor/tabla/',     views.dashboard_proveedor_tabla,      name='proveedor-tabla'),

    # Exportaciones XLSX
    path('exportar/ventas-combo-armado/', views.exportar_ventas_combo_armado, name='exportar-ventas-combo-armado'),
]
