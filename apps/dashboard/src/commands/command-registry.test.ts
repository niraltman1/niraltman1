import { describe, it, expect, vi } from 'vitest';
import { COMMANDS, matchCommands } from './command-registry.js';

describe('command-registry', () => {
  it('returns all commands for an empty query (Quick-Add view)', () => {
    expect(matchCommands('')).toHaveLength(COMMANDS.length);
    expect(matchCommands('   ')).toHaveLength(COMMANDS.length);
  });

  it('strips a leading ">" command prefix', () => {
    expect(matchCommands('>')).toHaveLength(COMMANDS.length);
    expect(matchCommands('>תיק').map((c) => c.id)).toContain('create-case');
  });

  it('matches by Hebrew label substring', () => {
    expect(matchCommands('לקוח').map((c) => c.id)).toEqual(['create-client']);
    expect(matchCommands('משימה').map((c) => c.id)).toEqual(['create-task']);
  });

  it('matches by English keyword', () => {
    expect(matchCommands('new case').map((c) => c.id)).toEqual(['create-case']);
  });

  it('matches the shared "צור" keyword across all create commands', () => {
    expect(matchCommands('צור').map((c) => c.id).sort()).toEqual(
      ['create-case', 'create-client', 'create-task'],
    );
  });

  it('returns nothing for an unrelated query', () => {
    expect(matchCommands('כהן')).toHaveLength(0);
  });

  it('each command navigates to its create deep link', () => {
    const navigate = vi.fn();
    for (const cmd of COMMANDS) cmd.perform({ navigate });
    expect(navigate).toHaveBeenCalledWith('/cases?new=1');
    expect(navigate).toHaveBeenCalledWith('/clients?new=1');
    expect(navigate).toHaveBeenCalledWith('/tasks?new=1');
  });
});
