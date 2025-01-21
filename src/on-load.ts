import { GlobalState } from "./shared/types";

export const globalState: GlobalState = {
  isLoading: false,
  data: {},
};

export async function initializeState() {
  globalState.isLoading = true;
  try {
    // Initial data loading goes here
    globalState.data = {};
  } finally {
    globalState.isLoading = false;
  }
}
