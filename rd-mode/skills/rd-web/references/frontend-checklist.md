# 上线前检查表（前端）

## 功能
- [ ] 所有链接可用，无 404；target=_blank 的外链带 rel="noopener noreferrer"
- [ ] 表单：必填校验、错误提示、成功反馈、防重复提交；后端同样校验
- [ ] 404 页面、加载态、空状态、错误态都有处理

## 兼容
- [ ] Chrome、Edge、Safari、Firefox 最新两个版本（或项目指定的范围）
- [ ] 360 / 768 / 1280 宽度无错位、无横向滚动
- [ ] 深色模式（如支持）正常；系统字体放大到 200% 仍可阅读

## 可访问性
- [ ] 对比度达标；焦点可见；主流程可纯键盘完成
- [ ] 图片 alt、表单 label、按钮的可读名称齐全；html lang 正确

## 性能
- [ ] 图片已压缩并声明尺寸；首屏以外懒加载
- [ ] 生产构建开启压缩与缓存；没有未使用的大依赖
- [ ] 能运行 Lighthouse 时：Performance、Accessibility、Best Practices、SEO 均 ≥ 90，否则说明原因

## SEO 与分享
- [ ] title、description、canonical、Open Graph / Twitter 卡片、分享图
- [ ] robots.txt、sitemap.xml；favicon 与 apple-touch-icon

## 合规与统计
- [ ] 收集个人信息或使用统计时，有隐私政策与 Cookie 提示
- [ ] 需求包含统计时，埋点与转化事件已验证会触发

## 交付物
- [ ] 访问地址或启动命令；截图路径；待替换素材清单；已知问题
