<template>
  <div class="chart-container" ref="chartRef"></div>
</template>

<script setup>
import { ref, onMounted, watch, onUnmounted } from 'vue';
import * as echarts from 'echarts';

const props = defineProps({
  data: {
    type: Array,
    default: () => []
  }
});

const chartRef = ref(null);
let chartInstance = null;

const initChart = () => {
  if (!chartRef.value) return;
  
  chartInstance = echarts.init(chartRef.value);
  updateChart();
};

const updateChart = () => {
  if (!chartInstance) return;

  const option = {
    tooltip: {
      trigger: 'axis',
      renderMode: 'richText',
      formatter: function(params) {
        const title = params?.[0]?.axisValue ?? params?.[0]?.name ?? '';
        let res = title + '\n';
        params.forEach(item => {
          if (item.value === null || item.value === undefined) return;
          const v = Number(item.value);
          const sign = v >= 0 ? '+' : '';
          res += `${item.marker}${item.seriesName}：${sign}${v.toFixed(2)}%\n`;
        });
        return res.trim();
      }
    },
    legend: {
      data: ['我的', '上证指数'],
      top: 0, // Move legend to top
      icon: 'rect',
      itemWidth: 12,
      itemHeight: 4,
      textStyle: { fontSize: 12, color: '#8c8c8c' }
    },
    grid: {
      left: '10px',
      right: '10px',
      bottom: '10px', // Reduced since legend is no longer at bottom
      top: '40px', // Increased to give space for legend at top
      containLabel: true
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: props.data.map(item => item.date),
      axisTick: { show: false },
      axisLine: { lineStyle: { color: '#f0f0f0' } },
      axisLabel: { color: '#8c8c8c' }
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        formatter: '{value}%',
        color: '#8c8c8c'
      },
      splitLine: { lineStyle: { type: 'dashed', color: '#f0f0f0' } }
    },
    series: [
      {
        name: '我的',
        type: 'line',
        smooth: false,
        connectNulls: true,
        showSymbol: false,
        data: props.data.map(item => item.value),
        itemStyle: { color: '#fa8c16' }, // Orange for "Mine"
        lineStyle: { width: 2 },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(250, 140, 22, 0.2)' }, // Orange area
            { offset: 1, color: 'rgba(250, 140, 22, 0)' }
          ])
        }
      },
      {
        name: '上证指数',
        type: 'line',
        smooth: false,
        connectNulls: true,
        showSymbol: false,
        data: props.data.map(item => item.benchmark),
        itemStyle: { color: '#1890ff' }, // Blue for "SSE Index"
        lineStyle: { width: 2, type: 'solid' }
      }
    ]
  };

  chartInstance.setOption(option);
};

watch(() => props.data, () => {
  updateChart();
}, { deep: true });

onMounted(() => {
  // Delay init to ensure container size
  setTimeout(() => {
    initChart();
  }, 100);
  
  window.addEventListener('resize', handleResize);
});

onUnmounted(() => {
  if (chartInstance) {
    chartInstance.dispose();
  }
  window.removeEventListener('resize', handleResize);
});

const handleResize = () => {
  chartInstance && chartInstance.resize();
};
</script>

<style scoped>
.chart-container {
  width: 100%;
  height: 100%;
  padding: 0;
  margin: 0;
}
</style>
