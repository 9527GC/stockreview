<template>
  <a-modal
    :open="open"
    title="持仓明细"
    @update:open="$emit('update:open', $event)"
    :footer="null"
    width="780px"
    centered
    wrapClassName="holding-detail-modal"
    :style="{ paddingBottom: 0 }"
  >
    <div v-if="!holding" style="color: #999; padding: 12px 0;">未选择持仓</div>

    <template v-else>
      <div class="body-content">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
          <div>
            <div style="font-weight: 600; color: #1f1f1f; line-height: 1.4;">{{ holding.name || holding.symbol }}</div>
            <div style="font-size: 12px; color: #999; line-height: 1.2;">{{ holding.symbol }}</div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 12px; color: #999;">现价</div>
            <div style="font-weight: 600; color: #1f1f1f;">{{ holding.currentPrice !== null && holding.currentPrice !== undefined ? (currencySymbol + Number(holding.currentPrice).toFixed(2)) : '--' }}</div>
          </div>
        </div>

        <div class="metrics-panel">
          <div class="metric-item">
            <span class="metric-label">今日盈亏</span>
            <span
              v-if="holding.dailyProfit !== null && holding.dailyProfit !== undefined"
              class="metric-value"
              :class="holding.dailyProfit >= 0 ? 'positive' : 'negative'"
            >
              {{ holding.dailyProfit >= 0 ? '+' : '' }}{{ currencySymbol }}{{ Number(holding.dailyProfit).toFixed(2) }}
            </span>
            <span v-else class="metric-value">--</span>
          </div>
          <div class="metric-item">
            <span class="metric-label">持仓盈亏</span>
            <span
              v-if="holding.unrealizedProfit !== null && holding.unrealizedProfit !== undefined"
              class="metric-value"
              :class="holding.unrealizedProfit >= 0 ? 'positive' : 'negative'"
            >
              {{ holding.unrealizedProfit >= 0 ? '+' : '' }}{{ currencySymbol }}{{ Number(holding.unrealizedProfit).toFixed(2) }}
            </span>
            <span v-else class="metric-value">--</span>
          </div>
          <div class="metric-item">
            <span class="metric-label">累计盈亏</span>
            <span
              v-if="holding.cumulativeProfit !== null && holding.cumulativeProfit !== undefined"
              class="metric-value"
              :class="holding.cumulativeProfit >= 0 ? 'positive' : 'negative'"
            >
              {{ holding.cumulativeProfit >= 0 ? '+' : '' }}{{ currencySymbol }}{{ Number(holding.cumulativeProfit).toFixed(2) }}
            </span>
            <span v-else class="metric-value">--</span>
          </div>
          <div class="metric-item">
            <span class="metric-label">持仓数量</span>
            <span class="metric-value">{{ holding.quantity !== null && holding.quantity !== undefined ? Number(holding.quantity) : '--' }}</span>
          </div>
          <div class="metric-item">
            <span class="metric-label">持仓成本</span>
            <span class="metric-value">{{ holding.avgCost !== null && holding.avgCost !== undefined ? (currencySymbol + Number(holding.avgCost).toFixed(2)) : '--' }}</span>
          </div>
          <div class="metric-item">
            <span class="metric-label">成本金额</span>
            <span class="metric-value">{{ totalCost !== null ? (currencySymbol + totalCost.toFixed(2)) : '--' }}</span>
          </div>
          <div v-if="holding.dilutedAvgCost !== null && holding.dilutedAvgCost !== undefined" class="metric-item">
            <span class="metric-label">摊薄成本（参考）</span>
            <span class="metric-value">{{ currencySymbol }}{{ Number(holding.dilutedAvgCost).toFixed(2) }}</span>
          </div>
        </div>

        <div class="section-title" style="margin-top: 16px; display: flex; justify-content: space-between; align-items: center;">
          <span>操作记录</span>
          <a-button type="primary" size="small" @click="handleAddTrade">添加交易</a-button>
        </div>
        <div class="table-wrapper">
          <a-table
            :columns="columns"
            :data-source="operations"
            :loading="loading"
            :pagination="pagination"
            @change="handleTableChange"
            size="middle"
            :row-key="r => r.id"
            :scroll="{ y: tableScrollY }"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'type'">
                <a-tag v-if="record.type === 'COMPANY_ACTION'" color="purple">公司行动</a-tag>
                <a-tag v-else :color="record.type === 'BUY' ? 'red' : 'green'">
                  {{ record.type === 'BUY' ? '买入' : '卖出' }}
                </a-tag>
              </template>
              <template v-if="column.key === 'price'">
                <span v-if="record.type === 'COMPANY_ACTION'">{{ record.description || '--' }}</span><span v-else>{{ currencySymbol }}{{ Number(record.price || 0).toFixed(2) }}</span>
              </template>
              <template v-if="column.key === 'date'">
                {{ dayjs(record.date).format('YYYY-MM-DD HH:mm') }}
              </template>
              <template v-if="column.key === 'action' && record.type !== 'COMPANY_ACTION'">
                <a-button type="link" size="small" @click="handleEdit(record)">编辑</a-button>
                <a-popconfirm
                  title="确定要删除这条交易记录吗？"
                  @confirm="handleDelete(record)"
                >
                  <a-button type="link" danger size="small">删除</a-button>
                </a-popconfirm>
              </template>
            </template>
          </a-table>
        </div>

        <TradeModal
          v-model:open="editModalOpen"
          mode="edit"
          :trade="editingTrade"
          @success="onEditSuccess"
        />

        <TradeModal
          v-model:open="addModalOpen"
          mode="add"
          :initial-data="initialTradeData"
          @success="onAddSuccess"
        />
      </div>
    </template>
  </a-modal>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import dayjs from 'dayjs';
