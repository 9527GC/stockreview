<template>
  <a-modal
    :open="open"
    title="添加交易"
    @ok="handleSubmit"
    @cancel="handleCancel"
    width="600px"
    :bodyStyle="{ maxHeight: '600px', overflowY: 'auto', padding: '0' }"
    :confirmLoading="loading"
    okText="保存"
    cancelText="取消"
  >
    <div style="padding: 16px 12px 16px 24px;">
      <a-form :model="formState" layout="vertical" class="trade-form">
      <a-row :gutter="16">
        <a-col :span="12">
          <a-form-item label="股票代码/名称" required :validate-status="validationErrors.symbol ? 'error' : ''" :help="validationErrors.symbol">
            <a-select
              v-model:value="formState.symbol"
              show-search
              placeholder="输入代码/名称/首字母搜索"
              :options="allStockOptions"
              :filter-option="false"
              @search="handleSearch"
              style="width: 100%"
            >
              <template #option="{ value, label, market }">
                <div style="display: flex; justify-content: space-between;">
                  <span>{{ label }}</span>
                  <span style="color: #999; font-size: 12px">{{ market }}</span>
                </div>
              </template>
            </a-select>
          </a-form-item>
        </a-col>
        <a-col :span="12">
          <a-form-item label="市场">
            <a-radio-group v-model:value="formState.market" button-style="solid" disabled class="market-radio-group">
              <a-radio-button value="CN">A股</a-radio-button>
              <a-radio-button value="HK">港股</a-radio-button>
              <a-radio-button value="US">美股</a-radio-button>
            </a-radio-group>
          </a-form-item>
        </a-col>
      </a-row>

      <a-form-item label="操作方向">
        <a-radio-group v-model:value="formState.type" button-style="solid">
          <a-radio-button value="BUY">买入</a-radio-button>
          <a-radio-button value="SELL">卖出</a-radio-button>
        </a-radio-group>
      </a-form-item>

      <a-row :gutter="16">
        <a-col :span="8">
          <a-form-item label="成交价格" required :validate-status="validationErrors.price ? 'error' : ''" :help="validationErrors.price">
            <a-input-number v-model:value="formState.price" style="width: 100%" :min="0" step="0.01" />
          </a-form-item>
        </a-col>
        <a-col :span="8">
          <a-form-item label="成交数量" required :validate-status="validationErrors.quantity ? 'error' : ''" :help="validationErrors.quantity">
            <a-input-number v-model:value="formState.quantity" style="width: 100%" :min="0" :step="100" :precision="0" />
          </a-form-item>
        </a-col>
        <a-col :span="8">
          <a-form-item>
            <template #label>
              <a-dropdown placement="bottomLeft">
                <span style="cursor: pointer;">
                  {{ feeLabel }}
                  <DownOutlined style="font-size: 12px; margin-left: 4px;" />
                </span>
                <template #overlay>
                  <a-menu @click="handleFeeModeChange">
                    <a-menu-item key="rate">按手续费率</a-menu-item>
                    <a-menu-item key="amount">按费用</a-menu-item>
                  </a-menu>
                </template>
              </a-dropdown>
            </template>
            <a-input-number
              v-model:value="feeInputValue"
              style="width: 100%;"
              :min="0"
              :precision="feePrecision"
              :addon-after="feeAddonAfter"
            />
          </a-form-item>
        </a-col>
      </a-row>

      <a-form-item label="交易时间">
        <a-date-picker v-model:value="formState.date" show-time style="width: 100%" />
      </a-form-item>

      <a-divider style="margin: 24px 0 16px 0;">交易当时</a-divider>

      <!-- Market Overview (Integrated) -->
      <div style="margin-bottom: 24px;">
        <div class="market-overview-card">
          <!-- Market Index Header -->
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
          <span style="font-weight: 600; color: #1f1f1f;">{{ marketOverview.benchmarkName || '上证指数' }}</span>
          <div style="display: flex; gap: 12px; align-items: baseline;">
            <span style="font-size: 16px; font-weight: 600;">{{ formatOverviewValue(marketOverview.index) }}</span>
            <span :style="{ color: getTrendColor(marketOverview.change) }">
              {{ formatSignedOverviewValue(marketOverview.change) }}
            </span>
            <span :style="{ color: getTrendColor(marketOverview.changePercent) }">
              {{ formatSignedOverviewValue(marketOverview.changePercent, 2, '%') }}
            </span>
          </div>
        </div>

        <div style="display: flex; gap: 24px; margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid #e8e8e8;">
          <div style="flex: 1;">
             <div style="color: #8c8c8c; margin-bottom: 4px; font-size: 12px;">涨跌分布</div>
             <div style="display: flex; gap: 8px; font-size: 13px;">
               <span style="color: #cf1322">涨 {{ formatOverviewInteger(marketOverview.upCount) }}</span>
               <span style="color: #3f8600">跌 {{ formatOverviewInteger(marketOverview.downCount) }}</span>
               <span style="color: #8c8c8c">平 {{ formatOverviewInteger(marketOverview.flatCount) }}</span>
             </div>
          </div>
          <div style="flex: 1; border-left: 1px solid #f0f0f0; padding-left: 16px;">
             <div style="color: #8c8c8c; margin-bottom: 4px; font-size: 12px;">涨跌停</div>
             <div style="display: flex; gap: 8px; font-size: 13px;">
               <span style="color: #cf1322">涨停 {{ formatOverviewInteger(marketOverview.limitUpCount) }}</span>
               <span style="color: #3f8600">跌停 {{ formatOverviewInteger(marketOverview.limitDownCount) }}</span>
             </div>
          </div>
        </div>

        <div style="display: flex; gap: 24px; margin-bottom: 12px;">
          <div style="flex: 1;">
             <div style="color: #8c8c8c; margin-bottom: 4px; font-size: 12px;">{{ volumeLabel }}</div>
             <div>{{ formatOverviewVolume(marketOverview.volume) }}</div>
          </div>
          <div style="flex: 1; border-left: 1px solid #f0f0f0; padding-left: 16px;">
             <div style="color: #8c8c8c; margin-bottom: 4px; font-size: 12px;">量比</div>
             <div :style="{ color: getTrendColor(marketOverview.volumeChangeRatio) }">
               {{ formatSignedOverviewValue(marketOverview.volumeChangeRatio, 2, '%') }}
             </div>
          </div>
        </div>
 
        <div style="background: #fff; padding: 8px; border-radius: 4px; border: 1px solid #f0f0f0;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <div style="color: #1890ff; font-weight: 500; font-size: 12px;">关键新闻</div>
            <div style="display: flex; gap: 8px;">
               <OrderedListOutlined 
                 style="cursor: pointer; color: #595959; font-size: 14px;" 
                 title="插入序号"
                 @click="execCommand('insertOrderedList')" 
               />
               <PictureOutlined 
                 style="cursor: pointer; color: #595959; font-size: 14px;" 
                 title="插入图片"
                 @click="triggerImageUpload" 
               />
            </div>
          </div>
          
          <div 
            ref="editorRef"
            contenteditable="true"
            class="news-editor"
            style="min-height: 80px; overflow-y: auto; resize: vertical; font-size: 13px; color: #595959; outline: none; line-height: 1.6;"
            @input="onEditorInput"
            @click="handleEditorClick"
            @keyup="saveSelection"
            @mouseup="saveSelection"
            @focus="saveSelection"
            @paste="handlePaste"
          ></div>
        </div>

        <!-- Image Gallery Preview -->
        <div v-if="marketOverview.images && marketOverview.images.length > 0" style="margin-top: 8px; display: flex; flex-wrap: wrap; gap: 8px;">
          <div v-for="(img, index) in marketOverview.images" :key="index" style="position: relative; width: 60px; height: 60px; border-radius: 4px; overflow: hidden; border: 1px solid #f0f0f0;">
             <a-image
               :width="60"
               :height="60"
               :src="img"
               style="object-fit: cover;"
             />
             <div 
               style="position: absolute; top: 0; right: 0; background: rgba(0,0,0,0.5); color: #fff; width: 16px; height: 16px; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 10px;"
               @click="removeImage(index)"
             >×</div>
          </div>
        </div>
      </div>
    </div>

      <!-- Review Inputs -->
      <a-row :gutter="16">
        <a-col :span="24">
          <a-form-item label="个人状态" name="mood" required :validate-status="validationErrors.mood ? 'error' : ''" :help="validationErrors.mood">
            <a-select v-model:value="formState.mood" style="width: 100%;">
              <a-select-option value="NEUTRAL">中性</a-select-option>
              <a-select-option value="CALM">冷静</a-select-option>
              <a-select-option value="CONFIDENT">自信</a-select-option>
              <a-select-option value="ANXIOUS">焦虑</a-select-option>
              <a-select-option value="IMPULSIVE">冲动</a-select-option>
              <a-select-option value="EXCITED">兴奋</a-select-option>
              <a-select-option value="FEAR">恐惧</a-select-option>
            </a-select>
          </a-form-item>
        </a-col>
        <a-col :span="24">
          <a-form-item label="交易逻辑" name="logic" required :validate-status="validationErrors.logic ? 'error' : ''" :help="validationErrors.logic">
            <a-textarea
              v-model:value="formState.logic"
              :rows="4"
              placeholder="为什么买入/卖出？依据是什么？"
              style="width: 100%;"
            />
          </a-form-item>
        </a-col>
      </a-row>
    </a-form>
    </div>
  </a-modal>
  
  <!-- Hidden File Input (Moved outside modal to ensure availability) -->
  <a-image
    :style="{ display: 'none' }"
    :preview="{
      visible: previewVisible,
      onVisibleChange: (vis) => previewVisible = vis,
      src: previewImage
    }"
  />
