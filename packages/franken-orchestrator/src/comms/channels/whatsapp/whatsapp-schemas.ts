import { z } from 'zod';

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
          timestamp: z.string(),
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
