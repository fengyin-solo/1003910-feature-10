<template>
  <section class="page" data-module="patrol">
    <section class="claim-desk">
      <header class="page-head">
        <div>
          <h2>路线认领台</h2>
          <p class="page-desc">
            片区负责人按隐患点和巡查日期派发巡检批次；站员只能领取本辖区路线，跨片区认领越权拒绝；
            同一路线先到先得，负责人可指派或改派；当班路线只能由认领人本人提交，重复完成只留首次结果；
            历史路线按派发时定格的原片区解释。
          </p>
        </div>
        <label class="identity-bar">
          <span>当前身份</span>
          <select v-model="selectedStaff" @change="onSwitchUser">
            <option v-for="member in staff" :key="member.name" :value="member.name">
              {{ member.name }} · {{ member.role }} · {{ member.area }}
            </option>
          </select>
        </label>
      </header>

      <form v-if="isLeader" class="dispatch-bar" @submit.prevent="onDispatch">
        <strong>派发巡检批次（{{ session.area }}）</strong>
        <label>
          <span>隐患点</span>
          <select v-model="dispatchForm.hazard">
            <option v-for="hazard in areaHazards" :key="hazard" :value="hazard">{{ hazard }}</option>
          </select>
        </label>
        <label>
          <span>巡查日期</span>
          <input v-model="dispatchForm.date" type="date" />
        </label>
        <label>
          <span>路线条数</span>
          <input v-model.number="dispatchForm.count" type="number" min="1" max="9" />
        </label>
        <button class="btn primary" type="submit">派发批次</button>
      </form>
      <p v-else class="desk-hint">站员只能领取本辖区路线；派发批次请切换为片区负责人身份。</p>

      <table class="data-table">
        <thead>
          <tr>
            <th>路线编号</th>
            <th>批次编号</th>
            <th>隐患点编号</th>
            <th>巡查日期</th>
            <th>所属片区</th>
            <th>路线状态</th>
            <th>认领人</th>
            <th>完成结果</th>
            <th>可执行动作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="route in routes" :key="route.id">
            <td>{{ route.路线编号 }}</td>
            <td>{{ route.批次编号 }}</td>
            <td>{{ route.隐患点编号 }}</td>
            <td>{{ route.巡查日期 }}</td>
            <td>
              {{ route.所属片区 }}
              <span v-if="isHistorical(route)" class="tag">历史片区</span>
            </td>
            <td>{{ route.状态 }}</td>
            <td>{{ route.认领人 || '—' }}</td>
            <td>{{ route.巡查结果 || '—' }}</td>
            <td class="row-actions">
              <button
                v-if="route.状态 === '待认领' && !isLeader"
                class="link"
                type="button"
                @click="onClaim(route)"
              >
                领取
              </button>
              <template v-if="isLeader && (route.状态 === '待认领' || route.状态 === '已认领')">
                <select v-model="assignTargets[route.id]" class="assign-select">
                  <option value="" disabled>选择站员</option>
                  <option
                    v-for="member in membersOfArea(route.所属片区)"
                    :key="member.name"
                    :value="member.name"
                  >
                    {{ member.name }}
                  </option>
                </select>
                <button class="link" type="button" @click="onAssign(route)">
                  {{ route.状态 === '待认领' ? '指派' : '改派' }}
                </button>
              </template>
              <template v-if="route.状态 === '已认领'">
                <button class="link" type="button" @click="onComplete(route)">完成</button>
                <button class="link" type="button" @click="openAbnormal(route)">上报异常</button>
              </template>
            </td>
          </tr>
          <tr v-if="!routes.length">
            <td colspan="9" class="empty-state">暂无待认领路线，可由片区负责人派发巡检批次</td>
          </tr>
        </tbody>
      </table>

      <form v-if="abnormalRoute" class="abnormal-form" @submit.prevent="submitAbnormal">
        <strong>上报异常：{{ abnormalRoute.路线编号 }}（{{ abnormalRoute.隐患点编号 }}）</strong>
        <label>
          <span>异常描述</span>
          <input v-model="abnormalForm.异常描述" placeholder="必填，提交后治理工程生成踏勘事项" />
        </label>
        <label>
          <span>处置措施</span>
          <input v-model="abnormalForm.处置措施" placeholder="选填" />
        </label>
        <button class="btn primary" type="submit">提交异常</button>
        <button class="btn ghost" type="button" @click="closeAbnormal">取消</button>
      </form>

      <p v-if="deskMessage" :class="deskOk ? 'ok-text' : 'error-text'">{{ deskMessage }}</p>
    </section>

    <header class="page-head">
      <div>
        <h2>巡查排查管理</h2>
        <p class="page-desc">维护巡查记录，围绕巡查编号、隐患点编号、巡查日期、巡查人员做登记、筛选与状态流转。</p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openCreate">登记巡查记录</button>
        <button class="btn" type="button" @click="exportRows">导出巡查排查清单</button>
      </div>
    </header>

    <div class="stat-row">
      <article v-for="item in stats" :key="item.label" class="stat-card">
        <span class="stat-label">{{ item.label }}</span>
        <strong class="stat-value">{{ item.value }}</strong>
      </article>
    </div>

    <p class="status-legend">
      <span v-for="item in statusSummary" :key="item.status" class="legend-item">
        {{ item.status }}：{{ item.count }}
      </span>
    </p>

    <form class="filter-bar" @submit.prevent="reload">
      <label v-for="field in filterFields" :key="field" class="filter-item">
        <span>{{ field }}</span>
        <input v-model="filters[field]" :placeholder="`按${field}检索`" />
      </label>
      <button class="btn" type="submit">查询</button>
      <button class="btn ghost" type="button" @click="resetFilters">重置条件</button>
    </form>

    <table class="data-table">
      <thead>
        <tr>
          <th v-for="column in columns" :key="column">{{ column }}</th>
          <th>当前状态</th>
          <th>可执行动作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="String(row.id)">
          <td v-for="column in columns" :key="column">{{ row[column] ?? '—' }}</td>
          <td>{{ row.status }}</td>
          <td class="row-actions">
            <button
              v-for="action in actions"
              :key="action"
              class="link"
              type="button"
              @click="runAction(action, row)"
            >
              {{ action }}
            </button>
          </td>
        </tr>
        <tr v-if="!rows.length">
          <td :colspan="columns.length + 2" class="empty-state">暂无巡查排查数据，可先登记巡查记录</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>共 {{ total }} 条巡查排查记录</span>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'

