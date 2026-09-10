<template>
  <el-select v-model="mode" @change="handle">
    <el-option label="浅色模式" value="light" />
    <el-option label="深色模式" value="dark" />
    <el-option label="跟随系统" value="system" />
  </el-select>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useThemeStore } from '@/stores/useThemeStore'
const t = useThemeStore()
const mode = ref(t.themeMode)
const handle = (v: any) => t.setThemeMode(v)
</script>