</template>

<script setup>
import { reactive, watch, ref, nextTick, computed } from 'vue';
import { useTradeStore } from '@/stores/trade';
import { message } from 'ant-design-vue';
import { OrderedListOutlined, PictureOutlined, DownOutlined } from '@ant-design/icons-vue';
import { searchStock } from '@/api/index';
import dayjs from 'dayjs';

const props = defineProps({
  open: Boolean,
  initialData: {
    type: Object,
    default: () => ({})
  }
});

const emit = defineEmits(['update:open', 'success']);

const store = useTradeStore();

const formState = reactive({
  symbol: '',
  market: 'CN',
  type: 'BUY',
  price: 0,
  quantity: 100,
  feeMode: 'rate',
  feeRate: 5,
  feeAmount: 0,
  date: dayjs(),
  logic: '',
  mood: 'NEUTRAL'
});

const currencyCode = computed(() => {
  const map = { HK: 'HKD', US: 'USD', CN: 'CNY' };
  return map[formState.market] || 'CNY';
});

const feeLabel = computed(() => formState.feeMode === 'rate' ? '手续费率' : '手续费');

const feeInputValue = computed({
  get() {
    return formState.feeMode === 'rate' ? formState.feeRate : formState.feeAmount;
  },
  set(val) {
    if (formState.feeMode === 'rate') {
      formState.feeRate = val;
    } else {
      formState.feeAmount = val;
    }
  }
});

