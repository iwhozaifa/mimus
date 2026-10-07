import { Card } from '@/components/ui/card';
import type { FileRef } from '@/src/mock';

export function FilesCard({ files }: { files: FileRef[] }) {
  return (
    <Card>
      <h2 className="mb-3 text-lg font-semibold text-ink">Files</h2>
      <ul className="flex flex-col gap-2">
        {files.map((file) => (
          <li key={file.name} className="text-sm text-ink-muted">
            {file.name}
          </li>
        ))}
      </ul>
    </Card>
  );
}
