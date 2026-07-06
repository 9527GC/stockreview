<template>
  <a-modal
    :open="open"
    title="历史持仓记录"
    @update:open="$emit('update:open', $event)"
    :footer="null"
    width="1000px"
    centered
  >
    <a-table
      :columns="columns"
      :data-source="historyHoldings"
      :row-key="record => record.symbol"
      :loading="loading"
      :pagination="pagination"
      @change="handleTableChange"
      size="middle"
      :expand-column-width="72"
      :expandedRowKeys="expandedRowKeys"
      @expandedRowsChange="handleExpandedRowsChange"
      @expand="handleExpand"
    >
      <template #expandColumnTitle>
        <span class="expand-column-title">详情</span>
      </template>
      <template #expandedRowRender="{ record }">
        <a-table
          :columns="innerColumns"
          :data-source="getExpandedTrades(record.symbol)"
          :loading="isExpandedLoading(record.symbol)"
          :pagination="getExpandedPagination(record.symbol)"
          @change="(p) => handleExpandedTableChange(record.symbol, p)"
          size="small"
          :row-key="t => t.id"
        >
          <template #bodyCell="{ column, record: trade }">
            <template v-if="column.key === 'type'">
              <a-tag :color="trade.type === 'BUY' ? 'red' : 'green'">
                {{ trade.type === 'BUY' ? '买入' : '卖出' }}
              </a-tag>
            </template>
            <template v-if="column.key === 'date'">
              {{ dayjs(trade.date).format('YYYY-MM-DD HH:mm') }}
            </template>
            <template v-if="column.key === 'amount'">
              {{ getCurrencySymbol(trade.currency) }}{{ (trade.price * trade.quantity).toFixed(2) }}
            </template>
            <template v-if="column.key === 'action'">
              <a-button type="link" size="small" @click="handleEdit(trade)">编辑</a-button>
              <a-popconfirm
                title="确定要删除这条交易记录吗？"
                @confirm="handleDeleteTrade(trade.id, record.symbol)"
              >
                <a-button type="link" danger size="small">删除</a-button>
              </a-popconfirm>
            </template>
          </template>
        </a-table>
      </template>
      
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'stock'">
          <div style="font-weight: 500;">{{ record.name }}</div>
          <div style="font-size: 12px; color: #999;">{{ record.symbol }}</div>
        </template>
        <template v-if="column.key === 'cumulativeProfit'">
          <span :style="{ color: record.cumulativeProfit >= 0 ? '#cf1322' : '#3f8600', fontWeight: '500' }">
            {{ record.cumulativeProfit >= 0 ? '+' : '' }}{{ record.cumulativeProfit.toFixed(2) }}
          </span>
        </template>
        <template v-if="column.key === 'profitRate'">
          <span :style="{ color: record.profitRate >= 0 ? '#cf1322' : '#3f8600' }">
            {{ record.profitRate >= 0 ? '+' : '' }}{{ (record.profitRate * 100).toFixed(2) }}%
          </span>
        </template>
        <template v-if="column.key === 'lastTradeDate'">
          <span style="color: rgba(0,0,0,0.65);">
            {{ record.lastTradeDate ? dayjs(record.lastTradeDate).format('YYYY-MM-DD HH:mm') : '--' }}
          </span>
        </template>
        <template v-if="column.key === 'action'">
          <a-popconfirm
            title="确定要彻底删除该股票的所有复盘记录吗？"
            @confirm="handleDelete(record.symbol)"
          >
            <a-button type="link" danger size="small">删除</a-button>
          </a-popconfirm>
        </template>
      </template>
    </a-table>
  </a-modal>

  <TradeModal
    v-model:open="editModalOpen"
    mode="edit"
    :trade="editingTrade"
    @success="onEditSuccess"
  />
</template>

<script setup>
import { computed, ref, watch } from 'vue';
import { useTradeStore } from '@/stores/trade';
import { getHistoryHoldings, getTradeReviews } from '@/api/index';
import { message } from 'ant-design-vue';
import dayjs from 'dayjs';
import { normalizeSymbol } from '@/utils/stock';
import TradeModal from './TradeModal.vue';

