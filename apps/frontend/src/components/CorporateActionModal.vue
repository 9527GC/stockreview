<template>
  <a-modal :open="open" title="公司行动管理" width="900px" :footer="null" @cancel="emit('update:open', false)">
    <a-alert
      type="info"
      show-icon
      style="margin-bottom: 16px"
      message="公司行动会独立保存并自动重算持仓、成本、现金与收益，不会生成 0 元买卖或手续费。同一证券同一天只能新增一条公司行动。"
    />
    <a-form layout="inline" :model="form" style="margin-bottom: 12px">
      <a-form-item>
        <a-select
          v-model:value="form.symbol"
          show-search
          placeholder="输入代码、名称或首字母搜索"
          :options="allStockOptions"
          :filter-option="false"
          style="width: 250px"
          @search="handleSearch"
          @select="handleStockSelect"
        />
      </a-form-item>
      <a-form-item>
        <a-select v-model:value="form.type" style="width: 130px">
          <a-select-option v-for="type in types" :key="type.value" :value="type.value">{{ type.label }}</a-select-option>
        </a-select>
      </a-form-item>
      <a-form-item><a-date-picker v-model:value="form.date" value-format="YYYY-MM-DD" /></a-form-item>
      <a-form-item>
        <a-select v-model:value="form.currency" style="width: 80px">
          <a-select-option value="CNY">CNY</a-select-option>
          <a-select-option value="HKD">HKD</a-select-option>
          <a-select-option value="USD">USD</a-select-option>
        </a-select>
      </a-form-item>
    </a-form>
    <a-form layout="inline" :model="form" style="margin-bottom: 16px">
      <a-form-item v-if="ratio"><a-input-number v-model:value="form.ratioDenominator" :min="0.000001" placeholder="拆分前" /></a-form-item>
      <a-form-item v-if="ratio">:</a-form-item>
      <a-form-item v-if="ratio"><a-input-number v-model:value="form.ratioNumerator" :min="0.000001" placeholder="拆分后" /></a-form-item>
      <a-form-item v-if="quantity"><a-input-number v-model:value="form.quantityChange" :min="0.000001" placeholder="增加份额" /></a-form-item>
      <a-form-item v-if="cash"><a-input-number v-model:value="form.cashAmount" :min="0.01" placeholder="金额/现金支出" /></a-form-item>
      <a-form-item>
        <a-button type="primary" :loading="saving" @click="save">{{ editingId ? '保存' : '新增' }}</a-button>
        <a-button v-if="editingId" style="margin-left: 8px" @click="reset">取消</a-button>
      </a-form-item>
    </a-form>
    <a-table :data-source="actions" :columns="columns" :loading="loading" :pagination="false" row-key="_id" size="small">
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'date'">{{ String(record.date).slice(0, 10) }}</template>
        <template v-else-if="column.key === 'type'">{{ label(record.type) }}</template>
        <template v-else-if="column.key === 'detail'">{{ detail(record) }}</template>
        <template v-else-if="column.key === 'operation'">
          <a-button type="link" size="small" @click="edit(record)">编辑</a-button>
          <a-popconfirm title="确定删除并自动重算统计？" @confirm="remove(record)">
            <a-button type="link" danger size="small">删除</a-button>
          </a-popconfirm>
        </template>
      </template>
    </a-table>
  </a-modal>
</template>

<script setup>
import { computed, onUnmounted, reactive, ref, watch } from 'vue';
import { message } from 'ant-design-vue';
import { createCorporateAction, deleteCorporateAction, getCorporateActions, searchStock, updateCorporateAction } from '@/api/index';
import { currencyForSymbol, toStockOptions } from '@/utils/corporateAction';

const props = defineProps({ open: Boolean });
const emit = defineEmits(['update:open', 'changed']);
const loading = ref(false);
const saving = ref(false);
const actions = ref([]);
const editingId = ref(null);
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
const columns = [
  { title: '日期', key: 'date' },
  { title: '证券', dataIndex: 'symbol' },
  { title: '名称', dataIndex: 'name' },
  { title: '类型', key: 'type' },
  { title: '明细', key: 'detail' },
  { title: '操作', key: 'operation' }
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

const load = async () => {
  loading.value = true;
  try {
    actions.value = (await getCorporateActions()).list || [];
  } catch {
    message.error('读取公司行动失败，请稍后重试');
  } finally {
    loading.value = false;
  }
};
const reset = () => {
  Object.assign(form, init());
  editingId.value = null;
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
    if (editingId.value) await updateCorporateAction(editingId.value, data);
    else await createCorporateAction(data);
    message.success('已保存并自动重算');
    reset();
    await load();
    emit('changed');
  } catch (error) {
    message.error(error?.message || '保存失败，请稍后重试');
  } finally {
    saving.value = false;
  }
};
const edit = (record) => {
  editingId.value = record._id;
  Object.assign(form, { ...init(), ...record, date: String(record.date).slice(0, 10) });
  apiStockOptions.value = [{ value: record.symbol, label: `${record.symbol} ${record.name}`, name: record.name, currency: record.currency }];
};
const remove = async (record) => {
  try {
    await deleteCorporateAction(record._id);
    message.success('已删除并自动重算');
    await load();
    emit('changed');
  } catch (error) {
    message.error(error?.message || '删除失败，请稍后重试');
  }
};
const label = (type) => types.find((item) => item.value === type)?.label || type;
const ratioType = (type) => ['SPLIT', 'REVERSE_SPLIT'].includes(type);
const detail = (action) => {
  if (ratioType(action.type)) return `${action.ratioDenominator}:${action.ratioNumerator}`;
  if (action.type === 'RIGHTS_ISSUE') return `+${action.quantityChange}，支出 ${action.cashAmount} ${action.currency}`;
  if (action.type === 'CASH_DIVIDEND') return `${action.cashAmount} ${action.currency}`;
  return `+${action.quantityChange}`;
};

watch(() => props.open, (visible) => { if (visible) load(); });
onUnmounted(() => clearTimeout(searchTimer));
</script>
