// The Mimus brand marks, from the official logo package, drawn inline so
// they follow the theme: the bird and wordmark use the current text color
// (near-black on light, near-white on dark) and the wings use the brand
// green for the active theme (#15AC75, or #38E0A2 on dark). The brand
// rules allow no other recoloring of the wings, so --color-brand-wing is
// only ever one of those two greens.

// The full logo (bird + "mimus" wordmark). Keep it at least 120px wide on
// screen; below that, use MimusMark.
export function MimusLogo({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 429 120" role="img" aria-label="Mimus" className={className}>
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="34" cy="42" r="8" />
        <path d="M26.5 40.5 L17 42.5 L26.5 44.5" />
        <path d="M41 46 C 55 50, 68 58, 80 70 L104 94" />
        <path d="M30 49 C 33 64, 50 74, 72 78 L98 98" />
        <path d="M104 94 L98 98" />
      </g>
      <g fill="none" stroke="var(--color-brand-wing)" strokeWidth="4.5" strokeLinecap="round">
        <path d="M54 54 C 54 36, 64 22, 84 14" />
        <path d="M63 59 C 66 44, 76 33, 93 27" />
        <path d="M71 64 C 76 54, 84 47, 97 43" />
      </g>
      <path
        transform="translate(138 -12.960000000000008) scale(0.096)"
        fill="currentColor"
        d="M61 1000V520H171V1000ZM380 1000V714Q380 666 350.0 639.5Q320 613 276 613Q246 613 222.5 625.0Q199 637 185.0 659.5Q171 682 171 714L128 690Q128 635 152.0 595.0Q176 555 217.0 532.5Q258 510 309 510Q360 510 401.0 532.0Q442 554 466.0 594.0Q490 634 490 690V1000ZM699 1000V714Q699 666 669.0 639.5Q639 613 595 613Q566 613 542.0 625.0Q518 637 504.0 659.5Q490 682 490 714L428 690Q433 635 460.0 595.0Q487 555 529.5 532.5Q572 510 623 510Q675 510 717.0 532.0Q759 554 784.0 594.0Q809 634 809 690V1000Z M923 1000V520H1033V1000ZM978 432Q950 432 931.5 413.0Q913 394 913 366Q913 338 931.5 319.0Q950 300 978 300Q1007 300 1025.0 319.0Q1043 338 1043 366Q1043 394 1025.0 413.0Q1007 432 978 432Z M1156 1000V520H1266V1000ZM1475 1000V714Q1475 666 1445.0 639.5Q1415 613 1371 613Q1341 613 1317.5 625.0Q1294 637 1280.0 659.5Q1266 682 1266 714L1223 690Q1223 635 1247.0 595.0Q1271 555 1312.0 532.5Q1353 510 1404 510Q1455 510 1496.0 532.0Q1537 554 1561.0 594.0Q1585 634 1585 690V1000ZM1794 1000V714Q1794 666 1764.0 639.5Q1734 613 1690 613Q1661 613 1637.0 625.0Q1613 637 1599.0 659.5Q1585 682 1585 714L1523 690Q1528 635 1555.0 595.0Q1582 555 1624.5 532.5Q1667 510 1718 510Q1770 510 1812.0 532.0Q1854 554 1879.0 594.0Q1904 634 1904 690V1000Z M2214 1010Q2153.3956834532373 1010.0 2105.6978417266187 983.0Q2058 956 2031.5 908.653937947494Q2005.0 861.307875894988 2005.0 798.873508353222V520H2115V794Q2115 829 2126.5 853.5Q2138 878 2160.5 891.0Q2183 904 2214.3275862068967 904.0Q2262 904 2287.5 875.5Q2313 847 2313 794V520H2423V799Q2423 862 2396.5 909.5Q2370 957 2322.8633093525177 983.5Q2275.726618705036 1010.0 2214 1010Z M2691 1010Q2651 1010 2614.0 999.5Q2577 989 2546.0 969.5Q2515 950 2492 922L2562 852Q2587 881 2619.5 895.5Q2652 910 2693 910Q2730 910 2749.0 899.0Q2768 888 2768 867Q2768 845 2750.0 833.0Q2732 821 2703.5 812.5Q2675 804 2643.5 795.0Q2612 786 2583.5 770.5Q2555 755 2537.0 728.0Q2519 701 2519 658Q2519 612 2540.5 579.0Q2562 546 2601.5 528.0Q2641 510 2696 510Q2754 510 2798.5 530.5Q2843 551 2873 592L2803 662Q2782 636 2755.0 623.0Q2728 610 2693 610Q2660 610 2642.0 620.0Q2624 630 2624 649Q2624 669 2642.0 680.0Q2660 691 2688.5 699.0Q2717 707 2748.5 716.5Q2780 726 2808.5 742.5Q2837 759 2855.0 786.5Q2873 814 2873 858Q2873 928 2824.0 969.0Q2775 1010 2691 1010Z"
      />
    </svg>
  );
}

// The leap mark alone, for small spaces.
export function MimusMark({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" role="img" aria-label="Mimus" className={className}>
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="34" cy="42" r="8" />
        <path d="M26.5 40.5 L17 42.5 L26.5 44.5" />
        <path d="M41 46 C 55 50, 68 58, 80 70 L104 94" />
        <path d="M30 49 C 33 64, 50 74, 72 78 L98 98" />
        <path d="M104 94 L98 98" />
      </g>
      <g fill="none" stroke="var(--color-brand-wing)" strokeWidth="4.5" strokeLinecap="round">
        <path d="M54 54 C 54 36, 64 22, 84 14" />
        <path d="M63 59 C 66 44, 76 33, 93 27" />
        <path d="M71 64 C 76 54, 84 47, 97 43" />
      </g>
    </svg>
  );
}
