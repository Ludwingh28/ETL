#!/usr/bin/env python
import django
import os
import json
from datetime import datetime

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'cruzimex.settings')
django.setup()

from django.db import connections

# Test the dashboard_nacional_periodos query
try:
    with connections['dw'].cursor() as cursor:
        sql = """
            SELECT DISTINCT df.anho, df.mes_numero, df.mes_nombre
            FROM dw.fact_ventas fv
            JOIN dw.dim_fecha df ON fv.fecha_sk = df.fecha_sk
            ORDER BY df.anho DESC, df.mes_numero DESC
            LIMIT 36
        """
        cursor.execute(sql)
        columns = [col[0] for col in cursor.description]
        rows = cursor.fetchall()
        
        print(f"✓ Query successful. Found {len(rows)} periods")
        if rows:
            print(f"  First result: {dict(zip(columns, rows[0]))}")
except Exception as e:
    print(f"✗ Query error: {type(e).__name__}: {e}")

# Test the dashboard_nacional_kpis query
try:
    anho = datetime.now().year
    mes = datetime.now().month
    
    with connections['dw'].cursor() as cursor:
        sql = """
            SELECT
                COALESCE(SUM(fv.venta_neta), 0)                            AS total_nacional,
                COALESCE(SUM(CASE WHEN dv.ciudad = 'SCZ'  THEN fv.venta_neta END), 0)  AS santa_cruz,
                COALESCE(SUM(CASE WHEN dv.ciudad = 'CBA' THEN fv.venta_neta END), 0)  AS cochabamba,
                COALESCE(SUM(CASE WHEN dv.ciudad IN ('LPZ', 'EAL')  THEN fv.venta_neta END), 0)  AS la_paz,
                MAX(df.fecha_completa)                                      AS fecha_corte
            FROM dw.fact_ventas fv
            JOIN dw.dim_fecha    df ON fv.fecha_sk    = df.fecha_sk
            JOIN dw.dim_vendedor dv ON fv.vendedor_sk = dv.vendedor_sk
            WHERE df.anho = %s AND df.mes_numero = %s
        """
        cursor.execute(sql, [anho, mes])
        columns = [col[0] for col in cursor.description]
        rows = cursor.fetchall()
        
        print(f"✓ KPIs query successful. Found {len(rows)} result(s)")
        if rows:
            result = dict(zip(columns, rows[0]))
            print(f"  Result: {result}")
except Exception as e:
    print(f"✗ KPIs query error: {type(e).__name__}: {e}")
