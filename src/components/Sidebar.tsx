import React, { useState, useMemo, useEffect } from 'react'
import {
  Search,
  ChevronDown,
  ChevronRight,
  FolderKanban,
  Star,
  Megaphone,
  MessageSquare,
} from 'lucide-react'
import type { User, Sector, PresenceStatus } from '../types'
import { apiService, sanitizeName, formatMessageTime } from '../services/apiService'
import { formatSectorName } from '../utils/formatters'

interface SidebarProps {
  users: User[]
  sectors: Sector[]
  activeUser: User | null
  onSelectUser: (user: User) => void
  currentUserId: number
  isBroadcastActive?: boolean
  onSelectBroadcast?: () => void
  broadcastUnreadCount?: number
}

interface SectorNode {
  sectorId: number | null
  sectorName: string
  sectorColor: string
  parent_id?: number | null
  users: User[]
  children: SectorNode[]
}

const presenceColors: Record<PresenceStatus, string> = {
  online: 'bg-emerald-500 shadow-emerald-500/50',
  away: 'bg-amber-500 shadow-amber-500/50',
  dnd: 'bg-rose-500 shadow-rose-500/50',
  offline: 'bg-slate-500 shadow-slate-500/50',
}

const presenceLabels: Record<PresenceStatus, string> = {
  online: 'Disponible',
  away: 'Ausente',
  dnd: 'Ocupado',
  offline: 'Desconectado',
}