import {
  assignRoute,
  claimRoute,
  completeRoute,
  dispatchBatch,
  today,
} from '@/api/claim-service'
import {
  downloadEntries,
  listEntries,
  moduleMeta,
  runAction as applyAction,
} from '@/api/local-service'
import {
  HAZARD_AREAS,
  STAFF,
  listRoutes,
  membersOfArea,
  type PatrolRoute,
} from '@/data/claim-desk'
import type { EntryRow } from '@/data/types'
import { useSessionStore } from '@/stores/session'

const meta = moduleMeta('patrol')
const columns = ["巡查编号", "隐患点编号", "巡查日期", "巡查人员", "巡查范围", "发现异常", "处置措施", "巡查状态"]
const actions = ["完成巡查", "报告异常", "确认处置"]
const statuses = ["待巡查", "已巡查", "发现异常", "已处置"]
const stats = [{"label": "本月巡查次数", "value": 0}, {"label": "发现异常数", "value": 0}, {"label": "待处置数", "value": 0}]

const rows = ref<EntryRow[]>([])
const total = ref(0)
const errorMessage = ref('')
const filters = ref<Record<string, string>>({})
const filterFields = columns.slice(0, 3)
const statusSummary = computed(() =>
  statuses.map((status: string) => ({
    status,
    count: rows.value.filter((row) => String(row.status) === status).length,
  })),
)

