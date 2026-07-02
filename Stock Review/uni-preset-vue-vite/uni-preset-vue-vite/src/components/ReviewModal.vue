<template>
  <a-modal
    :open="open"
    title="交易复盘"
    width="600px"
    @cancel="handleCancel"
    @ok="handleOk"
    :confirmLoading="saving"
    okText="保存复盘"
    cancelText="取消"
    :bodyStyle="{ maxHeight: '70vh', overflowY: 'auto' }"
  >
    <!-- Part 1: Operation Details (ReadOnly) -->
    <div class="review-section">
      <div class="section-title">操作详情</div>

      <div class="operation-detail">
        <div class="detail-row">
          <div class="detail-item">
            <span class="detail-label">股票名称</span>
            <span class="detail-value">{{ record.stockName || '--' }}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">股票代码</span>
            <span class="detail-value">{{ record.symbol }}</span>
          </div>
        </div>

        <div class="detail-row">
          <div class="detail-item">
            <span class="detail-label">交易类型</span>
            <a-tag :color="record.type === 'BUY' ? 'red' : 'green'">
              {{ record.type === 'BUY' ? '买入' : '卖出' }}
            </a-tag>
          </div>
          <div class="detail-item">
            <span class="detail-label">成交价格</span>
            <span class="detail-value">{{ getCurrencySymbol(record.currency) }}{{ Number(record.price).toFixed(2) }}</span>
          </div>
        </div>

        <div class="detail-row">
          <div class="detail-item">
            <span class="detail-label">成交数量</span>
            <span class="detail-value">{{ record.quantity }}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">成交时间</span>
            <span class="detail-value">{{ formatDate(record.date) }}</span>
          </div>
        </div>

        <div class="detail-row">
          <div class="detail-item full">
            <span class="detail-label">交易状态</span>
            <span class="mood-tag" :style="getMoodTagStyle(record.mood)">{{ formatMood(record.mood) }}</span>
          </div>
        </div>
      </div>

      <div class="logic-block">
        <div class="detail-label">交易逻辑</div>
        <div class="logic-content">{{ record.logic }}</div>
      </div>
    </div>

    <!-- Part 1.5: Market Overview -->
    <div v-if="record.market === 'CN'" class="review-section" style="margin-top: 24px;">
      <div class="section-title">大盘详情</div>
      <div style="background: #f5f7fa; padding: 16px; border-radius: 8px; font-size: 13px;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px;">
          <span style="font-weight: 600; color: #1f1f1f; font-size: 14px;">{{ marketData.benchmarkName || '上证指数' }}</span>
          <div style="display: flex; gap: 16px; align-items: baseline;">
            <span style="font-size: 18px; font-weight: 600;">{{ formatOverviewValue(marketData.index) }}</span>
            <span :style="{ color: getTrendColor(marketData.change) }">
              {{ formatSignedOverviewValue(marketData.change) }}
            </span>
            <span :style="{ color: getTrendColor(marketData.changePercent) }">
              {{ formatSignedOverviewValue(marketData.changePercent, 2, '%') }}
            </span>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 16px; padding-bottom: 16px; border-bottom: 1px solid #e8e8e8;">
          <div>
            <div style="color: #8c8c8c; margin-bottom: 6px; font-size: 12px;">涨跌分布</div>
            <div style="display: flex; gap: 12px; font-size: 13px;">
              <span style="color: #cf1322">涨 {{ formatOverviewInteger(marketData.upCount) }}</span>
              <span style="color: #3f8600">跌 {{ formatOverviewInteger(marketData.downCount) }}</span>
              <span style="color: #8c8c8c">平 {{ formatOverviewInteger(marketData.flatCount) }}</span>
            </div>
          </div>
          <div style="border-left: 1px solid #f0f0f0; padding-left: 20px;">
            <div style="color: #8c8c8c; margin-bottom: 6px; font-size: 12px;">涨跌停</div>
            <div style="display: flex; gap: 12px; font-size: 13px;">
              <span style="color: #cf1322">涨停 {{ formatOverviewInteger(marketData.limitUpCount) }}</span>
              <span style="color: #3f8600">跌停 {{ formatOverviewInteger(marketData.limitDownCount) }}</span>
            </div>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 16px;">
          <div>
            <div style="color: #8c8c8c; margin-bottom: 6px; font-size: 12px;">A股全市成交</div>
            <div style="font-weight: 500;">{{ formatOverviewVolume(marketData.volume) }}</div>
          </div>
          <div style="border-left: 1px solid #f0f0f0; padding-left: 20px;">
            <div style="color: #8c8c8c; margin-bottom: 6px; font-size: 12px;">量比</div>
            <div :style="{ color: getTrendColor(marketData.volumeChangeRatio) }" style="font-weight: 500;">
              {{ formatSignedOverviewValue(marketData.volumeChangeRatio, 2, '%') }}
            </div>
          </div>
        </div>
 
        <div v-if="record.news || marketSnapshot?.news" style="background: #fff; padding: 12px; border-radius: 6px; border: 1px solid #f0f0f0;">
          <div style="color: #1890ff; font-weight: 600; font-size: 12px; margin-bottom: 8px; display: flex; align-items: center; gap: 4px;">
            关键新闻
          </div>
          <div
            class="news-content"
            style="font-size: 13px; color: #595959; line-height: 1.6;"
            v-html="sanitizedNews"
          ></div>
        </div>
      </div>
    </div>

    <!-- Part 2: Review Form -->
    <div class="review-section" style="margin-top: 24px;">
      <div class="section-title">复盘分析</div>
      <a-form layout="vertical" :model="formState">
        <a-form-item :validate-status="validationErrors.isSystemCompliant ? 'error' : ''" :help="validationErrors.isSystemCompliant">
          <template #label>
            <span><span style="color: #ff4d4f; margin-right: 4px;">*</span>1. 是否符合系统</span>
            <a-tooltip overlay-class-name="review-tooltip">
              <template #title>
                是符合计划的买卖？<br />
                还是盘中随手单？
              </template>
              <question-circle-outlined style="margin-left: 4px; color: #8c8c8c; cursor: help;" />
            </a-tooltip>
          </template>
          <a-textarea
            v-model:value="formState.isSystemCompliant"
            placeholder="请输入..."
            :rows="3"
          />
        </a-form-item>
        <a-form-item :validate-status="validationErrors.cognitiveBias ? 'error' : ''" :help="validationErrors.cognitiveBias">
          <template #label>
            <span><span style="color: #ff4d4f; margin-right: 4px;">*</span>2. 是否有认知偏差</span>
            <a-tooltip overlay-class-name="review-tooltip">
              <template #title>
                认知偏差分析（深度反思）<br />
                对照常见心理陷阱，自我拷问：<br /><br />
                FOMO（错失恐惧）？ → 追高买入？<br />
                损失厌恶？ → 亏损死扛，盈利秒卖？<br />
                过度自信？ → 重仓单押，无视风险？<br />
                锚定效应？ → 比如因成本价100元，拒绝在90元止损？
              </template>
              <question-circle-outlined style="margin-left: 4px; color: #8c8c8c; cursor: help;" />
            </a-tooltip>
          </template>
          <a-textarea
            v-model:value="formState.cognitiveBias"
            placeholder="请输入..."
            :rows="6"
          />
        </a-form-item>
        <a-form-item :validate-status="validationErrors.improvementMeasures ? 'error' : ''" :help="validationErrors.improvementMeasures">
          <template #label>
            <span><span style="color: #ff4d4f; margin-right: 4px;">*</span>3. 改进措施</span>
            <a-tooltip overlay-class-name="review-tooltip">
              <template #title>
                比如：<br />
                1. 修改止盈规则：从‘+5%即卖’改为‘跌破5日线再卖’；<br />
                2. 明日开盘前，写下今日最大持仓上限（≤40%）；<br />
                3. 模拟盘测试新止损模型，连续3次达标后再实盘。
              </template>
              <question-circle-outlined style="margin-left: 4px; color: #8c8c8c; cursor: help;" />
            </a-tooltip>
          </template>
          <a-textarea
            v-model:value="formState.improvementMeasures"
            placeholder="请输入..."
            :rows="6"
          />
        </a-form-item>
      </a-form>
    </div>
  </a-modal>
