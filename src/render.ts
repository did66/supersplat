import { BufferTarget, EncodedPacket, EncodedVideoPacketSource, MkvOutputFormat, MovOutputFormat, Mp4OutputFormat, Output, StreamTarget, WebMOutputFormat } from 'mediabunny';
import { Color, GSplatResource, path, Vec3 } from 'playcanvas';

import { ElementType } from './element';
import { Events } from './events';
import { PngCompressor } from './png-compressor';
import { Scene } from './scene';
import { Splat } from './splat';
import { localize } from './ui/localization';

type ImageSettings = {
	width: number;
	height: number;
	transparentBg: boolean;
	showDebug: boolean;
};

type VideoSettings = {
	startFrame: number;
	endFrame: number;
	frameRate: number;
	width: number;
	height: number;
	bitrate: number;
	transparentBg: boolean;
	showDebug: boolean;
	format: 'mp4' | 'webm' | 'mov' | 'mkv';
	codec: 'h264' | 'h265' | 'vp9' | 'av1';
};

const removeExtension = (filename: string) => {
	return filename.substring(0, filename.length - path.getExtension(filename).length);
};

const downloadFile = (arrayBuffer: ArrayBuffer, filename: string) => {
	const blob = new Blob([arrayBuffer], { type: 'application/octet-stream' });
	const url = window.URL.createObjectURL(blob);
	const el = document.createElement('a');
	el.download = filename;
	el.href = url;
	el.click();
	window.URL.revokeObjectURL(url);
};

