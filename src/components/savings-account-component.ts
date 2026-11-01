/**
 * Keeps the planned savings account separate from the live exchange flow.
 * Deposits stay disabled until a deployed savings strategy is integrated.
 */
export class SavingsAccountComponent {
  constructor(root: Pick<Document, "getElementById"> = document) {
    const exchangeButton = getRequiredElement(root, "exchangeViewButton");
    const savingsButton = getRequiredElement(root, "savingsViewButton");
    const exchangeNavigation = getRequiredElement(root, "exchangeNavigation");
    const exchangeForm = getRequiredElement(root, "exchangeForm");
    const savingsView = getRequiredElement(root, "savingsView");

    function selectView(isSavingsSelected: boolean): void {
      // The exchange may refresh asynchronously; hidden remains authoritative.
      exchangeNavigation.hidden = isSavingsSelected;
      exchangeForm.hidden = isSavingsSelected;
      savingsView.hidden = !isSavingsSelected;
      exchangeButton.classList.toggle("active", !isSavingsSelected);
      savingsButton.classList.toggle("active", isSavingsSelected);
      exchangeButton.setAttribute("aria-pressed", String(!isSavingsSelected));
      savingsButton.setAttribute("aria-pressed", String(isSavingsSelected));
    }

    exchangeButton.addEventListener("click", () => selectView(false));
    savingsButton.addEventListener("click", () => selectView(true));
    selectView(false);
  }
}

function getRequiredElement(root: Pick<Document, "getElementById">, id: string): HTMLElement {
  const element = root.getElementById(id);
  if (!element) {
    throw new Error(`Savings account navigation is missing #${id}`);
  }
  return element;
}
