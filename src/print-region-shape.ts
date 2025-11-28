/**
 * 打印区域预览元素
 * 用于可视化显示用户定义的打印区域范围（Bounding Box）
 */
import {
    BLENDEQUATION_ADD,
    BLENDMODE_ONE,
    BLENDMODE_ONE_MINUS_SRC_ALPHA,
    BLENDMODE_SRC_ALPHA,
    CULLFACE_FRONT,
    BlendState,
    BoundingBox,
    Color,
    Entity,
    ShaderMaterial,
    Vec3
} from 'playcanvas';

import { Element, ElementType } from './element';
import { Serializer } from './serializer';
import { vertexShader, fragmentShader } from './shaders/box-shape-shader';

const v = new Vec3();
const bound = new BoundingBox();

/**
 * 打印区域形状类
 * 显示打印区域的边界框预览
 */
class PrintRegionShape extends Element {
    /** X轴长度 */
    _lenX = 2;
    /** Y轴长度 */
    _lenY = 2;
    /** Z轴长度 */
    _lenZ = 2;
    /** 枢轴点实体 */
    pivot: Entity;
    /** 材质 */
    material: ShaderMaterial;
    /** 是否启用 */
    _enabled = false;

    constructor() {
        super(ElementType.debug);

        this.pivot = new Entity('printRegionPivot');
        this.pivot.addComponent('render', {
            type: 'box'
        });
    }

    /**
     * 添加到场景
     */
    add() {
        const material = new ShaderMaterial({
            uniqueName: 'printRegionShape',
            vertexGLSL: vertexShader,
            fragmentGLSL: fragmentShader
        });
        material.cull = CULLFACE_FRONT;
        material.blendState = new BlendState(
            true,
            BLENDEQUATION_ADD, BLENDMODE_SRC_ALPHA, BLENDMODE_ONE_MINUS_SRC_ALPHA,
            BLENDEQUATION_ADD, BLENDMODE_ONE, BLENDMODE_ONE_MINUS_SRC_ALPHA
        );
        material.update();

        this.pivot.render.meshInstances[0].material = material;
        this.pivot.render.layers = [this.scene.debugLayer.id];

        this.material = material;

        this.scene.contentRoot.addChild(this.pivot);

        this.updateBound();
    }

    /**
     * 从场景移除
     */
    remove() {
        this.scene.contentRoot.removeChild(this.pivot);
        this.scene.boundDirty = true;
    }

    destroy() {
        // 清理资源
    }

    serialize(serializer: Serializer): void {
        serializer.packa(this.pivot.getWorldTransform().data);
        serializer.pack(this.lenX);
        serializer.pack(this.lenY);
        serializer.pack(this.lenZ);
    }

    /**
     * 渲染前回调
     */
    onPreRender() {
        this.pivot.setLocalScale(this._lenX, this._lenY, this._lenZ);
        this.pivot.getWorldTransform().getTranslation(v);
        this.material.setParameter('boxCen', [v.x, v.y, v.z]);
        this.material.setParameter('boxLen', [this._lenX * 0.5, this._lenY * 0.5, this._lenZ * 0.5]);

        const device = this.scene.graphicsDevice;
        device.scope.resolve('targetSize').setValue([device.width, device.height]);

        // 根据启用状态设置可见性
        this.pivot.enabled = this._enabled;
    }

    /**
     * 移动后更新
     */
    moved() {
        this.updateBound();
    }

    /**
     * 更新包围盒
     */
    updateBound() {
        bound.center.copy(this.pivot.getPosition());
        bound.halfExtents.set(this._lenX * 0.5, this._lenY * 0.5, this._lenZ * 0.5);
        this.scene.boundDirty = true;
    }

    /**
     * 获取世界空间包围盒
     */
    get worldBound(): BoundingBox | null {
        return bound;
    }

    /**
     * 获取打印区域包围盒（世界空间）
     */
    get printRegionBound(): BoundingBox {
        const result = new BoundingBox();
        result.center.copy(this.pivot.getPosition());
        result.halfExtents.set(this._lenX * 0.5, this._lenY * 0.5, this._lenZ * 0.5);
        return result;
    }

    /**
     * 设置X轴长度
     */
    set lenX(lenX: number) {
        this._lenX = lenX;
        this.updateBound();
    }

    get lenX() {
        return this._lenX;
    }

    /**
     * 设置Y轴长度
     */
    set lenY(lenY: number) {
        this._lenY = lenY;
        this.updateBound();
    }

    get lenY() {
        return this._lenY;
    }

    /**
     * 设置Z轴长度
     */
    set lenZ(lenZ: number) {
        this._lenZ = lenZ;
        this.updateBound();
    }

    get lenZ() {
        return this._lenZ;
    }

    /**
     * 设置是否启用
     */
    set enabled(value: boolean) {
        this._enabled = value;
    }

    get enabled() {
        return this._enabled;
    }
}

export { PrintRegionShape };

