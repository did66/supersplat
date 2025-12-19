import { Container } from '@playcanvas/pcui';

import { Events } from '../events';
import uploadSvg from './svg/uploadSvg.svg';

const createSvg = (svgString: string) => {
	const decodedStr = decodeURIComponent(svgString.substring('data:image/svg+xml,'.length));
	return new DOMParser().parseFromString(decodedStr, 'image/svg+xml').documentElement;
};

class MainViewButton extends Container {
	constructor(events: Events, args = {}) {
		args = {
			...args,
			id: 'main-view-button-container'
		};

		super(args);

		// 创建按钮元素
		const button = document.createElement('div');
		button.id = 'main-view-button';

		// 添加 SVG 图标
		const iconSvg = createSvg(uploadSvg);
		button.appendChild(iconSvg);

		// 添加文本
		const buttonText = document.createElement('span');
		buttonText.textContent = 'Main View';
		button.appendChild(buttonText);

		// 点击事件
		button.addEventListener('click', (e) => {
			events.fire('camera.align', 'pz');
		});

		this.dom.appendChild(button);

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
					button.classList.add('active');
				} else {
					button.classList.remove('active');
				}
			}
		};

		// 监听相机对齐事件
		events.on('camera.align', () => {
			// 相机对齐后延迟检测，等待相机更新完成
			setTimeout(() => {
				const isZAxis = checkZAxisView();
				updateButtonState(isZAxis);
			}, 100);
		});

		// 监听相机更新（用户拖动模型时）
		events.on('prerender', () => {
			const isZAxis = checkZAxisView();
			updateButtonState(isZAxis);
		});
	}
}

export { MainViewButton };
