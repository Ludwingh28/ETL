# born/db_routers.py

class VentasRouter:
    """
    Router para controlar las operaciones de base de datos.
    - Las tablas del sistema de Django van a 'default' (SQLite)
    - Los modelos de la app 'stream' van a 'ventas_db' (PostgreSQL)
    """
    
    def db_for_read(self, model, **hints):
        """
        Define qué base de datos usar para LECTURAS.
        """
        if model._meta.app_label == 'stream':
            return 'ventas_db'  # Modelos de 'stream' leen de PostgreSQL
        return 'default'  # Otros modelos (admin, auth) leen de SQLite
    
    def db_for_write(self, model, **hints):
        """
        Define qué base de datos usar para ESCRITURAS.
        """
        if model._meta.app_label == 'stream':
            return 'ventas_db'  # Modelos de 'stream' escriben en PostgreSQL
        return 'default'  # Otros modelos escriben en SQLite
    
    def allow_relation(self, obj1, obj2, **hints):
        """
        Permite relaciones entre objetos de la misma base de datos.
        """
        db1 = self.db_for_read(obj1.__class__)
        db2 = self.db_for_read(obj2.__class__)
        return db1 == db2  # Solo permite relaciones si están en misma BD
    
    def allow_migrate(self, db, app_label, model_name=None, **hints):
        """
        Controla qué tablas se crean con migrate.
        - 'ventas_db': NO se crean tablas nuevas (managed=False)
        - 'default': Se crean tablas del sistema normalmente
        """
        if db == 'ventas_db':
            return False  # No migrar nada en la BD de ventas
        return True  # Migrar normalmente en 'default'