</template>

<script setup>
import { computed, reactive, watch } from 'vue';
import { QuestionCircleOutlined } from '@ant-design/icons-vue';
import { message } from 'ant-design-vue';
import dayjs from 'dayjs';
import { sanitizeHtml } from '@/utils/sanitizeHtml';

const props = defineProps({
  open: Boolean,
  saving: {
    type: Boolean,
    default: false
  },
  record: {
    type: Object,
    default: () => ({})
  }
});

const emit = defineEmits(['update:open', 'submit']);

const marketSnapshot = computed(() => props.record.marketOverviewSnapshot || props.record.marketOverview || null);
const sanitizedNews = computed(() => sanitizeHtml(props.record.news || marketSnapshot.value?.news || ''));

const marketData = reactive({
  benchmarkName: '',
  index: null,
  change: null,
  changePercent: null,
  upCount: null,
  downCount: null,
  flatCount: null,
  limitUpCount: null,
  limitDownCount: null,
  volume: null,
  volumeChangeRatio: null
});

const formState = reactive({
  isSystemCompliant: '',
  cognitiveBias: '',
  improvementMeasures: ''
});

watch(
  () => props.record,
  (newRecord) => {
    if (newRecord) {
      Object.keys(validationErrors).forEach(key => validationErrors[key] = '');
      // Load existing review data if available, otherwise empty
      formState.isSystemCompliant = newRecord.isSystemCompliant || '';
      formState.cognitiveBias = newRecord.cognitiveBias || '';
      formState.improvementMeasures = newRecord.improvementMeasures || '';
    }
  },
  { immediate: true }
);

const toFiniteNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const formatOverviewValue = (value, digits = 2, suffix = '') => {
  const number = toFiniteNumber(value);
  return number === null ? '--' : `${number.toFixed(digits)}${suffix}`;
};

const formatSignedOverviewValue = (value, digits = 2, suffix = '') => {
  const number = toFiniteNumber(value);
  if (number === null) return '--';
  return `${number > 0 ? '+' : ''}${number.toFixed(digits)}${suffix}`;
};

const formatOverviewInteger = (value) => {
  const number = toFiniteNumber(value);
  return number === null ? '--' : Math.round(number);
};

const formatOverviewVolume = (value) => {
  const number = toFiniteNumber(value);
  if (number === null) return '--';

  const volumeInYi = Math.abs(number) >= 1000 ? number / 100000000 : number;
  const digits = Math.abs(volumeInYi) >= 1 ? 2 : 4;
  return `${volumeInYi.toFixed(digits)}亿`;
};

const getTrendColor = (value) => {
  const number = toFiniteNumber(value);
  if (number === null) return '#8c8c8c';
  return number >= 0 ? '#cf1322' : '#3f8600';
};

const resetMarketData = () => {
  marketData.benchmarkName = '';
  marketData.index = null;
  marketData.change = null;
  marketData.changePercent = null;
  marketData.upCount = null;
  marketData.downCount = null;
  marketData.flatCount = null;
  marketData.limitUpCount = null;
  marketData.limitDownCount = null;
  marketData.volume = null;
  marketData.volumeChangeRatio = null;
};

watch(
  () => marketSnapshot.value,
  (newOverview) => {
    resetMarketData();
    if (newOverview) {
      marketData.benchmarkName = newOverview.benchmarkName || '';
      marketData.index = toFiniteNumber(newOverview.index ?? newOverview.price);
      marketData.change = toFiniteNumber(newOverview.change);
      marketData.changePercent = toFiniteNumber(newOverview.changePercent);
      marketData.upCount = toFiniteNumber(newOverview.upCount);
      marketData.downCount = toFiniteNumber(newOverview.downCount);
      marketData.flatCount = toFiniteNumber(newOverview.flatCount);
      marketData.limitUpCount = toFiniteNumber(newOverview.limitUpCount);
      marketData.limitDownCount = toFiniteNumber(newOverview.limitDownCount);
      marketData.volume = toFiniteNumber(newOverview.volume);
      marketData.volumeChangeRatio = toFiniteNumber(newOverview.volumeChangeRatio);
    }
  },
  { immediate: true }
);

const validationErrors = reactive({
  isSystemCompliant: '',
  cognitiveBias: '',
  improvementMeasures: ''
});

const clearFieldError = (field) => {
  if (validationErrors[field]) validationErrors[field] = '';
};

