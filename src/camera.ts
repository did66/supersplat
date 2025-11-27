import {
    math,
    ADDRESS_CLAMP_TO_EDGE,
    FILTER_NEAREST,
    PIXELFORMAT_RGBA8,
    PIXELFORMAT_RGBA16F,
    PIXELFORMAT_DEPTH,
    PROJECTION_ORTHOGRAPHIC,
    PROJECTION_PERSPECTIVE,
    TONEMAP_NONE,
    TONEMAP_ACES,
    TONEMAP_ACES2,
    TONEMAP_FILMIC,
    TONEMAP_HEJL,
    TONEMAP_LINEAR,
    TONEMAP_NEUTRAL,
    BoundingBox,
    Entity,
    Mat4,
    Picker,
    Plane,
    Ray,
    RenderTarget,
    Texture,
    Vec3,
    Vec4,
    WebglGraphicsDevice
} from 'playcanvas';

/**
 * 相机模块
 * 管理场景的相机控制，包括轨道控制、拾取、渲染目标等
 */
import { PointerController } from './controllers';
import { Element, ElementType } from './element';
import { Serializer } from './serializer';
import { Splat } from './splat';
import { TweenValue } from './tween-value';

/**
 * 根据方位角和高程角计算前向向量
 * @param result 结果向量
 * @param azim 方位角（度）
 * @param elev 高程角（度）
 */
const calcForwardVec = (result: Vec3, azim: number, elev: number) => {
    const ex = elev * math.DEG_TO_RAD;
    const ey = azim * math.DEG_TO_RAD;
    const s1 = Math.sin(-ex);
    const c1 = Math.cos(-ex);
    const s2 = Math.sin(-ey);
    const c2 = Math.cos(-ey);
    result.set(-c1 * s2, s1, c1 * c2);
};

// 工作全局变量（避免频繁创建临时对象）
const forwardVec = new Vec3();
const cameraPosition = new Vec3();
const plane = new Plane();
const ray = new Ray();
const vec = new Vec3();
const vecb = new Vec3();
const va = new Vec3();
const m = new Mat4();
const v4 = new Vec4();

/**
 * 处理负数的模运算
 * @param n 被除数
 * @param m 除数
 * @returns 模运算结果
 */
const mod = (n: number, m: number) => ((n % m) + m) % m;

/**
 * 相机元素类
 * 提供轨道相机控制、拾取、渲染等功能
 */
class Camera extends Element {
    /** 指针控制器，处理鼠标/触摸输入 */
    controller: PointerController;
    /** 相机实体 */
    entity: Entity;
    /** 焦点位置补间值（平滑移动） */
    focalPointTween = new TweenValue({ x: 0, y: 0.5, z: 0 });
    /** 方位角和高程角补间值 */
    azimElevTween = new TweenValue({ azim: 30, elev: -15 });
    /** 距离补间值 */
    distanceTween = new TweenValue({ distance: 1 });

    /** 最小高程角限制 */
    minElev = -90;
    /** 最大高程角限制 */
    maxElev = 90;

    /** 场景半径，用于计算相机距离 */
    sceneRadius = 1;

    /** 飞行速度 */
    flySpeed = 5;

    /** 拾取器，用于屏幕坐标到3D对象的拾取 */
    picker: Picker;

    /** 工作渲染目标，用于拾取等操作 */
    workRenderTarget: RenderTarget;

    /** 覆盖的目标尺寸（用于离屏渲染） */
    targetSize: { width: number, height: number } = null;

    /** 是否抑制最终blit（用于离屏渲染） */
    suppressFinalBlit = false;

    /** 是否渲染覆盖层 */
    renderOverlays = true;

    /** 更新相机uniforms的函数 */
    updateCameraUniforms: () => void;

    /**
     * 构造函数
     * 创建相机实体并初始化
     */
    constructor() {
        super(ElementType.camera);
        // 创建相机实体
        this.entity = new Entity('Camera');
        this.entity.addComponent('camera');

        // 注意：此调用对于折射效果正常工作是必需的，但会减慢渲染速度
        // 应该只在需要时调用
        // this.entity.camera.requestSceneColorMap(true);
    }

