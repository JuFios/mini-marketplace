import { Link } from 'react-router';
import { buttonStyles, EmptyState } from '@/shared/ui';

export function NotFoundPage() {
  return (
    <EmptyState
      title="Page not found"
      description="The page you are looking for does not exist or has moved."
      action={
        <Link to="/" className={buttonStyles('primary')}>
          Back to the shop
        </Link>
      }
    />
  );
}
