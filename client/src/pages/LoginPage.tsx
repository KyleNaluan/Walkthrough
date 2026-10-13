import {useState, type FormEvent} from 'react';
import {Navigate, useLocation, useNavigate} from 'react-router';
import {ApiError} from '../api';
import {landingPathFor, useAuth} from '../auth/useAuth';

/** A bare login form. Story 1 finishes this page. */
export function LoginPage() {
  const {user, login} = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={landingPathFor(user.role)} replace />;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await login(String(form.get('email')), String(form.get('password')));
      const from = (location.state as {from?: string} | null)?.from;
      navigate(from ?? '/', {replace: true});
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not log in');
      setBusy(false);
    }
  }

  return (
    <main className="page login">
      <h1>Log in</h1>
      <form onSubmit={handleSubmit}>
        <label>
          Email
          <input name="email" type="email" autoComplete="username" required />
        </label>
        <label>
          Password
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </label>
        {error && <p role="alert">{error}</p>}
        <button type="submit" disabled={busy}>
          Log in
        </button>
      </form>
    </main>
  );
}
