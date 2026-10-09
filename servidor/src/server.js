import express from 'express'
import http from 'node:http'
import { Server as SocketIOServer } from 'socket.io'
import cors from 'cors'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { config } from './config.js'
import { initDb } from './db.js'
import { initSocketIO } from './socket.js'
import { authRouter } from './routes/authRoutes.js'
import { sectorRouter } from './routes/sectorRoutes.js'
import { userRouter } from './routes/userRoutes.js'
import { messageRouter } from './routes/messageRoutes.js'
import { adminRouter } from './routes/adminRoutes.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const publicDir = path.join(__dirname, '..', 'public')
const clientDistDir = fs.existsSync(path.join(__dirname, '..', '..', 'dist'))
  ? path.join(__dirname, '..', '..', 'dist')
  : path.join(__dirname, '..', 'dist')

const app = express()
const server = http.createServer(app)

// Initialize Socket.IO
const io = new SocketIOServer(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
  },
  maxHttpBufferSize: 1e8, // 100 MB buffer
})

app.set('io', io)

// Middlewares
app.use(cors())
app.use(express.json())

// Serve Static Uploaded Files
app.use('/uploads', express.static(config.uploadDir))

// Serve Admin Panel Static Files
app.use('/admin', express.static(publicDir))

// API Routes
app.use('/api/auth', authRouter)
app.use('/api/sectors', sectorRouter)
app.use('/api/users', userRouter)
app.use('/api/messages', messageRouter)
app.use('/api/admin', adminRouter)

// Health Check Endpoint (useful for Coolify health checks)
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Serve Compiled Web Client (SPA) or redirect to Admin
if (fs.existsSync(clientDistDir)) {
  app.use(express.static(clientDistDir))
  app.use((req, res, next) => {
    if (
      req.path.startsWith('/api') ||
      req.path.startsWith('/admin') ||
      req.path.startsWith('/uploads') ||
      req.path.startsWith('/health')
    ) {
      return next()
    }
    if (req.method === 'GET') {
      return res.sendFile(path.join(clientDistDir, 'index.html'))
    }
    next()
  })
} else {
  // Root redirect to Admin Panel if dist is not built
  app.get('/', (_req, res) => {
    res.redirect('/admin')
  })
}

// Global Error Handler
app.use((err, _req, res, _next) => {
  console.error('Unhandled server error:', err)
  res.status(500).json({ error: 'Error interno en el servidor', details: err.message })
})

// Start Server
async function bootstrap() {
  try {
    await initDb()
    initSocketIO(io)

    server.listen(config.port, '0.0.0.0', () => {
      console.log('========================================================')
      console.log(`🚀 Servidor de Mensajería corriendo en puerto ${config.port}`)
      console.log(`📊 Panel de Administración: http://localhost:${config.port}/admin`)
      console.log(`📁 Directorio de Archivos: ${config.uploadDir}`)
      console.log('========================================================')
    })
  } catch (err) {
    console.error('❌ Error al iniciar el servidor:', err)
    process.exit(1)
  }
}

bootstrap()
