# SuperSplat 集成到 Vue3 项目指南

本指南提供了将 SuperSplat 集成到 Vue3 项目的几种方法。

## 方案一：作为 Vue 组件集成（推荐）

这是最灵活的集成方式，可以更好地与 Vue 应用交互。

### 步骤 1: 构建 SuperSplat

首先，在 SuperSplat 项目中构建生产版本：

```bash
cd supersplat
npm run build
```

### 步骤 2: 复制构建产物到 Vue 项目

将 SuperSplat 的 `dist` 目录复制到 Vue 项目的 `public` 目录：

```bash
# 在 Vue 项目根目录
mkdir -p public/supersplat
cp -r supersplat/dist/* public/supersplat/
```

或者使用符号链接（开发时更方便）：

```bash
# Windows (PowerShell)
New-Item -ItemType SymbolicLink -Path "public/supersplat" -Target "..\supersplat\dist"

# Linux/Mac
ln -s ../supersplat/dist public/supersplat
```

### 步骤 3: 创建 Vue 组件

在 Vue 项目中创建 `src/components/SuperSplatEditor.vue`：

```vue
<template>
  <div class="supersplat-container">
    <div ref="containerRef" class="supersplat-wrapper"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from "vue";

interface Props {
  // 可以通过 props 传递配置
  autoLoad?: string[]; // 自动加载的文件 URL
  basePath?: string; // SuperSplat 资源路径
}

const props = withDefaults(defineProps<Props>(), {
  autoLoad: () => [],
  basePath: "/supersplat",
});

const containerRef = ref<HTMLDivElement>();
let supersplatInstance: any = null;

// 加载 SuperSplat
const loadSuperSplat = async () => {
  if (!containerRef.value) return;

  // 创建 iframe 或直接加载
  const iframe = document.createElement("iframe");
  iframe.src = `${props.basePath}/index.html`;
  iframe.style.width = "100%";
  iframe.style.height = "100%";
  iframe.style.border = "none";

  // 如果需要自动加载文件，通过 URL 参数传递
  if (props.autoLoad.length > 0) {
    const params = new URLSearchParams();
    props.autoLoad.forEach((url) => {
      params.append("load", url);
    });
    iframe.src += `?${params.toString()}`;
  }

  containerRef.value.appendChild(iframe);

  // 监听 iframe 消息（如果需要双向通信）
  window.addEventListener("message", handleMessage);

  return iframe;
};

// 处理来自 SuperSplat 的消息
const handleMessage = (event: MessageEvent) => {
  // 验证来源
  if (!event.origin.includes(window.location.origin)) return;

  // 处理消息
  console.log("Message from SuperSplat:", event.data);

  // 可以 emit 事件给父组件
  // emit('splat-event', event.data)
};

// 直接加载方式（不使用 iframe）
const loadSuperSplatDirect = async () => {
  if (!containerRef.value) return;

  // 动态加载 CSS
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `${props.basePath}/index.css`;
  document.head.appendChild(link);

  // 动态加载 JSZip（SuperSplat 依赖）
  const jszipScript = document.createElement("script");
  jszipScript.src = `${props.basePath}/jszip.js`;
  await new Promise((resolve) => {
    jszipScript.onload = resolve;
    document.head.appendChild(jszipScript);
  });

  // 创建 canvas 容器
  const canvasContainer = document.createElement("div");
  canvasContainer.id = "canvas-container";
  canvasContainer.style.width = "100%";
  canvasContainer.style.height = "100%";
  containerRef.value.appendChild(canvasContainer);

  // 动态导入 SuperSplat 主模块
  const module = await import(/* @vite-ignore */ `${props.basePath}/index.js`);

  // 注意：SuperSplat 会自动初始化，可能需要调整
  supersplatInstance = module;
};

onMounted(() => {
  // 选择加载方式
  // loadSuperSplat() // iframe 方式
  loadSuperSplatDirect(); // 直接加载方式
});

onUnmounted(() => {
  // 清理
  window.removeEventListener("message", handleMessage);
  if (supersplatInstance) {
    // 清理 SuperSplat 实例
  }
});

// 监听 autoLoad 变化
watch(
  () => props.autoLoad,
  () => {
    // 重新加载
  },
  { deep: true }
);
</script>

<style scoped>
.supersplat-container {
  width: 100%;
  height: 100%;
  position: relative;
}

.supersplat-wrapper {
  width: 100%;
  height: 100%;
}
</style>
```

### 步骤 4: 使用组件

在 Vue 页面中使用：

```vue
<template>
  <div class="page">
    <SuperSplatEditor :auto-load="fileUrls" base-path="/supersplat" />
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import SuperSplatEditor from "@/components/SuperSplatEditor.vue";

const fileUrls = ref<string[]>(["https://example.com/model.ply"]);
</script>
```

