"use client";

import Link from "next/link";
import {
  usePathname,
  useRouter,
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
    name: "Research",
    href: "/research",
  },
  {
    name: "Discovery",
    href: "/discovery",
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

  const router =
    useRouter();

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

  return (
    <nav className="border-b border-gray-200 bg-white">
      {/* Mobile navigation */}

      <div className="mx-auto max-w-7xl px-4 py-3 md:hidden">
        <label
          htmlFor="mobile-navigation"
          className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500"
        >
          Navigate
        </label>

        <select
          id="mobile-navigation"
          value={
            activeItem.href
          }
          onChange={(
            event
          ) => {
            router.push(
              event.target.value
            );
          }}
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-3 text-base font-medium text-gray-900"
        >
          {navigation.map(
            (item) => (
              <option
                key={
                  item.href
                }
                value={
                  item.href
                }
              >
                {
                  item.name
                }
              </option>
            )
          )}
        </select>
      </div>

      {/* Desktop navigation */}

      <div className="mx-auto hidden max-w-7xl items-center gap-1 px-6 md:flex">
        {navigation.map(
          (item) => {
            const active =
              item.href === "/"
                ? pathname ===
                  "/"
                : pathname.startsWith(
                    item.href
                  );

            return (
              <Link
                key={
                  item.href
                }
                href={
                  item.href
                }
                className={`whitespace-nowrap border-b-2 px-4 py-4 text-sm font-medium transition ${
                  active
                    ? "border-gray-900 text-gray-900"
                    : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-900"
                }`}
              >
                {
                  item.name
                }
              </Link>
            );
          }
        )}
      </div>
    </nav>
  );
}