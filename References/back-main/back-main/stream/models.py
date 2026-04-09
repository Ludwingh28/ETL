# stream/models.py
from django.db import models
from django.utils import timezone

class Venta(models.Model):
    fecha = models.DateTimeField(default=timezone.now)
    monto = models.DecimalField(max_digits=10, decimal_places=2)
    producto = models.CharField(max_length=200, blank=True, null=True)
    cliente = models.CharField(max_length=200, blank=True, null=True)
    
    class Meta:
        managed = False  # ¡IMPORTANTE! No crear tabla en la BD de Django
        db_table = 'stream_ventas'  # Nombre exacto de la tabla en PostgreSQL
    
    def __str__(self):
        return f"{self.fecha.strftime('%d/%m/%Y')} - ${self.monto}"