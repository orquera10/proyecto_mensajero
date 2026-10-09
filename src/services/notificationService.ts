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
  notifyIncomingMessage(senderName: string, bodyText: string, playSound: boolean = true) {
    // 1. Play chime
    if (playSound) {
      soundService.playNotificationSound()
    }

    // 2. Show Native Notification (Electron or Web)
    if (window.electronIPC?.showNotification) {
      window.electronIPC.showNotification(senderName, bodyText)
    } else if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      try {
        const n = new Notification(senderName, {
          body: bodyText,
          icon: '/favicon.svg',
        })
        n.onclick = () => {
          window.focus()
        }
      } catch (e) {
        console.warn('Web notification error:', e)
      }
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
