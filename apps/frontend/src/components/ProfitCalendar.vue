<template>
  <div class="profit-calendar no-click">
    <a-calendar v-model:value="selectedDate" :fullscreen="false">
      <!-- Custom Header -->
      <template #headerRender="{ value, type, onChange, onTypeChange }">
        <div style="padding: 24px 24px 2px 24px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <div style="font-weight: 500; font-size: 16px; color: rgba(0,0,0,0.85);">收益日历</div>
            <a-space>
              <a-select
                size="small"
                :dropdown-match-select-width="false"
                :value="value.year()"
                @change="newYear => onChange(value.clone().year(newYear))"
              >
                <a-select-option v-for="y in getYears(value)" :key="y" :value="y">
                  {{ y }}年
                </a-select-option>
              </a-select>
              <a-select
                size="small"
                :dropdown-match-select-width="false"
                :value="value.month()"
                @change="newMonth => onChange(value.clone().month(newMonth))"
              >
                <a-select-option v-for="m in 12" :key="m-1" :value="m-1">
                  {{ m }}月
                </a-select-option>
              </a-select>
            </a-space>
          </div>
          <div style="display: flex; align-items: center; justify-content: space-between; font-size: 12px; margin-bottom: 2px; color: rgba(0,0,0,0.45);">
            <div style="display: flex; gap: 10px;">
              <div>盈利: <span style="color: #cf1322; font-weight: 500;">{{ stats.upDays }}天</span></div>
              <div>亏损: <span style="color: #3f8600; font-weight: 500;">{{ stats.downDays }}天</span></div>
              <div>胜率: <span style="font-weight: 500; color: rgba(0,0,0,0.85);">{{ stats.winRate }}%</span></div>
              <div>月盈亏: <span :style="{ color: stats.totalProfit >= 0 ? '#cf1322' : '#3f8600', fontWeight: '500' }">{{ stats.totalProfit >= 0 ? '+' : '' }}{{ Math.round(stats.totalProfit).toLocaleString() }}</span></div>
              <div>
                收益率:
                <span v-if="stats.yieldRate !== null" :style="{ color: stats.yieldRate >= 0 ? '#cf1322' : '#3f8600', fontWeight: '500' }">
                  {{ stats.yieldRate >= 0 ? '+' : '' }}{{ stats.yieldRate }}%
                </span>
                <span v-else style="font-weight: 500; color: rgba(0,0,0,0.85);">--</span>
              </div>
            </div>
            <a-button type="link" size="small" style="padding: 0; height: auto; font-size: 12px;" @click="handleGoToday">
              回到今天
            </a-button>
          </div>
        </div>
      </template>

      <template #dateCellRender="{ current }">
        <div class="calendar-cell" v-if="current.month() === selectedDate.month() && hasProfitForDate(current)">
          <div :class="['profit-amount', getProfitClass(getProfitForDate(current))]">
            {{ formatProfitAmount(getProfitForDate(current)) }}
          </div>
        </div>
      </template>
    </a-calendar>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import { useTradeStore } from '@/stores/trade';
import { getProfitCalendar } from '@/api/index';

// Set dayjs locale to Chinese
dayjs.locale('zh-cn');

const store = useTradeStore();
const selectedDate = ref(dayjs());
const apiProfitData = ref({});
const apiStats = ref(null);

// Profit data for the calendar
const profitData = computed(() => {
  return apiProfitData.value || {};
});

const normalizeDailyProfitMap = (dailyProfits) => {
  if (!dailyProfits || typeof dailyProfits !== 'object' || Array.isArray(dailyProfits)) return {};

  return Object.entries(dailyProfits).reduce((result, [date, value]) => {
    let normalized = value;
    if (value && typeof value === 'object') {
      normalized = value.profitAmount ?? value.dailyProfit ?? value.amount ?? value.profit ?? null;
    }

    result[date] = toFiniteNumber(normalized);
    return result;
  }, {});
};

const fetchCalendarData = async () => {
  try {
    const res = await getProfitCalendar({
      year: selectedDate.value.year(),
      month: selectedDate.value.month() + 1
    });
    if (res) {
      apiProfitData.value = normalizeDailyProfitMap(res.dailyProfits);
      apiStats.value = res.stats || null;
    }
  } catch (err) {
    console.error('Failed to fetch calendar data:', err);
  }
};

