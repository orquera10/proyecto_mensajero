import jwt from 'jsonwebtoken'
import { config } from './config.js'

export function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      display_name: user.display_name,
      role: user.role,
      sector_id: user.sector_id,
      is_leader: Boolean(user.is_leader),
    },
    config.jwtSecret,
    { expiresIn: '30d' }
  )
}

export function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null

  if (!token) {
    return res.status(401).json({ error: 'Token de autenticación requerido' })
  }

  jwt.verify(token, config.jwtSecret, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Token inválido o expirado' })
    }
    req.user = user
    next()
  })
}

export function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Acceso denegado: se requieren privilegios de administrador' })
  }
  next()
}
