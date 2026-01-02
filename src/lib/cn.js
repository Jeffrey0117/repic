/**
 * Lightweight cn() utility for conditional className merging with Tailwind conflict resolution.
 * Replaces clsx + tailwind-merge dependencies.
 */

// Tailwind class prefix patterns for conflict detection
const TAILWIND_PREFIXES = [
  // Spacing
  'p', 'px', 'py', 'pt', 'pr', 'pb', 'pl', 'ps', 'pe',
  'm', 'mx', 'my', 'mt', 'mr', 'mb', 'ml', 'ms', 'me',
  // Sizing
  'w', 'h', 'min-w', 'max-w', 'min-h', 'max-h', 'size',
  // Layout
  'flex', 'grid', 'gap', 'gap-x', 'gap-y',
  'justify', 'items', 'content', 'self', 'place',
  'order', 'grow', 'shrink', 'basis',
  // Positioning
  'inset', 'top', 'right', 'bottom', 'left', 'start', 'end',
  'z',
  // Typography
  'text', 'font', 'tracking', 'leading', 'line-clamp',
  // Background
  'bg', 'from', 'via', 'to',
  // Border
  'border', 'border-t', 'border-r', 'border-b', 'border-l',
  'border-x', 'border-y', 'border-s', 'border-e',
  'rounded', 'rounded-t', 'rounded-r', 'rounded-b', 'rounded-l',
  'rounded-tl', 'rounded-tr', 'rounded-br', 'rounded-bl',
  'rounded-ss', 'rounded-se', 'rounded-ee', 'rounded-es',
  // Effects
  'opacity', 'shadow', 'blur', 'brightness', 'contrast',
  'grayscale', 'hue-rotate', 'invert', 'saturate', 'sepia',
  'backdrop-blur', 'backdrop-brightness', 'backdrop-contrast',
  'backdrop-grayscale', 'backdrop-hue-rotate', 'backdrop-invert',
  'backdrop-opacity', 'backdrop-saturate', 'backdrop-sepia',
  // Transforms
  'scale', 'scale-x', 'scale-y', 'rotate', 'translate', 'translate-x', 'translate-y',
  'skew', 'skew-x', 'skew-y', 'origin',
  // Transitions
  'transition', 'duration', 'ease', 'delay',
  // Layout modes
  'overflow', 'overflow-x', 'overflow-y',
  'object', 'aspect',
  // Display
  'display', 'visibility',
  // Misc
  'cursor', 'select', 'pointer-events', 'resize', 'scroll',
  'snap', 'touch', 'will-change', 'fill', 'stroke',
  // Colors (specific)
  'ring', 'outline', 'caret', 'accent', 'divide',
  // Columns
  'columns', 'col', 'row', 'col-span', 'row-span', 'col-start', 'col-end', 'row-start', 'row-end',
];

// Extract the Tailwind prefix from a class name
function getTailwindPrefix(className) {
  // Handle responsive/state prefixes (e.g., sm:p-4, hover:bg-red-500)
  const parts = className.split(':');
  const baseClass = parts[parts.length - 1];

  // Handle negative values (e.g., -mt-4)
  const cleanClass = baseClass.startsWith('-') ? baseClass.slice(1) : baseClass;

  // Check for arbitrary values (e.g., p-[20px])
  const arbitraryMatch = cleanClass.match(/^([a-z-]+)-\[.+\]$/);
  if (arbitraryMatch) {
    return arbitraryMatch[1];
  }

  // Sort prefixes by length (longest first) to match more specific prefixes first
  const sortedPrefixes = [...TAILWIND_PREFIXES].sort((a, b) => b.length - a.length);

  for (const prefix of sortedPrefixes) {
    // Match prefix followed by - and value, or exact match for boolean classes
    if (cleanClass === prefix || cleanClass.startsWith(prefix + '-')) {
      // Get the full prefix including responsive/state modifiers
      const modifiers = parts.slice(0, -1).join(':');
      return modifiers ? `${modifiers}:${prefix}` : prefix;
    }
  }

  return null;
}

// Process a single value into class names
function processValue(value) {
  if (!value) return [];

  if (typeof value === 'string') {
    return value.split(/\s+/).filter(Boolean);
  }

  if (Array.isArray(value)) {
    return value.flatMap(processValue);
  }

  if (typeof value === 'object') {
    return Object.entries(value)
      .filter(([, condition]) => Boolean(condition))
      .flatMap(([className]) => processValue(className));
  }

  return [];
}

// Merge class names with Tailwind conflict resolution
function mergeTailwindClasses(classes) {
  const classMap = new Map();
  const nonTailwindClasses = [];

  for (const className of classes) {
    const prefix = getTailwindPrefix(className);

    if (prefix) {
      // Later classes override earlier ones with the same prefix
      classMap.set(prefix, className);
    } else {
      // Track non-Tailwind classes by their exact value to dedupe
      if (!nonTailwindClasses.includes(className)) {
        nonTailwindClasses.push(className);
      }
    }
  }

  // Combine non-Tailwind classes with Tailwind classes (in order)
  return [...nonTailwindClasses, ...classMap.values()].join(' ');
}

/**
 * Combines class names conditionally and resolves Tailwind CSS conflicts.
 *
 * @param {...(string|string[]|Object|undefined|null|false)} inputs - Class names to combine
 * @returns {string} Combined and deduplicated class names
 *
 * @example
 * cn('p-4 text-white', 'p-2') // => 'text-white p-2'
 * cn('base', { active: true, disabled: false }) // => 'base active'
 * cn('p-4', ['m-2', 'text-sm'], { 'bg-red-500': true }) // => 'p-4 m-2 text-sm bg-red-500'
 */
export function cn(...inputs) {
  const classes = inputs.flatMap(processValue);
  return mergeTailwindClasses(classes);
}

export default cn;
