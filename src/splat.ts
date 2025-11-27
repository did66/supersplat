import {
    ADDRESS_CLAMP_TO_EDGE,
    BLENDEQUATION_ADD,
    BLENDMODE_ONE,
    BLENDMODE_ONE_MINUS_SRC_ALPHA,
    FILTER_NEAREST,
    PIXELFORMAT_R8,
    PIXELFORMAT_R16U,
    Asset,
    BlendState,
    BoundingBox,
    Color,
    Entity,
    GSplatData,
    GSplatResource,
    Mat4,
    Quat,
    Texture,
    Vec3,
    MeshInstance
} from 'playcanvas';

import { Element, ElementType } from './element';
import { Serializer } from './serializer';
import { vertexShader, fragmentShader, gsplatCenter } from './shaders/splat-shader';
import { State } from './splat-state';
/**
 * Splat（高斯点云）模块
 * 管理3D高斯点云数据的加载、渲染、编辑和状态管理
 */
import { Transform } from './transform';
import { TransformPalette } from './transform-palette';

// 工作全局变量
const vec = new Vec3();
const veca = new Vec3();
const vecb = new Vec3();

/**
 * 包围盒点集合
 * 用于绘制包围盒线框，包含8个角点和对应的缩短点（用于绘制从角点延伸的线）
 */
const boundingPoints =
    [-1, 1].map((x) => {
        return [-1, 1].map((y) => {
            return [-1, 1].map((z) => {
                return [
                    new Vec3(x, y, z), new Vec3(x * 0.75, y, z),
                    new Vec3(x, y, z), new Vec3(x, y * 0.75, z),
                    new Vec3(x, y, z), new Vec3(x, y, z * 0.75)
                ];
            });
        });
    }).flat(3);

/**
 * Splat（高斯点云）元素类
 * 表示场景中的一个高斯点云对象，管理其数据、状态、渲染和变换
 */
class Splat extends Element {
    /** 资源资产 */
    asset: Asset;
    /** Splat数据 */
    splatData: GSplatData;
    /** Splat数量（不包括已删除的） */
    numSplats = 0;
    /** 已删除的Splat数量 */
    numDeleted = 0;
    /** 锁定的Splat数量 */
    numLocked = 0;
    /** 选中的Splat数量 */
    numSelected = 0;
    /** Splat实体 */
    entity: Entity;
    /** 变化计数器（用于检测是否需要重新渲染） */
    changedCounter = 0;
    /** 状态纹理（存储每个splat的状态：选中、删除、锁定） */
    stateTexture: Texture;
    /** 变换纹理（存储每个splat的变换矩阵索引） */
    transformTexture: Texture;
    /** 选中部分包围盒缓存 */
    selectionBoundStorage: BoundingBox;
    /** 局部空间包围盒缓存 */
    localBoundStorage: BoundingBox;
    /** 世界空间包围盒缓存 */
    worldBoundStorage: BoundingBox;
    /** 选中包围盒是否需要重新计算 */
    selectionBoundDirty = true;
    /** 局部包围盒是否需要重新计算 */
    localBoundDirty = true;
    /** 世界包围盒是否需要重新计算 */
    worldBoundDirty = true;
    /** 是否可见 */
    _visible = true;
    /** 变换调色板（存储变换矩阵） */
    transformPalette: TransformPalette;

    /** 选中时的透明度 */
    selectionAlpha = 1;

    /** 名称 */
    _name = '';
    /** 色调颜色 */
    _tintClr = new Color(1, 1, 1);
    /** 色温调整（-1到1） */
    _temperature = 0;
    /** 饱和度（0到1） */
    _saturation = 1;
    /** 亮度调整 */
    _brightness = 0;
    /** 黑点（用于对比度调整） */
    _blackPoint = 0;
    /** 白点（用于对比度调整） */
    _whitePoint = 1;
    /** 透明度（0到1） */
    _transparency = 1;

    /** 测量点数组 */
    measurePoints: Vec3[] = [];
    /** 当前选中的测量点索引 */
    measureSelection = -1;

    /** 重建材质的函数 */
    rebuildMaterial: (bands: number) => void;

