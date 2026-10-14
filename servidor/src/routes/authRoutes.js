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

// Paleta de colores profesionales para asignación automática a sectores nuevos
const AUTO_SECTOR_COLORS = [
  '#3b82f6', // Azul
  '#10b981', // Esmeralda
  '#8b5cf6', // Violeta
  '#f59e0b', // Ámbar
  '#06b6d4', // Cian
  '#ec4899', // Rosa
  '#6366f1', // Índigo
  '#14b8a6', // Turquesa
  '#f97316', // Naranja
  '#a855f7', // Púrpura
]

function getSectorColor(name) {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return AUTO_SECTOR_COLORS[Math.abs(hash) % AUTO_SECTOR_COLORS.length]
}

async function resolveOrCreateSector(department, domain) {
  const cleanDept = (department || '').trim()
  if (!cleanDept) {
    // Si no hay información de departamento/OU de AD, buscar 'Sistemas' o el primer sector
    const { rows: sysSectors } = await query(
      `SELECT id FROM sectors WHERE LOWER(name) LIKE '%sistemas%' LIMIT 1`
    )
    const { rows: firstSector } = await query(`SELECT id FROM sectors ORDER BY id ASC LIMIT 1`)
    return sysSectors[0]?.id || firstSector[0]?.id || null
  }

  // 1. Búsqueda exacta (case-insensitive)
  const { rows: exactMatches } = await query(
    `SELECT id, name FROM sectors WHERE LOWER(TRIM(name)) = LOWER(?) LIMIT 1`,
    [cleanDept]
  )
  if (exactMatches.length > 0) {
    return exactMatches[0].id
  }

  // 2. Búsqueda por contención inteligente (ej: AD dice "Sistemas" y en la BD existe "Sistemas y TI", o viceversa)
  const { rows: partialMatches } = await query(
    `SELECT id, name FROM sectors WHERE LOWER(name) LIKE LOWER(?) OR LOWER(?) LIKE ('%' || LOWER(name) || '%') LIMIT 1`,
    [`%${cleanDept}%`, cleanDept]
  )
  if (partialMatches.length > 0) {
    return partialMatches[0].id
  }

  // 3. Si no existe en la base de datos, crear el sector automáticamente
  const formattedName = cleanDept.charAt(0).toUpperCase() + cleanDept.slice(1)
  const color = getSectorColor(formattedName)

  const res = await query(
    `INSERT INTO sectors (name, description, color, parent_id)
     VALUES (?, ?, ?, NULL)`,
    [
      formattedName,
      `Sector institucional creado automáticamente desde Active Directory (${domain || 'AD'})`,
      color,
    ]
  )

  const newSectorId = res.insertId
  if (newSectorId) {
    console.log(`✨ Sector auto-creado desde Active Directory: "${formattedName}" (ID ${newSectorId})`)
    return newSectorId
  }

  const { rows: fallbackFetch } = await query(
    `SELECT id FROM sectors WHERE LOWER(TRIM(name)) = LOWER(?) LIMIT 1`,
    [cleanDept]
  )
  return fallbackFetch[0]?.id || null
}

