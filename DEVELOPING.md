# 开发指南（DEVELOPING）

本仓库是一个纯 JavaScript 的 DSH Web 插件（bundle）。本文件给以后改功能的人（包括 AI 助手）
一份可直接照做的开发约定、流程与排错清单。

- 仓库：<https://github.com/qianniu2009/dsh-suishi>（MIT）
- 本地目录：`D:\workspace\python\dsh-suishi`
- DSH 安装方式：`plugin_manager(action:"install_bundle", target:"D:\workspace\python\dsh-suishi")`
  （profile 里是 `link:` 链接，改完代码不需要重装）

---

## 1. 五分钟上手

```bash
cd D:\\workspace\\python\\dsh-suishi
node build.mjs          # 由 src/parts/*.js 生成 client.js
# 刷新 DSH 页面 → 侧栏「岁时」即可看到改动
```

自检（提交前必备）：

```bash
node build.mjs --check        # 整包语法检查（17 parts）
node tests/run-node.mjs       # store / 事件 / 格式化等集成逻辑
node tests/test-festivals.mjs # 24 节气 + 25 节令内容数据（888 断言）
node tests/test-lunar.mjs     # 农历引擎 73049 天逐日比对 HKO
```

> `tests/test-lunar.mjs` 需要本地 `tools/hko/raw/`（5.6 MB，gitignore，不随仓库发布）。
> 第一次 clone 后先运行 `node tools/hko/fetch.mjs`；否则测试会提示并退出。

提交并同步 GitHub：

```bash
git add -A
git commit -m "feat: 你改了什么"
git push
```

---

## 2. 源码结构：一个 factory 作用域里的分片

`build.mjs` 把 `src/parts/*.js` **按文件名字典序**拼接成一个浏览器模块
（`window.__ModuleLoader__.load({ id: '@local/dsh-suishi', factory(require) { ... } })`）。
所有分片共享同一个函数作用域：可以引用前面分片里声明的 `const`/`function`，**不是 ES Module**。

硬规则：

- 不用 `import` / `export` / `require`（`React` 与 `h` 已由外层注入，直接用）。
- 不用 JSX、不用 TypeScript；用 `h(...)`（`React.createElement`）写界面。
- 顶层命名加业务前缀（`SS_`、`ssXxx`、`TERMS_META`…）避免跨分片撞名。
- 不要手改 `client.js`（构建产物）；改源码后重新 `node build.mjs`。

分片顺序与职责：

| 分片 | 作用 |
|---|---|
| `00-core.js` | `SS` 命名空间、i18n `T(zh,en)`、`SS.fmt` 日期格式、图标、公共组件（Button/Pill/Chip/Modal）、localStorage 封装、CSS 收集 `pushCss` |
| `10-cal-data.js` | **生成文件**：香港天文台 1901–2100 农历/节气离线数据（勿手改） |
| `11-lunar.js` | 纯整数农历引擎 `Lunar`（epoch-day，无时区依赖） |
| `20-festivals.js` | 24 节气 `TERMS_META` + 25 节令 `FESTIVALS_META` 及映射表 |
| `30-store.js` | 状态快照 `Store`：事件模型、筛选、纪念日、持久化、跨天刷新、`describe()` 文案 |
| `35-base.js` | 设计变量与页面骨架 CSS（`--ss-*`、按钮/胶囊/弹层/开关等公共类） |
| `40-ring.js` | 年轮盘（SVG）与图例 |
| `45/50/55-*.js` | 「下一个」卡 / 我的纪念日 / 接下来列表 |
| `60/65/70/75/80-*.js` | 详情弹层 / 添加纪念日 / 设置分区 / 侧栏胶囊 / 安静提醒 |
| `85-page.js` | 主面板页面组装 |
| `90-apply.js` | `apply(ctx)` 入口：样式注入、语言跟随、跨天 ticker、槽位注册 |

> 新增一个分片：文件名放对顺序即可（例如 `42-foo.js` 会在 40 与 45 之间加载），再 `node build.mjs`。

---

## 3. 界面与 DSH 槽位

注册都在 `90-apply.js`，当前占用：

| 槽位 | 内容 |
|---|---|
| `main`（key `suishi`） | 主面板 `SuishiPage` |
| `sidebar.panellist`（id `suishi`） | 侧栏「岁时」图标 |
| `sidebar.footer.action`（id `suishi-capsule`） | 侧栏底部「距春节 N 天」胶囊 |
| `settings.section` / `settings.section.icon`（id `suishi`） | 设置里的「岁时」分区 |
| `shell.overlay`（id `suishi-reminder`） | 右下角安静提醒（常驻，且在此挂载全局弹层） |

要点：

- 槽位 `main` 是 **keyed**：只有当前面板挂载。弹层因此在 `shell.overlay` 的常驻组件里
  也挂了一份，并用 `ssClaimDialogMount()` 仲裁「同屏只渲染一份遮罩」。
- 弹层统一用 `00-core.js` 的 `SSModal`（portal 到 `document.body`、Esc/遮罩/焦点处理）。
- 设置面板的 `z-index` 是 1000，从设置页打开的添加弹层用 `.ss-modal-mask:has(.ss-add-modal){z-index:1200}` 盖住。

---

## 4. 状态与数据

### 4.1 Store（`30-store.js`）

```js
const snap = Store.use()      // React hook：订阅快照；组件根调用 useLocaleTick() 跟语言
Store.get()                   // 非 React 读取
Store.describe(event)         // → { title, kindLabel, ymd, countdown, subtitle, body, chips, hou, customs, prevYmd, nextYmd, ... }
Store.act.setFilter('all'|'festival'|'term')
Store.act.openDrawer(eventId) / closeDrawer()
Store.act.openAddDialog() / closeAddDialog()
Store.act.addAnniversary({ name, calendar:'lunar'|'solar', month, day })
Store.act.removeAnniversary(id)
Store.act.setSettings({ reminderEnabled, leadDays, capsuleEnabled })
Store.act.copyEvent(eventId)  // 复制「名称 · 日期 · 倒计时」
Store.act.refreshNow()        // 跨天检查（90-apply 里每 30s 调用）
```