    /**
     * 构造函数
     * @param asset Splat资源资产
     * @param orientation 初始旋转（欧拉角）
     */
    constructor(asset: Asset, orientation: Vec3) {
        super(ElementType.splat);

        const splatResource = asset.resource as GSplatResource;
        const splatData = splatResource.gsplatData;
        const { device } = splatResource;

        // 从文件名获取名称
        this._name = (asset.file as any).filename;
        this.asset = asset;
        this.splatData = splatData as GSplatData;
        this.numSplats = splatData.numSplats;

        // 创建Splat实体
        this.entity = new Entity('splatEntitiy');
        this.entity.setEulerAngles(orientation);
        // 添加gsplat组件
        this.entity.addComponent('gsplat', { asset });

        const instance = this.entity.gsplat.instance;

        // 为splat使用自定义渲染顺序距离计算
        // 使用包围盒的8个角点来计算最大距离，确保正确的渲染顺序
        instance.meshInstance.calculateSortDistance = (meshInstance: MeshInstance, pos: Vec3, dir: Vec3) => {
            const bound = this.localBound;
            const mat = this.entity.getWorldTransform();
            let maxDist;
            // 遍历包围盒的8个角点
            for (let i = 0; i < 8; ++i) {
                vec.x = bound.center.x + bound.halfExtents.x * (i & 1 ? 1 : -1);
                vec.y = bound.center.y + bound.halfExtents.y * (i & 2 ? 1 : -1);
                vec.z = bound.center.z + bound.halfExtents.z * (i & 4 ? 1 : -1);
                // 转换到世界空间
                mat.transformPoint(vec, vec);
                // 计算到相机的距离（沿相机方向）
                const dist = vec.sub(pos).dot(dir);
                if (i === 0 || dist > maxDist) {
                    maxDist = dist;
                }
            }
            return maxDist;
        };

        // 添加每个splat的状态通道
        // 位1：选中
        // 位2：删除
        // 位3：锁定
        if (!this.splatData.getProp('state')) {
            this.splatData.getElement('vertex').properties.push({
                type: 'uchar',
                name: 'state',
                storage: new Uint8Array(this.splatData.numSplats),
                byteSize: 1
            });
        }

        // 每个splat的变换矩阵索引（存储在变换调色板中）
        this.splatData.getElement('vertex').properties.push({
            type: 'ushort',
            name: 'transform',
            storage: new Uint16Array(this.splatData.numSplats),
            byteSize: 2
        });

        const { width, height } = splatResource.colorTexture;

        // pack spherical harmonic data
        const createTexture = (name: string, format: number) => {
            return new Texture(device, {
                name: name,
                width: width,
                height: height,
                format: format,
                mipmaps: false,
                minFilter: FILTER_NEAREST,
                magFilter: FILTER_NEAREST,
                addressU: ADDRESS_CLAMP_TO_EDGE,
                addressV: ADDRESS_CLAMP_TO_EDGE
            });
        };

        // create the state texture
        this.stateTexture = createTexture('splatState', PIXELFORMAT_R8);
        this.transformTexture = createTexture('splatTransform', PIXELFORMAT_R16U);

        // create the transform palette
        this.transformPalette = new TransformPalette(device);

        // Splat的混合模式（Alpha混合）
        const blendState = new BlendState(true, BLENDEQUATION_ADD, BLENDMODE_ONE, BLENDMODE_ONE_MINUS_SRC_ALPHA);

        /**
         * 重建材质
         * 更新着色器和材质参数
         * @param bands 球谐函数阶数
         */
        this.rebuildMaterial = (bands: number) => {
            const { material } = instance;
            // material.blendState = blendState;
            const { glsl } = material.shaderChunks;
            // 设置自定义着色器代码
            glsl.set('gsplatVS', vertexShader);
            glsl.set('gsplatPS', fragmentShader);
            glsl.set('gsplatCenterVS', gsplatCenter);

            // 设置球谐函数阶数
            material.setDefine('SH_BANDS', `${Math.min(bands, (instance.resource as GSplatResource).shBands)}`);
            // 设置状态和变换纹理
            material.setParameter('splatState', this.stateTexture);
            material.setParameter('splatTransform', this.transformTexture);
            material.update();
        };

        this.selectionBoundStorage = new BoundingBox();
        this.localBoundStorage = instance.resource.aabb;
        // @ts-ignore
        this.worldBoundStorage = instance.meshInstance._aabb;

        // @ts-ignore
        instance.meshInstance._updateAabb = false;

        // when sort changes, re-render the scene
        instance.sorter.on('updated', () => {
            this.changedCounter++;
        });
    }

    destroy() {
        super.destroy();
        this.entity.destroy();
        this.asset.registry.remove(this.asset);
        this.asset.unload();
    }

