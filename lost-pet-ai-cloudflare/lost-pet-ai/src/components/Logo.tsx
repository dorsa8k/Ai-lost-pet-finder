/** Original mark: a paw print inside a location pin. */
export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <path d="M16 2C9.4 2 4 7.2 4 13.7 4 22.4 16 30 16 30s12-7.6 12-16.3C28 7.2 22.6 2 16 2z" fill="#0e4a4f" />
      <ellipse cx="16" cy="17" rx="4.2" ry="3.6" fill="#d3eee4" />
      <circle cx="11.2" cy="12.2" r="1.8" fill="#d3eee4" />
      <circle cx="14.4" cy="9.6" r="1.8" fill="#d3eee4" />
      <circle cx="17.6" cy="9.6" r="1.8" fill="#d3eee4" />
      <circle cx="20.8" cy="12.2" r="1.8" fill="#d3eee4" />
    </svg>
  );
}
