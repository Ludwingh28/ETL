from django.contrib import admin
from .models import UserProfile, Reporte


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display   = ['user', 'cargo', 'regional', 'canal', 'proveedor_asignado', 'last_seen']
    search_fields  = ['user__username', 'user__first_name', 'user__last_name', 'cargo', 'proveedor_asignado']
    list_filter    = ['cargo', 'regional', 'proveedor_asignado']
    readonly_fields = ['last_seen', 'reports_last_checked']
    fieldsets = (
        ('Usuario', {
            'fields': ('user', 'cargo', 'regional', 'canal', 'vendedor_nombre_dw'),
        }),
        ('Permisos', {
            'fields': ('dashboard_permissions', 'listas_precios'),
        }),
        ('Acceso proveedor (inventario)', {
            'description': (
                'Si se asigna un proveedor, el usuario solo verá sus productos en el dashboard de '
                'Inventario. Los almacenes habilitados limitan qué columnas se muestran (dejar vacío = todos los habilitados por el proveedor).'
            ),
            'fields': ('proveedor_asignado', 'almacenes_habilitados'),
        }),
        ('Actividad', {
            'fields': ('last_seen', 'reports_last_checked'),
            'classes': ('collapse',),
        }),
    )


@admin.register(Reporte)
class ReporteAdmin(admin.ModelAdmin):
    list_display  = ['user', 'tipo', 'subtipo', 'estado', 'prioridad', 'created_at']
    list_filter   = ['tipo', 'estado', 'prioridad']
    search_fields = ['user__username', 'descripcion']
    readonly_fields = ['created_at', 'updated_at']
