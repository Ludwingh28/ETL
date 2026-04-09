


-- =====================================================
-- CREACIÓN DEL DATA WAREHOUSE - TODAS LAS FUNCIONES
-- =====================================================

-- 1. POBLAR_DIM_FECHA
CREATE OR REPLACE FUNCTION dw.poblar_dim_fecha(
    p_fecha_inicio DATE,
    p_fecha_fin DATE
)
RETURNS VOID AS $$
DECLARE
    v_fecha DATE;
    v_fecha_sk INTEGER;
    v_mes_actual BOOLEAN;
    v_trimestre_actual BOOLEAN;
    v_fecha_hoy DATE := CURRENT_DATE;
BEGIN
    -- Validar fechas
    IF p_fecha_inicio > p_fecha_fin THEN
        RAISE EXCEPTION 'La fecha de inicio (%) no puede ser mayor a la fecha fin (%)', 
            p_fecha_inicio, p_fecha_fin;
    END IF;
    
    -- Recorrer cada fecha del rango
    v_fecha := p_fecha_inicio;
    
    WHILE v_fecha <= p_fecha_fin LOOP
        -- Calcular SK en formato YYYYMMDD
        v_fecha_sk := EXTRACT(YEAR FROM v_fecha)::INTEGER * 10000 + 
                      EXTRACT(MONTH FROM v_fecha)::INTEGER * 100 + 
                      EXTRACT(DAY FROM v_fecha)::INTEGER;
        
        -- Calcular indicadores relativos
        v_mes_actual := (EXTRACT(YEAR FROM v_fecha) = EXTRACT(YEAR FROM v_fecha_hoy) AND
                        EXTRACT(MONTH FROM v_fecha) = EXTRACT(MONTH FROM v_fecha_hoy));
        
        v_trimestre_actual := (EXTRACT(YEAR FROM v_fecha) = EXTRACT(YEAR FROM v_fecha_hoy) AND
                              EXTRACT(QUARTER FROM v_fecha) = EXTRACT(QUARTER FROM v_fecha_hoy));
        
        -- Insertar o actualizar la fecha
        INSERT INTO dw.dim_fecha (
            fecha_sk,
            fecha_completa,
            anho,
            anho_mes,
            anho_mes_numero,
            mes_numero,
            mes_nombre,
            mes_nombre_corto,
            mes_anho,
            mes_anho_corto,
            trimestre_numero,
            trimestre_nombre,
            anho_trimestre,
            semestre_numero,
            semestre_nombre,
            dia_numero,
            dia_nombre,
            dia_nombre_corto,
            dia_semana_numero,
            dia_semana_numero_iso,
            dia_nro_dia_anho,
            dia_nro_dia_formato,
            semana_numero,
            semana_anho,
            semana_mes,
            semana_en_mes,
            es_fin_semana,
            mes_actual,
            trimestre_actual
        ) VALUES (
            v_fecha_sk,
            v_fecha,
            EXTRACT(YEAR FROM v_fecha),
            TO_CHAR(v_fecha, 'YYYY-MM'),
            EXTRACT(YEAR FROM v_fecha)::INTEGER * 100 + EXTRACT(MONTH FROM v_fecha)::INTEGER,
            EXTRACT(MONTH FROM v_fecha),
            TO_CHAR(v_fecha, 'Month'),
            TO_CHAR(v_fecha, 'Mon'),
            TO_CHAR(v_fecha, 'MM') || '-' || TO_CHAR(v_fecha, 'YYYY'),
            TO_CHAR(v_fecha, 'Mon') || '-' || TO_CHAR(v_fecha, 'YYYY'),
            EXTRACT(QUARTER FROM v_fecha),
            'T' || EXTRACT(QUARTER FROM v_fecha),
            EXTRACT(YEAR FROM v_fecha) || '-T' || EXTRACT(QUARTER FROM v_fecha),
            CEIL(EXTRACT(MONTH FROM v_fecha) / 6.0),
            'S' || CEIL(EXTRACT(MONTH FROM v_fecha) / 6.0),
            EXTRACT(DAY FROM v_fecha),
            TO_CHAR(v_fecha, 'Day'),
            TO_CHAR(v_fecha, 'Dy'),
            EXTRACT(DOW FROM v_fecha) + 1, -- 1=Domingo
            EXTRACT(ISODOW FROM v_fecha), -- 1=Lunes
            EXTRACT(DOY FROM v_fecha),
            EXTRACT(ISODOW FROM v_fecha) || '-' || UPPER(TO_CHAR(v_fecha, 'Dy')),
            EXTRACT(WEEK FROM v_fecha),
            EXTRACT(YEAR FROM v_fecha),
            EXTRACT(WEEK FROM v_fecha) || '-' || UPPER(TO_CHAR(v_fecha, 'Mon')),
            (EXTRACT(WEEK FROM v_fecha) - EXTRACT(WEEK FROM DATE_TRUNC('month', v_fecha)) + 1) || '-' || UPPER(TO_CHAR(v_fecha, 'Mon')),
            (EXTRACT(DOW FROM v_fecha) IN (0, 6)), -- Sábado (6) o Domingo (0)
            v_mes_actual,
            v_trimestre_actual
        )
        ON CONFLICT (fecha_completa) DO UPDATE SET
            anho = EXCLUDED.anho,
            anho_mes = EXCLUDED.anho_mes,
            anho_mes_numero = EXCLUDED.anho_mes_numero,
            mes_numero = EXCLUDED.mes_numero,
            mes_nombre = EXCLUDED.mes_nombre,
            mes_nombre_corto = EXCLUDED.mes_nombre_corto,
            mes_anho = EXCLUDED.mes_anho,
            mes_anho_corto = EXCLUDED.mes_anho_corto,
            trimestre_numero = EXCLUDED.trimestre_numero,
            trimestre_nombre = EXCLUDED.trimestre_nombre,
            anho_trimestre = EXCLUDED.anho_trimestre,
            semestre_numero = EXCLUDED.semestre_numero,
            semestre_nombre = EXCLUDED.semestre_nombre,
            dia_numero = EXCLUDED.dia_numero,
            dia_nombre = EXCLUDED.dia_nombre,
            dia_nombre_corto = EXCLUDED.dia_nombre_corto,
            dia_semana_numero = EXCLUDED.dia_semana_numero,
            dia_semana_numero_iso = EXCLUDED.dia_semana_numero_iso,
            dia_nro_dia_anho = EXCLUDED.dia_nro_dia_anho,
            dia_nro_dia_formato = EXCLUDED.dia_nro_dia_formato,
            semana_numero = EXCLUDED.semana_numero,
            semana_anho = EXCLUDED.semana_anho,
            semana_mes = EXCLUDED.semana_mes,
            semana_en_mes = EXCLUDED.semana_en_mes,
            es_fin_semana = EXCLUDED.es_fin_semana,
            mes_actual = EXCLUDED.mes_actual,
            trimestre_actual = EXCLUDED.trimestre_actual;
        
        v_fecha := v_fecha + INTERVAL '1 day';
    END LOOP;
    
    RAISE NOTICE 'Dimensión de fechas poblada exitosamente desde % hasta %', 
        p_fecha_inicio, p_fecha_fin;
END;
$$ LANGUAGE plpgsql;

-- 2. POBLAR_DIM_CATEGORIA_PRODUCTO
CREATE OR REPLACE FUNCTION dw.ins_ups_dim_categoria_producto(
    p_grupo_codigo VARCHAR(4),
    p_grupo_descripcion VARCHAR(80),
    p_subgrupo_codigo VARCHAR(4),
    p_subgrupo_descripcion VARCHAR(80),
    p_clase_codigo VARCHAR(4),
    p_clase_descripcion VARCHAR(80),
    p_subclase_codigo VARCHAR(4),
    p_subclase_descripcion VARCHAR(80)
)
RETURNS INTEGER AS $$
DECLARE
    v_categoria_sk INTEGER;
    v_existente RECORD;
