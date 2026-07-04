# Los modelos del DW usan managed=False (tablas ya existen en PostgreSQL).
# Los modelos del sistema Django (auth, tokens) usan la BD 'default' (SQLite).

from django.contrib.auth.models import User
from django.db import models


class UserProfile(models.Model):
    """
    Perfil extendido del usuario del sistema.
    Almacena cargo, regional y permisos de dashboards.
    """
    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name='profile',
    )
    cargo    = models.CharField(max_length=100, blank=True, default='')
    regional = models.CharField(max_length=100, blank=True, default='')
    canal    = models.CharField(max_length=100, blank=True, default='')

    # Lista de IDs de dashboards que el usuario puede ver,
    # ej. ["nacional", "regionales", "canales"]
    dashboard_permissions = models.JSONField(default=list, blank=True)

    last_seen             = models.DateTimeField(null=True, blank=True)
    reports_last_checked  = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table  = 'api_userprofile'
        ordering  = ['user__first_name', 'user__last_name']
        verbose_name        = 'Perfil de usuario'
        verbose_name_plural = 'Perfiles de usuario'

    def __str__(self):
        return f"{self.user.username} — {self.cargo}"


class Reporte(models.Model):
    TIPO_CHOICES = [
        ('BUG',       'Bug'),
        ('ERROR',     'Error'),
        ('SOLICITUD', 'Solicitud'),
    ]
    SUBTIPO_CHOICES = [
        # Bug (sin subtipo obligatorio, pero se puede especificar)
        ('BUG_GENERAL',          'Bug general'),
        # Error
        ('ERROR_PERMISOS',       'Error de permisos'),
        ('ERROR_CALCULO',        'Error de cálculo'),
        ('ERROR_MEDIDA',         'Error de medida'),
        ('ERROR_TIPO_VARIABLE',   'Error de tipo de variable'),
        ('ERROR_VARIACION_MONTO', 'Variación de monto'),
        # Solicitud
        ('SOL_NUEVO_CALCULO',    'Solicitud de nuevo cálculo'),
        ('SOL_AFINACION',        'Solicitud de afinación de medida/cálculo'),
        ('SOL_NUEVO_DASHBOARD',  'Solicitud de nuevo dashboard'),
    ]
    ESTADO_CHOICES = [
        ('PENDIENTE', 'Pendiente'),
        ('EN_CURSO',  'En curso'),
        ('ATENDIDA',  'Atendida'),
    ]
    PRIORIDAD_CHOICES = [
        ('BAJA',    'Baja'),
        ('MEDIA',   'Media'),
        ('ALTA',    'Alta'),
        ('CRITICA', 'Crítica'),
    ]

    user        = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='reportes')
    tipo        = models.CharField(max_length=20,  choices=TIPO_CHOICES)
    subtipo     = models.CharField(max_length=30,  choices=SUBTIPO_CHOICES, blank=True, default='')
    descripcion = models.TextField()
    estado      = models.CharField(max_length=20,  choices=ESTADO_CHOICES,  default='PENDIENTE')
    prioridad   = models.CharField(max_length=10,  choices=PRIORIDAD_CHOICES, default='MEDIA')
    context     = models.JSONField(default=dict, blank=True)
    created_at  = models.DateTimeField(auto_now_add=True)
    updated_at  = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'api_reporte'
        ordering = ['-created_at']

    _PRIORIDAD_POR_TIPO = {
        'BUG':       'ALTA',
        'ERROR':     'MEDIA',
        'SOLICITUD': 'BAJA',
    }

    def save(self, *args, **kwargs):
        # Al crear, asignar prioridad según tipo si no fue indicada explícitamente
        if not self.pk and self.prioridad == 'MEDIA':
            self.prioridad = self._PRIORIDAD_POR_TIPO.get(self.tipo, 'MEDIA')
        super().save(*args, **kwargs)

    def __str__(self):
        return f"[{self.tipo}] {self.user} — {self.created_at:%Y-%m-%d}"
