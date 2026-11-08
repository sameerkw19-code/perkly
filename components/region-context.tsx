"use client";
import { createContext, useContext } from "react";
import type { Currency } from "../lib/pricing";

/** The visitor's market, from the server (lib/server/region.ts): Israel gets Hebrew and shekels, abroad English and dollars only. */
export type ClientRegion = { intl: boolean; lang: "he" | "en"; currency: Currency };

const RegionContext = createContext<ClientRegion>({ intl: false, lang: "he", currency: "ILS" });

export function RegionProvider({ value, children }: { value: ClientRegion; children: React.ReactNode }) {
  return <RegionContext.Provider value={value}>{children}</RegionContext.Provider>;
}

export function useRegion(): ClientRegion {
  return useContext(RegionContext);
}