    /**
     * 更新状态
     * 将状态数据写入GPU纹理，更新统计信息
     * @param changedState 改变的状态标志（默认选中状态）
     */
    updateState(changedState = State.selected) {
        const state = this.splatData.getProp('state') as Uint8Array;

        // 将状态数据写入GPU纹理
        const data = this.stateTexture.lock();
        data.set(state);
        this.stateTexture.unlock();

        // 统计各种状态的splat数量
        let numSelected = 0;
        let numLocked = 0;
        let numDeleted = 0;

        for (let i = 0; i < state.length; ++i) {
            const s = state[i];
            if (s & State.deleted) {
                numDeleted++;
            } else if (s & State.locked) {
                numLocked++;
            } else if (s & State.selected) {
                numSelected++;
            }
        }

        // 更新统计信息
        this.numSplats = state.length - numDeleted;
        this.numLocked = numLocked;
        this.numSelected = numSelected;
        this.numDeleted = numDeleted;

        // 标记选中包围盒需要重新计算
        this.makeSelectionBoundDirty();

        // 处理splat被添加或移除的情况
        if (changedState & State.deleted) {
            this.updateSorting();
        }

        // 强制渲染并触发状态变化事件
        this.scene.forceRender = true;
        this.scene.events.fire('splat.stateChanged', this);
    }

    /**
     * 更新位置
     * 重新计算splat位置并更新排序器
     */
    updatePositions() {
        // 计算新的位置数据
        const data = this.scene.dataProcessor.calcPositions(this);

        // 更新用于渲染时排序的splat中心点
        const state = this.splatData.getProp('state') as Uint8Array;
        const { sorter } = this.entity.gsplat.instance;
        const { centers } = sorter;
        // 只更新选中splat的中心点
        for (let i = 0; i < this.splatData.numSplats; ++i) {
            if (state[i] === State.selected) {
                centers[i * 3 + 0] = data[i * 4];
                centers[i * 3 + 1] = data[i * 4 + 1];
                centers[i * 3 + 2] = data[i * 4 + 2];
            }
        }

        this.updateSorting();

        // 强制渲染并触发位置变化事件
        this.scene.forceRender = true;
        this.scene.events.fire('splat.positionsChanged', this);
    }

    /**
     * 更新排序
     * 创建映射以移除已删除的splat
     */
    updateSorting() {
        const state = this.splatData.getProp('state') as Uint8Array;

        // 标记局部包围盒需要重新计算
        this.makeLocalBoundDirty();

        let mapping;

        // 创建排序器映射以移除已删除的splat
        if (this.numSplats !== state.length) {
            mapping = new Uint32Array(this.numSplats);
            let idx = 0;
            // 只包含未删除的splat
            for (let i = 0; i < state.length; ++i) {
                if ((state[i] & State.deleted) === 0) {
                    mapping[idx++] = i;
                }
            }
        }

        // 更新排序器实例
        this.entity.gsplat.instance.sorter.setMapping(mapping);
    }

    get worldTransform() {
        return this.entity.getWorldTransform();
    }

    set name(newName: string) {
        if (newName !== this.name) {
            this._name = newName;
            this.scene.events.fire('splat.name', this);
        }
    }

    get name() {
        return this._name;
    }

    get filename() {
        return (this.asset.file as any).filename;
    }

    calcSplatWorldPosition(splatId: number, result: Vec3) {
        if (splatId >= this.splatData.numSplats) {
            return false;
        }

        // use centers data, which are updated when edits occur
        const { sorter } = this.entity.gsplat.instance;
        const { centers } = sorter;

        result.set(
            centers[splatId * 3 + 0],
            centers[splatId * 3 + 1],
            centers[splatId * 3 + 2]
        );

        this.worldTransform.transformPoint(result, result);

        return true;
    }

    add() {
        // add the entity to the scene
        this.scene.contentRoot.addChild(this.entity);

        this.scene.events.on('view.bands', this.rebuildMaterial, this);
        this.rebuildMaterial(this.scene.events.invoke('view.bands'));

        // we must update state in case the state data was loaded from ply
        this.updateState();
    }

    remove() {
        this.scene.events.off('view.bands', this.rebuildMaterial, this);

        this.scene.contentRoot.removeChild(this.entity);
        this.scene.boundDirty = true;
    }

    serialize(serializer: Serializer) {
        serializer.packa(this.entity.getWorldTransform().data);
        serializer.pack(this.changedCounter);
        serializer.pack(this.visible);
        serializer.pack(this.tintClr.r, this.tintClr.g, this.tintClr.b);
        serializer.pack(this.temperature, this.saturation, this.brightness, this.blackPoint, this.whitePoint, this.transparency);
    }

