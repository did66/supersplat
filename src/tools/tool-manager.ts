/**
 * 工具管理模块
 * 管理编辑器中各种工具（选择、移动、旋转、缩放等）的注册、激活和切换
 */
import { Events } from '../events';

/**
 * 工具接口
 * 所有工具必须实现此接口
 */
interface Tool {
	/** 激活工具 */
	activate: () => void;
	/** 停用工具 */
	deactivate: () => void;
}

/**
 * 工具管理器类
 * 负责工具的注册、激活、停用和坐标空间管理
 */
class ToolManager {
	/** 已注册的工具映射表 */
	tools = new Map<string, Tool>();
	/** 事件系统 */
	events: Events;
	/** 当前激活的工具名称，null表示没有激活的工具 */
	active: string | null = null;

	/**
	 * 构造函数
	 * @param {Events} events - 事件系统
	 */
	constructor(events: Events) {
		this.events = events;

		// 监听工具停用事件
		this.events.on('tool.deactivate', () => {
			this.activate(null);
		});

		// 注册工具激活状态查询函数
		this.events.function('tool.active', () => {
			return this.active;
		});

		// 坐标空间管理（局部空间或世界空间）
		let coordSpace: 'local' | 'world' = 'world';

		/**
		 * 设置坐标空间
		 * @param {('local'|'world')} space - 坐标空间类型
		 */
		const setCoordSpace = (space: 'local' | 'world') => {
			if (space !== coordSpace) {
				coordSpace = space;
				events.fire('tool.coordSpace', coordSpace);
			}
		};

		// 注册坐标空间查询函数
		events.function('tool.coordSpace', () => {
			return coordSpace;
		});

		// 监听坐标空间设置事件
		events.on('tool.setCoordSpace', (value: 'local' | 'world') => {
			setCoordSpace(value);
		});

		// 监听坐标空间切换事件
		events.on('tool.toggleCoordSpace', () => {
			setCoordSpace(coordSpace === 'local' ? 'world' : 'local');
		});
	}

	/**
	 * 注册工具
	 * @param {string} name - 工具名称
	 * @param {Tool} tool - 工具对象
	 */
	register(name: string, tool: Tool) {
		this.tools.set(name, tool);

		// 监听工具激活事件
		this.events.on(`tool.${name}`, () => {
			this.activate(name);
		});
	}

	/**
	 * 获取工具
	 * @param {string} toolName - 工具名称
	 * @returns {Tool | null} 工具对象，如果不存在则返回null
	 */
	get(toolName: string) {
		return (toolName && this.tools.get(toolName)) ?? null;
	}

	/**
	 * 激活工具
	 * 如果激活的是当前已激活的工具，则停用它
	 * @param {string | null} toolName - 要激活的工具名称，null表示停用所有工具
	 */
	activate(toolName: string | null) {
		if (toolName === this.active) {
			// 重新激活当前已激活的工具会停用它
			if (toolName) {
				this.activate(null);
			}
		} else {
			// 停用旧工具
			if (this.active) {
				const tool = this.tools.get(this.active);
				tool.deactivate();
				this.events.fire(`tool.${this.active}.deactivated`);
				this.events.fire('tool.deactivated', this.active);
			}

			// 先尝试激活新工具（但不设置active状态）
			let activationSucceeded = true;
			if (toolName) {
				const tool = this.tools.get(toolName);
				// 检查工具是否有canActivate方法，如果有则先检查
				if (tool && typeof (tool as any).canActivate === 'function') {
					activationSucceeded = (tool as any).canActivate();
				}

				// 如果检查通过，才真正激活
				if (activationSucceeded) {
					tool.activate();
				}
			}

			// 只有激活成功时才设置active状态和触发事件
			if (activationSucceeded) {
				this.active = toolName;
				// 触发工具激活事件
				this.events.fire(`tool.${toolName}.activated`);
				this.events.fire('tool.activated', toolName);
			}
		}
	}
}

export { ToolManager };
