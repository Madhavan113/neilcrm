import Link from "next/link";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <nav className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-3">
          <Link href="/compose" className="font-semibold tracking-tight">
            NeilCRM
          </Link>
          <div className="flex items-center gap-4 text-sm text-neutral-600">
            <Link href="/compose" className="hover:text-neutral-900">
              Compose
            </Link>
          </div>
        </div>
      </nav>
      {children}
    </div>
  );
}
