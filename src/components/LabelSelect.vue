<template>
  <el-select
    :model-value="modelValue"
    multiple
    filterable
    allow-create
    default-first-option
    :placeholder="placeholder"
    style="width: 100%"
    @update:model-value="onChange"
  >
    <el-option v-for="t in options" :key="t" :label="t" :value="t">
      <div class="label-opt">
        <span class="label-opt-name">{{ t }}</span>
        <el-button
          v-if="removable"
          link
          type="danger"
          size="small"
          :title="`删除 ${t}`"
          @click.stop="emit('remove', t)"
        >×</el-button>
      </div>
    </el-option>
  </el-select>
</template>

<script setup lang="ts">
defineOptions({ name: 'LabelSelect' })

const props = withDefaults(
  defineProps<{
    /** 已选标签（v-model，数组） */
    modelValue: string[]
    /** 可选标签列表 */
    options: string[]
    placeholder?: string
    /** 是否在选项上显示 × 删除按钮 */
    removable?: boolean
  }>(),
  { placeholder: '选择或输入回车创建标签', removable: true }
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: string[]): void
  (e: 'remove', name: string): void
}>()

function onChange(val: string[]) {
  emit('update:modelValue', val)
}
</script>

<style>
.label-opt {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
}
.label-opt-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>