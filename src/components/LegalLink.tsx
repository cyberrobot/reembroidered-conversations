"use client";

import type { AnchorHTMLAttributes, MouseEvent } from "react";
import type { LegalDocumentId } from "../data/legal";

export type LegalNavigationState = {
  stackId: string;
  index: number;
  originUrl: string;
  hasOriginEntry: boolean;
};

function withoutLegalState(url: URL) {
  const origin = new URL(url);
  origin.searchParams.delete("legal");
  origin.searchParams.delete("legalSection");
  return origin.toString();
}

export function currentLegalNavigationState(): LegalNavigationState | null {
  const value = window.history.state?.legalNavigation;
  return value &&
    typeof value.stackId === "string" &&
    Number.isInteger(value.index) &&
    typeof value.originUrl === "string" &&
    typeof value.hasOriginEntry === "boolean"
    ? value
    : null;
}

type LegalLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  document: LegalDocumentId;
  section?: string;
};

export function LegalLink({
  document,
  section,
  onClick,
  ...props
}: LegalLinkProps) {
  const fallbackHref = `/?legal=${document}${section ? `&legalSection=${section}` : ""}`;

  const openLegal = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    event.preventDefault();
    const url = new URL(window.location.href);
    const currentNavigation = currentLegalNavigationState();
    const currentIsLegal =
      url.searchParams.get("legal") === "terms" ||
      url.searchParams.get("legal") === "privacy";
    let navigation: LegalNavigationState;
    if (currentIsLegal && currentNavigation) {
      navigation = {
        ...currentNavigation,
        index: currentNavigation.index + 1,
      };
    } else if (currentIsLegal) {
      navigation = {
        stackId: crypto.randomUUID(),
        index: 1,
        originUrl: withoutLegalState(url),
        hasOriginEntry: false,
      };
    } else {
      const rootNavigation: LegalNavigationState = {
        stackId: crypto.randomUUID(),
        index: 0,
        originUrl: url.toString(),
        hasOriginEntry: true,
      };
      window.history.replaceState(
        { ...window.history.state, legalNavigation: rootNavigation },
        "",
        url,
      );
      navigation = { ...rootNavigation, index: 1 };
    }
    url.searchParams.set("legal", document);
    if (section) url.searchParams.set("legalSection", section);
    else url.searchParams.delete("legalSection");
    window.history.pushState(
      { ...window.history.state, legalNavigation: navigation },
      "",
      url,
    );
    window.dispatchEvent(
      new CustomEvent("legal-navigation", {
        detail: { opener: event.currentTarget },
      }),
    );
  };

  return <a {...props} href={fallbackHref} onClick={openLegal} />;
}
