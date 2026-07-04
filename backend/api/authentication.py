from datetime import timedelta

from django.conf import settings
from django.utils import timezone
from rest_framework.authentication import TokenAuthentication
from rest_framework.exceptions import AuthenticationFailed

TOKEN_EXPIRY_HOURS = getattr(settings, "TOKEN_EXPIRY_HOURS", 8)
_LAST_SEEN_UPDATE_SECONDS = 60  # actualiza last_seen como máximo 1 vez por minuto


class ExpiringTokenAuthentication(TokenAuthentication):
    """TokenAuthentication con expiración automática de sesión."""

    def authenticate_credentials(self, key):
        model = self.get_model()
        try:
            token = model.objects.select_related("user").get(key=key)
        except model.DoesNotExist:
            raise AuthenticationFailed("Token inválido.")

        if not token.user.is_active:
            raise AuthenticationFailed("Usuario inactivo o deshabilitado.")

        expiry = timedelta(hours=TOKEN_EXPIRY_HOURS)
        now = timezone.now()
        if now > token.created + expiry:
            token.delete()
            raise AuthenticationFailed(
                "Sesión expirada. Por favor iniciá sesión nuevamente."
            )

        # Actualizar last_seen con throttle de 1 minuto para evitar writes excesivos
        self._update_last_seen(token.user, now)

        return (token.user, token)

    @staticmethod
    def _update_last_seen(user, now):
        from .models import UserProfile
        from django.db.models import Q
        threshold = now - timedelta(seconds=_LAST_SEEN_UPDATE_SECONDS)
        updated = UserProfile.objects.filter(
            user=user
        ).filter(
            Q(last_seen__isnull=True) | Q(last_seen__lte=threshold)
        ).update(last_seen=now)
        if not updated:
            # Perfil no existe o throttle activo — crear perfil si es necesario
            UserProfile.objects.get_or_create(user=user)
            UserProfile.objects.filter(
                user=user
            ).filter(
                Q(last_seen__isnull=True) | Q(last_seen__lte=threshold)
            ).update(last_seen=now)
