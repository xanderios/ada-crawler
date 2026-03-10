import { checkLinks } from "./linkChecker.js";

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

export async function analyzePage(page, url) {
  const images = await page.$$eval("img", (imgs) =>
    imgs.map((img) => ({
      src: img.currentSrc || img.src || null,
      alt: img.getAttribute("alt"),
      width: img.getAttribute("width"),
      height: img.getAttribute("height"),
    }))
  );

  const videos = await page.$$eval("video, iframe", (nodes) =>
    nodes
      .map((node) => {
        const tag = node.tagName.toLowerCase();

        if (tag === "video") {
          const tracks = Array.from(node.querySelectorAll("track"));
          const hasCaptions = tracks.some(
            (t) =>
              (t.getAttribute("kind") || "").toLowerCase() === "captions" ||
              (t.getAttribute("kind") || "").toLowerCase() === "subtitles"
          );

          return {
            tag: "video",
            src: node.currentSrc || node.getAttribute("src") || null,
            title: node.getAttribute("title"),
            hasCaptions,
          };
        }

        const src = node.getAttribute("src") || "";
        const isVideoEmbed =
          src.includes("youtube.com") ||
          src.includes("youtu.be") ||
          src.includes("vimeo.com");

        if (!isVideoEmbed) return null;

        return {
          tag: "iframe",
          src,
          title: node.getAttribute("title"),
          hasCaptions: null,
        };
      })
      .filter(Boolean)
  );

  const links = await page.$$eval("a[href]", (anchors) =>
    anchors.map((a) => ({
      href: a.href,
      text: (a.innerText || a.textContent || "").trim(),
      rel: a.getAttribute("rel"),
      target: a.getAttribute("target"),
    }))
  );

  const imageIssues = images
    .filter((img) => img.alt === null || normalizeText(img.alt) === "")
    .map((img) => ({
      ...img,
      issue: "missing_alt",
    }));

  const videoIssues = videos
    .filter((video) => {
      if (video.tag === "video") return !video.hasCaptions;
      if (video.tag === "iframe") return true;
      return false;
    })
    .map((video) => ({
      ...video,
      issue:
        video.tag === "video"
          ? "missing_captions"
          : "embedded_video_needs_manual_caption_review",
    }));

  const linkIssues = await checkLinks(links);

  return {
    url,
    images: imageIssues,
    videos: videoIssues,
    links: linkIssues,
  };
}
