<template>
  <a-modal
    :open="open"
    title="添加转账"
    ok-text="确认"
    cancel-text="取消"
    @ok="handleOk"
    @cancel="handleCancel"
    :confirm-loading="confirmLoading"
    destroyOnClose
  >
    <div style="margin-bottom: 16px; padding: 12px 16px; background: #f6ffed; border: 1px solid #b7eb8f; border-radius: 4px; display: flex; justify-content: space-between; align-items: center;">
      <span style="color: rgba(0, 0, 0, 0.65);">当前剩余现金</span>
      <span style="color: rgba(0, 0, 0, 0.85); font-size: 18px; font-weight: 500;">
        <template v-if="store.cash !== null && store.cash !== undefined">¥ {{ store.cash.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}</template>
        <template v-else>--</template>
      </span>
    </div>
    <a-form :model="formState" :rules="rules" ref="formRef" layout="vertical" style="position: relative;" class="transfer-form">
      <a-button
        type="link"
        size="small"
        style="position: absolute; right: 0; top: 4px; padding: 0; z-index: 10;"
        @click="showCashRecordModal"
      >
        现金记录
      </a-button>
      <a-form-item label="转账类型" name="type">
        <a-radio-group v-model:value="formState.type" button-style="solid">
          <a-radio-button value="IN">转入本金</a-radio-button>
          <a-radio-button value="OUT">转出本金</a-radio-button>
        </a-radio-group>
      </a-form-item>

      <a-form-item name="date">
        <div style="display: flex; align-items: center; line-height: 1.5;">
          <span style="color: rgba(0, 0, 0, 0.85); margin-right: 8px;">转账日期:</span>
          <span style="color: rgba(0, 0, 0, 0.85); font-size: 14px;">{{ formState.date.format('YYYY-MM-DD') }}</span>
        </div>
      </a-form-item>

      <a-form-item name="amount">
        <template #label>
          <div style="display: flex; align-items: flex-end; width: 100%;">
            <span style="line-height: 1.2;">转账金额</span>
            <span style="font-weight: normal; font-size: 12px; color: #999; margin-left: 12px; line-height: 1.4;">
              当前{{ currencyLabel }}现金金额为 {{ currentCashFormatted }}
            </span>
          </div>
        </template>
        <a-input-number
          v-model:value="formState.amount"
          :min="0.01"
          :precision="2"
          style="width: 100%"
          placeholder="请输入金额"
        >
          <template #addonBefore>
            <a-select v-model:value="formState.currency" style="width: 140px">
              <a-select-option value="CNY">人民币 (CNY)</a-select-option>
              <a-select-option value="HKD">港元 (HKD)</a-select-option>
              <a-select-option value="USD">美元 (USD)</a-select-option>
            </a-select>
          </template>
        </a-input-number>
      </a-form-item>
    </a-form>
  </a-modal>
  
  <CashRecordModal v-model:open="isRecordModalVisible" />
</template>

<script setup>
import { ref, reactive, computed } from 'vue';
import { message } from 'ant-design-vue';
import dayjs from 'dayjs';
import { useTradeStore } from '@/stores/trade';
import CashRecordModal from './CashRecordModal.vue';

const props = defineProps({
  open: Boolean
});

const emit = defineEmits(['update:open', 'success']);

const store = useTradeStore();
const formRef = ref();
const confirmLoading = ref(false);
const isRecordModalVisible = ref(false);

const formState = reactive({
  type: 'IN',
  date: dayjs(),
  currency: 'CNY',
  amount: null
});

const showCashRecordModal = () => {
  isRecordModalVisible.value = true;
};

const currencyLabel = computed(() => {
  const map = { CNY: '人民币', HKD: '港元', USD: '美元' };
  return map[formState.currency];
});

const currentCashFormatted = computed(() => {
  // 基础现金是人民币
  const cashCNY = store.cash;
  
  // 汇率转换 (参考 trade.js 中的汇率)
  const rates = { CNY: 1, HKD: 0.91, USD: 7.23 };
  const rate = rates[formState.currency] || 1;
  
  const convertedCash = cashCNY / rate;
  
  return convertedCash.toLocaleString('en-US', { 
    minimumFractionDigits: 2, 
    maximumFractionDigits: 2 
  });
});

const rules = {
  type: [{ required: true, message: '请选择转账类型' }],
  currency: [{ required: true, message: '请选择币种' }],
  amount: [
    { required: true, message: '请输入金额' },
    {
      validator: async (_rule, value) => {
        if (formState.type !== 'OUT' || !value) return Promise.resolve();
        const rates = { CNY: 1, HKD: 0.91, USD: 7.23 };
        const rate = rates[formState.currency] || 1;
        const amountCNY = Number(value) * rate;
        const cash = Number(store.cash) || 0;
        if (amountCNY > cash) {
          return Promise.reject('转出金额不能大于当前现金余额');
        }
        return Promise.resolve();
      }
    }
  ]
};

const handleOk = async () => {
  try {
    await formRef.value.validate();
    confirmLoading.value = true;
    
    store.addTransferRecord({ 
      ...formState,
      date: formState.date.format('YYYY-MM-DD HH:mm:ss')
    }).then(() => {
      confirmLoading.value = false;
      message.success(`${formState.type === 'IN' ? '转入' : '转出'}成功`);
      handleCancel();
      emit('success');
      
      // 重置表单
      formState.type = 'IN';
      formState.date = dayjs();
      formState.currency = 'CNY';
      formState.amount = null;
    }).catch(() => {
      confirmLoading.value = false;
      message.error('添加失败，请稍后重试');
    });
  } catch (error) {
    console.log('Validate Failed:', error);
  }
};

const handleCancel = () => {
  emit('update:open', false);
};
</script>

<style scoped>
.transfer-form :deep(.ant-form-item) {
  margin-bottom: 16px;
}
</style>