    onPreRender() {
        const events = this.scene.events;
        const selected = this.scene.camera.renderOverlays && events.invoke('selection') === this;
        const cameraMode = events.invoke('camera.mode');
        const cameraOverlay = events.invoke('camera.overlay');

        // configure rings rendering
        const material = this.entity.gsplat.instance.material;
        material.setParameter('mode', cameraMode === 'rings' ? 1 : 0);
        material.setParameter('ringSize', (selected && cameraOverlay && cameraMode === 'rings') ? 0.04 : 0);

        const selectionAlpha = selected && !events.invoke('view.outlineSelection') ? this.selectionAlpha : 0;

        // configure colors
        const selectedClr = events.invoke('selectedClr');
        const unselectedClr = events.invoke('unselectedClr');
        const lockedClr = events.invoke('lockedClr');
        material.setParameter('selectedClr', [selectedClr.r, selectedClr.g, selectedClr.b, selectedClr.a * selectionAlpha]);
        material.setParameter('unselectedClr', [unselectedClr.r, unselectedClr.g, unselectedClr.b, unselectedClr.a]);
        material.setParameter('lockedClr', [lockedClr.r, lockedClr.g, lockedClr.b, lockedClr.a]);

        // combine black pointer, white point and brightness
        const offset = -this.blackPoint + this.brightness;
        const scale = 1 / (this.whitePoint - this.blackPoint);

        material.setParameter('clrOffset', [offset, offset, offset]);
        material.setParameter('clrScale', [
            scale * this.tintClr.r * (1 + this.temperature),
            scale * this.tintClr.g,
            scale * this.tintClr.b * (1 - this.temperature),
            this.transparency
        ]);

        material.setParameter('saturation', this.saturation);
        material.setParameter('transformPalette', this.transformPalette.texture);

        if (this.visible && selected) {
            // render bounding box
            if (events.invoke('camera.bound')) {
                const bound = this.localBound;
                const scale = new Mat4().setTRS(bound.center, Quat.IDENTITY, bound.halfExtents);
                scale.mul2(this.entity.getWorldTransform(), scale);

                for (let i = 0; i < boundingPoints.length / 2; i++) {
                    const a = boundingPoints[i * 2];
                    const b = boundingPoints[i * 2 + 1];
                    scale.transformPoint(a, veca);
                    scale.transformPoint(b, vecb);

                    this.scene.app.drawLine(veca, vecb, Color.WHITE, true, this.scene.debugLayer);
                }
            }
        }

        this.entity.enabled = this.visible;
    }

    focalPoint() {
        // GSplatData has a function for calculating an weighted average of the splat positions
        // to get a focal point for the camera, but we use bound center instead
        return this.worldBound.center;
    }

    move(position?: Vec3, rotation?: Quat, scale?: Vec3) {
        const entity = this.entity;
        if (position) {
            entity.setLocalPosition(position);
        }
        if (rotation) {
            entity.setLocalRotation(rotation);
        }
        if (scale) {
            entity.setLocalScale(scale);
        }

        this.makeWorldBoundDirty();

        this.scene.events.fire('splat.moved', this);
    }

    makeSelectionBoundDirty() {
        this.selectionBoundDirty = true;
        this.makeLocalBoundDirty();
    }

    makeLocalBoundDirty() {
        this.localBoundDirty = true;
        this.makeWorldBoundDirty();
    }

    makeWorldBoundDirty() {
        this.worldBoundDirty = true;
        this.scene.boundDirty = true;
    }

    /**
     * 获取选中部分的包围盒
     * 只包含选中splat的包围盒
     */
    get selectionBound() {
        const selectionBound = this.selectionBoundStorage;
        if (this.selectionBoundDirty) {
            // 计算选中部分的包围盒
            this.scene.dataProcessor.calcBound(this, selectionBound, true);
            this.selectionBoundDirty = false;
        }
        return selectionBound;
    }

    /**
     * 获取局部空间包围盒
     * 包含所有未删除splat的包围盒（局部空间）
     */
    get localBound() {
        const localBound = this.localBoundStorage;
        if (this.localBoundDirty) {
            // 计算局部空间包围盒
            this.scene.dataProcessor.calcBound(this, localBound, false);
            this.localBoundDirty = false;
            // 转换中心点到世界空间（用于调试）
            this.entity.getWorldTransform().transformPoint(localBound.center, vec);
        }
        return localBound;
    }

