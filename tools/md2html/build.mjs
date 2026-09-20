#!/usr/bin/env node
// Markdown → 单文件 HTML(项目文档统一形态,见 CLAUDE.md §9.1)
//   node tools/md2html/build.mjs <input.md> [output.html]
// 步骤:
//   1) ```mermaid 代码块 → pretty-mermaid(beautiful-mermaid)渲染成 SVG,去掉外链字体与内联主题,内联进 HTML
//   2) pandoc --standalone --toc 套 template.html(内联 CSS,支持深色模式 / 打印 / 手机)
// 依赖:pandoc(brew install pandoc)+ ~/.claude/skills/pretty-mermaid(或 MERMAID_RENDER 指向 render.mjs)
// 注意 beautiful-mermaid 语法限制:节点标签内不要用 <br/>;边标签用 -->|文字| 而不是 -- 文字 -->

import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

const [, , input, outputArg] = process.argv;
if (!input) {
  console.error("usage: node tools/md2html/build.mjs <input.md> [output.html]");
  process.exit(1);
}
const output = outputArg || input.replace(/\.md$/i, ".html");
const RENDER = process.env.MERMAID_RENDER || path.join(os.homedir(), ".claude/skills/pretty-mermaid/scripts/render.mjs");
const TEMPLATE = path.join(path.dirname(new URL(import.meta.url).pathname), "template.html");

const md = await fs.readFile(input, "utf8");
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "md2html-"));
let idx = 0;
const blocks = [];
// 先把 mermaid 块替换成占位符,避免 pandoc 处理
const replaced = md.replace(/```mermaid\s*\n([\s\S]*?)```/g, (_, code) => {
  const id = `MERMAID_BLOCK_${idx++}`;
  blocks.push({ id, code });
  return `\n<div class="diagram" data-id="${id}"></div>\n`;
});

const svgs = new Map();
for (const { id, code } of blocks) {
  const mmd = path.join(tmp, `${id}.mmd`);
  const svg = path.join(tmp, `${id}.svg`);
  await fs.writeFile(mmd, code);
  try {
    execFileSync("node", [RENDER, "--input", mmd, "--output", svg, "--format", "svg", "--theme", "github-light"], { stdio: "pipe" });
    let s = await fs.readFile(svg, "utf8");
    s = s
      .replace(/<svg([^>]*?)\sstyle="[^"]*"/, "<svg$1")          // 去内联主题变量,交给页面 CSS 控制明暗
      .replace(/@import url\([^)]*\);?/g, "")                    // 去 Google Fonts 外链,保证离线
      .replace(/\swidth="[^"]*"\sheight="[^"]*"/, "");           // 只留 viewBox,自适应宽度
    svgs.set(id, s);
  } catch (err) {
    console.error(`[md2html] mermaid render failed for ${id}: ${err.stderr?.toString() || err.message}`);
    svgs.set(id, `<pre><code>${code.replace(/</g, "&lt;")}</code></pre>`);
  }
}

const mdPath = path.join(tmp, "doc.md");
await fs.writeFile(mdPath, replaced);
let html = execFileSync("pandoc", [
  mdPath, "-f", "markdown+raw_html+pipe_tables+task_lists+yaml_metadata_block", "-t", "html5",
  "--standalone", "--toc", "--toc-depth=3", "--template", TEMPLATE, "--syntax-highlighting=none",
]).toString();
html = html.replace(/<div class="diagram" data-id="(MERMAID_BLOCK_\d+)">\s*<\/div>/g, (_, id) => `<div class="diagram">${svgs.get(id)}</div>`);
await fs.writeFile(output, html);
await fs.rm(tmp, { recursive: true, force: true });
console.log(`[md2html] ${input} → ${output} (${(html.length / 1024).toFixed(0)} KB, ${blocks.length} diagram(s))`);
