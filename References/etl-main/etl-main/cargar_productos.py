#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""
Script para cargar productos desde Excel a dw.dim_producto
Uso: python cargar_productos.py [ruta_archivo] [--limpiar]
"""

import pandas as pd
from datetime import datetime
from pathlib import Path
from loguru import logger
import sys
import os
from dotenv import load_dotenv

# Cargar variables de entorno
load_dotenv()

# Configurar logging
logger.remove()
logger.add(
    sys.stdout,
    format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level: <8}</level> | <cyan>{name}</cyan> - <level>{message}</level>",
    level="INFO"
)
logger.add(
    "logs/carga_productos_{time:YYYY-MM-DD}.log",
    rotation="10 MB",
    retention="7 days",
    level="INFO"
)

# Configuración
from config import config
from database import db_pool

class CargadorProductos:
    """Clase para cargar productos desde Excel a dim_producto"""
    
    def __init__(self, archivo_excel):
        self.archivo_excel = Path(archivo_excel)
        self.batch_id = f"CARGA_PRODUCTOS_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        
        # Mapeo de columnas del Excel a la base de datos
        self.column_mapping = {
            'Sku': 'producto_codigo_erp',
            'Artículo': 'producto_nombre',
            '1. Negocio': 'grupo_descripcion',     # → Grupo
            '2. Marca': 'clase_descripcion',        # → Clase
            '3. Categoría': 'subgrupo_descripcion', # → Subgrupo
            'U/L': 'u_l',
            'u/c': 'u_c',
            '2. Proveedor': 'proveedor',
            'CAT JAI': 'cat_jai',
            'RRHH': 'cat_rrhh',
            'CAT MIGUEL': 'cat_miguel'
        }

    # También necesitas generar códigos para estos campos
    def generar_codigos(self, row):
        """Generar códigos a partir de las descripciones"""
        
        # Si no hay códigos, puedes generar uno basado en la descripción
        grupo_codigo = self.generar_codigo_unico(row.get('grupo_descripcion', ''))
        subgrupo_codigo = self.generar_codigo_unico(row.get('subgrupo_descripcion', ''))
        clase_codigo = self.generar_codigo_unico(row.get('clase_descripcion', ''))
        
        return {
            'grupo_codigo': grupo_codigo,
            'subgrupo_codigo': subgrupo_codigo,
            'clase_codigo': clase_codigo
        }
            
    def leer_excel(self):
        """Leer el archivo Excel de productos"""
        logger.info(f"Leyendo archivo: {self.archivo_excel}")
        
        try:
            # Leer Excel
            df = pd.read_excel(self.archivo_excel)
            logger.info(f"Filas leídas: {len(df)}")
            
            # Mostrar columnas encontradas
            logger.info(f"Columnas disponibles: {list(df.columns)}")
            
            # Renombrar columnas según mapping
            df = df.rename(columns=self.column_mapping)
            
            # Limpiar datos
            df = self.limpiar_dataframe(df)
            
            return df
            
        except Exception as e:
            logger.error(f"Error leyendo Excel: {e}")
            raise
    
    def limpiar_dataframe(self, df):
        """Limpiar y preparar el DataFrame"""
        
        # Convertir columnas numéricas
        for col in ['u_l', 'u_c']:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0).astype(int)
        
        # Manejar valores nulos en texto
        text_columns = ['producto_codigo_erp', 'producto_nombre', 'negocio', 'marca', 
                       'categoria', 'proveedor', 'cat_jai', 'cat_rrhh', 'cat_miguel']
        
        for col in text_columns:
            if col in df.columns:
                df[col] = df[col].fillna('').astype(str)
        
        # Limpiar códigos de producto
        if 'producto_codigo_erp' in df.columns:
            df['producto_codigo_erp'] = df['producto_codigo_erp'].str.strip()
        
        return df
    
    def obtener_categoria_sk(self, conn, row):
        """Obtener o crear categoría de producto"""
        # Esta función asume que tienes una tabla dim_categoria_producto
        # Si no existe, puedes crear categorías básicas
        
        with conn.cursor() as cur:
            # Buscar categoría por nombre/descripción
            categoria_nombre = row.get('categoria', '')
            if not categoria_nombre:
                return None
            
            # Intentar encontrar categoría existente
            cur.execute("""
                SELECT categoria_sk FROM dw.dim_categoria_producto 
                WHERE categoria_nombre = %s AND es_categoria_actual = TRUE
            """, (categoria_nombre[:80],))
            
            result = cur.fetchone()
            if result:
                return result[0]
            
            # Si no existe, crear nueva categoría
            cur.execute("""
                INSERT INTO dw.dim_categoria_producto (
                    categoria_nombre, 
                    grupo_descripcion,
                    fecha_creacion
                ) VALUES (%s, %s, CURRENT_TIMESTAMP)
                RETURNING categoria_sk
            """, (categoria_nombre[:80], categoria_nombre[:80]))
            
            return cur.fetchone()[0]
    
    def determinar_cat_rrhh(self, producto_nombre, cat_rrhh_excel):
        """Determinar cat_rrhh según reglas de negocio (prioridad Excel)"""
        # Si viene del Excel, usar ese valor
        if cat_rrhh_excel and str(cat_rrhh_excel).strip():
            return str(cat_rrhh_excel).strip()
        
        # Si no, aplicar reglas por nombre del producto
        nombre_upper = str(producto_nombre).upper()
        
        if 'VINAGRE' in nombre_upper:
            return 'GENERAL'
        elif any(x in nombre_upper for x in ['VINO ', 'RON ', 'VODKA ', 'GIN ']):
            return 'BEBIDAS ALCOHOLICAS'
        elif 'COMBO ' in nombre_upper:
            return 'COMBO'
        elif 'PACK ' in nombre_upper:
            return 'PACK'
        elif 'CAJA ' in nombre_upper:
            return 'CAJA'
        elif 'PROMO ' in nombre_upper:
            return 'PROMO'
        elif 'SUPER FRUT' in nombre_upper:
            return 'SUPER FRUT'
        else:
            return 'GENERAL'
    
    def insertar_producto(self, conn, row):
        """Insertar o actualizar un producto"""
        with conn.cursor() as cur:
            # Verificar si el producto ya existe
            cur.execute("""
                SELECT producto_sk, version_producto, cat_rrhh,
                    subclase_codigo, subclase_descripcion
                FROM dw.dim_producto 
                WHERE producto_codigo_erp = %s AND es_producto_actual = TRUE
            """, (row['producto_codigo_erp'],))
            
            existente = cur.fetchone()
            
            # Generar códigos si no vienen en el Excel
            grupo_codigo = row.get('grupo_codigo', self.generar_codigo(row.get('grupo_descripcion', '')))
            subgrupo_codigo = row.get('subgrupo_codigo', self.generar_codigo(row.get('subgrupo_descripcion', '')))
            clase_codigo = row.get('clase_codigo', self.generar_codigo(row.get('clase_descripcion', '')))
            
            # Subclase siempre NULL en primera carga
            subclase_codigo = None
            subclase_descripcion = None
            
            if existente:
                producto_sk, version_actual, cat_rrhh_actual, subclase_existente, _ = existente
                
                # Verificar cambios (incluyendo si ahora tenemos subclase)
                tiene_cambios = (
                    subclase_existente is None and subclase_codigo is not None  # ← Nuevo: detectar subclase
                    # ... otras comparaciones
                )
                
                if tiene_cambios:
                    # Cerrar versión actual
                    # Insertar nueva versión con subclase (si aplica)
                    # ...
            else:
                # Insertar nuevo producto con subclase = NULL
                cur.execute("""
                    INSERT INTO dw.dim_producto (
                        producto_codigo_erp, producto_nombre,
                        grupo_codigo, grupo_descripcion,
                        subgrupo_codigo, subgrupo_descripcion,
                        clase_codigo, clase_descripcion,
                        subclase_codigo, subclase_descripcion,  -- ← NULL
                        u_l, u_c, proveedor, cat_rrhh,
                        version_producto
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 1)
                """, (
                    row['producto_codigo_erp'],
                    row.get('producto_nombre', '')[:200],
                    grupo_codigo,
                    row.get('grupo_descripcion', '')[:80],
                    subgrupo_codigo,
                    row.get('subgrupo_descripcion', '')[:80],
                    clase_codigo,
                    row.get('clase_descripcion', '')[:80],
                    None,  # subclase_codigo NULL
                    None,  # subclase_descripcion NULL
                    int(row.get('u_l', 0)),
                    int(row.get('u_c', 0)),
                    row.get('proveedor', '')[:200],
                    cat_rrhh
                ))
                
                nuevo_sk = cur.fetchone()[0]
                logger.debug(f"Producto {row['producto_codigo_erp']} insertado: SK={nuevo_sk}")
                return nuevo_sk
    
    def cargar(self):
        """Proceso principal de carga"""
        logger.info("=" * 60)
        logger.info(f"INICIANDO CARGA DE PRODUCTOS - Batch: {self.batch_id}")
        logger.info("=" * 60)
        
        try:
            # Leer Excel
            df = self.leer_excel()
            
            # Conectar a la base de datos
            with db_pool.get_connection() as conn:
                procesados = 0
                insertados = 0
                actualizados = 0
                errores = 0
                
                for idx, row in df.iterrows():
                    try:
                        sk = self.insertar_producto(conn, row)
                        procesados += 1
                        
                        # Determinar si fue inserción o actualización
                        if sk:
                            # Aquí podrías llevar un conteo más detallado
                            pass
                        
                        # Commit cada 100 registros
                        if procesados % 100 == 0:
                            conn.commit()
                            logger.info(f"  → {procesados} productos procesados...")
                            
                    except Exception as e:
                        errores += 1
                        logger.error(f"Error en fila {idx+2} (SKU: {row.get('producto_codigo_erp', 'N/A')}): {e}")
                        logger.error(f"Datos: {row.to_dict()}")
                        conn.rollback()
                        # Opcional: continuar con el siguiente
                        # raise
                
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
    
    # Ruta por defecto
    DEFAULT_PATH = os.getenv('PRODUCTOS_EXCEL_PATH', 'data/productos.xlsx')
    
    parser = argparse.ArgumentParser(description='Cargar productos desde Excel a dim_producto')
    parser.add_argument('archivo', nargs='?', default=DEFAULT_PATH,
                       help='Ruta al archivo Excel de productos')
    parser.add_argument('--limpiar', action='store_true', 
                       help='Limpiar tabla antes de cargar (CUIDADO)')
    parser.add_argument('--categoria-sk', type=int, 
                       help='SK de categoría por defecto para todos los productos')
    
    args = parser.parse_args()
    
    # Verificar que el archivo existe
    if not Path(args.archivo).exists():
        logger.error(f"Archivo no encontrado: {args.archivo}")
        logger.info(f"Buscando en: {Path(args.archivo).absolute()}")
        sys.exit(1)
    
    # Opcional: limpiar tabla (CON CUIDADO)
    if args.limpiar:
        confirm = input("¿Estás seguro de limpiar dim_producto? (s/N): ")
        if confirm.lower() == 's':
            with db_pool.get_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute("TRUNCATE TABLE dw.dim_producto CASCADE")
                    conn.commit()
                logger.warning("⚠️ Tabla dim_producto limpiada")
        else:
            logger.info("Limpieza cancelada")
            return
    
    # Ejecutar carga
    cargador = CargadorProductos(args.archivo)
    cargador.cargar()

if __name__ == "__main__":
    main()