BEGIN
    -- Buscar categoría existente actual con los mismos códigos
    SELECT * INTO v_existente
    FROM dw.dim_categoria_producto
    WHERE grupo_codigo = p_grupo_codigo
      AND subgrupo_codigo = p_subgrupo_codigo
      AND clase_codigo = p_clase_codigo
      AND subclase_codigo = p_subclase_codigo
      AND es_categoria_actual = TRUE;
    
    -- Si no existe, insertar nueva categoría
    IF v_existente IS NULL THEN
        INSERT INTO dw.dim_categoria_producto (
            grupo_codigo, grupo_descripcion,
            subgrupo_codigo, subgrupo_descripcion,
            clase_codigo, clase_descripcion,
            subclase_codigo, subclase_descripcion
        ) VALUES (
            p_grupo_codigo, p_grupo_descripcion,
            p_subgrupo_codigo, p_subgrupo_descripcion,
            p_clase_codigo, p_clase_descripcion,
            p_subclase_codigo, p_subclase_descripcion
        ) RETURNING categoria_sk INTO v_categoria_sk;
        
        RETURN v_categoria_sk;
    END IF;
    
    -- Si existe, verificar si los datos cambiaron
    IF (v_existente.grupo_descripcion IS DISTINCT FROM p_grupo_descripcion OR
        v_existente.subgrupo_descripcion IS DISTINCT FROM p_subgrupo_descripcion OR
        v_existente.clase_descripcion IS DISTINCT FROM p_clase_descripcion OR
        v_existente.subclase_descripcion IS DISTINCT FROM p_subclase_descripcion) THEN
        
        -- Cerrar versión actual
        UPDATE dw.dim_categoria_producto
        SET fecha_hasta_categoria = CURRENT_DATE,
            es_categoria_actual = FALSE
        WHERE categoria_sk = v_existente.categoria_sk;
        
        -- Insertar nueva versión
        INSERT INTO dw.dim_categoria_producto (
            grupo_codigo, grupo_descripcion,
            subgrupo_codigo, subgrupo_descripcion,
            clase_codigo, clase_descripcion,
            subclase_codigo, subclase_descripcion,
            version_categoria
        ) VALUES (
            p_grupo_codigo, p_grupo_descripcion,
            p_subgrupo_codigo, p_subgrupo_descripcion,
            p_clase_codigo, p_clase_descripcion,
            p_subclase_codigo, p_subclase_descripcion,
            v_existente.version_categoria + 1
        ) RETURNING categoria_sk INTO v_categoria_sk;
        
        RETURN v_categoria_sk;
    END IF;
    
    -- Si no hubo cambios, retornar el SK existente
    RETURN v_existente.categoria_sk;
END;
$$ LANGUAGE plpgsql;

-- 3. POBLAR_DIM_PRODUCTO (VERSIÓN COMPLETA CON SCD TIPO 2 EN CATEGORÍAS)
CREATE OR REPLACE FUNCTION dw.ins_ups_dim_producto(
    p_producto_codigo_erp VARCHAR(20),
    p_producto_nombre VARCHAR(200),
    p_componente VARCHAR(20),
    p_grupo_codigo VARCHAR(4),
    p_grupo_descripcion VARCHAR(80),
    p_subgrupo_codigo VARCHAR(4),
    p_subgrupo_descripcion VARCHAR(80),
    p_clase_codigo VARCHAR(4),
    p_clase_descripcion VARCHAR(80),
    p_subclase_codigo VARCHAR(4),
    p_subclase_descripcion VARCHAR(80),
    p_u_l INTEGER DEFAULT 0,
    p_u_c INTEGER DEFAULT 0,
    p_proveedor VARCHAR(200) DEFAULT NULL,
    p_cat_comercial VARCHAR(100) DEFAULT NULL,
    p_unidad_medida VARCHAR(20) DEFAULT NULL
)
RETURNS INTEGER AS $$
DECLARE
    v_producto_sk INTEGER;
    v_existente RECORD;
    v_categoria_sk INTEGER;
    v_cat_rrhh VARCHAR(100);
    v_producto_nombre_upper VARCHAR(200);
    v_cat_existente RECORD;
BEGIN
    -- ==========================================================
    -- 1. OBTENER O CREAR CATEGORÍA (CON SCD TIPO 2)
    -- ==========================================================
    
    -- Buscar categoría activa por códigos
    SELECT * INTO v_cat_existente
    FROM dw.dim_categoria_producto
    WHERE grupo_codigo = p_grupo_codigo
      AND subgrupo_codigo = p_subgrupo_codigo
      AND clase_codigo = p_clase_codigo
      AND subclase_codigo = p_subclase_codigo
      AND es_categoria_actual = TRUE;
    
    -- CASO 1: No existe la categoría → CREAR NUEVA
    IF v_cat_existente IS NULL THEN
        INSERT INTO dw.dim_categoria_producto (
            grupo_codigo, grupo_descripcion,
            subgrupo_codigo, subgrupo_descripcion,
            clase_codigo, clase_descripcion,
            subclase_codigo, subclase_descripcion
        ) VALUES (
            p_grupo_codigo, p_grupo_descripcion,
            p_subgrupo_codigo, p_subgrupo_descripcion,
            p_clase_codigo, p_clase_descripcion,
            p_subclase_codigo, p_subclase_descripcion
        ) RETURNING categoria_sk INTO v_categoria_sk;
        
        RAISE NOTICE '✅ NUEVA CATEGORÍA CREADA: % > % > % > % (SK: %)', 
            p_grupo_descripcion, p_subgrupo_descripcion, 
            p_clase_descripcion, p_subclase_descripcion,
            v_categoria_sk;
    
    -- CASO 2: Categoría existe, pero verificar si las descripciones cambiaron
    ELSIF (v_cat_existente.grupo_descripcion IS DISTINCT FROM p_grupo_descripcion OR
           v_cat_existente.subgrupo_descripcion IS DISTINCT FROM p_subgrupo_descripcion OR
           v_cat_existente.clase_descripcion IS DISTINCT FROM p_clase_descripcion OR
           v_cat_existente.subclase_descripcion IS DISTINCT FROM p_subclase_descripcion) THEN
        
        -- Cerrar versión actual de categoría
        UPDATE dw.dim_categoria_producto
        SET fecha_hasta_categoria = CURRENT_DATE,
            es_categoria_actual = FALSE
        WHERE categoria_sk = v_cat_existente.categoria_sk;
        
        -- Insertar nueva versión de categoría
        INSERT INTO dw.dim_categoria_producto (
            grupo_codigo, grupo_descripcion,
            subgrupo_codigo, subgrupo_descripcion,
            clase_codigo, clase_descripcion,
            subclase_codigo, subclase_descripcion,
            version_categoria
        ) VALUES (
            p_grupo_codigo, p_grupo_descripcion,
            p_subgrupo_codigo, p_subgrupo_descripcion,
            p_clase_codigo, p_clase_descripcion,
            p_subclase_codigo, p_subclase_descripcion,
            v_cat_existente.version_categoria + 1
        ) RETURNING categoria_sk INTO v_categoria_sk;
        
        RAISE NOTICE '🔄 CATEGORÍA ACTUALIZADA: Versión % → % (SK: %)', 
            v_cat_existente.version_categoria, 
            v_cat_existente.version_categoria + 1,
            v_categoria_sk;
    
    -- CASO 3: Categoría existe y sin cambios
    ELSE
        v_categoria_sk := v_cat_existente.categoria_sk;
        RAISE NOTICE '✓ CATEGORÍA EXISTENTE SIN CAMBIOS: SK=%', v_categoria_sk;
    END IF;
    
    -- ==========================================================
    -- 2. DETERMINAR CAT_RRHH
    -- ==========================================================
    v_producto_nombre_upper := UPPER(p_producto_nombre);
    
    v_cat_rrhh := CASE
        WHEN v_producto_nombre_upper NOT LIKE '%VINAGRE%' 
             AND (v_producto_nombre_upper LIKE '%VINO %' 
                  OR v_producto_nombre_upper LIKE '%RON %' 
                  OR v_producto_nombre_upper LIKE '%VODKA %' 
                  OR v_producto_nombre_upper LIKE '%GIN %') THEN 'LICORES'
        WHEN v_producto_nombre_upper LIKE '%COMBO %' THEN 'COMBO'
        WHEN v_producto_nombre_upper LIKE '%PACK %' THEN 'PACK'
        WHEN v_producto_nombre_upper LIKE '%CAJA %' THEN 'CAJA'
        WHEN v_producto_nombre_upper LIKE '%PROMO %' THEN 'PROMO'
        WHEN v_producto_nombre_upper LIKE '%SUPER FRUT%' THEN 'SUPER FRUT'
        ELSE 'GENERAL'
    END;
    
    -- ==========================================================
    -- 3. BUSCAR PRODUCTO EXISTENTE
    -- ==========================================================
    SELECT * INTO v_existente
    FROM dw.dim_producto
    WHERE producto_codigo_erp = p_producto_codigo_erp
      AND es_producto_actual = TRUE;
    
    -- ==========================================================
    -- 4. CASO: PRODUCTO NO EXISTE → INSERTAR
    -- ==========================================================
    IF v_existente IS NULL THEN
        INSERT INTO dw.dim_producto (
            producto_codigo_erp, 
            producto_nombre, 
            componente,
            categoria_sk, 
            u_l, 
            u_c, 
            proveedor, 
            cat_comercial, 
            unidad_medida, 
            cat_rrhh
        ) VALUES (
            p_producto_codigo_erp, 
            p_producto_nombre, 
            p_componente,
            v_categoria_sk, 
            p_u_l, 
            p_u_c, 
            p_proveedor, 
            p_cat_comercial,
            p_unidad_medida, 
            v_cat_rrhh
        ) RETURNING producto_sk INTO v_producto_sk;
        
        RAISE NOTICE '✅ NUEVO PRODUCTO CREADO: % - % (SK: %)', 
            p_producto_codigo_erp, p_producto_nombre, v_producto_sk;
        RETURN v_producto_sk;
    END IF;
    
    -- ==========================================================
    -- 5. CASO: PRODUCTO EXISTE → VERIFICAR CAMBIOS
    -- ==========================================================
    IF (v_existente.producto_nombre IS DISTINCT FROM p_producto_nombre OR
        v_existente.componente IS DISTINCT FROM p_componente OR
        v_existente.categoria_sk IS DISTINCT FROM v_categoria_sk OR
        v_existente.u_l IS DISTINCT FROM p_u_l OR
        v_existente.u_c IS DISTINCT FROM p_u_c OR
        v_existente.proveedor IS DISTINCT FROM p_proveedor OR
        v_existente.cat_comercial IS DISTINCT FROM p_cat_comercial OR
        v_existente.unidad_medida IS DISTINCT FROM p_unidad_medida OR
        v_existente.cat_rrhh IS DISTINCT FROM v_cat_rrhh) THEN
        
        -- Cerrar versión actual
        UPDATE dw.dim_producto
        SET fecha_hasta_producto = CURRENT_DATE,
            es_producto_actual = FALSE
        WHERE producto_sk = v_existente.producto_sk;
        
        -- Insertar nueva versión
        INSERT INTO dw.dim_producto (
            producto_codigo_erp, 
            producto_nombre, 
            componente,
            categoria_sk, 
            u_l, 
            u_c, 
            proveedor, 
            cat_comercial,
            unidad_medida, 
            cat_rrhh, 
            version_producto
        ) VALUES (
            p_producto_codigo_erp, 
            p_producto_nombre, 
            p_componente,
            v_categoria_sk, 
            p_u_l, 
            p_u_c, 
            p_proveedor, 
            p_cat_comercial,
            p_unidad_medida, 
            v_cat_rrhh, 
            v_existente.version_producto + 1
        ) RETURNING producto_sk INTO v_producto_sk;
        
        RAISE NOTICE '🔄 PRODUCTO ACTUALIZADO: % - Nueva versión % (SK: %)', 
            p_producto_codigo_erp, v_existente.version_producto + 1, v_producto_sk;
        RETURN v_producto_sk;
    END IF;
    
    -- ==========================================================
    -- 6. CASO: SIN CAMBIOS
    -- ==========================================================
    UPDATE dw.dim_producto
    SET fecha_actualizacion = CURRENT_TIMESTAMP
    WHERE producto_sk = v_existente.producto_sk;
    
    RAISE NOTICE '✓ PRODUCTO SIN CAMBIOS: % (SK: %)', 
        p_producto_codigo_erp, v_existente.producto_sk;
    RETURN v_existente.producto_sk;
