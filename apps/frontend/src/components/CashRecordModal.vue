<template>
  <a-modal
    :open="open"
    title="现金记录"
    @cancel="handleCancel"
    :footer="null"
    width="500px"
    destroyOnClose
  >
    <div style="max-height: 550px; overflow-y: auto; padding: 0 4px;">
      <a-empty v-if="store.transferRecordsRequestFailed" description="--" style="margin: 40px 0;" />
      <a-empty v-else-if="paginatedRecords.length === 0" description="暂无记录" style="margin: 40px 0;" />
      
      <div v-else>
        <div v-for="group in groupedRecords" :key="group.year" style="margin-bottom: 24px;">
          <div style="font-size: 16px; font-weight: 600; color: #1f1f1f; margin-bottom: 12px; border-bottom: 1px solid #f0f0f0; padding-bottom: 4px;">
            {{ group.year }}年
          </div>
          
          <div v-for="record in group.records" :key="record.id" style="display: flex; align-items: center; padding: 14px 0; border-bottom: 1px dashed #f0f0f0;">
            <div style="width: 110px; font-size: 14px; color: #1f1f1f; font-weight: 500;">
              {{ dayjs(record.date).format('YYYY-MM-DD') }}
            </div>
            
            <div style="width: 80px; font-size: 14px; color: #1f1f1f; font-weight: 500;">
              {{ record.type === 'IN' ? '转入' : '转出' }}
            </div>
            
            <div style="flex: 1; text-align: right;">
              <div :style="{ color: record.type === 'IN' ? '#1890ff' : '#f5222d', fontWeight: '600', fontSize: '16px' }">
                {{ record.type === 'IN' ? '+' : '-' }}{{ record.amount.toLocaleString('en-US', { minimumFractionDigits: 2 }) }}
                <span style="font-size: 12px; margin-left: 4px; font-weight: 400; color: #8c8c8c;">{{ record.currency }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 分页器 -->
        <div style="display: flex; justify-content: flex-end; padding: 16px 0;">
          <a-pagination
            v-model:current="currentPage"
            :total="store.transferRecords.length"
            :pageSize="pageSize"
            size="small"
            hideOnSinglePage
            @change="handlePageChange"
          />
        </div>
      </div>
    </div>
  </a-modal>
</template>

<script setup>
import { ref, computed } from 'vue';
import { useTradeStore } from '@/stores/trade';
import dayjs from 'dayjs';

const props = defineProps({
  open: Boolean
});

const emit = defineEmits(['update:open']);

const store = useTradeStore();

const currentPage = ref(1);
const pageSize = ref(10);

const paginatedRecords = computed(() => {
  // 1. 先按 date 从新到旧排序
  const sorted = [...store.transferRecords].sort((a, b) => dayjs(b.date).valueOf() - dayjs(a.date).valueOf());

  // 2. 分页切片
  const start = (currentPage.value - 1) * pageSize.value;
  const end = start + pageSize.value;

  return sorted.slice(start, end);
});

const groupedRecords = computed(() => {
  const groups = {};
  
  paginatedRecords.value.forEach(record => {
    const year = dayjs(record.date).year();
    if (!groups[year]) {
      groups[year] = [];
    }
    groups[year].push(record);
  });
  
  // 将对象转换为按年份降序排列的数组
  return Object.keys(groups)
    .sort((a, b) => Number(b) - Number(a))
    .map(year => ({
      year: year,
      records: groups[year]
    }));
});

const handlePageChange = (page) => {
  currentPage.value = page;
};

const handleCancel = () => {
  emit('update:open', false);
};
</script>
