# 人生模拟器

在线游玩：**https://ycm-god.github.io/life-sim/**

像素风人生模拟网页游戏，Vite + TypeScript 构建，纯前端运行，无后端依赖。

## 发布方式

本仓库 `main` 分支根目录就是 GitHub Pages 发布的静态产物（构建时使用 `--base ./`，所以资源使用相对路径）。

## 如何更新游戏

1. 在源码目录重新构建：

   ```bash
   npm run build -- --base ./
   ```

2. 用 `dist/` 的内容覆盖本仓库根目录（保留 `.nojekyll`），提交并推送：

   ```bash
   git add -A
   git commit -m "更新游戏"
   git push
   ```

3. 推送后 GitHub Pages 会自动重新构建，约 1 分钟后生效。

源码目录：`E:\KimiData\kimi\tasks\2026-11-04\22-54-29-3b19fe00\life-sim`

## 说明

- 游戏为 canvas 渲染的单页应用，没有前端路由，无需额外的 404 配置。
- 桌面端使用键盘：空格抽天赋、←→/AD 切换性别、WASD/方向键移动、E 对话、Tab 地图、P 折叠面板。
- 手机端请横屏游玩：左下虚拟方向键，右下「互动 / 返回 / 手机 / 地图 / 快进 / 打车」按键；竖屏时会提示旋转。
- 调试触屏布局可在网址后加 `?touch=1` 强制显示虚拟按键（桌面浏览器也可用）。
