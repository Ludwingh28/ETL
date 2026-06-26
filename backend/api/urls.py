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

    # Dashboard Softys – Canales / Regional
    path('dashboard/softys-canales/por-grupo/',      views.dashboard_softys_canales_por_grupo, name='softys-canales-por-grupo'),
    path('dashboard/softys-canales/sku-tendencia/',  views.dashboard_softys_sku_tendencia,     name='softys-canales-sku-tendencia'),
    path('dashboard/softys-canales/historico-canales/', views.dashboard_softys_historico_canales, name='softys-historico-canales'),
    path('dashboard/softys-canales/historico-grupos/',  views.dashboard_softys_historico_grupos,  name='softys-historico-grupos'),
    path('dashboard/softys-canales/historico-skus/',    views.dashboard_softys_historico_skus,    name='softys-historico-skus'),
    path('dashboard/softys-canales/vendedores/',        views.dashboard_softys_vendedores,          name='softys-vendedores'),
    path('dashboard/softys-canales/clientes-semana/',  views.dashboard_softys_clientes_semana,      name='softys-clientes-semana'),
    path('dashboard/softys-canales/sku-por-cliente/',  views.dashboard_softys_sku_por_cliente,      name='softys-sku-por-cliente'),
    path('dashboard/softys-canales/clientes-mes/', views.dashboard_softys_clientes_mes, name='softys-clientes-mes'),
    path('dashboard/softys-canales/export/',       views.dashboard_softys_export,       name='softys-export'),
    path('dashboard/softys-canales/kpis/',          views.dashboard_softys_canales_kpis,          name='softys-canales-kpis'),
    path('dashboard/softys-canales/tendencia/',     views.dashboard_softys_canales_tendencia,     name='softys-canales-tendencia'),
    path('dashboard/softys-canales/por-regional/',  views.dashboard_softys_canales_por_regional,  name='softys-canales-por-regional'),
    path('dashboard/softys-canales/por-sku/',       views.dashboard_softys_canales_por_sku,       name='softys-canales-por-sku'),

    # Dashboard Supervisores
    path('dashboard/supervisores/vendedores/',        views.dashboard_supervisores_vendedores,         name='supervisores-vendedores'),
    path('dashboard/supervisores/liquidaciones/',     views.dashboard_supervisores_liquidaciones,       name='supervisores-liquidaciones'),
    path('dashboard/supervisores/supervisor-lista/',  views.dashboard_supervisores_supervisor_lista,    name='supervisores-supervisor-lista'),

    # Dashboard Preventas
    path('dashboard/preventas/kpis/',              views.dashboard_preventas_kpis,               name='preventas-kpis'),
    path('dashboard/preventas/por-canal/',          views.dashboard_preventas_por_canal,           name='preventas-por-canal'),
    path('dashboard/preventas/por-vendedor/',      views.dashboard_preventas_por_vendedor,        name='preventas-por-vendedor'),
    path('dashboard/preventas/top-faltantes/',     views.dashboard_preventas_top_faltantes,       name='preventas-top-faltantes'),
    path('dashboard/preventas/supervisores/',      views.dashboard_preventas_supervisores_lista,  name='preventas-supervisores'),

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

    # Dashboard Información Rutas
    path('dashboard/informacion-rutas/marcas/',     views.dashboard_marcas_lista,                 name='informacion-rutas-marcas'),
    path('dashboard/informacion-rutas/',            views.dashboard_informacion_rutas,            name='informacion-rutas'),
    path('dashboard/informacion-rutas/detalle/',    views.dashboard_informacion_rutas_detalle,    name='informacion-rutas-detalle'),
    path('dashboard/informacion-rutas/categorias/', views.dashboard_informacion_rutas_categorias, name='informacion-rutas-categorias'),
    path('dashboard/informacion-rutas/skus/',            views.dashboard_informacion_rutas_skus,            name='informacion-rutas-skus'),
    path('dashboard/informacion-rutas/clientes/',        views.dashboard_informacion_rutas_clientes,        name='informacion-rutas-clientes'),
    path('dashboard/informacion-rutas/cliente-detalle/', views.dashboard_informacion_rutas_cliente_detalle, name='informacion-rutas-cliente-detalle'),

    # Dashboard Tendencia Estacional
    path('dashboard/tendencia-estacional/', views.dashboard_tendencia_estacional, name='tendencia-estacional'),
    path('dashboard/canales/lista/',        views.dashboard_canales_lista,         name='canales-lista'),

    # Tabla Matriz
    path('dashboard/matriz/datos/',          views.dashboard_matriz_datos,          name='matriz-datos'),

    # Almacenes
    path('dashboard/almacenes/lista/', views.dashboard_almacenes_lista, name='almacenes-lista'),

    # Dashboard Ficha de SKU
    path('dashboard/ficha-sku/marcas/',     views.dashboard_ficha_sku_marcas,     name='ficha-sku-marcas'),
    path('dashboard/ficha-sku/buscar/',     views.dashboard_ficha_sku_buscar,     name='ficha-sku-buscar'),
    path('dashboard/ficha-sku/ventas/',     views.dashboard_ficha_sku_ventas,     name='ficha-sku-ventas'),
    path('dashboard/ficha-sku/precios/',    views.dashboard_ficha_sku_precios,    name='ficha-sku-precios'),
    path('dashboard/ficha-sku/inventario/', views.dashboard_ficha_sku_inventario, name='ficha-sku-inventario'),

    # Dashboard Inventario por Almacén
    path('dashboard/inventario-almacen/datos/', views.dashboard_inventario_almacen, name='inventario-almacen-datos'),

    # Dashboard Distribución de Rutas
    path('dashboard/distribucion-rutas/opciones/',         views.dashboard_rutas_opciones,        name='rutas-opciones'),
    path('dashboard/distribucion-rutas/buscar/',           views.dashboard_rutas_buscar,           name='rutas-buscar'),
    path('dashboard/distribucion-rutas/info/',             views.dashboard_rutas_info,             name='rutas-info'),
    path('dashboard/distribucion-rutas/todos-poligonos/',  views.dashboard_rutas_todos_poligonos,  name='rutas-todos-poligonos'),

    # Dashboard Comportamiento Productos
    path('dashboard/comportamiento-productos/opciones/',  views.dashboard_comportamiento_opciones,          name='comportamiento-opciones'),
    path('dashboard/comportamiento-productos/productos/', views.dashboard_comportamiento_productos_buscar,   name='comportamiento-productos-buscar'),
    path('dashboard/comportamiento-productos/grafico1/',  views.dashboard_comportamiento_grafico1,           name='comportamiento-grafico1'),
    path('dashboard/comportamiento-productos/grafico2/',  views.dashboard_comportamiento_grafico2,           name='comportamiento-grafico2'),
    path('dashboard/comportamiento-productos/tabla/',     views.dashboard_comportamiento_tabla,              name='comportamiento-tabla'),

    # Exportaciones XLSX
    path('exportar/ventas-combo-armado/',    views.exportar_ventas_combo_armado,    name='exportar-ventas-combo-armado'),
    path('exportar/clientes-sin-compra/',    views.exportar_clientes_sin_compra,    name='exportar-clientes-sin-compra'),
]
