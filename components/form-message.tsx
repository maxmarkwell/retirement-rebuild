import type { ActionState } from "@/lib/forms/action-state";

type FormMessageProps = {
  state: ActionState;
};

export default function FormMessage({
  state,
}: FormMessageProps) {
  if (!state.message) {
    return null;
  }

  return (
    <div
      className={`rounded-lg border px-4 py-3 text-sm ${
        state.success
          ? "border-green-200 bg-green-50 text-green-800"
          : "border-red-200 bg-red-50 text-red-800"
      }`}
    >
      {state.message}
    </div>
  );
}