<template>
  <a-input-search :value="modelValue" allow-clear placeholder="名称 / 代码 / 首字母 / 全拼" aria-label="名称 / 代码 / 首字母 / 全拼" style="width: 240px; max-width: 100%" @update:value="emit('update:modelValue', $event)" @search="emit('search')" />
</template>
<script setup>
defineProps({ modelValue: { type: String, default: '' } });
const emit = defineEmits(['update:modelValue', 'search']);
</script>