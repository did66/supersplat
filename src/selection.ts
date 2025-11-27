/**
 * 选择管理模块
 * 管理场景中Splat对象的选择状态和选择事件
 */
import { Element, ElementType } from './element';
import { Events } from './events';
import { Scene } from './scene';
import { Splat } from './splat';

/**
 * 注册选择相关事件
 * 设置选择管理的事件监听器，处理Splat对象的选择、切换等操作
 * @param {Events} events - 事件系统
 * @param {Scene} scene - 场景对象
 */
const registerSelectionEvents = (events: Events, scene: Scene) => {
    /** 当前选中的Splat对象 */
    let selection: Splat = null;

    /**
     * 设置选中的Splat对象
     * @param {Splat} splat - 要选中的Splat对象，如果为null则取消选择
     */
    const setSelection = (splat: Splat) => {
        // 只有当选择改变且新选择的splat可见时才更新
        if (splat !== selection && (!splat || splat.visible)) {
            const prev = selection;
            selection = splat;
            // 触发选择变化事件
            events.fire('selection.changed', selection, prev);
        }
    };

    // 监听选择事件：设置选中的Splat
    events.on('selection', (splat: Splat) => {
        setSelection(splat);
    });

    // 注册选择查询函数：返回当前选中的Splat
    events.function('selection', () => {
        return selection;
    });

    // 监听下一个选择事件：切换到下一个Splat
    events.on('selection.next', () => {
        const splats = scene.getElementsByType(ElementType.splat) as Splat[];
        if (splats.length > 1) {
            const idx = splats.indexOf(selection);
            // 循环选择下一个
            setSelection(splats[(idx + 1) % splats.length]);
        }
    });

    // 监听元素添加事件：如果添加的是Splat，自动选中它
    events.on('scene.elementAdded', (element: Element) => {
        if (element.type === ElementType.splat) {
            setSelection(element as Splat);
        }
    });

    // 监听元素移除事件：如果移除的是当前选中的Splat，选择其他Splat
    events.on('scene.elementRemoved', (element: Element) => {
        if (element === selection) {
            const splats = scene.getElementsByType(ElementType.splat) as Splat[];
            // 如果只剩一个，则取消选择；否则选择其他Splat
            setSelection(splats.length === 1 ? null : splats.find(v => v !== element));
        }
    });

    // 监听Splat可见性变化：如果选中的Splat变为不可见，取消选择
    events.on('splat.visibility', (splat: Splat) => {
        if (splat === selection && !splat.visible) {
            setSelection(null);
        }
    });

    // 监听相机焦点拾取事件：拾取到Splat时自动选中它
    events.on('camera.focalPointPicked', (details: { splat: Splat }) => {
        setSelection(details.splat);
    });
};

export { registerSelectionEvents };
