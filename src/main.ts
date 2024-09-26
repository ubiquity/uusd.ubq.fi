import { initClickEvents } from "./scripts/connect-wallet";

export async function mainModule() {
  initClickEvents();
}

mainModule()
  .then(() => {
    console.log("mainModule loaded");
  })
  .catch((error) => {
    console.error(error);
  });
