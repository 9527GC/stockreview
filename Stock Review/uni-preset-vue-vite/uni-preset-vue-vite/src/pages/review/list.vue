<template>
  <PCLayout pageTitle="复盘日志" activeKey="review">
    <a-card :bordered="false" :body-style="{ padding: '24px' }" style="margin-bottom: 16px">
      <!-- Search Form -->
      <div class="table-page-search-wrapper">
        <a-form style="display: flex; align-items: center; min-height: 32px;">
          <a-row :gutter="24" style="width: 100%; align-items: center; margin-bottom: 0; flex-wrap: nowrap;">
            <a-col :flex="'280px'">
              <a-form-item label="股票代码" style="margin-bottom: 0;">
                <a-input v-model:value="searchSymbol" placeholder="请输入" style="width: 160px" />
              </a-form-item>
            </a-col>
            <a-col :flex="'320px'">
              <a-form-item label="交易时间" style="margin-bottom: 0;">
                <a-date-picker v-model:value="searchDate" style="width: 200px" placeholder="请选择日期" />
              </a-form-item>
            </a-col>
            <a-col :flex="'auto'" style="text-align: right; padding-right: 0;">
              <div class="table-page-search-submitButtons" style="margin-right: -12px;">
                <a-button type="primary" @click="handleSearch">查询</a-button>
                <a-button style="margin-left: 8px" @click="handleReset">重置</a-button>
              </div>
            </a-col>
          </a-row>
        </a-form>
      </div>
    </a-card>

    <a-card :bordered="false">
      <!-- Table -->
      <a-table 
        :columns="columns" 
        :data-source="displayData" 
        :row-key="record => record.id"
        :scroll="{ x: 1300 }"
        :pagination="tablePagination"
        @change="handleTableChange"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'date'">
             <div style="white-space: nowrap;">
               <div style="font-weight: 500; color: #1f1f1f;">{{ dayjs(record.date).format('YYYY-MM-DD') }}</div>
               <div style="font-size: 12px; color: #999;">{{ dayjs(record.date).format('HH:mm:ss') }}</div>
             </div>
          </template>
          <template v-if="column.key === 'symbol'">
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
                 <div style="font-weight: 500; color: #1f1f1f; line-height: 1.4;">{{ record.stockName || '--' }}</div>
                 <div style="font-size: 12px; color: #999; line-height: 1.2;">{{ record.symbol }}</div>
               </div>
             </div>
          </template>
          <template v-if="column.key === 'type'">
             <a-tag :color="record.type === 'BUY' ? 'red' : 'green'">
               {{ record.type === 'BUY' ? '买入' : '卖出' }}
             </a-tag>
          </template>
          <template v-if="column.key === 'price'">
             <div>
               <div style="font-weight: 500; color: #1f1f1f;">{{ formatMoney(record.price, record) }}</div>
               <div style="font-size: 12px; color: #999;">{{ formatCurrentPrice(record) }}</div>
             </div>
          </template>
          <template v-if="column.key === 'marketValue'">
             <div>
               <div style="font-weight: 500; color: #1f1f1f;">{{ formatMoney(Number(record.price) * Number(record.quantity), record) }}</div>
               <div style="font-size: 12px; color: #999;">{{ record.quantity }}股</div>
             </div>
          </template>
          <template v-if="column.key === 'logic'">
               <div class="logic-cell">
                 <span class="logic-mood-tag" :style="getMoodTagStyle(record.mood)">{{ formatMood(record.mood) }}</span>
                 <span class="logic-text">{{ record.logic || '--' }}</span>
               </div>
            </template>
            <template v-if="column.key === 'reviewResult'">
               <div v-if="record.isSystemCompliant || record.cognitiveBias || record.improvementMeasures" style="font-size: 12px; color: #595959;">
                 <div style="display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden; text-overflow: ellipsis; margin-bottom: 2px;">
                   <span style="display: inline-block; padding: 0 4px; border-radius: 2px; background: #e6f7ff; color: #1890ff; margin-right: 4px; font-size: 11px; transform: scale(0.9);">系统</span>{{ record.isSystemCompliant || '--' }}
                 </div>
                 <div style="display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden; text-overflow: ellipsis; margin-bottom: 2px;">
                   <span style="display: inline-block; padding: 0 4px; border-radius: 2px; background: #fff7e6; color: #fa8c16; margin-right: 4px; font-size: 11px; transform: scale(0.9);">偏差</span>{{ record.cognitiveBias || '--' }}
                 </div>
                 <div style="display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden; text-overflow: ellipsis;">
                   <span style="display: inline-block; padding: 0 4px; border-radius: 2px; background: #f6ffed; color: #52c41a; margin-right: 4px; font-size: 11px; transform: scale(0.9);">改进</span>{{ record.improvementMeasures || '--' }}
                 </div>
               </div>
               <span v-else style="color: #bfbfbf;">未复盘</span>
            </template>
          <template v-if="column.key === 'action'">
             <div style="display: flex; gap: 8px; justify-content: center;">
               <a style="color: #1890ff;" @click="handleReview(record)">复盘</a>
             </div>
          </template>
        </template>
      </a-table>
    </a-card>
    
    <ReviewModal
      v-model:open="isReviewModalVisible"
      :record="currentReviewRecord"
      :saving="isReviewSaving"
      @submit="handleReviewSubmit"
    />
  </PCLayout>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import PCLayout from '@/layouts/PCLayout.vue';
