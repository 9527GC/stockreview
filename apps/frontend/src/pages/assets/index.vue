<template>
  <PCLayout pageTitle="我的资产" activeKey="assets">
    <div class="assets-content-wrapper">
      <a-row :gutter="[16, 16]">
        <a-col :xl="6" :lg="12" :md="12" :sm="24" :xs="24">
          <a-card :bordered="false" class="dashboard-card">
            <div class="card-label">今日盈亏</div>
            <div class="card-value" :style="{ color: (store.totalDailyProfit || 0) >= 0 ? '#cf1322' : '#3f8600' }">
              {{ (store.totalDailyProfit || 0) >= 0 ? '+' : '' }}{{ (store.totalDailyProfit || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}
            </div>
            <div class="card-footer">
              <span :style="{ color: (store.totalDailyProfit || 0) >= 0 ? '#cf1322' : '#3f8600' }">
                {{ (store.totalAssets || 0) > 0 ? (((store.totalDailyProfit || 0) / store.totalAssets) * 100).toFixed(2) : '0.00' }}%
                <ArrowUpOutlined v-if="(store.totalDailyProfit || 0) >= 0" style="font-size: 12px;" />
                <ArrowDownOutlined v-else style="font-size: 12px;" />
              </span>
            </div>
          </a-card>
        </a-col>
        <a-col :xl="6" :lg="12" :md="12" :sm="24" :xs="24">
          <a-card :bordered="false" class="dashboard-card">
            <div class="card-label">累计盈亏</div>
            <div class="card-value" :style="{ color: (store.totalProfit || 0) >= 0 ? '#cf1322' : '#3f8600' }">
               {{ (store.totalProfit || 0) >= 0 ? '+' : '' }}{{ (store.totalProfit || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}
            </div>
            <div class="card-footer">
               <div class="profit-rate-wrapper">
                 <span :style="{ color: (store.totalProfit || 0) >= 0 ? '#cf1322' : '#3f8600', fontWeight: '500' }">
                   {{ (store.totalAssets || 0) > 0 ? (store.totalProfit / store.totalAssets * 100).toFixed(2) : '0.00' }}%
                 </span>
               </div>
            </div>
          </a-card>
        </a-col>
        <a-col :xl="6" :lg="12" :md="12" :sm="24" :xs="24">
          <a-card :bordered="false" class="dashboard-card">
            <div class="card-label">总资产 (CNY)</div>
            <div class="card-value">
              <template v-if="store.hasAssetsSummary">¥ {{ store.totalAssets.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}</template>
              <template v-else>--</template>
            </div>
            <div class="card-footer" style="display: flex; justify-content: space-between; align-items: center;">
              <div>
                <span>本金 <span style="color: rgba(0, 0, 0, 0.85); font-weight: 500;">
                  <template v-if="store.hasAssetsSummary && store.currentPrincipal !== null && store.currentPrincipal !== undefined">¥ {{ store.currentPrincipal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}</template>
                  <template v-else>--</template>
                </span></span>
              </div>
              <a-button type="link" size="small" style="padding: 0; height: auto; line-height: 1; font-size: 12px;" @click="showTransferModal">添加转账</a-button>
            </div>
          </a-card>
        </a-col>
        <a-col :xl="6" :lg="12" :md="12" :sm="24" :xs="24">
          <a-card :bordered="false" class="dashboard-card">
            <div class="card-label">持仓市值</div>
            <div class="card-value">¥ {{ (store.holdingsMarketValue || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}</div>
            <div class="card-footer">
              <span>持仓股数 <span style="color: rgba(0, 0, 0, 0.85); font-weight: 500;">{{ store.totalHoldingsCount || 0 }} 只</span></span>
              <span style="margin-left: 12px;">仓位占比 <span style="color: rgba(0, 0, 0, 0.85); font-weight: 500;">{{ (store.totalAssets || 0) > 0 ? ((store.holdingsMarketValue || 0) / store.totalAssets * 100).toFixed(2) : '0.00' }}%</span></span>
            </div>
          </a-card>
        </a-col>
      </a-row>

      <!-- Market Overview -->
      <a-row :gutter="[16, 16]" style="margin-top: 16px" v-if="store.marketOverview && store.marketOverview.length">
        <a-col :span="24">
          <a-card :bordered="false" :body-style="{ padding: '12px 24px' }" :title="`今日大盘 ${todayStr}`">
            <div style="display: flex; gap: 32px; flex-wrap: wrap; align-items: center;">
              <div
                v-for="item in store.marketOverview"
                :key="item.symbol"
                style="display: flex; align-items: baseline; gap: 8px;"
              >
                <span style="font-weight: 500; color: rgba(0,0,0,0.85);">{{ item.name || item.symbol }}</span>
                <span style="font-size: 16px; font-weight: 600;">{{ item.price !== undefined ? Number(item.price).toFixed(2) : '--' }}</span>
                <span
                  :style="{ color: (item.changePercent || 0) >= 0 ? '#cf1322' : '#3f8600' }"
                >
                  {{ (item.changePercent || 0) >= 0 ? '+' : '' }}{{ Number(item.changePercent || 0).toFixed(2) }}%
                </span>
              </div>
            </div>
          </a-card>
        </a-col>
      </a-row>

    <!-- Side-by-Side Analysis Sections -->
    <a-row :gutter="[16, 16]" style="margin-top: 16px">
      <!-- Left: Profit Curve -->
      <a-col :xl="12" :lg="12" :md="24" :sm="24" :xs="24">
        <a-card :bordered="false" :body-style="{ padding: '24px' }" style="height: 381px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
            <span style="font-size: 16px; font-weight: 500; color: rgba(0,0,0,0.85);">收益曲线</span>
            <div style="display: flex; align-items: center; gap: 8px;">
              <a-radio-group v-model:value="dateShortcut" size="small" @change="handleShortcutChange">
                <a-radio-button value="month">本月</a-radio-button>
                <a-radio-button value="quarter">近三月</a-radio-button>
                <a-radio-button value="year">今年</a-radio-button>
                <a-radio-button value="all">全部</a-radio-button>
              </a-radio-group>
              <a-range-picker v-model:value="dateRange" size="small" style="width: 220px" @change="handleRangeChange" />
            </div>
          </div>
          <div v-if="chartData.length === 0" style="padding: 90px 0;">
            <a-empty description="暂无持仓" />
          </div>
          <div v-else>
            <ProfitChart :data="chartData" style="height: 281px; width: 100%;" />
          </div>
        </a-card>
      </a-col>

      <!-- Right: Profit Calendar -->
      <a-col :xl="12" :lg="12" :md="24" :sm="24" :xs="24">
        <a-card :bordered="false" :body-style="{ padding: '0' }" style="height: 381px; overflow: hidden;">
           <ProfitCalendar ref="profitCalendarRef" />
        </a-card>
      </a-col>
    </a-row>

    <!-- Holdings Table -->
    <a-card :bordered="false" style="margin-top: 16px" :body-style="{ padding: '24px' }">
      <div class="table-operator" style="margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center;">
        <div style="display: flex; align-items: center; gap: 16px;">
          <span style="font-size: 16px; font-weight: 500; color: rgba(0,0,0,0.85);">持仓明细</span>
          <a-radio-group
            v-model:value="marketFilter"
            class="market-filter-group"
            @change="handleMarketChange"
          >
            <a-radio-button value="all">全部</a-radio-button>
            <a-radio-button value="CN">A股</a-radio-button>
            <a-radio-button value="HK">港股</a-radio-button>
            <a-radio-button value="US">美股</a-radio-button>
          </a-radio-group>
        </div>
        <div style="display: flex; gap: 8px;"><a-button @click="showCorporateActionModal">公司行动</a-button><a-button @click="showHistoryModal">
          <template #icon><HistoryOutlined /></template>
          查看历史持仓
        </a-button></div>
      </div>
      <a-table
        :columns="columns"
        :data-source="sortedHoldings"
        :row-key="record => record.symbol"
        :pagination="holdingsPagination"
        :scroll="{ x: 1000 }"
        :loading="store.loading || store.refreshing"
        @change="handlePaginationChange"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'stock'">
             <div style="display: flex; align-items: flex-start;">
               <div v-if="record.marketTag" 
                    :style="{ 
                      backgroundColor: record.marketTagColor, 
                      color: '#fff', 
                      fontSize: '9px', 
                      borderRadius: '2px', 
                      marginRight: '6px',
                      height: '14px',
                      width: '20px',
                      lineHeight: '14px',
                      textAlign: 'center',
                      fontWeight: 'bold',
                      flexShrink: 0,
                      marginTop: '2px'
                    }">
                 {{ record.marketTag }}
               </div>
               <div>
                 <div style="font-weight: 500; color: #1f1f1f; line-height: 1.4;">{{ record.name || '--' }}</div>
                 <div style="font-size: 12px; color: #999; line-height: 1.2;">{{ record.symbol }}</div>
               </div>
             </div>
          </template>
          <template v-if="column.key === 'marketValueQuantity'">
             <div>
               <div style="font-weight: 500; color: #1f1f1f;">{{ record.marketValue !== null && record.marketValue !== undefined ? (getCurrencySymbol(record.currency) + record.marketValue.toFixed(2)) : '--' }}</div>
               <div style="font-size: 12px; color: #999;">{{ record.quantity }}股</div>
             </div>
          </template>
          <template v-if="column.key === 'currentCost'">
             <div>
               <div style="font-weight: 500; color: #1f1f1f;">{{ record.currentPrice !== null && record.currentPrice !== undefined ? (getCurrencySymbol(record.currency) + Number(record.currentPrice).toFixed(2)) : '--' }}</div>
               <div style="font-size: 12px; color: #999;">{{ record.avgCost !== null && record.avgCost !== undefined ? (getCurrencySymbol(record.currency) + Number(record.avgCost).toFixed(2)) : '--' }}</div>
             </div>
          </template>
          <template v-if="column.key === 'position'">
            <div style="font-weight: 500; color: #1f1f1f;">
              {{
                record.positionPercent !== null && record.positionPercent !== undefined
                  ? Number(record.positionPercent).toFixed(2)
                  : (
                      record.positionRatio !== null && record.positionRatio !== undefined
                        ? (Number(record.positionRatio) * 100).toFixed(2)
                        : (
                            record.marketValueCNY !== null && record.marketValueCNY !== undefined && store.totalAssets > 0
                              ? ((Number(record.marketValueCNY) / store.totalAssets) * 100).toFixed(2)
                              : '0.00'
                          )
                    )
              }}%
            </div>
          </template>
          <template v-if="column.key === 'unrealizedProfit'">
            <span v-if="record.unrealizedProfit !== null && record.unrealizedProfit !== undefined" :style="{ color: record.unrealizedProfit >= 0 ? '#cf1322' : '#3f8600' }">
              {{ record.unrealizedProfit >= 0 ? '+' : '' }}{{ Number(record.unrealizedProfit).toFixed(2) }}
            </span>
            <span v-else style="color: #999;">--</span>
          </template>
          <template v-if="column.key === 'profitRate'">
            <span v-if="record.profitRate !== null && record.profitRate !== undefined" :style="{ color: record.profitRate >= 0 ? '#cf1322' : '#3f8600' }">
              {{ record.profitRate >= 0 ? '+' : '' }}{{ (Number(record.profitRate) * 100).toFixed(2) }}%
            </span>
            <span v-else style="color: #999;">--</span>
          </template>
          <template v-if="column.key === 'dailyProfit'">
            <span v-if="record.dailyProfit !== null && record.dailyProfit !== undefined" :style="{ color: record.dailyProfit >= 0 ? '#cf1322' : '#3f8600' }">
              {{ record.dailyProfit >= 0 ? '+' : '' }}{{ record.dailyProfit.toFixed(2) }}
            </span>
            <span v-else style="color: #999;">--</span>
          </template>
          <template v-if="column.key === 'dailyProfitRate'">
            <span v-if="record.dailyProfitRate !== null && record.dailyProfitRate !== undefined" :style="{ color: record.dailyProfitRate >= 0 ? '#cf1322' : '#3f8600' }">
              {{ record.dailyProfitRate >= 0 ? '+' : '' }}{{ (record.dailyProfitRate * 100).toFixed(2) }}%
            </span>
            <span v-else style="color: #999;">--</span>
          </template>
          <template v-if="column.key === 'cumulativeProfit'">
            <span v-if="record.cumulativeProfit !== null && record.cumulativeProfit !== undefined" :style="{ color: record.cumulativeProfit >= 0 ? '#cf1322' : '#3f8600' }">
              {{ record.cumulativeProfit >= 0 ? '+' : '' }}{{ Number(record.cumulativeProfit).toFixed(2) }}
            </span>
            <span v-else style="color: #999;">--</span>
          </template>
          <template v-if="column.key === 'action'">
            <div style="white-space: nowrap; display: flex; gap: 8px; justify-content: center;">
              <a-button type="link" size="small" @click="showHoldingDetail(record)" style="padding: 0 4px; color: #1890ff;">明细</a-button>
              <a-button type="link" size="small" @click="showCompanyAction(record)" style="padding: 0 4px; color: #722ed1;">行动</a-button>
              <a-button type="link" size="small" danger @click="handleDelete(record)" style="padding: 0 4px;">删除</a-button>
            </div>
          </template>
        </template>
      </a-table>
    </a-card>

    <HistoryHoldingsModal v-model:open="isHistoryModalVisible" @deleted="handleHistoryChanged" @changed="handleHistoryChanged" />
    <HoldingDetailModal v-model:open="isHoldingDetailModalVisible" :holding="selectedHolding" @changed="handleHoldingChanged" />
    <CompanyActionModal v-model:open="isCompanyActionModalVisible" :holding="selectedHolding" @success="handleHoldingChanged" />
    <TransferModal v-model:open="isTransferModalVisible" @success="handleTransferSuccess" />
    <CorporateActionModal v-model:open="isCorporateActionModalVisible" @changed="handleCorporateActionChanged" />
    </div>
  </PCLayout>
</template>

<script setup>
import { ref, onMounted, computed, onUnmounted } from 'vue';
import PCLayout from '@/layouts/PCLayout.vue';
import ProfitChart from '@/components/ProfitChart.vue';
import ProfitCalendar from '@/components/ProfitCalendar.vue';
import TransferModal from '@/components/TransferModal.vue';
import CorporateActionModal from '@/components/CorporateActionModal.vue';
import HistoryHoldingsModal from '@/components/HistoryHoldingsModal.vue';
import HoldingDetailModal from '@/components/HoldingDetailModal.vue';
import CompanyActionModal from '@/components/CompanyActionModal.vue';
import { useTradeStore } from '@/stores/trade';
import { getProfitCurve } from '@/api/index';
import { ArrowUpOutlined, ArrowDownOutlined, HistoryOutlined } from '@ant-design/icons-vue';
import { message, Modal } from 'ant-design-vue';
import dayjs from 'dayjs';
import { normalizeSymbol } from '@/utils/stock';

const store = useTradeStore();
const chartData = ref([]);
const profitCalendarRef = ref(null);
const isHistoryModalVisible = ref(false);
const isTransferModalVisible = ref(false);
const isCorporateActionModalVisible = ref(false);
const isHoldingDetailModalVisible = ref(false);
const isCompanyActionModalVisible = ref(false);
const dateRange = ref([dayjs().startOf('month'), dayjs()]);
const dateShortcut = ref('month');
const selectedStock = ref({});
const selectedHolding = ref(null);
const marketFilter = ref('all');
const currentPage = ref(1);
const pageSize = ref(50);

const handleShortcutChange = (e) => {
  const value = e.target.value;
  const now = dayjs();
  if (value === 'month') {
    dateRange.value = [now.startOf('month'), now];
  } else if (value === 'quarter') {
    dateRange.value = [now.subtract(3, 'month'), now];
  } else if (value === 'year') {
    dateRange.value = [now.startOf('year'), now];
  } else if (value === 'all') {
    dateRange.value = [];
  }
  fetchChartData();
};

const handleRangeChange = () => {
  dateShortcut.value = null;
  fetchChartData();
};

const getCurrencySymbol = (currency) => {
  const map = {
    'CNY': '¥',
    'HKD': 'HK$',
    'USD': '$'
  };
  return map[currency] || '¥';
};

const getHoldingMarket = (record) => {
  const symbol = String(record.symbol || '').toUpperCase();
  const tag = record.marketTag;
  const currency = record.currency;
  if (tag === 'HK' || currency === 'HKD' || symbol.endsWith('.HK')) return 'HK';
  if (tag === 'US' || currency === 'USD' || symbol.endsWith('.US')) return 'US';
  return 'CN';
};

const showCompanyAction = (record) => { selectedHolding.value = record; isCompanyActionModalVisible.value = true; };

const handleMarketChange = () => {
  currentPage.value = 1;
};

const handlePaginationChange = (pagination) => {
  currentPage.value = pagination.current || 1;
  pageSize.value = pagination.pageSize || 50;
};

const columns = [
  { title: '股票', key: 'stock', width: 160 },
  { 
    title: '市值/数量', 
    key: 'marketValueQuantity', 
    align: 'right', 
    width: 140,
    sorter: (a, b) => a.marketValue - b.marketValue 
  },
  { title: '现价/成本', key: 'currentCost', align: 'right', width: 120 },
  { 
    title: '仓位', 
    key: 'position', 
    align: 'right', 
    width: 100,
    sorter: (a, b) => {
      const ar = a.positionRatio !== undefined && a.positionRatio !== null
        ? Number(a.positionRatio)
        : (
            a.marketValueCNY !== undefined && a.marketValueCNY !== null && store.totalAssets > 0
              ? Number(a.marketValueCNY) / store.totalAssets
              : 0
          );
      const br = b.positionRatio !== undefined && b.positionRatio !== null
        ? Number(b.positionRatio)
        : (
            b.marketValueCNY !== undefined && b.marketValueCNY !== null && store.totalAssets > 0
              ? Number(b.marketValueCNY) / store.totalAssets
              : 0
          );
      return ar - br;
    }
  },
  { 
    title: '持仓盈亏', 
    key: 'unrealizedProfit', 
    align: 'right', 
    width: 120,
    sorter: (a, b) => a.unrealizedProfit - b.unrealizedProfit
  },
  { 
    title: '累计盈亏率', 
    key: 'profitRate', 
    align: 'right', 
    width: 120,
    sorter: (a, b) => (a.profitRate ?? -Infinity) - (b.profitRate ?? -Infinity)
  },
  { 
    title: '今日盈亏', 
    key: 'dailyProfit', 
    align: 'right', 
    width: 120,
    sorter: (a, b) => a.dailyProfit - b.dailyProfit
  },
  { 
    title: '今日盈亏率', 
    key: 'dailyProfitRate', 
    align: 'right', 
    width: 120,
    sorter: (a, b) => a.dailyProfitRate - b.dailyProfitRate
  },
  { 
    title: '累计盈亏', 
    key: 'cumulativeProfit', 
    align: 'right',
    width: 120,
    sorter: (a, b) => (a.cumulativeProfit ?? -Infinity) - (b.cumulativeProfit ?? -Infinity)
  },
  { title: '操作', key: 'action', align: 'center', width: 110, fixed: 'right' },
];

const filteredHoldings = computed(() => {
  if (marketFilter.value === 'all') return store.holdings;
  return store.holdings.filter(h => getHoldingMarket(h) === marketFilter.value);
});

const sortedHoldings = computed(() => {
  return [...filteredHoldings.value].sort((a, b) => {
    const at = a.lastTradeDate ?? 0;
    const bt = b.lastTradeDate ?? 0;
    if (bt !== at) return bt - at;
    return (b.cumulativeProfit ?? -Infinity) - (a.cumulativeProfit ?? -Infinity);
  });
});

const holdingsPagination = computed(() => ({
  current: currentPage.value,
  pageSize: pageSize.value,
  total: filteredHoldings.value.length,
  showSizeChanger: true,
  showTotal: total => `共 ${total} 条`
}));

const todayStr = computed(() => dayjs().format('YYYY-MM-DD'));

const handleVisibilityChange = () => {
  if (document.hidden) {
    store.stopPolling();
  } else {
    store.fetchMarketOverview();
    store.startPolling();
  }
};

onMounted(async () => {
  await store.loadTrades();
  store.fetchMarketOverview();
  store.startPolling();
  fetchChartData();
  document.addEventListener('visibilitychange', handleVisibilityChange);
});

onUnmounted(() => {
  store.stopPolling();
  document.removeEventListener('visibilitychange', handleVisibilityChange);
});

const handleTradeSuccess = () => {
  store.loadTrades().then(() => {
    fetchChartData();
  });
};

const showHistoryModal = () => {
  isHistoryModalVisible.value = true;
};

const handleHistoryChanged = async () => {
  await store.loadTrades();
  fetchChartData();
  profitCalendarRef.value?.fetchCalendarData();
};

const handleHoldingChanged = async (symbol) => {
  await store.loadTrades();
  fetchChartData();
  profitCalendarRef.value?.fetchCalendarData();
  if (selectedHolding.value && symbol) {
    const normalized = normalizeSymbol(symbol);
    const updated = store.holdings.find(h => normalizeSymbol(h.symbol) === normalized);
    if (updated) {
      selectedHolding.value = updated;
    }
  }
};

const showHoldingDetail = (record) => {
  selectedHolding.value = record;
  isHoldingDetailModalVisible.value = true;
};

// 移除不再需要的本地 showAddModal
// 移除不再需要的 handleAddTrade

const showTransferModal = () => {
  isTransferModalVisible.value = true;
};

const showCorporateActionModal = () => {
  isCorporateActionModalVisible.value = true;
};

const handleCorporateActionChanged = async () => {
  await store.loadTrades();
  fetchChartData();
  profitCalendarRef.value?.fetchCalendarData();
};

const handleTransferSuccess = (record) => {
  store.loadTrades(); // Reload all data to refresh balance
};

const handleDelete = (record) => {
  Modal.confirm({
    title: '确认删除',
    content: `确定要删除 ${record.name} 的所有持仓记录吗？此操作不可逆。`,
    okText: '确认',
    cancelText: '取消',
   onOk: async () => {
      try {
        const res = await store.deleteHolding(record.symbol);
        const deletedTradesCount = res?.deletedTradesCount;
        if (deletedTradesCount !== null && deletedTradesCount !== undefined) {
          message.success(`已删除 ${record.name} 的持仓及历史交易（${deletedTradesCount}条）`);
        } else {
          message.success(`已删除 ${record.name} 的所有记录`);
        }
        fetchChartData(); // 重新加载图表
        profitCalendarRef.value?.fetchCalendarData(); // 重新加载收益日历
      } catch (err) {
        message.error('删除失败，请稍后重试');
      }
    }
  });
};

const fetchChartData = async () => {
  try {
    const params = {};
    if (dateShortcut.value) {
      params.range = dateShortcut.value;
    }
    if (dateShortcut.value !== 'all' && dateRange.value && dateRange.value.length === 2) {
      params.startDate = dateRange.value[0].format('YYYY-MM-DD');
      params.endDate = dateRange.value[1].format('YYYY-MM-DD');
    }
    
    const res = await getProfitCurve(params);
    if (res && res.data) {
      chartData.value = Array.isArray(res.data) ? res.data : [];
    } else {
      chartData.value = [];
    }
  } catch (err) {
    console.error('Failed to fetch chart data:', err);
    chartData.value = [];
  }
};
</script>

<style scoped>
.dashboard-card .card-label {
  color: rgba(0, 0, 0, 0.45);
  font-size: 14px;
  line-height: 22px;
  margin-bottom: 4px;
}

.dashboard-card .card-value {
  color: rgba(0, 0, 0, 0.85);
  font-size: 30px;
  line-height: 38px;
  margin-bottom: 8px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.assets-content-wrapper {
  min-width: 1200px;
  margin: 0 auto;
}

.dashboard-card .card-footer {
  border-top: 1px solid #f0f0f0;
  padding-top: 9px;
  margin-top: 8px;
  font-size: 14px;
  color: rgba(0,0,0,0.65);
}

.chart-title {
  margin-bottom: 20px;
  color: rgba(0,0,0,0.85);
  font-weight: 500;
  font-size: 16px;
}

.rank-title {
  margin-bottom: 20px;
  color: rgba(0,0,0,0.85);
  font-weight: 500;
  font-size: 16px;
}

.rank-list {
  margin: 25px 0 0;
  padding: 0;
  list-style: none;
}

.rank-list li {
  display: flex;
  align-items: center;
  margin-top: 16px;
  zoom: 1;
}

.rank-list li .rank-index {
  background-color: #f5f5f5;
  border-radius: 20px;
  display: inline-block;
  font-size: 12px;
  font-weight: 600;
  height: 20px;
  line-height: 20px;
  margin-right: 16px;
  margin-top: 1.5px;
  text-align: center;
  width: 20px;
}

.rank-list li .rank-index.active {
  background-color: #314659;
  color: #fff;
}

.rank-list li .rank-name {
  flex: 1 1;
  margin-right: 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rank-list li .rank-value {
  color: rgba(0,0,0,0.85);
}

/* 优化表格表头高度 */
:deep(.ant-table-thead > tr > th) {
  padding: 12px 16px !important;
  background: #fafafa;
}

/* 优化表格单元格高度 */
:deep(.ant-table-tbody > tr > td) {
  padding: 12px 16px !important;
}

/* 彻底隐藏测量行，防止其在某些浏览器下产生视觉空隙 */
:deep(.ant-table-measure-row) {
  height: 0 !important;
  line-height: 0 !important;
  visibility: collapse !important;
}

:deep(.ant-table-measure-row td) {
  padding: 0 !important;
  border: 0 !important;
  height: 0 !important;
  line-height: 0 !important;
}

/* 市场筛选单选按钮组 —— 统一主题蓝，首项去除左侧阴影避免双边框 */
.market-filter-group :deep(.ant-radio-button-wrapper) {
  min-width: 56px;
  text-align: center;
  padding: 0 14px;
}

.market-filter-group :deep(.ant-radio-button-wrapper-checked) {
  border-color: #1890ff;
  color: #1890ff;
}

.market-filter-group :deep(.ant-radio-button-wrapper:first-child.ant-radio-button-wrapper-checked) {
  box-shadow: none;
}
</style>
