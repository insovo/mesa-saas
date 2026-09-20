# md2html — 项目文档单文件 HTML 生成器

项目内所有设计 / 方案 / 交付类文档统一以**自包含单文件 HTML** 交付(CLAUDE.md §9.1)。Markdown 作为源,放在文档目录的 `src/` 下,HTML 与源同名放在目录顶层。

```bash
# 依赖:pandoc + ~/.claude/skills/pretty-mermaid(mermaid → SVG)
node tools/md2html/build.mjs "textin+kimi+jev架构/src/02_Jev接入详细设计.md" "textin+kimi+jev架构/02_Jev接入详细设计.html"
```

- Markdown 顶部用 YAML 元数据:`title / date / status / author / base / description`
- ```` ```mermaid ```` 代码块自动渲染为内联 SVG(节点标签不要用 `<br/>`,边标签用 `-->|文字|`)
- 输出 HTML:内联 CSS、无外链、自动深色模式、可打印、手机可读
