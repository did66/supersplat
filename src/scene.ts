import {
	EVENT_POSTRENDER_LAYER,
	EVENT_PRERENDER_LAYER,
	LAYERID_DEPTH,
	SORTMODE_NONE,
	BoundingBox,
	CameraComponent,
	Color,
	Entity,
	Layer,
	GraphicsDevice
} from 'playcanvas';

import { AssetLoader } from './asset-loader';
import { Camera } from './camera';
import { DataProcessor } from './data-processor';
import { Element, ElementType, ElementTypeList } from './element';
import { Events } from './events';
import { InfiniteGrid as Grid } from './infinite-grid';
import { Outline } from './outline';
import { PCApp } from './pc-app';
import { SceneConfig } from './scene-config';
import { SceneState } from './scene-state';
import { Splat } from './splat';
import { SplatOverlay } from './splat-overlay';
import { Underlay } from './underlay';

/**
 * 场景类
 * 管理3D场景的所有元素，包括相机、Splat对象、渲染层等
 * 负责场景的初始化、更新、渲染和元素管理
 */
class Scene {
	/** 事件系统，用于组件间通信 */
	events: Events;
	/** 场景配置 */
	config: SceneConfig;
	/** 画布元素 */
	canvas: HTMLCanvasElement;
	/** PlayCanvas应用实例 */
	app: PCApp;
	/** 背景层，用于渲染背景 */
	backgroundLayer: Layer;
	/** 阴影层，包含阴影投射和接收的网格实例 */
	shadowLayer: Layer;
	/** 调试层，用于渲染调试信息 */
	debugLayer: Layer;
	/** 覆盖层，用于渲染选中对象的轮廓等覆盖效果 */
	overlayLayer: Layer;
	/** Gizmo层，用于渲染变换工具（移动、旋转、缩放手柄） */
	gizmoLayer: Layer;
	/** 场景状态数组，用于检测场景变化（双缓冲） */
	sceneState = [new SceneState(), new SceneState()];
	/** 场景中的所有元素列表 */
	elements: Element[] = [];
	/** 场景包围盒缓存 */
	boundStorage = new BoundingBox();
	/** 包围盒是否需要重新计算 */
	boundDirty = true;
	/** 是否强制渲染下一帧 */
	forceRender = false;

	/** 是否锁定渲染模式 */
	lockedRenderMode = false;
	/** 锁定渲染标志 */
	lockedRender = false;

	/** 画布尺寸变化信息 */
	canvasResize: { width: number; height: number } | null = null;
	/** 目标渲染尺寸 */
	targetSize = {
		width: 0,
		height: 0
	};

	/** 数据处理器，用于处理Splat数据 */
	dataProcessor: DataProcessor;
	/** 资源加载器 */
	assetLoader: AssetLoader;
	/** 场景相机 */
	camera: Camera;
	/** Splat覆盖层管理器 */
	splatOverlay: SplatOverlay;
	/** 无限网格 */
	grid: Grid;
	/** 轮廓高亮管理器 */
	outline: Outline;
	/** 底层渲染管理器 */
	underlay: Underlay;

	/** 内容根实体，所有场景内容都添加到此实体下 */
	contentRoot: Entity;
	/** 相机根实体，所有相机相关实体都添加到此实体下 */
	cameraRoot: Entity;

