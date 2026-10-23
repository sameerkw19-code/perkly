"use client";
import { useEffect, useState } from "react";
import QRCode from "qrcode";

export function QrImage({ text, size = 220, label }: { text: string; size?: number; label: string }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(text, { width: size, margin: 1, errorCorrectionLevel: "M" })
      .then((url) => alive && setSrc(url))
      .catch(() => alive && setSrc(""));
    return () => {
      alive = false;
    };
  }, [text, size]);
  return src ? (
    <img src={src} width={size} height={size} alt={label} style={{ borderRadius: 12, background: "white" }} />
  ) : (
    <div style={{ width: size, height: size }} aria-label={label} />
  );
}
