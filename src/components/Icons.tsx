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
