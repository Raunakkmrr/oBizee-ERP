import { Frown, Meh, Smile } from "lucide-react";
import { cn } from "@/lib/utils";
import { ratingTone, ratingWord } from "@/lib/data/feedback";

/**
 * A rating, said three ways — FR-1202 and §6.13.4.
 *
 * The word carries the meaning, the icon carries it again for anyone scanning
 * shapes, and the number is there because "4 of 5" is what the customer chose.
 * Colour is the fourth channel, never the first: a red-green deficiency is
 * common enough among this product's users that a red pill saying nothing else
 * would simply be a grey pill.
 */
export function Rating({
  rating,
  className,
}: {
  rating: number;
  className?: string;
}) {
  const tone = ratingTone(rating);
  const Icon = tone === "bad" ? Frown : tone === "middling" ? Meh : Smile;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium",
        tone === "bad" && "bg-destructive-bg text-destructive",
        tone === "middling" && "bg-warning-bg text-warning",
        tone === "good" && "bg-success-bg text-success",
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-3.5 shrink-0" />
      {ratingWord(rating)}
      <span className="tabular-nums opacity-70">{rating}/5</span>
    </span>
  );
}
