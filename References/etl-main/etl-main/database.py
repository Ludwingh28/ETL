import psycopg2
from psycopg2 import pool
from contextlib import contextmanager
from loguru import logger
from config import config

class DatabasePool:
    """Pool de conexiones a PostgreSQL"""
    
    _instance = None
    _pool = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance
    
    def __init__(self):
        if self._pool is None:
            self._create_pool()
    
    def _create_pool(self):
        """Crear pool de conexiones"""
        try:
            self._pool = psycopg2.pool.SimpleConnectionPool(
                minconn=1,
                maxconn=10,
                host=config.DB_HOST,
                port=config.DB_PORT,
                database=config.DB_NAME,
                user=config.DB_USER,
                password=config.DB_PASSWORD,
                options=f"-c search_path={config.DB_SCHEMA}"
            )
            logger.info("Pool de conexiones creado exitosamente")
        except Exception as e:
            logger.error(f"Error creando pool de conexiones: {e}")
            raise
    
    @contextmanager
    def get_connection(self):
        """Obtener conexión del pool"""
        conn = None
        try:
            conn = self._pool.getconn()
            yield conn
        finally:
            if conn:
                self._pool.putconn(conn)
    
    def close_all(self):
        """Cerrar todas las conexiones"""
        if self._pool:
            self._pool.closeall()
            logger.info("Pool de conexiones cerrado")

# Singleton
db_pool = DatabasePool()