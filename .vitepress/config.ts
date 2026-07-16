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
      { text: 'OpenClaw 六大支柱', link: '/agent/case-studies/openclaw-six-pillars/' }
    ],
    sidebar: {
      '/agent/': [
        {
          text: 'Agent 知识库',
          items: [
            { text: 'Agent 首页', link: '/agent/' }
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
          text: '学习分类',
          collapsed: true,
          items: [
            { text: '基础概念', link: '/agent/fundamentals/' },
            { text: '主流框架', link: '/agent/frameworks/' },
            { text: 'RAG', link: '/agent/rag/' },
            { text: 'Prompt Engineering', link: '/agent/prompt-engineering/' },
            { text: '工具与 MCP', link: '/agent/tools-and-mcp/' },
            { text: '架构模式', link: '/agent/patterns/' },
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
