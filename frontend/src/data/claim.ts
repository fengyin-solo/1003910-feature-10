/** 路线认领台领域模型：巡检批次派发、辖区认领、当班路线与踏勘事项。 */

export type UserRole = 'manager' | 'inspector' | 'viewer'

export interface TeamUser {
  id: string
  name: string
  role: UserRole
  /** 负责人、站员有所属片区；观察员等只读账号没有辖区。 */
  area: string | null
  title: string
}

/** 隐患点：派发批次时只能选本辖区隐患点。 */
export interface HazardPoint {
  code: string
  name: string
  area: string
  disasterType: string
}

export type RouteStatus = '待领取' | '已领取' | '已完成' | '异常待踏勘' | '已踏勘'

export interface ReassignLog {
  at: string
  fromName: string
  toName: string
  byName: string
}

export interface PatrolRoute {
  id: number
  batchNo: string
  hazardCode: string
  hazardName: string
  routeName: string
  patrolDate: string
  /** 派发时的片区快照：历史路线永远按派发时原片区解释，不受后续区划调整影响。 */
  areaSnapshot: string
  areaVersion: string
  isHistory: boolean
  dispatchById: string
  dispatchByName: string
  dispatchedAt: string
  status: RouteStatus
  /** 负责人指派的路线：指派优先于先到先得。 */
  assigned: boolean
  claimById: string | null
  claimByName: string | null
  claimedAt: string | null
  reassignLogs: ReassignLog[]
  completedById: string | null
  completedByName: string | null
  completedAt: string | null
  abnormal: boolean
  resultDesc: string
  measure: string
}

export type SurveyStatus = '待踏勘' | '已踏勘'

export interface SurveyItem {
  id: number
  itemNo: string
  /** 来源路线：同一路线只生成一条踏勘事项（幂等）。 */
  sourceRouteId: number
  batchNo: string
  hazardCode: string
  hazardName: string
  areaSnapshot: string
  patrolDate: string
  abnormalDesc: string
  measure: string
  submittedByName: string
  createdAt: string
  status: SurveyStatus
  surveyConclusion: string
  handledByName: string | null
  handledAt: string | null
}

export const AREA_VERSION = '2026-区划'

/** 历史片区名 → 现行片区承袭关系。历史路线按原片区解释，原片区更名后映射到承袭片区。 */
export const AREA_LINEAGE: Record<string, string> = {
  '城东片区（2024年区划）': '城东片区',
  '城西片区（2024年区划）': '城西片区',
}

export const TEAM: TeamUser[] = [
  { id: 'u1', name: '王建国', role: 'manager', area: '城东片区', title: '城东片区负责人' },
  { id: 'u2', name: '李志强', role: 'inspector', area: '城东片区', title: '城东片区站员' },
  { id: 'u3', name: '赵敏', role: 'inspector', area: '城东片区', title: '城东片区站员' },
  { id: 'u4', name: '陈丽华', role: 'manager', area: '城西片区', title: '城西片区负责人' },
  { id: 'u5', name: '孙浩', role: 'inspector', area: '城西片区', title: '城西片区站员' },
  { id: 'u7', name: '吴晓燕', role: 'inspector', area: '城西片区', title: '城西片区站员' },
  { id: 'u6', name: '周明', role: 'viewer', area: null, title: '观察员（只读）' },
]

export const HAZARD_POINTS: HazardPoint[] = [
  { code: 'HAZA-C01', name: '城东后山滑坡', area: '城东片区', disasterType: '滑坡' },
  { code: 'HAZA-C02', name: '青龙沟泥石流', area: '城东片区', disasterType: '泥石流' },
  { code: 'HAZA-C03', name: '望江崖危岩体', area: '城东片区', disasterType: '危岩' },
  { code: 'HAZA-W01', name: '石门坎滑坡', area: '城西片区', disasterType: '滑坡' },
  { code: 'HAZA-W02', name: '白水河泥石流', area: '城西片区', disasterType: '泥石流' },
]

export function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

