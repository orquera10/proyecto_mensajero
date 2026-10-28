import { soundService } from './soundService'

export const notificationService = {
  // Request notification permission if running in browser
  async requestPermission() {
    if (typeof window !== 'undefined' && 'Notification' in window && !window.electronIPC) {
      if (Notification.permission === 'default') {
        try {
          await Notification.requestPermission()
        } catch (e) {
          console.warn('Notification permission error:', e)
        }
      }
    }
  },

  // Notify incoming message
  notifyIncomingMessage(senderName: string, bodyText: string, playSound: boolean = true, senderId?: number) {
    // 1. Play chime sound
    if (playSound) {
      soundService.playNotificationSound()
    }

    // 2. Vibrate mobile device (if supported, e.g. Android)
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate([200, 100, 200])
      } catch (e) {
        console.warn('Vibration error:', e)
      }
    }

    // 3. Show Native Notification (Electron or PWA / Web)
    if (window.electronIPC?.showNotification) {
      window.electronIPC.showNotification(senderName, bodyText, senderId)
    } else if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      try {
        // En Android Chrome se requiere el Service Worker para mostrar notificaciones nativas en la barra de estado
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
          navigator.serviceWorker.ready.then((registration) => {
            registration.showNotification(senderName, {
              body: bodyText,
              icon: '/pwa-192x192.png',
              badge: '/pwa-192x192.png',
              tag: 'mensajero-chat',
              data: { url: '/', senderId },
            } as NotificationOptions)
          }).catch(() => {
            this.fallbackNotification(senderName, bodyText, senderId)
          })
        } else {
          this.fallbackNotification(senderName, bodyText, senderId)
        }
      } catch (e) {
        console.warn('Web notification error:', e)
      }
    }
  },

  fallbackNotification(senderName: string, bodyText: string, senderId?: number) {
    try {
      const n = new Notification(senderName, {
        body: bodyText,
        icon: '/pwa-192x192.png',
      })
      n.onclick = () => {
        window.focus()
        if (senderId && typeof (window as any).__openChatCallback === 'function') {
          (window as any).__openChatCallback(senderId)
        }
      }
    } catch {
      // Ignored
    }
  },

  // Update Window title with unread count
  updateUnreadTitle(totalUnread: number) {
    if (typeof document !== 'undefined') {
      if (totalUnread > 0) {
        document.title = `(${totalUnread}) Mensajero Institucional`
      } else {
        document.title = 'Mensajero Institucional'
      }
    }

    if (window.electronIPC?.setBadge) {
      window.electronIPC.setBadge(totalUnread)
    }
  },
}
