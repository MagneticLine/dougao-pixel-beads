# 品牌颜色匹配技术设计

状态：实现稿 v1（v70 待验收）  
日期：2026-07-29  
关联计划：《[品牌色表与颜色映射改造计划](color-system-redesign-plan.md)》

## 目标

当用户选择某个品牌色表时，把图片中已经识别出的整套颜色映射为可采购的品牌色号，同时尽量满足两类目标：

1. 每个品牌色单独看都接近对应的原图颜色；
2. 整套品牌色仍保留原图的明暗、色相、饱和度和相邻关系。

算法允许结果整体略微偏暖、偏冷、偏亮或偏暗，但应避免不同颜色分别向相反方向偏移。未选择品牌时不进行颜色量化，图纸继续使用原图本色。

本设计只处理“已经识别出的颜色如何映射到品牌色表”，不负责：

- 推测网格行列和四角；
- 从图片中重新分割颜色；
- OCR 读取图片中的品牌色号；
- 获取或校准品牌官方色值；
- 生成新的像素画。

## 当前实现状态

本方案已经接入 v70 本地候选版本：

- `bead-palettes.js`：固定保存 BeadColors 提交 `29229889daab404fb30531d4bb785fd73f7f58e3`，暴露 6 个品牌的 15 套可选色表；
- `color-matching-core.js`：实现 sRGB → CIELAB D65、OKLab、CIEDE2000、颜色邻接图、逐色最近和全局协调方案；
- `app.js`：保留原图颜色模型，接入品牌选择、整套方案切换、单色候选、完整色表搜索、人工锁定和无品牌回退；
- PNG、CSV、JSON 和打印共用当前品牌映射；品牌模式的格子直接显示品牌色号，采购表会合并相同目标色号的数量；
- `npm run check:beadcolors` 与每周定时工作流只检查上游是否变化，不自动替换生产数据。

匹配搜索已经改为增量更新评分：每次试探候选只重算当前颜色、全局偏移统计及其邻接边。当前开发机的合成压力测试中，104 种原色匹配 MARD 291 色由约 4.2 秒降到约 0.11 秒；这一数值只用于回归比较，不作为所有设备的性能承诺。

尚未纳入本阶段的内容：

- OCR 识别现有图纸中的品牌色号；
- 用实体色卡或受控摄影重新标定社区 RGB；
- 特殊材质的结构化筛选；
- 线上匿名采集用户修正数据。

## 核心原则

### 识别与匹配分离

```text
图片与网格
  ↓
原图颜色 sourcePalette + 原图格子 sourceCells
  ↓
品牌匹配 mappings
  ↓
派生图纸 renderPalette + renderCells
```

切换品牌或匹配方案只能改变 `mappings` 和派生图纸，不能重新识别图片、改变框选或覆盖原图颜色。

### 原始信息不丢失

任何时候都同时保留：

- 原图颜色；
- 当前品牌色；
- 品牌色号；
- 自动候选及评分；
- 用户是否人工指定或锁定；
- 当前使用的色表及版本。

自动匹配可以把多个原图颜色映射到同一个品牌色，但不能删除这些原图颜色之间的区别。用户换品牌或撤销合并时，应能从原始状态重新计算。

### 确定性与可复现

相同的图片、网格、参数、色表版本和锁定项必须得到相同结果。算法不能依赖未固定的随机数、远端实时数据或当前设备显示尺寸。

## 术语

| 名称 | 含义 |
| --- | --- |
| `SourceColor` | 从原图格子中识别出的颜色组 |
| `SourceCell` | 一个格子所属的 `SourceColor` |
| `BeadColor` | 某个品牌色表中的一个色号及其近似 RGB |
| `ColorMapping` | 一个 `SourceColor` 到一个 `BeadColor` 的映射 |
| `MappingScheme` | 一整套颜色映射方案 |
| `RenderPalette` | 根据映射派生、真正用于预览和导出的颜色；仍逐项保留原图颜色身份 |
| `PaletteRevision` | 豆稿固定使用的上游色表快照版本 |

## 状态模型

### 原图颜色

```js
{
  id: "source-001",
  rgb: { r: 65, g: 204, b: 255 },
  lab: { l: 78.2, a: -18.1, b: -34.5 },
  oklab: { l: 0.81, a: -0.08, b: -0.12 },
  count: 126
}
```

`id` 只用于当前识别结果和工程数据，不使用品牌形式的 `A1`、`B1`。图纸内部标记另设 `marker` 字段。

### 品牌颜色

