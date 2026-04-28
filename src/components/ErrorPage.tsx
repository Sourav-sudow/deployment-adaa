import { useRouteError, Link } from "react-router-dom";

export default function ErrorPage() {
  const error = useRouteError() as any;

  const message =
    error?.statusText || error?.message || (typeof error === "string" ? error : "An unexpected error occurred.");

  return (
    <div className="min-h-screen flex items-center justify-center bg-black text-white p-6">
      <div className="max-w-xl text-center">
        <h1 className="text-3xl font-bold mb-4">Unexpected Application Error</h1>
        <p className="text-sm text-white/80 mb-4">Something went wrong while loading this page.</p>
        <pre className="bg-white/5 rounded p-3 text-left text-xs text-red-300 mb-6 overflow-auto">{String(message)}</pre>
        <div className="flex items-center justify-center gap-3">
          <Link to="/" className="px-4 py-2 bg-purple-600 rounded-md text-white">Go to Home</Link>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 border rounded-md text-white/90"
          >
            Reload
          </button>
        </div>
      </div>
    </div>
  );
}
