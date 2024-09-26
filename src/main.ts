import * as wallet from "./scripts/connect-wallet";

export async function mainModule() {
  wallet.updateConnectButtonText("");
  wallet.initClickEvents();

  await wallet.connectIfAuthorized();
}

mainModule()
  .then(() => {
    console.log("mainModule loaded");
  })
  .catch((error) => {
    console.error(error);
  });
