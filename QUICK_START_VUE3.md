# SuperSplat 集成到 Vue3 - 快速开始

## 5 分钟快速集成

### 步骤 1: 构建 SuperSplat

```bash
cd supersplat
npm install
npm run build
```

### 步骤 2: 复制文件到 Vue 项目

```bash
# 在 Vue 项目根目录执行
mkdir -p public/supersplat
cp -r supersplat/dist/* public/supersplat/
```

### 步骤 3: 复制组件文件

将 `examples/SuperSplatEditor.vue` 复制到你的 Vue 项目的 `src/components/` 目录：

```bash
cp examples/SuperSplatEditor.vue src/components/
```

### 步骤 4: 在页面中使用

```vue
<template>
  <div style="width: 100vw; height: 100vh;">
    <SuperSplatEditor
      :files="['https://example.com/model.ply']"
      base-path="/supersplat"
    />
  </div>
</template>

<script setup>
import SuperSplatEditor from "@/components/SuperSplatEditor.vue";
</script>
```

### 步骤 5: 运行项目

```bash
npm run dev
```

访问你的 Vue 应用，SuperSplat 编辑器应该已经可以正常工作了！

---

## 完整示例

查看 `examples/EditorView.vue` 获取完整的使用示例。

---

## 常见问题

### Q: 资源加载失败 404

**A**: 检查 `basePath` 是否正确指向 `public/supersplat` 目录。

### Q: 如何传递文件给编辑器？

**A**: 使用 `files` prop：

```vue
<SuperSplatEditor :files="['/path/to/file.ply']" />
```

### Q: 如何与编辑器通信？

**A**: 使用事件监听：

```vue
<SuperSplatEditor @message="handleMessage" />

<script setup>
const handleMessage = (data) => {
  console.log("收到消息:", data);
};
</script>
```

### Q: 如何自定义样式？

**A**: 组件支持 `width` 和 `height` props：

```vue
<SuperSplatEditor width="800px" height="600px" />
```

---

## 下一步

- 查看 `INTEGRATION_VUE3.md` 了解更高级的集成方式
- 查看 `README.md` 了解 SuperSplat 的完整功能
