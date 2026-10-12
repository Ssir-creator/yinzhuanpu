# 弦镜 · 轮指均匀度观察室 v0.3

## 网站发布

网站地址：https://ssir-creator.github.io/yinzhuanpu/ 。Pages 使用 `gh-pages` 分支的根目录，只部署自包含的 `index.html` 与 `.nojekyll`，不部署录音或开发目录。

`.github/workflows/publish-pages.yml` 在 `main` 更新时重建页面、更新 `gh-pages`，并显式请求 Pages 构建（GitHub 自带令牌推送不会自动触发下一工作流）。需要 `contents: write` 与 `pages: write`。无需更改现有 github-pages 环境的分支保护。

备用手动发布：验证修改后运行 `python scripts/build_standalone.py` 和 `python scripts/publish_pages.py`。本地通过 Git 代理直接更新 gh-pages 会触发 Pages 构建。脚本不会强制推送或切换当前分支。

面向**持续、同音轮指**的离线观察原型：选择片段 → 查看起音间隔和相对攻击音变化 → 点击疑似位置试听 → 降速练习并重录。无 AI 模型、不评分、不识别具体手指。

## 直接体验

下载并解压体验包，用 Chrome / Edge / Safari 打开 `demo.html` 或 `index.html`；两个入口均内嵌所有音频、脚本和样式。不要使用聊天附件或网盘预览窗口（可能禁用脚本）。音频不会上传。

## 操作

1. 合成演示的参考侧为规则拨弦，练习侧人为加入间隔与攻击音变化。先点击橙色间隔柱或待复听位置，听前后约 0.8 秒。
2. 导入同弦、同音高的真实轮指录音（每侧最多 20 MB / 30 秒）。固定麦克风位置与增益，关闭自动增益，避开起止动作。
3. 两侧分别输入对应片段的起点 / 终点并应用；可单独试听选区。
4. 确认可比条件后才显示双侧统计。合成 / 用户录音混用时始终停止跨侧比较。重新导入会清除确认。
5. 图按首个检测起音对齐，以每侧中位间隔归一化，抵消整体速度差；攻击音相对每侧中位数计算，抵消固定增益。**不做自动曲谱或逐指配对**。
6. 点击标记核实，再决定练习目标。JSON 导出包含选区、检测起音、触发规则与位置，不含音频。

## 判定边界

检测是 10 ms RMS 正向变化 + 局部门限 + 45 ms 最小起音分隔。间隔偏离中位数超过 35%、起音后 40 ms 的峰值相对中位数超过 ±4 dB 时标记。阈值是原型规则，不是教学标准。

少于 8 个起音、间隔过密或明显削波时不输出均匀度线索。噪声、混响、弱起音、压缩和自动增益仍可能影响结果；“无标记”不等于正确。频谱与绝对 RMS 降为折叠的辅助信息，不用于音色评分。

**真实琵琶效果待验证**：自带素材是合成拨弦；已有独立已知起音信号测试，尚无真实琵琶录音及教师标注，不能声称教学有效。验证方案见 `docs/validation.md`。

## 开发

修改 `page.template.html`、`style.css`、`app.js` 后运行：

```bash
python scripts/build_standalone.py
python -m http.server 8000 --bind 0.0.0.0
```

素材可用标准库脚本 `python scripts/generate_audio.py` 重建。无需 npm / pip 依赖。

启动服务后运行 `python tests/smoke.py`（需已有 Playwright / Chromium）；换端口时用 `DEMO_URL=http://127.0.0.1:8001 python tests/smoke.py`。云端 Chromium 管理策略阻止 file:// 导航，因此离线测试在禁网页面载入同一份 HTML 内容，不改动浏览器策略。
