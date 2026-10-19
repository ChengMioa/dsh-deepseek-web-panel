# 发布到 DSH 插件市场

市场里的插件来自精选列表 [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)，
dshmarket 的「插件市场」和 DSH 0.2.1+ 的「插件 → 发现」都读同一份索引。

上架需要同时满足：

1. 包已发布到 npm，且 `package.json` 声明了 `dsh.bundle`（本仓库已满足）；
2. 有一个公开的 GitHub 仓库，**创建满 1 天**、带 `dsh-plugin` topic、有真实代码；
3. 向 awesome-dsh-plugin 提一个 PR，加一条插件条目。

> 包名已经改成 `dsh-deepseek-web-panel`：npm 上的 `dsh-deepseek-web` 已被 y-wi 的另一个插件占用。

## 1. 推 GitHub

本地已经 `git init` 并提交。新建公开仓库 `ChengMioa/dsh-deepseek-web-panel`，然后：

```bash
git remote add origin git@github.com:ChengMioa/dsh-deepseek-web-panel.git
git push -u origin main
```

仓库页 → About → 齿轮 → Topics 加入 `dsh-plugin`。

## 2. 发布 npm

```bash
npm login          # 或 pnpm login
cd dsh-deepseek-web
pnpm pack          # 先本地确认内容
pnpm publish --access public
npm view dsh-deepseek-web-panel version   # 验证
```

发布后用户可以：

```bash
dsh plugin --profile desktop add dsh-deepseek-web-panel
```

## 3. 提交收录（仓库满 1 天后）

Fork `awesome-dsh-plugin/awesome-dsh-plugin`，新增文件
`data/plugins/ChengMioa__dsh-deepseek-web-panel.yml`：

```yaml
url: https://github.com/ChengMioa/dsh-deepseek-web-panel
name: ChengMioa/dsh-deepseek-web-panel
category: browser
description:
  en: DeepSeek web panel in the main area: the real chat.deepseek.com in a desktop webview, using the site's own sidebar for history, with right-click deletion and a draggable top band.
  zh: 在主区域嵌入 DeepSeek 网页版：桌面 webview 加载真正的 chat.deepseek.com，直接用官网侧栏作为历史，支持右键删除对话和顶部拖动条。
```

提 PR（标题如 `Add dsh-deepseek-web-panel`）。CI 会校验 `dsh.bundle`、仓库年龄和 YAML 格式；
合并后站点与市场通常一天内自动收录。

## 4. 后续更新

改 `package.json` 的 `version` → `pnpm publish`。市场展示 npm 最新版本，用户端会出现「更新」。
`engines.dsh` 决定兼容性标签，当前声明 `^0.2.1-rc.2`。

## 备选：自建索引

不想等收录时，可以把一个符合格式的 `index.json` 放到任意 HTTPS 地址，让用户自己在
「插件 → 发现 → 索引源」里添加；这不是插件市场本身，只是同一种索引格式。
