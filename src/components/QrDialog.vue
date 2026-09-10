<template>
  <teleport to="body">
    <div v-if="modelValue" class="qr-mask" @click.self="close">
      <div class="qr-card">
        <div class="qr-card__head">
          <span class="qr-card__title">{{ title || '二维码' }}</span>
          <span class="qr-card__close" @click="close">×</span>
        </div>
        <div class="qr-card__body">
          <canvas ref="canvasRef" class="qr-canvas"></canvas>
          <div v-if="text" class="qr-text" :title="text">{{ text }}</div>
        </div>
        <div class="qr-card__actions">
          <button class="qr-btn" type="button" :disabled="!text" @click="savePng">下载成PNG</button>
          <button class="qr-btn qr-btn--primary" type="button" @click="close">关闭</button>
        </div>
      </div>
    </div>
  </teleport>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import QRCode from 'qrcode'
import { blobDownload } from '@/utils/platform'

const props = withDefaults(defineProps<{ modelValue: boolean; text: string; title?: string }>(), { title: '' })
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>()

const canvasRef = ref<HTMLCanvasElement>()

function close() {
  emit('update:modelValue', false)
}

watch(
  () => props.modelValue,
  async v => {
    if (!v) return
    await nextTick()
    if (!canvasRef.value) return
    try {
      await QRCode.toCanvas(canvasRef.value, props.text || ' ', {
        width: 260,
        margin: 2,
        errorCorrectionLevel: 'M'
      })
    } catch {
      /* 非法内容时留空 */
    }
  }
)

function savePng() {
  const canvas = canvasRef.value
  if (!canvas) return
  const dataUrl = canvas.toDataURL('image/png')
  const bin = atob(dataUrl.split(',')[1])
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  const name = props.title ? `${props.title.replace(/[\\/:*?"<>|]/g, '-')}.png` : 'gitgreen-qr.png'
  blobDownload(new Blob([arr], { type: 'image/png' }), name)
}
</script>

<style scoped>
.qr-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 3000;
}
.qr-card {
  width: 320px;
  max-width: 88vw;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  overflow: hidden;
}
.qr-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
}
.qr-card__title {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-main);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.qr-card__close {
  font-size: 20px;
  line-height: 1;
  color: var(--text-secondary);
  cursor: pointer;
}
.qr-card__close:hover {
  color: var(--color-primary);
}
.qr-card__body {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 18px 16px 14px;
}
.qr-canvas {
  width: 260px;
  height: 260px;
  max-width: 100%;
  background: #fff;
}
.qr-text {
  font-size: 12px;
  color: var(--text-secondary);
  word-break: break-all;
  text-align: center;
  max-height: 3.4em;
  overflow: hidden;
}
.qr-card__actions {
  display: flex;
  gap: 10px;
  padding: 0 16px 16px;
}
.qr-btn {
  flex: 1;
  height: 38px;
  border: 1px solid var(--color-primary);
  border-radius: 8px;
  background: transparent;
  color: var(--color-primary);
  font-size: 14px;
  cursor: pointer;
}
.qr-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.qr-btn--primary {
  background: var(--color-primary);
  color: #fff;
  border-color: var(--color-primary);
}
</style>