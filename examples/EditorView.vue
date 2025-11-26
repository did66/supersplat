<template>
	<div class="editor-page">
		<div class="toolbar">
			<h2>SuperSplat 编辑器</h2>
			<div class="toolbar-actions">
				<button @click="loadSampleFile">加载示例文件</button>
				<button @click="clearFiles">清空</button>
			</div>
		</div>

		<SuperSplatEditor ref="editorRef" :files="fileUrls" base-path="/supersplat" width="100%"
			height="calc(100vh - 60px)" @loaded="onEditorLoaded" @error="onEditorError" @message="onEditorMessage" />
	</div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import SuperSplatEditor from './SuperSplatEditor.vue'

const editorRef = ref<InstanceType<typeof SuperSplatEditor>>()
const fileUrls = ref<string[]>([])

// 示例文件 URL（替换为你的实际文件 URL）
const sampleFiles = [
	'https://raw.githubusercontent.com/willeastcott/assets/main/dragon.compressed.ply'
]

const loadSampleFile = () => {
	fileUrls.value = [...sampleFiles]
}

const clearFiles = () => {
	fileUrls.value = []
}

const onEditorLoaded = () => {
	console.log('SuperSplat 编辑器已加载')
}

const onEditorError = (error: string) => {
	console.error('加载错误:', error)
	alert(`加载失败: ${error}`)
}

const onEditorMessage = (data: any) => {
	console.log('收到消息:', data)
	// 处理来自 SuperSplat 的消息
	// 例如：保存完成、选择变化等
}
</script>

<style scoped>
.editor-page {
	width: 100%;
	height: 100vh;
	display: flex;
	flex-direction: column;
}

.toolbar {
	display: flex;
	justify-content: space-between;
	align-items: center;
	padding: 12px 24px;
	background: #f5f5f5;
	border-bottom: 1px solid #ddd;
}

.toolbar h2 {
	margin: 0;
	font-size: 18px;
}

.toolbar-actions {
	display: flex;
	gap: 8px;
}

.toolbar-actions button {
	padding: 8px 16px;
	background: #3498db;
	color: white;
	border: none;
	border-radius: 4px;
	cursor: pointer;
	font-size: 14px;
}

.toolbar-actions button:hover {
	background: #2980b9;
}
</style>
