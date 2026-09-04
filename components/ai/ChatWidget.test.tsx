import { describe, it, expect } from 'vitest';
import { TOOL_FRIENDLY_NAMES } from '@/lib/ai/tools';

function parseNDJSONStream(chunks: string[], onEvent: (event: any) => void) {
  let buffer = '';
  for (const chunk of chunks) {
    buffer += chunk;
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      onEvent(JSON.parse(trimmed));
    }
  }
}

describe('ChatWidget Stream Parser & Tool Label Mapping', () => {
  it('1. Parses split NDJSON chunk fragments into discrete tool_call, content, and done events', () => {
    const events: any[] = [];
    const streamChunks = [
      '{"type":"tool_call","name":"get_boq_status","label":"BOQ status"}\n{"type":"content",',
      '"delta":"Here is "} \n{"type":"content","delta":"the BOQ '  ,
      'summary."}\n{"type":"done"}\n',
    ];

    parseNDJSONStream(streamChunks, (e) => events.push(e));

    expect(events).toHaveLength(4);
    expect(events[0]).toEqual({ type: 'tool_call', name: 'get_boq_status', label: 'BOQ status' });
    expect(events[1]).toEqual({ type: 'content', delta: 'Here is ' });
    expect(events[2]).toEqual({ type: 'content', delta: 'the BOQ summary.' });
    expect(events[3]).toEqual({ type: 'done' });
  });

  it('2. Maps all 6 tool schema names to friendly human labels', () => {
    expect(TOOL_FRIENDLY_NAMES.get_project_summary).toBe('Project summary');
    expect(TOOL_FRIENDLY_NAMES.get_boq_status).toBe('BOQ status');
    expect(TOOL_FRIENDLY_NAMES.get_ipc_status).toBe('IPC status');
    expect(TOOL_FRIENDLY_NAMES.get_procurement_status).toBe('Procurement status');
    expect(TOOL_FRIENDLY_NAMES.get_workforce_status).toBe('Workforce status');
    expect(TOOL_FRIENDLY_NAMES.get_recent_activity).toBe('Recent activity');
  });
});
