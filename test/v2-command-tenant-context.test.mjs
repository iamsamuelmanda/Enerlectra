import test from 'node:test';
import assert from 'node:assert/strict';
import { CommandFactory } from '../enerlectra-core/src/core/translation/command-factory.ts';

const factory = new CommandFactory();
const baseEvent = {
  eventId: 'event-1',
  correlationId: 'correlation-1',
  conversationId: 'conversation-1',
  timestamp: '2026-10-04T00:00:00.000Z',
  channel: 'whatsapp',
  interaction: 'text',
  sender: { id: 'channel-user-123', channel: 'whatsapp', role: 'unknown' },
  text: 'hello',
  metadata: {},
};

test('command factory rejects channel events without trusted tenant context', () => {
  assert.throws(
    () => factory.create('GenericQuery', baseEvent),
    /TRUSTED_TENANT_CONTEXT_REQUIRED/,
  );
});

test('command factory preserves explicitly resolved actor and organization context', () => {
  const event = {
    ...baseEvent,
    sender: { ...baseEvent.sender, id: 'actor-123', organizationId: 'org-456' },
  };
  const command = factory.create('GenericQuery', event);
  assert.equal(command.context.actorId, 'actor-123');
  assert.equal(command.context.organizationId, 'org-456');
  assert.notEqual(command.context.organizationId, 'default-org');
});