	/**
	 * 构造函数
	 * 初始化场景，配置PlayCanvas应用，创建渲染层和基础元素
	 * @param {Events} events - 事件系统
	 * @param {SceneConfig} config - 场景配置
	 * @param {HTMLCanvasElement} canvas - 画布元素
	 * @param {GraphicsDevice} graphicsDevice - 图形设备
	 */
	constructor(
		events: Events,
		config: SceneConfig,
		canvas: HTMLCanvasElement,
		graphicsDevice: GraphicsDevice
	) {
		this.events = events;
		this.config = config;
		this.canvas = canvas;

		// 配置PlayCanvas应用。我们渲染到离屏缓冲区，所以只需要最简单的后备缓冲区
		this.app = new PCApp(canvas, { graphicsDevice });

		// 只在被指示时才渲染场景（手动控制渲染）
		this.app.autoRender = false;
		// @ts-ignore 禁用自动调整大小
		this.app._allowResize = false;
		// 禁用集群光照（不需要）
		this.app.scene.clusteredLightingEnabled = false;

		// 临时禁用光照贴图首次烘焙，直到我们暴露此选项
		// @ts-ignore
		this.app.off('prerender', this.app._firstBake, this.app);

		// 设置纹理加载器的跨域属性
		// @ts-ignore
		this.app.loader.getHandler('texture').imgParser.crossOrigin = 'anonymous';

		// 这是获取全分辨率AR模式后备缓冲区所必需的
		this.app.graphicsDevice.maxPixelRatio = window.devicePixelRatio;

		// 配置应用画布，监听尺寸变化
		const observer = new ResizeObserver((entries: ResizeObserverEntry[]) => {
			if (entries.length > 0) {
				const entry = entries[0];
				if (entry) {
					if (entry.devicePixelContentBoxSize) {
						// 在非Safari浏览器中，我们获得像素完美的画布尺寸
						this.canvasResize = {
							width: entry.devicePixelContentBoxSize[0].inlineSize,
							height: entry.devicePixelContentBoxSize[0].blockSize
						};
					} else if (entry.contentBoxSize.length > 0) {
						// 在Safari浏览器中，我们必须自己从CSS尺寸计算像素尺寸
						// 并希望浏览器执行相同的计算
						const pixelRatio = window.devicePixelRatio;
						this.canvasResize = {
							width: Math.ceil(entry.contentBoxSize[0].inlineSize * pixelRatio),
							height: Math.ceil(entry.contentBoxSize[0].blockSize * pixelRatio)
						};
					}
				}
				// 标记需要强制渲染
				this.forceRender = true;
			}
		});

		// 观察画布容器的尺寸变化
		observer.observe(window.document.getElementById('canvas-container'));

		// 配置深度层以处理动态折射效果
		const depthLayer = this.app.scene.layers.getLayerById(LAYERID_DEPTH);
		this.app.scene.layers.remove(depthLayer);
		this.app.scene.layers.insertOpaque(depthLayer, 2);

		// 注册应用回调
		this.app.on('update', (deltaTime: number) => this.onUpdate(deltaTime));
		this.app.on('prerender', () => this.onPreRender());
		this.app.on('postrender', () => this.onPostRender());

		// 设备恢复时强制渲染
		this.app.graphicsDevice.on('devicerestored', () => {
			this.forceRender = true;
		});

		// 在相机上触发渲染前和渲染后事件
		this.app.scene.on(EVENT_PRERENDER_LAYER, (camera: CameraComponent, layer: Layer, transparent: boolean) => {
			camera.fire('preRenderLayer', layer, transparent);
		});

		this.app.scene.on(EVENT_POSTRENDER_LAYER, (camera: CameraComponent, layer: Layer, transparent: boolean) => {
			camera.fire('postRenderLayer', layer, transparent);
		});

		// 背景层：用于渲染背景
		this.backgroundLayer = new Layer({
			enabled: true,
			name: 'Background Layer',
			opaqueSortMode: SORTMODE_NONE,
			transparentSortMode: SORTMODE_NONE
		});

		// 阴影层：包含阴影投射场景网格实例、阴影投射虚拟光源、
		// 阴影接收平面几何体和主相机
		this.shadowLayer = new Layer({
			name: 'Shadow Layer'
		});

		// 调试层：用于渲染调试信息（如包围盒、线框等）
		this.debugLayer = new Layer({
			enabled: true,
			name: 'Debug Layer',
			opaqueSortMode: SORTMODE_NONE,
			transparentSortMode: SORTMODE_NONE
		});

		// 覆盖层：用于渲染选中对象的轮廓等覆盖效果
		this.overlayLayer = new Layer({
			name: 'Overlay',
			clearDepthBuffer: false,
			opaqueSortMode: SORTMODE_NONE,
			transparentSortMode: SORTMODE_NONE
		});

		// Gizmo层：用于渲染变换工具（移动、旋转、缩放手柄）
		this.gizmoLayer = new Layer({
			name: 'Gizmo',
			clearDepthBuffer: true,
			opaqueSortMode: SORTMODE_NONE,
			transparentSortMode: SORTMODE_NONE
		});

		const layers = this.app.scene.layers;
		const worldLayer = layers.getLayerByName('World');
		const idx = layers.getOpaqueIndex(worldLayer);
		layers.insert(this.backgroundLayer, idx);
		layers.insert(this.shadowLayer, idx + 1);
		layers.insert(this.debugLayer, idx + 1);
		layers.push(this.overlayLayer);
		layers.push(this.gizmoLayer);

		this.dataProcessor = new DataProcessor(this.app.graphicsDevice);
		this.assetLoader = new AssetLoader(this.app, events, this.app.graphicsDevice.maxAnisotropy);

		// create root entities
		this.contentRoot = new Entity('contentRoot');
		this.app.root.addChild(this.contentRoot);

		this.cameraRoot = new Entity('cameraRoot');
		this.app.root.addChild(this.cameraRoot);

		// create elements
		this.camera = new Camera();
		this.add(this.camera);

		this.splatOverlay = new SplatOverlay();
		this.add(this.splatOverlay);

		this.grid = new Grid();
		this.add(this.grid);

		this.outline = new Outline();
		this.add(this.outline);
		this.underlay = new Underlay();
		this.add(this.underlay);
	}

