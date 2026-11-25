"use client";

import { Brand } from "../../../components/brand";
import { ReaderLoans } from "../../../components/reader-loans";
import { isRtl } from "../../../lib/design";
import { translate } from "../../../lib/i18n";
import type { Lang } from "../../../lib/design";
import type { Loan } from "../../../lib/library";

export default function LoansView({ data }: {
  data: { key: string; lang: Lang; library: string; color: string; loans: Loan[]; extDays: number; maxExt: number } | null;
}) {
  const lang: Lang = data?.lang ?? "he";
  const t = (k: string, v?: Record<string, string | number>) => translate(lang, k, v);
  return (
    <div className="card-page" dir={isRtl(lang) ? "rtl" : "ltr"} lang={lang}>
      <header className="auth-top"><Brand /></header>
      <main id="main" className="page-main">
        {!data ? (
          <div className="auth-card panel"><h1>{t("libLinkInvalid")}</h1></div>
        ) : (
          <div className="card-stack">
            <h1 className="loans-title" style={{ borderColor: data.color }}>{t("libBooksAt", { name: data.library })}</h1>
            <ReaderLoans loanKey={data.key} loans={data.loans} maxExt={data.maxExt} extDays={data.extDays} t={t} lang={lang} />
          </div>
        )}
      </main>
    </div>
  );
}
