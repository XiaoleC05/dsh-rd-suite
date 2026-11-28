---
name: rd-worktree
version: 1.0.0
description: 用 git worktree 给改动开隔离工作区：主分支不受影响，改完合并再清理。适合多文件改动、需要对比两套实现、以及别人的分支正在使用的仓库。
---

# 隔离工作区

在别人正在用的仓库里直接改，等于把两件事挤在一块。worktree 让你另开一间屋子干活。

## 什么时候开

- 仓库当前不在你该动的分支上（别人在用、或有未推送的改动）。
- 改动跨多个目录，想先在干净环境里跑通测试再合回去。
- 要同时验证两套方案。
- 只是改一个文件、且分支干净：不用开，直接改更省事。

## 命令序列

```bash
# 1) 从最新远端开一间屋子（分支名带 Issue 号）
git fetch origin main
git worktree add ../<仓库名>-<短名> -b <type>/<编号>-<slug> origin/main

# 2) 进屋装依赖
cd ../<仓库名>-<短名>
pnpm install --prefer-offline --ignore-scripts

# 3) 干活：改、测、提交、推送、开 PR

# 4) 合并后清理（先出屋再删）
cd ..
git worktree remove <目录> --force
git worktree prune
```

## 五个必须知道的坑

| 坑 | 现象 | 处理 |
|---|---|---|
| **目录联接 node_modules** | `Cannot find package` —— pnpm 的 `.pnpm` 是相对符号链接，junction 过去解析失败 | 在 worktree 里单独 `pnpm install`，别做目录联接 |
| **本地 origin/main 是旧的** | PR 显示 CONFLICTING，甚至被判定「删掉了别人刚加的文件」 | 先 `git fetch`；`git rev-parse --short origin/main` 与远端一致再开工 |
| **worktree 里 client.js 时间戳旧** | 打包校验报「client.js 比源码旧」 | 进门先 `node scripts/build-client.mjs` |
| **删目录失败** | `failed to delete: Directory not empty` | 先 `git worktree remove`，再 `rmdir /S /Q`，最后 `git worktree prune` |
| **改完忘了合并** | 屋子里的提交没进主分支 | 推送 + PR，合并后再删目录；不要直接删 |

## 与流水线的衔接

- 开 before S4（实现）之前，属于准备工作，不算改动。
- worktree 里的提交照样遵循 G1–G7（建单、提交、PR、合并）。
- 合并后立刻清理：留着几间屋子会让 `git worktree list` 变噪音，也容易改错地方。

## 什么时候反而不要用

- 单文件小改：开屋子的成本高于收益。
- 需要实时看主工作区状态的任务（例如排查外部进程写的文件）。
- 磁盘紧张：每个 worktree 是完整检出（依赖可共用 pnpm 全局 store，但仍占空间）。
