import { defineStore } from 'pinia'

import { TEAM, type TeamUser } from '@/data/claim'

export const ROLE_LABEL: Record<TeamUser['role'], string> = {
  manager: '片区负责人',
  inspector: '站员',
  viewer: '观察员',
}

export const useSessionStore = defineStore('session', {
  state: () => ({
    // 默认城东片区负责人：演示负责人派发、指派与当班路线改派。
    currentUserId: 'u1',
    shiftLabel: '白班 08:00-20:00',
    scope: '地质灾害隐患点监测防治管理系统',
  }),
  getters: {
    user(state): TeamUser {
      return TEAM.find((item) => item.id === state.currentUserId) ?? TEAM[0]
    },
    operator(): string {
      return this.user.name
    },
    role(): TeamUser['role'] {
      return this.user.role
    },
    area(): string | null {
      return this.user.area
    },
    canOperate(): boolean {
      return this.user.role !== 'viewer'
    },
    roleLabel(): string {
      return ROLE_LABEL[this.user.role]
    },
  },
  actions: {
    switchUser(id: string) {
      if (TEAM.some((item) => item.id === id)) {
        this.currentUserId = id
      }
    },
    setShift(label: string) {
      this.shiftLabel = label
    },
  },
})
