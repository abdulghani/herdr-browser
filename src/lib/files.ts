// File names. Kept free of Electron so it can be unit tested.

// "report.pdf" -> "report (1).pdf", "report (2).pdf"… the first name `taken` says is free, like
// Chrome does for a download whose name already exists. ".tar.gz" counts as one extension.
export function uniqueName(name: string, taken: (name: string) => boolean): string {
  if (!taken(name)) return name;
  const [, base, ext = ''] = name.match(/^(.+?)((?:\.tar)?\.[^.]+)?$/) ?? [];
  for (let i = 1; ; i++) {
    const candidate = `${base} (${i})${ext}`;
    if (!taken(candidate)) return candidate;
  }
}
