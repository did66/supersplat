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

			const orig = {
				focalPoint: scene.camera.focalPoint.clone(),
				azim: scene.camera.azim,
				elev: scene.camera.elevation,
				distance: scene.camera.distance
			};

			scene.lockedRenderMode = true;

			const views = [
				{ name: 'front', azim: 0, elev: 0 },
				{ name: 'back', azim: 180, elev: 0 },
				{ name: 'left', azim: 90, elev: 0 },
				{ name: 'right', azim: 270, elev: 0 }
			];

			if (!compressor) compressor = new PngCompressor();

			// 统一设置相机距离和焦点（只一次）
			// 在进入离屏模式之前设置，避免触发主视图更新
			const fdist = (focalRadius / scene.camera.sceneRadius) * 1;
			const targetDistance = isFinite(fdist) ? fdist : 1;
			scene.camera.setDistance(targetDistance, 0);
			scene.camera.setFocalPoint(focalPoint, 0);
			scene.camera.onUpdate(0);
			scene.camera.onUpdate(0);
			// 清除forceRender，防止触发主视图渲染
			scene.forceRender = false;

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

			// ---- 主循环：对每个视角严格顺序处理 ----
			for (const view of views) {
				// 先恢复原始相机状态，确保场景状态检测系统看到的是原始状态
				scene.camera.setFocalPoint(orig.focalPoint, 0);
				scene.camera.setAzimElev(orig.azim, orig.elev, 0);
				scene.camera.setDistance(orig.distance, 0);
				scene.camera.onUpdate(0);
				scene.forceRender = false;

				// 先开启 offscreen（让渲染目标/分辨率对后续排序/LOD 一致）
				// 必须在改变相机角度之前进入离屏模式，确保主视图不受影响
				scene.camera.startOffscreenMode(width, height);
				scene.camera.renderOverlays = showDebug;

				// 设置背景色（在 offscreen 后设置）
				if (!transparentBg) {
					scene.camera.entity.camera.clearColor.copy(bgClr);
				} else {
					// 透明模式下确保 alpha 为 0
					scene.camera.entity.camera.clearColor.set(0, 0, 0, 0);
				}

				// 设置统一的距离和焦点（用于四视图）
				scene.camera.setDistance(targetDistance, 0);
				scene.camera.setFocalPoint(focalPoint, 0);
				scene.camera.onUpdate(0);

				// 只改变角度（不改 distance / focalPoint）
				// 在离屏模式和锁定模式下改变角度，suppressFinalBlit确保不会blit到主画布
				// 注意：必须在进入离屏模式后再改变角度，这样主视图不会受影响
				scene.camera.setAzimElev(view.azim, view.elev, 0);
				scene.camera.onUpdate(0);
				// 立即清除forceRender标志，防止触发主视图渲染
				scene.forceRender = false;

				// 尽可能确保每个 splat 明确触发排序并等待 sorter.updated
				await waitAllSorters(1000);

				// 再等几帧让渲染稳定（补偿任何后续帧内的调整）
				// 在等待过程中，确保lockedRender标志已设置，这样只会渲染到离屏缓冲区
				await waitStableFrames(5);

				// 确保 lockedRender 标记，进行一次最终渲染
				// 在锁定模式下，只有设置lockedRender=true才会渲染，且只渲染到离屏缓冲区
				scene.lockedRender = true;
				await postRender();

				// 读取渲染数据
				const data = new Uint8Array(width * height * 4);
				const { renderTarget } = scene.camera.entity.camera;
				const { workRenderTarget } = scene.camera;

				// 复制并读取当前 workRenderTarget（保证 offscreen 的 RT 被读到）
				scene.dataProcessor.copyRt(renderTarget, workRenderTarget);
				await workRenderTarget.colorBuffer.read(0, 0, width, height, { renderTarget: workRenderTarget, data });

				// 应用背景色（非透明）
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

				// 压缩并保存
				const arrayBuffer = await compressor.compress(
					new Uint32Array(data.buffer),
					width,
					height
				);
				downloadFile(arrayBuffer, `${modelName}-${view.name}.png`);

				// 结束 offscreen（为下一个视角清理）
				scene.camera.endOffscreenMode();

				// 立即恢复原始相机状态，确保场景状态检测系统看到的是原始状态
				scene.camera.setFocalPoint(orig.focalPoint, 0);
				scene.camera.setAzimElev(orig.azim, orig.elev, 0);
				scene.camera.setDistance(orig.distance, 0);
				scene.camera.onUpdate(0);
				scene.forceRender = false;

				// 保证一帧渲染后再继续（减少 race）
				await waitStableFrames(1);
			}

			// 恢复相机原始状态
			scene.camera.setAzimElev(orig.azim, orig.elev, 0);
			scene.camera.setFocalPoint(orig.focalPoint, 0);
			scene.camera.setDistance(orig.distance, 0);
			scene.camera.onUpdate(0);

			scene.lockedRenderMode = false;
			scene.forceRender = true;

			return true;

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


	events.function('render.video', async (videoSettings: VideoSettings, fileStream: FileSystemWritableFileStream) => {
		events.fire('progressStart', localize('render.render-video'));

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
					text: localize('render.rendering'),
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
			scene.camera.entity.camera.clearColor.set(0, 0, 0, 0);
			scene.lockedRenderMode = false;
			scene.forceRender = true;       // camera likely moved, finish with normal render

			events.fire('progressEnd');
		}
	});
};

export { ImageSettings, VideoSettings, registerRenderEvents };
