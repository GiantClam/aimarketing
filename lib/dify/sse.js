/**
 * SSE 事件解析工具
 * 用于处理 Server-Sent Events 流式响应
 */

/**
 * 消费缓冲区中的完整 SSE 事件块
 * 将以 \n\n 分隔的事件块解析出来，剩余不完整的块留在 rest 中
 * @param {string} buffer - 输入缓冲区
 * @returns {{ events: any[], rest: string }}
 */
export function consumeSSEBuffer(buffer) {
  const blocks = buffer.split("\n\n");
  const rest = blocks.pop() ?? "";
  const events = [];

  for (const block of blocks) {
    const parsed = parseSingleBlock(block);
    if (parsed) {
      events.push(parsed);
    }
  }

  return { events, rest };
}

/**
 * 刷新缓冲区，处理可能没有 \n\n 结尾的最后一块
 * @param {string} buffer - 输入缓冲区
 * @returns {any[]}
 */
export function flushSSEBuffer(buffer) {
  if (!buffer.trim()) {
    return [];
  }
  const events = [];
  const block = buffer.replace(/\n$/, "");
  if (block) {
    const parsed = parseSingleBlock(block);
    if (parsed) {
      events.push(parsed);
    }
  }
  return events;
}

/**
 * 解析单个 SSE 块
 * @param {string} block - 单个块内容
 * @returns {object|null}
 */
function parseSingleBlock(block) {
  const lines = block.split("\n").map((line) => line.trimEnd()).filter((line) => line.startsWith("data:"));

  if (lines.length === 0) {
    return null;
  }

  const rawData = lines
    .map((line) => line.slice(5).trimStart())
    .join("\n")
    .trim();

  if (!rawData || rawData === "[DONE]") {
    return null;
  }

  try {
    return JSON.parse(rawData);
  } catch {
    return null;
  }
}
