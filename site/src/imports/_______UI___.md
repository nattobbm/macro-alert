# CYPERMOW 网站元素框架（给UI设计用）

> 用途：拿这份清单里的英文关键词去搜参考/喂设计工具（Dribbble、Mobbin、v0、GPT画图都认这些词）。
> 每个组件标了：放什么数据、现在怎么展示、交互、英文关键词。
> 数据全部来自一个文件 `data/latest.json`，每次自动更新——UI只管展示，不用管数据怎么来。

---

## 0. 全局设计系统

| 项 | 现状 | 英文关键词 |
|---|---|---|
| 视觉风格 | 软UI浮雕：卡片与背景同色，左上亮影+右下暗影；凸=内容卡，凹=激活态/屏幕 | `neumorphism` `soft ui` `soft shadow interface` `tactile minimal ui` |
| 主题 | 4套可切换：浅灰蓝(默认) / Catppuccin Latte / Catppuccin Mocha(深) / Nord(深)，记住用户选择 | `theme switcher` `color scheme toggle` `catppuccin palette` `nord palette` |
| 字体 | 中文 Noto Sans SC，数字 Baloo 2（圆润等宽感） | `rounded font numerals` `friendly sans-serif` |
| 数据色 | 图表8色固定顺序（色盲安全已验证）；状态三色=红(破了)/黄(快到了)/绿(安静) | `colorblind safe categorical palette` `status colors semantic` |
| 布局 | 单栏卡片流，手机优先；宽屏时快照/雷达是自适应网格 | `bento grid` `card based dashboard` `mobile first dashboard` |
| 导航 | 4个标签页，手机端固定底栏药丸，当前页凸起 | `pill tab bar` `bottom navigation mobile` `segmented control` |
| 文案规矩 | 名字=现象/因果描述，专业词括号跟随，悬停出原术语；判定在前证据折叠 | `progressive disclosure` `tooltip glossary` |

---

## 1. 页面结构（4个标签页）

```
🏠 总览   现在市场什么状态 —— 地球 + 警戒线雷达 + 快照
🧠 推理   为什么、看什么 —— 逻辑链 + 结论库 + 预测记分卡 + 消息流 + 日历
📈 正股   SPX专用监控 —— K线+期权价位 + GEX + 拍卖 + 规则警报
🗃️ 数据   原料区 —— 数据体检 + 全部走势图
```

---

## 2. 总览页组件

### 2.1 三维地球（主视觉）
- **数据**：日/英/中三国持有美债的最新数量和月变化；红色飞线=在卖出
- **展示**：深色太空窗嵌在软UI框里，自转地球，国家上有光点+数字标签，飞线流向美国
- **交互**：可拖转；旁边浮层列三国数字
- 关键词：`3D globe data visualization` `arc flight lines map` `webgl globe dashboard hero`

### 2.2 当前状态标签（regime chip）
- **数据**：金融抑制判定的条件计数（如 1/3 条件成立），各条件当前值
- **展示**：地球左上角一个胶囊徽章 + 小字条件明细
- 关键词：`status chip` `condition checklist badge`

### 2.3 警戒线雷达（18张小卡）
- **数据**：18个观测点，各自离触发线还差百分之几；越线的排最前、变红
- **展示**：网格小卡：名字 / 当前值/阈值 / "还差x%"或"🔥越线了"
- **交互**：悬停显示规则出处
- 关键词：`threshold indicator cards` `KPI alert tiles` `distance to target gauge` `proximity meter`

### 2.4 市场快照（12张卡）
- **数据**：SPX/VIX/黄金/美元/日元/油/10Y/30Y/真利率/MOVE等：值、日涨跌、数据日期、来源
- **展示**：数值大字 + 涨绿跌红小字 + 右下角迷你走势线（近40天）
- 关键词：`stat card with sparkline` `metric tile` `mini line chart card`

---

## 3. 推理页组件（核心页）

### 3.1 逻辑链（6条，最重要的组件）
- **数据**：每条链=一句因果描述 + 4-6个节点；每个节点绑一个实时指标，自动判定：🔥破了/⚠️快到了/🟢安静/📌事实
- **展示**：横向节点卡片流，节点间箭头连接；节点卡=状态图标+名字+当前值/阈值+距离；整条链按"热度"排序，最活跃的排最上
- **交互**：横向滚动；点链标题展开"什么时候这条链失效"；悬停节点出专业术语
- 关键词：`horizontal stepper flow` `node link diagram cards` `causal chain visualization` `pipeline status flow` `process timeline horizontal`

