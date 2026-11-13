/** Storage paths: reports/<reportId>/<photoId>.jpg and ..._thumb.jpg (no sharp import, safe anywhere). */
export function photoPaths(reportId: string, photoId: string) {
  return { full: `reports/${reportId}/${photoId}.jpg`, thumb: `reports/${reportId}/${photoId}_thumb.jpg` };
}

export function thumbPathFor(fullPath: string): string {
  return fullPath.replace(/\.jpg$/, "_thumb.jpg");
}