```js
{
  code: "C4",
  name: "C4",
  rgb: { r: 65, g: 204, b: 255 },
  lab: { l: 78.2, a: -18.1, b: -34.5 },
  oklab: { l: 0.81, a: -0.08, b: -0.12 }
}
```

Lab 和 OKLab 不在上游数据中重复维护，由豆稿使用同一套转换函数从 sRGB 派生。

### 单个映射

```js
{
  sourceId: "source-001",
  paletteId: "mard-221",
  paletteRevision: "beadcolors-<commit>",
  targetCode: "C4",
  targetRgb: { r: 65, g: 204, b: 255 },
  method: "coherent",
  locked: false,
  localDeltaE00: 2.7,
  candidates: [
    { code: "C4", deltaE00: 2.7 },
    { code: "C3", deltaE00: 4.1 }
  ]
}
```

`method` 至少包括：

- `identity`：无品牌，使用原图本色；
- `nearest`：逐色 CIEDE2000 最近色；
- `coherent`：全局配色关系优化；
- `manual`：用户人工指定。

### 应用状态

v70 已落地以下状态：

```text
state.sourcePalette
state.sourceCells
state.noBrandDraft
state.selectedPaletteId
state.selectedPaletteRevision
state.mappingResults
state.activeMappingSchemeId
state.lockedMappingsByPalette
```

当前 `state.palette` 和 `state.cells` 暂时保留为派生的渲染兼容层，让现有预览、PNG、CSV、打印和统计代码逐步迁移，而不是一次重写全部功能。

## 色表输入

匹配引擎只接受已经规范化和通过校验的本地色表：

```js
{
  paletteId: "artkal-s-5mm",
  revision: "beadcolors-<commit>",
  colors: [...]
}
```

品牌切换发生在本地，不在运行时请求 GitHub。色表数据的固定快照、更新检查和来源声明见总计划中的“上游依赖与自动更新策略”。

无品牌模式不构造虚拟品牌色表，直接生成 `identity` 映射。

## 色彩计算

### 统一输入

所有颜色先视为 8 位 sRGB：

1. sRGB 通道去伽马得到线性 RGB；
2. 线性 RGB 转 XYZ D65；
3. XYZ D65 转 CIELAB D65；
4. 线性 RGB另行转 OKLab。

透明格子不进入品牌匹配，继续保持透明。

### 单色距离：CIEDE2000

候选排序使用 CIEDE2000，而不是 RGB 欧氏距离，也不直接复用当前的 `labDistance()`。

当前 `labDistance()` 会根据照片模式降低明度权重，它适用于现有聚类逻辑，但品牌匹配函数必须是独立、纯净、与当前界面模式无关的函数：

```js
deltaE00(labA, labB)
```

实现必须使用 Sharma、Wu、Dalal 给出的补充测试数据验证，特别检查：

- 色相跨越 0°/360°；
- 平均色相计算；
- 蓝色区域的旋转项；
- 输入顺序交换后的对称性；
- 零彩度边界。

参考：

- <https://hajim.rochester.edu/ece/sites/gsharma/ciede2000/ciede2000noteCRNA.pdf>

### 配色关系：OKLab

CIEDE2000 是两个颜色之间的标量距离，适合生成单色候选，但不适合直接描述“整套颜色向同一方向偏移”。

全局关系使用 OKLab 向量：

```text
sourceOffset(i) = targetOKLab(i) - sourceOKLab(i)
sourceRelation(i,j) = sourceOKLab(i) - sourceOKLab(j)
targetRelation(i,j) = targetOKLab(i) - targetOKLab(j)
```

OKLab 的三个分量可以直接用于近似感知关系计算，并且实现成本适合纯前端。

参考：

- <https://bottosson.github.io/posts/oklab/>

## 从图纸构建颜色关系图

原图颜色不是彼此孤立的。算法从 `sourceCells` 构建无向邻接图：

1. 遍历每个格子的右侧和下侧邻居；
2. 跳过透明格和相同颜色；
3. 对每一对不同颜色累计边界接触次数；
4. 得到颜色节点、使用量和邻接边。

节点权重：

```text
nodeWeight(i) = sqrt(cellCount(i))
```

边权重：

```text
edgeWeight(i,j) = sqrt(sharedBoundaryCount(i,j))
```

随后分别归一化到总和为 1。平方根可以防止大面积背景完全支配小面积但承担轮廓作用的颜色。指数最终作为实验参数验证，不直接暴露给普通用户。