const feeAddonAfter = computed(() => formState.feeMode === 'rate' ? '‱' : currencyCode.value);

const feePrecision = computed(() => formState.feeMode === 'amount' ? 2 : undefined);

const handleFeeModeChange = ({ key }) => {
  formState.feeMode = key;
};

const volumeLabel = computed(() => {
  return formState.market === 'CN' ? 'A股全市成交' : '成交量';
});

watch(() => props.open, (newVal) => {
  if (newVal) {
    Object.keys(validationErrors).forEach(key => validationErrors[key] = '');
    resetMarketOverviewDisplay();
    resetMarketOverviewNotes();
    if (props.initialData && props.initialData.symbol) {
      formState.symbol = props.initialData.symbol;
      formState.market = props.initialData.market || 'CN';
      formState.price = props.initialData.currentPrice || 0;
      formState.type = 'BUY';
      formState.date = dayjs();
    } else {
      // Default reset if no initialData
      formState.symbol = '';
      formState.market = 'CN';
      formState.type = 'BUY';
      formState.price = 0;
      formState.quantity = 100;
      formState.mood = 'NEUTRAL';
      formState.logic = '';
      formState.date = dayjs();
    }
    // 先恢复默认，再按当前市场加载最近一次手续费偏好
    formState.feeMode = 'rate';
    formState.feeRate = 5;
    formState.feeAmount = 0;
    loadCommissionPreference(formState.market);
  }
});

