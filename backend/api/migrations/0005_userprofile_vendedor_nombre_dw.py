from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0004_reporte_reports_last_checked'),
    ]

    operations = [
        migrations.AddField(
            model_name='userprofile',
            name='vendedor_nombre_dw',
            field=models.CharField(blank=True, default='', max_length=200),
        ),
    ]
