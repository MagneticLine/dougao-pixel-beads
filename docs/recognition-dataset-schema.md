# 拼豆识别数据集与人工真值规范

本文档是豆稿识别数据集的规范性说明。标注工具、数据校验脚本、实验室和后续算法评测都应以这里的定义为准。

当前格式：

- `kind`：`dougao-recognition-dataset`
- `schemaVersion`：`2`
- 标注工具：`/?mode=annotation`
- 结构校验：`recognition/recognition-dataset-core.mjs`

标注模式直接复用产品主编辑器的图片缩放、矩形/自由四角、旋转、算法候选和网格预览。顶部横向队列负责切换原图，左侧设置区补充场景、数据划分、来源权利与保存状态；页面高度、预览尺寸和设置区吸附行为沿用主编辑器，不再维持旧标注页的单屏工作台布局。旧地址 `/annotation-tool/` 只保留兼容跳转，不再维护第二套编辑器。

## 1. 基本原则

1. **保留完整原图，不在标注阶段裁剪。**  
   算法可以在运行时提出主体区域，但真值必须能回到用户导入的完整图像坐标。
2. **外框表示最外层格线的四个交点。**  
   它不是最外圈豆子的中心，也不是人物不透明像素的外接矩形。
3. **原图和 JSON 分开保存。**  
   JSON 不含 Base64、Blob URL 或其他图片副本，通过原始文件的 SHA-256 配对。
4. **几何真值与素材来源同样必填。**  
   权利不明的网络图片可以进入私有测试集，但不能因技术上可下载就公开再分发。
5. **主体占完整图片 50% 以上是软先验。**  
   标注工具在覆盖率不足时提示复核，不强行拒绝合法的极端样本。

## 2. 坐标约定

浏览器解码图片后，以左上角为原点：

- `x` 向右增加；
- `y` 向下增加；
- 归一化坐标范围为 `[0, 1]`；
- 像素坐标参考 `browser-decoded-image`；
- 浏览器已经应用的 EXIF 方向视为解码结果的一部分。

四角固定按以下顺序保存：

```text
top-left → top-right → bottom-right → bottom-left
```

`cornersNormalized` 是权威几何值；`cornersImagePixels` 是便于检查和其他程序读取的冗余值，必须满足：

```text
pixel.x = normalized.x × decodedWidth
pixel.y = normalized.y × decodedHeight
```

四边允许形成凸四边形，以表达旋转和轻度透视，但不允许自交、退化或超出完整图片。

## 3. 标注包结构

一个标注包可以包含多张图片的人工真值：

```json
{
  "kind": "dougao-recognition-dataset",
  "schemaVersion": 2,
  "createdAt": "2026-07-30T12:00:00.000Z",
  "tool": {
    "name": "dougao-recognition-annotation-tool",
    "version": 2
  },
  "imagesIncluded": false,
  "coordinateSystem": {
    "origin": "top-left",
    "cornerOrder": [
      "top-left",
      "top-right",
      "bottom-right",
      "bottom-left"
    ],
    "normalizedRange": [0, 1],
    "pixelReference": "browser-decoded-image"
  },
  "samples": [
    {
      "sampleId": "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      "source": {
        "fileName": "example.png",
        "sha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        "mimeType": "image/png",
        "byteSize": 123456,
        "decodedWidth": 1200,
        "decodedHeight": 900
      },
      "imageTransform": {
        "crop": null,
        "coordinateSpace": "browser-decoded-image",
        "exifOrientationAppliedByDecoder": true
      },
      "scene": {
        "category": "pixel-art",
        "tags": ["grid-none", "plain-background", "jpeg-compression"]
      },
      "split": "development",
      "rights": {
        "status": "owned",
        "distribution": "repository-public",
        "creator": "example author",
        "sourceUrl": "",
        "license": "",
        "acquiredAt": "2026-07-30"
      },
      "groundTruth": {
        "cols": 20,
        "rows": 16,
        "cornerOrder": [
          "top-left",
          "top-right",
          "bottom-right",
          "bottom-left"
        ],
        "cornersNormalized": [
          { "x": 0.1, "y": 0.1 },
          { "x": 0.9, "y": 0.1 },
          { "x": 0.9, "y": 0.9 },
          { "x": 0.1, "y": 0.9 }
        ],
        "cornersImagePixels": [
          { "x": 120, "y": 90 },
          { "x": 1080, "y": 90 },
          { "x": 1080, "y": 810 },
          { "x": 120, "y": 810 }
        ],
        "frameCoverageRatio": 0.64
      },
      "annotation": {
        "note": "行列和四角已逐格复核。",
        "annotatedAt": "2026-07-30T12:00:00.000Z"
      }
    }
  ]
}
```