defineExpose({
  fetchCalendarData
});

onMounted(() => {
  fetchCalendarData();
});

watch(() => selectedDate.value, (newDate, oldDate) => {
  if (newDate.year() !== oldDate.year() || newDate.month() !== oldDate.month()) {
    fetchCalendarData();
  }
});

// 让收益日历上的"今天"跟随 store 的今日盈亏自动更新
watch(() => store.totalDailyProfit, (newProfit) => {
  const today = dayjs();
  if (
    selectedDate.value.year() !== today.year() ||
    selectedDate.value.month() !== today.month()
  ) {
    return;
  }

  const newValue = toFiniteNumber(newProfit);
  if (newValue === null) return;

  const todayKey = today.format('YYYY-MM-DD');
  const oldValue = toFiniteNumber(apiProfitData.value[todayKey]) ?? 0;

  apiProfitData.value = {
    ...apiProfitData.value,
    [todayKey]: newValue
  };

  // 同步更新月盈亏统计
  if (apiStats.value) {
    const currentTotal = toFiniteNumber(apiStats.value.totalProfit) ?? 0;
    apiStats.value = {
      ...apiStats.value,
      totalProfit: Number((currentTotal - oldValue + newValue).toFixed(2))
    };
  }
});

const getProfitForDate = (date) => {
  const dateStr = getDateKey(date);
  if (!dateStr) return null;

  const value = profitData.value[dateStr];
  return value !== undefined ? toFiniteNumber(value) : null;
};

const hasProfitForDate = (date) => {
  const dateStr = getDateKey(date);
  if (!dateStr) return false;
  return Object.prototype.hasOwnProperty.call(profitData.value, dateStr);
};

const getYears = (value) => {
  const currentYear = dayjs().year();
  const selectedYear = value.year();
  const startYear = Math.min(currentYear - 10, selectedYear - 5);
  const endYear = Math.max(currentYear + 2, selectedYear + 5);
  const years = [];
  for (let i = startYear; i <= endYear; i++) {
    years.push(i);
  }
  return years;
};

const handleGoToday = () => {
  selectedDate.value = dayjs();
};