const props = defineProps({
  open: Boolean
});

const emit = defineEmits(['update:open', 'deleted']);

const store = useTradeStore();

const loading = ref(false);
const historyHoldings = ref([]);
const currentPage = ref(1);
const pageSize = ref(20);
const total = ref(0);
const sort = ref('-lastTradeDate');
const expandedRowKeys = ref([]);
const expandedBySymbol = ref({});

const editModalOpen = ref(false);
const editingTrade = ref(null);
const editingSymbol = ref('');

const pagination = computed(() => ({
  current: currentPage.value,
  pageSize: pageSize.value,
  total: total.value,
  size: 'small',
  showSizeChanger: true,
  showTotal: t => `共 ${t} 条`
}));

const ensureExpandedState = (symbol) => {
  const key = normalizeSymbol(symbol);
  const map = expandedBySymbol.value;
  if (!map[key]) {
    map[key] = {
      list: [],
      loading: false,
      current: 1,
      pageSize: 20,
      total: 0,
      hasTotal: false
    };
  }
  return map[key];
};

const fetchHistoryHoldings = async () => {
  if (!props.open) return;
  loading.value = true;
  try {
    const res = await getHistoryHoldings({
      page: currentPage.value,
      pageSize: pageSize.value,
      sort: sort.value
    });
    historyHoldings.value = Array.isArray(res?.list) ? res.list : [];
    total.value = typeof res?.total === 'number' ? res.total : 0;
  } finally {
    loading.value = false;
  }
};

const fetchExpandedTrades = async (symbol) => {
  const key = normalizeSymbol(symbol);
  const state = ensureExpandedState(key);
  state.loading = true;
  try {
    const res = await getTradeReviews({
      symbol: key,
      page: state.current,
      pageSize: state.pageSize
    });
    state.list = Array.isArray(res?.list) ? res.list : [];
    if (typeof res?.total === 'number') {
      state.total = res.total;
      state.hasTotal = true;
    } else {
      state.total = 0;
      state.hasTotal = false;
    }
  } finally {
    state.loading = false;
  }
};

const handleDelete = async (symbol) => {
  try {
    const res = await store.deleteHolding(symbol);
    const deletedTradesCount = res?.deletedTradesCount;
    if (deletedTradesCount !== null && deletedTradesCount !== undefined) {
      message.success(`持仓及历史交易已删除（${deletedTradesCount}条）`);
    } else {
      message.success('历史记录已彻底清除');
    }

    const key = normalizeSymbol(symbol);
    const next = { ...expandedBySymbol.value };
    delete next[key];
    expandedBySymbol.value = next;
    expandedRowKeys.value = expandedRowKeys.value.filter(k => k !== key);
    fetchHistoryHoldings();
    emit('deleted');
  } catch (err) {
    message.error('清除失败');
  }
};

const handleDeleteTrade = async (id, symbol) => {
  try {
    await store.deleteTrade(id);
    message.success('交易记录已删除');

    if (symbol) {
      const state = ensureExpandedState(symbol);
      state.current = 1;
      fetchExpandedTrades(symbol);
    }
    fetchHistoryHoldings();
  } catch (err) {
    message.error('删除失败');
  }
};

const handleEdit = (record) => {
  editingTrade.value = record;
  editingSymbol.value = record.symbol || '';
  editModalOpen.value = true;
};

const onEditSuccess = async () => {
  editModalOpen.value = false;
  editingTrade.value = null;
  message.success('交易记录已更新');

  if (editingSymbol.value) {
    const state = ensureExpandedState(editingSymbol.value);
    state.current = 1;
    fetchExpandedTrades(editingSymbol.value);
  }
  fetchHistoryHoldings();
  editingSymbol.value = '';
};

const handleTableChange = (paginationConfig, filters, sorterConfig) => {
  const p = paginationConfig || {};
  currentPage.value = p.current || 1;
  pageSize.value = p.pageSize || pageSize.value;

  const s = Array.isArray(sorterConfig) ? sorterConfig[0] : sorterConfig;
  if (s && s.field && s.order) {
    const prefix = s.order === 'descend' ? '-' : '';
    sort.value = `${prefix}${s.field}`;
  } else if (s && s.field && !s.order) {
    sort.value = '-lastTradeDate';
  }

  fetchHistoryHoldings();
};

