#!/usr/bin/env python
import django
import os

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'cruzimex.settings')
django.setup()

from django.db import connections
from datetime import datetime

# Test the specific query that's failing
anho = 2026
mes = 3

try:
    with connections['dw'].cursor() as cursor:
        sql = """
            SELECT
                COALESCE(dcp.grupo_descripcion, 'Sin Categoría') AS categoria,
                COALESCE(SUM(fv.venta_neta), 0)                  AS venta_neta,
                COALESCE(SUM(fv.cantidad), 0)                    AS cantidad,
                COUNT(DISTINCT fv.producto_sk)                   AS productos
            FROM dw.fact_ventas fv
            JOIN dw.dim_fecha df                         ON fv.fecha_sk    = df.fecha_sk
            JOIN dw.dim_producto dp                      ON fv.producto_sk = dp.producto_sk
            LEFT JOIN dw.dim_categoria_producto dcp      ON dp.categoria_sk = dcp.categoria_sk
            WHERE df.anho = %s AND df.mes_numero = %s
            GROUP BY dcp.grupo_descripcion
            ORDER BY venta_neta DESC
        """
        cursor.execute(sql, [anho, mes])
        columns = [col[0] for col in cursor.description]
        rows = cursor.fetchall()
        
        print(f"✓ Query executed successfully")
        print(f"  Columns: {columns}")
        print(f"  Rows: {len(rows)}")
        for i, row in enumerate(rows[:3]):
            print(f"    {i+1}. {dict(zip(columns, row))}")
            
except Exception as e:
    import traceback
    print(f"✗ Error: {type(e).__name__}: {e}")
    traceback.print_exc()
