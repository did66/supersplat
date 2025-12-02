import { Button, Element, Container } from '@playcanvas/pcui';

import { Events } from '../events';
import { localize } from './localization';
import redoSvg from './svg/redo.svg';
import brushSvg from './svg/select-brush.svg';
import floodSvg from './svg/select-flood.svg';
import lassoSvg from './svg/select-lasso.svg';
import pickerSvg from './svg/select-picker.svg';
import polygonSvg from './svg/select-poly.svg';
import sphereSvg from './svg/select-sphere.svg';
import boxSvg from './svg/show-hide-splats.svg';
import undoSvg from './svg/undo.svg';
import { Tooltips } from './tooltips';
import cropSvg from './svg/crop.svg';

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

		const printRegion = new Button({
			id: 'bottom-toolbar-print-region',
			class: 'bottom-toolbar-tool'
		});

		// const crop = new Button({
		//     id: 'bottom-toolbar-crop',
		//     class: ['bottom-toolbar-tool', 'disabled']
		// });

		const translate = new Button({
			id: 'bottom-toolbar-translate',
			class: 'bottom-toolbar-tool',
			icon: 'E111'
		});

		const rotate = new Button({
			id: 'bottom-toolbar-rotate',
			class: 'bottom-toolbar-tool',
			icon: 'E113'
		});

		const scale = new Button({
			id: 'bottom-toolbar-scale',
			class: 'bottom-toolbar-tool',
			icon: 'E112'
		});

		const measure = new Button({
			id: 'bottom-toolbar-measure',
			class: 'bottom-toolbar-tool',
			icon: 'E358'
		});

		const coordSpace = new Button({
			id: 'bottom-toolbar-coord-space',
			class: 'bottom-toolbar-toggle',
			icon: 'E118'
		});

		const origin = new Button({
			id: 'bottom-toolbar-origin',
			class: ['bottom-toolbar-toggle'],
			icon: 'E189'
		});

		const fourViews = new Button({
			id: 'bottom-toolbar-four-views',
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
		printRegion.dom.appendChild(createSvg(cropSvg));
		lasso.dom.appendChild(createSvg(lassoSvg));
		fourViews.dom.appendChild(createSvg(boxSvg));
		// crop.dom.appendChild(createSvg(cropSvg));

		this.append(undo);
		this.append(redo);
		this.append(new Element({ class: 'bottom-toolbar-separator' }));
		this.append(picker);
		this.append(lasso);
		this.append(polygon);
		this.append(brush);
		this.append(flood);
		this.append(new Element({ class: 'bottom-toolbar-separator' }));
		this.append(sphere);
		this.append(box);
		// this.append(printRegion);
		// this.append(crop);
		this.append(new Element({ class: 'bottom-toolbar-separator' }));
		this.append(translate);
		this.append(rotate);
		this.append(scale);
		this.append(new Element({ class: 'bottom-toolbar-separator' }));
		this.append(measure);
		this.append(coordSpace);
		this.append(origin);
		this.append(new Element({ class: 'bottom-toolbar-separator' }));
		this.append(fourViews);

		undo.dom.addEventListener('click', () => events.fire('edit.undo'));
		redo.dom.addEventListener('click', () => events.fire('edit.redo'));
		polygon.dom.addEventListener('click', () => events.fire('tool.polygonSelection'));
		lasso.dom.addEventListener('click', () => events.fire('tool.lassoSelection'));
		brush.dom.addEventListener('click', () => events.fire('tool.brushSelection'));
		flood.dom.addEventListener('click', () => events.fire('tool.floodSelection'));
		picker.dom.addEventListener('click', () => events.fire('tool.rectSelection'));
		sphere.dom.addEventListener('click', () => events.fire('tool.sphereSelection'));
		box.dom.addEventListener('click', () => events.fire('tool.boxSelection'));
		printRegion.dom.addEventListener('click', () => events.fire('tool.printRegion'));
		translate.dom.addEventListener('click', () => events.fire('tool.move'));
		rotate.dom.addEventListener('click', () => events.fire('tool.rotate'));
		scale.dom.addEventListener('click', () => events.fire('tool.scale'));
		measure.dom.addEventListener('click', () => events.fire('tool.measure'));
		coordSpace.dom.addEventListener('click', () => events.fire('tool.toggleCoordSpace'));
		origin.dom.addEventListener('click', () => events.fire('pivot.toggleOrigin'));
		fourViews.dom.addEventListener('click', () => events.fire('render.fourViews'));

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
			printRegion.class[toolName === 'printRegion' ? 'add' : 'remove']('active');
			translate.class[toolName === 'move' ? 'add' : 'remove']('active');
			rotate.class[toolName === 'rotate' ? 'add' : 'remove']('active');
			scale.class[toolName === 'scale' ? 'add' : 'remove']('active');
			measure.class[toolName === 'measure' ? 'add' : 'remove']('active');
		});

		events.on('tool.coordSpace', (space: 'local' | 'world') => {
			coordSpace.dom.classList[space === 'local' ? 'add' : 'remove']('active');
		});

		events.on('pivot.origin', (o: 'center' | 'boundCenter') => {
			origin.dom.classList[o === 'boundCenter' ? 'add' : 'remove']('active');
		});

		// register tooltips
		tooltips.register(undo, localize('tooltip.undo'));
		tooltips.register(redo, localize('tooltip.redo'));
		tooltips.register(picker, localize('tooltip.picker'));
		tooltips.register(brush, localize('tooltip.brush'));
		tooltips.register(flood, localize('tooltip.flood'));
		tooltips.register(polygon, localize('tooltip.polygon'));
		tooltips.register(lasso, 'Lasso Select');
		tooltips.register(sphere, localize('tooltip.sphere'));
		tooltips.register(box, localize('tooltip.box'));
		// tooltips.register(printRegion, '打印区域');
		// tooltips.register(crop, 'Crop');
		tooltips.register(translate, localize('tooltip.translate'));
		tooltips.register(rotate, localize('tooltip.rotate'));
		tooltips.register(scale, localize('tooltip.scale'));
		tooltips.register(measure, localize('tooltip.measure'));
		tooltips.register(coordSpace, localize('tooltip.local-space'));
		tooltips.register(origin, localize('tooltip.bound-center'));
		tooltips.register(fourViews, localize('tooltip.four-views'));
	}
}

export { BottomToolbar };
