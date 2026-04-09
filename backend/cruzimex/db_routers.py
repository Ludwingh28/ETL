class DWRouter:
    """
    Router para separar:
    - 'default' (SQLite): tablas del sistema Django (auth, admin, tokens)
    - 'dw' (PostgreSQL): datos del Data Warehouse de Cruzimex
    """

    DW_APPS = {'dw_models'}

    def db_for_read(self, model, **hints):
        if model._meta.app_label in self.DW_APPS:
            return 'dw'
        return 'default'

    def db_for_write(self, model, **hints):
        if model._meta.app_label in self.DW_APPS:
            return 'dw'
        return 'default'

    def allow_relation(self, obj1, obj2, **hints):
        db1 = 'dw' if obj1._meta.app_label in self.DW_APPS else 'default'
        db2 = 'dw' if obj2._meta.app_label in self.DW_APPS else 'default'
        return db1 == db2

    def allow_migrate(self, db, app_label, model_name=None, **hints):
        if db == 'dw':
            return False
        return True