快照字段（UI 只读）：`today / anchor / filter / filters / events / visible / next / afterNext /
anniversaries / groups / count / drawer / addDialog / settings / reminder / copied`。

持久化键（localStorage）：`dsh.suishi.v1.anniversaries`、`.settings`、`.reminder-dismissed`。

### 4.2 增加一个节令/节气

- 节气：改 `20-festivals.js` 的 `TERMS_META`（顺序必须与 `Lunar.TERM_KEYS` 一致），
  至少包含 `key/name/season/longitude/hou[3]/description`。
- 节令：改 `FESTIVALS_META`，支持 `calendar: 'lunar' | 'solar' | 'nth-weekday' | 'special'`。
  例：`{ key:'laba', name:'腊八节', calendar:'lunar', month:12, day:8, priority:2, tagLabel:'腊日', ... }`。
- 改完跑 `node tests/test-festivals.mjs`；界面无需其它改动，年轮/列表/详情会自动出现。

### 4.3 农历/节气数据（`10-cal-data.js`）

数据来自香港天文台 1901–2100 年公众年历，**构建期生成、运行时不联网**。

```bash
node tools/hko/fetch.mjs           # 下载 200 个年表 → tools/hko/raw/（gitignore）
node tools/hko/build-calendar.mjs  # 解析 → 重新生成 src/parts/10-cal-data.js
node tests/test-lunar.mjs          # 逐日校验（0 不一致才提交）
```

预期校验规模：73,049 天、4,800 个节气、201 个农历年、2,473 个农历月。数据范围之外
（1901 前 / 2100 后）引擎会返回边界值或 `null`，不要在 UI 里假设一定有值。

---

## 5. 视觉约定

- 颜色：容器/文字/边框优先用 **DSH 主题 token** `--dsw-alias-*`（跟随深/浅色主题）；
  插件自有「艺术品颜色」是朱砂 `--ss-coral #d97768`（节令/强调）、赭金 `--ss-gold #b99c6b`（节气）、
  象牙白 `--ss-ivory #f2efe9`（自定义）。
- **注意**：由 `--dsw-alias-*` 派生出来的 `--ss-*` 必须声明在 `body{}`，不要放 `:root`
  （DSH 的 alias token 定义在 body，`:root` 里会变成 guaranteed-invalid，导致表面色/弱化文字全部失效）。
- 字体：标题与倒计时数字用宋体字族 `--ss-serif`（Noto Serif SC / 思源宋体 / 宋体）。
- 样式：每个分片用 `pushCss(\`...\`)` 注入，类名前缀用自己的（`ss-ring-*`、`ss-drawer-*`…），
  不要在别人的类上改样式。
- 文案：所有可见文字走 `T('中文', 'English')`；数字/日期用 `SS.fmt.*`；不要写死颜色/字号比例。

---

## 6. 生效矩阵

| 改了什么 | 生效方式 |
|---|---|
| `src/parts/*.js` → `node build.mjs` | 刷新 DSH 页面即可（插件是 `link:` 安装） |
| `icon.svg`、`locale/*.json`、README/docs | 刷新页面 / 插件管理页刷新 |
| `index.js`（Host half，目前为空）、`cordis.patch.yml`、`package.json` 的 `dsh` 段 | **重启 DSH** 或插件管理重新安装 |
| `10-cal-data.js` 重新生成 | 重新 `node build.mjs` + 刷新页面 |
| 移动了插件目录 | 插件管理里卸装后重新 `install_bundle` 到新路径 |

---

## 7. 提交 / 发布

- 提交信息用约定式前缀：`feat:` / `fix:` / `docs:` / `chore:` / `style:`。
- 发布新版本：改 `package.json` 的 `version` → `node build.mjs` → 跑完第 1 节自检 →
  `git commit` → `git tag vX.Y.Z` → `git push && git push --tags`。
- 不要提交：`node_modules/`、`*.log`、`tools/hko/raw/`（.gitignore 已覆盖）；
  提交前保持 `git status` 干净。

---

## 8. 常见问题

| 现象 | 排查 |
|---|---|
| 侧栏没有「岁时」 | 看 profile 依赖是否还是 `link:D:/workspace/python/dsh-suishi`；刷新页面；插件是否被禁用 |
| 改了代码没变化 | 是否忘了 `node build.mjs`；浏览器是否强刷；`client.js` 是否真被重写 |
| 页面白屏 / 控制台有 `[suishi]` 报错 | `node build.mjs --check` 先过语法；看浏览器控制台首个错误；90-apply 里槽位注册异常会被 try/catch 打日志 |
| 卡片表面/弱化文字丢失 | 检查 `--ss-*` 派生变量是否误写到 `:root`（必须 `body`） |
| 年轮盘/列表不更新 | Store 快照没有重算；确认操作走的是 `Store.act.*` 而不是直接改对象 |
| 农历测试报缺数据 | 运行 `node tools/hko/fetch.mjs`（需要网络） |
| 提醒不出现在右下角 | 设置里提醒是否开启；最近事件是否在 `leadDays` 内；当天是否已被点掉（localStorage） |

---

## 9. 设计稿与验收

原始参考截图与独立 QA 报告是会话过程产物，**不在本仓库**（避免第三方素材版权与隐私问题）。
如果需要复刻参考视觉，请以 README 截图与 `docs/` 内图片为准；QA 报告可在需要时重新生成。
