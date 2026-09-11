"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type ReassessmentNotification = {
  id: string;
  reassessment_id: string;
  ticker: string;
  title: string;
  message: string;
  status: string;
  created_at: string;
  read_at: string | null;
  delivered_at: string | null;
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Denver",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function ReassessmentNotificationCenter() {
  const [notifications, setNotifications] = useState<
    ReassessmentNotification[]
  >([]);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    "unsupported"
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const shownNotificationIds = useRef(new Set<string>());

  const markNotification = useCallback(
    async (id: string, action: "delivered" | "read") => {
      const response = await fetch("/api/reassessments/notifications", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ id, action }),
      });

      if (!response.ok) {
        throw new Error("Unable to update notification state.");
      }
    },
    []
  );

  const showBrowserNotification = useCallback(
    async (item: ReassessmentNotification) => {
      if (
        typeof window === "undefined" ||
        !("Notification" in window) ||
        Notification.permission !== "granted" ||
        shownNotificationIds.current.has(item.id)
      ) {
        return;
      }

      shownNotificationIds.current.add(item.id);

      const notification = new Notification(item.title, {
        body: item.message,
        tag: `reassessment-${item.reassessment_id}`,
      });

      notification.onclick = () => {
        window.focus();
        window.location.assign("/watchlist");
        void markNotification(item.id, "read");
        notification.close();
      };

      if (!item.delivered_at) {
        try {
          await markNotification(item.id, "delivered");
        } catch {
          // Keep the browser alert visible even if persistence fails.
        }
      }
    },
    [markNotification]
  );

  const loadNotifications = useCallback(async () => {
    try {
      const response = await fetch("/api/reassessments/notifications", {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("Unable to load notifications.");
      }

      const payload = (await response.json()) as {
        notifications?: ReassessmentNotification[];
      };

      const next = payload.notifications ?? [];
      setNotifications(next);
      setError(null);

      for (const item of next) {
        void showBrowserNotification(item);
      }
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to load notifications."
      );
    } finally {
      setLoading(false);
    }
  }, [showBrowserNotification]);

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setPermission(Notification.permission);
    } else {
      setPermission("unsupported");
    }

    void loadNotifications();

    const interval = window.setInterval(() => {
      void loadNotifications();
    }, 60_000);

    return () => window.clearInterval(interval);
  }, [loadNotifications]);

  async function enableBrowserAlerts() {
    if (!("Notification" in window)) {
      setPermission("unsupported");
      return;
    }

    const result = await Notification.requestPermission();
    setPermission(result);

    if (result === "granted") {
      await loadNotifications();
    }
  }

  async function markRead(id: string) {
    try {
      await markNotification(id, "read");
      setNotifications((current) =>
        current.filter((item) => item.id !== id)
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to mark notification read."
      );
    }
  }

  return (
    <section className="mt-8 rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-gray-200 p-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            Reassessment Alerts
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-gray-500">
            Alerts created when a WATCH item reaches its review trigger. Browser
            popups work while Retirement Rebuild is open; background mobile push
            will use the same queue once a push delivery channel is connected.
          </p>
        </div>

        {permission !== "granted" && permission !== "unsupported" && (
          <button
            type="button"
            onClick={enableBrowserAlerts}
            className="rounded bg-black px-4 py-2 text-sm font-medium text-white"
          >
            Enable Browser Alerts
          </button>
        )}
      </div>

      {permission === "unsupported" && (
        <div className="border-b border-gray-100 bg-gray-50 px-6 py-3 text-sm text-gray-600">
          Browser notifications are not available in this browser. In-app alerts
          below will still work.
        </div>
      )}

      {permission === "denied" && (
        <div className="border-b border-gray-100 bg-amber-50 px-6 py-3 text-sm text-amber-800">
          Browser notifications are blocked for this site. In-app alerts below
          will still work.
        </div>
      )}

      {error && (
        <div className="border-b border-red-100 bg-red-50 px-6 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="p-6 text-sm text-gray-500">Loading alerts…</div>
      ) : notifications.length ? (
        <div className="divide-y divide-gray-100">
          {notifications.map((item) => (
            <div key={item.id} className="p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="max-w-4xl">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded bg-amber-50 px-2 py-1 text-xs font-semibold uppercase text-amber-800">
                      Needs Review
                    </span>
                    <span className="text-sm font-semibold text-gray-900">
                      {item.ticker}
                    </span>
                  </div>
                  <p className="mt-3 font-semibold text-gray-900">{item.title}</p>
                  <p className="mt-1 text-sm leading-6 text-gray-700">
                    {item.message}
                  </p>
                  <p className="mt-2 text-xs text-gray-400">
                    Created {formatDateTime(item.created_at)}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => void markRead(item.id)}
                  className="rounded border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Mark Read
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="p-6 text-sm text-gray-500">
          No reassessment alerts are waiting for you.
        </div>
      )}
    </section>
  );
}
