class SecurityHeadersMiddleware:
    """Agrega headers de seguridad a todas las respuestas HTTP."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)

        # Content Security Policy — bloquea XSS e inyección de recursos externos
        response['Content-Security-Policy'] = (
            "default-src 'none'; "
            "script-src 'self'; "
            "connect-src 'self'; "
            "img-src 'self' data:; "
            "style-src 'self' 'unsafe-inline'; "
            "font-src 'self'; "
            "frame-ancestors 'none';"
        )

        # Impide que el navegador cachee respuestas de la API con datos sensibles
        if request.path.startswith('/api/'):
            response['Cache-Control'] = 'no-store, no-cache, must-revalidate, private'
            response['Pragma']        = 'no-cache'

        # Permiso de referrer mínimo
        response['Referrer-Policy'] = 'strict-origin-when-cross-origin'

        # Bloquea acceso a funciones del navegador no necesarias
        response['Permissions-Policy'] = (
            'camera=(), microphone=(), geolocation=(), payment=()'
        )

        return response