// POST /api/auth/windows-sso (Active Directory / Windows Single Sign-On)
authRouter.post('/windows-sso', async (req, res) => {
  try {
    const { username, domain, display_name, department } = req.body

    if (!username) {
      return res.status(400).json({ error: 'Nombre de usuario requerido' })
    }

    const cleanUsername = username.trim().toLowerCase()

    // 1. Verificar si el usuario ya existe
    let { rows } = await query(
      `SELECT u.*, s.name as sector_name, s.color as sector_color
       FROM users u
       LEFT JOIN sectors s ON u.sector_id = s.id
       WHERE LOWER(u.username) = LOWER(?)
       LIMIT 1`,
      [cleanUsername]
    )

    let user = rows[0]

    // 2. Resolver o auto-crear el sector de Active Directory
    const targetSectorId = await resolveOrCreateSector(department, domain)

    // 3. Si el usuario NO existe, auto-aprovisionarlo
    if (!user) {
      // Calcular nombre amigable (ej: 'dario orquera' -> 'Dario Orquera')
      let friendlyName = ''
      if (display_name && display_name.trim()) {
        friendlyName = display_name
          .trim()
          .split(' ')
          .filter(Boolean)
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
          .join(' ')
      } else {
        // Fallback: capitalizar nombre de usuario
        friendlyName = cleanUsername.charAt(0).toUpperCase() + cleanUsername.slice(1)
      }

      // Contraseña predeterminada para acceso web
      const defaultPassword = process.env.DEFAULT_WINDOWS_PASSWORD || '123456'
      const passwordHash = await bcrypt.hash(defaultPassword, 10)

      // Rol: admin si es el usuario admin, de lo contrario user
      const role = cleanUsername === 'admin' ? 'admin' : 'user'

      await query(
        `INSERT INTO users (username, password_hash, display_name, sector_id, role, is_leader)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [cleanUsername, passwordHash, friendlyName, targetSectorId, role, false]
      )

      // Obtener el usuario creado con su sector
      const { rows: createdRows } = await query(
        `SELECT u.*, s.name as sector_name, s.color as sector_color
         FROM users u
         LEFT JOIN sectors s ON u.sector_id = s.id
         WHERE LOWER(u.username) = LOWER(?)
         LIMIT 1`,
        [cleanUsername]
      )
      user = createdRows[0]
      console.log(`✨ Usuario de Windows / Active Directory auto-aprovisionado: @${cleanUsername} (${friendlyName}) en sector ID ${targetSectorId}`)
    } else {
      let needsUserUpdate = false
      let newDisplayName = user.display_name
      let newSectorId = user.sector_id

      // Si el usuario no tenía sector asignado, vincularlo al sector obtenido/creado desde AD
      if (!user.sector_id && targetSectorId) {
        newSectorId = targetSectorId
        needsUserUpdate = true
      }

      if (display_name && display_name.trim()) {
        // Formatear nombre preservando tildes y caracteres UTF-8
        const formatted = display_name
          .trim()
          .split(' ')
          .filter(Boolean)
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
          .join(' ')

        const hasCorruptedChars = /[\uFFFD]/.test(user.display_name || '')
        const isPlaceholder = !user.display_name || user.display_name.toLowerCase() === cleanUsername

        // Si el nombre guardado tiene caracteres corruptos (\uFFFD), es placeholder o difiere:
        if (formatted && (isPlaceholder || hasCorruptedChars || user.display_name !== formatted)) {
          newDisplayName = formatted
          needsUserUpdate = true
        }
      }

      if (needsUserUpdate) {
        await query(`UPDATE users SET display_name = ?, sector_id = ? WHERE id = ?`, [
          newDisplayName,
          newSectorId,
          user.id,
        ])
        user.display_name = newDisplayName
        user.sector_id = newSectorId

        // Refrescar sector_name y sector_color en el objeto de usuario
        const { rows: refreshed } = await query(
          `SELECT u.*, s.name as sector_name, s.color as sector_color
           FROM users u
           LEFT JOIN sectors s ON u.sector_id = s.id
           WHERE u.id = ?`,
          [user.id]
        )
        if (refreshed.length > 0) {
          user = refreshed[0]
        }
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

// POST /api/auth/profile (Permite a cualquier usuario actualizar su nombre visible / display_name)
authRouter.post('/profile', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id
    const { display_name } = req.body

    if (!display_name || !display_name.trim()) {
      return res.status(400).json({ error: 'El nombre visible no puede estar vacío' })
    }

    const cleanName = display_name.trim()

    await query('UPDATE users SET display_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [
      cleanName,
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
      io.emit('user:profile_updated', {
        userId,
        display_name: cleanName,
      })
    }

    res.json({
      message: 'Perfil actualizado exitosamente',
      user: updatedUser,
    })
  } catch (err) {
    console.error('Error al actualizar perfil:', err)
    res.status(500).json({ error: 'Error al actualizar el perfil' })
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
