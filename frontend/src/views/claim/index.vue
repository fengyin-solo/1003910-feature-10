<template>
  <section class="page" data-module="claim-desk">
    <header class="page-head">
      <div>
        <h2>巡查路线认领台</h2>
        <p class="page-desc">
          片区负责人按隐患点和巡查日期派发巡检批次；站员只能领取辖区内路线，当班路线他人不得改动。
          跨片区认领或代他人完成一律越权拒绝；同一路线同时领取按「先到先得」，负责人指派优先。
          历史路线仍按派发时原片区解释。
        </p>
      </div>
      <div class="page-actions">
        <button class="btn ghost" type="button" @click="resetDemo">重置演示数据</button>
      </div>
    </header>

    <div class="identity-bar">
      <div class="identity-main">
        <span class="tag role">{{ session.roleLabel }}</span>
        <strong>{{ session.user.name }}</strong>
        <span class="tag area">{{ session.area ?? '无辖区（全部只读）' }}</span>
        <span class="identity-shift">当班：{{ session.shiftLabel }}</span>
      </div>
      <label class="identity-switch">
        <span>切换身份演练越权：</span>
        <select :value="session.currentUserId" @change="onSwitchUser">
          <option v-for="member in store.team" :key="member.id" :value="member.id">
            {{ member.name }} · {{ member.title }}
          </option>
        </select>
      </label>
    </div>

    <div class="stat-row">
      <article class="stat-card">
        <span class="stat-label">今日辖区批次路线</span>
        <strong class="stat-value">{{ stats.todayBatch }}</strong>
      </article>
      <article class="stat-card">
        <span class="stat-label">待领取</span>
        <strong class="stat-value">{{ stats.pendingClaim }}</strong>
      </article>
      <article class="stat-card">
        <span class="stat-label">我的当班任务</span>
        <strong class="stat-value">{{ stats.myOnDuty }}</strong>
      </article>
      <article class="stat-card">
        <span class="stat-label">异常待踏勘</span>
        <strong class="stat-value">{{ stats.abnormalPending }}</strong>
      </article>
    </div>

    <div class="tab-bar">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        class="tab-btn"
        :class="{ active: activeTab === tab.key }"
        type="button"
        @click="activeTab = tab.key"
      >
        {{ tab.label }}
      </button>
    </div>

    <div v-if="activeTab === 'today'">
      <form v-if="session.role === 'manager'" class="form-card" @submit.prevent="submitDispatch">
        <h3 class="form-title">派发巡检批次（仅本片区隐患点）</h3>
        <div class="form-grid">
          <label class="filter-item">
            <span>隐患点</span>
            <select v-model="dispatchForm.hazardCode">
              <option value="">请选择隐患点</option>
              <option v-for="point in myHazards" :key="point.code" :value="point.code">
                {{ point.code }} · {{ point.name }}
              </option>
            </select>
          </label>
          <label class="filter-item">
            <span>巡查日期</span>
            <input v-model="dispatchForm.patrolDate" type="date" />
          </label>
          <label class="filter-item wide">
            <span>路线名称</span>
            <input v-model="dispatchForm.routeName" placeholder="例如：后山村环线" />
          </label>
        </div>
        <div class="form-foot">
          <button class="btn primary" type="submit">派发批次</button>
          <span class="hint">同日多路线自动归入同一批次编号；只能选择 {{ session.area }} 的隐患点。</span>
        </div>
      </form>

      <p v-else class="notice">站员仅可领取 {{ session.area }} 内待领取路线；跨片区领取、代他人提交都会被越权拒绝。</p>

      <table class="data-table">
        <thead>
          <tr>
            <th>批次编号</th>
            <th>隐患点</th>
            <th>路线</th>
            <th>巡查日期</th>
            <th>所属片区</th>
            <th>状态</th>
            <th>领取/当班人</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="route in todayRows" :key="route.id">
            <td>{{ route.batchNo }}</td>
            <td>{{ route.hazardCode }}<br /><span class="hint">{{ route.hazardName }}</span></td>
            <td>{{ route.routeName }}</td>
            <td>{{ route.patrolDate }}</td>
            <td>{{ route.areaSnapshot }}</td>
            <td>
              <span class="tag status" :class="statusClass(route.status)">{{ route.status }}</span>
              <span v-if="route.assigned && route.status === '已领取'" class="tag assigned">指派优先</span>
            </td>
            <td>{{ route.claimByName ? `${route.claimByName}${route.claimedAt ? '（' + route.claimedAt.slice(11, 16) + '）' : ''}` : '—' }}</td>
            <td class="row-actions wrap">
              <template v-for="action in routeActions(route)" :key="action.key">
                <button class="link" type="button" @click="action.run">{{ action.label }}</button>
              </template>
            </td>
          </tr>
          <tr v-if="!todayRows.length">
            <td colspan="8" class="empty-state">今日没有可查看的路线（{{ session.area ?? '观察员可见全部' }}）</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-else>
      <p class="notice">
        历史路线按派发时原片区解释：原片区已更名的，按承袭关系归到现行片区做权限校验；历史路线只读归档，不得再领取或改动。
      </p>
      <table class="data-table">
        <thead>
          <tr>
            <th>批次编号</th>
            <th>隐患点</th>
            <th>路线</th>
            <th>巡查日期</th>
            <th>派发时片区</th>
            <th>区划版本</th>
            <th>状态</th>
            <th>首次完成结果</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="route in historyRows" :key="route.id">
            <td>{{ route.batchNo }}</td>
            <td>{{ route.hazardCode }}<br /><span class="hint">{{ route.hazardName }}</span></td>
            <td>{{ route.routeName }}</td>
            <td>{{ route.patrolDate }}</td>
            <td>{{ route.areaSnapshot }}</td>
            <td>{{ route.areaVersion }}</td>
            <td><span class="tag status" :class="statusClass(route.status)">{{ route.status }}</span></td>
            <td>
              <template v-if="route.completedByName">
                {{ route.completedByName }}：{{ route.resultDesc || '正常完成' }}
              </template>
              <span v-else class="hint">未完成</span>
            </td>
          </tr>
          <tr v-if="!historyRows.length">
            <td colspan="8" class="empty-state">暂无可见的历史路线</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 提交结果弹窗 -->
    <div v-if="submitTarget" class="modal-mask" @click.self="submitTarget = null">
      <form class="modal" @submit.prevent="confirmSubmit">
        <h3>提交巡检结果 · {{ submitTarget.routeName }}</h3>
        <p class="hint">当班人：{{ submitTarget.claimByName }} · 仅本人可提交，提交后首次结果不可覆盖。</p>
        <label class="form-line">
          <span>巡检情况</span>
          <textarea v-model="submitForm.resultDesc" rows="3" placeholder="记录现场检查情况"></textarea>
        </label>
        <label class="form-line">
          <span>处置措施</span>
          <textarea v-model="submitForm.measure" rows="2" placeholder="现场已采取的处置措施"></textarea>
        </label>
        <label class="form-line checkbox">
          <input v-model="submitForm.abnormal" type="checkbox" />
          <span>发现异常（提交后在治理工程页生成踏勘事项）</span>
        </label>
        <div class="form-foot right">
          <button class="btn ghost" type="button" @click="submitTarget = null">取消</button>
          <button class="btn primary" type="submit">确认提交</button>
        </div>
      </form>
    </div>

    <!-- 负责人指派弹窗 -->
    <div v-if="assignTarget" class="modal-mask" @click.self="assignTarget = null">
      <form class="modal" @submit.prevent="confirmAssign">
        <h3>负责人指派 · {{ assignTarget.routeName }}</h3>
        <p class="hint">
          指派优先：锁定后其他站员不能领取；已领取未提交的当班路线改派会留下记录，他人无权改动。
        </p>
        <label class="form-line">
          <span>指派给本片区站员</span>
          <select v-model="assignUserId">
            <option value="">请选择站员</option>
            <option v-for="member in areaInspectors" :key="member.id" :value="member.id">
              {{ member.name }} · {{ member.title }}
            </option>
          </select>
        </label>
        <ul v-if="assignTarget.reassignLogs.length" class="log-list">
          <li v-for="(log, idx) in assignTarget.reassignLogs" :key="idx" class="hint">
            {{ log.at.slice(0, 16).replace('T', ' ') }} 负责人 {{ log.byName }} 改派：{{ log.fromName }} → {{ log.toName }}
          </li>
        </ul>
        <div class="form-foot right">
          <button class="btn ghost" type="button" @click="assignTarget = null">取消</button>
          <button class="btn primary" type="submit">确认指派</button>
        </div>
      </form>
    </div>

    <footer class="page-foot">
      <span>规则：派发限本片区负责人 · 认领限辖区站员 · 提交限领取本人 · 异常自动生成踏勘事项（同路线仅一条）</span>
      <span v-if="flash" class="flash-text" :class="flashOk ? 'ok' : 'error-text'">{{ flash }}</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'

