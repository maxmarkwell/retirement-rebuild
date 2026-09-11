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
  const [permission, setPermission] = useState<
    NotificationPermission | "unsupported"
  >("unsupported");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shownNotificationIds = useRef(new Set<string>());

  const markNotification = useCallback(
    async (id: string, action: "delivered" | "read") => {
      const response = await fetch("/api/reassessments/notifications", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
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
        void markNotification(item.id, "read");
        window.location.assign("/watchlist");
        notification.close();
      };

      if (!item.delivered_at) {
        try {
          await markNotification(item.id, "delivered");
        } catch {
          // Do not suppress a visible alert because persistence failed.
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

      if (response.status === 401) {
        setNotifications([]);
        return;
      }

      if (!response.ok) {
        throw new Error("Unable to load reassessment alerts.");
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
          : "Unable to load reassessment alerts."
      );
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
      setNotifications((current) => current.filter((item) => item.id !== id));
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to mark notification read."
      );
    }
  }

  const unreadCount = notifications.length;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex max-w-[calc(100vw-2rem)] flex-col items-end gap-2">
      {open && (
        <div className="w-[min(26rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl">
          <div className="flex items-start justify-between gap-3 border-b border-gray-200 p-4">
            <div>
              <p className="text-sm font-semibold text-gray-900">Reassessment Alerts</p>
              <p className="mt-1 text-xs leading-5 text-gray-500">
                WATCH items that reached a review trigger.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-sm text-gray-500 hover:text-gray-900"
            >
              Close
            </button>
          </div>

          {permission !== "granted" && permission !== "unsupported" && (
            <div className="border-b border-gray-100 bg-gray-50 p-4">
              <button
                type="button"
                onClick={enableBrowserAlerts}
                className="rounded bg-black px-3 py-2 text-sm font-medium text-white"
              >
                Enable Browser Popups
              </button>
              <p className="mt-2 text-xs leading-5 text-gray-500">
                These popups work while Retirement Rebuild is open. Background
                mobile push is the next delivery layer.
              </p>
            </div>
          )}

          {permission === "denied" && (
            <div className="border-b border-gray-100 bg-amber-50 px-4 py-3 text-xs text-amber-800">
              Browser notifications are blocked for this site. In-app alerts
              still work.
            </div>
          )}

          {error && (
            <div className="border-b border-red-100 bg-red-50 px-4 py-3 text-xs text-red-700">
              {error}
            </div>
          )}

          <div className="max-h-96 overflow-y-auto">
            {notifications.length ? (
              <div className="divide-y divide-gray-100">
                {notifications.map((item) => (
                  <div key={item.id} className="p-4">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-amber-50 px-2 py-1 text-[11px] font-semibold uppercase text-amber-800">
                        Needs Review
                      </span>
                      <span className="text-xs font-semibold text-gray-900">
                        {item.ticker}
                      </span>
                    </div>
                    <p className="mt-2 text-sm font-semibold text-gray-900">
                      {item.title}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-gray-600">
                      {item.message}
                    </p>
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <span className="text-[11px] text-gray-400">
                        {formatDateTime(item.created_at)}
                      </span>
                      <button
                        type="button"
                        onClick={() => void markRead(item.id)}
                        className="text-xs font-medium text-gray-700 hover:text-black"
                      >
                        Mark read
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 text-sm text-gray-500">
                No reassessment alerts are waiting for you.
              </div>
            )}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex items-center gap-2 rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 shadow-lg hover:bg-gray-50"
        aria-label="Open reassessment alerts"
      >
        Alerts
        {unreadCount > 0 && (
          <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-white">
            {unreadCount}
          </span>
        )}
      </button>
    </div>
  );
}
