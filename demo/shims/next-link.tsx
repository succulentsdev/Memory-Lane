import type { AnchorHTMLAttributes, ReactNode } from "react";
import { navigate, pathToHash } from "../router";

type Props = AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children?: ReactNode; prefetch?: boolean; replace?: boolean; scroll?: boolean };

export default function Link({ href, children, onClick, prefetch, replace, scroll, ...rest }: Props) {
  void prefetch; void replace; void scroll;
  const internal = href.startsWith("/");
  return (
    <a
      {...rest}
      href={internal ? pathToHash(href) || "#" : href}
      onClick={(e) => {
        onClick?.(e);
        if (internal && !e.defaultPrevented) {
          e.preventDefault();
          navigate(href);
        }
      }}
    >
      {children}
    </a>
  );
}
