export function renderHeader() {
    const header = document.getElementById('header');
    if (!header) {
      console.error('Header element not found');
      return;
    }

    const networkButton = document.createElement('w3m-network-button');
    const walletButton = document.createElement('w3m-button');
  
    header.appendChild(networkButton);
    header.appendChild(walletButton);
}   