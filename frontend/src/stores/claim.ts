import { defineStore } from 'pinia'

import {
  AREA_LINEAGE,
  AREA_VERSION,
  HAZARD_POINTS,
  TEAM,
  buildClaimSeed,
  todayStr,
  type PatrolRoute,
  type RouteStatus,
  type SurveyItem,
  type TeamUser,
} from '@/data/claim'
import type { ActionResult } from '@/data/types'

const ROUTE_STORAGE_KEY = 'geohazard-monitor-prevention:claim-routes'
const SURVEY_STORAGE_KEY = 'geohazard-monitor-prevention:survey-items'

interface PersistShape {
  routes: PatrolRoute[]
  surveys: SurveyItem[]
  routeSeq: number
  surveySeq: number
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function nowStamp(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}+08:00`
}

function readStorage(): PersistShape {
  const seed = buildClaimSeed()
  const fallback: PersistShape = {
    routes: seed.routes,
    surveys: seed.surveys,
    routeSeq: seed.routes.reduce((max, r) => Math.max(max, r.id), 0),
    surveySeq: seed.surveys.reduce((max, s) => Math.max(max, s.id), 0),
  }
  if (typeof window === 'undefined' || !window.localStorage) {
    return fallback
  }
  const raw = window.localStorage.getItem(ROUTE_STORAGE_KEY)
  if (!raw) {
    persist(fallback)
    return fallback
  }
  try {
    const routes = JSON.parse(raw) as PatrolRoute[]
    const surveyRaw = window.localStorage.getItem(SURVEY_STORAGE_KEY)
    const surveys = surveyRaw ? (JSON.parse(surveyRaw) as SurveyItem[]) : seed.surveys
    return {
      routes,
      surveys,
      routeSeq: routes.reduce((max, r) => Math.max(max, r.id), 0),
      surveySeq: surveys.reduce((max, s) => Math.max(max, s.id), 0),
    }
  } catch {
    persist(fallback)
    return fallback
  }
}

function persist(shape: PersistShape): void {
  if (typeof window === 'undefined' || !window.localStorage) {
    return
  }
  window.localStorage.setItem(ROUTE_STORAGE_KEY, JSON.stringify(shape.routes))
  window.localStorage.setItem(SURVEY_STORAGE_KEY, JSON.stringify(shape.surveys))
}

/** 历史路线按派发时原片区解释；原片区更名后，映射到承袭片区做权限校验。 */
export function effectiveArea(route: Pick<PatrolRoute, 'areaSnapshot'>): string {
  return AREA_LINEAGE[route.areaSnapshot] ?? route.areaSnapshot
}

export interface DispatchInput {
  hazardCode: string
  routeName: string
  patrolDate: string
}

export interface SubmitInput {
  abnormal: boolean
  resultDesc: string
  measure: string
}

export const useClaimStore = defineStore('claim', {
  state: () => {
    const initial = readStorage()
    return {
      routes: initial.routes as PatrolRoute[],
      surveys: initial.surveys as SurveyItem[],
      routeSeq: initial.routeSeq,
      surveySeq: initial.surveySeq,
    }
  },
  getters: {
    team: () => TEAM,
    hazardPoints: () => HAZARD_POINTS,
  },
  actions: {
    flush() {
      persist({
        routes: this.routes,
        surveys: this.surveys,
        routeSeq: this.routeSeq,
        surveySeq: this.surveySeq,
      })
    },
    getRoute(id: number): PatrolRoute | undefined {
      return this.routes.find((r) => r.id === id)
    },
    listRoutes(filter: { patrolDate?: string; status?: string; scope?: 'all' | 'today' | 'history' }): PatrolRoute[] {
      let rows = [...this.routes]
      if (filter.scope === 'today') {
        rows = rows.filter((r) => !r.isHistory && r.patrolDate === todayStr())
      } else if (filter.scope === 'history') {
        rows = rows.filter((r) => r.isHistory)
      }
      if (filter.patrolDate) {
        rows = rows.filter((r) => r.patrolDate === filter.patrolDate)
      }
      if (filter.status) {
        rows = rows.filter((r) => r.status === filter.status)
      }
      return rows.sort((a, b) => (a.patrolDate === b.patrolDate ? a.id - b.id : a.patrolDate < b.patrolDate ? 1 : -1))
    },
    listSurveys(): SurveyItem[] {
      return [...this.surveys].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    },
    /** 观察员看全部；其余角色只看本片区路线（历史路线按承袭片区校验）。 */
    visibleTo(user: TeamUser): PatrolRoute[] {
      if (user.role === 'viewer' || user.area === null) {
        return this.routes
      }
      return this.routes.filter((r) => effectiveArea(r) === user.area)
    },
    canManageRoute(route: PatrolRoute, user: TeamUser): boolean {
      return user.role === 'manager' && user.area !== null && effectiveArea(route) === user.area
    },
    stats(user: TeamUser) {
      const visible = this.visibleTo(user)
      const today = todayStr()
      const todays = visible.filter((r) => !r.isHistory && r.patrolDate === today)
      const mine = todays.filter((r) => r.claimById === user.id)
      return {
        todayBatch: todays.length,
        pendingClaim: todays.filter((r) => r.status === '待领取').length,
        myOnDuty: mine.filter((r) => r.status === '已领取').length,
        abnormalPending: visible.filter((r) => r.status === '异常待踏勘').length,
      }
    },
    nextBatchNo(patrolDate: string): string {
      const day = patrolDate.replace(/-/g, '')
      const sameDay = this.routes
        .map((r) => r.batchNo)
        .filter((no) => no.startsWith(`BATCH-${day}-`))
        .map((no) => Number(no.slice(-2)))
        .filter((n) => Number.isFinite(n))
      const next = (sameDay.length ? Math.max(...sameDay) : 0) + 1
      return `BATCH-${day}-${String(next).padStart(2, '0')}`
    },
    /** 负责人按隐患点和巡查日期派发巡检批次：同批次可含多条路线，仅本片区隐患点。 */
    dispatchBatch(input: DispatchInput, user: TeamUser): ActionResult {
      if (user.role !== 'manager' || user.area === null) {
        return { ok: false, message: '越权拒绝：只有片区负责人能派发巡检批次。' }
      }
      const hazard = HAZARD_POINTS.find((h) => h.code === input.hazardCode)
      if (!hazard) {
        return { ok: false, message: '请选择隐患点。' }
      }
      if (hazard.area !== user.area) {
        return {
          ok: false,
          message: `越权拒绝：${hazard.name}属${hazard.area}，${user.area}负责人不能跨片区派发。`,
        }
      }
      const routeName = input.routeName.trim()
      if (!routeName) {
        return { ok: false, message: '请填写路线名称。' }
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(input.patrolDate)) {
        return { ok: false, message: '请选择巡查日期。' }
      }
      const batchNo = this.nextBatchNo(input.patrolDate)
      this.routeSeq += 1
      const route: PatrolRoute = {
        id: this.routeSeq,
        batchNo,
        hazardCode: hazard.code,
        hazardName: hazard.name,
        routeName,
        patrolDate: input.patrolDate,
        areaSnapshot: user.area,
        areaVersion: AREA_VERSION,
        isHistory: false,
        dispatchById: user.id,
        dispatchByName: user.name,
        dispatchedAt: nowStamp(),
        status: '待领取',
        assigned: false,
        claimById: null,
        claimByName: null,
        claimedAt: null,
        reassignLogs: [],
        completedById: null,
        completedByName: null,
        completedAt: null,
        abnormal: false,
        resultDesc: '',
        measure: '',
      }
      this.routes.push(route)
      this.flush()
      return { ok: true, message: `批次 ${batchNo} 已派发：${routeName}，等待本片区站员领取。` }
    },
    /** 站员领取路线：只能领辖区内、待领取的当班路线。负责人指派过的路线不能再抢。 */
    claimRoute(id: number, user: TeamUser, at?: string): ActionResult {
      if (user.role === 'viewer') {
        return { ok: false, message: '越权拒绝：观察员为只读账号，不能领取路线。' }
      }
      if (user.role !== 'inspector') {
        return { ok: false, message: '越权拒绝：负责人不参与领取，路线由站员认领。' }
      }
      const route = this.getRoute(id)
      if (!route) {
        return { ok: false, message: `没有找到编号为 ${id} 的路线。` }
      }
      if (user.area === null || effectiveArea(route) !== user.area) {
        return { ok: false, message: `越权拒绝：路线「${route.routeName}」属${effectiveArea(route)}，跨片区不能领取。` }
      }
      if (route.status === '待领取' && route.assigned) {
        return { ok: false, message: `该路线已由负责人指派给${route.claimByName ?? '其他站员'}，指派优先，不能再领取。` }
      }
      if (route.status !== '待领取') {
        return { ok: false, message: `路线已被${route.claimByName ?? '领取'}领取（${route.status}），先到先得，不能重复领取。` }
      }
      const claimedAt = at ?? nowStamp()
      this.mutateRoute(id, {
        status: '已领取',
        claimById: user.id,
        claimByName: user.name,
        claimedAt,
      })
      return { ok: true, message: `领取成功：路线「${route.routeName}」当班由 ${user.name} 负责。` }
    },
    /**
     * 并发模拟：同一路线两名站员同时领取。
     * 规则（先到先得）：以请求时间戳为准，时间戳相同按站员编号升序定序；
     * 负责人已指派的路线不走先到先得，其他人一律拒绝。
     */
    simulateConcurrentClaim(id: number, user: TeamUser): ActionResult {
      if (user.role === 'viewer') {
        return { ok: false, message: '越权拒绝：观察员不能发起领取演练。' }
      }
      const route = this.getRoute(id)
      if (!route) {
        return { ok: false, message: `没有找到编号为 ${id} 的路线。` }
      }
      if (user.area === null || effectiveArea(route) !== user.area) {
        return { ok: false, message: '越权拒绝：不能对其他片区的路线发起并发演练。' }
      }
      if (route.status !== '待领取' || route.assigned) {
        return { ok: false, message: '该路线不是可领取状态，无法演练并发领取。' }
      }
      const candidates = TEAM.filter(
        (u) => u.role === 'inspector' && u.area !== null && effectiveArea(route) === u.area,
      ).sort((a, b) => (a.id < b.id ? -1 : 1))
      if (candidates.length < 2) {
        return { ok: false, message: '本片区不足两名站员，无法模拟并发。' }
      }
      const sameMoment = `${route.patrolDate}T08:00:00+08:00`
      const winner = candidates[0]
      const loser = candidates[1]
      const winResult = this.claimRoute(id, winner, sameMoment)
      if (!winResult.ok) {
        return winResult
      }
      const loseResult = this.claimRoute(id, loser, sameMoment)
      return {
        ok: true,
        message: `同毫秒并发 → 先到先得：${winner.name}（${winner.id}）领取成功；${loser.name}（${loser.id}）${loseResult.message.replace('越权拒绝：', '')}`,
      }
    },
    /** 负责人指派：指派优先于先到先得；只有本片区负责人能改当班路线。 */
    assignRoute(id: number, targetUserId: string, user: TeamUser): ActionResult {
      const route = this.getRoute(id)
      if (!route) {
        return { ok: false, message: `没有找到编号为 ${id} 的路线。` }
      }
      if (user.role !== 'manager' || user.area === null) {
        return { ok: false, message: '越权拒绝：路线指派只能由片区负责人操作。' }
      }
      if (effectiveArea(route) !== user.area) {
        return { ok: false, message: `越权拒绝：路线属${effectiveArea(route)}，其他片区负责人不能改动。` }
      }
      if (route.isHistory) {
        return { ok: false, message: '历史路线按原片区归档解释，不得再指派或改动。' }
      }
      if (route.status === '已完成' || route.status === '异常待踏勘' || route.status === '已踏勘') {
        return { ok: false, message: `路线已由${route.claimByName ?? '站员'}完成，重复完成只留首次结果，不得改派。` }
      }
      const target = TEAM.find((u) => u.id === targetUserId)
      if (!target || target.role !== 'inspector') {
        return { ok: false, message: '请选择本片区站员作为指派人。' }
      }
      if (target.area === null || effectiveArea(route) !== target.area) {
        return { ok: false, message: `越权拒绝：${target.name}不属${effectiveArea(route)}，不能跨片区指派。` }
      }
      if (route.claimById === target.id && route.status === '已领取') {
        return { ok: false, message: `路线已由${target.name}当班，无需重复指派。` }
      }
      const logs = [...route.reassignLogs]
      if (route.claimById) {
        logs.push({
          at: nowStamp(),
          fromName: route.claimByName ?? route.claimById,
          toName: target.name,
          byName: user.name,
        })
      }
      this.mutateRoute(id, {
        status: '已领取',
        assigned: true,
        claimById: target.id,
        claimByName: target.name,
        claimedAt: route.claimedAt ?? nowStamp(),
        reassignLogs: logs,
        // 改派不抹除首次完成结果；未完成路线本来没有结果。
      })
      return {
        ok: true,
        message: logs.length
          ? `已改派：${logs[logs.length - 1].fromName} → ${target.name}（负责人 ${user.name} 指派优先）。`
          : `已指派：路线「${route.routeName}」锁定给 ${target.name}，其他站员不能再领取。`,
      }
    },
    /**
     * 提交巡检结果：只有领取本人能提交；重复完成只留首次结果；
     * 越权提交不得改变原路线。异常提交后在治理工程页生成踏勘事项（幂等）。
     */
    submitRoute(id: number, input: SubmitInput, user: TeamUser): ActionResult {
      const route = this.getRoute(id)
      if (!route) {
        return { ok: false, message: `没有找到编号为 ${id} 的路线。` }
      }
      if (user.role === 'viewer') {
        return { ok: false, message: '越权拒绝：观察员不能提交巡检结果，原路线保持不变。' }
      }
      if (user.area === null || effectiveArea(route) !== user.area) {
        return { ok: false, message: `越权拒绝：路线属${effectiveArea(route)}，跨片区提交被拒绝，原路线保持不变。` }
      }
      if (user.role === 'manager') {
        return { ok: false, message: '越权拒绝：负责人不能代站员完成任务，原路线保持不变。' }
      }
      if (route.claimById !== user.id) {
        return {
          ok: false,
          message: `越权拒绝：该路线当班人为${route.claimByName ?? '（未领取）'}，不能代他人完成，原路线保持不变。`,
        }
      }
      if (route.status !== '已领取') {
        return {
          ok: false,
          message: `重复完成只留首次结果：路线已是「${route.status}」，首次结果由${route.completedByName ?? route.claimByName}提交，本次提交不改变原路线。`,
        }
      }
      if (!input.resultDesc.trim()) {
        return { ok: false, message: '请填写巡检情况说明。' }
      }
      const nextStatus: RouteStatus = input.abnormal ? '异常待踏勘' : '已完成'
      this.mutateRoute(id, {
        status: nextStatus,
        abnormal: input.abnormal,
        resultDesc: input.resultDesc.trim(),
        measure: input.measure.trim(),
        completedById: user.id,
        completedByName: user.name,
        completedAt: nowStamp(),
      })
      let message = input.abnormal
        ? '异常已提交，治理工程页已生成踏勘事项。'
        : '巡检结果已提交，路线完成。'
      if (input.abnormal) {
        const surveyResult = this.ensureSurvey(id, user)
        if (!surveyResult.ok) {
          message = `异常已提交；踏勘事项未重复生成：${surveyResult.message}`
        }
      }
      return { ok: true, message }
    },
    /** 同一路线异常只生成一条踏勘事项：重复提交、重复回放都不新增。 */
    ensureSurvey(routeId: number, _user: TeamUser): ActionResult {
      const route = this.getRoute(routeId)
      if (!route) {
        return { ok: false, message: '来源路线不存在。' }
      }
      if (this.surveys.some((s) => s.sourceRouteId === route.id)) {
        return { ok: false, message: '踏勘事项已存在，只保留首次结果。' }
      }
      this.surveySeq += 1
      const item: SurveyItem = {
        id: this.surveySeq,
        itemNo: `SURV-${String(this.surveySeq).padStart(4, '0')}`,
        sourceRouteId: route.id,
        batchNo: route.batchNo,
        hazardCode: route.hazardCode,
        hazardName: route.hazardName,
        areaSnapshot: route.areaSnapshot,
        patrolDate: route.patrolDate,
        abnormalDesc: route.resultDesc,
        measure: route.measure,
        submittedByName: route.completedByName ?? route.claimByName ?? '',
        createdAt: route.completedAt ?? nowStamp(),
        status: '待踏勘',
        surveyConclusion: '',
        handledByName: null,
        handledAt: null,
      }
      this.surveys.push(item)
      this.flush()
      return { ok: true, message: '踏勘事项已生成。' }
    },
    /** 治理工程页登记踏勘结论：只读账号不可操作；不回改原巡检路线。 */
    completeSurvey(id: number, conclusion: string, user: TeamUser): ActionResult {
      if (user.role === 'viewer') {
        return { ok: false, message: '越权拒绝：观察员不能登记踏勘结论。' }
      }
      const index = this.surveys.findIndex((s) => s.id === id)
      if (index < 0) {
        return { ok: false, message: `没有找到编号为 ${id} 的踏勘事项。` }
      }
      const item = this.surveys[index]
      if (item.status === '已踏勘') {
        return { ok: false, message: '踏勘结论已登记，重复操作只保留首次结论。' }
      }
      if (!conclusion.trim()) {
        return { ok: false, message: '请填写踏勘结论。' }
      }
      this.surveys[index] = {
        ...item,
        status: '已踏勘',
        surveyConclusion: conclusion.trim(),
        handledByName: user.name,
        handledAt: nowStamp(),
      }
      // 路线同步收尾到「已踏勘」，但首次巡检结果保持不变。
      const route = this.getRoute(item.sourceRouteId)
      if (route && route.status === '异常待踏勘') {
        this.mutateRoute(route.id, { status: '已踏勘' })
      }
      this.flush()
      return { ok: true, message: `踏勘事项 ${item.itemNo} 已登记结论。` }
    },
    mutateRoute(id: number, patch: Partial<PatrolRoute>) {
      const index = this.routes.findIndex((r) => r.id === id)
      if (index >= 0) {
        this.routes[index] = { ...this.routes[index], ...patch }
        this.flush()
      }
    },
    resetDemo(): ActionResult {
      const seed = buildClaimSeed()
      this.routes = seed.routes
      this.surveys = seed.surveys
      this.routeSeq = seed.routes.reduce((max, r) => Math.max(max, r.id), 0)
      this.surveySeq = seed.surveys.reduce((max, s) => Math.max(max, s.id), 0)
      this.flush()
      return { ok: true, message: '认领台演示数据已重置。' }
    },
  },
})
