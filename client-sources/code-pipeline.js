window.__ModuleLoader__.load({
  id: 'dsh-code-pipeline',
  factory() {
    // 代码修正的界面已在第 123 轮移除：修正本身由根插件在流程里完成
    //（写入即按项目规范格式化，模块关闭时自动整体审计）。
    //
    // 这里只保留一个空的 pages 数组，让入口页的注入点保持稳定；
    // 工具（code_list_files / code_standardize）与只读路由都在服务端模块里，
    // 与客户端无关。
    const pages = []

    return {
      inject: ['slots', 'layout', 'locale'],
      pages,
      apply(ctx) {
        const slots = ctx && ctx.slots
        if (!slots || typeof slots.inject !== 'function' || typeof slots.register !== 'function')
          return undefined
        // 没有页面要注册；保留空实现是为了让宿主侧注入检查继续通过。
        return undefined
      },
    }
  },
})