const marketOverview = reactive({
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
  volumeChangeRatio: null,
  news: '',
  images: []
});

const toFiniteNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const formatOverviewVolume = (value) => {
  const number = toFiniteNumber(value);
  if (number === null) return '--';

  // Compatible with both raw volume values and already-normalized "亿" snapshots.
  const volumeInYi = Math.abs(number) >= 1000 ? number / 100000000 : number;
  const digits = Math.abs(volumeInYi) >= 1 ? 2 : 4;
  return `${volumeInYi.toFixed(digits)}亿`;
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

const getTrendColor = (value) => {
  const number = toFiniteNumber(value);
  if (number === null) return '#8c8c8c';
  return number >= 0 ? '#cf1322' : '#3f8600';
};

// Rich Editor Logic
const editorRef = ref(null);
const previewVisible = ref(false);
const previewImage = ref('');
const savedRange = ref(null);
const apiStockOptions = ref([]);

const handleSearch = async (val) => {
  if (!val) {
    apiStockOptions.value = [];
    return;
  }
  try {
    const res = await searchStock(val);
    if (res && res.suggestions) {
      apiStockOptions.value = res.suggestions.map(s => ({
        value: s.symbol,
        label: `${s.symbol} ${s.name}`,
        name: s.name,
        market: s.market === 'SH' || s.market === 'SZ' || s.market === 'BJ' ? 'A股' : (s.market === 'HK' ? '港股' : '美股')
      }));
    }
  } catch (err) {
    console.error('Failed to search stock:', err);
  }
};

const allStockOptions = computed(() => {
  if (apiStockOptions.value.length > 0) return apiStockOptions.value;
  return stockOptions;
});

const saveSelection = () => {
  const selection = window.getSelection();
  if (selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    if (editorRef.value && editorRef.value.contains(range.commonAncestorContainer)) {
      savedRange.value = range;
    }
  }
};

// Sync editor content when marketOverview.news changes externally
watch(() => marketOverview.news, (newVal) => {
  if (editorRef.value && newVal !== editorRef.value.innerHTML) {
    if (document.activeElement !== editorRef.value) {
      editorRef.value.innerHTML = newVal;
    } else if (!editorRef.value.innerHTML && newVal) {
       editorRef.value.innerHTML = newVal;
    }
  }
}, { immediate: true });

const onEditorInput = (e) => {
  marketOverview.news = e.target.innerHTML;
  saveSelection();
};

const execCommand = (command, value = null) => {
  // Restore selection before executing command if button clicked
  if (editorRef.value) {
    editorRef.value.focus();
    // If we have a saved range, restore it
    if (savedRange.value) {
       const selection = window.getSelection();
       selection.removeAllRanges();
       selection.addRange(savedRange.value);
    }
  }
  document.execCommand(command, false, value);
  if (editorRef.value) {
    marketOverview.news = editorRef.value.innerHTML;
  }
};

const triggerImageUpload = () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.style.display = 'none';
  
  input.onchange = (e) => {
    handleImageUpload(e);
    if (input.parentNode) {
      input.parentNode.removeChild(input);
    }
  };
  
  document.body.appendChild(input);
  input.click();
};

const insertImage = (base64) => {
  // Add to images array instead of inserting into editor
  if (!marketOverview.images) {
    marketOverview.images = [];
  }
  marketOverview.images.push(base64);
};

const removeImage = (index) => {
  marketOverview.images.splice(index, 1);
};

const handleImageUpload = (e) => {
  const file = e.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = (event) => {
    insertImage(event.target.result);
    // Reset input
    e.target.value = '';
  };
  reader.readAsDataURL(file);
};