	/**
	 * 启动场景
	 * 启动PlayCanvas应用
	 */
	start() {
		// 启动应用
		this.app.start();
	}

	/**
	 * 清空场景
	 * 移除所有Splat元素
	 */
	clear() {
		const splats = this.getElementsByType(ElementType.splat);
		splats.forEach((splat) => {
			this.remove(splat);
			(splat as Splat).destroy();
		});
	}

	/**
	 * 添加场景元素
	 * @param {Element} element - 要添加的元素
	 */
	add(element: Element) {
		if (!element.scene) {
			// 添加新元素
			element.scene = this;
			element.add();
			this.elements.push(element);

			// 通知所有元素有新元素被添加
			this.forEachElement(e => e !== element && e.onAdded(element));

			// 通知监听器
			this.events.fire('scene.elementAdded', element);
		}
	}

	/**
	 * 从场景移除元素
	 * @param {Element} element - 要移除的元素
	 */
	remove(element: Element) {
		if (element.scene === this) {
			// 从列表中移除
			this.elements.splice(this.elements.indexOf(element), 1);

			// 通知监听器
			this.events.fire('scene.elementRemoved', element);

			// 通知所有元素有元素被移除
			this.forEachElement(e => e.onRemoved(element));

			element.remove();
			element.scene = null;
		}
	}

	/**
	 * 获取场景包围盒
	 * 计算并返回包含所有元素的世界空间包围盒
	 * @returns {BoundingBox} 场景包围盒
	 */
	get bound() {
		if (this.boundDirty) {
			let valid = false;
			// 遍历所有元素，合并它们的包围盒
			this.forEachElement((e) => {
				const bound = e.worldBound;
				if (bound) {
					if (!valid) {
						// 第一个有效包围盒，直接复制
						valid = true;
						this.boundStorage.copy(bound);
					} else {
						// 后续包围盒，合并到现有包围盒
						this.boundStorage.add(bound);
					}
				}
			});

			this.boundDirty = false;
			// 触发包围盒变化事件
			this.events.fire('scene.boundChanged', this.boundStorage);
		}

		return this.boundStorage;
	}

	/**
	 * 根据类型获取元素列表
	 * @param {ElementType} elementType - 元素类型
	 * @returns {Element[]} 匹配类型的元素数组
	 */
	getElementsByType(elementType: ElementType) {
		return this.elements.filter(e => e.type === elementType);
	}

	/**
	 * 获取图形设备
	 * @returns {GraphicsDevice} 图形设备
	 */
	get graphicsDevice() {
		return this.app.graphicsDevice;
	}