const SectorTreeItem: React.FC<{
  node: SectorNode
  activeUser: User | null
  onSelectUser: (user: User) => void
  collapsedSectors: Record<string, boolean>
  toggleSector: (key: string) => void
  searchQuery: string
  level?: number
}> = ({
  node,
  activeUser,
  onSelectUser,
  collapsedSectors,
  toggleSector,
  searchQuery,
  level = 0,
}) => {
  const key = String(node.sectorId || 'unassigned')
  const isCollapsed = collapsedSectors[key]

  const getTotalUsersCount = (n: SectorNode): number => {
    return n.users.length + n.children.reduce((acc, c) => acc + getTotalUsersCount(c), 0)
  }

  const getTotalOnlineCount = (n: SectorNode): number => {
    return (
      n.users.filter((u) => u.presence !== 'offline').length +
      n.children.reduce((acc, c) => acc + getTotalOnlineCount(c), 0)
    )
  }

  const getTotalUnreadCount = (n: SectorNode): number => {
    return (
      n.users.reduce((acc, u) => acc + (u.unreadCount || 0), 0) +
      n.children.reduce((acc, c) => acc + getTotalUnreadCount(c), 0)
    )
  }

  const totalUsersInBranch = getTotalUsersCount(node)
  const totalOnlineInBranch = getTotalOnlineCount(node)
  const totalUnreadInBranch = getTotalUnreadCount(node)

  if (searchQuery && totalUsersInBranch === 0) return null

  return (
    <div
      className={`rounded-xl transition-all ${
        level === 0
          ? `bg-slate-950/40 border ${
              totalUnreadInBranch > 0
                ? 'border-blue-500/60 shadow-sm shadow-blue-500/10'
                : 'border-slate-800/60'
            } overflow-hidden mb-2`
          : 'mt-1.5'
      }`}
    >
      {/* Sector Header */}
      <button
        onClick={() => toggleSector(key)}
        style={{ paddingLeft: `${Math.max(12, level * 14 + 10)}px` }}
        className={`flex w-full items-center justify-between py-2.5 sm:py-2 pr-3 text-left text-xs font-semibold transition cursor-pointer ${
          level === 0
            ? 'text-slate-200 hover:bg-slate-800/60'
            : 'text-slate-300 hover:bg-slate-800/40 rounded-lg'
        }`}
      >
        <div className="flex items-center gap-2 truncate">
          {isCollapsed ? (
            <ChevronRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-slate-400 shrink-0" />
          )}
          <span
            className="h-2 w-2 rounded-full shrink-0"
            style={{ backgroundColor: node.sectorColor }}
          />
          <span className={`truncate ${totalUnreadInBranch > 0 ? 'text-white font-bold' : ''}`}>
            {node.sectorName}
          </span>
          {node.children.length > 0 && (
            <span className="rounded bg-slate-800/80 px-1 py-0.2 text-[9px] font-normal text-slate-400 shrink-0">
              {node.children.length} {node.children.length === 1 ? 'subsector' : 'subsectores'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0 ml-1">
          {totalUnreadInBranch > 0 && (
            <span
              title={`${totalUnreadInBranch} mensaje${totalUnreadInBranch > 1 ? 's' : ''} nuevo${totalUnreadInBranch > 1 ? 's' : ''} en este sector`}
              className="flex items-center gap-1 h-5 min-w-[20px] px-1.5 rounded-full bg-blue-600 text-[10px] font-bold text-white shadow-md shadow-blue-500/40 animate-pulse"
            >
              <MessageSquare className="h-2.5 w-2.5 fill-white shrink-0" />
              <span>{totalUnreadInBranch > 99 ? '99+' : totalUnreadInBranch}</span>
            </span>
          )}
          <span className="text-[11px] text-slate-500 font-normal">
            {totalOnlineInBranch}/{totalUsersInBranch}
          </span>
        </div>
      </button>

      {/* Expanded Content: Direct Users + Subsectors */}
      {!isCollapsed && (
        <div className={level === 0 ? 'px-1.5 pb-2 pt-0.5 space-y-1' : 'pl-1.5 space-y-1'}>
          {/* Direct Sector Users */}
          {node.users.map((user) => {
            const isActive = activeUser?.id === user.id

            const displayName = sanitizeName(user.display_name)

            return (
              <button
                key={user.id}
                onClick={() => onSelectUser(user)}
                title={`${displayName}${user.sector_short_path ? ` • ${user.sector_short_path}` : ''}`}
                style={{ paddingLeft: `${Math.max(10, level * 12 + 8)}px` }}
                className={`flex w-full items-center gap-3 rounded-lg py-2.5 sm:py-2 pr-2.5 min-h-[48px] active:scale-[0.99] text-left transition cursor-pointer ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                    : 'hover:bg-slate-800/70 text-slate-300'
                }`}
              >
                {/* Avatar with Status Dot */}
                <div className="relative shrink-0">
                  {user.avatar_url ? (
                    <img
                      src={
                        user.avatar_url.startsWith('http') || user.avatar_url.startsWith('data:')
                          ? user.avatar_url
                          : `${apiService.getServerUrl()}${user.avatar_url}`
                      }
                      alt={displayName}
                      className="h-9 w-9 rounded-lg object-cover border border-slate-700/50"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none'
                        const fallback = e.currentTarget.parentElement?.querySelector('.avatar-fallback') as HTMLElement
                        if (fallback) fallback.style.display = 'flex'
                      }}
                    />
                  ) : null}
                  <div
                    className={`avatar-fallback h-9 w-9 items-center justify-center rounded-lg font-bold text-xs ${
                      user.avatar_url ? 'hidden' : 'flex'
                    } ${
                      isActive ? 'bg-blue-700 text-white' : 'bg-slate-800 text-blue-400'
                    }`}
                  >
                    {displayName.charAt(0).toUpperCase()}
                  </div>
                  <span
                    className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-slate-900 ${
                      presenceColors[user.presence]
                    }`}
                    title={presenceLabels[user.presence]}
                  />
                </div>

                {/* User Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 truncate">
                      <span
                        className={`truncate text-xs ${
                          user.unreadCount && user.unreadCount > 0 && !isActive
                            ? 'font-bold text-white'
                            : 'font-semibold'
                        }`}
                      >
                        {displayName}
                      </span>
                      {user.is_leader && (
                        <span title="Encargado del Sector" className="inline-flex items-center">
                          <Star
                            className={`h-3 w-3 shrink-0 ${
                              isActive ? 'text-amber-200 fill-amber-300' : 'text-amber-400 fill-amber-400'
                            }`}
                          />
                        </span>
                      )}
                    </div>
                    {user.lastMessageTime && (
                      <span
                        className={`text-[10px] shrink-0 ml-1 ${
                          user.unreadCount && user.unreadCount > 0 && !isActive
                            ? 'text-blue-400 font-bold'
                            : isActive
                            ? 'text-blue-200'
                            : 'text-slate-500'
                        }`}
                      >
                        {formatMessageTime(user.lastMessageTime)}
                      </span>
                    )}
                  </div>

                  {searchQuery && user.sector_short_path && (
                    <p className="truncate text-[10px] text-blue-300/80 font-medium leading-tight">
                      {user.sector_short_path}
                    </p>
                  )}

                  <p
                    className={`truncate text-[11px] ${
                      user.unreadCount && user.unreadCount > 0 && !isActive
                        ? 'text-blue-200 font-medium'
                        : isActive
                        ? 'text-blue-100'
                        : 'text-slate-400'
                    }`}
                  >
                    {user.lastMessage || user.statusText || presenceLabels[user.presence]}
                  </p>
                </div>

                {/* Unread badge */}
                {user.unreadCount && user.unreadCount > 0 && !isActive ? (
                  <span className="flex items-center gap-1 h-5 min-w-[20px] px-1.5 shrink-0 justify-center rounded-full bg-blue-500 text-[10px] font-bold text-white shadow-md shadow-blue-500/30 animate-pulse">
                    <MessageSquare className="h-2.5 w-2.5 fill-white shrink-0" />
                    <span>{user.unreadCount > 99 ? '99+' : user.unreadCount}</span>
                  </span>
                ) : null}
              </button>
            )
          })}

          {/* Recursive Subsectors */}
          {node.children.map((childNode) => (
            <div key={childNode.sectorId} className="border-l border-slate-800/80 ml-2.5 pl-1">
              <SectorTreeItem
                node={childNode}
                activeUser={activeUser}
                onSelectUser={onSelectUser}
                collapsedSectors={collapsedSectors}
                toggleSector={toggleSector}
                searchQuery={searchQuery}
                level={level + 1}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export const Sidebar: React.FC<SidebarProps> = ({
  users,
  sectors,
  activeUser,
  onSelectUser,
  currentUserId,
  isBroadcastActive = false,
  onSelectBroadcast,
  broadcastUnreadCount = 0,
}) => {
  const [searchQuery, setSearchQuery] = useState('')
  const [collapsedSectors, setCollapsedSectors] = useState<Record<string, boolean>>({})

  const toggleSector = (sectorKey: string) => {
    setCollapsedSectors((prev) => ({
      ...prev,
      [sectorKey]: !prev[sectorKey],
    }))
  }

  // Auto-desplegar sectores y subsectores que contengan mensajes sin leer
  useEffect(() => {
    const unreadUsers = users.filter((u) => u.unreadCount && u.unreadCount > 0 && u.id !== currentUserId)
    if (unreadUsers.length === 0) return

    setCollapsedSectors((prev) => {
      let changed = false
      const next = { ...prev }
      for (const u of unreadUsers) {
        let sId: number | null | undefined = u.sector_id
        while (sId) {
          const key = String(sId)
          if (next[key] === true) {
            next[key] = false
            changed = true
          }
          const sec = sectors.find((s) => s.id === sId)
          sId = sec?.parent_id
        }
      }
      return changed ? next : prev
    })
  }, [users, sectors, currentUserId])

  // Filter and build tree of sectors & subsectors
  const sectorTree = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    const otherUsers = users.filter((u) => {
      if (u.id === currentUserId) return false
      const uname = (u.username || '').toLowerCase().trim()
      const dname = (u.display_name || '').toLowerCase().trim()
      if (uname === 'admin' || dname.includes('administrador del sistema') || dname.includes('administrador sistema')) {
        return false
      }
      return true
    })

    const filtered = otherUsers.filter((u) => {
      if (!q) return true
      return (
        u.display_name.toLowerCase().includes(q) ||
        u.username.toLowerCase().includes(q) ||
        (u.sector_name && u.sector_name.toLowerCase().includes(q)) ||
        (u.sector_full_path && u.sector_full_path.toLowerCase().includes(q))
      )
    })

    // 1. Create nodes map for all sectors
    const nodeMap = new Map<number, SectorNode>()
    for (const s of sectors) {
      nodeMap.set(s.id, {
        sectorId: s.id,
        sectorName: formatSectorName(s.name),
        sectorColor: s.color || '#3b82f6',
        parent_id: s.parent_id || null,
        users: [],
        children: [],
      })
    }

    // 2. Put matching users into sector nodes
    const unassignedUsers: User[] = []
    for (const u of filtered) {
      if (u.sector_id && nodeMap.has(u.sector_id)) {
        nodeMap.get(u.sector_id)!.users.push(u)
      } else {
        unassignedUsers.push(u)
      }
    }

    // 3. Sort users inside each node: Encargados (leaders) first, then presence, then name
    for (const node of nodeMap.values()) {
      node.users.sort((a, b) => {
        // Leader first
        if (Boolean(a.is_leader) !== Boolean(b.is_leader)) {
          return a.is_leader ? -1 : 1
        }
        const order: Record<PresenceStatus, number> = {
          online: 0,
          away: 1,
          dnd: 2,
          offline: 3,
        }
        if (order[a.presence] !== order[b.presence]) {
          return order[a.presence] - order[b.presence]
        }
        return a.display_name.localeCompare(b.display_name)
      })
    }

    // 4. Assemble tree (attach children to parents, collect roots)
    const rootNodes: SectorNode[] = []
    for (const node of nodeMap.values()) {
      if (node.parent_id && nodeMap.has(node.parent_id)) {
        nodeMap.get(node.parent_id)!.children.push(node)
      } else {
        rootNodes.push(node)
      }
    }

    // Sort subsectors alphabetically
    const sortSubsectors = (nodes: SectorNode[]) => {
      nodes.sort((a, b) => a.sectorName.localeCompare(b.sectorName))
      for (const n of nodes) {
        if (n.children.length > 0) sortSubsectors(n.children)
      }
    }
    sortSubsectors(rootNodes)

    // Add unassigned users if any
    if (unassignedUsers.length > 0) {
      rootNodes.push({
        sectorId: null,
        sectorName: 'Sin Sector Asignado',
        sectorColor: '#64748b',
        users: unassignedUsers,
        children: [],
      })
    }

    return rootNodes
  }, [users, sectors, searchQuery, currentUserId])

  const otherUsers = users.filter((u) => u.id !== currentUserId)
  const totalUsers = otherUsers.length
  const onlineUsers = otherUsers.filter((u) => u.presence !== 'offline').length

  return (
    <aside className="flex h-full w-full shrink-0 flex-col border-r border-slate-800 bg-slate-900/95">
      {/* Search Header */}
      <div className="shrink-0 p-4 border-b border-slate-800">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-slate-200 font-semibold text-sm">
            <FolderKanban className="h-4 w-4 text-blue-400" />
            <span>Sectores y Estructura</span>
          </div>
          <span className="text-xs font-medium text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full">
            {onlineUsers}/{totalUsers} en línea
          </span>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por usuario o sector..."
            className="w-full rounded-xl border border-slate-800 bg-slate-950/70 py-2 pr-4 pl-9 text-xs text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Pinned Broadcast Channel (Canal de Difusión e Información) */}
      {!searchQuery && (
        <div className="p-2 border-b border-slate-800/80 shrink-0">
          <button
            type="button"
            onClick={onSelectBroadcast}
            className={`flex w-full items-center gap-3 rounded-xl p-2.5 text-left transition cursor-pointer active:scale-[0.99] ${
              isBroadcastActive
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-600/30 ring-1 ring-blue-400/40'
                : broadcastUnreadCount > 0
                ? 'hover:bg-slate-800/80 text-slate-200 bg-slate-950/60 border border-rose-500/50 shadow-sm shadow-rose-500/10'
                : 'hover:bg-slate-800/80 text-slate-200 bg-slate-950/40 border border-slate-800/70'
            }`}
          >
            <div className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow-md ${
              isBroadcastActive
                ? 'bg-white/20'
                : 'bg-gradient-to-tr from-blue-500 to-indigo-600 shadow-indigo-500/20'
            }`}>
              <Megaphone className="h-5 w-5" />
              {broadcastUnreadCount > 0 && !isBroadcastActive && (
                <span className="absolute -top-1 -right-1 flex h-4.5 min-w-[18px] px-1 items-center justify-center rounded-full bg-rose-500 text-[10px] font-black text-white ring-2 ring-slate-900 shadow-sm animate-pulse">
                  {broadcastUnreadCount > 9 ? '9+' : broadcastUnreadCount}
                </span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-1">
                <span className={`font-bold text-xs truncate ${broadcastUnreadCount > 0 && !isBroadcastActive ? 'text-white' : ''}`}>
                  Avisos y Difusión
                </span>
                {broadcastUnreadCount > 0 && !isBroadcastActive && (
                  <span
                    title={`${broadcastUnreadCount} comunicado${broadcastUnreadCount > 1 ? 's' : ''} nuevo${broadcastUnreadCount > 1 ? 's' : ''}`}
                    className="flex h-5 min-w-[20px] px-1.5 shrink-0 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white shadow-md shadow-rose-500/30 animate-pulse"
                  >
                    {broadcastUnreadCount > 99 ? '99+' : broadcastUnreadCount}
                  </span>
                )}
              </div>
              <p className={`text-[11px] truncate leading-tight ${isBroadcastActive ? 'text-blue-100' : 'text-slate-400'}`}>
                Comunicados Institucionales
              </p>
            </div>
          </button>
        </div>
      )}

      {/* Sectors and User List (Tree) */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {sectorTree.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            {totalUsers === 0 ? 'Cargando usuarios...' : 'No se encontraron coincidencias.'}
          </div>
        ) : (
          sectorTree.map((rootNode) => (
            <SectorTreeItem
              key={rootNode.sectorId || 'unassigned'}
              node={rootNode}
              activeUser={activeUser}
              onSelectUser={onSelectUser}
              collapsedSectors={collapsedSectors}
              toggleSector={toggleSector}
              searchQuery={searchQuery}
              level={0}
            />
          ))
        )}
      </div>
    </aside>
  )
}
