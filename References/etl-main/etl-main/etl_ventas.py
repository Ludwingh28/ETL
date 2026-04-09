import pandas as pd
from datetime import datetime
from loguru import logger
import uuid
from database import db_pool
from utils import setup_logger, find_excel_files, validate_dataframe, prepare_batch_for_insert
from config import config
from staging import StagingLoader

class ETLVentas:
    """Clase principal para ETL de ventas"""
    
    def __init__(self):
        setup_logger()
        self.batch_id = f"BATCH_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:6]}"
        self.staging = StagingLoader(self.batch_id)
        logger.info(f"Inicializando ETL - Batch ID: {self.batch_id}")
    
    def process_file(self, file_path):
        """Procesar un archivo Excel - Insertar en staging"""
        logger.info(f"Procesando archivo: {file_path}")
        
        try:
            # Leer archivo Excel
            # df = pd.read_excel(file_path, skiprows=5, header=0 dtype=str)
            df = pd.read_excel(file_path, dtype=str)
            
            # Validar estructura
            df = validate_dataframe(df)

            # Ahora las fechas serán datetime64[ns], no strings
            logger.info(f"Filas de datos leídas: {len(df)}")
            logger.info(f"Tipos de datos: {df.dtypes}")

            logger.info(f"Fechas originales: {df['Fecha'].iloc[0]}")
            
            # Conectar a la base de datos
            with db_pool.get_connection() as conn:
                # Insertar en STAGING (datos crudos)
                logger.info("Insertando datos en staging...")
                registros_staging = self.staging.insertar_en_staging(df, file_path.name, conn)
                
                # Preparar datos para DW (después de staging)
                df_prepared = prepare_batch_for_insert(df, self.batch_id, file_path.name)
                
                # Procesar en lotes hacia DW
                total_procesadas = self._process_in_batches(df_prepared)
            
            logger.success(f"Archivo procesado exitosamente: {registros_staging} en staging, {total_procesadas} en DW")
            return total_procesadas
            
        except Exception as e:
            logger.error(f"Error procesando archivo {file_path}: {e}")
            raise
    
    def _process_in_batches(self, df):
        """Procesar DataFrame en lotes"""
        total_procesadas = 0
        
        for i in range(0, len(df), config.BATCH_SIZE):
            batch = df.iloc[i:i + config.BATCH_SIZE]
            batch_num = i // config.BATCH_SIZE + 1
            
            logger.info(f"Procesando batch {batch_num} (filas {i+1} a {min(i+config.BATCH_SIZE, len(df))})")
            
            try:
                procesadas = self._insert_batch(batch)
                total_procesadas += procesadas
                logger.info(f"Batch {batch_num} procesado: {procesadas} registros")
                
            except Exception as e:
                logger.error(f"Error en batch {batch_num}: {e}")
                # Opcional: detener o continuar
                raise
        
        return total_procesadas
    
    def _insert_batch(self, batch):
        """Insertar un lote de ventas - RESPETANDO TIPOS (VARCHAR y NUMERIC)"""
        with db_pool.get_connection() as conn:
            with conn.cursor() as cur:
                procesadas = 0
                
                for _, row in batch.iterrows():
                    try:
                        # Función auxiliar para manejar nulos según el tipo
                        def to_str(val):
                            return '' if pd.isna(val) or val is None else str(val)
                        
                        def to_num(val):
                            return 0 if pd.isna(val) or val is None else float(val)
                        
                        cur.execute("""
                            SELECT dw.cargar_fact_ventas(
                                %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                                %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                                %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                                %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                                %s, %s
                            )
                        """, (
                            # VARCHAR (35 parámetros)
                            to_str(row['numero_venta']),        # 1
                            to_str(row['fecha']),                # 2
                            to_str(row['cliente_codigo']),       # 3
                            to_str(row['cliente_nombre']),       # 4
                            to_str(row['grupo_codigo']),         # 5
                            to_str(row['grupo_descripcion']),    # 6
                            to_str(row['subgrupo_codigo']),      # 7
                            to_str(row['subgrupo_descripcion']), # 8
                            to_str(row['clase_codigo']),         # 9
                            to_str(row['clase_descripcion']),    # 10
                            to_str(row['subclase_codigo']),      # 11
                            to_str(row['subclase_descripcion']), # 12
                            to_str(row['articulo_codigo']),      # 13
                            to_str(row['articulo_descripcion']), # 14
                            to_str(row['um']),                   # 15
                            # AQUÍ VIENEN LOS NUMERIC (16-20)
                            to_num(row['cantidad']),             # 16 - NUMERIC
                            to_num(row['precio']),               # 17 - NUMERIC
                            to_num(row['subtotal']),             # 18 - NUMERIC
                            to_num(row['descuento']),            # 19 - NUMERIC
                            to_num(row['total']),                # 20 - NUMERIC
                            # CONTINÚAN VARCHAR (21-35)
                            to_str(row['local_codigo']),         # 21
                            to_str(row['local_descripcion']),    # 22
                            to_str(row['almacen_codigo']),       # 23
                            to_str(row['almacen_descripcion']),  # 24
                            to_str(row['ruta_codigo']),          # 25
                            to_str(row['ruta_descripcion']),     # 26
                            to_str(row['vendedor_codigo']),      # 27
                            to_str(row['vendedor_nombre']),      # 28
                            to_str(row['distribuidor_codigo']),  # 29
                            to_str(row['distribuidor_nombre']),  # 30
                            to_str(row['zona_codigo']),          # 31
                            to_str(row['zona_descripcion']),     # 32
                            to_str(row['componente']),           # 33
                            # MÁS NUMERIC (34-36)
                            to_num(row['ice']),                  # 34 - NUMERIC
                            to_num(row['venta_neta']),           # 35 - NUMERIC
                            # VARCHAR FINALES (36-42)
                            to_str(row['pago']),                 # 36
                            to_str(row['exhibidor']),            # 37
                            to_str(row['clase2']),               # 38
                            to_str(row['ruta3']),                # 39
                            to_str(row['punto_frio']),           # 40
                            to_str(row['archivo_origen']),       # 41
                            to_str(row['batch_id'])              # 42
                        ))
                        procesadas += 1
                        
                    except Exception as e:
                        logger.error(f"Error insertando venta {row.get('numero_venta', 'UNKNOWN')}: {e}")
                        conn.rollback()
                        raise
                
                conn.commit()
                return procesadas
    
    def run(self):
        """Ejecutar el proceso ETL completo"""
        logger.info("=" * 50)
        logger.info("INICIANDO PROCESO ETL DE VENTAS")
        logger.info("=" * 50)
        
        try:
            # Buscar archivos Excel
            excel_files = find_excel_files()
            
            if not excel_files:
                logger.warning("No se encontraron archivos Excel para procesar")
                return 0
            
            logger.info(f"Archivos encontrados: {len(excel_files)}")
            
            total_general = 0
            for file_path in excel_files:
                procesadas = self.process_file(file_path)
                total_general += procesadas
            
            logger.info("=" * 50)
            logger.success(f"ETL COMPLETADO - Total registros: {total_general}")
            logger.info("=" * 50)
            
            return total_general
            
        except Exception as e:
            logger.error(f"Error en ETL: {e}")
            raise
        finally:
            db_pool.close_all()

def main():
    """Función principal"""
    etl = ETLVentas()
    etl.run()

if __name__ == "__main__":
    main()