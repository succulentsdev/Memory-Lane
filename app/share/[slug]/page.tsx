import GiftView from "./GiftView";

// The sample scrapbook is pre-rendered so Gift Mode works from a static export too.
// Other slugs render on demand (and resolve from storage in the browser).
export function generateStaticParams() {
  return [{ slug: "portland-sample" }];
}

export default async function SharePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <GiftView slug={slug} />;
}
