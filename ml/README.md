# 琵琶模型数据与实验

这里保存可复现实验工具，不提交私人录音、训练缓存或模型权重。

## 1. 获取并放置真实录音

可以优先使用公开授权数据，不要求先自行录音。已核查的来源、许可和推荐划分见 [`PUBLIC_DATASETS.md`](PUBLIC_DATASETS.md)。公开数据仍需按原始录音分场次保存，不能把同一首曲子的切片同时放入训练和测试。

每个录音场次使用独立目录。场次必须按实际录制时间或设备划分，不能把同一段演奏切片后分到不同目录。

```text
ml/data/raw/
├── session_01_phone_a/
│   ├── scales_01.wav
│   └── melody_01.wav
├── session_02_phone_a/
└── session_03_phone_b/
```

建议使用 WAV。脚本接受单声道或双声道 PCM WAV，不改写原文件。训练录音可以不标注；独立测试集需要逐音参考标注。

## 2. 检查并划分数据

```bash
python ml/prepare_dataset.py
```

脚本按“录音场次”划分 train、validation、test，避免同一遍演奏泄漏到多个集合。输出：

- `ml/data/manifest.csv`：文件、场次、划分、时长和音频参数。
- `ml/data/dataset_report.json`：总时长、各集合时长和数据就绪状态。

试验目标为至少 30 分钟训练录音、5 分钟独立测试录音、3 个录音场次。达到这个门槛只能支持原型实验；60～90 分钟、多位演奏者和多种设备更有说服力。

## 3. 测试集标注

每个参考 CSV 使用三列：

```csv
onset,offset,midi
0.100,0.580,60
0.600,1.170,62
```

时间单位为秒，`midi` 是 MIDI 音高编号。把模型输出整理成相同格式后运行：

```bash
python ml/evaluate_notes.py reference.csv prediction.csv
```

默认匹配条件为音高完全一致、起音误差不超过 50 ms，结束时间误差不超过 50 ms 或参考音符时长的 20%。报告 precision、recall、F1 和匹配音符的平均起音误差。

## 4. 训练路线

1. 以 [PESTO](https://github.com/SonyCSLParis/pesto-full) 预训练模型为基线。
2. 使用训练集琵琶录音继续自监督训练；验证集用于选择 checkpoint。
3. 保持测试集完全隔离，对比当前浏览器算法、原始 PESTO 和琵琶适配 PESTO。
4. 增加音域约束、置信度平滑和同音轮指合并，并报告消融实验。
5. 导出 ONNX 后通过 ONNX Runtime Web 接入 App；模型失败时回退到当前浏览器算法。

当前云环境没有 GPU 或 PyTorch。正式训练应在带 GPU 的 Colab 或其他机器执行；这里的工具负责数据审计、评估、App 集成和复现实验记录。