import { effectiveArea, useClaimStore } from '@/stores/claim'
import { useSessionStore } from '@/stores/session'
import { todayStr, type PatrolRoute, type TeamUser } from '@/data/claim'

const store = useClaimStore()
const session = useSessionStore()

const activeTab = ref<'today' | 'history'>('today')
const tabs = [
  { key: 'today' as const, label: '今日当班路线' },
  { key: 'history' as const, label: '历史路线（原片区解释）' },
]

const flash = ref('')
const flashOk = ref(false)

function notify(result: { ok: boolean; message: string }) {
  flash.value = result.message
  flashOk.value = result.ok
}

const stats = computed(() => store.stats(session.user))

const visibleRows = computed(() =>
  store.listRoutes({}).filter((route) => store.visibleTo(session.user).some((r) => r.id === route.id)),
)
const todayRows = computed(() => visibleRows.value.filter((r) => !r.isHistory && r.patrolDate === todayStr()))
const historyRows = computed(() => visibleRows.value.filter((r) => r.isHistory))

const myHazards = computed(() =>
  store.hazardPoints.filter((h) => session.area !== null && h.area === session.area),
)
const areaInspectors = computed<TeamUser[]>(() =>
  store.team.filter((u) => u.role === 'inspector' && u.area === session.area),
)