END;
$$ LANGUAGE plpgsql;

-- 4. Función para cargar/actualizar cliente desde ERP
CREATE OR REPLACE FUNCTION dw.cargar_cliente_erp(
    p_codigo_erp VARCHAR(10),
    p_nombre VARCHAR(200),
    p_cadena VARCHAR(100)
)
RETURNS INTEGER AS $$
DECLARE
    v_cliente_sk INTEGER;
    v_existente RECORD;
BEGIN
    -- Buscar cliente actual con mismo código
    SELECT * INTO v_existente
    FROM dw.dim_cliente
    WHERE cliente_codigo_erp = p_codigo_erp
      AND es_cliente_actual = TRUE;
    
    -- Si no existe, insertar
    IF v_existente IS NULL THEN
        INSERT INTO dw.dim_cliente (cliente_codigo_erp, cliente_nombre, cadena)
        VALUES (p_codigo_erp, p_nombre, p_cadena)
        RETURNING cliente_sk INTO v_cliente_sk;
        
        RETURN v_cliente_sk;
    END IF;
    
    -- Si existe y hay cambios, crear nueva versión
    IF (v_existente.cliente_nombre IS DISTINCT FROM p_nombre OR
        v_existente.cadena IS DISTINCT FROM p_cadena) THEN
        
        -- Cerrar versión actual
        UPDATE dw.dim_cliente
        SET fecha_hasta_cliente = CURRENT_DATE,
            es_cliente_actual = FALSE
        WHERE cliente_sk = v_existente.cliente_sk;
        
        -- Insertar nueva versión
        INSERT INTO dw.dim_cliente (
            cliente_codigo_erp, cliente_nombre, cadena, version_cliente
        ) VALUES (
            p_codigo_erp, p_nombre, p_cadena, v_existente.version_cliente + 1
        ) RETURNING cliente_sk INTO v_cliente_sk;
        
        RETURN v_cliente_sk;
    END IF;
    
    RETURN v_existente.cliente_sk;
END;
$$ LANGUAGE plpgsql;

-- 5. Función para cargar/actualizar atributos desde CRM
CREATE OR REPLACE FUNCTION dw.cargar_atributos_crm(
    p_nro INTEGER,
    p_codigo VARCHAR(50),
    p_nombre VARCHAR(200),
    p_nombre_compania VARCHAR(200),
    p_nro_ci VARCHAR(20),
    p_nit VARCHAR(20),
    p_nombre_factura VARCHAR(200),
    p_direccion TEXT,
    p_telefono VARCHAR(50),
    p_email VARCHAR(100),
    p_referencia VARCHAR(200),
    p_activo VARCHAR(50),
    p_clasificacion VARCHAR(100),
    p_ruta VARCHAR(100),
    p_zona VARCHAR(100),
    p_fecha_registro DATE,
    p_latitud NUMERIC,
    p_longitud NUMERIC
)
RETURNS INTEGER AS $$
DECLARE
    v_atributo_sk INTEGER;
    v_existente RECORD;
BEGIN
    -- Buscar atributos actuales para este cliente
    SELECT * INTO v_existente
    FROM dw.dim_cliente_atributos
    WHERE codigo = p_codigo
      AND es_atributo_actual = TRUE;
    
    -- Si no existen, insertar
    IF v_existente IS NULL THEN
        INSERT INTO dw.dim_cliente_atributos (
            nro, codigo, nombre, nombre_compania,
            nro_ci, nit, nombre_factura, direccion, telefono, email,
            referencia, activo, clasificacion, ruta, zona, fecha_registro,
            latitud, longitud
        ) VALUES (
            p_nro, p_codigo, p_nombre, p_nombre_compania,
            p_nro_ci, p_nit, p_nombre_factura, p_direccion, p_telefono, p_email,
            p_referencia, p_activo, p_clasificacion, p_ruta, p_zona, p_fecha_registro,
            p_latitud, p_longitud
        ) RETURNING atributo_sk INTO v_atributo_sk;
        
        RETURN v_atributo_sk;
    END IF;
    
    -- Si existen y hay cambios (comparar campos relevantes)
    IF (v_existente.nombre IS DISTINCT FROM p_nombre OR
        v_existente.direccion IS DISTINCT FROM p_direccion OR
        v_existente.telefono IS DISTINCT FROM p_telefono OR
		v_existente.nit IS DISTINCT FROM p_nit OR
        v_existente.clasificacion IS DISTINCT FROM p_clasificacion) THEN
        
        -- Cerrar versión actual
        UPDATE dw.dim_cliente_atributos
        SET fecha_hasta_atributo = CURRENT_DATE,
            es_atributo_actual = FALSE
        WHERE atributo_sk = v_existente.atributo_sk;
        
        -- Insertar nueva versión
        INSERT INTO dw.dim_cliente_atributos (
            nro, codigo, nombre, nombre_compania,
            nro_ci, nit, nombre_factura, direccion, telefono, email,
            referencia, activo, clasificacion, ruta, zona, fecha_registro,
            latitud, longitud, version_atributo
        ) VALUES (
            p_nro, p_codigo, p_nombre, p_nombre_compania,
            p_nro_ci, p_nit, p_nombre_factura, p_direccion, p_telefono, p_email,
            p_referencia, p_activo, p_clasificacion, p_ruta, p_zona, p_fecha_registro,
            p_latitud, p_longitud, v_existente.version_atributo + 1
        ) RETURNING atributo_sk INTO v_atributo_sk;
        
        RETURN v_atributo_sk;
    END IF;
    
    RETURN v_existente.atributo_sk;
