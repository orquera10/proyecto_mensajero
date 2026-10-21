import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { query, formatSectorName, repairCompoundSectors } from '../db.js'
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
    return { sectorId: sysSectors[0]?.id || firstSector[0]?.id || null, isNew: false }
  }

  // 0. Si existen sectores compuestos heredados en la base de datos (ej: el creado antes de la actualización), repararlos primero
  await repairCompoundSectors()

  // Si cleanDept contiene jerarquía separada por '>' o '/' (ej: "SECRETARIA DE NIÑEZ > DIRECCION DE NIÑEZ > LINEA102 > EQUIPO TECNICO")
  const rawParts = cleanDept.split(/\s*(?:>|\/)\s*/).filter(Boolean)
  const parts = rawParts.map((p) => p.trim()).filter(Boolean)

  if (parts.length === 0) {
    return { sectorId: null, isNew: false }
  }

  let currentParentId = null
  let anySectorCreatedOrReparented = false
  let currentSectorId = null

  for (let i = 0; i < parts.length; i++) {
    const partName = parts[i]
    // Formatear nombre: Capitalizar primer letra de cada palabra (Title Case)
    const formattedName = formatSectorName(partName)

    // 1. Obtener hermanos bajo currentParentId
    const { rows: siblings } = await query(
      currentParentId === null
        ? `SELECT id, name, parent_id FROM sectors WHERE parent_id IS NULL`
        : `SELECT id, name, parent_id FROM sectors WHERE parent_id = ?`,
      currentParentId === null ? [] : [currentParentId]
    )

    // 1a. Coincidencia exacta (case-insensitive en JS para compatibilidad total con acentos y ñ)
    let foundSector = siblings.find(
      (s) =>
        s.name.trim().toLowerCase() === formattedName.toLowerCase() ||
        s.name.trim().toLowerCase() === partName.trim().toLowerCase()
    )

    // 1b. Coincidencia parcial inteligente (sin incluir sectores que contengan '>')
    if (!foundSector) {
      foundSector = siblings.find((s) => {
        if (s.name.includes('>')) return false
        const sLower = s.name.trim().toLowerCase()
        const fLower = formattedName.toLowerCase()
        return sLower.includes(fLower) || fLower.includes(sLower)
      })
    }

    // 2. Si no existe bajo este padre pero existe en la raíz (parent_id IS NULL) y estamos en un nivel hijo:
    // (Ejemplo: 'Equipo Técnico' fue creado previamente sin padre a la altura de secretaría)
    if (!foundSector && currentParentId !== null) {
      const { rows: rootSectors } = await query(`SELECT id, name, parent_id FROM sectors WHERE parent_id IS NULL`)
      const orphan = rootSectors.find((s) => {
        if (s.name.includes('>')) return false
        const sLower = s.name.trim().toLowerCase()
        const fLower = formattedName.toLowerCase()
        return sLower === fLower || sLower.includes(fLower) || fLower.includes(sLower)
      })

      if (orphan) {
        foundSector = orphan
        await query(`UPDATE sectors SET parent_id = ?, name = ? WHERE id = ?`, [
          currentParentId,
          formattedName,
          foundSector.id,
        ])
        foundSector.parent_id = currentParentId
        foundSector.name = formattedName
        anySectorCreatedOrReparented = true
        console.log(`🔄 Sector "${formattedName}" (ID ${foundSector.id}) re-ubicado bajo padre ID ${currentParentId}`)
      }
    }

    if (foundSector) {
      currentSectorId = foundSector.id
      currentParentId = foundSector.id
      // Asegurar que el nombre en base de datos esté normalizado (Title Case) si estaba en mayúsculas
      if (formattedName && foundSector.name !== formattedName) {
        await query(`UPDATE sectors SET name = ? WHERE id = ?`, [formattedName, foundSector.id])
        console.log(`🔧 Sector #${foundSector.id} normalizado a Title Case: "${foundSector.name}" -> "${formattedName}"`)
        foundSector.name = formattedName
        anySectorCreatedOrReparented = true
      }
    } else {
      // 3. Crear el sector en este nivel de la jerarquía
      const color = getSectorColor(formattedName)
      const desc = currentParentId
        ? `Subsector institucional en ${parts.slice(0, i + 1).map(formatSectorName).join(' > ')}`
        : `Sector institucional creado desde Active Directory (${domain || 'AD'})`

      const insertRes = await query(
        `INSERT INTO sectors (name, description, color, parent_id)
         VALUES (?, ?, ?, ?)`,
        [formattedName, desc, color, currentParentId]
      )

      currentSectorId = insertRes.insertId
      if (!currentSectorId) {
        const { rows: fetchCreated } = await query(
          currentParentId === null
            ? `SELECT id FROM sectors WHERE parent_id IS NULL AND name = ? LIMIT 1`
            : `SELECT id FROM sectors WHERE parent_id = ? AND name = ? LIMIT 1`,
          currentParentId === null ? [formattedName] : [currentParentId, formattedName]
        )
        currentSectorId = fetchCreated[0]?.id || null
      }
      currentParentId = currentSectorId
      anySectorCreatedOrReparented = true
      console.log(`✨ Sector auto-creado en jerarquía: "${formattedName}" (ID ${currentSectorId}, parent: ${currentParentId})`)
    }
  }

  return { sectorId: currentSectorId, isNew: anySectorCreatedOrReparented }
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
    const io = req.app.get('io')
    const { sectorId: targetSectorId, isNew: isSectorNew } = await resolveOrCreateSector(department, domain)
    if (isSectorNew && io) {
      io.emit('sectors:updated')
    }

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

      if (io) {
        io.emit('users:updated')
      }
    } else {
      let needsUserUpdate = false
      let newDisplayName = user.display_name
      let newSectorId = user.sector_id

      // Si el usuario no tenía sector asignado o su sector en AD difiere del guardado:
      if (targetSectorId && (!user.sector_id || Number(user.sector_id) !== Number(targetSectorId))) {
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

        if (io) {
          io.emit('users:updated')
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
