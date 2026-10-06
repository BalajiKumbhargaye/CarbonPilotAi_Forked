import { redirect } from 'next/navigation';

export default function BuyerRouteAlias({ params }: { params: { slug: string[] } }) {
  redirect(`/customer/${params.slug.map(encodeURIComponent).join('/')}`);
}
