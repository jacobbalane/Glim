import type { SVGProps } from 'react';

// Google's Material align_horizontal_center icon, Apache-2.0.
// Source and license: THIRD_PARTY_NOTICES.md.
export default function HorizontalCentreIcon({
  size = 14,
  ...props
}: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      {...props}
    >
      <polygon points="11,2 13,2 13,7 21,7 21,10 13,10 13,14 18,14 18,17 13,17 13,22 11,22 11,17 6,17 6,14 11,14 11,10 3,10 3,7 11,7" />
    </svg>
  );
}
