import { Router } from 'express'
import path from 'node:path'
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

    const fileUrl = `/uploads/${req.file.filename}`
    const isImage = req.file.mimetype.startsWith('image/')

    res.json({
      file_url: fileUrl,
      file_name: req.file.originalname,
      file_size: req.file.size,
      file_mime: req.file.mimetype,
      message_type: isImage ? 'image' : 'file',
    })
  } catch (err) {
    console.error('Error uploading file:', err)
    res.status(500).json({ error: 'Error al procesar el archivo adjunto' })
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
      `UPDATE messages SET status = 'read', is_read = TRUE WHERE receiver_id = ? AND sender_id = ? AND (status != 'read' OR is_read = FALSE)`,
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
