"use client";

import type { AnchorHTMLAttributes, MouseEvent } from "react";
import type { LegalDocumentId } from "../data/legal";

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
    url.searchParams.set("legal", document);
    if (section) url.searchParams.set("legalSection", section);
    else url.searchParams.delete("legalSection");
    window.history.pushState({ legalDocument: document }, "", url);
    window.dispatchEvent(
      new CustomEvent("legal-navigation", {
        detail: { opener: event.currentTarget },
      }),
    );
  };

  return <a {...props} href={fallbackHref} onClick={openLegal} />;
}
