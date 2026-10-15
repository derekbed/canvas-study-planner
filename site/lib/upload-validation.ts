const acceptedTypes: Record<string, readonly string[]> = {
  pdf: ["application/pdf", ""],
  txt: ["text/plain", ""],
  md: ["text/markdown", "text/plain", ""],
};

export async function validStudyFile(file: File, maxBytes: number): Promise<boolean> {
  if (!file.name || file.name.length > 160 || /[/\\\x00-\x1f]/.test(file.name) ||
      file.size < 1 || file.size > maxBytes) return false;
  const extension = file.name.toLowerCase().match(/\.([a-z]+)$/)?.[1];
  if (!extension || !acceptedTypes[extension]?.includes(file.type)) return false;
  const prefix = new Uint8Array(await file.slice(0, 1024).arrayBuffer());
  if (extension === "pdf") {
    const signature = [37, 80, 68, 70, 45]; // %PDF-
    return prefix.some((_, offset) => offset <= prefix.length - signature.length &&
      signature.every((byte, index) => prefix[offset + index] === byte));
  }
  return !prefix.includes(0);
}
