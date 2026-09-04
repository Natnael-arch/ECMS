import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processChatRequest, POST } from '@/app/api/v1/ai/chat/route';
import * as auditModule from '@/lib/audit';
import * as sessionModule from '@/lib/server/session';
import { NextResponse } from 'next/server';

// ---------------------------------------------------------------------------
// Test Constants & Mock Generators
// ---------------------------------------------------------------------------

const PROJECT_ID = '00000000-0000-0000-0000-000000000001';
const PM_USER_ID = '11111111-1111-1111-1111-111111111111';

async function* createMockAsyncStream(chunks: any[]) {
  for (const chunk of chunks) {
    yield chunk;
  }
}

function createMockDb() {
  return {
    projects: {
      findUnique: async ({ where }: any) => {
        if (where.id === PROJECT_ID) {
          return {
            id: PROJECT_ID,
            name: 'Modjo-Hawassa Road',
            project_code: 'PRJ-001',
            tenant_id: 'tenant-123',
          };
        }
        return null;
      },
    },
    tenant_member_roles: {
      findMany: async ({ where }: any) => {
        if (where.user_id === PM_USER_ID) {
          return [{ role_id: 'role-pm', roles: { role_key: 'employer_pm' } }];
        }
        return [];
      },
    },
    role_permissions: { findMany: async () => [] },
    permissions: { findMany: async () => [] },
    project_members: {
      findUnique: async ({ where }: any) => {
        if (where.project_id_user_id.user_id === PM_USER_ID) {
          return { id: 'pm-member-id' };
        }
        return null;
      },
    },
    project_member_roles: {
      findMany: async ({ where }: any) => {
        if (where.project_member_id === 'pm-member-id') {
          return [
            {
              roles: {
                role_key: 'employer_pm',
                role_permissions: [
                  { permission_key: 'ai_chat.use' },
                  { permission_key: 'contract.read' },
                  { permission_key: 'boq.read' },
                  { permission_key: 'ipc.read' },
                ],
              },
            },
          ];
        }
        return [];
      },
    },
    contracts: { findMany: async () => [] },
    ipc_certificates: {
      findFirst: async () => null,
      findMany: async () => [],
    },
  };
}