import { message } from 'ant-design-vue';
import { getCurrentHoldingTrades } from '@/api/index';
import { normalizeSymbol } from '@/utils/stock';
import { useTradeStore } from '@/stores/trade';
import TradeModal from './TradeModal.vue';

const props = defineProps({
  open: Boolean,
  holding: {
    type: Object,
    default: null
  }
});

const emit = defineEmits(['update:open', 'changed']);

const store = useTradeStore();

const operations = ref([]);
const loading = ref(false);
const currentPage = ref(1);
const pageSize = ref(20);
const total = ref(0);
const hasTotal = ref(false);
const tableScrollY = computed(() => (hasTotal.value ? 'calc(80vh - 360px)' : 'calc(80vh - 310px)'));

const parseListResponse = (res) => {
  if (!res) return { list: [], total: undefined };
  if (Array.isArray(res)) return { list: res, total: undefined };
  if (Array.isArray(res.list)) return { list: res.list, total: res.total ?? res.count };
  if (res.data && Array.isArray(res.data.list)) return { list: res.data.list, total: res.data.total ?? res.data.count };
  return { list: [], total: res.total ?? res.count };
};

const fetchOperations = async () => {
  const symbol = normalizeSymbol(props.holding?.symbol);
  console.log('[fetchOperations] holding symbol:', props.holding?.symbol, 'normalized:', symbol, 'open:', props.open);
  if (!props.open || !symbol) return;

  loading.value = true;
  try {
    const res = await getCurrentHoldingTrades(symbol);
    console.log('[fetchOperations] response:', res);
    const parsed = parseListResponse(res);
    operations.value = parsed.list || [];
    if (typeof parsed.total === 'number') {
      total.value = parsed.total;
      hasTotal.value = true;
    } else {
      total.value = 0;
      hasTotal.value = false;
    }
  } catch (err) {
    console.error('[fetchOperations] failed:', err);
    message.error('操作记录加载失败');
  } finally {
    loading.value = false;
  }
};

const currencySymbol = computed(() => {
  const map = {
    CNY: '¥',
    HKD: 'HK$',
    USD: '$'
  };
  return map[props.holding?.currency] || '¥';
});

const totalCost = computed(() => {
  if (!props.holding) return null;
  if (props.holding.avgCost === null || props.holding.avgCost === undefined) return null;
  if (props.holding.quantity === null || props.holding.quantity === undefined) return null;
  return Number(props.holding.avgCost) * Number(props.holding.quantity);
});

watch(
  () => [props.open, props.holding?.symbol],
  (cur, prev) => {
    const [isOpen, symbol] = cur;
    const [prevOpen, prevSymbol] = prev || [];
    if (!isOpen) return;
    if (symbol !== prevSymbol || !prevOpen) {
      currentPage.value = 1;
    }
    fetchOperations();
  },
  { immediate: true }
);

const pagination = computed(() => {
  if (!hasTotal.value) return false;
  return {
    current: currentPage.value,
    pageSize: pageSize.value,
    total: total.value,
    size: 'small',
    showSizeChanger: true,
    showTotal: t => `共 ${t} 条`
  };
});

