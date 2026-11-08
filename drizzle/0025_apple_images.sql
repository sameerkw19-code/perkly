-- Apple Wallet pictures: the business's logo and banner converted to PNG at Wallet sizes (Wallet takes
-- PNG only; uploads are JPEG/WebP). source: the asset id (assets never change, so the copy stays valid).
CREATE TABLE IF NOT EXISTS apple_images (
  source TEXT NOT NULL,
  kind TEXT NOT NULL,
  data BLOB NOT NULL,
  created TEXT NOT NULL,
  PRIMARY KEY (source, kind)
);
