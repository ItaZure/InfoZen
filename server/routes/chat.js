import { Router } from 'express';

const router = Router();

router.post('/send', async (req, res) => {
  try {
    const { message, images = [], parentNodeId, contextMessages = [], thinkingLevel = 'low', webSearch = false } = req.body;

const llmMessages = [];
    for (const ctx of contextMessages) {
      llmMessages.push({ role: 'user', content: buildContent(ctx.userContent, ctx.userImages || []) });
      llmMessages.push({ role: 'assistant', content: ctx.aiContent });
    }
    llmMessages.push({ role: 'user', content: buildContent(message, images) });

    const poeResponse = await fetch('https://api.poe.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.POE_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'Gemini-3.1-Pro',
        messages: llmMessages,
        stream: true,
        extra_body: {
          thinking_level: thinkingLevel,
          web_search: webSearch,
        },
      }),
    });

    if (!poeResponse.ok) {
      const errText = await poeResponse.text();
      console.error('Poe API error:', errText);
      return res.status(500).json({ success: false, error: { code: 'AI_SERVICE_ERROR', message: errText } });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const reader = poeResponse.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let done = false;
    let accumulatedContent = '';

    try {
      while (!done) {
        const { done: streamDone, value } = await reader.read();
        if (streamDone) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // 保留不完整的最后一行

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;

          const data = line.slice(6).trim();
          if (data === '[DONE]') {
            done = true;
            break;
          }

          try {
            const parsed = JSON.parse(data);
            const finishReason = parsed.choices?.[0]?.finish_reason;
            const deltaContent = parsed.choices?.[0]?.delta?.content;

            // 遇到任意 finish_reason 停止
            if (finishReason) {
              done = true;
              break;
            }

            // 检测重复内容：新 chunk 开头与已积累内容开头重合 → web search 重播
            if (deltaContent && accumulatedContent.length > 50 && deltaContent.length >= 10) {
              const checkLen = 10;
              if (deltaContent.substring(0, checkLen) === accumulatedContent.substring(0, checkLen)) {
                done = true;
                break;
              }
            }
            if (deltaContent) accumulatedContent += deltaContent;

            res.write(`data: ${data}\n\n`);
          } catch (e) {
            // 跳过无法解析的 chunk
          }
        }
      }
    } finally {
      res.write('data: [DONE]\n\n');
      res.end();
    }
  } catch (err) {
    console.error('Send message error:', err);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: { code: 'AI_SERVICE_ERROR', message: err.message } });
    }
  }
});

function buildContent(text, images) {
  if (!images || images.length === 0) return text;
  return [
    { type: 'text', text },
    ...images.map((url) => ({ type: 'image_url', image_url: { url } })),
  ];
}

export default router;
