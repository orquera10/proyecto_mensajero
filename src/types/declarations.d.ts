declare module '@xmpp/client' {
  export function client(options: any): any
  export function xml(name: string, attrs?: Record<string, any>, ...children: any[]): any
}

interface Window {
  electronIPC?: {
    getWindowsUser?: () => Promise<{ username: string; domain?: string; displayName?: string; department?: string }>
    showNotification: (title: string, body: string) => Promise<void>
    minimizeToTray: () => Promise<void>
    setBadge: (count: number) => Promise<void>
    onLogout: (callback: () => void) => void
  }
}
