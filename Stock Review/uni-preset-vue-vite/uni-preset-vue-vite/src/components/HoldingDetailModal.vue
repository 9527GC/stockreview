<template>
  <a-modal
    :open="open"
    title="持仓明细"
    @update:open="$emit('update:open', $event)"
    :footer="null"
    width="900px"
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

      <a-row :gutter="[16, 16]" style="margin-bottom: 16px;">
        <a-col :span="8">
          <a-card :bordered="false" style="background: #fafafa;">
            <div style="color: rgba(0,0,0,0.45); font-size: 12px;">今日盈亏</div>
            <div v-if="holding.dailyProfit !== null && holding.dailyProfit !== undefined" :style="{ color: holding.dailyProfit >= 0 ? '#cf1322' : '#3f8600', fontWeight: '600' }">
              {{ holding.dailyProfit >= 0 ? '+' : '' }}{{ currencySymbol }}{{ Number(holding.dailyProfit).toFixed(2) }}
            </div>
            <div v-else style="color: #999; font-weight: 600;">--</div>
          </a-card>
        </a-col>
        <a-col :span="8">
          <a-card :bordered="false" style="background: #fafafa;">
            <div style="color: rgba(0,0,0,0.45); font-size: 12px;">持仓盈亏</div>
            <div v-if="holding.unrealizedProfit !== null && holding.unrealizedProfit !== undefined" :style="{ color: holding.unrealizedProfit >= 0 ? '#cf1322' : '#3f8600', fontWeight: '600' }">
              {{ holding.unrealizedProfit >= 0 ? '+' : '' }}{{ currencySymbol }}{{ Number(holding.unrealizedProfit).toFixed(2) }}
            </div>
            <div v-else style="color: #999; font-weight: 600;">--</div>
          </a-card>
        </a-col>
        <a-col :span="8">
          <a-card :bordered="false" style="background: #fafafa;">
            <div style="color: rgba(0,0,0,0.45); font-size: 12px;">累计盈亏</div>
            <div v-if="holding.cumulativeProfit !== null && holding.cumulativeProfit !== undefined" :style="{ color: holding.cumulativeProfit >= 0 ? '#cf1322' : '#3f8600', fontWeight: '600' }">
              {{ holding.cumulativeProfit >= 0 ? '+' : '' }}{{ currencySymbol }}{{ Number(holding.cumulativeProfit).toFixed(2) }}
            </div>
            <div v-else style="color: #999; font-weight: 600;">--</div>
          </a-card>
        </a-col>
        <a-col :span="8">
          <a-card :bordered="false" style="background: #fafafa;">
            <div style="color: rgba(0,0,0,0.45); font-size: 12px;">持仓数量</div>
            <div style="font-weight: 600; color: #1f1f1f;">{{ holding.quantity !== null && holding.quantity !== undefined ? Number(holding.quantity) : '--' }}</div>
          </a-card>
        </a-col>
        <a-col :span="8">
          <a-card :bordered="false" style="background: #fafafa;">
            <div style="color: rgba(0,0,0,0.45); font-size: 12px;">持仓成本</div>
            <div style="font-weight: 600; color: #1f1f1f;">{{ holding.avgCost !== null && holding.avgCost !== undefined ? (currencySymbol + Number(holding.avgCost).toFixed(2)) : '--' }}</div>
          </a-card>
        </a-col>
        <a-col :span="8">
          <a-card :bordered="false" style="background: #fafafa;">
            <div style="color: rgba(0,0,0,0.45); font-size: 12px;">成本金额</div>
            <div style="font-weight: 600; color: #1f1f1f;">{{ totalCost !== null ? (currencySymbol + totalCost.toFixed(2)) : '--' }}</div>
          </a-card>
        </a-col>
      </a-row>

      <div style="font-weight: 600; color: #1f1f1f; margin-bottom: 8px;">操作记录</div>
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

