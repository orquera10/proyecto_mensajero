import { Router } from 'express'
import path from 'node:path'
import fs from 'node:fs'
import { config } from '../config.js'
import { query } from '../db.js'
import { authenticateToken } from '../auth.js'
import { upload } from '../upload.js'

export const messageRouter = Router()

// GET /api/messages/history/:otherUserId - Get chat history between current user and another user
messageRouter.get('/history/:otherUserId', authenticateToken, async (req, res) => {
  try {
    const currentUserId = req.user.id
    const otherUserId = parseInt(req.params.otherUserId, 10)
    const limit = parseInt(req.query.limit || '40', 10)
    const beforeId = req.query.before ? parseInt(req.query.before, 10) : null

    let sql = `
      SELECT m.*, u.display_name as sender_name, u.avatar_url as sender_avatar
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      WHERE ((m.sender_id = ? AND m.receiver_id = ?)
         OR (m.sender_id = ? AND m.receiver_id = ?))
    `
    const params = [currentUserId, otherUserId, otherUserId, currentUserId]

    if (beforeId) {
      sql += ` AND m.id < ?`
      params.push(beforeId)
    }

    sql += ` ORDER BY m.id DESC LIMIT ?`
    params.push(limit)

    const { rows } = await query(sql, params)
    const messageRows = rows || []

    // Reverse to chronological order (oldest to newest)
    const messages = messageRows.slice().reverse()

    res.json({
      messages,
      hasMore: messageRows.length === limit,
    })
  } catch (err) {
    console.error('Error fetching chat history:', err)
    res.status(500).json({ error: 'Error al obtener historial de mensajes' })
  }
})

// Helper para validar si un usuario puede emitir comunicados institucionales (Informática o Encargados)
export async function canUserBroadcast(userId) {
  try {
    const { rows } = await query(
      `SELECT u.role, u.is_leader, s.name as sector_name
       FROM users u
       LEFT JOIN sectors s ON u.sector_id = s.id
       WHERE u.id = ?`,
      [userId]
    )
    if (!rows || rows.length === 0) return false
    const u = rows[0]
    if (u.role === 'admin' || Boolean(u.is_leader)) return true
    const sec = (u.sector_name || '').toLowerCase()
    if (sec.includes('sistema') || sec.includes('informa') || sec.includes('ti')) return true
    return false
  } catch (e) {
    console.warn('Error checking broadcast permission:', e)
    return false
  }
}

// GET /api/messages/broadcast - Historial de comunicados y avisos institucionales
messageRouter.get('/broadcast', authenticateToken, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit || '40', 10)
    const beforeId = req.query.before ? parseInt(req.query.before, 10) : null

    let sql = `
      SELECT m.*, 
             u.display_name as sender_name, 
             u.avatar_url as sender_avatar, 
             u.role as sender_role, 
             u.is_leader as sender_is_leader, 
             s.name as sender_sector,
             s.color as sender_sector_color
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      LEFT JOIN sectors s ON u.sector_id = s.id
      WHERE m.receiver_id IS NULL AND m.sector_id IS NULL
    `
    const params = []

    if (beforeId) {
      sql += ` AND m.id < ?`
      params.push(beforeId)
    }

    sql += ` ORDER BY m.id DESC LIMIT ?`
    params.push(limit)

    const { rows } = await query(sql, params)
    const messageRows = rows || []

    const messages = messageRows.slice().reverse().map((m) => ({
      ...m,
      sender_name: (m.sender_name || '').replace(/[\uFFFD\uFFFE]/g, 'ñ').replace(/Maga[^\w\s]?a/gi, 'Magaña'),
    }))

    res.json({
      messages,
      hasMore: messageRows.length === limit,
    })
  } catch (err) {
    console.error('Error fetching broadcast messages:', err)
    res.status(500).json({ error: 'Error al obtener mensajes de difusión' })
  }
})

// GET /api/messages/broadcast/unread-count - Cantidad de comunicados no leídos
messageRouter.get('/broadcast/unread-count', authenticateToken, async (req, res) => {
  try {
    const userId = parseInt(req.user.id, 10)

    let lastReadId = 0
    try {
      const { rows: readRows } = await query(
        `SELECT last_read_id FROM broadcast_reads WHERE user_id = ?`,
        [userId]
      )
      if (readRows && readRows.length > 0) {
        lastReadId = parseInt(readRows[0].last_read_id || 0, 10)
      }
    } catch (readErr) {
      console.warn('Aviso al consultar broadcast_reads (puede estar creándose la tabla):', readErr.message)
    }

    const { rows: countRows } = await query(
      `SELECT COUNT(*) as count 
       FROM messages 
       WHERE receiver_id IS NULL 
         AND sector_id IS NULL 
         AND id > ? 
         AND sender_id != ?`,
      [lastReadId, userId]
    )

    const unreadCount = parseInt(countRows[0]?.count || '0', 10)
    res.json({ unreadCount, lastReadId })
  } catch (err) {
    console.error('Error fetching broadcast unread count:', err)
    res.status(500).json({ error: 'Error al obtener comunicados no leídos', details: err.message })
  }
})

