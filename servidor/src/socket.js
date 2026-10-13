import jwt from 'jsonwebtoken'
import { config } from './config.js'
import { query } from './db.js'
import { canUserBroadcast } from './routes/messageRoutes.js'

// Map of userId -> { sockets: Set<string>, presence: 'online'|'away'|'dnd', statusText: string }
const userPresenceMap = new Map()

export function getUserPresenceMap() {
  const result = {}
  for (const [uid, data] of userPresenceMap.entries()) {
    if ((data.sockets && data.sockets.size > 0) || data.disconnectTimer) {
      result[uid] = {
        presence: data.presence || 'online',
        statusText: data.statusText || '',
      }
    }
  }
  return result
}

export function initSocketIO(io) {
  // Socket Authentication Middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.split(' ')[1]

    if (!token) {
      return next(new Error('Autenticación requerida'))
    }

    jwt.verify(token, config.jwtSecret, (err, decoded) => {
      if (err) {
        return next(new Error('Token inválido'))
      }
      socket.user = decoded
      next()
    })
  })

  io.on('connection', async (socket) => {
    const user = socket.user
    const userId = Number(user.id)

    // Register user socket
    if (!userPresenceMap.has(userId)) {
      userPresenceMap.set(userId, {
        sockets: new Set(),
        presence: 'online',
        statusText: 'Disponible',
        disconnectTimer: null,
      })
    }

    const userData = userPresenceMap.get(userId)
    if (userData.disconnectTimer) {
      clearTimeout(userData.disconnectTimer)
      userData.disconnectTimer = null
    }
    userData.sockets.add(socket.id)

    // Join user's personal room & their sector room
    socket.join(`user:${userId}`)
    if (user.sector_id) {
      socket.join(`sector:${user.sector_id}`)
    }

    // Broadcast user is online
    io.emit('presence:update', {
      userId,
      presence: userData.presence,
      statusText: userData.statusText,
    })

    // Send current list of online users to the newly connected socket
    const onlineList = {}
    for (const [uid, data] of userPresenceMap.entries()) {
      onlineList[uid] = {
        presence: data.presence,
        statusText: data.statusText,
      }
    }
    socket.emit('presence:sync', onlineList)

    // Mark pending 'sent' messages as 'delivered' now that receiver has connected
    try {
      const { rows: pendingMessages } = await query(
        `SELECT id, sender_id FROM messages WHERE receiver_id = ? AND (status = 'sent' OR status IS NULL)`,
        [userId]
      )

      if (pendingMessages && pendingMessages.length > 0) {
        await query(
          `UPDATE messages SET status = 'delivered' WHERE receiver_id = ? AND (status = 'sent' OR status IS NULL)`,
          [userId]
        )

        // Notify each sender that their messages were delivered
        const senderMap = new Map()
        for (const msg of pendingMessages) {
          if (!senderMap.has(msg.sender_id)) senderMap.set(msg.sender_id, [])
          senderMap.get(msg.sender_id).push(msg.id)
        }

        for (const [sId, msgIds] of senderMap.entries()) {
          io.to(`user:${sId}`).emit('message:status_update', {
            status: 'delivered',
            messageIds: msgIds,
            conversationWith: userId,
          })
        }
      }
    } catch (e) {
      console.error('Error auto-updating delivered messages on connection:', e)
    }

    console.log(`👤 Usuario conectado: ${user.display_name} (@${user.username}) [Socket: ${socket.id}]`)

    // Handle Presence Status Change (online, away, dnd)
    socket.on('presence:change', ({ presence, statusText }) => {
      if (userPresenceMap.has(userId)) {
        const u = userPresenceMap.get(userId)
        u.presence = presence || 'online'
        u.statusText = statusText || ''
        io.emit('presence:update', {
          userId,
          presence: u.presence,
          statusText: u.statusText,
        })
      }
    })

    // Handle Private 1-to-1 Message
    socket.on('message:send', async (data, callback) => {
      try {
        const { content, message_type, file_url, file_name, file_size, file_mime } = data
        const receiver_id = Number(data.receiver_id)

        if (!receiver_id || (!content && !file_url)) {
          return callback?.({ error: 'Mensaje inválido' })
        }

        // Check if receiver is currently online
        const isReceiverOnline =
          userPresenceMap.has(receiver_id) && userPresenceMap.get(receiver_id).sockets.size > 0
        const initialStatus = isReceiverOnline ? 'delivered' : 'sent'

        // Insert into Database
        const { insertId } = await query(
          `INSERT INTO messages (sender_id, receiver_id, content, message_type, file_url, file_name, file_size, file_mime, status, is_read)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, FALSE)`,
          [
            userId,
            receiver_id,
            content || '',
            message_type || 'text',
            file_url || null,
            file_name || null,
            file_size || null,
            file_mime || null,
            initialStatus,
          ]
        )

        const messagePayload = {
          id: insertId,
          sender_id: userId,
          receiver_id,
          content: content || '',
          message_type: message_type || 'text',
          file_url: file_url || null,
          file_name: file_name || null,
          file_size: file_size || null,
          file_mime: file_mime || null,
          status: initialStatus,
          is_read: false,
          created_at: new Date().toISOString(),
          sender_name: user.display_name,
        }

        // Emit to receiver's room and sender's other sockets
        io.to(`user:${receiver_id}`).emit('message:receive', messagePayload)
        socket.to(`user:${userId}`).emit('message:sent_sync', messagePayload)

        callback?.({ success: true, message: messagePayload })
      } catch (err) {
        console.error('Error saving message in socket:', err)
        callback?.({ error: 'Error al enviar el mensaje' })
      }
    })

    // Handle Broadcast Announcement (Canal de Difusión: Informática y Encargados)
    socket.on('broadcast:send', async (data, callback) => {
      try {
        const { content, message_type, file_url, file_name, file_size, file_mime } = data

        if (!content && !file_url) {
          return callback?.({ error: 'El comunicado no puede estar vacío' })
        }

        const isAllowed = await canUserBroadcast(userId)
        if (!isAllowed) {
          return callback?.({
            error: 'Solo el personal de Informática y los Encargados de Área pueden publicar comunicados institucionales',
          })
        }

        // Insert broadcast message (receiver_id = NULL, sector_id = NULL)
        const { insertId } = await query(
          `INSERT INTO messages (sender_id, receiver_id, sector_id, content, message_type, file_url, file_name, file_size, file_mime, status, is_read)
           VALUES (?, NULL, NULL, ?, ?, ?, ?, ?, ?, 'delivered', TRUE)`,
          [
            userId,
            content || '',
            message_type || 'text',
            file_url || null,
            file_name || null,
            file_size || null,
            file_mime || null,
          ]
        )

        const { rows: uRows } = await query(
          `SELECT u.display_name, u.avatar_url, u.role, u.is_leader, s.name as sector_name, s.color as sector_color
           FROM users u
           LEFT JOIN sectors s ON u.sector_id = s.id
           WHERE u.id = ?`,
          [userId]
        )
        const sender = uRows[0] || {}

        const messagePayload = {
          id: insertId,
          sender_id: userId,
          receiver_id: null,
          sector_id: null,
          content: content || '',
          message_type: message_type || 'text',
          file_url: file_url || null,
          file_name: file_name || null,
          file_size: file_size || null,
          file_mime: file_mime || null,
          status: 'delivered',
          is_read: true,
          created_at: new Date().toISOString(),
          sender_name: (sender.display_name || user.display_name || '')
            .replace(/[\uFFFD\uFFFE]/g, 'ñ')
            .replace(/Maga[^\w\s]?a/gi, 'Magaña'),
          sender_avatar: sender.avatar_url || null,
          sender_role: sender.role || 'user',
          sender_is_leader: Boolean(sender.is_leader),
          sender_sector: sender.sector_name || 'General',
          sender_sector_color: sender.sector_color || '#3b82f6',
        }

        // Emit to ALL other connected users (avoid echoing to sender who receives it via callback)
        socket.broadcast.emit('broadcast:receive', messagePayload)

        callback?.({ success: true, message: messagePayload })
      } catch (err) {
        console.error('Error enviando comunicado de difusión:', err)
        callback?.({ error: 'Error al publicar el comunicado institucional' })
      }
    })

    // Handle Read Receipts Event
    socket.on('message:read', async ({ sender_id }, callback) => {
      try {
        if (!sender_id) return callback?.({ error: 'sender_id requerido' })

        await query(
          `UPDATE messages SET status = 'read', is_read = TRUE WHERE receiver_id = ? AND sender_id = ? AND (status != 'read' OR is_read = FALSE)`,
          [userId, sender_id]
        )

        // Notify sender that their messages have been read
        io.to(`user:${sender_id}`).emit('message:status_update', {
          status: 'read',
          conversationWith: userId,
        })

        callback?.({ success: true })
      } catch (err) {
        console.error('Error in message:read event:', err)
        callback?.({ error: 'Error al marcar como leído' })
      }
    })

    // Handle Typing State
    socket.on('typing:start', ({ receiver_id }) => {
      if (receiver_id) {
        io.to(`user:${receiver_id}`).emit('typing:status', {
          sender_id: userId,
          sender_name: user.display_name,
          isTyping: true,
        })
      }
    })

    socket.on('typing:stop', ({ receiver_id }) => {
      if (receiver_id) {
        io.to(`user:${receiver_id}`).emit('typing:status', {
          sender_id: userId,
          sender_name: user.display_name,
          isTyping: false,
        })
      }
    })

    // Handle Disconnect with mobile grace period
    socket.on('disconnect', () => {
      if (userPresenceMap.has(userId)) {
        const u = userPresenceMap.get(userId)
        u.sockets.delete(socket.id)

        if (u.sockets.size === 0) {
          // Si no tiene sockets activos, dar un tiempo de gracia de 2 minutos antes de marcarlo offline
          // para soportar celulares cuando bloquean pantalla o alternan aplicaciones
          if (u.disconnectTimer) clearTimeout(u.disconnectTimer)
          u.disconnectTimer = setTimeout(() => {
            if (u.sockets.size === 0) {
              userPresenceMap.delete(userId)
              io.emit('presence:update', {
                userId,
                presence: 'offline',
                statusText: '',
              })
              console.log(`👋 Usuario desconectado: ${user.display_name}`)
            }
          }, 120000) // 2 minutos
        }
      }
    })
  })
}
