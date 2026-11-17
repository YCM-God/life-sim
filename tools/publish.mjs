#!/usr/bin/env node
// 一键发布：类型检查 → 回归测试 → 构建 → 备份上一版 → 同步 dist 到站点仓库 → 推 main → 打开线上
//
// 用法（任意目录执行都行）：
//   node life-sim-ts/tools/publish.mjs
//   node life-sim-ts/tools/publish.mjs --message "fix: xxx"
//   node life-sim-ts/tools/publish.mjs --skip-tests      # 只构建发布
//   node life-sim-ts/tools/publish.mjs --source          # 顺带把源码推到 source 分支
//   node life-sim-ts/tools/publish.mjs --no-open         # 发布完不自动打开浏览器
//   node life-sim-ts/tools/publish.mjs --repo ..\其他站点目录
//
// 说明：
//   · 源码在本目录所在工程里构建，dist/ 拷到站点仓库根目录（GitHub Pages 只认 main 根目录）
//   · 站点仓库默认是同级目录 ../github-life-sim
//   · 覆盖前把站点仓库上一版 index.html + assets/ 备份到 .publish-backup/<时间戳>/，只留最近 5 份
//   · 没有实际改动时不会产生空提交

import { spawnSync } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, '..');

// ---------- 参数 ----------
const argv = process.argv.slice(2);
const opt = { repo: null, message: null, skipTests: false, source: false, noOpen: false };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--repo') opt.repo = argv[++i];
  else if (a === '--message' || a === '-m') opt.message = argv[++i];
  else if (a === '--skip-tests') opt.skipTests = true;
  else if (a === '--source') opt.source = true;
  else if (a === '--no-open') opt.noOpen = true;
  else if (a === '--help' || a === '-h') {
    console.log('用法: node tools/publish.mjs [--message 文案] [--skip-tests] [--source] [--no-open] [--repo 路径]');
    process.exit(0);
  }
}

const LIVE_URL = 'https://ycm-god.github.io/life-sim/';
const KEEP_BACKUPS = 5;
const repo = resolve(opt.repo ?? join(src, '..', 'github-life-sim'));
const dist = join(src, 'dist');
const backupRoot = join(src, '.publish-backup');

const c = { cyan: '\x1b[36m', green: '\x1b[32m', red: '\x1b[31m', dim: '\x1b[2m', reset: '\x1b[0m' };
const step = (t) => console.log(`\n${c.cyan}==> ${t}${c.reset}`);
const ok = (t) => console.log(`    ${c.green}${t}${c.reset}`);
const fail = (t) => {
  console.error(`    ${c.red}${t}${c.reset}`);
  process.exit(1);
};

if (!existsSync(repo)) fail(`找不到站点仓库：${repo}（用 --repo 指定）`);

// Windows 上用系统自带 OpenSSH：Git 自带的 ssh 在受限环境会失败
const ssh = 'C:/Windows/System32/OpenSSH/ssh.exe';
const gitCfg = existsSync(ssh) ? ['-c', `core.sshCommand=${ssh}`] : [];

function run(cmd, args, cwd, label, { silent = false } = {}) {
  const r = spawnSync(cmd, args, {
    cwd,
    stdio: silent ? ['ignore', 'pipe', 'inherit'] : 'inherit',
    encoding: 'utf8',
  });
  if (r.status !== 0) fail(`${label}失败${r.status ? `（退出码 ${r.status}）` : ''}`);
  return r.stdout ?? '';
}

const node = process.execPath;

// ---------- 1. 类型检查 ----------
step('TypeScript 类型检查');
run(node, [join(src, 'node_modules/typescript/bin/tsc'), '--noEmit', '-p', 'tsconfig.json'], src, '类型检查');
ok('0 error');

// ---------- 2. 回归测试 ----------
if (!opt.skipTests) {
  step('任务系统回归测试');
  const out = run(node, [join(src, 'test/quest-logic-check.mjs')], src, '回归测试', { silent: true });
  const lines = out.trim().split(/\r?\n/);
  for (const l of lines.slice(-4)) console.log(`    ${c.dim}${l}${c.reset}`);
}

// ---------- 3. 构建 ----------
step('构建（base = ./）');
run(node, [join(src, 'node_modules/vite/bin/vite.js'), 'build', '--base', './'], src, '构建');
if (!existsSync(join(dist, 'index.html'))) fail(`构建产物缺失：${join(dist, 'index.html')}`);
ok('dist/ 已生成');

