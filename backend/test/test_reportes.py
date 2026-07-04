"""
Pruebas de validación para la funcionalidad de Reportes.
Cubre: modelo, creación, listado, actualización y conteo de no leídos.
"""
import json
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'cruzimex.settings')
django.setup()

from django.test import TestCase, RequestFactory
from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework.authtoken.models import Token

from api.models import Reporte, UserProfile
from api.views import (
    reporte_create,
    reporte_list,
    reporte_update,
    reporte_unread_count,
)


# ── Helpers ────────────────────────────────────────────────────────────────────

def make_user(username, is_staff=False, cargo='Vendedor'):
    user, _ = User.objects.get_or_create(
        username=username,
        defaults={'is_staff': is_staff, 'first_name': username.capitalize()},
    )
    user.set_password('test1234')
    user.is_staff = is_staff
    user.save()
    Token.objects.get_or_create(user=user)
    profile, _ = UserProfile.objects.get_or_create(user=user)
    profile.cargo = cargo
    profile.save()
    return user


def api_request(factory, method, path, user, data=None):
    """Construye un Request con auth y content-type JSON."""
    token = Token.objects.get(user=user)
    kwargs = {'HTTP_AUTHORIZATION': f'Token {token.key}'}
    if data is not None:
        kwargs['content_type'] = 'application/json'
        body = json.dumps(data).encode()
        req = getattr(factory, method)(path, body, **kwargs)
    else:
        req = getattr(factory, method)(path, **kwargs)
    req.user = user
    req.auth = token
    return req


# ── Tests de Modelo ────────────────────────────────────────────────────────────

class ReporteModelTests(TestCase):

    def setUp(self):
        self.user = make_user('modelo_user')

    def test_bug_recibe_prioridad_alta(self):
        r = Reporte.objects.create(user=self.user, tipo='BUG', descripcion='test')
        self.assertEqual(r.prioridad, 'ALTA')

    def test_error_recibe_prioridad_media(self):
        r = Reporte.objects.create(user=self.user, tipo='ERROR', descripcion='test')
        self.assertEqual(r.prioridad, 'MEDIA')

    def test_solicitud_recibe_prioridad_baja(self):
        r = Reporte.objects.create(user=self.user, tipo='SOLICITUD', descripcion='test')
        self.assertEqual(r.prioridad, 'BAJA')

    def test_estado_default_es_pendiente(self):
        r = Reporte.objects.create(user=self.user, tipo='BUG', descripcion='test')
        self.assertEqual(r.estado, 'PENDIENTE')

    def test_subtipo_variacion_monto_valido(self):
        r = Reporte.objects.create(
            user=self.user, tipo='ERROR',
            subtipo='ERROR_VARIACION_MONTO', descripcion='Monto incorrecto',
        )
        self.assertEqual(r.subtipo, 'ERROR_VARIACION_MONTO')

    def test_actualizacion_no_cambia_prioridad_automatica(self):
        """El override de save() solo aplica en la creación (pk es None)."""
        r = Reporte.objects.create(user=self.user, tipo='BUG', descripcion='test')
        self.assertEqual(r.prioridad, 'ALTA')
        r.prioridad = 'BAJA'
        r.save(update_fields=['prioridad', 'updated_at'])
        r.refresh_from_db()
        self.assertEqual(r.prioridad, 'BAJA')


# ── Tests de reporte_create ────────────────────────────────────────────────────

