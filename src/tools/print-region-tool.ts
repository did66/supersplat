/**
 * 打印区域选择工具
 * 允许用户定义和调整打印区域的边界框
 */
import { Button, Container, NumericInput, SelectInput, Label } from '@playcanvas/pcui';
import { BoundingBox, TranslateGizmo, Vec3 } from 'playcanvas';

import { ElementType } from '../element';
import { PrintRegionShape } from '../print-region-shape';
import { Events } from '../events';
import { Scene } from '../scene';
import { Splat } from '../splat';
import { localize } from '../ui/localization';

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
	private sizeSelect: any; // SelectInput instance
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

		// 辅助函数：同时触发打印区域变化和尺寸变化事件
		const firePrintRegionEvents = () => {
			events.fire('printRegion.changed', this.getPrintRegionBound());
			events.fire('printRegion.sizeChanged', {
				lenX: this.printRegion.lenX,
				lenY: this.printRegion.lenY,
				lenZ: this.printRegion.lenZ
			});
		};

		this.gizmo.on('transform:move', () => {
			this.printRegion.moved();
			// 触发打印区域变化事件
			firePrintRegionEvents();
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

		// 默认的 sizesOptions，会被 postMessage 更新
		let sizesOptions: Array<{ label: string; value: string; unitPrice: number }> = [
			{
				"label": "Small",
				"value": "3",
				"unitPrice": 19.9,
			},
			{
				"label": "Small+",
				"value": "5",
				"unitPrice": 59.9,
			},
			{
				"label": "Medium",
				"value": "7",
				"unitPrice": 99.99,
			},
			{
				"label": "Medium+",
				"value": "9",
				"unitPrice": 179.99,
			},
			{
				"label": "Large",
				"value": "12",
				"unitPrice": 259.9,
			}
		];

		const sizeLabel = new Label({
			class: 'size-label',
			text: 'Print size'
		});


		// 尺寸选择器
		this.sizeSelect = new SelectInput({
			options: sizesOptions.map(option => ({
				v: option.value,
				t: `${option.value}cm`
			})),
			defaultValue: sizesOptions[0].value,
			width: 80
		});
		const sizeSelect = this.sizeSelect; // Keep local reference for compatibility

		const sizeSelectBox = new Container({
			class: 'size-select-box'
		});
		const sizeSelectLabel = new Label({
			class: 'size-select-label',
			text: 'H'
		});


		sizeSelectBox.append(sizeSelectLabel);
		sizeSelectBox.append(sizeSelect);

		// 重置按钮
		const resetButton = new Button({
			text: localize('panel.colors.reset'),
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
		}));
		toolbar.append(lenX);
		toolbar.append(lenY);
		toolbar.append(lenZ);
		toolbar.append(sizeLabel);
		toolbar.append(sizeSelectBox);
		toolbar.append(resetButton);
		// toolbar.append(fitToSelectionButton);
		// toolbar.append(exportButton);

		canvasContainer.append(toolbar);

		// 尺寸变化监听
		lenX.on('change', () => {
			this.printRegion.lenX = lenX.value;
			firePrintRegionEvents();
		});
		lenY.on('change', () => {
			this.printRegion.lenY = lenY.value;
			firePrintRegionEvents();
		});
		lenZ.on('change', () => {
			this.printRegion.lenZ = lenZ.value;
			firePrintRegionEvents();
		});

		// 更新 sizeSelect 选项的函数
		const updateSizeSelectOptions = (newOptions: Array<{ label: string; value: string; unitPrice: number }>) => {
			sizesOptions = newOptions;
			sizeSelect.options = sizesOptions.map(option => ({
				v: option.value,
				t: `${option.value}cm`
			}));
			// 更新默认值
			if (sizesOptions.length > 0) {
				sizeSelect.value = sizesOptions[0].value;
				// 触发 change 事件以更新 scene-panel 中的 unit
				const unit = parseInt(sizeSelect.value);
				events.fire('printSize.unitChanged', unit);
			}
		};

		// 监听来自父窗口的 postMessage
		window.addEventListener('message', (event: MessageEvent) => {
			// 验证消息来源（可选，根据安全需求）
			// if (event.origin !== window.location.origin) return;

			if (event.data && event.data.type === 'SIZE_OPTIONS' && event.data.options) {
				updateSizeSelectOptions(event.data.options);
			}
		});

		// 尺寸选择器变化监听
		sizeSelect.on('change', () => {
			const unit = parseInt(sizeSelect.value);
			events.fire('printSize.unitChanged', unit);
		});

		// 初始化时自动触发事件，确保 scene-panel 中的 unit 使用默认值
		const initialUnit = parseInt(sizeSelect.value);
		events.fire('printSize.unitChanged', initialUnit);

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
					firePrintRegionEvents();
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
				firePrintRegionEvents();
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
			// 检查是否有可见的模型（不一定要选中）
			const allSplats = (scene.getElementsByType(ElementType.splat) as Splat[]).filter(s => s.visible);
			if (allSplats.length === 0) {
				// 如果没有可见模型，显示提示弹窗
				// events.invoke('showPopup', {
				// 	type: 'info',
				// 	header: '提示',
				// 	message: '请先选择一个模型'
				// });
				return false;
			}
			return true;
		};

		// 激活工具
		this.activate = () => {
			// 检查是否有可见的模型
			if (!canActivate()) {
				// 如果无法激活，通知工具管理器取消激活状态
				// 这样可以避免工具管理器认为工具已激活，导致需要点击两次的问题
				events.fire('tool.deactivate');
				return;
			}

			this.active = true;
			this.printRegion.enabled = true;

			// 只在第一次激活时添加到场景，避免重复添加
			if (!this.printRegion.scene) {
				scene.add(this.printRegion);
			}

			// 获取所有可见的模型，计算合并包围盒
			const allSplats = (scene.getElementsByType(ElementType.splat) as Splat[]).filter(s => s.visible);
			let bound: BoundingBox | null = null;

			if (allSplats.length > 0) {
				// 计算所有可见模型的合并包围盒
				let valid = false;
				const combinedBound = new BoundingBox();

				for (const splat of allSplats) {
					const splatBound = splat.worldBound;
					if (splatBound) {
						if (!valid) {
							valid = true;
							combinedBound.copy(splatBound);
						} else {
							combinedBound.add(splatBound);
						}
					}
				}

				if (valid) {
					bound = combinedBound;
				}
			}

			// 如果计算出了包围盒，使用它来设置打印区域（比模型大10%）
			if (bound) {
				this.printRegion.pivot.setPosition(bound.center);
				const scale = 1.1; // 增加10%的尺寸
				this.printRegion.lenX = bound.halfExtents.x * 2 * scale;
				this.printRegion.lenY = bound.halfExtents.y * 2 * scale;
				this.printRegion.lenZ = bound.halfExtents.z * 2 * scale;
			}

			// 如果是第一次激活，保存初始状态（用于重置功能）
			if (!this.isInitialized) {
				this.initialPosition.copy(this.printRegion.pivot.getPosition());
				this.initialLenX = this.printRegion.lenX;
				this.initialLenY = this.printRegion.lenY;
				this.initialLenZ = this.printRegion.lenZ;
				this.isInitialized = true;
			}

			// 更新输入框
			lenX.value = this.printRegion.lenX;
			lenY.value = this.printRegion.lenY;
			lenZ.value = this.printRegion.lenZ;

			this.gizmo.attach([this.printRegion.pivot]);
			toolbar.hidden = false;
			// 触发打印区域变化事件
			firePrintRegionEvents();
		};

		// 停用工具
		this.deactivate = () => {
			toolbar.hidden = true;
			this.gizmo.detach();
			this.printRegion.enabled = false;
			// 不删除元素，只是隐藏，保留设置
			this.active = false;
		};

		// 注册获取打印尺寸的函数
		events.function('printSize.value', () => {
			if (this.sizeSelect) {
				return parseInt(this.sizeSelect.value) || 0;
			}
			return 0;
		});

		// 注册获取打印区域包围盒的函数
		events.function('printRegion.getBound', () => {
			// 即使 enabled 为 false，只要 printRegion 存在且已初始化，就返回 bounding box
			// 因为打印区域的信息（lenX, lenY, lenZ, pivot position）在工具被停用后仍然保留
			if (this.printRegion && this.isInitialized) {
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
		this.events.fire('printRegion.sizeChanged', {
			lenX: this.printRegion.lenX,
			lenY: this.printRegion.lenY,
			lenZ: this.printRegion.lenZ
		});
	}

	/**
	 * 获取打印区域包围盒
	 */
	getPrintRegionBound() {
		return this.printRegion.printRegionBound;
	}
}

export { PrintRegionTool };