    /**
     * 设置/获取正交投影模式
     */
    set ortho(value: boolean) {
        if (value !== this.ortho) {
            this.entity.camera.projection = value ? PROJECTION_ORTHOGRAPHIC : PROJECTION_PERSPECTIVE;
            this.scene.events.fire('camera.ortho', value);
        }
    }

    get ortho() {
        return this.entity.camera.projection === PROJECTION_ORTHOGRAPHIC;
    }

    /**
     * 设置/获取视野角度（FOV）
     */
    set fov(value: number) {
        this.entity.camera.fov = value;
    }

    get fov() {
        return this.entity.camera.fov;
    }

    /**
     * 设置/获取色调映射模式
     */
    set tonemapping(value: string) {
        const mapping: Record<string, number> = {
            none: TONEMAP_NONE,
            linear: TONEMAP_LINEAR,
            neutral: TONEMAP_NEUTRAL,
            aces: TONEMAP_ACES,
            aces2: TONEMAP_ACES2,
            filmic: TONEMAP_FILMIC,
            hejl: TONEMAP_HEJL
        };

        const tvalue = mapping[value];

        if (tvalue !== undefined && tvalue !== this.entity.camera.toneMapping) {
            this.entity.camera.toneMapping = tvalue;
            this.scene.events.fire('camera.tonemapping', value);
        }
    }

    get tonemapping() {
        switch (this.entity.camera.toneMapping) {
            case TONEMAP_NONE: return 'none';
            case TONEMAP_LINEAR: return 'linear';
            case TONEMAP_NEUTRAL: return 'neutral';
            case TONEMAP_ACES: return 'aces';
            case TONEMAP_ACES2: return 'aces2';
            case TONEMAP_FILMIC: return 'filmic';
            case TONEMAP_HEJL: return 'hejl';
        }
        return 'none';
    }

    /**
     * 设置/获取近裁剪平面距离
     */
    set near(value: number) {
        this.entity.camera.nearClip = value;
    }

    get near() {
        return this.entity.camera.nearClip;
    }

    /**
     * 设置/获取远裁剪平面距离
     */
    set far(value: number) {
        this.entity.camera.farClip = value;
    }

    get far() {
        return this.entity.camera.farClip;
    }

    /**
     * 获取焦点位置（目标值）
     */
    get focalPoint() {
        const t = this.focalPointTween.target;
        return new Vec3(t.x, t.y, t.z);
    }

    /**
     * 获取方位角和高程角（目标值）
     */
    get azimElev() {
        return this.azimElevTween.target;
    }

    /** 获取方位角 */
    get azim() {
        return this.azimElev.azim;
    }

    /** 获取高程角 */
    get elevation() {
        return this.azimElev.elev;
    }

    /** 获取相机距离（目标值） */
    get distance() {
        return this.distanceTween.target.distance;
    }

    /**
     * 设置焦点位置
     * @param point 目标焦点位置
     * @param dampingFactorFactor 阻尼因子倍数（1为正常速度）
     */
    setFocalPoint(point: Vec3, dampingFactorFactor: number = 1) {
        this.focalPointTween.goto(point, dampingFactorFactor * this.scene.config.controls.dampingFactor);
    }

    /**
     * 设置方位角和高程角
     * @param azim 方位角（度）
     * @param elev 高程角（度）
     * @param dampingFactorFactor 阻尼因子倍数
     */
    setAzimElev(azim: number, elev: number, dampingFactorFactor: number = 1) {
        // 限制范围
        azim = mod(azim, 360);
        elev = Math.max(this.minElev, Math.min(this.maxElev, elev));

        const t = this.azimElevTween;
        t.goto({ azim, elev }, dampingFactorFactor * this.scene.config.controls.dampingFactor);

        // 处理环绕（避免从359度到1度时的大幅旋转）
        if (t.source.azim - azim < -180) {
            t.source.azim += 360;
        } else if (t.source.azim - azim > 180) {
            t.source.azim -= 360;
        }

        // 旋转时返回到透视模式
        this.ortho = false;
    }

