import { createPinia, setActivePinia } from 'pinia'
import { useClaimStore } from '../src/stores/claim'
import { TEAM, todayStr } from '../src/data/claim'

// ---- 浏览器环境 shim ----
const mem = new Map<string, string>()
globalThis.window = {
  localStorage: {
    getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  },
} as unknown as Window & typeof globalThis

const u = Object.fromEntries(TEAM.map((t) => [t.name, t])) as Record<string, (typeof TEAM)[number]>
const today = todayStr()

let pass = 0
let fail = 0
function check(label: string, cond: boolean, detail = '') {
  if (cond) {
    pass += 1
    console.log(`  ✅ ${label}`)
  } else {
    fail += 1
    console.log(`  ❌ ${label} ${detail}`)
  }
}

setActivePinia(createPinia())
const store = useClaimStore()

console.log('1) 派发：仅本片区负责人、本片区隐患点')
check('城东负责人派发城东隐患点 -> 成功', store.dispatchBatch({ hazardCode: 'HAZA-C01', routeName: '测试路线A', patrolDate: today }, u['王建国']).ok)
check('城西负责人派发城东隐患点 -> 越权拒绝', !store.dispatchBatch({ hazardCode: 'HAZA-C01', routeName: '越权线', patrolDate: today }, u['陈丽华']).ok)
check('站员派发 -> 越权拒绝', !store.dispatchBatch({ hazardCode: 'HAZA-C01', routeName: '站员线', patrolDate: today }, u['李志强']).ok)
check('观察员派发 -> 越权拒绝', !store.dispatchBatch({ hazardCode: 'HAZA-C01', routeName: '观察线', patrolDate: today }, u['周明']).ok)

console.log('2) 领取：辖区限制、先到先得、指派优先')
const newRoute = store.routes.find((r) => r.routeName === '测试路线A')!
check('本片区站员可领取', store.claimRoute(newRoute.id, u['李志强']).ok)
check('重复领取（同片区另一站员）-> 拒绝', !store.claimRoute(newRoute.id, u['赵敏']).ok)
check('跨片区站员领取 -> 越权拒绝', !store.claimRoute(1, u['孙浩']).ok)
check('负责人领取 -> 拒绝', !store.claimRoute(1, u['王建国']).ok)
check('观察员领取 -> 拒绝', !store.claimRoute(1, u['周明']).ok)

console.log('3) 并发：两人同时领取 -> 先到先得（同时间按编号）')
const race = store.simulateConcurrentClaim(2, u['李志强'])
check('并发演练成功执行', race.ok, race.message)
const r2 = store.getRoute(2)!
check('路线2 由编号更小的 u2 李志强 获得', r2.claimById === 'u2', `实际：${r2.claimById}`)
check('同时间另一人赵敏领取失败', !store.claimRoute(2, u['赵敏']).ok)

console.log('4) 指派：本片区负责人可指派/改派；他人无权改')
check('城东负责人可把已领取的路线4改派给赵敏', store.assignRoute(4, 'u3', u['王建国']).ok)
const r4 = store.getRoute(4)!
check('改派后当班人=赵敏', r4.claimById === 'u3')
check('改派留痕 1 条', r4.reassignLogs.length === 1)
check('城西负责人改派城东路线 -> 越权拒绝', !store.assignRoute(4, 'u5', u['陈丽华']).ok)
check('站员指派 -> 越权拒绝', !store.assignRoute(4, 'u2', u['李志强']).ok)
check('不能跨片区指派站员', !store.assignRoute(5, 'u2', u['陈丽华']).ok)

console.log('5) 提交：本人才能提交；代劳/跨片区越权；重复只留首次')
check('非当班人李志强代提交 -> 越权拒绝', !store.submitRoute(4, { abnormal: false, resultDesc: '代做', measure: '' }, u['李志强']).ok)
check('城西站员跨片区提交城东路线 -> 越权拒绝', !store.submitRoute(4, { abnormal: false, resultDesc: '跨片区', measure: '' }, u['孙浩']).ok)
check('负责人代提交 -> 越权拒绝', !store.submitRoute(4, { abnormal: false, resultDesc: '负责人代做', measure: '' }, u['王建国']).ok)
check('观察员提交 -> 越权拒绝', !store.submitRoute(4, { abnormal: false, resultDesc: '观察', measure: '' }, u['周明']).ok)
check('当班人赵敏正常提交 -> 成功', store.submitRoute(4, { abnormal: false, resultDesc: '一切正常', measure: '保持监测' }, u['赵敏']).ok)
const before = store.getRoute(4)!
check('首次结果保留', before.resultDesc === '一切正常')
check('重复完成 -> 拒绝且结果不变', !store.submitRoute(4, { abnormal: true, resultDesc: '试图覆盖', measure: 'x' }, u['赵敏']).ok)
check('原路线未被重复提交改变', store.getRoute(4)!.resultDesc === '一切正常' && store.getRoute(4)!.status === '已完成')
check('越权提交后踏勘事项不因路线4产生', !store.surveys.some((s) => s.sourceRouteId === 4))

console.log('6) 异常提交 -> 生成踏勘事项（幂等）')
// 路线6：孙浩已领取（城西），提交异常
const surveysBefore = store.surveys.length
check('孙浩提交异常 -> 成功', store.submitRoute(6, { abnormal: true, resultDesc: '发现新裂缝约3cm', measure: '拉警戒线' }, u['孙浩']).ok)
check('踏勘事项 +1', store.surveys.length === surveysBefore + 1)
const survey = store.surveys.find((s) => s.sourceRouteId === 6)!
check('踏勘事项内容来自异常提交', survey.abnormalDesc === '发现新裂缝约3cm' && survey.status === '待踏勘')
check('重复异常提交被拒且踏勘事项不重复', !store.submitRoute(6, { abnormal: true, resultDesc: '第二次', measure: '' }, u['孙浩']).ok)
check('踏勘事项仍只有 1 条（路线6）', store.surveys.filter((s) => s.sourceRouteId === 6).length === 1)

console.log('7) 踏勘结论登记')
check('观察员不能登记结论', !store.completeSurvey(survey.id, '建议立项', u['周明']).ok)
check('站员可登记结论', store.completeSurvey(survey.id, '建议修建抗滑桩', u['孙浩']).ok)
check('重复登记 -> 拒绝', !store.completeSurvey(survey.id, '覆盖结论', u['孙浩']).ok)
check('路线6 状态推进到已踏勘，首次结果不变', store.getRoute(6)!.status === '已踏勘' && store.getRoute(6)!.resultDesc === '发现新裂缝约3cm')

console.log('8) 历史路线按原片区解释')
const h1 = store.getRoute(7)!
check('2024旧城东路线对城东站员可见', store.visibleTo(u['李志强']).some((r) => r.id === 7))
check('2024旧城东路线对城西站员不可见', !store.visibleTo(u['孙浩']).some((r) => r.id === 7))
check('历史路线不能再指派', !store.assignRoute(7, 'u2', u['王建国']).ok)
check('历史路线首次完成结果不变', h1.completedByName!.includes('张广田'))
check('观察员可见全部含历史', store.visibleTo(u['周明']).length === store.routes.length)

console.log('9) 持久化：刷新（重建 store）数据仍在')
setActivePinia(createPinia())
const store2 = useClaimStore()
check('新 store 读到测试派发路线', store2.routes.some((r) => r.routeName === '测试路线A'))
check('新 store 踏勘事项保留', store2.surveys.some((s) => s.sourceRouteId === 6))

console.log(`\n结果：${pass} 通过，${fail} 失败`)
if (fail > 0) process.exit(1)
