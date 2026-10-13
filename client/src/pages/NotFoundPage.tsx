import {Link} from 'react-router';

export function NotFoundPage() {
  return (
    <main className="page">
      <h1>Page not found</h1>
      <p>
        <Link to="/">Go to the start page</Link>
      </p>
    </main>
  );
}