    /**
     * 设置相机距离
     * @param distance 目标距离
     * @param dampingFactorFactor 阻尼因子倍数
     */
    setDistance(distance: number, dampingFactorFactor: number = 1) {
        const controls = this.scene.config.controls;

        // 限制在最小和最大缩放范围内
        distance = Math.max(controls.minZoom, Math.min(controls.maxZoom, distance));

        const t = this.distanceTween;
        t.goto({ distance }, dampingFactorFactor * controls.dampingFactor);
    }

    /**
     * 设置相机姿态（位置和目标）
     * @param position 相机位置
     * @param target 目标位置（焦点）
     * @param dampingFactorFactor 阻尼因子倍数
     */
    setPose(position: Vec3, target: Vec3, dampingFactorFactor: number = 1) {
        vec.sub2(target, position);
        const l = vec.length();
        // 计算方位角和高程角
        const azim = Math.atan2(-vec.x / l, -vec.z / l) * math.RAD_TO_DEG;
        const elev = Math.asin(vec.y / l) * math.RAD_TO_DEG;
        this.setFocalPoint(target, dampingFactorFactor);
        this.setAzimElev(azim, elev, dampingFactorFactor);
        this.setDistance(l / this.sceneRadius * this.fovFactor, dampingFactorFactor);
    }

    /**
     * 将世界空间坐标转换为归一化屏幕坐标
     * @param world 世界空间坐标
     * @param screen 输出的屏幕坐标（归一化，0-1范围）
     */
    worldToScreen(world: Vec3, screen: Vec3) {
        const { camera } = this.entity.camera;
        m.mul2(camera.projectionMatrix, camera.viewMatrix);

        v4.set(world.x, world.y, world.z, 1);
        m.transformVec4(v4, v4);

        screen.x = v4.x / v4.w * 0.5 + 0.5;
        screen.y = 1.0 - (v4.y / v4.w * 0.5 + 0.5);
        screen.z = v4.z / v4.w;
    }

