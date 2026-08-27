export type ActionState = {
  success: boolean;
  message: string;
  scanRunId?: string;
};

export const initialActionState: ActionState = {
  success: false,
  message: "",
};