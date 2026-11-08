"use client";
import { useEffect } from "react";

/**
 * On phones, tables inside .table-wrap show each row as a card (see globals.css). Each cell needs
 * its column name for that, so this copies the header text into the cells' data-label. It runs on
 * every page (one component in the root layout) and again whenever a table's rows change.
 */
export function TableLabels() {
  useEffect(() => {
    const label = () => {
      for (const table of document.querySelectorAll<HTMLTableElement>(".table-wrap table")) {
        const heads = [...table.querySelectorAll("thead th")].map((th) => (th.textContent ?? "").trim());
        if (!heads.length) continue;
        for (const row of table.querySelectorAll("tbody tr")) {
          [...row.children].forEach((cell, i) => {
            const text = heads[i] ?? "";
            if (cell.getAttribute("data-label") !== text) cell.setAttribute("data-label", text);
          });
        }
      }
    };
    label();
    let queued = false;
    const observer = new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; label(); });
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  return null;
}
