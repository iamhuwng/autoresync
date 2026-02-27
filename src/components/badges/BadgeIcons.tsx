/**
 * Badge Icon Components
 * 
 * SVG icon components for each badge type with modern, edgy designs
 * featuring gradients and dynamic styling.
 */

import React from 'react';

interface BadgeIconProps {
    size?: number;
    className?: string;
}

/**
 * First Test Badge Icon - Rocket
 */
export const FirstTestIcon: React.FC<BadgeIconProps> = ({ size = 48, className }) => (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className}>
        <defs>
            <linearGradient id="first-test-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#4dabf7" />
                <stop offset="100%" stopColor="#1971c2" />
            </linearGradient>
        </defs>
        <path
            d="M24 4L28 12L36 14L30 22L32 30L24 26L16 30L18 22L12 14L20 12L24 4Z"
            fill="url(#first-test-gradient)"
        />
        <path
            d="M24 10L26 16L32 17.5L28 23L29 29L24 26.5L19 29L20 23L16 17.5L22 16L24 10Z"
            fill="white"
            opacity="0.4"
        />
    </svg>
);

/**
 * Perfect Score Badge Icon - Star
 */
export const PerfectScoreIcon: React.FC<BadgeIconProps> = ({ size = 48, className }) => (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className}>
        <defs>
            <linearGradient id="perfect-score-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#ffd43b" />
                <stop offset="100%" stopColor="#f59f00" />
            </linearGradient>
            <radialGradient id="perfect-score-glow">
                <stop offset="0%" stopColor="#fff9db" opacity="0.8" />
                <stop offset="100%" stopColor="#fff9db" opacity="0" />
            </radialGradient>
        </defs>
        <circle cx="24" cy="24" r="20" fill="url(#perfect-score-glow)" />
        <path
            d="M24 6L27.5 17.5L39 18.5L31 27L33.5 38.5L24 32.5L14.5 38.5L17 27L9 18.5L20.5 17.5L24 6Z"
            fill="url(#perfect-score-gradient)"
        />
        <path
            d="M24 12L26 19L33 19.5L28 25L29.5 32L24 28.5L18.5 32L20 25L15 19.5L22 19L24 12Z"
            fill="white"
            opacity="0.6"
        />
    </svg>
);

/**
 * On Fire Badge Icon - Flame
 */
export const OnFireIcon: React.FC<BadgeIconProps> = ({ size = 48, className }) => (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className}>
        <defs>
            <linearGradient id="fire-gradient" x1="50%" y1="0%" x2="50%" y2="100%">
                <stop offset="0%" stopColor="#ff922b" />
                <stop offset="50%" stopColor="#fd7e14" />
                <stop offset="100%" stopColor="#e8590c" />
            </linearGradient>
            <linearGradient id="fire-inner-gradient" x1="50%" y1="0%" x2="50%" y2="100%">
                <stop offset="0%" stopColor="#ffe066" />
                <stop offset="100%" stopColor="#ffd43b" />
            </linearGradient>
        </defs>
        {/* Outer flame */}
        <path
            d="M24 4C24 4 16 12 16 20C16 28 19 34 24 38C29 34 32 28 32 20C32 12 24 4 24 4Z"
            fill="url(#fire-gradient)"
        />
        {/* Inner flame */}
        <path
            d="M24 12C24 12 20 16 20 22C20 26 21.5 29 24 31C26.5 29 28 26 28 22C28 16 24 12 24 12Z"
            fill="url(#fire-inner-gradient)"
        />
        {/* Highlight */}
        <ellipse cx="22" cy="18" rx="3" ry="5" fill="white" opacity="0.5" />
    </svg>
);

/**
 * Module Master Badge Icon - Certificate
 */
export const ModuleMasterIcon: React.FC<BadgeIconProps> = ({ size = 48, className }) => (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className}>
        <defs>
            <linearGradient id="module-master-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#da77f2" />
                <stop offset="100%" stopColor="#9c36b5" />
            </linearGradient>
        </defs>
        {/* Certificate body */}
        <rect x="6" y="10" width="36" height="28" rx="2" fill="url(#module-master-gradient)" />
        <rect x="10" y="14" width="28" height="4" rx="1" fill="white" opacity="0.3" />
        <rect x="10" y="20" width="20" height="3" rx="1" fill="white" opacity="0.3" />
        <rect x="10" y="25" width="24" height="3" rx="1" fill="white" opacity="0.3" />
        {/* Ribbon */}
        <path
            d="M24 32L20 38L22 34L18 34L24 32Z"
            fill="url(#module-master-gradient)"
            opacity="0.8"
        />
        <path
            d="M24 32L28 38L26 34L30 34L24 32Z"
            fill="url(#module-master-gradient)"
            opacity="0.8"
        />
        {/* Star seal */}
        <circle cx="36" cy="12" r="6" fill="#ffd43b" />
        <path
            d="M36 9L37 11.5L39.5 11.5L37.5 13L38 15.5L36 14L34 15.5L34.5 13L32.5 11.5L35 11.5L36 9Z"
            fill="white"
        />
    </svg>
);

