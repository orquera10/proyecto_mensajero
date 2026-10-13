import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { query } from '../db.js'
import { authenticateToken, requireAdmin } from '../auth.js'
import { getUserPresenceMap } from '../socket.js'
import { computeSectorHierarchy } from './sectorRoutes.js'

export const userRouter = Router()

// GET /api/users - Get all users with their sector info, real-time presence and unread messages count
userRouter.get('/', authenticateToken, async (req, res) => {
  try {
    const currentUserId = req.user.id

    // Fetch all sectors to build hierarchy map
    const { rows: allSectors } = await query(`SELECT * FROM sectors`)
    const sectorTree = computeSectorHierarchy(allSectors)
    const sectorMap = new Map(sectorTree.map((s) => [s.id, s]))

    const { rows } = await query(
      `SELECT u.id, u.username, u.display_name, u.role, u.sector_id, u.is_leader, u.avatar_url, u.created_at,
              s.name as sector_name, s.color as sector_color,
              (
                SELECT COUNT(*) 
                FROM messages m 
                WHERE m.sender_id = u.id 
                  AND m.receiver_id = ? 
                  AND (m.status != 'read' OR NOT m.is_read)
              ) as unread_count,
              (
                SELECT m2.content 
                FROM messages m2 
                WHERE (m2.sender_id = u.id AND m2.receiver_id = ?) 
                   OR (m2.sender_id = ? AND m2.receiver_id = u.id)
                ORDER BY m2.created_at DESC, m2.id DESC 
                LIMIT 1
              ) as last_message_content,
              (
                SELECT m2.message_type 
                FROM messages m2 
                WHERE (m2.sender_id = u.id AND m2.receiver_id = ?) 
                   OR (m2.sender_id = ? AND m2.receiver_id = u.id)
                ORDER BY m2.created_at DESC, m2.id DESC 
                LIMIT 1
              ) as last_message_type,
              (
                SELECT m2.created_at 
                FROM messages m2 
                WHERE (m2.sender_id = u.id AND m2.receiver_id = ?) 
                   OR (m2.sender_id = ? AND m2.receiver_id = u.id)
                ORDER BY m2.created_at DESC, m2.id DESC 
                LIMIT 1
              ) as last_message_time
       FROM users u
       LEFT JOIN sectors s ON u.sector_id = s.id
       ORDER BY s.name ASC, u.display_name ASC`,
      [currentUserId, currentUserId, currentUserId, currentUserId, currentUserId, currentUserId, currentUserId]
    )

    const presenceMap = getUserPresenceMap()
    const usersWithPresence = rows.map((u) => {
      let snippet = u.last_message_content
      if (!snippet && u.last_message_type) {
        snippet = u.last_message_type === 'image' ? '📷 Imagen' : '📎 Archivo'
      }

      const sectorInfo = u.sector_id ? sectorMap.get(u.sector_id) : null
      let shortPath = u.sector_name || 'General'
      if (sectorInfo) {
        if (sectorInfo.parent_name) {
          shortPath = `${sectorInfo.parent_name} / ${sectorInfo.name}`
        } else {
          shortPath = sectorInfo.name
        }
      }

      return {
        id: u.id,
        username: u.username,
        display_name: u.display_name,
        role: u.role,
        sector_id: u.sector_id,
        sector_name: u.sector_name,
        sector_color: u.sector_color,
        sector_full_path: sectorInfo ? sectorInfo.full_path : (u.sector_name || 'General'),
        sector_short_path: shortPath,
        sector_parent_id: sectorInfo ? sectorInfo.parent_id : null,
        is_leader: Boolean(u.is_leader),
        avatar_url: u.avatar_url,
        created_at: u.created_at,
        presence: presenceMap[u.id]?.presence || 'offline',
        statusText: presenceMap[u.id]?.statusText || '',
        unreadCount: parseInt(u.unread_count || '0', 10),
        lastMessage: snippet || '',
        lastMessageTime: u.last_message_time || null,
      }
    })

    res.json({ users: usersWithPresence })
  } catch (err) {
    console.error('Error fetching users:', err)
    res.status(500).json({ error: 'Error al obtener usuarios' })
  }
})

// POST /api/users - Create new user (admin)
userRouter.post('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { username, password, display_name, sector_id, role, is_leader } = req.body

    if (!username || !password || !display_name) {
      return res.status(400).json({ error: 'Usuario, contraseña y nombre son requeridos' })
    }

    const passHash = await bcrypt.hash(password, 10)
    const isLeaderVal = Boolean(is_leader)

    const { insertId } = await query(
      `INSERT INTO users (username, password_hash, display_name, sector_id, role, is_leader)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [username.trim().toLowerCase(), passHash, display_name.trim(), sector_id || null, role || 'user', isLeaderVal]
    )

    res.status(201).json({
      message: 'Usuario creado exitosamente',
      user: {
        id: insertId,
        username: username.trim().toLowerCase(),
        display_name: display_name.trim(),
        sector_id: sector_id || null,
        role: role || 'user',
        is_leader: Boolean(is_leader),
      },
    })
  } catch (err) {
    if (err.message && (err.message.includes('UNIQUE') || err.message.includes('duplicate'))) {
      return res.status(400).json({ error: 'El nombre de usuario ya existe' })
    }
    console.error('Error creating user:', err)
    res.status(500).json({ error: 'Error al crear usuario' })
  }
})

// PUT /api/users/:id - Edit user (admin)
userRouter.put('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const { display_name, sector_id, role, is_leader } = req.body
    const isLeaderVal = Boolean(is_leader)

    await query(
      `UPDATE users SET display_name = ?, sector_id = ?, role = ?, is_leader = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [display_name.trim(), sector_id || null, role || 'user', isLeaderVal, id]
    )

    const io = req.app.get('io')
    if (io) {
      io.emit('user:profile_updated', {
        userId: parseInt(id, 10),
        display_name: display_name.trim(),
        sector_id: sector_id || null,
        role: role || 'user',
        is_leader: isLeaderVal,
      })
    }

    res.json({ message: 'Usuario actualizado exitosamente' })
  } catch (err) {
    console.error('Error updating user:', err)
    res.status(500).json({ error: 'Error al actualizar usuario' })
  }
})

// POST /api/users/:id/reset-password - Reset user password (admin)
userRouter.post('/:id/reset-password', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const { new_password } = req.body

    if (!new_password || new_password.length < 4) {
      return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 4 caracteres' })
    }

    const passHash = await bcrypt.hash(new_password, 10)
    await query('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [
      passHash,
      id,
    ])

    res.json({ message: 'Contraseña actualizada correctamente' })
  } catch (err) {
    console.error('Error resetting password:', err)
    res.status(500).json({ error: 'Error al restablecer la contraseña' })
  }
})

// DELETE /api/users/:id - Delete user (admin)
userRouter.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params
    if (parseInt(id, 10) === req.user.id) {
      return res.status(400).json({ error: 'No puedes eliminar tu propio usuario administrador' })
    }

    await query('DELETE FROM users WHERE id = ?', [id])
    res.json({ message: 'Usuario eliminado exitosamente' })
  } catch (err) {
    console.error('Error deleting user:', err)
    res.status(500).json({ error: 'Error al eliminar usuario' })
  }
})
