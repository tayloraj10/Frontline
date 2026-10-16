const PATHS: Record<string, string> = {
  instagram:
    "M12 2.2c3.2 0 3.6 0 4.8.1 3.3.1 4.8 1.7 4.9 4.9.1 1.3.1 1.6.1 4.8s0 3.6-.1 4.8c-.1 3.200-1.7 4.800-4.900 4.900-1.300.1-1.600.1-4.800.1s-3.600 0-4.800-.1c-3.300-.1-4.800-1.700-4.900-4.900C2.200 15.600 2.200 15.200 2.200 12s0-3.600.1-4.800C2.400 3.900 4 2.400 7.200 2.300 8.400 2.200 8.800 2.200 12 2.200zM12 7a5 5 0 100 10 5 5 0 000-10zm0 8.200a3.200 3.200 0 110-6.400 3.200 3.200 0 010 6.400zm5.200-9.700a1.200 1.200 0 100 2.400 1.200 1.200 0 000-2.400z",
  tiktok:
    "M16.6 5.800A4.300 4.300 0 0115.500 3h-3.100v12.400a2.600 2.600 0 11-1.800-2.500V9.700a5.700 5.700 0 105 5.700V9a7.400 7.400 0 004.300 1.400V7.300a4.300 4.300 0 01-3.300-1.500z",
  youtube:
    "M21.600 7.200a2.500 2.500 0 00-1.800-1.800C18.200 5 12 5 12 5s-6.200 0-7.800.4A2.500 2.500 0 002.400 7.200C2 8.800 2 12 2 12s0 3.200.4 4.800a2.500 2.500 0 001.800 1.800C5.800 19 12 19 12 19s6.200 0 7.800-.4a2.500 2.500 0 001.800-1.800C22 15.200 22 12 22 12s0-3.200-.4-4.800zM10 15V9l5.200 3z",
  facebook:
    "M13.500 21v-8h2.700l.4-3.200h-3.100V7.800c0-.9.300-1.500 1.600-1.500h1.700V3.400c-.3 0-1.300-.1-2.400-.1-2.400 0-4 1.500-4 4.100v2.400H7.700V13h2.700v8z",
  twitter:
    "M17.800 3h3.100l-6.800 7.700L22 21h-6.200l-4.900-6.300L5.300 21H2.200l7.200-8.300L2 3h6.400l4.400 5.800zm-1.100 16.200h1.700L7.300 4.700H5.500z",
};

export function hasSocialIcon(platform: string) {
  return platform in PATHS;
}

export default function SocialIcon({ platform, className = "w-5 h-5" }: { platform: string; className?: string }) {
  if (platform === "website") {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3c2.5 2.700 3.800 5.700 3.800 9s-1.300 6.300-3.800 9c-2.500-2.700-3.800-5.700-3.800-9S9.500 5.700 12 3z" />
      </svg>
    );
  }
  const d = PATHS[platform.toLowerCase()];
  if (!d) {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M10 14a4 4 0 005.700 0l3-3a4 4 0 00-5.700-5.700l-1 1M14 10a4 4 0 00-5.700 0l-3 3a4 4 0 005.700 5.700l1-1" />
      </svg>
    );
  }
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}