### 3.2 结论库
- **数据**：验证过的研究结论：✅真的/❌假的/⏳还没定/🧪攒样本中/📌事实 + 一句话结论 + 数字证据
- **展示**：徽章在前+结论一句话，点开才见证据和出处（判定在前，证据折叠）
- 关键词：`verdict list` `collapsible fact cards` `evidence accordion` `research ledger`

### 3.3 预测记分卡
- **数据**：开放/已结算预测数；每张预测卡（问题、锁定状态🔒、结算日）；9月加息概率三个来源并列（期货算的/官网读的/押注市场）
- **展示**：概率徽章排 + 预测卡列表
- 未来要加：概率随时间的折线（数据每天在攒）
- 关键词：`prediction market card` `probability comparison badges` `forecast tracker` `scorecard ui`

### 3.4 官方消息流
- **数据**：美联储/能源署等官方RSS标题，每条自动打标签（连着哪条逻辑链），时间
- **展示**：列表流：彩色链标签 + 标题 + 来源和"几小时前"
- 关键词：`news feed with tags` `activity timeline` `log stream ui`

### 3.5 未来30天日历
- **数据**：大事清单（FOMC、发布会、截止日），星标重要度，每条带"该看什么"
- **展示**：日期块 + 事件 + 灰字提示
- 关键词：`upcoming events timeline` `agenda list` `date badge list`

### 3.6 待整理箱（inbox）
- **数据**：丢进 knowledge/inbox 的新文件清单
- **展示**：文件名+日期链接列表
- 关键词：`file drop inbox list`

---

## 4. 正股页组件

### 4.1 K线 + 期权价位叠加（对标GammaFrame）
- **数据**：SPX日K（130天）+ 三条水平线：上方期权密集位(call墙,绿)/下方(put墙,红)/gamma翻转位(黄)
- **展示**：TradingView开源引擎的K线，价位线带标签钉在右轴
- 关键词：`candlestick chart price level overlay` `trading terminal chart` `support resistance lines chart`

### 4.2 各价位对冲压力（GEX柱状图）
- **数据**：现价±4%每个行权价的call持仓(绿向上)/put持仓(红向下)，现价虚线
- **展示**：正负堆叠柱状图
- 关键词：`diverging bar chart by strike` `options open interest profile` `volume profile horizontal`

### 4.3 对冲压力汇总条
- **数据**：总量、当日到期部分、正/负gamma状态、三个关键价位数字
- **展示**：一行徽章+数字
- 关键词：`summary stat strip`

### 4.4 国债拍卖表
- **数据**：近6场：期限/日期/规模/认购倍数/海外买家占比/尾差
- **展示**：紧凑表格，凹面容器
- 关键词：`dense data table` `inset table container`

### 4.5 规则警报（30条）
- **数据**：每条规则：🔥响了/🔕静音/🟢正常/⏸️跳过/✍️人工，触发值，因果说明，失效条件
- **展示**：状态排序列表，点开见详情
- 关键词：`alert rules list` `monitoring status list` `expandable alert rows`

---

## 5. 数据页组件

### 5.1 数据体检
- **数据**：43个数据源 ok/过期计数 + 过期清单（原因）
- **展示**：徽章 + 灰字清单
- 关键词：`system health status` `data freshness monitor`

### 5.2 走势图组（6张）
- **数据**：真利率×黄金双轴、30年利率(带前高/失控区虚线)、SPX/黄金比、利率曲线、黄金大户持仓、三国持仓美债
- **展示**：卡片网格，每张一个主题，凹面屏
- 关键词：`line chart grid` `dual axis chart`（注：双轴以后要拆成两张，规范禁双轴）`reference line annotation chart`

---

## 6. 交互模式汇总

| 模式 | 用在哪 | 关键词 |
|---|---|---|
| 判定在前，证据折叠 | 结论库、规则、逻辑链失效条件 | `progressive disclosure` `accordion detail` |
| 悬停出术语原词 | 所有人话标签 | `hover tooltip definition` |
| 状态色+图标双编码（不只靠颜色） | 所有状态 | `icon + color dual encoding accessibility` |
| 横滚节点流 | 逻辑链 | `horizontal scroll snap cards` |
| 主题即时切换并记住 | 全局 | `persistent theme preference` |
| 可安装成手机App | 全局（PWA） | `progressive web app` `add to home screen` |

---

## 7. 每个数字的三件套（本站铁律，UI别丢）

任何显示数字的组件必须同时可见：**值 + 数据日期(as_of) + 来源**。过期数据整卡变灰虚线。这是这个系统存在的理由（防旧数据事故），美化时不许牺牲。