只有真实相邻的颜色进入主要关系损失；全局色偏一致性另行覆盖不相邻颜色。

## 第一阶段：候选生成

对每个 `SourceColor`：

1. 与当前品牌色表的全部 `BeadColor` 计算 CIEDE2000；
2. 按 `deltaE00`、色号稳定排序；
3. 默认保留前 `K = 12` 个候选；
4. 用户锁定的品牌色即使不在前 12，也必须保留；
5. 保存第一与第二候选的距离差，作为局部可信度证据。

首版不设置“距离超过某值就完全没有结果”的硬门槛。品牌色域不足时仍返回候选，但通过低可信提示告诉用户需要人工判断。

`K = 12` 是初始实验值，最终根据速度和验证集调整。

## 基线方案：逐色最近

基线方案对每个原图颜色独立选择最小 CIEDE2000 候选：

```text
nearest(i) = argmin deltaE00(source(i), bead(j))
```

它的用途：

- 提供最容易解释的参考结果；
- 验证 CIEDE2000 和色表接入是否正确；
- 作为全局算法的初始解；
- 在全局求解异常或超时后回退；
- 在实验页与全局方案并排比较。

基线不是最终默认方案，因为它可能让不同颜色向不同方向偏移。

## 全局方案：保持配色关系

### 总目标

对一套映射 `f` 定义：

```text
Total =
  λlocal × LocalError
  + λcast × CastVariance
  + λrelation × RelationError
  + λorder × LightnessOrderError
  + λmerge × MergeError
```

每一项先归一化，再由配置中的权重组合。权重通过实验和人工验证确定，不在没有数据时拍脑袋固化。

### 单色误差

```text
LocalError =
  Σ nodeWeight(i) × normalizedDeltaE00(source(i), target(f(i)))
```

这一项防止算法为了整体协调而选择单独看明显错误的颜色。所有自动目标仍限制在每个原色的前 K 个候选内。

### 全局色偏方差

每种颜色的偏移：

```text
offset(i) = targetOKLab(f(i)) - sourceOKLab(i)
```

计算加权平均偏移：

```text
meanOffset = Σ nodeWeight(i) × offset(i)
```

再计算：

```text
CastVariance =
  Σ nodeWeight(i) × |offset(i) - meanOffset|²
```

如果所有颜色整体向相近方向偏移，这一项较小；如果一个颜色偏蓝、另一个颜色偏黄，这一项会显著增大。

### 相邻关系失真

对颜色邻接图中的每条边：

```text
sourceRelation = sourceOKLab(i) - sourceOKLab(j)
targetRelation = targetOKLab(f(i)) - targetOKLab(f(j))
```

```text
RelationError =
  Σ edgeWeight(i,j) × |sourceRelation - targetRelation|²
```

这会优先保护真实画面中相邻颜色承担的轮廓、阴影和渐变关系。

### 明暗顺序反转

当原图中两个相邻颜色的明度差足够明显，而目标颜色的明暗顺序相反时增加惩罚：

```text
sourceLightness = sourceL(i) - sourceL(j)
targetLightness = targetL(f(i)) - targetL(f(j))
```

仅在 `abs(sourceLightness)` 超过小阈值时检查：

```text
LightnessOrderError +=
  edgeWeight(i,j) × max(0, -sourceLightness × targetLightness)
```

非常接近的原图明度不强制排序，避免把噪声当成设计意图。

### 不合理合并

两个原图颜色映射到同一色号不一定错误。相近且不相邻的颜色可以安全合并；承担边界的明显不同颜色则不应轻易合并。

当 `f(i) = f(j)` 时：

```text
MergeError +=
  edgeWeight(i,j) × clamp(sourceDistance(i,j) / mergeScale, 0, 1)²
```

本项只惩罚丢失有意义的视觉区别，不强制一对一映射。

## 求解方法

该目标含颜色之间的二次关系，不能直接用单纯的匈牙利算法求解。首版使用确定性的多起点局部搜索。

### 初始解

至少生成：

1. 逐色 CIEDE2000 最近解；
2. 以高权重颜色的若干候选作为“共同色偏锚点”，其他颜色选择与该偏移最一致的候选；
3. 保留用户锁定项后重新生成的候选解。

### 局部优化

对每个初始解：

1. 按节点权重和邻接影响排序颜色；
2. 尝试把当前颜色替换为其余候选；
3. 只重新计算与该颜色有关的局部损失；
4. 接受使总分下降的最佳替换；
5. 再尝试少量高影响颜色之间的候选交换；
6. 重复直到一轮没有改善或达到迭代上限。

