import * as React from "react"
import { cn } from "cn"

import { buttonVariants } from "@/components/ui/button"
import { ChevronLeftIcon, ChevronRightIcon, MoreHorizontalIcon } from "lucide-react"

// Edited from the generated file:
// - Links stay links. The generated PaginationLink rendered <a> through Button, which gives it
//   role="button" and Space-to-activate; pagination is navigation, and aria-current="page"
//   belongs on a link (SPEC §10.4). `render` takes the app's router <Link>.
// - Previous and Next keep their words at every width (§11 keeps them on phones), and their
//   visible word is their name rather than a longer aria-label.
// - The <nav> takes its label from the caller, and drops the role it already has.

function Pagination({ className, ...props }: React.ComponentProps<"nav">) {
  return (
    <nav
      data-slot="pagination"
      className={cn("flex", className)}
      {...props}
    />
  )
}

function PaginationContent({
  className,
  ...props
}: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="pagination-content"
      className={cn("flex items-center gap-0.5", className)}
      {...props}
    />
  )
}

function PaginationItem({ ...props }: React.ComponentProps<"li">) {
  return <li data-slot="pagination-item" {...props} />
}

type PaginationLinkProps = {
  isActive?: boolean
  /** The link element to render — the router's <Link> — which receives the rest of the props. */
  render?: React.ReactElement<Record<string, unknown>>
  size?: "default" | "icon"
} & React.ComponentProps<"a">

function PaginationLink({
  className,
  isActive,
  size = "icon",
  render = <a />,
  ...props
}: PaginationLinkProps) {
  return React.cloneElement(render, {
    "aria-current": isActive ? "page" : undefined,
    "data-slot": "pagination-link",
    "data-active": isActive,
    className: cn(
      buttonVariants({ variant: isActive ? "outline" : "ghost", size }),
      "aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:bg-transparent",
      className
    ),
    ...props,
  })
}

function PaginationPrevious({
  className,
  text = "Previous",
  ...props
}: React.ComponentProps<typeof PaginationLink> & { text?: string }) {
  return (
    <PaginationLink
      size="default"
      className={cn("pl-1.5!", className)}
      {...props}
    >
      <ChevronLeftIcon aria-hidden="true" data-icon="inline-start" />
      <span>{text}</span>
    </PaginationLink>
  )
}

function PaginationNext({
  className,
  text = "Next",
  ...props
}: React.ComponentProps<typeof PaginationLink> & { text?: string }) {
  return (
    <PaginationLink
      size="default"
      className={cn("pr-1.5!", className)}
      {...props}
    >
      <span>{text}</span>
      <ChevronRightIcon aria-hidden="true" data-icon="inline-end" />
    </PaginationLink>
  )
}

function PaginationEllipsis({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      aria-hidden
      data-slot="pagination-ellipsis"
      className={cn(
        "flex size-8 items-center justify-center [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      <MoreHorizontalIcon
      />
    </span>
  )
}

export {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
}
