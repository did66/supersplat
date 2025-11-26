<template>
  <div class="supersplat-editor-wrapper" :style="{ width, height }">
    <iframe
      v-if="iframeSrc"
      ref="iframeRef"
      :src="iframeSrc"
      class="supersplat-iframe"
      @load="onIframeLoad"
      @error="onIframeError"
    ></iframe>
    <div v-if="loading" class="loading-overlay">
      <div class="loading-spinner"></div>
      <p>加载 SuperSplat 编辑器...</p>
    </div>
    <div v-if="error" class="error-overlay">
      <p>加载失败: {{ error }}</p>
      <button @click="retry">重试</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'

interface Props {
  /**
   * 要自动加载的文件 URL 列表
   */
  files?: string[]
  /**
   * SuperSplat 资源的基础路径
   * @default '/supersplat'
   */
  basePath?: string
  /**
   * 编辑器宽度
   * @default '100%'
   */
  width?: string
  /**
   * 编辑器高度
   * @default '100%'
   */
  height?: string
}

const props = withDefaults(defineProps<Props>(), {
  files: () => [],
  basePath: '/supersplat',
  width: '100%',
  height: '100%'
})

const emit = defineEmits<{
  /**
   * 编辑器加载完成
   */
  loaded: []
  /**
   * 加载错误
   */
  error: [error: string]
  /**
   * 接收到来自 SuperSplat 的消息
   */
  message: [data: any]
}>()

const iframeRef = ref<HTMLIFrameElement>()
const loading = ref(true)
const error = ref<string | null>(null)

// 构建 iframe src URL
const iframeSrc = computed(() => {
  let url = `${props.basePath}/index.html`
  
  // 添加文件加载参数
  if (props.files.length > 0) {
    const params = new URLSearchParams()
    props.files.forEach(file => {
      params.append('load', file)
    })
    url += `?${params.toString()}`
  }
  
  return url
})

// iframe 加载完成
const onIframeLoad = () => {
  loading.value = false
  error.value = null
  emit('loaded')
  
  // 可以在这里与 iframe 进行初始通信
  sendMessage({ type: 'init', config: {} })
}

// iframe 加载错误
const onIframeError = () => {
  loading.value = false
  error.value = '无法加载 SuperSplat 编辑器，请检查资源路径是否正确'
  emit('error', error.value)
}

// 重试加载
const retry = () => {
  error.value = null
  loading.value = true
  if (iframeRef.value) {
    iframeRef.value.src = iframeSrc.value
  }
}

// 向 SuperSplat 发送消息
const sendMessage = (data: any) => {
  if (iframeRef.value?.contentWindow) {
    iframeRef.value.contentWindow.postMessage(data, '*')
  }
}

// 处理来自 SuperSplat 的消息
const handleMessage = (event: MessageEvent) => {
  // 验证消息来源（可以根据需要调整）
  // if (event.origin !== window.location.origin) return
  
  // 只处理来自 SuperSplat iframe 的消息
  if (event.source !== iframeRef.value?.contentWindow) return
  
  emit('message', event.data)
}

// 监听文件变化，重新加载
watch(() => props.files, () => {
  if (iframeRef.value) {
    loading.value = true
    iframeRef.value.src = iframeSrc.value
  }
}, { deep: true })

onMounted(() => {
  // 监听来自 SuperSplat 的消息
  window.addEventListener('message', handleMessage)
})

onUnmounted(() => {
  // 清理事件监听
  window.removeEventListener('message', handleMessage)
})

// 暴露方法供父组件调用
defineExpose({
  sendMessage,
  retry
})
</script>

<style scoped>
.supersplat-editor-wrapper {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.supersplat-iframe {
  width: 100%;
  height: 100%;
  border: none;
  display: block;
}

.loading-overlay,
.error-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.9);
  z-index: 10;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 4px solid #f3f3f3;
  border-top: 4px solid #3498db;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 16px;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.error-overlay p {
  color: #e74c3c;
  margin-bottom: 16px;
}

.error-overlay button {
  padding: 8px 16px;
  background: #3498db;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.error-overlay button:hover {
  background: #2980b9;
}
</style>