// POST /api/messages/broadcast/read - Marcar comunicados de difusión como leídos
messageRouter.post('/broadcast/read', authenticateToken, async (req, res) => {
  try {
    const userId = parseInt(req.user.id, 10)
    let lastReadId = req.body?.last_read_id ? parseInt(req.body.last_read_id, 10) : null

    if (!lastReadId) {
      const { rows: maxRows } = await query(
        `SELECT MAX(id) as max_id FROM messages WHERE receiver_id IS NULL AND sector_id IS NULL`
      )
      lastReadId = maxRows[0]?.max_id ? parseInt(maxRows[0].max_id, 10) : 0
    }

    const { rows } = await query(
      `SELECT user_id, last_read_id FROM broadcast_reads WHERE user_id = ?`,
      [userId]
    )

    if (rows && rows.length > 0) {
      const currentMax = Math.max(parseInt(rows[0].last_read_id || 0, 10), lastReadId)
      await query(
        `UPDATE broadcast_reads SET last_read_id = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`,
        [currentMax, userId]
      )
    } else {
      await query(
        `INSERT INTO broadcast_reads (user_id, last_read_id) VALUES (?, ?) RETURNING user_id`,
        [userId, lastReadId]
      )
    }

    res.json({ success: true, lastReadId })
  } catch (err) {
    console.error('Error marking broadcast as read:', err)
    res.status(500).json({ error: 'Error al marcar comunicados como leídos', details: err.message })
  }
})

// GET /api/messages/sector/:sectorId - Get sector channel messages
messageRouter.get('/sector/:sectorId', authenticateToken, async (req, res) => {
  try {
    const sectorId = parseInt(req.params.sectorId, 10)
    const limit = parseInt(req.query.limit || '100', 10)

    const { rows } = await query(
      `SELECT m.*, u.display_name as sender_name, u.avatar_url as sender_avatar
       FROM messages m
       JOIN users u ON m.sender_id = u.id
       WHERE m.sector_id = ?
       ORDER BY m.created_at ASC
       LIMIT ?`,
      [sectorId, limit]
    )

    res.json({ messages: rows })
  } catch (err) {
    console.error('Error fetching sector messages:', err)
    res.status(500).json({ error: 'Error al obtener mensajes del sector' })
  }
})

// POST /api/messages/upload - Upload attachment (image, pdf, document, etc.)
messageRouter.post('/upload', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se ha subido ningún archivo' })
    }

    let originalName = req.file.originalname
    try {
      // Corregir codificación si multer interpretó UTF-8 como latin1
      const converted = Buffer.from(originalName, 'latin1').toString('utf8')
      if (!converted.includes('')) {
        originalName = converted
      }
    } catch {
      // mantener originalName
    }

    const fileUrl = `/uploads/${req.file.filename}`
    const isImage = req.file.mimetype.startsWith('image/')

    res.json({
      file_url: fileUrl,
      file_name: originalName,
      file_size: req.file.size,
      file_mime: req.file.mimetype,
      message_type: isImage ? 'image' : 'file',
    })
  } catch (err) {
    console.error('Error uploading file:', err)
    res.status(500).json({ error: 'Error al procesar el archivo adjunto' })
  }
})

// GET /api/messages/download - Descargar archivo adjunto con su nombre original
messageRouter.get('/download', async (req, res) => {
  try {
    const fileUrl = req.query.url ? String(req.query.url).trim() : null
    const originalName = req.query.name ? String(req.query.name).trim() : null

    if (!fileUrl) {
      return res.status(400).json({ error: 'Falta el parámetro url' })
    }

    const safeFilename = path.basename(fileUrl)
    const filePath = path.join(config.uploadDir, safeFilename)

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Archivo no encontrado' })
    }

    const downloadName = originalName || safeFilename
    const asciiFallback = downloadName.replace(/[^\w.-]/g, '_')
    const encodedName = encodeURIComponent(downloadName)

    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodedName}`
    )
    res.sendFile(filePath)
  } catch (err) {
    console.error('Error al descargar archivo:', err)
    res.status(500).json({ error: 'Error al descargar archivo' })
  }
})

// POST /api/messages/mark-read - Mark messages from a user as read
messageRouter.post('/mark-read', authenticateToken, async (req, res) => {
  try {
    const currentUserId = req.user.id
    const { from_user_id } = req.body

    if (!from_user_id) {
      return res.status(400).json({ error: 'from_user_id es requerido' })
    }

    await query(
      `UPDATE messages 
       SET status = 'read', is_read = TRUE 
       WHERE receiver_id = ? AND sender_id = ? 
         AND (status != 'read' OR is_read IS NULL OR is_read = FALSE OR is_read = 0)`,
      [currentUserId, from_user_id]
    )

    const io = req.app.get('io')
    if (io) {
      io.to(`user:${from_user_id}`).emit('message:status_update', {
        status: 'read',
        conversationWith: currentUserId,
      })
    }

    res.json({ success: true })
  } catch (err) {
    console.error('Error marking messages as read:', err)
    res.status(500).json({ error: 'Error al marcar mensajes como leídos' })
  }
})
