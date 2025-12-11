import { Container, Element, Label, NumericInput, Button } from '@playcanvas/pcui';

import { Events } from '../events';
import { localize } from './localization';
import { SplatList } from './splat-list';
import sceneImportSvg from './svg/upload-btn.svg';
import sceneNewSvg from './svg/new.svg';
import collapsedSvg from './svg/collapsed.svg';
import { Tooltips } from './tooltips';
import { Transform } from './transform';
import { ColorPanel } from './color-panel';
import autoareaSvg from './svg/autoarea.svg';

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
		collapse.dom.appendChild(createSvg(collapsedSvg));


		const toggleCollapsed = () => {
			document.body.classList.toggle('collapsed');
		};

		collapse.on('click', toggleCollapsed);

		// sceneHeader.append(sceneIcon);
		// sceneHeader.append(sceneLabel);
		sceneHeader.append(sceneImport);
		sceneHeader.append(collapse);
		// sceneHeader.append(sceneNew);

		sceneImport.on('click', async () => {
			await events.invoke('scene.import');
		});

		sceneNew.on('click', () => {
			events.invoke('doc.new');
		});

		tooltips.register(sceneImport, 'Import', 'right');
		tooltips.register(sceneNew, 'New Scene', 'top');

		const colorPanelBox = new Container({
			class: 'color-panel-box'
		});
		const colorPanel = new ColorPanel(events, tooltips);
		colorPanelBox.append(colorPanel);


		const splatList = new SplatList(events);

		const splatListContainer = new Container({
			class: 'splat-list-container'
		});
		splatListContainer.append(splatList);

		const transformHeader = new Container({
			class: 'panel-header'
		});

		const transformTitle = new Label({
			text: localize('panel.scene-manager.transform'),
			class: 'transform-header-title'
		});

		const transformLabel = new Label({
			text: localize('panel.scene-manager.transform'),
			class: 'panel-header-label'
		});

		const printBox = new Container({
			class: 'print-box'
		});

		const printTitle = new Label({
			text: localize('panel.scene-manager.print'),
			class: 'transform-header-title'
		});

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
			precision: 2,
			value: null,
			enabled: false,
			placeholder: 'PX'
		});

		const sizeYInput = new NumericInput({
			class: 'print-size-input',
			precision: 2,
			value: null,
			enabled: false,
			placeholder: 'PY'
		});

		const sizeZInput = new NumericInput({
			class: 'print-size-input',
			precision: 2,
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



		printBox.append(printTitle);
		printBox.append(sizeRow);
		printBox.append(autoAreaButton);

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
		uploadButton.dom.addEventListener('click', () => {
			if (!printRegion) return;
			events.fire('upload.modelAndViews')
		})

		// transformHeader.append(transformLabel);

		this.append(sceneHeader);
		// this.append(splatListContainer);
		this.append(transformHeader);
		this.append(new Transform(events));
		this.append(colorPanelBox);
		this.append(printBox);
		this.append(uploadButton);
		// this.append(new Element({
		// 	class: 'panel-header',
		// 	height: 20
		// }));
	}
}

export { ScenePanel };
