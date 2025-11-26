# SuperSplat - 3D Gaussian Splat Editor

[![Github Release](https://img.shields.io/github/v/release/playcanvas/supersplat)](https://github.com/playcanvas/supersplat/releases)
[![License](https://img.shields.io/github/license/playcanvas/supersplat)](https://github.com/playcanvas/supersplat/blob/main/LICENSE)

SuperSplat 是一个基于 Web 技术的免费开源 3D Gaussian Splat 编辑器，用于检查、编辑、优化和发布 3D Gaussian Splats。它完全在浏览器中运行，无需下载或安装。

**在线版本**: https://superspl.at/editor

## 项目概述

SuperSplat 是一个功能完整的 3D Gaussian Splat 编辑工具，支持：

- 加载和查看多种格式的 Gaussian Splat 文件
- 强大的选择和编辑工具
- 实时变换操作（移动、旋转、缩放）
- 数据可视化和分析
- 多种导出格式
- 撤销/重做功能
- 多语言支持

## 核心功能

### 1. 文件加载与格式支持

支持多种 Gaussian Splat 格式：

- **PLY** - 标准 PLY 格式（二进制小端序）
- **Compressed PLY** - 压缩的 PLY 格式（量化数据，移除球谐函数）
- **SOG** - SOG 场景格式（JSON + WebP）
- **LCC** - LCC 场景格式（JSON + 二进制数据）
- **Splat** - Splat 文件格式（32 字节/高斯）

**实现位置**:

- `src/loaders/gsplat.ts` - GSplat 加载器
- `src/loaders/splat.ts` - Splat 格式加载器
- `src/loaders/lcc.ts` - LCC 格式加载器
- `src/loaders/asset-source.ts` - 资源源管理

### 2. 选择和编辑工具

提供多种选择工具来精确选择 Gaussian Splats：

- **矩形选择** (`rect-selection.ts`) - 拖拽矩形区域选择
- **刷选** (`brush-selection.ts`) - 圆形画笔选择，可调整大小
- **套索选择** (`lasso-selection.ts`) - 自由绘制选择区域
- **多边形选择** (`polygon-selection.ts`) - 多边形区域选择
- **球体选择** (`sphere-selection.ts`) - 3D 球体体积选择
- **盒子选择** (`box-selection.ts`) - 3D 盒子体积选择
- **洪水填充** (`flood-selection.ts`) - 基于连通性的填充选择

**选择操作**:

- 全选/取消全选/反选
- 隐藏/显示选中项
- 删除选中项
- 复制/分离选中项

**实现位置**:

- `src/tools/` - 所有工具实现
- `src/tools/tool-manager.ts` - 工具管理器
- `src/selection.ts` - 选择状态管理

### 3. 变换工具

支持对选中的 Splat 进行变换：

- **移动工具** (`move-tool.ts`) - 平移操作
- **旋转工具** (`rotate-tool.ts`) - 旋转操作
- **缩放工具** (`scale-tool.ts`) - 缩放操作
- **测量工具** (`measure-tool.ts`) - 距离测量

**实现位置**:

- `src/tools/transform-tool.ts` - 变换工具基类
- `src/transform-handler.ts` - 变换处理逻辑
- `src/transform-palette.ts` - 变换调色板（GPU 纹理）

### 4. 场景渲染

基于 PlayCanvas 引擎的实时渲染系统：

**渲染模式**:

- **Centers 模式** - 显示每个高斯的中心点（蓝色圆点）
- **Rings 模式** - 显示每个高斯的边界环

**渲染特性**:

- 自定义着色器（`src/shaders/splat-shader.ts`）
- 状态纹理（选择/删除/锁定状态）
- 变换调色板纹理（支持每个高斯的独立变换）
- 球谐函数（Spherical Harmonics）渲染
- 实时排序和剔除

**实现位置**:

- `src/scene.ts` - 场景管理
- `src/splat.ts` - Splat 实体
- `src/render.ts` - 渲染逻辑
- `src/shaders/` - 着色器实现

### 5. 数据序列化与导出

支持多种导出格式：

- **PLY** - 标准 PLY 格式导出
- **Compressed PLY** - 压缩 PLY 格式（量化、移除 SH）
- **Splat** - Splat 格式导出
- **HTML Viewer** - 独立的 HTML 查看器
- **Package Viewer** - ZIP 打包的查看器

**实现位置**:

- `src/splat-serialize.ts` - 序列化核心逻辑
- `src/serialize/writer.ts` - 写入器接口
- `src/file-handler.ts` - 文件处理

### 6. 编辑历史与撤销/重做

完整的撤销/重做系统：

**编辑操作类型**:

- `SelectAllOp` - 全选操作
- `SelectNoneOp` - 取消选择操作
- `SelectInvertOp` - 反选操作
- `SelectOp` - 自定义选择操作
- `HideSelectionOp` - 隐藏选择
- `UnhideAllOp` - 显示所有
- `DeleteSelectionOp` - 删除选择
- `ResetOp` - 重置操作
- `AddSplatOp` - 添加 Splat
- `MultiOp` - 组合操作

**实现位置**:

- `src/edit-history.ts` - 编辑历史管理
- `src/edit-ops.ts` - 编辑操作定义

### 7. 相机控制

灵活的相机控制系统：

**相机功能**:

- 轨道控制（Orbit）
- 平移（Pan）
- 推拉（Dolly）
- 聚焦选中对象
- 正交/透视模式切换
- 高精度模式
- 相机姿态保存/加载

**实现位置**:

- `src/camera.ts` - 相机实现
- `src/camera-poses.ts` - 相机姿态管理

### 8. 数据可视化

数据面板提供直方图可视化：

- 位置分布
- 缩放分布
- 旋转分布
- 颜色分布
- 不透明度分布

支持通过直方图直接选择数据。

**实现位置**:

- `src/ui/data-panel.ts` - 数据面板
- `src/ui/histogram.ts` - 直方图组件

### 9. 用户界面

基于 PlayCanvas PCUI 的现代化 UI：

**主要面板**:

- 场景管理器 - 管理加载的 Splats
- 变换面板 - 精确控制变换值
- 视图面板 - 视图选项设置
- 颜色面板 - 颜色调整
- 数据面板 - 数据可视化
- 时间轴面板 - 动画序列管理

**实现位置**:

- `src/ui/editor.ts` - 主 UI 容器
- `src/ui/` - 所有 UI 组件

## 技术架构

### 核心技术栈

- **PlayCanvas Engine** - 3D 渲染引擎
- **PlayCanvas PCUI** - UI 框架
- **TypeScript** - 编程语言
- **Rollup** - 构建工具
- **WebGL 2** - 图形 API

### 项目结构

```
src/
├── index.ts              # 应用入口
├── main.ts               # 主初始化逻辑
├── scene.ts              # 场景管理
├── splat.ts              # Splat 实体
├── editor.ts             # 编辑器事件注册
├── events.ts             # 事件系统
├── camera.ts             # 相机控制
├── loaders/              # 文件加载器
│   ├── gsplat.ts        # GSplat 加载器
│   ├── splat.ts         # Splat 格式加载器
│   └── lcc.ts           # LCC 格式加载器
├── tools/                # 编辑工具
│   ├── tool-manager.ts  # 工具管理器
│   ├── rect-selection.ts
│   ├── brush-selection.ts
│   ├── move-tool.ts
│   └── ...
├── shaders/              # 着色器
│   └── splat-shader.ts  # Splat 渲染着色器
├── serialize/            # 序列化
│   ├── writer.ts        # 写入器接口
│   └── zip-writer.ts    # ZIP 写入器
├── ui/                   # 用户界面
│   ├── editor.ts        # 主 UI
│   ├── scene-panel.ts   # 场景面板
│   └── ...
└── ...
```

### 核心实现流程

#### 1. 应用初始化 (`src/main.ts`)

```typescript
1. 创建事件系统 (Events)
2. 创建编辑历史 (EditHistory)
3. 创建 UI (EditorUI)
4. 创建图形设备 (GraphicsDevice)
5. 创建场景 (Scene)
6. 注册工具 (ToolManager)
7. 注册事件处理器
8. 启动场景渲染循环
```

#### 2. 文件加载流程

```
用户操作 (拖拽/文件选择)
    ↓
file-handler.ts: initFileHandler()
    ↓
asset-loader.ts: load()
    ↓
loaders/gsplat.ts: loadGsplat()
    ↓
PlayCanvas Asset System
    ↓
GSplatResource 创建
    ↓
Splat 实体创建
    ↓
添加到场景
```

#### 3. 选择操作流程

```
工具激活 (ToolManager)
    ↓
用户交互 (鼠标/触摸)
    ↓
选择工具处理 (rect-selection.ts 等)
    ↓
生成选择过滤器 (predicate function)
    ↓
创建 SelectOp
    ↓
添加到编辑历史
    ↓
更新 Splat 状态纹理
    ↓
触发重新渲染
```

#### 4. 变换操作流程

```
变换工具激活
    ↓
用户拖拽操作
    ↓
transform-handler.ts: 计算变换
    ↓
更新 TransformPalette 纹理
    ↓
着色器读取变换矩阵
    ↓
实时渲染更新
```

#### 5. 序列化流程

```
用户触发导出
    ↓
splat-serialize.ts: serializePly()
    ↓
GaussianFilter: 过滤高斯
    ↓
SingleSplat: 读取数据
    ↓
BufferWriter: 写入缓冲区
    ↓
生成文件并下载
```

### 关键数据结构

#### Splat 状态 (`src/splat-state.ts`)

```typescript
enum State {
  selected = 1, // 选中
  deleted = 2, // 删除
  locked = 4, // 锁定
}
```

状态存储在 `state` 属性中，作为 Uint8Array，每个高斯一个字节。

#### 变换调色板 (`src/transform-palette.ts`)

使用 GPU 纹理存储每个高斯的变换矩阵：

- 纹理格式: R16UI (每个变换索引 16 位)
- 最大变换数: 65535
- 变换矩阵: 4x4 Mat4，存储在独立纹理中

#### 场景状态 (`src/scene-state.ts`)

用于检测场景变化，决定是否需要重新渲染：

- 比较前后两帧的状态
- 检测添加/删除/移动/改变的元素
- 仅在变化时触发渲染

## 开发指南

### 环境要求

- Node.js 18 或更高版本
- npm 或 yarn

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run develop
```

这将启动：

- Rollup 监听模式（自动重新构建）
- 本地开发服务器（http://localhost:3000）

### 构建生产版本

```bash
npm run build
```

### 代码结构说明

#### 事件系统 (`src/events.ts`)

基于发布-订阅模式的事件系统：

- `events.on(event, callback)` - 订阅事件
- `events.fire(event, data)` - 触发事件
- `events.function(name, func)` - 注册函数
- `events.invoke(name, ...args)` - 调用函数

#### 元素系统 (`src/element.ts`)

所有场景元素的基础类：

- `Element` - 基类
- `ElementType` - 元素类型枚举
- 生命周期: `add()`, `remove()`, `onUpdate()`, `onPreRender()`, `onPostRender()`

#### 数据处理器 (`src/data-processor.ts`)

GPU 加速的数据处理：

- 计算边界框
- 计算位置
- 几何体相交测试

## 主要功能实现细节

### 1. 实时选择渲染

选择状态通过 GPU 纹理传递：

1. CPU 更新 `state` Uint8Array
2. 上传到 `stateTexture` (R8 格式)
3. 着色器读取纹理，应用选择颜色

### 2. 每高斯变换

使用变换调色板实现：

1. 每个高斯分配一个变换索引
2. 变换矩阵存储在 `transformPalette` 纹理
3. 着色器根据索引查找变换矩阵
4. 应用变换到高斯位置和旋转

### 3. 压缩 PLY 格式

量化策略：

- 位置: 16 位量化
- 旋转: 8 位量化（四元数）
- 缩放: 8 位量化（对数空间）
- 颜色: 8 位量化
- 移除球谐函数

### 4. 动画序列支持

支持 PLY 序列加载：

- 检测文件名模式（如 `frame0001.ply`, `frame0002.ply`）
- 按顺序加载帧
- 时间轴控制播放

## 性能优化

1. **按需渲染** - 仅在场景变化时渲染
2. **GPU 排序** - 使用 GPU 进行深度排序
3. **状态纹理** - 选择状态存储在 GPU 纹理中
4. **变换调色板** - 批量处理变换矩阵
5. **数据过滤** - 导出时过滤无效数据

## 多语言支持

支持的语言：

- 英语 (en)
- 中文简体 (zh-CN)
- 日语 (ja)
- 韩语 (ko)
- 法语 (fr)
- 德语 (de)

语言文件位于 `static/locales/`。

## 贡献指南

欢迎贡献！请遵循以下步骤：

1. Fork 项目
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

## 许可证

MIT License - 详见 [LICENSE](LICENSE) 文件

## 相关链接

- [在线编辑器](https://superspl.at/editor)
- [用户指南](https://developer.playcanvas.com/user-manual/gaussian-splatting/editing/supersplat/)
- [PlayCanvas 博客](https://blog.playcanvas.com)
- [PlayCanvas 论坛](https://forum.playcanvas.com)

## 致谢

SuperSplat 由 PlayCanvas 团队开发，基于强大的开源社区支持。
