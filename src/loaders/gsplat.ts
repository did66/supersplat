/**
 * GSplat加载器模块
 * 加载高斯点云数据文件（PLY、压缩PLY、SOG、SOG-bundle等格式）
 */
import { Asset, AssetRegistry, GSplatData, GSplatResource } from 'playcanvas';

import { AssetSource } from './asset-source';

/** 资源ID计数器，用于生成唯一的本地资源URL */
let assetId = 0;

/**
 * 使用引擎加载GSplat资源
 * 支持加载PLY、压缩PLY、SOG、SOG-bundle等格式的高斯点云数据
 * @param {AssetRegistry} assets - 资源注册表
 * @param {AssetSource} assetSource - 资源源信息
 * @returns {Promise<Asset>} 加载完成的资源Promise
 */
const loadGsplat = (assets: AssetRegistry, assetSource: AssetSource) => {
    // 处理资源内容，如果是Response则直接使用，否则创建新的Response
    const contents = assetSource.contents && (assetSource.contents instanceof Response ? assetSource.contents : new Response(assetSource.contents));

    const file = {
        // 如果提供了内容，必须构造一个唯一的URL
        url: contents ? `local-asset-${assetId++}` : assetSource.url ?? assetSource.filename,
        filename: assetSource.filename,
        contents
    };

    const data = {
        // 加载时解压数据
        decompress: true,
        // 加载动画帧时禁用Morton重排序
        reorder: !(assetSource.animationFrame ?? false)
    };

    const options = {
        mapUrl: assetSource.mapUrl
    };

    return new Promise<Asset>((resolve, reject) => {
        const asset = new Asset(
            assetSource.filename || assetSource.url,
            'gsplat',
            // @ts-ignore
            file,
            data,
            options
        );

        // 监听数据加载事件
        asset.on('load:data', (data: GSplatData) => {
            // 支持加载2D splat，通过添加scale_2属性（几乎为0的缩放值）
            if (data instanceof GSplatData && data.getProp('scale_0') && data.getProp('scale_1') && !data.getProp('scale_2')) {
                const scale2 = new Float32Array(data.numSplats).fill(Math.log(1e-6));
                data.addProp('scale_2', scale2);

                // 将新的scale_2属性放在scale_1之后
                const props = data.getElement('vertex').properties;
                props.splice(props.findIndex((prop: any) => prop.name === 'scale_1') + 1, 0, props.splice(props.length - 1, 1)[0]);
            }
        });

        // 监听加载完成事件
        asset.on('load', () => {
            // 检查PLY文件是否包含我们期望的最小属性集
            const required = [
                'x', 'y', 'z',
                'scale_0', 'scale_1', 'scale_2',
                'rot_0', 'rot_1', 'rot_2', 'rot_3',
                'f_dc_0', 'f_dc_1', 'f_dc_2', 'opacity'
            ];
            const splatData = (asset.resource as GSplatResource).gsplatData as GSplatData;
            const missing = required.filter(x => !splatData.getProp(x));
            if (missing.length > 0) {
                // 如果缺少必需属性，拒绝加载
                reject(new Error(`This file does not contain gaussian splatting data. The following properties are missing: ${missing.join(', ')}`));
            } else {
                // 所有必需属性都存在，解析成功
                resolve(asset);
            }
        });

        // 监听错误事件
        asset.on('error', (err: string) => {
            reject(err);
        });

        // 添加资源到注册表并开始加载
        assets.add(asset);
        assets.load(asset);
    });
};

export { loadGsplat };
