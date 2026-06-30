<template>
  <a-modal
    :open="open"
    title="持仓明细"
    @update:open="$emit('update:open', $event)"
    :footer="null"
    width="780px"
    centered
  >
    <div v-if="!holding" style="color: #999; padding: 12px 0;">未选择持仓</div>

    <template v-else>
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
      </div>

      <div class="section-title" style="margin-top: 16px;">操作记录</div>
      <a-table
        :columns="columns"
        :data-source="operations"
        :loading="loading"
        :pagination="pagination"
        @change="handleTableChange"
        size="middle"
        :row-key="r => r.id"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'type'">
            <a-tag :color="record.type === 'BUY' ? 'red' : 'green'">
              {{ record.type === 'BUY' ? '买入' : '卖出' }}
            </a-tag>
          </template>
          <template v-if="column.key === 'price'">
            {{ currencySymbol }}{{ Number(record.price || 0).toFixed(2) }}
          </template>
          <template v-if="column.key === 'date'">
            {{ dayjs(record.date).format('YYYY-MM-DD HH:mm') }}
          </template>
        </template>
      </a-table>
    </template>
  </a-modal>
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import dayjs from 'dayjs';
import { getTradeReviews } from '@/api/index';
import { normalizeSymbol } from '@/utils/stock';

const props = defineProps({
  open: Boolean,
  holding: {
    type: Object,
    default: null
  }
});

defineEmits(['update:open']);

const operations = ref([]);
const loading = ref(false);
const currentPage = ref(1);
const pageSize = ref(20);
const total = ref(0);
const hasTotal = ref(false);

const parseListResponse = (res) => {
  if (!res) return { list: [], total: undefined };
  if (Array.isArray(res)) return { list: res, total: undefined };
  if (Array.isArray(res.list)) return { list: res.list, total: res.total ?? res.count };
  if (res.data && Array.isArray(res.data.list)) return { list: res.data.list, total: res.data.total ?? res.data.count };
  return { list: [], total: res.total ?? res.count };
};

const fetchOperations = async () => {
  const symbol = normalizeSymbol(props.holding?.symbol);
  if (!props.open || !symbol) return;

  loading.value = true;
  try {
    const res = await getTradeReviews({
      symbol,
      page: currentPage.value,
      pageSize: pageSize.value
    });
    const parsed = parseListResponse(res);
    operations.value = parsed.list || [];
    if (typeof parsed.total === 'number') {
      total.value = parsed.total;
      hasTotal.value = true;
    } else {
      total.value = 0;
      hasTotal.value = false;
    }
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

const columns = [
  { title: '操作', key: 'type', width: 80 },
  { title: '数量', dataIndex: 'quantity', key: 'quantity', align: 'right', width: 100 },
  { title: '成交价', key: 'price', align: 'right', width: 120 },
  { title: '日期', key: 'date', width: 160 }
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
}
</style>
