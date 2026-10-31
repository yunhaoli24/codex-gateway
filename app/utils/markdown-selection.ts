/** Preserve the enclosing Markdown structure when only part of a formatted text node is selected. */
export function selectedMarkdownFragment(selection: Selection, boundary: HTMLElement) {
  if (selection.isCollapsed || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!boundary.contains(range.startContainer) || !boundary.contains(range.endContainer))
    return null;
  const markdownRoots = boundary.querySelectorAll(".markdown-content");
  if (!Array.from(markdownRoots).some((root) => range.intersectsNode(root))) return null;

  const fragment = document.createElement("div");
  fragment.append(range.cloneContents());
  let ancestor = range.commonAncestorContainer;
  if (!(ancestor instanceof Element)) ancestor = ancestor.parentElement ?? boundary;
  // cloneContents omits common ancestors. Restore marks/headings/lists/code fences around
  // partial selections; parsing only the naked text would silently lose their Markdown syntax.
  while (
    ancestor instanceof Element &&
    ancestor !== boundary &&
    !ancestor.classList.contains("markdown-content")
  ) {
    const wrapper = ancestor.cloneNode(false);
    wrapper.appendChild(fragment.firstChild ?? document.createTextNode(""));
    while (fragment.firstChild) wrapper.appendChild(fragment.firstChild);
    fragment.appendChild(wrapper);
    ancestor = ancestor.parentElement ?? boundary;
  }

  fragment
    .querySelectorAll("button, input, textarea, [data-markdown-copy-ignore]")
    .forEach((node) => node.remove());
  // Diff rows use display:block rather than source newlines. Restore those separators in the
  // copy-only fragment; changing the live renderer would alter its line heights and scrolling.
  for (const code of fragment.querySelectorAll("pre code")) {
    const lines = code.querySelectorAll(":scope > .diff-line");
    if (lines.length > 0)
      code.textContent = Array.from(lines, (line) => line.textContent ?? "").join("\n");
  }
  // KaTeX's rendered DOM contains duplicate visual and accessibility text. Its annotation is
  // the authoritative LaTeX source; convert that before passing DOM to the shared editor schema.
  for (const selector of [".katex-display", ".katex"]) {
    for (const formula of fragment.querySelectorAll(selector)) {
      const source = formula.querySelector('annotation[encoding="application/x-tex"]')?.textContent;
      if (source === undefined || source === null) continue;
      const block = formula.classList.contains("katex-display");
      const replacement = document.createElement(block ? "div" : "span");
      replacement.dataset.math = block ? "block" : "inline";
      replacement.textContent = source;
      formula.replaceWith(replacement);
    }
  }
  return fragment;
}
