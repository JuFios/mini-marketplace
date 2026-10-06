import { Spinner } from './spinner';

/** Full-window placeholder for the moments before the app has anything to show. */
export function SplashScreen() {
  return (
    <div className="grid min-h-screen place-items-center text-brand-600">
      <Spinner size="lg" />
    </div>
  );
}
