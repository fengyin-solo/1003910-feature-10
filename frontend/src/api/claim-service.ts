import {
  HAZARD_AREAS,
  findStaff,
  listRoutes,
  nextBatchSeq,
  nextRouteId,
  padSeq,
  saveRoutes,
  type PatrolRoute,
} from '@/data/claim-desk'
import { listRows, saveRows } from '@/data/local-store'
import type { ActionResult, EntryRow } from '@/data/types'

// 认领台规则（与页面描述一致）：
// - 片区负责人按隐患点和巡查日期派发巡检批次，且只能就本片区隐患点派发；
// - 站员只能领取本辖区（同片区）路线，跨片区认领一律越权拒绝；
// - 同一路线两人同时领取时先到先得，先领取者锁定；负责人可指派或改派未办结路线；
// - 当班路线只能由认领人本人提交，代他人完成越权拒绝，且原路线不被改动；
// - 重复完成只保留首次结果；
// - 提交异常后，治理工程模块自动生成踏勘事项（待立项）。

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

export function today(): string {
  const now = new Date()
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`
}

function nowStamp(): string {
  const now = new Date()
  return `${today()} ${pad2(now.getHours())}:${pad2(now.getMinutes())}`
}

function deny(message: string): ActionResult {
  return { ok: false, message: `越权拒绝：${message}` }
}

export function dispatchBatch(
  actorName: string,
  input: { 隐患点编号: string; 巡查日期: string; 路线条数: number },
): ActionResult {
  const actor = findStaff(actorName)
  if (!actor) {
    return deny('当前用户不在人员名册里，不能派发批次')
  }
  if (actor.role !== '负责人') {
    return deny('只有片区负责人可以派发巡检批次')
  }
  const hazardArea = HAZARD_AREAS[input.隐患点编号]
  if (!hazardArea) {
    return { ok: false, message: `隐患点 ${input.隐患点编号} 未登记片区归属，不能派发` }
  }
  if (hazardArea !== actor.area) {
    return deny(`负责人只能就本片区（${actor.area}）隐患点派发，${input.隐患点编号} 现属${hazardArea}`)
  }
  if (!input.巡查日期) {
    return { ok: false, message: '请先选择巡查日期再派发批次' }
  }
  const count = Math.min(Math.max(Math.trunc(input.路线条数) || 1, 1), 9)
  const routes = listRoutes()
  const batchNo = `BATCH-${padSeq(nextBatchSeq(routes))}`
  const firstId = nextRouteId(routes)
  const created: PatrolRoute[] = []
  for (let index = 0; index < count; index += 1) {
    created.push({
      id: firstId + index,
      路线编号: `ROUT-${padSeq(firstId + index)}`,
      批次编号: batchNo,
      隐患点编号: input.隐患点编号,
      巡查日期: input.巡查日期,
      所属片区: actor.area, // 定格派发时的片区，历史路线按原片区解释
      状态: '待认领',
      认领人: '',
      认领时间: '',
      完成人: '',
      完成时间: '',
      巡查结果: '',
      派发人: actor.name,
    })
  }
  saveRoutes([...routes, ...created])
  return {
    ok: true,
    message: `批次 ${batchNo} 已派发：${input.隐患点编号} ${input.巡查日期}，共 ${count} 条路线待认领`,
  }
}

export function claimRoute(actorName: string, routeId: number): ActionResult {
  const actor = findStaff(actorName)
  if (!actor) {
    return deny('当前用户不在人员名册里，不能领取路线')
  }
  if (actor.role !== '站员') {
    return { ok: false, message: '负责人不走领取通道，请用指派把路线交给本片区站员' }
  }
  const routes = listRoutes()
  const route = routes.find((item) => item.id === routeId)
  if (!route) {
    return { ok: false, message: `没有找到编号为 ${routeId} 的路线` }
  }
  if (route.所属片区 !== actor.area) {
    return deny(`站员只能领取本辖区（${actor.area}）路线，${route.路线编号} 属${route.所属片区}`)
  }
  if (route.状态 === '已认领') {
    return {
      ok: false,
      message: `先到先得：${route.路线编号} 已被 ${route.认领人} 领取，可请本片区负责人协调改派`,
    }
  }
  if (route.状态 !== '待认领') {
    return { ok: false, message: `${route.路线编号} 已办结，不能重复领取` }
  }
  const updated: PatrolRoute = {
    ...route,
    状态: '已认领',
    认领人: actor.name,
    认领时间: nowStamp(),
  }
  saveRoutes(routes.map((item) => (item.id === routeId ? updated : item)))
  return {
    ok: true,
    message: `${actor.name} 已领取 ${route.路线编号}（${route.隐患点编号} ${route.巡查日期}）`,
  }
}

export function assignRoute(actorName: string, routeId: number, memberName: string): ActionResult {
  const actor = findStaff(actorName)
  if (!actor || actor.role !== '负责人') {
    return deny('只有片区负责人可以指派路线')
  }
  const routes = listRoutes()
  const route = routes.find((item) => item.id === routeId)
  if (!route) {
    return { ok: false, message: `没有找到编号为 ${routeId} 的路线` }
  }
  if (route.所属片区 !== actor.area) {
    return deny(`负责人只能指派本片区（${actor.area}）路线，${route.路线编号} 属${route.所属片区}`)
  }
  const member = findStaff(memberName)
  if (!member || member.role !== '站员' || member.area !== route.所属片区) {
    return deny(`只能指派给${route.所属片区}的在册站员，不能跨片区指派`)
  }
  if (route.状态 === '已完成' || route.状态 === '异常已上报') {
    return { ok: false, message: `${route.路线编号} 已办结，当班结果不能改动` }
  }
  const reassign = route.状态 === '已认领' && route.认领人 !== ''
  const previous = route.认领人
  const updated: PatrolRoute = {
    ...route,
    状态: '已认领',
    认领人: member.name,
    认领时间: nowStamp(),
  }
  saveRoutes(routes.map((item) => (item.id === routeId ? updated : item)))
  return {
    ok: true,
    message: reassign
      ? `${route.路线编号} 已由 ${previous} 改派给 ${member.name}`
      : `${route.路线编号} 已指派给 ${member.name}`,
  }
}

export type CompleteInput = {
  发现异常: boolean
  异常描述?: string
  处置措施?: string
}

export function completeRoute(actorName: string, routeId: number, input: CompleteInput): ActionResult {
  const routes = listRoutes()
  const route = routes.find((item) => item.id === routeId)
  if (!route) {
    return { ok: false, message: `没有找到编号为 ${routeId} 的路线` }
  }
  if (route.状态 === '已完成' || route.状态 === '异常已上报') {
    return {
      ok: false,
      message: `重复完成只留首次结果：${route.路线编号} 已由 ${route.完成人} 于 ${route.完成时间} 提交「${route.巡查结果}」，本次提交不覆盖`,
    }
  }
  if (route.状态 === '待认领') {
    return { ok: false, message: `${route.路线编号} 尚未认领，不能提交巡查结果` }
  }
  if (route.认领人 !== actorName) {
    // 越权提交不得改变原路线：这里直接返回，不写任何数据。
    return deny(`当班路线只能由认领人 ${route.认领人} 本人提交，${actorName} 不能代他人完成`)
  }
  if (input.发现异常 && !(input.异常描述 ?? '').trim()) {
    return { ok: false, message: '上报异常必须填写异常描述' }
  }
  const result = input.发现异常 ? `异常：${(input.异常描述 ?? '').trim()}` : '正常'
  const updated: PatrolRoute = {
    ...route,
    状态: input.发现异常 ? '异常已上报' : '已完成',
    完成人: actorName,
    完成时间: nowStamp(),
    巡查结果: result,
  }
  saveRoutes(routes.map((item) => (item.id === routeId ? updated : item)))
  appendPatrolRecord(updated, input)
  if (input.发现异常) {
    appendSurveyItem(updated)
    return { ok: true, message: `${route.路线编号} 异常已上报，治理工程已生成踏勘事项` }
  }
  return { ok: true, message: `${route.路线编号} 巡查完成，结果：正常` }
}

// 路线办结后同步生成一条巡查记录，巡查排查列表里能直接看到。
function appendPatrolRecord(route: PatrolRoute, input: CompleteInput): void {
  const rows = listRows('patrol')
  const id = rows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1
  const status = input.发现异常 ? '发现异常' : '已巡查'
  const record: EntryRow = {
    id,
    status,
    pending: true,
    abnormal: input.发现异常,
    巡查编号: `PATR-${padSeq(id)}`,
    隐患点编号: route.隐患点编号,
    巡查日期: route.巡查日期,
    巡查人员: route.完成人,
    巡查范围: `${route.所属片区}·${route.路线编号}`,
    发现异常: input.发现异常 ? (input.异常描述 ?? '').trim() : '无',
    处置措施: (input.处置措施 ?? '').trim() || (input.发现异常 ? '已上报，待踏勘' : '无需处置'),
    巡查状态: status,
  }
  saveRows('patrol', [...rows, record])
}

// 异常上报后，治理工程页自动生成踏勘事项（待立项）。
function appendSurveyItem(route: PatrolRoute): void {
  const rows = listRows('engineering')
  const id = rows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1
  const item: EntryRow = {
    id,
    status: '待立项',
    pending: true,
    abnormal: true,
    项目编号: `SURV-${padSeq(id)}`,
    隐患点编号: route.隐患点编号,
    治理方案: `巡查异常踏勘（${route.路线编号}：${route.巡查结果}）`,
    承建方: '待定',
    合同金额: 0,
    开工日期: '',
    计划工期: '踏勘后确定',
    项目状态: '待立项',
  }
  saveRows('engineering', [...rows, item])
}
