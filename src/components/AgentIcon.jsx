import {
  Braces,
  Compass,
  ListChecks,
  PenLine,
  Sparkles,
} from 'lucide-react';

const icons = {
  sparkles: Sparkles,
  compass: Compass,
  code: Braces,
  pen: PenLine,
  'list-checks': ListChecks,
};

const colors = {
  violet: 'bg-violet-100 text-violet-700 ring-violet-100',
  teal: 'bg-teal-50 text-teal-700 ring-teal-100',
  blue: 'bg-blue-50 text-blue-700 ring-blue-100',
  amber: 'bg-amber-50 text-amber-700 ring-amber-100',
  rose: 'bg-rose-50 text-rose-700 ring-rose-100',
};

export default function AgentIcon({ agent, size = 'md', className = '' }) {
  const Icon = icons[agent?.icon] || Sparkles;
  const sizes = {
    sm: 'h-8 w-8 rounded-xl [&_svg]:h-4 [&_svg]:w-4',
    md: 'h-10 w-10 rounded-[14px] [&_svg]:h-[19px] [&_svg]:w-[19px]',
    lg: 'h-12 w-12 rounded-2xl [&_svg]:h-5 [&_svg]:w-5',
  };
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center ring-1 ring-inset ${colors[agent?.color] || colors.violet} ${sizes[size] || sizes.md} ${className}`}
      aria-hidden="true"
    >
      <Icon strokeWidth={1.8} />
    </span>
  );
}
