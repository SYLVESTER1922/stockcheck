import { describe, expect, it } from 'vitest';
import { INSTRUCTIONS } from '../src/domain/instructions';

// Spec §4.11
describe('How to count instructions', () => {
  it('has the 10 instructions, the closed-branch precondition first and marked Required', () => {
    expect(INSTRUCTIONS).toHaveLength(10);
    expect(INSTRUCTIONS[0]).toMatchObject({ required: true });
    expect(INSTRUCTIONS[0]!.text).toContain('only while the branch is closed');
  });

  it('ends with the manager rule for repeated Items', () => {
    expect(INSTRUCTIONS[9]).toMatchObject({ forManager: true });
    expect(INSTRUCTIONS[9]!.text).toContain('use the latest');
  });
});
