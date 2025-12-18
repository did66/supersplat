import path from 'path';

import alias from '@rollup/plugin-alias';
import image from '@rollup/plugin-image';
import json from '@rollup/plugin-json';
import resolve from '@rollup/plugin-node-resolve';
import strip from '@rollup/plugin-strip';
import terser from '@rollup/plugin-terser';
import typescript from '@rollup/plugin-typescript';
import autoprefixer from 'autoprefixer';
import postcss from 'postcss';
import scss from 'rollup-plugin-scss';
import sass from 'sass';

import copyAndWatch from './copy-and-watch.mjs';
import { readFileSync } from 'fs';

// prod is release build
if (process.env.BUILD_TYPE === 'prod') {
    process.env.BUILD_TYPE = 'release';
}
// debug, profile, release
const BUILD_TYPE = process.env.BUILD_TYPE || 'release';
const ENGINE_DIR = path.resolve(`node_modules/playcanvas/build/playcanvas${BUILD_TYPE === 'debug' ? '.dbg' : ''}/src/index.js`);
const PCUI_DIR = path.resolve('node_modules/@playcanvas/pcui');
const HREF = process.env.BASE_HREF || '';

// 读取 package.json 获取版本号
const packageJson = JSON.parse(readFileSync('package.json', 'utf-8'));
const VERSION = packageJson.version;

const outputHeader = () => {
    const BLUE_OUT = '\x1b[34m';
    const BOLD_OUT = '\x1b[1m';
    const REGULAR_OUT = '\x1b[22m';
    const RESET_OUT = '\x1b[0m';

    const title = [
        'Building SuperSplat',
        `type ${BOLD_OUT}${BUILD_TYPE}${REGULAR_OUT}`
    ].map(l => `${BLUE_OUT}${l}`).join('\n');
    console.log(`${BLUE_OUT}${title}${RESET_OUT}\n`);
};

outputHeader();

const application = {
    input: 'src/index.ts',
    output: {
        dir: 'dist',
        format: 'esm',
        sourcemap: true
    },
    plugins: [
        copyAndWatch({
            targets: [
                {
                    src: 'src/index.html',
                    transform: (contents, filename) => {
                        let html = contents.toString();
                        // 替换 BASE_HREF
                        html = html.replace('__BASE_HREF__', HREF);
                        // 为所有资源引用添加版本号查询参数（如果还没有查询参数）
                        // 处理 JS 文件：./index.js 和 jszip.js
                        html = html.replace(/src="(\.\/)?([^"?]+\.js)(\?[^"]*)?"/g, (match, prefix, file, query) => {
                            return `src="${prefix || ''}${file}?v=${VERSION}"`;
                        });
                        // 处理 CSS 文件：./index.css
                        html = html.replace(/href="\.\/([^"?]+\.css)(\?[^"]*)?"/g, (match, file, query) => {
                            return `href="./${file}?v=${VERSION}"`;
                        });
                        // 处理 manifest.json
                        html = html.replace(/href="\.\/(manifest\.json)(\?[^"]*)?"/g, (match, file, query) => {
                            return `href="./${file}?v=${VERSION}"`;
                        });
                        // 处理 service worker 注册
                        html = html.replace(/sw\.register\(['"]\.\/(sw\.js)(\?[^'"]*)?['"]\)/g, (match, file, query) => {
                            return `sw.register('./${file}?v=${VERSION}')`;
                        });
                        return html;
                    }
                },
                { src: 'src/manifest.json' },
                { src: 'node_modules/jszip/dist/jszip.js' },
                { src: 'static/images', dest: 'static' },
                { src: 'static/icons', dest: 'static' },
                { src: 'static/lib', dest: 'static' },
                { src: 'static/locales', dest: 'static' },
                { src: 'static/env/VertebraeHDRI_v1_512.png', dest: 'static/env' }
            ]
        }),
        alias({
            entries: {
                'playcanvas': ENGINE_DIR,
                '@playcanvas/pcui': PCUI_DIR
            }
        }),
        typescript({
            tsconfig: './tsconfig.json'
        }),
        resolve(),
        image({ dom: false }),
        json(),
        scss({
            sourceMap: true,
            runtime: sass,
            processor: (css) => {
                return postcss([autoprefixer])
                .process(css, { from: undefined })
                .then(result => result.css);
            },
            fileName: 'index.css',
            includePaths: [`${PCUI_DIR}/dist`],
            watch: 'src/ui/scss'
        }),
        BUILD_TYPE === 'release' &&
        strip({
            include: ['**/*.ts'],
            functions: ['Debug.exec']
        }),
        BUILD_TYPE !== 'debug' && terser()
    ],
    treeshake: 'smallest',
    cache: false
};

const serviceWorker = {
    input: 'src/sw.ts',
    output: {
        dir: 'dist',
        format: 'esm',
        sourcemap: true
    },
    plugins: [
        resolve(),
        json(),
        typescript()
        // BUILD_TYPE !== 'debug' && terser()
    ],
    treeshake: 'smallest',
    cache: false
};

export default [
    application,
    serviceWorker
];
