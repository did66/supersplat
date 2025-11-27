/**
 * 事件系统模块
 * 扩展PlayCanvas的EventHandler，添加函数注册和调用功能
 * 用于组件间的通信和状态查询
 */
import { EventHandler } from 'playcanvas';

/** 函数回调类型 */
type FunctionCallback = (...args: any[]) => any;

/**
 * 事件系统类
 * 提供事件发布/订阅和函数注册/调用功能
 */
class Events extends EventHandler {
    /** 注册的函数映射表 */
    functions = new Map<string, FunctionCallback>();

    /**
     * 声明一个编辑器函数
     * 注册一个可被其他组件调用的函数
     * @param {string} name - 函数名称
     * @param {FunctionCallback} fn - 函数实现
     * @throws {Error} 如果函数名称已存在则抛出错误
     */
    function(name: string, fn: FunctionCallback) {
        if (this.functions.has(name)) {
            throw new Error(`error: function ${name} already exists`);
        }
        this.functions.set(name, fn);
    }

    /**
     * 调用一个编辑器函数
     * 执行已注册的函数并返回结果
     * @param {string} name - 函数名称
     * @param {...any[]} args - 函数参数
     * @returns {any} 函数返回值，如果函数不存在则返回undefined
     */
    invoke(name: string, ...args: any[]) {
        const fn = this.functions.get(name);
        if (!fn) {
            console.log(`error: function not found '${name}'`);
            return;
        }
        return fn(...args);
    }
}

export { Events };
