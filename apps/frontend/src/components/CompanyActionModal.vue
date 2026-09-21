<template>
  <a-modal :open="open" title="公司行动" :footer="null" width="520px" @update:open="$emit('update:open', $event)">
    <a-form layout="vertical" :model="form" @finish="submit">
      <a-form-item label="股票"><a-input :value="holding?.name + ' (' + holding?.symbol + ')'" disabled /></a-form-item>
      <a-form-item label="日期" required><a-date-picker v-model:value="form.date" style="width:100%" show-time /></a-form-item>
      <a-form-item label="类型"><a-select v-model:value="form.type"><a-select-option value="DIVIDEND">现金分红</a-select-option><a-select-option value="SPLIT">拆股</a-select-option><a-select-option value="BONUS">送股/转增</a-select-option><a-select-option value="RIGHTS">配股</a-select-option><a-select-option value="OTHER">其他</a-select-option></a-select></a-form-item>
      <a-form-item label="说明" required><a-textarea v-model:value="form.description" placeholder="例如：10股派0.56元" /></a-form-item>
      <a-row :gutter="12"><a-col :span="12"><a-form-item label="份额变动"><a-input-number v-model:value="form.quantityChange" style="width:100%" /></a-form-item></a-col><a-col :span="12"><a-form-item label="现金金额"><a-input-number v-model:value="form.cashAmount" style="width:100%" /></a-form-item></a-col></a-row>
      <div style="text-align:right"><a-button @click="$emit('update:open', false)">取消</a-button><a-button type="primary" html-type="submit" :loading="saving" style="margin-left:8px">保存</a-button></div>
    </a-form>
  </a-modal>
</template>
<script setup>
import { reactive, ref, watch } from 'vue'; import dayjs from 'dayjs'; import { message } from 'ant-design-vue'; import { addCompanyAction } from '@/api/index';
const props=defineProps({open:Boolean,holding:Object}); const emit=defineEmits(['update:open','success']); const saving=ref(false); const form=reactive({date:dayjs(),type:'DIVIDEND',description:'',quantityChange:0,cashAmount:0});
watch(()=>props.open,v=>{if(v){form.date=dayjs();form.type='DIVIDEND';form.description='';form.quantityChange=0;form.cashAmount=0;}});
const submit=async()=>{saving.value=true;try{await addCompanyAction({symbol:props.holding.symbol,name:props.holding.name||props.holding.symbol,date:form.date.toISOString(),...form});message.success('公司行动已保存');emit('update:open',false);emit('success',props.holding.symbol);}catch(e){message.error(e?.response?.data?.message||'保存失败')}finally{saving.value=false}};
</script>
