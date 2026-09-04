import { NextRequest, NextResponse } from 'next/server';
import { requireApiPermission } from '@/lib/server/session';
import { db } from '@/lib/db';
import { writeAudit } from '@/lib/audit';
import { deepseek, DEEPSEEK_MODEL } from '@/lib/ai/deepseek-client';
import { buildSystemPrompt } from '@/lib/ai/system-prompt';
import { tools as registeredTools } from '@/lib/ai/tools';

export const dynamic = 'force-dynamic';

const formattedTools = registeredTools.map((t) => ({
  type: 'function' as const,
  function: t.schema,
}));

const toolMap = new Map<string, any>();
for (const t of registeredTools) {
  toolMap.set(t.schema.name, t);
}

export async function processChatRequest(
  projectId: string,
  userId: string,
  messages: Array<{ role: string; content?: any; tool_calls?: any; tool_call_id?: string }>,
  clientOverride?: any,
  dbClient: any = db
) {
  const client = clientOverride || deepseek;

  const project = await dbClient.projects.findUnique({
    where: { id: projectId },
    select: { name: true, project_code: true, tenant_id: true },
  });

  const tenantId = project?.tenant_id || '';
  const systemPrompt = buildSystemPrompt({
    projectName: project?.name,
    projectCode: project?.project_code,
    projectId,
  });

  const conversationHistory: any[] = [
    { role: 'system', content: systemPrompt },
    ...messages,
  ];

  const MAX_ROUNDS = 6;
  let round = 0;
  const toolsCalled: string[] = [];

  while (round < MAX_ROUNDS) {
    round++;

    const response = await client.chat.completions.create({
      model: DEEPSEEK_MODEL,
      messages: conversationHistory,
      tools: formattedTools,
      tool_choice: 'auto',
    });

    const choice = response.choices[0];
    const message = choice.message;

    if (message.tool_calls && message.tool_calls.length > 0) {
      // Append assistant tool_calls message
      conversationHistory.push({
        role: 'assistant',
        content: message.content || null,
        tool_calls: message.tool_calls,
      });

      for (const toolCall of message.tool_calls) {
        const functionName = toolCall.function.name;
        toolsCalled.push(functionName);

        let parsedArgs: any = {};
        try {
          parsedArgs = JSON.parse(toolCall.function.arguments || '{}');
        } catch {
          parsedArgs = {};
        }

        const targetTool = toolMap.get(functionName);
        let result: any;
        if (targetTool) {
          result = await targetTool.run(projectId, userId, parsedArgs, dbClient);
        } else {
          result = { restricted: true, reason: `Tool '${functionName}' is not recognized.` };
        }

        conversationHistory.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        });
      }
      // Continue loop for next turn with tool responses included
    } else {
      // Final response text
      const finalText = message.content || '';
      const userPrompt = messages.findLast((m) => m.role === 'user')?.content || 'AI Chat Query';

      await writeAudit({
        tenantId,
        projectId,
        actorUserId: userId,
        action: 'AI_CHAT_QUERY',
        entityType: 'ai_chat',
        metadata: {
          userQuestion: typeof userPrompt === 'string' ? userPrompt.slice(0, 200) : 'Query',
          toolsCalled: Array.from(new Set(toolsCalled)),
        },
      });

      // Stream text response to client using ReadableStream
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(finalText));
          controller.close();
        },
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-cache',
        },
      });
    }
  }

  return NextResponse.json(
    { error: 'AI chat loop exceeded maximum tool execution rounds.' },
    { status: 500 }
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { projectId, messages } = body || {};

    if (!projectId || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: 'Both projectId and messages array are required.' },
        { status: 400 }
      );
    }

    const auth = await requireApiPermission('ai_chat.use', projectId);
    if (auth instanceof NextResponse) {
      return auth;
    }

    return await processChatRequest(projectId, auth.appUser.id, messages);
  } catch (error: any) {
    console.error('[AI Chat Route Error]:', error);
    return NextResponse.json(
      { error: error?.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