---

## 方案二：作为独立页面（iframe 方式）

这是最简单的集成方式，将 SuperSplat 作为独立页面嵌入。

### 步骤 1: 复制构建产物

同方案一的步骤 1-2。

### 步骤 2: 创建 Vue 组件

```vue
<template>
  <div class="supersplat-iframe-container">
    <iframe
      ref="iframeRef"
      :src="iframeSrc"
      class="supersplat-iframe"
      @load="onIframeLoad"
    ></iframe>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";

interface Props {
  files?: string[]; // 要加载的文件 URL
  basePath?: string;
}

const props = withDefaults(defineProps<Props>(), {
  files: () => [],
  basePath: "/supersplat",
});

const iframeRef = ref<HTMLIFrameElement>();

const iframeSrc = computed(() => {
  let url = `${props.basePath}/index.html`;
  if (props.files.length > 0) {
    const params = new URLSearchParams();
    props.files.forEach((file) => {
      params.append("load", file);
    });
    url += `?${params.toString()}`;
  }
  return url;
});

const onIframeLoad = () => {
  console.log("SuperSplat iframe loaded");
  // 可以在这里与 iframe 通信
};

// 向 SuperSplat 发送消息
const sendMessage = (data: any) => {
  iframeRef.value?.contentWindow?.postMessage(data, "*");
};

// 监听来自 SuperSplat 的消息
window.addEventListener("message", (event) => {
  if (event.source === iframeRef.value?.contentWindow) {
    console.log("Message from SuperSplat:", event.data);
  }
});

defineExpose({
  sendMessage,
});
</script>

<style scoped>
.supersplat-iframe-container {
  width: 100%;
  height: 100%;
}

.supersplat-iframe {
  width: 100%;
  height: 100%;
  border: none;
}
</style>
```

---

## 方案三：作为 npm 包集成（高级）

如果希望更深度集成，可以将 SuperSplat 打包为 npm 包。

### 步骤 1: 修改 Rollup 配置

创建 `rollup.config.library.mjs`：

```javascript
import path from "path";
import resolve from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";
import { terser } from "rollup-plugin-terser";

export default {
  input: "src/index.ts",
  output: {
    file: "dist/supersplat-bundle.js",
    format: "umd",
    name: "SuperSplat",
    globals: {
      playcanvas: "pc",
    },
  },
  external: ["playcanvas"],
  plugins: [resolve(), typescript(), terser()],
};
```

### 步骤 2: 创建 Vue 插件

```typescript
// src/plugins/supersplat.ts
import type { App } from "vue";

export default {
  install(app: App) {
    // 注册全局组件或提供全局方法
    app.config.globalProperties.$supersplat = {
      // SuperSplat API
    };
  },
};
```

---

## 方案四：使用 Vite 插件集成（推荐用于 Vite 项目）

如果 Vue 项目使用 Vite，可以创建一个 Vite 插件。

### 步骤 1: 创建 Vite 插件

```typescript
// vite-plugin-supersplat.ts
import type { Plugin } from "vite";
import { copyFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

export function supersplatPlugin(options: {
  supersplatPath: string;
  publicPath?: string;
}): Plugin {
  return {
    name: "vite-plugin-supersplat",
    buildStart() {
      const { supersplatPath, publicPath = "public/supersplat" } = options;

      // 确保目录存在
      if (!existsSync(publicPath)) {
        mkdirSync(publicPath, { recursive: true });
      }

      // 复制文件（这里简化，实际应该递归复制）
      // 可以使用 fs-extra 或类似库
    },
    configureServer(server) {
      // 开发服务器配置
      server.middlewares.use("/supersplat", (req, res, next) => {
        // 代理到 SuperSplat 构建目录
      });
    },
  };
}
```

### 步骤 2: 在 vite.config.ts 中使用

```typescript
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { supersplatPlugin } from "./vite-plugin-supersplat";

export default defineConfig({
  plugins: [
    vue(),
    supersplatPlugin({
      supersplatPath: "../supersplat/dist",
      publicPath: "public/supersplat",
    }),
  ],
});
```

---

## 推荐配置

### Vue Router 路由配置

```typescript
// router/index.ts
import { createRouter, createWebHistory } from "vue-router";
import SuperSplatView from "@/views/SuperSplatView.vue";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/editor",
      name: "SuperSplat",
      component: SuperSplatView,
    },
  ],
});
```

### 环境变量配置

```env
# .env
VITE_SUPERSPLAT_BASE_PATH=/supersplat
```