const handleTableChange = (paginationConfig) => {
  if (!paginationConfig) return;
  const nextPage = paginationConfig.current ?? 1;
  const nextSize = paginationConfig.pageSize ?? pageSize.value;
  const changed = nextPage !== currentPage.value || nextSize !== pageSize.value;
  currentPage.value = nextPage;
  pageSize.value = nextSize;
  if (changed) fetchOperations();
};

const editModalOpen = ref(false);
const editingTrade = ref(null);

const addModalOpen = ref(false);
const initialTradeData = computed(() => {
  if (!props.holding) return {};
  return {
    symbol: props.holding.symbol,
    market: props.holding.market,
    currentPrice: props.holding.currentPrice
  };
});

const handleEdit = (record) => {
  editingTrade.value = record;
  editModalOpen.value = true;
};

const checkIfCleared = async () => {
  await store.loadTrades();
  const normalized = normalizeSymbol(props.holding?.symbol);
  const stillHolding = store.holdings.some(h => normalizeSymbol(h.symbol) === normalized);
  if (!stillHolding) {
    message.success('交易成功，已清仓个股');
    emit('update:open', false);
    emit('changed', props.holding?.symbol);
    return true;
  }
  return false;
};

const onEditSuccess = async () => {
  editModalOpen.value = false;
  editingTrade.value = null;
  if (await checkIfCleared()) return;
  message.success('交易记录已更新');
  await fetchOperations();
  emit('changed', props.holding?.symbol);
};

const handleAddTrade = () => {
  addModalOpen.value = true;
};

const onAddSuccess = async () => {
  addModalOpen.value = false;
  if (await checkIfCleared()) return;
  message.success('交易记录已添加');
  await fetchOperations();
  emit('changed', props.holding?.symbol);
};

const handleDelete = async (record) => {
  try {
    await store.deleteTrade(record.id);
    if (await checkIfCleared()) return;
    message.success('交易记录已删除');
    await fetchOperations();
    emit('changed', record.symbol);
  } catch (err) {
    message.error('删除失败');
  }
};

const columns = [
  { title: '类型', key: 'type', width: 80 },
  { title: '数量', dataIndex: 'quantity', key: 'quantity', align: 'right', width: 100 },
  { title: '成交价', key: 'price', align: 'right', width: 120 },
  { title: '日期', key: 'date', width: 160 },
  { title: '操作', key: 'action', width: 120, align: 'center', fixed: 'right' }
];
</script>

<style scoped>
.metrics-panel {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1px;
  background: #f0f0f0;
  border-radius: 8px;
  overflow: hidden;
  margin-bottom: 16px;
  flex-shrink: 0;
}

.metric-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px;
  background: #fafafa;
}

.metric-label {
  font-size: 12px;
  color: rgba(0, 0, 0, 0.45);
  line-height: 1.4;
  white-space: nowrap;
}

.metric-value {
  font-size: 14px;
  font-weight: 600;
  color: #262626;
  line-height: 1.4;
  text-align: right;
}

.metric-value.positive {
  color: #cf1322;
}

.metric-value.negative {
  color: #3f8600;
}

.section-title {
  font-size: 16px;
  font-weight: bold;
  margin-bottom: 12px;
  border-left: 4px solid #1890ff;
  padding-left: 8px;
  color: #1f1f1f;
  flex-shrink: 0;
}

.body-content {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  max-height: calc(80vh - 55px);
  padding: 24px;
  box-sizing: border-box;
}

.table-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 180px;
}
</style>

<style>
/* 弹框内容区 flex 布局，让表格滚动条在弹框内部 */
.holding-detail-modal .ant-modal {
  max-height: 80vh !important;
  margin: 0 auto;
  padding-bottom: 0;
}

.holding-detail-modal .ant-modal-content {
  max-height: 80vh !important;
  display: flex !important;
  flex-direction: column !important;
  overflow: hidden !important;
}

.holding-detail-modal .ant-modal-body {
  flex: 1 !important;
  display: flex !important;
  flex-direction: column !important;
  overflow: hidden !important;
  min-height: 0 !important;
  padding: 0 !important;
}

.holding-detail-modal .ant-table-wrapper,
.holding-detail-modal .ant-spin-nested-loading,
.holding-detail-modal .ant-spin-container,
.holding-detail-modal .ant-table,
.holding-detail-modal .ant-table-container {
  min-height: 0;
}

.holding-detail-modal .ant-table-body {
  overflow-y: auto !important;
}
</style>
