import { test } from "node:test";
import assert from "node:assert/strict";
import { approximateLocation, boundingBox, distanceKm, formatDistance, isInVictoria } from "../../src/lib/geo";
import { generateManageToken, hashIdentifier, verifyToken } from "../../src/lib/tokens";
import { shortDescription, timeAgo } from "../../src/lib/format";
import { SUBURBS, findSuburb } from "../../src/lib/suburbs";

test("approximate location stays within ~600 m but never reveals the exact point", () => {
  const exact = { lat: -37.92611, lng: 145.23422 };
  for (let i = 0; i < 500; i++) {
    const p = approximateLocation(exact.lat, exact.lng);
    const d = distanceKm(exact.lat, exact.lng, p.lat, p.lng);
    assert.ok(d < 0.6, `too far: ${d}`);
    assert.notDeepEqual(p, exact);
  }
});

test("approximate location is the same grid cell regardless of exact point within it", () => {
  const mid = () => 0.5; // no jitter
  const a = approximateLocation(-37.9261, 145.2342, mid);
  const b = approximateLocation(-37.9259, 145.2348, mid);
  assert.deepEqual(a, b, "two nearby houses should produce the same public point");
});

test("distance between Rowville and Boronia is roughly 9 km", () => {
  const r = findSuburb("Rowville")!;
  const b = findSuburb("Boronia")!;
  const d = distanceKm(r.lat, r.lng, b.lat, b.lng);
  assert.ok(d > 7 && d < 11, String(d));
  assert.equal(formatDistance(0.4), "under 1 km");
  assert.equal(formatDistance(3.25), "about 3.3 km");
});

test("bounding box contains points within the radius", () => {
  const box = boundingBox(-37.9, 145.2, 5);
  assert.ok(box.minLat < -37.94 && box.maxLat > -37.86);
});

test("all configured suburbs are in Victoria with valid postcodes", () => {
  for (const s of SUBURBS) {
    assert.ok(isInVictoria(s.lat, s.lng), s.name);
    assert.match(s.postcode, /^3\d{3}$/);
  }
  assert.equal(new Set(SUBURBS.map((s) => s.name)).size, SUBURBS.length, "duplicate suburb names");
});

test("manage tokens verify only with the right token", () => {
  const { token, hash } = generateManageToken();
  assert.ok(token.length >= 40);
  assert.equal(verifyToken(token, hash), true);
  assert.equal(verifyToken(token + "x", hash), false);
  assert.equal(verifyToken("", hash), false);
  assert.equal(verifyToken(token, null), false);
  assert.equal(verifyToken(token, "not-a-hash"), false);
});

test("identifier hashing is stable and salted", () => {
  assert.equal(hashIdentifier("1.2.3.4", "s1"), hashIdentifier("1.2.3.4", "s1"));
  assert.notEqual(hashIdentifier("1.2.3.4", "s1"), hashIdentifier("1.2.3.4", "s2"));
});

test("formatting helpers", () => {
  assert.equal(
    shortDescription({ primary_colour: "Grey", secondary_colour: "White", breed: null, species: "cat" }),
    "Grey & white cat",
  );
  const now = new Date("2026-11-13T00:00:00Z");
  assert.equal(timeAgo("2026-11-12T22:00:00Z", now), "2 hours ago");
  assert.equal(timeAgo("2026-11-10T00:00:00Z", now), "3 days ago");
});