    /**
     * 添加到场景
     * 初始化相机控制器、渲染层、拾取器等
     */
    add() {
        // 将相机实体添加到相机根节点
        this.scene.cameraRoot.addChild(this.entity);
        // 添加相机需要渲染的层
        this.entity.camera.layers = this.entity.camera.layers.concat([
            this.scene.shadowLayer.id,
            this.scene.debugLayer.id,
            this.scene.gizmoLayer.id
        ]);

        // 如果配置了调试渲染，设置调试着色器通道
        if (this.scene.config.camera.debugRender) {
            this.entity.camera.setShaderPass(`debug_${this.scene.config.camera.debugRender}`);
        }

        const target = document.getElementById('canvas-container');

        // 创建指针控制器（处理鼠标/触摸输入）
        this.controller = new PointerController(this, target);

        // apply scene config
        const config = this.scene.config;
        const controls = config.controls;

        // configure background
        this.entity.camera.clearColor.set(0, 0, 0, 0);

        this.minElev = (controls.minPolarAngle * 180) / Math.PI - 90;
        this.maxElev = (controls.maxPolarAngle * 180) / Math.PI - 90;

        // tonemapping
        this.scene.camera.entity.camera.toneMapping = {
            linear: TONEMAP_LINEAR,
            filmic: TONEMAP_FILMIC,
            hejl: TONEMAP_HEJL,
            aces: TONEMAP_ACES,
            aces2: TONEMAP_ACES2,
            neutral: TONEMAP_NEUTRAL
        }[config.camera.toneMapping];

        // exposure
        this.scene.app.scene.exposure = config.camera.exposure;

        this.fov = config.camera.fov;

        // initial camera position and orientation
        this.setAzimElev(controls.initialAzim, controls.initialElev, 0);
        this.setDistance(controls.initialZoom, 0);

        // 创建拾取器（用于屏幕坐标到3D对象的拾取）
        const { width, height } = this.scene.targetSize;
        this.picker = new Picker(this.scene.app, width, height);

        // 覆盖缓冲区分配，使用我们的渲染目标
        this.picker.allocateRenderTarget = () => { };
        this.picker.releaseRenderTarget = () => { };

        // 监听场景包围盒变化事件
        this.scene.events.on('scene.boundChanged', this.onBoundChanged, this);

        // 准备相机特定的uniforms（用于着色器）
        this.updateCameraUniforms = () => {
            const device = this.scene.graphicsDevice;
            const entity = this.entity;
            const camera = entity.camera;

            const set = (name: string, vec: Vec3) => {
                device.scope.resolve(name).setValue([vec.x, vec.y, vec.z]);
            };

            // 获取世界空间中的视锥体角点
            const points = camera.camera.getFrustumCorners(-100);
            const worldTransform = entity.getWorldTransform();
            // 将视锥体角点转换到世界空间
            for (let i = 0; i < points.length; i++) {
                worldTransform.transformPoint(points[i], points[i]);
            }

            // 近平面
            if (camera.projection === PROJECTION_PERSPECTIVE) {
                // 透视投影：近平面是点
                set('near_origin', worldTransform.getTranslation());
                set('near_x', Vec3.ZERO);
                set('near_y', Vec3.ZERO);
            } else {
                // 正交投影：近平面是矩形
                set('near_origin', points[3]);
                set('near_x', va.sub2(points[0], points[3]));
                set('near_y', va.sub2(points[2], points[3]));
            }

            // 远平面（总是矩形）
            set('far_origin', points[7]);
            set('far_x', va.sub2(points[4], points[7]));
            set('far_y', va.sub2(points[6], points[7]));
        };

        // temp control of camera start
        const url = new URL(location.href);
        const focal = url.searchParams.get('focal');
        if (focal) {
            const parts = focal.toString().split(',');
            if (parts.length === 3) {
                this.setFocalPoint(new Vec3(parseFloat(parts[0]), parseFloat(parts[1]), parseFloat(parts[2])), 0);
            }
        }
        const angles = url.searchParams.get('angles');
        if (angles) {
            const parts = angles.toString().split(',');
            if (parts.length === 2) {
                this.setAzimElev(parseFloat(parts[0]), parseFloat(parts[1]), 0);
            }
        }
        const distance = url.searchParams.get('distance');
        if (distance) {
            this.setDistance(parseFloat(distance), 0);
        }
    }

    remove() {
        this.controller.destroy();
        this.controller = null;

        this.entity.camera.layers = this.entity.camera.layers.filter(layer => layer !== this.scene.shadowLayer.id);
        this.scene.cameraRoot.removeChild(this.entity);

        // destroy doesn't exist on picker?
        // this.picker.destroy();
        this.picker = null;

        this.scene.events.off('scene.boundChanged', this.onBoundChanged, this);
    }

    /**
     * 处理场景包围盒变化
     * 当场景包围盒改变时，相机必须配置为尽可能渲染整个范围
     * 同时更新现有相机距离以保持当前视图
     * @param bound 新的场景包围盒
     */
    onBoundChanged(bound: BoundingBox) {
        // 保存之前的距离（世界空间）
        const prevDistance = this.distanceTween.value.distance * this.sceneRadius;
        // 更新场景半径（包围盒半长）
        this.sceneRadius = Math.max(1e-03, bound.halfExtents.length());
        // 更新距离以保持相同的视图（立即更新，无补间）
        this.setDistance(prevDistance / this.sceneRadius, 0);
    }

    serialize(serializer: Serializer) {
        serializer.packa(this.entity.getWorldTransform().data);
        serializer.pack(
            this.fov,
            this.tonemapping,
            this.entity.camera.renderTarget?.width,
            this.entity.camera.renderTarget?.height
        );
    }

