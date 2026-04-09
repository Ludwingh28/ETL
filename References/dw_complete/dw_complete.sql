


-- =====================================================
-- CREACIÓN DEL DATA WAREHOUSE - TODAS LAS TABLAS
-- =====================================================
-- Crear datawarehouse
-- CREATE DATABASE dw_cruzimex
--     WITH
--     OWNER = postgres
--     ENCODING = 'UTF8'
--     LC_COLLATE = 'English_United States.1252'
--     LC_CTYPE = 'English_United States.1252'
--     LOCALE_PROVIDER = 'libc'
--     TABLESPACE = pg_default
--     CONNECTION LIMIT = -1
--     IS_TEMPLATE = False;
-- Conectar a la base de datos (ajustar según sea necesario)
-- \c dw_cruzimex;

-- Crear esquemas si no existen
CREATE SCHEMA IF NOT EXISTS dw;
CREATE SCHEMA IF NOT EXISTS staging;
CREATE SCHEMA IF NOT EXISTS control;
CREATE SCHEMA IF NOT EXISTS reporting;

-- Establecer search path
SET search_path TO dw, public, staging, control, reporting;

-- =====================================================
-- 1. DIMENSIONES (TABLAS MAESTRAS)
-- =====================================================

-- =====================================================
-- 1.1 DIM_FECHA - Calendario (versión completa)
-- =====================================================
-- Propósito: Proporcionar una dimensión de tiempo con todos los atributos
-- necesarios para análisis en Power BI y reportes
-- =====================================================
CREATE TABLE IF NOT EXISTS dw.dim_fecha (
    -- Clave primaria (SK)
    fecha_sk INTEGER PRIMARY KEY,
    
    -- Fecha base
    fecha_completa DATE UNIQUE NOT NULL,
    
    -- Atributos de año
    anho INTEGER,
    anho_mes VARCHAR(7),
    anho_mes_numero INTEGER,
    
    -- Atributos de mes
    mes_numero INTEGER,
    mes_nombre VARCHAR(20),
    mes_nombre_corto VARCHAR(3),
    mes_anho VARCHAR(20),
    mes_anho_corto VARCHAR(10),
    
    -- Atributos de trimestre
    trimestre_numero INTEGER,
    trimestre_nombre VARCHAR(2),
    anho_trimestre VARCHAR(10),
    
    -- Atributos de semestre
    semestre_numero INTEGER,
    semestre_nombre VARCHAR(3),
    
    -- Atributos de día
    dia_numero INTEGER,
    dia_nombre VARCHAR(20),
    dia_nombre_corto VARCHAR(3),
    dia_semana_numero INTEGER, -- 1=Domingo, 7=Sábado
    dia_semana_numero_iso INTEGER, -- 1=Lunes, 7=Domingo
    dia_nro_dia_anho INTEGER,
    dia_nro_dia_formato VARCHAR(10),
    
    -- Atributos de semana
    semana_numero INTEGER, -- Semana del año (ISO)
    semana_anho INTEGER,
    semana_mes VARCHAR(10),
    semana_en_mes VARCHAR(15),
    
    -- Indicadores
    es_fin_semana BOOLEAN DEFAULT FALSE,
    es_feriado BOOLEAN DEFAULT FALSE,
    
    -- Fechas relativas al día actual
    mes_actual BOOLEAN,
    trimestre_actual BOOLEAN,
    
    -- Metadatos
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Comentarios
COMMENT ON TABLE dw.dim_fecha IS 'Dimensión de fechas con todos los atributos para análisis';
COMMENT ON COLUMN dw.dim_fecha.fecha_sk IS 'Surrogate Key en formato YYYYMMDD';
COMMENT ON COLUMN dw.dim_fecha.dia_semana_numero_iso IS '1=Lunes, 2=Martes, ..., 7=Domingo';
COMMENT ON COLUMN dw.dim_fecha.dia_semana_numero IS '1=Domingo, 2=Lunes, ..., 7=Sábado';

-- 1.2 DIM_CATEGORIA_PRODUCTO - Jerarquías de producto
CREATE TABLE IF NOT EXISTS dw.dim_categoria_producto (
    categoria_sk SERIAL PRIMARY KEY,
    grupo_codigo VARCHAR(4),
    grupo_descripcion VARCHAR(80),
    subgrupo_codigo VARCHAR(4),
    subgrupo_descripcion VARCHAR(80),
    clase_codigo VARCHAR(4),
    clase_descripcion VARCHAR(80),
    subclase_codigo VARCHAR(4),
    subclase_descripcion VARCHAR(80),
    ruta_completa VARCHAR(300) GENERATED ALWAYS AS (
        COALESCE(grupo_descripcion, '') || ' > ' ||
        COALESCE(subgrupo_descripcion, '') || ' > ' ||
        COALESCE(clase_descripcion, '') || ' > ' ||
        COALESCE(subclase_descripcion, '')
    ) STORED,
    version_categoria INTEGER DEFAULT 1,
    fecha_desde_categoria DATE NOT NULL DEFAULT CURRENT_DATE,
    fecha_hasta_categoria DATE,
    es_categoria_actual BOOLEAN DEFAULT TRUE,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    es_activo BOOLEAN DEFAULT TRUE
);

COMMENT ON TABLE dw.dim_categoria_producto IS 'Jerarquía de productos (Grupo > SubGrupo > Clase > SubClase)';

-- 1.3 DIM_PRODUCTO - Productos
CREATE TABLE IF NOT EXISTS dw.dim_producto (
    producto_sk SERIAL PRIMARY KEY,
    producto_codigo_erp VARCHAR(20) NOT NULL,
    producto_nombre VARCHAR(200),
    -- producto_descripcion TEXT,
    categoria_sk INTEGER REFERENCES dw.dim_categoria_producto(categoria_sk),
    u_l INTEGER DEFAULT 0,
    u_c INTEGER DEFAULT 0,
    proveedor VARCHAR(200),
    cat_rrhh VARCHAR(100),
    cat_comercial VARCHAR(100),
    unidad_medida VARCHAR(20),
	componente VARCHAR(20),
    version_producto INTEGER DEFAULT 1,
    fecha_desde_producto DATE NOT NULL DEFAULT CURRENT_DATE,
    fecha_hasta_producto DATE,
    es_producto_actual BOOLEAN DEFAULT TRUE,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    es_activo BOOLEAN DEFAULT TRUE
);

COMMENT ON TABLE dw.dim_producto IS 'Productos con SCD Tipo 2 en nombre';

-- 1.4 DIM_CLIENTE - Clientes (datos base)
CREATE TABLE IF NOT EXISTS dw.dim_cliente (
    cliente_sk SERIAL PRIMARY KEY,
    cliente_codigo_erp VARCHAR(10) NOT NULL,
    cliente_nombre VARCHAR(200),
    cadena VARCHAR(100),
    version_cliente INTEGER DEFAULT 1,
    fecha_desde_cliente DATE NOT NULL DEFAULT CURRENT_DATE,
    fecha_hasta_cliente DATE,
    es_cliente_actual BOOLEAN DEFAULT TRUE,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    es_activo BOOLEAN DEFAULT TRUE
);

COMMENT ON TABLE dw.dim_cliente IS 'Clientes (datos base) con SCD Tipo 2 en nombre';

-- 1.5 DIM_CLIENTE_ATRIBUTOS - Datos complementarios de clientes
CREATE TABLE IF NOT EXISTS dw.dim_cliente_atributos (
    atributo_sk SERIAL PRIMARY KEY,
    nro INTEGER,
    codigo VARCHAR(10) NOT NULL,
    nombre VARCHAR(200),
    nombre_compania VARCHAR(200),
    nro_ci VARCHAR(20),
    nit VARCHAR(20),
    nombre_factura VARCHAR(200),
    direccion TEXT,
    telefono VARCHAR(50),
    email VARCHAR(100),
    referencia VARCHAR(200),
    activo VARCHAR(50),
    clasificacion VARCHAR(100),
    ruta VARCHAR(100),
    zona VARCHAR(100),
    fecha_registro DATE,
    latitud NUMERIC(10,8),
    longitud NUMERIC(11,8),
    version_atributo INTEGER DEFAULT 1,
    fecha_desde_atributo DATE NOT NULL DEFAULT CURRENT_DATE,
    fecha_hasta_atributo DATE,
    es_atributo_actual BOOLEAN DEFAULT TRUE,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE dw.dim_cliente_atributos IS 'Datos complementarios de clientes con SCD Tipo 2';

-- 1.6 DIM_VENDEDOR - Vendedores
CREATE TABLE IF NOT EXISTS dw.dim_vendedor (
    vendedor_sk SERIAL PRIMARY KEY,
    vendedor_codigo_erp VARCHAR(10) NOT NULL,
    vendedor_nombre VARCHAR(200),
    canal VARCHAR(100),
    fecha_ingreso DATE,
    supervisor VARCHAR(200),
    ciudad VARCHAR(100),
    canal_rrhh VARCHAR(100),
    version_vendedor INTEGER DEFAULT 1,
    fecha_desde_vendedor DATE NOT NULL DEFAULT CURRENT_DATE,
    fecha_hasta_vendedor DATE,
    es_vendedor_actual BOOLEAN DEFAULT TRUE,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    es_activo BOOLEAN DEFAULT TRUE
);

COMMENT ON TABLE dw.dim_vendedor IS 'Vendedores con SCD Tipo 2 en nombre';

-- 1.7 DIM_LOCAL - Locales/Sucursales
CREATE TABLE IF NOT EXISTS dw.dim_local (
    local_sk SERIAL PRIMARY KEY,
    local_codigo_erp VARCHAR(10) NOT NULL,
    local_nombre VARCHAR(100),
    ciudad VARCHAR(100),
    version_local INTEGER DEFAULT 1,
    fecha_desde_local DATE NOT NULL DEFAULT CURRENT_DATE,
    fecha_hasta_local DATE,
    es_local_actual BOOLEAN DEFAULT TRUE,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    es_activo BOOLEAN DEFAULT TRUE
);

COMMENT ON TABLE dw.dim_local IS 'Locales/Sucursales con SCD Tipo 2 en nombre';

-- 1.8 DIM_ALMACEN - Almacenes
CREATE TABLE IF NOT EXISTS dw.dim_almacen (
    almacen_sk SERIAL PRIMARY KEY,
    almacen_codigo_erp VARCHAR(10) NOT NULL,
    almacen_nombre VARCHAR(100),
	ciudad VARCHAR(100),
    version_almacen INTEGER DEFAULT 1,
    fecha_desde_almacen DATE NOT NULL DEFAULT CURRENT_DATE,
    fecha_hasta_almacen DATE,
    es_almacen_actual BOOLEAN DEFAULT TRUE,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    es_activo BOOLEAN DEFAULT TRUE
);

COMMENT ON TABLE dw.dim_almacen IS 'Almacenes con SCD Tipo 2 en nombre';

-- 1.11 DIM_DISTRIBUIDOR - Distribuidores
CREATE TABLE IF NOT EXISTS dw.dim_distribuidor (
    distribuidor_sk SERIAL PRIMARY KEY,
    distribuidor_codigo_erp VARCHAR(10) NOT NULL,
    distribuidor_nombre VARCHAR(100),
    tipo_distribuidor VARCHAR(50),
    version_distribuidor INTEGER DEFAULT 1,
    fecha_desde_distribuidor DATE NOT NULL DEFAULT CURRENT_DATE,
    fecha_hasta_distribuidor DATE,
    es_distribuidor_actual BOOLEAN DEFAULT TRUE,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    es_activo BOOLEAN DEFAULT TRUE
);

-- 1.11 DIM_ZONA - Zonas_POD
CREATE TABLE IF NOT EXISTS dw.dim_zona (
    zona_sk SERIAL PRIMARY KEY,
    zona_codigo_erp VARCHAR(10) NOT NULL,
    zona_descripcion VARCHAR(100),
    version_zona INTEGER DEFAULT 1,
    fecha_desde_zona DATE NOT NULL DEFAULT CURRENT_DATE,
    fecha_hasta_zona DATE,
    es_zona_actual BOOLEAN DEFAULT TRUE,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    es_activo BOOLEAN DEFAULT TRUE
);

COMMENT ON TABLE dw.dim_distribuidor IS 'Distribuidores con SCD Tipo 2 en nombre';

-- 1.12 DIM_TIPO_PREVENTA - Tipos/estados de preventa
CREATE TABLE IF NOT EXISTS dw.dim_tipo_preventa (
    tipo_sk SERIAL PRIMARY KEY,
    tipo_codigo VARCHAR(50) UNIQUE NOT NULL,
    tipo_nombre VARCHAR(200) NOT NULL,
    tipo_categoria VARCHAR(100),
    requiere_seguimiento BOOLEAN DEFAULT FALSE,
    es_visita_exitosa BOOLEAN DEFAULT FALSE,
    orden_prioridad INTEGER DEFAULT 5,
    es_activo BOOLEAN DEFAULT TRUE
);

COMMENT ON TABLE dw.dim_tipo_preventa IS 'Catálogo de tipos/estados de preventa';

-- 1.13 DIM_PRESUPUESTO_VERSION - Versiones de presupuesto
CREATE TABLE IF NOT EXISTS dw.dim_presupuesto_version (
    version_sk SERIAL PRIMARY KEY,
    version_nombre VARCHAR(50) NOT NULL,
    descripcion VARCHAR(200),
    anho INTEGER NOT NULL,
    mes INTEGER NOT NULL,
    fecha_inicio DATE NOT NULL,
    fecha_fin DATE NOT NULL,
    activa BOOLEAN DEFAULT TRUE,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(anho, mes, version_nombre)
);

COMMENT ON TABLE dw.dim_presupuesto_version IS 'Versiones de presupuesto mensual';

-- =====================================================
-- 2. TABLAS DE HECHOS (EVENTOS DE NEGOCIO)
-- =====================================================

-- 2.1 FACT_VENTAS - Ventas diarias
CREATE TABLE IF NOT EXISTS dw.fact_ventas (
    venta_sk BIGSERIAL PRIMARY KEY,
    numero_venta VARCHAR(50) NOT NULL,
    fecha_venta VARCHAR(10) NOT NULL,
    cliente_sk INTEGER NOT NULL REFERENCES dw.dim_cliente(cliente_sk),
    producto_sk INTEGER NOT NULL REFERENCES dw.dim_producto(producto_sk),
    vendedor_sk INTEGER REFERENCES dw.dim_vendedor(vendedor_sk),
    almacen_sk INTEGER REFERENCES dw.dim_almacen(almacen_sk),
    local_sk INTEGER REFERENCES dw.dim_local(local_sk),
    distribuidor_sk INTEGER REFERENCES dw.dim_distribuidor(distribuidor_sk),
	zona_sk INTEGER REFERENCES dw.dim_zona(zona_sk),
    fecha_sk INTEGER NOT NULL REFERENCES dw.dim_fecha(fecha_sk),
    cantidad NUMERIC(18,2) DEFAULT 0,
    precio_unitario NUMERIC(18,2) DEFAULT 0,
    subtotal NUMERIC(18,2) DEFAULT 0,
    descuento NUMERIC(18,2) DEFAULT 0,
    total NUMERIC(18,2) DEFAULT 0,
	ice NUMERIC(18,2) DEFAULT 0,
    venta_neta NUMERIC(18,2) DEFAULT 0,
    pago VARCHAR(8),
    ruta_codigo VARCHAR(10),
	ruta_descripcion VARCHAR(20),
    archivo_origen VARCHAR(255),
    fecha_procesamiento TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    batch_id VARCHAR(50),
	UNIQUE(numero_venta, fecha_venta, cliente_sk, producto_sk)
);

COMMENT ON TABLE dw.fact_ventas IS 'Tabla de hechos: Ventas diarias - No permite repetidos';

-- 2.2 FACT_PREVENTAS - Visitas de preventa
CREATE TABLE IF NOT EXISTS dw.fact_preventas (
    preventa_sk BIGSERIAL PRIMARY KEY,
    -- numero_preventa VARCHAR(50),
    fecha_preventa DATE NOT NULL,
    hora_preventa TIME,
    tiempo_trabajo TIME,
    vendedor_sk INTEGER NOT NULL REFERENCES dw.dim_vendedor(vendedor_sk),
    cliente_sk INTEGER NOT NULL REFERENCES dw.dim_cliente(cliente_sk),
    tipo_sk INTEGER REFERENCES dw.dim_tipo_preventa(tipo_sk),
    fecha_sk INTEGER NOT NULL REFERENCES dw.dim_fecha(fecha_sk),
    total NUMERIC(18,2) DEFAULT 0,
    items INTEGER DEFAULT 0,
    es_venta BOOLEAN GENERATED ALWAYS AS (total > 0 AND items > 0) STORED,
    archivo_origen VARCHAR(255),
    fecha_carga TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    batch_id VARCHAR(50),
    observaciones TEXT
);

COMMENT ON TABLE dw.fact_preventas IS 'Tabla de hechos: Visitas de preventa';

-- 2.3 FACT_PRESUPUESTO_VENDEDOR - Presupuesto por vendedor
CREATE TABLE IF NOT EXISTS dw.fact_presupuesto_vendedor (
    presupuesto_hecho_sk BIGSERIAL PRIMARY KEY,
    version_sk INTEGER NOT NULL REFERENCES dw.dim_presupuesto_version(version_sk),
    vendedor_sk INTEGER NOT NULL REFERENCES dw.dim_vendedor(vendedor_sk),
    producto_sk INTEGER NOT NULL REFERENCES dw.dim_producto(producto_sk),
    fecha_sk INTEGER NOT NULL REFERENCES dw.dim_fecha(fecha_sk),
    presupuesto_unidades NUMERIC(18,2) NOT NULL DEFAULT 0,
    presupuesto_monto NUMERIC(18,2) NOT NULL DEFAULT 0,
    fecha_carga TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    batch_id VARCHAR(50)
);

COMMENT ON TABLE dw.fact_presupuesto_vendedor IS 'Presupuesto mensual por vendedor y producto';

-- 2.4 FACT_INVENTARIO_DIARIO - Stock diario
CREATE TABLE IF NOT EXISTS dw.fact_inventario_diario (
    inventario_sk BIGSERIAL PRIMARY KEY,
    fecha_inventario DATE NOT NULL,
    producto_sk INTEGER NOT NULL REFERENCES dw.dim_producto(producto_sk),
    almacen_sk INTEGER REFERENCES dw.dim_almacen(almacen_sk),
    cantidad_buenos NUMERIC(18,2) DEFAULT 0,
    cantidad_danhados NUMERIC(18,2) DEFAULT 0,
	cantidad_vencidos NUMERIC(18,2) DEFAULT 0,
    cantidad_bajas NUMERIC(18,2) DEFAULT 0,
	cantidad_stock NUMERIC(18,2) DEFAULT 0,
    -- costo_unitario NUMERIC(18,2) DEFAULT 0,
    fecha_sk INTEGER NOT NULL REFERENCES dw.dim_fecha(fecha_sk),
    archivo_origen VARCHAR(255),
    fecha_carga TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    batch_id VARCHAR(50)
);

COMMENT ON TABLE dw.fact_inventario_diario IS 'Inventario diario por producto y almacén';

-- =====================================================
-- 3. TABLAS DE MÉTRICAS AGREGADAS
-- =====================================================

-- 3.1 AGG_CLIENTE_METRICS - Métricas de clientes
CREATE TABLE IF NOT EXISTS dw.agg_cliente_metrics (
    cliente_metrics_sk SERIAL PRIMARY KEY,
    cliente_codigo_erp VARCHAR(50) NOT NULL UNIQUE,
    total_ventas NUMERIC(18,2) DEFAULT 0,
    cantidad_pedidos INTEGER DEFAULT 0,
    ticket_promedio NUMERIC(18,2) DEFAULT 0,
    primera_compra DATE,
    ultima_compra DATE,
    total_ultima_compra NUMERIC(18,2) DEFAULT 0,
    dias_desde_ultima_compra INTEGER DEFAULT 0,
    atendido_90 BOOLEAN DEFAULT FALSE,
    atendido_mes BOOLEAN DEFAULT FALSE,
    dias_entre_compras NUMERIC(10,2) DEFAULT 0,
    frecuencia_dias NUMERIC(10,2) DEFAULT 0,
    clasificacion_frecuencia VARCHAR(50),
    tendencia_compra VARCHAR(50),
    variedad_productos INTEGER DEFAULT 0,
    categoria_preferida VARCHAR(200),
    top_5_productos_json JSONB,
    productos_ultima_compra_json JSONB,
    ltv NUMERIC(18,2) DEFAULT 0,
    segmento_rfm VARCHAR(10),
    porcentaje_individual_global NUMERIC(10,2) DEFAULT 0,
    clasificacion_abc_zona_monto VARCHAR(5),
	clasificacion_abc_poligono_monto VARCHAR(5),
	clasificacion_abc_zona_prom VARCHAR(5),
	clasificacion_abc_poligono_prom VARCHAR(5),
    fecha_calculo TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    batch_id VARCHAR(50)
);

COMMENT ON TABLE dw.agg_cliente_metrics IS 'Métricas pre-calculadas de clientes';

-- 3.1 AGG_CLIENTE_METRICS - Métricas de clientes
CREATE TABLE IF NOT EXISTS dw.agg_ruta_metrics (
    ruta_metrics_sk SERIAL PRIMARY KEY,
    ruta_nombre VARCHAR(100) NOT NULL UNIQUE,
    total_ventas NUMERIC(18,2) DEFAULT 0,
    cantidad_pedidos INTEGER DEFAULT 0,
	clientes_totales INTEGER DEFAULT 0,
    ticket_promedio NUMERIC(18,2) DEFAULT 0,
	ventas_promedio NUMERIC(18,2) DEFAULT 0,
	ventas_kisiomo NUMERIC(18,2) DEFAULT 0,
	pedidos_promedio NUMERIC(18,2) DEFAULT 0,
	pedidos_kisimo NUMERIC(18,2) DEFAULT 0,
    top_5_productos_json JSONB,
    segmento_rfm VARCHAR(10),
    vendedor_asignado VARCHAR(200),
    ruta VARCHAR(200),
    clasificacion_abc_zona_monto VARCHAR(5),
	clasificacion_abc_poligono_monto VARCHAR(5),
	clasificacion_abc_zona_prom VARCHAR(5),
	clasificacion_abc_poligono_prom VARCHAR(5),
    fecha_calculo TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    batch_id VARCHAR(50)
);

COMMENT ON TABLE dw.agg_ruta_metrics IS 'Métricas pre-calculadas de rutas';

-- =====================================================
-- 4. TABLAS DE STAGING (RECEPCIÓN DE DATOS)
-- =====================================================

-- 4.1 STG_VENTAS - Datos crudos de ventas
CREATE TABLE IF NOT EXISTS staging.stg_ventas (
    stg_id BIGSERIAL PRIMARY KEY,
    no_venta VARCHAR(50),
    fecha VARCHAR(20),
    cliente VARCHAR(50),
    nombre_cliente VARCHAR(200),
    grupo VARCHAR(50),
    descripcion_grupo VARCHAR(200),
    subgrupo VARCHAR(50),
    descripcion_subgrupo VARCHAR(200),
    clase VARCHAR(50),
    descripcion_clase VARCHAR(200),
    subclase VARCHAR(50),
    descripcion_subclase VARCHAR(200),
    articulo VARCHAR(50),
    descripcion_articulo VARCHAR(200),
    um VARCHAR(20),
    cantidad VARCHAR(50),
    precio VARCHAR(50),
    subtotal VARCHAR(50),
    descuento VARCHAR(50),
    total VARCHAR(50),
    local VARCHAR(50),
    descripcion_local VARCHAR(200),
    almacen VARCHAR(50),
    descripcion_almacen VARCHAR(200),
    ruta VARCHAR(50),
    descripcion_ruta VARCHAR(200),
    vendedor VARCHAR(50),
    descripcion_vendedor VARCHAR(200),
    distribuidor VARCHAR(50),
    descripcion_distribuidor VARCHAR(200),
    zona VARCHAR(50),
    descripcion_zona VARCHAR(200),
    componente VARCHAR(100),
    ice VARCHAR(50),
    venta_neta VARCHAR(50),
    pago VARCHAR(50),
    exhibidor VARCHAR(50),
    clase2 VARCHAR(50),
	ruta3 VARCHAR(50),
    punto_frio VARCHAR(50),
    nombre_archivo VARCHAR(255),
    fecha_carga TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    batch_id VARCHAR(50),
    estado VARCHAR(20) DEFAULT 'PENDIENTE',
    error_msg TEXT
);

-- 4.2 STG_CLIENTES - Datos crudos de clientes externos
CREATE TABLE IF NOT EXISTS staging.stg_clientes (
    stg_id BIGSERIAL PRIMARY KEY,
    nro VARCHAR(50),
    codigo VARCHAR(50),
    nombre VARCHAR(200),
    nombre_compania VARCHAR(200),
    nro_ci VARCHAR(50),
    nit VARCHAR(50),
    nombre_factura VARCHAR(200),
    direccion TEXT,
    telefono VARCHAR(100),
    email VARCHAR(100),
    referencia VARCHAR(200),
    activo VARCHAR(50),
    clasificacion VARCHAR(100),
    ruta VARCHAR(100),
    zona VARCHAR(100),
    fecha_registro VARCHAR(20),
    latitud VARCHAR(50),
    longitud VARCHAR(50),
    nombre_archivo VARCHAR(255),
    fecha_carga TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    batch_id VARCHAR(50),
    estado VARCHAR(20) DEFAULT 'PENDIENTE'
);

-- 4.3 STG_PREVENTAS - Datos crudos de preventas
CREATE TABLE IF NOT EXISTS staging.stg_preventas (
    stg_id BIGSERIAL PRIMARY KEY,
    vendedor VARCHAR(200),
    cliente VARCHAR(200),
    ruta VARCHAR(100),
    fecha VARCHAR(20),
    hora VARCHAR(20),
    tiempo_trabajo VARCHAR(20),
    tipo VARCHAR(200),
    total VARCHAR(50),
    items VARCHAR(50),
    nombre_archivo VARCHAR(255),
    fecha_carga TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    batch_id VARCHAR(50),
    estado VARCHAR(20) DEFAULT 'PENDIENTE'
);

-- 4.4 STG_PRESUPUESTO - Datos crudos de presupuesto
CREATE TABLE IF NOT EXISTS staging.stg_presupuesto (
    stg_id BIGSERIAL PRIMARY KEY,
    vendedor_codigo VARCHAR(50),
    producto_codigo VARCHAR(50),
    unidades VARCHAR(50),
    monto VARCHAR(50),
    mes VARCHAR(10),
    anho VARCHAR(10),
    version VARCHAR(50),
    nombre_archivo VARCHAR(255),
    fecha_carga TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    batch_id VARCHAR(50),
    estado VARCHAR(20) DEFAULT 'PENDIENTE'
);

-- 4.5 STG_INVENTARIO - Datos crudos de inventario
CREATE TABLE IF NOT EXISTS staging.stg_inventario (
    stg_id BIGSERIAL PRIMARY KEY,
    fecha VARCHAR(20),
	almacen VARCHAR(50),
    articulo VARCHAR(50),
    descripcion VARCHAR(100),
    buenos VARCHAR(50),
    danhados VARCHAR(50),
    vencidos VARCHAR(50),
	baja VARCHAR(50),
	stock VARCHAR(50),
    nombre_archivo VARCHAR(255),
    fecha_carga TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    batch_id VARCHAR(50),
    estado VARCHAR(20) DEFAULT 'PENDIENTE'
);

-- =====================================================
-- 5. TABLAS DE CONTROL
-- =====================================================

-- 5.1 CONTROL_ETL_LOG - Registro de procesos ETL
CREATE TABLE IF NOT EXISTS control.etl_log (
    log_id BIGSERIAL PRIMARY KEY,
    batch_id VARCHAR(50) NOT NULL,
    nombre_archivo VARCHAR(255),
    fecha_inicio TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    fecha_fin TIMESTAMP,
    estado VARCHAR(20),
    registros_leidos INTEGER DEFAULT 0,
    registros_insertados_staging INTEGER DEFAULT 0,
    registros_procesados_dw INTEGER DEFAULT 0,
    registros_con_error INTEGER DEFAULT 0,
    error_msg TEXT
);

-- 5.2 CONTROL_ETL_ERROR - Detalle de errores
CREATE TABLE IF NOT EXISTS control.etl_detalle_error (
    error_id BIGSERIAL PRIMARY KEY,
    batch_id VARCHAR(50),
    stg_id INTEGER,
    tipo_error VARCHAR(100),
    descripcion_error TEXT,
    fecha_error TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- FIN DEL SCRIPT
-- =====================================================