import { z } from 'zod';

export const ClientSocketEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('message.send'),
    clientMessageId: z.string().min(1),
    content: z.string().min(1).max(16_384),
  }).strict(),
  z.object({
    type: z.literal('approval.respond'),
    approved: z.boolean(),
  }).strict(),
  z.object({
    type: z.literal('message.read'),
    messageId: z.string().min(1),
  }).strict(),
  z.object({
    type: z.literal('ping'),
  }).strict(),
]);

export type ClientSocketEvent = z.infer<typeof ClientSocketEventSchema>;

export const ServerSocketEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('session.ready'),
    sessionId: z.string().min(1),
    projectId: z.string().min(1),
    transcript: z.array(z.object({
      id: z.string().optional(),
      role: z.enum(['user', 'assistant', 'system']),
      content: z.string(),
      timestamp: z.string(),
      modelTier: z.string().optional(),
    })),
    state: z.string().min(1),
    pendingApproval: z.object({
      description: z.string(),
      requestedAt: z.string(),
    }).nullable().optional(),
  }).strict(),
  z.object({
    type: z.literal('message.accepted'),
    clientMessageId: z.string().min(1),
    sessionId: z.string().min(1),
    timestamp: z.string(),
  }).strict(),
  z.object({
    type: z.literal('message.delivered'),
    clientMessageId: z.string().min(1),
    timestamp: z.string(),
  }).strict(),
  z.object({
    type: z.literal('message.read'),
    clientMessageId: z.string().min(1).optional(),
    messageId: z.string().min(1).optional(),
    timestamp: z.string(),
  }).strict(),
  z.object({
    type: z.literal('assistant.typing.start'),
    timestamp: z.string(),
  }).strict(),
  z.object({
    type: z.literal('assistant.message.delta'),
    messageId: z.string().min(1),
    chunk: z.string(),
    modelTier: z.string().optional(),
  }).strict(),
  z.object({
    type: z.literal('assistant.message.complete'),
    messageId: z.string().min(1),
    content: z.string(),
    modelTier: z.string().optional(),
    timestamp: z.string(),
  }).strict(),
  z.object({
    type: z.literal('turn.execution.start'),
    data: z.record(z.string(), z.unknown()).optional(),
    timestamp: z.string(),
  }).strict(),
  z.object({
    type: z.literal('turn.execution.progress'),
    data: z.record(z.string(), z.unknown()).optional(),
    timestamp: z.string(),
  }).strict(),
  z.object({
    type: z.literal('turn.execution.complete'),
    data: z.record(z.string(), z.unknown()).optional(),
    timestamp: z.string(),
  }).strict(),
  z.object({
    type: z.literal('turn.approval.requested'),
    description: z.string().min(1),
    timestamp: z.string(),
  }).strict(),
  z.object({
    type: z.literal('turn.approval.resolved'),
    approved: z.boolean(),
    timestamp: z.string(),
  }).strict(),
  z.object({
    type: z.literal('turn.error'),
    code: z.string().min(1),
    message: z.string().min(1),
    timestamp: z.string(),
  }).strict(),
  z.object({
    type: z.literal('pong'),
    timestamp: z.string(),
  }).strict(),
]);

export type ServerSocketEvent = z.infer<typeof ServerSocketEventSchema>;
