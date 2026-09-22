"use client";

interface SidebarLinkGroupProps {
  children: (handleClick: () => void, openGroup: boolean) => React.ReactNode
  open?: boolean
  onToggle?: () => void
  className?: string
}

export default function SidebarLinkGroup({
  children,
  open = false,
  onToggle,
  className = "",
}: SidebarLinkGroupProps) {
  const handleClick = () => {
    if (onToggle) {
      onToggle();
    }
  }

  return (
    <li
      className={`
        relative px-2 py-1.5 rounded-xl mb-0.5 last:mb-0
        group is-link-group
        transition-all duration-200 ease-out motion-reduce:transition-none
        ${open ? "sidebar-link-group-open bg-white/[0.05] ring-1 ring-white/[0.06]" : "hover:bg-white/[0.03]"}
        ${className}
      `}
    >
      {children(handleClick, open)}
    </li>
  )
}
