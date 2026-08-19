"use client";

import { useActionState } from "react";
import {
  initialActionState,
  type ActionState,
} from "@/lib/forms/action-state";
import { captureSnapshotsAction } from "@/app/snapshot-actions";
import FormMessage from "@/components/form-message";

export default function SnapshotButton() {
  const [state, formAction, pending] = useActionState<
    ActionState,
    FormData
  >(
    captureSnapshotsAction,
    initialActionState
  );

  return (
    <div className="mt-8 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-gray-900">
        Daily Snapshot
      </h2>

      <p className="mt-1 text-sm text-gray-600">
        Capture today&apos;s portfolio values for performance tracking.
      </p>

      <div className="mt-4">
        <FormMessage state={state} />
      </div>

      <form action={formAction} className="mt-4">
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-black px-5 py-2 text-white disabled:opacity-50"
        >
          {pending
            ? "Capturing..."
            : "Capture Daily Snapshot"}
        </button>
      </form>
    </div>
  );
}