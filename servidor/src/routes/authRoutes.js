import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { query } from '../db.js'
import { generateToken, authenticateToken } from '../auth.js'
import { upload } from '../upload.js'

export const authRouter = Router()

// POST /api/auth/login
authRouter.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body

    if (!username || !password) {
      return res.status(400).json({ error: 'Usuario y contraseña requeridos' })
    }

    const { rows } = await query(
      `SELECT u.*, s.name as sector_name, s.color as sector_color
       FROM users u
       LEFT JOIN sectors s ON u.sector_id = s.id
       WHERE LOWER(u.username) = LOWER(?)
       LIMIT 1`,
      [username.trim()]
    )

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Credenciales inválidas' })
    }

    const user = rows[0]
    const valid = await bcrypt.compare(password, user.password_hash)
    if (!valid) {
      return res.status(401).json({ error: 'Credenciales inválidas' })
    }

    const token = generateToken(user)

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        display_name: user.display_name,
        role: user.role,
        sector_id: user.sector_id,
        is_leader: Boolean(user.is_leader),
        sector_name: user.sector_name || 'General',
        sector_color: user.sector_color || '#3b82f6',
        avatar_url: user.avatar_url,
      },
    })
  } catch (err) {
    console.error('Error en login:', err)
    res.status(500).json({ error: 'Error interno en el servidor' })
  }
})

// POST /api/auth/windows-sso (Active Directory / Windows Single Sign-On)
authRouter.post('/windows-sso', async (req, res) => {
  try {
    const { username, domain, display_name } = req.body

    if (!username) {
      return res.status(400).json({ error: 'Nombre de usuario requerido' })
    }

    const cleanUsername = username.trim().toLowerCase()

    // 1. Check if user already exists
    let { rows } = await query(
      `SELECT u.*, s.name as sector_name, s.color as sector_color
       FROM users u
       LEFT JOIN sectors s ON u.sector_id = s.id
       WHERE LOWER(u.username) = LOWER(?)
       LIMIT 1`,
      [cleanUsername]
    )

    let user = rows[0]

    // 2. If user does NOT exist, auto-provision the user
    if (!user) {
      // Find sector: look for 'Sistemas' or 'Sistemas y TI', else first sector
      const { rows: sysSectors } = await query(
        `SELECT id FROM sectors WHERE LOWER(name) LIKE '%sistemas%' LIMIT 1`
      )
      const { rows: firstSector } = await query(`SELECT id FROM sectors ORDER BY id ASC LIMIT 1`)
      const assignedSectorId = sysSectors[0]?.id || firstSector[0]?.id || null

      // Compute friendly display name (e.g., 'dario orquera' -> 'Dario Orquera')
      let friendlyName = ''
      if (display_name && display_name.trim()) {
        friendlyName = display_name
          .trim()
          .split(' ')
          .filter(Boolean)
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
          .join(' ')
      } else {
        // Fallback: capitalize username
        friendlyName = cleanUsername.charAt(0).toUpperCase() + cleanUsername.slice(1)
      }

      // Contraseña predeterminada para acceso web
      const defaultPassword = process.env.DEFAULT_WINDOWS_PASSWORD || '123456'
      const passwordHash = await bcrypt.hash(defaultPassword, 10)

      // Role: admin if username is admin or darorquera if designated, else user
      const role = cleanUsername === 'admin' ? 'admin' : 'user'

      await query(
        `INSERT INTO users (username, password_hash, display_name, sector_id, role, is_leader)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [cleanUsername, passwordHash, friendlyName, assignedSectorId, role, false]
      )

      // Fetch created user
      const { rows: createdRows } = await query(
        `SELECT u.*, s.name as sector_name, s.color as sector_color
         FROM users u
         LEFT JOIN sectors s ON u.sector_id = s.id
         WHERE LOWER(u.username) = LOWER(?)
         LIMIT 1`,
        [cleanUsername]
      )
      user = createdRows[0]
      console.log(`✨ Usuario de Windows / Active Directory auto-aprovisionado: @${cleanUsername} (${friendlyName}) en sector ID ${assignedSectorId}`)
    } else if (display_name && display_name.trim()) {
      // If user exists but display_name is empty or just username, update to AD display name
      const formatted = display_name
        .trim()
        .split(' ')
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ')

      if (!user.display_name || user.display_name.toLowerCase() === cleanUsername) {
        await query(`UPDATE users SET display_name = ? WHERE id = ?`, [formatted, user.id])
        user.display_name = formatted
      }
    }

    const token = generateToken(user)

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        display_name: user.display_name,
        role: user.role,
        sector_id: user.sector_id,
        is_leader: Boolean(user.is_leader),
        sector_name: user.sector_name || 'General',
        sector_color: user.sector_color || '#3b82f6',
        avatar_url: user.avatar_url,
      },
    })
  } catch (err) {
    console.error('Error en windows-sso:', err)
    res.status(500).json({ error: 'Error al autenticar con Windows SSO' })
  }
})

// GET /api/auth/me
authRouter.get('/me', authenticateToken, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT u.id, u.username, u.display_name, u.role, u.sector_id, u.is_leader, u.avatar_url,
              s.name as sector_name, s.color as sector_color
       FROM users u
       LEFT JOIN sectors s ON u.sector_id = s.id
       WHERE u.id = ?
       LIMIT 1`,
      [req.user.id]
    )

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' })
    }

    const u = rows[0]
    res.json({
      user: {
        ...u,
        is_leader: Boolean(u.is_leader),
      },
    })
  } catch (err) {
    console.error('Error en /me:', err)
    res.status(500).json({ error: 'Error interno en el servidor' })
  }
})

