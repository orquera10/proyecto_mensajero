# Servidor de Mensajería Institucional

Servidor backend de alto rendimiento en tiempo real construido con **Node.js, Express, Socket.IO, PostgreSQL y Multer**. Diseñado para despliegues sencillos en **Coolify** y clientes de escritorio Windows (`.msi`).

---

## 🚀 Características

* **Base de Datos:** PostgreSQL en producción (Coolify) y SQLite local para desarrollo rápido.
* **Tiempo Real:** WebSockets con **Socket.IO** (mensajes directos, presencia, indicadores de escritura, confirmación de lectura).
* **Gestión de Archivos:** Soporte para adjuntar imágenes, PDFs, audios y documentos con almacenamiento en volumen persistente.
* **Panel Web de Administración (`/admin`):**
  * Creación y gestión de Sectores / Departamentos con colores distintivos.
  * Alta, edición y eliminación de usuarios.
  * Restablecimiento seguro de contraseñas.
  * Estadísticas de uso (mensajes, usuarios, almacenamiento de adjuntos).
* **Autenticación:** JWT (JSON Web Tokens) y contraseñas hasheadas con `bcrypt`.

---

## 💻 Ejecución en Local

1. Abre una terminal en la carpeta `servidor/`:
   ```bash
   cd servidor
   ```
2. Instala dependencias (si no se han instalado):
   ```bash
   npm install
   ```
3. Inicia el servidor:
   ```bash
   npm start
   ```
4. Accede al Panel de Administración desde tu navegador:
   * **URL:** `http://localhost:3000/admin`
   * **Usuario inicial:** `admin`
   * **Contraseña inicial:** `admin123`

---

## 🐳 Despliegue en Coolify

### 1. Crear Aplicación en Coolify:
* Selecciona **Docker** o **Git Source** apuntando al repositorio.
* Puerto expuesto: `3000`.

### 2. Configurar Base de Datos PostgreSQL:
En Coolify, crea un servicio **PostgreSQL** y enlaza las variables de entorno en la aplicación:
```env
DATABASE_URL=postgresql://usuario:password@postgres-host:5432/nombre_db
JWT_SECRET=tu_clave_secreta_super_segura
```

### 3. Montar Volumen Persistente para Archivos Adjuntos:
En la pestaña **Storages / Volumes** de tu aplicación en Coolify, añade el volumen persistente:
* **Host Path:** `/var/lib/docker/volumes/mensajero-uploads/_data` (o el nombre que asignes en Coolify)
* **Destination Path en contenedor:** `/app/uploads`
