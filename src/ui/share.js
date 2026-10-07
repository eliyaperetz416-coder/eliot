// Send a text through WhatsApp (opens WhatsApp's own chooser). Falls back to the system share sheet, then the clipboard.
export async function shareViaWhatsApp(text) {
  const w = window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  if (w) return 'whatsapp';
  if (navigator.share) { try { await navigator.share({ text }); return 'shared'; } catch (e) { if (e?.name === 'AbortError') return 'cancelled'; } }
  try { await navigator.clipboard.writeText(text); return 'copied'; } catch { return 'failed'; }
}
