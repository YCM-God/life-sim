// 全局常量：基准分辨率 1280x720（Tile 32px，单屏 40x22.5 Tile）
// 2026-11-04 清晰度升级：渲染像素翻倍，美术细节同步加密
export const TILE = 32;
export const VIEW_W = 1280;
export const VIEW_H = 720;
// 世界尺寸（v0.3 设计：16x8 屏 = 640x352 Tile，八区一城，见《地图结构与动线设计》）
export const WORLD_W = 640;
export const WORLD_H = 176;
// 分块渲染：每块 16x16 Tile，静态层离线缓存
export const CHUNK = 16;
// 玩家速度（px/s），约 3.5 Tile/s
export const PLAYER_SPEED = 112;
