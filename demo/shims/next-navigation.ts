import { navigate, usePath } from "../router";

const router = {
  push: (href: string) => navigate(href),
  replace: (href: string) => navigate(href),
  back: () => history.back(),
  forward: () => history.forward(),
  refresh: () => {},
  prefetch: () => {},
};

export function useRouter() {
  return router;
}
export function usePathname() {
  return usePath();
}
export function useSearchParams() {
  return new URLSearchParams();
}
export function useParams() {
  return {};
}
export function redirect(href: string): never {
  navigate(href);
  throw new Error("redirect");
}
export function notFound(): never {
  throw new Error("notFound");
}
