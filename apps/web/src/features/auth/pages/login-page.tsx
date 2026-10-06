import { Link, useSearchParams } from 'react-router';
import { AuthCard } from '../components/auth-card';
import { LoginForm } from '../components/login-form';
import { authPath, safeReturnTo } from '../return-to';
import { useAuth } from '../use-auth';

export function LoginPage() {
  const { login } = useAuth();
  const [params] = useSearchParams();
  const returnTo = safeReturnTo(params.get('returnTo'));

  // Nothing to navigate to after a successful login: the session starts, and RequireGuest sends
  // the person on to `returnTo`.
  return (
    <AuthCard
      title="Log in"
      footer={
        <>
          New here?{' '}
          <Link
            to={authPath('/register', returnTo)}
            className="font-medium text-brand-600 hover:underline"
          >
            Create an account
          </Link>
        </>
      }
    >
      <LoginForm onSubmit={login} />
    </AuthCard>
  );
}
