import { ScaleGizmo } from 'playcanvas';

import { TransformTool } from './transform-tool';
import { Events } from '../events';
import { Scene } from '../scene';

class ScaleTool extends TransformTool {
	constructor(events: Events, scene: Scene) {
		const gizmo = new ScaleGizmo(scene.camera.entity.camera, scene.gizmoLayer);

		// enable single-axis scaling (x, y, z) like translate tool
		// disable dual-axis scaling (xy, xz, yz) to prevent deformation
		['yz', 'xz', 'xy'].forEach((axis) => {
			gizmo.enableShape(axis as 'yz' | 'xz' | 'xy', false);
		});

		// disable uniform scale (center handle) - only allow single-axis scaling
		// try different possible shape names for uniform scale
		const uniformScaleNames = ['uniform', 'center', 'xyz'];
		uniformScaleNames.forEach((name) => {
			try {
				(gizmo as any).enableShape(name, false);
			} catch (e) {
				// If shape doesn't exist, ignore
			}
		});

		// set lower bound on scale
		gizmo.lowerBoundScale.set(1e-6, 1e-6, 1e-6);

		super(gizmo, events, scene);
	}
}

export { ScaleTool };
