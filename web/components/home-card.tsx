import Link from "next/link";
import { Money } from "@/components/money";
import { PropertyCover } from "@/components/property-cover";

/** A home as a listing: picture first, then its name, people and what it has earned. */
export function HomeCard({ id, name, ownerName, cleanerName, collected, stays }: { id: string; name: string; ownerName: string | null; cleanerName: string | null; collected: bigint; stays: number }) {
  return (
    <Link href="/people" className="group block rounded-2xl outline-offset-4" data-testid={`home-card-${id}`}>
      <PropertyCover name={name} className="aspect-[3/2] rounded-2xl transition-shadow duration-150 group-hover:shadow-lift" />
      <div className="mt-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-heading text-[17px] font-bold tracking-tight">{name}</p>
          <p className="truncate text-sm text-muted-foreground">
            {ownerName ?? "No owner yet"}
            {cleanerName && ` · ${cleanerName}`}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[15px] font-bold">
            <Money raw={collected} />
          </p>
          <p className="text-sm text-muted-foreground">
            {stays} {stays === 1 ? "stay" : "stays"}
          </p>
        </div>
      </div>
    </Link>
  );
}
