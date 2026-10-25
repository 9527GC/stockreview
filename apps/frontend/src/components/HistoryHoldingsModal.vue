<template>
  <a-modal
    :open="open"
    title="历史持仓记录"
    @update:open="$emit('update:open', $event)"
    :footer="null"
    width="1000px"
    centered
    wrapClassName="history-holdings-modal"
    :style="{ paddingBottom: 0 }"
  >
    <div style="margin-bottom: 16px"><StockFilterInput v-model="stockSearch" @search="applyStockSearch" /></div>
    <a-table
      :columns="columns"
      :data-source="historyHoldings"
      :row-key="record => getHistoryCycleKey(record)"
      :loading="loading"
      :pagination="pagination"
      @change="handleTableChange"
      size="middle"
      :expand-column-width="72"
      :expandedRowKeys="expandedRowKeys"
      @expandedRowsChange="handleExpandedRowsChange"
      @expand="handleExpand"
      :scroll="{ y: 'calc(80vh - 220px)' }"
    >
      <template #expandColumnTitle>
        <span class="expand-column-title">详情</span>
      </template>
      <template #expandedRowRender="{ record }">
        <div v-if="isExpandedLoading(record)" class="group-loading">
          <a-spin />
        </div>
        <a-empty v-else-if="getExpandedGroups(record).length === 0" description="暂无交易记录" />
        <a-collapse
          v-else
          class="group-collapse"
          :activeKey="getExpandedActiveKey(record)"
          @change="(keys) => setExpandedActiveKey(record, keys)"
          size="small"
        >
          <a-collapse-panel
            v-for="group in getExpandedGroups(record)"
            :key="group.groupId"
          >
            <template #header>
              <div class="group-header">
                <span class="group-title">周期 {{ group.groupId }}</span>
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
                  <a-tag v-if="trade.type === 'COMPANY_ACTION'" color="purple">{{ actionTypeLabels[trade.actionType] || '其他' }}</a-tag>
                  <a-tag v-else :color="trade.type === 'BUY' ? 'red' : 'green'">
                    {{ trade.type === 'BUY' ? '买入' : '卖出' }}
                  </a-tag>
                </template>
                <template v-if="column.key === 'date'">
                  {{ dayjs(trade.date).format('YYYY-MM-DD HH:mm') }}
                </template>
                <template v-if="column.key === 'quantity'">
                  <span>{{ trade.type === 'COMPANY_ACTION' ? formatSignedNumber(trade.quantityChange) : trade.quantity }}</span>
                </template>
                <template v-if="column.key === 'price'">
                  <span>{{ trade.type === 'COMPANY_ACTION' ? formatActionDetails(trade) : `${getCurrencySymbol(trade.currency)}${Number(trade.price || 0).toFixed(2)}` }}</span>
                </template>
                <template v-if="column.key === 'action'">
                  <template v-if="trade.type !== 'COMPANY_ACTION'">
                    <a-button type="link" size="small" @click="handleEdit(trade, record)">编辑</a-button>
                    <a-popconfirm
                      title="确定要删除这条交易记录吗？"
                      @confirm="handleDeleteTrade(trade.id, record)"
                    >
                      <a-button type="link" danger size="small">删除</a-button>
                    </a-popconfirm>
                  </template>
                  <template v-else><a-button type="link" size="small" @click="handleEditAction(trade, record)">编辑</a-button><a-popconfirm title="确定要删除这条公司行动吗？" @confirm="handleDeleteCompanyAction(trade.id, record)"><a-button type="link" danger size="small">删除</a-button></a-popconfirm></template>

                </template>
              </template>
            </a-table>
          </a-collapse-panel>
        </a-collapse>
      </template>

      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'stock'">
          <div style="font-weight: 500;">{{ record.name }}</div>
          <div style="font-size: 12px; color: #999;">{{ record.symbol }} · {{ record.cycleId }}</div>
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
            title="确定要删除该标的的全部交易记录吗？"
            @confirm="handleDelete(record.symbol)"
          >
            <a-button type="link" danger size="small">删除</a-button>
          </a-popconfirm>
        </template>
      </template>
    </a-table>
  </a-modal>

  <CompanyActionModal v-model:open="actionEditModalOpen" mode="edit" :action="editingAction" @success="onActionEditSuccess" />

  <TradeModal
    v-model:open="editModalOpen"
    mode="edit"
    :trade="editingTrade"
    @success="onEditSuccess"
  />
