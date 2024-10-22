import * as wallet from "./scripts/connect-wallet";
import * as ui from "./scripts/ui";
import * as mint from "./scripts/mint";

export async function mainModule() {
  ui.initUiEvents();

  wallet.updateConnectButtonText("");

  await wallet.connectIfAuthorized();
  await mint.initCollateralList();
  await mint.initUiEvents();
}

mainModule()
  .then(() => {
    console.log("mainModule loaded");
  })
  .catch((error) => {
    console.error(error);
  });
