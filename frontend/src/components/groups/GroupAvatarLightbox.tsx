"use client";

import { useState } from "react";
import Lightbox from "@/components/Lightbox";

export default function GroupAvatarLightbox({ imageUrl, name }: { imageUrl: string; name: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full h-full cursor-zoom-in"
        aria-label={`View ${name} photo`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl} alt={name} className="w-full h-full object-cover" />
      </button>
      {open && (
        <Lightbox images={[imageUrl]} index={0} onClose={() => setOpen(false)} onNavigate={() => {}} />
      )}
    </>
  );
}