const handlePaste = (e) => {
  const items = (e.clipboardData || e.originalEvent.clipboardData).items;
  for (const item of items) {
    if (item.type.indexOf('image') !== -1) {
      e.preventDefault();
      const file = item.getAsFile();
      const reader = new FileReader();
      reader.onload = (event) => {
        insertImage(event.target.result);
      };
      reader.readAsDataURL(file);
      // Only paste the first image found
      break;
    }
  }
};

const handleEditorClick = (e) => {
  if (e.target.tagName === 'IMG') {
    previewImage.value = e.target.src;
    previewVisible.value = true;
  }
};

watch(() => [formState.market, formState.date], ([newMarket, newDate]) => {
  if (!newDate) return;
  const dateStr = dayjs(newDate).format('YYYY-MM-DD');
  const todayStr = dayjs().format('YYYY-MM-DD');
  if (dateStr === todayStr) {
    // 今天：获取实时大盘（含 A 股全市场指标）
    store.fetchMarketOverview();
  } else {
    // 历史：按交易日期获取收盘大盘快照
    store.fetchMarketOverview({ date: dateStr });
  }
}, { immediate: true });

const resetMarketOverviewDisplay = () => {
  marketOverview.benchmarkName = '';
  marketOverview.index = null;
  marketOverview.change = null;
  marketOverview.changePercent = null;
  marketOverview.upCount = null;
  marketOverview.downCount = null;
  marketOverview.flatCount = null;
  marketOverview.limitUpCount = null;
  marketOverview.limitDownCount = null;
  marketOverview.volume = null;
  marketOverview.volumeChangeRatio = null;
};

const resetMarketOverviewNotes = () => {
  marketOverview.news = '';
  marketOverview.images = [];
};

// Sync store market overview to local reactive object
watch(() => store.marketOverview, (newVal) => {
  if (newVal && newVal.length > 0) {
    const marketMap = { CN: '上证指数', HK: '恒生指数', US: '标普500' };
    const targetName = marketMap[formState.market];
    const matchedIndex = targetName
      ? newVal.find(item => item.name === targetName) || newVal[0]
      : newVal[0];
    if (matchedIndex) {
      const price = toFiniteNumber(matchedIndex.price);
      const change = toFiniteNumber(matchedIndex.change);
      const changePercent = toFiniteNumber(matchedIndex.changePercent);

      marketOverview.benchmarkName = matchedIndex.name || '';
      marketOverview.index = price;
      marketOverview.changePercent = changePercent;
      marketOverview.change = change !== null
        ? change
        : (
            price !== null && changePercent !== null
              ? price * (changePercent / 100)
              : null
          );
      marketOverview.volume = toFiniteNumber(matchedIndex.volume);
      marketOverview.upCount = toFiniteNumber(matchedIndex.upCount);
      marketOverview.downCount = toFiniteNumber(matchedIndex.downCount);
      marketOverview.flatCount = toFiniteNumber(matchedIndex.flatCount);
      marketOverview.limitUpCount = toFiniteNumber(matchedIndex.limitUpCount);
      marketOverview.limitDownCount = toFiniteNumber(matchedIndex.limitDownCount);
      marketOverview.volumeChangeRatio = toFiniteNumber(matchedIndex.volumeChangeRatio);
    }
  }
}, { deep: true });

// Mock Stock Data (仅开发环境作为兜底)
const stockOptions = import.meta.env.DEV ? [
  { value: '600519.SH', label: '600519 贵州茅台', name: '贵州茅台', pinyin: 'GZMT', market: 'A股', price: 1780.50 },
  { value: '000001.SZ', label: '000001 平安银行', name: '平安银行', pinyin: 'PAYH', market: 'A股', price: 10.45 },
  { value: '300750.SZ', label: '300750 宁德时代', name: '宁德时代', pinyin: 'NDSD', market: 'A股', price: 185.20 },
  { value: '601127.SH', label: '601127 赛力斯', name: '赛力斯', pinyin: 'SLS', market: 'A股', price: 88.60 },
  { value: '00700.HK', label: '00700 腾讯控股', name: '腾讯控股', pinyin: 'TXKG', market: '港股', price: 290.80 },
  { value: '03690.HK', label: '03690 美团-W', name: '美团', pinyin: 'MT', market: '港股', price: 110.30 },
  { value: '01810.HK', label: '01810 小米集团-W', name: '小米集团', pinyin: 'XMJT', market: '港股', price: 14.50 },
  { value: 'AAPL.US', label: 'AAPL 苹果', name: '苹果', pinyin: 'PG', market: '美股', price: 185.90 },
  { value: 'TSLA.US', label: 'TSLA 特斯拉', name: '特斯拉', pinyin: 'TSL', market: '美股', price: 220.45 },
  { value: 'NVDA.US', label: 'NVDA 英伟达', name: '英伟达', pinyin: 'YWD', market: '美股', price: 650.10 },
  { value: 'BABA.US', label: 'BABA 阿里巴巴', name: '阿里巴巴', pinyin: 'ALBB', market: '美股', price: 75.80 }
] : [];

