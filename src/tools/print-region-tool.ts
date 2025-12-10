/**
 * 打印区域选择工具
 * 允许用户定义和调整打印区域的边界框
 */
import { Button, Container, NumericInput } from '@playcanvas/pcui';
import { TranslateGizmo, Vec3 } from 'playcanvas';

import { PrintRegionShape } from '../print-region-shape';
import { Events } from '../events';
import { Scene } from '../scene';
import { Splat } from '../splat';

/**
 * 打印区域选择工具类
 */
class PrintRegionTool {
	activate: () => void;
	deactivate: () => void;

	active = false;
	private printRegion: PrintRegionShape;
	private gizmo: TranslateGizmo;
	private events: Events;
	private scene: Scene;
	// 保存初始状态（第一次激活时的状态）
	private initialPosition: Vec3 = new Vec3();
	private initialLenX: number = 2;
	private initialLenY: number = 2;
	private initialLenZ: number = 2;
	private isInitialized = false;

	constructor(events: Events, scene: Scene, canvasContainer: Container) {
		this.events = events;
		this.scene = scene;

		// 创建打印区域形状
		this.printRegion = new PrintRegionShape();

		// 创建变换Gizmo用于移动和调整
		this.gizmo = new TranslateGizmo(scene.camera.entity.camera, scene.gizmoLayer);

		this.gizmo.on('render:update', () => {
			scene.forceRender = true;
		});

		this.gizmo.on('transform:move', () => {
			this.printRegion.moved();
			// 触发打印区域变化事件
			events.fire('printRegion.changed', this.getPrintRegionBound());
		});

		// UI工具栏
		const toolbar = new Container({
			class: 'select-toolbar',
			hidden: true
		});

		toolbar.dom.addEventListener('pointerdown', (e) => {
			e.stopPropagation();
		});

		// 尺寸输入控件
		const lenX = new NumericInput({
			precision: 2,
			value: this.printRegion.lenX,
			placeholder: 'LenX',
			width: 80,
			min: 0.01
		});

		const lenY = new NumericInput({
			precision: 2,
			value: this.printRegion.lenY,
			placeholder: 'LenY',
			width: 80,
			min: 0.01
		});

		const lenZ = new NumericInput({
			precision: 2,
			value: this.printRegion.lenZ,
			placeholder: 'LenZ',
			width: 80,
			min: 0.01
		});

		// 重置按钮
		const resetButton = new Button({
			text: '重置',
			class: 'select-reset-button'
		});

		// 适配到选中Splat按钮
		const fitToSelectionButton = new Button({
			text: '适配选中',
			class: 'select-toolbar-button'
		});

		// 导出打印区域按钮
		const exportButton = new Button({
			text: '导出',
			class: 'select-toolbar-button'
		});

		toolbar.append(new Container({
			class: 'select-toolbar-label',
			text: '打印区域'
		}));
		toolbar.append(lenX);
		toolbar.append(lenY);
		toolbar.append(lenZ);
		toolbar.append(resetButton);
		// toolbar.append(fitToSelectionButton);
		// toolbar.append(exportButton);

		canvasContainer.append(toolbar);

		// 尺寸变化监听
		lenX.on('change', () => {
			this.printRegion.lenX = lenX.value;
			events.fire('printRegion.changed', this.getPrintRegionBound());
		});
		lenY.on('change', () => {
			this.printRegion.lenY = lenY.value;
			events.fire('printRegion.changed', this.getPrintRegionBound());
		});
		lenZ.on('change', () => {
			this.printRegion.lenZ = lenZ.value;
			events.fire('printRegion.changed', this.getPrintRegionBound());
		});

		// 重置按钮
		resetButton.dom.addEventListener('pointerdown', (e) => {
			e.stopPropagation();
			this.resetPrintRegion();
			lenX.value = this.printRegion.lenX;
			lenY.value = this.printRegion.lenY;
			lenZ.value = this.printRegion.lenZ;
		});

		// 适配到选中Splat
		fitToSelectionButton.dom.addEventListener('pointerdown', (e) => {
			e.stopPropagation();
			const selected = events.invoke('selection') as Splat;
			if (selected) {
				const bound = selected.worldBound;
				if (bound) {
					this.printRegion.pivot.setPosition(bound.center);
					this.printRegion.lenX = bound.halfExtents.x * 2;
					this.printRegion.lenY = bound.halfExtents.y * 2;
					this.printRegion.lenZ = bound.halfExtents.z * 2;
					lenX.value = this.printRegion.lenX;
					lenY.value = this.printRegion.lenY;
					lenZ.value = this.printRegion.lenZ;
					this.gizmo.attach([this.printRegion.pivot]);
					events.fire('printRegion.changed', this.getPrintRegionBound());
				}
			}
		});

		// 导出打印区域
		exportButton.dom.addEventListener('pointerdown', async (e) => {
			e.stopPropagation();
			if (!this.printRegion.enabled) {
				return;
			}

			const printRegionBound = this.getPrintRegionBound();
			if (!printRegionBound) {
				return;
			}

			// 调用导出功能，传递打印区域信息
			await events.invoke('scene.exportPrintRegion', printRegionBound);
		});

		// 监听相机焦点拾取，用于设置打印区域位置
		events.on('camera.focalPointPicked', (details: { splat: Splat, position: Vec3 }) => {
			if (this.active) {
				this.printRegion.pivot.setPosition(details.position);
				this.gizmo.attach([this.printRegion.pivot]);
				events.fire('printRegion.changed', this.getPrintRegionBound());
			}
		});

		// 更新Gizmo大小
		const updateGizmoSize = () => {
			const { camera, canvas } = scene;
			if (camera.ortho) {
				this.gizmo.size = 1125 / canvas.clientHeight;
			} else {
				this.gizmo.size = 1200 / Math.max(canvas.clientWidth, canvas.clientHeight);
			}
		};
		updateGizmoSize();
		events.on('camera.resize', updateGizmoSize);
		events.on('camera.ortho', updateGizmoSize);

		// 检查是否可以激活工具
		const canActivate = () => {
			const selected = events.invoke('selection') as Splat;
			if (!selected) {
				// 如果没有选中模型，显示提示弹窗
				events.invoke('showPopup', {
					type: 'info',
					header: '提示',
					message: '请先选择一个模型'
				});
				return false;
			}
			return true;
		};

		// 激活工具
		this.activate = () => {
			// 检查是否有选中的模型
			if (!canActivate()) {
				// 不激活工具，直接返回
				return;
			}

			const selected = events.invoke('selection') as Splat;

			this.active = true;
			this.printRegion.enabled = true;

			// 只在第一次激活时添加到场景，避免重复添加
			if (!this.printRegion.scene) {
				scene.add(this.printRegion);
			}

			// 如果是第一次激活，自动执行适配选中功能并保存初始状态
			if (!this.isInitialized) {
				const bound = selected.worldBound;
				if (bound) {
					this.printRegion.pivot.setPosition(bound.center);
					this.printRegion.lenX = bound.halfExtents.x * 2;
					this.printRegion.lenY = bound.halfExtents.y * 2;
					this.printRegion.lenZ = bound.halfExtents.z * 2;
				}

				// 保存初始状态
				this.initialPosition.copy(this.printRegion.pivot.getPosition());
				this.initialLenX = this.printRegion.lenX;
				this.initialLenY = this.printRegion.lenY;
				this.initialLenZ = this.printRegion.lenZ;
				this.isInitialized = true;

				// 更新输入框
				lenX.value = this.printRegion.lenX;
				lenY.value = this.printRegion.lenY;
				lenZ.value = this.printRegion.lenZ;
			}

			this.gizmo.attach([this.printRegion.pivot]);
			toolbar.hidden = false;
			// 触发打印区域变化事件
			events.fire('printRegion.changed', this.getPrintRegionBound());
		};

		// 停用工具
		this.deactivate = () => {
			toolbar.hidden = true;
			this.gizmo.detach();
			this.printRegion.enabled = false;
			// 不删除元素，只是隐藏，保留设置
			this.active = false;
		};

		// 注册获取打印区域包围盒的函数
		events.function('printRegion.getBound', () => {
			if (this.printRegion && this.printRegion.enabled) {
				return this.getPrintRegionBound();
			}
			return null;
		});

		// 暴露canActivate方法供工具管理器检查
		(this as any).canActivate = canActivate;
	}

	/**
	 * 重置打印区域到初始状态（第一次激活时的状态）
	 */
	private resetPrintRegion() {
		// 恢复到初始状态
		this.printRegion.pivot.setPosition(this.initialPosition);
		this.printRegion.lenX = this.initialLenX;
		this.printRegion.lenY = this.initialLenY;
		this.printRegion.lenZ = this.initialLenZ;
		this.events.fire('printRegion.changed', this.getPrintRegionBound());
	}

	/**
	 * 获取打印区域包围盒
	 */
	getPrintRegionBound() {
		return this.printRegion.printRegionBound;
	}
}

export { PrintRegionTool };

