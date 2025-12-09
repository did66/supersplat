import { BufferTarget, EncodedPacket, EncodedVideoPacketSource, MkvOutputFormat, MovOutputFormat, Mp4OutputFormat, Output, StreamTarget, WebMOutputFormat } from 'mediabunny';
import { path, Vec3 } from 'playcanvas';

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
			const bgClr = events.invoke('bgClr');

			const splats = (scene.getElementsByType(ElementType.splat) as Splat[]).filter(s => s.visible);
			if (splats.length === 0) throw new Error('No visible splats to render');

			const selected = events.invoke('selection') as Splat;
			const modelName = removeExtension(selected?.name ?? 'SuperSplat');

			const bound = scene.bound;
			const focalPoint = bound.center.clone();
			const focalRadius = bound.halfExtents.length();

			// 保存原始相机状态（用于恢复）
			const orig = {
				focalPoint: scene.camera.focalPoint.clone(),
				azim: scene.camera.azim,
				elev: scene.camera.elevation,
				distance: scene.camera.distance
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

			// 恢复原始相机状态的辅助函数
			function restoreOriginalCamera() {
				scene.camera.setFocalPoint(orig.focalPoint, 0);
				scene.camera.setAzimElev(orig.azim, orig.elev, 0);
				scene.camera.setDistance(orig.distance, 0);
				scene.camera.onUpdate(0);
				scene.forceRender = false;
			}

			// 存储四视图图片数据
			const fourViewsImages: Array<{ name: string, position: string, data: ArrayBuffer }> = [];

			// ---- 主循环：对每个视角严格顺序处理 ----
			for (const view of views) {
				// 1. 先恢复原始相机状态（确保场景状态检测系统看到的是原始状态）
				restoreOriginalCamera();

				// 2. 进入离屏渲染模式（suppressFinalBlit会阻止blit到主画布）
				scene.camera.startOffscreenMode(width, height);
				scene.camera.renderOverlays = showDebug;

				// 3. 设置背景色
				if (!transparentBg) {
					scene.camera.entity.camera.clearColor.copy(bgClr);
				} else {
					scene.camera.entity.camera.clearColor.set(0, 0, 0, 0);
				}

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

				// 9. 应用背景色（非透明）
				if (!transparentBg) {
					const pixels = new Uint8ClampedArray(data.buffer);
					const { r, g, b } = bgClr;
					for (let j = 0; j < pixels.length; j += 4) {
						const a = 255 - pixels[j + 3];
						pixels[j + 0] += r * a;
						pixels[j + 1] += g * a;
						pixels[j + 2] += b * a;
						pixels[j + 3] = 255;
					}
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
				downloadFile(arrayBuffer, `${modelName}-${view.name}.png`);

				// 11. 结束离屏模式
				scene.camera.endOffscreenMode();

				// 12. 立即恢复原始相机状态（关键：在场景状态检测之前恢复）
				restoreOriginalCamera();

				// 13. 等待一帧，让场景状态检测系统看到恢复后的状态
				await waitStableFrames(1);
			}

			// 最终恢复原始相机状态
			restoreOriginalCamera();

			// 退出锁定渲染模式
			scene.lockedRenderMode = false;
			// 触发一次渲染，确保主视图显示正确的状态
			scene.forceRender = true;

			// 返回四视图图片数据
			return fourViewsImages;

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
			const splats = (scene.getElementsByType(ElementType.splat) as Splat[]).filter(s => s.visible);
			if (splats.length === 0) {
				throw new Error('No visible splats to upload');
			}

			// 导入序列化相关模块
			const { BufferWriter } = await import('./serialize/writer');
			const { serializePly } = await import('./splat-serialize');

			// 序列化模型数据到内存
			const modelBuffer = new BufferWriter();
			const serializeSettings = {
				keepStateData: false,
				keepWorldTransform: true,
				keepColorTint: true
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

			// 3. 生成四视图
			const defaultImageSettings = {
				width: 500,
				height: 500,
				transparentBg: true,
				showDebug: false
			};
			const fourViewsImages = await events.invoke('render.fourViews', defaultImageSettings) as Array<{ name: string, position: string, data: ArrayBuffer }>;

			if (!fourViewsImages || fourViewsImages.length !== 4) {
				throw new Error('Failed to generate four views');
			}

			return {
				modelName,
				modelData: modelData.buffer, // ArrayBuffer
				fourViews: fourViewsImages.map(view => ({
					name: view.name,
					data: view.data, // ArrayBuffer
					position: view.position
				}))
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

	// 通过 postMessage 发送模型数据和四视图到父组件
	events.function('send.modelAndViewsToParent', async () => {
		events.fire('startSpinner');

		try {
			// 检查是否在 iframe 中
			// if (window.parent === window) {
			// 	throw new Error('Not in an iframe. Cannot send message to parent.');
			// }

			// 准备数据
			const data = await events.invoke('prepare.modelAndViews') as {
				modelName: string;
				modelData: ArrayBuffer;
				fourViews: Array<{ name: string, position: string, data: ArrayBuffer }>;
			};

			// 获取模型的包围盒，计算高、深、宽比例
			const bound = scene.bound;
			const halfExtents = bound.halfExtents;
			const width = halfExtents.x * 2;
			const height = halfExtents.y * 2;
			const depth = halfExtents.z * 2;

			// 计算比例（高度为1）
			const dimensions = {
				width: width,
				height: height,
				depth: depth,
				// 比例（高度为1）
				ratio: {
					width: height > 0 ? width / height : 0,
					height: 1,
					depth: height > 0 ? depth / height : 0
				}
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

			// 验证所有数据都是 ArrayBuffer
			if (!(modelDataBuffer instanceof ArrayBuffer)) {
				throw new Error('Model data is not an ArrayBuffer');
			}
			for (let i = 0; i < viewBuffers.length; i++) {
				if (!(viewBuffers[i] instanceof ArrayBuffer)) {
					throw new Error(`View data at index ${i} is not an ArrayBuffer`);
				}
			}

			// 使用 Transferable Objects 优化大文件传输（零拷贝）
			// 注意：使用 transferable 后，原始 ArrayBuffer 会被转移，不能再使用
			const transferables: Transferable[] = [modelDataBuffer, ...viewBuffers];

			// 构建消息数据，包含文件信息以便父组件创建 File 对象
			const message = {
				type: 'supersplat:modelAndViews',
				modelName: data.modelName,
				dimensions: dimensions,
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
				}))
			};

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
