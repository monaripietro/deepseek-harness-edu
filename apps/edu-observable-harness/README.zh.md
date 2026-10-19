# EDU Observable Harness
[English](README.md) | 中文

这是一款概念上源自 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的静态教育应用，可观察各组件如何协作。
它没有依赖或后端，只使用 HTML、CSS 和原生 JavaScript 模块。

## 设计目的

> LLM（大语言模型）本身只接收文本并生成文本；harness 准备上下文、提供工具、记录事件，并决定如何编排各步骤。

该应用通过示例向初学者说明：

- 如何组装系统提示词的各个部分（顺序、启用状态和渲染）；
- 如何通过 JSON Schema 向模型描述工具；
- 发送给模型提供商的最终请求包含哪些内容（`messages` + `tools`）；
- 一个任务如何由一个或多个步骤组成，以及每一步如何记录在仅追加时间线中；
- 裸提示词与经 harness 处理的提示词有什么区别（对比模式）。

这些概念和名称沿用原始 package：`system-prompt`（包含 `order`、`enabled` 和渲染的各个部分）、`agent-loop`（轮次/步骤）、`session`（仅追加日志，以及通过简化的 `deriveMessages()` 从日志派生的消息）。

## 本地运行

无需构建。在仓库中，可以启动静态文件服务器：

```sh
cd apps/edu-observable-harness
python3 -m http.server 8080
# poi apri http://localhost:8080
```

（也可以使用其他静态文件服务器；直接通过 `file://` 打开 `index.html` 时，ES 模块可能会因浏览器而无法加载。）

## 在 GitHub Pages 上部署

此静态应用不会部署到 GitHub Pages。工作流 [`.github/workflows/edu-pages.yml`](../../.github/workflows/edu-pages.yml) 会构建 `apps/edu-harness-lab/`，并将结果发布到 [harness.monaripietro.it](https://harness.monaripietro.it)。

## 架构

```text
app.js                 wiring UI + task run
src/config/            sezioni harness e tool mock predefiniti
src/core/              promptAssembler, toolSchemaRegistry, eventLog,
                       sessionProjector (deriveMessages), runStep (task/step loop)
src/providers/         openaiCompatibleClient, providerConfig
src/state/             sessionState, apiKeyStore
src/components/        ApiKeyPanel, PromptEditor, HarnessSectionsPanel,
                       ToolPanel, AssemblyView, TraceTimeline,
                       ResponsePanel, CompareView
```

流程示例：用户输入 → 启用的各部分 → 启用的工具 schema → 请求内容 →
事件 `system_prompt_assembled` 和 `model_request_prepared` → 调用 →
`model_response_received` → 可选的 `tool_call_suggested` + `tool_result_added`
→ `next_step_prepared` → 新步骤（最多 3 个）。

## 关于 harness 概念的教学内容

- **系统提示词**并非魔法：它是由 harness 控制的有序文本片段。
- **工具**并非隐藏函数：模型会读取 JSON schema 并决定是否调用它们。
- 模型看到的**历史记录**由事件日志重建，并非真正的聊天记录。
- 一个**任务**可以包含多个**步骤**：回答 → 工具 → 结果 → 最终回答。
- 原始聊天与 harness 的区别在请求内容和输出中均可见（并排比较）。

## 纯前端 BYOK 应用的安全限制

- API 密钥无法在纯前端应用中得到真正保护：任何脚本或浏览器扩展都能读取它。
- 默认情况下，密钥仅保存在内存中；`localStorage` 持久化可选、默认禁用，并且需要明确确认。
- 密钥不会被记录到日志、写入时间线、导出到日志或提交到仓库。
- 请求只发送到所选提供方的 `baseUrl`。
- 建议：使用**低预算的专用 API 密钥**，并在使用后轮换。

## 范围

仅使用 mock 工具：`search_web_mock`、`read_file_mock`、`calculator_mock`、`ask_clarification_mock`。harness 不会实际执行 shell 命令、访问文件系统或发起网络请求。
