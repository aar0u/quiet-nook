export function bubblePages(text, limit = 42) {
  text = text.replace(/\s*\n\s*/g, "").trim();  // paragraph breaks would otherwise show up as a blank gap at the start of a page
  const pages = [];
  let page = "";
  const sentences = text.match(/[^。！？!?]+[。！？!?]*|[。！？!?]+/gu) || [];
  for (const sentence of sentences) {
    let chars = Array.from(sentence);
    if (page && Array.from(page).length + chars.length > limit) {
      pages.push(page);
      page = "";
    }
    while (chars.length > limit) {
      const cut = limit > 1 && /[。！？!?]/u.test(chars[limit]) && !/[。！？!?]/u.test(chars[limit - 1]) ? limit - 1 : limit;
      pages.push(chars.slice(0, cut).join(""));
      chars = chars.slice(cut);
    }
    page += chars.join("");
  }
  if (page) pages.push(page);
  return pages;
}

export function bubbleDuration(text) {
  return Math.max(3500, Math.min(12000, 1800 + Array.from(text).length * 180));
}