```typescript
// 在组件中使用
const basePath = import.meta.env.VITE_SUPERSPLAT_BASE_PATH || "/supersplat";
```

---

## 注意事项

1. **路径问题**: 确保 SuperSplat 的静态资源路径正确
2. **CORS**: 如果从不同域加载文件，注意 CORS 配置
3. **Service Worker**: SuperSplat 使用 Service Worker，可能需要调整
4. **样式隔离**: SuperSplat 的样式可能会影响 Vue 应用，考虑使用 Shadow DOM
5. **内存管理**: 大型 Splat 文件可能占用大量内存，注意清理

---

## 完整示例：Vue 3 + TypeScript + Vite

### 项目结构

```
vue-project/
├── public/
│   └── supersplat/          # SuperSplat 构建产物
│       ├── index.html
│       ├── index.js
│       ├── index.css
│       └── ...
├── src/
│   ├── components/
│   │   └── SuperSplatEditor.vue
│   └── views/
│       └── EditorView.vue
└── vite.config.ts
```

### SuperSplatEditor.vue（完整版）

```vue
<template>
  <div class="supersplat-editor">
    <div ref="editorContainer" class="editor-container"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick } from "vue";

interface Props {
  files?: string[];
  basePath?: string;
  width?: string;
  height?: string;
}

const props = withDefaults(defineProps<Props>(), {
  files: () => [],
  basePath: "/supersplat",
  width: "100%",
  height: "100%",
});

const emit = defineEmits<{
  loaded: [];
  error: [error: Error];
}>();

const editorContainer = ref<HTMLDivElement>();
let iframe: HTMLIFrameElement | null = null;

const initSuperSplat = async () => {
  if (!editorContainer.value) return;

  try {
    // 创建 iframe
    iframe = document.createElement("iframe");
    iframe.style.width = props.width;
    iframe.style.styleHeight = props.height;
    iframe.style.border = "none";

    // 构建 URL
    let url = `${props.basePath}/index.html`;
    if (props.files.length > 0) {
      const params = new URLSearchParams();
      props.files.forEach((file) => params.append("load", file));
      url += `?${params.toString()}`;
    }

    iframe.src = url;
    iframe.onload = () => {
      emit("loaded");
    };
    iframe.onerror = (error) => {
      emit("error", new Error("Failed to load SuperSplat"));
    };

    editorContainer.value.appendChild(iframe);

    // 监听消息
    window.addEventListener("message", handleMessage);
  } catch (error) {
    emit("error", error as Error);
  }
};

const handleMessage = (event: MessageEvent) => {
  // 处理来自 SuperSplat 的消息
  if (event.origin !== window.location.origin) return;

  console.log("SuperSplat message:", event.data);
};

const sendMessage = (data: any) => {
  iframe?.contentWindow?.postMessage(data, "*");
};

onMounted(() => {
  nextTick(() => {
    initSuperSplat();
  });
});

onUnmounted(() => {
  window.removeEventListener("message", handleMessage);
  if (iframe) {
    editorContainer.value?.removeChild(iframe);
    iframe = null;
  }
});

watch(
  () => props.files,
  () => {
    // 文件变化时重新加载
    if (iframe) {
      initSuperSplat();
    }
  },
  { deep: true }
);

defineExpose({
  sendMessage,
});
</script>

<style scoped>
.supersplat-editor {
  width: 100%;
  height: 100%;
}

.editor-container {
  width: 100%;
  height: 100%;
  position: relative;
}
</style>
```

---

## 故障排除

### 问题 1: 资源加载失败

**解决方案**: 检查路径配置，确保 `basePath` 正确指向 SuperSplat 资源目录。

### 问题 2: 样式冲突

**解决方案**: 使用 Shadow DOM 或 CSS 作用域：

```vue
<template>
  <div class="supersplat-wrapper" ref="wrapperRef"></div>
</template>

<script setup>
import { ref, onMounted } from "vue";

const wrapperRef = ref();

onMounted(() => {
  // 使用 Shadow DOM
  const shadowRoot = wrapperRef.value.attachShadow({ mode: "open" });
  // 在 Shadow DOM 中加载 SuperSplat
});
</script>
```

### 问题 3: Service Worker 冲突

**解决方案**: 在 Vue 应用中禁用 SuperSplat 的 Service Worker，或使用不同的作用域。

---

## 总结

推荐使用**方案一（Vue 组件集成）**或**方案二（iframe 方式）**，它们最简单且易于维护。根据你的具体需求选择：

- **需要深度集成和自定义**: 使用方案一
- **只需要嵌入编辑器**: 使用方案二
- **需要作为库使用**: 使用方案三
- **使用 Vite 构建**: 使用方案四
