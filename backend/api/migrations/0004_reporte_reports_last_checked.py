from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0003_userprofile_last_seen'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name='userprofile',
            name='reports_last_checked',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.CreateModel(
            name='Reporte',
            fields=[
                ('id',          models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('tipo',        models.CharField(choices=[('BUG', 'Bug'), ('ERROR', 'Error'), ('SOLICITUD', 'Solicitud')], max_length=20)),
                ('subtipo',     models.CharField(blank=True, default='', max_length=30)),
                ('descripcion', models.TextField()),
                ('estado',      models.CharField(choices=[('PENDIENTE', 'Pendiente'), ('EN_CURSO', 'En curso'), ('ATENDIDA', 'Atendida')], default='PENDIENTE', max_length=20)),
                ('prioridad',   models.CharField(choices=[('BAJA', 'Baja'), ('MEDIA', 'Media'), ('ALTA', 'Alta'), ('CRITICA', 'Crítica')], default='MEDIA', max_length=10)),
                ('context',     models.JSONField(blank=True, default=dict)),
                ('created_at',  models.DateTimeField(auto_now_add=True)),
                ('updated_at',  models.DateTimeField(auto_now=True)),
                ('user',        models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='reportes', to=settings.AUTH_USER_MODEL)),
            ],
            options={'db_table': 'api_reporte', 'ordering': ['-created_at']},
        ),
    ]
