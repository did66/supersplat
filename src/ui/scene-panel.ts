import { Container, Element, Label, NumericInput, Button } from '@playcanvas/pcui';

import { Events } from '../events';
import { localize } from './localization';
import { SplatList } from './splat-list';
import sceneImportSvg from './svg/uploadSvg.svg';
import sceneNewSvg from './svg/new.svg';
import collapsedSvg from './svg/collapsed.svg';
import expandSvg from './svg/expandSvg.svg';
import { Tooltips } from './tooltips';
import { Transform } from './transform';
import { ColorPanel } from './color-panel';
import autoareaSvg from './svg/autoarea.svg';
import arrowSvg from './svg/arrowSvg.svg';

const createSvg = (svgString: string) => {
	const decodedStr = decodeURIComponent(svgString.substring('data:image/svg+xml,'.length));
	return new DOMParser().parseFromString(decodedStr, 'image/svg+xml').documentElement;
};

class ScenePanel extends Container {
	constructor(events: Events, tooltips: Tooltips, args = {}) {
		args = {
			...args,
			id: 'scene-panel',
			class: 'panel'
		};

		super(args);

		// stop pointer events bubbling
		['pointerdown', 'pointerup', 'pointermove', 'wheel', 'dblclick'].forEach((eventName) => {
			this.dom.addEventListener(eventName, (event: Event) => event.stopPropagation());
		});

		const sceneHeader = new Container({
			class: 'panel-header-top'
		});

		const sceneIcon = new Label({
			class: 'panel-header-icon'
		});

		const sceneLabel = new Label({
			text: localize('panel.scene-manager'),
			class: 'panel-header-label'
		});

		const sceneImport = new Container({
			class: 'panel-import-button'
		});
		sceneImport.dom.appendChild(createSvg(sceneImportSvg));

		const sceneNew = new Container({
			class: 'panel-header-button'
		});
		sceneNew.dom.appendChild(createSvg(sceneNewSvg));

		const collapse = new Container({
			class: 'panel-collapse-button'
		});
		let collapseIcon = createSvg(collapsedSvg);
		collapse.dom.appendChild(collapseIcon);

		const toggleCollapsed = () => {
			const isCollapsed = document.body.classList.toggle('collapsed');
			// 切换图标：收起时显示 expandSvg，展开时显示 collapsedSvg
			collapse.dom.removeChild(collapseIcon);
			collapseIcon = createSvg(isCollapsed ? expandSvg : collapsedSvg);
			collapse.dom.appendChild(collapseIcon);
		};

		collapse.on('click', toggleCollapsed);

		// sceneHeader.append(sceneIcon);
		sceneHeader.append(sceneLabel);
		// sceneHeader.append(sceneImport);
		sceneHeader.append(collapse);
		// sceneHeader.append(sceneNew);

		sceneImport.on('click', async () => {
			await events.invoke('scene.import');
		});

		sceneNew.on('click', () => {
			events.invoke('doc.new');
		});

		// 模型集合

		const splatListContainer = new Container({
			class: 'panel-item-box'
		});
		const titleCollectionBox = new Container({
			class: 'title-box'
		});
		const titleLabelBox = new Container({
			class: 'title-label-box'
		});
		const collectionTitle = new Label({
			text: localize('panel.scene-manager.collection'),
			class: 'transform-header-title'
		});

		titleLabelBox.append(collectionTitle)

		const collectionArrow = createSvg(arrowSvg);
		collectionArrow.classList.add('arrow-icon');
		titleCollectionBox.append(titleLabelBox);
		titleCollectionBox.dom.appendChild(collectionArrow);

		const splatBox = new Container({
			class: 'splat-box'
		});

		const uploadTipsBox = new Container({
			class: 'upload-tips-box'
		});
		const uploadSvg = createSvg(sceneImportSvg);
		const uploadTips1 = new Container({
			class: 'upload-tips-text'
		})
		uploadTips1.dom.append('Click / Drag files')
		const uploadTips2 = new Container({
			class: 'upload-tips-text'
		})
		uploadTips2.dom.append('Supported Formats: .ply')
		const uploadTipsContent = new Container({
			class: 'upload-tips-content'
		})
		uploadTipsContent.append(uploadTips1)
		uploadTipsContent.append(uploadTips2)

		uploadTipsBox.append(uploadSvg)
		uploadTipsBox.append(uploadTipsContent)



		const splatList = new SplatList(events);


		const uploadSvgBtnBox = new Container({
			class: 'upload-svg-btn-box'
		});

		const uploadSvgBtn = new Container({
			class: 'btn-primary'
		});
		uploadSvgBtn.dom.appendChild(createSvg(sceneImportSvg));
		const uploadBtnLabel = new Label({
			class: 'btn-label',
			text: 'Add More Files'
		});
		uploadSvgBtn.append(uploadBtnLabel);

		uploadSvgBtnBox.on('click', async (evt) => {
			evt.stopPropagation();
			await events.invoke('scene.import');
		});

		uploadTipsBox.on('click', async () => {
			await events.invoke('scene.import');
		});
		uploadSvgBtnBox.append(uploadSvgBtn);
		splatBox.append(uploadTipsBox);
		splatBox.append(splatList);
		splatBox.append(uploadSvgBtnBox)

		// 根据是否有模型来控制显示
		const updateVisibility = () => {
			const allSplats = events.invoke('scene.allSplats') || [];
			const hasModels = allSplats.length > 0;
			splatList.hidden = !hasModels;
			uploadSvgBtnBox.hidden = !hasModels;
			uploadTipsBox.hidden = hasModels;
		};

		// 初始化时检查
		updateVisibility();

		// 监听模型添加和移除事件
		events.on('scene.elementAdded', () => {
			updateVisibility();
		});

		events.on('scene.elementRemoved', () => {
			updateVisibility();
		});

		let collectionExpanded = true;

		titleCollectionBox.on('click', () => {
			collectionExpanded = !collectionExpanded;
			splatBox.hidden = !collectionExpanded;
			collectionArrow.style.transform = collectionExpanded ? 'rotate(0deg)' : 'rotate(180deg)';
		});

		splatListContainer.append(titleCollectionBox);
		splatListContainer.append(splatBox);


		// 模型变换

		const transformBox = new Container({
			class: 'panel-item-box'
		});
		const titleTransformBox = new Container({
			class: 'title-box'
		});
		const transformTitle = new Label({
			text: localize('panel.scene-manager.transform'),
			class: 'transform-header-title'
		});
		const transformArrow = createSvg(arrowSvg);
		transformArrow.classList.add('arrow-icon');
		titleTransformBox.append(transformTitle);
		titleTransformBox.dom.appendChild(transformArrow);

		const transformPanel = new Transform(events);
		let transformExpanded = false;

		const transformPanelBox = new Container({
			class: 'transform-panel-box'
		});
		transformPanelBox.append(transformPanel);
		transformPanelBox.hidden = !transformExpanded;
		transformArrow.style.transform = transformExpanded ? 'rotate(0deg)' : 'rotate(180deg)';

		titleTransformBox.on('click', () => {
			transformExpanded = !transformExpanded;
			transformPanelBox.hidden = !transformExpanded;
			transformArrow.style.transform = transformExpanded ? 'rotate(0deg)' : 'rotate(180deg)';
		});

		// 当点击 translate/rotate/scale 按钮时，如果 transform panel 是收起状态，则展开它
		events.on('tool.activated', (toolName: string) => {
			if ((toolName === 'move' || toolName === 'rotate' || toolName === 'scale') && !transformExpanded) {
				transformExpanded = true;
				transformPanelBox.hidden = false;
				transformArrow.style.transform = 'rotate(0deg)';
			}
		});

		transformBox.append(titleTransformBox);
		transformBox.append(transformPanelBox);

		//打印

		const printBox = new Container({
			class: 'panel-item-box'
		});
		const titlePrintBox = new Container({
			class: 'title-box'
		});
		const printTitle = new Label({
			text: localize('panel.scene-manager.print'),
			class: 'transform-header-title'
		});
		const printArrow = createSvg(arrowSvg);
		printArrow.classList.add('arrow-icon');
		titlePrintBox.append(printTitle);
		titlePrintBox.dom.appendChild(printArrow);

		let printExpanded = true;

		// Size row
		const sizeRow = new Container({
			class: 'size-row'
		});

		const sizeLabel = new Label({
			class: 'transform-label',
			text: 'Size(cm)'
		});

		const sizeXInput = new NumericInput({
			class: 'print-size-input',
			precision: 1,
			value: null,
			enabled: false,
			placeholder: 'PX'
		});

		const sizeYInput = new NumericInput({
			class: 'print-size-input',
			precision: 1,
			value: null,
			enabled: false,
			placeholder: 'PY'
		});

		const sizeZInput = new NumericInput({
			class: 'print-size-input',
			precision: 1,
			value: null,
			enabled: false,
			placeholder: 'PZ'
		});

		const sizeInputsContainer = new Container({
			class: 'print-size-inputs'
		});
		sizeInputsContainer.append(sizeXInput);
		sizeInputsContainer.append(sizeYInput);
		sizeInputsContainer.append(sizeZInput);

		sizeRow.append(sizeLabel);
		sizeRow.append(sizeInputsContainer);

		// 模型调色
		const colorPanelBox = new Container({
			class: 'panel-item-box'
		});
		const titleColorBox = new Container({
			class: 'title-box'
		});
		const colorTitle = new Label({
			class: 'transform-header-title',
			text: localize('panel.model-controls')
		});
		const colorArrow = createSvg(arrowSvg);
		colorArrow.classList.add('arrow-icon');
		titleColorBox.append(colorTitle);
		titleColorBox.dom.appendChild(colorArrow);

		const colorPanel = new ColorPanel(events, tooltips);

		const colorPanelItem = new Container({
			class: 'color-panel-box'
		});
		colorPanelItem.append(colorPanel);
		let colorExpanded = false;
		colorPanelItem.hidden = !colorExpanded;
		colorArrow.style.transform = colorExpanded ? 'rotate(0deg)' : 'rotate(180deg)';

		titleColorBox.on('click', () => {
			colorExpanded = !colorExpanded;
			colorPanelItem.hidden = !colorExpanded;
			colorArrow.style.transform = colorExpanded ? 'rotate(0deg)' : 'rotate(180deg)';
		});

		colorPanelBox.append(titleColorBox);
		colorPanelBox.append(colorPanelItem);



		// AutoArea button
		const autoAreaButton = new Container({
			class: 'btn-primary',

		});
		const autoAreaLabel = new Label({
			class: 'btn-label',
			text: localize('panel.autoArea')
		});
		autoAreaButton.dom.appendChild(createSvg(autoareaSvg));
		autoAreaButton.append(autoAreaLabel);



		// 创建打印内容容器
		const printContent = new Container();
		printContent.append(sizeRow);

		titlePrintBox.on('click', () => {
			printExpanded = !printExpanded;
			printContent.hidden = !printExpanded;
			printArrow.style.transform = printExpanded ? 'rotate(0deg)' : 'rotate(180deg)';
		});

		printBox.append(titlePrintBox);
		printBox.append(printContent);


		// Update size values based on scene bound or print region
		let unit = 3;// 高度，默认值，会被 print-region-tool 的 change 事件更新
		let printRegionSize: { lenX: number; lenY: number; lenZ: number } | null = null;
		const updateSizeValues = () => {
			// 优先使用打印区域的尺寸
			if (printRegionSize) {
				const { lenX, lenY, lenZ } = printRegionSize;
				// 使用打印区域的比例，高度固定为 unit
				if (lenY > 0) {
					sizeXInput.value = (lenX / lenY) * unit;
					sizeYInput.value = unit; // Height is fixed at unit
					sizeZInput.value = (lenZ / lenY) * unit;
				} else {
					sizeXInput.value = null;
					sizeYInput.value = null;
					sizeZInput.value = null;
				}
				return;
			}

			// 如果没有打印区域，使用 scene bound
			if (typeof window !== 'undefined' && (window as any).scene) {
				const scene = (window as any).scene;
				const bound = scene.bound;
				const halfExtents = bound.halfExtents;

				// Calculate actual dimensions (halfExtents * 2)
				const width = halfExtents.x * 2;
				const height = halfExtents.y * 2;
				const depth = halfExtents.z * 2;

				// Check if bound is valid (has elements)
				if (width > 0 || height > 0 || depth > 0) {
					// Height is fixed at unit (3cm), X and Z are calculated by ratio (height = 1)
					if (height > 0) {
						sizeXInput.value = (width / height) * unit;
						sizeYInput.value = unit; // Height is fixed at unit
						sizeZInput.value = (depth / height) * unit;
					} else {
						sizeXInput.value = null;
						sizeYInput.value = null;
						sizeZInput.value = null;
					}
				} else {
					sizeXInput.value = null;
					sizeYInput.value = null;
					sizeZInput.value = null;
				}
			} else {
				sizeXInput.value = null;
				sizeYInput.value = null;
				sizeZInput.value = null;
			}
		};

		// Listen to scene bound changes
		events.on('scene.boundChanged', () => {
			updateSizeValues();
		});

		// Listen to edit operations (when model is modified)
		events.on('edit.apply', () => {
			// Use setTimeout to ensure bound is updated after edit
			setTimeout(() => {
				updateSizeValues();
			}, 0);
		});

		// Listen to selection changes (initial update)
		events.on('selection.changed', () => {
			updateSizeValues();
		});

		// Listen to print size unit changes
		events.on('printSize.unitChanged', (newUnit: number) => {
			unit = newUnit;
			updateSizeValues();
		});

		// Listen to print region size changes
		events.on('printRegion.sizeChanged', (size: { lenX: number; lenY: number; lenZ: number }) => {
			printRegionSize = size;
			updateSizeValues();
		});

		// Listen to print region changes (when print region is created or removed)
		events.on('printRegion.changed', (bound: any) => {
			// 如果打印区域被移除，清空 printRegionSize
			if (!bound) {
				printRegionSize = null;
				updateSizeValues();
			}
			// 如果打印区域存在，sizeChanged 事件会处理尺寸更新
		});

		// Initial update
		updateSizeValues();



		const uploadButton = new Container({
			class: 'btn-warning'
		});

		const uploadLabel = new Label({
			text: localize('tooltip.upload-model'),
			class: 'upload-label'
		});

		uploadButton.append(uploadLabel);
		let printRegion: any | null = null;
		// Update uploadButton disabled state based on print region
		const updateUploadButtonState = () => {
			printRegion = events.invoke('printRegion.getBound') as any | null;
			// Always unregister first to avoid duplicate registrations
			tooltips.unregister(uploadButton);
			if (printRegion) {
				uploadButton.class.remove('disabled');
			} else {
				uploadButton.class.add('disabled');
				// Register tooltip when no print region is selected
				tooltips.register(uploadButton, 'Please confirm the AutoArea', 'top');
			}
		};

		// Listen to print region changes
		events.on('printRegion.changed', () => {
			updateUploadButtonState();
		});

		// Initial check
		updateUploadButtonState();


		//打印点击
		autoAreaButton.dom.addEventListener('click', () => events.fire('tool.printRegion'))
		//点击上传按钮
		uploadButton.dom.addEventListener('click', async () => {
			if (!printRegion) return;

			// 先计算打印区域内模型的大小（会显示loading）
			const modelSize = await events.invoke('calculate.printRegionModelSize') as number;
			const maxSize = 100 * 1024 * 1024; // 100M in bytes

			if (modelSize > maxSize) {
				// 模型大小超过100M，显示提示并返回
				await events.invoke('showPopup', {
					type: 'info',
					header: 'Notice',
					message: 'The selected print content exceeds 100 MB. Please reselect the print area.'
				});

				return;
			}

			// 模型大小不超过100M，继续执行上传流程
			events.fire('upload.modelAndViews');
		})

		const stepBox = new Container({
			class: 'step-box'
		})
		stepBox.append(splatListContainer)
		stepBox.append(transformBox)
		stepBox.append(colorPanelBox)
		stepBox.append(printBox)

		const bottomBox = new Container({
			class: 'bottom-box'
		})
		bottomBox.append(autoAreaButton)
		bottomBox.append(uploadButton)


		this.append(sceneHeader);
		this.append(stepBox)
		this.append(bottomBox)

		tooltips.register(sceneImport, 'Import', 'right');
		tooltips.register(sceneNew, 'New Scene', 'top');

	}
}

export { ScenePanel };