END;
$$ LANGUAGE plpgsql;

-- 6. Función para cargar/actualizar local (SCD Tipo 2)
CREATE OR REPLACE FUNCTION dw.cargar_local(
    p_local_codigo_erp VARCHAR(10),
    p_local_nombre VARCHAR(100)
)
RETURNS INTEGER AS $$
DECLARE
    v_local_sk INTEGER;
    v_existente RECORD;
    v_ciudad VARCHAR(100);
BEGIN
    -- Determinar ciudad basada en el código
    v_ciudad := 
	CASE
        WHEN p_local_codigo_erp LIKE '10' THEN 'SANTA CRUZ'
        WHEN p_local_codigo_erp LIKE '20' THEN 'SANTA CRUZ'
        WHEN p_local_codigo_erp LIKE '30' THEN 'COCHABAMBA'
        WHEN p_local_codigo_erp LIKE '40' THEN 'LA PAZ'
        ELSE 'OTRA'
    END;
    
    -- Buscar local actual con mismo código
    SELECT * INTO v_existente
    FROM dw.dim_local
    WHERE local_codigo_erp = p_local_codigo_erp
      AND es_local_actual = TRUE;
    
    -- Si no existe, insertar nuevo local
    IF v_existente IS NULL THEN
        INSERT INTO dw.dim_local (
            local_codigo_erp, 
            local_nombre, 
            ciudad
        ) VALUES (
            p_local_codigo_erp, 
            p_local_nombre, 
            v_ciudad
        ) RETURNING local_sk INTO v_local_sk;
        
        RETURN v_local_sk;
    END IF;
    
    -- Si existe, verificar si el nombre cambió
    IF (v_existente.local_nombre IS DISTINCT FROM p_local_nombre) THEN
        
        -- Cerrar versión actual
        UPDATE dw.dim_local
        SET fecha_hasta_local = CURRENT_DATE,
            es_local_actual = FALSE
        WHERE local_sk = v_existente.local_sk;
        
        -- Insertar nueva versión
        INSERT INTO dw.dim_local (
            local_codigo_erp, 
            local_nombre, 
            ciudad,
            version_local
        ) VALUES (
            p_local_codigo_erp, 
            p_local_nombre, 
            v_ciudad,
            v_existente.version_local + 1
        ) RETURNING local_sk INTO v_local_sk;
        
        RETURN v_local_sk;
    END IF;
    
    -- Si no hay cambios, retornar el SK existente
    -- Actualizar fecha_actualización
    UPDATE dw.dim_local
    SET fecha_actualizacion = CURRENT_TIMESTAMP
    WHERE local_sk = v_existente.local_sk;
    
    RETURN v_existente.local_sk;
END;
$$ LANGUAGE plpgsql;

-- 7. Función para cargar/actualizar almacen (SCD Tipo 2)
CREATE OR REPLACE FUNCTION dw.cargar_almacen(
    p_almacen_codigo_erp VARCHAR(10),
    p_almacen_nombre VARCHAR(100)
)
RETURNS INTEGER AS $$
DECLARE
    v_almacen_sk INTEGER;
    v_existente RECORD;
    v_ciudad VARCHAR(100);
BEGIN
    -- Determinar ciudad basada en el código
    v_ciudad := CASE
        WHEN p_almacen_codigo_erp LIKE '10' THEN 'SANTA CRUZ'
        WHEN p_almacen_codigo_erp LIKE '20' THEN 'SANTA CRUZ'
        WHEN p_almacen_codigo_erp LIKE '30' THEN 'COCHABAMBA'
        WHEN p_almacen_codigo_erp LIKE '40' THEN 'LA PAZ'
        ELSE 'OTRA'
    END;
    
    -- Buscar almacen actual con mismo código
    SELECT * INTO v_existente
    FROM dw.dim_almacen
    WHERE almacen_codigo_erp = p_almacen_codigo_erp
      AND es_almacen_actual = TRUE;
    
    -- Si no existe, insertar nuevo almacen
    IF v_existente IS NULL THEN
        INSERT INTO dw.dim_almacen (
            almacen_codigo_erp, 
            almacen_nombre, 
            ciudad
        ) VALUES (
            p_almacen_codigo_erp, 
            p_almacen_nombre, 
            v_ciudad
        ) RETURNING almacen_sk INTO v_almacen_sk;
        
        RETURN v_almacen_sk;
    END IF;
    
    -- Si existe, verificar si el nombre cambió
    IF (v_existente.almacen_nombre IS DISTINCT FROM p_almacen_nombre) THEN
        
        -- Cerrar versión actual
        UPDATE dw.dim_almacen
        SET fecha_hasta_almacen = CURRENT_DATE,
            es_almacen_actual = FALSE
        WHERE almacen_sk = v_existente.almacen_sk;
        
        -- Insertar nueva versión
        INSERT INTO dw.dim_almacen (
            almacen_codigo_erp, 
            almacen_nombre, 
            ciudad,
            version_almacen
        ) VALUES (
            p_almacen_codigo_erp, 
            p_almacen_nombre, 
            v_ciudad,
            v_existente.version_almacen + 1
        ) RETURNING almacen_sk INTO v_almacen_sk;
        
        RETURN v_almacen_sk;
    END IF;
    
    -- Si no hay cambios, retornar el SK existente
    UPDATE dw.dim_almacen
    SET fecha_actualizacion = CURRENT_TIMESTAMP
    WHERE almacen_sk = v_existente.almacen_sk;
    
    RETURN v_existente.almacen_sk;
END;
$$ LANGUAGE plpgsql;

-- 8. Función para cargar/actualizar distribuidor (SCD Tipo 2)
CREATE OR REPLACE FUNCTION dw.cargar_distribuidor(
    p_distribuidor_codigo_erp VARCHAR(10),
    p_distribuidor_nombre VARCHAR(100)
)
RETURNS INTEGER AS $$
DECLARE
    v_distribuidor_sk INTEGER;
    v_existente RECORD;
BEGIN
    -- Buscar distribuidor actual con mismo código
    SELECT * INTO v_existente
    FROM dw.dim_distribuidor
    WHERE distribuidor_codigo_erp = p_distribuidor_codigo_erp
      AND es_distribuidor_actual = TRUE;
    
    -- Si no existe, insertar nuevo distribuidor
    IF v_existente IS NULL THEN
        INSERT INTO dw.dim_distribuidor (
            distribuidor_codigo_erp, 
            distribuidor_nombre,
            tipo_distribuidor  -- Se inserta como NULL inicialmente
        ) VALUES (
            p_distribuidor_codigo_erp, 
            p_distribuidor_nombre,
            NULL  -- ← Vacío para actualizar manual después
        ) RETURNING distribuidor_sk INTO v_distribuidor_sk;
        
        RETURN v_distribuidor_sk;
    END IF;
    
    -- Si existe, verificar si el nombre cambió
    IF (v_existente.distribuidor_nombre IS DISTINCT FROM p_distribuidor_nombre) THEN
        
        -- Cerrar versión actual
        UPDATE dw.dim_distribuidor
        SET fecha_hasta_distribuidor = CURRENT_DATE,
            es_distribuidor_actual = FALSE
        WHERE distribuidor_sk = v_existente.distribuidor_sk;
        
        -- Insertar nueva versión
        INSERT INTO dw.dim_distribuidor (
            distribuidor_codigo_erp, 
            distribuidor_nombre,
            tipo_distribuidor,  -- Mantenemos el tipo de la versión anterior
            version_distribuidor
        ) VALUES (
            p_distribuidor_codigo_erp, 
            p_distribuidor_nombre,
            v_existente.tipo_distribuidor,  -- ← Conserva el tipo si ya fue actualizado
            v_existente.version_distribuidor + 1
        ) RETURNING distribuidor_sk INTO v_distribuidor_sk;
        
        RETURN v_distribuidor_sk;
    END IF;
    
    -- Si no hay cambios, retornar el SK existente
    UPDATE dw.dim_distribuidor
    SET fecha_actualizacion = CURRENT_TIMESTAMP
    WHERE distribuidor_sk = v_existente.distribuidor_sk;
    
    RETURN v_existente.distribuidor_sk;