const registerRenderEvents = (scene: Scene, events: Events) => {
	let compressor: PngCompressor;

	// wait for postrender to fire
	const postRender = () => {
		return new Promise<boolean>((resolve, reject) => {
			const handle = scene.events.on('postrender', () => {
				handle.off();
				try {
					resolve(true);
				} catch (error) {
					reject(error);
				}
			});
		});
	};

	events.function('render.offscreen', async (width: number, height: number): Promise<Uint8Array> => {
		try {
			// start rendering to offscreen buffer only
			scene.camera.startOffscreenMode(width, height);
			scene.camera.renderOverlays = false;
			scene.gizmoLayer.enabled = false;

			// render the next frame
			scene.forceRender = true;

			// for render to finish
			await postRender();

			// cpu-side buffer to read pixels into
			const data = new Uint8Array(width * height * 4);

			const { renderTarget } = scene.camera.entity.camera;
			const { workRenderTarget } = scene.camera;

			scene.dataProcessor.copyRt(renderTarget, workRenderTarget);

			// read the rendered frame
			await workRenderTarget.colorBuffer.read(0, 0, width, height, { renderTarget: workRenderTarget, data });

			// flip y positions to have 0,0 at the top
			let line = new Uint8Array(width * 4);
			for (let y = 0; y < height / 2; y++) {
				line = data.slice(y * width * 4, (y + 1) * width * 4);
				data.copyWithin(y * width * 4, (height - y - 1) * width * 4, (height - y) * width * 4);
				data.set(line, (height - y - 1) * width * 4);
			}

			return data;
		} finally {
			scene.camera.endOffscreenMode();
			scene.camera.renderOverlays = true;
			scene.gizmoLayer.enabled = true;
			scene.camera.entity.camera.clearColor.set(0, 0, 0, 0);
		}
	});

	events.function('render.image', async (imageSettings: ImageSettings) => {
		events.fire('startSpinner');

		try {
			const { width, height, transparentBg, showDebug } = imageSettings;
			const bgClr = events.invoke('bgClr');

			// start rendering to offscreen buffer only
			scene.camera.startOffscreenMode(width, height);
			scene.camera.renderOverlays = showDebug;
			scene.gizmoLayer.enabled = false;
			if (!transparentBg) {
				scene.camera.entity.camera.clearColor.copy(bgClr);
			}

			// render the next frame
			scene.forceRender = true;

			// for render to finish
			await postRender();

			// cpu-side buffer to read pixels into
			const data = new Uint8Array(width * height * 4);

			const { renderTarget } = scene.camera.entity.camera;
			const { workRenderTarget } = scene.camera;

			scene.dataProcessor.copyRt(renderTarget, workRenderTarget);

			// read the rendered frame
			await workRenderTarget.colorBuffer.read(0, 0, width, height, { renderTarget: workRenderTarget, data });

			// the render buffer contains premultiplied alpha. so apply background color.
			if (!transparentBg) {
				// @ts-ignore
				const pixels = new Uint8ClampedArray(data.buffer);

				const { r, g, b } = bgClr;
				for (let i = 0; i < pixels.length; i += 4) {
					const a = 255 - pixels[i + 3];
					pixels[i + 0] += r * a;
					pixels[i + 1] += g * a;
					pixels[i + 2] += b * a;
					pixels[i + 3] = 255;
				}
			}

			// construct the png compressor
			if (!compressor) {
				compressor = new PngCompressor();
			}

			const arrayBuffer = await compressor.compress(
				new Uint32Array(data.buffer),
				width,
				height
			);

			// construct filename
			const selected = events.invoke('selection') as Splat;
			const filename = `${removeExtension(selected?.name ?? 'SuperSplat')}-image.png`;

			// download
			downloadFile(arrayBuffer, filename);

			return true;
		} catch (error) {
			await events.invoke('showPopup', {
				type: 'error',
				header: localize('render.failed'),
				message: `'${error.message ?? error}'`
			});
		} finally {
			scene.camera.endOffscreenMode();
			scene.camera.renderOverlays = true;
			scene.gizmoLayer.enabled = true;
			scene.camera.entity.camera.clearColor.set(0, 0, 0, 0);

			events.fire('stopSpinner');
		}
	});
	events.function('render.fourViews', async (imageSettings: ImageSettings) => {
		events.fire('startSpinner');

		try {
			const { width, height, transparentBg, showDebug } = imageSettings;
			// 四视图使用白色背景
			const whiteBg = new Color(1, 1, 1);
			// const bgClr = events.invoke('bgClr');
			const bgClr = whiteBg;

			const splats = (scene.getElementsByType(ElementType.splat) as Splat[]).filter(s => s.visible);
			if (splats.length === 0) throw new Error('No visible splats to render');

			const selected = events.invoke('selection') as Splat;
			const modelName = removeExtension(selected?.name ?? 'SuperSplat');

			const bound = scene.bound;
			const focalPoint = bound.center.clone();
			const focalRadius = bound.halfExtents.length();

			// 保存原始相机状态（用于恢复）- 保存完整的 tween 值，确保完全恢复
			const focalPointValue = scene.camera.focalPointTween.value;
			const azimElevValue = scene.camera.azimElevTween.value;
			const distanceValue = scene.camera.distanceTween.value;
			const focalPointTarget = scene.camera.focalPointTween.target;
			const azimElevTarget = scene.camera.azimElevTween.target;
			const distanceTarget = scene.camera.distanceTween.target;
			const orig = {
				focalPoint: scene.camera.focalPoint.clone(),
				azim: scene.camera.azim,
				elev: scene.camera.elevation,
				distance: scene.camera.distance,
				focalPointTween: {
					value: {
						x: focalPointValue.x,
						y: focalPointValue.y,
						z: focalPointValue.z
					},
					source: {
						x: scene.camera.focalPointTween.source.x,
						y: scene.camera.focalPointTween.source.y,
						z: scene.camera.focalPointTween.source.z
					},
					target: {
						x: focalPointTarget.x,
						y: focalPointTarget.y,
						z: focalPointTarget.z
					}
				},
				azimElevTween: {
					value: {
						azim: azimElevValue.azim,
						elev: azimElevValue.elev
					},
					source: {
						azim: scene.camera.azimElevTween.source.azim,
						elev: scene.camera.azimElevTween.source.elev
					},
					target: {
						azim: azimElevTarget.azim,
						elev: azimElevTarget.elev
					}
				},
				distanceTween: {
					value: {
						distance: distanceValue.distance
					},
					source: {
						distance: scene.camera.distanceTween.source.distance
					},
					target: {
						distance: distanceTarget.distance
					}
				}
			};

			// 计算统一的相机距离-调整四视图大小
			const fdist = (focalRadius / scene.camera.sceneRadius) * 1.5;
			const targetDistance = isFinite(fdist) ? fdist : 1;

			const views = [
				{ name: 'front', azim: 0, elev: 0 },
				{ name: 'back', azim: 180, elev: 0 },
				{ name: 'left', azim: 90, elev: 0 },
				{ name: 'right', azim: 270, elev: 0 }
			];

			if (!compressor) compressor = new PngCompressor();

			// 进入锁定渲染模式：只有明确设置lockedRender才会渲染
			scene.lockedRenderMode = true;

			// 等待若干渲染帧以确保稳定（在锁定模式下，不触发主视图更新）
			async function waitStableFrames(frames = 4) {
				for (let i = 0; i < frames; i++) {
					scene.camera.onUpdate(0);
					// 在锁定模式下，只有设置lockedRender才会渲染，且只渲染到离屏缓冲区
					scene.lockedRender = true;
					// 确保forceRender被清除，防止触发主视图渲染
					scene.forceRender = false;
					await postRender();
				}
			}

			// 等待单个 splat 的 sorter 完成（或超时），返回 Promise
			function waitSorterUpdatedFor(splat: Splat, timeoutMs = 1200) {
				return new Promise<void>((resolve) => {
					const { instance } = splat.entity.gsplat;
					let resolved = false;

					// 如果 sorter 不存在或没有 on 方法，直接 resolve（兼容性）
					if (!instance || !instance.sorter || typeof instance.sorter.on !== 'function') {
						return resolve();
					}

					const handle = instance.sorter.on('updated', () => {
						if (!resolved) {
							resolved = true;
							try { handle.off(); } catch (e) { }
							resolve();
						}
					});

					// 手动触发排序（确保触发）
					try {
						instance.sort(scene.camera.entity);
					} catch (e) {
						// ignore
					}

					// 超时保护
					setTimeout(() => {
						if (!resolved) {
							resolved = true;
							try { handle.off(); } catch (e) { }
							resolve();
						}
					}, timeoutMs);
				});
			}

			// 等待所有 splat sorter 完成（并发）
			async function waitAllSorters(timeoutPer = 1200) {
				await Promise.all(splats.map(s => waitSorterUpdatedFor(s, timeoutPer)));
			}

			// 恢复原始相机状态的辅助函数 - 直接恢复 tween 值，避免触发事件
			function restoreOriginalCamera() {
				// 直接恢复 tween 的所有值（value, source, target），确保完全恢复
				// focalPointTween
				scene.camera.focalPointTween.value.x = orig.focalPointTween.value.x;
				scene.camera.focalPointTween.value.y = orig.focalPointTween.value.y;
				scene.camera.focalPointTween.value.z = orig.focalPointTween.value.z;
				scene.camera.focalPointTween.source.x = orig.focalPointTween.source.x;
				scene.camera.focalPointTween.source.y = orig.focalPointTween.source.y;
				scene.camera.focalPointTween.source.z = orig.focalPointTween.source.z;
				scene.camera.focalPointTween.target.x = orig.focalPointTween.target.x;
				scene.camera.focalPointTween.target.y = orig.focalPointTween.target.y;
				scene.camera.focalPointTween.target.z = orig.focalPointTween.target.z;
				// azimElevTween
				scene.camera.azimElevTween.value.azim = orig.azimElevTween.value.azim;
				scene.camera.azimElevTween.value.elev = orig.azimElevTween.value.elev;
				scene.camera.azimElevTween.source.azim = orig.azimElevTween.source.azim;
				scene.camera.azimElevTween.source.elev = orig.azimElevTween.source.elev;
				scene.camera.azimElevTween.target.azim = orig.azimElevTween.target.azim;
				scene.camera.azimElevTween.target.elev = orig.azimElevTween.target.elev;
				// distanceTween
				scene.camera.distanceTween.value.distance = orig.distanceTween.value.distance;
				scene.camera.distanceTween.source.distance = orig.distanceTween.source.distance;
				scene.camera.distanceTween.target.distance = orig.distanceTween.target.distance;
				// 重置 tween 的 timer，确保不会继续过渡
				scene.camera.focalPointTween.timer = scene.camera.focalPointTween.transitionTime;
				scene.camera.azimElevTween.timer = scene.camera.azimElevTween.transitionTime;
				scene.camera.distanceTween.timer = scene.camera.distanceTween.transitionTime;
				// 更新相机实体变换，确保相机位置正确
				scene.camera.onUpdate(0);
				// 确保 forceRender 为 false，避免在退出锁定模式后触发不必要的渲染
				scene.forceRender = false;
			}

			// 存储四视图图片数据
			const fourViewsImages: Array<{ name: string, position: string, data: ArrayBuffer }> = [];

			// 在整个渲染过程中保持锁定模式，确保主视图完全不受影响
			// 注意：不在这里恢复相机状态，避免触发任何更新

			// ---- 主循环：对每个视角严格顺序处理 ----
			for (const view of views) {
				// 1. 进入离屏渲染模式（suppressFinalBlit会阻止blit到主画布）
				scene.camera.startOffscreenMode(width, height);
				scene.camera.renderOverlays = showDebug;

				// 3. 设置背景色（四视图强制使用白色背景）
				scene.camera.entity.camera.clearColor.copy(bgClr);

				// 4. 设置相机到目标视角（只在离屏模式下）
				scene.camera.setDistance(targetDistance, 0);
				scene.camera.setFocalPoint(focalPoint, 0);
				scene.camera.setAzimElev(view.azim, view.elev, 0);
				scene.camera.onUpdate(0);
				scene.forceRender = false;

				// 5. 等待splat排序完成
				await waitAllSorters(1000);

				// 6. 等待几帧让渲染稳定
				await waitStableFrames(5);

				// 7. 触发一次离屏渲染
				scene.lockedRender = true;
				await postRender();

				// 8. 读取渲染数据
				const data = new Uint8Array(width * height * 4);
				const { renderTarget } = scene.camera.entity.camera;
				const { workRenderTarget } = scene.camera;

				scene.dataProcessor.copyRt(renderTarget, workRenderTarget);
				await workRenderTarget.colorBuffer.read(0, 0, width, height, { renderTarget: workRenderTarget, data });

				// 9. 应用背景色（四视图强制使用白色背景）
				const pixels = new Uint8ClampedArray(data.buffer);
				const { r, g, b } = bgClr;
				for (let j = 0; j < pixels.length; j += 4) {
					const a = 255 - pixels[j + 3];
					pixels[j + 0] += r * a;
					pixels[j + 1] += g * a;
					pixels[j + 2] += b * a;
					pixels[j + 3] = 255;
				}

				// 10. 压缩图片
				const arrayBuffer = await compressor.compress(
					new Uint32Array(data.buffer),
					width,
					height
				);

				// 保存图片数据（用于上传）
				fourViewsImages.push({
					name: `${modelName}-${view.name}.png`,
					data: arrayBuffer,
					position: view.name
				});

				// 同时下载文件（保持原有功能）
				// downloadFile(arrayBuffer, `${modelName}-${view.name}.png`);

				// 11. 结束离屏模式
				scene.camera.endOffscreenMode();

				// 注意：不在每次循环后恢复相机状态，避免触发主视图更新
				// 只在所有渲染完成后统一恢复
			}

			// 注意：不在四视图渲染完成后恢复相机状态，避免触发主视图更新
			// 封面图渲染也需要离屏模式，所以继续使用离屏相机状态

			// 生成封面图（front 视角，透明背景，500x500）
			const coverImage = await (async () => {
				// 封面图与 front 视角相同，相机状态已经在最后一个视角（right）设置好了
				// 只需要确保是 front 视角状态

				const coverWidth = 500;
				const coverHeight = 500;
				const coverView = { name: 'cover', azim: 0, elev: 0 }; // 与 front 视角相同

				// 进入离屏渲染模式
				scene.camera.startOffscreenMode(coverWidth, coverHeight);
				scene.camera.renderOverlays = showDebug;

				// 设置透明背景
				scene.camera.entity.camera.clearColor.set(0, 0, 0, 0);

				// 设置相机到 front 视角
				scene.camera.setDistance(targetDistance, 0);
				scene.camera.setFocalPoint(focalPoint, 0);
				scene.camera.setAzimElev(coverView.azim, coverView.elev, 0);
				scene.camera.onUpdate(0);
				scene.forceRender = false;

				// 等待splat排序完成
				await waitAllSorters(1000);

				// 等待几帧让渲染稳定
				await waitStableFrames(5);

				// 触发一次离屏渲染
				scene.lockedRender = true;
				await postRender();

				// 读取渲染数据
				const coverData = new Uint8Array(coverWidth * coverHeight * 4);
				const { renderTarget } = scene.camera.entity.camera;
				const { workRenderTarget } = scene.camera;

				scene.dataProcessor.copyRt(renderTarget, workRenderTarget);
				await workRenderTarget.colorBuffer.read(0, 0, coverWidth, coverHeight, { renderTarget: workRenderTarget, data: coverData });

				// 封面图保持透明背景，不应用背景色

				// 压缩图片
				const coverArrayBuffer = await compressor.compress(
					new Uint32Array(coverData.buffer),
					coverWidth,
					coverHeight
				);

				// 结束离屏模式
				scene.camera.endOffscreenMode();

				// 注意：不在这里恢复相机状态，避免触发主视图更新

				return {
					name: `${modelName}-cover.png`,
					data: coverArrayBuffer,
					position: 'cover'
				};
			})();

			// 所有渲染完成后，恢复原始相机状态（只恢复一次，避免多次触发更新）
			restoreOriginalCamera();

			// 退出锁定渲染模式
			scene.lockedRenderMode = false;
			// 触发一次渲染，确保主视图显示正确的状态
			scene.forceRender = true;

			// 返回四视图图片数据和封面图
			return {
				images: fourViewsImages,
				cover: coverImage
			};

		} catch (err) {
			await events.invoke('showPopup', {
				type: 'error',
				header: localize('render.failed'),
				message: `'${err?.message ?? err}'`
			});
		} finally {
			try { scene.camera.endOffscreenMode(); } catch (e) { }
			scene.camera.renderOverlays = true;
			try { scene.camera.entity.camera.clearColor.set(0, 0, 0, 0); } catch (e) { }
			scene.lockedRenderMode = false;
			scene.forceRender = true;
			events.fire('stopSpinner');
		}
	});

	// 准备模型数据和四视图（用于 postMessage 或直接上传）
	events.function('prepare.modelAndViews', async () => {
		events.fire('startSpinner');

		try {
			// 1. 获取当前选中的模型
			const selected = events.invoke('selection') as Splat;
			if (!selected) {
				throw new Error('No model selected');
			}

			const modelName = removeExtension(selected.name ?? 'SuperSplat');

			// 2. 获取模型数据（序列化为PLY格式）
			// 使用 scene.splats 获取所有可见且有数据的模型（与 scene.export 保持一致）
			const splats = events.invoke('scene.splats') as Splat[];
			if (splats.length === 0) {
				throw new Error('No visible splats to upload');
			}

			// 导入序列化相关模块
			const { BufferWriter } = await import('./serialize/writer');
			const { serializePly } = await import('./splat-serialize');

			// 序列化模型数据到内存
			// 注意：由于在 upload.modelAndViews 中已经对所有模型进行了打印区域裁剪（删除了打印区域外的点）
			// 所以这里直接序列化所有可见模型即可，不需要再使用 printRegion 选项过滤
			// 使用 maxSHBands: 0 确保数据与实际导出一致
			const modelBuffer = new BufferWriter();
			const serializeSettings = {
				maxSHBands: 0  // 固定使用 0，与实际导出的数据一致
			};
			await serializePly(splats, serializeSettings, modelBuffer);
			const buffers = modelBuffer.close();
			// 合并所有buffer为一个ArrayBuffer
			const totalLength = buffers.reduce((sum, buf) => sum + buf.byteLength, 0);
			const modelData = new Uint8Array(totalLength);
			let offset = 0;
			for (const buf of buffers) {
				modelData.set(buf, offset);
				offset += buf.byteLength;
			}

			// 3. 生成四视图（提高分辨率以提高清晰度）
			const defaultImageSettings = {
				width: 1024,
				height: 1024,
				transparentBg: false, // 四视图使用白色背景
				showDebug: false
			};
			const fourViewsResult = await events.invoke('render.fourViews', defaultImageSettings) as { images: Array<{ name: string, position: string, data: ArrayBuffer }>, cover: { name: string, data: ArrayBuffer, position: string } };

			if (!fourViewsResult || !fourViewsResult.images || fourViewsResult.images.length !== 4) {
				throw new Error('Failed to generate four views');
			}

			return {
				modelName,
				modelData: modelData.buffer, // ArrayBuffer
				fourViews: fourViewsResult.images.map(view => ({
					name: view.name,
					data: view.data, // ArrayBuffer
					position: view.position
				})),
				cover: {
					name: fourViewsResult.cover.name,
					data: fourViewsResult.cover.data, // ArrayBuffer
					position: fourViewsResult.cover.position
				}
			};

		} catch (err) {
			await events.invoke('showPopup', {
				type: 'error',
				header: 'Prepare Failed',
				message: `'${err?.message ?? err}'`
			});
			throw err;
		} finally {
			events.fire('stopSpinner');
		}
	});

	// 计算打印区域内模型的大小（用于检查是否超过限制）
	events.function('calculate.printRegionModelSize', async () => {
		events.fire('startSpinner');

		try {
			// setTimeout so spinner has a chance to activate
			await new Promise<void>((resolve) => {
				setTimeout(resolve);
			});
			// 获取打印区域
			const printRegionBound = events.invoke('printRegion.getBound') as any | null;
			if (!printRegionBound) {
				return 0;
			}

			// 获取所有可见的模型
			const splats = (scene.getElementsByType(ElementType.splat) as Splat[]).filter(s => s.visible);
			if (splats.length === 0) {
				return 0;
			}

			// 导入序列化相关模块
			const { BufferWriter } = await import('./serialize/writer');
			const { serializePly } = await import('./splat-serialize');

			// 序列化模型数据到内存
			// 注意：由于在 upload.modelAndViews 中已经对所有模型进行了打印区域裁剪（删除了打印区域外的点）
			// 所以这里直接序列化所有可见模型即可，不需要再使用 printRegion 选项过滤
			// 使用与 prepare.modelAndViews 相同的序列化设置，确保大小计算准确
			const modelBuffer = new BufferWriter();
			const serializeSettings = {
				maxSHBands: 0  // 与 prepare.modelAndViews 保持一致
			};
			await serializePly(splats, serializeSettings, modelBuffer);
			const buffers = modelBuffer.close();

			// 计算总大小
			const totalSize = buffers.reduce((sum, buf) => sum + buf.byteLength, 0);
			return totalSize;
		} catch (err) {
			console.error('Failed to calculate model size:', err);
			return 0;
		} finally {
			events.fire('stopSpinner');
		}
	});

	// 通过 postMessage 发送模型数据和四视图到父组件
	events.function('send.modelAndViewsToParent', async () => {
		events.fire('startSpinner');

		try {
			// 检查是否在 iframe 中
			// if (window.parent === window) {
			// 	throw new Error('Not in an iframe. Cannot send message to parent.');
			// }

			// 在生成四视图之前获取所有必要的信息（因为生成四视图会取消打印框选）
			// 获取打印区域的 BBOX
			const printRegionBound = events.invoke('printRegion.getBound') as any | null;
			const printRegionBbox = printRegionBound ? (() => {
				const min = printRegionBound.getMin();
				const max = printRegionBound.getMax();
				return [
					[min.x, min.y, min.z],
					[max.x, max.y, max.z]
				];
			})() : null;

			// 获取原模型信息（在生成四视图之前）
			const selected = events.invoke('selection') as Splat;
			const modelBound = selected && selected.worldBound ? selected.worldBound : scene.bound;
			const modelHalfExtents = modelBound.halfExtents;
			const modelWidth = modelHalfExtents.x * 2;
			const modelHeight = modelHalfExtents.y * 2;
			const modelDepth = modelHalfExtents.z * 2;

			// 计算原模型的比例（高度为1）
			const modelDimensions = {
				width: modelWidth,
				height: modelHeight,
				depth: modelDepth,
				// 比例（高度为1）
				ratio: {
					width: modelHeight > 0 ? modelWidth / modelHeight : 0,
					height: 1,
					depth: modelHeight > 0 ? modelDepth / modelHeight : 0
				}
			};

			// 计算打印区域的 dimensions（如果存在打印区域，否则使用原模型的 dimensions）
			const dimensions = printRegionBound ? (() => {
				const printHalfExtents = printRegionBound.halfExtents;
				const printWidth = printHalfExtents.x * 2;
				const printHeight = printHalfExtents.y * 2;
				const printDepth = printHalfExtents.z * 2;
				return {
					width: printWidth,
					height: printHeight,
					depth: printDepth,
					// 比例（高度为1）
					ratio: {
						width: printHeight > 0 ? printWidth / printHeight : 0,
						height: 1,
						depth: printHeight > 0 ? printDepth / printHeight : 0
					}
				};
			})() : modelDimensions;

			// 获取原模型的 BBOX 坐标
			const modelBbox = selected && selected.worldBound ? (() => {
				const min = selected.worldBound.getMin();
				const max = selected.worldBound.getMax();
				return [
					[min.x, min.y, min.z],
					[max.x, max.y, max.z]
				];
			})() : null;

			// 准备数据（这里会生成四视图，可能会取消打印框选）
			const data = await events.invoke('prepare.modelAndViews') as {
				modelName: string;
				modelData: ArrayBuffer;
				fourViews: Array<{ name: string, position: string, data: ArrayBuffer }>;
				cover: { name: string, data: ArrayBuffer, position: string };
			};

			// 确保所有数据都是 ArrayBuffer 类型（Transferable）
			// modelData 应该是 ArrayBuffer（从 modelData.buffer 获取）
			const modelDataBuffer: ArrayBuffer = data.modelData instanceof ArrayBuffer
				? data.modelData
				: (data.modelData as any).buffer;

			// 确保所有视图数据都是 ArrayBuffer
			const viewBuffers: ArrayBuffer[] = data.fourViews.map(view => {
				return view.data instanceof ArrayBuffer
					? view.data
					: (view.data as any).buffer;
			});

			// 确保封面图数据是 ArrayBuffer
			const coverBuffer: ArrayBuffer = data.cover && data.cover.data
				? (data.cover.data instanceof ArrayBuffer
					? data.cover.data
					: (data.cover.data as any).buffer)
				: null;

			// 验证所有数据都是 ArrayBuffer
			if (!(modelDataBuffer instanceof ArrayBuffer)) {
				throw new Error('Model data is not an ArrayBuffer');
			}
			for (let i = 0; i < viewBuffers.length; i++) {
				if (!(viewBuffers[i] instanceof ArrayBuffer)) {
					throw new Error(`View data at index ${i} is not an ArrayBuffer`);
				}
			}
			if (coverBuffer && !(coverBuffer instanceof ArrayBuffer)) {
				throw new Error('Cover data is not an ArrayBuffer');
			}

			// 保存并导出 PLY 文件
			// const plyFilename = `${data.modelName}.ply`;
			// downloadFile(modelDataBuffer, plyFilename);

			// 使用 Transferable Objects 优化大文件传输（零拷贝）
			// 注意：使用 transferable 后，原始 ArrayBuffer 会被转移，不能再使用
			const transferables: Transferable[] = coverBuffer
				? [modelDataBuffer, ...viewBuffers, coverBuffer]
				: [modelDataBuffer, ...viewBuffers];

			// 获取打印尺寸
			const printSize = events.invoke('printSize.value') as number || 0;

			// 构建消息数据，包含文件信息以便父组件创建 File 对象
			const message = {
				type: 'supersplat:modelAndViews',
				modelName: data.modelName,
				model: {
					data: modelDataBuffer,
					filename: `${data.modelName}.ply`,
					type: 'ply'
				},
				views: data.fourViews.map((view, index) => ({
					data: viewBuffers[index],
					filename: view.name,
					type: 'image/png',
					position: view.position
				})),
				cover: coverBuffer ? {
					data: coverBuffer,
					filename: data.cover.name,
					type: 'image/png',
					position: data.cover.position
				} : null,
				printRegionBbox: printRegionBbox,
				modelBbox: modelBbox,
				modelDimensions: modelDimensions,
				printRegionDimensions: dimensions,
				printSize: printSize,  // 打印尺寸选择器的值
				shDegree: 0  // 使用序列化时实际使用的 maxSHBands 值（0）
			};
			console.log('message', message)

			// 发送消息到父窗口（使用 transferable 优化）
			window.parent.postMessage(message, '*', transferables);
			return true;

		} catch (err) {
			await events.invoke('showPopup', {
				type: 'error',
				header: 'Send Failed',
				message: `'${err?.message ?? err}'`
			});
			throw err;
		} finally {
			events.fire('stopSpinner');
		}
	});


	events.function('render.video', async (videoSettings: VideoSettings, fileStream: FileSystemWritableFileStream) => {
		events.fire('progressStart', localize('panel.render.render-video'));

		try {
			const { startFrame, endFrame, frameRate, width, height, bitrate, transparentBg, showDebug, format, codec: codecChoice } = videoSettings;

			const target = fileStream ? new StreamTarget(fileStream) : new BufferTarget();

			// Configure output format based on container selection
			let outputFormat: Mp4OutputFormat | MovOutputFormat | MkvOutputFormat | WebMOutputFormat;
			let fileExtension: string;

			if (format === 'webm') {
				outputFormat = new WebMOutputFormat();
				fileExtension = 'webm';
			} else if (format === 'mov') {
				outputFormat = new MovOutputFormat({
					fastStart: 'in-memory'
				});
				fileExtension = 'mov';
			} else if (format === 'mkv') {
				outputFormat = new MkvOutputFormat();
				fileExtension = 'mkv';
			} else {
				outputFormat = new Mp4OutputFormat({
					fastStart: 'in-memory'
				});
				fileExtension = 'mp4';
			}

			// Configure codec based on codec selection
			let codecType: 'avc' | 'hevc' | 'vp9' | 'av1';
			let codec: string;

			if (codecChoice === 'h264') {
				codecType = 'avc';
				codec = height < 1080 ? 'avc1.420028' : 'avc1.640033'; // H.264 Constrained Baseline/High profile
			} else if (codecChoice === 'h265') {
				codecType = 'hevc';
				codec = 'hev1.1.6.L120.B0'; // H.265 Main profile, Level 4.0
			} else if (codecChoice === 'vp9') {
				codecType = 'vp9';
				codec = 'vp09.00.10.08'; // VP9 Profile 0, Level 1.0
			} else if (codecChoice === 'av1') {
				codecType = 'av1';
				codec = 'av01.0.05M.08'; // AV1 Main Profile, Level 3.1
			} else {
				codecType = 'avc';
				codec = height < 1080 ? 'avc1.420028' : 'avc1.640033'; // Default: H.264 Constrained Baseline/High
			}

			const output = new Output({
				format: outputFormat,
				target
			});

			const videoSource = new EncodedVideoPacketSource(codecType);
			output.addVideoTrack(videoSource, {
				rotation: 0,
				frameRate
			});

			await output.start();

			const encoder = new VideoEncoder({
				output: async (chunk, meta) => {
					const encodedPacket = EncodedPacket.fromEncodedChunk(chunk);
					await videoSource.add(encodedPacket, meta);
				},
				error: (error) => {
					console.log(error);
				}
			});

			encoder.configure({
				codec,
				width,
				height,
				bitrate
			});

			// start rendering to offscreen buffer only
			scene.camera.startOffscreenMode(width, height);
			scene.camera.renderOverlays = showDebug;
			scene.gizmoLayer.enabled = false;
			if (!transparentBg) {
				scene.camera.entity.camera.clearColor.copy(events.invoke('bgClr'));
			}
			scene.lockedRenderMode = true;

			// cpu-side buffer to read pixels into
			const data = new Uint8Array(width * height * 4);
			const line = new Uint8Array(width * 4);

			// get the list of visible splats
			const splats = (scene.getElementsByType(ElementType.splat) as Splat[]).filter(splat => splat.visible);

			// remember last camera position so we can skip sorting if the camera didn't move
			const last_pos = new Vec3(0, 0, 0);
			const last_forward = new Vec3(1, 0, 0);

			// prepare the frame for rendering
			const prepareFrame = async (frameTime: number) => {
				events.fire('timeline.time', frameTime);

				// manually update the camera so position and rotation are correct
				scene.camera.onUpdate(0);

				// if the camera didn't move, don't sort
				const pos = scene.camera.entity.getPosition();
				const forward = scene.camera.entity.forward;
				if (last_pos.equals(pos) && last_forward.equals(forward)) {
					return;
				}

				// update remembered position
				last_pos.copy(pos);
				last_forward.copy(forward);

				// wait for sorting to complete
				await Promise.all(splats.map((splat) => {
					// create a promise for each splat that will resolve upon sorting complete
					return new Promise<void>((resolve) => {
						const { instance } = splat.entity.gsplat;

						// listen for the sorter to complete
						const handle = instance.sorter.on('updated', () => {
							handle.off();
							resolve();
						});

						// manually invoke sort because internally the engine sorts after render the
						// scene call is made.
						instance.sort(scene.camera.entity);

						// in cases where the camera does not move between frames the sorter won't run
						// and we need a timeout instead. this is a hack - the engine should allow us to
						// know whether the sorter is running or not.
						setTimeout(() => {
							resolve();
						}, 1000);
					});
				}));
			};

			// capture the current video frame
			const captureFrame = async (frameTime: number) => {
				const { renderTarget } = scene.camera.entity.camera;
				const { workRenderTarget } = scene.camera;

				scene.dataProcessor.copyRt(renderTarget, workRenderTarget);

				// read the rendered frame
				await workRenderTarget.colorBuffer.read(0, 0, width, height, { renderTarget: workRenderTarget, data });

				// flip the buffer vertically
				for (let y = 0; y < height / 2; y++) {
					const top = y * width * 4;
					const bottom = (height - y - 1) * width * 4;
					line.set(data.subarray(top, top + width * 4));
					data.copyWithin(top, bottom, bottom + width * 4);
					data.set(line, bottom);
				}

				// construct the video frame
				const videoFrame = new VideoFrame(data, {
					format: 'RGBA',
					codedWidth: width,
					codedHeight: height,
					timestamp: Math.floor(1e6 * frameTime),
					duration: Math.floor(1e6 / frameRate)
				});
				encoder.encode(videoFrame);
				videoFrame.close();
			};

			const animFrameRate = events.invoke('timeline.frameRate');
			const duration = (endFrame - startFrame) / animFrameRate;

			for (let frameTime = 0; frameTime <= duration; frameTime += 1.0 / frameRate) {
				// special case the first frame
				await prepareFrame(startFrame + frameTime * animFrameRate);

				// render a frame
				scene.lockedRender = true;

				// wait for render to finish
				await postRender();

				// wait for capture
				await captureFrame(frameTime);

				events.fire('progressUpdate', {
					text: localize('panel.render.rendering', { ellipsis: true }),
					progress: 100 * frameTime / duration
				});
			}

			// Flush and finalize output
			await encoder.flush();
			await output.finalize();

			// Free resources
			encoder.close();

			// Download
			if (!fileStream) {
				downloadFile((output.target as BufferTarget).buffer, `${removeExtension(splats[0]?.name ?? 'supersplat')}.${fileExtension}`);
			}

			return true;
		} catch (error) {
			await events.invoke('showPopup', {
				type: 'error',
				header: localize('render.failed'),
				message: `'${error.message ?? error}'`
			});
		} finally {
			scene.camera.endOffscreenMode();
			scene.camera.renderOverlays = true;
			scene.gizmoLayer.enabled = true;
			scene.camera.entity.camera.clearColor.set(0, 0, 0, 0);
			scene.lockedRenderMode = false;
			scene.forceRender = true;       // camera likely moved, finish with normal render

			events.fire('progressEnd');
		}
	});

};

export { ImageSettings, VideoSettings, registerRenderEvents };