const handleExpandedRowsChange = (keys) => {
  expandedRowKeys.value = (keys || []).map(k => normalizeSymbol(k));
};

const handleExpand = (expanded, record) => {
  const key = normalizeSymbol(record?.symbol);
  if (!key) return;
  if (expanded) {
    const state = ensureExpandedState(key);
    if (!state.loading && state.list.length === 0) {
      fetchExpandedTrades(key);
    }
  }
};

const getExpandedTrades = (symbol) => {
  const key = normalizeSymbol(symbol);
  const state = expandedBySymbol.value[key];
  return state?.list || [];
};

const isExpandedLoading = (symbol) => {
  const key = normalizeSymbol(symbol);
  const state = expandedBySymbol.value[key];
  return !!state?.loading;
};

const getExpandedPagination = (symbol) => {
  const key = normalizeSymbol(symbol);
  const state = ensureExpandedState(key);
  if (!state.hasTotal) return false;
  return {
    current: state.current,
    pageSize: state.pageSize,
    total: state.total,
    size: 'small',
    showSizeChanger: true,
    showTotal: t => `共 ${t} 条`
  };
};

const handleExpandedTableChange = (symbol, paginationConfig) => {
  const key = normalizeSymbol(symbol);
  const state = ensureExpandedState(key);
  const p = paginationConfig || {};
  const nextPage = p.current || 1;
  const nextSize = p.pageSize || state.pageSize;
  const changed = nextPage !== state.current || nextSize !== state.pageSize;
  state.current = nextPage;
  state.pageSize = nextSize;
  if (changed) fetchExpandedTrades(key);
};

const columns = [
  { title: '股票', key: 'stock', width: 200 },
  { 
    title: '累计盈亏', 
    dataIndex: 'cumulativeProfit', 
    key: 'cumulativeProfit', 
    align: 'right',
    sorter: true
  },
  { 
    title: '累计盈亏率', 
    dataIndex: 'profitRate', 
    key: 'profitRate', 
    align: 'right',
    sorter: true
  },
  {
    title: '最后交易',
    dataIndex: 'lastTradeDate',
    key: 'lastTradeDate',
    width: 170,
    sorter: true
  },
  {
    title: '交易次数',
    dataIndex: 'tradesCount',
    key: 'tradesCount',
    width: 110,
    align: 'right',
    sorter: true
  },
  { title: '操作', key: 'action', width: 100, align: 'center' }
];

const getCurrencySymbol = (currency) => {
  const map = {
    'CNY': '¥',
    'HKD': 'HK$',
    'USD': '$'
  };
  return map[currency] || '¥';
};

const innerColumns = [
  { title: '交易时间', key: 'date', width: 160 },
  { title: '类型', key: 'type', width: 80 },
  { title: '价格', dataIndex: 'price', key: 'price', align: 'right' },
  { title: '数量', dataIndex: 'quantity', key: 'quantity', align: 'right' },
  { title: '金额', key: 'amount', align: 'right' },
  { title: '手续费', dataIndex: 'commission', key: 'commission', align: 'right' },
  { title: '交易逻辑', dataIndex: 'logic', key: 'logic', ellipsis: true },
  { title: '操作', key: 'action', width: 120, align: 'center', fixed: 'right' }
];

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      currentPage.value = 1;
      sort.value = '-lastTradeDate';
      fetchHistoryHoldings();
    } else {
      historyHoldings.value = [];
      total.value = 0;
      expandedRowKeys.value = [];
      expandedBySymbol.value = {};
    }
  },
  { immediate: true }
);
</script>

<style scoped>
.expand-column-title {
  display: inline-block;
  padding-left: 8px;
  white-space: nowrap;
}

:deep(.ant-table-expanded-row-fixed) {
  padding: 0 16px 16px 50px !important;
  background: #fbfbfb;
}
</style>
