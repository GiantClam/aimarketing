import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { platform, topic, tone } = await request.json();

    if (!platform || !topic || !tone) {
      return NextResponse.json(
        { error: 'Missing required fields: platform, topic, tone' },
        { status: 400 }
      );
    }

    const content = generateContent(platform, topic, tone);

    return NextResponse.json({ content });
  } catch (_error) {
    return NextResponse.json(
      { error: 'Failed to generate content' },
      { status: 500 }
    );
  }
}

function generateContent(platform: string, topic: string, tone: string): string {
  const templates: Record<string, string> = {
    xiaohongshu: `✨ ${topic} | 姐妹们一定要看！\n\n姐妹们！今天来分享${topic}～\n${getToneDescription(tone)}\n\n💡 核心要点：\n• 简单易懂，新手友好\n• 实用干货满满\n• 亲测有效\n\n#${topic.replace(/\s/g, '')} #干货分享 #生活小技巧`,
    
    zhihu: `## 关于${topic}的深度思考\n\n${getToneDescription(tone)}\n\n### 一、背景分析\n\n${topic}是一个值得深入探讨的话题。\n\n### 二、核心观点\n\n1. 从理论层面来看\n2. 从实践角度分析\n3. 从发展趋势思考\n\n### 三、总结\n\n以上是我对${topic}的一些思考，欢迎讨论。`,
    
    wechat: `**${topic}**\n\n${getToneDescription(tone)}\n\n今天想和大家聊聊${topic}。\n\n在这个快节奏的时代，${topic}变得越来越重要。\n\n希望这篇文章对你有所帮助，如果觉得不错，欢迎分享给朋友～\n\n—END—`
  };

  return templates[platform] || `Generated content for ${topic} in ${tone} tone for ${platform}`;
}

function getToneDescription(tone: string): string {
  const toneMap: Record<string, string> = {
    professional: '专业严谨，数据支撑',
    casual: '轻松随意，像朋友聊天',
    humorous: '幽默风趣，让人会心一笑',
    inspirational: '积极向上，充满正能量',
    serious: '严肃认真，深度剖析'
  };
  
  return toneMap[tone] || '自然流畅';
}
