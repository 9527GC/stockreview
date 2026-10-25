<template>
  <a-modal :open="open" title="添加公司行动" width="560px" ok-text="保存" cancel-text="取消" :confirm-loading="saving" @ok="save" @cancel="emit('update:open', false)">
    <a-alert type="info" show-icon class="action-notice" message="保存后自动重算持仓、成本、现金与收益。" description="同一证券同一天只能新增一条公司行动，不会生成买卖交易或手续费。" />
    <a-form layout="vertical" :model="form" class="action-form">
      <a-form-item label="股票代码 / 名称" required>
        <a-select v-model:value="form.symbol" show-search placeholder="名称 / 代码 / 首字母 / 全拼" :options="allStockOptions" :filter-option="false" @search="handleSearch" @select="handleStockSelect" />
      </a-form-item>
      <a-row :gutter="16">
        <a-col :xs="24" :sm="12">
          <a-form-item label="行动类型" required>
            <a-select v-model:value="form.type">
              <a-select-option v-for="type in types" :key="type.value" :value="type.value">{{ type.label }}</a-select-option>
            </a-select>
          </a-form-item>
        </a-col>
        <a-col :xs="24" :sm="12">
          <a-form-item label="生效日期" required><a-date-picker v-model:value="form.date" value-format="YYYY-MM-DD" placeholder="选择生效日期" style="width: 100%" /></a-form-item>
        </a-col>
      </a-row>
      <a-form-item label="币种">
        <a-select v-model:value="form.currency">
          <a-select-option value="CNY">CNY 人民币</a-select-option>
          <a-select-option value="HKD">HKD 港币</a-select-option>
          <a-select-option value="USD">USD 美元</a-select-option>
        </a-select>
      </a-form-item>
      <a-row v-if="ratio" :gutter="16">
        <a-col :span="12"><a-form-item :label="form.type === 'SPLIT' ? '拆分前股数' : '合并前股数'" required><a-input-number v-model:value="form.ratioDenominator" :min="0.000001" placeholder="例如：1" style="width: 100%" /></a-form-item></a-col>
        <a-col :span="12"><a-form-item :label="form.type === 'SPLIT' ? '拆分后股数' : '合并后股数'" required><a-input-number v-model:value="form.ratioNumerator" :min="0.000001" placeholder="填写行动后股数" style="width: 100%" /></a-form-item></a-col>
      </a-row>
      <a-form-item v-if="quantity" label="增加股数" required><a-input-number v-model:value="form.quantityChange" :min="0.000001" placeholder="填写实际增加的股数" style="width: 100%" /></a-form-item>
      <a-form-item v-if="cash" :label="form.type === 'CASH_DIVIDEND' ? '实际到账金额' : '配股现金支出'" required><a-input-number v-model:value="form.cashAmount" :min="0.01" :precision="2" placeholder="填写现金总额" style="width: 100%" /></a-form-item>
    </a-form>
  </a-modal>
</template>

<script setup>
import { computed, onUnmounted, reactive, ref, watch } from 'vue';
import { message } from 'ant-design-vue';
import { createCorporateAction, searchStock } from '@/api/index';
import { currencyForSymbol, toStockOptions } from '@/utils/corporateAction';

const props = defineProps({ open: Boolean, initialStock: { type: Object, default: null } });
const emit = defineEmits(['update:open', 'changed']);
const saving = ref(false);
const apiStockOptions = ref([]);
let searchTimer = null;

const types = [
  { value: 'CASH_DIVIDEND', label: '现金分红' },
  { value: 'SPLIT', label: '拆分' },
  { value: 'REVERSE_SPLIT', label: '合并' },
  { value: 'STOCK_DIVIDEND', label: '送股' },
  { value: 'BONUS_ISSUE', label: '转增' },
  { value: 'RIGHTS_ISSUE', label: '配股/供股' }
];
const init = () => ({
  symbol: '', name: '', type: 'CASH_DIVIDEND', date: '', currency: 'CNY', cashAmount: null,
  quantityChange: null, ratioNumerator: null, ratioDenominator: null, remark: ''
});
const form = reactive(init());
const ratio = computed(() => ['SPLIT', 'REVERSE_SPLIT'].includes(form.type));
const quantity = computed(() => ['STOCK_DIVIDEND', 'BONUS_ISSUE', 'RIGHTS_ISSUE'].includes(form.type));
const cash = computed(() => ['CASH_DIVIDEND', 'RIGHTS_ISSUE'].includes(form.type));
const allStockOptions = computed(() => {
  if (!form.symbol || apiStockOptions.value.some((option) => option.value === form.symbol)) return apiStockOptions.value;
  return [{ value: form.symbol, label: `${form.symbol} ${form.name}`, name: form.name, currency: form.currency }, ...apiStockOptions.value];
});

const reset = () => {
  Object.assign(form, init());
  if (props.initialStock?.symbol) Object.assign(form, {
    symbol: props.initialStock.symbol,
    name: props.initialStock.name || props.initialStock.stockName || props.initialStock.symbol,
    currency: props.initialStock.currency || currencyForSymbol(props.initialStock.symbol)
  });

  apiStockOptions.value = [];
};
const doSearch = async (keyword) => {
  const value = String(keyword || '').trim();
  if (!value) {
    apiStockOptions.value = [];
    return;
  }
  try {
    const result = await searchStock(value);
    apiStockOptions.value = toStockOptions(result?.suggestions);
  } catch {
    apiStockOptions.value = [];
  }
};
const handleSearch = (keyword) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => doSearch(keyword), 300);
};
const handleStockSelect = (symbol) => {
  const option = allStockOptions.value.find((item) => item.value === symbol);
  if (!option) return;
  form.symbol = option.value;
  form.name = option.name;
  form.currency = option.currency || currencyForSymbol(option.value);
};
const save = async () => {
  if (!form.symbol || !form.name || !form.date) return message.warning('请选择证券并填写生效日期');
  saving.value = true;
  try {
    const data = { ...form, cashAmount: Number(form.cashAmount || 0), quantityChange: Number(form.quantityChange || 0) };
    await createCorporateAction(data);
    message.success('已保存并自动重算');
    reset();
    emit('changed');
  } catch (error) {
    message.error(error?.message || '保存失败，请稍后重试');
  } finally {
    saving.value = false;
  }
};
watch(() => props.open, (visible) => { if (visible) reset(); });
onUnmounted(() => clearTimeout(searchTimer));
</script>

<style scoped>
.action-notice { margin-bottom: 20px; }
.action-form :deep(.ant-form-item) { margin-bottom: 18px; }
</style>
