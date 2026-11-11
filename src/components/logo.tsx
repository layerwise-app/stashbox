import { cn } from '~/lib/utils';

/** Stashbox mark: an open box. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox='0 0 32 32' className={cn('shrink-0', className)} aria-hidden>
      <rect width='32' height='32' rx='8' className='fill-primary' />
      <path
        d='M8 12 16 7.5l8 4.5v8.25L16 24.5l-8-4.25z'
        className='fill-primary-foreground/20 stroke-primary-foreground'
        strokeWidth='1.75'
        strokeLinejoin='round'
      />
      <path
        d='m8 12 8 4.5 8-4.5M16 16.5v8'
        fill='none'
        className='stroke-primary-foreground'
        strokeWidth='1.75'
        strokeLinejoin='round'
      />
    </svg>
  );
}
