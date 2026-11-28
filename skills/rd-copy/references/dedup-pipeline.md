# 降重五层

按成本从低到高，五层各查一件事。缺一层就有一类重复溜过去。

| 层 | 查什么 | 命令 | 抓不到的情况 |
|---|---|---|---|
| 1 文风 | 套话、模板开头、句长分布 | `node scripts/aigc-check.mjs --fix-suggest 文件.md` | 没套话但内容是抄的 |
| 2 术语 | 同一概念多种写法 | `node scripts/term-check.mjs` | 术语一致但句子重复 |
| 3 段落 | 完全相同或几乎相同的段落 | `node scripts/dup-check.mjs` | 换几个词就绕过 |
| 4 近似段落 | 机械改写（换标点、调语序） | `node scripts/near-dup.mjs --strict` | 深度同义改写 |
| 5 源码 | 同一段逻辑在多个文件重复 | `node scripts/code-dup.mjs --strict` | 结构相似但写法不同 |

## 判定口径与出处

- 第 4 层思路来自 SimHash（`github.com/yanyiwu/simhash`、`github.com/1e0ng/simhash`）与 MinHash/LSH（`github.com/ekzhu/datasketch`）。本包不引依赖，全部自实现：SimHash 64 位指纹预筛，判定用 bigram 集合的 Jaccard 相似度，阈值 0.55。
- 第 5 层用 `jscpd`（`github.com/kucherenko/jscpd`），参数与官方一致：`--min-lines 10 --min-tokens 70`。工具走 npx，不进 dependencies——本包对外承诺无运行时依赖。
- 去重流水线的组织方式参考 `github.com/ChenghaoMou/text-dedup`：先粗筛后精判，每层都能独立跑。

## 实测出来的边界

**深度同义改写抓不到。** 同一句话整句换种说法后，bigram 相似度只有 0.318，远低于 0.55 阈值。这不是阈值调得过严——把阈值降到 0.3 会把不同话题的段落也判成重复。那一层只能人工复核，工具给不了保证。

所以这套流程的定位是：**把机械重复清干净，把人的注意力留给真正需要判断的改写**。

## 源码层怎么用

```
node scripts/code-dup.mjs --strict
```

输出重复行占比与前十个重复块（`文件:行 ↔ 文件:行`）。占比超过 3% 时退出码 1。

处理顺序：先看是不是同一段逻辑写了两遍——是就抽成共享函数（本轮就把三个脚本里各写一遍的「默认文档集」抽成了 `lib/doc-set.js`，重复块从 7 个降到 5 个）；不是就在提交信息里写清为什么不抽（例如两个预设文件的同构配置）。
