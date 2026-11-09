/* ============================================================================
 * 35-base.js — 全局设计系统与页面骨架样式
 *
 * 只放跨组件共享的东西：设计变量、页面骨架、按钮/胶囊/chip/分区标题/弹层/
 * 开关等公共件，以及主面板页头与两栏卡片布局。单个组件自己的布局样式放在
 * 各自的 part 里（同样通过 pushCss 注入）。
 * ========================================================================== */

pushCss(`
/* ---------- 设计变量（插件命名空间，朱砂/赭金/象牙白为「艺术品颜色」） ---------- */
:root{
  --ss-serif:"Noto Serif SC","Source Han Serif SC","Songti SC",STSong,SimSun,serif;
  --ss-coral:#d97768;
  --ss-coral-bright:#e28a78;
  --ss-coral-dim:#8a5348;
  --ss-gold:#b99c6b;
  --ss-gold-bright:#cbb183;
  --ss-gold-dim:#7d6b4c;
  --ss-ivory:#f2efe9;
  --ss-coral-wash:rgba(217,119,104,.13);
  --ss-gold-wash:rgba(185,156,107,.14);
}

/* --------------------------------------------------------------------------
 * 由主题 token 派生的插件 token 必须声明在 body 上，而不是 :root ——
 * DSH 的 --dsw-alias-* 定义在 body（含 dark/light 覆盖），html/:root 上取不到，
 * 在 :root 里写 color-mix(var(--dsw-alias-*)) 会变成 guaranteed-invalid，
 * 导致卡片表面/弱化文字全部失效。body 上的声明对正文与 portal 弹层都生效。
 * ------------------------------------------------------------------------ */
body{
  --ss-ink-dim:color-mix(in srgb, var(--dsw-alias-label-secondary) 56%, transparent);
  --ss-ink-mid:color-mix(in srgb, var(--dsw-alias-label-secondary) 82%, transparent);
  --ss-hairline:color-mix(in srgb, var(--dsw-alias-label-primary) 9%, transparent);
  /* 卡片表面：深浅色主题都可辨（浅色主题下 --dsw-alias-bg-layer-* 都是纯白） */
  --ss-surface:color-mix(in srgb, var(--dsw-alias-bg-base) 93%, var(--dsw-alias-label-primary));
  --ss-surface-2:color-mix(in srgb, var(--dsw-alias-bg-base) 86%, var(--dsw-alias-label-primary));
  --ss-card-border:color-mix(in srgb, var(--dsw-alias-label-primary) 9%, transparent);
}

/* ---------- 主面板根容器 ---------- */
.ss-root{
  position:relative;
  flex:1 1 auto;
  width:100%;
  min-height:0;
  overflow-y:auto;
  overflow-x:hidden;
  background:var(--dsw-alias-bg-base);
  color:var(--dsw-alias-label-primary);
  font-size:14px;
  line-height:1.55;
  -webkit-font-smoothing:antialiased;
}
.ss-root ::selection{background:rgba(217,119,104,.24)}

.ss-page{width:100%;max-width:1120px;margin:0 auto;padding:32px 36px 96px;box-sizing:border-box}

/* ---------- 页头 ---------- */
.ss-page-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin-bottom:22px}
.ss-page-heading{min-width:0}
.ss-page-title{margin:0;font-family:var(--ss-serif);font-size:34px;font-weight:500;line-height:1.12;letter-spacing:.04em}
.ss-page-sub{margin:9px 0 0;font-size:13.5px;line-height:1.5;color:var(--ss-ink-mid);letter-spacing:.02em}

/* ---------- 分段筛选 ---------- */
.ss-filters{display:inline-flex;flex:none;gap:2px;padding:4px;border-radius:12px;background:var(--ss-surface);border:1px solid var(--ss-card-border)}
.ss-filter{height:28px;padding:0 15px;border:0;border-radius:9px;background:transparent;color:var(--ss-ink-mid);font:inherit;font-size:12.5px;line-height:1;cursor:pointer;transition:background-color .16s ease,color .16s ease}
.ss-filter:hover{color:var(--dsw-alias-label-primary)}
.ss-filter[aria-pressed="true"]{background:color-mix(in srgb, var(--dsw-alias-label-primary) 11%, transparent);color:var(--dsw-alias-label-primary)}
.ss-filter:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}

/* ---------- 两栏卡片 ---------- */
.ss-cards{display:grid;grid-template-columns:minmax(0,1.02fr) minmax(0,1fr);gap:18px;align-items:stretch}
.ss-card{position:relative;background:var(--ss-surface);border:1px solid var(--ss-card-border);border-radius:18px;box-shadow:0 1px 2px color-mix(in srgb, var(--dsw-alias-label-primary) 4%, transparent)}
.ss-card-ring{padding:20px 22px 14px;min-height:520px;display:flex;flex-direction:column}
.ss-card-next{padding:22px 26px;min-height:520px;display:flex;flex-direction:column}
.ss-card-line{display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:12.5px;letter-spacing:.04em;color:var(--ss-ink-dim)}

/* ---------- 下半区 ---------- */
.ss-lower{margin-top:8px}
.ss-section-title{display:flex;align-items:center;justify-content:space-between;gap:14px;margin:30px 0 12px;font-size:14px;line-height:1.4;color:var(--ss-ink-mid);letter-spacing:.03em}
.ss-section-title-text{display:inline-flex;align-items:center;gap:8px}
.ss-section-title-extra{font-size:12.5px;color:var(--ss-ink-dim)}
.ss-lower-empty{padding:14px 2px 4px;font-size:12.5px;color:var(--ss-ink-dim)}

/* ---------- 公共按钮 ---------- */
.ss-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:32px;padding:0 13px;border:1px solid transparent;border-radius:9px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px;line-height:1;white-space:nowrap;cursor:pointer;transition:background-color .16s ease,border-color .16s ease,color .16s ease,opacity .16s ease}
.ss-btn:disabled{cursor:default;opacity:.55}
.ss-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.ss-btn-sm{height:28px;padding:0 11px;border-radius:8px;font-size:12px}
.ss-btn-md{height:32px}
.ss-btn-ghost{border-color:var(--ss-hairline);color:var(--dsw-alias-label-primary)}
.ss-btn-ghost:hover:not(:disabled){background:var(--ss-surface-2);border-color:var(--ss-card-border)}
.ss-btn-solid{background:color-mix(in srgb, var(--dsw-alias-label-primary) 10%, transparent);color:var(--dsw-alias-label-primary)}
.ss-btn-solid:hover:not(:disabled){background:color-mix(in srgb, var(--dsw-alias-label-primary) 15%, transparent)}
.ss-btn-accent{background:var(--ss-coral-wash);color:var(--ss-coral-bright)}
.ss-btn-accent:hover:not(:disabled){background:rgba(217,119,104,.2)}
.ss-btn-plain{color:var(--ss-ink-mid)}
.ss-btn-plain:hover:not(:disabled){background:var(--ss-surface-2);color:var(--dsw-alias-label-primary)}
.ss-btn-danger{color:var(--dsw-alias-state-error-primary)}
.ss-btn-danger:hover:not(:disabled){background:rgba(214,69,69,.12)}

/* ---------- 公共胶囊 / chip ---------- */
.ss-pill{display:inline-flex;align-items:center;gap:4px;height:22px;padding:0 9px;border-radius:999px;font-size:11px;line-height:1;letter-spacing:.04em;white-space:nowrap}
.ss-pill-coral{color:var(--ss-coral-bright);background:var(--ss-coral-wash)}
.ss-pill-gold{color:var(--ss-gold-bright);background:var(--ss-gold-wash)}
.ss-pill-ivory{color:var(--ss-ivory);background:color-mix(in srgb, var(--ss-ivory) 9%, transparent)}
.ss-pill-dim{color:var(--ss-ink-dim);background:color-mix(in srgb, var(--dsw-alias-label-primary) 5%, transparent)}

.ss-chip{display:inline-flex;align-items:center;height:28px;padding:0 13px;border-radius:999px;border:1px solid var(--ss-hairline);background:color-mix(in srgb, var(--dsw-alias-label-primary) 5%, transparent);color:var(--ss-ink-mid);font-size:12.5px;line-height:1;white-space:nowrap}

/* ---------- 文本工具类 ---------- */
.ss-serif{font-family:var(--ss-serif)}
.ss-dim{color:var(--ss-ink-dim)}
.ss-mid{color:var(--ss-ink-mid)}
.ss-num{font-variant-numeric:tabular-nums}
.ss-hr{height:1px;background:var(--ss-hairline);border:0;margin:0}

/* ---------- 公共弹层（portal 到 body，必须自带设计变量作用域） ---------- */
.ss-modal-mask{
  position:fixed;inset:0;z-index:70;display:flex;align-items:center;justify-content:center;padding:24px;
  background:rgba(10,10,12,.52);
  backdrop-filter:blur(7px);
  -webkit-backdrop-filter:blur(7px);
  animation:ss-fade-in .16s ease both;
}
.ss-modal-card{
  position:relative;box-sizing:border-box;width:min(720px,calc(100vw - 48px));max-height:86vh;overflow-y:auto;
  border:1px solid var(--dsw-alias-border-l2);border-radius:20px;
  background:var(--dsw-alias-bg-overlay);
  color:var(--dsw-alias-label-primary);
  box-shadow:0 24px 80px rgba(0,0,0,.45);
  animation:ss-rise-in .18s cubic-bezier(.2,.7,.3,1) both;
  outline:none;
}
.ss-modal-card.ss-modal-small{width:min(460px,calc(100vw - 48px))}
@keyframes ss-fade-in{from{opacity:0}to{opacity:1}}
@keyframes ss-rise-in{from{opacity:0;transform:translateY(10px) scale(.995)}to{opacity:1;transform:none}}

/* ---------- 开关 ---------- */
.ss-switch{position:relative;flex:none;width:38px;height:22px;padding:0;border:1px solid var(--dsw-alias-border-l2);border-radius:999px;background:color-mix(in srgb, var(--dsw-alias-label-primary) 8%, transparent);cursor:pointer;transition:background-color .18s ease,border-color .18s ease}
.ss-switch::after{content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:var(--dsw-alias-label-secondary);transition:transform .18s ease,background-color .18s ease}
.ss-switch[aria-checked="true"]{background:rgba(217,119,104,.26);border-color:rgba(217,119,104,.4)}
.ss-switch[aria-checked="true"]::after{transform:translateX(16px);background:var(--ss-coral-bright)}
.ss-switch:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}

/* ---------- 响应式 ---------- */
@media (max-width:920px){
  .ss-page{padding:22px 20px 72px}
  .ss-page-head{flex-direction:column;align-items:stretch;gap:14px}
  .ss-filters{align-self:flex-start}
  .ss-cards{grid-template-columns:minmax(0,1fr)}
  .ss-card-ring,.ss-card-next{min-height:0}
  .ss-card-ring{padding:16px 16px 10px}
  .ss-card-next{padding:20px 20px}
}
@media (max-width:520px){
  .ss-page{padding:18px 14px 64px}
  .ss-page-title{font-size:28px}
  .ss-page-sub{font-size:12px}
  .ss-filter{padding:0 11px}
}
`)
