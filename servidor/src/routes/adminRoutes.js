import { Router } from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { query, dbType } from '../db.js'
import { authenticateToken, requireAdmin } from '../auth.js'
import { config } from '../config.js'

export const adminRouter = Router()

// GET /api/admin/stats
adminRouter.get('/stats', authenticateToken, requireAdmin, async (_req, res) => {
  try {
    const { rows: userCount } = await query('SELECT COUNT(*) as count FROM users')
    const { rows: sectorCount } = await query('SELECT COUNT(*) as count FROM sectors')
    const { rows: messageCount } = await query('SELECT COUNT(*) as count FROM messages')

    // Calculate uploads folder size
    let uploadsSize = 0
    let filesCount = 0
    try {
      const files = fs.readdirSync(config.uploadDir)
      filesCount = files.length
      for (const file of files) {
        const stat = fs.statSync(path.join(config.uploadDir, file))
        uploadsSize += stat.size
      }
    } catch (e) {
      console.warn('Error reading uploads size:', e)
    }

    res.json({
      db_type: dbType,
      users_total: parseInt(userCount[0]?.count || 0, 10),
      sectors_total: parseInt(sectorCount[0]?.count || 0, 10),
      messages_total: parseInt(messageCount[0]?.count || 0, 10),
      files_count: filesCount,
      files_size_bytes: uploadsSize,
      files_size_mb: (uploadsSize / (1024 * 1024)).toFixed(2),
    })
  } catch (err) {
    console.error('Error in /api/admin/stats:', err)
    res.status(500).json({ error: 'Error al obtener estadísticas del servidor' })
  }
})

// GET /api/admin/conversations - Grouped conversation pairs
adminRouter.get('/conversations', authenticateToken, requireAdmin, async (_req, res) => {
  try {
    // Select unique conversation pairs (user_a, user_b) where user_a < user_b
    const sql = `
      SELECT 
        CASE WHEN m.sender_id < m.receiver_id THEN m.sender_id ELSE m.receiver_id END as user1_id,
        CASE WHEN m.sender_id < m.receiver_id THEN m.receiver_id ELSE m.sender_id END as user2_id,
        COUNT(m.id) as message_count,
        MAX(m.created_at) as last_message_time,
        MAX(m.id) as last_message_id
      FROM messages m
      WHERE m.receiver_id IS NOT NULL
      GROUP BY 
        CASE WHEN m.sender_id < m.receiver_id THEN m.sender_id ELSE m.receiver_id END,
        CASE WHEN m.sender_id < m.receiver_id THEN m.receiver_id ELSE m.sender_id END
      ORDER BY last_message_time DESC
    `

    const { rows: pairs } = await query(sql)

    // Enrich pairs with user names and last message info
    const conversations = []
    for (const pair of pairs) {
      const { rows: u1Rows } = await query(
        `SELECT u.id, u.username, u.display_name, s.name as sector_name, s.color as sector_color
         FROM users u LEFT JOIN sectors s ON u.sector_id = s.id WHERE u.id = ?`,
        [pair.user1_id]
      )
      const { rows: u2Rows } = await query(
        `SELECT u.id, u.username, u.display_name, s.name as sector_name, s.color as sector_color
         FROM users u LEFT JOIN sectors s ON u.sector_id = s.id WHERE u.id = ?`,
        [pair.user2_id]
      )
      const { rows: lastMsgRows } = await query(
        `SELECT content, message_type, file_name, created_at, sender_id FROM messages WHERE id = ?`,
        [pair.last_message_id]
      )

      if (u1Rows.length > 0 && u2Rows.length > 0) {
        conversations.push({
          user1: u1Rows[0],
          user2: u2Rows[0],
          message_count: parseInt(pair.message_count, 10),
          last_message: lastMsgRows[0] || null,
        })
      }
    }

    res.json({ conversations })
  } catch (err) {
    console.error('Error fetching conversations:', err)
    res.status(500).json({ error: 'Error al obtener la lista de conversaciones' })
  }
})

// GET /api/admin/conversations/:u1/:u2 - Full conversation history between two users
adminRouter.get('/conversations/:u1/:u2', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const u1 = parseInt(req.params.u1, 10)
    const u2 = parseInt(req.params.u2, 10)

    const sql = `
      SELECT m.*,
             u1.username as sender_username, u1.display_name as sender_name,
             s1.name as sender_sector, s1.color as sender_sector_color
      FROM messages m
      JOIN users u1 ON m.sender_id = u1.id
      LEFT JOIN sectors s1 ON u1.sector_id = s1.id
      WHERE (m.sender_id = ? AND m.receiver_id = ?)
         OR (m.sender_id = ? AND m.receiver_id = ?)
      ORDER BY m.created_at ASC
    `

    const { rows: messages } = await query(sql, [u1, u2, u2, u1])

    res.json({ messages })
  } catch (err) {
    console.error('Error fetching conversation thread:', err)
    res.status(500).json({ error: 'Error al obtener el hilo de la conversación' })
  }
})

// GET /api/admin/messages - Flat audit log with filters
adminRouter.get('/messages', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { sender_id, receiver_id, search, limit = '100', offset = '0' } = req.query

    const params = []
    const whereConditions = []

    if (sender_id) {
      whereConditions.push('m.sender_id = ?')
      params.push(parseInt(sender_id, 10))
    }

    if (receiver_id) {
      whereConditions.push('m.receiver_id = ?')
      params.push(parseInt(receiver_id, 10))
    }

    if (search && search.trim()) {
      whereConditions.push('(LOWER(m.content) LIKE ? OR LOWER(m.file_name) LIKE ?)')
      const term = `%${search.trim().toLowerCase()}%`
      params.push(term, term)
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : ''

    const countSql = `SELECT COUNT(*) as total FROM messages m ${whereClause}`
    const { rows: countRows } = await query(countSql, params)
    const total = parseInt(countRows[0]?.total || 0, 10)

    const sql = `
      SELECT m.*,
             u1.username as sender_username, u1.display_name as sender_name,
             s1.name as sender_sector, s1.color as sender_sector_color,
             u2.username as receiver_username, u2.display_name as receiver_name,
             s2.name as receiver_sector, s2.color as receiver_sector_color
      FROM messages m
      JOIN users u1 ON m.sender_id = u1.id
      LEFT JOIN sectors s1 ON u1.sector_id = s1.id
      LEFT JOIN users u2 ON m.receiver_id = u2.id
      LEFT JOIN sectors s2 ON u2.sector_id = s2.id
      ${whereClause}
      ORDER BY m.created_at DESC
      LIMIT ? OFFSET ?
    `
    params.push(parseInt(limit, 10), parseInt(offset, 10))

    const { rows } = await query(sql, params)

    res.json({
      total,
      messages: rows,
    })
  } catch (err) {
    console.error('Error fetching audit messages:', err)
    res.status(500).json({ error: 'Error al consultar auditoría de mensajes' })
  }
})

// DELETE /api/admin/messages/:id
adminRouter.delete('/messages/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params
    await query('DELETE FROM messages WHERE id = ?', [id])
    res.json({ message: 'Mensaje eliminado del registro de auditoría' })
  } catch (err) {
    console.error('Error deleting message:', err)
    res.status(500).json({ error: 'Error al eliminar el mensaje' })
  }
})
