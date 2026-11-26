import { lazy, Suspense, type ComponentType, type ReactNode } from "react";

type Loader<P> = () => Promise<{ default: ComponentType<P> } | ComponentType<P>>;

export default function dynamic<P extends object>(loader: Loader<P>, opts?: { loading?: () => ReactNode; ssr?: boolean }) {
  const Lazy = lazy(async () => {
    const mod = await loader();
    return "default" in (mod as object) ? (mod as { default: ComponentType<P> }) : { default: mod as ComponentType<P> };
  });
  return function Dynamic(props: P) {
    return (
      <Suspense fallback={opts?.loading ? opts.loading() : null}>
        <Lazy {...props} />
      </Suspense>
    );
  };
}
