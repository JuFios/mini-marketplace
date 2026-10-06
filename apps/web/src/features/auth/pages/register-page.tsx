import { Link, useSearchParams } from 'react-router';
import { AuthCard } from '../components/auth-card';
import { RegisterForm } from '../components/register-form';
import { authPath, safeReturnTo } from '../return-to';
import { useAuth } from '../use-auth';

export function RegisterPage() {
  const { register } = useAuth();
  const [params] = useSearchParams();
  const returnTo = safeReturnTo(params.get('returnTo'));

  return (
    <AuthCard
      title="Create an account"
      footer={
        <>
          Already have an account?{' '}
          <Link
            to={authPath('/login', returnTo)}
            className="font-medium text-brand-600 hover:underline"
          >
            Log in
          </Link>
        </>
      }
    >
      <RegisterForm onSubmit={register} />
    </AuthCard>
  );
}