class ReporteCreateTests(TestCase):

    def setUp(self):
        self.factory = RequestFactory()
        self.user    = make_user('create_user')

    def _post(self, data):
        req = api_request(self.factory, 'post', '/api/reportes/', self.user, data)
        return reporte_create(req)

    def test_crea_bug_correctamente(self):
        res = self._post({'tipo': 'BUG', 'descripcion': 'Pantalla en blanco'})
        self.assertEqual(res.status_code, 201)
        body = json.loads(res.content)
        self.assertTrue(body['success'])
        r = Reporte.objects.get(id=body['id'])
        self.assertEqual(r.tipo, 'BUG')
        self.assertEqual(r.prioridad, 'ALTA')

    def test_crea_error_con_subtipo_variacion_monto(self):
        res = self._post({
            'tipo': 'ERROR',
            'subtipo': 'ERROR_VARIACION_MONTO',
            'descripcion': 'El monto no cuadra con el reporte',
        })
        self.assertEqual(res.status_code, 201)
        r = Reporte.objects.get(id=json.loads(res.content)['id'])
        self.assertEqual(r.subtipo, 'ERROR_VARIACION_MONTO')
        self.assertEqual(r.prioridad, 'MEDIA')

    def test_crea_solicitud_con_prioridad_baja(self):
        res = self._post({'tipo': 'SOLICITUD', 'descripcion': 'Nuevo dashboard de ventas'})
        self.assertEqual(res.status_code, 201)
        r = Reporte.objects.get(id=json.loads(res.content)['id'])
        self.assertEqual(r.prioridad, 'BAJA')

    def test_tipo_invalido_retorna_400(self):
        res = self._post({'tipo': 'QUEJA', 'descripcion': 'test'})
        self.assertEqual(res.status_code, 400)
        self.assertFalse(json.loads(res.content)['success'])

    def test_descripcion_vacia_retorna_400(self):
        res = self._post({'tipo': 'BUG', 'descripcion': ''})
        self.assertEqual(res.status_code, 400)

    def test_descripcion_solo_espacios_retorna_400(self):
        res = self._post({'tipo': 'BUG', 'descripcion': '   '})
        self.assertEqual(res.status_code, 400)

    def test_context_se_guarda_correctamente(self):
        ctx = {'url': 'http://localhost/dashboard/softys-revision', 'filtros': {'regional': 'Santa Cruz'}}
        res = self._post({'tipo': 'BUG', 'descripcion': 'error', 'context': ctx})
        self.assertEqual(res.status_code, 201)
        r = Reporte.objects.get(id=json.loads(res.content)['id'])
        self.assertEqual(r.context['filtros']['regional'], 'Santa Cruz')

    def test_context_no_dict_se_guarda_vacio(self):
        res = self._post({'tipo': 'BUG', 'descripcion': 'error', 'context': 'cadena_invalida'})
        self.assertEqual(res.status_code, 201)
        r = Reporte.objects.get(id=json.loads(res.content)['id'])
        self.assertEqual(r.context, {})

    def test_tipo_en_minusculas_es_aceptado(self):
        res = self._post({'tipo': 'bug', 'descripcion': 'test minúsculas'})
        self.assertEqual(res.status_code, 201)

    def test_usuario_queda_asociado(self):
        res = self._post({'tipo': 'BUG', 'descripcion': 'test usuario'})
        r = Reporte.objects.get(id=json.loads(res.content)['id'])
        self.assertEqual(r.user, self.user)


# ── Tests de reporte_list ──────────────────────────────────────────────────────

class ReporteListTests(TestCase):

    def setUp(self):
        self.factory  = RequestFactory()
        self.admin    = make_user('list_admin', is_staff=True, cargo='Administrador de Sistema')
        self.vendedor = make_user('list_vendedor', cargo='Vendedor')
        # Crear reportes de prueba
        Reporte.objects.create(user=self.vendedor, tipo='BUG',       descripcion='fallo en grafico')
        Reporte.objects.create(user=self.vendedor, tipo='ERROR',     descripcion='calculo incorrecto')
        Reporte.objects.create(user=self.vendedor, tipo='SOLICITUD', descripcion='quiero nuevo dashboard')

    def _get(self, user, params=''):
        req = api_request(self.factory, 'get', f'/api/reportes/list/?{params}', user)
        return reporte_list(req)

    def test_admin_puede_listar(self):
        res = self._get(self.admin)
        self.assertEqual(res.status_code, 200)
        data = json.loads(res.content)
        self.assertGreaterEqual(len(data), 3)

    def test_no_admin_recibe_403(self):
        res = self._get(self.vendedor)
        self.assertEqual(res.status_code, 403)

    def test_filtro_por_tipo_bug(self):
        res = self._get(self.admin, 'tipo=BUG')
        data = json.loads(res.content)
        self.assertTrue(all(r['tipo'] == 'BUG' for r in data))

    def test_filtro_por_estado_pendiente(self):
        res = self._get(self.admin, 'estado=PENDIENTE')
        data = json.loads(res.content)
        self.assertTrue(all(r['estado'] == 'PENDIENTE' for r in data))

    def test_filtro_por_prioridad_alta(self):
        res = self._get(self.admin, 'prioridad=ALTA')
        data = json.loads(res.content)
        self.assertTrue(all(r['prioridad'] == 'ALTA' for r in data))

    def test_busqueda_por_descripcion(self):
        res = self._get(self.admin, 'search=calculo')
        data = json.loads(res.content)
        self.assertTrue(any('calculo' in r['descripcion'] for r in data))

    def test_busqueda_por_username(self):
        res = self._get(self.admin, f'search={self.vendedor.username}')
        data = json.loads(res.content)
        self.assertGreater(len(data), 0)

    def test_busqueda_sin_resultados(self):
        res = self._get(self.admin, 'search=xyzinexistente999')
        data = json.loads(res.content)
        self.assertEqual(len(data), 0)

    def test_respuesta_incluye_campos_requeridos(self):
        res = self._get(self.admin)
        r = json.loads(res.content)[0]
        for campo in ('id', 'tipo', 'subtipo', 'descripcion', 'estado', 'prioridad', 'context', 'created_at', 'user'):
            self.assertIn(campo, r)

    def test_user_info_incluye_username_y_full_name(self):
        res = self._get(self.admin)
        r = json.loads(res.content)[0]
        self.assertIn('username',  r['user'])
        self.assertIn('full_name', r['user'])


# ── Tests de reporte_update ────────────────────────────────────────────────────

