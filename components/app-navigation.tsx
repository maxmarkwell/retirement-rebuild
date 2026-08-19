"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navigation = [
  {
    name: "Dashboard",
    href: "/",
  },
  {
    name: "Portfolios",
    href: "/portfolios",
  },
  {
    name: "Performance",
    href: "/performance",
  },
  {
    name: "Research",
    href: "/research",
  },
  {
    name: "AI Scorecard",
    href: "/scorecard",
  },
  {
    name: "What-If",
    href: "/what-if",
  },
  {
    name: "Activity",
    href: "/activity",
  },
];

export default function AppNavigation() {
  const pathname = usePathname();

  return (
    <nav className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-7xl items-center gap-1 overflow-x-auto px-6">
        {navigation.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`whitespace-nowrap border-b-2 px-4 py-4 text-sm font-medium transition ${
                active
                  ? "border-gray-900 text-gray-900"
                  : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-900"
              }`}
            >
              {item.name}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}