// POST /api/auth/change-password (Permite a cualquier usuario cambiar o definir su contraseña para acceso web)
authRouter.post('/change-password', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id
    const { new_password } = req.body

    if (!new_password || new_password.trim().length < 4) {
      return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 4 caracteres' })
    }

    const passHash = await bcrypt.hash(new_password.trim(), 10)
    await query('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [passHash, userId])

    res.json({ message: 'Contraseña web actualizada exitosamente' })
  } catch (err) {
    console.error('Error al cambiar contraseña:', err)
    res.status(500).json({ error: 'Error al cambiar la contraseña' })
  }
})

// POST /api/auth/avatar (Subir foto de perfil o elegir avatar prediseñado)
authRouter.post(
  '/avatar',
  authenticateToken,
  (req, res, next) => {
    if (req.is('multipart/form-data')) {
      upload.single('avatar')(req, res, next)
    } else {
      next()
    }
  },
  async (req, res) => {
    try {
      const userId = req.user.id
      let avatarUrl = ''

      if (req.file) {
        avatarUrl = `/uploads/${req.file.filename}`
      } else if (req.body && typeof req.body.avatar_url === 'string') {
        avatarUrl = req.body.avatar_url.trim()
      } else {
        return res.status(400).json({ error: 'No se envió ninguna foto ni URL de avatar' })
      }

      await query('UPDATE users SET avatar_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [
        avatarUrl,
        userId,
      ])

      const { rows } = await query(
        `SELECT u.id, u.username, u.display_name, u.role, u.sector_id, u.is_leader, u.avatar_url,
                s.name as sector_name, s.color as sector_color
         FROM users u
         LEFT JOIN sectors s ON u.sector_id = s.id
         WHERE u.id = ?
         LIMIT 1`,
        [userId]
      )

      const updatedUser = {
        ...rows[0],
        is_leader: Boolean(rows[0].is_leader),
      }

      const io = req.app.get('io')
      if (io) {
        io.emit('user:avatar_updated', {
          userId,
          avatar_url: avatarUrl,
        })
      }

      res.json({
        message: 'Avatar de perfil actualizado exitosamente',
        user: updatedUser,
        avatar_url: avatarUrl,
      })
    } catch (err) {
      console.error('Error al actualizar avatar:', err)
      res.status(500).json({ error: 'Error al actualizar el avatar de perfil' })
    }
  }
)
