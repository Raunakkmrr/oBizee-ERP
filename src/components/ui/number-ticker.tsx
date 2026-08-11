"use client"

import { useEffect, useRef, type ComponentPropsWithoutRef } from "react"
import { useInView, useMotionValue, useSpring } from "motion/react"

import { cn } from "@/lib/utils"

interface NumberTickerProps extends ComponentPropsWithoutRef<"span"> {
  value: number
  startValue?: number
  direction?: "up" | "down"
  delay?: number
  decimalPlaces?: number
  /**
   * Added to the registry component.
   *
   * It shipped with `Intl.NumberFormat("en-US", …)` hardcoded, which renders
   * ₹42,000,000 where this market reads ₹4,20,00,000. Indian grouping is not a
   * preference — a lakh/crore figure in Western grouping is misread at a glance
   * by the people who use this product. Defaulted to en-US so the component
   * stays generic for anyone else.
   */
  locale?: string
}

export function NumberTicker({
  value,
  startValue = 0,
  direction = "up",
  delay = 0,
  className,
  decimalPlaces = 0,
  locale = "en-US",
  ...props
}: NumberTickerProps) {
  const ref = useRef<HTMLSpanElement>(null)
  const motionValue = useMotionValue(direction === "down" ? value : startValue)
  const springValue = useSpring(motionValue, {
    damping: 60,
    stiffness: 100,
  })
  const isInView = useInView(ref, { once: true, margin: "0px" })

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null

    if (isInView) {
      timer = setTimeout(() => {
        motionValue.set(direction === "down" ? startValue : value)
      }, delay * 1000)
    }

    return () => {
      if (timer !== null) {
        clearTimeout(timer)
      }
    }
  }, [motionValue, isInView, delay, value, direction, startValue])

  const format = (amount: number) =>
    Intl.NumberFormat(locale, {
      minimumFractionDigits: decimalPlaces,
      maximumFractionDigits: decimalPlaces,
    }).format(Number(amount.toFixed(decimalPlaces)))

  useEffect(() => {
    /*
      Subscribed only once the element is in view, so nothing overwrites the
      true figure below until there is actually an animation to run.
    */
    if (!isInView) return
    return springValue.on("change", (latest) => {
      if (ref.current) ref.current.textContent = format(latest)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [springValue, decimalPlaces, locale, isInView])

  return (
    <span
      ref={ref}
      className={cn(
        "inline-block tracking-wider text-black tabular-nums dark:text-white",
        className
      )}
      {...props}
    >
      {/*
        **The value, not the starting point.**

        This rendered `{startValue}` — literally `0` — and the real figure only
        ever arrived by the spring writing `textContent` imperatively. So when
        the observer did not fire, the animation did not run, or React
        re-rendered the subtree, the number stayed at zero and stayed there.

        It was doing exactly that on Settings: turnover read ₹0 against a real
        ₹4.2 crore, on the screen that decides SAC/HSN digit count and whether
        the e-invoicing threshold applies. Not a flicker — permanent, and
        indistinguishable from a firm that had declared nothing.

        Same rule the navigation learned the hard way: **the resting state must
        never depend on an animation completing.** The truth is the markup; the
        count-up is decoration on top of it, and it only takes over once there
        is something to animate.
      */}
      {format(direction === "down" ? startValue : value)}
    </span>
  )
}
