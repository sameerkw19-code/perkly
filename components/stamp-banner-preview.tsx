"use client";
import { useEffect, useRef, useState } from "react";
import type { Design } from "../lib/design";
import { BANNER_H, BANNER_W, drawStampBanner, loadBannerPictures, type BannerPictures } from "./stamp-banner";

/** Live preview of the wallet stamp banner, drawn the same way as the published pictures. */
export function StampBannerPreview({ design, stamps, target, label }: { design: Design; stamps: number; target: number; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [pictures, setPictures] = useState<BannerPictures | null>(null);
  // Reload pictures and fonts only when something they depend on changes.
  const key = JSON.stringify([design.stamp, design.logo, design.colors, design.look.font, design.look.stampStyle, design.look.progress, design.progressImage]);

  useEffect(() => {
    let alive = true;
    loadBannerPictures(design).then((p) => alive && setPictures(p)).catch(() => undefined);
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (ctx && pictures) drawStampBanner(ctx, design, pictures, stamps, target);
  }, [design, pictures, stamps, target]);

  return (
    <figure className="stamp-banner-preview">
      <canvas ref={ref} width={BANNER_W} height={BANNER_H} role="img" aria-label={label} style={{ width: "100%", height: "auto", borderRadius: 12, display: "block" }} />
      <figcaption className="form-hint center">{label}</figcaption>
    </figure>
  );
}
