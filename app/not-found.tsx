import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-dough-100">
      <div className="card text-center max-w-md mx-auto">
        <div className="text-6xl mb-4">🍞</div>
        <h1 className="text-2xl font-bold text-bread-800 mb-2">
          Stránka nenalezena
        </h1>
        <p className="text-gray-600 mb-6">
          Odkaz není platný nebo byl zrušen.
        </p>
        <p className="text-sm text-gray-500">
          Pokud si myslíte, že jde o chybu, kontaktujte svého pekaře.
        </p>
      </div>
    </main>
  );
}
