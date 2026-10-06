import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CONTACT_LINES,
  displayMessage,
  isSuspended,
  NO_ANSWER,
  nextAccess,
  parseStatus,
  type Access,
  type CheckResult,
} from '../src/domain/access';

const enabled: CheckResult = { kind: 'answer', newSessions: 'enabled', message: '' };
const disabled: CheckResult = { kind: 'answer', newSessions: 'disabled', message: 'Paused for non-payment.' };
const NEVER: Access = null;
const SUSPENDED = nextAccess(NEVER, disabled);
const ALLOWED = nextAccess(NEVER, enabled);

// ADR 0006: fail-open, with a sticky explicit answer.
describe('nextAccess (decision rule)', () => {
  it.each([
    ['never heard + enabled', NEVER, enabled, false],
    ['never heard + disabled', NEVER, disabled, true],
    ['never heard + no answer', NEVER, NO_ANSWER, false],
    ['suspended + no answer (sticky)', SUSPENDED, NO_ANSWER, true],
    ['suspended + enabled (lifted)', SUSPENDED, enabled, false],
    ['allowed + no answer', ALLOWED, NO_ANSWER, false],
    ['allowed + disabled', ALLOWED, disabled, true],
  ])('%s → suspended: %s', (_label, before, result, suspended) => {
    expect(isSuspended(nextAccess(before, result))).toBe(suspended);
  });

  it('keeps the message of the explicit disabled answer', () => {
    expect(nextAccess(SUSPENDED, NO_ANSWER)).toEqual({ newSessions: 'disabled', message: 'Paused for non-payment.' });
  });
});

describe('parseStatus', () => {
  it('reads a valid file', () => {
    expect(parseStatus('{"newSessions":"disabled","message":"Emergency stop."}')).toEqual({
      kind: 'answer',
      newSessions: 'disabled',
      message: 'Emergency stop.',
    });
  });

  it('treats a missing message as empty', () => {
    expect(parseStatus('{"newSessions":"enabled"}')).toEqual({ kind: 'answer', newSessions: 'enabled', message: '' });
  });

  it.each([
    ['not JSON', 'oops'],
    ['an HTML error page', '<!doctype html><h1>404</h1>'],
    ['an unknown status', '{"newSessions":"maybe"}'],
    ['a status in the wrong case', '{"newSessions":"Disabled"}'],
    ['a non-string message', '{"newSessions":"disabled","message":42}'],
    ['an array', '[]'],
  ])('treats %s as no answer', (_label, text) => {
    expect(parseStatus(text)).toEqual(NO_ANSWER);
  });
});

describe('displayMessage', () => {
  it('falls back to a default when empty', () => {
    expect(displayMessage('  ')).toBe('New counts are paused by Netrisyl Insights.');
  });

  it('caps at 300 characters with an ellipsis', () => {
    const shown = displayMessage('x'.repeat(400));
    expect(shown).toHaveLength(300);
    expect(shown.endsWith('…')).toBe(true);
  });

  it('keeps markup as literal text (rendering is plain text)', () => {
    expect(displayMessage('<b>Paused</b>')).toBe('<b>Paused</b>');
  });
});

describe('contact block', () => {
  it('has the approved name and email, and nothing else yet', () => {
    expect(CONTACT_LINES).toEqual([
      { label: 'Name', value: 'Netrisyl Insights' },
      { label: 'Email', value: 'netrisyl.support@netrisyl.com' },
    ]);
  });
});

describe('the committed public/status.json', () => {
  it('is a valid Status File (enabled or disabled), so a typo can never deploy', () => {
    expect(parseStatus(readFileSync('public/status.json', 'utf8'))).toMatchObject({ kind: 'answer' });
  });
});