const session = useSessionStore()
const staff = STAFF
const routes = ref<PatrolRoute[]>([])
const deskMessage = ref('')
const deskOk = ref(false)
const selectedStaff = ref(session.operator)
const isLeader = computed(() => session.role === '负责人')
const areaHazards = computed(() =>
  Object.entries(HAZARD_AREAS)
    .filter(([, area]) => area === session.area)
    .map(([hazard]) => hazard),
)
const dispatchForm = reactive({ hazard: '', date: today(), count: 1 })
const assignTargets = reactive<Record<number, string>>({})
const abnormalRoute = ref<PatrolRoute | null>(null)
const abnormalForm = reactive({ 异常描述: '', 处置措施: '' })

function isHistorical(route: PatrolRoute): boolean {
  const currentArea = HAZARD_AREAS[route.隐患点编号]
  return Boolean(currentArea) && currentArea !== route.所属片区
}

function refreshRoutes() {
  routes.value = [...listRoutes()]
}

function showDesk(result: { ok: boolean; message: string }) {
  deskOk.value = result.ok
  deskMessage.value = result.message
  if (result.ok) {
    refreshRoutes()
    reload() // 路线办结会同步生成巡查记录，列表一起刷新
  }
}

function ensureDispatchHazard() {
  if (!areaHazards.value.includes(dispatchForm.hazard)) {
    dispatchForm.hazard = areaHazards.value[0] ?? ''
  }
}

function onSwitchUser() {
  const member = STAFF.find((item) => item.name === selectedStaff.value)
  if (!member) {
    return
  }
  session.switchUser(member)
  deskMessage.value = ''
  ensureDispatchHazard()
}

function onDispatch() {
  showDesk(
    dispatchBatch(session.operator, {
      隐患点编号: dispatchForm.hazard,
      巡查日期: dispatchForm.date,
      路线条数: dispatchForm.count,
    }),
  )
}

function onClaim(route: PatrolRoute) {
  showDesk(claimRoute(session.operator, route.id))
}

function onAssign(route: PatrolRoute) {
  const target = assignTargets[route.id]
  if (!target) {
    deskOk.value = false
    deskMessage.value = '请先在路线行内选择要指派的站员'
    return
  }
  showDesk(assignRoute(session.operator, route.id, target))
}

function onComplete(route: PatrolRoute) {
  showDesk(completeRoute(session.operator, route.id, { 发现异常: false }))
}

function openAbnormal(route: PatrolRoute) {
  abnormalRoute.value = route
  abnormalForm.异常描述 = ''
  abnormalForm.处置措施 = ''
}

function closeAbnormal() {
  abnormalRoute.value = null
}

function submitAbnormal() {
  if (!abnormalRoute.value) {
    return
  }
  const result = completeRoute(session.operator, abnormalRoute.value.id, {
    发现异常: true,
    异常描述: abnormalForm.异常描述,
    处置措施: abnormalForm.处置措施,
  })
  showDesk(result)
  if (result.ok) {
    abnormalRoute.value = null
  }
}

function resetFilters() {
  filters.value = {}
  reload()
}

function exportRows() {
  downloadEntries(meta.key)
}

function openCreate() {
  errorMessage.value = '巡查记录登记入口尚未接入审批流'
}

function runAction(action: string, row: EntryRow) {
  errorMessage.value = ''
  const result = applyAction(meta.key, Number(row.id), action)
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  reload()
}

function reload() {
  errorMessage.value = ''
  try {
    const payload = listEntries(meta.key, filters.value)
    rows.value = payload.items
    total.value = payload.total
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '巡查排查列表读取失败'
  }
}

onMounted(() => {
  ensureDispatchHazard()
  refreshRoutes()
  reload()
})
</script>
