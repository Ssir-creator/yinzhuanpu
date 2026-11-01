# 音转谱

一个面向手机的音频转简谱 PWA。导入音频或直接录音后，应用在浏览器本地识别单旋律的音高和节奏，生成可编辑的数字简谱，并支持合成试听、文本导出、MusicXML 导出和本地保存。

在线地址：https://ssir-creator.github.io/yinzhuanpu/

## 使用方法

1. 选择音频、开始录音，或载入内置示例。
2. 设置调号、速度、节拍和最小音符时值。
3. 点击“生成简谱”。
4. 点击任一音符调整音高、时值、休止或删除。
5. 播放识别结果进行校对，再导出简谱文本或 MusicXML。

音频分析完全在当前浏览器内完成，不会上传到服务器。主动保存的曲谱只进入浏览器本地存储。

## 当前范围

当前版本适合 5～30 秒、旋律清楚、环境安静的单旋律录音。它暂时不能可靠拆分和弦、多声部和带伴奏的歌曲；密集轮指可能合并成较长音符，滑音可能切成多个音。自动结果是便于继续校对的初稿。

内置测试旋律是 14 个四分音符。端到端测试检查准确的 MIDI 音高序列、节奏量化、逐音编辑、两种导出、本地保存恢复和手机布局。

## 本地运行

项目没有 npm 或 pip 运行时依赖。页面结构源文件位于 `src/page.template.html`；构建会生成可独立预览的 `index.html`、`demo.html` 和 `page.template.html`。构建并启动服务：

```bash
python scripts/build_standalone.py
python -m http.server 8000 --bind 0.0.0.0
```

打开 `http://127.0.0.1:8000`。`demo.html` 内嵌样式、脚本和示例音频，可作为单文件演示版。

已安装 Playwright 和 Chromium 时运行端到端测试：

```bash
DEMO_URL=http://127.0.0.1:8000 python tests/transcription.py
```

## PWA 与发布

Android 可在 Chrome 中安装到主屏幕；iPhone 使用 Safari 的“分享 → 添加到主屏幕”。首次联网加载完成后，应用可离线打开并处理本地音频。

`.github/workflows/publish-pages.yml` 在 `main` 更新时构建并发布到 GitHub Pages。也可以运行 `python scripts/publish_pages.py` 准备发布文件。Service worker 的缓存版本由构建脚本根据页面内容生成。

## 琵琶模型研究

当前线上版本使用浏览器音高算法，尚未声称接入训练模型。`ml/` 提供下一阶段的真实实验工具：按录音场次审计和划分 WAV 数据、生成可追踪的 manifest，以及用独立标注计算音符级 Precision、Recall、F1 和时间误差。

把真实录音按场次放入 `ml/data/raw/<session>/` 后运行：

```bash
python ml/prepare_dataset.py
```

数据要求、标注格式、PESTO 域适配路线和模型卡模板见 `ml/README.md`；已核查的公开琵琶数据及许可边界见 `ml/PUBLIC_DATASETS.md`。运行 `python tests/model_data.py` 验证数据划分和评估工具。
