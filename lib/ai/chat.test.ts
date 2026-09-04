import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processChatRequest } from '@/app/api/v1/ai/chat/route';
import * as auditModule from '@/lib/audit';

// ---------------------------------------------------------------------------
// Test Constants & Mocks
// ---------------------------------------------------------------------------

const PROJECT_ID = '00000000-0000-0000-0000-000000000001';
const PM_USER_ID = '11111111-1111-1111-1111-111111111111';
const UNAUTH_USER_ID = '22222222-2222-2222-2222-222222222222';

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
    role_permissions: {
      findMany: async () => [],
    },
    permissions: {
      findMany: async () => [],
    },
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
    contracts: {
      findMany: async () => [],
    },
    ipc_certificates: {
      findFirst: async () => null,
      findMany: async () => [],
    },
  };
}

describe('AI Chat Route & DeepSeek Tool Integration Loop', () => {
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    mockDb = createMockDb();
    vi.restoreAllMocks();
  });

  it('1. Tool execution loop: parses tool_calls, executes tool, passes role: tool message, and returns streamed final response', async () => {
    const writeAuditSpy = vi.spyOn(auditModule, 'writeAudit').mockResolvedValue({} as any);

    // Mock DeepSeek API client
    const deepseekCalls: any[] = [];
    const mockDeepSeekClient = {
      chat: {
        completions: {
          create: vi.fn(async (params: any) => {
            deepseekCalls.push(params);

            // Round 1: Model requests get_project_summary tool call
            if (deepseekCalls.length === 1) {
              return {
                choices: [
                  {
                    message: {
                      role: 'assistant',
                      content: null,
                      tool_calls: [
                        {
                          id: 'call_abc123',
                          type: 'function',
                          function: {
                            name: 'get_project_summary',
                            arguments: JSON.stringify({ projectId: PROJECT_ID }),
                          },
                        },
                      ],
                    },
                  },
                ],
              };
            }

            // Round 2: Model returns final text response after tool output
            return {
              choices: [
                {
                  message: {
                    role: 'assistant',
                    content: 'The Modjo-Hawassa Road project contract value is 50,000,000 ETB.',
                  },
                },
              ],
            };
          }),
        },
      },
    };

    const userMessages = [
      { role: 'user', content: 'What is the summary of this project?' },
    ];

    const response = await processChatRequest(
      PROJECT_ID,
      PM_USER_ID,
      userMessages,
      mockDeepSeekClient,
      mockDb
    );

    // Verify response is a stream Response
    expect(response).toBeInstanceOf(Response);
    const text = await response.text();
    expect(text).toBe('The Modjo-Hawassa Road project contract value is 50,000,000 ETB.');

    // Verify DeepSeek client was called twice (turn 1 request -> turn 2 final answer)
    expect(deepseekCalls).toHaveLength(2);

    // Check Round 2 history passed to DeepSeek contained tool call response with role 'tool'
    const round2Messages = deepseekCalls[1].messages;
    const toolResultMessage = round2Messages.find((m: any) => m.role === 'tool');

    expect(toolResultMessage).toBeDefined();
    expect(toolResultMessage.tool_call_id).toBe('call_abc123');

    const parsedContent = JSON.parse(toolResultMessage.content);
    expect(parsedContent.projectId).toBe(PROJECT_ID);
    expect(parsedContent.name).toBe('Modjo-Hawassa Road');

    // Verify writeAudit was called ONCE per exchange
    expect(writeAuditSpy).toHaveBeenCalledTimes(1);
    expect(writeAuditSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-123',
        projectId: PROJECT_ID,
        actorUserId: PM_USER_ID,
        action: 'AI_CHAT_QUERY',
        entityType: 'ai_chat',
        metadata: expect.objectContaining({
          userQuestion: 'What is the summary of this project?',
          toolsCalled: ['get_project_summary'],
        }),
      })
    );
  });

  it('2. Runaway loop protection: terminates cleanly at max iterations', async () => {
    const mockDeepSeekClient = {
      chat: {
        completions: {
          create: vi.fn(async () => ({
            choices: [
              {
                message: {
                  role: 'assistant',
                  content: null,
                  tool_calls: [
                    {
                      id: 'call_loop',
                      type: 'function',
                      function: {
                        name: 'get_project_summary',
                        arguments: '{}',
                      },
                    },
                  ],
                },
              },
            ],
          })),
        },
      },
    };

    const response: any = await processChatRequest(
      PROJECT_ID,
      PM_USER_ID,
      [{ role: 'user', content: 'Infinite loop test' }],
      mockDeepSeekClient,
      mockDb
    );

    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json.error).toContain('exceeded maximum tool execution rounds');
  });
});
