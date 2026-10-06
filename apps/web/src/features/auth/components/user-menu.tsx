import { useEffect, useId, useRef, useState } from 'react';
import type { User } from '@/shared/api/types';
import { Badge, Button } from '@/shared/ui';

export interface UserMenuProps {
  user: Pick<User, 'name' | 'email' | 'role'>;
  onLogout: () => void;
}

/** A disclosure rather than an ARIA menu: it holds plain information plus one button. */
export function UserMenu({ user, onLogout }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      setOpen(false);
      // The panel (and the focus inside it) is about to disappear.
      triggerRef.current?.focus();
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <Button
        ref={triggerRef}
        variant="ghost"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
      >
        {user.name}
      </Button>
      {open && (
        <div
          id={panelId}
          className="absolute right-0 z-10 mt-2 w-64 space-y-3 rounded-lg border border-slate-200 bg-white p-4 shadow-lg"
        >
          <div className="space-y-1">
            <p className="truncate text-sm font-medium text-slate-900">{user.name}</p>
            <p className="truncate text-sm text-slate-600">{user.email}</p>
            <Badge tone={user.role === 'ADMIN' ? 'info' : 'neutral'}>
              {user.role === 'ADMIN' ? 'Administrator' : 'Customer'}
            </Badge>
          </div>
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
          >
            Log out
          </Button>
        </div>
      )}
    </div>
  );
}
