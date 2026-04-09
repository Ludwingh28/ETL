# config.py - Versión completa con COLUMN_MAPPING

import os
from dotenv import load_dotenv
from pathlib import Path

# Cargar variables de entorno
load_dotenv()

class Config:
    # Base de datos - SIN VALORES POR DEFECTO para datos sensibles
    DB_HOST = os.getenv('DB_HOST')
    DB_PORT = os.getenv('DB_PORT')
    DB_NAME = os.getenv('DB_NAME')
    DB_USER = os.getenv('DB_USER')
    DB_PASSWORD = os.getenv('DB_PASSWORD')
    DB_SCHEMA = os.getenv('DB_SCHEMA')
    
    # Rutas - SOLO estas pueden tener default
    BASE_DIR = Path(__file__).parent
    DATA_PATH = BASE_DIR / os.getenv('DATA_PATH', 'data/ventas_update')
    
    # Configuración ETL - Estos pueden tener default
    BATCH_SIZE = int(os.getenv('BATCH_SIZE', 1000))
    LOG_LEVEL = os.getenv('LOG_LEVEL', 'INFO')
    
    # --- NUEVO: Mapeo de columnas (Excel -> Base de datos) ---
    COLUMN_MAPPING = {
        'No.Venta': 'numero_venta',
        'Fecha': 'fecha',
        'Cliente': 'cliente_codigo',
        'Nombre Cliente': 'cliente_nombre',
        'Grupo': 'grupo_codigo',
        'Descripcion Grupo': 'grupo_descripcion',
        'SubGrupo': 'subgrupo_codigo',
        'Descripcion SubGrupo': 'subgrupo_descripcion',
        'Clase': 'clase_codigo',
        'Descripcion Clase': 'clase_descripcion',
        'SubClase': 'subclase_codigo',
        'Descripcion SubClase': 'subclase_descripcion',
        'Articulo': 'articulo_codigo',
        'Descripcion Articulo': 'articulo_descripcion',
        'U/M': 'um',
        'Cantidad': 'cantidad',
        'Precio': 'precio',
        'SubTotal': 'subtotal',
        'Descuento': 'descuento',
        'Total': 'total',
        'Local': 'local_codigo',
        'Descripcion Local': 'local_descripcion',
        'Almacen': 'almacen_codigo',
        'Descripcion Almacen': 'almacen_descripcion',
        'Ruta': 'ruta_codigo',
        'Descripcion Ruta': 'ruta_descripcion',
        'Vendedor': 'vendedor_codigo',
        'Descripcion Vendedor': 'vendedor_nombre',
        'Distribuidor': 'distribuidor_codigo',
        'Descripcion Distribuidor': 'distribuidor_nombre',
        'Zona': 'zona_codigo',
        'Descripcion Zona': 'zona_descripcion',
        'Componente': 'componente',
        'ICE': 'ice',
        'Venta Neta': 'venta_neta',
        'Pago': 'pago',
        'Exhibidor': 'exhibidor',
        'Clase2': 'clase2',
        'Ruta3': 'ruta3',
        'Punto Frio': 'punto_frio'
    }
    
    # --- NUEVO: Columnas numéricas ---
    NUMERIC_COLUMNS = [
        'Cantidad', 'Precio', 'SubTotal', 'Descuento', 'Total', 'ICE', 'Venta Neta'
    ]
    
    def __init__(self):
        """Validar que las variables críticas existan"""
        required_vars = [
            'DB_HOST', 'DB_PORT', 'DB_NAME', 
            'DB_USER', 'DB_PASSWORD', 'DB_SCHEMA'
        ]
        
        missing_vars = []
        for var in required_vars:
            if getattr(self, var) is None:
                missing_vars.append(var)
        
        if missing_vars:
            raise ValueError(
                f"Variables de entorno faltantes: {', '.join(missing_vars)}. "
                "Por favor, configura el archivo .env"
            )

# Instancia global
config = Config()