	/**
	 * 遍历所有元素
	 * @param {(e: Element) => void} action - 对每个元素执行的操作
	 */
	private forEachElement(action: (e: Element) => void) {
		this.elements.forEach(action);
	}

	/**
	 * 更新回调
	 * 更新所有元素，检测场景变化，决定是否需要渲染
	 * @param {number} deltaTime - 帧时间差（秒）
	 */
	private onUpdate(deltaTime: number) {
		// 允许所有元素更新
		this.forEachElement(e => e.onUpdate(deltaTime));

		// 触发全局更新事件
		this.events.fire('update', deltaTime);

		// 触发序列化事件，监听器将使用此事件存储其状态
		// 我们将使用此来决定视图是否已更改，从而需要渲染
		const i = this.app.frame % 2;
		const state = this.sceneState[i];
		state.reset();
		// 序列化所有元素的状态
		this.forEachElement(e => state.pack(e));

		// 与之前的状态进行差异比较
		const result = state.compare(this.sceneState[1 - i]);

		// 生成所有已更改元素类型的集合
		const all = new Set([...result.added, ...result.removed, ...result.moved, ...result.changed]);

		// 与之前序列化的状态进行比较
		if (this.lockedRenderMode) {
			// 锁定渲染模式：使用锁定渲染标志
			this.app.renderNextFrame = this.lockedRender;
			this.lockedRender = false;
		} else if (!this.app.renderNextFrame) {
			// 如果场景有变化或需要强制渲染，则渲染下一帧
			this.app.renderNextFrame = this.forceRender || all.size > 0;
		}
		this.forceRender = false;

		// 触发每种类型的更新事件
		ElementTypeList.forEach((type) => {
			if (all.has(type)) {
				this.events.fire(`updated:${type}`);
			}
		});

		// 允许所有元素进行后更新
		this.forEachElement(e => e.onPostUpdate());
	}

	/**
	 * 渲染前回调
	 * 处理画布尺寸变化，更新渲染目标尺寸，调用所有元素的预渲染回调
	 */
	private onPreRender() {
		// 处理画布尺寸变化
		if (this.canvasResize) {
			this.canvas.width = this.canvasResize.width;
			this.canvas.height = this.canvasResize.height;
			this.canvasResize = null;
		}

		// 更新渲染目标尺寸（根据像素缩放比例）
		this.targetSize.width = Math.ceil(this.app.graphicsDevice.width / this.config.camera.pixelScale);
		this.targetSize.height = Math.ceil(this.app.graphicsDevice.height / this.config.camera.pixelScale);

		// 调用所有元素的预渲染回调
		this.forEachElement(e => e.onPreRender());

		// 触发预渲染事件
		this.events.fire('prerender', this.camera.entity.getWorldTransform());

		// 调试模式：显示场景包围盒
		if (this.config.debug.showBound) {
			// 绘制元素包围盒
			this.forEachElement((e: Element) => {
				if (e.type === ElementType.splat) {
					const splat = e as Splat;

					// 绘制局部空间包围盒（红色）
					const local = splat.localBound;
					this.app.drawWireAlignedBox(
						local.getMin(),
						local.getMax(),
						Color.RED,
						true,
						undefined,
						splat.entity.getWorldTransform());

					// 绘制世界空间包围盒（绿色）
					const world = splat.worldBound;
					this.app.drawWireAlignedBox(
						world.getMin(),
						world.getMax(),
						Color.GREEN);
				}
			});

			// 绘制场景包围盒（蓝色）
			this.app.drawWireAlignedBox(this.bound.getMin(), this.bound.getMax(), Color.BLUE);
		}
	}

	/**
	 * 渲染后回调
	 * 调用所有元素的渲染后回调，触发渲染后事件
	 */
	private onPostRender() {
		// 调用所有元素的渲染后回调
		this.forEachElement(e => e.onPostRender());

		// 触发渲染后事件
		this.events.fire('postrender');
	}
}

export { SceneConfig, Scene };
