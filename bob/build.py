#!/usr/bin/env python3
"""打包 Bob 插件为 .bobplugin（translate + ocr，产物输出到项目根 dist/bob/）
运行: python bob/build.py
"""
import os
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
DIST = os.path.join(os.path.dirname(HERE), 'dist', 'bob')

PLUGINS = [
    ('translate', 'com.saladict.bob.llm-translate'),  # 与 info.json 的 identifier 保持一致
    ('ocr', 'com.saladict.bob.llm-ocr'),
]

FILES = ['info.json', 'main.js', 'icon.png']

os.makedirs(DIST, exist_ok=True)
for dir_name, identifier in PLUGINS:
    src = os.path.join(HERE, dir_name)
    out = os.path.join(DIST, identifier + '.bobplugin')
    if os.path.exists(out):
        os.remove(out)
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
        for name in FILES:
            z.write(os.path.join(src, name), name)  # 第二个参数 = 压缩包内路径，必须是根目录
    print('打包完成:', out)
