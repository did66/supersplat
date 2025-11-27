/**
 * 场景元素基类模块
 * 定义了场景中所有元素的基础接口和类型
 */
import { BoundingBox, Quat, Vec3 } from 'playcanvas';

import { Scene } from './scene';
import { Serializer } from './serializer';

/**
 * 元素类型枚举
 * 定义场景中可以存在的各种元素类型
 */
enum ElementType {
    /** 相机元素 */
    camera = 'camera',
    /** 模型元素 */
    model = 'model',
    /** 高斯点云（Splat）元素 */
    splat = 'splat',
    /** 阴影元素 */
    shadow = 'shadow',
    /** 调试元素 */
    debug = 'debug',
    /** 其他类型元素 */
    other = 'other'
}

/**
 * 元素类型列表
 * 包含所有元素类型的数组，用于遍历和检查
 */
const ElementTypeList = [
    ElementType.camera,
    ElementType.model,
    ElementType.splat,
    ElementType.shadow,
    ElementType.debug,
    ElementType.other
];

/** 下一个唯一ID计数器 */
let nextUid = 1;

/**
 * 场景元素基类
 * 所有场景元素的基础类，提供生命周期方法和基础属性
 */
class Element {
    /** 元素类型 */
    type: ElementType;
    /** 所属场景，如果为null则表示元素未添加到场景 */
    scene: Scene = null;
    /** 唯一标识符 */
    uid: number;

    /**
     * 构造函数
     * @param type 元素类型
     */
    constructor(type: ElementType) {
        this.type = type;
        this.uid = nextUid++;
    }

    /**
     * 销毁元素
     * 如果元素已添加到场景，则从场景中移除
     */
    destroy() {
        if (this.scene) {
            this.scene.remove(this);
        }
    }

    /**
     * 添加到场景时的回调
     * 子类应重写此方法以执行初始化操作
     */
    add() {}

    /**
     * 从场景移除时的回调
     * 子类应重写此方法以执行清理操作
     */
    remove() {}

    /**
     * 序列化元素状态
     * @param serializer 序列化器
     */
    serialize(serializer: Serializer) {}

    /**
     * 更新回调
     * @param deltaTime 帧时间差（秒）
     */
    onUpdate(deltaTime: number) {}

    /**
     * 更新后回调
     * 在所有元素的onUpdate之后调用
     */
    onPostUpdate() {}

    /**
     * 渲染前回调
     * 在渲染每一帧之前调用
     */
    onPreRender() {}

    /**
     * 渲染后回调
     * 在渲染每一帧之后调用
     */
    onPostRender() {}

    /**
     * 当其他元素被添加到场景时的回调
     * @param element 被添加的元素
     */
    onAdded(element: Element) {}

    /**
     * 当其他元素从场景移除时的回调
     * @param element 被移除的元素
     */
    onRemoved(element: Element) {}

    /**
     * 移动元素（位置、旋转、缩放）
     * @param position 新位置（可选）
     * @param rotation 新旋转（可选）
     * @param scale 新缩放（可选）
     */
    move(position?: Vec3, rotation?: Quat, scale?: Vec3) {}

    /**
     * 获取世界空间包围盒
     * @returns 世界空间包围盒，如果元素没有包围盒则返回null
     */
    get worldBound(): BoundingBox | null {
        return null;
    }
}

export { ElementType, ElementTypeList, Element };
