"use client";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="card mx-auto mt-10 max-w-lg p-8 text-center">
      <h1 className="text-xl font-bold">Terjadi kesalahan</h1>
      <p className="mt-2 text-sm text-muted">{error.message?.includes("tidak ditemukan") ? error.message : "Kesalahan sudah dicatat. Coba lagi, atau hubungi admin bila berulang."}</p>
      {error.digest && <p className="mt-2 font-mono text-xs text-muted">Kode: {error.digest}</p>}
      <button className="btn-primary mt-6" onClick={reset}>Coba lagi</button>
    </div>
  );
}
