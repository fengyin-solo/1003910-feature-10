<template>
  <section class="page" data-module="engineering">
    <header class="page-head">
      <div>
        <h2>治理工程管理</h2>
        <p class="page-desc">维护治理工程项目，围绕项目编号、隐患点编号、治理方案、承建方做登记、筛选与状态流转；巡查异常提交后自动生成踏勘事项。</p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openCreate">登记治理工程项目</button>
        <button class="btn" type="button" @click="exportRows">导出治理工程清单</button>
      </div>
    </header>

    <div class="tab-bar">
      <button
        class="tab-btn"
        :class="{ active: activeTab === 'project' }"
        type="button"
        @click="activeTab = 'project'"
      >
        治理工程项目
      </button>
      <button
        class="tab-btn"
        :class="{ active: activeTab === 'survey' }"
        type="button"
        @click="activeTab = 'survey'"
      >
        踏勘事项（{{ pendingSurveyCount }} 待踏勘）
      </button>
    </div>

    <template v-if="activeTab === 'project'">
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
            <td :colspan="columns.length + 2" class="empty-state">暂无治理工程数据，可先登记治理工程项目</td>
          </tr>
        </tbody>
      </table>

      <footer class="page-foot">
        <span>共 {{ total }} 条治理工程记录</span>
        <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
      </footer>
    </template>

    <template v-else>
      <p class="notice">
        踏勘事项由认领台「报告异常」提交自动生成：同一路线仅生成一条，重复提交不新增、不覆盖首次结果；登记踏勘结论后可据此立项治理工程。
      </p>
      <table class="data-table">
        <thead>
          <tr>
            <th>事项编号</th>
            <th>来源批次 / 路线</th>
            <th>隐患点</th>
            <th>所属片区（原快照）</th>
            <th>巡查日期</th>
            <th>异常情况</th>
            <th>现场处置</th>
            <th>提交人</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in surveyRows" :key="item.id">
            <td>{{ item.itemNo }}</td>
            <td>{{ item.batchNo }}<br /><span class="hint">路线 #{{ item.sourceRouteId }}</span></td>
            <td>{{ item.hazardCode }}<br /><span class="hint">{{ item.hazardName }}</span></td>
            <td>{{ item.areaSnapshot }}</td>
            <td>{{ item.patrolDate }}</td>
            <td>{{ item.abnormalDesc }}</td>
            <td>{{ item.measure || '—' }}</td>
            <td>{{ item.submittedByName }}</td>
            <td><span class="tag status" :class="item.status === '待踏勘' ? 'abnormal' : 'done'">{{ item.status }}</span></td>
            <td class="row-actions">
              <button v-if="item.status === '待踏勘'" class="link" type="button" @click="openSurvey(item.id)">
                登记踏勘结论
              </button>
              <span v-else class="hint">{{ item.handledByName }}：{{ item.surveyConclusion }}</span>
            </td>
          </tr>
          <tr v-if="!surveyRows.length">
            <td colspan="10" class="empty-state">暂无踏勘事项，巡查路线提交异常后会自动生成</td>
          </tr>
        </tbody>
      </table>

      <div v-if="surveyTargetId !== null" class="modal-mask" @click.self="surveyTargetId = null">
        <form class="modal" @submit.prevent="confirmSurvey">
          <h3>登记踏勘结论</h3>
          <label class="form-line">
            <span>踏勘结论 / 治理建议</span>
            <textarea v-model="surveyConclusion" rows="3" placeholder="例如：现场复核后建议修建挡土墙并纳入治理工程立项"></textarea>
          </label>
          <div class="form-foot right">
            <button class="btn ghost" type="button" @click="surveyTargetId = null">取消</button>
            <button class="btn primary" type="submit">保存结论</button>
          </div>
        </form>
      </div>

      <footer class="page-foot">
        <span>共 {{ surveyRows.length }} 条踏勘事项</span>
        <span v-if="surveyMessage" class="flash-text" :class="surveyOk ? 'ok' : 'error-text'">{{ surveyMessage }}</span>
      </footer>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import {
  downloadEntries,
  listEntries,
  moduleMeta,
  runAction as applyAction,
} from '@/api/local-service'
import type { EntryRow } from '@/data/types'
import { useClaimStore } from '@/stores/claim'
import { useSessionStore } from '@/stores/session'

const meta = moduleMeta('engineering')
const columns = ["项目编号", "隐患点编号", "治理方案", "承建方", "合同金额", "开工日期", "计划工期", "项目状态"]
const actions = ["启动招标", "开工确认", "申请验收"]
const statuses = ["待立项", "招标中", "施工中", "已竣工", "待验收"]
const stats = [{"label": "项目总数", "value": 0}, {"label": "施工中数", "value": 0}, {"label": "待验收数", "value": 0}]

const activeTab = ref<'project' | 'survey'>('project')

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

const claimStore = useClaimStore()
const session = useSessionStore()
const surveyRows = computed(() => claimStore.listSurveys())
const pendingSurveyCount = computed(() => surveyRows.value.filter((item) => item.status === '待踏勘').length)
const surveyTargetId = ref<number | null>(null)
const surveyConclusion = ref('')
const surveyMessage = ref('')
const surveyOk = ref(false)

function openSurvey(id: number) {
  surveyTargetId.value = id
  surveyConclusion.value = ''
  surveyMessage.value = ''
}

function confirmSurvey() {
  if (surveyTargetId.value === null) {
    return
  }
  const result = claimStore.completeSurvey(surveyTargetId.value, surveyConclusion.value, session.user)
  surveyMessage.value = result.message
  surveyOk.value = result.ok
  if (result.ok) {
    surveyTargetId.value = null
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
  errorMessage.value = '治理工程项目登记入口尚未接入审批流'
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
    errorMessage.value = error instanceof Error ? error.message : '治理工程列表读取失败'
  }
}

onMounted(reload)
</script>
