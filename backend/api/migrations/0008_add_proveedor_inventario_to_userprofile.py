from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0007_add_listas_precios_to_userprofile'),
    ]

    operations = [
        migrations.AddField(
            model_name='userprofile',
            name='proveedor_asignado',
            field=models.CharField(blank=True, default='', max_length=200),
        ),
        migrations.AddField(
            model_name='userprofile',
            name='almacenes_habilitados',
            field=models.JSONField(blank=True, default=list),
        ),
    ]
