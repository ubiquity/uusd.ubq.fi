import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { SavingsAccountComponent } from "../src/components/savings-account-component.ts";

class MockElement extends EventTarget {
  hidden = false;
  attributes = new Map<string, string>();
  classes = new Set<string>();
  classList = {
    toggle: (name: string, isActive: boolean) => {
      if (isActive) this.classes.add(name);
      else this.classes.delete(name);
    },
  };

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  click(): void {
    this.dispatchEvent(new Event("click"));
  }
}

function createNavigation() {
  const elements = {
    exchangeViewButton: new MockElement(),
    savingsViewButton: new MockElement(),
    exchangeNavigation: new MockElement(),
    exchangeForm: new MockElement(),
    savingsView: new MockElement(),
  };
  const root = {
    getElementById: (id: string) => elements[id as keyof typeof elements] ?? null,
  } as unknown as Pick<Document, "getElementById">;
  new SavingsAccountComponent(root);
  return elements;
}

describe("savings account navigation", () => {
  test("keeps the existing exchange selected initially", () => {
    const elements = createNavigation();
    expect(elements.exchangeNavigation.hidden).toBe(false);
    expect(elements.exchangeForm.hidden).toBe(false);
    expect(elements.savingsView.hidden).toBe(true);
    expect(elements.exchangeViewButton.attributes.get("aria-pressed")).toBe("true");
    expect(elements.savingsViewButton.attributes.get("aria-pressed")).toBe("false");
    expect(elements.exchangeViewButton.classes.has("active")).toBe(true);
    expect(elements.savingsViewButton.classes.has("active")).toBe(false);
  });

  test("opens savings without invoking the exchange direction buttons", () => {
    const elements = createNavigation();
    elements.savingsViewButton.click();
    expect(elements.exchangeNavigation.hidden).toBe(true);
    expect(elements.exchangeForm.hidden).toBe(true);
    expect(elements.savingsView.hidden).toBe(false);
    expect(elements.exchangeViewButton.attributes.get("aria-pressed")).toBe("false");
    expect(elements.savingsViewButton.attributes.get("aria-pressed")).toBe("true");
    expect(elements.exchangeViewButton.classes.has("active")).toBe(false);
    expect(elements.savingsViewButton.classes.has("active")).toBe(true);
  });

  test("repeated visits restore the same exchange form without clearing state", () => {
    const elements = createNavigation();
    elements.exchangeForm.setAttribute("data-existing-state", "sell-amount");
    for (let index = 0; index < 3; index++) {
      elements.savingsViewButton.click();
      elements.savingsViewButton.click();
      elements.exchangeViewButton.click();
      expect(elements.exchangeNavigation.hidden).toBe(false);
      expect(elements.exchangeForm.hidden).toBe(false);
      expect(elements.savingsView.hidden).toBe(true);
      expect(elements.exchangeViewButton.attributes.get("aria-pressed")).toBe("true");
      expect(elements.savingsViewButton.attributes.get("aria-pressed")).toBe("false");
      expect(elements.exchangeForm.attributes.get("data-existing-state")).toBe("sell-amount");
    }
  });

  test("reports missing required markup explicitly", () => {
    expect(() => new SavingsAccountComponent({ getElementById: () => null })).toThrow("missing #exchangeViewButton");
  });
});

describe("savings preview safeguards", () => {
  const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
  const panel = html.match(/<section id="savingsView"[\s\S]*?<\/section>/)?.[0] ?? "";

  test("does not expose a deposit or approval action before deployment", () => {
    expect(panel).toContain('aria-labelledby="savingsHeading" hidden');
    expect(panel).toMatch(/<button type="button" id="savingsDepositButton"[^>]* disabled /);
    expect(panel).not.toMatch(/onclick|onsubmit|<form/);
    expect(panel).toContain("Deposits are not available yet");
  });

  test("keeps hidden exchange elements hidden when live refreshes set inline display styles", () => {
    const css = readFileSync(new URL("../public/styles/main.css", import.meta.url), "utf8");
    expect(css).toMatch(/\.direction-toggle\[hidden\],\s*\.exchange-form\[hidden\]\s*\{\s*display:\s*none\s*!important;/);
  });

  test("shows proposed terms without promising a live yield", () => {
    expect(panel).toContain("Uniswap v4 concentrated liquidity");
    expect(panel).toContain("0.9999–1.0001 LUSD per UUSD");
    expect(panel).toContain("<dt>Estimated APR</dt><dd>Not available</dd>");
    expect(panel).toContain("not an insured bank account");
    expect(panel).toContain("earn no swap fees while out of range");
    expect(panel).toContain("can cause losses");
  });
});
