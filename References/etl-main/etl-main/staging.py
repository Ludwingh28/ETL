# staging.py
import psycopg2
from loguru import logger
import pandas as pd

class StagingLoader:
    """Clase para manejar la carga en staging"""
    
    def __init__(self, batch_id):
        self.batch_id = batch_id
    
    def insertar_en_staging(self, df, nombre_archivo, conn):
        """Insertar DataFrame en staging.stg_ventas - VERSIÓN CORREGIDA (42 parámetros)"""
        procesadas = 0
        with conn.cursor() as cur:
            for idx, row in df.iterrows():
                try:
                    # EXACTAMENTE 42 parámetros como en la función SQL
                    cur.execute("""
                        SELECT staging.cargar_stg_ventas(
                            %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,  -- 1-10
                            %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,  -- 11-20
                            %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,  -- 21-30
                            %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,  -- 31-40
                            %s, %s                                    -- 41-42
                        )
                    """, (
                        # 1-10: Datos básicos
                        str(row['No.Venta']) if pd.notna(row['No.Venta']) else '',
                        str(row['Fecha']) if pd.notna(row['Fecha']) else '',
                        str(row['Cliente']) if pd.notna(row['Cliente']) else '',
                        str(row['Nombre Cliente']) if pd.notna(row['Nombre Cliente']) else '',
                        str(row['Grupo']) if pd.notna(row['Grupo']) else '',
                        str(row['Descripcion Grupo']) if pd.notna(row['Descripcion Grupo']) else '',
                        str(row['SubGrupo']) if pd.notna(row['SubGrupo']) else '',
                        str(row['Descripcion SubGrupo']) if pd.notna(row['Descripcion SubGrupo']) else '',
                        str(row['Clase']) if pd.notna(row['Clase']) else '',
                        str(row['Descripcion Clase']) if pd.notna(row['Descripcion Clase']) else '',
                        
                        # 11-20: Subclase, artículo, UM
                        str(row['SubClase']) if pd.notna(row['SubClase']) else '',
                        str(row['Descripcion SubClase']) if pd.notna(row['Descripcion SubClase']) else '',
                        str(row['Articulo']) if pd.notna(row['Articulo']) else '',
                        str(row['Descripcion Articulo']) if pd.notna(row['Descripcion Articulo']) else '',
                        str(row['U/M']) if pd.notna(row['U/M']) else '',
                        str(row['Cantidad']) if pd.notna(row['Cantidad']) else '0',
                        str(row['Precio']) if pd.notna(row['Precio']) else '0',
                        str(row['SubTotal']) if pd.notna(row['SubTotal']) else '0',
                        str(row['Descuento']) if pd.notna(row['Descuento']) else '0',
                        str(row['Total']) if pd.notna(row['Total']) else '0',
                        
                        # 21-30: Local, almacén, ruta
                        str(row['Local']) if pd.notna(row['Local']) else '',
                        str(row['Descripcion Local']) if pd.notna(row['Descripcion Local']) else '',
                        str(row['Almacen']) if pd.notna(row['Almacen']) else '',
                        str(row['Descripcion Almacen']) if pd.notna(row['Descripcion Almacen']) else '',
                        str(row['Ruta']) if pd.notna(row['Ruta']) else '',
                        str(row['Descripcion Ruta']) if pd.notna(row['Descripcion Ruta']) else '',
                        str(row['Vendedor']) if pd.notna(row['Vendedor']) else '',
                        str(row['Descripcion Vendedor']) if pd.notna(row['Descripcion Vendedor']) else '',
                        str(row['Distribuidor']) if pd.notna(row['Distribuidor']) else '',
                        str(row['Descripcion Distribuidor']) if pd.notna(row['Descripcion Distribuidor']) else '',
                        
                        # 31-40: Zona, componente, ICE, Venta Neta, Pago, Exhibidor, Clase2, Ruta3, Punto Frio
                        str(row['Zona']) if pd.notna(row['Zona']) else '',
                        str(row['Descripcion Zona']) if pd.notna(row['Descripcion Zona']) else '',
                        str(row['Componente']) if pd.notna(row['Componente']) else '',
                        str(row.get('ICE', 0)) if pd.notna(row.get('ICE', 0)) else '0',
                        str(row.get('Venta Neta', 0)) if pd.notna(row.get('Venta Neta', 0)) else '0',
                        str(row['Pago']) if pd.notna(row['Pago']) else '',
                        str(row.get('Exhibidor', '')) if pd.notna(row.get('Exhibidor', '')) else '',
                        str(row.get('Clase2', '')) if pd.notna(row.get('Clase2', '')) else '',
                        str(row.get('Ruta3', '')) if pd.notna(row.get('Ruta3', '')) else '',
                        str(row.get('Punto Frio', '')) if pd.notna(row.get('Punto Frio', '')) else '',
                        
                        # 41-42: Metadatos (nombre_archivo, batch_id)
                        nombre_archivo,
                        self.batch_id
                    ))
                    procesadas += 1
                    
                    if procesadas % 100 == 0:
                        conn.commit()
                        logger.info(f"  → {procesadas} registros insertados en staging...")
                        
                except Exception as e:
                    logger.error(f"Error insertando en staging fila {idx}: {e}")
                    logger.error(f"Columnas disponibles: {list(row.index)}")
                    conn.rollback()
                    raise
            
            conn.commit()
            logger.info(f"  → Total insertados en staging: {procesadas}")
            return procesadas