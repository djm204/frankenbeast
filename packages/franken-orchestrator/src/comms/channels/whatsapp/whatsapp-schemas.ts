import { z } from 'zod';

const MAX_VALID_UNIX_SECONDS = 8_640_000_000_000;

const WhatsAppTimestampSchema = z.string().refine((value) => {
  if (!/^\d+$/.test(value)) {
    return false;
  }

  const seconds = Number(value);
  return Number.isSafeInteger(seconds) && seconds <= MAX_VALID_UNIX_SECONDS;
}, 'timestamp must be a valid Unix timestamp in seconds');

export const WhatsAppWebhookSchema = z.object({
  object: z.string(),
  entry: z.array(z.object({
    id: z.string(),
    changes: z.array(z.object({
      value: z.object({
        messaging_product: z.string(),
        metadata: z.object({
          display_phone_number: z.string(),
          phone_number_id: z.string(),
        }),
        contacts: z.array(z.object({
          profile: z.object({ name: z.string() }),
          wa_id: z.string(),
        })).optional(),
        messages: z.array(z.object({
          from: z.string(),
          id: z.string(),
          timestamp: WhatsAppTimestampSchema,
          text: z.object({ body: z.string() }).optional(),
          type: z.string(),
          interactive: z.object({
            type: z.string(),
            button_reply: z.object({
              id: z.string(),
              title: z.string(),
            }).optional(),
          }).optional(),
        })).optional(),
      }),
      field: z.string(),
    })),
  })),
});

export type WhatsAppWebhook = z.infer<typeof WhatsAppWebhookSchema>;
