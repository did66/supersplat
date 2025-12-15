import { Button, Element, Container, Label, BooleanInput, ColorPicker, NumericInput } from '@playcanvas/pcui';
import { Color } from 'playcanvas';

import { Events } from '../events';
import { localize } from './localization';
import { Tooltips } from './tooltips';
import brushSvg from './svg/brush.svg';
import cropSvg from './svg/crop.svg';
import eyedropperSvg from './svg/select-eyedropper.svg';
import floodSvg from './svg/flood.svg';
import lassoSvg from './svg/lasso.svg';
import pickerSvg from './svg/picker.svg';
import polygonSvg from './svg/polygon.svg';
import publishSvg from './svg/publish.svg';
import redoSvg from './svg/redo.svg';
import sphereSvg from './svg/coordSpace.svg';
import boxSvg from './svg/box.svg';
import undoSvg from './svg/undo.svg';
import translateSvg from './svg/translate.svg';
import rotateSvg from './svg/rotate.svg';
import scaleSvg from './svg/scale.svg';
import deleteSvg from './svg/delete-my.svg';
import coordSpaceSvg from './svg/coordSpace.svg';
import printRegionSvg from './svg/printRegion.svg';
import setSvg from './svg/setSvg.svg';


const createSvg = (svgString: string) => {
	const decodedStr = decodeURIComponent(svgString.substring('data:image/svg+xml,'.length));
	return new DOMParser().parseFromString(decodedStr, 'image/svg+xml').documentElement;
};