</template>

<script setup>
import StockFilterInput from './StockFilterInput.vue';
import { computed, onUnmounted, ref, watch } from 'vue';
import { useTradeStore } from '@/stores/trade';
import { getHistoryHoldings, getHistoryHoldingGroups, deleteCompanyAction } from '@/api/index';
import { message } from 'ant-design-vue';
import dayjs from 'dayjs';
import { normalizeSymbol } from '@/utils/stock';
import { getHistoryCycleKey, selectHistoryCycleGroups } from '@/utils/historyCycles';
import TradeModal from './TradeModal.vue';
import CompanyActionModal from './CompanyActionModal.vue';

const props = defineProps({
  open: Boolean
});

const emit = defineEmits(['update:open', 'deleted', 'changed']);

const store = useTradeStore();

const stockSearch = ref('');
let searchTimer;
let historyRequest = 0;
const applyStockSearch = () => { clearTimeout(searchTimer); currentPage.value = 1; expandedRowKeys.value = []; fetchHistoryHoldings(); };
watch(stockSearch, () => { clearTimeout(searchTimer); searchTimer = setTimeout(applyStockSearch, 300); });
onUnmounted(() => clearTimeout(searchTimer));
const loading = ref(false);
const historyHoldings = ref([]);
const currentPage = ref(1);
const pageSize = ref(10);
const total = ref(0);
const sort = ref('-lastTradeDate');
const expandedRowKeys = ref([]);
const expandedByCycle = ref({});

const editModalOpen = ref(false);
const editingTrade = ref(null);
const editingSymbol = ref('');
const editingCycle = ref(null);
const actionEditModalOpen = ref(false);
const editingAction = ref(null);


const pagination = computed(() => ({
  current: currentPage.value,
  pageSize: pageSize.value,
  total: total.value,
  size: 'small',
  showSizeChanger: true,
  showTotal: t => `共 ${t} 条`
}));

const ensureExpandedState = (record) => {
  const key = getHistoryCycleKey(record);
  const map = expandedByCycle.value;
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
  const request = ++historyRequest;
  loading.value = true;
  try {
    const res = await getHistoryHoldings({
      page: currentPage.value,
      pageSize: pageSize.value,
      keyword: stockSearch.value.trim(),
      sort: sort.value
    });
    if (request !== historyRequest) return;
    historyHoldings.value = Array.isArray(res?.list) ? res.list : [];
    total.value = typeof res?.total === 'number' ? res.total : 0;
  } finally {
    if (request === historyRequest) loading.value = false;
  }
};

const fetchExpandedGroups = async (record) => {
  const key = getHistoryCycleKey(record);
  const state = ensureExpandedState(record);
  state.loading = true;
  try {
    const res = await getHistoryHoldingGroups(normalizeSymbol(record.symbol));
    state.list = selectHistoryCycleGroups(res?.list, key);
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

    const symbolKey = normalizeSymbol(symbol);
    const next = Object.fromEntries(
      Object.entries(expandedByCycle.value).filter(([cycleId]) => !cycleId.startsWith(`${symbolKey}:`))
    );
    expandedByCycle.value = next;
    expandedRowKeys.value = expandedRowKeys.value.filter(cycleId => !cycleId.startsWith(`${symbolKey}:`));
    fetchHistoryHoldings();
    emit('deleted');
  } catch (err) {
    message.error('清除失败');
  }
};

const handleDeleteTrade = async (id, cycle) => {
  try {
    await store.deleteTrade(id);
    message.success('交易记录已删除');

    if (cycle) {
      fetchExpandedGroups(cycle);
    }
    fetchHistoryHoldings();
    emit('changed', cycle?.symbol);
  } catch (err) {
    message.error('删除失败');
  }
};

const handleEdit = (record, cycle) => {
  editingTrade.value = record;
  editingSymbol.value = record.symbol || '';
  editingCycle.value = cycle || null;
  editModalOpen.value = true;
};

const onEditSuccess = async () => {
  editModalOpen.value = false;
  editingTrade.value = null;
  message.success('交易记录已更新');

  if (editingCycle.value) {
    fetchExpandedGroups(editingCycle.value);
  }
  fetchHistoryHoldings();
  emit('changed', editingSymbol.value);
  editingSymbol.value = '';
  editingCycle.value = null;
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
  expandedRowKeys.value = keys || [];
};

