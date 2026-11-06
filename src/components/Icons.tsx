import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { title?: string };

function Svg({ title, children, ...rest }: P & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

export const IconBattery = (p: P) => (
  <Svg {...p}>
    <rect x="2" y="7" width="17" height="10" rx="2" />
    <path d="M22 11v2" />
    <path d="M6 10v4M10 10v4" />
  </Svg>
);

export const IconHeat = (p: P) => (
  <Svg {...p}>
    <path d="M14 14.8V4a2 2 0 1 0-4 0v10.8a4 4 0 1 0 4 0Z" />
    <path d="M12 9v7" />
  </Svg>
);

export const IconOxygen = (p: P) => (
  <Svg {...p}>
    <circle cx="9" cy="13" r="6" />
    <path d="M16 6.5a2.5 2.5 0 1 1 5 0c0 1.5-2.5 2.5-5 5h5" />
  </Svg>
);

export const IconBolt = (p: P) => (
  <Svg {...p}>
    <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />
  </Svg>
);

export const IconSnow = (p: P) => (
  <Svg {...p}>
    <path d="M12 2v20M4.9 6l14.2 12M19.1 6 4.9 18" />
    <path d="m9 3 3 2 3-2M9 21l3-2 3 2" />
  </Svg>
);

export const IconLungs = (p: P) => (
  <Svg {...p}>
    <path d="M12 4v8" />
    <path d="M12 12c-1.5-1-3-2.5-4-2.5C5 9.5 4 15 4 18c0 1.5 1 2 2 2 2.5 0 4-2 5-3.5" />
    <path d="M12 12c1.5-1 3-2.5 4-2.5 3 0 4 5.5 4 8.5 0 1.5-1 2-2 2-2.5 0-4-2-5-3.5" />
  </Svg>
);

export const IconWrench = (p: P) => (
  <Svg {...p}>
    <path d="M14.7 6.3a4 4 0 0 0 5 5L22 14l-8 8-2.3-2.3a4 4 0 0 0-5-5L4 12l8-8 2.7 2.3Z" />
  </Svg>
);

export const IconAlert = (p: P) => (
  <Svg {...p}>
    <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
    <path d="M12 9v4M12 17h.01" />
  </Svg>
);

export const IconCritical = (p: P) => (
  <Svg {...p}>
    <path d="M7.9 2h8.2L22 7.9v8.2L16.1 22H7.9L2 16.1V7.9L7.9 2Z" />
    <path d="M15 9l-6 6M9 9l6 6" />
  </Svg>
);

export const IconInfo = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 16v-4M12 8h.01" />
  </Svg>
);

export const IconCheck = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="10" />
    <path d="m8 12 3 3 5-6" />
  </Svg>
);

export const IconPause = (p: P) => (
  <Svg {...p}>
    <path d="M9 5v14M15 5v14" />
  </Svg>
);

export const IconPlay = (p: P) => (
  <Svg {...p}>
    <path d="M7 4v16l13-8L7 4Z" />
  </Svg>
);

export const IconRestart = (p: P) => (
  <Svg {...p}>
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
    <path d="M3 3v5h5" />
  </Svg>
);

export const IconClock = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 6v6l4 2" />
  </Svg>
);

export const IconUp = (p: P) => (
  <Svg {...p}>
    <path d="M12 19V5M5 12l7-7 7 7" />
  </Svg>
);

export const IconDown = (p: P) => (
  <Svg {...p}>
    <path d="M12 5v14M19 12l-7 7-7-7" />
  </Svg>
);

export const IconFlat = (p: P) => (
  <Svg {...p}>
    <path d="M5 12h14" />
  </Svg>
);

export const IconMinus = (p: P) => (
  <Svg {...p}>
    <path d="M5 12h14" />
  </Svg>
);

export const IconPlus = (p: P) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);

export const IconSun = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </Svg>
);

export const IconFlame = (p: P) => (
  <Svg {...p}>
    <path d="M12 22c4 0 7-2.7 7-6.6 0-3.6-2.5-5.6-3.6-8.4-.9 2-1.9 2.9-3.1 3.3C12.6 7 11.4 4.3 9 2c.4 3.6-4 6.4-4 11.4C5 19.3 8 22 12 22Z" />
  </Svg>
);

export const IconFilter = (p: P) => (
  <Svg {...p}>
    <rect x="4" y="3" width="16" height="18" rx="3" />
    <path d="M8 8h8M8 12h8M8 16h8" />
  </Svg>
);

export const IconMeteor = (p: P) => (
  <Svg {...p}>
    <circle cx="15" cy="15" r="5" />
    <path d="M2 2l8 8M6 2l6 6M2 6l6 6" />
  </Svg>
);

export const IconDrop = (p: P) => (
  <Svg {...p}>
    <path d="M12 2s7 7.6 7 12.5A7 7 0 0 1 5 14.5C5 9.6 12 2 12 2Z" />
  </Svg>
);

export const IconBatteryWarn = (p: P) => (
  <Svg {...p}>
    <rect x="2" y="7" width="17" height="10" rx="2" />
    <path d="M22 11v2" />
    <path d="M11 9l-2 3h3l-2 3" />
  </Svg>
);

export const IconShip = (p: P) => (
  <Svg {...p}>
    <path d="M3 12h4l3-5h6l5 5-5 5h-6l-3-5" />
    <circle cx="15" cy="12" r="1.5" />
  </Svg>
);

export const IconMenu = (p: P) => (
  <Svg {...p}>
    <path d="M4 6h16M4 12h16M4 18h16" />
  </Svg>
);

export const IconVolume = (p: P) => (
  <Svg {...p}>
    <path d="M11 5 6 9H3v6h3l5 4V5Z" />
    <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />
  </Svg>
);

export const IconMute = (p: P) => (
  <Svg {...p}>
    <path d="M11 5 6 9H3v6h3l5 4V5Z" />
    <path d="m16 9 6 6M22 9l-6 6" />
  </Svg>
);

export const IconDice = (p: P) => (
  <Svg {...p}>
    <rect x="3" y="3" width="18" height="18" rx="4" />
    <circle cx="8.5" cy="8.5" r="1" fill="currentColor" />
    <circle cx="15.5" cy="15.5" r="1" fill="currentColor" />
    <circle cx="15.5" cy="8.5" r="1" fill="currentColor" />
    <circle cx="8.5" cy="15.5" r="1" fill="currentColor" />
  </Svg>
);

export const IconCalendar = (p: P) => (
  <Svg {...p}>
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <path d="M16 2v4M8 2v4M3 10h18" />
  </Svg>
);

export const IconMedal = (p: P) => (
  <Svg {...p}>
    <circle cx="12" cy="15" r="6" />
    <path d="M8.5 10 6 2h4l2 5 2-5h4l-2.5 8" />
  </Svg>
);

export const IconGrad = (p: P) => (
  <Svg {...p}>
    <path d="M2 9l10-5 10 5-10 5L2 9Z" />
    <path d="M6 11v5c3 2 9 2 12 0v-5" />
  </Svg>
);
