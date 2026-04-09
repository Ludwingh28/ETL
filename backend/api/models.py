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

    class Meta:
        db_table  = 'api_userprofile'
        ordering  = ['user__first_name', 'user__last_name']
        verbose_name        = 'Perfil de usuario'
        verbose_name_plural = 'Perfiles de usuario'

    def __str__(self):
        return f"{self.user.username} — {self.cargo}"
