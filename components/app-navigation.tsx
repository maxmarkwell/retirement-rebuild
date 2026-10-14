"use client";

import Link from "next/link";
import {
  usePathname,
} from "next/navigation";

const navigation = [
  {
    name: "Dashboard",
    href: "/",
  },
  {
    name: "Performance",
    href: "/performance",
  },
  {
    name: "Discovery",
    href: "/discovery",
  },
  {
    name: "Research",
    href: "/research",
  },
  {
    name: "Decisions",
    href: "/decisions",
  },
  {
    name: "Watchlist",
    href: "/watchlist",
  },
  {
    name: "AI Scorecard",
    href: "/scorecard",
  },
];

export default function AppNavigation() {
  const pathname =
    usePathname();



  const activeItem =
    navigation.find(
      (item) =>
        item.href === "/"
          ? pathname === "/"
          : pathname.startsWith(
              item.href
            )
    ) ??
    navigation[0];

  if (pathname === "/login") return null;
  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-slate-800 bg-slate-950 text-slate-100 lg:flex">
        <Link href="/" className="border-b border-slate-800 px-6 py-7">
          <span className="block text-xs font-bold uppercase tracking-[0.2em] text-cyan-400">Retirement</span>
          <span className="block text-2xl font-bold">Rebuild.</span>
          <span className="mt-2 block text-xs text-slate-500">INVESTMENT COMMAND CENTER</span>
        </Link>
        <div className="flex-1 space-y-1 px-3 pt-7">
          {navigation.map((item) => (
            <Link key={item.href} href={item.href} aria-current={activeItem.href === item.href ? "page" : undefined}
              className={`block rounded-lg px-4 py-3 text-sm font-medium transition ${activeItem.href === item.href ? "bg-cyan-400/15 text-cyan-300" : "text-slate-400 hover:bg-slate-800 hover:text-white"}`}>
              {item.name}
            </Link>
          ))}
        </div>
        <p className="border-t border-slate-800 px-6 py-5 text-xs text-slate-500">Research-led · Human-executed</p>
      </aside>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-800 bg-slate-950 pb-[env(safe-area-inset-bottom)] text-slate-100 lg:hidden" aria-label="Mobile navigation">
        <div className="grid grid-cols-5">
          {[navigation[0], navigation[1], navigation[2], navigation[3], navigation[4]].map((item) => (
            <Link key={item.href} href={item.href} aria-current={activeItem.href === item.href ? "page" : undefined}
              className={`flex min-h-16 items-center justify-center px-1 text-center text-xs font-medium ${activeItem.href === item.href ? "border-t-2 border-cyan-400 bg-cyan-400/10 text-cyan-300" : "text-slate-400"}`}>
              {item.name}
            </Link>
          ))}
        </div>
        <details className="absolute bottom-full right-2 mb-2 rounded-lg border border-slate-700 bg-slate-950 shadow-xl">
          <summary className="cursor-pointer px-4 py-2 text-xs text-cyan-300">More sections</summary>
          <div className="grid min-w-40 gap-1 p-2">
            {navigation.slice(5).map((item) => <Link key={item.href} href={item.href} className="rounded px-3 py-2 text-sm hover:bg-slate-800">{item.name}</Link>)}
            <Link href="/accelerated-growth" className="rounded px-3 py-2 text-sm hover:bg-slate-800">Accelerated Growth</Link>
          </div>
        </details>
      </nav>
    </>
  );
}
