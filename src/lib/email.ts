// Layerwise Email: transactional email from server code, available as
// `env.EMAIL` from `cloudflare:workers`. The local preview never sends real
// email; each message appears under Email → Local in the Layerwise app.
// Published apps send from the project's address after the first publish.

export type SendEmailInput = {
  // Exactly one address, like "ada@example.com". Send one email per recipient.
  to: string;
  // One line, at most 998 characters.
  subject: string;
  // At least one of html and text; together at most 1 MiB.
  html?: string;
  text?: string;
  replyTo?: string;
};

export type EmailErrorCode =
  // A bad field, more than one recipient, or a body over 1 MiB. Fix the code.
  | 'invalid_message'
  // The project has no active release; publish first.
  | 'not_published'
  // Layerwise paused this project's app email; contact Layerwise.
  | 'paused'
  // The recipient unsubscribed from this app's email. Stop emailing them.
  | 'unsubscribed'
  // The address bounced or reported spam before. Ask for another address.
  | 'suppressed'
  // This address received 20 emails from the app today; try tomorrow.
  | 'recipient_limit_reached'
  // The project's or the team's daily email limit is used up until midnight.
  | 'daily_limit_reached'
  | 'team_daily_limit_reached'
  // A temporary failure; retry later.
  | 'send_failed';

// `id` is the message ID shown in the Layerwise app's email log.
export type SendEmailResult =
  | { data: { id: string }; error: null }
  | { data: null; error: { code: EmailErrorCode; message: string } };

export interface ProjectEmailRpc {
  // Never throws for the errors above; check `error`.
  send(input: SendEmailInput): Promise<SendEmailResult>;
}

declare global {
  namespace Cloudflare {
    interface Env {
      EMAIL: Service & ProjectEmailRpc;
    }
  }
}
