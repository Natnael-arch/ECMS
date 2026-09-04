import { NextRequest, NextResponse } from 'next/server';
import { requireApiPermission } from '@/lib/server/session';
import { db } from '@/lib/db';
import { writeAudit } from '@/lib/audit';
import { deepseek, DEEPSEEK_MODEL } from '@/lib/ai/deepseek-client';
import { buildSystemPrompt } from '@/lib/ai/system-prompt';
import { tools as registeredTools, TOOL_FRIENDLY_NAMES } from '@/lib/ai/tools';

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
  let auditWritten = false;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        while (round < MAX_ROUNDS) {
          round++;

          const responseStream = await client.chat.completions.create({
            model: DEEPSEEK_MODEL,
            messages: conversationHistory,
            tools: formattedTools,
            tool_choice: 'auto',
            stream: true,
          });

          const toolCallsAcc: Array<{ id: string; name: string; arguments: string }> = [];
          let roundContent = '';
          let finishReason: string | null = null;

          for await (const chunk of responseStream) {
            const choice = chunk.choices?.[0];
            if (!choice) continue;

            if (choice.finish_reason) {
              finishReason = choice.finish_reason;
            }

            const delta = choice.delta;
            if (!delta) continue;

            // Accumulate tool_calls deltas by index
            if (delta.tool_calls) {
              for (const tcDelta of delta.tool_calls) {
                const idx = tcDelta.index;
                if (toolCallsAcc[idx] === undefined) {
                  toolCallsAcc[idx] = {
                    id: tcDelta.id || '',
                    name: tcDelta.function?.name || '',
                    arguments: tcDelta.function?.arguments || '',
                  };
                } else {
                  if (tcDelta.id) toolCallsAcc[idx].id = tcDelta.id;
                  if (tcDelta.function?.name) toolCallsAcc[idx].name += tcDelta.function.name;
                  if (tcDelta.function?.arguments) toolCallsAcc[idx].arguments += tcDelta.function.arguments;
                }
              }
            }

            // Text content delta
            if (delta.content) {
              roundContent += delta.content;

              // Stream NDJSON content event to client ONLY if no tool calls are being accumulated in this round
              if (toolCallsAcc.length === 0) {
                if (!auditWritten) {
                  auditWritten = true;
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
                }

                controller.enqueue(
                  encoder.encode(JSON.stringify({ type: 'content', delta: delta.content }) + '\n')
                );
              }
            }
          }

          // Check if this round executed tool calls
          if (toolCallsAcc.length > 0 || finishReason === 'tool_calls') {
            conversationHistory.push({
              role: 'assistant',
              content: roundContent || null,
              tool_calls: toolCallsAcc.map((tc) => ({
                id: tc.id,
                type: 'function',
                function: { name: tc.name, arguments: tc.arguments },
              })),
            });

            for (const tc of toolCallsAcc) {
              toolsCalled.push(tc.name);

              // Emit NDJSON tool_call event to client before executing tool
              controller.enqueue(
                encoder.encode(
                  JSON.stringify({
                    type: 'tool_call',
                    name: tc.name,
                    label: TOOL_FRIENDLY_NAMES[tc.name] || tc.name,
                  }) + '\n'
                )
              );

              let parsedArgs: any = {};
              try {
                parsedArgs = JSON.parse(tc.arguments || '{}');
              } catch {
                parsedArgs = {};
              }

              const targetTool = toolMap.get(tc.name);
              let result: any;
              if (targetTool) {
                result = await targetTool.run(projectId, userId, parsedArgs, dbClient);
              } else {
                result = { restricted: true, reason: `Tool '${tc.name}' is not recognized.` };
              }

              conversationHistory.push({
                role: 'tool',
                tool_call_id: tc.id,
                content: JSON.stringify(result),
              });
            }

            // Loop to next round
            continue;
          }

          // Final response round finished
          if (!auditWritten) {
            auditWritten = true;
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
          }

          controller.enqueue(encoder.encode(JSON.stringify({ type: 'done' }) + '\n'));
          controller.close();
          return;
        }

        // Max rounds exceeded
        controller.enqueue(
          encoder.encode(
            JSON.stringify({
              type: 'error',
              message: 'AI chat loop exceeded maximum tool execution rounds.',
            }) + '\n'
          )
        );
        controller.close();
      } catch (err: any) {
        controller.enqueue(
          encoder.encode(
            JSON.stringify({
              type: 'error',
              message: err?.message || 'Internal Server Error during chat processing',
            }) + '\n'
          )
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
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
