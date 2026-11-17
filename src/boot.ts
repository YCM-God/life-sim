// 开场界面 → 游戏主循环的入口。
// 首屏用封面图做标题页，点击「开始人生」后才加载 main.ts，
// 避免游戏在封面背后空转；?auto 调试参数直接跳过标题页。

const titleScreen = document.getElementById('title-screen');
const startBtn = document.getElementById('ts-start');
const params = new URLSearchParams(location.search);

let booted = false;

function boot(): void {
  if (booted) return;
  booted = true;
  if (titleScreen) {
    titleScreen.classList.add('gone');
    window.setTimeout(() => titleScreen.remove(), 700);
  }
  void import('./main');
}

if (params.has('auto')) {
  titleScreen?.remove();
  boot();
} else {
  startBtn?.addEventListener('click', boot, { once: true });
  window.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Enter' || e.key === ' ') boot();
    },
    { once: true },
  );
}
