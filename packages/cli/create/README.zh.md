# @rdmu/create-dsh-plugin

[English](README.md)

生成一个 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 插件
项目 —— 一个能跑的插件（含一个面向模型的工具）、一个把它挂进 profile 的 bundle、
dsh 自己的工具链，以及让 agent 能从 dsh 本身回答 dsh 问题所需的一切。

## 它有什么不一样

- **版本号就是契约。** `@rdmu/create-dsh-plugin@0.1.1-rc.2.rev.1` 生成的项目精确
  钉死 `@deepseek-ai/dsh-*@0.1.1-rc.2` —— 不带 caret。没有 `--dsh-version` 参数，
  因为一个事实不该有两处真相。
- **生成的项目是去读 dsh，而不是猜 dsh。** `pnpm install` 会按不可变的 release tag
  拉下该版本的完整源码，并建成一张 code graph；`.mcp.json` 与 `dsh-source` skill 把它
  接给打开这个项目的任意 agent。文档只覆盖常见路径，并明确说明自己到哪里为止。
- **交付的是一个能跑的插件，不是占位符。** 一个带 canonical 输出值的类型化工具、一段
  system-prompt section、一个 invariant companion，以及挂载真实 dsh 服务、并断言
  dispose 后注册被撤回的测试。
- **工具链就是 dsh 自己的那套，没有改动。** oxlint（type-aware）、tsc project
  references、tsdown，以及每文件 100% 覆盖率下限的 vitest —— 在这里开发的插件，一开始
  就达到 dsh 要求自己的包达到的标准。
- **两种形状，一套模板。** 默认一个扁平的单包；项目将来要放多个包时用
  `--layout workspace`。两种形状下代码完全相同。
- **你装到手里的东西是端到端验证过的。** 发布闸门会打出真实 tarball、安装它、按已发布
  的布局生成两种形状的项目，并分别跑它们自己的 `check` —— 少一个 `files` 条目、或者
  `lib/` 是旧的，会在这里失败，而不是在你的机器上。

## 用法

一次性使用，不装任何全局包：

```sh
npm create @rdmu/dsh-plugin my-plugin
# 或
pnpm create @rdmu/dsh-plugin my-plugin
# 或
npx @rdmu/create-dsh-plugin my-plugin
```

也可以装一次，之后直接用命令：

```sh
npm install -g @rdmu/create-dsh-plugin

create-dsh-plugin my-plugin
create-dsh-plugin my-plugin --scope @acme --plugin word-count
```

全局安装还会把 `dsh-trace` 放进 PATH —— 见下文。

## 参数

```
create-dsh-plugin <directory> [options]

  --scope <scope>   生成包所用的 npm scope，例如 @acme
  --plugin <name>   示例插件的角色名（默认：hello）
  --layout <mode>   single 或 workspace（默认：single）
  --force           写入一个已经有内容的目录
  -V, --version     脚手架版本，也就是它所针对的 dsh 版本
  -h, --help
```

`--plugin word-count` 会一次性重命名包名、目录名、Cordis 插件名，以及工具名
（`word_count_greet`）—— 你拿到的是一个读起来就属于你的项目，而不是一份还要自己
查找替换的模板。

## 版本号就是契约

**这个包的版本号 IS 它所针对的 dsh 版本，再加上我们自己对该版本的修订号。**
`@rdmu/create-dsh-plugin@0.1.1-rc.2.rev.1` 生成的项目精确钉死
`@deepseek-ai/dsh-*@0.1.1-rc.2` —— 不带 caret。没有 `--dsh-version` 参数，因为那会让
一个事实有两处真相。

```
0.1.1-rc.2.rev.1
└── dsh ──┘ └─┬─┘
             我们针对该 dsh 的第一次发布；只改脚手架的修复发 .rev.2
```

`.rev.N` 后缀之所以存在，是因为 npm 永远不允许重发同一个版本：只改脚手架、背后没有新
dsh 的修复，也需要一个新号。它在进入生成项目的依赖之前会被切掉。

要针对另一个 dsh 版本，就选那一版脚手架：

```sh
npm create @rdmu/dsh-plugin@0.1.2-rc.1.rev.1 my-plugin
```

dsh 的各个包是作为一整套切出来的，彼此并不能独立兼容，所以精确钉版才是诚实的范围：
caret 会让你的项目装上一个这版脚手架从未测试过的 dsh。

## 你会拿到什么

默认是一个包 —— 插件本身 —— bundle 放在它旁边：

```
my-plugin/
  package.json             这个包就是插件本体，同时承载项目的 scripts
  src/                     一个类型化工具、一段 prompt section、一个 invariant companion
  tests/                   它的测试，挂载真实的 dsh 服务
  bundle/                  把它挂进 dsh profile 的 patch 层
  docs/                    编写指南，以及如何从磁盘上读到 dsh 的契约
  scripts/dsh-graph.ts     拉取钉死版本的 dsh 源码并建成 code graph
  scripts/dsh-trace.ts     从磁盘读出任意 dsh 依赖的契约
  .mcp.json                codegraph MCP server，对打开这个项目的任意 agent 都已接好
  AGENTS.md                agent 在这个项目里必须遵守的约定
```

