<template>
  <a-modal
    :open="open"
    title="历史持仓记录"
    @update:open="$emit('update:open', $event)"
    :footer="null"
    width="1000px"
    centered
    wrapClassName="history-holdings-modal"
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
        <div v-if="isExpandedLoading(record.symbol)" class="group-loading">
          <a-spin />
        </div>
        <a-empty v-else-if="getExpandedGroups(record.symbol).length === 0" description="暂无交易记录" />
        <a-collapse
          v-else
          class="group-collapse"
          :activeKey="getExpandedActiveKey(record.symbol)"
          @change="(keys) => setExpandedActiveKey(record.symbol, keys)"
          size="small"
        >
          <a-collapse-panel
            v-for="group in getExpandedGroups(record.symbol)"
            :key="group.groupId"
          >
            <template #header>
              <div class="group-header">
                <span class="group-title">第 {{ group.groupId }} 次分仓</span>
                <span>清仓 {{ dayjs(group.endDate).format('YYYY-MM-DD') }}</span>
                <span :class="group.realizedProfit >= 0 ? 'profit' : 'loss'">
                  {{ group.realizedProfit >= 0 ? '+' : '' }}{{ group.realizedProfit.toFixed(2) }}
                </span>
                <span :class="group.profitRate >= 0 ? 'profit' : 'loss'">
                  {{ group.profitRate >= 0 ? '+' : '' }}{{ (group.profitRate * 100).toFixed(2) }}%
                </span>
                <span>共 {{ group.tradesCount }} 笔</span>
                <a-tag v-if="group.hasAnomaly" color="orange" size="small">数据异常</a-tag>
              </div>
            </template>
            <a-table
              class="group-trades-table"
              :columns="innerColumns"
              :data-source="group.trades"
              :row-key="t => t.id"
              size="small"
              :pagination="false"
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
          </a-collapse-panel>
        </a-collapse>
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
import { getHistoryHoldings, getHistoryHoldingGroups } from '@/api/index';
import { message } from 'ant-design-vue';
import dayjs from 'dayjs';
import { normalizeSymbol } from '@/utils/stock';
import TradeModal from './TradeModal.vue';

const props = defineProps({
  open: Boolean
});

const emit = defineEmits(['update:open', 'deleted', 'changed']);

const store = useTradeStore();

const loading = ref(false);
const historyHoldings = ref([]);
const currentPage = ref(1);
const pageSize = ref(20);
const total = ref(0);
const sort = ref('-cumulativeProfit');
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
      activeKey: []
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

const fetchExpandedGroups = async (symbol) => {
  const key = normalizeSymbol(symbol);
  const state = ensureExpandedState(key);
  state.loading = true;
  try {
    const res = await getHistoryHoldingGroups(key);
    state.list = Array.isArray(res?.list) ? res.list : [];
    state.activeKey = state.list.length > 0 ? [state.list[0].groupId] : [];
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
      fetchExpandedGroups(symbol);
    }
    fetchHistoryHoldings();
    emit('changed', symbol);
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
    fetchExpandedGroups(editingSymbol.value);
  }
  fetchHistoryHoldings();
  emit('changed', editingSymbol.value);
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
    sort.value = '-cumulativeProfit';
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
      fetchExpandedGroups(key);
    }
  }
};

const getExpandedGroups = (symbol) => {
  const key = normalizeSymbol(symbol);
  const state = expandedBySymbol.value[key];
  return state?.list || [];
};

const getExpandedActiveKey = (symbol) => {
  const key = normalizeSymbol(symbol);
  const state = expandedBySymbol.value[key];
  return state?.activeKey || [];
};

const setExpandedActiveKey = (symbol, keys) => {
  const key = normalizeSymbol(symbol);
  const state = ensureExpandedState(key);
  state.activeKey = keys || [];
};

const isExpandedLoading = (symbol) => {
  const key = normalizeSymbol(symbol);
  const state = expandedBySymbol.value[key];
  return !!state?.loading;
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
  { title: '操作', key: 'action', width: 120, align: 'center' }
];

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      currentPage.value = 1;
      sort.value = '-cumulativeProfit';
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

<style>
.expand-column-title {
  display: inline-block;
  padding-left: 8px;
  white-space: nowrap;
}

.history-holdings-modal .ant-modal {
  height: 80vh;
  margin: 0 auto;
  padding-bottom: 0;
  display: flex;
  flex-direction: column;
}

.history-holdings-modal .ant-modal-content {
  flex: 1;
  max-height: 100%;
  display: flex;
  flex-direction: column;
}

.history-holdings-modal .ant-modal-body {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

.history-holdings-modal .ant-table-expanded-row-fixed,
.history-holdings-modal .ant-table-expanded-row {
  padding: 0 0 16px 0 !important;
  background: #fbfbfb !important;
}

.history-holdings-modal .ant-table-expanded-row-fixed > td,
.history-holdings-modal .ant-table-expanded-row > td {
  padding-left: 0 !important;
  padding-right: 0 !important;
}

.history-holdings-modal .group-collapse {
  width: 100% !important;
}

.history-holdings-modal .group-collapse .ant-collapse-header {
  padding: 12px 24px !important;
}

.history-holdings-modal .group-collapse .ant-collapse-content-box {
  padding: 12px 0 !important;
}

.history-holdings-modal .group-collapse .ant-collapse-header-text,
.history-holdings-modal .group-collapse .ant-collapse-expand-icon {
  margin-left: 0 !important;
  padding-left: 0 !important;
}

.history-holdings-modal .group-trades-table,
.history-holdings-modal .group-trades-table .ant-table,
.history-holdings-modal .group-trades-table .ant-table-container,
.history-holdings-modal .group-trades-table .ant-table-content,
.history-holdings-modal .group-trades-table table {
  width: 100% !important;
}

.history-holdings-modal .group-trades-table .ant-table {
  margin-left: 0 !important;
  margin-right: 0 !important;
}

.history-holdings-modal .group-trades-table .ant-table-cell {
  padding-left: 8px !important;
  padding-right: 8px !important;
}

.history-holdings-modal .group-trades-table .ant-table-thead > tr > th:first-child,
.history-holdings-modal .group-trades-table .ant-table-tbody > tr > td:first-child {
  padding-left: 24px !important;
}

.group-loading {
  padding: 24px 0;
  text-align: center;
}

.group-header {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  font-size: 14px;
}

.group-title {
  font-weight: 500;
}

.group-header .profit {
  color: #cf1322;
  font-weight: 500;
}

.group-header .loss {
  color: #3f8600;
  font-weight: 500;
}
</style>
