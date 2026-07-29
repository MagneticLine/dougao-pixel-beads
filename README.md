# 豆稿

把经过缩放、压缩或轻微模糊的像素图，以及带透视和反光的实物拼豆照片，整理成网格明确、颜色稳定、可以直接照着制作的拼豆图纸。

## 项目记录

- [版本迭代记录](CHANGELOG.md)
- [品牌色表与颜色映射改造计划](docs/color-system-redesign-plan.md)
- [品牌颜色匹配技术设计](docs/color-matching-technical-design.md)
- [统一自动网格识别研究](docs/recognition-algorithm.md)
- [识别样本自愿贡献规划](docs/recognition-data-contribution-plan.md)

## 特点

- 纯静态网页，不需要数据库或应用服务器。
- 图片只在访问者的浏览器中处理，不会上传。
- 自动推测网格行列数，也可以用输入框或滚轮逐格调整。
- 原图校准占用主预览区并自动聚焦主体；默认矩形框选，也可切换自由四角校正透视。
- 拖动框选角点时显示无边圆形放大镜，镜内隐藏角点并用中心十字辅助精确对齐。
- 提供类似手机相册的旋转滑杆，可在 ±15° 内微调图片水平，网格与最终取样同步更新。
- 首页会提示剪贴板粘贴能力；检测到图片后先显示缩略图，再由用户确认使用。
- 实物照片模式使用环形取色避开拼豆中心孔和高光，并降低光照色差的影响。
- 在格子安全内区提取覆盖面积最大的主色簇，自动排除细小编号、抗锯齿文字、模糊边缘和压缩噪点。
- 可控制去杂色强度、近似色合并程度，并可在 1–256 之间自定义最大色数。
- 内置 MARD、Hama、Nabbi、Yant、Perler、Artkal 的 15 套社区色表，也可选择“无品牌”保留识别原色。
- 品牌匹配同时提供逐色 CIEDE2000 最近色和整套配色协调方案；每种原色都能查看候选、人工指定并锁定色号。
- 可手动修改单颗豆，并支持撤销、重做。
- 可导出带品牌色号和采购统计的 PNG、CSV、JSON 工程数据，也可以打印或存为 PDF。
- 支持桌面浏览器和手机浏览器，并提供离线缓存。

## 本地使用

需要 Node.js 22.13 或更高版本。

```bash
npm run dev
```

然后访问 `http://127.0.0.1:4173/`。本地服务器直接提供 `public` 目录，并使用与 Cloudflare Pages 相同的单页回退规则。离线缓存、剪贴板授权和其他需要安全来源的浏览器功能应以这个本地地址为准测试。

`npm run build` 与 `npm run sync:static` 都会把部署文件同步到 `public`，不需要安装第三方运行时依赖。

色表固定在仓库内，不会在用户打开网页时联网更新。维护者可运行：

```bash
npm run check:beadcolors
```

该命令只比较本地固定提交与 BeadColors 上游 `master`，发现更新时返回失败；它不会自动改写色表。仓库中的定时 GitHub Actions 每周执行同一检查。

## 部署

生产环境由 Cloudflare Pages 连接 GitHub 仓库自动部署：

| 配置 | 内容 |
| --- | --- |
| Project name | `dougao-pixel-beads` |
| Production branch | `main` |
| Framework preset | `None` |
| Build command | `npm run sync:static` |
| Build output directory | `public` |
| Root directory | 留空 |
| Environment variables | 不填 |

线上地址：<https://dougao-pixel-beads.pages.dev/>

部署产物仅包含静态页面、脚本、内置色表、识别实验室、Manifest、Service Worker、图标、分享图片和 Cloudflare `_headers`。项目不包含服务端函数、数据库或图片上传接口。

## 使用建议

1. 先检查网格是否与原图豆子边缘对齐。
2. 有白边、标题或水印时先用裁切去掉。
3. 图片压缩严重时提高去杂色强度。
4. 实际采购颜色太多时提高近似色合并或降低最大颜色数。
5. 少量有意保留的细节可以在颜色表中选色后，直接点击图纸中的单颗豆子修正。

行列数、裁切和颜色参数修改后都会自动重新生成图纸；“重新自动识别”按钮只用于重新推测行列数。

## 品牌色表来源

内置品牌色号与近似 RGB 固定取自 MIT 许可的 [BeadColors](https://github.com/maxcleme/beadcolors)，当前固定提交和完整许可见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

这些 RGB 是社区整理的屏幕近似值，不是品牌官方数字色值，也不能消除实物批次、材质、光照、相机和显示器造成的色差。品牌模式应视为采购候选与校色辅助，重要作品仍建议对照实体色卡。

## 隐私

应用不包含上传接口、统计脚本或运行时色表请求。原图、图纸和编辑记录仅存在于当前页面内存中；浏览器本地存储只保存去杂色、合并程度、所选色表等界面偏好。
