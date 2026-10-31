import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="card max-w-md p-8 text-center">
        <p className="text-5xl font-bold text-primary">404</p>
        <h1 className="mt-3 text-xl font-bold">Halaman tidak ditemukan</h1>
        <p className="mt-2 text-sm text-muted">Data mungkin sudah dihapus atau milik organisasi lain.</p>
        <Link href="/dashboard" className="btn-primary mt-6">Kembali ke dasbor</Link>
      </div>
    </main>
  );
}