// ---------- 4. 备份上一版 ----------
step('备份上一版站点');
const repoIndex = join(repo, 'index.html');
const repoAssets = join(repo, 'assets');
if (existsSync(repoIndex)) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const target = join(backupRoot, stamp);
  mkdirSync(target, { recursive: true });
  copyFileSync(repoIndex, join(target, 'index.html'));
  if (existsSync(repoAssets)) cpSync(repoAssets, join(target, 'assets'), { recursive: true });
  const dirs = readdirSync(backupRoot)
    .filter((d) => statSync(join(backupRoot, d)).isDirectory())
    .sort();
  for (const d of dirs.slice(0, Math.max(0, dirs.length - KEEP_BACKUPS))) {
    rmSync(join(backupRoot, d), { recursive: true, force: true });
  }
  ok(`已备份到 .publish-backup/${stamp}（保留最近 ${KEEP_BACKUPS} 份）`);
} else {
  ok('站点仓库暂无产物，跳过备份');
}

// ---------- 5. 同步到站点仓库 ----------
step(`同步产物到 ${repo}`);
const assets = join(repo, 'assets');
if (!existsSync(assets)) mkdirSync(assets, { recursive: true });
for (const f of readdirSync(assets)) rmSync(join(assets, f), { force: true });
copyFileSync(join(dist, 'index.html'), join(repo, 'index.html'));
for (const f of readdirSync(join(dist, 'assets'))) {
  copyFileSync(join(dist, 'assets', f), join(assets, f));
}
for (const img of ['cover.jpg', 'og.jpg']) {
  const p = join(dist, img);
  if (existsSync(p)) copyFileSync(p, join(repo, img));
}
ok('index.html + assets/ 已更新');

// ---------- 6. 提交并推送 ----------
const git = (args, label, cwd = repo, silent = false) =>
  run('git', [...gitCfg, ...args], cwd, label, { silent });

step('提交 main');
const dirty = git(['status', '--porcelain'], '读取状态', repo, true).trim().length > 0;
if (!dirty) {
  ok('产物与线上一致，无需提交');
} else {
  const msg = opt.message ?? `publish: ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;
  git(['add', '-A'], '暂存');
  git(['-c', 'core.autocrlf=false', 'commit', '-q', '-m', msg], '提交');
  ok(`commit ${git(['rev-parse', '--short', 'HEAD'], '读取提交号', repo, true).trim()}`);
}

const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'], '读取分支', repo, true).trim();
const ahead = Number(git(['rev-list', '--count', `origin/${branch}..HEAD`], '统计待推送', repo, true).trim());
if (ahead === 0) {
  ok(`${branch} 已是最新，无需推送`);
} else {
  git(['push', 'origin', branch], '推送');
  ok(`已推送 ${ahead} 个提交到 origin/${branch}`);
}

// ---------- 7. 可选：源码分支 ----------
if (opt.source) {
  step('提交源码到 source 分支');
  if (existsSync(join(src, '.git'))) {
    const srcDirty = git(['status', '--porcelain'], '读取源码状态', src, true).trim().length > 0;
    if (srcDirty) {
      const msg = opt.message ?? `chore: 同步源码 ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;
      git(['add', '-A'], '暂存源码', src);
      git(['-c', 'core.autocrlf=false', 'commit', '-q', '-m', msg], '提交源码', src);
      git(['push', 'origin', 'source'], '推送源码', src);
      ok('已推送 source');
    } else {
      ok('源码无改动');
    }
  } else {
    ok('当前工程不是 git 仓库，跳过');
  }
}

console.log(`\n${c.green}全部完成${c.reset}  线上：${LIVE_URL}（约 1 分钟后生效）`);

// ---------- 8. 打开线上地址 ----------
if (!opt.noOpen) {
  const opener =
    process.platform === 'win32'
      ? ['cmd', ['/c', 'start', '', LIVE_URL]]
      : process.platform === 'darwin'
        ? ['open', [LIVE_URL]]
        : ['xdg-open', [LIVE_URL]];
  const r = spawnSync(opener[0], opener[1], { stdio: 'ignore', detached: true });
  if (r.status === 0) console.log(`${c.dim}已在浏览器打开线上地址${c.reset}`);
  else console.log(`${c.dim}未能自动打开浏览器，请手动访问${c.reset}`);
}
