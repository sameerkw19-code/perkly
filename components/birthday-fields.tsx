/** Optional birthday: day and month selects, no year. Field names: "bday" and "bmonth". */
export function BirthdayFields({ t, hint = true }: { t: (key: string) => string; hint?: boolean }) {
  return (
    <fieldset className="birthday">
      <legend>{t("birthday")}</legend>
      <div className="form-row">
        <label>{t("bday")}
          <select name="bday" defaultValue="">
            <option value="">—</option>
            {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>
        <label>{t("bmonth")}
          <select name="bmonth" defaultValue="">
            <option value="">—</option>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
      </div>
      {hint && <small className="form-hint">{t("birthdayHint")}</small>}
    </fieldset>
  );
}
