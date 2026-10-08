/* Small, safe Markdown subset for AI replies. It produces data, never HTML. */
(function (root) {
  function inline(source) {
    const out = [], pattern = /(`[^`\n]+`|\[[^\]\n]+\]\([^)\n]+\)|\*\*[^*\n]+\*\*|__[^_\n]+__|~~[^~\n]+~~|\*[^*\n]+\*|_[^_\n]+_)/g;
    let at = 0, match;
    while ((match = pattern.exec(source))) {
      if (match.index > at) out.push({ type: "text", text: source.slice(at, match.index) });
      const token = match[0];
      if (token[0] === "`") out.push({ type: "code", text: token.slice(1, -1) });
      else if (token[0] === "[") {
        const split = token.indexOf("](");
        const label = token.slice(1, split), href = token.slice(split + 2, -1);
        let safe = false;
        try { safe = ["http:", "https:"].includes(new URL(href).protocol); } catch { /* Leave unsafe links as text. */ }
        out.push(safe ? { type: "link", href, children: inline(label) } : { type: "text", text: token });
      } else {
        const wide = token.startsWith("**") || token.startsWith("__") || token.startsWith("~~");
        const marker = wide ? 2 : 1;
        out.push({ type: token.startsWith("~~") ? "strike" : wide ? "strong" : "em", children: inline(token.slice(marker, -marker)) });
      }
      at = pattern.lastIndex;
    }
    if (at < source.length) out.push({ type: "text", text: source.slice(at) });
    return out;
  }
  function parse(source) {
    const lines = String(source || "").replace(/\r\n?/g, "\n").split("\n"), blocks = [];
    let i = 0;
    const listLine = line => /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(line);
    const special = line => /^\s*(```|#{1,6}\s|>\s?|(?:---+|\*\*\*+)\s*$)/.test(line) || !!listLine(line);
    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim()) { i++; continue; }
      const fence = /^\s*```\s*([\w+-]*)/.exec(line);
      if (fence) {
        i++; const body = [];
        while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) body.push(lines[i++]);
        if (i < lines.length) i++;
        blocks.push({ type: "code", text: body.join("\n"), language: fence[1] }); continue;
      }
      const heading = /^\s*(#{1,6})\s+(.+)$/.exec(line);
      if (heading) { blocks.push({ type: "heading", level: heading[1].length, children: inline(heading[2]) }); i++; continue; }
      if (/^\s*(?:---+|\*\*\*+)\s*$/.test(line)) { blocks.push({ type: "rule" }); i++; continue; }
      if (/^\s*>/.test(line)) {
        const quote = [];
        while (i < lines.length && /^\s*>/.test(lines[i])) quote.push(lines[i++].replace(/^\s*>\s?/, ""));
        blocks.push({ type: "quote", blocks: parse(quote.join("\n")) }); continue;
      }
      const first = listLine(line);
      if (first) {
        const indent = first[1].length, ordered = /\d/.test(first[2][0]), items = [];
        const start = ordered ? Number.parseInt(first[2], 10) : undefined;
        while (i < lines.length) {
          const current = listLine(lines[i]);
          if (!current || current[1].length !== indent || /\d/.test(current[2][0]) !== ordered) break;
          i++; const nested = [];
          while (i < lines.length) {
            if (!lines[i].trim()) {
              if (i + 1 < lines.length && listLine(lines[i + 1])?.[1].length > indent) { i++; continue; }
              break;
            }
            const next = listLine(lines[i]);
            if (next && next[1].length <= indent) break;
            if (lines[i].search(/\S/) <= indent) break;
            nested.push(lines[i].slice(indent + 2)); i++;
          }
          items.push({ children: inline(current[3]), blocks: nested.length ? parse(nested.join("\n")) : [] });
          if (i < lines.length && !lines[i].trim()) {
            const next = lines[i + 1] && listLine(lines[i + 1]);
            if (next && next[1].length === indent && /\d/.test(next[2][0]) === ordered) i++;
          }
        }
        blocks.push({ type: "list", ordered, start, items }); continue;
      }
      const paragraph = [line]; i++;
      while (i < lines.length && lines[i].trim() && !special(lines[i])) paragraph.push(lines[i++]);
      blocks.push({ type: "paragraph", children: inline(paragraph.join("\n")) });
    }
    return blocks;
  }
  function render(source, doc = document) {
    const wrapper = doc.createElement("div"); wrapper.className = "cw-formatted-message";
    function addInline(parent, nodes) {
      for (const node of nodes) {
        if (node.type === "text") {
          const parts = node.text.split("\n");
          parts.forEach((part, index) => { if (index) parent.append(doc.createElement("br")); parent.append(doc.createTextNode(part)); });
        } else {
          const tag = { code: "code", link: "a", strong: "strong", em: "em", strike: "s" }[node.type];
          const element = doc.createElement(tag);
          if (node.type === "link") { element.href = node.href; element.target = "_blank"; element.rel = "noopener noreferrer"; }
          if (node.text !== undefined) element.textContent = node.text;
          if (node.children) addInline(element, node.children);
          parent.append(element);
        }
      }
    }
    function addBlocks(parent, blocks) {
      for (const block of blocks) {
        const tag = { paragraph: "p", heading: "h" + Math.min(block.level + 2, 6), code: "pre", quote: "blockquote", rule: "hr", list: block.ordered ? "ol" : "ul" }[block.type];
        const element = doc.createElement(tag);
        if (block.type === "code") { const code = doc.createElement("code"); code.textContent = block.text; element.append(code); }
        if (block.children) addInline(element, block.children);
        if (block.blocks) addBlocks(element, block.blocks);
        if (block.items) {
          if (block.ordered && block.start !== undefined) element.start = block.start;
          for (const item of block.items) { const li = doc.createElement("li"); addInline(li, item.children); addBlocks(li, item.blocks); element.append(li); }
        }
        parent.append(element);
      }
    }
    addBlocks(wrapper, parse(source));
    return wrapper;
  }
  root.CoursewiseChatFormat = { parse, render };
})(globalThis);