/**
 * Course Champion Badge Icon - Trophy
 */
export const CourseChampionIcon: React.FC<BadgeIconProps> = ({ size = 48, className }) => (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className}>
        <defs>
            <linearGradient id="trophy-gradient" x1="50%" y1="0%" x2="50%" y2="100%">
                <stop offset="0%" stopColor="#ffd43b" />
                <stop offset="50%" stopColor="#fab005" />
                <stop offset="100%" stopColor="#f59f00" />
            </linearGradient>
            <radialGradient id="trophy-shine">
                <stop offset="0%" stopColor="#ffffff" opacity="0.6" />
                <stop offset="100%" stopColor="#ffffff" opacity="0" />
            </radialGradient>
        </defs>
        {/* Trophy base */}
        <rect x="18" y="36" width="12" height="4" rx="1" fill="url(#trophy-gradient)" />
        <rect x="20" y="32" width="8" height="4" fill="url(#trophy-gradient)" />
        {/* Trophy cup */}
        <path
            d="M14 8L34 8L32 28C32 30 28 32 24 32C20 32 16 30 16 28L14 8Z"
            fill="url(#trophy-gradient)"
        />
        {/* Handles */}
        <path
            d="M12 10C10 10 8 12 8 14C8 16 10 18 12 18L14 14L12 10Z"
            fill="url(#trophy-gradient)"
            opacity="0.8"
        />
        <path
            d="M36 10C38 10 40 12 40 14C40 16 38 18 36 18L34 14L36 10Z"
            fill="url(#trophy-gradient)"
            opacity="0.8"
        />
        {/* Shine effect */}
        <ellipse cx="22" cy="16" rx="6" ry="10" fill="url(#trophy-shine)" />
        {/* Star on cup */}
        <path
            d="M24 16L25 19L28 19L26 21L27 24L24 22L21 24L22 21L20 19L23 19L24 16Z"
            fill="white"
            opacity="0.7"
        />
    </svg>
);

/**
 * Improvement Star Badge Icon - Trending Up
 */
export const ImprovementStarIcon: React.FC<BadgeIconProps> = ({ size = 48, className }) => (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className}>
        <defs>
            <linearGradient id="improvement-gradient" x1="0%" y1="100%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#51cf66" />
                <stop offset="100%" stopColor="#37b24d" />
            </linearGradient>
        </defs>
        {/* Arrow shaft */}
        <path
            d="M8 36L28 16L28 22L40 10L46 16L34 28L40 28L20 48L8 36Z"
            fill="url(#improvement-gradient)"
        />
        {/* Arrow outline for depth */}
        <path
            d="M28 16L40 10M40 10L46 16M40 10L34 28"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.5"
        />
        {/* Sparkles */}
        <circle cx="12" cy="12" r="2" fill="#51cf66" />
        <circle cx="38" cy="34" r="2" fill="#51cf66" />
        <circle cx="18" cy="6" r="1.5" fill="#51cf66" opacity="0.6" />
        <circle cx="44" cy="28" r="1.5" fill="#51cf66" opacity="0.6" />
    </svg>
);

/**
 * Badge Icon Map
 * 
 * Maps badge types to their icon components
 */
export const BADGE_ICON_MAP = {
    FIRST_TEST: FirstTestIcon,
    PERFECT_SCORE: PerfectScoreIcon,
    ON_FIRE: OnFireIcon,
    MODULE_MASTER: ModuleMasterIcon,
    COURSE_CHAMPION: CourseChampionIcon,
    IMPROVEMENT_STAR: ImprovementStarIcon,
} as const;

/**
 * Get Badge Icon Component
 * 
 * Returns the appropriate icon component for a badge type
 */
export const getBadgeIcon = (badgeType: string): React.FC<BadgeIconProps> => {
    return BADGE_ICON_MAP[badgeType as keyof typeof BADGE_ICON_MAP] || FirstTestIcon;
};