    /**
     * 重建渲染目标
     * 处理画布尺寸变化，重新创建渲染目标
     */
    rebuildRenderTargets() {
        const device = this.scene.graphicsDevice;
        const { width, height } = this.targetSize ?? this.scene.targetSize;
        const format = this.scene.events.invoke('camera.highPrecision') ? PIXELFORMAT_RGBA16F : PIXELFORMAT_RGBA8;

        const rt = this.entity.camera.renderTarget;
        if (rt && rt.width === width && rt.height === height && rt.colorBuffer.format === format) {
            return;
        }

        // out with the old
        if (rt) {
            rt.destroyTextureBuffers();
            rt.destroy();

            this.workRenderTarget.destroy();
            this.workRenderTarget = null;
        }

        const createTexture = (name: string, width: number, height: number, format: number) => {
            return new Texture(device, {
                name,
                width,
                height,
                format,
                mipmaps: false,
                minFilter: FILTER_NEAREST,
                magFilter: FILTER_NEAREST,
                addressU: ADDRESS_CLAMP_TO_EDGE,
                addressV: ADDRESS_CLAMP_TO_EDGE
            });
        };

        // in with the new
        const colorBuffer = createTexture('cameraColor', width, height, format);
        const depthBuffer = createTexture('cameraDepth', width, height, PIXELFORMAT_DEPTH);
        const renderTarget = new RenderTarget({
            colorBuffer,
            depthBuffer,
            flipY: false,
            autoResolve: false
        });
        this.entity.camera.renderTarget = renderTarget;
        this.entity.camera.horizontalFov = width > height;

        const workColorBuffer = createTexture('workColor', width, height, PIXELFORMAT_RGBA8);

        // create pick mode render target (reuse color buffer)
        this.workRenderTarget = new RenderTarget({
            colorBuffer: workColorBuffer,
            depth: false,
            autoResolve: false
        });

        // set picker render target
        this.picker.renderTarget = this.workRenderTarget;

        this.scene.events.fire('camera.resize', { width, height });
    }

    /**
     * 更新回调
     * 更新控制器、补间值，计算相机位置和方向
     * @param deltaTime 帧时间差（秒）
     */
    onUpdate(deltaTime: number) {
        // 更新控制器
        this.controller.update(deltaTime);

        // 更新底层补间值
        this.focalPointTween.update(deltaTime);
        this.azimElevTween.update(deltaTime);
        this.distanceTween.update(deltaTime);

        const azimElev = this.azimElevTween.value;
        const distance = this.distanceTween.value;

        // 计算前向向量
        calcForwardVec(forwardVec, azimElev.azim, azimElev.elev);
        // 计算相机位置（从焦点沿前向向量后退）
        cameraPosition.copy(forwardVec);
        cameraPosition.mulScalar(distance.distance * this.sceneRadius / this.fovFactor);
        cameraPosition.add(this.focalPointTween.value);

        // 设置相机位置和旋转
        this.entity.setLocalPosition(cameraPosition);
        this.entity.setLocalEulerAngles(azimElev.elev, azimElev.azim, 0);

        // 调整裁剪平面以适应场景
        this.fitClippingPlanes(this.entity.getLocalPosition(), this.entity.forward);

        // 更新正交高度（用于正交投影）
        const { camera } = this.entity;
        camera.orthoHeight = this.distanceTween.value.distance * this.sceneRadius / this.fovFactor * (this.fov / 90) * (camera.horizontalFov ? this.scene.targetSize.height / this.scene.targetSize.width : 1);
        // 更新视图投影矩阵
        camera.camera._updateViewProjMat();
    }

    /**
     * 调整裁剪平面以适应场景
     * 根据场景包围盒和相机位置计算合适的近远裁剪平面
     * @param cameraPosition 相机位置
     * @param forwardVec 相机前向向量
     */
    fitClippingPlanes(cameraPosition: Vec3, forwardVec: Vec3) {
        const bound = this.scene.bound;
        const boundRadius = bound.halfExtents.length();

        // 计算从相机到场景中心的向量
        vec.sub2(bound.center, cameraPosition);
        const dist = vec.dot(forwardVec);

        if (dist > 0) {
            // 场景在相机前方
            this.far = dist + boundRadius;
            // 如果相机位于包围球内，根据远平面计算近平面
            this.near = Math.max(1e-6, dist < boundRadius ? this.far / (1024 * 16) : dist - boundRadius);
        } else {
            // 场景在相机后方
            this.far = boundRadius * 2;
            this.near = this.far / (1024 * 16);
        }
    }