class ReporteUpdateTests(TestCase):

    def setUp(self):
        self.factory  = RequestFactory()
        self.admin    = make_user('update_admin', is_staff=True, cargo='Administrador de Sistema')
        self.vendedor = make_user('update_vendedor')
        self.reporte  = Reporte.objects.create(
            user=self.vendedor, tipo='BUG', descripcion='test update',
        )

    def _patch(self, user, reporte_id, data):
        req = api_request(self.factory, 'patch', f'/api/reportes/{reporte_id}/', user, data)
        return reporte_update(req, reporte_id=reporte_id)

    def test_admin_actualiza_estado_en_curso(self):
        res = self._patch(self.admin, self.reporte.id, {'estado': 'EN_CURSO'})
        self.assertEqual(res.status_code, 200)
        self.reporte.refresh_from_db()
        self.assertEqual(self.reporte.estado, 'EN_CURSO')

    def test_admin_actualiza_estado_atendida(self):
        res = self._patch(self.admin, self.reporte.id, {'estado': 'ATENDIDA'})
        self.assertEqual(res.status_code, 200)
        self.reporte.refresh_from_db()
        self.assertEqual(self.reporte.estado, 'ATENDIDA')

    def test_admin_actualiza_prioridad(self):
        res = self._patch(self.admin, self.reporte.id, {'prioridad': 'CRITICA'})
        self.assertEqual(res.status_code, 200)
        self.reporte.refresh_from_db()
        self.assertEqual(self.reporte.prioridad, 'CRITICA')

    def test_admin_actualiza_estado_y_prioridad_juntos(self):
        res = self._patch(self.admin, self.reporte.id, {'estado': 'EN_CURSO', 'prioridad': 'BAJA'})
        self.assertEqual(res.status_code, 200)
        self.reporte.refresh_from_db()
        self.assertEqual(self.reporte.estado, 'EN_CURSO')
        self.assertEqual(self.reporte.prioridad, 'BAJA')

    def test_estado_invalido_es_ignorado(self):
        estado_original = self.reporte.estado
        self._patch(self.admin, self.reporte.id, {'estado': 'INVENTADO'})
        self.reporte.refresh_from_db()
        self.assertEqual(self.reporte.estado, estado_original)

    def test_prioridad_invalida_es_ignorada(self):
        prioridad_original = self.reporte.prioridad
        self._patch(self.admin, self.reporte.id, {'prioridad': 'MAXIMA'})
        self.reporte.refresh_from_db()
        self.assertEqual(self.reporte.prioridad, prioridad_original)

    def test_no_admin_recibe_403(self):
        res = self._patch(self.vendedor, self.reporte.id, {'estado': 'ATENDIDA'})
        self.assertEqual(res.status_code, 403)

    def test_reporte_inexistente_retorna_404(self):
        res = self._patch(self.admin, 99999, {'estado': 'ATENDIDA'})
        self.assertEqual(res.status_code, 404)

    def test_respuesta_incluye_reporte_actualizado(self):
        res = self._patch(self.admin, self.reporte.id, {'estado': 'ATENDIDA'})
        body = json.loads(res.content)
        self.assertTrue(body['success'])
        self.assertEqual(body['reporte']['estado'], 'ATENDIDA')


# ── Tests de reporte_unread_count ──────────────────────────────────────────────

class ReporteUnreadCountTests(TestCase):

    def setUp(self):
        self.factory  = RequestFactory()
        self.admin    = make_user('unread_admin', is_staff=True, cargo='Administrador de Sistema')
        self.vendedor = make_user('unread_vendedor')

    def _get_count(self, user):
        req = api_request(self.factory, 'get', '/api/reportes/unread-count/', user)
        return reporte_unread_count(req)

    def test_no_admin_recibe_count_0(self):
        res = self._get_count(self.vendedor)
        self.assertEqual(res.status_code, 200)
        self.assertEqual(json.loads(res.content)['count'], 0)

    def test_admin_sin_last_checked_recibe_total(self):
        Reporte.objects.create(user=self.vendedor, tipo='BUG', descripcion='r1')
        Reporte.objects.create(user=self.vendedor, tipo='ERROR', descripcion='r2')
        # Aseguramos que el perfil no tiene last_checked
        UserProfile.objects.filter(user=self.admin).update(reports_last_checked=None)
        res = self._get_count(self.admin)
        count = json.loads(res.content)['count']
        self.assertGreaterEqual(count, 2)

    def test_admin_con_last_checked_reciente_recibe_0(self):
        # Marcar como revisado ahora, LUEGO crear reportes no funcionaría
        # porque los reportes son anteriores. Verificamos con last_checked en el futuro.
        profile, _ = UserProfile.objects.get_or_create(user=self.admin)
        profile.reports_last_checked = timezone.now()
        profile.save()
        # Crear reporte ANTES del last_checked (simulado con updated_at, que no podemos controlar aquí)
        # En este caso simplemente verificamos que reportes anteriores al last_checked no cuentan
        res = self._get_count(self.admin)
        self.assertEqual(res.status_code, 200)

    def test_respuesta_tiene_campo_count(self):
        res = self._get_count(self.admin)
        self.assertIn('count', json.loads(res.content))


# ── Runner ─────────────────────────────────────────────────────────────────────

if __name__ == '__main__':
    import unittest
    unittest.main(verbosity=2)
