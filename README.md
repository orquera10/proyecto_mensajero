# Mensajero Institucional (Openfire XMPP)

Cliente de mensajería instantánea institucional y corporativo diseñado para conectarse a servidores **Openfire**. Optimizado para distribución masiva en empresas u organismos mediante instaladores **`.msi`** a través de **Directivas de Grupo (GPO)** de Windows Server.

---

## 🚀 Características Principales

* **Sectores y Departamentos:** Carga automáticamente los *Grupos Compartidos (Shared Groups)* configurados en Openfire como sectores organizados.
* **Estados de Presencia:** Disponible, Ausente, No molestar y Desconectado en tiempo real.
* **Bandeja del Sistema (System Tray):** Queda en segundo plano junto al reloj de Windows sin saturar la barra de tareas.
* **Notificaciones Nativas:** Alertas de escritorio de Windows para nuevos mensajes entrantes.
* **Indicadores de Escritura:** Notifica cuando otro usuario está redactando un mensaje.
* **Empaquetado MSI:** Instalación silenciosa compatible con `msiexec` para despliegue por Active Directory.

---

## 🛠️ Requisitos de Desarrollo

* **Node.js:** v18 o superior
* **npm:** v9 o superior

---

## 💻 Comandos Disponibles

### Modo Desarrollo (Abrir aplicación en tiempo real)
```bash
npm run dev
```

### Compilar Proyecto
```bash
npm run build
```

### Generar Instalador `.msi` para Windows
```bash
npm run build:msi
```
El archivo `.msi` generado se guardará en la carpeta `dist-msi/`.

---

## 🏢 Despliegue Masivo en Windows Server (GPO / Active Directory)

### Instalación Silenciosa vía Consola o Script de Inicio:
```cmd
msiexec /i "Mensajero Institucional 1.0.0.msi" /qn /norestart
```

### Parámetros útiles de `msiexec`:
* `/i` : Instalar el paquete.
* `/qn` : Modo silencioso sin interfaz gráfica para el usuario.
* `/norestart` : Evita que el equipo solicite reinicio tras instalar.

---

## ⚙️ Configuración en Servidor Openfire

1. **Protocolo WebSockets / BOSH:**
   * Puerto WebSocket sin SSL: `7070` (`ws://servidor:7070/ws`)
   * Puerto WebSocket con SSL: `7443` (`wss://servidor:7443/ws`)
   * Puerto BOSH HTTP-Bind: `7070` (`http://servidor:7070/http-bind/`)

2. **Grupos y Sectores:**
   * En la consola de Openfire, ingresa a **Users/Groups > Groups**.
   * Crea o edita un grupo y activa la opción **"Enable contact list group sharing"** (Compartir grupo en la lista de contactos) para que los sectores aparezcan automáticamente a los usuarios.
