# Harness Lab — 从模型到智能体

[English](README.md) | 中文

## 概述

围绕小型语言模型逐步添加组件，构建智能体。这个纯前端教学应用支持比较指令、任务上下文、记忆、检索、工具、智能体循环、控制措施、人工审批和 MCP。产品界面使用意大利语。

## 目录

- [启动](#startup)
- [使用实验室](#using-the-lab)
- [模型](#models)
- [场景上下文](#scenario-context)
- [不使用工具的迭代反思](#iterative-reflection-without-tools)
- [教学链接](#lesson-links)
- [真实组件与模拟组件](#real-and-simulated-components)

<a id="startup"></a>
## 启动

```sh
# dalla radice del repository
pnpm lab                 # avvia Harness Lab su http://localhost:5173

# oppure dalla cartella dell'app
cd apps/edu-harness-lab
pnpm install             # progetto autonomo: escluso dal workspace del monorepo
pnpm dev
pnpm test
pnpm build
```

`pnpm dsh web` 打开的是 DeepSeek Harness 产品界面，而不是 Harness Lab。

<a id="using-the-lab"></a>
## 使用实验室

**Flusso** 视图显示请求、上下文、模型和回答。箭头表示方向；启用的组件显示在使用它们的步骤下方。选择元素可查看详情。**Mappa completa** 提供可缩放、可拖动的关系图。

- **Percorso**：使用 Precedente 和 Successivo 切换级别，或打开 Tutti i livelli 查看完整列表。
- **Prova**：编辑请求，按需加载模型并阅读对话。切换标签页不会丢失请求草稿。
- **Cosa succede**：阅读 harness 事件，而不是模型的思维。历史记录独立滚动；阅读较早事件时，新事件不会使视图跳到底部。
- **Approfondimenti in basso**：检查模型上下文、事件日志，或对话及其检查结果。
- **Controlli**：调整播放、速度、实验室、教师控制、主题、演示和设置。

在 **Laboratorio** 中，Personalizza gli strati dell'harness 可添加或移除组件。控制面板和 MCP 连接按需打开。审批请求会打开对话框，显示拟执行操作、影响以及 Approva/Rifiuta 选项。

<a id="models"></a>
## 模型

Harness Lab 通过 Transformers.js 在浏览器中运行**真实**语言模型。Hugging Face 权重只需下载一次，随后保存在缓存中：

| 模型 | 下载大小 | 运行环境 |
|---|---|---|
| LFM2.5 350M | ~0.3 GB | 仅 WebGPU |
| Qwen3 0.6B | ~0.6 GB | CPU；可用时使用 GPU |
| LFM2.5 1.2B | ~0.8 GB | 仅 WebGPU |

对于支持思考的模型，包括 Qwen3、Gemma 4 和部分 OpenRouter 模型，可在模型设置中选择推理强度。展开 **Thinking nativo** 可阅读返回的推理通道；它不是对模型决策过程的可靠解释。OpenRouter 仅在供应商返回该通道时显示内容。**Riflessioni del ciclo** 则显示连续调用生成的草稿，也适用于非思考模型。

开发服务器发送 COOP/COEP 标头，使 ONNX Runtime 可以使用多个 CPU 核心。工具通常使用模型原生聊天模板；编排器验证并执行模型发出的调用。

<a id="scenario-context"></a>
## 场景上下文

每个场景都有[专用配置](src/scenarios/context/)，包含任务事实、指令、相关的初始记忆和文档 ID。**Dati del compito** 显示启用任务上下文后提供给模型的事实：新员工姓名和入职日期属于采购场景，不属于缺少日期的会议室请求。目录价格、库存和计算结果不会在相应查询或计算前提前提供。

自动 RAG 和 **Cerca nelle policy aziendali** 都在排序前选择文档。用户添加的文档和明确固定的片段仍可使用。切换场景后，先前任务的对话不再进入后续模型请求；保存的任务状态按场景分别选择。

**Magazzino che non risponde** 为库存工具选择模拟超时。离开该场景会移除这一故障设置；可在控制面板中编辑模拟故障。

<a id="iterative-reflection-without-tools"></a>
## 不使用工具的迭代反思

选择 **Ragionamento iterativo**，打开 **Prova e racconto**，然后点击 **Attiva ciclo di riflessione e controlli**。LFM 模型可将循环行为与原生思考区分开。该场景要求给出满足三个约束的顺序，且不启用工具。

[场景系统提示词](src/scenarios/reflection.ts) 要求先提出候选顺序，再检查同一个候选。每次模型调用必须只回复一个带标签的块：草稿或检查使用 `<self_reflection>...</self_reflection>`，回答使用 `<final_answer>...</final_answer>`。被接受的 `<self_reflection>` 会触发一次新的真实模型调用：编排器将草稿作为 assistant 消息放回上下文并保留标签，指令说明之前的块是模型自己的草稿，而不是用户指令、工具结果或已验证的事实。这不是模型的原生思考。只有完整的 `<final_answer>` 会在去掉标签后发布。空块、不完整、多个、混合或嵌套的块，以及块外的文本都会被拒绝，并在常规限制内要求修正；任何回退都不会把无效输出或草稿变成回答。标签只用于区分消息，并不保证内容正确，内容由场景检查器验证。

**Riflessioni del ciclo** 将草稿和检查与 **Risposta finale** 分开显示，配置比较中也是如此。计数器区分模型调用、格式有效的草稿和无效输出：开始调用不代表已经完成检查。中断或无效的运行会标记为没有最终回答的结果。草稿不会带入新一轮任务。关闭循环会恢复单次回答。控制措施会停止完全相同的重复输出和耗尽步骤预算的运行；**Ferma** 可手动停止运行。

模型和调用都是真实的：“模拟”描述的是提示词引导策略，而不是假模型或原生思考。小型模型可能忽略指令或错误检查约束。LFM2.5 350M 还可能无法遵循 JSON 格式，因而不产生任何有效草稿；历史记录会显示错误和重试。指标观察的是轮次、工具调用和最终顺序，而不是推理质量。

<a id="lesson-links"></a>
## 教学链接

| 链接 | 效果 |
|---|---|
| `?livello=5` | 打开第六级；索引范围为 0 到 9 |
| `?scenario=ragionamento-iterativo&livello=7` | 打开启用循环和控制、不使用工具的反思场景 |
| `?modello=lfm-350m&livello=9&avvia=1&approva=auto` | 加载真实模型，以完整 harness 运行引导场景 |
| `?vista=compare&esperimento=1` | 运行十种配置的比较 |
| `?vista=lab&lab=mcp` | 打开自由实验室和 MCP 面板 |
| `?tema=aula&regia=1` | 启用投影对比度和教师控制 |

<a id="real-and-simulated-components"></a>
## 真实组件与模拟组件

- **浏览器中的真实组件**：语言模型、编排器、智能体循环、控制措施、参数验证、计算器、文档搜索（BM25）和 IndexedDB 记忆。
- **需主动启用的外部真实组件**：允许列表中的公共 MCP 服务器（Microsoft Learn、DeepWiki），每次调用都需要同意和审批。
- **模拟组件**：企业数据、目录、库存、预算、使用 `SIM` ID 的写入操作，以及 TechSupply MCP 服务器。模型从不使用模拟实现。
