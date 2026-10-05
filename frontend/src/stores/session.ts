import { defineStore } from 'pinia'

import type { StaffRole } from '@/data/claim-desk'

export const useSessionStore = defineStore('session', {
  state: () => ({
    operator: '张伟',
    role: '站员' as StaffRole,
    area: '城东片区',
    shiftLabel: '白班 08:00-20:00',
    scope: '地质灾害隐患点监测防治管理系统',
  }),
  getters: {
    canOperate: (state) => state.operator.length > 0,
  },
  actions: {
    setShift(label: string) {
      this.shiftLabel = label
    },
    switchUser(member: { name: string; role: StaffRole; area: string }) {
      this.operator = member.name
      this.role = member.role
      this.area = member.area
    },
  },
})
