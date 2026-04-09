from datetime import timedelta

from django.conf import settings
from django.utils import timezone
from rest_framework.authentication import TokenAuthentication
from rest_framework.exceptions import AuthenticationFailed

TOKEN_EXPIRY_HOURS = getattr(settings, "TOKEN_EXPIRY_HOURS", 8)


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
        if timezone.now() > token.created + expiry:
            token.delete()
            raise AuthenticationFailed(
                "Sesión expirada. Por favor iniciá sesión nuevamente."
            )

        return (token.user, token)
