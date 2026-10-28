import { useState } from 'react';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useMutation } from '@tanstack/react-query';
import { ChevronDownIcon } from 'lucide-react';
import { authClient } from '~/lib/auth-client';
import { Button } from '~/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '~/components/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger
} from '~/components/ui/collapsible';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { Separator } from '~/components/ui/separator';
import { seo } from '~/utils/seo';

export const Route = createFileRoute('/sign-in')({
  head: () => seo({ title: 'Sign in', noindex: true }),
  component: SignInPage
});

function SignInPage() {
  const navigate = useNavigate();
  const [passwordEmail, setPasswordEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otpEmail, setOtpEmail] = useState('');

  const sendOtp = useMutation({
    mutationFn: async () => {
      const { error } = await authClient.emailOtp.sendVerificationOtp({
        email: otpEmail,
        type: 'sign-in'
      });
      if (error) throw new Error(error.message ?? 'Failed to send code');
    },
    onSuccess: () =>
      navigate({ to: '/sign-in/otp', search: { email: otpEmail } })
  });

  const signInWithPassword = useMutation({
    mutationFn: async () => {
      const { error } = await authClient.signIn.email({
        email: passwordEmail,
        password
      });
      if (error) throw new Error(error.message ?? 'Failed to sign in');
    },
    onSuccess: () => navigate({ to: '/dashboard' })
  });

  return (
    <div className='flex min-h-svh items-center justify-center p-4'>
      <Card className='w-full max-w-sm'>
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>
            Enter your email and we’ll send you a one-time sign-in code.
          </CardDescription>
        </CardHeader>
        <CardContent className='flex flex-col gap-6'>
          <form
            className='flex flex-col gap-4'
            onSubmit={(event) => {
              event.preventDefault();
              sendOtp.mutate();
            }}
          >
            <div className='flex flex-col gap-2'>
              <div className='flex items-center justify-between gap-4'>
                <Label htmlFor='otp-email'>Email</Label>
              </div>
              <Input
                id='otp-email'
                type='email'
                autoComplete='email'
                autoFocus
                required
                value={otpEmail}
                onChange={(event) => {
                  setOtpEmail(event.target.value);
                  sendOtp.reset();
                }}
              />
            </div>
            {sendOtp.error ? (
              <p className='text-sm text-destructive'>
                {sendOtp.error.message}
              </p>
            ) : null}
            <Button type='submit' disabled={sendOtp.isPending}>
              {sendOtp.isPending ? 'Sending code…' : 'Continue with email'}
            </Button>
          </form>
          <div className='flex items-center gap-3'>
            <Separator className='flex-1' />
            <span className='text-xs text-muted-foreground'>OR</span>
            <Separator className='flex-1' />
          </div>
          <Collapsible>
            <CollapsibleTrigger asChild>
              <Button variant='ghost' className='group w-full'>
                Sign in with password
                <ChevronDownIcon className='size-4 transition-transform group-data-[state=open]:rotate-180' />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className='pt-4'>
              <form
                className='flex flex-col gap-4'
                onSubmit={(event) => {
                  event.preventDefault();
                  signInWithPassword.mutate();
                }}
              >
                <div className='flex flex-col gap-2'>
                  <Label htmlFor='password-email'>Email</Label>
                  <Input
                    id='password-email'
                    type='email'
                    autoComplete='email'
                    required
                    value={passwordEmail}
                    onChange={(event) => {
                      setPasswordEmail(event.target.value);
                      signInWithPassword.reset();
                    }}
                  />
                </div>
                <div className='flex flex-col gap-2'>
                  <div className='flex items-center justify-between gap-4'>
                    <Label htmlFor='password'>Password</Label>
                    <Link
                      to='/forgot-password'
                      className='text-sm text-muted-foreground underline'
                    >
                      Forgot password?
                    </Link>
                  </div>
                  <Input
                    id='password'
                    type='password'
                    autoComplete='current-password'
                    required
                    value={password}
                    onChange={(event) => {
                      setPassword(event.target.value);
                      signInWithPassword.reset();
                    }}
                  />
                </div>
                {signInWithPassword.error ? (
                  <p className='text-sm text-destructive'>
                    {signInWithPassword.error.message}
                  </p>
                ) : null}
                <Button type='submit' disabled={signInWithPassword.isPending}>
                  {signInWithPassword.isPending
                    ? 'Signing in…'
                    : 'Sign in with password'}
                </Button>
              </form>
            </CollapsibleContent>
          </Collapsible>
          <p className='text-center text-sm text-muted-foreground'>
            Don’t have an account?{' '}
            <Link to='/sign-up' className='underline'>
              Sign up
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
