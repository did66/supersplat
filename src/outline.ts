/**
 * 轮廓高亮模块
 * 用于在选中的Splat对象周围绘制轮廓线，提供视觉反馈
 */
import {
	CULLFACE_NONE,
	SEMANTIC_POSITION,
	BlendState,
	DepthState,
	Color,
	Entity,
	Layer,
	Shader,
	ShaderUtils,
	QuadRender,
	WebglGraphicsDevice
} from 'playcanvas';

import { Element, ElementType } from './element';
import { vertexShader, fragmentShader } from './shaders/outline-shader';
import { Splat } from './splat';

/**
 * 轮廓高亮元素类
 * 负责在选中的Splat对象周围绘制轮廓效果
 */
class Outline extends Element {
	/** 轮廓相机实体，用于渲染轮廓层 */
	entity: Entity;
	/** 轮廓着色器，用于后处理轮廓效果 */
	shader: Shader;
	/** 四边形渲染器，用于全屏后处理 */
	quadRender: QuadRender;
	/** 是否启用轮廓效果 */
	enabled = true;
	/** 轮廓颜色 */
	clr = new Color(1, 1, 1, 0.5);

	/**
	 * 构造函数
	 * 创建轮廓相机实体并配置基本属性
	 */
	constructor() {
		super(ElementType.other);

		// 创建轮廓相机实体
		this.entity = new Entity('outlineCamera');
		this.entity.addComponent('camera');
		// 设置着色器通道为OUTLINE，用于轮廓渲染
		this.entity.camera.setShaderPass('OUTLINE');
		// 设置透明背景
		this.entity.camera.clearColor = new Color(0, 0, 0, 0);
	}

	/**
	 * 添加到场景
	 * 设置轮廓渲染所需的着色器、监听选择变化事件，并将轮廓相机添加到场景中
	 */
	add() {
		const device = this.scene.app.graphicsDevice;
		const layerId = this.scene.overlayLayer.id;

		// 监听选择变化事件，将选中的splat添加到轮廓层
		this.scene.events.on('selection.changed', (splat: Splat, prev: Splat) => {
			// 移除之前选中splat的轮廓层
			if (prev) {
				prev.entity.gsplat.layers = prev.entity.gsplat.layers.filter(id => id !== layerId);
			}
			// 将新选中的splat添加到轮廓层
			if (splat) {
				splat.entity.gsplat.layers = splat.entity.gsplat.layers.concat([layerId]);
			}
		});

		// 只渲染覆盖层（用于轮廓效果）
		this.entity.camera.layers = [layerId];
		// 将轮廓相机作为主相机的子节点
		this.scene.camera.entity.addChild(this.entity);

		// 创建轮廓着色器，用于后处理轮廓效果
		this.shader = ShaderUtils.createShader(device, {
			uniqueName: 'apply-outline',
			attributes: {
				vertex_position: SEMANTIC_POSITION
			},
			vertexGLSL: vertexShader,
			fragmentGLSL: fragmentShader
		});

		// 创建全屏四边形渲染器
		this.quadRender = new QuadRender(this.shader);

		// 获取着色器参数ID
		const outlineTextureId = device.scope.resolve('outlineTexture');
		const alphaCutoffId = device.scope.resolve('alphaCutoff');
		const clrId = device.scope.resolve('clr');
		const clrStorage = [1, 1, 1, 1];
		const events = this.scene.events;

		// 在渲染层后处理阶段应用轮廓纹理到显示画面（在gizmo渲染之前）
		this.entity.camera.on('postRenderLayer', (layer: Layer, transparent: boolean) => {
			// 如果轮廓未启用、不是覆盖层或不是透明渲染，则跳过
			if (!this.entity.enabled || layer !== this.scene.overlayLayer || !transparent) {
				return;
			}

			// 设置混合状态为Alpha混合
			device.setBlendState(BlendState.ALPHABLEND);
			// 禁用面剔除
			device.setCullMode(CULLFACE_NONE);
			// 禁用深度测试
			device.setDepthState(DepthState.NODEPTH);
			// 禁用模板测试
			device.setStencilState(null, null);

			// 获取选中颜色并更新颜色存储
			const selectedClr = events.invoke('selectedClr');
			clrStorage[0] = selectedClr.r;
			clrStorage[1] = selectedClr.g;
			clrStorage[2] = selectedClr.b;
			clrStorage[3] = selectedClr.a;

			// 设置着色器参数
			outlineTextureId.setValue(this.entity.camera.renderTarget.colorBuffer);
			// 根据相机模式设置alpha阈值（rings模式为0.0，其他为0.4）
			alphaCutoffId.setValue(events.invoke('camera.mode') === 'rings' ? 0.0 : 0.4);
			clrId.setValue(clrStorage);

			// 渲染到主相机渲染目标
			const glDevice = device as WebglGraphicsDevice;
			glDevice.setRenderTarget(this.scene.camera.entity.camera.renderTarget);
			glDevice.updateBegin();
			this.quadRender.render();
			glDevice.updateEnd();
		});
	}

	/**
	 * 从场景移除
	 * 将轮廓相机从主相机中移除
	 */
	remove() {
		this.scene.camera.entity.removeChild(this.entity);
	}

	/**
	 * 预渲染回调
	 * 在渲染前同步主相机的属性到轮廓相机，并设置渲染目标
	 */
	onPreRender() {
		// 复制主相机的属性到轮廓相机
		const src = this.scene.camera.entity.camera;
		const dst = this.entity.camera;

		dst.projection = src.projection;
		dst.horizontalFov = src.horizontalFov;
		dst.fov = src.fov;
		dst.nearClip = src.nearClip;
		dst.farClip = src.farClip;
		dst.orthoHeight = src.orthoHeight;

		// 根据轮廓启用状态和视图设置决定是否启用轮廓相机
		this.entity.enabled = this.enabled && this.scene.events.invoke('view.outlineSelection');
		// 使用主相机的工作渲染目标
		this.entity.camera.renderTarget = this.scene.camera.workRenderTarget;
	}
}

export { Outline };