// Auto-detect market based on symbol
watch(() => formState.symbol, (newVal) => {
  if (!newVal) return;
  const upperVal = newVal.toUpperCase().trim();
  
  // Check against options first
  const matchedOption = allStockOptions.value.find(opt => opt.value === upperVal);
  if (matchedOption) {
    if (matchedOption.market === 'A股') formState.market = 'CN';
    else if (matchedOption.market === '港股') formState.market = 'HK';
    else if (matchedOption.market === '美股') formState.market = 'US';
    
    // Fetch real-time price
    fetchPrice(matchedOption.value);
    return;
  }

  // Explicit suffix check
  if (upperVal.endsWith('.SH') || upperVal.endsWith('.SZ') || upperVal.endsWith('.BJ')) {
    formState.market = 'CN';
    fetchPrice(upperVal);
    return;
  }
  if (upperVal.endsWith('.HK')) {
    formState.market = 'HK';
    fetchPrice(upperVal);
    return;
  }
  if (upperVal.endsWith('.US')) {
    formState.market = 'US';
    fetchPrice(upperVal);
    return;
  }

  // Heuristic based on pattern
  // 6 digits: likely CN (A-share)
  if (/^\d{6}$/.test(upperVal)) {
    formState.market = 'CN';
    fetchPrice(upperVal); // Try to fetch price even if heuristic
    return;
  }
  // 5 digits: likely HK
  if (/^\d{5}$/.test(upperVal)) {
    formState.market = 'HK';
    fetchPrice(upperVal); // Try to fetch price even if heuristic
    return;
  }
  // All letters (3-5 chars usually): likely US
  if (/^[A-Z]{1,5}$/.test(upperVal)) {
    formState.market = 'US';
    fetchPrice(upperVal); // Try to fetch price even if heuristic
    return;
  }
});

const loadCommissionPreference = async (market) => {
  if (!['CN', 'HK', 'US'].includes(market)) return;
  try {
    const pref = await store.fetchCommissionPreference();
    const p = pref?.[market];
    if (p) {
      formState.feeMode = p.mode === 'amount' ? 'amount' : 'rate';
      if (formState.feeMode === 'rate') {
        formState.feeRate = Number(p.rate) || 0;
      } else {
        formState.feeAmount = Number(p.amount) || 0;
      }
    }
  } catch (err) {
    console.error('Failed to load commission preference:', err);
  }
};

watch(() => formState.market, (newMarket) => {
  loadCommissionPreference(newMarket);
});

const fetchPrice = async (symbol) => {
  try {
    const res = await store.fetchRealTimeQuote(symbol);
    if (res && res.price) {
      formState.price = res.price;
    }
  } catch (e) {
    console.error('Failed to fetch price', e);
  }
};

const handleCancel = () => {
  emit('update:open', false);
};

const loading = ref(false);

const validationErrors = reactive({
  symbol: '',
  price: '',
  quantity: '',
  mood: '',
  logic: ''
});

const clearFieldError = (field) => {
  if (validationErrors[field]) validationErrors[field] = '';
};