const getDateKey = (date) => {
  if (!date) return '';

  if (
    typeof date.year === 'function' &&
    typeof date.month === 'function' &&
    typeof date.date === 'function'
  ) {
    const year = date.year();
    const month = String(date.month() + 1).padStart(2, '0');
    const day = String(date.date()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  if (typeof date.format === 'function') {
    return date.format('YYYY-MM-DD');
  }

  const normalized = dayjs(date);
  return normalized.isValid() ? normalized.format('YYYY-MM-DD') : '';
};

const toFiniteNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const formatRate = (value, digits = 2) => {
  const number = toFiniteNumber(value);
  return number === null ? null : number.toFixed(digits);
};

const formatProfitAmount = (value) => {
  const number = toFiniteNumber(value);
  if (number === null) return '--';

  const digits = Math.abs(number) >= 100 ? 0 : 2;
  return `${number >= 0 ? '+' : ''}${number.toFixed(digits)}`;
};

const getProfitClass = (value) => {
  const number = toFiniteNumber(value);
  if (number === null) return '';
  if (number === 0) return 'flat';
  return number > 0 ? 'up' : 'down';
};

const stats = computed(() => {
  if (apiStats.value) {
    const upDays = Math.max(0, Number(apiStats.value.upDays || 0));
    const downDays = Math.max(0, Number(apiStats.value.downDays || 0));
    const totalProfit = toFiniteNumber(apiStats.value.totalProfit) ?? 0;
    const yieldRate = formatRate(apiStats.value.yieldRate);
    const totalDays = upDays + downDays;
    const fallbackWinRate = totalDays > 0 ? ((upDays / totalDays) * 100).toFixed(1) : '0.0';

    return {
      upDays,
      downDays,
      winRate: formatRate(apiStats.value.winRate, 1) ?? fallbackWinRate,
      totalProfit,
      yieldRate
    };
  }

  const values = Object.values(profitData.value).map(value => toFiniteNumber(value) ?? 0);
  const upDays = values.filter(v => v > 0).length;
  const downDays = values.filter(v => v < 0).length;
  const totalDays = upDays + downDays;
  const winRate = totalDays > 0 ? ((upDays / totalDays) * 100).toFixed(1) : '0.0';
  const totalProfit = values.reduce((sum, v) => sum + v, 0);

  // Fallback: use current principal as denominator when monthly baseline assets are unavailable.
  const baseAssets = Number(store.currentPrincipal) || Number(store.totalAssets) || 0;
  const yieldRate = baseAssets > 0 ? ((totalProfit / baseAssets) * 100).toFixed(2) : null;

  return {
    upDays,
    downDays,
    winRate,
    totalProfit,
    yieldRate
  };
});
</script>

<style scoped>
.profit-calendar {
  background: #fff;
  border-radius: 8px;
  overflow: hidden;
}

.profit-calendar.no-click :deep(.ant-picker-calendar-date) {
  pointer-events: none; /* 禁用日期格子的点击事件 */
  cursor: default;
}

.profit-calendar.no-click :deep(.ant-picker-cell-selected .ant-picker-cell-inner) {
  background: transparent !important; /* 移除选中状态的背景色 */
  border: none !important;
}

.profit-calendar.no-click :deep(.ant-picker-cell-selected .ant-picker-calendar-date-value) {
  color: rgba(0, 0, 0, 0.85) !important; /* 保持日期数字颜色 */
}

/* 彻底隐藏非本月的日期单元格内容 */
:deep(.ant-picker-cell-out-view) {
  visibility: hidden !important;
  pointer-events: none !important;
}

:deep(.ant-picker-cell-out-view *) {
  display: none !important;
}

:deep(.ant-picker-calendar-header) {
  padding: 0 !important;
  display: none;
}

.calendar-cell {
  padding: 0;
  margin-top: -1px;
}

.profit-amount {
  font-size: 10px;
  font-weight: 500;
  padding: 0 1px;
  border-radius: 2px;
  text-align: center;
  line-height: 10px;
  white-space: nowrap;
  transform: scale(0.92);
  transform-origin: center top;
}

.profit-amount.up {
  color: #cf1322;
  background-color: rgba(207, 19, 34, 0.05);
}

.profit-amount.flat {
  color: #8c8c8c;
  background-color: rgba(0, 0, 0, 0.04);
}

.profit-amount.down {
  color: #3f8600;
  background-color: rgba(63, 134, 0, 0.05);
}

:deep(.ant-picker-calendar-date) {
  height: 38px !important;
  padding: 1px 2px 0 !important;
}

:deep(.ant-picker-calendar-date-content) {
  height: auto !important;
  min-height: 10px !important;
  margin-top: 4px !important;
  line-height: 10px !important;
  overflow: hidden !important;
}

:deep(.ant-picker-cell-inner) {
  min-width: 20px !important;
  height: 38px !important;
  padding: 0 !important;
}

:deep(.ant-picker-calendar-date-value) {
  min-height: 14px !important;
  margin-bottom: 0 !important;
  line-height: 14px !important;
  font-size: 12px !important;
}

:deep(.ant-picker-content tbody td) {
  padding: 1px 0 !important;
}

:deep(.ant-picker-content thead th) {
  padding-bottom: 2px !important;
}

/* Force week headers to Chinese single characters */
:deep(.ant-picker-content thead th) {
  font-size: 0; /* Hide original text */
}

:deep(.ant-picker-content thead th::before) {
  font-size: 12px; /* Show new text */
  display: block;
  font-weight: 600; /* Bold text */
  color: rgba(0, 0, 0, 0.85);
}

:deep(.ant-picker-content thead th:nth-child(1)::before) { content: "日"; }
:deep(.ant-picker-content thead th:nth-child(2)::before) { content: "一"; }
:deep(.ant-picker-content thead th:nth-child(3)::before) { content: "二"; }
:deep(.ant-picker-content thead th:nth-child(4)::before) { content: "三"; }
:deep(.ant-picker-content thead th:nth-child(5)::before) { content: "四"; }
:deep(.ant-picker-content thead th:nth-child(6)::before) { content: "五"; }
:deep(.ant-picker-content thead th:nth-child(7)::before) { content: "六"; }
</style>
