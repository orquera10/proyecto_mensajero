import { Router } from 'express'
import { query, formatSectorName } from '../db.js'
import { authenticateToken, requireAdmin } from '../auth.js'

export const sectorRouter = Router()

// Helper to compute full path and depth for sectors
export function computeSectorHierarchy(sectors) {
  const map = new Map(sectors.map((s) => [s.id, { ...s, name: formatSectorName(s.name) }]))

  function getFullPath(id, visited = new Set()) {
    if (!id || visited.has(id)) return ''
    visited.add(id)
    const s = map.get(id)
    if (!s) return ''
    const sName = formatSectorName(s.name)
    if (s.parent_id && map.has(s.parent_id)) {
      const parentPath = getFullPath(s.parent_id, visited)
      return parentPath ? `${parentPath} > ${sName}` : sName
    }
    return sName
  }

  function getDepth(id, visited = new Set()) {
    if (!id || visited.has(id)) return 0
    visited.add(id)
    const s = map.get(id)
    if (!s || !s.parent_id || !map.has(s.parent_id)) return 0
    return 1 + getDepth(s.parent_id, visited)
  }

  return sectors.map((s) => ({
    ...s,
    name: formatSectorName(s.name),
    parent_id: s.parent_id || null,
    parent_name: s.parent_id && map.get(s.parent_id) ? formatSectorName(map.get(s.parent_id).name) : null,
    full_path: getFullPath(s.id),
    depth: getDepth(s.id),
    user_count: parseInt(s.user_count || '0', 10),
  }))
}

// GET /api/sectors - Get all sectors with hierarchy and counts
sectorRouter.get('/', authenticateToken, async (_req, res) => {
  try {
    const { rows } = await query(
      `SELECT s.*, COUNT(u.id) as user_count
       FROM sectors s
       LEFT JOIN users u ON u.sector_id = s.id 
         AND LOWER(u.username) != 'admin' 
         AND LOWER(u.display_name) NOT LIKE '%administrador%sistema%'
       GROUP BY s.id
       ORDER BY s.name ASC`
    )

    const enriched = computeSectorHierarchy(rows)
    res.json({ sectors: enriched })
  } catch (err) {
    console.error('Error fetching sectors:', err)
    res.status(500).json({ error: 'Error al obtener sectores' })
  }
})

// POST /api/sectors - Create sector/subsector (admin)
sectorRouter.post('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { name, description, color, parent_id } = req.body
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'El nombre del sector es requerido' })
    }

    const parsedParentId = parent_id ? parseInt(parent_id, 10) : null
    const normalizedName = formatSectorName(name)

    const { insertId } = await query(
      'INSERT INTO sectors (name, description, color, parent_id) VALUES (?, ?, ?, ?)',
      [normalizedName, description || '', color || '#3b82f6', parsedParentId]
    )

    const io = req.app.get('io')
    if (io) {
      io.emit('sectors:updated')
    }

    res.status(201).json({
      message: 'Sector creado correctamente',
      sector: {
        id: insertId,
        name: normalizedName,
        description: description || '',
        color: color || '#3b82f6',
        parent_id: parsedParentId,
      },
    })
  } catch (err) {
    console.error('Error creating sector:', err)
    res.status(500).json({ error: 'Error al crear sector' })
  }
})

// PUT /api/sectors/:id - Update sector (admin)
sectorRouter.put('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const { name, description, color, parent_id } = req.body

    const parsedId = parseInt(id, 10)
    let parsedParentId = parent_id ? parseInt(parent_id, 10) : null
    const normalizedName = formatSectorName(name)

    // Prevent sector from being its own parent
    if (parsedParentId === parsedId) {
      parsedParentId = null
    }

    await query(
      'UPDATE sectors SET name = ?, description = ?, color = ?, parent_id = ? WHERE id = ?',
      [normalizedName, description || '', color || '#3b82f6', parsedParentId, parsedId]
    )

    const io = req.app.get('io')
    if (io) {
      io.emit('sectors:updated')
      io.emit('users:updated')
    }

    res.json({ message: 'Sector actualizado correctamente' })
  } catch (err) {
    console.error('Error updating sector:', err)
    res.status(500).json({ error: 'Error al actualizar sector' })
  }
})

// DELETE /api/sectors/:id - Delete sector (admin)
sectorRouter.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params
    await query('DELETE FROM sectors WHERE id = ?', [id])

    const io = req.app.get('io')
    if (io) {
      io.emit('sectors:updated')
      io.emit('users:updated')
    }

    res.json({ message: 'Sector eliminado correctamente' })
  } catch (err) {
    console.error('Error deleting sector:', err)
    res.status(500).json({ error: 'Error al eliminar sector' })
  }
})