/** 认领台示例数据：今日两个片区各派发一批，另保留两条历史路线用于验证「原片区解释」。 */
export function buildClaimSeed(): { routes: PatrolRoute[]; surveys: SurveyItem[] } {
  const today = todayStr()
  const stamp = (h: string, m: string) => `${today}T${h}:${m}:00+08:00`

  const routes: PatrolRoute[] = [
    {
      id: 1,
      batchNo: `BATCH-${today.replace(/-/g, '')}-01`,
      hazardCode: 'HAZA-C01',
      hazardName: '城东后山滑坡',
      routeName: '城东后山村环线',
      patrolDate: today,
      areaSnapshot: '城东片区',
      areaVersion: AREA_VERSION,
      isHistory: false,
      dispatchById: 'u1',
      dispatchByName: '王建国',
      dispatchedAt: stamp('07', '30'),
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
    },
    {
      id: 2,
      batchNo: `BATCH-${today.replace(/-/g, '')}-01`,
      hazardCode: 'HAZA-C02',
      hazardName: '青龙沟泥石流',
      routeName: '青龙沟左岸巡线',
      patrolDate: today,
      areaSnapshot: '城东片区',
      areaVersion: AREA_VERSION,
      isHistory: false,
      dispatchById: 'u1',
      dispatchByName: '王建国',
      dispatchedAt: stamp('07', '30'),
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
    },
    {
      id: 3,
      batchNo: `BATCH-${today.replace(/-/g, '')}-01`,
      hazardCode: 'HAZA-C03',
      hazardName: '望江崖危岩体',
      routeName: '望江崖巡护步道线',
      patrolDate: today,
      areaSnapshot: '城东片区',
      areaVersion: AREA_VERSION,
      isHistory: false,
      dispatchById: 'u1',
      dispatchByName: '王建国',
      dispatchedAt: stamp('07', '32'),
      status: '已领取',
      assigned: true,
      claimById: 'u3',
      claimByName: '赵敏',
      claimedAt: stamp('07', '45'),
      reassignLogs: [],
      completedById: null,
      completedByName: null,
      completedAt: null,
      abnormal: false,
      resultDesc: '',
      measure: '',
    },
    {
      id: 4,
      batchNo: `BATCH-${today.replace(/-/g, '')}-01`,
      hazardCode: 'HAZA-C01',
      hazardName: '城东后山滑坡',
      routeName: '城东中学后侧切坡线',
      patrolDate: today,
      areaSnapshot: '城东片区',
      areaVersion: AREA_VERSION,
      isHistory: false,
      dispatchById: 'u1',
      dispatchByName: '王建国',
      dispatchedAt: stamp('07', '32'),
      status: '已领取',
      assigned: false,
      claimById: 'u2',
      claimByName: '李志强',
      claimedAt: stamp('08', '10'),
      reassignLogs: [],
      completedById: null,
      completedByName: null,
      completedAt: null,
      abnormal: false,
      resultDesc: '',
      measure: '',
    },
  ]

  routes.push(
    {
      id: 5,
      batchNo: `BATCH-${today.replace(/-/g, '')}-02`,
      hazardCode: 'HAZA-W01',
      hazardName: '石门坎滑坡',
      routeName: '石门坎村道沿线',
      patrolDate: today,
      areaSnapshot: '城西片区',
      areaVersion: AREA_VERSION,
      isHistory: false,
      dispatchById: 'u4',
      dispatchByName: '陈丽华',
      dispatchedAt: stamp('07', '40'),
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
    },
    {
      id: 6,
      batchNo: `BATCH-${today.replace(/-/g, '')}-02`,
      hazardCode: 'HAZA-W02',
      hazardName: '白水河泥石流',
      routeName: '白水河左岸线',
      patrolDate: today,
      areaSnapshot: '城西片区',
      areaVersion: AREA_VERSION,
      isHistory: false,
      dispatchById: 'u4',
      dispatchByName: '陈丽华',
      dispatchedAt: stamp('07', '40'),
      status: '已领取',
      assigned: false,
      claimById: 'u5',
      claimByName: '孙浩',
      claimedAt: stamp('07', '55'),
      reassignLogs: [],
      completedById: null,
      completedByName: null,
      completedAt: null,
      abnormal: false,
      resultDesc: '',
      measure: '',
    },
    {
      id: 7,
      batchNo: 'BATCH-20240720-01',
      hazardCode: 'HAZA-C01',
      hazardName: '城东后山滑坡',
      routeName: '城东后山老村道线（旧线）',
      patrolDate: '2024-07-20',
      areaSnapshot: '城东片区（2024年区划）',
      areaVersion: '2024-区划',
      isHistory: true,
      dispatchById: 'x-old-mgr',
      dispatchByName: '高守业（时任城东负责人）',
      dispatchedAt: '2024-07-20T07:30:00+08:00',
      status: '已完成',
      assigned: false,
      claimById: 'x-old-staff',
      claimByName: '张广田（时任站员）',
      claimedAt: '2024-07-20T08:00:00+08:00',
      reassignLogs: [],
      completedById: 'x-old-staff',
      completedByName: '张广田（时任站员）',
      completedAt: '2024-07-20T10:12:00+08:00',
      abnormal: false,
      resultDesc: '坡体无新增变形，排水沟畅通，未见异常。',
      measure: '例行巡查，现场提醒住户雨季注意避让。',
    },
  )

  const surveys: SurveyItem[] = [
    {
      id: 1,
      itemNo: 'SURV-0001',
      sourceRouteId: 8,
      batchNo: 'BATCH-20240815-01',
      hazardCode: 'HAZA-C02',
      hazardName: '青龙沟泥石流',
      areaSnapshot: '城东片区（2024年区划）',
      patrolDate: '2024-08-15',
      abnormalDesc: '沟口新增堆积扇，松散物源约 800 立方米，需现场踏勘确定治理方案。',
      measure: '临时设置警戒牌，雨时封堵沟口通道。',
      submittedByName: '张广田（时任站员）',
      createdAt: '2024-08-15T11:05:00+08:00',
      status: '已踏勘',
      surveyConclusion: '踏勘后纳入治理工程：修建谷坊坝 1 座、排导槽 120 米。',
      handledByName: '地质工程股',
      handledAt: '2024-08-20T16:00:00+08:00',
    },
    {
      id: 2,
      itemNo: 'SURV-0002',
      sourceRouteId: 9,
      batchNo: 'BATCH-20261004-01',
      hazardCode: 'HAZA-W01',
      hazardName: '石门坎滑坡',
      areaSnapshot: '城西片区',
      patrolDate: '2026-10-04',
      abnormalDesc: '滑坡后缘裂缝较上月加宽约 2 厘米，前缘民居墙面出现斜裂缝。',
      measure: '加密监测频次，雨前组织 2 户住户投亲靠友避让。',
      submittedByName: '孙浩',
      createdAt: '2026-10-04T10:24:00+08:00',
      status: '待踏勘',
      surveyConclusion: '',
      handledByName: null,
      handledAt: null,
    },
  ]

  // 历史异常路线 R8：与 SURV-0001 对应；R9 与待踏勘的 SURV-0002 对应。
  routes.push(
    {
      id: 8,
      batchNo: 'BATCH-20240815-01',
      hazardCode: 'HAZA-C02',
      hazardName: '青龙沟泥石流',
      routeName: '青龙沟沟口线（旧线）',
      patrolDate: '2024-08-15',
      areaSnapshot: '城东片区（2024年区划）',
      areaVersion: '2024-区划',
      isHistory: true,
      dispatchById: 'x-old-mgr',
      dispatchByName: '高守业（时任城东负责人）',
      dispatchedAt: '2024-08-15T07:30:00+08:00',
      status: '已踏勘',
      assigned: false,
      claimById: 'x-old-staff',
      claimByName: '张广田（时任站员）',
      claimedAt: '2024-08-15T07:50:00+08:00',
      reassignLogs: [],
      completedById: 'x-old-staff',
      completedByName: '张广田（时任站员）',
      completedAt: '2024-08-15T11:05:00+08:00',
      abnormal: true,
      resultDesc: '沟口新增堆积扇，松散物源约 800 立方米。',
      measure: '临时设置警戒牌，雨时封堵沟口通道。',
    },
    {
      id: 9,
      batchNo: 'BATCH-20261004-01',
      hazardCode: 'HAZA-W01',
      hazardName: '石门坎滑坡',
      routeName: '石门坎后缘民居线',
      patrolDate: '2026-10-04',
      areaSnapshot: '城西片区',
      areaVersion: AREA_VERSION,
      isHistory: false,
      dispatchById: 'u4',
      dispatchByName: '陈丽华',
      dispatchedAt: '2026-10-04T07:35:00+08:00',
      status: '异常待踏勘',
      assigned: false,
      claimById: 'u5',
      claimByName: '孙浩',
      claimedAt: '2026-10-04T07:58:00+08:00',
      reassignLogs: [],
      completedById: 'u5',
      completedByName: '孙浩',
      completedAt: '2026-10-04T10:24:00+08:00',
      abnormal: true,
      resultDesc: '滑坡后缘裂缝较上月加宽约 2 厘米，前缘民居墙面出现斜裂缝。',
      measure: '加密监测频次，雨前组织 2 户住户投亲靠友避让。',
    },
  )

  return { routes, surveys }
}