END;
$$ LANGUAGE plpgsql;

-- Función helper para actualizar tipo_distribuidor de forma segura
CREATE OR REPLACE FUNCTION dw.actualizar_tipo_distribuidor(
    p_codigo_erp VARCHAR(10),
    p_nuevo_tipo VARCHAR(50)
)
RETURNS VOID AS $$
BEGIN
    UPDATE dw.dim_distribuidor 
    SET tipo_distribuidor = p_nuevo_tipo,
        fecha_actualizacion = CURRENT_TIMESTAMP
    WHERE distribuidor_codigo_erp = p_codigo_erp 
      AND es_distribuidor_actual = TRUE;
      
    RAISE NOTICE 'Tipo actualizado para %: %', p_codigo_erp, p_nuevo_tipo;
END;
$$ LANGUAGE plpgsql;

-- Función para cargar/actualizar vendedor (SCD Tipo 2)
CREATE OR REPLACE FUNCTION dw.cargar_vendedor(
    p_vendedor_codigo_erp VARCHAR(10),
    p_vendedor_nombre VARCHAR(200),
    p_ciudad VARCHAR(100) DEFAULT NULL  -- Parámetro opcional para ciudad
)
RETURNS INTEGER AS $$
DECLARE
    v_vendedor_sk INTEGER;
    v_existente RECORD;
    v_fecha_ingreso DATE;
BEGIN
    -- Buscar vendedor actual con mismo código
    SELECT * INTO v_existente
    FROM dw.dim_vendedor
    WHERE vendedor_codigo_erp = p_vendedor_codigo_erp
      AND es_vendedor_actual = TRUE;
    
    -- Si no existe, insertar nuevo vendedor
    IF v_existente IS NULL THEN
        -- La fecha de ingreso es la fecha de creación (primera compra)
        v_fecha_ingreso := CURRENT_DATE;
        
        INSERT INTO dw.dim_vendedor (
            vendedor_codigo_erp, 
            vendedor_nombre,
            ciudad,
            fecha_ingreso,  -- Se setea una sola vez al crear
            canal,          -- NULL para actualizar manual
            supervisor,     -- NULL para actualizar manual
            canal_rrhh      -- NULL para actualizar manual
        ) VALUES (
            p_vendedor_codigo_erp, 
            p_vendedor_nombre,
            p_ciudad,
            v_fecha_ingreso,
            NULL,
            NULL,
            NULL
        ) RETURNING vendedor_sk INTO v_vendedor_sk;
        
        RETURN v_vendedor_sk;
    END IF;
    
    -- Si existe, verificar si el nombre o ciudad cambió
    IF (v_existente.vendedor_nombre IS DISTINCT FROM p_vendedor_nombre OR
        v_existente.ciudad IS DISTINCT FROM p_ciudad) THEN
        
        -- Cerrar versión actual
        UPDATE dw.dim_vendedor
        SET fecha_hasta_vendedor = CURRENT_DATE,
            es_vendedor_actual = FALSE
        WHERE vendedor_sk = v_existente.vendedor_sk;
        
        -- Insertar nueva versión (conservando fecha_ingreso original)
        INSERT INTO dw.dim_vendedor (
            vendedor_codigo_erp, 
            vendedor_nombre,
            ciudad,
            fecha_ingreso,           -- ← Se conserva la fecha original
            canal,                   -- ← Se conserva el canal de la versión anterior
            supervisor,              -- ← Se conserva el supervisor anterior
            canal_rrhh,              -- ← Se conserva el canal_rrhh anterior
            version_vendedor
        ) VALUES (
            p_vendedor_codigo_erp, 
            p_vendedor_nombre,
            p_ciudad,
            v_existente.fecha_ingreso,  -- ← Misma fecha de ingreso
            v_existente.canal,           -- ← Conserva canal
            v_existente.supervisor,      -- ← Conserva supervisor
            v_existente.canal_rrhh,      -- ← Conserva canal_rrhh
            v_existente.version_vendedor + 1
        ) RETURNING vendedor_sk INTO v_vendedor_sk;
        
        RETURN v_vendedor_sk;
    END IF;
    
    -- Si no hay cambios, retornar el SK existente
    UPDATE dw.dim_vendedor
    SET fecha_actualizacion = CURRENT_TIMESTAMP
    WHERE vendedor_sk = v_existente.vendedor_sk;
    
    RETURN v_existente.vendedor_sk;
END;
$$ LANGUAGE plpgsql;

-- 9. Función para actualizar todos los campos manuales de un vendedor a la vez
CREATE OR REPLACE FUNCTION dw.actualizar_todos_campos_vendedor(
    p_vendedor_codigo_erp VARCHAR(10),
    p_canal VARCHAR(100) DEFAULT NULL,
    p_supervisor VARCHAR(200) DEFAULT NULL,
    p_canal_rrhh VARCHAR(100) DEFAULT NULL,
    p_ciudad VARCHAR(100) DEFAULT NULL,
    p_crear_nueva_version BOOLEAN DEFAULT FALSE  -- ← NUEVO: Control manual de versión
)
RETURNS TABLE(
    campo_actualizado TEXT,
    valor_anterior TEXT,
    valor_nuevo TEXT,
    accion_tomada TEXT
) AS $$
DECLARE
    v_vendedor_actual RECORD;
    v_nuevo_vendedor_sk INTEGER;
    v_hubo_cambios BOOLEAN := FALSE;
    v_cambios_detectados TEXT[];