const dispatchForm = reactive({
  hazardCode: '',
  routeName: '',
  patrolDate: todayStr(),
})

function submitDispatch() {
  const result = store.dispatchBatch({ ...dispatchForm }, session.user)
  notify(result)
  if (result.ok) {
    dispatchForm.routeName = ''
  }
}

function statusClass(status: string): string {
  if (status === '待领取') return 'pending'
  if (status === '已领取') return 'claimed'
  if (status === '已完成') return 'done'
  return 'abnormal'
}

interface RowAction {
  key: string
  label: string
  run: () => void
}

function routeActions(route: PatrolRoute): RowAction[] {
  const actions: RowAction[] = []
  const user = session.user
  const inArea = user.area !== null && effectiveArea(route) === user.area

  // 任何非本辖区站员都能看到「越权领取」按钮，用于演示跨片区被拒绝。
  if (route.status === '待领取' && user.role === 'inspector') {
    actions.push({ key: 'claim', label: inArea ? '领取路线' : '跨片区领取（越权）', run: () => doClaim(route) })
    if (inArea && areaInspectors.value.length >= 2) {
      actions.push({ key: 'race', label: '两人同时领取演练', run: () => doRace(route) })
    }
  }

  if (route.status === '已领取' && user.role === 'manager') {
    actions.push({
      key: 'assign',
      label: inArea ? (route.assigned ? '改派路线' : '指派路线') : '跨片区指派（越权）',
      run: () => openAssign(route),
    })
  }

  if (route.status === '已领取' && user.role === 'inspector') {
    actions.push({
      key: 'submit',
      label: route.claimById === user.id ? '提交结果' : '代提交（越权）',
      run: () => openSubmit(route),
    })
  }

  if ((route.status === '已完成' || route.status === '异常待踏勘' || route.status === '已踏勘') && user.role !== 'viewer') {
    actions.push({
      key: 'repeat',
      label: '重复提交（应拒绝）',
      run: () => {
        const result = store.submitRoute(
          route.id,
          { abnormal: false, resultDesc: '试图覆盖首次结果', measure: '' },
          user,
        )
        notify(result)
      },
    })
  }

  if (user.role === 'viewer') {
    actions.push({ key: 'readonly', label: '只读（无权操作）', run: () => notify({ ok: false, message: '越权拒绝：观察员为只读账号。' }) })
  }

  return actions
}

function doClaim(route: PatrolRoute) {
  notify(store.claimRoute(route.id, session.user))
}

function doRace(route: PatrolRoute) {
  notify(store.simulateConcurrentClaim(route.id, session.user))
}

const submitTarget = ref<PatrolRoute | null>(null)
const submitForm = reactive({ abnormal: false, resultDesc: '', measure: '' })

function openSubmit(route: PatrolRoute) {
  submitTarget.value = route
  submitForm.abnormal = false
  submitForm.resultDesc = ''
  submitForm.measure = ''
}

function confirmSubmit() {
  if (!submitTarget.value) {
    return
  }
  const result = store.submitRoute(submitTarget.value.id, { ...submitForm }, session.user)
  notify(result)
  submitTarget.value = null
}

const assignTarget = ref<PatrolRoute | null>(null)
const assignUserId = ref('')

function openAssign(route: PatrolRoute) {
  assignTarget.value = route
  assignUserId.value = route.claimById ?? areaInspectors.value[0]?.id ?? ''
}

function confirmAssign() {
  if (!assignTarget.value) {
    return
  }
  const result = store.assignRoute(assignTarget.value.id, assignUserId.value, session.user)
  notify(result)
  assignTarget.value = null
}

function onSwitchUser(event: Event) {
  session.switchUser((event.target as HTMLSelectElement).value)
  flash.value = ''
}

function resetDemo() {
  notify(store.resetDemo())
}
</script>
