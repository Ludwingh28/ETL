

# ─────────────────────────────────────────
#  AUTH – CAMBIAR CONTRASEÑA PROPIA
# ─────────────────────────────────────────

@api_view(['POST'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def auth_change_password(request):
    user             = request.user
    current_password = request.data.get('current_password', '')
    new_password     = request.data.get('new_password', '')

    if not current_password or not new_password:
        return JsonResponse(
            {'success': False, 'error': 'Campos requeridos'},
            status=status.HTTP_400_BAD_REQUEST
        )
    if not user.check_password(current_password):
        return JsonResponse(
            {'success': False, 'error': 'La contrasena actual es incorrecta'},
            status=status.HTTP_400_BAD_REQUEST
        )
    if len(new_password) < 6:
        return JsonResponse(
            {'success': False, 'error': 'La nueva contrasena debe tener al menos 6 caracteres'},
            status=status.HTTP_400_BAD_REQUEST
        )

    user.set_password(new_password)
    user.save()
    user.auth_token.delete()
    new_token, _ = Token.objects.get_or_create(user=user)
    return JsonResponse({'success': True, 'token': new_token.key})


# ─────────────────────────────────────────
#  ADMIN – GESTION DE USUARIOS
# ─────────────────────────────────────────

ADMIN_CARGOS = {'Administrador de Sistema', 'Subadministrador de Sistemas'}


@api_view(['GET'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def admin_list_users(request):
    if not _is_admin(request.user):
        return JsonResponse({'success': False, 'error': 'Sin permisos'}, status=403)
    users = User.objects.filter(is_superuser=False).order_by('first_name', 'last_name', 'username')
    return JsonResponse([_serialize_user(u) for u in users], safe=False)


@api_view(['POST'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def admin_create_user(request):
    if not _is_admin(request.user):
        return JsonResponse({'success': False, 'error': 'Sin permisos'}, status=403)

    data                  = request.data
    username              = data.get('username', '').strip()
    first_name            = data.get('first_name', '').strip()
    last_name             = data.get('last_name', '').strip()
    email                 = data.get('email', '').strip()
    cargo                 = data.get('cargo', '')
    regional              = data.get('regional', '')
    password              = data.get('password', '')
    dashboard_permissions = data.get('dashboard_permissions', [])

    if not username:
        return JsonResponse({'success': False, 'error': 'El nombre de usuario es requerido'}, status=400)
    if not password or len(password) < 6:
        return JsonResponse({'success': False, 'error': 'La contrasena debe tener al menos 6 caracteres'}, status=400)
    if User.objects.filter(username=username).exists():
        return JsonResponse({'success': False, 'error': 'El usuario ya existe'}, status=400)

    new_user = User.objects.create_user(
        username=username,
        first_name=first_name,
        last_name=last_name,
        email=email,
        password=password,
        is_staff=(cargo in ADMIN_CARGOS),
    )
    UserProfile.objects.create(
        user=new_user,
        cargo=cargo,
        regional=regional,
        dashboard_permissions=dashboard_permissions if isinstance(dashboard_permissions, list) else [],
    )
    return JsonResponse({'success': True, 'user': _serialize_user(new_user)}, status=201)


@api_view(['PATCH'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def admin_update_user(request, user_id):
    if not _is_admin(request.user):
        return JsonResponse({'success': False, 'error': 'Sin permisos'}, status=403)
    try:
        target = User.objects.get(pk=user_id, is_superuser=False)
    except User.DoesNotExist:
        return JsonResponse({'success': False, 'error': 'Usuario no encontrado'}, status=404)

    data = request.data
    if 'first_name' in data:
        target.first_name = data['first_name'].strip()
    if 'last_name' in data:
        target.last_name = data['last_name'].strip()
    if 'email' in data:
        target.email = data['email'].strip()
    if 'is_active' in data:
        target.is_active = bool(data['is_active'])
    cargo = data.get('cargo')
    if cargo is not None:
        target.is_staff = cargo in ADMIN_CARGOS
    target.save()

    profile = _get_or_create_profile(target)
    if cargo is not None:
        profile.cargo = cargo
    if 'regional' in data:
        profile.regional = data['regional']
    profile.save()

    return JsonResponse({'success': True, 'user': _serialize_user(target)})


@api_view(['PATCH'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def admin_update_permissions(request, user_id):
    if not _is_admin(request.user):
        return JsonResponse({'success': False, 'error': 'Sin permisos'}, status=403)
    try:
        target = User.objects.get(pk=user_id, is_superuser=False)
    except User.DoesNotExist:
        return JsonResponse({'success': False, 'error': 'Usuario no encontrado'}, status=404)

    perms = request.data.get('dashboard_permissions', [])
    if not isinstance(perms, list):
        return JsonResponse({'success': False, 'error': 'dashboard_permissions debe ser una lista'}, status=400)

    profile = _get_or_create_profile(target)
    profile.dashboard_permissions = perms
    profile.save()
    return JsonResponse({'success': True, 'user': _serialize_user(target)})


@api_view(['POST'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def admin_set_password(request, user_id):
    if not _is_admin(request.user):
        return JsonResponse({'success': False, 'error': 'Sin permisos'}, status=403)
    try:
        target = User.objects.get(pk=user_id, is_superuser=False)
    except User.DoesNotExist:
        return JsonResponse({'success': False, 'error': 'Usuario no encontrado'}, status=404)

    new_password = request.data.get('new_password', '')
    if not new_password or len(new_password) < 6:
        return JsonResponse({'success': False, 'error': 'La contrasena debe tener al menos 6 caracteres'}, status=400)

    target.set_password(new_password)
    target.save()
    Token.objects.filter(user=target).delete()
    return JsonResponse({'success': True, 'message': 'Contrasena actualizada correctamente'})