const validateForm = () => {
  Object.keys(validationErrors).forEach(key => validationErrors[key] = '');
  let isValid = true;

  if (!formState.symbol) {
    validationErrors.symbol = '请选择股票代码/名称';
    isValid = false;
  }
  if (!formState.price || formState.price <= 0) {
    validationErrors.price = '请输入成交价格';
    isValid = false;
  }
  if (!formState.quantity || formState.quantity <= 0) {
    validationErrors.quantity = '请输入成交数量';
    isValid = false;
  }
  if (!formState.mood) {
    validationErrors.mood = '请选择个人状态';
    isValid = false;
  }
  if (!formState.logic || !formState.logic.trim()) {
    validationErrors.logic = '请输入交易逻辑';
    isValid = false;
  }
  return isValid;
};

watch(() => formState.symbol, () => clearFieldError('symbol'));
watch(() => formState.price, () => clearFieldError('price'));
watch(() => formState.quantity, () => clearFieldError('quantity'));
watch(() => formState.mood, () => clearFieldError('mood'));
watch(() => formState.logic, () => clearFieldError('logic'));

const handleSubmit = () => {
  if (loading.value) return;

  if (!validateForm()) {
    message.error('请填写完整的交易信息');
    return;
  }

  loading.value = true;
  const matchedOption = allStockOptions.value.find(opt => opt.value === formState.symbol);

  // 组装当前交易时间点的大盘快照（不含 news，news 单独发送）
  const marketOverviewSnapshot = {
    benchmarkName: marketOverview.benchmarkName,
    index: marketOverview.index,
    change: marketOverview.change,
    changePercent: marketOverview.changePercent,
    upCount: marketOverview.upCount,
    downCount: marketOverview.downCount,
    flatCount: marketOverview.flatCount,
    limitUpCount: marketOverview.limitUpCount,
    limitDownCount: marketOverview.limitDownCount,
    volume: marketOverview.volume,
    volumeChangeRatio: marketOverview.volumeChangeRatio,
    ...(marketOverview.images && marketOverview.images.length ? { images: marketOverview.images } : {})
  };

  const tradeAmount = formState.price * formState.quantity;
  const commission = formState.feeMode === 'rate'
    ? (tradeAmount * (formState.feeRate || 0)) / 10000
    : Number(formState.feeAmount || 0);

  const tradeData = {
    ...formState,
    name: matchedOption ? matchedOption.name : '',
    currency: formState.market === 'HK' ? 'HKD' : formState.market === 'US' ? 'USD' : 'CNY',
    marketOverview: marketOverviewSnapshot,
    news: marketOverview.news || '',
    commission,
    feeMode: formState.feeMode,
    feeRate: formState.feeMode === 'rate' ? formState.feeRate : null,
    feeAmount: formState.feeMode === 'amount' ? formState.feeAmount : null,
    date: formState.date.format('YYYY-MM-DD HH:mm:ss')
  };

  // 清理不需要发送的字段
  if (formState.feeMode === 'rate') {
    delete tradeData.feeAmount;
  } else {
    delete tradeData.feeRate;
  }

  store.addTrade(tradeData).then(() => {
    loading.value = false;
    message.success('交易记录已添加');
    emit('success');
    emit('update:open', false);

    // Reset form
    formState.symbol = '';
    formState.price = 0;
    formState.quantity = 100;
    formState.logic = '';
    formState.mood = 'NEUTRAL';
    formState.feeMode = 'rate';
    formState.feeRate = 5;
    formState.feeAmount = 0;
    formState.date = dayjs();
    resetMarketOverviewNotes();
  }).catch((err) => {
    loading.value = false;
    if (
      formState.type === 'SELL' &&
      (err?.message === 'Sell quantity exceeds holding quantity' || err?.message === 'No holdings available for this symbol')
    ) {
      message.error('已超出持仓数，请核实');
      return;
    }
    message.error('添加失败，请稍后重试');
  });
};
</script>

<style scoped>
.trade-form :deep(.ant-form-item) {
  margin-bottom: 12px;
}

.market-radio-group :deep(.ant-radio-button-wrapper-checked.ant-radio-button-wrapper-disabled) {
  background-color: #e6f7ff;
  color: #1890ff;
  border-color: #1890ff;
  opacity: 1; /* Override opacity reduction for clearer visibility */
  font-weight: 500;
}

.news-editor :deep(ol),
.news-editor :deep(ul) {
  padding-left: 20px;
  margin-top: 4px;
  margin-bottom: 4px;
}
</style>
