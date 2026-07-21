import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'AI 应用开发知识库',
  description: '全栈工程师 + AI 应用开发面试学习笔记',
  lang: 'zh-CN',
  base: '/ai-knowledge-base/',
  cleanUrls: true,
  lastUpdated: true,
  themeConfig: {
    siteTitle: 'AI 知识库',
    nav: [
      { text: '首页', link: '/' },
      { text: 'Agent', link: '/agent/' },
      { text: '项目面试', link: '/interview/projects/' },
      { text: '每日面试题', link: '/interview/daily/' },
      { text: '六大支柱对比', link: '/agent/case-studies/claude-code-vs-openclaw-six-pillars/' },
      { text: 'OpenClaw 六大支柱', link: '/agent/case-studies/openclaw-six-pillars/' },
      { text: 'Claude Code 六大支柱', link: '/agent/case-studies/claude-code-six-pillars/' }
    ],
    sidebar: {
      '/interview/': [
        {
          text: '面试准备',
          items: [
            { text: '项目面试讲稿 + 高频追问', link: '/interview/projects/' },
            { text: '每日面试题', link: '/interview/daily/' },
            { text: 'LangGraph 框架取舍', link: '/interview/daily/2026-07-21-langgraph-pros-cons-replacement' }
          ]
        }
      ],
      '/agent/': [
        {
          text: 'Agent 知识库',
          items: [
            { text: 'Agent 首页', link: '/agent/' }
          ]
        },
        {
          text: '六大支柱横向对比',
          collapsed: false,
          items: [
            { text: 'Claude Code vs OpenClaw', link: '/agent/case-studies/claude-code-vs-openclaw-six-pillars/' }
          ]
        },
        {
          text: 'OpenClaw 六大支柱',
          collapsed: false,
          items: [
            { text: '总览', link: '/agent/case-studies/openclaw-six-pillars/' },
            { text: '01 Agent Loop', link: '/agent/case-studies/openclaw-six-pillars/01-agent-loop' },
            { text: '02 Tool System', link: '/agent/case-studies/openclaw-six-pillars/02-tool-system' },
            { text: '03 Context Engineering', link: '/agent/case-studies/openclaw-six-pillars/03-context-engineering' },
            { text: '04 Memory', link: '/agent/case-studies/openclaw-six-pillars/04-memory' },
            { text: '05 Multi-Agent', link: '/agent/case-studies/openclaw-six-pillars/05-multi-agent' },
            { text: '06 Harness Engineering', link: '/agent/case-studies/openclaw-six-pillars/06-harness' },
            { text: '面试速记', link: '/agent/case-studies/openclaw-six-pillars/interview' },
            { text: 'Agent Loop 3 分钟精讲', link: '/agent/case-studies/openclaw-six-pillars/agent-loop-3min' }
          ]
        },
        {
          text: 'Claude Code 六大支柱',
          collapsed: false,
          items: [
            { text: '总览', link: '/agent/case-studies/claude-code-six-pillars/' },
            { text: '01 Agent Loop', link: '/agent/case-studies/claude-code-six-pillars/01-agent-loop' },
            { text: '02 Tool System', link: '/agent/case-studies/claude-code-six-pillars/02-tool-system' },
            { text: '03 Context Engineering', link: '/agent/case-studies/claude-code-six-pillars/03-context-engineering' },
            { text: '04 Memory', link: '/agent/case-studies/claude-code-six-pillars/04-memory' },
            { text: '05 Multi-Agent', link: '/agent/case-studies/claude-code-six-pillars/05-multi-agent' },
            { text: '06 Harness Engineering', link: '/agent/case-studies/claude-code-six-pillars/06-harness' },
            { text: '面试速记', link: '/agent/case-studies/claude-code-six-pillars/interview' }
          ]
        },
        {
          text: '学习分类',
          collapsed: true,
          items: [
            { text: '基础概念', link: '/agent/fundamentals/' },
            { text: '主流框架', link: '/agent/frameworks/' },
            { text: 'RAG', link: '/agent/rag/' },
            { text: 'Prompt Engineering', link: '/agent/prompt-engineering/' },
            { text: '工具与 MCP', link: '/agent/tools-and-mcp/' },
            { text: '架构模式', link: '/agent/patterns/' },
            { text: 'Agent 运行失败与容错恢复面试题', link: '/agent/patterns/agent-failure-recovery-interview' },
            { text: '实战案例', link: '/agent/case-studies/' }
          ]
        }
      ]
    },
    outline: {
      level: [2, 3],
      label: '本文目录'
    },
    docFooter: {
      prev: '上一篇',
      next: '下一篇'
    },
    lastUpdated: {
      text: '最后更新',
      formatOptions: {
        dateStyle: 'short',
        timeStyle: 'medium'
      }
    },
    search: {
      provider: 'local'
    },
    socialLinks: []
  }
})