const validateForm = () => {
  Object.keys(validationErrors).forEach(key => validationErrors[key] = '');
  let isValid = true;

  if (!formState.isSystemCompliant || !formState.isSystemCompliant.trim()) {
    validationErrors.isSystemCompliant = '请填写是否符合系统';
    isValid = false;
  }
  if (!formState.cognitiveBias || !formState.cognitiveBias.trim()) {
    validationErrors.cognitiveBias = '请填写是否有认知偏差';
    isValid = false;
  }
  if (!formState.improvementMeasures || !formState.improvementMeasures.trim()) {
    validationErrors.improvementMeasures = '请填写改进措施';
    isValid = false;
  }
  return isValid;
};

watch(() => formState.isSystemCompliant, () => clearFieldError('isSystemCompliant'));
watch(() => formState.cognitiveBias, () => clearFieldError('cognitiveBias'));
watch(() => formState.improvementMeasures, () => clearFieldError('improvementMeasures'));

const handleCancel = () => {
  emit('update:open', false);
};

const handleOk = () => {
  if (props.saving) return;
  if (!validateForm()) {
    message.error('请填写完整的复盘信息');
    return;
  }
  emit('submit', { ...formState, id: props.record.id });
};

const formatDate = (date) => {
  if (!date) return '--';
  return dayjs(date).format('YYYY-MM-DD HH:mm');
};

const getCurrencySymbol = (currency) => {
  const map = { CNY: '¥', HKD: 'HK$', USD: '$' };
  return map[currency] || '¥';
};

const normalizeMood = (mood) => String(mood || '').trim().toLowerCase();

const getMoodTagStyle = (mood) => {
  const normalizedMood = normalizeMood(mood);
  const map = {
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
    excited: {
      color: '#d46b08',
      backgroundColor: '#fff7e6',
      border: '1px solid #ffd591'
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
    fear: {
      color: '#cf1322',
      backgroundColor: '#fff1f0',
      border: '1px solid #ffa39e'
    },
    regret: {
      color: '#595959',
      backgroundColor: '#fafafa',
      border: '1px solid #d9d9d9'
    }
  };
  return map[normalizedMood] || {
    color: '#595959',
    backgroundColor: '#fafafa',
    border: '1px solid #d9d9d9'
  };
};

const formatMood = (mood) => {
  const normalizedMood = normalizeMood(mood);
  const map = {
    neutral: '中性',
    excited: '兴奋',
    calm: '冷静',
    confident: '自信',
    anxious: '焦虑',
    impulsive: '冲动',
    regret: '后悔',
    fear: '恐惧'
  };
  return map[normalizedMood] || mood || '--';
};
</script>

<style scoped>
.mood-tag {
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
}

.section-title {
  font-size: 16px;
  font-weight: bold;
  margin-bottom: 12px;
  border-left: 4px solid #1890ff;
  padding-left: 8px;
}

:deep(.news-content img) {
  max-width: 100%;
  height: auto;
  border-radius: 4px;
  margin: 8px 0;
}

:deep(.news-content ol), :deep(.news-content ul) {
  padding-left: 20px;
  margin: 8px 0;
}

.operation-detail {
  border: 1px solid #f0f0f0;
  border-radius: 6px;
  overflow: hidden;
}

.detail-row {
  display: flex;
  border-bottom: 1px solid #f0f0f0;
}

.detail-row:last-child {
  border-bottom: none;
}

.detail-item {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  min-height: auto;
}

.detail-item:not(:last-child) {
  border-right: 1px solid #f0f0f0;
}

.detail-item.full {
  border-right: none;
}

.detail-label {
  width: 72px;
  flex-shrink: 0;
  color: #8c8c8c;
  font-size: 13px;
  line-height: 1.5;
  white-space: nowrap;
}

.detail-value {
  color: #262626;
  font-size: 13px;
  line-height: 1.5;
  word-break: break-all;
}

.operation-detail :deep(.ant-tag) {
  margin: 0;
}

.logic-block {
  margin-top: 16px;
}

.logic-block .detail-label {
  display: block;
  margin-bottom: 8px;
}

.logic-content {
  padding: 12px;
  background: #fafafa;
  border: 1px solid #f0f0f0;
  border-radius: 6px;
  color: #595959;
  font-size: 13px;
  line-height: 1.6;
}
</style>
