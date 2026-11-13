import { test } from "node:test";
import assert from "node:assert/strict";
import {
  clean,
  normalisePhone,
  parseContact,
  parseFlag,
  parseMessage,
  parsePartnerApplication,
  parseReport,
  parseSearchParams,
} from "../../src/lib/validation";

const NOW = new Date("2026-11-13T02:00:00Z");

function lostFields(overrides: Record<string, string> = {}) {
  return {
    species: "dog",
    petName: "Simba",
    breed: "Cavoodle",
    primaryColour: "Cream",
    size: "small",
    ageGroup: "adult",
    sex: "male",
    desexed: "yes",
    eventAt: "2026-11-12T08:30:00.000Z",
    suburb: "Rowville",
    contactEmail: "Owner@Example.com",
    preferredContact: "email",
    consent: "on",
    ...overrides,
  };
}

test("valid lost report is accepted and normalised", () => {
  const r = parseReport(lostFields(), "lost", NOW);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.data.petName, "Simba");
  assert.equal(r.data.suburb, "Rowville");
  assert.equal(r.data.postcode, "3178");
  assert.equal(r.data.contactEmail, "owner@example.com");
  assert.equal(r.data.desexed, true);
  assert.equal(r.data.locationIsExact, false);
  assert.equal(r.data.animalLocation, null);
});

test("lost report requires pet name, colour, species, consent", () => {
  const r = parseReport(lostFields({ petName: " ", primaryColour: "", species: "rabbit", consent: "" }), "lost", NOW);
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.ok(r.errors.petName);
  assert.ok(r.errors.primaryColour);
  assert.ok(r.errors.species);
  assert.ok(r.errors.consent);
});

test("found report requires where the animal is now, but not a name", () => {
  const base = lostFields({ petName: "" });
  const missing = parseReport(base, "found", NOW);
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.ok(missing.errors.animalLocation);
  const ok = parseReport({ ...base, animalLocation: "with_vet" }, "found", NOW);
  assert.equal(ok.ok, true);
});

test("rejects future dates, very old dates and garbage dates", () => {
  for (const eventAt of ["2026-11-20T00:00:00Z", "2024-01-01T00:00:00Z", "not a date", ""]) {
    const r = parseReport(lostFields({ eventAt }), "lost", NOW);
    assert.equal(r.ok, false, eventAt);
    if (!r.ok) assert.ok(r.errors.eventAt, eventAt);
  }
});

test("suburb must be in the supported list (case-insensitive)", () => {
  assert.equal(parseReport(lostFields({ suburb: "rowville " }), "lost", NOW).ok, true);
  const r = parseReport(lostFields({ suburb: "Sydney" }), "lost", NOW);
  assert.equal(r.ok, false);
});

test("shared GPS location must be inside Victoria", () => {
  const good = parseReport(lostFields({ lat: "-37.92611", lng: "145.23422" }), "lost", NOW);
  assert.equal(good.ok, true);
  if (good.ok) {
    assert.equal(good.data.locationIsExact, true);
    assert.equal(good.data.lat, -37.92611);
  }
  const bad = parseReport(lostFields({ lat: "51.5", lng: "-0.12" }), "lost", NOW);
  assert.equal(bad.ok, false);
});

test("phone required when preferred contact is phone", () => {
  const r = parseReport(lostFields({ preferredContact: "phone" }), "lost", NOW);
  assert.equal(r.ok, false);
  const ok = parseReport(lostFields({ preferredContact: "phone", contactPhone: "0412 345 678" }), "lost", NOW);
  assert.equal(ok.ok, true);
  if (ok.ok) assert.equal(ok.data.contactPhone, "0412345678");
});

test("microchip numbers are validated", () => {
  assert.equal(parseReport(lostFields({ microchipNumber: "956 000 012 345 678" }), "lost", NOW).ok, true);
  assert.equal(parseReport(lostFields({ microchipNumber: "ABC123" }), "lost", NOW).ok, false);
});

test("over-long text is rejected", () => {
  const r = parseReport(lostFields({ description: "x".repeat(2001) }), "lost", NOW);
  assert.equal(r.ok, false);
});

test("clean strips control characters and extra spaces", () => {
  assert.equal(clean("  hello\u0000   world \t"), "hello world");
  assert.equal(clean(undefined), "");
});

test("Australian phone normalisation", () => {
  assert.equal(normalisePhone("+61 412 345 678"), "0412345678");
  assert.equal(normalisePhone("(03) 9876 5432"), "0398765432");
  assert.equal(normalisePhone("12"), null);
  assert.equal(normalisePhone("call me"), null);
});

test("messages need contact details and consent", () => {
  const base = { senderName: "Sam", body: "I think I saw your dog on Stud Rd.", senderEmail: "sam@example.com", consent: "on" };
  assert.equal(parseMessage(base).ok, true);
  assert.equal(parseMessage({ ...base, senderEmail: "" }).ok, false);
  assert.equal(parseMessage({ ...base, consent: "" }).ok, false);
  assert.equal(parseMessage({ ...base, body: "hi" }).ok, false);
});

test("flags need a valid reason", () => {
  assert.equal(parseFlag({ reason: "suspected_scam" }).ok, true);
  assert.equal(parseFlag({ reason: "drop table" }).ok, false);
});

test("partner applications normalise website and validate email", () => {
  const r = parsePartnerApplication({
    organisationName: "Example Vet Clinic",
    organisationType: "vet_clinic",
    contactName: "Dr Example",
    email: "hello@examplevet.com.au",
    website: "examplevet.com.au",
  });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.data.website, "https://examplevet.com.au/");
  assert.equal(parsePartnerApplication({ organisationName: "X", organisationType: "bank", contactName: "", email: "no" }).ok, false);
});

test("contact form validation", () => {
  assert.equal(parseContact({ name: "A", email: "a@b.co", subject: "Hello", message: "A real message here" }).ok, true);
  assert.equal(parseContact({ name: "", email: "bad", subject: "", message: "short" }).ok, false);
});

test("search params ignore invalid values and strip wildcard characters", () => {
  const f = parseSearchParams({ kind: "found", species: "cat", suburb: "boronia", days: "7", q: "ginger%_,()", page: "2" });
  assert.deepEqual(f, { kind: "found", species: "cat", suburb: "Boronia", days: 7, q: "ginger", page: 2 });
  const junk = parseSearchParams({ kind: "x", species: "horse", suburb: "<script>", days: "5", page: "-3" });
  assert.deepEqual(junk, { kind: null, species: null, suburb: null, days: null, q: null, page: 1 });
  assert.equal(parseSearchParams({ suburb: "3178" }).suburb, "3178");
});
