import { Container } from '@playcanvas/pcui';

import { Events } from '../events';
import { Tooltips } from './tooltips';
import mainViewSvg from './svg/main-view-svg.svg';

const createSvg = (svgString: string) => {
	const decodedStr = decodeURIComponent(svgString.substring('data:image/svg+xml,'.length));
	return new DOMParser().parseFromString(decodedStr, 'image/svg+xml').documentElement;
};

class MainViewButton extends Container {
	constructor(events: Events, tooltips: Tooltips, args = {}) {
		args = {
			...args,
			id: 'main-view-button-container'
		};

		super(args);

		// 创建按钮元素（使用 Container 以支持 tooltips）
		const button = new Container({
			id: 'main-view-button'
		});

		// 添加 SVG 图标
		const iconSvg = createSvg(mainViewSvg);
		button.dom.appendChild(iconSvg);

		// 添加文本
		const buttonText = document.createElement('span');
		buttonText.textContent = 'Main View';
		button.dom.appendChild(buttonText);

		this.dom.appendChild(button.dom);

		tooltips.register(button, 'View the model as the final printed product.', 'top');

		let isZAxisView = false;

		// 检测是否是 z 轴视角的函数
		const checkZAxisView = () => {
			if ((window as any).scene) {
				const scene = (window as any).scene;
				const camera = scene.camera;
				if (camera) {
					// 获取 azim 和 elev（处理负数情况）
					let azim = camera.azim % 360;
					if (azim < 0) azim += 360;
					let elev = camera.elevation % 360;
					if (elev < 0) elev += 360;
					const isOrtho = camera.ortho;
					// 检测 azim 和 elev 是否接近 0（允许小的误差，例如 ±5 度）
					const azimNearZero = (azim <= 5 || azim >= 355);
					const elevNearZero = (elev <= 5 || elev >= 355);
					return isOrtho && azimNearZero && elevNearZero;
				}
			}
			return false;
		};

		// 更新按钮状态
		const updateButtonState = (isActive: boolean) => {
			if (isActive !== isZAxisView) {
				isZAxisView = isActive;
				if (isActive) {
					button.dom.classList.add('active');
				} else {
					button.dom.classList.remove('active');
				}
			}
		};

		// 点击事件（使用 pointerdown 与 view-cube 保持一致）
		button.dom.addEventListener('pointerdown', (e) => {
			events.fire('camera.align', 'pz');
			e.stopPropagation();
		});

		// 监听相机对齐事件（检查是否是 pz）
		events.on('camera.align', (axis: string) => {
			// 只处理 pz 轴对齐，或延迟检测所有对齐
			if (axis === 'pz') {
				// 相机对齐后延迟检测，等待相机更新完成
				setTimeout(() => {
					const isZAxis = checkZAxisView();
					updateButtonState(isZAxis);
				}, 200);
			} else {
				// 如果是对齐到其他轴，移除选中状态
				updateButtonState(false);
			}
		});

		// 监听相机更新（用户拖动模型时）
		events.on('prerender', () => {
			const isZAxis = checkZAxisView();
			updateButtonState(isZAxis);
		});

	}
}

export { MainViewButton };
