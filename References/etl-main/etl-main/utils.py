import pandas as pd
from pathlib import Path
from loguru import logger
import sys
from config import config

def setup_logger():
    """Configurar logger"""
    logger.remove()
    logger.add(
        sys.stdout,
        format="<green>{time:YYYY-MM-DD HH:mm:ss}</green> | <level>{level: <8}</level> | <cyan>{name}</cyan> - <level>{message}</level>",
        level=config.LOG_LEVEL
    )
    logger.add(
        "logs/etl_{time:YYYY-MM-DD}.log",
        rotation="500 MB",
        retention="30 days",
        level="INFO"
    )

def find_excel_files():
    """Buscar archivos Excel en el directorio de datos"""
    data_path = Path(config.DATA_PATH)
    if not data_path.exists():
        data_path.mkdir(parents=True, exist_ok=True)
        logger.warning(f"Directorio {data_path} creado. Por favor, coloque el archivo Excel.")
        return []
    
    excel_files = list(data_path.glob("*.xlsx")) + list(data_path.glob("*.xls"))
    return excel_files

def validate_dataframe(df):
    """Validar que el DataFrame tenga las columnas requeridas"""
    required_columns = set(config.COLUMN_MAPPING.keys())
    df_columns = set(df.columns)
    
    missing_columns = required_columns - df_columns
    if missing_columns:
        raise ValueError(f"Columnas faltantes en el archivo: {missing_columns}")
    
    # Limpiar datos
    for col in config.NUMERIC_COLUMNS:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors='coerce').fillna(0)
    
    return df

def prepare_batch_for_insert(df, batch_id, archivo_origen):
    """Preparar batch de datos para inserción"""
    df = df.copy()
    df['batch_id'] = batch_id
    df['archivo_origen'] = archivo_origen
    
    # Renombrar columnas según mapping
    df = df.rename(columns=config.COLUMN_MAPPING)
    
    return df