import { toast as sonnerToast } from "sonner";

type ToastOptions = {
  title?: string;
  description?: string;
  variant?: "default" | "destructive";
};

type ToastFn = {
  (message: string, data?: Parameters<typeof sonnerToast>[1]): string | number;
  (options: ToastOptions): string | number;
  success: typeof sonnerToast.success;
  error: typeof sonnerToast.error;
  warning: typeof sonnerToast.warning;
  info: typeof sonnerToast.info;
  loading: typeof sonnerToast.loading;
  dismiss: typeof sonnerToast.dismiss;
  custom: typeof sonnerToast.custom;
  promise: typeof sonnerToast.promise;
  message: typeof sonnerToast.message;
};

function createToast(): ToastFn {
  const fn = (messageOrOptions: string | ToastOptions, data?: Parameters<typeof sonnerToast>[1]) => {
    if (typeof messageOrOptions === "object") {
      const { title = "", description, variant } = messageOrOptions;
      if (variant === "destructive") {
        return sonnerToast.error(title, { description });
      }
      return sonnerToast(title, { description });
    }
    return sonnerToast(messageOrOptions, data);
  };

  fn.success = sonnerToast.success;
  fn.error = sonnerToast.error;
  fn.warning = sonnerToast.warning;
  fn.info = sonnerToast.info;
  fn.loading = sonnerToast.loading;
  fn.dismiss = sonnerToast.dismiss;
  fn.custom = sonnerToast.custom;
  fn.promise = sonnerToast.promise;
  fn.message = sonnerToast.message;

  return fn as ToastFn;
}

const toast = createToast();

export const useToast = () => {
  return { toast };
};

export { toast };