import { useTradeStore } from '@/stores/trade';
import ReviewModal from '@/components/ReviewModal.vue';
import { message } from 'ant-design-vue';
import dayjs from 'dayjs';

const store = useTradeStore();
const isReviewModalVisible = ref(false);
const isReviewSaving = ref(false);
const currentReviewRecord = ref({});
const searchSymbol = ref('');
const searchDate = ref(null);
const currentPriceMap = ref({});
const selectedTradeType = ref(null);
const defaultPageSize = 50;

const buildQueryParams = (overrides = {}) => ({
  page: 1,
  pageSize: tablePagination.value.pageSize || defaultPageSize,
  symbol: searchSymbol.value || undefined,
  date: searchDate.value ? searchDate.value.format('YYYY-MM-DD') : undefined,
  type: selectedTradeType.value || undefined,
  ...overrides
});

const handleSearch = () => {
  store.loadTrades(buildQueryParams({ page: 1 }));
};

const handleReset = () => {
  searchSymbol.value = '';
  searchDate.value = null;
  selectedTradeType.value = null;
  store.loadTrades({
    page: 1,
    pageSize: tablePagination.value.pageSize || defaultPageSize
  });
};

const handleReview = (record) => {
  currentReviewRecord.value = record;
  isReviewModalVisible.value = true;
};

const handleReviewSubmit = async (data) => {
  if (isReviewSaving.value) return;

  isReviewSaving.value = true;
  try {
    const payload = {
      ...data,
      isSystemCompliant: data.isSystemCompliant,
      cognitiveBias: data.cognitiveBias,
      improvementMeasures: data.improvementMeasures
    };
    await store.updateTrade(data.id, payload);
    message.success('复盘记录已保存');
    isReviewModalVisible.value = false;
  } catch (err) {
    message.error('复盘保存失败，请稍后重试');
  } finally {
    isReviewSaving.value = false;
  }
};

const handleTableChange = (pagination, filters) => {
  const nextPage = pagination?.current || 1;
  const nextPageSize = pagination?.pageSize || tablePagination.value.pageSize || defaultPageSize;
  const nextType = Array.isArray(filters?.type) ? (filters.type[0] || null) : (filters?.type || null);
  const filterChanged = nextType !== selectedTradeType.value;
  selectedTradeType.value = nextType;
  store.loadTrades(buildQueryParams({
    page: filterChanged ? 1 : nextPage,
    pageSize: nextPageSize
  }));
};

const loadCurrentPrices = async (records = []) => {
  const symbols = [...new Set(records.map(record => record.symbol).filter(Boolean))];
  if (symbols.length === 0) {
    currentPriceMap.value = {};
    return;
  }

  const quotes = await Promise.all(
    symbols.map(async (symbol) => {
      const quote = await store.fetchRealTimeQuote(symbol);
      const price = quote?.price !== undefined && quote?.price !== null ? Number(quote.price) : null;
      return [symbol, Number.isFinite(price) ? price : null];
    })
  );

  currentPriceMap.value = quotes.reduce((acc, [symbol, price]) => {
    if (price !== null) acc[symbol] = price;
    return acc;
  }, {});
};

const getCurrencyCode = (recordOrSymbol) => {
  const currency = typeof recordOrSymbol === 'object' ? recordOrSymbol?.currency : null;
  if (currency) return currency;

  const symbol = typeof recordOrSymbol === 'string'
    ? recordOrSymbol
    : recordOrSymbol?.symbol;
  const upperSymbol = String(symbol || '').toUpperCase();

  if (upperSymbol.endsWith('.HK')) return 'HKD';
  if (upperSymbol.endsWith('.US')) return 'USD';
  return 'CNY';
};

const getCurrencySymbol = (recordOrSymbol) => {
  const map = {
    CNY: '¥',
    HKD: 'HK$',
    USD: '$'
  };
  return map[getCurrencyCode(recordOrSymbol)] || '¥';
};