class BottomToolbar extends Container {
	constructor(events: Events, tooltips: Tooltips, args = {}) {
		args = {
			...args,
			id: 'bottom-toolbar'
		};

		super(args);

		this.dom.addEventListener('pointerdown', (event) => {
			event.stopPropagation();
		});

		const undo = new Button({
			id: 'bottom-toolbar-undo',
			class: 'bottom-toolbar-button',
			enabled: false
		});

		const redo = new Button({
			id: 'bottom-toolbar-redo',
			class: 'bottom-toolbar-button',
			enabled: false
		});

		const picker = new Button({
			id: 'bottom-toolbar-picker',
			class: 'bottom-toolbar-tool'
		});

		const polygon = new Button({
			id: 'bottom-toolbar-polygon',
			class: 'bottom-toolbar-tool'
		});

		const brush = new Button({
			id: 'bottom-toolbar-brush',
			class: 'bottom-toolbar-tool'
		});

		const flood = new Button({
			id: 'bottom-toolbar-flood',
			class: 'bottom-toolbar-tool'
		});

		const lasso = new Button({
			id: 'bottom-toolbar-lasso',
			class: 'bottom-toolbar-tool'
		});

		const sphere = new Button({
			id: 'bottom-toolbar-sphere',
			class: 'bottom-toolbar-tool'
		});

		const box = new Button({
			id: 'bottom-toolbar-box',
			class: 'bottom-toolbar-tool'
		});

		const eyedropper = new Button({
			id: 'bottom-toolbar-eyedropper',
			class: 'bottom-toolbar-tool'
		});
		const deleteArea = new Button({
			id: 'bottom-toolbar-delete-area',
			class: 'bottom-toolbar-tool'
		});

		// const crop = new Button({
		//     id: 'bottom-toolbar-crop',
		//     class: ['bottom-toolbar-tool', 'disabled']
		// });

		const translate = new Button({
			id: 'bottom-toolbar-translate',
			class: 'bottom-toolbar-tool',

		});
		translate.dom.appendChild(createSvg(translateSvg));

		const rotate = new Button({
			id: 'bottom-toolbar-rotate',
			class: 'bottom-toolbar-tool',
		});
		rotate.dom.appendChild(createSvg(rotateSvg));

		const scale = new Button({
			id: 'bottom-toolbar-scale',
			class: 'bottom-toolbar-tool',
		});
		scale.dom.appendChild(createSvg(scaleSvg));

		const measure = new Button({
			id: 'bottom-toolbar-measure',
			class: 'bottom-toolbar-tool',
			icon: 'E358'
		});

		const coordSpace = new Button({
			id: 'bottom-toolbar-coord-space',
			class: 'bottom-toolbar-toggle',
		});
		coordSpace.dom.appendChild(createSvg(coordSpaceSvg));

		const origin = new Button({
			id: 'bottom-toolbar-origin',
			class: ['bottom-toolbar-toggle'],
			icon: 'E189'
		});

		const upload = new Button({
			id: 'bottom-toolbar-upload',
			class: 'bottom-toolbar-tool'
		});

		const printRegion = new Button({
			id: 'bottom-toolbar-print-region',
			class: 'bottom-toolbar-tool'
		});

		const set = new Button({
			id: 'bottom-toolbar-set',
			class: 'bottom-toolbar-tool'
		});

		undo.dom.appendChild(createSvg(undoSvg));
		redo.dom.appendChild(createSvg(redoSvg));
		picker.dom.appendChild(createSvg(pickerSvg));
		polygon.dom.appendChild(createSvg(polygonSvg));
		brush.dom.appendChild(createSvg(brushSvg));
		flood.dom.appendChild(createSvg(floodSvg));
		sphere.dom.appendChild(createSvg(sphereSvg));
		box.dom.appendChild(createSvg(boxSvg));
		lasso.dom.appendChild(createSvg(lassoSvg));
		eyedropper.dom.appendChild(createSvg(eyedropperSvg));
		deleteArea.dom.appendChild(createSvg(deleteSvg));
		// crop.dom.appendChild(createSvg(cropSvg));
		upload.dom.appendChild(createSvg(publishSvg));
		printRegion.dom.appendChild(createSvg(printRegionSvg));
		set.dom.appendChild(createSvg(setSvg));

		// 第一组：撤销/重做（左右箭头）
		const group1 = new Container({
			class: 'bottom-toolbar-group'
		});
		group1.append(undo);
		group1.append(redo);

		// 第二组：移动/旋转/缩放（平移、旋转、扩展）
		const group2 = new Container({
			class: 'bottom-toolbar-group'
		});
		group2.append(translate);
		group2.append(rotate);
		group2.append(scale);

		// 第三组：选择工具组（选择、多边形、画笔、填充、套索、取色器）
		const group3 = new Container({
			class: 'bottom-toolbar-group'
		});
		group3.append(picker);
		group3.append(lasso);
		group3.append(polygon);
		group3.append(brush);
		group3.append(flood);
		group3.append(deleteArea);
		// group3.append(eyedropper);

		// 第四组：坐标系/3D视图（地球仪、3D立方体）
		const group4 = new Container({
			class: 'bottom-toolbar-group'
		});
		group4.append(sphere);
		group4.append(box);

		// 第五组：打印区域（虚线方框）
		const group5 = new Container({
			class: 'bottom-toolbar-group'
		});
		// group5.append(printRegion);
		// group5.append(upload);
		group5.append(set);

		this.append(group1);
		this.append(group2);
		this.append(group3);
		this.append(group4);
		this.append(group5);

		undo.dom.addEventListener('click', () => events.fire('edit.undo'));
		redo.dom.addEventListener('click', () => events.fire('edit.redo'));
		polygon.dom.addEventListener('click', () => events.fire('tool.polygonSelection'));
		lasso.dom.addEventListener('click', () => events.fire('tool.lassoSelection'));
		brush.dom.addEventListener('click', () => events.fire('tool.brushSelection'));
		flood.dom.addEventListener('click', () => events.fire('tool.floodSelection'));
		picker.dom.addEventListener('click', () => events.fire('tool.rectSelection'));
		eyedropper.dom.addEventListener('click', () => events.fire('tool.eyedropperSelection'));
		sphere.dom.addEventListener('click', () => events.fire('tool.sphereSelection'));
		box.dom.addEventListener('click', () => events.fire('tool.boxSelection'));
		translate.dom.addEventListener('click', () => events.fire('tool.move'));
		rotate.dom.addEventListener('click', () => events.fire('tool.rotate'));
		scale.dom.addEventListener('click', () => events.fire('tool.scale'));
		measure.dom.addEventListener('click', () => events.fire('tool.measure'));
		coordSpace.dom.addEventListener('click', () => events.fire('tool.toggleCoordSpace'));
		origin.dom.addEventListener('click', () => events.fire('pivot.toggleOrigin'));
		upload.dom.addEventListener('click', () => events.fire('upload.modelAndViews'));
		printRegion.dom.addEventListener('click', () => events.fire('tool.printRegion'));
		deleteArea.dom.addEventListener('click', () => events.fire('select.delete'));

		events.on('edit.canUndo', (value: boolean) => {
			undo.enabled = value;
		});
		events.on('edit.canRedo', (value: boolean) => {
			redo.enabled = value;
		});

		events.on('tool.activated', (toolName: string) => {
			picker.class[toolName === 'rectSelection' ? 'add' : 'remove']('active');
			brush.class[toolName === 'brushSelection' ? 'add' : 'remove']('active');
			flood.class[toolName === 'floodSelection' ? 'add' : 'remove']('active');
			polygon.class[toolName === 'polygonSelection' ? 'add' : 'remove']('active');
			lasso.class[toolName === 'lassoSelection' ? 'add' : 'remove']('active');
			sphere.class[toolName === 'sphereSelection' ? 'add' : 'remove']('active');
			box.class[toolName === 'boxSelection' ? 'add' : 'remove']('active');
			translate.class[toolName === 'move' ? 'add' : 'remove']('active');
			rotate.class[toolName === 'rotate' ? 'add' : 'remove']('active');
			scale.class[toolName === 'scale' ? 'add' : 'remove']('active');
			measure.class[toolName === 'measure' ? 'add' : 'remove']('active');
			eyedropper.class[toolName === 'eyedropperSelection' ? 'add' : 'remove']('active');
			printRegion.class[toolName === 'printRegion' ? 'add' : 'remove']('active');
		});

		events.on('tool.coordSpace', (space: 'local' | 'world') => {
			coordSpace.dom.classList[space === 'local' ? 'add' : 'remove']('active');
		});

		events.on('pivot.origin', (o: 'center' | 'boundCenter') => {
			origin.dom.classList[o === 'boundCenter' ? 'add' : 'remove']('active');
		});

		// 设置面板
		const settingsPanel = new Container({
			id: 'bottom-toolbar-settings-panel',
			class: 'bottom-toolbar-settings-panel',
			hidden: true
		});

		// 阻止事件冒泡
		['pointerdown', 'pointerup', 'pointermove', 'wheel', 'dblclick'].forEach((eventName) => {
			settingsPanel.dom.addEventListener(eventName, (event: Event) => event.stopPropagation());
		});

		// 背景颜色行
		const bgColorRow = new Container({
			class: 'bottom-toolbar-settings-row'
		});

		const bgColorLabel = new Label({
			class: 'bottom-toolbar-settings-label',
			text: localize('panel.colors')
		});

		const bgColorPicker = new ColorPicker({
			class: 'bottom-toolbar-settings-color-picker',
			channels: 3,
			value: [1, 1, 1]
		});

		const rgbLabel = new Label({
			class: 'bottom-toolbar-settings-rgb-label',
			text: 'RGB'
		});

		const rInput = new NumericInput({
			class: 'bottom-toolbar-settings-rgb-input',
			precision: 0,
			value: 255,
			min: 0,
			max: 255,
			width: 60
		});

		const gInput = new NumericInput({
			class: 'bottom-toolbar-settings-rgb-input',
			precision: 0,
			value: 255,
			min: 0,
			max: 255,
			width: 60
		});

		const bInput = new NumericInput({
			class: 'bottom-toolbar-settings-rgb-input',
			precision: 0,
			value: 255,
			min: 0,
			max: 255,
			width: 60
		});

		bgColorRow.append(bgColorLabel);
		bgColorRow.append(bgColorPicker);
		// bgColorRow.append(rgbLabel);
		// bgColorRow.append(rInput);
		// bgColorRow.append(gInput);
		// bgColorRow.append(bInput);

		// 显示/隐藏边界行
		const showBoundRow = new Container({
			class: 'bottom-toolbar-settings-row'
		});

		const showBoundLabel = new Label({
			class: 'bottom-toolbar-settings-label',
			text: localize('panel.view-options.show-bound')
		});

		const showBoundToggle = new BooleanInput({
			type: 'toggle',
			class: 'bottom-toolbar-settings-toggle',
			value: false
		});

		showBoundRow.append(showBoundLabel);
		showBoundRow.append(showBoundToggle);

		// 显示/隐藏网格行
		const showGridRow = new Container({
			class: 'bottom-toolbar-settings-row'
		});

		const showGridLabel = new Label({
			class: 'bottom-toolbar-settings-label',
			text: localize('panel.view-options.show-grid')
		});

		const showGridToggle = new BooleanInput({
			type: 'toggle',
			class: 'bottom-toolbar-settings-toggle',
			value: true
		});

		showGridRow.append(showGridLabel);
		showGridRow.append(showGridToggle);

		settingsPanel.append(bgColorRow);
		settingsPanel.append(showBoundRow);
		settingsPanel.append(showGridRow);

		// 添加到父容器（需要在 editor.ts 中添加，这里先添加到当前容器）
		// 注意：实际应该在 editor.ts 中添加到 canvasContainer

		// 背景颜色事件处理
		const toArray = (clr: Color) => {
			return [clr.r, clr.g, clr.b];
		};

		const toRGB = (value: number[]) => {
			return [Math.round(value[0] * 255), Math.round(value[1] * 255), Math.round(value[2] * 255)];
		};

		events.on('bgClr', (clr: Color) => {
			bgColorPicker.value = toArray(clr);
			const rgb = toRGB(toArray(clr));
			rInput.value = rgb[0];
			gInput.value = rgb[1];
			bInput.value = rgb[2];
		});

		bgColorPicker.on('change', (value: number[]) => {
			events.fire('setBgClr', new Color(value[0], value[1], value[2]));
			const rgb = toRGB(value);
			rInput.value = rgb[0];
			gInput.value = rgb[1];
			bInput.value = rgb[2];
		});

		rInput.on('change', () => {
			const r = rInput.value / 255;
			const current = bgColorPicker.value;
			bgColorPicker.value = [r, current[1], current[2]];
			events.fire('setBgClr', new Color(r, current[1], current[2]));
		});

		gInput.on('change', () => {
			const g = gInput.value / 255;
			const current = bgColorPicker.value;
			bgColorPicker.value = [current[0], g, current[2]];
			events.fire('setBgClr', new Color(current[0], g, current[2]));
		});

		bInput.on('change', () => {
			const b = bInput.value / 255;
			const current = bgColorPicker.value;
			bgColorPicker.value = [current[0], current[1], b];
			events.fire('setBgClr', new Color(current[0], current[1], b));
		});

		// 显示网格事件处理
		events.on('grid.visible', (visible: boolean) => {
			showGridToggle.value = visible;
		});

		showGridToggle.on('change', () => {
			events.fire('grid.setVisible', showGridToggle.value);
		});

		// 显示边界事件处理
		events.on('camera.bound', (visible: boolean) => {
			showBoundToggle.value = visible;
		});

		showBoundToggle.on('change', () => {
			events.fire('camera.setBound', showBoundToggle.value);
		});

		// set 按钮点击事件
		set.dom.addEventListener('click', () => {
			settingsPanel.hidden = !settingsPanel.hidden;
			set.class[settingsPanel.hidden ? 'remove' : 'add']('active');
		});

		// 暴露 settingsPanel 以便在 editor.ts 中使用
		(this as any).settingsPanel = settingsPanel;

		// register tooltips
		tooltips.register(undo, localize('tooltip.bottom-toolbar.undo'));
		tooltips.register(redo, localize('tooltip.bottom-toolbar.redo'));
		tooltips.register(picker, localize('tooltip.bottom-toolbar.rect'));
		tooltips.register(lasso, localize('tooltip.bottom-toolbar.lasso'));
		tooltips.register(polygon, localize('tooltip.bottom-toolbar.polygon'));
		tooltips.register(brush, localize('tooltip.bottom-toolbar.brush'));
		tooltips.register(flood, localize('tooltip.bottom-toolbar.flood'));
		tooltips.register(sphere, localize('tooltip.bottom-toolbar.sphere'));
		tooltips.register(box, localize('tooltip.bottom-toolbar.box'));
		tooltips.register(translate, localize('tooltip.bottom-toolbar.translate'));
		tooltips.register(rotate, localize('tooltip.bottom-toolbar.rotate'));
		tooltips.register(scale, localize('tooltip.bottom-toolbar.scale'));
		tooltips.register(measure, localize('tooltip.bottom-toolbar.measure'));
		tooltips.register(coordSpace, localize('tooltip.bottom-toolbar.local-space'));
		tooltips.register(origin, localize('tooltip.bottom-toolbar.bound-center'));
		tooltips.register(eyedropper, localize('tooltip.bottom-toolbar.eyedropper'));
		tooltips.register(deleteArea, localize('tooltip.bottom-toolbar.delete'));
		tooltips.register(upload, localize('tooltip.upload-model'));
		tooltips.register(printRegion, localize('tooltip.bottom-toolbar.print-region'));
	}
}

export { BottomToolbar };
