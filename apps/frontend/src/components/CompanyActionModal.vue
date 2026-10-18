<template>
  <a-modal :open="open" :title="mode === 'edit' ? '编辑公司行动' : '添加公司行动'" :footer="null" width="560px" @update:open="$emit('update:open', $event)">
    <a-form layout="vertical" :model="form" @finish="submit">
      <a-form-item label="股票" required>
        <a-select v-model:value="form.symbol" show-search :filter-option="false" :options="stockOptions" :not-found-content="searching ? undefined : '输入股票代码或名称搜索'" placeholder="输入股票代码或名称搜索" @search="handleSearch" @select="handleStockSelect" />
      </a-form-item>
      <a-form-item label="行动日期" required><a-date-picker v-model:value="form.date" style="width:100%" show-time /></a-form-item>
      <a-form-item label="行动类型" required>
        <a-select v-model:value="form.type" @change="handleTypeChange">
          <a-select-option value="DIVIDEND">现金分红</a-select-option>
          <a-select-option value="SPLIT">拆股</a-select-option>
          <a-select-option value="MERGER">合并</a-select-option>
          <a-select-option value="BONUS">送股/转增</a-select-option>
          <a-select-option value="RIGHTS">配股</a-select-option>
          <a-select-option value="OTHER">其他</a-select-option>
        </a-select>
      </a-form-item>

      <a-alert v-if="typeHint" :message="typeHint" type="info" show-icon style="margin-bottom: 16px" />

      <template v-if="form.type === 'DIVIDEND'">
        <a-form-item label="每股分红金额" required><a-input-number v-model:value="form.cashPerShare" :min="0" :precision="6" style="width:100%" placeholder="例如：0.56" /></a-form-item>
        <a-form-item label="实际到账现金金额"><a-input-number v-model:value="form.cashAmount" :min="0" :precision="2" style="width:100%" placeholder="可选，不填时按持仓数量计算" /></a-form-item>
      </template>

      <template v-else-if="form.type === 'SPLIT' || form.type === 'MERGER'">
        <a-row :gutter="12">
          <a-col :span="12"><a-form-item :label="form.type === 'SPLIT' ? '拆股前每股' : '合并前每股'" required><a-input-number v-model:value="form.beforeQuantity" :min="0.000001" :precision="6" style="width:100%" /></a-form-item></a-col>
          <a-col :span="12"><a-form-item :label="form.type === 'SPLIT' ? '拆股后每股' : '合并后每股'" required><a-input-number v-model:value="form.afterQuantity" :min="0.000001" :precision="6" style="width:100%" /></a-form-item></a-col>
        </a-row>
        <div class="ratio-preview">换算比例：{{ ratioText }}</div>
      </template>

      <template v-else-if="form.type === 'BONUS'">
        <a-row :gutter="12">
          <a-col :span="12"><a-form-item label="每持有股数" required><a-input-number v-model:value="form.beforeQuantity" :min="0.000001" :precision="6" style="width:100%" /></a-form-item></a-col>
          <a-col :span="12"><a-form-item label="送转股数" required><a-input-number v-model:value="form.bonusQuantity" :min="0" :precision="6" style="width:100%" /></a-form-item></a-col>
        </a-row>
        <div class="ratio-preview">例如：每 10 股送转 2 股</div>
      </template>

      <template v-else-if="form.type === 'RIGHTS'">
        <a-row :gutter="12">
          <a-col :span="12"><a-form-item label="每持有股数" required><a-input-number v-model:value="form.beforeQuantity" :min="0.000001" :precision="6" style="width:100%" /></a-form-item></a-col>
          <a-col :span="12"><a-form-item label="可配股数" required><a-input-number v-model:value="form.rightsQuantity" :min="0" :precision="6" style="width:100%" /></a-form-item></a-col>
        </a-row>
        <a-form-item label="配股价格" required><a-input-number v-model:value="form.subscriptionPrice" :min="0" :precision="6" style="width:100%" /></a-form-item>
        <a-form-item label="实际参与配股数量"><a-input-number v-model:value="form.subscribedQuantity" :min="0" :precision="6" style="width:100%" placeholder="不填则按可配股数记录" /></a-form-item>
      </template>

      <template v-else>
        <a-row :gutter="12"><a-col :span="12"><a-form-item label="份额变动"><a-input-number v-model:value="form.quantityChange" :precision="6" style="width:100%" /></a-form-item></a-col><a-col :span="12"><a-form-item label="现金金额"><a-input-number v-model:value="form.cashAmount" :precision="2" style="width:100%" /></a-form-item></a-col></a-row>
      </template>

      <a-form-item label="说明" required><a-textarea v-model:value="form.description" :placeholder="descriptionPlaceholder" :rows="3" /></a-form-item>
      <div style="text-align:right"><a-button @click="$emit('update:open', false)">取消</a-button><a-button type="primary" html-type="submit" :loading="saving" style="margin-left:8px">保存</a-button></div>
    </a-form>
  </a-modal>
</template>

<script setup>
import { computed, reactive, ref, watch } from 'vue';
import dayjs from 'dayjs';
import { message } from 'ant-design-vue';
import { addCompanyAction, updateCompanyAction, searchStock } from '@/api/index';

const props = defineProps({ open: Boolean, mode: { type: String, default: 'add' }, action: { type: Object, default: null } });
const emit = defineEmits(['update:open', 'success']);
const saving = ref(false);
const searching = ref(false);
const stockOptions = ref([]);
const emptyActionFields = () => ({ beforeQuantity: null, afterQuantity: null, bonusQuantity: null, rightsQuantity: null, subscribedQuantity: null, cashPerShare: null, subscriptionPrice: null });
const form = reactive({ symbol: '', name: '', market: '', currency: 'CNY', date: dayjs(), type: 'DIVIDEND', description: '', quantityChange: 0, cashAmount: null, ...emptyActionFields() });
let searchTimer;