所有相同分数按目标色号稳定排序，保证结果确定。

### 复杂度

设：

- 原图颜色数为 `N`；
- 品牌色表大小为 `M`；
- 每个原色保留候选数为 `K`；
- 颜色邻接边数为 `E`。

候选生成约为 `O(N × M)`。局部优化只更新相关邻接边，目标约为 `O(iteration × N × K × localDegree)`。

典型拼豆图只有十几到几十种原图颜色，适合在浏览器执行。若颜色数、行列数或实验结果表明主线程卡顿，再把候选生成和全局求解移入 Web Worker；不在证据不足时提前增加线程复杂度。

## 结果与候选方案

匹配引擎至少返回：

```js
{
  nearest: MappingScheme,
  coherent: MappingScheme,
  alternatives: MappingScheme[],
  diagnostics: {
    runtimeMs,
    localError,
    castVariance,
    relationError,
    lightnessInversions,
    mergedAdjacentPairs
  }
}
```

实验阶段同时展示：

- 单色最接近；
- 整体配色协调；
- 一至两个得分接近但配色方向不同的全局候选。

正式产品是否让普通用户选择整套方案，由实验结果和后续交互设计决定。无论是否展示，逐色最近始终保留为可解释基线。

## 可信度

### 单色可信度

综合：

- 第一与第二候选的 CIEDE2000 差距；
- 当前选择相对单色最佳色的额外误差；
- 该颜色在整张图中的使用量；
- 该颜色是否承担高权重邻接边。

### 整体可信度

综合：

- 最佳全局方案与第二方案的总分差；
- 是否存在大量明暗反转；
- 是否有高权重相邻颜色被合并；
- 是否有多个颜色只能选择距离很远的品牌色；
- 结果对轻微权重变化是否稳定。

可信度只用于解释和提示，不伪装成统计概率。

## 用户锁定与人工指定

- `locked = true` 的映射作为硬约束，不参与自动替换；
- 人工指定的色号自动进入候选集合；
- 重算只处理未锁定项；
- 锁定项仍参与全局关系评分，让其他颜色围绕用户决定重新优化；
- 切换到另一品牌时，当前锁定色号不跨品牌复用；
- 可以按 `paletteId + revision` 暂存每个品牌的人工方案，用户切回原品牌时恢复；
- 色表 revision 变化后先校验旧色号是否仍存在，不静默换成另一个色号。

## 无品牌模式

无品牌模式不运行 CIEDE2000 或全局求解：

```text
targetRgb = sourceRgb
targetCode = null
method = identity
```

导出只显示图纸标记和识别色，不显示品牌色号。用户人工修改图纸颜色时，可保存为自定义目标色，但仍不能冒充品牌色号。

## 特殊效果色

BeadColors 的不同品牌数据并不统一提供透明、夜光、珠光、荧光等结构化标签。首版不根据 RGB 猜测材质。

处理方式：

- MARD 221 与 291 作为两个明确色表选项；
- 其他品牌按 BeadColors 已提供的系列分别选择；
- 色表没有可靠材质元数据时，不显示伪造的效果标签；
- 后续补齐 metadata 后，才增加“不透明色自动匹配、特殊色手动启用”等过滤能力。

## 现有代码迁移

当前实现把目标图纸颜色、内部标记、用户色号和原图匹配色集中在 `state.palette` 的一个条目中：

```text
color.rgb
color.name
color.code
color.matches[]
```

这会让品牌切换、多个方案和原始颜色恢复变得困难。迁移分为四步：

### 第一步：冻结识别结果

- 在颜色聚类完成后建立 `sourcePalette`；
- 当前格子索引保存为 `sourceCells`；
- 生成后不因品牌切换而变化。

### 第二步：增加匹配核心

- 新建独立的颜色转换、CIEDE2000、邻接图和匹配模块；
- 模块不访问 DOM、`state` 或当前页面模式；
- 使用普通数组和对象作为输入输出，便于单元测试。

### 第三步：生成兼容渲染模型

- 根据 `sourceCells + activeMappingSchemeId` 派生现有格式的 `palette + cells`；
- 多个原色指向同一目标色号时，渲染层仍保留各自来源，图例与采购统计再按目标色号合并计数；
- 现有预览和导出先继续消费兼容模型。

### 第四步：颜色编辑器迁移

- 将“吸取原图颜色”和“选择目标品牌色”拆成不同动作；
- 旧的 `matches[]` 拖动交互迁移为 `SourceColor → BeadColor` 映射操作；
- 完成后再移除旧字段兼容层。