`--layout workspace` 把同样的代码放进一个 pnpm 工作区，适合将来要放多个包的项目：

```
my-plugin/
  packages/
    plugin/hello/          插件
    bundle/hello-bundle/   bundle
  pnpm-workspace.yaml      packages/*/*
  tsconfig.json            `tsc -b` 构建的聚合 solution
  …                        docs/、scripts/、.mcp.json、AGENTS.md 同上
```

两种形状携带同一套工具链，直接取自 deepseek-harness，所以在这里开发的插件是在与 dsh
自己的包相同的规则下构建的：oxlint（type-aware）、tsc project references、tsdown，
以及每文件 100% 覆盖率下限的 vitest。

## 在生成的项目里的第一步

```sh
cd my-plugin
pnpm install
pnpm run check        # typecheck + lint + test + build
```

`pnpm run check` 通过，意味着这个插件在 dsh 的编译器设置下能编过、它的工具 schema 合法、
它能挂载到真实的 dsh 工具注册表上，并且在 dispose 时干净地撤回。

**生成的项目需要 pnpm**，尽管脚手架本身在 npm 下也能跑。它是一个
`autoInstallPeers: false` 的 pnpm 工作区，正是这一点让你未填充的 dsh peer 依赖落到
profile 的 installation fallback 上，而不是装上第二份 Cordis —— 两份 Cordis 意味着两个
服务存储，以及一个把自己注册进没人读的注册表的插件。

## 然后把它跑进 dsh

最快的循环 —— 往你机器级的 user layer 里加一行，dsh 会热重载：

```yaml
# $DSH_HOME/cordis.patch.yml  （默认是 ~/.dsh/cordis.patch.yml）
- insert:
    - id: plugin-hello
      name: '@acme/dsh-plugin-hello'
      config:
        defaultLanguage: zh
```

可分发的路线是把 bundle 打包并安装进某个 profile：

```sh
pnpm run pack:bundle
dsh plugin --profile tui add ./acme-dsh-bundle-hello-0.0.0.tgz
dsh --profile tui --dump-config    # 确认这一行进了合成后的树
```

全部四条路线、决定谁的覆盖生效的 layer 顺序，以及不用 pnpm 的路径，都在生成项目的
`docs/loading-into-dsh.md` 里。

## 不靠猜地读 dsh

生成的项目通过两条自己搭好的路线，从 dsh 本身回答 dsh 的问题。

**实现。** `pnpm install` 会把钉死版本的完整源码拉到 `.dsh-source/dsh-v<version>/`
—— 在不可变的 release tag 上做一次浅克隆，且远端与版本都由已安装的 manifest 推导而来，
所以它不可能是另一个版本 —— 然后用
[codegraph](https://github.com/colbymchenry/codegraph) 建索引。agent 通过生成项目里
`.mcp.json` 接好的 codegraph MCP server 查询它，人则用 CLI：

```sh
codegraph explore 'how tool timeouts are enforced' --path .dsh-source/dsh-v0.1.1-rc.2
pnpm run dsh:graph --dry-run   # 离线查看它会拉什么、建什么索引
```

首次安装大约多花一分钟、占 ~340 MB。源码和索引都不入库 —— tag 就能复现两者 —— 而且整步
都是尽力而为：没有 `git`、没有网络、没装 `codegraph` 二进制，都只会让 `pnpm install`
带着一行说明成功结束，`DSH_GRAPH=0` 则整步跳过。项目自己的代码是另一张独立的图，所以
一个插件的爆炸半径永远不会包含整个 dsh。

**契约。** `dsh-trace` 打印一个已安装包的承诺可以在哪里读到：

```sh
dsh-trace @deepseek-ai/dsh-tools
```

```
@deepseek-ai/dsh-tools@0.1.1-rc.2
  installed at   .../node_modules/@deepseek-ai/dsh-tools
  contract       10 declaration file(s) — the JSDoc here IS the contract:
                 .../lib/types/index.d.ts
                 ...
  README         .../README.md
  source         https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.1.1-rc.2/packages/core/tools
  snapshot       .../.dsh-source/dsh-v0.1.1-rc.2
```

发布出来的 `.d.ts` 保留了每一段 JSDoc —— 包括事件上的 `@mode`，它告诉你一个 listener
是否必须调用 `next()`。那才是真正的契约，就在磁盘上，可以直接 grep。生成的项目里同一个
工具是 `pnpm run trace <package>`。

## 文档

每个生成的项目都带着这些，所以在里面工作的 agent 不需要任何别的资料：

| 文件 | 覆盖内容 |
|---|---|
| `docs/plugin-authoring.md` | 怎么写一个 dsh 插件 —— 导出形状、config、effect、工具、测试 |
| `docs/cordis-essentials.md` | Context、fiber、服务、effect，以及 waterfall 的 `next()` 义务 |
| `docs/loading-into-dsh.md` | 让插件在真实 profile 里跑起来 |
| `docs/tracing-dsh.md` | 读 dsh 本身 —— 源码图，以及已安装的声明文件 |

## License

MIT