### 必填字段

- `source`：原始文件名、SHA-256、文件大小、MIME、浏览器解码宽高；
- `imageTransform.crop`：固定为 `null`；
- `scene.category`：四类素材场景之一；
- `scene.tags`：可组合的视觉标签数组，可以为空；
- `split`：开发、验证或锁定测试；
- `rights`：权利状态和允许的分发范围；
- `groundTruth`：行列、四角顺序、两套坐标和覆盖率；
- `annotation.annotatedAt`：本次人工保存时间。

## 4. 场景与视觉标签

`scene.category` 只用于统计覆盖率和分层评测，不用于要求产品先分类再识别：

| 值 | 含义 |
|---|---|
| `pixel-art` | 像素画；是否有网格、背景和退化情况由标签描述 |
| `pattern-chart` | 供玩家照着拼制的拼豆图纸 |
| `fused-bead-photo` | 已熨烫拼豆成品照片 |
| `holed-bead-photo` | 未熨烫、带孔洞或底板凸点的照片 |

`scene.tags` 描述算法在图像中实际能看到的证据。网格标签和背景标签各自最多选择一个，其余标签可以自由组合：

```text
grid-none
grid-visible
grid-faint
transparent-background
plain-background
complex-background
text-labels
color-codes
watermark
blur
jpeg-compression
noninteger-scaling
rotation
perspective
uneven-lighting
reflection
shadow
occlusion
multiple-subjects
missing-beads
```

旧版 `text-or-watermark` 只为导入 `schemaVersion: 1` 标注包时保留，新的标注界面不会再生成这个含义不明确的标签。旧版 `pure-pixel-art` 与 `complex-background-pixel-art` 会合并为 `pixel-art`，旧版 `labeled-pattern` 会迁移为 `pattern-chart`。

## 5. 数据划分与防泄漏

- `development`：可反复查看、调参、排查失败原因；
- `validation`：用于阶段性比较候选生成和排序方案，不能逐图调阈值；
- `holdout`：锁定测试集，在方案冻结前不查看逐图结果。

同一原图的裁切、压缩、模糊、旋转、透视和其他派生版本必须留在同一个划分中。仅仅换了文件名或重新编码，不会把它变成独立样本。建议按“来源族”分组后再划分，避免同一角色或同一次拍摄同时出现在开发集和测试集。

## 6. 来源、授权与分发

权利状态：

- `owned`：自己创作或拍摄；
- `authorized`：获得作者明确授权；
- `cc0`：CC0；
- `cc-by`：CC BY，发布时保留署名；
- `review-required`：来源已知但权利待核实；
- `unknown`：来源或再分发权未知。

分发范围：

- `private`：只在本机私有数据集中使用；
- `repository-public`：允许原图和标注进入公开仓库。

`unknown` 和 `review-required` 只能选择 `private`。公开发布前仍要人工复核作者、来源、许可文本及许可是否覆盖当前用途。

## 7. 推荐目录

公开与私有数据必须物理隔离：

```text
datasets/
  public/
    images/
      <sha256>.<ext>
    annotations/
      package.json
  private/
    images/
      <sha256>.<ext>
    annotations/
      package.json
  derived/
    manifest.json
```

标注工具不会替用户复制或重命名原图。归档时应：

1. 导出标准 JSON；
2. 按 `source.sha256` 核对本地原图；
3. 将原图复制到相应的公开或私有目录；
4. 运行结构和文件配对校验；
5. 公共数据再进行一次权利审核。

## 8. 人工质量检查

每张图片至少执行以下检查：

1. 放大确认四角命中最外层格线交点；
2. 沿横向和纵向各逐格计数一次；
3. 检查是否把孔洞中心、豆子中心或人物外接矩形误当成格线；
4. 检查透视图的四边是否仍覆盖同一网格平面；
5. 检查素材场景、视觉标签和来源信息；
6. 检查 SHA-256 是否能找到唯一原图。

锁定测试集建议由第二个人复核。若两人对行列或角点存在分歧，应保留争议状态，不要用平均值伪造确定答案。

## 9. 版本与兼容

- 新增可选字段可以保留 `schemaVersion: 2`；
- 改变坐标含义、角点顺序、必填字段或现有枚举时必须提升版本；
- 标注工具会在导入时把旧版五场景与 `difficultyFlags` 自动迁移为四场景与 `tags`，但导出始终使用版本 2；
- 读取器应拒绝未知的大版本，而不是猜测字段含义；
- 数据迁移脚本必须保留原始标注包，生成新的派生文件。

提交前运行：

```powershell
npm test
npm run check:recognition-data
npm run build
```