## 工程数据与导出

工程数据增加颜色模型版本，并保存：

```text
colorModelVersion
sourcePalette
sourceCells
paletteId
paletteRevision
mappingScheme
lockedMappings
```

旧工程迁移规则：

- 旧 `#RRGGBB` 色号按无品牌自定义色处理；
- 旧 `A1`、`B1` 等名称只作为图纸标记，不解释成 MARD 色号；
- 不根据文本形式猜测旧工程使用了哪个品牌。

PNG、CSV、打印和采购统计全部从同一个派生渲染模型读取，避免一种导出显示品牌色号、另一种仍显示内部标记。

## 测试

### 色彩数学

- sRGB、XYZ、Lab、OKLab 已知值；
- [Sharma 等人发布的 CIEDE2000 34 组补充测试数据](https://hajim.rochester.edu/ece/sites/gsharma/ciede2000/dataNprograms/ciede2000testdata.txt)；
- CIEDE2000 对称性；
- 色相 0°/360° 和零彩度边界；
- 不允许 `NaN`、负零和平台相关排序。

### 匹配不变量

- 无品牌模式逐色保持完全相同的 RGB；
- 只有一个原图颜色时，全局方案等于逐色最近；
- 用户锁定色永远不被替换；
- 同一输入重复运行结果完全一致；
- 改变 DOM、预览尺寸或设备像素比不改变结果；
- 品牌切换不改变 `sourcePalette` 和 `sourceCells`；
- 色表内存在完全相同 RGB 时使用稳定色号排序。

### 合成关系案例

- 构造“所有目标颜色统一偏蓝”与“一个偏蓝、一个偏黄”的候选，验证全局方案偏好前者；
- 构造浅、中、深三个颜色，验证明暗顺序不反转；
- 构造相邻轮廓色和非相邻近似色，验证合并惩罚只保护有意义的边界；
- 构造品牌色域不足场景，验证仍返回结果并降低可信度。

### 实际图纸

至少覆盖：

- 无网格游戏像素画；
- 已使用品牌色号创作的图纸；
- 普通像素插画；
- 拼豆成品照片；
- 受整体光照偏色影响的照片。

每张样本保存人工偏好的整套方案，不只保存每个颜色的最近色。

## 评估指标

自动记录：

- 加权平均 CIEDE2000；
- 全局色偏方差；
- 相邻关系失真；
- 明暗顺序反转数；
- 高权重相邻颜色合并数；
- 自动首选被人工保留的比例；
- 单色人工修改次数；
- 整体方案人工切换次数；
- 运行时间和峰值候选数。

最终判断不能只看总分。实验页需要把原图、本色图纸、逐色最近和全局方案并排展示，由人工确认哪套更接近原始配色意图。

## 实施顺序

1. 完成色彩数学纯函数及单元测试；
2. 建立 `SourcePalette`、`SourceCells` 和颜色邻接图；
3. 实现 CIEDE2000 逐色基线；
4. 实现全局目标函数和确定性局部搜索；
5. 在颜色实验页比较基线、全局方案和人工选择；
6. 根据验证结果确定权重、候选数和性能回退；
7. 接入主应用兼容渲染层；
8. 最后进入取色和改色交互阶段。

本阶段完成并经用户验收前不提交、不发布。

## 开放问题

- `K = 12` 是否需要按品牌色表大小自适应；
- 节点和边权重使用平方根是否优于对数或线性；
- 全局色偏方差与相邻关系误差的最佳权重；
- 多个整套配色方案的数量、排序和命名是否需要继续调整；
- 何时把计算移入 Web Worker；
- 对照片是否需要单独的白平衡估计，还是交给全局偏移一致性处理；
- 特殊材质元数据不足时，哪些品牌系列应拆成独立色表。

这些问题通过实验数据决定，不作为无依据的固定阈值写入生产代码。

## 后置上游协作 TODO

当前功能不依赖这些事项完成：

- 评估向 BeadColors 补充缺失或过期的品牌色号；
- 将豆稿发现的数据错误以 Issue 或 Pull Request 反馈给上游；
- 建议上游增加稳定数据 schema、版本标签和 GitHub Release；
- 讨论是否能补充材质效果、豆子尺寸、地区和数据来源字段；
- 如果上游愿意维护 Release，再把豆稿的更新检查从 commit SHA 切换到 Release tag。

上游协作应把改进反馈给社区，但不能让豆稿生产构建重新依赖浮动远端数据。
