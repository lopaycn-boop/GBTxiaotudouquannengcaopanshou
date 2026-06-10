import '../dragon-orbit.css';

/**
 * DragonOrbit — 中国龙环绕对话框组件
 * 龙沿对话框边缘盘旋，赛博朋克霓虹发光风格
 */
export default function DragonOrbit() {
  // 龙身路径：沿矩形边框走S形曲线（在SVG坐标中）
  // viewBox 设为 0 0 440 640（比 chat-card 稍大，留 padding）
  const W = 440, H = 640;
  const pad = 20; // 内缩

  // 龙身关键点：沿矩形边缘走S形
  const bodyD = [
    // 从左上开始，顺时针
    `M ${pad+40},${pad}`,           // 龙头位置
    `C ${pad+80},${pad} ${pad+160},${pad-15} ${pad+220},${pad+5}`,  // 上边-头部曲线
    `C ${pad+280},${pad+20} ${pad+340},${pad} ${W-pad},${pad+20}`,  // 上边-右转
    `C ${W-pad+10},${pad+60} ${W-pad},${pad+120} ${W-pad+5},${pad+180}`, // 右边-上段
    `C ${W-pad-5},${pad+240} ${W-pad+8},${pad+320} ${W-pad-5},${pad+400}`, // 右边-中段
    `C ${W-pad-15},${pad+460} ${W-pad},${pad+520} ${W-pad-10},${H-pad}`,  // 右边-下段到右下
    `C ${W-pad-40},${H-pad+10} ${W-pad-100},${H-pad-5} ${pad+200},${H-pad+5}`, // 下边
    `C ${pad+120},${H-pad+10} ${pad+60},${H-pad-5} ${pad},${H-pad-30}`,  // 下边到左下
    `C ${pad-8},${H-pad-80} ${pad+5},${H-pad-150} ${pad-3},${pad+200}`,  // 左边-下段
    `C ${pad+3},${pad+140} ${pad-5},${pad+80} ${pad+10},${pad+30}`,     // 左边-上段回到龙头
    `Z`
  ].join(' ');

  // 龙头细节：在起点处
  const headX = pad + 35, headY = pad + 2;

  return (
    <div className="dragon-orbit-wrap">
      <svg
        className="dragon-orbit-svg"
        viewBox={`0 0 ${W} ${H}`}
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="none"
      >
        <defs>
          {/* 龙身渐变：青→品红→青 */}
          <linearGradient id="dragonBodyGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%"   stopColor="var(--neon-cyan, #00f5ff)" stopOpacity="0.9" />
            <stop offset="25%"  stopColor="var(--neon-blue, #4d7cff)" stopOpacity="0.8" />
            <stop offset="50%"  stopColor="var(--neon-magenta, #ff2d95)" stopOpacity="0.9" />
            <stop offset="75%"  stopColor="var(--neon-purple, #b44dff)" stopOpacity="0.8" />
            <stop offset="100%" stopColor="var(--neon-cyan, #00f5ff)" stopOpacity="0.9" />
          </linearGradient>

          {/* 龙鳞纹理渐变 */}
          <radialGradient id="scaleGrad">
            <stop offset="0%"   stopColor="var(--neon-cyan, #00f5ff)" stopOpacity="0.8" />
            <stop offset="100%" stopColor="var(--neon-cyan, #00f5ff)" stopOpacity="0.1" />
          </radialGradient>

          {/* 龙珠径向渐变 */}
          <radialGradient id="pearlGrad">
            <stop offset="0%"   stopColor="#ffffff" stopOpacity="0.9" />
            <stop offset="30%"  stopColor="var(--neon-cyan, #00f5ff)" stopOpacity="0.8" />
            <stop offset="100%" stopColor="var(--neon-cyan, #00f5ff)" stopOpacity="0" />
          </radialGradient>

          {/* 龙身发光滤镜 */}
          <filter id="dragonGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* 龙须模糊 */}
          <filter id="whiskerGlow">
            <feGaussianBlur in="SourceGraphic" stdDeviation="1.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* 龙身：主路径 */}
        <path
          className="dragon-body-path"
          d={bodyD}
          fill="none"
          stroke="url(#dragonBodyGrad)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter="url(#dragonGlow)"
        />

        {/* 龙身第二层：更亮的内线 */}
        <path
          d={bodyD}
          fill="none"
          stroke="var(--neon-cyan, #00f5ff)"
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity="0.6"
        />

        {/* 龙鳞：沿路径分布的发光点 */}
        {[0, 0.06, 0.12, 0.18, 0.24, 0.30, 0.36, 0.42, 0.48,
          0.54, 0.60, 0.66, 0.72, 0.78, 0.84, 0.90, 0.96].map((offset, i) => {
          // 沿路径近似分布鳞片
          const t = offset;
          const x = pad + 40 + (W - 2*pad - 80) * (i % 2 === 0 ? t : 1 - t);
          const y = pad + (H - 2*pad) * (t * 1.1 % 1);
          return (
            <circle
              key={`scale-${i}`}
              className="dragon-scale"
              cx={x}
              cy={y}
              r="2.5"
              fill="url(#scaleGrad)"
              style={{ animationDelay: `${i * 0.12}s` }}
            />
          );
        })}

        {/* ── 龙头 ── */}
        <g transform={`translate(${headX}, ${headY})`}>
          {/* 龙角 */}
          <path d="M 0,-5 L -8,-22 L -3,-10" fill="none" stroke="var(--neon-magenta, #ff2d95)" strokeWidth="2" filter="url(#whiskerGlow)" />
          <path d="M 12,-5 L 20,-22 L 15,-10" fill="none" stroke="var(--neon-magenta, #ff2d95)" strokeWidth="2" filter="url(#whiskerGlow)" />

          {/* 龙眼 */}
          <circle className="dragon-eye" cx="3" cy="0" r="3.5" />
          <circle cx="3" cy="0" r="1.5" fill="#fff" opacity="0.9" />

          {/* 龙嘴 */}
          <path d="M -2,5 Q 6,9 14,5" fill="none" stroke="var(--neon-cyan, #00f5ff)" strokeWidth="1.5" opacity="0.8" />

          {/* 龙须 */}
          <g filter="url(#whiskerGlow)">
            <path className="dragon-whisker" d="M -2,4 Q -15,2 -28,8" fill="none" stroke="var(--neon-cyan, #00f5ff)" strokeWidth="1.2" opacity="0.7" />
            <path className="dragon-whisker" d="M -2,6 Q -18,8 -30,14" fill="none" stroke="var(--neon-cyan, #00f5ff)" strokeWidth="1" opacity="0.5" />
            <path className="dragon-whisker" d="M 14,4 Q 27,2 38,10" fill="none" stroke="var(--neon-cyan, #00f5ff)" strokeWidth="1.2" opacity="0.7" />
          </g>
        </g>

        {/* ── 龙尾：在路径终点 ── */}
        <g transform={`translate(${pad+8}, ${pad+25})`}>
          <path d="M 0,0 Q -12,-8 -8,-18" fill="none" stroke="var(--neon-magenta, #ff2d95)" strokeWidth="2" opacity="0.7" filter="url(#whiskerGlow)" />
          <path d="M 0,0 Q -15,-5 -18,-14" fill="none" stroke="var(--neon-cyan, #00f5ff)" strokeWidth="1.5" opacity="0.5" />
          {/* 尾焰粒子 */}
          <circle className="dragon-particle" cx="-10" cy="-16" r="2" fill="var(--neon-magenta, #ff2d95)" style={{ animationDelay: '0s' }} />
          <circle className="dragon-particle" cx="-14" cy="-12" r="1.5" fill="var(--neon-cyan, #00f5ff)" style={{ animationDelay: '0.6s' }} />
          <circle className="dragon-particle" cx="-6" cy="-20" r="1" fill="var(--neon-purple, #b44dff)" style={{ animationDelay: '1.2s' }} />
        </g>

        {/* ── 龙珠：龙追逐的宝珠 ── */}
        <circle
          className="dragon-pearl"
          cx={W - pad - 30}
          cy={pad + 40}
          r="5"
          fill="url(#pearlGrad)"
        />
        <circle
          cx={W - pad - 30}
          cy={pad + 40}
          r="3"
          fill="var(--neon-cyan, #00f5ff)"
          opacity="0.5"
        />
      </svg>
    </div>
  );
}
