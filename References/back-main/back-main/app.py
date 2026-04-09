# dashboard_streamlit.py
import streamlit as st
import requests
import pandas as pd
import plotly.express as px
from datetime import datetime

# Configuración
st.set_page_config(page_title="Dashboard DW", layout="wide")
API_URL = "http://localhost:8000/api"

# Inicializar estado de sesión
if 'authenticated' not in st.session_state:
    st.session_state['authenticated'] = False
    st.session_state['token'] = None
    st.session_state['username'] = None

# ---------- PÁGINA DE LOGIN ----------
def login_page():
    st.title("🔐 Dashboard de Ventas - Acceso Restringido")
    st.markdown("---")
    
    col1, col2, col3 = st.columns([1, 2, 1])
    
    with col2:
        st.markdown("### Iniciar Sesión")
        
        with st.form("login_form"):
            username = st.text_input("👤 Usuario", placeholder="Ingresa tu usuario")
            password = st.text_input("🔑 Contraseña", type="password", placeholder="Ingresa tu contraseña")
            
            col_a, col_b, col_c = st.columns([1, 2, 1])
            with col_b:
                submitted = st.form_submit_button("🚀 Ingresar", use_container_width=True)
            
            if submitted:
                if not username or not password:
                    st.error("❌ Por favor ingresa usuario y contraseña")
                else:
                    with st.spinner("Verificando credenciales..."):
                        try:
                            response = requests.post(
                                f"{API_URL}/login/",
                                json={"username": username, "password": password},
                                timeout=5
                            )
                            
                            if response.status_code == 200:
                                data = response.json()
                                if data['success']:
                                    st.session_state['authenticated'] = True
                                    st.session_state['token'] = data['token']
                                    st.session_state['username'] = data['username']
                                    st.success(f"✅ ¡Bienvenido {data['username']}!")
                                    st.rerun()
                                else:
                                    st.error(f"❌ {data['error']}")
                            else:
                                st.error("❌ Usuario o contraseña incorrectos")
                        except requests.exceptions.ConnectionError:
                            st.error("❌ No se puede conectar al servidor. ¿Django está corriendo?")
                        except Exception as e:
                            st.error(f"❌ Error: {str(e)}")

# ---------- PÁGINA PRINCIPAL DEL DASHBOARD ----------
def dashboard_page():
    # Sidebar con información del usuario
    with st.sidebar:
        st.title(f"👋 Hola, {st.session_state['username']}")
        st.markdown("---")
        
        # Opciones de consulta
        st.subheader("📋 Consultas disponibles")
        tabla = st.selectbox(
            "Selecciona tabla:",
            ["dim_vendedor", "dim_cliente", "dim_producto", "fact_ventas", "SQL Personalizado"]
        )
        
        if tabla == "SQL Personalizado":
            consulta = st.text_area(
                "Escribe tu consulta SQL:",
                "SELECT * FROM dw.dim_vendedor LIMIT 10",
                height=150
            )
        else:
            consulta = f"SELECT * FROM dw.{tabla} LIMIT 10"
            st.code(consulta, language="sql")
        
        limite = st.slider("Límite de registros:", 10, 500, 100)
        
        # Botón ejecutar
        ejecutar = st.button("🚀 Ejecutar Consulta", type="primary", use_container_width=True)
        
        st.markdown("---")
        
        # Botón cerrar sesión
        if st.button("🔒 Cerrar Sesión", use_container_width=True):
            try:
                # Opcional: invalidar token en el servidor
                headers = {'Authorization': f'Token {st.session_state["token"]}'}
                requests.post(f"{API_URL}/logout/", headers=headers, timeout=2)
            except:
                pass
            finally:
                st.session_state.clear()
                st.rerun()
    
    # Contenido principal
    st.title(f"📊 Data Warehouse Dashboard")
    
    if ejecutar:
        with st.spinner("Consultando base de datos..."):
            try:
                # Hacer petición con token
                headers = {
                    'Authorization': f'Token {st.session_state["token"]}'
                }
                
                # Agregar límite a la consulta si no tiene
                if 'LIMIT' not in consulta.upper():
                    consulta += f" LIMIT {limite}"
                
                params = {'sql': consulta}
                
                response = requests.get(
                    f"{API_URL}/consulta/",
                    headers=headers,
                    params=params,
                    timeout=30
                )
                
                if response.status_code == 200:
                    data = response.json()
                    
                    if data['success']:
                        # Guardar en session_state
                        st.session_state['ultima_consulta'] = data
                        st.success(f"✅ {data['total']} registros obtenidos")
                    else:
                        st.error(f"❌ {data['error']}")
                elif response.status_code == 401:
                    st.error("❌ Sesión expirada. Por favor inicia sesión nuevamente.")
                    st.session_state.clear()
                    st.rerun()
                else:
                    st.error(f"❌ Error {response.status_code}: {response.text}")
                    
            except requests.exceptions.ConnectionError:
                st.error("❌ No se pudo conectar al servidor Django")
            except Exception as e:
                st.error(f"❌ Error: {str(e)}")
    
    # Mostrar resultados de la última consulta
    if 'ultima_consulta' in st.session_state:
        data = st.session_state['ultima_consulta']
        
        # Convertir a DataFrame
        df = pd.DataFrame(data['data'])
        
        # Mostrar métricas
        col1, col2, col3 = st.columns(3)
        with col1:
            st.metric("Registros", data['total'])
        with col2:
            st.metric("Columnas", len(data['columns']))
        with col3:
            st.metric("Usuario", st.session_state['username'])
        
        # Vista previa de datos
        st.subheader("🔍 Vista previa de datos")
        st.dataframe(df, use_container_width=True, height=400)
        
        # Estadísticas (solo numéricas)
        numeric_cols = df.select_dtypes(include=['float64', 'int64']).columns.tolist()
        if numeric_cols:
            st.subheader("📈 Estadísticas")
            col = st.selectbox("Selecciona columna:", numeric_cols)
            if col:
                col1, col2, col3, col4 = st.columns(4)
                with col1:
                    st.metric("Mínimo", f"{df[col].min():,.2f}")
                with col2:
                    st.metric("Máximo", f"{df[col].max():,.2f}")
                with col3:
                    st.metric("Promedio", f"{df[col].mean():,.2f}")
                with col4:
                    st.metric("Mediana", f"{df[col].median():,.2f}")
                
                fig = px.histogram(df, x=col, title=f"Distribución de {col}")
                st.plotly_chart(fig, use_container_width=True)
        
        # Botón descargar
        csv = df.to_csv(index=False).encode('utf-8')
        st.download_button(
            label="📥 Descargar CSV",
            data=csv,
            file_name=f"datos_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv",
            mime="text/csv"
        )

# ---------- CONTROL DE FLUJO PRINCIPAL ----------
if not st.session_state['authenticated']:
    login_page()
else:
    dashboard_page()