// 巡查路线认领台的数据层：片区、人员名册、路线台账与 localStorage 持久化。
// 派发、领取、越权校验等业务规则集中在 api/claim-service.ts，这里只管数据。

export type StaffRole = '负责人' | '站员'

export type StaffMember = {
  name: string
  role: StaffRole
  area: string // 所属片区
}

export type RouteStatus = '待认领' | '已认领' | '已完成' | '异常已上报'

export type PatrolRoute = {
  id: number
  路线编号: string
  批次编号: string
  隐患点编号: string
  巡查日期: string
  // 派发时定格的片区快照：此后隐患点划片调整不回改路线，历史路线仍按原片区解释。
  所属片区: string
  状态: RouteStatus
  认领人: string
  认领时间: string
  完成人: string
  完成时间: string
  巡查结果: string
  派发人: string
}

export const AREAS: string[] = ['城东片区', '城西片区', '北山片区']

export const STAFF: StaffMember[] = [
  { name: '王建国', role: '负责人', area: '城东片区' },
  { name: '李秀兰', role: '负责人', area: '城西片区' },
  { name: '周文斌', role: '负责人', area: '北山片区' },
  { name: '张伟', role: '站员', area: '城东片区' },
  { name: '刘洋', role: '站员', area: '城东片区' },
  { name: '陈静', role: '站员', area: '城西片区' },
  { name: '赵磊', role: '站员', area: '城西片区' },
  { name: '孙倩', role: '站员', area: '北山片区' },
]

// 隐患点的现行片区归属。注意 HAZA-0007 现行归属城西片区，
// 而种子路线 ROUT-0006 是划片调整前派发的，仍按路线上定格的城东片区解释。
export const HAZARD_AREAS: Record<string, string> = {
  'HAZA-0001': '城东片区',
  'HAZA-0002': '城东片区',
  'HAZA-0003': '城东片区',
  'HAZA-0004': '城西片区',
  'HAZA-0005': '城西片区',
  'HAZA-0006': '城西片区',
  'HAZA-0007': '城西片区',
  'HAZA-0008': '北山片区',
  'HAZA-0009': '北山片区',
}

const SEED_ROUTES: PatrolRoute[] = [
  {
    id: 1,
    路线编号: 'ROUT-0001',
    批次编号: 'BATCH-0001',
    隐患点编号: 'HAZA-0001',
    巡查日期: '2026-10-06',
    所属片区: '城东片区',
    状态: '待认领',
    认领人: '',
    认领时间: '',
    完成人: '',
    完成时间: '',
    巡查结果: '',
    派发人: '王建国',
  },
  {
    id: 2,
    路线编号: 'ROUT-0002',
    批次编号: 'BATCH-0001',
    隐患点编号: 'HAZA-0002',
    巡查日期: '2026-10-06',
    所属片区: '城东片区',
    状态: '待认领',
    认领人: '',
    认领时间: '',
    完成人: '',
    完成时间: '',
    巡查结果: '',
    派发人: '王建国',
  },
  {
    id: 3,
    路线编号: 'ROUT-0003',
    批次编号: 'BATCH-0002',
    隐患点编号: 'HAZA-0001',
    巡查日期: '2026-10-04',
    所属片区: '城东片区',
    状态: '已认领',
    认领人: '刘洋',
    认领时间: '2026-10-04 08:10',
    完成人: '',
    完成时间: '',
    巡查结果: '',
    派发人: '王建国',
  },
  {
    id: 4,
    路线编号: 'ROUT-0004',
    批次编号: 'BATCH-0003',
    隐患点编号: 'HAZA-0005',
    巡查日期: '2026-10-06',
    所属片区: '城西片区',
    状态: '待认领',
    认领人: '',
    认领时间: '',
    完成人: '',
    完成时间: '',
    巡查结果: '',
    派发人: '李秀兰',
  },
  {
    id: 5,
    路线编号: 'ROUT-0005',
    批次编号: 'BATCH-0004',
    隐患点编号: 'HAZA-0004',
    巡查日期: '2026-10-02',
    所属片区: '城西片区',
    状态: '已完成',
    认领人: '陈静',
    认领时间: '2026-10-02 08:20',
    完成人: '陈静',
    完成时间: '2026-10-02 11:05',
    巡查结果: '正常',
    派发人: '李秀兰',
  },
  {
    // 历史路线：HAZA-0007 现行归属城西片区，本路线在划片调整前由城东负责人派发，
    // 认领与提交仍按路线上定格的城东片区解释。
    id: 6,
    路线编号: 'ROUT-0006',
    批次编号: 'BATCH-0005',
    隐患点编号: 'HAZA-0007',
    巡查日期: '2026-10-05',
    所属片区: '城东片区',
    状态: '待认领',
    认领人: '',
    认领时间: '',
    完成人: '',
    完成时间: '',
    巡查结果: '',
    派发人: '王建国',
  },
  {
    id: 7,
    路线编号: 'ROUT-0007',
    批次编号: 'BATCH-0006',
    隐患点编号: 'HAZA-0008',
    巡查日期: '2026-10-06',
    所属片区: '北山片区',
    状态: '待认领',
    认领人: '',
    认领时间: '',
    完成人: '',
    完成时间: '',
    巡查结果: '',
    派发人: '周文斌',
  },
]

const STORAGE_KEY = 'geohazard-monitor-prevention:patrol-routes'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function readStorage(): PatrolRoute[] {
  const fallback = clone(SEED_ROUTES)
  if (typeof window === 'undefined' || !window.localStorage) {
    return fallback
  }
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback))
    return fallback
  }
  try {
    return JSON.parse(raw) as PatrolRoute[]
  } catch {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback))
    return fallback
  }
}

let cache: PatrolRoute[] | null = null

export function listRoutes(): PatrolRoute[] {
  if (cache === null) {
    cache = readStorage()
  }
  return cache
}

export function saveRoutes(routes: PatrolRoute[]): void {
  cache = routes
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(routes))
  }
}

export function resetRoutes(): PatrolRoute[] {
  const routes = clone(SEED_ROUTES)
  saveRoutes(routes)
  return routes
}

export function findStaff(name: string): StaffMember | undefined {
  return STAFF.find((member) => member.name === name)
}

export function membersOfArea(area: string): StaffMember[] {
  return STAFF.filter((member) => member.role === '站员' && member.area === area)
}

export function nextRouteId(routes: PatrolRoute[]): number {
  return routes.reduce((max, route) => Math.max(max, route.id), 0) + 1
}

export function nextBatchSeq(routes: PatrolRoute[]): number {
  return (
    routes.reduce((max, route) => {
      const seq = Number(route.批次编号.replace('BATCH-', '')) || 0
      return Math.max(max, seq)
    }, 0) + 1
  )
}

export function padSeq(value: number): string {
  return String(value).padStart(4, '0')
}
