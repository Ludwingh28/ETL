#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""
Script para cargar vendedores desde Excel a dw.dim_vendedor
Uso: python cargar_vendedores.py
"""

import pandas as pd
from datetime import datetime
from pathlib import Path
from loguru import logger
import sys

# Configurar logging
logger.remove()
logger.add(
    sys.stdout,
    format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level: <8}</level> | <cyan>{name}</cyan> - <level>{message}</level>",
    level="INFO"
)
logger.add(
    "logs/carga_vendedores_{time:YYYY-MM-DD}.log",
    rotation="10 MB",
    retention="7 days",
    level="INFO"
)

# Configuración
from config import config
from database import db_pool

class CargadorVendedores:
    """Clase para cargar vendedores desde Excel a dim_vendedor"""
    
    def __init__(self, archivo_excel):
        self.archivo_excel = Path(archivo_excel)
        self.batch_id = f"CARGA_VENDEDORES_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        
    def leer_excel(self):
        """Leer el archivo Excel de vendedores"""
        logger.info(f"Leyendo archivo: {self.archivo_excel}")
        
        # Mapeo de columnas del Excel a nombres más manejables
        column_mapping = {
            'CODIGO': 'codigo',
            'VENDEDORES': 'nombre',
            'CANAL don alferedo p. canal': 'canal',  # Nombre original del Excel
            'NOMBRE': 'nombre_completo',  # Si es necesario
            'FECHA INGRESO': 'fecha_ingreso',
            'SUPERVISOR': 'supervisor',
            'CD RRHH': 'ciudad',
            'CANAL RRHH': 'canal_rrhh'  # Por si acaso
        }
        
        try:
            # Leer Excel
            df = pd.read_excel(self.archivo_excel)
            logger.info(f"Filas leídas: {len(df)}")
            
            # Renombrar columnas
            df = df.rename(columns=column_mapping)
            
            # Mostrar columnas encontradas
            logger.info(f"Columnas disponibles: {list(df.columns)}")
            
            return df
            
        except Exception as e:
            logger.error(f"Error leyendo Excel: {e}")
            raise
    
    def procesar_fecha_ingreso(self, fecha_valor):
        """Procesar fecha de ingreso que puede venir en varios formatos"""
        if pd.isna(fecha_valor) or fecha_valor is None:
            return None
            
        try:
            # Si es datetime de pandas
            if isinstance(fecha_valor, (pd.Timestamp, datetime)):
                return fecha_valor.date()
            
            # Si es string, intentar convertir
            if isinstance(fecha_valor, str):
                for fmt in ['%d/%m/%Y', '%d-%m-%Y', '%Y-%m-%d', '%d.%m.%Y']:
                    try:
                        return datetime.strptime(fecha_valor, fmt).date()
                    except:
                        continue
            
            return None
        except:
            return None
    
    def insertar_vendedor(self, conn, row):
        """Insertar un vendedor en la base de datos"""
        with conn.cursor() as cur:
            # Verificar si el vendedor ya existe
            cur.execute("""
                SELECT vendedor_sk FROM dw.dim_vendedor 
                WHERE vendedor_codigo_erp = %s AND es_vendedor_actual = TRUE
            """, (str(row['codigo']),))
            
            existente = cur.fetchone()
            
            # Procesar fecha de ingreso
            fecha_ingreso = self.procesar_fecha_ingreso(row.get('fecha_ingreso'))
            
            if existente:
                # Actualizar vendedor existente
                cur.execute("""
                    UPDATE dw.dim_vendedor 
                    SET vendedor_nombre = %s,
                        canal = %s,
                        fecha_ingreso = COALESCE(%s, fecha_ingreso),
                        supervisor = %s,
                        canal_rrhh = %s,
                        fecha_actualizacion = CURRENT_TIMESTAMP
                    WHERE vendedor_codigo_erp = %s AND es_vendedor_actual = TRUE
                    RETURNING vendedor_sk
                """, (
                    str(row['nombre']),
                    str(row.get('canal', '')),
                    fecha_ingreso,
                    str(row.get('supervisor', '')),
                    str(row.get('canal_rrhh', '')),
                    str(row['codigo'])
                ))
                vendedor_sk = cur.fetchone()[0]
                logger.debug(f"Vendedor {row['codigo']} actualizado: SK={vendedor_sk}")
                
            else:
                # Insertar nuevo vendedor
                cur.execute("""
                    INSERT INTO dw.dim_vendedor (
                        vendedor_codigo_erp,
                        vendedor_nombre,
                        canal,
                        fecha_ingreso,
                        supervisor,
                        ciudad,
                        canal_rrhh,
                        fecha_creacion,
                        fecha_actualizacion,
                        es_activo
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, TRUE)
                    RETURNING vendedor_sk
                """, (
                    str(row['codigo']),
                    str(row['nombre']),
                    str(row.get('canal', '')),
                    fecha_ingreso,
                    str(row.get('supervisor', '')),
                    str(row.get('ciudad', '')),
                    str(row.get('canal_rrhh', ''))
                ))
                vendedor_sk = cur.fetchone()[0]
                logger.debug(f"Vendedor {row['codigo']} insertado: SK={vendedor_sk}")
            
            return vendedor_sk
    
    def cargar(self):
        """Proceso principal de carga"""
        logger.info("=" * 60)
        logger.info(f"INICIANDO CARGA DE VENDEDORES - Batch: {self.batch_id}")
        logger.info("=" * 60)
        
        try:
            # Leer Excel
            df = self.leer_excel()
            
            # Conectar a la base de datos
            with db_pool.get_connection() as conn:
                procesados = 0
                errores = 0
                
                for idx, row in df.iterrows():
                    try:
                        self.insertar_vendedor(conn, row)
                        procesados += 1
                        
                        # Commit cada 100 registros
                        if procesados % 100 == 0:
                            conn.commit()
                            logger.info(f"  → {procesados} vendedores procesados...")
                            
                    except Exception as e:
                        errores += 1
                        logger.error(f"Error en fila {idx+2} (Código: {row.get('codigo', 'N/A')}): {e}")
                        logger.error(f"Datos: {row.to_dict()}")
                        conn.rollback()
                        raise
                
                # Commit final
                conn.commit()
                
            # Resumen
            logger.info("=" * 60)
            logger.info(f"CARGA COMPLETADA")
            logger.info(f"  Total registros: {len(df)}")
            logger.info(f"  Procesados: {procesados}")
            logger.info(f"  Errores: {errores}")
            logger.info("=" * 60)
            
            return procesados
            
        except Exception as e:
            logger.error(f"Error en carga: {e}")
            raise
        finally:
            db_pool.close_all()

def main():
    """Función principal"""
    import argparse
    
    parser = argparse.ArgumentParser(description='Cargar vendedores desde Excel a dim_vendedor')
    parser.add_argument('archivo', help='Ruta al archivo Excel de vendedores')
    parser.add_argument('--limpiar', action='store_true', help='Limpiar tabla antes de cargar')
    
    args = parser.parse_args()
    
    # Verificar que el archivo existe
    if not Path(args.archivo).exists():
        logger.error(f"Archivo no encontrado: {args.archivo}")
        sys.exit(1)
    
    # Opcional: limpiar tabla
    if args.limpiar:
        with db_pool.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("TRUNCATE TABLE dw.dim_vendedor CASCADE")
                conn.commit()
            logger.warning("Tabla dim_vendedor limpiada")
    
    # Ejecutar carga
    cargador = CargadorVendedores(args.archivo)
    cargador.cargar()

if __name__ == "__main__":
    main()