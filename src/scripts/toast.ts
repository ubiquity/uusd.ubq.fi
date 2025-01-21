class CustomEventEmitter {
  private events: Record<string, Function[]> = {};

  on(event: string, listener: Function) {
    if (!this.events[event]) {
      this.events[event] = [];
    }
    this.events[event].push(listener);
  }

  emit(event: string, ...args: any[]) {
    if (this.events[event]) {
      this.events[event].forEach((listener) => listener(...args));
    }
  }
}

import { toast } from "./ui";

class Toast extends CustomEventEmitter {
  constructor() {
    super();
    this._watchEvents();
  }

  private _watchEvents() {
    this.on("showToast", ({ toastType, msg }: { toastType: "info" | "error" | "success"; msg: string }) => {
      if (toast !== null) {
        let className = "alert-warning";

        if (toastType === "info") className = "alert-info";
        else if (toastType === "error") className = "alert-error";
        else if (toastType === "success") className = "alert-success";

        toast.classList.remove("hidden");

        const firstChild = toast.firstElementChild as HTMLDivElement;
        firstChild.classList.add(className);
        firstChild.innerHTML = `<span>${msg}</span>`;
      }
    });

    this.on("hideToast", () => {
      if (toast !== null) {
        toast.classList.add("hidden");

        const classes = ["alert-warning", "alert-info", "alert-error", "alert-success"];
        const firstChild = toast.firstElementChild as HTMLDivElement;

        classes.forEach((cls) => {
          firstChild.classList.remove(cls);
        });

        firstChild.innerHTML = "";
      }
    });
  }
}

export class ToastActions {
  toast: Toast = new Toast();

  showToast(args: { toastType: "info" | "error" | "success"; msg: string }, timeout: number = 5000) {
    this.toast.emit("showToast", args);
    setTimeout(() => this.hideToast(), timeout);
  }

  hideToast() {
    this.toast.emit("hideToast");
  }
}
