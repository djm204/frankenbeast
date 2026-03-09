import { z } from 'zod';

export const ChatConfigSchema = z.object({
  maxTranscriptLength: z.number().nonnegative().default(100),
  defaultTier: z.string().default('cheap'),
  budgetPerSession: z.number().nonnegative().default(1.0),
  approvalRequired: z.array(z.string()).default(['repo_action']),
});
export type ChatConfig = z.infer<typeof ChatConfigSchema>;

export const defaultChatConfig: ChatConfig = {
  maxTranscriptLength: 100,
  defaultTier: 'cheap',
  budgetPerSession: 1.0,
  approvalRequired: ['repo_action'],
};
