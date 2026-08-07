const AGENT_FINAL_OPEN = '<agent_final>'
const AGENT_FINAL_CLOSE = '</agent_final>'
const AGENT_BLOCKED_OPEN = '<agent_blocked>'
const AGENT_BLOCKED_CLOSE = '</agent_blocked>'

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const unwrapExactTag = (value, openTag, closeTag) => {
  const pattern = new RegExp(
    `^\\s*${escapeRegExp(openTag)}([\\s\\S]*?)${escapeRegExp(closeTag)}\\s*$`,
    'i'
  )
  const matched = String(value || '').match(pattern)
  return matched ? matched[1].trim() : null
}

/**
 * Agent 请求的可见输出必须明确声明本回合是“已完成”还是“需要用户输入”。
 * 工具调用由 tool-prompt 解析器先行抽取，因此这里仅处理剩余文本。
 */
const parseAgentControlText = (value) => {
  const raw = String(value || '')
  const trimmed = raw.trim()
  if (!trimmed) return { kind: 'empty', text: '' }

  const finalText = unwrapExactTag(trimmed, AGENT_FINAL_OPEN, AGENT_FINAL_CLOSE)
  if (finalText !== null) return { kind: 'final', text: finalText }

  const blockedText = unwrapExactTag(trimmed, AGENT_BLOCKED_OPEN, AGENT_BLOCKED_CLOSE)
  if (blockedText !== null) return { kind: 'blocked', text: blockedText }

  if (/<\/?agent_(?:final|blocked)>/i.test(trimmed)) {
    return { kind: 'invalid_control', text: trimmed }
  }
  return { kind: 'bare', text: trimmed }
}

const buildAgentTurnDirective = ({ afterToolResult = false } = {}) => {
  const continuation = afterToolResult
    ? 'The current message is a tool result from the same unfinished task. It is evidence to inspect, not a new task and not a reason to stop after one action.'
    : 'Treat this request as one step in an Agent task. Recover the original acceptance criteria from the conversation before deciding whether the task is complete.'

  return [
    '# Agent loop control (highest-priority output contract)',
    continuation,
    'The client executes tools and automatically sends each tool result back in the next request. Keep that loop alive until the original task is genuinely complete.',
    'Before responding, check the original request, every claimed deliverable, failures in tool results, and whether verification is still missing.',
    'Your entire visible response MUST be exactly one of these modes:',
    '1. If any action, inspection, edit, command, test, retry, or verification remains: emit one or more valid `<tool_call>...</tool_call>` blocks and no prose.',
    `2. Only when every requested outcome is complete and supported by tool-result evidence: emit ${AGENT_FINAL_OPEN}a concise final report${AGENT_FINAL_CLOSE}.`,
    `3. Only when progress is impossible without new user input or authority: emit ${AGENT_BLOCKED_OPEN}the exact blocker and required input${AGENT_BLOCKED_CLOSE}.`,
    'Bare prose, a plan, a progress update, hidden reasoning without visible output, or a claim such as “done” without the completion wrapper is an invalid Agent turn and will be regenerated.',
    'Never use the completion wrapper merely because one tool call finished. If verification has not run or any requested work remains, call the next tool.'
  ].join('\n')
}

const buildAgentRetryHint = (reason = 'incomplete') => {
  const reasonText = {
    empty: 'The previous attempt ended without a visible answer or executable tool call.',
    bare: 'The previous attempt returned bare prose without declaring a verified final result or emitting the next tool call.',
    invalid_control: 'The previous attempt used a malformed or mixed Agent completion wrapper.',
    invalid_tool_call: 'The previous attempt contained an invalid, truncated, or unknown tool call.',
    required_tool: 'The previous attempt violated tool_choice and did not call the required tool.'
  }[reason] || 'The previous attempt did not produce a valid Agent turn.'

  return [
    '# Agent turn recovery',
    reasonText,
    'Continue the SAME original task. Re-check its acceptance criteria and the latest tool result.',
    `If work remains, output only valid \`<tool_call>...</tool_call>\` blocks. If and only if all work is verified complete, output ${AGENT_FINAL_OPEN}the final report${AGENT_FINAL_CLOSE}.`,
    `If user input is strictly required, output ${AGENT_BLOCKED_OPEN}the blocker${AGENT_BLOCKED_CLOSE}. Do not output bare planning prose.`
  ].join('\n')
}

module.exports = {
  AGENT_FINAL_OPEN,
  AGENT_FINAL_CLOSE,
  AGENT_BLOCKED_OPEN,
  AGENT_BLOCKED_CLOSE,
  parseAgentControlText,
  buildAgentTurnDirective,
  buildAgentRetryHint
}