const formatMoney = (amount, recordOrSymbol) => {
  const number = Number(amount);
  if (!Number.isFinite(number)) return '--';
  return `${getCurrencySymbol(recordOrSymbol)}${number.toFixed(2)}`;
};

const formatCurrentPrice = (record) => {
  const price = currentPriceMap.value[record?.symbol];
  return price !== undefined && price !== null ? formatMoney(price, record) : '--';
};

const columns = [
  { title: '时间', dataIndex: 'date', key: 'date', width: 150, sorter: (a, b) => dayjs(a.date).valueOf() - dayjs(b.date).valueOf() },
  { title: '股票信息', dataIndex: 'symbol', key: 'symbol', width: 160, maxWidth: 200 },
  {
    title: '交易类型',
    dataIndex: 'type',
    key: 'type',
    width: 120,
    filters: [{ text: '买入', value: 'BUY' }, { text: '卖出', value: 'SELL' }],
    filterMultiple: false,
    filteredValue: selectedTradeType.value ? [selectedTradeType.value] : null,
    onFilter: (value, record) => record.type === value
  },
  { title: '价格/现价', key: 'price', width: 120 },
  { title: '成交额/数量', key: 'marketValue', width: 140 },
  { title: '交易逻辑', key: 'logic', minWidth: 250 },
  { title: '复盘结果', key: 'reviewResult', minWidth: 250 },
  { title: '操作', key: 'action', width: 120, fixed: 'right', align: 'center' },
];

const tablePagination = computed(() => ({
  current: store.tradeReviewsPagination?.current || 1,
  pageSize: store.tradeReviewsPagination?.pageSize || defaultPageSize,
  total: store.tradeReviewsPagination?.total || 0,
  showSizeChanger: true,
  showTotal: total => `共 ${total} 条`
}));

const displayData = computed(() => {
  return store.reviews || [];
});

watch(displayData, (records) => {
  loadCurrentPrices(records);
}, { immediate: true });

onMounted(() => {
  store.loadTrades({
    page: 1,
    pageSize: defaultPageSize
  });
});

const formatDate = (date) => {
  return dayjs(date).format('YYYY-MM-DD HH:mm');
};

const normalizeMood = (mood) => String(mood || '').trim().toLowerCase();

const MOOD_TEXT_MAP = {
  neutral: '中性',
  calm: '冷静',
  confident: '自信',
  anxious: '焦虑',
  impulsive: '冲动',
  excited: '兴奋',
  fear: '恐惧'
};

const MOOD_STYLE_MAP = {
  neutral: {
    color: '#595959',
    backgroundColor: '#fafafa',
    border: '1px solid #d9d9d9'
  },
  calm: {
    color: '#0958d9',
    backgroundColor: '#e6f4ff',
    border: '1px solid #91caff'
  },
  confident: {
    color: '#531dab',
    backgroundColor: '#f9f0ff',
    border: '1px solid #d3adf7'
  },
  anxious: {
    color: '#389e0d',
    backgroundColor: '#f6ffed',
    border: '1px solid #b7eb8f'
  },
  impulsive: {
    color: '#c41d7f',
    backgroundColor: '#fff0f6',
    border: '1px solid #ffadd2'
  },
  excited: {
    color: '#d46b08',
    backgroundColor: '#fff7e6',
    border: '1px solid #ffd591'
  },
  fear: {
    color: '#cf1322',
    backgroundColor: '#fff1f0',
    border: '1px solid #ffa39e'
  }
};

const formatMood = (mood) => {
  const normalizedMood = normalizeMood(mood);
  return MOOD_TEXT_MAP[normalizedMood] || mood || '--';
};

const getMoodTagStyle = (mood) => {
  const normalizedMood = normalizeMood(mood);
  return MOOD_STYLE_MAP[normalizedMood] || {
    color: '#595959',
    backgroundColor: '#fafafa',
    border: '1px solid #d9d9d9'
  };
};

const handleTradeSuccess = () => {
  store.loadTrades(buildQueryParams({ page: 1 }));
};
</script>

<style scoped>
.table-page-search-wrapper {
  /* 移除底部边距，确保卡片内边距视觉对称 */
  margin-bottom: 0;
}

.table-page-search-wrapper :deep(.ant-form-item) {
  margin-bottom: 0 !important;
  display: flex;
  align-items: center;
}

.table-page-search-wrapper :deep(.ant-form-item-label) {
  line-height: 32px;
}

.table-page-search-wrapper :deep(.ant-form-item-control) {
  line-height: 32px;
}

.logic-cell {
  display: flex;
  align-items: flex-start;
  gap: 6px;
}

.logic-mood-tag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 44px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  line-height: 22px;
  white-space: nowrap;
  flex-shrink: 0;
}

.logic-text {
  color: #595959;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
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
</style>