    /**
     * 获取世界空间包围盒
     * 将局部空间包围盒转换到世界空间
     */
    get worldBound() {
        const worldBound = this.worldBoundStorage;
        if (this.worldBoundDirty) {
            // 计算网格实例的AABB（变换后的局部包围盒）
            worldBound.setFromTransformedAabb(this.localBound, this.entity.getWorldTransform());

            // 标记场景包围盒需要重新计算
            this.worldBoundDirty = false;
        }
        return worldBound;
    }

    set visible(value: boolean) {
        if (value !== this.visible) {
            this._visible = value;
            this.scene.events.fire('splat.visibility', this);
        }
    }

    get visible() {
        return this._visible;
    }

    set tintClr(value: Color) {
        if (!this._tintClr.equals(value)) {
            this._tintClr.set(value.r, value.g, value.b);
            this.scene.events.fire('splat.tintClr', this);
        }
    }

    get tintClr() {
        return this._tintClr;
    }

    set temperature(value: number) {
        if (value !== this._temperature) {
            this._temperature = value;
            this.scene.events.fire('splat.temperature', this);
        }
    }

    get temperature() {
        return this._temperature;
    }

    set saturation(value: number) {
        if (value !== this._saturation) {
            this._saturation = value;
            this.scene.events.fire('splat.saturation', this);
        }
    }

    get saturation() {
        return this._saturation;
    }

    set brightness(value: number) {
        if (value !== this._brightness) {
            this._brightness = value;
            this.scene.events.fire('splat.brightness', this);
        }
    }

    get brightness() {
        return this._brightness;
    }

    set blackPoint(value: number) {
        if (value !== this._blackPoint) {
            this._blackPoint = value;
            this.scene.events.fire('splat.blackPoint', this);
        }
    }

    get blackPoint() {
        return this._blackPoint;
    }

    set whitePoint(value: number) {
        if (value !== this._whitePoint) {
            this._whitePoint = value;
            this.scene.events.fire('splat.whitePoint', this);
        }
    }

    get whitePoint() {
        return this._whitePoint;
    }

    set transparency(value: number) {
        if (value !== this._transparency) {
            this._transparency = value;
            this.scene.events.fire('splat.transparency', this);
        }
    }

    get transparency() {
        return this._transparency;
    }

    /**
     * 获取枢轴点（变换中心）
     * @param mode 模式：'center'使用实体中心，'boundCenter'使用包围盒中心
     * @param selection 是否使用选中部分的包围盒
     * @param result 输出的变换对象
     */
    getPivot(mode: 'center' | 'boundCenter', selection: boolean, result: Transform) {
        const { entity } = this;
        switch (mode) {
            case 'center':
                // 使用实体中心
                result.set(entity.getLocalPosition(), entity.getLocalRotation(), entity.getLocalScale());
                break;
            case 'boundCenter':
                // 使用包围盒中心
                entity.getLocalTransform().transformPoint((selection ? this.selectionBound : this.localBound).center, vec);
                result.set(vec, entity.getLocalRotation(), entity.getLocalScale());
                break;
        }
    }

    docSerialize() {
        const pack3 = (v: Vec3) => [v.x, v.y, v.z];
        const pack4 = (q: Quat) => [q.x, q.y, q.z, q.w];
        const packC = (c: Color) => [c.r, c.g, c.b, c.a];
        return {
            name: this.name,
            position: pack3(this.entity.getLocalPosition()),
            rotation: pack4(this.entity.getLocalRotation()),
            scale: pack3(this.entity.getLocalScale()),
            visible: this.visible,
            tintClr: packC(this.tintClr),
            temperature: this.temperature,
            saturation: this.saturation,
            brightness: this.brightness,
            blackPoint: this.blackPoint,
            whitePoint: this.whitePoint,
            transparency: this.transparency
        };
    }

    docDeserialize(doc: any) {
        const { name, position, rotation, scale, visible, tintClr, temperature, saturation, brightness, blackPoint, whitePoint, transparency } = doc;

        this.name = name;
        this.move(new Vec3(position), new Quat(rotation), new Vec3(scale));
        this.visible = visible;
        this.tintClr = new Color(tintClr[0], tintClr[1], tintClr[2], tintClr[3]);
        this.temperature = temperature ?? 0;
        this.saturation = saturation ?? 1;
        this.brightness = brightness;
        this.blackPoint = blackPoint;
        this.whitePoint = whitePoint;
        this.transparency = transparency;
    }
}

export { Splat };
