// Enlaces de video permitidos en el contenido del estudio (spec 010 R2).

export type VideoLink = {
  provider: "youtube" | "instagram" | "tiktok";
  url: string;
  embedUrl: string;
};

function safeUrl(value: string) {
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

/** Reconoce YouTube, Instagram y TikTok; cualquier otro enlace devuelve null. */
export function parseVideoLink(value: string): VideoLink | null {
  const url = safeUrl(value);
  if (!url) return null;
  const host = url.hostname.replace(/^(www\.|m\.)/, "");
  const parts = url.pathname.split("/").filter(Boolean);

  if (host === "youtu.be" || host === "youtube.com" || host === "music.youtube.com") {
    const id =
      host === "youtu.be"
        ? parts[0]
        : parts[0] === "watch"
          ? url.searchParams.get("v")
          : ["shorts", "embed", "live"].includes(parts[0] ?? "")
            ? parts[1]
            : null;
    if (!id || !/^[\w-]{6,20}$/.test(id)) return null;
    return { provider: "youtube", url: `https://www.youtube.com/watch?v=${id}`, embedUrl: `https://www.youtube-nocookie.com/embed/${id}` };
  }

  if (host === "instagram.com") {
    const [kind, code] = parts;
    if (!["p", "reel", "reels", "tv"].includes(kind ?? "") || !code || !/^[\w-]{5,40}$/.test(code)) return null;
    const path = kind === "reels" ? "reel" : kind;
    return { provider: "instagram", url: `https://www.instagram.com/${path}/${code}/`, embedUrl: `https://www.instagram.com/${path}/${code}/embed` };
  }

  if (host === "tiktok.com") {
    const videoIndex = parts.indexOf("video");
    const id = videoIndex >= 0 ? parts[videoIndex + 1] : null;
    if (!id || !/^\d{8,25}$/.test(id) || !parts[0]?.startsWith("@")) return null;
    return { provider: "tiktok", url: `https://www.tiktok.com/${parts[0]}/video/${id}`, embedUrl: `https://www.tiktok.com/embed/v2/${id}` };
  }

  return null;
}
