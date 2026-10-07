import { Card } from '@/components/ui/card';
import type { Person } from '@/src/mock';

export function PeopleCard({ people }: { people: Person[] }) {
  return (
    <Card>
      <h2 className="mb-3 text-lg font-semibold text-ink">People</h2>
      <ul className="flex flex-col gap-3">
        {people.map((person) => (
          <li key={person.name} className="flex items-center justify-between gap-4">
            <span className="font-medium text-ink">{person.name}</span>
            <span className="text-sm text-ink-muted">{person.role}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