const typeHint = computed(() => ({
  DIVIDEND: '记录每股分红；如已知道账单到账金额，也可以同时填写。',
  SPLIT: '填写拆股前后每股对应的股数，例如 1 拆 2。',
  MERGER: '填写合并前后每股对应的股数，例如 10 合 1。',
  BONUS: '填写每持有多少股可获得多少送转股。',
  RIGHTS: '填写配股比例和配股价格；实际参与数量可按账户记录填写。',
  OTHER: '可使用通用的份额变动和现金金额记录。'
}[form.type] || ''));
const ratioText = computed(() => form.beforeQuantity && form.afterQuantity ? `${form.beforeQuantity} : ${form.afterQuantity}` : '--');
const descriptionPlaceholder = computed(() => ({ DIVIDEND: '例如：10股派0.56元', SPLIT: '例如：10股拆成20股', MERGER: '例如：10股合并为1股', BONUS: '例如：10股送2股', RIGHTS: '例如：10配3，配股价8.50元', OTHER: '补充说明行动内容' }[form.type]));

const resetActionFields = () => Object.assign(form, { quantityChange: 0, cashAmount: null, ...emptyActionFields() });
const handleTypeChange = () => resetActionFields();
const resetForm = () => { Object.assign(form, { symbol: '', name: '', market: '', currency: 'CNY', date: dayjs(), type: 'DIVIDEND', description: '', ...emptyActionFields(), quantityChange: 0, cashAmount: null }); stockOptions.value = []; };
const doSearch = async (keyword) => { const value = String(keyword || '').trim(); if (!value) { stockOptions.value = []; return; } searching.value = true; try { const res = await searchStock(value); stockOptions.value = (res?.suggestions || []).map(stock => ({ value: stock.symbol, label: `${stock.symbol} ${stock.name}`, stock })); } catch (error) { stockOptions.value = []; } finally { searching.value = false; } };
const handleSearch = (keyword) => { clearTimeout(searchTimer); searchTimer = setTimeout(() => doSearch(keyword), 300); };
const handleStockSelect = (symbol) => { const selected = stockOptions.value.find(option => option.value === symbol)?.stock; if (!selected) return; form.name = selected.name; form.market = selected.market || ''; form.currency = selected.market === 'HK' ? 'HKD' : selected.market === 'US' ? 'USD' : 'CNY'; };
const fillForm = (action) => {
  if (!action) return resetForm();
  Object.assign(form, { symbol: action.symbol || '', name: action.name || action.stockName || '', market: action.market || '', currency: action.currency || 'CNY', date: action.date ? dayjs(action.date) : dayjs(), type: action.actionType || action.type || 'OTHER', description: action.description || '', quantityChange: action.quantityChange ?? 0, cashAmount: action.cashAmount ?? null, beforeQuantity: action.beforeQuantity ?? action.ratioNumerator ?? null, afterQuantity: action.afterQuantity ?? action.ratioDenominator ?? null, bonusQuantity: action.bonusQuantity ?? null, rightsQuantity: action.rightsQuantity ?? null, subscribedQuantity: action.subscribedQuantity ?? null, cashPerShare: action.cashPerShare ?? null, subscriptionPrice: action.subscriptionPrice ?? null });
  stockOptions.value = [{ value: form.symbol, label: form.symbol + ' ' + form.name, stock: { symbol: form.symbol, name: form.name, market: form.market } }];
};
watch(() => props.open, visible => { if (visible) fillForm(props.mode === 'edit' ? props.action : null); });
watch(() => props.action, action => { if (props.open && props.mode === 'edit') fillForm(action); });

const validate = () => {
  if (!form.symbol || !form.name || !form.date || !String(form.description || '').trim()) return '请选择股票并填写行动日期和说明';
  if (form.type === 'DIVIDEND' && !(Number(form.cashPerShare) > 0)) return '请输入每股分红金额';
  if ((form.type === 'SPLIT' || form.type === 'MERGER') && (!(Number(form.beforeQuantity) > 0) || !(Number(form.afterQuantity) > 0))) return '请填写行动前后股数';
  if (form.type === 'BONUS' && (!(Number(form.beforeQuantity) > 0) || !(Number(form.bonusQuantity) >= 0))) return '请填写送转股参数';
  if (form.type === 'RIGHTS' && (!(Number(form.beforeQuantity) > 0) || !(Number(form.rightsQuantity) >= 0) || !(Number(form.subscriptionPrice) >= 0))) return '请填写完整的配股参数';
  return '';
};
const submit = async () => { const error = validate(); if (error) { message.error(error); return; } saving.value = true; try { const payload = { ...form, description: form.description.trim(), date: form.date.format('YYYY-MM-DD HH:mm:ss'), ratioNumerator: form.beforeQuantity, ratioDenominator: form.afterQuantity }; const result = props.mode === 'edit' ? await updateCompanyAction(props.action.id || props.action._id, payload) : await addCompanyAction(payload); message.success(props.mode === 'edit' ? '公司行动已更新' : '公司行动已保存，将仅显示在行动发生时持有该股票的记录中'); emit('update:open', false); emit('success', result?.symbol || form.symbol); } catch (error) { message.error(error?.response?.data?.message || error?.message || '保存失败'); } finally { saving.value = false; } };
</script>

<style scoped>
.ratio-preview { margin: -6px 0 12px; color: #8c8c8c; font-size: 12px; }
</style>