BEGIN
    -- Obtener el vendedor actual
    SELECT * INTO v_vendedor_actual
    FROM dw.dim_vendedor
    WHERE vendedor_codigo_erp = p_vendedor_codigo_erp
      AND es_vendedor_actual = TRUE;
    
    IF v_vendedor_actual IS NULL THEN
        RAISE EXCEPTION 'Vendedor % no encontrado o no tiene versión actual', p_vendedor_codigo_erp;
    END IF;
    
    RAISE NOTICE '==========================================';
    RAISE NOTICE 'Vendedor: % (Versión actual: %)', p_vendedor_codigo_erp, v_vendedor_actual.version_vendedor;
    RAISE NOTICE '¿Crear nueva versión? %', p_crear_nueva_version;
    RAISE NOTICE '==========================================';
    
    -- Detectar cambios en los campos
    IF p_canal IS NOT NULL AND v_vendedor_actual.canal IS DISTINCT FROM p_canal THEN
        v_cambios_detectados := array_append(v_cambios_detectados, 'canal');
        v_hubo_cambios := TRUE;
    END IF;
    
    IF p_supervisor IS NOT NULL AND v_vendedor_actual.supervisor IS DISTINCT FROM p_supervisor THEN
        v_cambios_detectados := array_append(v_cambios_detectados, 'supervisor');
        v_hubo_cambios := TRUE;
    END IF;
    
    IF p_canal_rrhh IS NOT NULL AND v_vendedor_actual.canal_rrhh IS DISTINCT FROM p_canal_rrhh THEN
        v_cambios_detectados := array_append(v_cambios_detectados, 'canal_rrhh');
        v_hubo_cambios := TRUE;
    END IF;
    
    IF p_ciudad IS NOT NULL AND v_vendedor_actual.ciudad IS DISTINCT FROM p_ciudad THEN
        v_cambios_detectados := array_append(v_cambios_detectados, 'ciudad');
        v_hubo_cambios := TRUE;
    END IF;
    
    -- Si no hay cambios, salir
    IF NOT v_hubo_cambios THEN
        campo_actualizado := 'SIN_CAMBIOS';
        valor_anterior := 'No se detectaron cambios';
        valor_nuevo := '-';
        accion_tomada := 'Sin acción requerida';
        RETURN NEXT;
        RETURN;
    END IF;
    
    -- Mostrar cambios detectados
    RAISE NOTICE 'Cambios detectados en: %', array_to_string(v_cambios_detectados, ', ');
    
    -- DECISIÓN: ¿Crear nueva versión o actualizar la actual?
    IF p_crear_nueva_version THEN
        -- ===========================================
        -- OPCIÓN 1: Crear NUEVA VERSIÓN (SCD Tipo 2)
        -- ===========================================
        RAISE NOTICE 'Creando NUEVA VERSIÓN...';
        
        -- Cerrar versión actual
        UPDATE dw.dim_vendedor
        SET fecha_hasta_vendedor = CURRENT_DATE,
            es_vendedor_actual = FALSE
        WHERE vendedor_sk = v_vendedor_actual.vendedor_sk;
        
        -- Insertar nueva versión con los nuevos valores
        INSERT INTO dw.dim_vendedor (
            vendedor_codigo_erp,
            vendedor_nombre,
            ciudad,
            fecha_ingreso,
            canal,
            supervisor,
            canal_rrhh,
            version_vendedor
        ) VALUES (
            v_vendedor_actual.vendedor_codigo_erp,
            v_vendedor_actual.vendedor_nombre,
            COALESCE(p_ciudad, v_vendedor_actual.ciudad),
            v_vendedor_actual.fecha_ingreso,  -- Conserva fecha original
            COALESCE(p_canal, v_vendedor_actual.canal),
            COALESCE(p_supervisor, v_vendedor_actual.supervisor),
            COALESCE(p_canal_rrhh, v_vendedor_actual.canal_rrhh),
            v_vendedor_actual.version_vendedor + 1
        ) RETURNING vendedor_sk INTO v_nuevo_vendedor_sk;
        
        -- Registrar cada cambio para el output
        IF p_canal IS NOT NULL AND v_vendedor_actual.canal IS DISTINCT FROM p_canal THEN
            campo_actualizado := 'canal';
            valor_anterior := COALESCE(v_vendedor_actual.canal, '[NULL]');
            valor_nuevo := p_canal;
            accion_tomada := 'Nueva versión creada (SK: ' || v_nuevo_vendedor_sk || ')';
            RETURN NEXT;
        END IF;
        
        IF p_supervisor IS NOT NULL AND v_vendedor_actual.supervisor IS DISTINCT FROM p_supervisor THEN
            campo_actualizado := 'supervisor';
            valor_anterior := COALESCE(v_vendedor_actual.supervisor, '[NULL]');
            valor_nuevo := p_supervisor;
            accion_tomada := 'Nueva versión creada (SK: ' || v_nuevo_vendedor_sk || ')';
            RETURN NEXT;
        END IF;
        
        IF p_canal_rrhh IS NOT NULL AND v_vendedor_actual.canal_rrhh IS DISTINCT FROM p_canal_rrhh THEN
            campo_actualizado := 'canal_rrhh';
            valor_anterior := COALESCE(v_vendedor_actual.canal_rrhh, '[NULL]');
            valor_nuevo := p_canal_rrhh;
            accion_tomada := 'Nueva versión creada (SK: ' || v_nuevo_vendedor_sk || ')';
            RETURN NEXT;
        END IF;
        
        IF p_ciudad IS NOT NULL AND v_vendedor_actual.ciudad IS DISTINCT FROM p_ciudad THEN
            campo_actualizado := 'ciudad';
            valor_anterior := COALESCE(v_vendedor_actual.ciudad, '[NULL]');
            valor_nuevo := p_ciudad;
            accion_tomada := 'Nueva versión creada (SK: ' || v_nuevo_vendedor_sk || ')';
            RETURN NEXT;
        END IF;
        
        RAISE NOTICE '✅ Nueva versión creada con SK: %', v_nuevo_vendedor_sk;
        
    ELSE
        -- ===========================================
        -- OPCIÓN 2: Actualizar versión ACTUAL (sin SCD)
        -- ===========================================
        RAISE NOTICE 'Actualizando versión ACTUAL (sin crear historial)...';
        
        -- Actualizar campos en la versión actual
        UPDATE dw.dim_vendedor 
        SET 
            canal = COALESCE(p_canal, canal),
            supervisor = COALESCE(p_supervisor, supervisor),
            canal_rrhh = COALESCE(p_canal_rrhh, canal_rrhh),
            ciudad = COALESCE(p_ciudad, ciudad),
            fecha_actualizacion = CURRENT_TIMESTAMP
        WHERE vendedor_sk = v_vendedor_actual.vendedor_sk
        RETURNING 
            CASE WHEN p_canal IS NOT NULL AND v_vendedor_actual.canal IS DISTINCT FROM p_canal THEN 'canal' END,
            CASE WHEN p_supervisor IS NOT NULL AND v_vendedor_actual.supervisor IS DISTINCT FROM p_supervisor THEN 'supervisor' END,
            CASE WHEN p_canal_rrhh IS NOT NULL AND v_vendedor_actual.canal_rrhh IS DISTINCT FROM p_canal_rrhh THEN 'canal_rrhh' END,
            CASE WHEN p_ciudad IS NOT NULL AND v_vendedor_actual.ciudad IS DISTINCT FROM p_ciudad THEN 'ciudad' END
        INTO campo_actualizado;  -- Simplificado para el ejemplo
        
        -- Registrar cada cambio
        IF p_canal IS NOT NULL AND v_vendedor_actual.canal IS DISTINCT FROM p_canal THEN
            campo_actualizado := 'canal';
            valor_anterior := COALESCE(v_vendedor_actual.canal, '[NULL]');
            valor_nuevo := p_canal;
            accion_tomada := 'Actualizado en versión actual';
            RETURN NEXT;
        END IF;
        
        IF p_supervisor IS NOT NULL AND v_vendedor_actual.supervisor IS DISTINCT FROM p_supervisor THEN
            campo_actualizado := 'supervisor';
            valor_anterior := COALESCE(v_vendedor_actual.supervisor, '[NULL]');
            valor_nuevo := p_supervisor;
            accion_tomada := 'Actualizado en versión actual';
            RETURN NEXT;
        END IF;
        
        IF p_canal_rrhh IS NOT NULL AND v_vendedor_actual.canal_rrhh IS DISTINCT FROM p_canal_rrhh THEN
            campo_actualizado := 'canal_rrhh';
            valor_anterior := COALESCE(v_vendedor_actual.canal_rrhh, '[NULL]');
            valor_nuevo := p_canal_rrhh;
            accion_tomada := 'Actualizado en versión actual';
            RETURN NEXT;
        END IF;
        
        IF p_ciudad IS NOT NULL AND v_vendedor_actual.ciudad IS DISTINCT FROM p_ciudad THEN
            campo_actualizado := 'ciudad';
            valor_anterior := COALESCE(v_vendedor_actual.ciudad, '[NULL]');
            valor_nuevo := p_ciudad;
            accion_tomada := 'Actualizado en versión actual';
            RETURN NEXT;
        END IF;
        
        RAISE NOTICE '✅ Versión actual actualizada';
    END IF;
    
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '❌ Error: %', SQLERRM;
    RAISE;
END;
$$ LANGUAGE plpgsql;


-- Funcion para convertir texto DD/MM/YYYY a integer YYYYMMDD
CREATE OR REPLACE FUNCTION dw.convertir_fecha_a_integer_simple(
    p_fecha_texto VARCHAR(10)  -- Formato: 'DD/MM/YYYY'
)
RETURNS INTEGER AS $$
DECLARE
    v_partes TEXT[];
BEGIN
    -- Dividir por '/'
    v_partes := string_to_array(p_fecha_texto, '/');
    
    -- Retornar YYYYMMDD como integer
    RETURN (v_partes[3] || v_partes[2] || v_partes[1])::INTEGER;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Error con fecha: %', p_fecha_texto;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;


