import type { ReactNode } from 'react';

export function Alert({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="rounded-lg bg-red-950 px-3 py-2 text-sm text-red-200">
      {children}
    </div>
  );
}