describe('AI Chat Route & Real Streaming Architecture', () => {
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    mockDb = createMockDb();
    vi.restoreAllMocks();
  });

  it('1. Permission Gate Hard Check: blocks unauthorized users before any DeepSeek call', async () => {
    const requireApiPermSpy = vi.spyOn(sessionModule, 'requireApiPermission').mockResolvedValue(
      NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    );

    const req = new Request('http://localhost:3000/api/v1/ai/chat', {
      method: 'POST',
      body: JSON.stringify({ projectId: PROJECT_ID, messages: [{ role: 'user', content: 'Hi' }] }),
    });

    const res = await POST(req as any);
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe('Forbidden');
    expect(requireApiPermSpy).toHaveBeenCalledWith('ai_chat.use', PROJECT_ID);
  });

  it('2. Real Streaming Verification: discrete text chunks arrive incrementally over the reader', async () => {
    const writeAuditSpy = vi.spyOn(auditModule, 'writeAudit').mockResolvedValue({} as any);

    const mockDeepSeekClient = {
      chat: {
        completions: {
          create: vi.fn(async () =>
            createMockAsyncStream([
              { choices: [{ delta: { content: 'The ' }, finish_reason: null }] },
              { choices: [{ delta: { content: 'project ' }, finish_reason: null }] },
              { choices: [{ delta: { content: 'status ' }, finish_reason: null }] },
              { choices: [{ delta: { content: 'is active.' }, finish_reason: 'stop' }] },
            ])
          ),
        },
      },
    };

    const response = await processChatRequest(
      PROJECT_ID,
      PM_USER_ID,
      [{ role: 'user', content: 'Status?' }],
      mockDeepSeekClient,
      mockDb
    );

    expect(response).toBeInstanceOf(Response);
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();

    const receivedChunks: string[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      receivedChunks.push(decoder.decode(value));
    }

    // Verify content arrived in 4 discrete chunks over the stream
    expect(receivedChunks).toHaveLength(4);
    expect(receivedChunks[0]).toBe('The ');
    expect(receivedChunks[1]).toBe('project ');
    expect(receivedChunks[2]).toBe('status ');
    expect(receivedChunks[3]).toBe('is active.');
    expect(receivedChunks.join('')).toBe('The project status is active.');

    // Audit written once per exchange
    expect(writeAuditSpy).toHaveBeenCalledTimes(1);
  });

  it('3. Multi-round Tool Call Execution: tool round deltas are buffered server-side and only final answer streams to client', async () => {
    const writeAuditSpy = vi.spyOn(auditModule, 'writeAudit').mockResolvedValue({} as any);

    const deepseekCalls: any[] = [];
    const mockDeepSeekClient = {
      chat: {
        completions: {
          create: vi.fn(async (params: any) => {
            deepseekCalls.push(params);

            // Round 1: Streaming tool_calls fragments across multiple chunks
            if (deepseekCalls.length === 1) {
              return createMockAsyncStream([
                {
                  choices: [
                    {
                      delta: {
                        tool_calls: [
                          { index: 0, id: 'call_1', type: 'function', function: { name: 'get_project_summary', arguments: '{"proj' } },
                        ],
                      },
                      finish_reason: null,
                    },
                  ],
                },
                {
                  choices: [
                    {
                      delta: {
                        tool_calls: [
                          { index: 0, function: { arguments: `ectId":"${PROJECT_ID}"}` } },
                        ],
                      },
                      finish_reason: 'tool_calls',
                    },
                  ],
                },
              ]);
            }

            // Round 2: Final response stream
            return createMockAsyncStream([
              { choices: [{ delta: { content: 'Contract ' }, finish_reason: null }] },
              { choices: [{ delta: { content: 'value: 50M ETB.' }, finish_reason: 'stop' }] },
            ]);
          }),
        },
      },
    };

    const response = await processChatRequest(
      PROJECT_ID,
      PM_USER_ID,
      [{ role: 'user', content: 'Summarize project' }],
      mockDeepSeekClient,
      mockDb
    );

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    const receivedChunks: string[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      receivedChunks.push(decoder.decode(value));
    }

    // Round 1 tool-call fragments were buffered. Only Round 2 text chunks reached the client stream.
    expect(receivedChunks).toHaveLength(2);
    expect(receivedChunks[0]).toBe('Contract ');
    expect(receivedChunks[1]).toBe('value: 50M ETB.');
    expect(receivedChunks.join('')).toBe('Contract value: 50M ETB.');

    // Confirm tool result role: tool was appended with parsed arguments
    const round2Messages = deepseekCalls[1].messages;
    const toolMsg = round2Messages.find((m: any) => m.role === 'tool');
    expect(toolMsg).toBeDefined();
    expect(toolMsg.tool_call_id).toBe('call_1');
    const toolResult = JSON.parse(toolMsg.content);
    expect(toolResult.name).toBe('Modjo-Hawassa Road');

    // Confirm audit written once with called tools list
    expect(writeAuditSpy).toHaveBeenCalledTimes(1);
    expect(writeAuditSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          toolsCalled: ['get_project_summary'],
        }),
      })
    );
  });

  it('4. Runaway Loop Protection: caps iterations at max rounds and terminates stream with error text', async () => {
    const mockDeepSeekClient = {
      chat: {
        completions: {
          create: vi.fn(async () =>
            createMockAsyncStream([
              {
                choices: [
                  {
                    delta: {
                      tool_calls: [
                        { index: 0, id: 'call_loop', type: 'function', function: { name: 'get_project_summary', arguments: '{}' } },
                      ],
                    },
                    finish_reason: 'tool_calls',
                  },
                ],
              },
            ])
          ),
        },
      },
    };

    const response = await processChatRequest(
      PROJECT_ID,
      PM_USER_ID,
      [{ role: 'user', content: 'Infinite loop test' }],
      mockDeepSeekClient,
      mockDb
    );

    const text = await response.text();
    expect(text).toContain('[Error: AI chat loop exceeded maximum tool execution rounds.]');
  });
});
