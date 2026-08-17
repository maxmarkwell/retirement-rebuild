import { login, signup } from "./actions";

type LoginPageProps = {
  searchParams: Promise<{
    error?: string;
    message?: string;
  }>;
};

export default async function LoginPage({
  searchParams,
}: LoginPageProps) {
  const params = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
      <div className="w-full max-w-md rounded-xl bg-white p-8 shadow">
        <h1 className="mb-2 text-2xl font-bold">Retirement Rebuild</h1>

        <p className="mb-6 text-sm text-gray-600">
          Sign in to your investment research dashboard.
        </p>

        {params.error && (
          <div className="mb-4 rounded bg-red-50 p-3 text-sm text-red-700">
            {params.error}
          </div>
        )}

        {params.message && (
          <div className="mb-4 rounded bg-green-50 p-3 text-sm text-green-700">
            {params.message}
          </div>
        )}

        <form className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="mb-1 block text-sm font-medium"
            >
              Email
            </label>

            <input
              id="email"
              name="email"
              type="email"
              required
              className="w-full rounded border px-3 py-2"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-1 block text-sm font-medium"
            >
              Password
            </label>

            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={8}
              className="w-full rounded border px-3 py-2"
            />
          </div>

          <div className="flex gap-3">
            <button
              formAction={login}
              className="flex-1 rounded bg-black px-4 py-2 text-white"
            >
              Sign In
            </button>

            <button
              formAction={signup}
              className="flex-1 rounded border px-4 py-2"
            >
              Create Account
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}