    onPreRender() {
        this.rebuildRenderTargets();
        this.updateCameraUniforms();
    }

    onPostRender() {
        const device = this.scene.graphicsDevice as WebglGraphicsDevice;
        const renderTarget = this.entity.camera.renderTarget;

        // resolve msaa buffer
        if (renderTarget.samples > 1) {
            renderTarget.resolve(true, false);
        }

        // copy render target
        if (!this.suppressFinalBlit) {
            device.copyRenderTarget(renderTarget, null, true, false);
        }
    }

    focus(options?: { focalPoint: Vec3, radius: number, speed: number }) {
        const getSplatFocalPoint = () => {
            for (const element of this.scene.elements) {
                if (element.type === ElementType.splat) {
                    const focalPoint = (element as Splat).focalPoint?.();
                    if (focalPoint) {
                        return focalPoint;
                    }
                }
            }
        };

        const focalPoint = options ? options.focalPoint : (getSplatFocalPoint() ?? this.scene.bound.center);
        const focalRadius = options ? options.radius : this.scene.bound.halfExtents.length();

        const fdist = focalRadius / this.sceneRadius;

        this.setDistance(isFinite(fdist) ? fdist : 1, options?.speed ?? 0);
        this.setFocalPoint(focalPoint, options?.speed ?? 0);
    }

    get fovFactor() {
        // we set the fov of the longer axis. here we get the fov of the other (smaller) axis so framing
        // doesn't cut off the scene.
        const { width, height } = this.scene.targetSize;
        const aspect = (width && height) ? this.entity.camera.horizontalFov ? height / width : width / height : 1;
        const fov = 2 * Math.atan(Math.tan(this.fov * math.DEG_TO_RAD * 0.5) * aspect);
        return Math.sin(fov * 0.5);
    }

    getRay(screenX: number, screenY: number, ray: Ray) {
        const { entity, ortho, scene } = this;
        const cameraPos = this.entity.getPosition();

        // create the pick ray in world space
        if (ortho) {
            entity.camera.screenToWorld(screenX, screenY, -1.0, vec);
            entity.camera.screenToWorld(screenX, screenY, 1.0, vecb);
            vecb.sub(vec).normalize();
            ray.set(vec, vecb);
        } else {
            entity.camera.screenToWorld(screenX, screenY, 1.0, vec);
            vec.sub(cameraPos).normalize();
            ray.set(cameraPos, vec);
        }
    }

    /**
     * 在给定屏幕坐标处与场景相交
     * 返回最接近相机的交点
     * @param screenX 屏幕X坐标
     * @param screenY 屏幕Y坐标
     * @returns 相交结果，包含splat、位置和距离，如果没有相交则返回null
     */
    intersect(screenX: number, screenY: number) {
        const { scene } = this;

        const target = scene.canvas;
        const sx = screenX / target.clientWidth * scene.targetSize.width;
        const sy = screenY / target.clientHeight * scene.targetSize.height;

        this.getRay(screenX, screenY, ray);

        const splats = scene.getElementsByType(ElementType.splat);

        let closestD = 0;
        const closestP = new Vec3();
        let closestSplat = null;

        for (let i = 0; i < splats.length; ++i) {
            const splat = splats[i] as Splat;

            this.pickPrep(splat, 'set');
            const pickId = this.pick(sx, sy);

            if (pickId !== -1) {
                splat.calcSplatWorldPosition(pickId, vec);

                // create a plane at the world position facing perpendicular to the camera
                plane.setFromPointNormal(vec, this.entity.forward);

                // find intersection
                if (plane.intersectsRay(ray, vec)) {
                    const distance = vecb.sub2(vec, ray.origin).length();
                    if (!closestSplat || distance < closestD) {
                        closestD = distance;
                        closestP.copy(vec);
                        closestSplat = splat;
                    }
                }
            }
        }

        if (!closestSplat) {
            return null;
        }

        return {
            splat: closestSplat,
            position: closestP,
            distance: closestD
        };
    }

