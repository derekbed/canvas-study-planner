(function () {
  "use strict";
  const MAX_INSTRUCTIONS = 8000;
  const clean = (value, max = 200) => String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
  function safeUrl(raw) {
    try {
      const url = new URL(raw);
      if (url.protocol !== "https:" || url.hostname !== "canvas.upenn.edu" ||
          /\/feeds?\/|\.ics(?:$|\/)|calendar[_-]?feed/i.test(url.pathname)) return "";
      return `${url.origin}${url.pathname}`;
    } catch { return ""; }
  }
  function visible(node, win) {
    if (!node || node.closest("[hidden],[aria-hidden='true'],script,style,noscript,template,input,textarea,[type='password']")) return false;
    for (let parent = node; parent && parent.nodeType === 1; parent = parent.parentElement) {
      const style = win.getComputedStyle ? win.getComputedStyle(parent) : null;
      if (style && (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse")) return false;
    }
    return true;
  }
  function nodeText(node, win, max) {
    if (!node || !visible(node, win)) return "";
    const doc = node.ownerDocument;
    const walker = doc.createTreeWalker(node, 4);
    const pieces = [];
    let next, length = 0;
    while ((next = walker.nextNode()) && length < max + 100) {
      if (visible(next.parentElement, win)) {
        const part = clean(next.nodeValue, max);
        if (part) { pieces.push(part); length += part.length + 1; }
      }
    }
    return clean(pieces.join(" "), max);
  }
  function firstText(doc, win, selectors, max = 200) {
    for (const selector of selectors) {
      for (const node of doc.querySelectorAll(selector)) {
        const text = nodeText(node, win, max);
        if (text) return text;
      }
    }
    return "";
  }
  function extract(doc, win, rawUrl) {
    const url = safeUrl(rawUrl);
    const path = url ? new URL(url).pathname : "";
    const supported = /^\/courses\/\d+(?:\/|$)/.test(path) &&
      !/\/(?:calendar|grades|people|users|files|settings)(?:\/|$)/.test(path);
    if (!supported) return { supported: false, message: "No Canvas context detected", fieldsFound: [] };
    const assignment = /\/assignments\/\d+(?:\/|$)/.test(path);
    const context = {
      url,
      pageTitle: firstText(doc, win, ["main h1", "#content h1", ".ic-Layout-contentMain h1", "h1"]),
      courseName: firstText(doc, win, ["#breadcrumbs a[href*='/courses/']", "nav[aria-label='Breadcrumb'] a[href*='/courses/']", ".course-title", "#course_home_content h1"]),
      courseCode: firstText(doc, win, [".course-code", "[data-testid='course-code']", "#breadcrumbs .course_code"], 80),
      assignmentTitle: assignment ? firstText(doc, win, ["#assignment_show .title", ".assignment-title", "#content h1", "main h1"]) : "",
      dueText: assignment ? firstText(doc, win, ["#assignment_show .due_date", ".assignment-details .due_date", "[data-testid='due-date']", "#assignment_show time", ".assignment_dates"] , 160) : "",
      pointsText: assignment ? firstText(doc, win, ["#assignment_show .points_possible", ".assignment-details .points_possible", "[data-testid='points-possible']", ".points_possible"], 80) : "",
      instructions: assignment ? firstText(doc, win, ["#assignment_show .description", "#assignment_show .user_content", ".assignment-description", "[data-testid='assignment-description']", "#content .user_content"], MAX_INSTRUCTIONS) : ""
    };
    if (!context.courseCode && context.courseName) {
      context.courseCode = context.courseName.match(/\b[A-Z]{2,7}[ -]\d{3,4}(?:-\d{3})?\b/)?.[0] || "";
    }
    const fieldsFound = Object.entries(context).filter(([, value]) => value).map(([key]) => key);
    return { supported: true, context, fieldsFound, confidence: fieldsFound.length >= 4 ? "high" : "limited" };
  }
  if (typeof module !== "undefined" && module.exports) module.exports = { extract, safeUrl };
  if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type === "COURSEWISE_EXTRACT") sendResponse(extract(document, window, window.location.href));
    });
  }
})();
