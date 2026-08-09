import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

const ELEVATION_CLASS = {
  1: "shadow-elevation-1",
  2: "shadow-elevation-2",
  3: "shadow-elevation-3",
  4: "shadow-elevation-4",
} as const;

const PADDING_CLASS = {
  none: "",
  sm: "p-3",
  md: "p-4",
  lg: "p-5",
} as const;

type CardOwnProps = {
  /** Resting shadow tier. Interactive cards add elevation-3 on hover regardless of this. */
  elevation?: 1 | 2 | 3 | 4;
  /** Adds hover-lift + tap-press feedback for tappable cards (list rows, group cards, etc). */
  interactive?: boolean;
  padding?: keyof typeof PADDING_CLASS;
};

function cardClasses({ elevation = 1, interactive, padding = "md" }: CardOwnProps) {
  return cn(
    "rounded-xl border border-zinc-800/80 bg-zinc-900/80",
    ELEVATION_CLASS[elevation],
    PADDING_CLASS[padding],
    interactive &&
      "transition-[transform,box-shadow,border-color] duration-200 ease-out hover:-translate-y-0.5 hover:border-zinc-700 hover:shadow-elevation-3 active:translate-y-0 active:scale-[0.98] active:shadow-elevation-1 active:duration-100 cursor-pointer touch-manipulation"
  );
}

type CardDivProps = CardOwnProps & HTMLAttributes<HTMLDivElement>;

/** Base surface primitive: replaces the app's repeated `bg-zinc-900/X border-zinc-800 rounded-xl` recipe. */
export const Card = forwardRef<HTMLDivElement, CardDivProps>(function Card(
  { elevation, interactive, padding, className, ...rest },
  ref
) {
  return <div ref={ref} className={cn(cardClasses({ elevation, interactive, padding }), className)} {...rest} />;
});

type CardButtonProps = CardOwnProps & ButtonHTMLAttributes<HTMLButtonElement>;

/** Same visual system as `Card`, rendered as a real `<button>` for tap targets that trigger an action. */
export const CardButton = forwardRef<HTMLButtonElement, CardButtonProps>(function CardButton(
  { elevation, interactive = true, padding, className, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      className={cn(cardClasses({ elevation, interactive, padding }), "text-left w-full", className)}
      {...rest}
    />
  );
});
