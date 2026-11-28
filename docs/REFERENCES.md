# 参考项目调研

目的：在 GitHub 上找已经解决过同类问题的项目，判断哪些做法能直接搬进本插件，哪些只值得看。星数是检索当天的数字（`gh search repos --sort stars`），只用来说明社区规模，不代表质量。

## 取用并落地的

| 项目 | 星数 | 取用的点 | 落地位置 |
|---|---|---|---|
| [github/spec-kit](https://github.com/github/spec-kit) | 151,715 | 规格产物拆成 spec / plan / tasks 三件套，配 clarify（先问清）、analyze（交叉核对）、checklist（开工前自检）三个动作 | `skills/rd-spec`（#14） |
| [blader/humanizer](https://github.com/blader/humanizer) | 74,024 | 结构型 AI 痕迹清单：不是 X 而是 Y、三连排比、破折号泛滥、加粗标签、拔高收尾、聊天残留；以及「没有样本时按文体判断」的口径 | `skills/rd-copy`、`scripts/aigc-check.mjs`（#14） |
| [op7418/Humanizer-zh](https://github.com/op7418/Humanizer-zh) | 23,877 | 上面那套规则的中文表述与例子 | `skills/rd-copy`（#14） |
| [Aider-AI/aider](https://github.com/Aider-AI/aider) | 50,276 | repo map：先给压缩后的仓库结构，再按需读行段；预算不够就截断并说明 | `scripts/repo-map.mjs`（#12） |
| [gitleaks/gitleaks](https://github.com/gitleaks/gitleaks) | 31,376 | 密钥扫描的规则组织方式（按厂商前缀、私钥块、高熵串）与打码输出 | `scripts/secret-scan.mjs`（#13） |
| [conventional-changelog/commitlint](https://github.com/conventional-changelog/commitlint) | 18,854 | 提交信息校验：类型白名单、header 长度、空行、脚注 | `scripts/commit-msg.mjs`（#13） |
| [googleapis/release-please](https://github.com/googleapis/release-please) | 7,819 | 从提交类型推导 semver 级别，按提交生成 CHANGELOG 条目 | `scripts/commit-msg.mjs`（#13） |

## 看过、没有取用的

| 项目 | 星数 | 为什么不用 |
|---|---|---|
| [Fission-AI/OpenSpec](https://github.com/Fission-AI/OpenSpec) | 75,824 | 它自带一整套斜杠命令与目录约定，和 DSH 的 preset / 技能机制重叠；我们只借「规格产物」这一层，命令体系仍用 DSH 原生的 |
| [gsd-build/get-shit-done](https://github.com/gsd-build/get-shit-done) | 64,119 | 同样是元提示词框架，体量大、依赖它自己的安装器；我们的宪章已经把分级与关卡写死，搬进来只会重复 |
| [bmad-code-org/BMAD-METHOD](https://github.com/bmad-code-org/BMAD-METHOD) | 55,800 | 面向多角色团队（PM、架构、开发、QA 分角色），单人研发模式下角色分工是负担 |
| [alirezarezvani/claude-skills](https://github.com/alirezarezvani/claude-skills) | 30,550 | 技能的组织方式（frontmatter + references 分层）与我们一致，没有新东西；410 个技能的体量不适合搬 |
| [buildermethods/agent-os](https://github.com/buildermethods/agent-os) | 5,643 | 核心是往项目里铺一套规范文件；我们的项目规则走 AGENTS.md，已经有等价物 |

## 判断标准

1. 能减少模型往返或减少读入的字符数，优先做。
2. 能在提交或交付前给出机械证据（退出码、分数、清单），优先做。
3. 引入运行时依赖、后台服务或外部命令可以接受，但要交代三件事：装什么、解决什么问题、没有网络或依赖缺失时降级成什么。说不清这三件事的先不引。
4. 只借做法，不复制代码。上面每个落地点都是按本仓库的接口重写的，测试覆盖在自己的 `test/` 里。