const handleExpand = (expanded, record) => {
  const key = getHistoryCycleKey(record);
  if (!key) return;
  if (expanded) {
    const state = ensureExpandedState(record);
    if (!state.loading && state.list.length === 0) {
      fetchExpandedGroups(record);
    }
  }
};

const getExpandedGroups = (record) => {
  const key = getHistoryCycleKey(record);
  const state = expandedByCycle.value[key];
  return state?.list || [];
};

const getExpandedActiveKey = (record) => {
  const key = getHistoryCycleKey(record);
  const state = expandedByCycle.value[key];
  return state?.activeKey || [];
};

const setExpandedActiveKey = (record, keys) => {
  const state = ensureExpandedState(record);
  state.activeKey = keys || [];
};

const isExpandedLoading = (record) => {
  const key = getHistoryCycleKey(record);
  const state = expandedByCycle.value[key];
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
    sorter: true,
    defaultSortOrder: 'descend'
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

const actionTypeLabels = { DIVIDEND: '现金分红', SPLIT: '拆股', MERGER: '合并', BONUS: '送股/转增', RIGHTS: '配股', OTHER: '其他' };

const formatSignedNumber = (value) => {
  const number = Number(value) || 0;
  return `${number > 0 ? '+' : ''}${number}`;
};
const getCurrencySymbol = (currency) => {
  const map = {
    'CNY': '¥',
    'HKD': 'HK$',
    'USD': '$'
  };
  return map[currency] || '¥';
};

const formatActionDetails = (action) => { if (action.actionType === 'DIVIDEND') return '每股分红 ' + getCurrencySymbol(action.currency) + Number(action.cashPerShare || 0).toFixed(4); if (action.actionType === 'SPLIT' || action.actionType === 'MERGER') return (action.beforeQuantity || action.ratioNumerator || '--') + ' : ' + (action.afterQuantity || action.ratioDenominator || '--'); if (action.actionType === 'BONUS') return '每 ' + (action.beforeQuantity || '--') + ' 股送转 ' + (action.bonusQuantity || 0) + ' 股'; return action.description || '--'; };
const handleEditAction = (action, cycle) => { editingCycle.value = cycle; editingAction.value = action; actionEditModalOpen.value = true; };
const handleDeleteCompanyAction = async (id, cycle) => { try { await deleteCompanyAction(id); message.success('公司行动已删除'); await fetchExpandedGroups(cycle); fetchHistoryHoldings(); emit('changed', cycle.symbol); } catch (err) { message.error('删除失败'); } };
const onActionEditSuccess = async (symbol) => { actionEditModalOpen.value = false; editingAction.value = null; if (editingCycle.value) await fetchExpandedGroups(editingCycle.value); editingCycle.value = null; fetchHistoryHoldings(); emit('changed', symbol); };

const innerColumns = [
  { title: '操作', key: 'type', width: 110 },
  { title: '数量', key: 'quantity', align: 'right', width: 110 },
  { title: '成交价', key: 'price', align: 'right', width: 220, ellipsis: true },
  { title: '日期', key: 'date', width: 160 },
  { title: '操作', key: 'action', width: 140, align: 'center' }
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
      expandedByCycle.value = {};
    }
  },
  { immediate: true }
);
</script>

<style scoped>
/* 保持 scoped 样式区域存在，避免空 style 标签 */
</style>

<style>
/* 弹框最大高度 80vh，内容区可滚动 */
.history-holdings-modal .ant-modal {
  max-height: 80vh !important;
  margin: 0 auto;
  padding-bottom: 0;
}

.history-holdings-modal .ant-modal-content {
  max-height: 80vh !important;
  display: flex !important;
  flex-direction: column !important;
  overflow: hidden !important;
}

.history-holdings-modal .ant-modal-body {
  flex: 1 !important;
  display: flex !important;
  flex-direction: column !important;
  overflow: hidden !important;
  min-height: 0 !important;
  padding: 24px !important;
  box-sizing: border-box !important;
}

.history-holdings-modal .ant-table-wrapper,
.history-holdings-modal .ant-spin-nested-loading,
.history-holdings-modal .ant-spin-container,
.history-holdings-modal .ant-table,
.history-holdings-modal .ant-table-container {
  min-height: 0;
}
</style>
