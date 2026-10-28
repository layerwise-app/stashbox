import { env } from 'cloudflare:workers';

export type AuthEmailType =
  'sign-in' | 'email-verification' | 'forget-password';

export async function sendAuthEmail(params: {
  email: string;
  otp: string;
  type: AuthEmailType;
}): Promise<void> {
  const authEmailUrl = env.AUTH_EMAIL_URL;
  if (!authEmailUrl) {
    console.log(
      `[auth] OTP for ${params.email} (${params.type}): ${params.otp}`
    );
    return;
  }

  const response = await fetch(authEmailUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(params)
  });
  if (!response.ok) {
    throw new Error(
      `Authentication email service responded with ${response.status}`
    );
  }
}
