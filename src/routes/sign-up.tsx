import { useState } from 'react';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useMutation } from '@tanstack/react-query';
import { authClient } from '~/lib/auth-client';
import { Button } from '~/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '~/components/ui/card';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { seo } from '~/utils/seo';

export const Route = createFileRoute('/sign-up')({
  head: () => seo({ title: 'Create an account', noindex: true }),
  component: SignUpPage
});

function SignUpPage() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const passwordsMatch = password === confirmPassword;

  const signUp = useMutation({
    mutationFn: async () => {
      const { error } = await authClient.signUp.email({
        name,
        email,
        password
      });
      if (error) throw new Error(error.message ?? 'Failed to create account');
    },
    onSuccess: () => navigate({ to: '/dashboard' })
  });

  return (
    <div className='flex min-h-svh items-center justify-center p-4'>
      <Card className='w-full max-w-sm'>
        <CardHeader>
          <CardTitle>Create an account</CardTitle>
          <CardDescription>
            Sign up with your email and password.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className='flex flex-col gap-4'
            onSubmit={(event) => {
              event.preventDefault();
              if (!passwordsMatch) return;
              signUp.mutate();
            }}
          >
            <div className='flex flex-col gap-2'>
              <Label htmlFor='name'>Name</Label>
              <Input
                id='name'
                autoComplete='name'
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className='flex flex-col gap-2'>
              <Label htmlFor='email'>Email</Label>
              <Input
                id='email'
                type='email'
                autoComplete='email'
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            <div className='flex flex-col gap-2'>
              <Label htmlFor='password'>Password</Label>
              <Input
                id='password'
                type='password'
                autoComplete='new-password'
                minLength={8}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
            <div className='flex flex-col gap-2'>
              <Label htmlFor='confirm-password'>Confirm password</Label>
              <Input
                id='confirm-password'
                type='password'
                autoComplete='new-password'
                minLength={8}
                required
                aria-invalid={confirmPassword ? !passwordsMatch : undefined}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
              />
              {confirmPassword && !passwordsMatch ? (
                <p className='text-sm text-destructive'>
                  Passwords do not match.
                </p>
              ) : null}
            </div>
            {signUp.error ? (
              <p className='text-sm text-destructive'>{signUp.error.message}</p>
            ) : null}
            <Button
              type='submit'
              disabled={!passwordsMatch || signUp.isPending}
            >
              {signUp.isPending ? 'Creating account…' : 'Create account'}
            </Button>
            <p className='text-center text-sm text-muted-foreground'>
              Already have an account?{' '}
              <Link to='/sign-in' className='underline'>
                Sign in
              </Link>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