    /**
     * 在屏幕位置与场景相交并将相机焦点设置到此位置
     * @param screenX 屏幕X坐标
     * @param screenY 屏幕Y坐标
     */
    pickFocalPoint(screenX: number, screenY: number) {
        const result = this.intersect(screenX, screenY);
        if (result) {
            const { scene } = this;

            this.setFocalPoint(result.position);
            this.setDistance(result.distance / this.sceneRadius * this.fovFactor);
            scene.events.fire('camera.focalPointPicked', {
                camera: this,
                splat: result.splat,
                position: result.position
            });
        }
    }

    /**
     * 拾取模式相关方法
     */

    /**
     * 准备拾取器渲染
     * 配置拾取器以渲染指定splat用于拾取
     * @param splat 要拾取的splat对象
     * @param op 拾取操作类型：'add'添加、'remove'移除、'set'设置
     */
    pickPrep(splat: Splat, op: 'add'|'remove'|'set') {
        const { width, height } = this.scene.targetSize;
        const worldLayer = this.scene.app.scene.layers.getLayerByName('World');

        const device = this.scene.graphicsDevice;
        const events = this.scene.events;
        const alpha = events.invoke('camera.mode') === 'rings' ? 0.0 : 0.2;

        // hide non-selected elements
        const splats = this.scene.getElementsByType(ElementType.splat);
        splats.forEach((s: Splat) => {
            s.entity.enabled = s === splat;
        });

        device.scope.resolve('pickerAlpha').setValue(alpha);
        device.scope.resolve('pickMode').setValue(['add', 'remove', 'set'].indexOf(op));
        this.picker.resize(width, height);
        this.picker.prepare(this.entity.camera, this.scene.app.scene, [worldLayer]);

        // re-enable all splats
        splats.forEach((splat: Splat) => {
            splat.entity.enabled = true;
        });
    }

    /**
     * 拾取单个像素
     * @param x 屏幕X坐标
     * @param y 屏幕Y坐标
     * @returns 拾取的splat ID，如果没有则返回-1
     */
    pick(x: number, y: number) {
        return this.pickRect(x, y, 1, 1)[0];
    }

    /**
     * 拾取矩形区域
     * @param x 屏幕X坐标
     * @param y 屏幕Y坐标
     * @param width 矩形宽度
     * @param height 矩形高度
     * @returns 拾取的splat ID数组
     */
    pickRect(x: number, y: number, width: number, height: number) {
        const device = this.scene.graphicsDevice as WebglGraphicsDevice;
        const pixels = new Uint8Array(width * height * 4);

        // read pixels
        device.setRenderTarget(this.picker.renderTarget);
        device.updateBegin();
        device.readPixels(x, this.picker.renderTarget.height - y - height, width, height, pixels);
        device.updateEnd();

        const result: number[] = [];
        for (let i = 0; i < width * height; i++) {
            result.push(
                pixels[i * 4] |
                (pixels[i * 4 + 1] << 8) |
                (pixels[i * 4 + 2] << 16) |
                (pixels[i * 4 + 3] << 24)
            );
        }

        return result;
    }

    docSerialize() {
        const pack3 = (v: Vec3) => [v.x, v.y, v.z];

        return {
            focalPoint: pack3(this.focalPointTween.target),
            azim: this.azim,
            elev: this.elevation,
            distance: this.distance,
            fov: this.fov,
            tonemapping: this.tonemapping
        };
    }

    docDeserialize(settings: any) {
        this.setFocalPoint(new Vec3(settings.focalPoint), 0);
        this.setAzimElev(settings.azim, settings.elev, 0);
        this.setDistance(settings.distance, 0);
        this.fov = settings.fov;
        this.tonemapping = settings.tonemapping;
    }

    /**
     * 离屏渲染模式
     * 用于导出图像/视频等功能
     */

    /**
     * 启动离屏渲染模式
     * @param width 目标宽度
     * @param height 目标高度
     */
    startOffscreenMode(width: number, height: number) {
        this.targetSize = { width, height };
        this.suppressFinalBlit = true;
    }

    /**
     * 结束离屏渲染模式
     */
    endOffscreenMode() {
        this.targetSize = null;
        this.suppressFinalBlit = false;
    }
}

export { Camera };
