import { publicPhotoUrl } from "@/lib/config";
import { thumbPathFor } from "@/lib/images-paths";
import type { ReportPhoto, Species } from "@/lib/types";

/** First photo of a report, or a plain illustrated placeholder when there's none. */
export function PetPhoto({
  photo,
  species,
  alt,
  size = "thumb",
  className = "",
}: {
  photo?: Pick<ReportPhoto, "storage_path"> | null;
  species: Species;
  alt: string;
  size?: "thumb" | "full";
  className?: string;
}) {
  if (!photo) {
    return (
      <div className={`bg-mint flex flex-col items-center justify-center text-teal ${className}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/demo/${species}.svg`} alt="" className="w-1/2 max-w-[140px] opacity-80" />
        <span className="text-sm mt-2">No photo provided</span>
      </div>
    );
  }
  const path = size === "thumb" ? thumbPathFor(photo.storage_path) : photo.storage_path;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={publicPhotoUrl(path)} alt={alt} loading="lazy" className={`object-cover bg-mint ${className}`} />
  );
}