-- 11. Función para insertar ventas en fact_ventas (VERSIÓN CORREGIDA)
CREATE OR REPLACE FUNCTION dw.cargar_fact_ventas(
    p_numero_venta VARCHAR(50),
    p_fecha_venta VARCHAR(10),
    p_cliente_codigo VARCHAR(10),
    p_cliente_nombre VARCHAR(200),
    p_grupo_codigo VARCHAR(4),
    p_grupo_descripcion VARCHAR(80),
    p_subgrupo_codigo VARCHAR(4),
    p_subgrupo_descripcion VARCHAR(80),
    p_clase_codigo VARCHAR(4),
    p_clase_descripcion VARCHAR(80),
    p_subclase_codigo VARCHAR(4),
    p_subclase_descripcion VARCHAR(80),
    p_articulo_codigo VARCHAR(20),
    p_articulo_descripcion VARCHAR(200),
    p_um VARCHAR(20),
    p_cantidad NUMERIC,
    p_precio NUMERIC,
    p_subtotal NUMERIC,
    p_descuento NUMERIC,
    p_total NUMERIC,
    p_local_codigo VARCHAR(10),
    p_local_descripcion VARCHAR(100),
    p_almacen_codigo VARCHAR(10),
    p_almacen_descripcion VARCHAR(100),
    p_ruta_codigo VARCHAR(10),
    p_ruta_descripcion VARCHAR(100),
    p_vendedor_codigo VARCHAR(10),
    p_vendedor_nombre VARCHAR(200),
    p_distribuidor_codigo VARCHAR(10),
    p_distribuidor_nombre VARCHAR(100),
    p_zona_codigo VARCHAR(10),
    p_zona_descripcion VARCHAR(100),
    p_componente VARCHAR(20),
    p_ice NUMERIC,
    p_venta_neta NUMERIC,
    p_pago VARCHAR(8),
    p_exhibidor VARCHAR(50),
    p_clase2 VARCHAR(50),
    p_ruta3 VARCHAR(50),
    p_punto_frio VARCHAR(50),
    p_archivo_origen VARCHAR(255),
    p_batch_id VARCHAR(50)
)
RETURNS BIGINT AS $$
DECLARE
    v_venta_sk BIGINT;
    v_cliente_sk INTEGER;
    v_producto_sk INTEGER;
    v_vendedor_sk INTEGER;
    v_almacen_sk INTEGER;
    v_local_sk INTEGER;
    v_distribuidor_sk INTEGER;
    v_zona_sk INTEGER;
    v_fecha_sk INTEGER;
    v_existente RECORD;
	v_fecha_date DATE;
BEGIN
    -- 1. Obtener o crear CLIENTE
    SELECT cliente_sk INTO v_cliente_sk
    FROM dw.dim_cliente
    WHERE cliente_codigo_erp = p_cliente_codigo
      AND es_cliente_actual = TRUE;
    
    IF v_cliente_sk IS NULL THEN
        -- Insertar nuevo cliente
        INSERT INTO dw.dim_cliente (cliente_codigo_erp, cliente_nombre)
        VALUES (p_cliente_codigo, p_cliente_nombre)
        RETURNING cliente_sk INTO v_cliente_sk;
        
        RAISE NOTICE 'Nuevo cliente creado: % - %', p_cliente_codigo, p_cliente_nombre;
    END IF;
    
    -- 2. Obtener o crear PRODUCTO (con su categoría)
	SELECT p.producto_sk INTO v_producto_sk
	FROM dw.dim_producto p
	WHERE p.producto_codigo_erp = p_articulo_codigo
	  AND p.es_producto_actual = TRUE;
	
	IF v_producto_sk IS NULL THEN
	    -- Insertar nuevo producto con todas las descripciones de categoría
	    BEGIN
	        v_producto_sk := dw.ins_ups_dim_producto(
	            p_articulo_codigo,
	            p_articulo_descripcion,
	            p_componente,
	            p_grupo_codigo,
	            p_grupo_descripcion,      -- ← AGREGADO
	            p_subgrupo_codigo,
	            p_subgrupo_descripcion,   -- ← AGREGADO
	            p_clase_codigo,
	            p_clase_descripcion,       -- ← AGREGADO
	            p_subclase_codigo,
	            p_subclase_descripcion,    -- ← AGREGADO
	            0,                         -- u_l
	            0,                         -- u_c
	            NULL,                      -- proveedor
	            NULL,                      -- cat_comercial
	            p_um                        -- unidad_medida
	        );
	        RAISE NOTICE 'Nuevo producto creado: % - % (SK: %)', 
	            p_articulo_codigo, p_articulo_descripcion, v_producto_sk;
	    EXCEPTION WHEN OTHERS THEN
	        RAISE NOTICE 'Error creando producto: %', SQLERRM;
	        -- Fallback: insertar producto básico
	        INSERT INTO dw.dim_producto (
	            producto_codigo_erp, 
	            producto_nombre, 
	            componente,
	            unidad_medida
	        ) VALUES (
	            p_articulo_codigo,
	            p_articulo_descripcion,
	            p_componente,
	            p_um
	        ) RETURNING producto_sk INTO v_producto_sk;
	    END;
	END IF;
    
    -- 3. Obtener o crear VENDEDOR
    IF p_vendedor_codigo IS NOT NULL AND p_vendedor_codigo != '0' AND p_vendedor_codigo != '' THEN
        SELECT vendedor_sk INTO v_vendedor_sk
        FROM dw.dim_vendedor
        WHERE vendedor_codigo_erp = p_vendedor_codigo
          AND es_vendedor_actual = TRUE;
        
        IF v_vendedor_sk IS NULL THEN
            INSERT INTO dw.dim_vendedor (vendedor_codigo_erp, vendedor_nombre, ciudad)
            VALUES (p_vendedor_codigo, p_vendedor_nombre, 'PENDIENTE')
            RETURNING vendedor_sk INTO v_vendedor_sk;
            
            RAISE NOTICE 'Nuevo vendedor creado: % - %', p_vendedor_codigo, p_vendedor_nombre;
        END IF;
    END IF;
    
    -- 4. Obtener o crear ALMACEN
    IF p_almacen_codigo IS NOT NULL AND p_almacen_codigo != '0' AND p_almacen_codigo != '' THEN
        SELECT almacen_sk INTO v_almacen_sk
        FROM dw.dim_almacen
        WHERE almacen_codigo_erp = p_almacen_codigo
          AND es_almacen_actual = TRUE;
        
        IF v_almacen_sk IS NULL THEN
            v_almacen_sk := dw.cargar_almacen(p_almacen_codigo, p_almacen_descripcion);
            RAISE NOTICE 'Nuevo almacén creado: % - %', p_almacen_codigo, p_almacen_descripcion;
        END IF;
    END IF;
    
    -- 5. Obtener o crear LOCAL
    IF p_local_codigo IS NOT NULL AND p_local_codigo != '0' AND p_local_codigo != '' THEN
        SELECT local_sk INTO v_local_sk
        FROM dw.dim_local
        WHERE local_codigo_erp = p_local_codigo
          AND es_local_actual = TRUE;
        
        IF v_local_sk IS NULL THEN
            v_local_sk := dw.cargar_local(p_local_codigo, p_local_descripcion);
            RAISE NOTICE 'Nuevo local creado: % - %', p_local_codigo, p_local_descripcion;
        END IF;
    END IF;
    
    -- 6. Obtener o crear DISTRIBUIDOR
    IF p_distribuidor_codigo IS NOT NULL AND p_distribuidor_codigo != '0' AND p_distribuidor_codigo != '' THEN
        SELECT distribuidor_sk INTO v_distribuidor_sk
        FROM dw.dim_distribuidor
        WHERE distribuidor_codigo_erp = p_distribuidor_codigo
          AND es_distribuidor_actual = TRUE;
        
        IF v_distribuidor_sk IS NULL THEN
            v_distribuidor_sk := dw.cargar_distribuidor(p_distribuidor_codigo, p_distribuidor_nombre);
            RAISE NOTICE 'Nuevo distribuidor creado: % - %', p_distribuidor_codigo, p_distribuidor_nombre;
        END IF;
    END IF;
    
    -- 7. Obtener o crear ZONA (si existe la tabla)
    IF p_zona_codigo IS NOT NULL AND p_zona_codigo != '0' AND p_zona_codigo != '' THEN
        -- Verificar si la tabla dim_zona existe
        IF EXISTS (
            SELECT 1 FROM information_schema.tables 
            WHERE table_schema = 'dw' AND table_name = 'dim_zona'
        ) THEN
            EXECUTE 'SELECT zona_sk FROM dw.dim_zona WHERE zona_codigo_erp = $1 AND es_zona_actual = TRUE'
            INTO v_zona_sk USING p_zona_codigo;
            
            IF v_zona_sk IS NULL THEN
                EXECUTE 'INSERT INTO dw.dim_zona (zona_codigo_erp, zona_descripcion) VALUES ($1, $2) RETURNING zona_sk'
                INTO v_zona_sk USING p_zona_codigo, p_zona_descripcion;
                
                RAISE NOTICE 'Nueva zona creada: % - %', p_zona_codigo, p_zona_descripcion;
            END IF;
        END IF;
    END IF;
    
    -- 8. Obtener FECHA SK (CORREGIDO - usando fecha_completa)
	BEGIN
	    -- Convertir el texto 'DD/MM/YYYY' a tipo DATE
	    v_fecha_date := TO_DATE(p_fecha_venta, 'DD/MM/YYYY');
		
	    SELECT fecha_sk INTO v_fecha_sk
	    FROM dw.dim_fecha
	    WHERE fecha_completa = v_fecha_date;
	    
	    IF v_fecha_sk IS NULL THEN
	        -- Generar fecha_sk (YYYYMMDD)
	        v_fecha_sk := dw.convertir_fecha_a_integer_simple(p_fecha_venta);
	        
	        -- Insertar en dim_fecha si no existe
	        INSERT INTO dw.dim_fecha (
	            fecha_sk,
	            fecha_completa,
	            anho,
	            mes_numero,
	            mes_nombre,
	            mes_nombre_corto,
	            dia_numero,
	            dia_nombre,
	            dia_nombre_corto,
	            dia_semana_numero,
	            dia_semana_numero_iso,
	            trimestre_numero,
	            semestre_numero
	        ) VALUES (
	            v_fecha_sk,
	            v_fecha_date,
	            EXTRACT(YEAR FROM v_fecha_date)::INTEGER,
	            EXTRACT(MONTH FROM v_fecha_date)::INTEGER,
	            TO_CHAR(v_fecha_date, 'Month'),
	            TO_CHAR(v_fecha_date, 'Mon'),
	            EXTRACT(DAY FROM v_fecha_date)::INTEGER,
	            TO_CHAR(v_fecha_date, 'Day'),
	            TO_CHAR(v_fecha_date, 'Dy'),
	            EXTRACT(DOW FROM v_fecha_date)::INTEGER + 1, -- 1=Domingo
	            EXTRACT(ISODOW FROM v_fecha_date)::INTEGER, -- 1=Lunes
	            EXTRACT(QUARTER FROM v_fecha_date)::INTEGER,
	            CASE WHEN EXTRACT(MONTH FROM v_fecha_date) <= 6 THEN 1 ELSE 2 END
	        );
	        
	        RAISE NOTICE 'Nueva fecha creada: %', v_fecha_date;
	    END IF;
	END;
    
    -- 9. Verificar si la venta ya existe (para evitar duplicados)
    SELECT venta_sk INTO v_existente
    FROM dw.fact_ventas
    WHERE numero_venta = p_numero_venta
      AND fecha_venta = TO_CHAR(v_fecha_date, 'DD/MM/YYYY')
      AND cliente_sk = v_cliente_sk
      AND producto_sk = v_producto_sk;
    
    IF v_existente IS NOT NULL THEN
        RAISE NOTICE 'Venta ya existe: % - % - Cliente: %', p_numero_venta, p_fecha_venta, p_cliente_codigo;
        RETURN v_existente.venta_sk;
    END IF;
    
    -- 10. Insertar en FACT_VENTAS
    INSERT INTO dw.fact_ventas (
        numero_venta,
        fecha_venta,
        cliente_sk,
        producto_sk,
        vendedor_sk,
        almacen_sk,
        local_sk,
        distribuidor_sk,
        zona_sk,
        fecha_sk,
        cantidad,
        precio_unitario,
        subtotal,
        descuento,
        total,
        ice,
        venta_neta,
        pago,
        ruta_codigo,
        ruta_descripcion,
        archivo_origen,
        batch_id
    ) VALUES (
        p_numero_venta,
        TO_CHAR(v_fecha_date, 'DD/MM/YYYY'),
        v_cliente_sk,
        v_producto_sk,
        v_vendedor_sk,
        v_almacen_sk,
        v_local_sk,
        v_distribuidor_sk,
        v_zona_sk,
        v_fecha_sk,
        p_cantidad,
        p_precio,
        p_subtotal,
        p_descuento,
        p_total,
        p_ice,
        p_venta_neta,
        p_pago,
        p_ruta_codigo,
        p_ruta_descripcion,
        p_archivo_origen,
        p_batch_id
    ) RETURNING venta_sk INTO v_venta_sk;
    
    RAISE NOTICE 'Venta insertada: % - SK: %', p_numero_venta, v_venta_sk;
    RETURN v_venta_sk;
    
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Error insertando venta %: %', p_numero_venta, SQLERRM;
    RAISE;
