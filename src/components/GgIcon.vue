<template>
  <span class="gg-mark" :style="styles" aria-hidden="true">GG</span>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{ size?: number | string }>(), { size: 18 })

const styles = computed(() => {
  const s = typeof props.size === 'number' ? `${props.size}px` : props.size
  return {
    width: s,
    height: s,
    fontSize: `calc(${s} * 0.82)`
  }
})
</script>

<style scoped>
.gg-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  font-weight: 800;
  line-height: 1;
  letter-spacing: -0.12em;
  font-family: inherit;
  color: inherit;
  user-select: none;
}
</style>