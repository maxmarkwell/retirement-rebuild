export type ActionState = {
  success: boolean;
  message: string;
};

export const initialActionState: ActionState = {
  success: false,
  message: "",
};