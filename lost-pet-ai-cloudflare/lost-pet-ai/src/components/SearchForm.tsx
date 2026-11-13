import { SUBURB_NAMES } from "@/lib/suburbs";
import type { SearchFilters } from "@/lib/validation";

export function SearchForm({ f, compact = false }: { f?: SearchFilters; compact?: boolean }) {
  return (
    <form action="/search" method="get" role="search" className={`bg-paper border border-line rounded-2xl p-5 grid gap-4 ${compact ? "sm:grid-cols-4" : "sm:grid-cols-2 lg:grid-cols-6"} items-end`}>
      <div>
        <label htmlFor="kind" className="field-label">Looking for</label>
        <select id="kind" name="kind" className="input" defaultValue={f?.kind ?? ""}>
          <option value="">Lost and found</option>
          <option value="lost">Lost pets</option>
          <option value="found">Found pets</option>
        </select>
      </div>
      <div>
        <label htmlFor="species" className="field-label">Animal</label>
        <select id="species" name="species" className="input" defaultValue={f?.species ?? ""}>
          <option value="">Dogs and cats</option>
          <option value="dog">Dogs</option>
          <option value="cat">Cats</option>
        </select>
      </div>
      <div>
        <label htmlFor="search-suburb" className="field-label">Suburb or postcode</label>
        <input id="search-suburb" name="suburb" className="input" list="search-suburbs" defaultValue={f?.suburb ?? ""} autoComplete="off" />
        <datalist id="search-suburbs">
          {SUBURB_NAMES.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </div>
      {!compact && (
        <>
          <div>
            <label htmlFor="days" className="field-label">Reported within</label>
            <select id="days" name="days" className="input" defaultValue={f?.days ? String(f.days) : ""}>
              <option value="">Any time</option>
              <option value="1">24 hours</option>
              <option value="3">3 days</option>
              <option value="7">7 days</option>
              <option value="14">14 days</option>
              <option value="30">30 days</option>
              <option value="90">90 days</option>
            </select>
          </div>
          <div>
            <label htmlFor="q" className="field-label">Colour, breed or marking</label>
            <input id="q" name="q" className="input" defaultValue={f?.q ?? ""} placeholder="e.g. ginger, collie" />
          </div>
        </>
      )}
      <button type="submit" className="btn btn-teal">Search</button>
    </form>
  );
}
