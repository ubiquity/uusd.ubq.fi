import * as wallet from "./scripts/connect-wallet";
import * as ui from "./scripts/ui";

export async function mainModule() {
  ui.initUiEvents();

  wallet.updateConnectButtonText("");

  await wallet.connectIfAuthorized();
}

mainModule()
  .then(() => {
    console.log("mainModule loaded");
  })
  .catch((error) => {
    console.error(error);
  });