END;
$$ LANGUAGE plpgsql;

-- Función para insertar datos crudos en staging.stg_ventas
-- Función para insertar datos crudos en staging.stg_ventas
CREATE OR REPLACE FUNCTION staging.cargar_stg_ventas(
    p_no_venta VARCHAR,
    p_fecha VARCHAR,
    p_cliente VARCHAR,
    p_nombre_cliente VARCHAR,
    p_grupo VARCHAR,
    p_descripcion_grupo VARCHAR,
    p_subgrupo VARCHAR,
    p_descripcion_subgrupo VARCHAR,
    p_clase VARCHAR,
    p_descripcion_clase VARCHAR,
    p_subclase VARCHAR,
    p_descripcion_subclase VARCHAR,
    p_articulo VARCHAR,
    p_descripcion_articulo VARCHAR,
    p_um VARCHAR,
    p_cantidad VARCHAR,
    p_precio VARCHAR,
    p_subtotal VARCHAR,
    p_descuento VARCHAR,
    p_total VARCHAR,
    p_local VARCHAR,
    p_descripcion_local VARCHAR,
    p_almacen VARCHAR,
    p_descripcion_almacen VARCHAR,
    p_ruta VARCHAR,
    p_descripcion_ruta VARCHAR,
    p_vendedor VARCHAR,
    p_descripcion_vendedor VARCHAR,
    p_distribuidor VARCHAR,
    p_descripcion_distribuidor VARCHAR,
    p_zona VARCHAR,
    p_descripcion_zona VARCHAR,
    p_componente VARCHAR,
    p_ice VARCHAR,
    p_venta_neta VARCHAR,
    p_pago VARCHAR,
    p_exhibidor VARCHAR,
    p_clase2 VARCHAR,
    p_ruta3 VARCHAR,
    p_punto_frio VARCHAR,
    p_nombre_archivo VARCHAR,
    p_batch_id VARCHAR
)
RETURNS BIGINT AS $$
DECLARE
    v_stg_id BIGINT;
    v_existente RECORD;
BEGIN
    -- Insertar en staging
    INSERT INTO staging.stg_ventas (
        no_venta, fecha, cliente, nombre_cliente,
        grupo, descripcion_grupo, subgrupo, descripcion_subgrupo,
        clase, descripcion_clase, subclase, descripcion_subclase,
        articulo, descripcion_articulo, um,
        cantidad, precio, subtotal, descuento, total,
        local, descripcion_local, almacen, descripcion_almacen,
        ruta, descripcion_ruta, vendedor, descripcion_vendedor,
        distribuidor, descripcion_distribuidor, zona, descripcion_zona,
        componente, ice, venta_neta, pago, exhibidor, clase2, ruta3, punto_frio,
        nombre_archivo, batch_id, estado, fecha_carga
    ) VALUES (
        p_no_venta, p_fecha, p_cliente, p_nombre_cliente,
        p_grupo, p_descripcion_grupo, p_subgrupo, p_descripcion_subgrupo,
        p_clase, p_descripcion_clase, p_subclase, p_descripcion_subclase,
        p_articulo, p_descripcion_articulo, p_um,
        p_cantidad, p_precio, p_subtotal, p_descuento, p_total,
        p_local, p_descripcion_local, p_almacen, p_descripcion_almacen,
        p_ruta, p_descripcion_ruta, p_vendedor, p_descripcion_vendedor,
        p_distribuidor, p_descripcion_distribuidor, p_zona, p_descripcion_zona,
        p_componente, p_ice, p_venta_neta, p_pago, p_exhibidor, p_clase2, p_ruta3, p_punto_frio,
        p_nombre_archivo, p_batch_id, 'PENDIENTE', CURRENT_TIMESTAMP
    ) RETURNING stg_id INTO v_stg_id;
    
    RETURN v_stg_id;
END;
$$ LANGUAGE plpgsql;