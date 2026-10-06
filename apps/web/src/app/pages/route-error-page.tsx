import { Link, useRouteError } from 'react-router';
import { buttonStyles, ErrorState } from '@/shared/ui';

/** Last line of defence: a page crashed while rendering or its code failed to load. */
export function RouteErrorPage() {
  const error = useRouteError();
  // The stack belongs in the console, not on the screen.
  console.error(error);

  return (
    <div className="mx-auto max-w-lg space-y-4 p-8">
      <ErrorState
        message="An unexpected error occurred. Reloading the page usually fixes it."
        onRetry={() => window.location.reload()}
        retryLabel="Reload the page"
      />
      <p className="text-center text-sm">
        <Link to="/" className={buttonStyles('ghost', 'sm')}>
          Go to the home page
        </Link>
      </p>
    </div>
  );
}
